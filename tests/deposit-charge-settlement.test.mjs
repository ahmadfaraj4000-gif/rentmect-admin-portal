import test from 'node:test';
import assert from 'node:assert/strict';
import { depositSettlementPreview } from '../src/lib/depositSettlement.js';
import { refundableRentalSources } from '../src/lib/rentalRefunds.js';
const rental = { id:'r', status:'completed', inspection_completed_at:'2026-09-17', deposit_status:'held' };
const allocation = { id:'a',source_rental_id:'r',status:'held',payment_provider:'stripe',stripe_payment_intent_id:'pi',amount_held:300,amount_released:0,amount_applied:0 };
const charge = { id:'c',name:'Fuel',status:'pending',charge_type:'fuel',total_amount:56.38,included_in_initial_payment:false };
test('300 deposit with 56.38 fuel produces a 243.62 refund in exact cents',()=>{
 assert.deepEqual(depositSettlementPreview(rental,[allocation],[charge]),{charges:[charge],chargeIds:['c'],deposit:300,expectedApplied:56.38,expectedRefund:243.62});
});
test('refuses paid charges, active collection, unreconciled rentals, transfers, and mixed deposits',()=>{
 for(const patch of [{status:'paid'},{status:'checkout_open'},{stripe_checkout_session_id:'cs'},{admin_charge_attempted_at:'2026-09-18'},{charge_type:'rental_amendment'}]) assert.equal(depositSettlementPreview(rental,[allocation],[{...charge,...patch}]),null);
 for(const patch of [{status:'active'},{inspection_completed_at:null},{deposit_transferred_to_rental_id:'other'}]) assert.equal(depositSettlementPreview({...rental,...patch},[allocation],[charge]),null);
 for(const patch of [{refund_reserved_amount:300},{refund_id:'re'},{amount_applied:1},{payment_provider:'local'},{source_rental_id:'other'}]) assert.equal(depositSettlementPreview(rental,[{...allocation,...patch}],[charge]),null);
 assert.equal(depositSettlementPreview(rental,[allocation,allocation],[charge]),null);
 assert.equal(depositSettlementPreview(rental,[allocation],[{...charge,total_amount:300}]),null);
});
test('retained fuel remains protected from a second rental refund after remainder is returned',()=>{
 const sources=refundableRentalSources({paid_at:'2026-08-28',payment_provider:'stripe',stripe_payment_intent_id:'pi',payment_amount_cents:69881},[],[],[{...allocation,status:'released',amount_applied:56.38,amount_released:243.62}]);
 assert.equal(sources[0].maximum,398.81);
});
