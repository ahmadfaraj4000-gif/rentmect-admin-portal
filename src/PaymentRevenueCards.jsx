import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Banknote } from 'lucide-react';
import { supabase } from './lib/supabase.js';
import { calculatePaymentRevenue, canViewRevenue, loadPaymentRevenue } from './lib/paymentRevenue.js';

const money = (value) => Number(value).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
export function RevenueCardsView({ report, loading, error, onRetry, onOpenRental, reconciliation = [] }) {
  // Keep a single review entry per rental/reason; match provider records to
  // the same revenue issue instead of warning twice about the same refund.
  const items = [...new Map((report?.issues || []).map((item) => [`${item.recordId || item.rentalId}:${item.kind || item.reason}`, item])).values()];
  const matches = (item, event) => item.refundId && event.refundId ? item.refundId === event.refundId
    : item.rentalId === event.rentalId && item.amount === event.amount;
  for (const event of reconciliation) {
    const date = new Date(event.date || 'invalid');
    const parts = Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit' }).formatToParts(date) : null;
    const key = parts ? ['year', 'month'].map((part) => parts.find((value) => value.type === part).value).join('-') : null;
    const periods = !key || !report?.monthKey ? ['month', 'year'] : key.slice(0, 4) !== report.yearLabel ? [] : key === report.monthKey ? ['month', 'year'] : ['year'];
    if (!items.some((item) => matches(item, event))) items.push({ rentalId: event.rentalId, recordId: event.id, refundId: event.refundId, reason: 'This payment record needs checking against Stripe.', date: event.date, amount: event.amount, kind: 'provider_review', periods });
  }
  const affected = (period) => items.some((item) => !item.periods || item.periods.includes(period));
  const refundOnly = items.length > 0 && items.every((item) => item.kind === 'refund_category');
  const scope = affected('month') ? 'Revenue totals' : 'Year total';
  const value = (period) => !report ? loading ? 'Loading…' : 'Unavailable' : money(report[period]);
  return <>
    {[['month', 'Made This Month', CalendarDays, report?.monthLabel], ['year', 'Made This Year', Banknote, report?.yearLabel]].map(([period, label, Icon, dates]) => (
      <div className="metric-card revenue-metric" key={period} aria-describedby="payment-revenue-explanation">
        <Icon size={20}/><span>{label}</span><strong>{value(period)}</strong>
        <small>{report && affected(period) ? 'Estimate · ' : ''}Excluding deposits{dates ? ` · ${dates}` : ''}</small>
      </div>
    ))}
    <div className="payment-revenue-explanation" id="payment-revenue-explanation">
      <p>Paid rentals, extensions and fees, after refunds. Excludes refundable deposits and sales tax.</p>
      <details className="revenue-calculation"><summary>How these totals are calculated</summary>
        <p>Includes late fees, other paid charges and deposits applied to balances or fees. Before business expenses and processing fees.</p>
        <p>Calendar month and year to date · Connecticut time. Where receipts lack a tax breakdown, tax is estimated proportionally from recorded invoice amounts.</p>
      </details>
      {loading && report && <p role="status">Updating totals…</p>}
      {error && <p role="alert">Revenue totals are temporarily unavailable. <button type="button" onClick={onRetry}>Retry totals</button></p>}
      {items.length > 0 && <details className="revenue-review"><summary>{(affected('month') || affected('year')) && <>{scope} {affected('month') ? 'are estimates' : 'is an estimate'} — </>}{items.length} {refundOnly ? items.length === 1 ? 'refund needs a category' : 'refunds need a category' : items.length === 1 ? 'payment record to check' : 'payment records to check'}</summary>
        <p>{refundOnly ? 'These refunds have not been marked as deposit returns or rental refunds. The affected totals may change once their categories are confirmed.' : 'The affected totals may be incomplete until these payment records are checked.'}</p>
        <ul>{items.slice(0, 20).map((item, index) => {
          const match = reconciliation.find((event) => matches(item, event));
          return <li key={index}><span>{match?.customer && <strong>{match.customer} · </strong>}{item.amount != null && <strong>{money(item.amount)} · </strong>}{item.date && new Date(item.date).toLocaleDateString('en-US', { timeZone: 'America/New_York' })}<br/>{item.kind === 'refund_category' ? 'Refund category not recorded.' : item.reason}</span>{item.rentalId && onOpenRental && <button type="button" onClick={() => onOpenRental(item.rentalId)}>View rental</button>}</li>;
        })}</ul>
        {items.length > 20 && <p>Additional payment records also need checking.</p>}
      </details>}
    </div>
  </>;
}
export function PaymentRevenueCards({ accountEmail, refreshKey, onOpenRental, reconciliation }) {
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
  return <RevenueCardsView report={report} loading={state.loading} error={state.error} onRetry={() => setRevision((value) => value + 1)} onOpenRental={onOpenRental} reconciliation={reconciliation}/>;
}
