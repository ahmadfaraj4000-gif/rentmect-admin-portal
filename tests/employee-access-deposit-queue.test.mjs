import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/final-overrides.css', import.meta.url), 'utf8');

test('completed returns expose a durable deposit queue on dashboard and queue', () => {
  assert.match(source, /deposit_action_tasks/);
  assert.match(source, /Deposit Action Required/);
  assert.match(source, /Quick Refund Deposit/);
  assert.match(source, /admin_record_external_deposit_release/);
  assert.match(source, /admin_escalate_deposit_task/);
  assert.match(source, /table: 'deposit_action_tasks'/);
  assert.match(source, /loadDashboardSnapshot\(\{ force: true \}\)/);
});

test('Employee access is shared, manager-controlled, and permission-aware', () => {
  assert.match(source, /get_admin_staff_context/);
  assert.match(source, /admin_set_employee_permission/);
  assert.match(source, /Shared Role Permissions/);
  assert.match(source, /These switches apply to every account classified as Employee/);
  assert.match(source, /ADMIN_TAB_PERMISSION_KEYS/);
  assert.match(source, /function requireStaffPermission/);
  assert.match(source, /canAccessAdminTab\(activeTab\)/);
  for (const permission of [
    'rental.edit', 'rental.cancel', 'rental.discount', 'rental.return',
    'payment.collect', 'payment.refund', 'deposit.resolve', 'charge.manage',
    'vehicle.manage', 'customer.manage', 'communications.send',
    'override.emergency', 'settings.operational',
  ]) {
    assert.match(source, new RegExp(`requireStaffPermission\\('${permission.replace('.', '\\.')}`));
  }
});

test('deposit resolution dialogs scroll in short and mobile viewports', () => {
  assert.match(source, /deposit-action-modal-backdrop/);
  assert.match(source, /deposit-action-modal/);
  assert.match(styles, /\.admin-modal\.deposit-action-modal[\s\S]*?max-height:[^;]+100dvh[\s\S]*?overflow-y:\s*auto\s*!important/);
  assert.match(styles, /\.deposit-action-modal-backdrop\.admin-modal-backdrop[\s\S]*?overflow-y:\s*auto\s*!important/);
});

test('Employee access remains inside narrow mobile viewports', () => {
  assert.match(styles, /\.settings-grid\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)\s*!important/);
  assert.match(styles, /\.employee-invite-form \.form-row\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)\s*!important/);
  assert.match(styles, /\.employee-invite-form input\s*\{[\s\S]*?min-width:\s*0\s*!important/);
  assert.match(styles, /\.employee-permission-row > span\s*\{[\s\S]*?overflow-wrap:\s*anywhere/);
});

test('Employee permission explanations stay left with compact checks on the right', () => {
  assert.match(styles, /label\.employee-permission-row\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)\s+18px\s*!important/);
  assert.match(styles, /label\.employee-permission-row > span\s*\{[\s\S]*?grid-column:\s*1\s*!important/);
  assert.match(styles, /input\[type="checkbox"\]\[role="switch"\]\s*\{[\s\S]*?grid-column:\s*2\s*!important[\s\S]*?width:\s*18px\s*!important[\s\S]*?height:\s*18px\s*!important/);
});

test('the audit empty state does not incorrectly report a missing migration', () => {
  assert.doesNotMatch(source, /after the audit migration is installed/);
  assert.match(source, /after staff and admin actions are recorded/);
});

test('unsigned rentals preload the dedicated agreement email', () => {
  assert.match(source, /manual_agreement_signature_required/);
  assert.match(source, /agreement_signing_url/);
});
