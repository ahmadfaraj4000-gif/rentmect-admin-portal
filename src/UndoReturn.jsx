import React, { useState } from 'react';

export default function UndoReturn({ client, rental, onComplete }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function undo(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try {
      const result = await client.rpc('undo_rental_return', { p_rental_id:rental.id, p_code:code, p_inspected_at:rental.inspection_completed_at });
      if (result.error || result.data?.error) throw Error(result.error?.message || result.data.error);
      await onComplete();
    } catch (e) { setError(e.message); }
    finally { setCode(''); setBusy(false); }
  }
  if (!open) return <button type="button" className="secondary-btn" onClick={() => setOpen(true)}>Undo return</button>;
  return <form className="rental-card-section" onSubmit={undo}>
    <h4>Restore rental to Cars Out</h4>
    <p>{rental.profiles?.full_name || rental.customer_name_snapshot} · {rental.vehicles?.name}</p>
    <p>Restore the vehicle assignment and the original billing schedule, including the return due {rental.return_date} at {rental.return_time} ET.</p>
    <label>Recovery code <input type="password" value={code} autoComplete="off" maxLength={32} required onChange={e => setCode(e.target.value)}/></label>
    {error && <p role="alert">{error}</p>}
    <div className="modal-actions">
      <button type="button" className="secondary-btn" disabled={busy} onClick={() => {setCode(''); setError(''); setOpen(false);}}>Cancel</button>
      <button className="approve" type="submit" disabled={busy || !code}>{busy ? 'Restoring…' : 'Restore to Cars Out'}</button>
    </div>
  </form>;
}
