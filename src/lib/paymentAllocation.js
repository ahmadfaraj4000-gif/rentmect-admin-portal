import { paymentCents } from './externalPayment.js';

export function chargeRemainingCents(charge) {
  if (charge.included_in_initial_payment || ['paid', 'waived', 'cancelled'].includes(charge.status)) return 0;
  return Math.max(0, paymentCents(Number(charge.total_amount || 0).toFixed(2))
    - Number(charge.allocated_payment_cents || 0) - Number(charge.allocated_waiver_cents || 0) - Number(charge.allocated_deposit_cents || 0));
}
export const chargeRemaining = charge => chargeRemainingCents(charge) / 100;
export const chargePaid = charge => charge.allocated_payment_cents != null && Number(charge.allocated_payment_cents) > 0
  ? Number(charge.allocated_payment_cents) / 100
  : charge.status === 'paid' ? Number(charge.payment_amount_cents ?? Math.round(Number(charge.total_amount || 0) * 100)) / 100 : 0;

// Explicit allocations never change when staff changes the received amount.
// Checkbox defaults are a convenience; both client and server validate cents.
export function buildPaymentAllocation({ charges = [], rentalDueCents, availableCreditCents = 0, form }) {
  const amountCents = paymentCents(form.amount);
  const rentalAmountCents = paymentCents(form.rentalAmount || '0');
  const funding = form.funding || 'external';
  if (!['external', 'credit', 'stripe_link', 'saved_card'].includes(funding)) throw new Error('Choose a collection method.');
  if (!amountCents) throw new Error('Enter an amount greater than zero.');
  if (!Number.isSafeInteger(rentalDueCents) || rentalAmountCents > rentalDueCents) throw new Error('Rental allocation exceeds the remaining rental balance.');
  const selected = form.allocations || {};
  const allocations = Object.entries(selected).filter(([, value]) => value !== null).map(([id, value]) => {
    const charge = charges.find(item => item.id === id);
    if (!charge || ['rental_amendment', 'rental_installment'].includes(charge.charge_type) || charge.checkout_creation_token
      || charge.payment_receipt_id || charge.external_toll_receipt_id || !['pending', 'failed', 'checkout_open'].includes(charge.status)) {
      throw new Error('A selected charge changed. Refresh the rental.');
    }
    const amount = paymentCents(value || '0');
    const remaining = chargeRemainingCents(charge);
    if (!amount || amount > remaining) throw new Error(`Enter an allocation between $0.01 and $${(remaining / 100).toFixed(2)} for ${charge.name || 'this charge'}.`);
    return { id, amountCents: amount, expectedRemainingCents: remaining };
  }).sort((a, b) => a.id.localeCompare(b.id));
  if (allocations.length > 500) throw new Error('Select up to 500 charges.');
  const allocatedCents = rentalAmountCents + allocations.reduce((sum, item) => sum + item.amountCents, 0);
  if (allocatedCents > amountCents) throw new Error('Allocations exceed the payment amount. Increase the amount or reduce the allocations.');
  const creditAmountCents = amountCents - allocatedCents;
  if (funding === 'credit' && (amountCents > availableCreditCents || creditAmountCents !== 0)) {
    throw new Error('Allocate the credit amount in full, within the available customer credit.');
  }
  if (!form.confirmed) throw new Error('Review and confirm the payment.');
  if (funding === 'external' && !form.receivedDate) throw new Error('Choose the received date.');
  return { kind: 'rental_payment', version: 2, funding, charges: allocations, amountCents, rentalAmountCents,
    creditAmountCents, expectedRentalDueCents: rentalDueCents, paymentMethod: form.paymentMethod || 'other',
    receivedDate: form.receivedDate, receivedTime: form.receivedTime || '', reference: (form.reference || '').trim(), notes: (form.notes || '').trim() };
}

export function receiptHistory(receipts = [], allocations = []) {
  return receipts.filter(r => ['posted', 'refunded'].includes(r.status) && r.allocation_version === 2).flatMap(r => {
    const payment = {
    id: `flex-receipt-${r.id}`, correctableReceiptId: r.id, flexibleReceipt: true,
    amount: r.amount_cents / 100, date: r.posted_at, receivedDate: r.received_date, receivedTime: r.received_time,
    provider: r.funding_kind === 'credit' ? 'credit' : r.funding_kind === 'stripe' ? 'stripe' : 'external',
    label: r.funding_kind === 'credit' ? 'Customer credit applied · no new money received' : 'Payment received',
    method: r.payment_method, reference: r.reference, notes: r.notes, creditAmount: r.credit_amount_cents / 100,
    status: r.status, refundBlockReason: r.refund_block_reason || '', allocations: allocations.filter(a => a.receipt_id === r.id).map(a => ({ id: a.charge_id,
      label: a.snapshot?.name || 'Rental', amount: a.amount_cents / 100 })),
    };
    return r.status === 'refunded' ? [payment, { ...payment, id: `flex-refund-${r.id}`, correctableReceiptId: null,
      amount: payment.amount, creditAmount: 0, kind: 'refund', status: 'succeeded', moneyReturned: r.funding_kind !== 'credit', date: r.refunded_at, receivedDate: null, receivedTime: null,
      label: r.funding_kind === 'credit' ? 'Credit application reversed · no money returned' : 'Payment refunded',
      allocations: payment.allocations.map(a => ({ ...a, amount: -a.amount })), refund: true }] : [payment];
  });
}

// This reader remains active when new intake is disabled during a rollback.
export async function readFlexiblePaymentActivity(client) {
  const result = await client.rpc('admin_flexible_payment_activity');
  if (['PGRST202', '42883'].includes(result.error?.code)) return { data: [], error: null };
  return result;
}

export function flexibleCashEvents(receipts, contextFor) {
  return receipts.filter(r => ['posted', 'refunded'].includes(r.status)).flatMap(r => {
    const credit = r.funding_kind === 'credit';
    const event = { id: `flex-cash-${r.id}`, rentalId: r.rental_id, ...contextFor(r, r.rental_id),
      type: 'payment', typeLabel: credit ? 'Credit applied' : 'Payment received', statusGroup: 'paid',
      displayStatus: credit ? 'credit applied' : 'paid', fundingKind: r.funding_kind, amount: r.amount_cents / 100,
      cashImpact: credit ? 0 : r.amount_cents / 100, outstandingAmount: 0,
      detail: `${credit ? 'Existing customer credit; no new money received' : 'Allocated payment'}${r.credit_amount_cents ? ` · $${(r.credit_amount_cents / 100).toFixed(2)} retained as credit` : ''}`,
      date: r.posted_at, receivedDate: r.received_date, receivedTime: r.received_time };
    return r.status === 'refunded' ? [event, { ...event, id: `flex-cash-refund-${r.id}`, type: 'refund',
      typeLabel: credit ? 'Credit application reversed' : 'Payment refunded', statusGroup: 'refunded', displayStatus: 'refunded',
      amount: -event.amount, cashImpact: -event.cashImpact, date: r.refunded_at, receivedDate: null, receivedTime: null }] : [event];
  });
}
