import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/final-overrides.css', import.meta.url), 'utf8');

test('admin can distinguish an external method correction from money returned', () => {
  assert.match(main, /Edit Rental Payment Details/);
  assert.match(main, /Correct payment type/);
  assert.match(main, /Refund entire external receipt/);
  assert.match(main, /admin_adjust_external_rental_payment/);
  assert.match(main, /rental_external_payment_actions/);
  assert.match(main, /I confirm the full .* was actually returned to the customer outside Stripe/);
});

test('Stripe-sensitive actions show processing feedback and abandoned attempts', () => {
  assert.match(main, /PaymentProcessingOverlay/);
  assert.match(main, /Reconciling Stripe/);
  assert.match(main, /Stripe payment/);
  assert.match(main, /attempts may/);
  assert.match(main, /reconciled and retired automatically/);
  assert.match(css, /payment-processing-overlay/);
  assert.match(main, /admin-access-spinner/);
});
