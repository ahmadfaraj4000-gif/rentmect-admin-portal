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

test('deposit requirements can be overridden without implying a refund; completed rentals need confirmation', () => {
  assert.match(mainSource, /a price decrease does not itself issue a refund/);
  assert.match(mainSource, /'partially_paid', 'partial'/);
  assert.match(mainSource, /Keep existing/);
  assert.match(mainSource, /Use new deposit/);
  assert.match(mainSource, /onPreview\(rental, candidate\)/);
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

test('the edit review presents one updated rental instead of a revised invoice', () => {
  assert.match(mainSource, /Protected rental update/);
  assert.match(mainSource, /<small>Updated rental<\/small>/);
  assert.match(mainSource, /Total charges, including deposit/);
  assert.match(mainSource, /Rental total change/);
  assert.doesNotMatch(mainSource, /Revised rental invoice/i);
  assert.doesNotMatch(mainSource, /Revised agreement/i);
});
