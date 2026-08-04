import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [mainSource, stylesheet] = await Promise.all([
  readFile(new URL('../src/main.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/final-overrides.css', import.meta.url), 'utf8'),
]);

test('vehicle cards use separate identity, price, status, and management zones', () => {
  for (const className of [
    'vehicle-card-identity',
    'vehicle-card-price',
    'vehicle-card-status',
    'vehicle-card-manage',
  ]) {
    assert.match(mainSource, new RegExp(`className="${className}"`));
  }
});

test('vehicle identity has a stable minimum column and status wraps internally', () => {
  assert.match(
    stylesheet,
    /grid-template-columns:\s*minmax\(340px,\s*1\.3fr\)[\s\S]*minmax\(300px,\s*\.86fr\)\s*!important;/
  );
  assert.match(stylesheet, /\.vehicle-card-status \.vehicle-row-state\s*\{[\s\S]*flex-wrap:\s*wrap\s*!important;/);
});

test('vehicle management and status move to their own rows at narrower widths', () => {
  assert.match(stylesheet, /@media \(max-width:\s*1500px\)[\s\S]*\.vehicle-card-manage\s*\{[\s\S]*grid-column:\s*1\s*\/\s*-1\s*!important;/);
  assert.match(stylesheet, /@media \(max-width:\s*980px\)[\s\S]*\.vehicle-card-status\s*\{[\s\S]*grid-column:\s*1\s*\/\s*-1\s*!important;/);
});

test('manually unavailable vehicles have explicit restore and one-step undo controls', () => {
  assert.match(mainSource, /conditionStatus === 'unavailable'[\s\S]*vehicle-mark-available-btn[\s\S]*Mark Available/);
  assert.match(mainSource, /vehicle-undo-status-btn[\s\S]*undoVehicleCondition/);
});

test('manual calendar blocks can be removed from their edit dialog', () => {
  assert.match(mainSource, /onRemove=\{paintModal\.mode === 'edit'/);
  assert.match(mainSource, /Remove Block · Make Available/);
  assert.match(mainSource, /System-created calendar holds cannot be removed here/);
});
