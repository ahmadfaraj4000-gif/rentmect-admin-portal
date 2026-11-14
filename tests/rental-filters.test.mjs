import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {needsDepositReview} from '../src/lib/depositSettlement.js';
import {rentalHasActionableIssue} from '../src/rentalNeedsAction.js';
const source=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
const start=source.indexOf('function rentalMatchesFilter(');
const context=vm.createContext({needsDepositReview,rentalHasActionableIssue,Date,Intl,latestCustomerDocument:()=>null,getReleaseChecklist:()=>({ready:true}),isOverdue:()=>false});
vm.runInContext(source.slice(start,source.indexOf('\nfunction latestCustomerDocument',start)),context);
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
test('all rental filters respect terminal status, physical possession, lock and deposit routing',()=>{
 for(const status of ['documents_needed','ready_for_pickup','approved','active','rented','overdue','return_initiated','completed','cancelled'])for(const locked of [false,true]){
 const terminal=['completed','cancelled'].includes(status),out=['active','rented','overdue','return_initiated'].includes(status);
 const rental={id:'r',vehicle_id:'v',status,payment_status:'paid',return_date:today,ending_mileage:status==='completed'?1200:null,deposit_status:'held',deposit_held_amount:300};
 const opts={vehicles:[{id:'v',status:'available',maintenance_lock_active:locked}],extensionRequests:[{rental_id:'r',status:'pending'}]};
 const expected={needs_action:!terminal,ready_pickup:!terminal&&!out&&!locked,cars_out:out,returns_today:out,extensions:!terminal,maintenance:!terminal&&locked,all:!terminal,archive:status==='cancelled',deposit_review:status==='completed'};
 for(const [filter,want] of Object.entries(expected))assert.equal(context.rentalMatchesFilter(rental,filter,opts),want,`${status} lock=${locked} filter=${filter}`);
 }
});
test('clearing maintenance moves a cleared upcoming rental from action to pickup; released deposits archive',()=>{
 const r={id:'r',vehicle_id:'v',status:'approved',payment_status:'paid'};
 for(const state of ['maintenance','unavailable','inactive','retired']){
 const opts={vehicles:[{id:'v',status:state}]};assert.equal(context.rentalMatchesFilter(r,'needs_action',opts),true);assert.equal(context.rentalMatchesFilter(r,'ready_pickup',opts),false);
 }
 const opts={vehicles:[{id:'v',status:'available'}]};assert.equal(context.rentalMatchesFilter(r,'needs_action',opts),false);assert.equal(context.rentalMatchesFilter(r,'ready_pickup',opts),true);
 const done={...r,status:'completed',ending_mileage:1200,deposit_status:'released',deposit_held_amount:0};assert.equal(context.rentalMatchesFilter(done,'archive'),true);assert.equal(context.rentalMatchesFilter(done,'deposit_review'),false);
});
