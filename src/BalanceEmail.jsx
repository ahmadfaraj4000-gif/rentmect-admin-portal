import React, { useEffect, useRef, useState } from 'react';

export default function BalanceEmail({ client, rentalId, rental, rentalReference }) {
  const [preview, setPreview] = useState(null);
  const statement = preview?.statement;
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');
  const [job, setJob] = useState(null);
  const request = useRef('');
  const previewButton = useRef(null);
  const [pollAt, setPollAt] = useState(null);
  useEffect(() => {
    if (!pollAt || !statement) return;
    const timer = setTimeout(() => send(statement, request.current), Math.max(0, pollAt - Date.now()));
    return () => clearTimeout(timer);
  }, [pollAt, statement]);
  useEffect(() => () => { request.current = ''; }, []);

  async function send(snapshot, requestId) {
    setPollAt(null);
    setJob('sending');
    try {
      const { data, error } = await client.functions.invoke('send-emails/balance-send', {
        body: { rentalId, requestId, statement: snapshot }
      });
      if (error) {
        const detail = await error.context?.json?.().catch(() => null);
        throw Error(detail?.error || error.message);
      }
      if (request.current !== requestId) return;
      setJob(data.status);
      if (data.status === 'sent') {
        setMessage('Sent to ' + snapshot.recipient + '.');
      } else if (data.status === 'cancelled' || (data.status === 'failed' && data.attempts >= 5)) {
        setMessage('Email was not sent. ' + (data.last_error || 'Sending was cancelled.'));
      } else {
        const retry = data.status === 'failed';
        setMessage(retry ? 'Email provider rejected this attempt. Retrying automatically. ' + (data.last_error || '') : 'Sending to ' + snapshot.recipient + '…');
        setPollAt(retry ? Math.max(Date.now() + 3000, Date.parse(data.next_attempt_at) + 1000) : Date.now() + 3000);
      }
    } catch (error) {
      if (request.current !== requestId) return;
      setJob(null);
      setMessage('Could not confirm sending. ' + error.message);
    }
  }
  async function run(action) {
    setBusy(action);
    try {
      if (action === 'download') {
        const { downloadInvoice } = await import('./lib/downloadInvoice.js');
        await downloadInvoice(statement, rental, rentalReference, preview.breakdown);
        setMessage('Invoice PDF downloaded.');
      } else if (action === 'preview') {
        setPollAt(null); setJob(null); request.current = '';
        setPreview(null);
        const { data, error } = await client.functions.invoke('send-emails/balance-preview', { body: { rentalId } });
        if (error) throw error;
        if (!data?.html || !data.statement) throw Error('The balance email preview could not be loaded.');
        request.current = crypto.randomUUID();
        setPreview(data); setMessage('');
      } else {
        setMessage('Sending to ' + statement.recipient + '…');
        await send(statement, request.current);
      }
    } catch (e) { setMessage(e.message); }
    finally { setBusy(''); }
  }
  return <div className="rental-card-supplement">
    <div className="balance-preview-controls">
      <button ref={previewButton} type="button" className="primary-btn" disabled={Boolean(busy)} aria-expanded={Boolean(statement)} onClick={() => run('preview')}>{busy === 'preview' ? 'Loading preview…' : 'Preview customer balance email'}</button>
      {statement && <button type="button" className="balance-preview-close" disabled={Boolean(busy)} onClick={() => {
        setPreview(null);
        request.current = ''; setPollAt(null); setJob(null);
        setMessage('');
        previewButton.current?.focus();
      }}>Close preview</button>}
    </div>
    {statement && <section aria-label="Customer balance email preview">
      <p>To {statement.recipient || 'Missing customer email'}</p>
      <iframe className="email-preview-frame" title="Customer balance email" sandbox="" referrerPolicy="no-referrer" srcDoc={preview.html}/>
      <div className="balance-preview-controls balance-invoice-actions">
        {!job && <button type="button" className="approve" disabled={busy || !statement.recipient || statement.due <= 0} onClick={() => run('send')}>Send balance to customer</button>}
        <button type="button" className="balance-preview-close" disabled={Boolean(busy)} onClick={() => run('download')}>{busy === 'download' ? 'Preparing PDF…' : 'Download invoice'}</button>
      </div>
    </section>}
    {message && <p role="status">{message}</p>}
  </div>;
}
