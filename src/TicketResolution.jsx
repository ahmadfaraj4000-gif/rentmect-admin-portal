import React, { useEffect, useRef, useState } from 'react';
import { supabase } from './lib/supabase';
import { useTaskDraft } from './useTaskDraft.js';
import { TICKET_STATUSES, TICKET_OUTCOMES, TICKET_BUCKET, ticketForm, ticketPayload, ticketTimeOptions, ticketNeedsNote, ticketRpc, ticketFileType, uploadTicketFile } from './lib/ticketResolution.js';
import './ticket-resolution.css';

const rpc = (name, args) => ticketRpc(supabase, name, args);
const money = value => value == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
const NOTICE_FIELDS = { agency: 'Issuing agency', ticket_number: 'Ticket number', ticket_type: 'Type', plate_number: 'Plate', plate_state: 'Plate state', vehicle_note: 'Vehicle verification', violation_date: 'Violation date', violation_time: 'Violation time', timezone: 'Timezone', location: 'Location', amount: 'Amount', issue_date: 'Issue date', received_date: 'Received date', payment_deadline: 'Payment deadline', appeal_deadline: 'Appeal deadline', notes: 'Notes' };
const ACTION_LABELS = { created: 'Case created', edited: 'Notice edited', edited_match_cleared: 'Notice edited; renter match cleared', confirm: 'Renter confirmed', start: 'Work started', resolve: 'Case resolved', reopen: 'Case reopened', note: 'Note added', renter_notified: 'Renter notification recorded', attachment_added: 'Evidence added', attachment_removed: 'Evidence removed' };
function ActivityDetails({ event }) {
  const { before, after, candidate, paid_by, outcome } = event.evidence || {};
  const changes = after ? Object.keys(NOTICE_FIELDS).filter(key => after[key] !== before?.[key] && (after[key] || before?.[key])) : [];
  if (!changes.length && !candidate && !outcome) return null;
  return <details><summary>Details</summary>{changes.length > 0 && <dl>{changes.map(key => <div key={key}><dt>{NOTICE_FIELDS[key]}</dt><dd>{event.action === 'created' ? String(after[key] ?? 'Not entered') : `${before?.[key] || 'Not entered'} → ${after[key] || 'Not entered'}`}</dd></div>)}</dl>}{candidate && <p>Confirmed renter: {candidate.full_name || 'Unnamed renter'} · Rental {candidate.id}</p>}{outcome && <p>{TICKET_OUTCOMES[outcome]}{paid_by && ` · Paid by: ${paid_by}`}</p>}</details>;
}
function instant(value) {
  if (!value) return 'Not recorded';
  if (value === 'infinity') return 'Still open';
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'long' }).format(new Date(value));
}
function VehiclePicker({ value, label = 'Vehicle', onChange, disabled = false }) {
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      try { const data = await rpc('admin_ticket_vehicles', { p_search: query }); if (active) { setRows(data); setError(''); } }
      catch (err) { if (active) setError(err.message); }
      finally { if (active) setLoading(false); }
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [query]);
  return <div className="ticket-vehicle-picker">
    <label>Search {label.toLowerCase()}<input value={query} disabled={disabled} placeholder="Fleet number, name, or plate" onChange={e => setQuery(e.target.value)}/></label>
    <label>{label}<select aria-label={label} disabled={disabled} value={value || ''} onChange={e => onChange(e.target.value)}>
      <option value="">{label === 'Filter vehicle' ? 'All vehicles' : 'Use plate/state or choose a vehicle'}</option>
      {value && !rows.some(row => row.id === value) && <option value={value}>Selected vehicle · {value.slice(0, 8)}</option>}
      {rows.map(row => <option key={row.id} value={row.id}>{row.name} {row.plate_number ? `· ${row.plate_number}` : ''}</option>)}
    </select></label>
    {loading && <small role="status">Searching vehicles…</small>}{error && <small role="alert">{error}</small>}
    <small>Search includes inactive fleet records. Current plates are not proof of historical assignment.</small>
  </div>;
}

