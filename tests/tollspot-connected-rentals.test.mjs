import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8');

test('the admin toll list exposes unidentified tolls without allowing blind charging', () => {
  assert.match(source, /transaction\.transaction_type \|\| 'TOLLS'/);
  assert.match(source, /Unidentified — do not charge/);
  assert.match(source, /Transponder:/);
  assert.match(source, /Provider vehicle:/);
  assert.match(source, /assign_transponder/);
  assert.match(source, /Verify car & reprocess/);
});

test('the duplicate-prone manual TollSpot charge action is not exposed', () => {
  assert.doesNotMatch(source, /Create Pending Charge/);
  assert.doesNotMatch(source, /rpc\('admin_create_tollspot_charge'/);
});
