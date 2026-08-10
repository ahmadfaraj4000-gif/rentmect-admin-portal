import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');

test('the shared vehicle identity form exposes model year for add and edit', () => {
  assert.match(source, /name: '', brand: '', model: '', model_year: ''/);
  assert.match(source, /Vehicle year[\s\S]*onChange\('model_year', event\.target\.value\)[\s\S]*required=\{!vehicle\}/);
  assert.match(source, /<VehicleIdentityFields form=\{vehicleForm\} onChange=\{update\} \/>/);
  assert.match(source, /<VehicleIdentityFields form=\{editVehicleForm\} onChange=\{updateEdit\} vehicle=\{editingVehicle\} \/>/);
});

test('new and existing vehicles save a validated numeric model year', () => {
  assert.match(source, /const modelYear = Number\(vehicleForm\.model_year\)/);
  assert.match(source, /model_year: vehicle\.model_year \?\? ''/);
  assert.match(source, /const modelYearValue = String\(editVehicleForm\.model_year \?\? ''\)\.trim\(\)/);
  assert.match(source, /modelYear < VEHICLE_YEAR_MIN \|\| modelYear > VEHICLE_YEAR_MAX/);
  assert.ok((source.match(/model_year: modelYear/g) || []).length >= 2);
});

test('fleet search and list identity include the stored vehicle year', () => {
  assert.match(source, /vehicle\.model_year,[\s\S]*vehicle\.vehicle_type/);
  assert.match(source, /\[v\.model_year, v\.brand, v\.model\]\.filter\(Boolean\)\.join\(' '\)/);
});
