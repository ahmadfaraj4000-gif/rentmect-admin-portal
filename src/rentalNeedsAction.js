const TERMINAL_RENTAL_STATUSES = new Set(['completed', 'cancelled']);
const VEHICLE_OUT_RENTAL_STATUSES = new Set(['active', 'rented', 'overdue', 'return_initiated']);

export function rentalHasActionableIssue({
  status,
  paymentStatus,
  hasOpenExtension = false,
  hasOpenReport = false,
  hasActiveEmergencyException = false,
  hasOutstandingCharge = false,
  returnIsOverdue = false,
  releaseChecklistReady = false,
}) {
  const normalizedStatus = String(status || 'pending').toLowerCase();
  const normalizedPaymentStatus = String(paymentStatus || 'pending').toLowerCase();

  if (TERMINAL_RENTAL_STATUSES.has(normalizedStatus)) return false;

  const vehicleIsOut = VEHICLE_OUT_RENTAL_STATUSES.has(normalizedStatus);
  const hasPickupBlocker = !vehicleIsOut && !releaseChecklistReady;

  return Boolean(
    hasOpenExtension ||
    hasOpenReport ||
    hasActiveEmergencyException ||
    hasOutstandingCharge ||
    normalizedStatus === 'return_initiated' ||
    returnIsOverdue ||
    normalizedPaymentStatus !== 'paid' ||
    hasPickupBlocker
  );
}

export function rentalStillNeedsPickupClearance(status) {
  return !VEHICLE_OUT_RENTAL_STATUSES.has(String(status || 'pending').toLowerCase());
}

export function getRentalPaymentAction({
  customerName = 'Customer',
  balanceDue = 0,
  paymentStatus,
  formatMoney = (amount) => `$${Number(amount || 0).toFixed(2)}`,
}) {
  const normalizedBalance = Math.max(0, Number(balanceDue || 0));
  const paymentNeedsReview = String(paymentStatus || 'pending').toLowerCase() !== 'paid';

  if (normalizedBalance <= 0.005 && !paymentNeedsReview) return null;

  if (normalizedBalance > 0.005) {
    const formattedBalance = formatMoney(normalizedBalance);
    return {
      label: 'Payment Due',
      next: `${customerName} owes ${formattedBalance}. Collect the outstanding balance.`,
      reason: `${customerName} owes ${formattedBalance} — collect the outstanding balance`,
    };
  }

  return {
    label: 'Payment Review',
    next: `${customerName}'s payment status needs review before this rental can be cleared.`,
    reason: `Review ${customerName}'s payment status before clearing this rental`,
  };
}
