import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const mainSource = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8');
const edgeSource = await readFile(
  new URL('../../supabase/functions/stripe-web-hook/index.ts', import.meta.url),
  'utf8',
);
const migration = await readFile(
  new URL('../../supabase/migrations/20260813213000_admin_partial_payment_installments.sql', import.meta.url),
  'utf8',
);
const stripeInstallmentMigration = await readFile(
  new URL('../../supabase/migrations/20260813222000_admin_stripe_installment_checkout.sql', import.meta.url),
  'utf8',
);

test('admin external-payment UI accepts a bounded installment and previews its remainder', () => {
  assert.match(mainSource, /amount > amountDue \+ 0\.005/);
  assert.doesNotMatch(mainSource, /recorded payment must equal the full amount due/i);
  assert.match(mainSource, /Balance after this installment/);
  assert.match(mainSource, /Record Installment/);
  assert.match(mainSource, /does not mark the payment or security deposit complete/);
  assert.match(mainSource, /payment and deposit are not complete/);
});

test('only below-balance initial payments enter the installment ledger', () => {
  assert.match(mainSource, /amount < invoiceTotal - 0\.005/);
  assert.match(mainSource, /action: 'admin_record_external_balance'/);
  assert.match(mainSource, /record_admin_local_rental_payment/);
  assert.match(edgeSource, /sync_rental_remaining_balance/);
  assert.match(edgeSource, /Initial installments and post-amendment balances share one canonical/);
  assert.match(edgeSource, /Retire an earlier full-invoice checkout before crediting an installment/);
  assert.match(edgeSource, /checkout\.sessions\.expire\(checkout\.id\)/);
  assert.match(edgeSource, /rental\.paid_at \? "" : String\(rental\.stripe_checkout_session_id/);
  assert.match(edgeSource, /Stripe already completed this rental payment/);
});

test('database settlement keeps partial money auditable without completing deposit gates', () => {
  assert.match(migration, /v_next_status := case when v_paid > 0\.005 then 'partially_paid'/);
  assert.match(migration, /charge_type = 'rental_amendment'/);
  assert.match(migration, /'balance_after'/);
  assert.match(migration, /when v_next_status = 'paid'.*then 'held'/s);
  assert.match(migration, /ensure_rental_deposit_allocation/);
  assert.match(migration, /Partially paid reservations require payment reconciliation before cancellation/);
  assert.match(migration, /v_payment_status in \('paid', 'partially_paid', 'partial'\)/);
});

test('unpaid Stripe quotes are not counted as captured installment money', () => {
  assert.match(migration, /if v_rental\.paid_at is not null then/);
  assert.match(migration, /payment_provider may merely describe an abandoned Stripe quote/);
  assert.doesNotMatch(
    migration,
    /if v_rental\.paid_at is not null\s+or lower\(coalesce\(v_rental\.payment_status/,
  );
  assert.match(mainSource, /const hasCapturedRentalPayment = Boolean\(rental\.paid_at\)/);
  assert.match(mainSource, /balanceLedgerRentalIds/);
});

test('admin can choose a Stripe installment and see the resulting balance before checkout', () => {
  assert.match(mainSource, /Amount to collect with Stripe/);
  assert.match(mainSource, /Remaining after Stripe confirms/);
  assert.match(mainSource, /Open Stripe Installment Checkout/);
  assert.match(mainSource, /action: selectedAmountCents \? 'admin_create_installment_checkout'/);
  assert.match(mainSource, /window\.open\('about:blank', '_blank'\)/);
  assert.match(mainSource, /checkoutWindow\.location\.replace\(data\.url\)/);
  assert.match(mainSource, /onOpenStripe\?\.\(stripeAmountValue\)/);
  assert.match(mainSource, /stripeBalanceAfter < protectedDeposit - 0\.005/);
});

test('Stripe installment checkout retires conflicting links and uses a temporary charge', () => {
  assert.match(edgeSource, /async function createAdminStripeInstallmentCheckout/);
  assert.match(edgeSource, /prepare_admin_stripe_rental_installment/);
  assert.match(edgeSource, /checkout\.sessions\.expire\(checkout\.id\)/);
  assert.match(edgeSource, /paymentIntents\.cancel\(intent\.id\)/);
  assert.match(edgeSource, /charge\.charge_type === "rental_installment" \? "waived" : "pending"/);
  assert.match(edgeSource, /An administrator-started Stripe installment is already open/);
  assert.match(edgeSource, /balanceAfterPayment: \(balanceDueCents - amountCents\) \/ 100/);
});

test('Stripe webhook promotes only an exact confirmed installment into the balance ledger', () => {
  assert.match(stripeInstallmentMigration, /Stripe installments must be at least \$0\.50/);
  assert.match(stripeInstallmentMigration, /charge_type = 'rental_installment'/);
  assert.match(stripeInstallmentMigration, /admin_stripe_installment_deposit_pending/);
  assert.match(stripeInstallmentMigration, /p_amount_total <> v_expected/);
  assert.match(stripeInstallmentMigration, /then 'rental_amendment'/);
  assert.match(stripeInstallmentMigration, /stripe_rental_installment_paid/);
  assert.match(stripeInstallmentMigration, /stripe_rental_balance_paid/);
  assert.match(stripeInstallmentMigration, /stripe_payment_intent_id = p_payment_intent_id/);
});

test('the final Stripe capture remains large enough to refund the security deposit', () => {
  assert.match(stripeInstallmentMigration, /v_balance_due - v_amount < v_protected_deposit - 0\.005/);
  assert.match(stripeInstallmentMigration, /security deposit for the final Stripe payment/);
  assert.match(stripeInstallmentMigration, /update public\.rental_deposit_allocations/);
  assert.match(stripeInstallmentMigration, /v_is_rental_installment and v_carries_deposit/);
  assert.match(stripeInstallmentMigration, /and stripe_payment_intent_id is null/);
  assert.match(stripeInstallmentMigration, /partially_paid.*partial.*new\.payment_status.*paid/s);
});
