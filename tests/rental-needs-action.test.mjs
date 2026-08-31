import assert from 'node:assert/strict';
import test from 'node:test';

import { rentalHasActionableIssue, rentalStillNeedsPickupClearance } from '../src/rentalNeedsAction.js';

test('a paid car already out does not need action because of stale pickup checklist fields', () => {
  assert.equal(rentalHasActionableIssue({
    status: 'active',
    paymentStatus: 'paid',
    releaseChecklistReady: false,
  }), false);
  assert.equal(rentalStillNeedsPickupClearance('active'), false);
});

test('a clear paid car out stays out of Needs Action until there is a real exception', () => {
  const clearRental = {
    status: 'active',
    paymentStatus: 'paid',
    releaseChecklistReady: true,
  };

  assert.equal(rentalHasActionableIssue(clearRental), false);
  assert.equal(rentalHasActionableIssue({ ...clearRental, returnIsOverdue: true }), true);
  assert.equal(rentalHasActionableIssue({ ...clearRental, hasOpenExtension: true }), true);
  assert.equal(rentalHasActionableIssue({ ...clearRental, hasOpenReport: true }), true);
  assert.equal(rentalHasActionableIssue({ ...clearRental, hasActiveEmergencyException: true }), true);
  assert.equal(rentalHasActionableIssue({ ...clearRental, hasOutstandingCharge: true }), true);
  assert.equal(rentalHasActionableIssue({ ...clearRental, paymentStatus: 'pending' }), true);
  assert.equal(rentalHasActionableIssue({ ...clearRental, status: 'return_initiated' }), true);
});

test('pre-pickup blockers remain actionable', () => {
  assert.equal(rentalHasActionableIssue({
    status: 'approved',
    paymentStatus: 'paid',
    releaseChecklistReady: false,
  }), true);
  assert.equal(rentalHasActionableIssue({
    status: 'ready_for_pickup',
    paymentStatus: 'paid',
    releaseChecklistReady: true,
  }), false);
  assert.equal(rentalStillNeedsPickupClearance('approved'), true);
});

test('terminal rentals never appear in Needs Action', () => {
  for (const status of ['completed', 'cancelled']) {
    assert.equal(rentalHasActionableIssue({
      status,
      paymentStatus: 'pending',
      hasOpenExtension: true,
      returnIsOverdue: true,
      releaseChecklistReady: false,
    }), false);
  }
});
