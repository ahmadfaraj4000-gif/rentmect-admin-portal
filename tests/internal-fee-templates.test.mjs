import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');

test('internal fee templates are excluded from admin-created booking totals', () => {
  assert.doesNotMatch(source, /<ManualBooking[^>]*serviceFees=/);
  assert.doesNotMatch(source, /const serviceFeeTotal = serviceFees\.reduce/);
  assert.match(source, /const taxTotal = rentalTotal \* CT_TAX_RATE/);
  assert.match(source, /money\(rentalTotal \+ taxTotal \+ deposit\)/);
});

test('active templates flow only into each rental charge manager', () => {
  assert.match(source, /activeTab === 'rentals'[\s\S]*?<Rentals[\s\S]*?serviceFees=\{serviceFees\.filter\(\(fee\) => fee\.active\)\}/);
  assert.match(source, /<RentalChargeManager compact[^>]*serviceFees=\{serviceFees\}/);
  assert.match(source, /Internal fee template/);
  assert.match(source, /chooseInternalTemplate\(event\.target\.value\)/);
});

test('settings clearly identify templates as internal and non-public', () => {
  assert.match(source, /Panel title="Internal Charge Templates"/);
  assert.match(source, /never included in public prices, checkout, or new-booking totals/);
  assert.match(source, /Apply charge to this rental/);
});

test('rental cards and payment summaries do not present a booking fee', () => {
  assert.doesNotMatch(source, /Booking fees?/i);
  assert.match(source, /refundable deposit/);
  assert.match(source, /Total rental cost/);
});
