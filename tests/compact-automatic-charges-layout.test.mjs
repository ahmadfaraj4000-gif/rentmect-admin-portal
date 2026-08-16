import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/final-overrides.css', import.meta.url), 'utf8');

test('compact automatic charges reflow within the rental card', () => {
  assert.match(styles, /\.rental-charge-manager\.compact[\s\S]*container: compact-rental-charges \/ inline-size/);
  assert.match(styles, /\.rental-charge-manager\.compact \.automatic-charge-heading[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(styles, /\.rental-charge-manager\.compact \.automatic-charge-fields label:first-child[\s\S]*grid-column: 1 \/ -1/);
  assert.match(styles, /@container compact-rental-charges \(max-width: 390px\)/);
});

test('automatic-charge totals and collection actions cannot overflow their card', () => {
  assert.match(styles, /\.rental-charge-manager\.compact \.automatic-charge-totals \.automatic-charge-primary[\s\S]*width: 100%/);
  assert.match(styles, /\.rental-charge-manager\.compact \.automatic-charge-card-footer[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(styles, /\.rental-charge-manager\.compact \.charge-collection-actions button[\s\S]*white-space: normal/);
});

test('all automatic-charge payment controls remain wired to their original handlers', () => {
  assert.match(source, /onClick=\{chargeAllAutomatic\}/);
  assert.match(source, /onClick=\{\(\) => sendPaymentLink\?\.\(charge\)\}/);
  assert.match(source, /onClick=\{\(\) => chargeCard\(charge\)\}/);
  assert.match(source, /onClick=\{\(\) => waiveRentalCharge\?\.\(charge\.id\)\}/);
});
