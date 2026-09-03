import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  builtInLateFeeTemplates,
  calculateLateRentalDayAmount,
  isReturnWindowExtended,
} from '../src/lib/lateFeePolicy.js';

const adminSource = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
const adminCss = readFileSync(new URL('../src/final-overrides.css', import.meta.url), 'utf8');
const edgeSource = readFileSync(new URL('../supabase/functions/stripe-web-hook/index.ts', import.meta.url), 'utf8');

const rental = {
  pickup_date: '2026-08-26',
  pickup_time: '10:00 PM',
  return_date: '2026-08-30',
  return_time: '10:00 PM',
  rental_total: 208.40,
  pre_discount_rental_total: 232,
  base_rental_total: 232,
  vehicles: { daily_rate: 69 },
};

test('late rental day uses the same contracted-total-per-billable-day pricing as automation', () => {
  assert.equal(calculateLateRentalDayAmount(rental), 52.10);
});

test('built-in late fee choices are immediately priced and taxable', () => {
  const templates = builtInLateFeeTemplates(rental);
  assert.deepEqual(templates.map((template) => [template.name, template.amount, template.chargeType, template.taxable]), [
    ['Late return fee - 30 minutes', 25, 'late_fee', true],
    ['Late return - additional rental day', 52.10, 'late_rental_day', true],
  ]);
});

test('fee disposition is requested only when the return window moves later', () => {
  assert.equal(isReturnWindowExtended(rental, '2026-09-01', '10:00 PM'), true);
  assert.equal(isReturnWindowExtended(rental, '2026-08-30', '9:30 PM'), false);
});

test('extension workflow requires an explicit keep-or-waive decision and reports it', () => {
  assert.match(adminSource, /What should happen to the existing late fees\?/);
  assert.match(adminSource, /Keep Late Fees Due/);
  assert.match(adminSource, /Waive Late Fees/);
  assert.match(adminSource, /waiveLateFees/);
  assert.match(adminSource, /Existing late fees remain due/);
  assert.match(adminSource, /Existing late fees were waived/);
});

test('manual-charge dropdown separates fixed late fee and whole-rental-day fee', () => {
  assert.match(adminSource, /optgroup label="Rental agreement fees"/);
  assert.match(adminSource, /Late fee — fixed \$25/);
  assert.match(adminSource, /Late day — whole rental day/);
  assert.match(adminSource, /if \(chargeType === 'late_fee'\) \{\s*applyChargeTemplate\(policyTemplates\[0\]\)/);
  assert.match(adminSource, /if \(chargeType === 'late_rental_day'\) \{\s*applyChargeTemplate\(policyTemplates\[1\]\)/);
  assert.match(adminSource, /Fixed agreement fees fill automatically/);
});

test('manual charge form is visually ordered directly below its button', () => {
  assert.match(adminCss, /> \.rental-charge-heading\s*\{[\s\S]*?order: 0/);
  assert.match(adminCss, /> \.rental-charge-form\s*\{[\s\S]*?order: 1/);
});

test('compact manual-charge form keeps amount and submit controls inside the financial panel', () => {
  assert.match(adminCss, /\.rental-charge-manager\.compact \.rental-charge-form\.portal-form\s*\{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(adminCss, /\.rental-charge-manager\.compact \.rental-charge-form > \*[\s\S]*?min-width: 0/);
  assert.match(adminCss, /\.rental-charge-manager\.compact \.rental-charge-form > button\s*\{[\s\S]*?width: 100%/);
});

test('server persists the fee decision and attributes it through the audit RPC', () => {
  assert.match(edgeSource, /rental\.late_fees_waived_on_extension/);
  assert.match(edgeSource, /rental\.late_fees_kept_on_extension/);
  assert.match(edgeSource, /record_admin_audit_event/);
  assert.match(edgeSource, /lateFeeDecision/);
});
