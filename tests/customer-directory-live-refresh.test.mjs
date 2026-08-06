import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8');

test('customer records use a dedicated retryable directory dataset', () => {
  assert.match(source, /customers: \['customer-directory', 'core', 'workflow', 'templates'\]/);
  assert.match(source, /Customer directory retry/);
  assert.match(source, /force: domain === 'customer-directory' && \['customers', 'new-booking'\]\.includes\(activeTab\)/);
});

test('profile changes refresh the customer directory through the consolidated owner', () => {
  assert.match(source, /channel\('admin-payment-source-of-truth'\)/);
  assert.match(source, /table: 'profiles'[^\n]+scheduleDomainRefresh\('customer-directory'\)/);
});

test('assisted booking does not silently hide administrator accounts', () => {
  assert.match(source, /const customers = \[\.\.\.profiles\]/);
  assert.doesNotMatch(source, /profile\.role !== 'admin'/);
  assert.doesNotMatch(source, /slice\(0, 12\)/);
  assert.match(source, /customer\.role[^\n]+Administrator/);
});

test('an open admin tab detects a newer deployed JavaScript bundle', () => {
  assert.match(source, /admin-build-check/);
  assert.match(source, /A newer Admin Portal version is available/);
  assert.match(source, /label: 'Reload now'/);
  assert.match(source, /searchParams\.set\('admin-build'/);
  assert.match(source, /window\.location\.replace\(reloadUrl\.toString\(\)\)/);
  assert.match(source, /className="notice-controls"/);
});
