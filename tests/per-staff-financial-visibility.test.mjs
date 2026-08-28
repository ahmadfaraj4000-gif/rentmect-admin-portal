import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
const migration = readFileSync(
  new URL('../supabase/migrations/20260828143000_per_staff_financial_visibility.sql', import.meta.url),
  'utf8',
);

test('restricted employees do not render dashboard financial cards or deposit actions', () => {
  assert.match(source, /canViewFinancials=\{canUsePermission\('reports\.financial'\)\}/);
  assert.match(source, /canViewFinancials && <Metric icon=\{Banknote\} label="Month Revenue"/);
  assert.match(source, /canViewFinancials && <Metric icon=\{CreditCard\} label="Active Deposits"/);
  assert.match(source, /canViewFinancials && <DepositActionPanel/);
  assert.match(source, /payments: 'reports\.financial'/);
});

test('financial visibility is denied per account and enforced by the database', () => {
  assert.match(migration, /create table if not exists public\.staff_permission_overrides/);
  assert.match(migration, /'jmisantonis@gmail\.com'/);
  assert.match(migration, /'kfaraci93@gmail\.com'/);
  assert.match(migration, /\('reports\.financial'\)/);
  assert.match(migration, /\('tab\.payments'\)/);
  assert.match(migration, /public\.rentmect_employee_permission_allows\('reports\.financial'\)/);
  assert.match(migration, /'month_revenue', case when v_can_view_financials/);
  assert.match(migration, /'active_deposits', case when v_can_view_financials/);
});
