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

test('real booking submit keeps exact backend conflicts inline and avoids boolean availability masking',async()=>{
 const {readFileSync}=await import('node:fs');const vm=await import('node:vm');
 const source=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
 const start=source.indexOf('  async function createManualBooking(event)');
 const controller=source.slice(start,source.indexOf('\n  async function ',start+1));
 const messages=[],inline=[],busy=[],calls=[];
 const profile={id:'customer',full_name:'Synthetic Customer',date_of_birth:'1990-01-01'};
 const form={customerMode:'existing',customerId:'customer',vehicleId:'car',onboardingDelivery:'none',pickupDate:'2026-12-01',returnDate:'2026-12-02',pickupTime:'9:00 AM',returnTime:'9:00 AM',existingPhone:'',driverLicenseNumber:'',driverLicenseState:'',insuranceProvider:'',insurancePolicyNumber:''};
 const conflict='This customer already has a rental scheduled during those dates and times. A customer can use only one rental vehicle at a time.';
 const context=vm.createContext({manualBookingInFlight:{current:false},adminErrorMessage,manualBookingForm:form,profiles:[profile],vehicles:[{id:'car'}],bookingPolicy:{},requireStaffPermission:()=>true,isEligibleAdminBirthday:()=>true,getBookingWindow:()=>({valid:true}),setManualBookingError:x=>inline.push(x),setManualBookingSubmitting:x=>busy.push(x),notify:x=>messages.push(x),isVehicleAvailable:()=>{throw Error('Boolean precheck must not hide the database reason');},supabase:{rpc:async(name)=>{calls.push(name);return{data:{valid:true}}},functions:{invoke:async()=>({error:{message:'Edge Function returned a non-2xx status code',context:new Response(JSON.stringify({error:conflict,code:'CUSTOMER_DATES_OVERLAP'}),{status:400})}})}}});
 vm.runInContext(controller,context);await context.createManualBooking({preventDefault(){}});
 assert.match(inline.at(-1),/already has a reservation/);assert.equal(messages.at(-1),inline.at(-1));assert.deepEqual(busy,[true,false]);assert.deepEqual(calls,['get_booking_quote']);assert.equal(form.customerId,'customer');assert.equal(form.vehicleId,'car');
});

async function bookingHarness(invoke) {
 const {readFileSync}=await import('node:fs');const vm=await import('node:vm');
 const source=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
 const start=source.indexOf('  async function createManualBooking(event)');
 const controller=source.slice(start,source.indexOf('\n  async function sendBookingCompletionLink',start));
 const events=[],errors=[],calls=[];
 const context=vm.createContext({
  manualBookingInFlight:{current:false},adminErrorMessage,
  manualBookingForm:{customerMode:'existing',customerId:'customer',vehicleId:'car',onboardingDelivery:'both',existingPhone:'8605550100',driverLicenseNumber:'',driverLicenseState:'',insuranceProvider:'',insurancePolicyNumber:''},
  profiles:[{id:'customer',full_name:'Synthetic Customer',date_of_birth:'1990-01-01'}],vehicles:[{id:'car'}],bookingPolicy:{},
  requireStaffPermission:()=>true,isEligibleAdminBirthday:()=>true,isValidUSPhone:()=>true,getBookingWindow:()=>({valid:true}),
  setManualBookingError:x=>errors.push(x),setManualBookingSubmitting:x=>events.push(['busy',x]),notify:(...args)=>events.push(['notice',...args]),
  setManualBookingForm:()=>events.push(['reset']),clearBookingDraft:()=>{},refreshAfterSavedTask:()=>{},
  setManualBookingFocusId:id=>events.push(['focus',id]),setSelectedRentalId:()=>{},setRentalFilter:()=>{},setActiveTab:tab=>events.push(['tab',tab]),
  adminBookingDateOffset:()=>'',window:{requestAnimationFrame:fn=>fn(),scrollTo:()=>{}},prettySmsDeliveryStatus:x=>x.status,
  supabase:{rpc:async()=>({data:{valid:true}}),functions:{invoke:async(name,options)=>{calls.push(options.body);return invoke(options.body,events);}}},
 });
 vm.runInContext(controller,context);
 return {context,events,errors,calls,submit:()=>context.createManualBooking({preventDefault(){}})};
}

test('booking completes and opens saved rental before delayed delivery; duplicate submits are ignored',async()=>{
 let save,deliver;
 const h=await bookingHarness(async body=>body.action ? new Promise(resolve=>{deliver=resolve}) : new Promise(resolve=>{save=resolve}));
 const pending=h.submit();await new Promise(resolve=>setImmediate(resolve));
 await h.submit();assert.equal(h.calls.length,1);assert.equal(h.calls[0].onboardingDelivery,'none');
 save({data:{rental:{id:'saved-rental'}}});await pending;
 assert.equal(h.calls.length,2);assert.equal(h.calls[1].rentalId,'saved-rental');assert.equal(h.calls[1].delivery,'both');
 assert.ok(h.events.some(e=>e[0]==='tab'&&e[1]==='rentals'));assert.ok(h.events.some(e=>e[0]==='focus'&&e[1]==='saved-rental'));
 assert.equal(h.context.manualBookingInFlight.current,false);assert.deepEqual(h.errors,['']);
 deliver({error:new Error('SMS provider unavailable')});await new Promise(resolve=>setImmediate(resolve));
 assert.match(h.events.at(-1)[1],/Booking saved.*SMS provider unavailable.*Do not create another booking/);
 assert.deepEqual(h.errors,['']);assert.equal(h.calls.filter(x=>!x.action).length,1);
});

test('true booking conflict preserves form and never starts delivery',async()=>{
 const h=await bookingHarness(async()=>({data:{error:'This vehicle is blocked for maintenance.'}}));
 await h.submit();assert.equal(h.calls.length,1);assert.match(h.errors.at(-1),/maintenance/);
 assert.ok(!h.events.some(e=>e[0]==='reset'||e[0]==='tab'));assert.equal(h.context.manualBookingInFlight.current,false);
});

test('thrown transport errors release submit lock and never send a link',async()=>{
 const h=await bookingHarness(async()=>{throw new Error('Failed to fetch')});
 await h.submit();assert.equal(h.calls.length,1);assert.match(h.errors.at(-1),/check the saved result/i);assert.equal(h.context.manualBookingInFlight.current,false);
});

test('successful completion link uses only the saved rental and leaves booking errors empty',async()=>{
 const h=await bookingHarness(async body=>body.action?{data:{deliveryChannels:['text'],deliveryDetails:[{channel:'text',status:'delivered'}]}}:{data:{rental:{id:'saved'}}});
 await h.submit();await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(h.errors,['']);assert.ok(h.events.some(e=>e[0]==='notice'&&/Booking saved. Secure completion link sent by text/.test(e[1])));
});

test('missing confirmation never sends a link or claims booking success',async()=>{
 const h=await bookingHarness(async()=>({data:{}}));await h.submit();
 assert.match(h.errors.at(-1),/Check Rental Manager/);assert.equal(h.calls.length,1);assert.ok(!h.events.some(e=>e[0]==='reset'));
});
