export function returnMileageContext(rental) {
  const baseline = Object.hasOwn(rental, 'return_starting_mileage')
    ? rental.return_starting_mileage : rental.starting_mileage;
  return {
    baseline: baseline == null ? null : Number(baseline),
    minimum: Math.max(Number(baseline || 0), Number(rental.vehicles?.current_mileage || 0)),
    missingBaseline: baseline == null,
  };
}
export function returnCustomerAction(inspection) {
  return inspection.damageFound && ['review', 'block'].includes(inspection.customerAction)
    ? inspection.customerAction : 'none';
}
