import test from 'node:test';
import assert from 'node:assert/strict';
import { refundableRentalSources, refundDisplayState } from '../src/lib/rentalRefunds.js';

const rental = { payment_provider: 'stripe', security_deposit: 300, deposit_held_amount: 300, payment_amount_cents: 82835 };
const balance = { id: 'balance', charge_type: 'rental_amendment', payment_provider: 'stripe', status: 'paid', stripe_payment_intent_id: 'pi_balance', payment_amount_cents: 52835 };
test('a mixed cash/card rental exposes only the actual card capture for refund', () => {
  const sources = refundableRentalSources(rental, [balance, { ...balance, id: 'cash', payment_provider: 'local', payment_amount_cents: 30000 }]);
  assert.equal(sources.length, 1);
  assert.equal(sources[0].maximum, 528.35);
  assert.equal(sources[0].chargeId, 'balance');
});
test('pending and succeeded refunds reduce availability; failed refunds do not', () => {
  for (const status of ['pending', 'processing', 'succeeded']) {
    assert.equal(refundableRentalSources(rental, [balance], [{ stripe_payment_intent_id: 'pi_balance', amount: 100, status }])[0].maximum, 428.35);
  }
  assert.equal(refundableRentalSources(rental, [balance], [{ stripe_payment_intent_id: 'pi_balance', amount: 100, status: 'failed' }])[0].maximum, 528.35);
});
test('protects deposits held or transferred and counts returned deposits exactly once', () => {
  for (const status of ['held', 'transferred', 'released']) {
    const allocations = [{ stripe_payment_intent_id: 'pi_balance', amount_held: 300, amount_released: status === 'released' ? 300 : 100, status }];
    assert.equal(refundableRentalSources(rental, [balance], [], allocations)[0].maximum, 228.35);
  }
});
test('refunds on another card payment do not reduce this payment twice', () => {
  assert.equal(refundableRentalSources(rental, [balance], [{ stripe_payment_intent_id: 'pi_other', amount: 100, status: 'succeeded' }])[0].maximum, 528.35);
});
test('a price change is never evidence that money was returned', () => {
  assert.equal(refundDisplayState('succeeded'), 'returned');
  for (const status of ['processing', 'pending', undefined]) assert.equal(refundDisplayState(status), 'pending');
  for (const status of ['failed', 'canceled', 'cancelled']) assert.equal(refundDisplayState(status), 'failed');
});

test('ignores unpaid or non-rental charges and deduplicates captures', () => {
  assert.deepEqual(refundableRentalSources(rental, [{...balance,status:'pending'},{...balance,charge_type:'toll'}]), []);
  assert.equal(refundableRentalSources(rental, [balance,{...balance,id:'duplicate'}]).length, 1);
});
