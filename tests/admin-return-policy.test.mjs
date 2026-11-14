import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
const section=(start,end)=>source.slice(source.indexOf(`function ${start}(`),source.indexOf(`function ${end}(`));
const context=vm.createContext({Date,parseRentMeCtDateTime:(d,t)=>d?new Date(`${d}T${t}`):null});
vm.runInContext(section('getLateReturnState','isDueSoon')+section('getTurnaroundBlockedUntil','rentalBlocksCalendarDay'),context);
test('every out status blocks immediately and indefinitely, independently of due date',()=>{
 for(const status of ['active','rented','overdue','return_initiated']){
  const state=context.getLateReturnState('2099-01-01','09:00:00',status);
  assert.equal(state.hardLocked,true);assert.equal(state.inGrace,false);assert.equal(state.overdue,false);
  assert.equal(context.getTurnaroundBlockedUntil(new Date(),{status}).getTime(),8640000000000000);
 }
});
test('lateness starts at scheduled end, without a grace period; initiated return remains locked',()=>{
 assert.equal(context.getLateReturnState('2000-01-01','09:00:00','active').overdue,true);
 assert.equal(context.getLateReturnState('2000-01-01','09:00:00','return_initiated').hardLocked,true);
});
test('completed and unstarted reservations have no possession lock or padded end',()=>{
 for(const status of ['completed','cancelled','documents_needed','reserved']){
  assert.equal(context.getLateReturnState('2000-01-01','09:00:00',status).hardLocked,false);
  const end=new Date();assert.equal(context.getTurnaroundBlockedUntil(end,{status}),end);
 }
});

test('live calendar possession events survive mapping and cover every future day until inspection',()=>{
 const c=vm.createContext({Date,TURNAROUND_BUFFER_MINUTES:0,DEFAULT_AVAILABILITY_TYPES:{on_road:{color:'#123'}},
  parseRentMeCtDateTime:(d,t)=>new Date(`${d}T${t==='11:59 PM'?'23:59:00':t==='12:00 AM'?'00:00:00':'09:00:00'}Z`),
  buildAvailableCalendarSegment:()=>({kind:'available'}),rentalStatusToAvailabilityType:()=> 'on_road',
  prettyStatus:x=>x,formatRentalDate:()=>'',formatDateTime:()=>'',formatTimeOnly:()=>'',calendarBlockLabel:()=>'',
 });
 vm.runInContext(section('getLateReturnState','isDueSoon')+section('getRentalBlockedUntil','rentalBlocksCalendarDay')+section('buildCalendarDaySegments','buildAvailableCalendarSegment'),c);
 const a=source.indexOf('  const canonicalRentals = canonicalEvents');const b=source.indexOf('  const canonicalBlocks',a);
 const map=vm.runInContext(`(canonicalEvents)=>{${source.slice(a,b)}return canonicalRentals}`,c);
 for(const status of ['active','rented','overdue','return_initiated']){
  const rentals=map([{id:'out',vehicle_id:'v',event_type:'late_return_lock',status,start_date:'2026-01-01',end_date:'2026-11-30',start_time:'9:00 AM',end_time:'11:59 PM',customer_name:'Synthetic'}]);
  assert.equal(rentals.length,1);assert.equal(rentals[0].physical_return_lock,true);
  for(const dayIso of ['2026-11-14','2026-11-30','2027-02-01']){
   const segments=c.buildCalendarDaySegments({rentals,dayIso,vehicleId:'v'});
   assert.equal(segments.length,1);assert.equal(segments[0].width,100);assert.equal(segments[0].kind,'rental');
   assert.match(segments[0].title,/return and inspection/);assert.equal(segments[0].label,'Awaiting return');
  }
 }
 // After canonical refresh removes the returned event, no stale lock remains.
 assert.equal(c.buildCalendarDaySegments({rentals:map([]),dayIso:'2026-11-14',vehicleId:'v'}).length,0);
 assert.equal(map([{event_type:'manual_block'},{event_type:'maintenance_lock'}]).length,0);
 assert.equal(map([{event_type:'rental'},{event_type:'checkout_hold'}]).length,2);
});
