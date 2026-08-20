import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationUrl = new URL(
  '../supabase/migrations/20260820003000_allow_stripe_payment_step_completion.sql',
  import.meta.url,
);

test('Stripe rental-balance reconciliation can complete the payment workflow step', async () => {
  const migration = await readFile(migrationUrl, 'utf8');

  assert.match(
    migration,
    /drop constraint if exists rental_step_completions_completion_source_check/i,
  );
  assert.match(
    migration,
    /add constraint rental_step_completions_completion_source_check[\s\S]*'stripe_payment'/i,
  );
  assert.match(migration, /'admin_external_payment'/i);
  assert.match(migration, /'admin_deposit_collected'/i);
  assert.match(migration, /'admin_deposit_waived'/i);
});
