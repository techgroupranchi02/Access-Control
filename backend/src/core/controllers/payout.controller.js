/**
 * Payout Controller
 * Full-fidelity payout ledger, KPIs, CSV export, and PDF Tax Invoices
 * using real database queries matching festease_backend.
 */

const { query } = require('../../config/database');
let generateTaxInvoicePdf = null;
let formatDate = null;
let getSettlementPeriod = null;

try {
  const taxModule = require('/var/www/festease_backend/utils/taxInvoiceGenerator');
  generateTaxInvoicePdf = taxModule.generateTaxInvoicePdf;
  formatDate = taxModule.formatDate;
  getSettlementPeriod = taxModule.getSettlementPeriod;
} catch (err) {
  console.warn('[PayoutController] Could not load festease taxInvoiceGenerator:', err.message);
}

// In-memory cache for generated PDF invoices (fast downloads)
const pdfReceiptCache = new Map();

/**
 * Resolve festival_id (film_festival_id) from event_id or headers
 */
async function resolveFestivalId(req) {
  const eventId = parseInt(
    req.headers['x-event-id'] ||
    req.headers['x-festival-id'] ||
    req.headers['x-edition-id'] ||
    req.query.eventId ||
    req.query.festival_id ||
    40,
    10
  );

  try {
    const festRows = await query(
      'SELECT film_festival_id FROM film_festivals WHERE event_id = ? LIMIT 1',
      [eventId]
    );
    if (festRows.length > 0 && festRows[0].film_festival_id) {
      return { festivalId: festRows[0].film_festival_id, eventId };
    }
  } catch (err) {
    console.error('[PayoutController] Failed to resolve festivalId:', err.message);
  }
  return { festivalId: eventId, eventId };
}

/**
 * GET /api/payouts
 * Retrieve KPIs, bank details, and paginated payout ledger.
 */
