import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AGREEMENT_TEXT, AGREEMENT_VERSION } from '../src/rentalAgreement.js';

const adminSource = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');

test('admin uses the versioned late-return and 250-mile agreement', () => {
  assert.equal(AGREEMENT_VERSION, 'rentmect-master-v2026-11-13-admin-return-r1');
  assert.match(AGREEMENT_TEXT, /There is no automatic late-return fee or automatic additional rental-day charge/);
  assert.match(AGREEMENT_TEXT, /until Company confirms its physical return/);
  assert.match(AGREEMENT_TEXT, /Two hundred fifty \(250\) miles per day are included/);
  assert.match(AGREEMENT_TEXT, /Mileage Included: 250 miles\/day/);
});

test('admin displays staged assessments as late-return charges', () => {
  assert.match(adminSource, /250 miles\/day included; excess mileage \$0\.35\/mile/);
  assert.match(adminSource, /Late fees, tolls and manual charges/);
  assert.match(adminSource, /Late return • calculated/);
});
