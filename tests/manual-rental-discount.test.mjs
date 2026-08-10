import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const mainSource = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8');
const styles = await readFile(new URL('../src/final-overrides.css', import.meta.url), 'utf8');

test('every rental card exposes the reservation-only manual discount workflow', () => {
  assert.match(mainSource, /previewManualRentalDiscount/);
  assert.match(mainSource, /applyManualRentalDiscount/);
  assert.match(mainSource, /action: 'admin_apply_manual_discount'/);
  assert.match(mainSource, /Dollar amount off/);
  assert.match(mainSource, /Percentage off/);
  assert.doesNotMatch(mainSource, /Desired final total/);
  assert.match(mainSource, /Vehicle pricing for every other customer stays unchanged/);
});

test('the preview keeps deposits separate and explains paid credits', () => {
  assert.match(mainSource, /Refundable deposit \(unchanged\)/);
  assert.match(mainSource, /customer credit will be due/);
  assert.match(mainSource, /captured payment will remain unchanged/i);
  assert.match(mainSource, /Existing promotion .* remains applied/);
});

test('manual discounts appear in payment summary and agreement snapshots', () => {
  assert.match(mainSource, /Rental before adjustment/);
  assert.match(mainSource, /Manual Reservation Discount:/);
  assert.match(mainSource, /manual_discount_tax_savings/);
  assert.match(styles, /\.manual-discount-modal\.admin-modal/);
});
