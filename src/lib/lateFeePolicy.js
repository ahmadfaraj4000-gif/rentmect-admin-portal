export const CT_SALES_TAX_RATE = 0.0635;
export const LATE_RETURN_FEE_AMOUNT = 25;

function clockMinutes(value) {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return 9 * 60;
  let hours = Number(match[1]) % 12;
  if (match[3].toUpperCase() === 'PM') hours += 12;
  return hours * 60 + Number(match[2]);
}

function scheduleValue(date, time) {
  const match = String(date || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return Number.NaN;
  const minutes = clockMinutes(time);
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Math.floor(minutes / 60), minutes % 60);
}

export function isReturnWindowExtended(rental, returnDate, returnTime) {
  const current = scheduleValue(rental?.return_date, rental?.return_time);
  const proposed = scheduleValue(returnDate, returnTime);
  return Number.isFinite(current) && Number.isFinite(proposed) && proposed > current;
}

export function calculateLateRentalDayAmount(rental) {
  const pickup = scheduleValue(rental?.pickup_date, rental?.pickup_time);
  const returned = scheduleValue(rental?.return_date, rental?.return_time);
  const originalDays = Number.isFinite(pickup) && Number.isFinite(returned)
    ? Math.max(1, Math.ceil((returned - pickup) / 86_400_000))
    : 1;
  const contractedTotal = [rental?.rental_total, rental?.pre_discount_rental_total, rental?.base_rental_total]
    .map(Number)
    .find((amount) => Number.isFinite(amount) && amount > 0);
  const fallback = Number(rental?.vehicles?.daily_rate || 0);
  const amount = contractedTotal ? contractedTotal / originalDays : fallback;
  return Math.round(Math.max(0, Number(amount || 0)) * 100) / 100;
}

export function builtInLateFeeTemplates(rental) {
  const lateDayAmount = calculateLateRentalDayAmount(rental);
  return [
    {
      id: 'policy:late-return-fee',
      name: 'Late return fee - 30 minutes',
      chargeType: 'late_fee',
      amount: LATE_RETURN_FEE_AMOUNT,
      taxable: true,
      description: 'Late-return assessment after the 30-minute grace period.',
    },
    {
      id: 'policy:late-rental-day',
      name: 'Late return - additional rental day',
      chargeType: 'late_fee',
      amount: lateDayAmount,
      taxable: true,
      description: `Additional rental day at the reservation's contracted daily amount of $${lateDayAmount.toFixed(2)}.`,
    },
  ];
}
