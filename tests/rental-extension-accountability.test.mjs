import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/final-overrides.css', import.meta.url), 'utf8');

test('open extension work is visible on the collapsed rental card', () => {
  assert.match(source, /const extensionAttention = \[\.\.\.rentalExtensions\]/);
  assert.match(source, /Extension payment due:/);
  assert.match(source, /Extension request awaiting review/);
  assert.match(source, /Current return \{formatRentalDate\(rental\.return_date/);
});

test('extension history distinguishes quotes, amounts due, and completed payments', () => {
  assert.match(source, />Extension history</);
  assert.match(source, /'Approved — payment due'/);
  assert.match(source, /'Paid and active'/);
  assert.match(source, /\$\{money\(amount\)\} paid/);
  assert.match(source, /\$\{money\(amount\)\} due/);
  assert.match(source, /\$\{money\(amount\)\} quoted/);
  assert.doesNotMatch(source, /request\.extension_total_amount\)\} due/);
});

test('extension history explains when the canonical rental changes', () => {
  assert.match(source, /Return: \{originalReturn\} → \{requestedReturn\}/);
  assert.match(source, /The current rental still ends \{originalReturn\}/);
  assert.match(source, /automatically when payment is recorded/);
  assert.match(source, /The rental has been updated/);
  assert.match(source, /Record Payment &amp; Activate/);
  assert.match(source, /Send Extension Payment Link/);
  assert.match(source, /Cancel Extension Hold/);
});

test('extension states remain legible in the compact admin card', () => {
  assert.match(styles, /\.rental-card-extension-flag\s*\{/);
  assert.match(styles, /\.extension-status-badge\.approved_pending_payment/);
  assert.match(styles, /\.extension-status-badge\.activated/);
  assert.match(styles, /\.extension-payment-summary\.paid/);
  assert.match(styles, /\.extension-current-return-note\.active/);
});
