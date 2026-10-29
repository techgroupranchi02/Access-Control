/**
 * Kashish Votes API Service
 * Fetches voting data from the Kashish external API (kashish-admin.vercel.app)
 * Reference: KASHISH_Votes_API_Integration_Guide.docx
 */

const env = require('../../config/environment');

const DEFAULT_API_URL = env.kashishApiUrl || 'https://kashish-admin.vercel.app/api/v1/votes';

/**
 * Fetch a single page of votes from the Kashish API
 * 
 * @param {string} apiKey - API key (header: x-api-key)
 * @param {Object} options - Query parameters
 * @param {string} [options.source='all'] - 'all' | 'scan' | 'normal'
 * @param {number} [options.page=1] - Page number (1-based)
 * @param {number} [options.limit=100] - Items per page (max 200)
 * @param {string} [options.sort='desc'] - 'desc' | 'asc'
 * @returns {Promise<Object>} API response with data, pagination, and summary
 */
async function fetchKashishVotes(apiKey, options = {}) {
  const key = apiKey || env.kashishApiKey;
  if (!key) {
    throw new Error('Kashish API Key is missing. Configure KASHISH_API_KEY.');
  }

  const {
    source = 'all',
    page = 1,
    limit = 100,
    sort = 'desc'
  } = options;

  const url = new URL(DEFAULT_API_URL);
  url.searchParams.set('source', source);
  url.searchParams.set('page', String(page));
  url.searchParams.set('limit', String(Math.min(limit, 200)));
  url.searchParams.set('sort', sort);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'x-api-key': key,
        'Accept': 'application/json'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      let errorBody = {};
      try {
        errorBody = await response.json();
      } catch (e) {
        // ignore JSON parse failure on error response
      }
      throw new Error(`Kashish API error [${response.status}]: ${errorBody.error || errorBody.message || response.statusText}`);
    }

    const payload = await response.json();
    return payload;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('Kashish API request timed out after 15 seconds.');
    }
    throw err;
  }
}

/**
 * Fetch all pages of votes from the Kashish API
 * 
 * @param {string} apiKey - API key
 * @param {string} [source='all'] - 'all' | 'scan' | 'normal'
 * @returns {Promise<{ votes: Array, summary: Object, totalPages: number }>}
 */
async function fetchAllKashishVotes(apiKey, source = 'all') {
  let page = 1;
  let hasMore = true;
  const allVotes = [];
  let finalSummary = null;

  while (hasMore) {
    const payload = await fetchKashishVotes(apiKey, { source, page, limit: 200 });

    if (payload.data && Array.isArray(payload.data)) {
      allVotes.push(...payload.data);
    }

    if (payload.summary) {
      finalSummary = payload.summary;
    }

    const pagination = payload.pagination || {};
    hasMore = pagination.hasMore === true && page < (pagination.totalPages || 100);
    page++;
  }

  return {
    votes: allVotes,
    summary: finalSummary || { total: allVotes.length },
    totalPages: page - 1
  };
}

module.exports = {
  fetchKashishVotes,
  fetchAllKashishVotes
};
