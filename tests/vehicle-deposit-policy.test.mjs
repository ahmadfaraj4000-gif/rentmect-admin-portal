import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');

test('saving rental markup cannot restore a stale or disabled deposit surcharge', async () => {
  const start = source.indexOf('  async function saveUnder25Pricing(event)');
  const end = source.indexOf('  async function saveBillingAutomation', start);
  let payload;
  const saved = [];
  const context = vm.createContext({
    under25Pricing: { deposit_adjustment_enabled: false, deposit_adjustment_type: 'percentage',
      deposit_adjustment_value: 250, rental_markup_percentage: 12 },
    requireStaffPermission: () => true,
    setUnder25PricingSaving: () => {},
    setUnder25Pricing: (value) => saved.push(value),
    session: { user: { id: 'admin' } },
    notify: () => {},
    supabase: { from: (table) => {
      assert.equal(table, 'under_25_pricing_settings');
      return { update: (value) => {
        payload = value;
        return { eq: () => ({ select: () => ({ single: async () => ({ data: value, error: null }) }) }) };
      }};
    }},
  });
  await vm.runInContext(source.slice(start, end) + '\nsaveUnder25Pricing();', context);
  assert.equal(payload.deposit_adjustment_enabled, true);
  assert.equal(payload.deposit_adjustment_type, 'fixed');
  assert.equal(payload.deposit_adjustment_value, 200);
  assert.equal(payload.rental_markup_percentage, 12);
  assert.equal(saved.length, 1);
});

test('pricing settings explain the fixed surcharge and retain the rental markup control', async () => {
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { transformWithOxc } = await import('vite');
  const start = source.indexOf('<form className="portal-form settings-form" onSubmit={saveUnder25Pricing}>');
  const end = source.indexOf('</form>', start) + '</form>'.length;
  const compiled = await transformWithOxc(
    'const Settings = () => (' + source.slice(start, end) + '); Settings;',
    'deposit-settings.jsx', { jsx: { runtime: 'classic' } });
  const context = vm.createContext({
    React, saveUnder25Pricing: () => {}, setUnder25Pricing: () => {},
    under25Pricing: { rental_markup_percentage: 10 }, under25PricingSaving: false,
    calculateAdminUnder25Deposit: (amount) => amount + 200,
    money: (amount) => '$' + amount,
  });
  const Settings = vm.runInContext(compiled.code, context);
  const html = renderToStaticMarkup(React.createElement(Settings));
  assert.match(html, /vehicle deposit plus \$200/);
  assert.match(html, /Under-25 rental markup percentage/);
  assert.doesNotMatch(html, /Remove Deposit Adjustment|Deposit adjustment type|type="checkbox"/);
});
