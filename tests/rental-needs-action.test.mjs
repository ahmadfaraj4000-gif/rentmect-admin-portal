import assert from 'node:assert/strict';
import test from 'node:test';

import { getRentalPaymentAction, rentalHasActionableIssue, rentalStillNeedsPickupClearance } from '../src/rentalNeedsAction.js';

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

test('an outstanding balance replaces the generic car-out copy with the exact amount owed', () => {
  assert.deepEqual(getRentalPaymentAction({
    customerName: 'Kelly Vail',
    balanceDue: 95.5,
    paymentStatus: 'partially_paid',
  }), {
    label: 'Payment Due',
    next: 'Kelly Vail owes $95.50. Collect the outstanding balance.',
    reason: 'Kelly Vail owes $95.50 — collect the outstanding balance',
  });
});

test('a fully paid zero-balance rental has no payment action message', () => {
  assert.equal(getRentalPaymentAction({
    customerName: 'Kelly Vail',
    balanceDue: 0,
    paymentStatus: 'paid',
  }), null);
});

test('an inconsistent unpaid status requests review instead of showing car-out guidance', () => {
  assert.deepEqual(getRentalPaymentAction({
    customerName: 'Kelly Vail',
    balanceDue: 0,
    paymentStatus: 'pending',
  }), {
    label: 'Payment Review',
    next: "Kelly Vail's payment status needs review before this rental can be cleared.",
    reason: "Review Kelly Vail's payment status before clearing this rental",
  });
});
