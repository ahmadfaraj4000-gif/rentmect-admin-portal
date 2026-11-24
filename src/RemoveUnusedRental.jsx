import React, { useState } from 'react';

export default function RemoveUnusedRental({ client, rental, onComplete }) {
  const [action, setAction] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(confirm) {
    setBusy(true); setError('');
    try {
      const { data, error } = await client.rpc('remove_unused_rental', { p_rental_id: rental.id, p_confirm: confirm ? action : null });
      if (error) throw error;
      if (confirm) await onComplete(data);
      else setAction(data);
    } catch (e) { setError(e.message); setAction(''); }
    finally { setBusy(false); }
  }
  return <section className="rental-card-supplement">
    {!action && <button className="secondary-btn" type="button" disabled={busy} onClick={() => submit(false)}>Review unused rental for removal</button>}
    {action && <>
      <p>{rental.profiles?.full_name || rental.customer_name_snapshot} · {rental.vehicles?.name} · {rental.pickup_date} through {rental.return_date}</p>
      <p>{action === 'delete' ? 'Permanently delete this unused draft and release its reservation?' : 'Archive this incomplete rental, release its reservation and retain its history?'}</p>
      <button className="secondary-btn" type="button" disabled={busy} onClick={() => setAction('')}>Cancel</button>
      <button className="approve" type="button" disabled={busy} onClick={() => submit(true)}>{action === 'delete' ? 'Delete draft permanently' : 'Archive rental'}</button>
    </>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
