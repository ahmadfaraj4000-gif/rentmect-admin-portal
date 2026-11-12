import test from 'node:test';
import assert from 'node:assert/strict';
import { createCustomerTicketFlagStore } from '../src/lib/customerTicketFlags.js';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check) { for (let i=0;i<100;i++) { if(check()) return; await delay(5); } assert.ok(check(), 'condition reached'); }
function setup(fetchFlags, options={}) {
  let state=new Map(); const diagnostics=[];
  const store=createCustomerTicketFlagStore({fetchFlags,onChange:value=>{state=value},onError:e=>diagnostics.push(e),debounceMs:1,retryMs:5,maxRetryMs:10,deadlineMs:100,...options});
  return {store,get state(){return state},diagnostics};
}
test('temporary read failure recovers automatically without a click or page reload',async()=>{
 let calls=0;const h=setup(async()=>++calls===1?{error:{message:'Load failed'},status:0}:{data:[]});
 try{h.store.register('a');await until(()=>h.state.get('a')?.checked);assert.equal(calls,2);assert.equal(h.state.get('a').error,'');}finally{h.store.dispose()}
});
test('failed refresh retains confirmed flags until a successful refresh clears them',async()=>{
 let fail=false;const row={id:'ticket',user_id:'a'};
 const h=setup(async()=>fail?{error:{message:'Network connection lost'}}:{data:[row]}, {retryMs:100});
 try{h.store.register('a');await until(()=>h.state.get('a')?.checked);fail=true;h.store.refresh();await until(()=>h.state.get('a')?.retrying);assert.deepEqual(h.state.get('a').rows,[row]);assert.equal(h.state.get('a').checked,true);fail=false;h.store.refresh();await until(()=>!h.state.get('a')?.error);assert.deepEqual(h.state.get('a').rows,[row]);}finally{h.store.dispose()}
});
test('permission failures are actionable, isolated to their batch and not endlessly retried',async()=>{
 let calls=0;const h=setup(async ids=>{calls++;return ids.includes('u500')?{error:{message:'Staff access required',code:'42501'},status:403}:{data:[]}});
 try{for(let i=0;i<501;i++)h.store.register('u'+i);await until(()=>h.state.get('u500')?.error);assert.equal(h.state.get('u0').checked,true);assert.equal(h.state.get('u0').error,'');assert.equal(h.state.get('u500').retrying,false);await delay(30);assert.equal(calls,2);}finally{h.store.dispose()}
});
test('duplicate customer cards and repeated refresh events never create concurrent lookups',async()=>{
 let calls=0,resolve;const h=setup(()=>{calls++;return new Promise(r=>{resolve=r})});
 try{const off=h.store.register('a');h.store.register('a');await until(()=>calls===1);off();for(let i=0;i<20;i++)h.store.refresh();await delay(10);assert.equal(calls,1);resolve({data:[]});await until(()=>calls===2);resolve({data:[]});await until(()=>h.state.get('a')?.checked);assert.equal(calls,2);}finally{h.store.dispose()}
});
test('whole-request deadline includes a stalled auth/session wait and aborts before retry',async()=>{
 let calls=0,firstSignal;const h=setup((ids,signal)=>{calls++;if(calls===1){firstSignal=signal;return new Promise(()=>{})}return {data:[]}}, {deadlineMs:10});
 try{h.store.register('a');await until(()=>h.state.get('a')?.checked);assert.equal(firstSignal.aborted,true);assert.equal(calls,2);}finally{h.store.dispose()}
});
test('disposing a session aborts requests and ignores late results',async()=>{
 let resolve,signal;const h=setup((ids,s)=>{signal=s;return new Promise(r=>{resolve=r})});
 h.store.register('a');await until(()=>resolve);h.store.dispose();resolve({data:[{user_id:'a'}]});await delay(10);assert.equal(signal.aborted,true);assert.equal(h.state.size,0);
});
test('invalid responses cannot masquerade as a successful empty flag list',async()=>{
 const h=setup(async()=>({data:null}));try{h.store.register('a');await until(()=>h.state.get('a')?.error);assert.equal(h.state.get('a').checked,false);assert.match(h.state.get('a').error,/invalid response/);}finally{h.store.dispose()}
});
test('successful refresh replaces old flags, including an explicitly cleared flag',async()=>{
 let rows=[{id:'ticket',user_id:'a'}];const h=setup(async()=>({data:rows}));try{h.store.register('a');await until(()=>h.state.get('a')?.checked);rows=[];h.store.refresh();await until(()=>h.state.get('a')?.rows.length===0);assert.equal(h.state.get('a').error,'');}finally{h.store.dispose()}
});
