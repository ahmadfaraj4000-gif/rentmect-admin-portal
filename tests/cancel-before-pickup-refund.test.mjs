import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { transformSync } from 'rolldown/experimental';

const source = readFileSync(new URL('../../supabase/functions/stripe-web-hook/index.ts', import.meta.url), 'utf8');
const release = source.slice(source.indexOf('async function releaseSecurityDeposit('), source.indexOf('\nfunction normalizedRefundStatus('));
const cancel = source.slice(source.indexOf('async function cancelBeforePickupAndRefundDeposit('), source.indexOf('\nasync function handleApiAction('));
const compiled = transformSync('refund.ts', `${release}\n${cancel}`).code;
function fixture(options = {}) {
  const rental = { id: 'rental', status: 'cancelled', cancelled_before_pickup_at: '2026-09-16', deposit_status: 'held', stripe_payment_intent_id: 'pi_original', ...options.rental };
  const allocations = [{ id: 'allocation', payment_provider: 'stripe', stripe_payment_intent_id: 'pi_original', amount_held: 300, amount_released: 0, status: 'held' }];
  const keys = [], permissions = [], rpcCalls = [], refunds = new Map();
  let loseResponse = options.loseResponse;
  const context = vm.createContext({
    cents: (n) => Math.round(n * 100), moneyDescription: (n) => `$${n / 100}`,
    adminClient: {
      from(table) {
        let update = false;
        const q = { select() { return q; }, eq() { return q; }, in() { return q; }, update() { update = true; return q; },
          single() { return Promise.resolve({ data: rental }); },
          then(resolve) { return Promise.resolve({ data: update ? null : table === 'rental_deposit_allocations' ? allocations : options.charges || [] }).then(resolve); } };
        return q;
      },
      async rpc(name) {
        rpcCalls.push(name);
        if (name === 'prepare_before_pickup_deposit_refund') { rental.status = 'cancelled'; rental.cancelled_before_pickup_at = 'now'; }
        return { data: name === 'rentmect_deposit_chain_release_blockers' ? options.blockers || [] : null };
      },
    },
    stripe: {
      charges: { list: async () => ({ data: [{ paid: true, captured: true, amount: 36275, amount_refunded: options.stripeRefunded ?? 6275 }] }) },
      refunds: { create: async (params, { idempotencyKey }) => {
        keys.push(idempotencyKey);
        if (!refunds.has(idempotencyKey)) refunds.set(idempotencyKey, { id: 're_deposit', status: options.refundStatus || 'succeeded', amount: params.amount });
        return refunds.get(idempotencyKey);
      } },
    },
    requireAdmin: async (_, permission) => {
      permissions.push(permission);
      if (options.deny === permission) throw new Error('Permission denied');
      return { user: { id: 'admin' }, profile: { email: 'admin@example.com' } };
    },
    findActiveAdminInstallment: async () => options.attempt || null,
    updateAllocationRefundState: async () => { if (loseResponse) { loseResponse = false; throw new Error('Database response lost'); } },
    refreshDepositAllocationSummary: async () => ({ status: 'released' }),
    writeDepositAudit: async () => {},
  });
  vm.runInContext(compiled, context);
  return { keys, permissions, rpcCalls, refunds, rental,
    release: () => context.releaseSecurityDeposit('rental', 'manual'),
    cancel: () => context.cancelBeforePickupAndRefundDeposit({}, { rentalId: 'rental', reason: 'Cancelled before pickup' }) };
}
test('uncompleted and unguarded cancelled bookings cannot release a deposit', async () => {
  for (const status of ['document_review', 'active', 'cancelled']) {
    const f = fixture({ rental: { status, cancelled_before_pickup_at: null } });
    await assert.rejects(f.release(), /complete the rental return/);
    assert.equal(f.keys.length, 0);
  }
});
test('guarded cancellation refunds exactly the remaining allocation', async () => {
  const f = fixture();
  const result = await f.release();
  assert.equal(result.amount, 30000);
  assert.equal(result.status, 'released');
  assert.deepEqual(f.keys, ['rentmect-security-deposit-allocation-allocation']);
});
test('a cancelled booking still respects other-chain, charge, and open-payment blockers', async () => {
  for (const options of [
    { blockers: [{ type: 'inspection_incomplete', rental_id: 'another-rental', detail: 'Other inspection' }] },
    { blockers: [{ type: 'unresolved_toll', rental_id: 'rental', detail: 'Unpaid toll' }] },
    { charges: [{ total_amount: 25, status: 'pending' }] },
    { attempt: { id: 'attempt', status: 'checkout_open' } },
  ]) {
    const f = fixture(options);
    await assert.rejects(f.release());
    assert.equal(f.keys.length, 0);
  }
});
test('lost response followed by retry uses the same Stripe refund key', async () => {
  const f = fixture({ loseResponse: true });
  await assert.rejects(f.release(), /response lost/);
  await f.release();
  assert.equal(f.keys.length, 2);
  assert.equal(f.refunds.size, 1);
});
test('released and processing deposits cannot be refunded again', async () => {
  for (const status of ['released', 'release_pending']) {
    const f = fixture({ rental: { deposit_status: status } });
    assert.equal((await f.release()).duplicate, true);
    assert.equal(f.keys.length, 0);
  }
});
test('cancellation checks permissions and Stripe balance before writing cancellation', async () => {
  for (const options of [{ stripeRefunded: 0 }, { stripeRefunded: 36275 }, { deny: 'rental.cancel' }, { attempt: { id: 'open' } }]) {
    const f = fixture({ ...options, rental: { status: 'document_review', cancelled_before_pickup_at: null } });
    await assert.rejects(f.cancel());
    assert.equal(f.rpcCalls.includes('prepare_before_pickup_deposit_refund'), false);
    assert.equal(f.keys.length, 0);
  }
});
test('eligible booking is durably cancelled before Stripe refund; retry resumes', async () => {
  const f = fixture({ rental: { status: 'document_review', cancelled_before_pickup_at: null }, loseResponse: true });
  await assert.rejects(f.cancel(), /Reservation cancelled; deposit refund is not confirmed/);
  assert.equal(f.rental.status, 'cancelled');
  await f.cancel();
  assert.equal(f.rpcCalls.filter((name) => name === 'prepare_before_pickup_deposit_refund').length, 1);
  assert.equal(f.refunds.size, 1);
  assert.deepEqual(f.permissions.slice(0, 3), ['deposit.resolve', 'rental.cancel', 'payment.refund']);
});


test('Stripe refund failure is reported as an error, never as processing or success', async () => {
  const f = fixture({ refundStatus: 'failed' });
  await assert.rejects(f.cancel(), /Stripe deposit refund failed/);
});
