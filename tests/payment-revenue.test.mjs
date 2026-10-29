import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePaymentRevenue, canViewRevenue, readRevenueRows, loadPaymentRevenue, REVENUE_TABLES, REVENUE_COLUMNS } from '../src/lib/paymentRevenue.js';
const now = new Date('2026-10-14T16:00:00Z');
const october = '2026-10-10T12:00:00Z';
const september = '2026-09-10T12:00:00Z';
const rental = { id: 'r', rental_total: 100, tax_amount: 6.35, security_deposit: 300, paid_at: october, payment_amount_cents: 40635 };
const report = (data) => {
  const expected = calculatePaymentRevenue(data, now);
  const projected = Object.fromEntries(Object.entries(data).map(([key, rows]) => {
    const columns = new Set(REVENUE_COLUMNS[REVENUE_TABLES[key]].split(','));
    // Optional succeeded_at is absent from production; current refunds use created_at.
    return [key, rows.map(row => Object.fromEntries(Object.entries(row).filter(([field]) => columns.has(field))))];
  }));
  assert.deepEqual(calculatePaymentRevenue(projected, now), expected, 'Report projections preserve amounts and reconciliation warnings');
  return expected;
};
const charge = (overrides = {}) => ({ id: 'late', rental_id: 'r', charge_type: 'late_fee', status: 'paid', amount: 20, total_amount: 21.27, tax_amount: 1.27, payment_amount_cents: 2127, paid_at: october, ...overrides });

