import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { adminRefreshDomains } from '../src/lib/adminRefreshDomains.js';

const source = fs.readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
const tabs = { dashboard: ['snapshot'], rentals: ['core', 'payments'], settings: ['settings'] };

test('manual refresh only reloads the current page, even after visiting other sections', async () => {
  const start = source.indexOf('  async function loadAllData({');
  const code = source.slice(start, source.indexOf('  async function loadAllDataLegacy', start));
  const calls = [];
  const context = vm.createContext({
    ADMIN_TAB_DOMAINS: tabs, activeTabRef: { current: 'dashboard' }, adminRefreshDomains,
    loadedAdminDomainsRef: { current: new Set(['core', 'payments', 'settings']) },
    setLoading() {}, loadAdminDomain: async (domain, options) => calls.push([domain, options.force]),
  });
  vm.runInContext(code, context);
  await vm.runInContext('loadAllData({silent:true})', context);
  assert.deepEqual(calls, [['snapshot', true]]);
  calls.length = 0;
  await vm.runInContext("loadAllData({silent:true, domains:['core','payments']})", context);
  assert.deepEqual(calls, [['core', true], ['payments', true]]);
});

test('realtime changes invalidate inactive pages without starting background downloads', () => {
  const start = source.indexOf('    const scheduleDomainRefresh =');
  const code = source.slice(start, source.indexOf('    const calendarChannel', start));
  const loaded = new Set(['payments']);
  const versions = new Map();
  const callbacks = [];
  const calls = [];
  const activeTabRef = { current: 'dashboard' };
  const context = vm.createContext({
    ADMIN_TAB_DOMAINS: tabs, activeTabRef, adminRefreshDomains,
    domainInvalidationsRef: { current: versions }, loadedAdminDomainsRef: { current: loaded },
    refreshTimers: new Map(), document: { visibilityState: 'visible' },
    window: { clearTimeout() {}, setTimeout(callback) { callbacks.push(callback); return callbacks.length; } },
    loadAdminDomain: (domain, options) => calls.push([domain, options.force]),
  });
  vm.runInContext(code, context);
  vm.runInContext("scheduleDomainRefresh('payments')", context);
  assert.equal(loaded.has('payments'), false);
  assert.equal(versions.get('payments'), 1);
  assert.equal(callbacks.length, 0);
  activeTabRef.current = 'rentals';
  vm.runInContext("scheduleDomainRefresh('payments')", context);
  callbacks[0]();
  assert.deepEqual(calls, [['payments', true]]);
  assert.equal(versions.get('payments'), 2);
});

test('payment events retain customer and vehicle context without repeated rental joins', () => {
  const start = source.indexOf('function buildPaymentEvents(');
  const end = source.indexOf('\nfunction ', start + 1);
  const code = source.slice(start, end > start ? end : undefined);
  const context = vm.createContext({
    normalizeLedgerStatus: (value) => value, prettyStatus: (value) => value,
    paymentSourceDetail: () => 'Stripe', buildDepositRefundHistory: () => [],
  });
  vm.runInContext(code, context);
  const events = context.buildPaymentEvents({
    rentals: [{ id: 'r451', status: 'completed', profiles: { full_name: 'Test Customer' }, vehicles: { name: 'Van #451' } }],
    rentalCharges: [{ id: 'booking', rental_id: 'r451', charge_type: 'rental_amendment', status: 'paid', total_amount: 0 }, { id: 'fuel', rental_id: 'r451', status: 'paid', payment_provider: 'deposit', charge_type: 'fuel', total_amount: 56.38 }],
  });
  const fuel = events.find((event) => event.id === 'charge-fuel');
  assert.equal(fuel.customer, 'Test Customer');
  assert.equal(fuel.vehicle, 'Van #451');
  assert.equal(fuel.amount, 56.38);
  assert.equal(fuel.cashImpact, 0);
});
