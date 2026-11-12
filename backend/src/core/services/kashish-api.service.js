/**
 * Kashish Votes API Service
 * Fetches voting data from the Kashish external API (kashish-admin.vercel.app/api/v1/votes).
 * Reference: Kashish "Votes & Activity Log API" integration guide (Nov 2026), docs/adr/0004.
 *
 * Supported query parameters we use:
 *   eventId       only votes for this Kashish festival event (e.g. "EF3j920261")
 *   updatedSince  only votes new since this ISO time (pass back the previous response's sync.syncedAt)
 *   source        'scan' (QR, on-ground) — the only source Kashish sends us; 'normal' / 'all' also exist
 *   page / limit  1-based pages of up to 200
 * Kashish rate limit: 50 requests (default). A 429 is retried once after a short wait.
 */

const env = require('../../config/environment');

const DEFAULT_API_URL = env.kashishApiUrl || 'https://kashish-admin.vercel.app/api/v1/votes';
const RETRY_AFTER_MS = 5000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetch a single page of votes from the Kashish API.
 *
 * @param {string} apiKey - API key (header: x-api-key); defaults to KASHISH_API_KEY
 * @param {Object} options
 * @param {string} [options.source='scan']   'scan' | 'normal' | 'all'
 * @param {string} [options.eventId]         Kashish event ID filter
 * @param {string} [options.updatedSince]    ISO time: only votes new since then
 * @param {number} [options.page=1]
 * @param {number} [options.limit=200]       max 200
 * @param {string} [options.sort='asc']      'asc' | 'desc'
 * @returns {Promise<Object>} API response: { data, pagination, summary, sync, eventId }
 */
async function fetchKashishVotes(apiKey, options = {}) {
  const key = apiKey || env.kashishApiKey;
  if (!key) {
    throw new Error('Kashish API Key is missing. Configure KASHISH_API_KEY in the backend .env.');
  }

  const { source = 'scan', eventId, updatedSince, page = 1, limit = 200, sort = 'asc' } = options;

  const url = new URL(DEFAULT_API_URL);
  url.searchParams.set('source', source);
  url.searchParams.set('page', String(page));
  url.searchParams.set('limit', String(Math.min(limit, 200)));
  url.searchParams.set('sort', sort);
  if (eventId) url.searchParams.set('eventId', eventId);
  if (updatedSince) url.searchParams.set('updatedSince', updatedSince);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: { 'x-api-key': key, Accept: 'application/json' },
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (response.status === 429) {
        if (attempt === 0) {
          await sleep(RETRY_AFTER_MS);
          continue;
        }
        const err = new Error('Kashish API rate limit reached (429). The next sync will try again.');
        err.code = 'KASHISH_RATE_LIMITED';
        throw err;
      }
      if (!response.ok) {
        let errorBody = {};
        try { errorBody = await response.json(); } catch (e) { /* not JSON */ }
        throw new Error(`Kashish API error [${response.status}]: ${errorBody.error || errorBody.message || response.statusText}`);
      }
      return await response.json();
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') throw new Error('Kashish API request timed out after 15 seconds.');
      throw err;
    }
  }
  return null; // not reached
}

/**
 * Fetch all pages of votes.
 *
 * @param {string} apiKey
 * @param {Object|string} [options]  { source, eventId, updatedSince } (a plain string is taken as source)
 * @returns {Promise<{ votes: Array, summary: Object, totalPages: number, syncedAt: string|null, eventId: string|null }>}
 */
async function fetchAllKashishVotes(apiKey, options = {}) {
  const opts = typeof options === 'string' ? { source: options } : (options || {});
  let page = 1;
  let hasMore = true;
  const allVotes = [];
  let finalSummary = null;
  let syncedAt = null;
  let apiEventId = null;

  while (hasMore) {
    const payload = await fetchKashishVotes(apiKey, { ...opts, page, limit: 200 });
    if (Array.isArray(payload?.data)) allVotes.push(...payload.data);
    if (payload?.summary) finalSummary = payload.summary;
    // The first page's syncedAt is the safe point to resume from (nothing older is missed)
    if (!syncedAt && payload?.sync?.syncedAt) syncedAt = payload.sync.syncedAt;
    if (payload?.eventId) apiEventId = payload.eventId;

    const pagination = payload?.pagination || {};
    hasMore = pagination.hasMore === true && page < (pagination.totalPages || 100);
    page += 1;
  }

  return {
    votes: allVotes,
    summary: finalSummary || { total: allVotes.length },
    totalPages: page - 1,
    syncedAt,
    eventId: apiEventId
  };
}

module.exports = {
  fetchKashishVotes,
  fetchAllKashishVotes
};
