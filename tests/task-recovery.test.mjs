import test from 'node:test';
import assert from 'node:assert/strict';
import { createPortalTransport, describeRequest } from '../src/lib/portalTransport.js';
import { draftKey, readDraft, writeDraft, removeDraft, subscribeTaskDialogs, trackTaskDialog } from '../src/lib/taskDraft.js';

const memoryStorage = () => {
  const values = new Map();
  return { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
};
const writeOptions = { method: 'POST', body: JSON.stringify({ action: 'admin_charge_saved_card', chargeId: 'charge-1' }) };
const endpoint = 'https://example.test/functions/v1/stripe-web-hook';
const json = (body = {}, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

test('stalled writes time out, survive reload, and cannot be replayed without review', async () => {
  const storage = memoryStorage(); let sends = 0; let signal;
  const transport = createPortalTransport({ storage, timeoutMs: 10, fetch: (_, options) => {
    sends++; signal = options.signal; return new Promise(() => {});
  } });
  transport.setOwner('admin');
  await assert.rejects(transport.fetch(endpoint, writeOptions), /Check saved result/);
  assert.equal(signal.aborted, true);
  assert.equal(transport.snapshot().length, 1);
  const afterReload = createPortalTransport({ storage, fetch: async () => { sends++; return json(); } });
  afterReload.setOwner('admin');
  await assert.rejects(afterReload.fetch(endpoint, writeOptions), /Check saved result/);
  assert.equal(sends, 1);
  afterReload.acknowledge(afterReload.snapshot()[0].key);
  await afterReload.fetch(endpoint, writeOptions);
  assert.equal(sends, 2);
  assert.equal(afterReload.snapshot().length, 0);
});

test('reload during an in-flight write requires review too', async () => {
  const storage = memoryStorage(); let resolve;
  const first = createPortalTransport({ storage, fetch: () => new Promise(r => { resolve = r; }) });
  first.setOwner('admin');
  const pending = first.fetch(endpoint, writeOptions);
  const second = createPortalTransport({ storage, fetch: async () => json() });
  second.setOwner('admin');
  assert.equal(second.snapshot().length, 1);
  resolve(json()); await pending;
});

test('successful and rejected writes release their guard; server errors remain uncertain', async () => {
  let status = 200;
  const transport = createPortalTransport({ storage: memoryStorage(), fetch: async () => json({}, status) });
  transport.setOwner('admin');
  await transport.fetch(endpoint, writeOptions);
  await transport.fetch(endpoint, writeOptions);
  assert.equal(transport.snapshot().length, 0);
  status = 403; await transport.fetch(endpoint, writeOptions);
  assert.equal(transport.snapshot().length, 0);
  status = 503; await transport.fetch(endpoint, writeOptions);
  assert.equal(transport.snapshot().length, 1);
});

test('response-body stalls are bounded, not just waiting for headers', async () => {
  const transport = createPortalTransport({ timeoutMs: 10, fetch: async () => ({ arrayBuffer: () => new Promise(() => {}) }) });
  await assert.rejects(transport.fetch('https://example.test/rest/v1/rentals'), /took too long/);
});

test('read-only RPCs can recover without creating a pending-write guard', async () => {
  let fail = true;
  const transport = createPortalTransport({ storage: memoryStorage(), timeoutMs: 10,
    fetch: async () => { if (fail) throw new Error('offline'); return json(); } });
  transport.setOwner('admin');
  const url = 'https://example.test/rest/v1/rpc/admin_rental_detail';
  await assert.rejects(transport.fetch(url, { method: 'POST', body: '{"p_rental_id":"r1"}' }), /offline/);
  assert.equal(transport.snapshot().length, 0);
  fail = false; await transport.fetch(url, { method: 'POST' });
});

test('sign-out and account switching do not expose another staff member’s recovery entries', async () => {
  let reject;
  const transport = createPortalTransport({ storage: memoryStorage(), fetch: () => new Promise((_, r) => { reject = r; }) });
  transport.setOwner('a');
  const pending = transport.fetch(endpoint, writeOptions);
  transport.setOwner('b'); reject(new Error('offline'));
  await assert.rejects(pending);
  assert.equal(transport.snapshot().length, 0);
  transport.setOwner('a');
  assert.equal(transport.snapshot().length, 1);
});

test('transport preserves abort signals and response headers', async () => {
  const controller = new AbortController(); let innerSignal;
  const transport = createPortalTransport({ fetch: async (_, options) => {
    innerSignal = options.signal;
    return new Response(null, { status: 204, headers: { 'content-range': '0-1/2' } });
  } });
  const result = await transport.fetch('https://example.test/rest/v1/rentals', { signal: controller.signal });
  assert.ok(innerSignal);
  assert.equal(result.status, 204);
  assert.equal(result.headers.get('content-range'), '0-1/2');
  assert.equal(describeRequest('https://example.test/rest/v1/rpc/admin_preview_rental_extension', { method: 'POST' }).read, true);
});

test('drafts restore allowed fields only, expire, clear on success and isolate accounts', () => {
  const storage = memoryStorage(); const key = draftKey('a', 'payment:r1');
  const initial = { amount: '', reference: '', confirmed: false, signature: '' };
  const fields = ['amount', 'reference'];
  writeDraft(storage, key, { amount: '123', reference: 'receipt', confirmed: true, signature: 'sensitive' }, fields, 100);
  assert.equal(storage.getItem(key).includes('sensitive'), false);
  assert.deepEqual(readDraft(storage, key, initial, fields, 200), { ...initial, amount: '123', reference: 'receipt' });
  assert.deepEqual(readDraft(storage, draftKey('b', 'payment:r1'), initial, fields, 200), initial);
  assert.deepEqual(readDraft(storage, key, initial, fields, 100 + 13 * 60 * 60 * 1000), initial);
  writeDraft(storage, key, { amount: '123' }, fields, 100);
  removeDraft(storage, key);
  assert.deepEqual(readDraft(storage, key, initial, fields, 200), initial);
});

test('nested dialogs keep list protection until the last dialog closes', () => {
  const states = []; const unsubscribe = subscribeTaskDialogs(value => states.push(value));
  const closeFirst = trackTaskDialog(); const closeSecond = trackTaskDialog();
  closeFirst(); assert.equal(states.at(-1), true);
  closeSecond(); assert.equal(states.at(-1), false);
  closeSecond(); assert.equal(states.at(-1), false);
  unsubscribe();
});

test('a malformed acknowledgement cannot silently clear an uncertain write', async () => {
  for (const response of [new Response('<html>proxy</html>'), new Response('{broken', { headers: { 'Content-Type': 'application/json' } })]) {
    const transport = createPortalTransport({ storage: memoryStorage(), fetch: async () => response });
    transport.setOwner('admin');
    await assert.rejects(transport.fetch(endpoint, writeOptions));
    assert.equal(transport.snapshot().length, 1);
  }
});

test('the installed Supabase SDK returns bounded errors without replaying a stalled mutation', async () => {
  const { createClient } = await import('@supabase/supabase-js');
  let sends = 0;
  const transport = createPortalTransport({ storage: memoryStorage(), timeoutMs: 10,
    fetch: () => { sends++; return new Promise(() => {}); } });
  transport.setOwner('admin');
  const client = createClient('https://example.test', 'fixture-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: transport.fetch },
  });
  try {
    const result = await client.functions.invoke('stripe-web-hook', { body: { action: 'admin_charge_saved_card', chargeId: 'charge-1' } });
    assert.ok(result.error);
    assert.equal(transport.snapshot().length, 1);
    const repeated = await client.functions.invoke('stripe-web-hook', { body: { action: 'admin_charge_saved_card', chargeId: 'charge-1' } });
    assert.ok(repeated.error);
    assert.equal(sends, 1);
    const rpc = await client.rpc('admin_preview_rental_extension', { p_rental_id: 'r1' });
    assert.ok(rpc.error);
    assert.equal(sends, 2);
    assert.equal(transport.snapshot().length, 1);
  } finally { await client.auth.stopAutoRefresh(); }
});

test('ticket queries remain readable through overlapping requests, failures and retries', async () => {
  for (const name of ['admin_ticket_list', 'admin_ticket_detail', 'admin_ticket_vehicles', 'admin_ticket_lookup', 'admin_ticket_candidates', 'admin_ticket_customer_flags']) {
    const url = `https://example.test/rest/v1/rpc/${name}`;
    const options = { method: 'POST', body: JSON.stringify({ p_id: 'ticket-1' }) };
    assert.equal(describeRequest(url, options).read, true, name);
    let fail = true;
    const transport = createPortalTransport({ storage: memoryStorage(), fetch: async () => {
      await new Promise(resolve => setTimeout(resolve, 1));
      if (fail) throw new Error('offline');
      return json({ rows: [], total: 0 });
    } });
    transport.setOwner('admin');
    const initial = await Promise.allSettled([transport.fetch(url, options), transport.fetch(url, options)]);
    assert.ok(initial.every(result => result.status === 'rejected' && result.reason.message === 'offline'), name);
    assert.equal(transport.snapshot().length, 0, name);
    fail = false;
    const responses = await Promise.all([transport.fetch(url, options), transport.fetch(url, options)]);
    assert.ok(responses.every(response => response.ok), name);
    assert.equal(transport.snapshot().length, 0, name);
  }
});

test('upgrade automatically clears stale ticket-read recovery entries and preserves uncertain writes', async () => {
  const storage = memoryStorage();
  const readNames = ['admin_ticket_list', 'admin_ticket_detail', 'admin_ticket_vehicles', 'admin_ticket_lookup', 'admin_ticket_candidates', 'admin_ticket_customer_flags'];
  const writeNames = ['admin_ticket_save', 'admin_ticket_action', 'admin_ticket_attachment', 'admin_ticket_customer_flag'];
  const entry = name => ({ key: `/rest/v1/rpc/${name}?`, label: name.replaceAll('_', ' '), read: false, status: 'sending', startedAt: 1 });
  storage.setItem('rentmect:pending-operations:v1:admin', JSON.stringify([...readNames, ...writeNames].map(entry)));
  const transport = createPortalTransport({ storage, fetch: async () => json({ rows: [], total: 0 }) });
  transport.setOwner('admin');
  assert.deepEqual(transport.snapshot().map(item => item.key), writeNames.map(name => entry(name).key));
  assert.equal(JSON.parse(storage.getItem('rentmect:pending-operations:v1:admin')).length, writeNames.length);
  await transport.fetch('https://example.test/rest/v1/rpc/admin_ticket_list', { method: 'POST', body: '{}' });
  await assert.rejects(transport.fetch('https://example.test/rest/v1/rpc/admin_ticket_save', { method: 'POST', body: '{}' }), /Check saved result/);
  assert.equal(transport.snapshot().length, writeNames.length);
});

test('ticket mutations and unknown RPCs still require review after a lost write response', async () => {
  for (const name of ['admin_ticket_save', 'admin_ticket_action', 'admin_ticket_attachment', 'admin_ticket_customer_flag', 'admin_ticket_future_mutation']) {
    const url = `https://example.test/rest/v1/rpc/${name}`;
    const options = { method: 'POST', body: JSON.stringify({ p_id: 'ticket-1' }) };
    assert.equal(describeRequest(url, options).read, false, name);
    let sends = 0;
    const transport = createPortalTransport({ storage: memoryStorage(), fetch: async () => { sends++; throw new Error('offline'); } });
    transport.setOwner('admin');
    await assert.rejects(transport.fetch(url, options), /offline/);
    await assert.rejects(transport.fetch(url, options), /Check saved result/);
    assert.equal(sends, 1, name);
    assert.equal(transport.snapshot().length, 1, name);
  }
});

test('installed Supabase SDK can retry a ticket list after failure without creating a recovery task', async () => {
  const { createClient } = await import('@supabase/supabase-js');
  let fail = true;
  const transport = createPortalTransport({ storage: memoryStorage(), fetch: async () => {
    if (fail) throw new Error('offline');
    return json({ rows: [{ id: 'ticket-1' }], total: 1 });
  } });
  transport.setOwner('admin');
  const client = createClient('https://example.test', 'fixture-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: transport.fetch },
  });
  try {
    const failed = await client.rpc('admin_ticket_list', { p_status: 'unresolved' });
    assert.ok(failed.error);
    assert.equal(transport.snapshot().length, 0);
    fail = false;
    const results = await Promise.all([client.rpc('admin_ticket_list', {}), client.rpc('admin_ticket_list', {})]);
    assert.ok(results.every(result => !result.error && result.data.total === 1));
    assert.equal(transport.snapshot().length, 0);
  } finally { await client.auth.stopAutoRefresh(); }
});
