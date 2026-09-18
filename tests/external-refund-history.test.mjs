import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
const code = source.slice(source.indexOf('function externalPaymentMethodLabel('), source.indexOf('\nfunction RentalPaymentHistory('));
const context = vm.createContext({ normalizeLedgerStatus: (s) => s, prettyStatus: (s) => s, money: (n) => `$${Number(n).toFixed(2)}` });
vm.runInContext(code, context);
const booking = { id: 'booking', deposit_status: 'held', deposit_released_amount: 282.04, security_deposit: 300, updated_at: '2026-09-17T19:58:33Z' };
const action = { id: 'record', action_type: 'refund', amount: 700, deposit_amount_returned: 282.04,
  created_at: '2026-08-28T23:16:44Z', created_by: 'staff-id', reason: 'no card Attached', original_method: 'other',
  recorded_by_profile: { email: 'staff@example.com' } };
function history(rental = booking, actions = [action], allocations = [{ id: 'held', status: 'held', payment_provider: 'stripe', amount_held: 300, amount_released: 0 }]) {
  return context.buildRentalPaymentHistory(rental, [], [], [], 0, actions, [], allocations);
}
test('old external refund is shown once with its original date, author, reason and deposit portion', () => {
  const rows = history();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].amount, 700);
  assert.equal(rows[0].date, action.created_at);
  assert.equal(rows[0].statusLabel, 'Recorded externally');
  assert.match(rows[0].method, /staff@example.com/);
  assert.match(rows[0].method, /Reason: no card Attached/);
  assert.match(rows[0].method, /Includes \$282.04 deposit portion/);
  assert.equal(rows.some((r) => r.status === 'pending'), false);
});
test('editing a booking does not change the recorded refund date', () => {
  assert.equal(history({ ...booking, updated_at: '2030-01-01' })[0].date, action.created_at);
});
test('unexplained legacy totals require review instead of claiming a new pending refund', () => {
  const rows = history(booking, [], []);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'review');
  assert.equal(rows[0].date, null);
  assert.equal(rows[0].moneyReturned, false);
});
test('a real pending Stripe allocation remains visible alongside the separate external refund', () => {
  const rows = history(booking, [action], [{ id: 'stripe', status: 'release_pending', payment_provider: 'stripe', amount_held: 300, amount_released: 0, refund_id: 're_real', refund_requested_at: '2026-09-17T20:00:00Z', updated_at: '2026-09-18T20:00:00Z' }]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].amount, 300);
  assert.equal(rows[0].status, 'pending');
  assert.equal(rows[0].provider, 'stripe');
  assert.equal(rows[1].amount, 700);
});
test('legacy completed refunds retain their actual release date', () => {
  const rows = history({ ...booking, deposit_status: 'released', deposit_released_at: '2026-08-30T12:00:00Z' }, [], []);
  assert.equal(rows[0].status, 'succeeded');
  assert.equal(rows[0].date, '2026-08-30T12:00:00Z');
});
test('missing staff profile preserves the recorded account identifier', () => {
  assert.match(history(booking, [{ ...action, recorded_by_profile: null }])[0].method, /Recorded under: staff-id/);
});


test('current allocations take precedence over a stale rental aggregate', () => {
  assert.equal(history(booking, []).length, 0);
});
test('an external receipt deposit portion is not counted again as an allocation refund', () => {
  const rows = history(booking, [action], [{ id: 'local', status: 'released', payment_provider: 'local',
    amount_held: 282.04, amount_released: 282.04, external_receipt_refunded_amount: 282.04 }]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].amount, 700);
});
test('completed deposit refunds keep their event date after later allocation edits', () => {
  const rows = history(booking, [], [{ id: 'stripe', status: 'released', payment_provider: 'stripe',
    amount_held: 300, amount_released: 300, refund_id: 're_confirmed',
    refund_completed_at: '2026-08-30T12:00:00Z', updated_at: '2026-09-17T20:00:00Z' }]);
  assert.equal(rows[0].date, '2026-08-30T12:00:00Z');
  assert.equal(rows[0].status, 'succeeded');
});

const eventCode = source.slice(source.indexOf('function buildPaymentEvents('), source.indexOf('function paymentEventMatchesFilter('));
Object.assign(context, { normalizePaymentStatus: (s) => s, paymentSourceDetail: () => '', shortPaymentReference: (s) => s || '', formatRentalDate: () => '' });
vm.runInContext(eventCode, context);
test('Payments view and booking ledger agree: one external refund, no invented pending deposit', () => {
  const events = context.buildPaymentEvents({ rentals: [booking],
    externalPaymentActions: [{ ...action, rental_id: 'booking' }],
    depositAllocations: [{ id: 'held', holder_rental_id: 'booking', status: 'held', amount_held: 300, amount_released: 0 }] });
  const refunds = events.filter((event) => event.type === 'refund');
  assert.equal(refunds.length, 1);
  assert.equal(refunds[0].amount, -700);
  assert.equal(refunds[0].date, action.created_at);
});
test('Payments view does not double-count a deposit returned inside an external receipt', () => {
  const events = context.buildPaymentEvents({ rentals: [booking], externalPaymentActions: [{ ...action, rental_id: 'booking' }],
    depositAllocations: [{ id: 'local', holder_rental_id: 'booking', status: 'released', payment_provider: 'local',
      amount_held: 282.04, amount_released: 282.04, external_receipt_refunded_amount: 282.04 }] });
  assert.equal(events.filter((event) => event.type === 'refund').length, 1);
});

test('deposit-applied fuel is not new cash and pending refund displays only the remainder', () => {
 const fuel={id:'fuel',rental_id:'booking',charge_type:'fuel',name:'Fuel',status:'paid',payment_provider:'deposit',payment_amount_cents:0,total_amount:56.38,paid_at:'2026-09-18T19:00:00Z'};
 const allocations=[{id:'a',holder_rental_id:'booking',status:'release_pending',payment_provider:'stripe',amount_held:300,amount_applied:56.38,amount_released:0,refund_reserved_amount:243.62,refund_requested_at:'2026-09-18T19:00:00Z'}];
 const history=context.buildRentalPaymentHistory({...booking,deposit_released_amount:0},[],[fuel],[],0,[],[],allocations);
 assert.equal(history.find(x=>x.kind==='refund').amount,243.62);
 assert.equal(history.find(x=>x.provider==='deposit').amount,56.38);
 const events=context.buildPaymentEvents({rentals:[{...booking,deposit_released_amount:0}],rentalCharges:[fuel],depositAllocations:allocations});
 assert.equal(events.find(x=>x.id==='charge-fuel').cashImpact,0);
 assert.equal(events.find(x=>x.id==='charge-fuel').outstandingAmount,0);
});
