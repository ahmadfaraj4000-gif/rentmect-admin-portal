export const tollCents = amount => Math.round(Number(amount) * 100);
export function eligibleExternalTolls(charges) {
  return charges.filter(c => c.charge_type === 'toll' && !c.included_in_initial_payment
    && ['pending', 'failed', 'checkout_open'].includes(c.status)
    && !c.external_toll_receipt_id && !c.checkout_creation_token);
}
export function buildTollPayment(charges, selectedIds, form) {
  const eligible = eligibleExternalTolls(charges);
  const selected = [...new Set(selectedIds)].sort().map(id => eligible.find(c => c.id === id));
  if (!selected.length || selected.some(c => !c)) throw new Error('A selected toll is no longer available. Refresh the rental.');
  if (selected.length > 500) throw new Error('Select up to 500 tolls per payment.');
  const amountCents = tollCents(form.amount);
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents !== selected.reduce((sum, c) => sum + tollCents(c.total_amount), 0)) {
    throw new Error('The received amount must exactly match the selected toll total.');
  }
  if (!form.receivedDate || !form.confirmed) throw new Error('Choose the received date and confirm the payment cleared.');
  return { charges: selected.map(c => ({ id: c.id, amountCents: tollCents(c.total_amount) })), amountCents,
    paymentMethod: form.paymentMethod, receivedDate: form.receivedDate, reference: form.reference.trim() };
}
