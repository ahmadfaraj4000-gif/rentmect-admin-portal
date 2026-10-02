import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';
import { tripStartIsLocked } from '../src/lib/rentalTripStart.js';

const source = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
const component = source.slice(source.indexOf('function AdminRentalExtensionModal('), source.indexOf('function VehicleSwapModal('));
const transformed = await transformWithOxc(`${component}\nAdminRentalExtensionModal;`, 'extension.jsx', { jsx: { runtime: 'classic' } });
const rental = { id:'rental', vehicle_id:'audi', pickup_date:'2026-09-17', return_date:'2026-10-04', return_time:'9:00 AM', status:'active', vehicles:{name:'Audi',daily_rate:69} };
const quote = { revision:'reviewed', starts_at:'2026-10-04T13:00:00Z', ends_at:'2026-10-08T13:00:00Z', daily_rate:49,
  extension_days:4, previous_balance:156.33, extension_total:208.45, total_due:364.78, deposit_held:300 };
const helpers = { React, CalendarClock:()=>null, X:()=>null, MONEY_MAX:100000,
  money:n=>`$${Number(n).toFixed(2)}`, formatRentalDate:(d,t)=>`${d} ${t}`, formatEasternDateTime:s=>s,
  calendarTimeOptions:()=>['9:00 AM','10:00 AM'] };
function harness() {
  const state=[]; let cursor=0; const calls=[];
  const context = vm.createContext({ ...helpers, crypto:{randomUUID:()=>`key-${calls.length}-${Math.random()}`},
    useDialogFocus:()=>({current:null}), useRef:()=>({current:null}), useEffect:()=>{},
    useState(initial) { const index=cursor++; if (!(index in state)) state[index]=typeof initial==='function'?initial():initial;
      return [state[index],value=>{state[index]=typeof value==='function'?value(state[index]):value;}]; },
  });
  const Modal=vm.runInContext(transformed.code,context);
  return { calls, render() { cursor=0; return Modal({rental,
    onPreview:async(r,form)=>{calls.push({preview:form});return quote;},
    onApply:async(r,form,key)=>{calls.push({apply:form,key});return {success:true};},
    onCancel:()=>calls.push({closed:true}),
  });} };
}
function elements(tree) {
  if (!tree || typeof tree!=='object') return [];
  return [tree,...React.Children.toArray(tree.props?.children).flatMap(elements)];
}
const find = (tree, predicate) => elements(tree).find(predicate);

test('staff can review and confirm a separate extension without a customer request',async()=>{
  const h=harness();let tree=h.render();
  assert.match(renderToStaticMarkup(tree),/Extend rental/);
  const fill=(type,value)=>{find(tree,e=>e.type==='input'&&e.props.type===type).props.onChange({target:{value}});tree=h.render();};
  fill('date','2026-10-08');fill('number','49');
  find(tree,e=>e.type==='textarea').props.onChange({target:{value:'Customer agreed courtesy extension'}});tree=h.render();
  await find(tree,e=>e.type==='form').props.onSubmit({preventDefault(){}});tree=h.render();
  const html=renderToStaticMarkup(tree);
  for (const amount of ['$156.33','$208.45','$364.78','$300.00']) assert.ok(html.includes(amount));
  assert.match(html,/updates the booked return immediately/);
  await find(tree,e=>e.type==='button'&&e.props.children==='Confirm extension').props.onClick();
  const applied=h.calls.find(c=>c.apply);
  assert.equal(applied.apply.operation,'extension');
  assert.equal(applied.apply.vehicleId,'audi');
  assert.equal(applied.apply.dailyRate,'49');
  assert.equal(applied.apply.revision,'reviewed');
  assert.equal('pickupDate' in applied.apply,false);
  assert.ok(h.calls.some(c=>c.closed));
});

test('editing a reviewed extension removes confirmation until staff review again',async()=>{
  const h=harness();let tree=h.render();
  await find(tree,e=>e.type==='form').props.onSubmit({preventDefault(){}});tree=h.render();
  find(tree,e=>e.type==='input'&&e.props.type==='number').props.onChange({target:{value:'79'}});tree=h.render();
  assert.equal(find(tree,e=>e.type==='button'&&e.props.children==='Confirm extension'),undefined);
  assert.ok(find(tree,e=>e.type==='button'&&e.props.children==='Review extension'));
});

test('Extend rental is available on active and overdue rentals and hidden after return',async()=>{
  const line=source.split('\n').find(line=>line.includes('onClick={() => setExtensionOpen(true)}'));
  const code=await transformWithOxc(`function Action(){return <>${line}</>}; Action;`,'action.jsx',{jsx:{runtime:'classic'}});
  for (const [status,visible] of [['active',true],['rented',true],['overdue',true],['completed',false],['cancelled',false],['return_initiated',false],['ready_for_pickup',false]]) {
    const Action=vm.runInNewContext(code.code,{...helpers,rental:{...rental,status},detailed:true,previewRentalAmendment:()=>{},applyRentalAmendment:()=>{},setExtensionOpen:()=>{}});
    assert.equal(renderToStaticMarkup(React.createElement(Action)).includes('Extend rental'),visible,status);
  }
});

test('the familiar Edit button extends started rentals and edits unstarted reservations',async()=>{
  const line=source.split('\n').find(line=>line.includes('<Pencil size={14}/> Edit</button>'));
  const code=await transformWithOxc(`function Action(){return <>${line}</>}; Action;`,'edit-action.jsx',{jsx:{runtime:'classic'}});
  for (const [status,expected] of [['active','extension'],['rented','extension'],['overdue','extension'],['ready_for_pickup','edit'],['cancelled',null],['return_initiated',null]]) {
    const calls=[];
    const Action=vm.runInNewContext(code.code,{...helpers,Pencil:()=>null,tripStartIsLocked,rental:{...rental,status},detailed:true,
      setExtensionOpen:()=>calls.push('extension'),setEditRentalOpen:()=>calls.push('edit')});
    const tree=Action();
    const button=find(tree,e=>e.type==='button');
    if (expected===null) assert.equal(button,undefined,status);
    else {
      assert.match(renderToStaticMarkup(tree),/> Edit<\/button>/);
      button.props.onClick();
      assert.deepEqual(calls,[expected],status);
    }
  }
});
