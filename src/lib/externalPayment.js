export const paymentCents = value => {
  const text = String(value ?? '').trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw new Error('Enter an amount with at most two decimal places.');
  const cents = Math.round(Number(text) * 100);
  if (!Number.isSafeInteger(cents) || cents > 2147483647) throw new Error('Payment amount is too large.');
  return cents;
};
export const eligiblePaymentCharges = charges => charges.filter(c => !c.included_in_initial_payment
  && !['rental_amendment','rental_installment'].includes(c.charge_type)
  && ['pending','failed','checkout_open'].includes(c.status) && !c.payment_receipt_id
  && !c.external_toll_receipt_id && !c.checkout_creation_token);
export function buildExternalPayment(charges, selectedIds, rentalDueCents, form) {
  const eligible = eligiblePaymentCharges(charges);
  const selected = [...new Set(selectedIds)].sort().map(id => eligible.find(c => c.id === id));
  if (selected.some(c => !c) || selected.length > 500) throw new Error('A selected charge changed. Refresh the rental.');
  const amountCents = paymentCents(form.amount);
  const selectedCents = selected.reduce((sum,c) => sum + paymentCents(c.total_amount), 0);
  const rentalAmountCents = amountCents - selectedCents;
  if (!amountCents || rentalAmountCents < 0) throw new Error('The payment must cover the selected charges in full.');
  if (!Number.isSafeInteger(rentalDueCents) || rentalAmountCents > rentalDueCents) throw new Error('The payment exceeds the selected charges and remaining rental balance.');
  if (!form.receivedDate || !form.confirmed) throw new Error('Choose the received date and confirm the payment cleared.');
  return { kind:'rental_payment', charges:selected.map(c=>({id:c.id,amountCents:paymentCents(c.total_amount)})),
    amountCents,rentalAmountCents,expectedRentalDueCents:rentalDueCents,paymentMethod:form.paymentMethod,
    receivedDate:form.receivedDate,receivedTime:form.receivedTime||'',reference:form.reference.trim(),notes:form.notes.trim() };
}
// Keep date-only values as calendar dates. Never parse them as midnight UTC.
export const receivedDateLabel = (date,time) => date ? `${date}${time ? ` ${time.slice(0,5)} ET` : ''}` : '';
export function groupPaymentHistory(payments) {
  const grouped = [], byId = new Map();
  for (const payment of payments) {
    if (!payment.receiptId || payment.kind==='refund') { grouped.push(payment); continue; }
    let receipt = byId.get(payment.receiptId);
    if (!receipt) {
      receipt={...payment,id:`receipt-${payment.receiptId}`,label:'Payment received',amount:0,cashImpact:0,outstandingAmount:0,allocations:[],editable:false};
      byId.set(payment.receiptId,receipt);grouped.push(receipt);
    }
    receipt.amount=Math.round((receipt.amount+payment.amount)*100)/100;
    receipt.cashImpact += Number(payment.cashImpact || 0);
    receipt.outstandingAmount += Number(payment.outstandingAmount || 0);
    receipt.allocations.push({id:payment.id,label:payment.label,amount:payment.amount});
  }
  return grouped;
}
