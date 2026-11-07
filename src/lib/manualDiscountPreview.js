export function manualDiscountPreviewMatches(preview, rentalId, mode, value) {
  const requested = mode === 'remove' ? 0 : Number(value);
  return Boolean(preview && preview.rental_id === rentalId && preview.mode === mode
    && Number.isFinite(requested)
    && Number(preview.manual_discount_value || 0) === requested);
}