async function list(req, res) {
  try {
    const { festivalId, eventId } = await resolveFestivalId(req);

    const page = parseInt(req.query.page, 10) || 1;
    const perPage = parseInt(req.query.per_page, 10) || 10;
    const offset = (page - 1) * perPage;
    const status = req.query.status || 'all';
    const search = req.query.search ? req.query.search.trim() : '';
    const sort = req.query.sort || 'recent';

    // 1. Fetch Aggregated KPIs
    const kpiRows = await query(`
      SELECT 
        COUNT(*) as total_submissions,
        COALESCE(SUM(CASE WHEN settlement_status != 'refunded' THEN base_fee_amount ELSE 0 END), 0) as gross_revenue,
        COALESCE(SUM(CASE WHEN settlement_status != 'refunded' THEN platform_fee_amount ELSE 0 END), 0) as total_platform_fees,
        COALESCE(SUM(CASE WHEN settlement_status != 'refunded' THEN (commission_amount + route_fee_amount + route_gst_amount) ELSE 0 END), 0) as total_deductions,
        COALESCE(SUM(CASE WHEN settlement_status = 'settled' THEN net_settled_amount ELSE 0 END), 0) as net_settled_to_bank,
        COALESCE(SUM(CASE WHEN settlement_status = 'pending' THEN net_settled_amount ELSE 0 END), 0) as pending_amount,
        SUM(CASE WHEN settlement_status = 'settled' THEN 1 ELSE 0 END) as settled_count,
        SUM(CASE WHEN settlement_status = 'pending' THEN 1 ELSE 0 END) as pending_count,
        SUM(CASE WHEN settlement_status = 'refunded' THEN 1 ELSE 0 END) as refunded_count,
        COALESCE(SUM(CASE WHEN settlement_status = 'refunded' THEN refund_amount ELSE 0 END), 0) as total_refunded_amount,
        COALESCE(SUM(CASE WHEN settlement_status = 'refunded' THEN net_settled_amount ELSE 0 END), 0) as total_reversed_amount
      FROM festival_payments
      WHERE festival_id = ?
    `, [festivalId]);

    const kpis = kpiRows[0] || {
      total_submissions: 0,
      gross_revenue: 0,
      total_platform_fees: 0,
      total_deductions: 0,
      net_settled_to_bank: 0,
      pending_amount: 0,
      settled_count: 0,
      pending_count: 0,
      refunded_count: 0,
      total_refunded_amount: 0,
      total_reversed_amount: 0,
    };

    // 2. Fetch Bank Details
    const bankRows = await query(`
      SELECT id, festival_id, beneficiary_name, account_type,
             account_number_masked, ifsc_code, bank_name, branch_name,
             pan_number, legal_entity_name, verification_status
      FROM festival_bank_accounts
      WHERE festival_id = ?
      LIMIT 1
    `, [festivalId]);

    const bankAccount = bankRows[0] || null;

    // 3. Build Ledger Filter
    let whereClause = 'fp.festival_id = ?';
    const params = [festivalId];

    if (status && status !== 'all') {
      whereClause += ' AND fp.settlement_status = ?';
      params.push(status);
    }

    if (search) {
      whereClause += ' AND (ind.name LIKE ? OR org.name LIKE ? OR u.email LIKE ? OR p.title LIKE ? OR fp.razorpay_transfer_id LIKE ? OR fp.razorpay_payment_id LIKE ?)';
      const term = `%${search}%`;
      params.push(term, term, term, term, term, term);
    }

    // Total Count
    const countResult = await query(`
      SELECT COUNT(*) as total 
      FROM festival_payments fp
      LEFT JOIN users u ON fp.user_id = u.id
      LEFT JOIN individuals ind ON ind.user_id = u.id
      LEFT JOIN organizations org ON org.user_id = u.id
      LEFT JOIN projects p ON fp.project_id = p.project_id
      WHERE ${whereClause}
    `, params);
    const total = countResult[0]?.total || 0;

    // Sorting
    let orderBy = 'ORDER BY fp.created_at DESC';
    if (sort === 'amount_high') orderBy = 'ORDER BY fp.net_settled_amount DESC';
    else if (sort === 'amount_low') orderBy = 'ORDER BY fp.net_settled_amount ASC';

    // Paginated Ledger Data
    const dataRows = await query(`
      SELECT 
        fp.*,
        COALESCE(p.title, 'Untitled Film') as film_title,
        COALESCE(cat.name, 'General Entry') as category_name,
        COALESCE(ind.name, org.name, 'Filmmaker') as filmmaker_name,
        u.email as filmmaker_email,
        (fp.commission_amount + fp.route_fee_amount + fp.route_gst_amount) as total_deductions
      FROM festival_payments fp
      LEFT JOIN users u ON fp.user_id = u.id
      LEFT JOIN individuals ind ON ind.user_id = u.id
      LEFT JOIN organizations org ON org.user_id = u.id
      LEFT JOIN projects p ON fp.project_id = p.project_id
      LEFT JOIN film_festivals_submissions sub ON fp.submission_id = sub.film_festivals_submission_id
      LEFT JOIN film_festivals_category_milestone_prices price ON sub.film_festival_category_milestone_price_id = price.film_festival_category_milestone_price_id
      LEFT JOIN film_festivals_categories cat ON price.film_festival_category_id = cat.film_festival_category_id
      WHERE ${whereClause}
      ${orderBy}
      LIMIT ? OFFSET ?
    `, [...params, perPage, offset]);

    return res.json({
      success: true,
      status: true,
      message: 'Payout data retrieved.',
      data: {
        kpis,
        bank_account: bankAccount,
        ledger: {
          data: dataRows || [],
          total,
          page,
          per_page: perPage,
          last_page: Math.ceil(total / perPage) || 1,
        },
      },
    });
  } catch (error) {
    console.error('[PayoutController] list error:', error);
    return res.status(500).json({ success: false, message: 'Failed to retrieve payout data.' });
  }
}

/**
 * GET /api/payouts/export-csv
 */
