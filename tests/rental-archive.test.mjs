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

test('the rental archive requests pages instead of downloading all archive records', () => {
  const workspace = readFileSync(new URL('../src/useRentalWorkspace.js', import.meta.url), 'utf8');
  const list = readFileSync(new URL('../src/RentalSummaryList.jsx', import.meta.url), 'utf8');
  assert.match(workspace, /p_offset: params.offset/);
  assert.match(workspace, /p_limit: RENTAL_PAGE_SIZE/);
  assert.match(list, /Next 25/);
  assert.doesNotMatch(source, /matchingRentals\.slice\(0, archiveVisibleCount\)/);
});
