import React, { useRef, useState } from 'react';

export default function BalanceEmail({ client, rentalId }) {
  const [statement, setStatement] = useState(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState(null);
  const request = useRef('');
  async function run(action) {
    setBusy(true);
    try {
      if (action === 'status') {
        const { data, error } = await client.from('email_outbox').select('status,last_error').eq('id',job).single();
        if (error) throw error;
        setMessage('Delivery status: ' + data.status + (data.last_error ? ' · ' + data.last_error : ''));
      } else if (action === 'preview') {
        setStatement(null);
        const { data, error } = await client.rpc('rental_balance_statement', { p_rental_id: rentalId });
        if (error) throw error;
        request.current = crypto.randomUUID();
        setStatement(data); setMessage('');
      } else {
        const { data, error } = await client.rpc('email_rental_balance_statement', {
          p_rental_id: rentalId, p_request_id: request.current, p_preview: statement,
        });
        if (error) throw error;
        setJob(data); setMessage('Email queued for ' + statement.recipient);
      }
    } catch (e) { setMessage(e.message); }
    finally { setBusy(false); }
  }
  return <div className="rental-card-supplement">
    <button type="button" className="secondary-btn" disabled={busy} onClick={() => run('preview')}>Preview customer balance email</button>
    {statement && <section aria-label="Customer balance email preview">
      <p>To {statement.recipient || 'Missing customer email'}</p>
      <pre style={{whiteSpace:'pre-wrap', overflowWrap:'anywhere'}}>{statement.statement}</pre>
      {!job && <button type="button" className="approve" disabled={busy || !statement.recipient || statement.due <= 0} onClick={() => run('send')}>Send balance to customer</button>}
      {job && <button type="button" className="secondary-btn" disabled={busy} onClick={() => run('status')}>Check delivery</button>}
      <button type="button" className="secondary-btn" disabled={busy} onClick={() => {setStatement(null); setJob(null); setMessage('');}}>Close preview</button>
    </section>}
    {message && <p role="status">{message}</p>}
  </div>;
}
