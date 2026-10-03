import React from 'react';
import { RENTAL_PAGE_SIZE } from './lib/rentalWorkspace.js';

export function rentalSummaryReasons(row) {
  return [
    row.status === 'return_initiated' ? 'Return inspection needed' : row.overdue ? 'Return overdue' : '',
    row.payment_status !== 'paid' ? 'Payment needs attention' : '',
    row.outstanding_charge ? 'Outstanding charges' : '',
    row.open_extension ? 'Extension awaiting action' : '',
    row.open_report ? 'Open incident report' : '',
    row.emergency ? 'Emergency override active' : '',
    !row.terminal && !row.vehicle_out && !row.release_ready ? 'Pickup requirements incomplete' : '',
  ].filter(Boolean);
}

export function RentalSummaryList({ manager, filter, money, formatDate }) {
  const { rows, loading, error, offset, total } = manager;
  return <section aria-label="Rental results" aria-busy={loading}>
    {error && <p role="alert" className="form-error">{error} <button type="button" onClick={manager.retry}>Retry rentals</button></p>}
    {loading && <p role="status" className="muted">{rows.length ? 'Updating rentals…' : 'Loading rentals…'}</p>}
    {!loading && !error && !rows.length && <p className="muted">No rentals match this view.</p>}
    <div className="table-list">
      {rows.map((row) => <article className="data-row rental-row rental-operations-card is-collapsed" key={row.id}>
        <header className="rental-card-header">
          <div className="rental-card-identity">
            <div className="rental-card-title-line"><strong>{row.vehicle_name || 'Vehicle'} <span>#{row.id.slice(0, 6).toUpperCase()}</span></strong></div>
            <span className="rental-card-customer">{row.customer_name}</span>
            <span className="rental-card-schedule">{formatDate(row.pickup_date, row.pickup_time)} → {formatDate(row.return_date, row.return_time)}</span>
            <span className="rental-card-price-line">{money(row.rental_total)} rental · {money(row.security_deposit)} refundable deposit</span>
          </div>
          <div className="rental-card-command">
            <span className="workflow-badge">{String(row.status || 'pending').replaceAll('_', ' ')}</span>
            {filter === 'needs_action' && <small>{rentalSummaryReasons(row).join(' · ')}</small>}
            <button type="button" className="primary-btn" onClick={() => manager.open(row.id)} disabled={manager.selectedId === row.id && manager.detailLoading}>
              {manager.selectedId === row.id ? 'Refresh rental details' : 'Open rental'}
            </button>
          </div>
        </header>
      </article>)}
    </div>
    {total > RENTAL_PAGE_SIZE && <div className="focused-rental-actions" aria-label="Rental pages">
      <button type="button" className="secondary-btn" disabled={loading || offset === 0} onClick={() => manager.setOffset(Math.max(0, offset - RENTAL_PAGE_SIZE))}>Previous</button>
      <span>{offset + 1}–{Math.min(offset + rows.length, total)} of {total}</span>
      <button type="button" className="secondary-btn" disabled={loading || offset + RENTAL_PAGE_SIZE >= total} onClick={() => manager.setOffset(offset + RENTAL_PAGE_SIZE)}>Next 25</button>
    </div>}
  </section>;
}
