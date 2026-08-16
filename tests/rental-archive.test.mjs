import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');

test('terminal rentals are separated from the open rental manager', () => {
  assert.match(source, /\{ key: 'all', label: 'All Open' \}/);
  assert.match(source, /\{ key: 'archive', label: 'Archive' \}/);
  assert.match(source, /filter === 'archive'.*\['completed', 'cancelled'\]/);
  assert.match(source, /filter === 'all'.*!\['completed', 'cancelled'\]/);
  assert.match(source, /Archive \(\$\{prettyStatus\(status\)\}\)/);
});

test('the rental archive renders in pages instead of filling the screen', () => {
  assert.match(source, /ARCHIVE_PAGE_SIZE = 25/);
  assert.match(source, /matchingRentals\.slice\(0, archiveVisibleCount\)/);
  assert.match(source, /Load 25 more archived rentals/);
});
