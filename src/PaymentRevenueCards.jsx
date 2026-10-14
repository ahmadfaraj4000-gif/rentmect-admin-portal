import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Banknote } from 'lucide-react';
import { supabase } from './lib/supabase.js';
import { calculatePaymentRevenue, canViewRevenue, loadPaymentRevenue } from './lib/paymentRevenue.js';

const money = (value) => Number(value).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
export function RevenueCardsView({ report, loading, error, onRetry, onOpenRental }) {
  const needsReview = Boolean(report?.issues.length);
  const value = (period) => !report ? loading ? 'Loading…' : 'Unavailable' : money(report[period]);
  return <>
    {[['month', 'Made This Month', CalendarDays, report?.monthLabel], ['year', 'Made This Year', Banknote, report?.yearLabel]].map(([period, label, Icon, dates]) => (
      <div className="metric-card revenue-metric" key={period} aria-describedby="payment-revenue-explanation">
        <Icon size={20}/><span>{label}</span><strong>{value(period)}</strong>
        <small>{needsReview ? 'Provisional · ' : ''}Excluding deposits{dates ? ` · ${dates}` : ''}</small>
      </div>
    ))}
    <div className="payment-revenue-explanation" id="payment-revenue-explanation">
      <p>Rentals, extensions, late fees and other paid charges, after refunds. Excludes refundable deposits and sales tax; includes deposits applied to balances or fees. Before business expenses and processing fees.</p>
      <small>Calendar month and year to date · Connecticut time · Where receipts lack a tax breakdown, tax is estimated proportionally from recorded invoice amounts.</small>
      {loading && report && <p role="status">Updating totals…</p>}
      {error && <p role="alert">Totals could not be verified. {error} <button type="button" onClick={onRetry}>Retry totals</button></p>}
      {needsReview && <details className="revenue-review"><summary>Provisional totals — {report.issues.length} {report.issues.length === 1 ? 'record needs' : 'records need'} review</summary><p>Some records could not be fully reconciled. These totals include only the amounts that could be classified; they may be incomplete.</p><ul>{report.issues.slice(0, 20).map((issue, index) => <li key={index}>{issue.reason}{issue.rentalId && onOpenRental && <> <button type="button" onClick={() => onOpenRental(issue.rentalId)}>Review rental</button></>}</li>)}</ul>{report.issues.length > 20 && <p>Additional records also need review.</p>}</details>}
    </div>
  </>;
}
export function PaymentRevenueCards({ accountEmail, refreshKey, onOpenRental }) {
  const allowed = canViewRevenue(accountEmail);
  const [state, setState] = useState({ data: null, loading: true, error: '' });
  const [revision, setRevision] = useState(0);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!allowed) return;
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, [allowed]);
  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    let active = true;
    let deadline;
    // Coalesce the separate ledger updates from one payment into one read.
    const timer = setTimeout(async () => {
      setState((current) => ({ ...current, loading: true, error: '' }));
      deadline = setTimeout(() => controller.abort(), 60_000);
      try {
        const data = await loadPaymentRevenue(supabase, controller.signal);
        if (active) { setNow(new Date()); setState({ data, loading: false, error: '' }); }
      } catch (error) {
        if (active) setState({ data: null, loading: false, error: controller.signal.aborted ? 'Loading took too long. Please retry.' : error.message });
      } finally {
        clearTimeout(deadline);
        controller.abort();
      }
    }, 350);
    return () => { active = false; clearTimeout(timer); clearTimeout(deadline); controller.abort(); };
  }, [allowed, refreshKey, revision]);
  const report = useMemo(() => state.data ? calculatePaymentRevenue(state.data, now) : null, [state.data, now]);
  if (!allowed) return null;
  return <RevenueCardsView report={report} loading={state.loading} error={state.error} onRetry={() => setRevision((value) => value + 1)} onOpenRental={onOpenRental}/>;
}
