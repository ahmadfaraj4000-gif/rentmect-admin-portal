import { builtInLateFeeTemplates } from './lateFeePolicy.js';

const variable = (id, name, chargeType, description, taxable = true) => ({
  id: `agreement:${id}`,
  name,
  chargeType,
  amount: null,
  taxable,
  description,
  pricingLabel: 'Enter amount',
});

const fixed = (id, name, chargeType, amount, description, taxable = true, pricingLabel = null) => ({
  id: `agreement:${id}`,
  name,
  chargeType,
  amount,
  taxable,
  description,
  pricingLabel: pricingLabel || `$${Number(amount).toFixed(2)}`,
});

/** Every customer-authorized charge named in the current master agreement. */
export function agreementFeeTemplates(rental) {
  const [lateFee, lateDay] = builtInLateFeeTemplates(rental);
  const youngDriverAmount = Number(rental?.under_25_markup_amount || 0);
  return [
    youngDriverAmount > 0
      ? fixed('young-driver', 'Young Driver Fee', 'young_driver', youngDriverAmount, 'Young Driver Fee authorized by the rental agreement and priced for this reservation.')
      : variable('young-driver', 'Young Driver Fee', 'young_driver', 'Young Driver Fee authorized by the rental agreement; enter the reservation-specific amount.'),
    variable('unlimited-mileage', 'Unlimited Mileage Fee', 'unlimited_mileage', 'Unlimited mileage fee based on the vehicle class.'),
    variable('excess-mileage', 'Excess Mileage — $0.35 per mile', 'excess_mileage', 'Enter the total excess-mileage charge at $0.35 for each mile over the included allowance.'),
    fixed('pickup-within-15', 'Vehicle Pick-Up Service — within 15 miles', 'pickup_service', 30, 'Vehicle pick-up service within 15 miles of the designated pickup location.'),
    fixed('dropoff-transportation', 'Return Drop-Off Transportation', 'dropoff_service', 30, 'Return drop-off transportation requested by the renter.'),
    fixed('pickup-and-dropoff', 'Pick-Up + Drop-Off Transportation', 'transportation', 60, 'Combined vehicle pick-up and return drop-off transportation.'),
    variable('extended-transportation', 'Transportation — over 15 miles / airport / after-hours', 'transportation', 'Transportation charge for distance over 15 miles, airport coordination, after-hours service, tolls, traffic, or special accommodations.'),
    variable('fuel-cost', 'Fuel Replacement — actual cost', 'fuel', 'Actual cost to return the vehicle to its original fuel level.'),
    fixed('refueling-service', 'Refueling Service Fee', 'refueling', 20, 'Refueling service fee in addition to the actual fuel cost.'),
    { ...lateFee, pricingLabel: '$25.00' },
    { ...lateDay, pricingLabel: `$${Number(lateDay.amount || 0).toFixed(2)}` },
    fixed('reactivation', 'Vehicle Reactivation Fee', 'reactivation', 50, 'Vehicle reactivation fee under the late-return and vehicle-disabling policy.'),
    fixed('recovery-minimum', 'Vehicle Recovery / Retrieval — minimum', 'recovery', 80, 'Recovery or retrieval service charge; $80 minimum, adjusted for actual circumstances.', true, '$80.00 minimum'),
    fixed('speed-reactivation', 'Excessive-Speed Reactivation Fee', 'reactivation', 100, 'Vehicle reactivation after the third excessive-speed or reckless-driving warning.'),
    fixed('excessive-cleaning', 'Excessive Cleaning / Detailing — minimum', 'cleaning', 80, 'Excessive cleaning or detailing charge; $80 minimum based on vehicle condition.', true, '$80.00 minimum'),
    fixed('smoking-remediation', 'Smoking Cleaning & Remediation — minimum', 'smoking', 200, 'Smoking cleaning and remediation charge; agreement range is $200–$2,000.', true, '$200.00–$2,000.00'),
    variable('tolls', 'Tolls', 'toll', 'Actual toll charges incurred during the rental period.', false),
    variable('traffic-violations', 'Traffic / Parking Violation', 'traffic_violation', 'Actual ticket, citation, parking, or traffic-violation charge incurred during the rental period.', false),
    variable('damage', 'Vehicle Damage / Repair', 'damage', 'Actual physical or mechanical damage, repair, diagnostic, or restoration cost.'),
    variable('loss-of-use', 'Loss of Use', 'loss_of_use', 'Loss-of-use charge authorized by the rental agreement.'),
    variable('diminished-value', 'Diminished Value', 'diminished_value', 'Diminished-value charge authorized by the rental agreement.'),
    variable('towing', 'Towing', 'towing', 'Actual towing cost related to the rental.'),
    variable('storage', 'Storage', 'storage', 'Actual vehicle storage cost related to the rental.'),
    variable('repossession', 'Repossession', 'repossession', 'Actual repossession cost related to the rental.'),
    variable('administrative', 'Administrative Fee', 'administrative', 'Administrative charge authorized by the rental agreement.'),
    variable('legal', 'Attorney / Court / Collection Costs', 'legal', 'Reasonable attorney fees, court costs, and collection expenses incurred enforcing the agreement.', false),
  ];
}
