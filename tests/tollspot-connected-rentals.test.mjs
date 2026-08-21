import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8');

test('the admin toll list keeps only connected Rent Me CT rental tolls', () => {
  assert.match(source, /transaction\.vehicle_id\s*&&\s*transaction\.rental_id/);
  assert.match(source, /transaction\.transaction_type \|\| 'TOLLS'/);
  assert.match(source, /Unmatched provider or Wheelbase activity is kept out of this screen/);
});

test('the duplicate-prone manual TollSpot charge action is not exposed', () => {
  assert.doesNotMatch(source, /Create Pending Charge/);
  assert.doesNotMatch(source, /rpc\('admin_create_tollspot_charge'/);
});
