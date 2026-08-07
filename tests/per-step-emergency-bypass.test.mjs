import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const finalOverrides = readFileSync(new URL('../src/final-overrides.css', import.meta.url), 'utf8');
const page = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

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

test('the in-office agreement loads and scrolls inside the viewport', () => {
  assert.match(page, /frame-src[^;]*https:\/\/rentmect\.com/);
  assert.match(source, /agreement-step-backdrop/);
  assert.match(source, /Open agreement in a new tab/);
  assert.match(source, /loading="eager"/);
  assert.match(finalOverrides, /\.admin-modal\.agreement-step-modal[\s\S]*overflow-y: auto !important/);
  assert.match(finalOverrides, /max-height: calc\(100dvh - 32px\) !important/);
  assert.match(finalOverrides, /-webkit-overflow-scrolling: touch !important/);
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