test('only the exact Ancona account can request revenue totals', () => {
  assert.equal(canViewRevenue(' ANCONAMGT@AOL.COM '), true);
  for (const email of [undefined, '', 'owner@aol.com', 'anconamgt@aol.com.example']) assert.equal(canViewRevenue(email), false);
});
test('paid rent and late fees exclude sales tax and refundable deposits', () => {
  const result = report({ rentals: [rental], charges: [charge()] });
  assert.equal(result.month, 120); assert.equal(result.year, 120); assert.deepEqual(result.issues, []);
});
test('unpaid and failed charges, pending checkout quotes, and deposit returns add no revenue', () => {
  const result = report({ rentals: [{ ...rental, paid_at: null }], charges: [charge({ status: 'pending' }), charge({ status: 'failed' })],
    allocations: [{ id: 'deposit', amount_held: 300, amount_released: 300, status: 'released' }],
    refunds: [{ id: 'dep-return', status: 'succeeded', amount: 300, source_type: 'security_deposit', created_at: october }] });
  assert.equal(result.month, 0); assert.deepEqual(result.issues, []);
});
test('partial rental installments fund the invoice before the deposit and are dated separately', () => {
  const result = report({ rentals: [{ ...rental, paid_at: null }], charges: [
    charge({ id: 'first', charge_type: 'rental_amendment', total_amount: 53.18, tax_amount: 0, payment_amount_cents: 5318, paid_at: september }),
    charge({ id: 'second', charge_type: 'rental_amendment', total_amount: 353.17, tax_amount: 0, payment_amount_cents: 35317 }),
  ] });
  assert.equal(result.month, 50); assert.equal(result.year, 100); assert.deepEqual(result.issues, []);
});
test('tax and deposit split for a full initial payment is not affected by a later edit timestamp', () => {
  const result = report({ rentals: [{ ...rental, paid_at: september, updated_at: october }] });
  assert.equal(result.month, 0); assert.equal(result.year, 100);
});
test('a deposit applied to a fee counts on application date, once, without counting the original deposit', () => {
  const result = report({ rentals: [{ ...rental, paid_at: september }],
    charges: [charge({ payment_provider: 'deposit', payment_amount_cents: 0 })],
    allocations: [{ id: 'a', amount_held: 300, amount_applied: 21.27, amount_released: 278.73 }],
    applications: [{ id: 'apply', rental_id: 'r', allocation_id: 'a', charge_id: 'late', amount: 21.27, created_at: october }] });
  assert.equal(result.month, 20); assert.equal(result.year, 120); assert.deepEqual(result.issues, []);
});
test('a deposit applied to rental balance excludes the invoice tax share', () => {
  const result = report({ rentals: [{ ...rental, paid_at: null }],
    charges: [charge({ charge_type: 'rental_amendment', total_amount: 106.35, tax_amount: 0, payment_provider: 'deposit', payment_amount_cents: 0 })],
    applications: [{ id: 'apply', rental_id: 'r', charge_id: 'late', amount: 106.35, created_at: october }] });
  assert.equal(result.month, 100); assert.deepEqual(result.issues, []);
});
test('canonical receipts deduplicate original, extension and charge representations', () => {
  const result = report({ rentals: [rental], payments: [
    { id: 'p', rental_id: 'r', status: 'paid', total_amount: 406.35, rental_amount: 100, tax_amount: 6.35, deposit_amount: 300, paid_at: october, stripe_payment_intent_id: 'pi_initial' },
    { id: 'e', rental_id: 'r', payment_type: 'extension', status: 'paid', total_amount: 21.27, tax_amount: 1.27, paid_at: october, stripe_payment_intent_id: 'pi_extension' },
    { id: 'c', rental_id: 'r', payment_type: 'charge', status: 'paid', total_amount: 21.27, tax_amount: 1.27, paid_at: october, stripe_payment_intent_id: 'pi_charge' },
  ], extensions: [{ id: 'ext', rental_id: 'r', status: 'activated', payment_status: 'paid', extension_total_amount: 21.27, extension_tax_amount: 1.27, paid_at: october, stripe_payment_intent_id: 'pi_extension' }], charges: [charge({ stripe_payment_intent_id: 'pi_charge' })] });
  assert.equal(result.month, 140); assert.deepEqual(result.issues, []);
});
test('same-vehicle extensions do not inflate the original payment and new deposits are excluded', () => {
  const result = report({ rentals: [{ ...rental, rental_total: 120, tax_amount: 7.62, paid_at: september }],
    extensions: [{ id: 'ext', rental_id: 'r', request_kind: 'same_vehicle_extension', status: 'activated', payment_status: 'paid', paid_at: october,
      extension_rental_amount: 20, extension_tax_amount: 1.27, extension_deposit_amount: 50, extension_total_amount: 71.27 }] });
  assert.equal(result.month, 20); assert.equal(result.year, 120); assert.deepEqual(result.issues, []);
});
test('vehicle continuation child does not count the extension payment a second time', () => {
  const result = report({ rentals: [{ ...rental, id: 'child', payment_amount_cents: 2127 }],
    extensions: [{ id: 'ext', rental_id: 'r', replacement_rental_id: 'child', status: 'activated', payment_status: 'paid', paid_at: october,
      extension_rental_amount: 20, extension_tax_amount: 1.27, extension_total_amount: 21.27 }] });
  assert.equal(result.month, 20); assert.deepEqual(result.issues, []);
});
test('refund in October reduces October even when payment was received last year', () => {
  const result = report({ rentals: [{ ...rental, paid_at: '2025-12-10T12:00:00Z', stripe_payment_intent_id: 'pi' }],
    refunds: [{ id: 'refund', rental_id: 'r', stripe_payment_intent_id: 'pi', status: 'succeeded', amount: 106.35, created_at: october },
      { id: 'pending', rental_id: 'r', status: 'pending', amount: 20, created_at: october }] });
  assert.equal(result.month, -100); assert.equal(result.year, -100); assert.deepEqual(result.issues, []);
});
test('external full refund removes only the revenue portion, excluding returned deposit and tax', () => {
  const result = report({ rentals: [{ ...rental, paid_at: september }], externalActions: [{ id: 'f', rental_id: 'r', action_type: 'refund', amount: 406.35, deposit_amount_returned: 300, created_at: october }] });
  assert.equal(result.month, -100); assert.equal(result.year, 0); assert.deepEqual(result.issues, []);
});
test('partial refunds round cumulatively and duplicate provider refunds count once', () => {
  const result = report({ rentals: [{ ...rental, stripe_payment_intent_id: 'pi' }], refunds: [
    { id: 'a', stripe_refund_id: 're1', stripe_payment_intent_id: 'pi', status: 'succeeded', amount: 53.18, created_at: october },
    { id: 'duplicate', stripe_refund_id: 're1', stripe_payment_intent_id: 'pi', status: 'succeeded', amount: 53.18, created_at: october },
    { id: 'b', stripe_refund_id: 're2', stripe_payment_intent_id: 'pi', status: 'succeeded', amount: 53.17, created_at: october },
  ] });
  assert.equal(result.year, 0); assert.deepEqual(result.issues, []);
});
test('Connecticut month/year boundaries, leap day and future timestamps are respected', () => {
  const payments = [
    { id: 'lastyear', paid_at: '2026-01-01T04:59:59Z', total_amount: 100 },
    { id: 'thisyear', paid_at: '2026-01-01T05:00:00Z', total_amount: 200 },
    { id: 'lastmonth', paid_at: '2026-10-01T03:59:59Z', total_amount: 300 },
    { id: 'thismonth', paid_at: '2026-10-01T04:00:00Z', total_amount: 400 },
    { id: 'future', paid_at: '2026-10-14T17:00:00Z', total_amount: 500 },
  ].map((p) => ({ ...p, status: 'paid' }));
  const result = report({ payments }); assert.equal(result.month, 400); assert.equal(result.year, 900);
  const leap = calculatePaymentRevenue({ payments: [{ status: 'paid', id: 'leap', total_amount: 12, paid_at: '2024-02-29T18:00:00Z' }] }, new Date('2024-02-29T19:00:00Z'));
  assert.equal(leap.month, 12); assert.equal(leap.year, 12);
});
test('missing dates, unmatched refunds and inconsistent applications are explicitly flagged', () => {
  const result = report({ charges: [charge({ paid_at: null, updated_at: october })],
    refunds: [{ id: 'f', status: 'succeeded', amount: 10, created_at: october }], allocations: [{ id: 'a', amount_applied: 20 }] });
  assert.equal(result.month, 0); assert.equal(result.issues.length, 3);
});
function clientFor(rows, { cap = 2, error = false, incorrectCount = false } = {}) {
  const calls = [];
  return { calls, from(table) {
    let after = '', counted = false;
    const query = { select(_, options) { counted = options?.count === 'exact'; return this; }, order() { return this; }, limit() { return this; }, gt(_, value) { after = value; return this; }, abortSignal() { return this; },
      then(resolve, reject) { calls.push({ table, after }); return Promise.resolve({ data: rows.filter((row) => row.id > after).slice(0, cap), count: counted ? rows.length + (incorrectCount ? 1 : 0) : null, error: error ? { message: 'offline' } : null }).then(resolve, reject); } };
    return query;
  } };
}
test('complete-history reads continue past a server row cap and fail on incomplete reads', async () => {
  const rows = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id }));
  const client = clientFor(rows);
  assert.deepEqual(await readRevenueRows(client, 'payments'), rows); assert.equal(client.calls.length, 4);
  await assert.rejects(readRevenueRows(clientFor(rows, { incorrectCount: true }), 'payments'), /changed during loading/);
  await assert.rejects(readRevenueRows(clientFor(rows, { error: true }), 'payments'), /offline/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(readRevenueRows(client, 'payments', controller.signal), /interrupted/);
});
test('all report sources must load successfully before totals are calculated', async () => {
  const client = clientFor([]);
  const data = await loadPaymentRevenue(client);
  assert.deepEqual(Object.keys(data), Object.keys(REVENUE_TABLES));
  assert.equal(client.calls.length, 8);
});

