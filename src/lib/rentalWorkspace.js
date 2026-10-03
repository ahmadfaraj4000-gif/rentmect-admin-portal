import { freshDomainLoad } from './freshDomainLoad.js';

export const RENTAL_PAGE_SIZE = 25;
export const RENTAL_CACHE_MS = 30_000;
export const rentalPageKey = ({ filter, search = '', focusId = '', offset = 0 }) =>
  JSON.stringify([filter, search.trim(), focusId, offset]);

// Session-local cache. Responses for an old filter or closed record never replace
// the visible state. Forced reads drain once more if a mutation arrived mid-read.
export function createRentalWorkspace({ readList, readDetail, hydrate, changed, now = Date.now, inline = false }) {
  const pages = new Map();
  const details = new Map();
  const loads = new Map();
  let current = null;
  let selectedId = '';
  let disposed = false;
  let generation = 0;
  let state = { rows: [], counts: {}, total: 0, offset: 0, loading: true, error: '', selectedId: '', detailLoading: false, detailError: '', detailReady: false };
  const emit = (patch) => { if (!disposed) { state = { ...state, ...patch }; changed(state); } };
  async function record(id, force = false) {
    const cached = details.get(id);
    if (!force && cached && now() - cached.at < RENTAL_CACHE_MS && cached.generation === generation) return cached.data;
    await freshDomainLoad(loads, `detail:${id}`, force, async () => {
      const readGeneration = generation;
      const data = await readDetail(id);
      if (!disposed) {
        details.set(id, { data, at: now(), generation: readGeneration });
        if (details.size > 150) details.delete(details.keys().next().value);
      }
    });
    return details.get(id)?.data;
  }
  async function inlineRecords(data, isCurrent) {
    const records = new Array(data.rows.length);
    let next = 0;
    // Bound concurrent detail reads to the records in the visible filter.
    await Promise.all(Array.from({ length: Math.min(5, data.rows.length) }, async () => {
      while (next < data.rows.length && isCurrent()) {
        const index = next++;
        records[index] = await record(data.rows[index].id);
      }
    }));
    return records;
  }
  async function list(params = current, force = false) {
    if (!params || disposed) return;
    const key = rentalPageKey(params);
    const switching = !current || rentalPageKey(current) !== key;
    const sameView = current && rentalPageKey({ ...current, offset: 0 }) === rentalPageKey({ ...params, offset: 0 });
    current = { ...params };
    const cached = pages.get(key);
    if (switching) emit({ ...(!inline || !sameView ? { rows: [], total: cached?.data.total || 0 } : {}), offset: params.offset || 0, error: '' });
    if (!inline && !force && cached && now() - cached.at < RENTAL_CACHE_MS && cached.generation === generation) {
      emit({ ...cached.data, loading: false, error: '' });
      return;
    }
    emit({ loading: true, error: '' });
    return freshDomainLoad(loads, `list:${key}`, force, async () => {
      const readGeneration = generation;
      try {
        const data = !force && cached && now() - cached.at < RENTAL_CACHE_MS && cached.generation === generation
          ? cached.data : await readList(params);
        if (disposed || rentalPageKey(current) !== key || readGeneration !== generation) return;
        const records = inline ? await inlineRecords(data, () => !disposed && readGeneration === generation && rentalPageKey(current) === key) : [];
        if (disposed || readGeneration !== generation || rentalPageKey(current) !== key) return;
        records.forEach(hydrate);
        pages.set(key, { data, at: now(), generation: readGeneration });
        // Bound memory when searching many different strings.
        if (pages.size > 30) pages.delete(pages.keys().next().value);
        if (rentalPageKey(current) === key) emit({ ...data, loading: false, error: '' });
      } catch (error) {
        if (rentalPageKey(current) === key) emit({ loading: false, error: error.message || 'Rentals could not load.' });
      }
    });
  }
  async function open(id, force = false) {
    if (disposed) return;
    const switched = selectedId !== id;
    selectedId = id;
    if (!id) { emit({ selectedId: '', detailLoading: false, detailReady: false, detailError: '' }); return; }
    const cached = details.get(id);
    if (inline && !switched && !force && cached && now() - cached.at < RENTAL_CACHE_MS && cached.generation === generation) return;
    emit({ selectedId: id, detailLoading: true, detailError: '', ...(switched ? { detailReady: false } : {}) });
    if (!force && cached && now() - cached.at < RENTAL_CACHE_MS && cached.generation === generation) {
      hydrate(cached.data);
      emit({ detailLoading: false, detailReady: true });
      return;
    }
    try {
      const data = await record(id, force);
      if (!disposed && selectedId === id && details.get(id)?.generation === generation) {
        hydrate(data);
        emit({ detailLoading: false, detailReady: true, detailError: '' });
      }
    } catch (error) {
      if (selectedId === id) emit({ detailLoading: false, detailError: error.message || 'Rental details could not load.' });
    }
  }

  return {
    list, open,
    getState: () => state,
    invalidate() { generation++; },
    async refresh({ rentalId = null, details: includeDetails = true } = {}) {
      generation++;
      // Counts/filter membership refresh independently of a committed save.
      void list(current, true);
      if (includeDetails && selectedId && (!rentalId || rentalId === selectedId)) await open(selectedId, true);
    },
    dispose() { disposed = true; pages.clear(); details.clear(); },
  };
}

export function replaceRentalRecords(current, incoming, rentalId, foreignKey = 'rental_id') {
  const ids = new Set(incoming.map((item) => item.id));
  return [...current.filter((item) => item[foreignKey] !== rentalId && !ids.has(item.id)), ...incoming];
}
