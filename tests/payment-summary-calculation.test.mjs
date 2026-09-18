import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
const cancellationCalculation = source.slice(source.indexOf('  const cancellationCredit ='), source.indexOf('  const customerName = rental.profiles?.full_name'));
const calculation = source.slice(source.indexOf('  const additionalChargeTotal = trueAdditionalCharges'), source.indexOf('  const depositHeldAmount = protectedDeposit'));
function summary(charges = [], overrides = {}, recordedRentalRefunds = 0) {
  const context = vm.createContext({
    rental: { rental_total: 1079.14, tax_amount: 68.53, security_deposit: 300,
      paid_at: '2026-09-15', payment_amount_cents: 138492, ...overrides },
    trueAdditionalCharges: charges,
    outstandingAdditionalCharges: charges.filter((c) => !c.included_in_initial_payment && ['pending', 'checkout_open', 'failed'].includes(c.status)).reduce((n, c) => n + c.total_amount, 0),
    rentalBalanceCharges: [], externalPaymentActions: [], recordedRentalRefunds,
    rentalPayments: [], rentalCharges: charges, rentalExtensions: [], rentalRefunds: [], depositAllocations: [],
    buildRentalPaymentHistory: () => [],
  });
  return vm.runInContext(`${cancellationCalculation}\n${calculation}\n({total: currentInvoiceTotal + additionalChargeTotal, paidAmount, additionalPaymentsReceived, balanceDue, customerCreditDue});`, context);
}
const cents = (n) => Math.round(n * 100);

test('the screenshot reconciles every charge and payment to $62.75', () => {
  const result = summary([{ total_amount: 75.33, status: 'paid' }]);
  assert.equal(cents(result.total), 152300);
  assert.equal(cents(result.paidAmount), 138492);
  assert.equal(cents(result.additionalPaymentsReceived), 7533);
  assert.equal(cents(result.balanceDue), 6275);
  assert.equal(cents(result.total - result.paidAmount - result.additionalPaymentsReceived), cents(result.balanceDue));
});

test('unpaid charges add to the balance; waived and booking-included charges are not counted twice', () => {
  const result = summary([
    { total_amount: 75.33, status: 'pending' },
    { total_amount: 40, status: 'waived' },
    { total_amount: 50, status: 'paid', included_in_initial_payment: true },
  ]);
  assert.equal(cents(result.total), 152300);
  assert.equal(result.additionalPaymentsReceived, 0);
  assert.equal(cents(result.balanceDue), 13808);
});

test('an unpaid Stripe quote contributes no received payment', () => {
  const result = summary([], { paid_at: null });
  assert.equal(result.paidAmount, 0);
  assert.equal(cents(result.balanceDue), 144767);
});

test('reserved booking credit keeps the displayed equation consistent without silently paying add-ons', () => {
  const result = summary([{ total_amount: 75.33, status: 'pending' }], { payment_amount_cents: 150000 });
  assert.equal(cents(result.customerCreditDue), 5233);
  assert.equal(cents(result.balanceDue), 7533);
  assert.equal(cents(result.total - result.paidAmount - result.additionalPaymentsReceived + result.customerCreditDue), cents(result.balanceDue));
});

test('the actual summary markup presents one equation with a separate held-deposit card', async () => {
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { transformWithOxc } = await import('vite');
  const start = source.indexOf('        <dl className="rental-payment-lines">');
  const end = source.indexOf('        {Number(rental.manual_discount_amount || 0) > 0 && <small', start);
  const markup = source.slice(start, end);
  const transformed = await transformWithOxc(`const Summary = () => <>${markup}</>; Summary;`, 'summary.jsx', { jsx: { runtime: 'classic' } });
  const context = vm.createContext({
    React, ShieldCheck: () => null,
    money: (n) => Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD' }),
    manualDiscountDescriptor: () => '$159.86 off rental',
    rental: { rental_total: 1079.14, pre_manual_discount_rental_total: 1239, manual_discount_amount: 159.86, tax_amount: 68.53, security_deposit: 300 },
    additionalChargeTotal: 75.33, initialPaymentTotal: 1447.67, currentInvoiceTotal: 1447.67, paidAmount: 1384.92,
    cancellationCredit: 0, cancelledBeforePickup: false,
    depositAppliedToCharges: 0, additionalPaymentsReceived: 75.33, customerCreditDue: 0, balanceDue: 62.75, depositHeldAmount: 300,
  });
  const Summary = vm.runInContext(transformed.code, context);
  const html = renderToStaticMarkup(React.createElement(Summary));
  const labels = ['Rental before discount', 'Manual discount', 'Rental after discount', 'Tax', 'Refundable security deposit', 'Additional charges', 'Total charges, including deposit', 'Net booking payments received', 'Additional-charge payments received', 'Balance due', 'Security deposit:'];
  let position = -1;
  for (const label of labels) {
    const next = html.indexOf(label);
    assert.ok(next > position, `${label} should appear in calculation order`);
    position = next;
  }
  assert.match(html, /\$1,523\.00/);
  assert.match(html, /−\$1,384\.92/);
  assert.match(html, /−\$75\.33/);
  assert.match(html, /\$62\.75/);
  assert.match(html, /Security deposit: \$300\.00 held/);
  assert.doesNotMatch(html, /deposit refund is clear|due before deposit return/);
});


test('cancelled booking credits the invoice and tracks the $300 deposit until returned', () => {
  const booking = { rental_total: 59, tax_amount: 3.75, security_deposit: 300,
    payment_amount_cents: 36275, status: 'cancelled', cancelled_before_pickup_at: '2026-09-16',
    cancellation_credit_amount: 362.75 };
  const pending = summary([], booking, 62.75);
  assert.equal(pending.total, 0);
  assert.equal(pending.balanceDue, 0);
  assert.equal(pending.customerCreditDue, 300);
  assert.equal(pending.paidAmount, 300);
  const returned = summary([], { ...booking, deposit_released_amount: 300 }, 62.75);
  assert.equal(returned.total, 0);
  assert.equal(returned.balanceDue, 0);
  assert.equal(returned.customerCreditDue, 0);
  assert.equal(returned.paidAmount, 0);
});
