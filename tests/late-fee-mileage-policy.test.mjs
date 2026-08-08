import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AGREEMENT_TEXT, AGREEMENT_VERSION } from '../src/rentalAgreement.js';

const adminSource = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');

test('admin uses the versioned late-return and 250-mile agreement', () => {
  assert.equal(AGREEMENT_VERSION, 'rentmect-master-v2026-08-08-late-mileage-r1');
  assert.match(AGREEMENT_TEXT, /At thirty \(30\) minutes after the scheduled return time/);
  assert.match(AGREEMENT_TEXT, /more than two \(2\) hours after the scheduled return time/);
  assert.match(AGREEMENT_TEXT, /Two hundred fifty \(250\) miles per day are included/);
  assert.match(AGREEMENT_TEXT, /Mileage Included: 250 miles\/day/);
});

test('admin displays staged assessments as late-return charges', () => {
  assert.match(adminSource, /250 miles\/day included; excess mileage \$0\.35\/mile/);
  assert.match(adminSource, /Automatic late-return charges and tolls/);
  assert.match(adminSource, /Late return • calculated/);
});
