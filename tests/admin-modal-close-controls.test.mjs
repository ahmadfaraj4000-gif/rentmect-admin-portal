import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/final-overrides.css', import.meta.url), 'utf8');

test('every admin modal header has the same top-right close control', () => {
  const headerCount = (source.match(/admin-modal-header/g) || []).length;
  const closeControlCount = (source.match(/admin-close-button/g) || []).length;
  const nonModalCloseControlCount = 3; // mobile navigation, Quick Links, and notifications

  assert.equal(closeControlCount - nonModalCloseControlCount, headerCount);
  assert.match(styles, /\.admin-modal > \.admin-modal-header > div\s*\{[\s\S]*flex: 1 1 auto !important/);
  assert.match(styles, /\.admin-modal > \.admin-modal-header > \.admin-close-button\.admin-close-button\s*\{[\s\S]*margin: 0 0 0 auto !important/);
  assert.match(styles, /width: 40px !important/);
  assert.match(styles, /height: 40px !important/);
});
