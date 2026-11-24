import React, { useEffect, useState } from 'react';
import { RentalReceiptDialog } from './RentalLedger.jsx';

export default function RemoveUnusedRental({ client, rental, onComplete, onClose }) {
  const [action, setAction] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    async function review() {
      try {
        const { data, error } = await client.rpc('delete_unused_rental', { p_rental_id: rental.id, p_confirm: null });
        if (error) throw error;
        if (data !== 'delete') throw Error('Unable to verify removal eligibility.');
        if (active) setAction(data);
      } catch (e) { if (active) setError(e.message); }
    }
    review();
    return () => { active = false; };
  }, [client, rental.id]);

  async function confirm() {
    setBusy(true);
    try {
      const { data, error } = await client.rpc('delete_unused_rental', { p_rental_id: rental.id, p_confirm: action });
      if (error) throw error;
      await onComplete(data);
    } catch (e) { setError(e.message); setAction(''); }
    finally { setBusy(false); }
  }
  return <RentalReceiptDialog title="Delete unused rental" onClose={() => { if (!busy) onClose(); }}>
    <p>{rental.profiles?.full_name || rental.customer_name_snapshot} · {rental.vehicles?.name} · {rental.pickup_date} through {rental.return_date}</p>
    {!action && !error && <p role="status">Checking rental history…</p>}
    {error && <p role="alert">{error}</p>}
    {action && <p>Permanently delete this rental and its linked rental history, including any signed agreement? This cannot be undone.</p>}
    <div className="unused-rental-actions">
      <button className="unused-rental-cancel" type="button" disabled={busy} onClick={onClose}>Cancel</button>
      {action && <button className="unused-rental-delete" type="button" disabled={busy} onClick={confirm}>{busy ? 'Deleting…' : 'Delete rental permanently'}</button>}
    </div>
  </RentalReceiptDialog>;
}
