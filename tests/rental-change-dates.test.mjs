import test from 'node:test';
import assert from 'node:assert/strict';
import { rentalDayShortcut } from '../src/lib/rentalChangeDates.js';
test('four-day shortcut matches four billable days across daylight-saving changes', () => {
  assert.deepEqual(rentalDayShortcut('2026-10-07T13:00:00Z', 4), { returnDate: '2026-10-11', returnTime: '9:00 AM' });
  assert.deepEqual(rentalDayShortcut('2026-10-30T13:00:00Z', 4), { returnDate: '2026-11-03', returnTime: '8:00 AM' });
  assert.deepEqual(rentalDayShortcut('2027-03-12T14:00:00Z', 4), { returnDate: '2027-03-16', returnTime: '10:00 AM' });
});
