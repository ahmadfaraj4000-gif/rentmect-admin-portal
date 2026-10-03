import { useEffect, useRef, useState } from 'react';
import { createRentalWorkspace, RENTAL_PAGE_SIZE } from './lib/rentalWorkspace.js';
import { withReadRetry } from './requestDeadline.js';

export function useRentalWorkspace({ client, enabled, userId, filter, search, focusId, hydrate, prepareDetails }) {
  const callbacks = useRef({ hydrate, prepareDetails });
  callbacks.current = { hydrate, prepareDetails };
  const [state, setState] = useState({ rows: [], counts: {}, total: 0, offset: 0, loading: true, error: '', selectedId: '', detailReady: false });
  const [offset, setOffset] = useState(0);
  const [query, setQuery] = useState(search);
  const controllerRef = useRef(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  useEffect(() => {
    const timer = setTimeout(() => { setQuery(search); setOffset(0); }, 200);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => { setOffset(0); }, [filter, focusId]);
  useEffect(() => {
    const controller = createRentalWorkspace({
      readList: async (params) => {
        const { data, error } = await withReadRetry(() => client.rpc('admin_rental_list', {
          p_filter: params.filter, p_search: params.search, p_offset: params.offset,
          p_limit: RENTAL_PAGE_SIZE, p_rental_id: params.focusId || null,
        }), 'Rental list');
        if (error) throw error;
        if (!data || !Array.isArray(data.rows)) throw new Error('Rental list response was incomplete. Please retry.');
        return data;
      },
      readDetail: async (id) => {
        const [{ data, error }] = await Promise.all([
          withReadRetry(() => client.rpc('admin_rental_detail', { p_rental_id: id }), 'Rental details'),
          callbacks.current.prepareDetails(),
        ]);
        if (error) throw error;
        if (!data?.rental?.id) throw new Error('Rental details were incomplete. Please retry.');
        return data;
      },
      hydrate: (data) => callbacks.current.hydrate(data),
      changed: setState,
    });
    controllerRef.current = controller;
    setState(controller.getState());
    return () => { controller.dispose(); controllerRef.current = null; };
  }, [client, userId]);
  useEffect(() => {
    if (!enabled) return;
    void controllerRef.current?.list({ filter, search: query, focusId, offset });
  }, [enabled, userId, filter, query, focusId, offset]);
  useEffect(() => {
    if (enabled && focusId) void controllerRef.current?.open(focusId);
  }, [enabled, focusId, userId]);
  return {
    ...state, setOffset,
    open: (id) => controllerRef.current?.open(id),
    invalidate: () => controllerRef.current?.invalidate(),
    refresh: (options) => enabledRef.current ? controllerRef.current?.refresh(options) : Promise.resolve(),
    retry: () => controllerRef.current?.list(undefined, true),
    retryDetail: () => controllerRef.current?.open(state.selectedId, true),
  };
}
