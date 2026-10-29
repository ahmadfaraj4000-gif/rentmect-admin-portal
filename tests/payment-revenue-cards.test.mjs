import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';
import { canViewRevenue, calculatePaymentRevenue, REVENUE_TABLES } from '../src/lib/paymentRevenue.js';
const cardSource = readFileSync(new URL('../src/PaymentRevenueCards.jsx', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
const cardCode = (await transformWithOxc(cardSource.replace(/^import .*;\n/gm, '').replaceAll('export function ', 'function '), 'cards.jsx', { jsx: { runtime: 'classic' } })).code;
const context = vm.createContext({ React, useState: React.useState, useEffect: React.useEffect, useMemo: React.useMemo, useRef: React.useRef, CalendarDays: () => null, Banknote: () => null, canViewRevenue });
vm.runInContext(cardCode, context);

test('initial totals start immediately, survive ordinary renders, and refresh safely after an invalidation',async()=>{
  const hooks=[],timers=new Map(),requests=[];let index=0,nextTimer=0,effects=[];
  const slot=make=>{const i=index++;return hooks[i]||(hooks[i]=make());};
  const env=vm.createContext({React,AbortController,Date,canViewRevenue,calculatePaymentRevenue,
    CalendarDays:()=>null,Banknote:()=>null,supabase:{},
    useState(initial){const cell=slot(()=>({value:typeof initial==='function'?initial():initial}));return [cell.value,v=>{cell.value=typeof v==='function'?v(cell.value):v;}];},
    useRef(initial){return slot(()=>({current:initial}));},useMemo:fn=>fn(),
    useEffect(fn,deps){const cell=slot(()=>({deps:null}));if(!cell.deps||deps.some((v,i)=>!Object.is(v,cell.deps[i]))){cell.deps=deps;effects.push(()=>{cell.cleanup?.();cell.cleanup=fn();});}},
    setInterval:()=>1,clearInterval(){},
    setTimeout(fn,delay){const id=++nextTimer;timers.set(id,{fn,delay});return id;},clearTimeout:id=>timers.delete(id),
    performanceTelemetry:{isActive:token=>Boolean(token),start:()=>({}),afterPaint:()=>()=>{},cancel(){}},
    performanceOutcome:()=> 'error',
    loadPaymentRevenue:(_,signal)=>new Promise(resolve=>requests.push({signal,resolve})),
  });
  vm.runInContext(cardCode,env);
  const render=key=>{index=0;effects=[];env.PaymentRevenueCards({accountEmail:'anconamgt@aol.com',refreshKey:key});effects.forEach(run=>run());};
  const fire=delay=>{const [id,timer]=[...timers].find(([,t])=>t.delay===delay);timers.delete(id);return timer.fn();};
  render(0);const first=fire(0);assert.equal(requests.length,1);
  render(0);assert.equal(requests[0].signal.aborted,false);assert.equal(requests.length,1);
  render(1);assert.equal(requests[0].signal.aborted,true);assert.ok([...timers.values()].some(t=>t.delay===350));
  const second=fire(350);const empty=Object.fromEntries(Object.keys(REVENUE_TABLES).map(key=>[key,[]]));
  requests[1].resolve({...empty,marker:'new'});await second;
  requests[0].resolve({...empty,marker:'old'});await first;
  assert.equal(hooks[0].value.data.marker,'new');assert.equal(hooks[0].value.loading,false);
});
const example = { month: 12345.67, year: 234567.89, monthLabel: 'October 2026', yearLabel: '2026', monthKey: '2026-10', issues: [] };
const view = (props) => renderToStaticMarkup(React.createElement(context.RevenueCardsView, props));
test('new cards clearly explain revenue, deposits, fees, taxes, and reporting periods', () => {
  const html = view({ report: example });
  for (const label of ['Made This Month', 'Made This Year', '$12,345.67', '$234,567.89', 'October 2026', 'Excluding deposits', 'late fees', 'after refunds', 'sales tax', 'Before business expenses and processing fees', 'Connecticut time']) assert.ok(html.includes(label), label);
  assert.doesNotMatch(html, /Net Profit|net profit/);
});
test('loading and failures never masquerade as zero revenue, and incomplete records are labelled as estimates', () => {
  assert.match(view({ loading: true }), /Loading…/);
  const failed = view({ loading: false, error: 'offline' });
  assert.match(failed, /Unavailable/); assert.match(failed, /Retry totals/); assert.doesNotMatch(failed, /\$0\.00/);
  const review = view({ report: { ...example, issues: [{ rentalId: 'r', reason: 'Missing receipt.' }] } });
  assert.match(review, /Estimate ·/); assert.match(review, /may be incomplete/); assert.match(review, /Missing receipt/);
});
test('unauthorized accounts render no new cards', () => {
  const html = renderToStaticMarkup(React.createElement(context.PaymentRevenueCards, { accountEmail: 'someone@example.com', refreshKey: [] }));
  assert.equal(html, '');
});
test('Payments preserves all four original indicators and adds two, behind the existing account gate', async () => {
  const source = main.slice(main.indexOf('function PaymentsTab('), main.indexOf('\nfunction tollRentalCandidates('));
  const transformed = await transformWithOxc(source, 'payments.jsx', { jsx: { runtime: 'classic' } });
  const env = vm.createContext({ React, DollarSign: () => null, ReceiptText: () => null, Clock: () => null,
    Metric: ({ label, value }) => React.createElement('div', { className: 'metric-card' }, label, value),
    PaymentRevenueCards: ({ accountEmail }) => canViewRevenue(accountEmail) ? React.createElement(context.RevenueCardsView, { report: example }) : null,
    Panel: ({ children }) => React.createElement('section', null, children), money: (value) => `$${value}`, paymentEventMatchesFilter: () => true });
  vm.runInContext(transformed.code, env);
  const props = { canViewFinancialSummary: true, accountEmail: 'anconamgt@aol.com', paymentEvents: [], rentals: [] };
  const html = renderToStaticMarkup(React.createElement(env.PaymentsTab, props));
  assert.equal((html.match(/class="metric-card/g) || []).length, 6);
  for (const label of ['Gross Collected', 'Refunded', 'Outstanding', 'Deposits Held']) assert.ok(html.includes(label));
  const other = renderToStaticMarkup(React.createElement(env.PaymentsTab, { ...props, canViewFinancialSummary: false, accountEmail: 'other@example.com' }));
  assert.doesNotMatch(other, /Made This|payments-metrics/);
});

test('one clear review note replaces duplicate alarms, and older refunds do not label October as incomplete', () => {
  const issue = { recordId: 'refund', rentalId: 'r', refundId: 're1', date: '2026-09-07T12:00:00Z', amount: 300, kind: 'refund_category', reason: 'Needs classification', periods: ['year'] };
  const html = view({ report: { ...example, issues: [issue, issue] }, onOpenRental: () => {}, reconciliation: [{ id: 'provider', rentalId: 'r', refundId: 're1', date: issue.date, amount: 300, customer: 'Example Customer' }] });
  assert.equal((html.match(/Estimate ·/g) || []).length, 1);
  assert.match(html, /Year total is an estimate/);
  assert.match(html, /1 refund needs a category/);
  assert.match(html, /Example Customer/);
  assert.match(html, /\$300\.00/);
  assert.match(html, /View rental/);
  assert.doesNotMatch(html, /Urgent|Provisional|Rental r\./);
  assert.match(main, /!canViewFinancialSummary && openReconciliation\.length > 0/);
});
test('technical read errors do not leak database diagnostics into the client screen', () => {
  const html = view({ error: 'Could not load rental_payments: PostgREST failed' });
  assert.match(html, /temporarily unavailable/);
  assert.match(html, /Retry totals/);
  assert.doesNotMatch(html, /PostgREST|rental_payments/);
});
test('a separate unresolved payment on the same rental remains visible', () => {
  const issue = { recordId: 'refund', rentalId: 'r', refundId: 're1', amount: 300, kind: 'refund_category', periods: ['year'] };
  const html = view({ report: { ...example, issues: [issue] }, reconciliation: [{ id: 'capture', rentalId: 'r', amount: 100, date: '2026-10-01T12:00:00Z' }] });
  assert.match(html, /2 payment records to check/);
  assert.match(html, /Revenue totals/);
});
