export function manualDiscountPreviewMatches(preview, rentalId, mode, value) {
  const requested = mode === 'remove' ? 0 : Number(value);
  return Boolean(preview && preview.rental_id === rentalId && preview.mode === mode
    && Number.isFinite(requested)
    && Number(preview.manual_discount_value || 0) === requested);
}

export function additionalDiscountRequest(rental, form) {
  if (form.mode === 'remove') return { mode: 'remove', value: 0 };
  const value = Number(form.value);
  if (!Number.isFinite(value) || value <= 0 || (form.mode === 'percentage' && value > 100)) throw new Error('Enter a valid discount amount.');
  const extra = form.mode === 'percentage'
    ? Math.round(Number(rental.rental_total || 0) * value) / 100
    : value;
  return { mode: 'fixed', value: Math.round((Number(rental.manual_discount_amount || 0) + extra) * 100) / 100 };
}
