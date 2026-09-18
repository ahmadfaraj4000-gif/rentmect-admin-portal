export function depositSettlementPreview(rental, allocations = [], charges = []) {
  if (rental.status !== 'completed' || !rental.inspection_completed_at || rental.deposit_status !== 'held'
    || rental.deposit_source_rental_id || rental.deposit_transferred_to_rental_id || allocations.length !== 1) return null;
  const allocation = allocations[0];
  if (allocation.payment_provider !== 'stripe' || allocation.source_rental_id !== rental.id
    || allocation.status !== 'held' || !allocation.stripe_payment_intent_id || allocation.refund_id
    || allocation.refund_reserved_amount != null || Number(allocation.amount_released || 0) > 0
    || Number(allocation.amount_applied || 0) > 0) return null;
  const open = charges.filter((charge) => !charge.included_in_initial_payment
    && ['pending', 'checkout_open', 'failed'].includes(charge.status));
  if (!open.length || open.some((charge) => charge.status !== 'pending'
    || ['rental_amendment', 'rental_installment'].includes(charge.charge_type)
    || charge.stripe_checkout_session_id || charge.stripe_payment_intent_id || charge.admin_charge_attempted_at)) return null;
  const depositCents = Math.round(Number(allocation.amount_held) * 100);
  const appliedCents = open.reduce((sum, charge) => sum + Math.round(Number(charge.total_amount) * 100), 0);
  if (!Number.isFinite(appliedCents) || appliedCents <= 0 || appliedCents >= depositCents) return null;
  return { charges: open, chargeIds: open.map((charge) => charge.id), deposit: depositCents / 100,
    expectedApplied: appliedCents / 100, expectedRefund: (depositCents - appliedCents) / 100 };
}
