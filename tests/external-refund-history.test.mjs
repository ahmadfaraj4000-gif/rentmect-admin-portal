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
  const rows = history(booking, []);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'review');
  assert.equal(rows[0].date, null);
  assert.equal(rows[0].moneyReturned, false);
});
test('a real pending Stripe allocation remains visible alongside the separate external refund', () => {
  const rows = history(booking, [action], [{ id: 'stripe', status: 'release_pending', payment_provider: 'stripe', amount_held: 300, amount_released: 0, refund_id: 're_real', updated_at: '2026-09-17T20:00:00Z' }]);
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
