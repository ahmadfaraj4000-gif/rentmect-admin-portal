import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';
import { canViewRevenue } from '../src/lib/paymentRevenue.js';
const cardSource = readFileSync(new URL('../src/PaymentRevenueCards.jsx', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
const cardCode = (await transformWithOxc(cardSource.replace(/^import .*;\n/gm, '').replaceAll('export function ', 'function '), 'cards.jsx', { jsx: { runtime: 'classic' } })).code;
const context = vm.createContext({ React, useState: React.useState, useEffect: React.useEffect, useMemo: React.useMemo, CalendarDays: () => null, Banknote: () => null, canViewRevenue });
vm.runInContext(cardCode, context);
const example = { month: 12345.67, year: 234567.89, monthLabel: 'October 2026', yearLabel: '2026', issues: [] };
const view = (props) => renderToStaticMarkup(React.createElement(context.RevenueCardsView, props));
test('new cards clearly explain revenue, deposits, fees, taxes, and reporting periods', () => {
  const html = view({ report: example });
  for (const label of ['Made This Month', 'Made This Year', '$12,345.67', '$234,567.89', 'October 2026', 'Excluding deposits', 'late fees', 'after refunds', 'sales tax', 'Before business expenses and processing fees', 'Connecticut time']) assert.ok(html.includes(label), label);
  assert.doesNotMatch(html, /Net Profit|net profit/);
});
test('loading and failures never masquerade as zero revenue, and incomplete records are labelled provisional', () => {
  assert.match(view({ loading: true }), /Loading…/);
  const failed = view({ loading: false, error: 'offline' });
  assert.match(failed, /Unavailable/); assert.match(failed, /Retry totals/); assert.doesNotMatch(failed, /\$0\.00/);
  const review = view({ report: { ...example, issues: [{ rentalId: 'r', reason: 'Missing receipt.' }] } });
  assert.match(review, /Provisional ·/); assert.match(review, /may be incomplete/); assert.match(review, /Missing receipt/);
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
