import { useEffect, useRef, useState } from 'react';
import { createRentalWorkspace } from './lib/rentalWorkspace.js';
import { createRentalSummaryReader } from './lib/rentalSummaryReader.js';
import { withReadRetry } from './requestDeadline.js';
import { subscribeTaskDialogs } from './lib/taskDraft.js';
import { performanceTelemetry } from './lib/performance.js';
import { performanceOutcome } from './lib/performanceTelemetry.js';

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
    if (search === query) return;
    const timer = setTimeout(() => { setQuery(search); setOffset(0); }, 200);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => { setOffset(0); }, [filter, focusId]);
  useEffect(() => {
    const controller = createRentalWorkspace({
      observe: { ...performanceTelemetry, errorOutcome: performanceOutcome },
      inline: false,
      readList: createRentalSummaryReader(async (args) => {
        const { data, error } = await withReadRetry(() => client.rpc('admin_rental_list', args), 'Rental list');
        if (error) throw error;
        return data;
      }),
      readChanges: async (params, ids, knownIds) => {
        const size = ['archive', 'deposit_review'].includes(params.filter) ? 5 : 25;
        const { data, error } = await withReadRetry(() => client.rpc('admin_rental_summary_changes', {
          p_filter: params.filter, p_search: params.search, p_offset: 0,
          p_limit: params.offset + size, p_rental_id: params.focusId || null,
          p_changed_ids: ids, p_known_ids: knownIds,
        }), 'Rental updates');
        if (error) throw error;
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
    const unsubscribeDialogs = subscribeTaskDialogs(editing => controller.setEditing(editing));
    setState(controller.getState());
    return () => { unsubscribeDialogs(); controller.dispose(); controllerRef.current = null; };
  }, [client, userId]);
  useEffect(() => {
    if (!enabled) { controllerRef.current?.clearRetained(); return; }
    void controllerRef.current?.list({ filter, search: query, focusId, offset });
  }, [enabled, userId, filter, query, focusId, offset]);
  useEffect(() => {
    if (enabled && focusId) void controllerRef.current?.open(focusId);
  }, [enabled, focusId, userId]);
  useEffect(() => {
    if (!enabled || (!state.error && !state.detailError) || state.loading || state.detailLoading) return;
    const timer = setTimeout(() => {
      if (document.visibilityState === 'hidden' || navigator.onLine === false) return;
      if (state.error) void controllerRef.current?.list(undefined, true);
      if (state.detailError) void controllerRef.current?.open(state.selectedId, true);
    }, 15_000);
    return () => clearTimeout(timer);
  }, [enabled, state.error, state.detailError, state.loading, state.detailLoading, state.selectedId]);
  useEffect(() => {
    if (state.listPerformance) return performanceTelemetry.afterPaint(state.listPerformance.token, state.listPerformance.outcome);
  }, [state.listPerformance]);
  useEffect(() => {
    if (state.detailPerformance) return performanceTelemetry.afterPaint(state.detailPerformance.token, state.detailPerformance.outcome);
  }, [state.detailPerformance]);
  useEffect(() => () => {
    for (const action of ['rental_list', 'rental_archive', 'rental_detail']) performanceTelemetry.cancel(action);
  }, [enabled, userId]);
  return {
    ...state, setOffset,
    retainDepositReview: (id, applied) => controllerRef.current?.retainDepositReview(id, applied),
    open: (id) => controllerRef.current?.open(id),
    invalidate: () => controllerRef.current?.invalidate(),
    refresh: (options) => enabledRef.current ? controllerRef.current?.refresh(options) : Promise.resolve(),
    retry: () => { performanceTelemetry.intent(filter === 'archive' ? 'rental_archive' : 'rental_list', 'refresh'); return controllerRef.current?.list(undefined, true); },
    retryDetail: () => controllerRef.current?.open(state.selectedId, true),
  };
}
