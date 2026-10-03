import test from 'node:test';
import assert from 'node:assert/strict';
import { createRentalWorkspace, replaceRentalRecords } from '../src/lib/rentalWorkspace.js';
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
const page = (id) => ({ rows: [{ id }], total: 1, offset: 0, counts: { needs_action: 1 } });
const params = (filter = 'needs_action', offset = 0) => ({ filter, search: '', focusId: '', offset });
function setup(overrides = {}) {
  const reads = []; const hydrated = []; const states = [];
  const workspace = createRentalWorkspace({
    readList: async (p) => { reads.push(p); return page(p.filter); },
    readDetail: async (id) => ({ rental: { id } }), hydrate: (data) => hydrated.push(data),
    changed: (state) => states.push(state), ...overrides,
  });
  return { workspace, reads, hydrated, states };
}

test('opening Needs Action only requests that page; switching back uses its cache', async () => {
  const { workspace, reads, hydrated } = setup();
  await workspace.list(params());
  assert.deepEqual(reads, [params()]);
  assert.equal(hydrated.length, 0);
  await workspace.list(params('archive'));
  await workspace.list(params());
  assert.equal(reads.length, 2);
  assert.equal(workspace.getState().rows[0].id, 'needs_action');
});

test('a delayed previous filter cannot overwrite the current filter', async () => {
  const pending = deferred();
  const { workspace } = setup({ readList: async (p) => p.filter === 'archive' ? pending.promise : page('needs_action') });
  const old = workspace.list(params('archive'));
  await workspace.list(params());
  pending.resolve(page('archive'));
  await old;
  assert.equal(workspace.getState().rows[0].id, 'needs_action');
});

test('pagination and search have separate cache entries', async () => {
  const { workspace, reads } = setup();
  await workspace.list(params('archive', 0));
  await workspace.list(params('archive', 25));
  await workspace.list({ ...params('archive'), search: 'Ayleen' });
  assert.deepEqual(reads.map((p) => [p.offset, p.search]), [[0, ''], [25, ''], [0, 'Ayleen']]);
});

test('details are loaded on demand, and an old detail response cannot replace the selected rental', async () => {
  const slow = deferred();
  const { workspace, hydrated } = setup({ readDetail: async (id) => id === 'old' ? slow.promise : { rental: { id } } });
  const old = workspace.open('old');
  await workspace.open('new');
  slow.resolve({ rental: { id: 'old' } });
  await old;
  assert.deepEqual(hydrated.map((d) => d.rental.id), ['new']);
  assert.equal(workspace.getState().selectedId, 'new');
  assert.equal(workspace.getState().detailReady, true);
});

test('a committed save refreshes its selected detail without waiting for the list', async () => {
  let listReads = 0; let detailReads = 0; const slow = deferred();
  const { workspace } = setup({
    readList: async () => ++listReads === 1 ? page('r1') : slow.promise,
    readDetail: async (id) => { detailReads++; return { rental: { id } }; },
  });
  await workspace.list(params()); await workspace.open('r1');
  await workspace.refresh({ rentalId: 'r1' });
  assert.equal(detailReads, 2);
  assert.equal(workspace.getState().detailLoading, false);
  assert.equal(workspace.getState().loading, true);
  slow.resolve(page('r1'));
});

test('an unrelated rental event updates the list without reloading the selected record', async () => {
  let reads = 0;
  const { workspace } = setup({ readDetail: async (id) => { reads++; return { rental: { id } }; } });
  await workspace.list(params()); await workspace.open('r1');
  await workspace.refresh({ rentalId: 'r2' });
  assert.equal(reads, 1);
});

test('a save during a detail read drains a fresh read of committed data', async () => {
  const pending = deferred(); let value = 10; let reads = 0;
  const { workspace, hydrated } = setup({ readDetail: async (id) => {
    const balance = value; if (++reads === 1) await pending.promise; return { rental: { id }, balance };
  } });
  const opening = workspace.open('r1'); await Promise.resolve();
  value = 20;
  const refresh = workspace.refresh({ rentalId: 'r1' });
  pending.resolve(); await Promise.all([opening, refresh]);
  assert.equal(reads, 2); assert.equal(hydrated.at(-1).balance, 20);
});

test('failed detail reads never enable actions with an incomplete ledger', async () => {
  const { workspace, hydrated } = setup({ readDetail: async () => { throw new Error('offline'); } });
  await workspace.open('r1');
  assert.equal(workspace.getState().detailReady, false);
  assert.equal(workspace.getState().detailError, 'offline');
  assert.equal(hydrated.length, 0);
});

test('closing or disposing before a response prevents late hydration', async () => {
  for (const dispose of [false, true]) {
    const pending = deferred(); const { workspace, hydrated } = setup({ readDetail: () => pending.promise });
    const opening = workspace.open('r1'); await Promise.resolve();
    if (dispose) workspace.dispose(); else await workspace.open('');
    pending.resolve({ rental: { id: 'r1' } }); await opening;
    assert.equal(hydrated.length, 0);
  }
});

test('record refresh removes deleted charges and keeps unrelated rentals', () => {
  const result = replaceRentalRecords([{ id: 'removed', rental_id: 'r1' }, { id: 'other', rental_id: 'r2' }],
    [{ id: 'new', rental_id: 'r1' }], 'r1');
  assert.deepEqual(result.map((x) => x.id), ['other', 'new']);
});