export function TicketResolution({ canManage, canOpenRental, onOpenRental, refreshKey = 0 }) {
  const [filters, setFilters] = useState({ search: '', status: 'unresolved', vehicle: '', deadline: '' });
  const [offset, setOffset] = useState(0);
  const [list, setList] = useState({ rows: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailError, setDetailError] = useState('');
  const [detailBusy, setDetailBusy] = useState(false);
  const request = useRef(0);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true); setError('');
      try {
        const data = await rpc('admin_ticket_list', { p_search: filters.search, p_status: filters.status, p_vehicle_id: filters.vehicle || null, p_deadline: filters.deadline, p_offset: offset });
        if (active) setList(data);
      } catch (err) { if (active) setError(err.message); }
      finally { if (active) setLoading(false); }
    }, 200);
    return () => { active = false; clearTimeout(timer); };
  }, [filters, offset, reload, refreshKey]);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') setReload(x => x + 1); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  async function open(id) {
    const seq = ++request.current; setSelected(id === 'new' ? `new:${crypto.randomUUID()}` : id); setDetail(null); setDetailError('');
    if (id === 'new') { setDetail({ case: null, attachments: [], activity: [] }); return; }
    setDetailBusy(true);
    try { const data = await rpc('admin_ticket_detail', { p_id: id }); if (seq === request.current) { if (!data) throw new Error('Ticket not found.'); setDetail(data); } }
    catch (err) { if (seq === request.current) setDetailError(err.message); }
    finally { if (seq === request.current) setDetailBusy(false); }
  }
  function changed(next) { setDetail(next); setReload(x => x + 1); }
  function filter(key, value) { setFilters(current => ({ ...current, [key]: value })); setOffset(0); }
  return <section className="ticket-resolution" aria-label="Ticket Resolution">
    <div className="ticket-heading"><div><p className="eyebrow">Vehicle violations</p><h2>Ticket Resolution</h2><p>Match the violation time to rental history, then review and track the case.</p></div>
      <div className="ticket-actions"><button onClick={() => setReload(x => x + 1)}>Refresh list</button>{canManage && <button className="primary-btn" onClick={() => open('new')}>New ticket</button>}</div></div>
    <div className="ticket-filters">
      <label>Search tickets<input value={filters.search} onChange={e => filter('search', e.target.value)} placeholder="Ticket, agency, plate, or renter"/></label>
      <label>Status<select value={filters.status} onChange={e => filter('status', e.target.value)}><option value="unresolved">Unresolved</option><option value="all">All statuses</option>{Object.entries(TICKET_STATUSES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>Deadline<select value={filters.deadline} onChange={e => filter('deadline', e.target.value)}><option value="">All deadlines</option><option value="overdue">Overdue</option><option value="week">Due within seven days</option></select></label>
      <VehiclePicker label="Filter vehicle" value={filters.vehicle} onChange={value => filter('vehicle', value)}/>
    </div>
    {error && <p className="ticket-error" role="alert">{error} <button onClick={() => setReload(x => x + 1)}>Retry list</button></p>}
    {loading && <p role="status">Loading tickets…</p>}
    {!loading && !error && list.rows.length === 0 && <p className="ticket-empty">No tickets match these filters.</p>}
    <div className="ticket-table-wrap"><table><thead><tr><th>Ticket / agency</th><th>Vehicle</th><th>Violation date and time</th><th>Renter</th><th>Amount</th><th>Next deadline</th><th>Status</th></tr></thead>
      <tbody>{list.rows.map(row => <tr key={row.id}><td><button className="ticket-link" onClick={() => open(row.id)}>{row.ticket_number}</button><small>{row.agency}</small></td><td>{row.vehicle_name || row.plate_number || 'Needs review'}</td><td>{row.violation_date}<small>{row.violation_time || 'Time unknown'} · {row.timezone}</small></td><td>{row.renter_name || 'Not confirmed'}</td><td>{money(row.amount)}</td><td>{row.next_deadline || 'Not entered'}</td><td>{TICKET_STATUSES[row.status]}</td></tr>)}</tbody>
    </table></div>
    <div className="ticket-actions ticket-pagination"><button disabled={loading || offset === 0} onClick={() => setOffset(x => Math.max(0, x - 25))}>Previous</button><span>{list.total ? `${offset + 1}–${Math.min(offset + 25, list.total)} of ${list.total}` : '0 tickets'}</span><button disabled={loading || offset + 25 >= list.total} onClick={() => setOffset(x => x + 25)}>Next</button></div>
    {selected && <div className="ticket-detail-shell"><div className="ticket-actions"><button onClick={() => { ++request.current; setSelected(null); setDetail(null); }}>Close case</button></div>
      {detailBusy && <p role="status">Loading case…</p>}{detailError && <p role="alert">{detailError} <button onClick={() => open(selected)}>Retry case</button></p>}
      {detail && <TicketEditor key={selected} detail={detail} canManage={canManage} canOpenRental={canOpenRental} onOpenRental={onOpenRental} onChanged={changed}/>}</div>}
  </section>;
}

function TicketEditor({ detail, canManage, canOpenRental, onOpenRental, onChanged }) {
  const initial = useRef(ticketForm(detail.case || {}));
  const draftTask = useRef(`ticket-${detail.case?.id || 'new'}`);
  const [form, setForm, clearDraft] = useTaskDraft(draftTask.current, initial.current, Object.keys(initial.current));
  const [saved, setSaved] = useState(detail.case);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [matches, setMatches] = useState(null);
  const [matchId, setMatchId] = useState('');
  const [note, setNote] = useState('');
  const [actionNote, setActionNote] = useState('');
  const [outcome, setOutcome] = useState('paid_to_agency');
  const [paidBy, setPaidBy] = useState('');
  const [files, setFiles] = useState([]);
  const [preview, setPreview] = useState(null);
  const [links, setLinks] = useState({});
  const closed = saved?.status === 'resolved';
  const disabled = busy || !canManage || closed;
  const dirty = JSON.stringify(form) !== JSON.stringify(ticketForm(saved || {}));
  const field = (key, value) => { setForm(current => ({ ...current, [key]: value, ...(['violation_date', 'violation_time', 'timezone', 'time_unknown'].includes(key) ? { occurred_at: '' } : {}) })); setMatches(null); setMessage(''); };
  async function run(fn) { setBusy(true); setError(''); setMessage(''); try { await fn(); } catch (err) { setError(err.message || 'Please retry.'); } finally { setBusy(false); } }
  async function refresh(id, replaceForm = false) {
    const next = await rpc('admin_ticket_detail', { p_id: id });
    if (!next) throw new Error('Ticket not found.');
    setSaved(next.case); onChanged(next);
    if (replaceForm) { setForm(ticketForm(next.case)); clearDraft(); setMatches(null); setMatchId(''); }
    return next;
  }
  async function save() {
    const payload = ticketPayload(form);
    const result = await rpc('admin_ticket_save', { p_id: form.id, p_version: form.version || null, p_data: payload });
    await refresh(result.case.id, true);
    setMessage(result.duplicate ? 'This ticket already exists. Its saved case is open below.' : 'Ticket saved.');
    return result.case;
  }
  async function action(name, data = {}) {
    if (!saved || dirty) throw new Error('Save the ticket fields before recording an action.');
    await rpc('admin_ticket_action', { p_id: saved.id, p_version: saved.version, p_action: name, p_data: data });
    await refresh(saved.id, true); setActionNote(''); setNote(''); setMessage('Case updated.');
  }
  let options = [];
  try { if (!form.time_unknown) options = ticketTimeOptions(form.violation_date, form.violation_time, form.timezone); } catch { /* Save shows validation. */ }
  function input(key, label, type = 'text', props = {}) {
    return <label>{label}<input type={type} value={form[key]} disabled={disabled} onChange={e => field(key, e.target.value)} {...props}/></label>;
  }
  async function upload(item) {
    if (!saved) throw new Error('Save the ticket before uploading evidence.');
    await uploadTicketFile(supabase, saved.id, item.file, item.id);
    setFiles(current => current.filter(file => file.id !== item.id));
    await refresh(saved.id); setMessage('Evidence uploaded.');
  }
  async function viewAttachment(file) {
    const downloadOnly = ['image/heic', 'image/heif'].includes(file.mime_type);
    const { data, error: linkError } = await supabase.storage.from(TICKET_BUCKET).createSignedUrl(file.object_path, 300, downloadOnly ? { download: file.file_name } : {});
    if (linkError) throw linkError;
    setLinks(current => ({ ...current, [file.id]: data.signedUrl }));
    if (!downloadOnly) setPreview({ ...file, url: data.signedUrl });
  }
  const chosen = matches?.candidates.find(candidate => candidate.id === matchId);
  return <article className="ticket-case">
    <div className="ticket-heading"><div><h3>{saved ? `Ticket ${saved.ticket_number}` : 'New ticket'}</h3><p>{saved ? `${TICKET_STATUSES[saved.status]} · ${detail.vehicle_name || saved.plate_number || 'Vehicle selected'} · ${detail.renter_name || 'Renter not confirmed'}` : 'Save the notice, then find the renter.'}</p></div>
      {saved && <button disabled={busy} onClick={() => run(async () => { await refresh(saved.id, true); setMessage('Latest saved fields loaded.'); })}>Discard draft / reload saved case</button>}</div>
    {error && <p className="ticket-error" role="alert">{error}</p>}{message && <p className="ticket-message" role="status">{message}</p>}
    <form onSubmit={e => { e.preventDefault(); run(save); }}>
      <fieldset disabled={disabled}><legend>Notice details</legend><div className="ticket-form-grid">
        {input('agency', 'Issuing agency *', 'text', { required: true, maxLength: 200 })}{input('ticket_number', 'Ticket number *', 'text', { required: true, maxLength: 100 })}
        {input('ticket_type', 'Ticket type')}{input('amount', 'Amount due to agency', 'number', { min: 0, step: '0.01' })}
        <VehiclePicker value={form.vehicle_id} onChange={value => field('vehicle_id', value)} disabled={disabled}/>
        <div className="ticket-form-grid">{input('plate_number', 'Plate on notice')}{input('plate_state', 'Plate state', 'text', { maxLength: 10 })}</div>
        <label className="ticket-wide">Vehicle verification note<textarea value={form.vehicle_note} onChange={e => field('vehicle_note', e.target.value)} placeholder="Explain any missing or conflicting historical plate information."/></label>
      </div></fieldset>
      <fieldset disabled={disabled}><legend>Violation date and time</legend><p>Use when the violation happened, not when the notice was issued or received.</p><div className="ticket-form-grid">
        {input('violation_date', 'Violation date *', 'date', { required: true })}
        <div><label className="ticket-check"><input type="checkbox" checked={form.time_unknown} onChange={e => field('time_unknown', e.target.checked)}/>Time unknown</label>
          {!form.time_unknown && input('violation_time', 'Violation time', 'time', { step: 1, required: true })}</div>
        {input('timezone', 'Violation timezone (IANA)', 'text', { list: 'ticket-timezones', required: true })}<datalist id="ticket-timezones"><option>America/New_York</option><option>America/Chicago</option><option>America/Denver</option><option>America/Los_Angeles</option><option>America/Phoenix</option></datalist>
        {input('location', 'Violation location')}
        {options.length > 1 && <label className="ticket-wide">This clock time occurs twice — choose the occurrence<select value={options.find(option => Date.parse(option) === Date.parse(form.occurred_at)) || ''} onChange={e => field('occurred_at', e.target.value)} required><option value="">Check the notice timezone/offset</option>{options.map(value => <option key={value} value={value}>{new Intl.DateTimeFormat('en-US', { timeZone: form.timezone, dateStyle: 'medium', timeStyle: 'long' }).format(new Date(value))} ({value})</option>)}</select></label>}
      </div></fieldset>
      <fieldset disabled={disabled}><legend>Notice dates and deadlines</legend><p>Enter deadlines printed on the notice. They are not calculated automatically.</p><div className="ticket-form-grid">
        {input('issue_date', 'Issue date', 'date')}{input('received_date', 'Received date', 'date')}{input('appeal_deadline', 'Appeal deadline', 'date')}{input('payment_deadline', 'Payment deadline', 'date')}
        <label className="ticket-wide">Case notes<textarea value={form.notes} onChange={e => field('notes', e.target.value)}/></label>
      </div></fieldset>
      {canManage && !closed && <div className="ticket-actions"><button className="primary-btn" disabled={busy} type="submit">{busy ? 'Working…' : 'Save ticket'}</button><button disabled={busy} type="button" onClick={() => run(async () => { const c = await save(); const result = await rpc('admin_ticket_candidates', { p_id: c.id }); setMatches(result); setMatchId(''); })}>Save & find renter</button></div>}
    </form>
    {saved && !canManage && <button disabled={busy} onClick={() => run(async () => setMatches(await rpc('admin_ticket_candidates', { p_id: saved.id })))}>View rental candidates</button>}
    {matches && <section className="ticket-matches"><h4>Rental candidates</h4><p>Assignment dates may come from booking records. A return inspection is supporting evidence, not a verified handover time. Confirm against the agreement and other records.</p>
      {matches.time_unknown && <p className="ticket-warning">Time is unknown. These candidates overlap the whole local day.</p>}
      {matches.vehicle_verification_required && <p className="ticket-warning">Historical plate assignment is missing or conflicting. A vehicle verification note is required.</p>}
      {!matches.candidates.length && <p>No matching rental was found. Verify the vehicle and time; leave this case in Needs review if the evidence is incomplete.</p>}
      {!matches.candidates.length && matches.current_plate_suggestions?.length > 0 && <p>Current plate suggestions: {matches.current_plate_suggestions.map(v => v.name).join(', ')}. Select the correct vehicle above and explain the historical plate verification.</p>}
      {matches.candidates.map(candidate => <label className="ticket-candidate" key={candidate.id}><input type="radio" name="ticket-renter" checked={matchId === candidate.id} disabled={!canManage || busy || !candidate.eligible || closed} onChange={() => setMatchId(candidate.id)}/><div><strong>{candidate.full_name || 'Unnamed renter'}</strong><p>{candidate.email} {candidate.phone} · Rental {candidate.id}</p><p>Booked: {candidate.pickup_date} {candidate.pickup_time} → {candidate.return_date} {candidate.return_time}</p><p>Return inspection: {instant(candidate.inspection_completed_at)}</p>
        {candidate.intervals.map((period, index) => <p key={index}>{period.vehicle_name}: {instant(period.from)} → {instant(period.until)} · {period.source.replaceAll('_', ' ')}</p>)}
        <strong>{!candidate.eligible ? 'Not eligible: no recorded trip start' : candidate.booked_fallback ? 'Booked dates only — verify possession' : 'Overlaps recorded vehicle assignment — staff review required'}</strong></div></label>)}
      {canManage && !closed && <><label>Match verification note {ticketNeedsNote(matches, chosen) ? '(required for this match)' : '(optional)'}<textarea value={note} onChange={e => setNote(e.target.value)}/></label><button disabled={busy || !chosen || !chosen.eligible} onClick={() => run(() => action('confirm', { rental_id: matchId, token: matches.token, note }))}>Confirm selected renter</button></>}
    </section>}
    {saved?.match_evidence && <section><h4>Confirmed matching evidence</h4><p>{saved.match_evidence.candidate?.full_name} · Confirmed {instant(saved.confirmed_at)}</p><p>{saved.match_evidence.verification_note || 'Staff confirmed the recorded assignment.'}</p><details><summary>View saved evidence</summary><p>{saved.match_evidence.vehicle_note}</p><p>Rental {saved.rental_id}</p>{saved.match_evidence.candidate?.intervals?.map((period,index) => <p key={index}>{period.vehicle_name}: {instant(period.from)} → {instant(period.until)}</p>)}<p>Return inspection: {instant(saved.match_evidence.candidate?.inspection_completed_at)}</p></details>
      {canOpenRental && <button onClick={() => onOpenRental(saved.rental_id)}>Open rental</button>}</section>}
    <section><h4>Ticket evidence</h4><p>PDF, JPEG, PNG, WebP, HEIC/HEIF · 20 MB per file. HEIC/HEIF is available as a download.</p>
      {canManage && !closed && <label>Add attachments<input type="file" multiple disabled={busy} accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif" onChange={e => {
        const chosenFiles = Array.from(e.target.files || []); e.target.value = '';
        try {
          chosenFiles.forEach(ticketFileType);
          setFiles(current => {
            const next = [...current];
            for (const file of chosenFiles) {
              const pending = detail.attachments.find(item => !item.uploaded_at && item.file_name === file.name && Number(item.size_bytes) === file.size && item.mime_type === ticketFileType(file));
              const id = pending?.id || crypto.randomUUID();
              if (!next.some(item => item.id === id)) next.push({ id, file });
            }
            return next;
          });
          setError('');
        } catch (err) { setError(err.message); }
      }}/></label>}
      {files.length > 0 && <p>Selected files stay here until uploaded. After leaving the tab, reselect any files that were not uploaded.</p>}
      {files.map(item => <div className="ticket-actions" key={item.id}><span>{item.file.name}</span><button disabled={busy || !saved || closed || !canManage} onClick={() => run(() => upload(item))}>Upload / retry</button><button disabled={busy} onClick={() => setFiles(current => current.filter(file => file.id !== item.id))}>Remove selection</button></div>)}
      {detail.attachments.map(file => <div className="ticket-actions" key={file.id}><span>{file.file_name} {!file.uploaded_at && '(upload incomplete — reselect the file to retry)'}</span>
        {file.uploaded_at && <button disabled={busy} onClick={() => run(() => viewAttachment(file))}>{['image/heic', 'image/heif'].includes(file.mime_type) ? 'Prepare download' : 'Preview'}</button>}
        {links[file.id] && <a href={links[file.id]} target="_blank" rel="noopener noreferrer">Open / download {file.file_name}</a>}
        {canManage && !closed && <button disabled={busy} onClick={() => run(async () => { await rpc('admin_ticket_attachment', { p_id: saved.id, p_attachment_id: file.id, p_action: 'remove' }); await refresh(saved.id); })}>Remove attachment</button>}</div>)}
      {preview && <div className="ticket-preview"><button onClick={() => setPreview(null)}>Close preview</button>{preview.mime_type === 'application/pdf' ? <iframe title={preview.file_name} src={preview.url}/> : <img src={preview.url} alt={preview.file_name}/>}<small>Private link expires after five minutes; use Preview again to renew it.</small></div>}
    </section>
    {saved && <section><h4>Resolution and activity</h4><p>Recording a resolution does not send a message, charge a renter, or pay the issuing agency.</p>
      {closed && <p><strong>{TICKET_OUTCOMES[saved.outcome]}</strong> {saved.paid_by && `· Paid by: ${saved.paid_by}`}<br/>{saved.resolution_note}</p>}
      {canManage && <><label>{closed ? 'Reason for reopening' : 'Activity / resolution note'}<textarea value={actionNote} onChange={e => setActionNote(e.target.value)} disabled={busy}/></label>
        {closed ? <button disabled={busy} onClick={() => run(() => action('reopen', { note: actionNote }))}>Reopen case</button> : <><div className="ticket-actions"><button disabled={busy} onClick={() => run(() => action('note', { note: actionNote }))}>Add note</button><button disabled={busy} onClick={() => run(() => action('renter_notified', { note: actionNote }))}>Record renter notified</button><button disabled={busy} onClick={() => run(() => action('start', { note: actionNote }))}>Mark in progress</button></div>
        <div className="ticket-form-grid"><label>Resolution outcome<select value={outcome} onChange={e => setOutcome(e.target.value)}>{Object.entries(TICKET_OUTCOMES).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>{outcome === 'paid_to_agency' && <label>Who paid the agency?<input value={paidBy} onChange={e => setPaidBy(e.target.value)} placeholder="Business, renter, or other payer"/><small>This does not record reimbursement by the renter.</small></label>}</div>
        <button disabled={busy} onClick={() => run(() => action('resolve', { outcome, paid_by: paidBy, note: actionNote }))}>Record resolution</button></>}
      </>}
      <ol className="ticket-history">{detail.activity.map(event => <li key={event.id}><strong>{ACTION_LABELS[event.action] || event.action}</strong> · {event.actor_name || 'Staff'} · {instant(event.created_at)}{event.note && <p>{event.note}</p>}<ActivityDetails event={event}/></li>)}</ol>
    </section>}
  </article>;
}
