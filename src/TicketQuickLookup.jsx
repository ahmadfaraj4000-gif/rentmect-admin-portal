import React, { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import { useTaskDraft } from './useTaskDraft.js';
import { ticketForm, ticketPayload, ticketRpc, ticketTimeOptions } from './lib/ticketResolution.js';

export function TicketQuickLookup({ canManage, onSaved }) {
  const [form, setForm, clearDraft] = useTaskDraft('ticket-quick-lookup', ticketForm({}), Object.keys(ticketForm({})));
  const [vehicles, setVehicles] = useState([]);
  const [search, setSearch] = useState('');
  const [matches, setMatches] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => ticketRpc(supabase, 'admin_ticket_vehicles', { p_search: search }).then(rows => { if (live) setVehicles(rows); }).catch(err => { if (live) setError(err.message); }), 200);
    return () => { live = false; clearTimeout(timer); };
  }, [search]);
  function field(key, value) { setForm(old => ({ ...old, [key]: value, occurred_at: '' })); setMatches(null); }
  async function run(fn) { setBusy(true); setError(''); try { await fn(); } catch (err) { setError(err.message); } finally { setBusy(false); } }
  let timeOptions = [];
  try { if (!form.time_unknown) timeOptions = ticketTimeOptions(form.violation_date, form.violation_time, form.timezone); } catch { /* Show error on lookup. */ }
  return <section className="ticket-quick"><h3>Who had the car?</h3><p>Use the date and time the ticket happened.</p>
    <form onSubmit={e => { e.preventDefault(); run(async () => setMatches(await ticketRpc(supabase, 'admin_ticket_lookup', { p_data: ticketPayload({ ...form, plate_state: form.plate_state || 'CT' }) }))); }}>
      <div className="ticket-form-grid">
        <label>Plate or car number<input placeholder="e.g. BV73210 or 210" value={search || form.plate_number} onChange={e => { setSearch(e.target.value); setForm(old => ({ ...old, plate_number: e.target.value, plate_state: 'CT', vehicle_id: '' })); setMatches(null); }}/></label>
        <label>Choose a car<select value={form.vehicle_id} onChange={e => { const car = vehicles.find(v => v.id === e.target.value); setForm(old => ({ ...old, vehicle_id: car?.id || '', plate_number: car?.plate_number || '', plate_state: car?.plate_state || 'CT' })); setSearch(''); setMatches(null); }}><option value="">Select car number — plate</option>{form.vehicle_id && !vehicles.some(v => v.id === form.vehicle_id) && <option value={form.vehicle_id}>Selected car — {form.plate_number}</option>}{vehicles.map(v => <option key={v.id} value={v.id}>{v.name} — {v.plate_number || 'No plate recorded'}</option>)}</select></label>
        <label>Ticket date<input type="date" required value={form.violation_date} onChange={e => field('violation_date', e.target.value)}/></label>
        <label>Ticket time<input type="time" step="1" required={!form.time_unknown} disabled={form.time_unknown} value={form.violation_time} onChange={e => field('violation_time', e.target.value)}/><small>{form.timezone === 'America/New_York' ? 'Eastern time · America/New_York' : form.timezone}</small></label>
        <label>Amount ($)<input type="number" min="0" step="0.01" placeholder="50.00" value={form.amount} onChange={e => setForm(old => ({ ...old, amount: e.target.value }))}/><small>optional</small></label>
      </div>
      <details><summary>Time unknown, another state, or timezone</summary><label className="ticket-check"><input type="checkbox" checked={form.time_unknown} onChange={e => field('time_unknown', e.target.checked)}/>Time unknown — search the whole day</label><label>Plate state<input value={form.plate_state || 'CT'} onChange={e => field('plate_state', e.target.value)}/></label><label>Timezone<input value={form.timezone} onChange={e => field('timezone', e.target.value)}/></label></details>
      {timeOptions.length > 1 && <label>This time occurs twice. Choose the notice’s timezone offset.<select value={form.occurred_at} required onChange={e => setForm(old => ({ ...old, occurred_at: e.target.value }))}><option value="">Choose time</option>{timeOptions.map(t => <option key={t} value={t}>{new Intl.DateTimeFormat('en-US', { timeZone: form.timezone, timeStyle: 'long' }).format(new Date(t))} ({t})</option>)}</select></label>}
      {error && <p className="ticket-error" role="alert">{error}</p>}
      <button className="primary-btn" disabled={busy}>{busy ? 'Looking up…' : 'Find renter'}</button>
    </form>
    {matches && <div className="ticket-quick-results" role="status"><h4>{matches.candidates.length ? 'Rental matches' : 'No rental found for this time'}</h4>
      {!matches.candidates.length && <p>{matches.current_plate_suggestions?.length ? `Car: ${matches.current_plate_suggestions.map(v => v.name).join(', ')}. ` : ''}No recorded rental covers this ticket’s date and time. Check the older agreement or booking record before assigning it to a customer.</p>}
      {matches.candidates.map(c => <div key={c.id}><strong>{c.full_name || 'Unnamed renter'}</strong><p>{c.pickup_date} {c.pickup_time} → {c.return_date} {c.return_time}</p><small>{!c.eligible ? 'Reservation has no recorded pickup.' : c.booked_fallback || matches.candidates.length > 1 || matches.time_unknown ? 'Review the agreement to confirm who had the car.' : 'Vehicle assignment overlaps the ticket time. Review and confirm below.'}</small></div>)}
      {canManage && <button type="button" disabled={busy} onClick={() => run(async () => { const result = await ticketRpc(supabase, 'admin_ticket_save', { p_id: form.id, p_version: null, p_data: ticketPayload({ ...form, plate_state: form.plate_state || 'CT' }) }); clearDraft(); setForm(ticketForm({})); setSearch(''); setMatches(null); onSaved(result.case.id); })}>Save ticket & review</button>}
    </div>}
  </section>;
}
