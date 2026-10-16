import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './lib/supabase';
import './ticket-resolution.css';
const Context = createContext(null);
export function CustomerTicketFlagProvider({ children, onOpenRental, onOpenTicket }) {
  const users = useRef(new Map());
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({ rows: [], error: '' });
  const register = useMemo(() => id => {
    if (!id) return () => {};
    users.current.set(id, (users.current.get(id) || 0) + 1); setRevision(x => x + 1);
    return () => { const n = users.current.get(id) - 1; if (n) users.current.set(id, n); else users.current.delete(id); setRevision(x => x + 1); };
  }, []);
  useEffect(() => {
    const refresh = () => setRevision(x => x + 1);
    window.addEventListener('focus', refresh); window.addEventListener('ticket-flags-changed', refresh);
    return () => { window.removeEventListener('focus', refresh); window.removeEventListener('ticket-flags-changed', refresh); };
  }, []);
  useEffect(() => {
    let live = true;
    const timer = setTimeout(async () => {
      const ids = [...users.current.keys()];
      if (!ids.length) return;
      try {
        const rows = [];
        for (let i = 0; i < ids.length; i += 500) {
          const result = await supabase.rpc('admin_ticket_customer_flags', { p_user_ids: ids.slice(i, i + 500) });
          if (result.error) throw result.error;
          rows.push(...result.data);
        }
        if (live) setState({ rows, error: '' });
      } catch (error) { if (live) setState({ rows: [], error: error.message }); }
    }, 100);
    return () => { live = false; clearTimeout(timer); };
  }, [revision]);
  return <Context.Provider value={{ ...state, register, onOpenRental, onOpenTicket, retry: () => setRevision(x => x + 1) }}>{children}</Context.Provider>;
}
export function CustomerTicketFlags({ userId }) {
  const context = useContext(Context);
  const register = context?.register;
  useEffect(() => register?.(userId), [register, userId]);
  if (!context || !userId) return null;
  if (context.error) return <p className="ticket-warning">Ticket flags could not load. <button type="button" onClick={context.retry}>Retry</button></p>;
  const rows = context.rows.filter(row => row.user_id === userId);
  if (!rows.length) return null;
  return <aside className="ticket-red-flag" aria-label="Customer ticket red flag"><strong>Red flag — ticket review required</strong>
    {rows.map(row => <div key={row.id}><p>{row.ticket_number.startsWith('MANUAL-') ? 'Ticket' : row.ticket_number} · {row.violation_date}{row.amount != null && ` · Agency amount $${Number(row.amount).toFixed(2)}`}</p><p>{row.note}</p><div className="ticket-actions">{context.onOpenTicket && <button type="button" onClick={() => context.onOpenTicket(row.id)}>Review ticket</button>}{context.onOpenRental && <button type="button" onClick={() => context.onOpenRental(row.rental_id)}>Original rental / charges</button>}</div></div>)}
    <small>Check existing charges and payments before collecting. This flag is not an unpaid balance and does not automatically charge or block a booking.</small>
  </aside>;
}
