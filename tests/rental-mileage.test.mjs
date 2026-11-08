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
