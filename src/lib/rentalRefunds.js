// A refund belongs to its captured Stripe payment, including balance installments.
export function refundableRentalSources(rental, charges = [], refunds = [], allocations = []) {
  const sources = [];
  if (rental.paid_at && rental.payment_provider === 'stripe' && rental.stripe_payment_intent_id) {
    sources.push({ id: 'initial', chargeId: null, paymentIntentId: rental.stripe_payment_intent_id,
      amount: Number(rental.payment_amount_cents || 0) / 100, label: 'Initial card payment' });
  }
  for (const charge of charges) {
    if (charge.charge_type === 'rental_amendment' && charge.status === 'paid'
      && charge.payment_provider === 'stripe' && charge.stripe_payment_intent_id
      && !sources.some((source) => source.paymentIntentId === charge.stripe_payment_intent_id)) {
      sources.push({ id: charge.id, chargeId: charge.id, paymentIntentId: charge.stripe_payment_intent_id,
        amount: Number(charge.payment_amount_cents ?? Math.round(Number(charge.total_amount || 0) * 100)) / 100,
        label: 'Rental balance card payment' });
    }
  }
  return sources.map((source) => {
    const refunded = refunds.filter((refund) => refund.stripe_payment_intent_id === source.paymentIntentId
      && !['failed', 'cancelled', 'canceled'].includes(String(refund.status).toLowerCase()))
      .reduce((sum, refund) => sum + Number(refund.amount || 0), 0);
    const protectedDeposit = allocations.filter((allocation) => allocation.stripe_payment_intent_id === source.paymentIntentId
      && allocation.status !== 'released').reduce((sum, allocation) =>
      sum + Math.max(0, Number(allocation.amount_held || 0) - Number(allocation.amount_released || 0)), 0);
    const released = allocations.filter((allocation) => allocation.stripe_payment_intent_id === source.paymentIntentId)
      .reduce((sum, allocation) => sum + Number(allocation.amount_released || 0), 0);
    const fallback = allocations.length === 0 && source.id === 'initial'
      ? Number(rental.deposit_held_amount || 0) + Number(rental.deposit_released_amount || 0) : 0;
    return { ...source, maximum: Math.max(0, Math.round((source.amount - refunded - Math.max(fallback, protectedDeposit + released)) * 100) / 100) };
  }).filter((source) => source.maximum >= 0.5);
}

export function refundDisplayState(status) {
  if (status === 'succeeded') return 'returned';
  if (['failed', 'cancelled', 'canceled'].includes(status)) return 'failed';
  return 'pending';
}
