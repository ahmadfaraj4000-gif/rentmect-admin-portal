import test from 'node:test';
import assert from 'node:assert/strict';
import { getVehiclePriceConfirmation } from '../src/lib/vehiclePriceSafeguards.js';

const editConfirmation = (previousDailyRate, nextDailyRate, priceConfirmed = false) => getVehiclePriceConfirmation({
  action: 'edit',
  vehicleId: 'vehicle-650',
  vehicleName: 'Ford Escape #650',
  previousDailyRate,
  nextDailyRate,
  priceConfirmed,
});

test('blocks a changed single-digit daily rate with the stronger warning', () => {
  const confirmation = editConfirmation(49, 9);
  assert.equal(confirmation?.singleDigit, true);
  assert.equal(confirmation?.previousDailyRate, 49);
  assert.equal(confirmation?.nextDailyRate, 9);
});

test('blocks a changed double-digit daily rate with the standard confirmation', () => {
  const confirmation = editConfirmation(49, 59);
  assert.equal(confirmation?.singleDigit, false);
  assert.equal(confirmation?.previousDailyRate, 49);
  assert.equal(confirmation?.nextDailyRate, 59);
});

test('still warns when an existing single-digit daily rate is saved unchanged', () => {
  assert.equal(editConfirmation(9, 9)?.singleDigit, true);
});

test('does not interrupt an unchanged normal daily rate', () => {
  assert.equal(editConfirmation(59, 59), null);
});

test('does not ask twice after the admin explicitly confirms', () => {
  assert.equal(editConfirmation(49, 59, true), null);
});

test('warns before adding a new vehicle with a single-digit daily rate', () => {
  const confirmation = getVehiclePriceConfirmation({
    action: 'add',
    vehicleName: 'New vehicle',
    nextDailyRate: 7,
  });
  assert.equal(confirmation?.singleDigit, true);
  assert.equal(confirmation?.action, 'add');
});
