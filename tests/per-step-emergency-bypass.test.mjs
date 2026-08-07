import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

test('each actionable domino opens an audited admin completion flow', () => {
  assert.match(source, /function AdminStepCompletionModal/);
  assert.match(source, /admin_complete_rental_step/);
  assert.match(source, /Click any booking circle to review it/);
  assert.match(source, /Mark \$\{label\} Complete/);
  assert.match(source, /added to activity history/);
});

test('admin completion explains its audit-note requirement before submission', () => {
  assert.match(source, /Add a completion note of at least 5 characters/);
  assert.match(source, /5 minimum characters/);
  assert.match(source, /every action is added to activity history/);
  assert.match(source, /disabled=\{busy\}/);
  assert.match(styles, /\.admin-completion-badge/);
});

test('license and insurance circles support upload or in-person completion', () => {
  assert.match(source, /\['license', 'insurance'\]\.includes\(scope\)/);
  assert.match(source, /Upload \$\{docLabel\(scope\)\} \(optional when inspected in person\)/);
  assert.match(source, /verified_in_person: true/);
  assert.doesNotMatch(source, /onDocumentStepClick=\{\(step\) => setDocumentStepScope/);
});

test('booking-circle modal mounts safely and keeps both completion and bypass actions', () => {
  assert.match(source, /rentalDocument=\{adminStepScope === 'license'/);
  assert.match(source, /function AdminStepCompletionModal\(\{ rental, scope, complete, rentalDocument, canBypass/);
  assert.match(source, /globalThis\.document\.body/);
  assert.doesNotMatch(source, /function AdminStepCompletionModal\(\{[^\n]*\bdocument\b/);
  assert.match(source, /Bypass only \{label\}/);
  assert.match(source, /setEmergencyStepScope\(scope\)/);
  assert.match(source, /function EmergencyStepBypassModal/);
});

test('eligible rentals expose the global emergency override', () => {
  assert.match(source, /canCreateEmergencyException && <button className="emergency-exception-action"/);
  assert.match(source, /> Global Emergency Override<\/button>/);
  assert.match(source, /function EmergencyExceptionModal/);
});

test('durable admin completions count as effective requirements', () => {
  assert.match(source, /completionScopeSet/);
  assert.match(source, /function getEffectiveReleaseChecklist/);
  assert.match(source, /admin_in_person/);
  assert.match(source, /Deposit collection required/);
  assert.match(styles, /\.admin-completion-badges/);
});

test('emergency exception updates have one realtime owner', () => {
  assert.match(source, /channel\('admin-calendar-source-of-truth'\)/);
  assert.match(source, /table: 'rental_emergency_exceptions'/);
  assert.match(source, /scheduleCalendarDatasetRefresh\('rental_emergency_exceptions'\)/);
});
