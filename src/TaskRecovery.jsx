import React, { useEffect, useState } from 'react';
import { portalTransport, supabase } from './lib/supabase.js';
import { withReadRetry } from './requestDeadline.js';

export function TaskRecovery() {
  const [pending, setPending] = useState(portalTransport.snapshot);
  const [checks, setChecks] = useState({});
  const [expanded, setExpanded] = useState(true);
  useEffect(() => portalTransport.subscribe(entries => {
    setPending(entries);
    setChecks({});
  }), []);
  if (!pending.length) return null;
  async function check(entry) {
    setChecks(current => ({ ...current, [entry.key]: { busy: true } }));
    const { data, error } = await withReadRetry(() => entry.rentalId
      ? supabase.rpc('admin_rental_detail', { p_rental_id: entry.rentalId })
      : entry.chargeId
        ? supabase.from('rental_charge_items').select('status,total_amount,paid_at').eq('id', entry.chargeId).single()
        : supabase.rpc('get_admin_dashboard_snapshot'), 'Check saved result');
    const rental = data?.rental;
    const summary = rental ? `Rental: ${rental.status}. Payment: ${rental.payment_status}.`
      : entry.chargeId && data ? `Charge: ${data.status}. Amount: $${Number(data.total_amount || 0).toFixed(2)}.`
        : 'The connection is working. Open the relevant record to review the saved result.';
    setChecks(current => ({ ...current, [entry.key]: { busy: false,
      error: error?.message || (!data ? 'No saved record was returned. Try checking again.' : ''), summary,
      checked: !error && Boolean(data) } }));
  }
  return <aside className="task-recovery" aria-label="Task recovery" role="status">
    <strong>A task needs its saved result checked</strong>
    <button type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? 'Minimize' : 'Review task'}</button>
    {expanded && <>
    <p>Your work can stay open. A response was interrupted; the change may already have completed. Nothing will be submitted again automatically.</p>
    {pending.map(entry => {
      const result = checks[entry.key] || {};
      return <div key={entry.key} className="task-recovery-item">
        <span>{entry.label}</span>
        <button type="button" disabled={result.busy} onClick={() => check(entry)}>{result.busy ? 'Checking…' : 'Check saved result'}</button>
        {result.error && <p role="alert">{result.error}</p>}
        {result.checked && <>
          <p>{result.summary} Check the latest payment history or saved changes before repeating this task. A pending payment may still finish.</p>
          <button type="button" onClick={() => portalTransport.acknowledge(entry.key)}>I’ve verified the outcome</button>
        </>}
      </div>;
    })}</>}
  </aside>;
}
