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
