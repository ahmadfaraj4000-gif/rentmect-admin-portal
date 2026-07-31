import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const css = await readFile(new URL('../src/final-overrides.css', import.meta.url), 'utf8');

test('payment Type select matches the neighboring filter control height', () => {
  assert.match(
    css,
    /\.payments-type-filter select\s*\{[^}]*height:\s*42px\s*!important;[^}]*min-height:\s*42px\s*!important;/s,
  );
});

test('vehicle edit gallery uses readable cards and stacked full-width actions', () => {
  assert.match(
    css,
    /\.vehicle-editor-modal:not\(\.add-vehicle-modal\) \.vehicle-photo-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)\s*!important;/s,
  );
  assert.match(
    css,
    /\.vehicle-editor-modal:not\(\.add-vehicle-modal\) \.vehicle-photo-actions\s*\{[^}]*grid-template-columns:\s*1fr\s*!important;/s,
  );
  assert.match(
    css,
    /\.vehicle-editor-modal:not\(\.add-vehicle-modal\) \.vehicle-photo-actions button\s*\{[^}]*width:\s*100%\s*!important;[^}]*min-height:\s*42px\s*!important;/s,
  );
});
