import { MoneyInput } from './MoneyInput.jsx';
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTaskDraft } from './useTaskDraft.js';
import { trackTaskDialog } from './lib/taskDraft.js';
import { buildPaymentAllocation, chargeRemainingCents } from './lib/paymentAllocation.js';
import './rental-ledger.css';
import './payment-receipts.css';
import { StripeAllocatedPayment } from './StripeAllocatedPayment.jsx';
const money = cents => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

export function FlexibleReceivePayment({ client, rental, charges = [], rentalDue, onRecord, onClose,
  initialChargeIds = [], canCollectRent = true, canManageCharges = true, stripeTargets = [], onStripeCreate, onStripeEmail, onStripeOpen, onStripeSavedCard, protectedDeposit = 0, initialTab = 'external' }) {
  const eligible = canManageCharges ? charges.filter(c => !['rental_amendment', 'rental_installment'].includes(c.charge_type) && chargeRemainingCents(c) > 0 && !c.payment_receipt_id && !c.external_toll_receipt_id && !c.checkout_creation_token) : [];
  const [tab, setTab] = useState(initialTab);
  const [state, setState] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [done, setDone] = useState(null);
  const [form, setForm, clearDraft] = useTaskDraft(`flex-payment:${rental.id}`, {
    amount: '0.00', rentalAmount: '0.00', allocationsJson: JSON.stringify(Object.fromEntries(eligible.filter(c => initialChargeIds.includes(c.id) || c.source_type === 'late_return' || ['late_fee', 'late_rental_day'].includes(c.charge_type)).map(c => [c.id, (chargeRemainingCents(c) / 100).toFixed(2)]))),
    funding: 'external', paymentMethod: 'cash_app', receivedDate: today(), receivedTime: '', reference: '', notes: '', receiptId: '', requestJson: '', confirmed: false,
  }, ['amount', 'rentalAmount', 'allocationsJson', 'funding', 'paymentMethod', 'receivedDate', 'receivedTime', 'reference', 'notes', 'receiptId', 'requestJson']);
  const dialog = useRef(null), submitLock = useRef(false);
  const pending = form.requestJson ? JSON.parse(form.requestJson) : null;
  const allocations = pending ? Object.fromEntries(pending.charges.map(c => [c.id, (c.amountCents / 100).toFixed(2)])) : JSON.parse(form.allocationsJson);
  const due = canCollectRent ? Math.round(Number(rentalDue || 0) * 100) : 0;
  const amount = pending?.amountCents ?? Math.round(Number(form.amount || 0) * 100);
  const rent = pending?.rentalAmountCents ?? Math.round(Number(form.rentalAmount || 0) * 100);
  const extras = Object.values(allocations).reduce((sum, v) => sum + Math.round(Number(v || 0) * 100), 0);
  const credit = amount - rent - extras;
  const funding = pending?.funding || form.funding;
  useEffect(() => trackTaskDialog(), []);
  useEffect(() => { const prior = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = prior; }; }, []);
  useEffect(() => { const previous = document.activeElement; dialog.current?.focus(); return () => previous?.focus?.(); }, []);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data, error } = await client.rpc('admin_flexible_payment_state', { p_rental_id: rental.id });
        if (error) throw error;
        if (data?.version !== 2) throw new Error('The payment service is not ready. Refresh and retry.');
        if (!active) return;
        const receipt = data.receipts?.find(r => r.id === form.receiptId) || data.receipts?.find(r => r.status === 'pending');
        if (receipt?.allocation_version === 1 && receipt.status === 'pending') throw new Error('Resume the existing external payment before starting a new allocation.');
        if (receipt && ['posted', 'refunded'].includes(receipt.status)) { setDone(receipt.result); clearDraft(); }
        else if (receipt?.status === 'pending' && receipt.funding_kind === 'stripe') setTab('stripe');
        else if (receipt?.status === 'pending') setForm(f => ({ ...f, receiptId: receipt.id, requestJson: JSON.stringify(receipt.request), confirmed: false }));
        else if (receipt?.status === 'cancelled') { clearDraft(); setForm(f => ({ ...f, receiptId: '', requestJson: '', confirmed: false })); }
        setState(data);
      } catch (e) { if (active) setError(e.message); }
    })();
    return () => { active = false; };
  }, [rental.id]);
  function change(key, value) { setError(''); setForm(f => ({ ...f, [key]: value, confirmed: false })); }
  function allocate(id, value) { const next = { ...allocations }; if (value === null) delete next[id]; else next[id] = value; change('allocationsJson', JSON.stringify(next)); }
  async function submit(event) {
    event.preventDefault(); if (tab !== 'external' || submitLock.current || !state || !form.confirmed) return;
    submitLock.current = true; setBusy(true); setError('');
    try {
      const request = pending || buildPaymentAllocation({ charges: eligible, rentalDueCents: due, availableCreditCents: state.availableCreditCents,
        form: { ...form, allocations } });
      if (request.creditAmountCents > 0 && !canCollectRent) throw new Error('Payment collection permission is required to retain excess money as credit.');
      const id = form.receiptId || crypto.randomUUID();
      setForm(f => ({ ...f, receiptId: id, requestJson: JSON.stringify(request), confirmed: false }));
      const result = await onRecord(rental.id, id, request, false);
      if (result.status === 'pending') { setState(s => ({ ...s, paymentUrl: result.url })); return; }
      setDone(result); clearDraft();
    } catch (e) { setError(e.message || 'Payment confirmation is pending. Resume this same payment.'); }
    finally { setBusy(false); submitLock.current = false; }
  }
  async function cancelPending() {
    if (submitLock.current) return; submitLock.current = true; setBusy(true); setError('');
    try {
      const result = await onRecord(rental.id, form.receiptId, pending, true);
      if (['posted', 'refunded'].includes(result.status)) { setDone(result); clearDraft(); }
      else { clearDraft(); onClose(); }
    } catch (e) { setError(e.message); } finally { setBusy(false); submitLock.current = false; }
  }
  function keyboard(e) {
    if (e.key === 'Escape' && !busy) { e.stopPropagation(); onClose(); }
    if (e.key === 'Tab') {
      const nodes = [...dialog.current.querySelectorAll('button,a[href],input,textarea,select')].filter(n => !n.disabled && n.getClientRects().length);
      const first = nodes[0], last = nodes.at(-1);
      if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }
  }
  return createPortal(<div className="admin-modal-backdrop rental-ledger-dialog-backdrop"><form className="admin-modal flexible-payment-dialog" ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="flex-payment-title" onSubmit={submit} onKeyDown={keyboard}>
    <header className="admin-modal-header"><div><strong id="flex-payment-title">Take Payment</strong><span>{rental.vehicles?.name} · {rental.profiles?.full_name}</span></div><button type="button" disabled={busy} onClick={onClose} aria-label="Close payment dialog">×</button></header>
    <div className="payment-dialog-scroll"><div className="rp-payment-tabs" role="tablist" aria-label="Payment method">{['external','stripe'].map(t => <button key={t} type="button" role="tab" aria-selected={tab === t} disabled={busy} onClick={() => setTab(t)}>{t === 'external' ? 'External payments' : 'Stripe payments'}</button>)}</div>
    <div role="tabpanel" aria-label="Stripe payments" hidden={tab !== 'stripe'}>
      <StripeAllocatedPayment client={client} rental={rental} charges={eligible} due={due} state={state} onBusyChange={setBusy} canCollectRent={canCollectRent} onCollect={onRecord ? (id,request,action)=>onRecord(rental.id,id,request,action) : undefined} onEmail={onStripeEmail} onRefresh={async()=>{const {data,error}=await client.rpc('admin_flexible_payment_state',{p_rental_id:rental.id});if(error)throw error;setState(data);}}/>

    </div>
    <div role="tabpanel" aria-label="External payments" hidden={tab !== 'external'}>
    {done ? <><p role="status">{done.status === 'refunded' ? 'This receipt has already been reversed.' : `${money(done.amountCents)} ${done.funding === 'credit' ? 'credit applied' : 'recorded'}. ${money(done.availableCreditCents || 0)} customer credit available.`}</p><button type="button" onClick={onClose}>Done</button></> : <>
      {!state && !error && <p role="status">Checking balances and unfinished payments…</p>}
      {state?.receipts?.some(r=>r.status==='pending'&&r.funding_kind==='stripe') && <p role="status">A Stripe payment is pending. Check or cancel it in the Stripe payments tab before recording external money.</p>}
      {pending && <p role="status">This payment is awaiting confirmation. Resume the same payment to check its result.</p>}
      <fieldset disabled={tab !== 'external' || busy || !!pending || !state || state.receipts?.some(r=>r.status==='pending'&&r.funding_kind==='stripe')} className="flexible-payment-fields">
        <label>Collection method<select value={funding} onChange={e => change('funding', e.target.value)}><option value="external">Record external payment</option>{canCollectRent && <option value="credit">Apply customer credit</option>}</select></label>
        <label>{funding === 'credit' ? 'Credit to apply' : 'Payment amount'}<MoneyInput type="number" inputMode="decimal" min="0.01" step="0.01" required value={pending ? (amount / 100).toFixed(2) : form.amount} onChange={e => change('amount', e.target.value)}/></label>
        <p className="allocation-explanation">Enter the full payment, even if it exceeds the balance due. Choose charges below and edit how much goes to each. Unallocated money stays as customer credit for this rental.</p>
        <div className="allocation-table"><div className="allocation-table-heading"><span>Apply to</span><span>Outstanding</span><span>Amount to apply</span></div>
          {canCollectRent && <div className="allocation-row"><label><input type="checkbox" checked={rent > 0} onChange={e => change('rentalAmount', e.target.checked ? (due / 100).toFixed(2) : '')}/>Rental balance</label><span>{money(due)}</span><MoneyInput aria-label="Amount toward rental" type="number" inputMode="decimal" min="0" max={due / 100} step="0.01" value={pending ? (rent / 100).toFixed(2) : form.rentalAmount} onChange={e => change('rentalAmount', e.target.value)}/></div>}
          {eligible.some(c => c.charge_type === 'toll') && <label className="allocation-select-tolls"><input type="checkbox" checked={eligible.filter(c => c.charge_type === 'toll').every(c => Object.hasOwn(allocations, c.id))} onChange={e => {
            const next = { ...allocations }; for (const c of eligible.filter(c => c.charge_type === 'toll')) { if (e.target.checked) next[c.id] = (chargeRemainingCents(c) / 100).toFixed(2); else delete next[c.id]; } change('allocationsJson', JSON.stringify(next));
          }}/>Select all tolls</label>}
          {eligible.map(c => <div className="allocation-row" key={c.id}><label><input type="checkbox" checked={Object.hasOwn(allocations, c.id)} onChange={e => allocate(c.id, e.target.checked ? (chargeRemainingCents(c) / 100).toFixed(2) : null)}/>{c.name}</label><span>{money(chargeRemainingCents(c))}</span><MoneyInput aria-label={`Amount toward ${c.name}`} disabled={!Object.hasOwn(allocations, c.id)} type="number" inputMode="decimal" min="0.01" max={chargeRemainingCents(c) / 100} step="0.01" value={allocations[c.id] ?? ''} onChange={e => allocate(c.id, e.target.value)}/></div>)}
        </div>
        {funding === 'external' && <><label>Payment method<select value={pending?.paymentMethod || form.paymentMethod} onChange={e => change('paymentMethod', e.target.value)}>{[['cash_app','Cash App'],['cash','Cash'],['terminal','Card terminal'],['card','Card collected externally'],['bank_transfer','Bank transfer'],['other','Other']].map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Date received<input required type="date" max={today()} value={pending?.receivedDate || form.receivedDate} onChange={e => change('receivedDate', e.target.value)}/></label><label>Time received (Eastern, optional)<input type="time" value={pending?.receivedTime ?? form.receivedTime} onChange={e => change('receivedTime', e.target.value)}/></label></>}
        <label>Reference<input maxLength={120} value={pending?.reference ?? form.reference} onChange={e => change('reference', e.target.value)}/></label><label className="allocation-explanation">Staff notes<textarea maxLength={2000} value={pending?.notes ?? form.notes} onChange={e => change('notes', e.target.value)}/></label>
      </fieldset>
      <dl className="allocation-review" aria-live="polite"><dt>Payment / credit amount</dt><dd>{money(amount || 0)}</dd><dt>Applied to rental</dt><dd>{money(rent || 0)}</dd><dt>Applied to selected charges</dt><dd>{money(extras || 0)}</dd><dt>{credit < 0 ? 'Overallocated by' : 'Unallocated customer credit'}</dt><dd className={credit < 0 ? 'form-error' : ''}>{money(Math.abs(credit) || 0)}</dd><dt>Rental balance after allocation</dt><dd>{money(Math.max(0, due - rent))}</dd><dt>Current available credit</dt><dd>{money(state?.availableCreditCents || 0)}</dd></dl>
      {state?.paymentUrl && <p><a href={state.paymentUrl} target="_blank" rel="noopener noreferrer">Open secure Stripe payment link</a></p>}
      <label className="external-payment-confirmation"><input type="checkbox" checked={form.confirmed} disabled={busy || !state} onChange={e => setForm(f => ({ ...f, confirmed: e.target.checked }))}/>{funding === 'external' ? 'I confirm this money was received and cleared, and these allocations are correct.' : funding === 'credit' ? 'I confirm the credit allocations. No new money is being received.' : 'I confirm the amount and allocations for this Stripe payment.'}</label>
      <div className="modal-actions"><button type="button" disabled={busy} onClick={pending ? cancelPending : onClose}>{pending ? 'Cancel pending payment' : 'Cancel'}</button><button className="approve" disabled={busy || !state || !form.confirmed || credit < 0 || state.receipts?.some(r=>r.status==='pending'&&r.funding_kind==='stripe')}>{busy ? 'Checking payment…' : pending ? 'Resume payment' : funding === 'credit' ? 'Apply credit' : funding === 'external' ? 'Record payment' : funding === 'stripe_link' ? 'Create payment link' : 'Charge saved card'}</button></div>
    </>}</div>{error && <p className="form-error" role="alert">{error}</p>}
  </div></form></div>, document.body);
}
