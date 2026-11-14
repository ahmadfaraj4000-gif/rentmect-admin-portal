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
