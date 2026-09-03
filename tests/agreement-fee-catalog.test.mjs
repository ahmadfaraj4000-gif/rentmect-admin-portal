import test from 'node:test';
import assert from 'node:assert/strict';
import { agreementFeeTemplates } from '../src/lib/agreementFeeCatalog.js';

const rental = {
  pickup_date: '2026-09-01',
  pickup_time: '9:00 AM',
  return_date: '2026-09-03',
  return_time: '9:00 AM',
  rental_total: 140,
  under_25_markup_amount: 14,
};

test('catalog contains every charge category expressly authorized by the agreement', () => {
  const templates = agreementFeeTemplates(rental);
  const types = new Set(templates.map((template) => template.chargeType));
  for (const type of ['young_driver', 'unlimited_mileage', 'excess_mileage', 'pickup_service', 'dropoff_service', 'transportation', 'fuel', 'refueling', 'late_fee', 'late_rental_day', 'reactivation', 'recovery', 'cleaning', 'smoking', 'toll', 'traffic_violation', 'damage', 'loss_of_use', 'diminished_value', 'towing', 'storage', 'repossession', 'administrative', 'legal']) {
    assert.equal(types.has(type), true, `missing ${type}`);
  }
});

test('fixed agreement amounts match the signed policy', () => {
  const byId = new Map(agreementFeeTemplates(rental).map((template) => [template.id, template]));
  assert.equal(byId.get('policy:late-return-fee').amount, 25);
  assert.equal(byId.get('policy:late-rental-day').amount, 70);
  assert.equal(byId.get('agreement:pickup-within-15').amount, 30);
  assert.equal(byId.get('agreement:dropoff-transportation').amount, 30);
  assert.equal(byId.get('agreement:pickup-and-dropoff').amount, 60);
  assert.equal(byId.get('agreement:refueling-service').amount, 20);
  assert.equal(byId.get('agreement:recovery-minimum').amount, 80);
  assert.equal(byId.get('agreement:smoking-remediation').amount, 200);
});
