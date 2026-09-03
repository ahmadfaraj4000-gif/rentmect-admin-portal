import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
const edge = readFileSync(new URL('../supabase/functions/stripe-web-hook/index.ts', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../../supabase/migrations/20260902130000_extension_requires_updated_agreement.sql', import.meta.url), 'utf8');

test('rental card loads attributed audit events into its bottom activity timeline', () => {
  assert.match(source, /from\('rental_audit_events'\)[\s\S]*?eq\('rental_id', rental\.id\)/);
  assert.match(source, /RentalActivityTimeline events=\{activityEvents\}/);
  assert.match(source, /by \{actorName\}/);
  assert.match(source, /rental_charge_waived/);
});

test('waiver endpoint closes collection paths and records actor-attributed activity', () => {
  assert.match(edge, /async function waiveRentalCharge/);
  assert.match(edge, /checkout\.sessions\.expire/);
  assert.match(edge, /waive_admin_rental_charge_guarded/);
  assert.match(edge, /actor_email: admin\.profile\.email/);
});

test('extension approval invalidates current agreement and clears agreement completion', () => {
  assert.match(migration, /new\.status <> 'approved_pending_payment'/);
  assert.match(migration, /agreement_signed = false/);
  assert.match(migration, /agreement_snapshot = null/);
  assert.match(migration, /step_key = 'agreement'/);
  assert.match(migration, /rental_agreement_resign_required/);
});
