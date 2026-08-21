import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8');
const migration = await readFile(
  new URL('../supabase/migrations/20260821224000_apply_admin_payment_deadline_globally.sql', import.meta.url),
  'utf8'
);

test('saving booking rules clearly applies the staff deadline globally', () => {
  assert.match(source, /Applies globally to new staff-created unpaid bookings/);
  assert.match(source, /Existing automatic staff-booking deadlines were recalculated/);
  assert.match(source, /Individual deadline exceptions and customer website checkout holds stay unchanged/);
});

test('global deadline updates only automatic open unpaid admin bookings', () => {
  assert.match(migration, /rental\.booking_source = 'admin_manual'/);
  assert.match(migration, /'paid', 'partially_paid', 'partial'/);
  assert.match(migration, /v_rental\.created_at\s*\+ make_interval/);
  assert.match(migration, /'admin_payment_deadline_changed'/);
  assert.match(migration, /'admin_cancelled_unpaid_reservation_restored'/);
  assert.match(migration, /customer_checkout_deadlines_unchanged', true/);
});
