import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { withRequestDeadline } from '../src/requestDeadline.js';

const source = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
const start = source.indexOf('  useEffect(() => {\n    let active = true;\n    let sessionEventReceived');
const end = source.indexOf('\n\n  useEffect(', start);
function bootstrap(getSession) {
  const state = { loading: true, session: null, error: '', unsubscribed: false };
  let callback, cleanup;
  vm.runInNewContext(source.slice(start, end), {
    startupAttempt: 0,
    useEffect: (effect) => { cleanup = effect(); },
    supabase: { auth: {
      getSession,
      onAuthStateChange: (cb) => { callback = cb; return { data: { subscription: { unsubscribe: () => { state.unsubscribed = true; } } } }; },
    } },
    withRequestDeadline: (request, label) => withRequestDeadline(request, label, 10),
    userFacingPortalError: (error) => error.message,
    setSession: (session) => { state.session = session; },
    setLoading: (loading) => { state.loading = loading; },
    setStartupError: (error) => { state.error = error; },
  });
  return { state, event: (...args) => callback(...args), cleanup: () => cleanup() };
}

test('a stalled session request exits loading with a retryable error', async () => {
  globalThis.window = globalThis;
  try {
    const f = bootstrap(() => new Promise(() => {}));
    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.equal(f.state.loading, false);
    assert.match(f.state.error, /Session verification request timed out/);
    f.cleanup();
    assert.equal(f.state.unsubscribed, true);
  } finally { delete globalThis.window; }
});

test('a newer sign-in event is not overwritten by an old startup response', async () => {
  globalThis.window = globalThis;
  try {
    let resolve;
    const f = bootstrap(() => new Promise((r) => { resolve = r; }));
    const session = { user: { id: 'admin' } };
    f.event('SIGNED_IN', session);
    resolve({ data: { session: null }, error: null });
    await new Promise((done) => setImmediate(done));
    assert.equal(f.state.session, session);
    assert.equal(f.state.error, '');
    assert.equal(f.state.loading, false);
    f.cleanup();
  } finally { delete globalThis.window; }
});
