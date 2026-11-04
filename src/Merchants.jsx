import React, { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import './merchants.css';

export default function Merchants({ onOpenRental }) {
  const [workspace, setWorkspace] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ merchant_id: '', display_name: '', email: '' });
  const [filter, setFilter] = useState('all');
  const [revoke, setRevoke] = useState(null);
  async function act(action = 'list', data = {}) {
    setBusy(true); setError('');
    try {
      const { data: result, error: failure } = await supabase.rpc('admin_merchant_workspace', { p_action: action, p_data: data });
      if (failure) throw failure;
      setWorkspace(result);
      if (action === 'invite') setForm({ ...form, display_name: '', email: '' });
      if (action === 'revoke_verification') setRevoke(null);
    } catch (failure) { setError(failure.message || 'Merchant workspace could not load.'); }
    finally { setBusy(false); }
  }
  useEffect(() => { void act(); }, []);
  const bookings = (workspace?.bookings || []).filter((r) => filter === 'all' || (r.payment_status === 'paid' && !['ready_for_pickup', 'active', 'rented', 'overdue', 'return_initiated', 'completed', 'cancelled'].includes(r.status)));
  return <section className="merchant-admin">
    <div className="merchant-admin-heading"><div><p className="eyebrow">Partner operations</p><h2>Merchants</h2><p>Partner bookings share the fleet calendar. Rent Me CT controls document review and vehicle release.</p></div><button className="secondary-btn" disabled={busy} onClick={() => act()}>Refresh</button></div>
    {error && <p role="alert" className="form-error">{error}</p>}
    {!workspace && <p>{busy ? 'Loading merchants…' : 'The merchant database migration must be installed before this workspace is available.'}</p>}
    {(workspace?.merchants || []).map((merchant) => <section className="merchant-admin-card" key={merchant.id}><div className="merchant-admin-heading"><div><h3>{merchant.name}</h3><p>{merchant.bookings_enabled ? 'New bookings enabled' : 'Pilot paused — new bookings and payments disabled'}</p></div><button className="secondary-btn" disabled={busy} onClick={() => act('bookings', { id: merchant.id, enabled: !merchant.bookings_enabled })}>{merchant.bookings_enabled ? 'Pause new bookings' : 'Enable new bookings'}</button></div>
      <p><a href={`https://login.rentmect.com/?merchant=${merchant.slug}`} target="_blank" rel="noopener noreferrer">Open merchant portal ↗</a></p>
      <p>Employees use their invited email address and a magic link. Inviting an email address does not change its customer or admin permissions.</p>
      <div className="merchant-admin-members">{(workspace.memberships || []).filter((m) => m.merchant_id === merchant.id).map((member) => <div key={member.id}><span><strong>{member.display_name}</strong><small>{member.email} · {member.active ? 'Active' : 'Disabled'}</small></span><button className="secondary-btn" disabled={busy} onClick={() => act('membership', { id: member.id, active: !member.active })}>{member.active ? 'Disable access' : 'Restore access'}</button></div>)}</div>
      <form className="merchant-admin-invite" onSubmit={(e) => { e.preventDefault(); act('invite', { ...form, merchant_id: merchant.id }); }}><label>Employee name<input value={form.merchant_id === merchant.id ? form.display_name : ''} required maxLength={120} onChange={(e) => setForm({ ...form, merchant_id: merchant.id, display_name: e.target.value })} /></label><label>Email address<input type="email" value={form.merchant_id === merchant.id ? form.email : ''} required onChange={(e) => setForm({ ...form, merchant_id: merchant.id, email: e.target.value })} /></label><button className="primary-btn" disabled={busy}>Add merchant access</button></form>
    </section>)}
    <div className="merchant-admin-heading"><h3>Merchant reservations</h3><label>Show<select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">All bookings</option><option value="needs_action">Paid · needs pickup clearance</option></select></label></div>
    {workspace && !bookings.length && <p>No merchant reservations in this view.</p>}
    {bookings.map((r) => <article className="merchant-admin-card" key={r.rental_id}><div className="merchant-admin-heading"><div><h3>{r.full_name} · {r.vehicle_name}</h3><p>{r.pickup_date} → {r.return_date} · {r.payment_status} · {r.status.replaceAll('_', ' ')}</p></div><button className="primary-btn" onClick={() => onOpenRental(r.rental_id)}>Review rental</button></div>
      <p>Documents due: {new Date(r.merchant_documents_due_at).toLocaleString('en-US', { timeZone: 'America/New_York' })} ET · Email: {r.delivery_status || 'Not queued'}</p><p>License: {r.license_approved ? 'Approved' : 'Pending'} · Insurance: {r.insurance_approved ? 'Approved' : 'Pending'} · In-person verification: {r.revoked_at ? 'Revoked' : 'Recorded'}</p>
      <details><summary>Review recorded license and insurance details</summary><dl><dt>License</dt><dd>{r.license_state} · {r.license_number} · expires {r.license_expires_on}</dd><dt>Insurance</dt><dd>{r.insurance_provider} · {r.policy_number}</dd><dt>Named insured / coverage</dt><dd>{r.named_insured} · {r.coverage_starts_on} → {r.coverage_ends_on} · Liability and collision confirmed</dd><dt>Employee / recorded at</dt><dd>{r.employee_id} · {r.verified_at}</dd><dt>CarCraft reference</dt><dd>{r.reference || '—'}</dd></dl></details>
      {!r.revoked_at && !['active','rented','overdue','return_initiated','completed','cancelled'].includes(r.status) && <button className="secondary-btn" onClick={() => setRevoke({ rental_id: r.rental_id, reason: '' })}>Revoke in-person verification</button>}
      {revoke?.rental_id === r.rental_id && <form onSubmit={(e) => { e.preventDefault(); act('revoke_verification', revoke); }}><label>Reason<input value={revoke.reason} minLength={5} required onChange={(e) => setRevoke({ ...revoke, reason: e.target.value })} /></label><button disabled={busy} className="primary-btn">Revoke and block pickup</button><button type="button" className="secondary-btn" onClick={() => setRevoke(null)}>Cancel</button></form>}
    </article>)}
  </section>;
}
