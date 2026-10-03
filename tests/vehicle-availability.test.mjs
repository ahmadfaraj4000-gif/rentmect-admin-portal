import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';

const source = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
const hookSource = readFileSync(new URL('../src/useVehicleAvailability.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '').replace('export function', 'function');
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
function hookHarness() {
  const states = []; let cursor = 0; let deps; let cleanup; let effect; const timers = [];
  const context = vm.createContext({ Date, JSON, Array, Boolean, Error,
    withReadRetry: (fn) => fn(), setTimeout: (fn) => { timers.push(fn); return fn; }, clearTimeout: (fn) => { const i=timers.indexOf(fn);if(i>=0)timers.splice(i,1); },
    useState(initial) { const index = cursor++; if (!(index in states)) states[index]=initial;
      return [states[index],(value)=>{states[index]=typeof value==='function'?value(states[index]):value;}]; },
    useEffect(fn,next) { if (!deps || next.some((v,i)=>v!==deps[i])) { cleanup?.(); deps=next; effect=fn; } },
  });
  const use = vm.runInContext(`${hookSource}; useVehicleAvailability;`,context);
  return {render(...args){cursor=0;const result=use(...args);if(effect){const f=effect;effect=null;cleanup=f();}return result;},run:()=>timers.shift()?.()};
}

test('availability is never green for an old time window, and late responses are ignored',async()=>{
  const h=hookHarness(); const old=deferred();let calls=0;
  const client={rpc:()=>++calls===1?old.promise:Promise.resolve({data:[{vehicle_id:'car',available:false}],error:null})};
  const args=[client,'rental','2026-10-03T14:00:00Z','2026-10-04T14:00:00Z','car'];
  assert.equal(h.render(...args).ready,false); const first=h.run();
  const next=[...args];next[3]='2026-10-05T14:00:00Z';
  assert.equal(h.render(...next).ready,false);await h.run();
  old.resolve({data:[{vehicle_id:'car',available:true}],error:null});await first;
  const state=h.render(...next);
  assert.equal(state.ready,true);assert.equal(state.rows[0].available,false);
});

test('failed availability remains blocked until a successful retry',async()=>{
 const h=hookHarness();let fails=true;const client={rpc:async()=>fails?{error:new Error('offline')}:{data:[{vehicle_id:'car',available:true}]}};
 const args=[client,'rental','2026-10-03T14:00:00Z','2026-10-04T14:00:00Z','car'];
 h.render(...args);await h.run();let state=h.render(...args);
 assert.equal(state.ready,false);assert.equal(state.error,'offline');
 fails=false;state.retry();h.render(...args);await h.run();state=h.render(...args);assert.equal(state.ready,true);
});

const getComponent=async(name,next)=>{
 const code=source.slice(source.indexOf(`function ${name}(`),source.indexOf(`function ${next}(`));
 return (await transformWithOxc(`${code};${name};`,'availability.jsx',{jsx:{runtime:'classic'}})).code;
};
const helpers={React,useDialogFocus:()=>({current:null}),useRef:()=>({current:null}),useEffect:()=>{},
 useState:(initial)=>[typeof initial==='function'?initial():initial,()=>{}],crypto:{randomUUID:()=> 'fixture'},supabase:{},
 Car:()=>null,CalendarClock:()=>null,X:()=>null,MONEY_MAX:100000,calendarTimeOptions:()=>['9:00 AM'],
 formatRentalDate:(d,t)=>`${d} ${t}`,formatEasternDateTime:(v)=>v,easternDateTimeInputToIso:()=>null,
 parseBookingDateTime:()=>new Date('2026-10-03T13:00:00Z'),RentalAvailabilityNotice:()=>null};
const rental={id:'r',vehicle_id:'current',return_date:'2026-10-04',return_time:'9:00 AM',vehicles:{name:'Current car',daily_rate:64}};

test('swap options visibly disable unavailable vehicles and review stays blocked',async()=>{
 const Swap=vm.runInNewContext(await getComponent('VehicleSwapModal','RentalAmendmentModal'),{
 ...helpers,useVehicleAvailability:()=>({ready:true,rows:[{vehicle_id:'free',available:true},{vehicle_id:'busy',available:false}]})});
 const html=renderToStaticMarkup(React.createElement(Swap,{rental,vehicles:[{id:'free',name:'Free car'},{id:'busy',name:'Booked car'}]}));
 assert.match(html,/<option value="free">Free car — Available<\/option>/);
 assert.match(html,/<option value="busy" disabled="">Booked car — Unavailable<\/option>/);
 assert.match(html,/<button class="primary-btn" disabled="">Review swap<\/button>/);
});

test('extension cannot review while unavailable or still checking',async()=>{
 for(const state of [{ready:false,rows:[]},{ready:true,rows:[{vehicle_id:'current',available:false}]}]){
 const Extension=vm.runInNewContext(await getComponent('AdminRentalExtensionModal','VehicleSwapModal'),{...helpers,useVehicleAvailability:()=>state});
 const html=renderToStaticMarkup(React.createElement(Extension,{rental}));
 assert.match(html,/<button class="primary-btn" disabled="">Review extension<\/button>/);
 }
});

test('availability notice exposes conflict times and the next booking to the admin',async()=>{
 const Notice=vm.runInNewContext(await getComponent('RentalAvailabilityNotice','AdminRentalExtensionModal'),helpers);
 const html=renderToStaticMarkup(React.createElement(Notice,{vehicleId:'car',availability:{ready:true,rows:[{vehicle_id:'car',available:false,
 conflicts:[{source_id:'r',reason:'Reserved rental',starts_at:'Oct 4 noon',ends_at:'Oct 10 noon'}],next_reservation:{starts_at:'Oct 4 noon',ends_at:'Oct 10 noon'}}]}}));
 assert.match(html,/Unavailable for these dates/);assert.match(html,/Next reservation: Oct 4 noon/);assert.match(html,/at least three hours/);
});
