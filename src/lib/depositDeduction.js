export function depositDeductionOptions(rental, allocations, charges) {
  const totalCents = charges.reduce((sum, charge) => sum + Math.round(Number(charge.total_amount || 0) * 100), 0);
  const eligible = ['active', 'rented', 'overdue', 'return_initiated', 'completed'].includes(rental.status)
    && !rental.deposit_transferred_to_rental_id && charges.length > 0 && totalCents > 0
    && charges.every(c => !c.included_in_initial_payment && ['pending', 'failed', 'checkout_open'].includes(c.status)
      && !['rental_amendment', 'rental_installment'].includes(c.charge_type));
  return allocations.filter(a => a.holder_rental_id === rental.id).map(a => {
    const heldCents = Math.max(0, Math.round(Number(a.amount_held || 0) * 100)
      - Math.round(Number(a.amount_applied || 0) * 100) - Math.round(Number(a.amount_released || 0) * 100));
    const available = eligible && ['held', 'refund_due_inspection'].includes(a.status)
      && ['stripe', 'local'].includes(a.payment_provider) && !a.refund_id && a.refund_reserved_amount == null
      && Number(a.amount_released || 0) === 0 && (a.payment_provider !== 'stripe' || Boolean(a.stripe_payment_intent_id));
    return { id: a.id, provider: a.payment_provider, label: a.payment_provider === 'stripe' ? 'Stripe deposit' : a.payment_provider === 'local' ? 'External deposit' : 'Unknown deposit source',
      held: heldCents / 100, applied: totalCents / 100, remaining: (heldCents - totalCents) / 100,
      available: Boolean(available && heldCents >= totalCents),
      reason: !available ? 'Unavailable or refund already started' : heldCents < totalCents ? 'Insufficient deposit for these charges' : '' };
  }).filter(a => a.held > 0);
}
