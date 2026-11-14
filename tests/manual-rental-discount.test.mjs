import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { additionalDiscountRequest } from '../src/lib/manualDiscountPreview.js';

const mainSource = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8');
const stripePaymentSource = await readFile(new URL('../src/StripeAllocatedPayment.jsx', import.meta.url), 'utf8');
const styles = await readFile(new URL('../src/final-overrides.css', import.meta.url), 'utf8');

test('every rental card exposes the reservation-only manual discount workflow', () => {
  assert.match(mainSource, /previewManualRentalDiscount/);
  assert.match(mainSource, /applyManualRentalDiscount/);
  assert.match(mainSource, /action: 'admin_apply_manual_discount'/);
  assert.match(mainSource, /Dollar amount off/);
  assert.match(mainSource, /Percentage off/);
  assert.doesNotMatch(mainSource, /Desired final total/);
  assert.match(mainSource, /The new discount is added to it/);
});

test('the preview keeps deposits separate and explains paid credits', () => {
  assert.match(mainSource, /Refundable deposit \(unchanged\)/);
  assert.match(mainSource, /customer credit will be due/);
  assert.match(mainSource, /captured payment will remain unchanged/i);
  assert.match(mainSource, /Existing promotion .* remains applied/);
});

test('manual discounts appear in payment summary and agreement snapshots', () => {
  assert.match(mainSource, /Rental before discount/);
  assert.match(mainSource, /Manual Reservation Discount:/);
  assert.match(mainSource, /manual_discount_tax_savings/);
  assert.match(styles, /\.manual-discount-modal\.admin-modal/);
});

test('paid rental edits reopen only the remaining rental balance', () => {
  assert.match(mainSource, /remaining rental balance/i);
  assert.match(mainSource, /Net booking payments received/);
  assert.match(mainSource, /record_admin_rental_balance_payment|admin_record_external_balance/);
  assert.match(stripePaymentSource, /Charge saved card/);
  assert.match(mainSource, /Use Take Payment/);
  assert.match(mainSource, /money\(balanceDue\).*total outstanding/);
  assert.match(mainSource, /const paymentPaid = \(rental\.payment_status \|\| 'pending'\) === 'paid';/);
  assert.doesNotMatch(mainSource, /paymentPaid =[^;]+completionScopeSet\.has\('payment'\)/);
});

test('fixed discounts are described as exact rental-price reductions', () => {
  assert.match(mainSource, /Additional dollar amount off the rental price before tax/);
  assert.match(mainSource, /Total rental discount/);
  assert.match(mainSource, /off rental/);
});

test('new discounts preserve the existing discount and percentage uses the current rental price', () => {
  const rental = { manual_discount_amount: 129.20, rental_total: 1105.85 };
  assert.deepEqual(additionalDiscountRequest(rental, { mode: 'fixed', value: 19.62 }), { mode: 'fixed', value: 148.82 });
  assert.deepEqual(additionalDiscountRequest(rental, { mode: 'percentage', value: 10 }), { mode: 'fixed', value: 239.79 });
  assert.deepEqual(additionalDiscountRequest(rental, { mode: 'remove' }), { mode: 'remove', value: 0 });
  assert.throws(() => additionalDiscountRequest(rental, { mode: 'percentage', value: 101 }));
});