test('original allocated deposit stays excluded after invoice revisions and rental-balance application', () => {
  const result = report({ rentals: [{ id: 'r', rental_total: 573.95, tax_amount: 36.45, security_deposit: 300, paid_at: september, payment_amount_cents: 50000 }],
    charges: [charge({ id: 'installment', charge_type: 'rental_amendment', total_amount: 403.53, tax_amount: 0, payment_amount_cents: 40353 }),
      charge({ id: 'balance', charge_type: 'rental_amendment', total_amount: 6.87, tax_amount: 0, payment_provider: 'deposit', payment_amount_cents: 0 })],
    allocations: [{ id: 'a', source_rental_id: 'r', source_kind: 'local_payment', amount_held: 300, amount_applied: 6.87 }],
    applications: [{ id: 'apply', rental_id: 'r', allocation_id: 'a', charge_id: 'balance', amount: 6.87, created_at: october }] });
  assert.equal(result.year, 573.95); assert.deepEqual(result.issues, []);
});
test('split transferred allocations are excluded once from their source receipt', () => {
  const result = report({ rentals: [rental], allocations: [
    { id: 'left', source_rental_id: 'r', holder_rental_id: 'r', amount_held: 100 },
    { id: 'right', source_rental_id: 'r', holder_rental_id: 'next-rental', amount_held: 200 },
  ] });
  assert.equal(result.year, 100); assert.deepEqual(result.issues, []);
});

