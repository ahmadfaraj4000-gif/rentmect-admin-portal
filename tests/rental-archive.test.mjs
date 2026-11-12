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
  assert.match(workspace, /p_offset: rows.length/);
  assert.match(workspace, /p_limit: pageSize/);
  assert.match(source, /Load 5 more archived rentals/);
  assert.match(workspace, /params.offset \+ initialPageSize/);
  assert.doesNotMatch(source, /matchingRentals\.slice\(0, archiveVisibleCount\)/);
});

test('archive fetches five records initially and expands in five-record pages', async () => {
  const { default: vm } = await import('node:vm');
  const workspace = readFileSync(new URL('../src/useRentalWorkspace.js', import.meta.url), 'utf8');
  const start = workspace.indexOf('readList: async (params) => {') + 'readList: '.length;
  const end = workspace.indexOf(',\n      readDetail:', start);
  const requests = [];
  const readList = vm.runInNewContext(`(${workspace.slice(start, end)})`, {
    RENTAL_PAGE_SIZE: 25, ARCHIVE_PAGE_SIZE: 5,
    withReadRetry: fn => fn(),
    client: { rpc: async (_, args) => { requests.push(args); return { data: { rows: Array.from({length:Math.min(args.p_limit,12-args.p_offset)},(_,i)=>({id:args.p_offset+i})), total:12 } }; } },
  });
  assert.equal((await readList({filter:'archive',offset:0})).rows.length,5);
  assert.equal(requests.length,1); assert.equal(requests[0].p_limit,5);
  requests.length=0;
  assert.equal((await readList({filter:'archive',offset:5})).rows.length,10);
  assert.deepEqual(requests.map(r=>[r.p_offset,r.p_limit]),[[0,5],[5,5]]);
});


test('deposit review starts with five and loads ten more only on request', async () => {
  const { default: vm } = await import('node:vm');
  const workspace = readFileSync(new URL('../src/useRentalWorkspace.js', import.meta.url), 'utf8');
  const start = workspace.indexOf('readList: async (params) => {') + 'readList: '.length;
  const end = workspace.indexOf(',\n      readDetail:', start);
  const requests = [];
  const readList = vm.runInNewContext(`(${workspace.slice(start, end)})`, {
    RENTAL_PAGE_SIZE: 25, ARCHIVE_PAGE_SIZE: 5, withReadRetry: fn => fn(),
    client: { rpc: async (_, args) => { requests.push(args); return { data: { rows: Array.from({length:Math.min(args.p_limit,22-args.p_offset)},(_,i)=>({id:args.p_offset+i})), total:22 } }; } },
  });
  assert.equal((await readList({filter:'deposit_review',offset:0})).rows.length,5);
  assert.deepEqual(requests.map(r=>[r.p_offset,r.p_limit]),[[0,5]]);
  requests.length=0;
  assert.equal((await readList({filter:'deposit_review',offset:10})).rows.length,15);
  assert.deepEqual(requests.map(r=>[r.p_offset,r.p_limit]),[[0,5],[5,10]]);
  assert.equal((await readList({filter:'deposit_review',offset:20})).rows.length,22);
  assert.match(source, /Load 10 more rentals/);
});
