import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createRentalSummaryReader } from '../src/lib/rentalSummaryReader.js';

const source = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');

test('terminal rentals are separated from the open rental manager', () => {
  assert.match(source, /\{ key: 'all', label: 'All Open' \}/);
  assert.match(source, /\{ key: 'archive', label: 'Archive' \}/);
  assert.match(source, /filter === 'archive'.*terminal && !needsDepositReview/);
  assert.match(source, /filter === 'all'.*!terminal/);
  assert.match(source, /Archive \(\$\{prettyStatus\(status\)\}\)/);
});

test('the rental archive requests pages instead of downloading all archive records', () => {
  const workspace = readFileSync(new URL('../src/lib/rentalSummaryReader.js', import.meta.url), 'utf8');
  assert.match(workspace, /p_offset: rows.length/);
  assert.match(workspace, /p_limit: Math.min/);
  assert.match(source, /Load 5 more archived rentals/);
  assert.match(workspace, /params.offset \+ size/);
  assert.doesNotMatch(source, /matchingRentals\.slice\(0, archiveVisibleCount\)/);
});

test('archive fetches five records initially and expands in five-record pages', async () => {
  const requests = [];
  const readList = createRentalSummaryReader(async args => { requests.push(args); return { rows: Array.from({length:Math.min(args.p_limit,12-args.p_offset)},(_,i)=>({id:args.p_offset+i})), total:12 }; });
  assert.equal((await readList({filter:'archive',offset:0})).rows.length,5);
  assert.equal(requests.length,1); assert.equal(requests[0].p_limit,5);
  requests.length=0;
  assert.equal((await readList({filter:'archive',offset:5})).rows.length,10);
  assert.deepEqual(requests.map(r=>[r.p_offset,r.p_limit]),[[5,5]]);
});


test('deposit review starts with five and loads ten more only on request', async () => {
  const requests = [];
  const readList = createRentalSummaryReader(async args => { requests.push(args); return { rows: Array.from({length:Math.min(args.p_limit,22-args.p_offset)},(_,i)=>({id:args.p_offset+i})), total:22 }; });
  assert.equal((await readList({filter:'deposit_review',offset:0})).rows.length,5);
  assert.deepEqual(requests.map(r=>[r.p_offset,r.p_limit]),[[0,5]]);
  requests.length=0;
  assert.equal((await readList({filter:'deposit_review',offset:10})).rows.length,15);
  assert.deepEqual(requests.map(r=>[r.p_offset,r.p_limit]),[[5,10]]);
  assert.equal((await readList({filter:'deposit_review',offset:20})).rows.length,22);
  assert.match(source, /Load 10 more rentals/);
});
