import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
const migration = readFileSync(
  new URL('../supabase/migrations/20260828143000_per_staff_financial_visibility.sql', import.meta.url),
  'utf8',
);
const paymentAccessCorrection = readFileSync(
  new URL('../supabase/migrations/20260828153000_restore_employee_payment_access.sql', import.meta.url),
  'utf8',
);

test('restricted employees do not render dashboard gross summary cards', () => {
  assert.match(source, /canViewFinancialSummary=\{canUsePermission\('dashboard\.financial_summary'\)\}/);
  assert.match(source, /canViewFinancialSummary && <Metric icon=\{Banknote\} label="Month Revenue"/);
  assert.match(source, /canViewFinancialSummary && <Metric icon=\{CreditCard\} label="Active Deposits"/);
  assert.doesNotMatch(source, /canViewFinancialSummary && <DepositActionPanel/);
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

test('the three named employees retain Payments while dashboard totals stay hidden', () => {
  assert.match(paymentAccessCorrection, /'jmisantonis@gmail\.com'/);
  assert.match(paymentAccessCorrection, /'barose1217@icloud\.com'/);
  assert.match(paymentAccessCorrection, /'kfaraci93@gmail\.com'/);
  assert.match(paymentAccessCorrection, /'dashboard\.financial_summary'/);
  assert.match(paymentAccessCorrection, /'reports\.financial', true/);
  assert.match(paymentAccessCorrection, /'tab\.payments', true/);
  assert.match(paymentAccessCorrection, /'dashboard\.financial_summary', false/);
  assert.match(paymentAccessCorrection, /rentmect_has_permission\('dashboard\.financial_summary'\)/);
});
