import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

test('session refresh and concurrent portal reads finish when a listener subscribes during startup', { timeout: 5000 }, async () => {
  const user = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated' };
  const session = { user, access_token: 'test-expiring-token', refresh_token: 'test-refresh', token_type: 'bearer', expires_in: 30, expires_at: Math.floor(Date.now() / 1000) + 30 };
  const storage = new Map([['auth-recovery-test', JSON.stringify(session)]]);
  let refreshes = 0;
  let reads = 0;
  const client = createClient('https://example.supabase.co', 'test-anon-key', {
    auth: {
      storageKey: 'auth-recovery-test', autoRefreshToken: true, detectSessionInUrl: false,
      storage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
    },
    global: { fetch: async (url, options) => {
      if (String(url).includes('/auth/v1/token')) {
        refreshes++;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return new Response(JSON.stringify({ ...session, access_token: 'test-refreshed-token', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      reads++;
      assert.equal(new Headers(options.headers).get('Authorization'), 'Bearer test-refreshed-token');
      return new Response(JSON.stringify([{ id: 'rental-451' }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } },
  });
  const { data: { subscription } } = client.auth.onAuthStateChange(() => {});
  try {
    const results = await Promise.all(Array.from({ length: 20 }, () => client.from('rentals').select('id')));
    assert.equal(refreshes, 1);
    assert.equal(reads, 20);
    assert.ok(results.every((result) => !result.error && result.data[0].id === 'rental-451'));
    assert.equal((await client.auth.getSession()).data.session.access_token, 'test-refreshed-token');
  } finally {
    subscription.unsubscribe();
    await client.auth.stopAutoRefresh();
  }
});
