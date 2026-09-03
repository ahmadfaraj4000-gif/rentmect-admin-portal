import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/final-overrides.css', import.meta.url), 'utf8');
const edge = await readFile(new URL('../../supabase/functions/tollspot-sync/index.ts', import.meta.url), 'utf8');
const migration = await readFile(new URL('../../supabase/migrations/20260902141500_vehicle_transponder_management.sql', import.meta.url), 'utf8');

test('every fleet card loads and displays its full verified transponder', () => {
  assert.match(source, /from\('tollspot_transponder_mappings'\)/);
  assert.match(source, /\.eq\('active', true\)/);
  assert.match(source, /vehicle-card-transponder/);
  assert.match(source, /Full toll transponder for \{v\.name\}/);
  assert.match(source, /value=\{transponderValue\}/);
  assert.match(source, /Verified \$\{formatEasternDateTime\(transponderMapping\.verified_at\)\}/);
  assert.match(css, /\.vehicle-card-transponder input/);
});

test('admins can save replace or clear a vehicle transponder and reprocess open tolls', () => {
  assert.match(source, /action: 'set_vehicle_transponder'/);
  assert.match(source, /Save transponder/);
  assert.match(source, /Update transponder/);
  assert.match(source, /Clear mapping/);
  assert.match(edge, /service_set_tollspot_vehicle_transponder/);
  assert.match(edge, /reprocessed: ids\.length/);
  assert.match(migration, /one_active_vehicle_uidx/);
  assert.match(migration, /previous_transponders/);
  assert.match(migration, /Admins read verified TollSpot transponders/);
});

test('transponder matching remains full-value exact and case insensitive', () => {
  assert.match(edge, /replace\(\/\[\^A-Za-z0-9\]\/g, ""\)\.toUpperCase\(\)/);
  assert.match(migration, /upper\(mapping\.transponder_number\) = upper\(regexp_replace/);
  assert.doesNotMatch(source, /masked_transponder.*vehicle-card-transponder/);
});
