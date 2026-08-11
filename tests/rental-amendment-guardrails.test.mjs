import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const mainSource = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8');

test('admin rental edits use the guarded preview and Stripe-safe apply path', () => {
  assert.match(mainSource, /supabase\.rpc\('admin_preview_rental_amendment'/);
  assert.match(mainSource, /action: 'admin_apply_rental_amendment'/);
  assert.match(mainSource, /Review Changes/);
  assert.match(mainSource, /Apply Rental Changes/);
});

test('the fake booking-flow vehicle is excluded from replacement choices', () => {
  assert.match(
    mainSource,
    /vehicle\.id !== '00000000-0000-4000-8000-000000000015'/
  );
});

test('captured deposits cannot be edited and completed rentals need confirmation', () => {
  assert.match(mainSource, /disabled=\{paymentCaptured\}/);
  assert.match(mainSource, /'partially_paid', 'partial'/);
  assert.match(mainSource, /this deposit is locked/);
  assert.match(mainSource, /Correct this completed rental/);
  assert.match(mainSource, /minimumReasonLength = completed \? 20 : 10/);
});

test('the review explains payment, credit, and re-signing outcomes', () => {
  assert.match(mainSource, /Payments already received stay credited/);
  assert.match(mainSource, /Remaining amount due/);
  assert.match(mainSource, /Payments credited/);
  assert.match(mainSource, /Remaining before edit/);
  assert.match(mainSource, /Remaining after edit/);
  assert.match(mainSource, /customer credit will be recorded without rewriting the original payment/);
  assert.match(mainSource, /The prior signed copy stays preserved/);
});
