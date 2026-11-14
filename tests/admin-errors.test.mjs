import test from 'node:test';
import assert from 'node:assert/strict';
import {adminErrorMessage,installFunctionErrors} from '../src/lib/adminErrors.js';
import {createPortalTransport,describeRequest} from '../src/lib/portalTransport.js';
test('plain booking errors survive the Edge SDK boundary',async()=>{
 const client={functions:{invoke:async()=>({data:null,error:{message:'Edge Function returned a non-2xx status code',context:new Response(JSON.stringify({error:'This customer already has an open rental. Contact Rent Me CT.'}))}})}};
 installFunctionErrors(client);
 const {error}=await client.functions.invoke('admin-manual-booking');
 assert.equal(error.code,'CUSTOMER_RENTAL_OPEN');assert.match(error.message,/existing rental/);assert.equal(error.field,'customerId');
});
test('specific causes and unknown outcomes remain actionable',()=>{
 for(const text of ['Enter ending mileage.','This rental cannot be extended until payment is reconciled.','Vehicle schedule conflict: another rental occupies this time.','This vehicle is blocked for maintenance.'])assert.equal(adminErrorMessage({message:text}),text);
 assert.match(adminErrorMessage({message:'duplicate key violates rentals_one_active_per_customer_idx',code:'23505'}),/customer already has an open rental/);
 assert.match(adminErrorMessage({message:'duplicate key violates customer_email_key',code:'23505'}),/already exists/);
 assert.match(adminErrorMessage(new Error('Failed to fetch'),'Save payment'),/check the saved result/i);
 assert.match(adminErrorMessage({message:'The response took too long. The change may already be saved. Check saved result before submitting again.'}),/may already be saved/);
 assert.match(adminErrorMessage({message:'permission denied',code:'42501'}),/permission/);
 assert.match(adminErrorMessage({message:'[object Object]'},'Return this rental'),/Return this rental/);
 assert.doesNotMatch(adminErrorMessage({message:'SQL statement SELECT secrets FROM vault'}),/SELECT|vault/);
});
test('REST errors retain status and do not create uncertain writes on a known rejection',async()=>{
 const transport=createPortalTransport({fetch:async()=>new Response(JSON.stringify({code:'23505',message:'duplicate key violates rentals_one_active_per_customer_idx'}),{status:409,headers:{'content-type':'application/json'}})});
 transport.setOwner('staff');
 const response=await transport.fetch('https://db.example/rest/v1/rpc/admin_create_manual_rental',{method:'POST',body:'{}'});
 assert.equal(response.status,409);assert.match((await response.json()).message,/already has an open rental/);assert.equal(transport.snapshot().length,0);
});
test('summary reads do not create pending-write recovery locks',()=>{
 for(const rpc of ['admin_customer_directory_page','admin_payment_activity_page','admin_operation_summaries','admin_toll_rental_candidates','admin_communication_threads']) assert.equal(describeRequest('https://db.example/rest/v1/rpc/'+rpc,{method:'POST'}).read,true);
});
