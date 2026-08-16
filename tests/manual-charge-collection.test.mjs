import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const mainSource = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8');
const styles = await readFile(new URL('../src/final-overrides.css', import.meta.url), 'utf8');
const edgeSource = await readFile(new URL('../supabase/functions/stripe-web-hook/index.ts', import.meta.url), 'utf8');
const migration = await readFile(new URL('../supabase/migrations/20260816120000_external_manual_charge_payments.sql', import.meta.url), 'utf8');
const raceGuardMigration = await readFile(new URL('../supabase/migrations/20260816143000_guard_external_charge_collection_race.sql', import.meta.url), 'utf8');
const finalRaceGuardMigration = await readFile(new URL('../supabase/migrations/20260816150000_fix_guarded_external_paid_race.sql', import.meta.url), 'utf8');

test('one rental-card action collects every outstanding add-on while preserving item actions', () => {
  assert.match(mainSource, /async function chargeAllCollectible/);
  assert.match(mainSource, /Charge all · \$\{money\(outstandingTotal\)\}/);
  assert.match(mainSource, /Each charge stays itemized in the payment ledger/);
  assert.match(mainSource, /onClick=\{\(\) => chargeCard\(charge\)\}/);
  assert.match(mainSource, /onClick=\{\(\) => setExternalCharge\(charge\)\}/);
  assert.match(mainSource, /deferRefresh: index < collectible\.length - 1/);
});

test('manual charges accept confirmed external payments without racing Stripe', () => {
  assert.match(mainSource, /function ChargeExternalPaymentModal/);
  assert.match(mainSource, /Record Cash \/ External Payment/);
  assert.match(mainSource, /<option value="cash">Cash<\/option>/);
  assert.match(mainSource, /action: 'admin_record_external_charge'/);
  assert.match(edgeSource, /record_admin_external_rental_charge_payment_guarded/);
  assert.match(edgeSource, /p_expected_admin_charge_attempts/);
  assert.match(migration, /payment_provider = 'local'/);
  assert.match(raceGuardMigration, /for update/);
  assert.ok(
    finalRaceGuardMigration.indexOf('is distinct from p_expected_status')
      < finalRaceGuardMigration.indexOf("if v_charge.status = 'paid'"),
    'the concurrency check must run before the paid-row idempotency return',
  );
});

test('left-side payment history uses the canonical ledger and scrolls after four', () => {
  assert.match(mainSource, /rentalPayments=\{rentalPayments\}/);
  assert.match(mainSource, /ledger-payment-\$\{payment\.id\}/);
  assert.match(mainSource, /matchesCanonicalPayment/);
  assert.match(mainSource, /payments\.length > 4 \? 'is-scrollable'/);
  assert.match(styles, /\.rental-payment-history ol\.is-scrollable/);
  assert.match(styles, /max-height: 253px !important/);
  assert.match(styles, /height: 58px !important/);
  assert.match(styles, /overflow-y: auto !important/);
});
