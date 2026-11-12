import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './lib/supabase';
import './ticket-resolution.css';
import { createCustomerTicketFlagStore } from './lib/customerTicketFlags.js';
const Context = createContext(null);
export function CustomerTicketFlagProvider({ children, onOpenRental, onOpenTicket }) {
  const [entries, setEntries] = useState(new Map());
  const store = useRef(null);
  // React Strict Mode can replay effects; create a fresh store on each setup.
  const registrations = useRef(new Map());
  const register = useMemo(() => id => {
    if (!id) return () => {};
    const token = {};
    registrations.current.set(token, { id, cleanup: store.current?.register(id) });
    return () => { registrations.current.get(token)?.cleanup?.(); registrations.current.delete(token); };
  }, []);
  useEffect(() => {
    const loader = createCustomerTicketFlagStore({
      fetchFlags: (ids, signal) => supabase.rpc('admin_ticket_customer_flags', { p_user_ids: ids }).abortSignal(signal),
      onChange: setEntries,
      onError: diagnostic => console.warn('Ticket flag lookup failed', diagnostic),
    });
    store.current = loader;
    for (const entry of registrations.current.values()) entry.cleanup = loader.register(entry.id);
    const refresh = () => loader.refresh();
    const visible = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    window.addEventListener('ticket-flags-changed', refresh);
    document.addEventListener('visibilitychange', visible);
    return () => {
      loader.dispose(); store.current = null;
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
      window.removeEventListener('ticket-flags-changed', refresh);
      document.removeEventListener('visibilitychange', visible);
    };
  }, []);
  return <Context.Provider value={{ entries, register, onOpenRental, onOpenTicket, retry: () => store.current?.refresh() }}>{children}</Context.Provider>;
}
export function CustomerTicketFlags({ userId }) {
  const context = useContext(Context);
  const register = context?.register;
  useEffect(() => register?.(userId), [register, userId]);
  if (!context || !userId) return null;
  const entry = context.entries.get(userId);
  const rows = entry?.rows || [];
  const notice = entry?.error && <p className="ticket-warning" role="status">
    {entry.checked ? 'Showing the last checked ticket flags. ' : 'Ticket flag status is not yet verified. '}
    {entry.retrying ? 'Reconnecting automatically…' : 'Ticket flag lookup needs attention.'}
    <button type="button" onClick={context.retry}>Retry now</button>
  </p>;
  if (!rows.length) return notice || null;
  return <>{notice}<aside className="ticket-red-flag" aria-label="Customer ticket red flag"><strong>Red flag — ticket review required</strong>
    {rows.map(row => <div key={row.id}><p>{row.ticket_number.startsWith('MANUAL-') ? 'Ticket' : row.ticket_number} · {row.violation_date}{row.amount != null && ` · Agency amount $${Number(row.amount).toFixed(2)}`}</p><p>{row.note}</p><div className="ticket-actions">{context.onOpenTicket && <button type="button" onClick={() => context.onOpenTicket(row.id)}>Review ticket</button>}{context.onOpenRental && <button type="button" onClick={() => context.onOpenRental(row.rental_id)}>Original rental / charges</button>}</div></div>)}
    <small>Check existing charges and payments before collecting. This flag is not an unpaid balance and does not automatically charge or block a booking.</small>
  </aside></>;
}
