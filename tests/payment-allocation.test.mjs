import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPaymentAllocation, chargeRemainingCents, receiptHistory } from '../src/lib/paymentAllocation.js';
const charges = [{ id:'toll', name:'Bridge toll', charge_type:'toll', status:'pending', total_amount:26 }, {id:'insurance',name:'Insurance',charge_type:'add_on',status:'pending',total_amount:50}];
const form = { amount:'300',rentalAmount:'100',funding:'external',allocations:{toll:'10',insurance:'20'},confirmed:true,receivedDate:'2026-11-10',paymentMethod:'cash',reference:'  R  ',notes:'Notes'};
const build = (changes={}, extra={}) => buildPaymentAllocation({charges,rentalDueCents:18900,form:{...form,...changes},...extra});
test('receive above debt with explicit rental/charge amounts, preserving unused credit',()=>{
 const r=build(); assert.equal(r.amountCents,30000); assert.equal(r.rentalAmountCents,10000); assert.equal(r.creditAmountCents,17000);
 assert.equal(r.charges.reduce((s,a)=>s+a.amountCents,0),3000); assert.equal(r.reference,'R');
 assert.equal(build({amount:'500'}).rentalAmountCents,10000); assert.equal(build({amount:'500'}).creditAmountCents,37000);
});
test('credit-only receipt and checkboxes selecting full charges are valid',()=>{
 assert.equal(build({rentalAmount:'0',allocations:{}}).creditAmountCents,30000);
 assert.equal(build({rentalAmount:'0',allocations:{toll:'26'}}).charges[0].amountCents,2600);
 assert.equal(build({amount:'100',allocations:{}}).creditAmountCents,0);
});
test('allocation bounds and cent precision fail before posting',()=>{
 for(const changes of [{amount:'100'},{rentalAmount:'190'},{allocations:{toll:'27'}},{allocations:{toll:'0'}},{allocations:{missing:'1'}},{amount:'1.001'},{amount:'-1'},{confirmed:false},{funding:'invalid'}]) assert.throws(()=>build(changes));
 const partiallyPaid=[{...charges[0],allocated_payment_cents:1000}];
 assert.equal(chargeRemainingCents(partiallyPaid[0]),1600);
 assert.equal(build({amount:'8',rentalAmount:'0',allocations:{toll:'8'}},{charges:partiallyPaid}).charges[0].expectedRemainingCents,1600);
 assert.throws(()=>build({allocations:{toll:'17'}},{charges:partiallyPaid}));
});
test('applying existing credit consumes only the chosen allocations without creating more credit',()=>{
 const r=build({amount:'30',rentalAmount:'0',funding:'credit'}, {availableCreditCents:5000});
 assert.equal(r.creditAmountCents,0);assert.equal(r.funding,'credit');
 assert.throws(()=>build({amount:'30',rentalAmount:'0',funding:'credit'},{availableCreditCents:2000}));
 assert.throws(()=>build({amount:'40',rentalAmount:'0',funding:'credit'},{availableCreditCents:5000}));
});
test('history retains one receipt including its unapplied money and labels credit use',()=>{
 const entries=receiptHistory([{id:'a',allocation_version:2,status:'posted',funding_kind:'external',amount_cents:30000,credit_amount_cents:17000,refund_block_reason:'Reconcile the deposit before returning money.'},{id:'b',allocation_version:2,status:'posted',funding_kind:'credit',amount_cents:2000,credit_amount_cents:0}], [{receipt_id:'a',charge_id:'t',amount_cents:1000,snapshot:{name:'Toll'}}]);
 assert.equal(entries.length,2);assert.equal(entries[0].amount,300);assert.equal(entries[0].creditAmount,170);assert.equal(entries[0].allocations.length,1);assert.match(entries[1].label,/no new money/);
 assert.equal(entries[0].refundBlockReason,'Reconcile the deposit before returning money.');
});

test('refunded receipts keep the original payment and a dated reversal',()=>{
 const rows=receiptHistory([{id:'r',allocation_version:2,status:'refunded',funding_kind:'external',amount_cents:30000,credit_amount_cents:17000,posted_at:'2026-11-10',refunded_at:'2026-11-11'}]);
 assert.equal(rows.length,2);assert.equal(rows[0].amount,300);assert.equal(rows[1].amount,300);
 assert.equal(rows[1].kind,'refund');assert.equal(rows[1].moneyReturned,true);assert.equal(rows[1].date,'2026-11-11');assert.equal(rows[1].correctableReceiptId,null);
});

import { calculatePaymentRevenue } from '../src/lib/paymentRevenue.js';
test('partially paid extras count their allocated revenue once, excluding unused customer credit',()=>{
 const receipt={id:'r1',rental_id:'r',funding_kind:'external',amount_cents:10000,credit_amount_cents:8000,status:'posted',received_date:'2026-11-10'};
 const entry={receipt_id:'r1',charge_id:'fee',amount_cents:2000,charge_type:'toll',total_amount:50,tax_amount:0};
 const charge={id:'fee',rental_id:'r',status:'pending',charge_type:'toll',total_amount:50,allocated_payment_cents:2000,allocation_managed:true};
 const result=calculatePaymentRevenue({charges:[charge],allocatedReceipts:[receipt],allocatedEntries:[entry]},new Date('2026-11-11T17:00:00Z'));
 assert.equal(result.month,20);assert.deepEqual(result.issues,[]);
 // Paying the remainder from credit adds only the newly settled portion; no header or original charge duplicates it.
 const more={...receipt,id:'credit',funding_kind:'credit',amount_cents:3000,credit_amount_cents:0};
 const all=calculatePaymentRevenue({charges:[{...charge,status:'paid',payment_provider:'local',payment_amount_cents:5000,paid_at:'2026-11-10T17:00:00Z'}],allocatedReceipts:[receipt,more],allocatedEntries:[entry,{...entry,receipt_id:'credit',amount_cents:3000}]},new Date('2026-11-11T17:00:00Z'));
 assert.equal(all.month,50);assert.deepEqual(all.issues,[]);
 const reversed=calculatePaymentRevenue({charges:[charge],allocatedReceipts:[{...receipt,status:'refunded',refunded_at:'2026-11-11T17:00:00Z'}],allocatedEntries:[entry]},new Date('2026-11-11T18:00:00Z'));
 assert.equal(reversed.month,0);
});

