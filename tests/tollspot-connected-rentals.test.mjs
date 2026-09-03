import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8');
const manualAssignmentMigration = await readFile(new URL('../../supabase/migrations/20260902140000_admin_toll_manual_rental_assignment.sql', import.meta.url), 'utf8');

test('the admin toll list exposes unidentified tolls without allowing blind charging', () => {
  assert.match(source, /transaction\.transaction_type \|\| 'TOLLS'/);
  assert.match(source, /Unidentified — do not charge/);
  assert.match(source, /Transponder:/);
  assert.match(source, /Provider vehicle:/);
  assert.match(source, /assign_transponder/);
  assert.match(source, /Verify car & reprocess/);
});

test('review rows expose the complete transponder and useful rental evidence', () => {
  assert.match(source, /Full transponder:[\s\S]*?transaction\.transponder_number/);
  assert.match(source, /Toll\/exit time:/);
  assert.match(source, /Entry time:/);
  assert.match(source, /Provider posted:/);
  assert.match(source, /Search every rental/);
  assert.match(source, /Customer, email, phone, rental ID, vehicle, or plate/);
  assert.match(source, /Strongest match: same car and toll is inside the recorded possession dates/);
  assert.match(source, /Recorded possession of identified car:/);
});

test('admin can atomically assign a reviewed toll and create exactly one charge', () => {
  assert.match(source, /Assign to rental/);
  assert.match(source, /admin_assign_tollspot_transaction_to_rental/);
  assert.match(source, /Confirm rental & create toll charge/);
  assert.match(manualAssignmentMigration, /for update/);
  assert.match(manualAssignmentMigration, /source_type = 'tollspot'/);
  assert.match(manualAssignmentMigration, /source_reference = v_transaction\.tollspot_transaction_id/);
  assert.match(manualAssignmentMigration, /admin_tollspot_rental_assigned/);
  assert.match(manualAssignmentMigration, /inside_recorded_possession/);
  assert.match(manualAssignmentMigration, /actor_email/);
});

test('the duplicate-prone manual TollSpot charge action is not exposed', () => {
  assert.doesNotMatch(source, /Create Pending Charge/);
  assert.doesNotMatch(source, /rpc\('admin_create_tollspot_charge'/);
});
