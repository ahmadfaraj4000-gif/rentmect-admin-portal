import test from 'node:test';
import assert from 'node:assert/strict';
import { returnMileageContext, returnCustomerAction } from '../src/lib/rentalMileage.js';
test('a historical swap never uses the original car odometer as its return minimum', () => {
  assert.deepEqual(returnMileageContext({ starting_mileage:104244, return_starting_mileage:null, vehicles:{current_mileage:69335}}), {baseline:null,minimum:69335,missingBaseline:true});
});
test('verified replacement reading and later fleet mileage both constrain return', () => {
  assert.deepEqual(returnMileageContext({ starting_mileage:70000, return_starting_mileage:70000, vehicles:{current_mileage:70100}}), {baseline:70000,minimum:70100,missingBaseline:false});
});
test('ordinary rentals retain their pickup baseline including zero', () => {
  assert.equal(returnMileageContext({starting_mileage:1000}).minimum,1000);
  assert.equal(returnMileageContext({starting_mileage:0}).missingBaseline,false);
});
test('normal returns and mileage overrides never flag a customer from a stale/default draft choice', () => {
  for (const customerAction of ['review','block','none']) {
    assert.equal(returnCustomerAction({damageFound:false,mileageOverride:true,customerAction}), 'none');
    assert.equal(returnCustomerAction({damageFound:false,customerAction}), 'none');
  }
  assert.equal(returnCustomerAction({damageFound:true,customerAction:'review'}),'review');
  assert.equal(returnCustomerAction({damageFound:true,customerAction:'block'}),'block');
  assert.equal(returnCustomerAction({damageFound:true,customerAction:'none'}),'none');
});

// Execute the actual return action with isolated API/state responses.
const {readFileSync}=await import('node:fs');
const {default:vm}=await import('node:vm');
const main=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
const action=main.slice(main.indexOf('  async function completeRentalReturn('),main.indexOf('  async function releaseSecurityDeposit('));
function returnFixture({closeError=null}={}) {
  const calls=[],notices=[];
  const context=vm.createContext({returnCustomerAction,requireStaffPermission:()=>true,needsReturnEvidenceReport:()=>false,
    parseMileageInput:Number,prettyStatus:String,supabase:{rpc:async(name,args)=>{calls.push({name,args});return {data:closeError?null:{id:'rental',status:'completed'},error:closeError};}},
    setProfiles:()=>{},setRentals:()=>{},setVehicles:()=>{},setEmergencyExceptions:()=>{},refreshAfterSavedTask:()=>{},notify:(...args)=>{notices.push(args);}});
  vm.runInContext(action,context);
  return {calls,notices,run:inspection=>context.completeRentalReturn({id:'rental',user_id:'customer',vehicle_id:'car'},inspection)};
}
test('normal return sends no customer flag in its single atomic request',async()=>{
 const f=returnFixture();assert.equal(await f.run({endingMileage:2000,customerAction:'review'}),true);
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].args.p_return_context.customer_action,'none');
});
test('failed return has no separate report, message or customer flag writes',async()=>{
 const f=returnFixture({closeError:{message:'Mileage conflict'}});await f.run({damageFound:true,customerAction:'block'});
 assert.equal(f.calls.length,1);assert.match(f.notices.at(-1)[0],/Mileage conflict/);
});
test('damage return sends the requested flag through the same return transaction',async()=>{
 const f=returnFixture();assert.equal(await f.run({damageFound:true,customerAction:'block',damageNote:'Verified return damage'}),true);
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].args.p_return_context.customer_action,'block');
 assert.equal(f.calls[0].name,'admin_inspect_and_complete_rental_return');
});
