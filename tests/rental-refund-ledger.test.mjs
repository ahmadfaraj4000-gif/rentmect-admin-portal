import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/final-overrides.css', import.meta.url), 'utf8');

test('rental transaction ledger includes both payment and deposit refunds', () => {
  assert.match(source, /rentalRefunds\s*\.filter/);
  assert.match(source, /depositRefundAllocations/);
  assert.match(source, /label: 'Rental payment refund'/);
  assert.match(source, /label: 'Security deposit refund'/);
  assert.match(source, /Refund \$\{allocation\.refund_id\}/);
  assert.match(source, /<h5>Transactions<\/h5>/);
});

test('refund rows distinguish returned, pending, and failed money', () => {
  assert.match(source, /moneyReturned: status === 'succeeded'/);
  assert.match(source, /Refund pending/);
  assert.match(source, /Refund failed/);
  assert.match(styles, /\.rental-payment-history li\.is-refund/);
  assert.match(styles, /\.rental-payment-source\.refund\.failed/);
});
