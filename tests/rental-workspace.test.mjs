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

test('inline cards hydrate only the current filter before exposing its rows', async () => {
  const pending = deferred(); const detailReads = [];
  const { workspace, hydrated } = setup({ inline: true, readDetail: async (id) => {
    detailReads.push(id); await pending.promise; return { rental: { id } };
  } });
  const loading = workspace.list(params());
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(workspace.getState().rows.length, 0);
  assert.deepEqual(detailReads, ['needs_action']);
  pending.resolve(); await loading;
  assert.deepEqual(hydrated.map((data) => data.rental.id), ['needs_action']);
  assert.equal(workspace.getState().rows[0].id, 'needs_action');
  await workspace.open('needs_action');
  assert.equal(detailReads.length, 1, 'inline expansion uses the complete cached record');
});

test('late inline data from a previous filter never hydrates the visible cards', async () => {
  const pending = deferred();
  const { workspace, hydrated } = setup({ inline: true, readDetail: async (id) => {
    if (id === 'archive') await pending.promise;
    return { rental: { id } };
  } });
  const old = workspace.list(params('archive'));
  await new Promise((resolve) => setImmediate(resolve));
  await workspace.list(params()); pending.resolve(); await old;
  assert.deepEqual(hydrated.map((data) => data.rental.id), ['needs_action']);
});

test('inline archive expansion retains existing rows and reuses their detail cache', async () => {
  const detailReads = []; const pending = deferred();
  const { workspace } = setup({ inline: true,
    readList: async (p) => ({ ...page('a'), rows: p.offset ? [{ id: 'a' }, { id: 'b' }] : [{ id: 'a' }], total: 2, offset: p.offset }),
    readDetail: async (id) => { detailReads.push(id); if (id === 'b') await pending.promise; return { rental: { id } }; },
  });
  await workspace.list(params('archive'));
  const more = workspace.list(params('archive', 25));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(workspace.getState().rows.map((row) => row.id), ['a']);
  pending.resolve(); await more;
  assert.deepEqual(workspace.getState().rows.map((row) => row.id), ['a', 'b']);
  assert.deepEqual(detailReads, ['a', 'b']);
});

test('failed inline hydration never renders a card with missing financial records and can retry', async () => {
  let fails = true;
  const { workspace, hydrated } = setup({ inline: true, readDetail: async (id) => {
    if (fails) throw new Error('payment records unavailable'); return { rental: { id } };
  } });
  await workspace.list(params());
  assert.equal(workspace.getState().rows.length, 0);
  assert.equal(hydrated.length, 0);
  assert.equal(workspace.getState().error, 'payment records unavailable');
  fails = false; await workspace.list(undefined, true);
  assert.equal(workspace.getState().rows.length, 1);
  assert.equal(workspace.getState().error, '');
});

test('inline save waits only for the edited card while the filter refresh runs in the background', async () => {
  let calls = 0; let balance = 10; const pending = deferred();
  const { workspace, hydrated } = setup({ inline: true,
    readList: async () => ++calls === 1 ? page('a') : pending.promise,
    readDetail: async (id) => ({ rental: { id }, balance }),
  });
  await workspace.list(params()); await workspace.open('a'); balance = 20;
  await workspace.refresh();
  assert.equal(hydrated.at(-1).balance, 20);
  assert.equal(workspace.getState().loading, true);
  pending.resolve(page('a'));
});

test('inline hydration caps concurrent requests at five', async () => {
  let active = 0; let maximum = 0;
  const { workspace } = setup({ inline: true,
    readList: async () => ({ ...page('a'), rows: Array.from({ length: 12 }, (_, i) => ({ id: String(i) })) }),
    readDetail: async (id) => { active++; maximum = Math.max(maximum, active); await new Promise((resolve) => setImmediate(resolve)); active--; return { rental: { id } }; },
  });
  await workspace.list(params());
  assert.equal(maximum, 5);
  assert.equal(workspace.getState().rows.length, 12);
});

