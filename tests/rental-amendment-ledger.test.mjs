import test from 'node:test';
import assert from 'node:assert/strict';

const cents = (amount) => Math.round(amount * 100) / 100;
const invoice = ({ days, dailyRate, discount, taxRate, deposit }) => {
  const rental = cents(days * dailyRate - discount);
  const tax = cents(rental * taxRate);
  return { rental, tax, deposit, total: cents(rental + tax + deposit) };
};

test('the affected seven-day rental has one authoritative invoice and balance', () => {
  const revised = invoice({ days: 7, dailyRate: 59, discount: 16.50, taxRate: 0.0635, deposit: 300 });
  assert.deepEqual(revised, { rental: 396.50, tax: 25.18, deposit: 300, total: 721.68 });
  assert.equal(cents(revised.total - 362.75), 358.93);
});

test('an added day changes the invoice and remaining balance by the same amount', () => {
  const sixDays = invoice({ days: 6, dailyRate: 59, discount: 16.50, taxRate: 0.0635, deposit: 300 });
  const sevenDays = invoice({ days: 7, dailyRate: 59, discount: 16.50, taxRate: 0.0635, deposit: 300 });
  assert.equal(sixDays.total, 658.93);
  assert.equal(cents(sixDays.total - 362.75), 296.18);
  assert.equal(cents(sevenDays.total - sixDays.total), 62.75);
  assert.equal(cents((sevenDays.total - 362.75) - (sixDays.total - 362.75)), 62.75);
});

test('the refundable deposit is never added twice during reconciliation', () => {
  const revised = invoice({ days: 7, dailyRate: 59, discount: 16.50, taxRate: 0.0635, deposit: 300 });
  const remaining = cents(revised.total - 362.75);
  assert.equal(remaining, 358.93);
  assert.notEqual(remaining, cents(revised.total + 300 - 362.75));
});
