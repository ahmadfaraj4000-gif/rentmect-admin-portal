import test from 'node:test';
import assert from 'node:assert/strict';
import { rentalCalendarMinutes, rentalDayShortcut } from '../src/rentalBillingTime.js';

test('Eastern billing ignores fall-back and spring-forward offset changes', () => {
  for (const [start, end, days] of [
    ['2026-10-30T22:00Z','2026-11-01T23:00Z',2],
    ['2026-11-01T04:00Z','2026-11-02T05:00Z',1],
    ['2027-03-13T23:00Z','2027-03-14T22:00Z',1],
    ['2027-03-13T23:00Z','2027-03-14T22:01Z',2],
    ['2026-10-30T22:00Z','2026-11-01T23:01Z',3],
    ['2026-10-23T22:00Z','2026-10-25T22:00Z',2],
  ]) assert.equal(Math.ceil(rentalCalendarMinutes(start,end)/1440),days);
});
test('shortcuts preserve the scheduled Eastern clock time in both directions', () => {
  assert.deepEqual(rentalDayShortcut('2026-10-30T22:00Z',2),{returnDate:'2026-11-01',returnTime:'6:00 PM'});
  assert.deepEqual(rentalDayShortcut('2027-03-12T14:00Z',4),{returnDate:'2027-03-16',returnTime:'9:00 AM'});
  assert.deepEqual(rentalDayShortcut('2026-12-31T23:00Z',2),{returnDate:'2027-01-02',returnTime:'6:00 PM'});
  assert.equal(rentalDayShortcut('invalid',1),null);
});

import { readFileSync } from 'node:fs';
import vm from 'node:vm';
test('manual booking validation and displayed days agree across DST', () => {
  const source = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
  const parser = source.slice(source.indexOf('function parseBookingDateTime('), source.indexOf('function localDateInput('));
  const window = source.slice(source.indexOf('function getBookingWindow('), source.indexOf('async function uploadOptimizedVehicleImages('));
  const calculate = vm.runInNewContext(`${parser}\n${window}\ngetBookingWindow`, { rentalCalendarMinutes, rentalDayShortcut, Date, Intl });
  const policy = {minimum_rental_days:1, advance_notice_minutes:0};
  for (const [pickupDate,returnDate,days] of [['2027-03-13','2027-03-14',1],['2027-11-06','2027-11-08',2]]) {
    const value = calculate({pickupDate,returnDate,pickupTime:'6:00 PM',returnTime:'6:00 PM'}, policy);
    assert.equal(value.valid,true,value.error); assert.equal(value.billableDays,days);
  }
});
