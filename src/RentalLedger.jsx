import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { trackTaskDialog } from './lib/taskDraft.js';
import './rental-ledger.css';

export function RentalLedger({ id, payments, charges, activity, totals }) {
  const [tab, setTab] = useState('payments');
  const tabs = ['payments', 'charges', 'activity'];
  const label = value => value[0].toUpperCase() + value.slice(1);
  return <section className="rental-ledger-workspace" aria-label="Rental ledger">
    <div className="rental-ledger-tabs" role="tablist" aria-label="Rental records">{tabs.map(value => <button key={value} type="button" role="tab" id={`${id}-${value}-tab`} aria-controls={`${id}-${value}-panel`} aria-selected={tab === value} tabIndex={tab === value ? 0 : -1} onClick={() => setTab(value)} onKeyDown={e => {
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) return;
      e.preventDefault(); const next = e.key === 'Home' ? tabs[0] : e.key === 'End' ? tabs.at(-1) : tabs[(tabs.indexOf(value) + (e.key === 'ArrowRight' ? 1 : 2)) % 3];
      setTab(next); document.getElementById(`${id}-${next}-tab`)?.focus();
    }}>{label(value)}</button>)}</div>
    {tabs.map(value => <div key={value} className="rental-ledger-scroll" role="tabpanel" id={`${id}-${value}-panel`} aria-labelledby={`${id}-${value}-tab`} hidden={tab !== value} tabIndex={0}>{({ payments, charges, activity })[value]}</div>)}
    <div className="rental-ledger-totals">{totals}</div>
  </section>;
}

export function RentalReceiptDialog({ title = 'Payment details', onClose, children }) {
  const dialog = useRef(null);
  useEffect(() => trackTaskDialog(), []);
  useEffect(() => { const prior = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = prior; }; }, []);
  useEffect(() => { const previous = document.activeElement; dialog.current?.focus(); return () => previous?.focus?.(); }, []);
  return createPortal(<div className="admin-modal-backdrop rental-ledger-dialog-backdrop"><section className="admin-modal rental-receipt-dialog" ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} onKeyDown={e => {
    if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    if (e.key === 'Tab') {
      const nodes = [...dialog.current.querySelectorAll('button,input,textarea,select,a[href],summary')].filter(n => !n.disabled && n.getClientRects().length);
      const first = nodes[0], last = nodes.at(-1);
      if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }
  }}><header className="admin-modal-header"><strong>{title}</strong><button type="button" onClick={onClose} aria-label="Close payment details">×</button></header>{children}</section></div>, document.body);
}