test('an unrelated refresh during detail loading finishes with current data and no stuck spinner', async () => {
  const pending = deferred(); let reads = 0;
  const { workspace } = setup({ inline: true, readList: async () => page('r1'), readDetail: async () => {
    reads++; if (reads === 2) return pending.promise;
    return { rental: { id: 'r1', version: reads } };
  } });
  await workspace.list(params());
  const opening = workspace.open('r1', true);
  await new Promise(resolve => setImmediate(resolve));
  workspace.invalidate();
  await workspace.refresh({ details: false });
  pending.resolve({ rental: { id: 'r1', version: 2 } });
  await opening;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(workspace.getState().detailLoading, false);
  assert.equal(workspace.getState().detailReady, true);
  assert.equal(workspace.getState().detailError, '');
  assert.ok(reads >= 3, 'a stale response is replaced by a fresh read');
});

test('background filter changes cannot remove a card with an open task', async () => {
  let rows = [{ id: 'r1' }];
  const { workspace } = setup({ inline: true, readList: async () => ({ rows, total: rows.length, counts: {} }) });
  await workspace.list(params());
  workspace.setEditing(true);
  rows = [];
  await workspace.refresh({ details: false });
  assert.equal(workspace.getState().rows[0].id, 'r1');
  workspace.setEditing(false);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(workspace.getState().rows, []);
  assert.equal(workspace.getState().loading, false);
});

test('an already running list read also preserves an open task until it closes', async () => {
  const pending = deferred(); let calls = 0;
  const { workspace } = setup({ inline: true, readList: async () => ++calls === 1 ? page('r1') : pending.promise });
  await workspace.list(params());
  const refreshing = workspace.list(undefined, true);
  await new Promise(resolve => setImmediate(resolve));
  workspace.setEditing(true);
  pending.resolve({ rows: [], total: 0, counts: {} });
  await refreshing;
  assert.equal(workspace.getState().rows[0].id, 'r1');
  workspace.setEditing(false);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(workspace.getState().rows, []);
});

test('inline batch makes one request per 25 uncached cards and reuses complete records', async () => {
  const batches=[]; let singles=0;
  const {workspace,hydrated}=setup({inline:true,
    readList:async()=>({rows:Array.from({length:25},(_,i)=>({id:String(i)})),total:25}),
    readDetail:async()=>{singles++;throw new Error('Unexpected individual request');},
    readDetails:async(ids)=>{batches.push(ids);return ids.map(id=>({rental:{id}}));},
  });
  await workspace.list(params('archive'));
  assert.equal(batches.length,1);assert.equal(batches[0].length,25);
  assert.equal(hydrated.length,25);assert.equal(singles,0);
  await workspace.open('0');assert.equal(singles,0);
  await workspace.list(params('archive'));assert.equal(batches.length,1);
});

test('batch rejects missing or duplicate records before displaying financial actions',async()=>{
  for(const response of [[],[{rental:{id:'wrong'}}],null]) {
    const {workspace,hydrated}=setup({inline:true,readDetails:async()=>response});
    await workspace.list(params());
    assert.equal(hydrated.length,0);assert.equal(workspace.getState().rows.length,0);
    assert.match(workspace.getState().error,/incomplete/);
  }
});

test('stale batch never overwrites the current filter and failed batches can be retried',async()=>{
  const pending=deferred();let fail=true;
  const {workspace,hydrated}=setup({inline:true,readDetails:async(ids)=>{
    if(ids[0]==='archive')return pending.promise;
    if(fail)throw new Error('offline');
    return ids.map(id=>({rental:{id}}));
  }});
  const old=workspace.list(params('archive'));await new Promise(resolve=>setImmediate(resolve));
  await workspace.list(params());assert.equal(hydrated.length,0);
  fail=false;await workspace.list(undefined,true);
  pending.resolve([{rental:{id:'archive'}}]);await old;
  assert.deepEqual(hydrated.map(d=>d.rental.id),['needs_action']);
  assert.equal(workspace.getState().error,'');
});

test('batch cache is invalidated on mutations and large lists stay bounded',async()=>{
  const batches=[];let version=1;
  const {workspace,hydrated}=setup({inline:true,
    readList:async()=>({rows:Array.from({length:52},(_,i)=>({id:String(i)})),total:52}),
    readDetails:async(ids)=>{batches.push(ids);return ids.map(id=>({rental:{id},version}));},
  });
  await workspace.list(params());assert.deepEqual(batches.map(b=>b.length),[25,25,2]);
  version=2;workspace.invalidate();await workspace.list(undefined,true);
  assert.equal(hydrated.at(-1).version,2);assert.equal(batches.length,6);
});
