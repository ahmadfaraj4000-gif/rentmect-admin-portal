import test from 'node:test';
import assert from 'node:assert/strict';
import { freshDomainLoad } from '../src/lib/freshDomainLoad.js';
import { withReadRetry } from '../src/requestDeadline.js';

const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };

test('a payment edit during refresh waits for a new read of the committed balance', async () => {
  const loads = new Map();
  const first = deferred();
  let reads = 0;
  let displayedBalance;
  let databaseBalance = 1447.67;
  const read = async () => {
    reads += 1;
    const snapshot = databaseBalance;
    if (reads === 1) await first.promise;
    displayedBalance = snapshot;
  };
  const initial = freshDomainLoad(loads, 'payments', false, read);
  await Promise.resolve();
  databaseBalance = 62.75;
  const afterEdit = freshDomainLoad(loads, 'payments', true, read);
  const realtimeEvent = freshDomainLoad(loads, 'payments', true, read);
  first.resolve();
  await Promise.all([initial, afterEdit, realtimeEvent]);
  assert.equal(reads, 2);
  assert.equal(displayedBalance, 62.75);
  assert.equal(loads.size, 0);
});

test('ordinary callers share a read and different domains can refresh independently', async () => {
  const loads = new Map();
  const pending = deferred();
  let reads = 0;
  const read = async () => { reads++; await pending.promise; };
  const one = freshDomainLoad(loads, 'core', false, read);
  const two = freshDomainLoad(loads, 'core', false, read);
  await freshDomainLoad(loads, 'payments', true, async () => {});
  assert.equal(one, two);
  pending.resolve();
  await one;
  assert.equal(reads, 1);
});

test('failed loads release the queue for retry', async () => {
  const loads = new Map();
  await assert.rejects(freshDomainLoad(loads, 'core', true, async () => { throw new Error('offline'); }), /offline/);
  assert.equal(loads.size, 0);
  await freshDomainLoad(loads, 'core', true, async () => {});
});

test('transient reads retry once while permission failures stay actionable', async () => {
  globalThis.window = globalThis;
  let attempts = 0;
  const result = await withReadRetry(() => {
    if (++attempts === 1) throw new Error('Failed to fetch');
    return { data: [{ balance: 62.75 }], error: null };
  }, 'Payments');
  assert.equal(attempts, 2);
  assert.equal(result.data[0].balance, 62.75);
  attempts = 0;
  const denied = await withReadRetry(() => { attempts++; return { error: new Error('permission denied') }; }, 'Payments');
  assert.equal(attempts, 1);
  assert.match(denied.error.message, /permission/);
  delete globalThis.window;
});

test('timed-out database reads are aborted before another attempt starts', async () => {
  globalThis.window = globalThis;
  const signals = [];
  try {
    const result = await withReadRetry(() => {
      if (signals.length) assert.equal(signals.at(-1).aborted, true);
      return {
        abortSignal(signal) { signals.push(signal); return new Promise(() => {}); },
      };
    }, 'Payments', 5);
    assert.equal(signals.length, 2);
    assert.ok(signals.every((signal) => signal.aborted));
    assert.equal(result.timedOut, true);
  } finally { delete globalThis.window; }
});
