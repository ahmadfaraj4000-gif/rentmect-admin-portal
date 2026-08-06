import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');

test('payment integrity tables have one targeted realtime owner', () => {
  for (const table of [
    'rental_extension_requests',
    'rental_payment_refunds',
    'rental_payments',
    'rental_charge_items',
    'rental_deposit_allocations',
    'stripe_reconciliation_issues',
  ]) {
    assert.match(source, new RegExp(`table: '${table}'`));
  }
  assert.match(source, /channel\('admin-payment-source-of-truth'\)/);
});

test('payments load and visibly flag durable Stripe reconciliation issues', () => {
  assert.match(source, /from\('stripe_reconciliation_issues'\)/);
  assert.match(source, /Urgent: \{openReconciliation\.length\} Stripe/);
  assert.match(source, /typeLabel: 'Stripe Reconciliation'/);
  assert.match(source, /value="reconciliation">Reconciliation issues/);
});
