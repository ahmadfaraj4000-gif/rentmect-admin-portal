import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { swapTimeMessage, swapAvailabilityLabel, swapAvailabilityStart } from '../src/lib/rentalSwapTime.js';
const source=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
const code=source.slice(source.indexOf('function formatEasternDateTimeInput('),source.indexOf('function bookingProviderLabel('));
const parse=vm.runInNewContext(code+';easternDateTimeInputToIso;', {Intl,Date});
test('Eastern input supports minute and second precision from mobile controls',()=>{
 assert.equal(parse('2026-11-05T12:22'),'2026-11-05T17:22:00.000Z');
 assert.equal(parse('2026-11-05T12:22:35'),'2026-11-05T17:22:35.000Z');
 assert.equal(parse('2026-07-05T12:22:35.120'),'2026-07-05T16:22:35.120Z');
 assert.equal(parse('2027-03-14T02:30'),null);
 assert.equal(parse('2026-02-30T10:00'),null);
 assert.equal(parse(''),null);
});
test('swap time explains expired returns, future times and invalid inputs',()=>{
 const now=Date.parse('2026-11-05T17:22:35Z');
 assert.equal(swapTimeMessage('2026-11-05T17:22:35Z','2026-11-06T23:00Z','2026-11-01T14:00Z',now),'');
 assert.match(swapTimeMessage('2026-11-05T17:22:35Z','2026-11-04T23:00Z',null,now),/Update the return date first/);
 assert.match(swapTimeMessage('2026-11-06T17:22Z','2026-11-07T23:00Z',null,now),/cannot be in the future/);
 assert.match(swapTimeMessage('2026-11-01T13:00Z','2026-11-07T23:00Z','2026-11-01T14:00Z',now),/after this rental’s pickup/);
 assert.match(swapTimeMessage(null,'2026-11-07T23:00Z',null,now),/valid actual swap/);
});
test('loading and failed availability never instruct the user to choose another time',()=>{
 assert.equal(swapAvailabilityLabel({loading:true}),'Checking availability…');
 assert.equal(swapAvailabilityLabel({error:'offline'}),'Availability check failed');
 assert.equal(swapAvailabilityLabel({}),'Availability not checked');
});

test('future pickups still check the actual booked interval without allowing a physical swap',()=>{
 const now=Date.parse('2026-11-14T20:00Z'),pickup='2026-11-24T14:00Z',end='2026-11-26T14:00Z',start='2026-11-14T20:00Z';
 assert.equal(swapAvailabilityStart(start,end,pickup,now),pickup);
 assert.match(swapTimeMessage(start,end,pickup,now),/pickup is still in the future/);
 assert.equal(swapAvailabilityStart(start,'2026-11-13T14:00Z','2026-11-01T14:00Z',now),null);
 assert.equal(swapAvailabilityStart(start,end,'2026-11-01T14:00Z',now),start);
});

test('availability follows the chosen time even when a future handover cannot be recorded',()=>{
 const start='2026-11-25T17:00Z',end='2026-11-26T14:00Z',pickup='2026-11-24T14:00Z',now=Date.parse('2026-11-14T20:00Z');
 assert.equal(swapAvailabilityStart(start,end,pickup,now),start);
 assert.notEqual(swapTimeMessage(start,end,pickup,now),'');
});
