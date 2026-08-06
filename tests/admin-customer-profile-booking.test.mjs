import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8');
const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');

test('admin accounts remain available in client records and assisted bookings', () => {
  assert.match(source, /const customerProfiles = profiles;/);
  assert.match(source, /const customers = \[\.\.\.profiles\]/);
  assert.doesNotMatch(source, /profile\.role !== 'admin'/);
});

test('assisted bookings capture a missing existing customer legal name', () => {
  assert.match(source, /customerFullName:/);
  assert.match(source, /This profile currently has only an email/);
  assert.match(source, /permanently attaches it to the customer/);
});

test('first and last legal-name controls reserve matching helper rows', () => {
  assert.match(source, /className="admin-legal-name-field"/);
  assert.match(styles, /\.admin-legal-name-field\{[\s\S]*grid-template-rows:auto minmax\(44px,auto\) minmax\(34px,auto\)!important/);
});
