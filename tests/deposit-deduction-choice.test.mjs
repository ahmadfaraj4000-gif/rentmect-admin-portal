import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';
import { depositDeductionOptions } from '../src/lib/depositDeduction.js';
const rental = { id: 'rental', status: 'active' };
const charge = { id: 'charge', rental_id: rental.id, status: 'pending', name: 'Fuel', charge_type: 'fuel', total_amount: 56.38 };
const allocation = { id: 'deposit', holder_rental_id: rental.id, status: 'held', payment_provider: 'local', amount_held: 300, amount_released: 0, amount_applied: 0 };
test('shows the actual funding source and remaining cents, including previous deductions', () => {
  let [option] = depositDeductionOptions(rental, [allocation], [charge]);
  assert.equal(option.label, 'External deposit'); assert.equal(option.remaining, 243.62); assert.equal(option.available, true);
  [option] = depositDeductionOptions(rental, [{ ...allocation, payment_provider: 'stripe', stripe_payment_intent_id: 'pi_capture', amount_applied: 20 }], [charge]);
  assert.equal(option.label, 'Stripe deposit'); assert.equal(option.held, 280); assert.equal(option.remaining, 223.62);
});
test('full consumption is eligible; insufficient, reserved, unknown or foreign deposits are not', () => {
  assert.equal(depositDeductionOptions(rental, [allocation], [{ ...charge, total_amount: 300 }])[0].available, true);
  for (const patch of [{ amount_held: 50 }, { refund_reserved_amount: 300 }, { payment_provider: 'unknown' }, { status: 'release_pending' }, { amount_released: 10 }, { payment_provider: 'stripe' }]) {
    assert.equal(depositDeductionOptions(rental, [{ ...allocation, ...patch }], [charge])[0].available, false);
  }
  assert.equal(depositDeductionOptions(rental, [{ ...allocation, holder_rental_id: 'other' }], [charge]).length, 0);
});
test('mixed funding remains separately labelled and rental balance charges cannot consume a deposit', () => {
  const options = depositDeductionOptions(rental, [allocation, { ...allocation, id: 'stripe', payment_provider: 'stripe', stripe_payment_intent_id: 'pi_source' }], [charge]);
  assert.deepEqual(options.map(a => a.label), ['External deposit', 'Stripe deposit']);
  assert.equal(depositDeductionOptions(rental, [allocation], [{ ...charge, charge_type: 'rental_amendment' }])[0].available, false);
});
const source = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
const code = (await transformWithOxc(source.slice(source.indexOf('function ChargeCustomerModal('), source.indexOf('function RentalChargeManager(')) + '\nChargeCustomerModal;', 'choice.jsx', { jsx: { runtime: 'classic' } })).code;
function elements(tree) { return tree && typeof tree === 'object' ? [tree, ...React.Children.toArray(tree.props?.children).flatMap(elements)] : []; }
function harness() {
  const states = []; let cursor = 0; const calls = [];
  const context = vm.createContext({ React, depositDeductionOptions, useDialogFocus: () => ({}), DollarSign: () => null, X: () => null,
    money: n => `$${Number(n).toFixed(2)}`, crypto: { randomUUID: () => 'request-key' },
    useState(initial) { const index = cursor++; if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
      return [states[index], value => states[index] = value]; },
  });
  const Modal = vm.runInContext(code, context);
  return { calls, render() { cursor = 0; return Modal({ rental, allocations: [allocation], charges: [charge], onCancel: () => calls.push('closed'), onCollect: async data => { calls.push(data); return true; } }); } };
}
test('popup reviews deduction and sends exactly the selected source, charge and remaining amount', async () => {
  const h = harness(); const tree = h.render();
  const html = renderToStaticMarkup(tree);
  for (const label of ['External deposit', '$300.00 held', '$56.38 deducted', '$243.62 left', 'No money is refunded now']) assert.ok(html.includes(label), label);
  await elements(tree).find(e => e.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(h.calls[0].allocationId, allocation.id); assert.equal(h.calls[0].expectedRemaining, 243.62);
  assert.equal(h.calls[0].idempotencyKey, 'request-key'); assert.equal(h.calls[1], 'closed');
});
test('card choice collects without a deposit payload', async () => {
  const h = harness(); let tree = h.render();
  elements(tree).filter(e => e.type === 'input' && e.props.type === 'radio').at(-1).props.onChange(); tree = h.render();
  await elements(tree).find(e => e.type === 'form').props.onSubmit({ preventDefault() {} }); assert.equal(h.calls[0], null);
});
