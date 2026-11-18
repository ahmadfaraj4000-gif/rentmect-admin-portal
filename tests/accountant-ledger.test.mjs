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

test('tax workpapers distinguish missing expense evidence from zero spending and reconcile signed refunds', async () => {
  const { buildAccountantLedger } = await import('../src/lib/accountantLedger.js');
  const w = buildAccountantLedger({
    asOf:'2026-11-18T12:00:00Z',rentals:[],fees:[],transactions:[],
    revenue:{extensions:[],payments:[{id:'p',rental_id:'r',status:'paid',total_amount:150,tax_amount:10,deposit_amount:40,paid_at:'2026-06-01',stripe_payment_intent_id:'pi'}],
      refunds:[{id:'f',rental_id:'r',status:'succeeded',amount:11,stripe_payment_intent_id:'pi',created_at:'2026-07-15'}]},
  });
  const cover=w.getWorksheet('Tax preparation');
  assert.equal(cover.getCell('B5').value,2026);
  assert.equal(cover.getCell('B6').value.result,100);
  assert.equal(cover.getCell('B7').value.result,-10);
  assert.equal(cover.getCell('B8').value.result,90);
  assert.equal(cover.getCell('B10').value.result ?? '','');
  assert.match(cover.getCell('B10').formula,/ExpenseLog\[Date paid\]/);
  assert.equal(w.getWorksheet('Business expenses').getTable('ExpenseLog').table.rows.length,1);
  assert.equal(w.getWorksheet('Processor reconciliation').getCell('J5').value.result ?? '','');
  assert.equal(w.getWorksheet('Revenue detail').rowCount,6);
});
