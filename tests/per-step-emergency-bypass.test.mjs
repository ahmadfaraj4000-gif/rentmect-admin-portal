import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const finalStyles = readFileSync(new URL('../src/final-overrides.css', import.meta.url), 'utf8');

test('one incomplete domino opens a one-step emergency bypass', () => {
  assert.match(source, /admin_add_rental_emergency_exception_scope/);
  assert.match(source, /function EmergencyStepBypassModal/);
  assert.match(source, /Click one incomplete step to record an emergency bypass for only that step/);
  assert.match(source, /Bypass Only This Step/);
  assert.match(source, /No other step was bypassed and the vehicle was not released/);
});

test('one-step bypass explains its validation requirements before submission', () => {
  assert.match(source, /Required — minimum 20 characters/);
  assert.match(source, /20 minimum/);
  assert.match(source, /Emergency reason must contain at least 20 characters/);
  assert.match(source, /disabled=\{saving\}/);
  assert.match(finalStyles, /\.bypass-form-status/);
  assert.match(finalStyles, /\.emergency-step-modal \.admin-modal-header > button/);
});

test('license and insurance circles open document upload actions', () => {
  assert.match(source, /function DocumentStepActionModal/);
  assert.match(source, /onDocumentStepClick=\{\(step\) => setDocumentStepScope\(step\.key\)\}/);
  assert.match(source, /Choose \$\{label\} File/);
  assert.match(source, /Upload the customer-provided/);
  assert.match(source, /Bypass only this step/);
});

test('active emergency scopes are visible and count only as effective requirements', () => {
  assert.match(source, /function getActiveEmergencyScopeSet/);
  assert.match(source, /function getEffectiveReleaseChecklist/);
  assert.match(source, /Emergency bypass active/);
  assert.match(source, /state: step\.complete \? 'complete' : emergencyScopeSet\.has\(step\.key\) \? 'bypassed'/);
  assert.match(styles, /\.progress-step\.bypassed/);
});

test('emergency exception updates have one realtime owner', () => {
  assert.match(source, /channel\('admin-calendar-source-of-truth'\)/);
  assert.match(source, /table: 'rental_emergency_exceptions'/);
  assert.match(source, /scheduleCalendarDatasetRefresh\('rental_emergency_exceptions'\)/);
});
