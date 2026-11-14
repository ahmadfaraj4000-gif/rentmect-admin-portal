import test from 'node:test';
import assert from 'node:assert/strict';
import { createRentalSummaryReader } from '../src/lib/rentalSummaryReader.js';
import { createRentalWorkspace } from '../src/lib/rentalWorkspace.js';
const params = { filter: 'all', search: '', focusId: '', offset: 0 };
function fixture() {
  const calls = [];
  const reader = createRentalSummaryReader(async args => {
    calls.push(args);
    return { rows: Array.from({ length: Math.min(args.p_limit, 80 - args.p_offset) }, (_, i) => ({ id: String(i + args.p_offset) })), total: 80, counts: { all: 80 } };
  });
  return { calls, reader };
}
test('first page is bounded; load more reads only the new summaries', async () => {
  const { calls, reader } = fixture();
  assert.equal((await reader(params)).rows.length, 25);
  assert.equal((await reader({ ...params, offset: 25 })).rows.length, 50);
  assert.deepEqual(calls.map(c => [c.p_offset,c.p_limit]), [[0,25],[25,25]]);
  await reader({ ...params, offset: 25 }, { force: true });
  assert.deepEqual(calls.slice(2).map(c => c.p_offset), [0,25]);
});
test('deposit review starts at five and adds ten; changed views never reuse old prefixes', async () => {
  const { calls, reader } = fixture();
  await reader({ ...params, filter: 'deposit_review' });
  assert.equal((await reader({ ...params, filter: 'deposit_review', offset: 10 })).rows.length, 15);
  assert.deepEqual(calls.map(c => [c.p_offset,c.p_limit]), [[0,5],[5,10]]);
  await reader({ ...params, search: 'another customer' });
  assert.equal(calls.at(-1).p_offset, 0);
});
test('collapsed cards never fetch details during list, load more, or refresh', async () => {
  const { reader } = fixture(); const detailCalls = []; const hydrated = [];
  const w = createRentalWorkspace({ readList: reader, readDetail: async id => { detailCalls.push(id); return { rental: { id } }; }, readDetails: () => { throw Error('batch details must never load'); }, hydrate: d => hydrated.push(d.rental.id), changed: () => {} });
  await w.list(params); await w.list({ ...params, offset: 25 }); await w.refresh();
  assert.deepEqual(detailCalls, []);
  await w.open('2'); assert.deepEqual(detailCalls, ['2']);
  await w.refresh({ rentalId: '3' }); assert.deepEqual(detailCalls, ['2']);
  await w.open(''); await w.refresh(); assert.deepEqual(detailCalls, ['2']);
  await w.list({ ...params, filter: 'archive' }); assert.equal(w.getState().selectedId, '');
  assert.deepEqual(hydrated, ['2']); w.dispose();
});
test('load more leaves visible summaries in place while next page is pending', async () => {
  let resolve;
  const w = createRentalWorkspace({ readList: async p => p.offset ? new Promise(r => { resolve = r; }) : { rows: [{ id: '1' }], total: 2 }, changed: () => {}, hydrate: () => {} });
  await w.list(params); const more = w.list({ ...params, offset: 25 });
  assert.deepEqual(w.getState().rows, [{ id: '1' }]);
  await Promise.resolve();
  resolve({ rows: [{ id: '1' },{ id: '2' }], total: 2 }); await more;
  assert.equal(w.getState().rows.length, 2);
});

test('realtime merges only changed summaries and preserves authoritative membership/counts', async () => {
  let listReads = 0; const detailReads = []; const deltas = [];
  const first = { id: 'a', status: 'active' }, other = { id: 'b', status: 'active' };
  const w = createRentalWorkspace({
    readList: async () => { listReads++; return { rows: [first, other], total: 2, counts: { all: 2 } }; },
    readDetail: async id => { detailReads.push(id); return { rental: { id } }; },
    readChanges: async (p, ids, known) => { deltas.push({ ids, known }); return { rows: [{ id: 'b', status: 'overdue' }, { id: 'c', status: 'active' }], visible_ids: ['a','b','c'], total: 3, counts: { all: 3 } }; },
    changed: () => {}, hydrate: () => {},
  });
  await w.list(params); await w.open('a');
  await w.refresh({ rentalIds: ['b','c'] }); await new Promise(r => setImmediate(r));
  assert.equal(listReads, 1);
  assert.deepEqual(detailReads, ['a']);
  assert.equal(w.getState().rows[0], first, 'unchanged summary retains its identity');
  assert.equal(w.getState().rows[1].status, 'overdue');
  assert.equal(w.getState().counts.all, 3);
  assert.deepEqual(deltas, [{ids:['b','c'],known:['a','b']}]);
});
test('failed delta falls back to summaries without fetching collapsed details', async () => {
  let reads = 0;
  const w = createRentalWorkspace({readList: async () => { reads++; return {rows:[{id:'a'}],total:1}; }, readChanges: async () => { throw Error('endpoint unavailable'); }, readDetail: () => { throw Error('should never read detail'); }, changed: () => {}, hydrate: () => {} });
  await w.list(params); await w.refresh({rentalIds:['a']}); await new Promise(r => setImmediate(r));
  assert.equal(reads, 2); assert.equal(w.getState().error, '');
});
