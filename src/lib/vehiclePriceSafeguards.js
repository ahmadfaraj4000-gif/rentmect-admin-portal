export function getVehiclePriceConfirmation({
  action,
  vehicleId = null,
  vehicleName,
  previousDailyRate = null,
  nextDailyRate,
  priceConfirmed = false,
}) {
  if (priceConfirmed) return null;

  const singleDigit = nextDailyRate < 10;
  const priceChanged = action === 'edit'
    && Math.abs(previousDailyRate - nextDailyRate) >= 0.005;

  if (!singleDigit && !priceChanged) return null;

  return {
    action,
    ...(vehicleId ? { vehicleId } : {}),
    vehicleName,
    previousDailyRate,
    nextDailyRate,
    singleDigit,
  };
}
