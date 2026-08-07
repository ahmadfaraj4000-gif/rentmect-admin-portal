import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');

test('customer details expose a focused editable profile form', () => {
  assert.match(source, /Edit customer/);
  assert.match(source, /First name \+ middle name or initial/);
  assert.match(source, /Changing this number resets phone verification for the new number/);
  assert.match(source, /action: 'update', customerId: userId/);
  assert.match(source, /setProfiles\(\(current\) => current\.map/);
});

test('customer deletion is explicit and keeps administrator accounts protected', () => {
  assert.match(source, /Type <strong>DELETE CUSTOMER<\/strong> to confirm/);
  assert.match(source, /deleteConfirmation !== 'DELETE CUSTOMER'/);
  assert.match(source, /!isAdministrator && <button className="customer-delete-button"/);
  assert.match(source, /Historical rental and payment records were retained/);
});

test('deleted customers stay out of every customer-directory load path', () => {
  const activeCustomerFilters = source.match(/\.is\('customer_deleted_at', null\)/g) || [];
  assert.ok(activeCustomerFilters.length >= 2, 'both staged and legacy profile loaders must exclude deleted customers');
});
