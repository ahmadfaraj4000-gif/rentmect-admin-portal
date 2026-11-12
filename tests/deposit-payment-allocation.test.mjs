import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { buildPaymentAllocation, receiptHistory } from '../src/lib/paymentAllocation.js';
const build = (overrides = {}, depositDueCents = 30000) => buildPaymentAllocation({ rentalDueCents: 7870, depositDueCents, charges: [], form: { amount:'378.70', rentalAmount:'78.70', depositAmount:'300', funding:'external', receivedDate:'2026-11-11', confirmed:true, ...overrides } });
test('deposit and rental share a payment without counting the deposit twice',()=>{
 const result=build(); assert.equal(result.rentalAmountCents,7870);assert.equal(result.depositAmountCents,30000);assert.equal(result.creditAmountCents,0);
 assert.equal(result.expectedDepositDueCents,30000);
});
test('partial deposit-only Stripe payments leave rent unallocated',()=>{
 const result=build({amount:'100',rentalAmount:'0',depositAmount:'100',funding:'stripe'});
 assert.equal(result.rentalAmountCents,0);assert.equal(result.depositAmountCents,10000);assert.equal(result.creditAmountCents,0);
});
test('held deposits cannot be collected again and deposits cannot use customer credit',()=>{
 assert.throws(()=>build({},0),/deposit still needed/);
 assert.throws(()=>build({funding:'credit'}),/Stripe or an external/);
 assert.throws(()=>build({amount:'300'}),/exceed/);
});
test('receipt history shows rental and deposit separately while preserving receipt total',()=>{
 const [receipt]=receiptHistory([{id:'r',status:'posted',allocation_version:2,amount_cents:37870,rental_amount_cents:37870,deposit_amount_cents:30000,funding_kind:'stripe',credit_amount_cents:0}], [{receipt_id:'r',charge_id:'c',amount_cents:37870,snapshot:{charge_type:'rental_amendment',name:'Rental balance'}}]);
 assert.deepEqual(receipt.allocations.map(a=>[a.label,a.amount]),[['Rental',78.7],['Security deposit',300]]);assert.equal(receipt.amount,378.7);
});
const source=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
const entry=source.slice(source.indexOf('  const pendingPayment ='),source.indexOf('  function openReceivePayment('));
const pending=(receipts,id)=>vm.runInNewContext(entry+'; ({hasPendingPayment,pendingPayment});',{flexibleState:receipts===null?null:{receipts},rental:{pending_external_payment_id:id}});
test('payment entry resumes unpaid Stripe sessions even without opening their link',()=>{
 assert.equal(pending([{id:'s',status:'pending',funding_kind:'stripe'}]).hasPendingPayment,true);
 assert.equal(pending(null,'s').hasPendingPayment,true);
 for(const status of ['posted','cancelled','refunded'])assert.equal(pending([{id:'s',status,funding_kind:'stripe'}],'s').hasPendingPayment,false);
});
