export function tripStartIsLocked(rental) {
  return ['active', 'rented', 'overdue', 'return_initiated'].includes(
    String(rental.status || '').toLowerCase()
  ) || rental.starting_mileage != null;
}

export function replacementRentalForm(rental, form, vehicle) {
  const locked = tripStartIsLocked(rental);
  return {
    ...form,
    vehicleId: vehicle.id,
    pickupDate: locked ? rental.pickup_date : form.pickupDate,
    pickupTime: locked ? rental.pickup_time : form.pickupTime,
    dailyRate: locked ? form.dailyRate : Number(vehicle.daily_rate || 0).toFixed(2),
    securityDeposit: '',
  };
}
