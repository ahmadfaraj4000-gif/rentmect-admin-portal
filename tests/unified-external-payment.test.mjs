import test from 'node:test';
import assert from 'node:assert/strict';
import {buildExternalPayment,groupPaymentHistory,eligiblePaymentCharges,receivedDateLabel} from '../src/lib/externalPayment.js';
import {calculatePaymentRevenue,REVENUE_COLUMNS} from '../src/lib/paymentRevenue.js';
const toll={id:'toll',name:'Bridge',charge_type:'toll',status:'pending',total_amount:26};
const manual={id:'fee',name:'Manual charge',charge_type:'late_fee',status:'pending',total_amount:10};
const form={amount:'200',paymentMethod:'cash_app',receivedDate:'2026-01-31',receivedTime:'23:30',reference:'receipt',notes:'received last night',confirmed:true};
test('one $200 receipt pays $26 tolls and $174 rent, leaving $15',()=>{
 const r=buildExternalPayment([toll],['toll'],18900,form);
 assert.equal(r.amountCents,20000);assert.equal(r.rentalAmountCents,17400);assert.equal(r.expectedRentalDueCents-r.rentalAmountCents,1500);
 assert.equal(r.notes,'received last night');assert.equal(r.receivedDate,'2026-01-31');
});
test('mixed fees, rental-only, charge-only and exact cent rules',()=>{
 assert.equal(buildExternalPayment([toll,manual],['toll','fee'],18900,form).rentalAmountCents,16400);
 assert.equal(buildExternalPayment([],[],18900,{...form,amount:'100'}).rentalAmountCents,10000);
 assert.equal(buildExternalPayment([toll],['toll'],0,{...form,amount:'26'}).rentalAmountCents,0);
 for(const amount of ['25','216','-1','0','200.001','1e2'])assert.throws(()=>buildExternalPayment([toll],['toll'],18900,{...form,amount}));
 assert.throws(()=>buildExternalPayment([toll],['missing'],18900,form));
 assert.deepEqual(eligiblePaymentCharges([toll,{...manual,payment_receipt_id:'reserved'},{...manual,charge_type:'rental_installment'}]),[toll]);
});
test('ledger and payment activity group allocations without doubling gross or outstanding',()=>{
 const grouped=groupPaymentHistory([{id:'a',receiptId:'r',amount:26,cashImpact:26,label:'Toll'},{id:'b',receiptId:'r',amount:174,cashImpact:174,label:'Rent'},{id:'c',amount:15,outstandingAmount:15}]);
 assert.equal(grouped.length,2);assert.equal(grouped[0].amount,200);assert.equal(grouped[0].cashImpact,200);assert.equal(grouped[0].allocations.length,2);assert.equal(grouped[1].outstandingAmount,15);
});
test('cash reporting uses actual calendar date across month, year and DST boundaries',()=>{
 for(const date of ['2025-12-31','2026-01-31','2026-03-08','2026-11-01']){
  const row={...toll,rental_id:'r',status:'paid',payment_provider:'local',paid_at:'2026-11-06T18:00:00Z',payment_received_date:date,payment_amount_cents:2600,tax_amount:0};
  const report=calculatePaymentRevenue({charges:[row]},new Date(`${date}T10:00:00-05:00`));
  assert.equal(report.month,26);assert.equal(report.year,26);assert.deepEqual(report.issues,[]);
 }
 assert.equal(receivedDateLabel('2026-11-01','01:30:00'),'2026-11-01 01:30 ET');
 assert.ok(REVENUE_COLUMNS.rental_charge_items.includes('payment_received_date'));
});
test('refunded extras preserve original receipt month and reduce refund month once',()=>{
 const row={...toll,rental_id:'r',status:'paid',payment_provider:'local',paid_at:'2026-02-01T18:00:00Z',payment_received_date:'2026-01-31',payment_amount_cents:2600,tax_amount:0,external_refunded_amount:26,external_refunded_at:'2026-03-01T18:00:00Z'};
 const march=calculatePaymentRevenue({charges:[row]},new Date('2026-03-10T18:00:00Z'));
 assert.equal(march.month,-26);assert.equal(march.year,0);assert.deepEqual(march.issues,[]);
});

test('rental allocation can be disabled without silently applying surplus to rent',()=>{
 const chargeOnly=buildExternalPayment([toll],['toll'],18900,{...form,amount:'26.00',applyToRental:false});
 assert.equal(chargeOnly.rentalAmountCents,0);
 assert.throws(()=>buildExternalPayment([toll],['toll'],18900,{...form,applyToRental:false}),/Select Apply to rental/);
 assert.throws(()=>buildExternalPayment([],[],18900,{...form,amount:'100',applyToRental:false}),/Select Apply to rental/);
 assert.equal(buildExternalPayment([],[],18900,{...form,amount:'189.00',applyToRental:true}).rentalAmountCents,18900);
});
