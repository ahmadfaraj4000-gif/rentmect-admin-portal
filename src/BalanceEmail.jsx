import React, { useRef, useState } from 'react';

export default function BalanceEmail({ client, rentalId }) {
  const [preview, setPreview] = useState(null);
  const statement = preview?.statement;
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');
  const [job, setJob] = useState(null);
  const request = useRef('');
  const previewButton = useRef(null);
  async function run(action) {
    setBusy(action);
    try {
      if (action === 'status') {
        const { data, error } = await client.from('email_outbox').select('status,last_error').eq('id',job).single();
        if (error) throw error;
        setMessage('Delivery status: ' + data.status + (data.last_error ? ' · ' + data.last_error : ''));
      } else if (action === 'preview') {
        setPreview(null);
        const { data, error } = await client.functions.invoke('send-emails/balance-preview', { body: { rentalId } });
        if (error) throw error;
        if (!data?.html || !data.statement) throw Error('The balance email preview could not be loaded.');
        request.current = crypto.randomUUID();
        setPreview(data); setMessage('');
      } else {
        const { data, error } = await client.rpc('email_rental_balance_statement', {
          p_rental_id: rentalId, p_request_id: request.current, p_preview: statement,
        });
        if (error) throw error;
        setJob(data); setMessage('Email queued for ' + statement.recipient);
      }
    } catch (e) { setMessage(e.message); }
    finally { setBusy(''); }
  }
  return <div className="rental-card-supplement">
    <div className="balance-preview-controls">
      <button ref={previewButton} type="button" className="primary-btn" disabled={Boolean(busy)} aria-expanded={Boolean(statement)} onClick={() => run('preview')}>{busy === 'preview' ? 'Loading preview…' : 'Preview customer balance email'}</button>
      {statement && <button type="button" className="balance-preview-close" disabled={Boolean(busy)} onClick={() => {
        setPreview(null);
        setJob(null);
        setMessage('');
        previewButton.current?.focus();
      }}>Close preview</button>}
    </div>
    {statement && <section aria-label="Customer balance email preview">
      <p>To {statement.recipient || 'Missing customer email'}</p>
      <iframe className="email-preview-frame" title="Customer balance email" sandbox="" referrerPolicy="no-referrer" srcDoc={preview.html}/>
      {!job && <button type="button" className="approve" disabled={busy || !statement.recipient || statement.due <= 0} onClick={() => run('send')}>Send balance to customer</button>}
      {job && <button type="button" className="secondary-btn" disabled={Boolean(busy)} onClick={() => run('status')}>Check delivery</button>}
    </section>}
    {message && <p role="status">{message}</p>}
  </div>;
}
