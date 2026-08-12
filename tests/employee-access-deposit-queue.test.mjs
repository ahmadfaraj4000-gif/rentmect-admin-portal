import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');

test('completed returns expose a durable deposit queue on dashboard and queue', () => {
  assert.match(source, /deposit_action_tasks/);
  assert.match(source, /Deposit Action Required/);
  assert.match(source, /Quick Refund Deposit/);
  assert.match(source, /admin_record_external_deposit_release/);
  assert.match(source, /admin_escalate_deposit_task/);
});

test('Employee access is shared, manager-controlled, and permission-aware', () => {
  assert.match(source, /get_admin_staff_context/);
  assert.match(source, /admin_set_employee_permission/);
  assert.match(source, /Shared Role Permissions/);
  assert.match(source, /These switches apply to every account classified as Employee/);
  assert.match(source, /ADMIN_TAB_PERMISSION_KEYS/);
});

test('unsigned rentals preload the dedicated agreement email', () => {
  assert.match(source, /manual_agreement_signature_required/);
  assert.match(source, /agreement_signing_url/);
});
