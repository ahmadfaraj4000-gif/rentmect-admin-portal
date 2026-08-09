import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');

test('deposit refunds preserve the Stripe release action and reveal backend blockers', () => {
  assert.match(source, /action: 'release_deposit'/);
  assert.match(source, /error\.context\.clone\(\)\.json\(\)/);
  assert.match(source, /detail = payload\?\.error \|\| detail/);
  assert.match(source, /Security deposit refund failed/);
  assert.match(source, /Security deposit refund submitted successfully/);
});
