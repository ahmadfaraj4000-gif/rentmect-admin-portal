import { RENTAL_PAGE_SIZE, ARCHIVE_PAGE_SIZE, RENTAL_CACHE_MS } from './rentalWorkspace.js';

// Reuse only a fresh prefix from the same view and invalidation generation.
// Refreshes rebuild summaries; loading more never rereads a fresh prefix.
export function createRentalSummaryReader(rpc, now = Date.now) {
  let prefix;
  return async (params, { force = false, generation = 0 } = {}) => {
    const key = JSON.stringify([params.filter, params.search, params.focusId]);
    const size = ['archive', 'deposit_review'].includes(params.filter) ? ARCHIVE_PAGE_SIZE : RENTAL_PAGE_SIZE;
    const limit = params.offset + size;
    const reusable = !force && prefix?.key === key && prefix.generation === generation
      && now() - prefix.at < RENTAL_CACHE_MS && prefix.data.rows.length < limit;
    let result = reusable ? prefix.data : null;
    const rows = reusable ? [...result.rows] : [];
    do {
      if (result && rows.length >= result.total) break;
      const pageSize = params.filter === 'deposit_review' && rows.length ? 10 : size;
      result = await rpc({ p_filter: params.filter, p_search: params.search,
        p_offset: rows.length, p_limit: Math.min(pageSize, limit - rows.length), p_rental_id: params.focusId || null });
      if (!result || !Array.isArray(result.rows)) throw new Error('Rental list response was incomplete. Please retry.');
      rows.push(...result.rows);
      if (!result.rows.length) break;
    } while (rows.length < result.total && rows.length < limit);
    const data = { ...result, rows, offset: params.offset };
    prefix = { key, generation, at: now(), data };
    return data;
  };
}
