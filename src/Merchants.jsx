import { LazyHistoryDetail } from './HistoryScreens.jsx';
import React, { useEffect, useRef, useState } from 'react';
import { supabase } from './lib/supabase';
import './merchants.css';

export default function Merchants({ onOpenRental }) {
  const [workspace, setWorkspace] = useState(null);
  const requestRef=useRef(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('all');
  const [offset,setOffset] = useState(0);
  const [revoke, setRevoke] = useState(null);
  async function act(action = 'list', data = {}) {
    const request=++requestRef.current;
    setBusy(true); setError('');
    try {
      const { data: result, error: failure } = await supabase.rpc('admin_merchant_workspace', { p_action: action, p_data: { ...data,offset,filter } });
      if (failure) throw failure;
      if(request===requestRef.current) setWorkspace(result);
      if (action === 'revoke_verification') setRevoke(null);
    } catch (failure) { if(request===requestRef.current) setError(failure.message || 'Merchant workspace could not load.'); }
    finally { if(request===requestRef.current) setBusy(false); }
  }
  useEffect(() => { void act(); }, [offset,filter]);
  const bookings = (workspace?.bookings || []).slice(0,50);
  return <section className="merchant-admin">
    <div className="merchant-admin-heading"><div><p className="eyebrow">Partner operations</p><h2>Merchants</h2><p>Partner bookings share the fleet calendar. Rent Me CT controls document review and vehicle release.</p></div><button className="secondary-btn" disabled={busy} onClick={() => act()}>Refresh</button></div>
    {error && <p role="alert" className="form-error">{error}</p>}
    {!workspace && <p>{busy ? 'Loading merchants…' : 'The merchant database migration must be installed before this workspace is available.'}</p>}
    {(workspace?.merchants || []).map((merchant) => <section className="merchant-admin-card" key={merchant.id}><div className="merchant-admin-heading"><div><h3>{merchant.name}</h3><p>{merchant.bookings_enabled ? 'New bookings enabled' : 'Pilot paused — new bookings and payments disabled'}</p></div><button className="secondary-btn" disabled={busy} onClick={() => act('bookings', { id: merchant.id, enabled: !merchant.bookings_enabled })}>{merchant.bookings_enabled ? 'Pause new bookings' : 'Enable new bookings'}</button></div>
      <p><a href={`https://login.rentmect.com/?merchant=${merchant.slug}`} target="_blank" rel="noopener noreferrer">Open merchant portal ↗</a></p>
      <p>Merchant accounts and access changes are handled only by direct request to the owner. Accounts cannot be created or invited from this dashboard.</p>
      <div className="merchant-admin-members">{(workspace.memberships || []).filter((m) => m.merchant_id === merchant.id).map((member) => <div key={member.id}><span><strong>{member.display_name}</strong><small>{member.email} · {member.active ? 'Active' : 'Disabled'}</small></span></div>)}</div>

    </section>)}
    <div className="merchant-admin-heading"><h3>Merchant reservations</h3><label>Show<select value={filter} onChange={(e) => {setFilter(e.target.value);setOffset(0);}}><option value="all">All bookings</option><option value="needs_action">Paid · needs pickup clearance</option></select></label></div>
    <div className="row-actions"><button disabled={busy || offset===0} onClick={()=>setOffset(value=>Math.max(0,value-50))}>Previous</button><span>{offset+1}–{offset+bookings.length}</span><button disabled={busy || (workspace?.bookings || []).length<=50} onClick={()=>setOffset(value=>value+50)}>Next</button></div>
    {workspace && !bookings.length && <p>No merchant reservations in this view.</p>}
    {bookings.map((r) => <article className="merchant-admin-card" key={r.rental_id}><div className="merchant-admin-heading"><div><h3>{r.full_name} · {r.vehicle_name}</h3><p>{r.pickup_date} → {r.return_date} · {r.payment_status} · {r.status.replaceAll('_', ' ')}</p></div><button className="primary-btn" onClick={() => onOpenRental(r.rental_id)}>Review rental</button></div>
      <p>Documents due: {new Date(r.merchant_documents_due_at).toLocaleString('en-US', { timeZone: 'America/New_York' })} ET · Email: {r.delivery_status || 'Not queued'}</p><p>License: {r.license_approved ? 'Approved' : 'Pending'} · Insurance: {r.insurance_approved ? 'Approved' : 'Pending'} · In-person verification: {r.revoked_at ? 'Revoked' : 'Recorded'}</p>
      <LazyHistoryDetail id={r.rental_id} read={async signal=>{const {data,error}=await supabase.rpc('admin_merchant_workspace',{p_action:'detail',p_data:{rental_id:r.rental_id}}).abortSignal(signal);if(error) throw error;return data;}}>
        {detail => <dl><dt>License</dt><dd>{detail.license_state} · {detail.license_number} · expires {detail.license_expires_on}</dd><dt>Insurance</dt><dd>{detail.insurance_provider} · {detail.policy_number}</dd><dt>Named insured / coverage</dt><dd>{detail.named_insured} · {detail.coverage_starts_on} → {detail.coverage_ends_on} · Liability and collision confirmed</dd><dt>Employee / recorded at</dt><dd>{detail.employee_id} · {detail.verified_at}</dd><dt>CarCraft reference</dt><dd>{detail.reference || '—'}</dd></dl>}</LazyHistoryDetail>
      {!r.revoked_at && !['active','rented','overdue','return_initiated','completed','cancelled'].includes(r.status) && <button className="secondary-btn" onClick={() => setRevoke({ rental_id: r.rental_id, reason: '' })}>Revoke in-person verification</button>}
      {revoke?.rental_id === r.rental_id && <form onSubmit={(e) => { e.preventDefault(); act('revoke_verification', revoke); }}><label>Reason<input value={revoke.reason} minLength={5} required onChange={(e) => setRevoke({ ...revoke, reason: e.target.value })} /></label><button disabled={busy} className="primary-btn">Revoke and block pickup</button><button type="button" className="secondary-btn" onClick={() => setRevoke(null)}>Cancel</button></form>}
    </article>)}
  </section>;
}
