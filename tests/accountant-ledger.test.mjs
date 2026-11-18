import assert from 'node:assert/strict';
import test from 'node:test';
import { feeBreakdown } from '../src/lib/accountantLedger.js';

test('partially settled fees keep payment, deposit, waiver and open amounts distinct', () => {
  const fee = { total_amount:120, allocation_managed:true,allocated_payment_cents:3000,
    allocated_deposit_cents:1000,allocated_waiver_cents:2000,status:'pending' };
  assert.deepEqual(feeBreakdown(fee),[120,30,10,20,0,60]);
  assert.deepEqual(feeBreakdown({...fee,status:'waived'}),[120,30,10,80,0,0]);
});

test('legacy partial payments, deposit settlements and invoice-included fees retain their funding source', () => {
  const fee = {total_amount:75,payment_amount_cents:2500,status:'partially_paid'};
  assert.deepEqual(feeBreakdown(fee),[75,25,0,0,0,50]);
  assert.deepEqual(feeBreakdown({...fee,status:'paid',payment_provider:'deposit'}),[75,0,75,0,0,0]);
  assert.deepEqual(feeBreakdown({...fee,status:'pending',included_in_initial_payment:true}),[75,0,0,0,0,0]);
});