test('a canonical additional-charge receipt does not suppress the original rental receipt', () => {
  const result = report({ rentals: [rental], payments: [{ id: 'c', rental_id: 'r', payment_type: 'charge', status: 'paid', total_amount: 21.27, tax_amount: 1.27, paid_at: october, stripe_payment_intent_id: 'pi_charge' }], charges: [charge({ stripe_payment_intent_id: 'pi_charge' })] });
  assert.equal(result.year, 120); assert.deepEqual(result.issues, []);
});
test('an invalid refund/deposit split cannot increase revenue', () => {
  const result = report({ rentals: [rental], externalActions: [{ id: 'f', rental_id: 'r', action_type: 'refund', amount: 10, deposit_amount_returned: 20, created_at: october }] });
  assert.equal(result.year, 100); assert.match(result.issues[0].reason, /inconsistent/);
});

test('refunding and collecting a replacement payment does not cap all-time receipts at the current invoice', () => {
  const result = report({ rentals: [{ ...rental, security_deposit: 0, deposit_status: 'waived', payment_amount_cents: 10635, paid_at: september, stripe_payment_intent_id: 'pi_original' }],
    charges: [charge({ id: 'replacement', charge_type: 'rental_amendment', total_amount: 106.35, tax_amount: 0, payment_amount_cents: 10635, stripe_payment_intent_id: 'pi_new' })],
    refunds: [{ id: 'refund', rental_id: 'r', stripe_payment_intent_id: 'pi_original', status: 'succeeded', amount: 106.35, created_at: october }] });
  assert.equal(result.month, 0); assert.equal(result.year, 100); assert.deepEqual(result.issues, []);
});
test('a later invoice reduction does not remove historical cash before its refund date', () => {
  const data = { rentals: [{ ...rental, rental_total: 50, tax_amount: 3.18, paid_at: september, stripe_payment_intent_id: 'pi' }],
    allocations: [{ id: 'a', source_rental_id: 'r', amount_held: 300, stripe_payment_intent_id: 'pi' }] };
  const result = report(data);
  assert.equal(result.month, 0); assert.equal(result.year, 99.99); assert.deepEqual(result.issues, []);
});
test('duplicate representations cannot consume the deposit allocation twice', () => {
  const result = report({ rentals: [{ ...rental, stripe_payment_intent_id: 'pi' }],
    charges: [charge({ id: 'same', charge_type: 'rental_amendment', total_amount: 406.35, payment_amount_cents: 40635, stripe_payment_intent_id: 'pi' })] });
  assert.equal(result.year, 100); assert.deepEqual(result.issues, []);
});

test('unclassified manual Stripe refunds remain provisional even when less than the rental receipt', () => {
  const result = report({ rentals: [{ ...rental, stripe_payment_intent_id: 'pi' }],
    refunds: [{ id: 'refund', rental_id: 'r', stripe_payment_intent_id: 'pi', status: 'succeeded', source_type: 'stripe_manual_review', amount: 50, created_at: october }] });
  assert.equal(result.year, 100); assert.match(result.issues[0].reason, /classified/);
});

test('older unresolved refunds qualify only the year total, not this month', () => {
  const result = report({ rentals: [{ ...rental, stripe_payment_intent_id: 'pi' }], refunds: [
    { id: 'old', rental_id: 'r', stripe_payment_intent_id: 'pi', stripe_refund_id: 're_old', status: 'succeeded', source_type: 'stripe_manual_review', amount: 50, created_at: september },
    { id: 'last-year', rental_id: 'r', status: 'succeeded', source_type: 'stripe_manual_review', amount: 20, created_at: '2025-08-01T12:00:00Z' },
  ] });
  assert.equal(result.issues.length, 1);
  assert.deepEqual(result.issues[0].periods, ['year']);
  assert.equal(result.issues[0].refundId, 're_old');
  assert.equal(result.month, 100);
});


test('every production revenue source uses a bounded column projection', () => {
  for (const table of Object.values(REVENUE_TABLES)) {
    assert.ok(REVENUE_COLUMNS[table].split(',').includes('id'));
    assert.doesNotMatch(REVENUE_COLUMNS[table], /\*|agreement_snapshot|admin_notes|customer_email/);
  }
});
