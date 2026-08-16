import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const finalOverrides = readFileSync(new URL('../src/final-overrides.css', import.meta.url), 'utf8');
const page = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const agreementSource = readFileSync(new URL('../src/rentalAgreement.js', import.meta.url), 'utf8');

test('each actionable domino opens an audited admin completion flow', () => {
  assert.match(source, /function AdminStepCompletionModal/);
  assert.match(source, /admin_complete_rental_step/);
  assert.match(source, /<RentalProgressTracker steps=\{progressSteps\} onStepClick=\{\(step\) => setAdminStepScope\(step\.key\)\} \/>/);
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
  assert.match(source, /canCreateEmergencyException && <button[^\n]+className="emergency-exception-action"[^\n]+setEmergencyModalOpen\(true\)/);
  assert.match(source, /> Global emergency override<\/button>/);
  assert.match(source, /function EmergencyExceptionModal/);
});

test('the in-office agreement uses the same canonical signed document as the customer portal', () => {
  assert.equal(createHash('sha256').update(agreementSource).digest('hex'), 'cd72d93e1e9c241bbf2b4e31a54deb88c46c9afe80f650f8e792d31f28608dc7');
  assert.match(agreementSource, /rentmect-master-v2026-08-08-late-mileage-r1/);
  assert.match(agreementSource, /MASTER VEHICLE RENTAL AGREEMENT/);
  assert.match(source, /import \{ AGREEMENT_TEXT, AGREEMENT_VERSION \} from '\.\/rentalAgreement'/);
  assert.match(source, /return `\$\{details\}\\n\$\{AGREEMENT_TEXT\}`/);
  assert.match(source, /AUTO-FILLED RENTAL DETAILS/);
  assert.match(source, /admin-agreement-scroll-box/);
  assert.match(source, /I Agree to the Terms” remains disabled until you scroll through the agreement to the bottom/);
  assert.match(source, /Skip to bottom and unlock “I Agree”/);
  assert.match(source, /function skipAgreementToEnd/);
  assert.match(source, /reviewBox\.scrollTop = reviewBox\.scrollHeight/);
  assert.match(source, /This is the exact signed agreement stored with this rental/);
  assert.match(source, /Download Agreement/);
  assert.doesNotMatch(source, /<iframe[^>]*rental agreement/);
  assert.doesNotMatch(source, /PUBLIC_AGREEMENT_URL/);
  assert.doesNotMatch(page, /frame-src[^;]*https:\/\/rentmect\.com/);
  assert.match(source, /agreement-step-backdrop/);
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
