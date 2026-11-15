export function swapTimeMessage(from, until, pickup, now = Date.now()) {
  const start = Date.parse(from), end = Date.parse(until), first = Date.parse(pickup);
  if (!Number.isFinite(start)) return 'Choose a valid actual swap date and time, or select Swap now.';
  if (!Number.isFinite(end)) return 'This rental needs a valid booked return date before it can be swapped.';
  if (start >= end) return 'The swap time is at or after the booked return. Update the return date first, or enter an earlier time only if the vehicle was actually swapped then.';
  if (Number.isFinite(first) && first > now) return 'This rental’s pickup is still in the future. Availability below is checked for its booked dates. A physical swap can only be recorded after pickup; correct the rental dates first if the vehicle is already out.';
  if (Number.isFinite(first) && start <= first) return 'The swap must be after this rental’s pickup. Select Swap now or enter the actual later swap time.';
  if (start > now + 1000) return 'The actual swap time cannot be in the future. Select Swap now or enter when the vehicles were exchanged.';
  return '';
}
export function swapAvailabilityLabel(availability) {
  if (availability.loading) return 'Checking availability…';
  if (availability.error) return 'Availability check failed';
  return 'Availability not checked';
}

export function swapAvailabilityStart(from, until, pickup, now = Date.now()) {
  const first = Date.parse(pickup), end = Date.parse(until);
  if (Number.isFinite(first) && first > now && first < end) return pickup;
  return swapTimeMessage(from, until, pickup, now) ? null : from;
}