async function exportCsv(req, res) {
  try {
    const { festivalId } = await resolveFestivalId(req);

    const dataRows = await query(`
      SELECT 
        fp.*,
        COALESCE(p.title, 'Untitled Film') as film_title,
        COALESCE(cat.name, 'General Entry') as category_name,
        COALESCE(ind.name, org.name, 'Filmmaker') as filmmaker_name,
        u.email as filmmaker_email,
        (fp.commission_amount + fp.route_fee_amount + fp.route_gst_amount) as total_deductions
      FROM festival_payments fp
      LEFT JOIN users u ON fp.user_id = u.id
      LEFT JOIN individuals ind ON ind.user_id = u.id
      LEFT JOIN organizations org ON org.user_id = u.id
      LEFT JOIN projects p ON fp.project_id = p.project_id
      LEFT JOIN film_festivals_submissions sub ON fp.submission_id = sub.film_festivals_submission_id
      LEFT JOIN film_festivals_category_milestone_prices price ON sub.film_festival_category_milestone_price_id = price.film_festival_category_milestone_price_id
      LEFT JOIN film_festivals_categories cat ON price.film_festival_category_id = cat.film_festival_category_id
      WHERE fp.festival_id = ?
      ORDER BY fp.created_at DESC
      LIMIT 10000
    `, [festivalId]);

    const csvHeader = [
      'Submission ID', 'Filmmaker', 'Email', 'Film Title', 'Category', 'Currency',
      'Base Fee', 'Platform Fee', 'GST', 'Gateway Fee', 'Gateway GST',
      'Gross Amount', 'Freecomers Fee', 'Route Fee', 'Route GST',
      'Net Settled', 'Transfer ID', 'Status', 'Refund ID', 'Refund Amount', 'Reverse Transfer ID', 'Refund Reason', 'Refunded At', 'Date'
    ].join(',');

    const csvRows = (dataRows || []).map(p => [
      p.submission_id,
      `"${(p.filmmaker_name || 'N/A').replace(/"/g, '""')}"`,
      `"${(p.filmmaker_email || 'N/A').replace(/"/g, '""')}"`,
      `"${(p.film_title || 'N/A').replace(/"/g, '""')}"`,
      `"${(p.category_name || 'N/A').replace(/"/g, '""')}"`,
      p.currency || 'INR',
      p.base_fee_amount || 0,
      p.platform_fee_amount || 0,
      p.freecomers_gst_amount || 0,
      p.gateway_fee_amount || 0,
      p.gateway_gst_amount || 0,
      p.gross_amount || 0,
      p.commission_amount || 0,
      p.route_fee_amount || 0,
      p.route_gst_amount || 0,
      p.settlement_status === 'refunded' ? 0 : p.net_settled_amount,
      p.razorpay_transfer_id || '',
      p.settlement_status || '',
      p.refund_id || '',
      p.refund_amount || '',
      p.reverse_transfer_id || '',
      `"${(p.refund_reason || '').replace(/"/g, '""')}"`,
      p.refunded_at || '',
      p.created_at || '',
    ].join(','));

    const csvContent = [csvHeader, ...csvRows].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="Submissions_Payouts_${festivalId}_${new Date().toISOString().slice(0, 10)}.csv"`);
    return res.send(csvContent);
  } catch (error) {
    console.error('[PayoutController] exportCsv error:', error);
    return res.status(500).json({ success: false, message: 'Failed to export CSV.' });
  }
}

/**
 * GET /api/payouts/:paymentId/receipt
 * Generate & download official Tax Invoice PDF
 */
async function getReceipt(req, res) {
  try {
    const { festivalId } = await resolveFestivalId(req);
    const paymentId = parseInt(req.params.paymentId, 10);
    if (!paymentId) {
      return res.status(400).json({ success: false, message: 'Payment ID is required.' });
    }

    const rows = await query(`
      SELECT id, festival_id, submission_id, transaction_record_id, user_id, project_id,
             currency, base_fee_amount, gross_amount, commission_rate, commission_amount,
             route_fee_amount, route_gst_amount, net_settled_amount,
             settlement_status, settled_at, created_at
      FROM festival_payments 
      WHERE festival_id = ? AND (id = ? OR transaction_record_id = ?)
      LIMIT 1
    `, [festivalId, paymentId, paymentId]);

    const payment = rows?.[0];
    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment record not found.' });
    }

    const cacheKey = `${festivalId}_${payment.id}_${payment.settlement_status || ''}`;
    if (pdfReceiptCache.has(cacheKey)) {
      const cached = pdfReceiptCache.get(cacheKey);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${cached.filename}"`);
      res.setHeader('Content-Length', cached.buffer.length);
      return res.end(cached.buffer);
    }

    const festRows = await query(`
      SELECT ff.film_festival_id, ff.film_festival_venue,
             e.name as festival_name,
             fba.beneficiary_name, fba.legal_entity_name, fba.email as bank_email, fba.pan_number,
             u.email as user_email,
             ind.name as individual_name,
             org.name as org_name, org.address as org_address
      FROM film_festivals ff
      LEFT JOIN events e ON e.event_id = ff.event_id
      LEFT JOIN festival_bank_accounts fba ON fba.festival_id = ff.film_festival_id
      LEFT JOIN users u ON u.id = ff.user_id
      LEFT JOIN individuals ind ON ind.user_id = ff.user_id
      LEFT JOIN organizations org ON org.id = ff.organization_id
      WHERE ff.film_festival_id = ?
      LIMIT 1
    `, [festivalId]);

    const fest = festRows?.[0] || {};

    let venueAddress = fest.film_festival_venue;
    if (Array.isArray(venueAddress)) {
      venueAddress = venueAddress.filter(Boolean).join(', ');
    } else if (typeof venueAddress === 'string') {
      try {
        const parsed = JSON.parse(venueAddress);
        if (Array.isArray(parsed)) venueAddress = parsed.filter(Boolean).join(', ');
      } catch (_) {}
    }

    const festivalName = fest.festival_name || fest.org_name || 'Film Festival';
    const festivalCode = `FC-FEST-${String(festivalId).padStart(4, '0')}`;
    const contactPerson = fest.beneficiary_name || fest.legal_entity_name || fest.individual_name || fest.org_name || 'Festival Director';
    const email = fest.bank_email || fest.user_email || '—';
    const address = venueAddress || fest.org_address || '—';
    const gstin = fest.pan_number || '—';

    const invoiceId = payment.id || paymentId;
    const invoiceNumber = `FC-FEST-${String(invoiceId).padStart(6, '0')}`;
    const invoiceDate = formatDate ? formatDate(payment.created_at || new Date()) : new Date().toLocaleDateString('en-GB');
    const settlementPeriod = getSettlementPeriod ? getSettlementPeriod(payment.settled_at || payment.created_at || new Date()) : 'Current Period';
    const paymentStatus = (payment.settlement_status || 'PENDING').toUpperCase();

    const grossAmount = parseFloat(payment.base_fee_amount || payment.gross_amount || 0);
    const commissionRate = parseFloat(payment.commission_rate || 6.0);
    const commissionAmount = parseFloat((grossAmount * (commissionRate / 100)).toFixed(2));
    const totalInvoiceAmount = commissionAmount;

    const routeBase = grossAmount - commissionAmount;
    const routeFeeRate = 0.25;
    const routeGstRate = 18.0;
    const routeFeeAmount = parseFloat(
      (payment.route_fee_amount !== null && payment.route_fee_amount !== undefined && payment.route_gst_amount !== null && payment.route_gst_amount !== undefined)
        ? (Number(payment.route_fee_amount) + Number(payment.route_gst_amount)).toFixed(2)
        : (routeBase * (routeFeeRate / 100) * (1 + (routeGstRate / 100))).toFixed(2)
    );
    const netPayable = parseFloat(
      (payment.net_settled_amount !== null && payment.net_settled_amount !== undefined)
        ? Number(payment.net_settled_amount).toFixed(2)
        : (grossAmount - commissionAmount - routeFeeAmount).toFixed(2)
    );

    if (!generateTaxInvoicePdf) {
      return res.status(500).json({ success: false, message: 'PDF generator is not available.' });
    }

    const pdfBuffer = await generateTaxInvoicePdf({
      invoiceNumber,
      invoiceDate,
      paymentStatus,
      settlementPeriod,
      festivalName,
      festivalId: festivalCode,
      contactPerson,
      email,
      address,
      gstin,
      grossAmount,
      commissionRate,
      commissionAmount,
      totalInvoiceAmount,
      routeFeeRate,
      routeGstRate,
      routeFeeAmount,
      netPayable,
    });

    const finalBuffer = Buffer.from(pdfBuffer);
    const filename = `Tax_Invoice_${invoiceNumber}.pdf`;

    pdfReceiptCache.set(cacheKey, { filename, buffer: finalBuffer });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', finalBuffer.length);
    return res.end(finalBuffer);
  } catch (error) {
    console.error('[PayoutController] getReceipt error:', error);
    return res.status(500).json({ success: false, message: 'Failed to generate tax invoice PDF.' });
  }
}

module.exports = {
  list,
  exportCsv,
  getReceipt,
};
