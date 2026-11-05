import test from 'node:test';
import assert from 'node:assert/strict';
import { eligibleExternalTolls, buildTollPayment } from '../src/lib/externalTollPayment.js';
const charges = [{ id: 'one', charge_type: 'toll', status: 'pending', total_amount: 2.31 }, { id: 'two', charge_type: 'toll', status: 'checkout_open', total_amount: 1.09 }];
const form = { amount: '3.40', paymentMethod: 'cash', reference: '  abc  ', receivedDate: '2026-11-05', confirmed: true };
test('one receipt allocates exact cents to all selected tolls', () => {
  const result = buildTollPayment(charges, ['two', 'one'], form);
  assert.deepEqual(result.charges, [{ id: 'one', amountCents: 231 }, { id: 'two', amountCents: 109 }]);
  assert.equal(result.amountCents, 340); assert.equal(result.reference, 'abc');
});
test('selection excludes paid, waived, non-toll, booking-included and reserved charges', () => {
  const excluded = [{ status: 'paid' }, { status: 'waived' }, { charge_type: 'fuel' }, { included_in_initial_payment: true }, { external_toll_receipt_id: 'receipt' }, { checkout_creation_token: 'token' }].map(x => ({ ...charges[0], ...x }));
  assert.deepEqual(eligibleExternalTolls([...charges, ...excluded]), charges);
});
test('stale selection, partial/over payment and unconfirmed money are rejected', () => {
  assert.throws(() => buildTollPayment(charges, ['missing'], form), /no longer available/);
  for (const amount of ['3.39', '3.41', '-1', 'invalid']) assert.throws(() => buildTollPayment(charges, ['one', 'two'], { ...form, amount }), /exactly match/);
  assert.throws(() => buildTollPayment(charges, ['one', 'two'], { ...form, confirmed: false }), /confirm/);
});
