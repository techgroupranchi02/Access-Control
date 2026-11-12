/**
 * Badge print history (docs/adr/0005-pass-templates.md, Amendment 3).
 *
 * The print dialog records each badge it sends to print (qr_print_log, migration 024) and asks,
 * before printing, which of its badges were printed already. Badges are identified by their QR
 * value (saas_qr.qr_data), which every print source has: Bulk QR stock rows and delegates alike.
 *
 * "Printed" means sent to the browser's print dialog: the browser can't tell us whether the
 * person then printed or cancelled.
 */
const crypto = require('crypto');
const { query } = require('../../config/database');

const MODES = ['full', 'qr-only'];
const MAX_ITEMS = 2000;
const CHUNK = 500;

const cleanValue = (v) => (typeof v === 'string' && v.length > 0 && v.length <= 255 ? v : null);

/** saas_qr rows for these QR values in this festival: Map qr_data → qr_id */
async function qrIdsFor(eventId, values) {
  const map = new Map();
  for (let i = 0; i < values.length; i += CHUNK) {
    const part = values.slice(i, i + CHUNK);
    const rows = await query(
      `SELECT qr_id, qr_data FROM saas_qr WHERE event_id = ? AND qr_data IN (${part.map(() => '?').join(',')})`,
      [eventId, ...part]
    );
    rows.forEach((r) => map.set(r.qr_data, r.qr_id));
  }
  return map;
}

/**
 * Print history for these badges.
 * @returns {Promise<Object>} { [qr_value]: { count, last_printed_at, last_printed_by, last_mode } }
 *          (badges never printed are left out)
 */
async function getPrintStatus(eventId, qrValues = []) {
  const values = [...new Set((Array.isArray(qrValues) ? qrValues : []).map(cleanValue).filter(Boolean))].slice(0, MAX_ITEMS);
  if (!values.length) return {};
  const ids = await qrIdsFor(eventId, values);
  if (!ids.size) return {};
  const byId = new Map([...ids].map(([value, id]) => [id, value]));
  const qrIds = [...byId.keys()];

  const status = {};
  for (let i = 0; i < qrIds.length; i += CHUNK) {
    const part = qrIds.slice(i, i + CHUNK);
    const rows = await query(
      `SELECT l.qr_id, agg.cnt, l.printed_at, l.print_mode,
              COALESCE(ind.name, org.name, u.email) AS printed_by_name
         FROM (
           SELECT qr_id, COUNT(*) AS cnt, MAX(id) AS last_id
             FROM qr_print_log
            WHERE event_id = ? AND qr_id IN (${part.map(() => '?').join(',')})
            GROUP BY qr_id
         ) agg
         JOIN qr_print_log l ON l.id = agg.last_id
         LEFT JOIN users u ON u.id = l.printed_by
         LEFT JOIN individuals ind ON ind.user_id = u.id
         LEFT JOIN organizations org ON org.user_id = u.id`,
      [eventId, ...part]
    );
    rows.forEach((r) => {
      status[byId.get(r.qr_id)] = {
        count: Number(r.cnt) || 0,
        last_printed_at: r.printed_at,
        last_printed_by: r.printed_by_name || null,
        last_mode: r.print_mode
      };
    });
  }
  return status;
}

/**
 * Record one Print press.
 * @param {Array<{qr_value: string, template_id?: string}>} items
 * @returns {Promise<{ recorded: number, print_job: string }>}
 */
async function recordPrints(eventId, items = [], { mode, userId } = {}) {
  if (!MODES.includes(mode)) {
    const err = new Error('Unknown print mode.');
    err.status = 400;
    throw err;
  }
  const list = (Array.isArray(items) ? items : []).slice(0, MAX_ITEMS)
    .map((it) => ({ value: cleanValue(it?.qr_value), template: typeof it?.template_id === 'string' || typeof it?.template_id === 'number' ? String(it.template_id).slice(0, 40) : null }))
    .filter((it) => it.value);
  const printJob = crypto.randomUUID();
  if (!list.length) return { recorded: 0, print_job: printJob };

  const ids = await qrIdsFor(eventId, [...new Set(list.map((it) => it.value))]);
  const rows = list.filter((it) => ids.has(it.value))
    .map((it) => [eventId, ids.get(it.value), printJob, mode, mode === 'qr-only' ? null : it.template, userId || null]);
  for (let i = 0; i < rows.length; i += CHUNK) {
    const part = rows.slice(i, i + CHUNK);
    await query(
      `INSERT INTO qr_print_log (event_id, qr_id, print_job, print_mode, template_id, printed_by) VALUES ${part.map(() => '(?, ?, ?, ?, ?, ?)').join(',')}`,
      part.flat()
    );
  }
  return { recorded: rows.length, print_job: printJob };
}

module.exports = { getPrintStatus, recordPrints, MAX_ITEMS };
