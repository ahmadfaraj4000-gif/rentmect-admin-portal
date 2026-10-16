import test from 'node:test';
import assert from 'node:assert/strict';
import { ticketForm, ticketPayload, ticketTimeOptions, ticketFileType, ticketNeedsNote, uploadTicketFile } from '../src/lib/ticketResolution.js';
import { readDraft, writeDraft } from '../src/lib/taskDraft.js';

const form = () => ({ ...ticketForm(), agency: 'Synthetic New Britain', ticket_number: 'TEST-001', vehicle_id: 'test-car', violation_date: '2026-10-03', violation_time: '19:55:19', time_unknown: false, issue_date: '2026-10-08' });
test('sample timing uses violation time and preserves a separate issue date', () => {
 const data = ticketPayload(form()); assert.equal(data.occurred_at, '2026-10-03T23:55:19.000Z'); assert.equal(data.issue_date, '2026-10-08');
});
test('unknown time stays unknown, with no guessed midnight', () => {
 const data = ticketPayload({ ...form(), time_unknown: true }); assert.equal(data.occurred_at, ''); assert.equal(data.violation_time, '');
});
test('DST gaps reject and folds require explicit occurrence', () => {
 assert.deepEqual(ticketTimeOptions('2026-03-08','02:30:00','America/New_York'), []);
 assert.deepEqual(ticketTimeOptions('2026-11-01','01:30:00','America/New_York'), ['2026-11-01T05:30:00.000Z','2026-11-01T06:30:00.000Z']);
 const data = { ...form(), violation_date: '2026-11-01', violation_time: '01:30:00' };
 assert.throws(() => ticketPayload(data), /occurs twice/);
 assert.equal(ticketPayload({ ...data, occurred_at: '2026-11-01T06:30:00Z' }).occurred_at, '2026-11-01T06:30:00.000Z');
 assert.throws(() => ticketPayload({ ...data, violation_date: '2026-03-08', violation_time: '02:30:00' }), /does not exist/);
});
test('time conversion handles other zones and seconds', () => {
 assert.deepEqual(ticketTimeOptions('2026-10-03','19:55:19','America/Los_Angeles'), ['2026-10-04T02:55:19.000Z']);
 assert.deepEqual(ticketTimeOptions('2026-10-03','19:55:19','Asia/Kathmandu'), ['2026-10-03T14:10:19.000Z']);
 assert.throws(() => ticketPayload({ ...form(), timezone: 'Not/AZone' }));
});
test('ambiguous, unknown-time and booked-only evidence requires a note', () => {
 const match = { candidates: [{}], plate_vehicle_ids: [] }; assert.equal(ticketNeedsNote(match, {}), false);
 for (const extra of [{ time_unknown: true }, { vehicle_verification_required: true }, { candidates: [{}, {}] }, { plate_vehicle_ids: ['one','two'] }]) assert.equal(ticketNeedsNote({ ...match, ...extra }, {}), true);
 assert.equal(ticketNeedsNote(match, { booked_fallback: true }), true);
});
test('file validation accepts HEIC without browser MIME and rejects invalid size/type', () => {
 assert.equal(ticketFileType({ name: 'photo.HEIC', type: '', size: 50 }), 'image/heic');
 assert.throws(() => ticketFileType({ name: 'bad.svg', type: 'image/svg+xml', size: 50 }));
 assert.throws(() => ticketFileType({ name: 'big.pdf', type: 'application/pdf', size: 20971521 }));
});
test('draft restores fields and revision but not files or confirmation', () => {
 const store = new Map(); const storage = { setItem: (k,v) => store.set(k,v), getItem: k => store.get(k), removeItem: k => store.delete(k) };
 const defaults = ticketForm(); const data = { ...form(), version: 4, confirmed: true, files: ['private'] };
 writeDraft(storage, 'ticket', data, Object.keys(defaults)); const restored = readDraft(storage, 'ticket', defaults, Object.keys(defaults));
 assert.equal(restored.version, 4); assert.equal(restored.issue_date, '2026-10-08'); assert.equal(restored.confirmed, undefined); assert.equal(restored.files, undefined);
});
test('failed upload does not complete attachment; retry handles a lost successful response', async () => {
 const calls = []; let failed = true;
 const client = { rpc: async (name, args) => { calls.push(args.p_action); return { data: { object_path: 'ticket/file' } }; }, storage: { from: () => ({ upload: async () => ({ error: failed ? { message: 'Network unavailable' } : { statusCode: '409' } }) }) } };
 const file = { name: 'ticket.pdf', type: 'application/pdf', size: 100 };
 await assert.rejects(uploadTicketFile(client, 'case', file, 'file'), /Network/); assert.deepEqual(calls, ['prepare']);
 failed = false; await uploadTicketFile(client, 'case', file, 'file'); assert.deepEqual(calls, ['prepare','prepare','complete']);
});

test('simple lookup and save need only car, violation date and time; extra notice fields are optional', () => {
 const value = { ...form(), agency: '', ticket_number: '', amount: '' };
 const payload = ticketPayload(value);
 assert.equal(payload.agency, 'Not entered');
 assert.equal(payload.ticket_number, `MANUAL-${value.id}`);
 assert.equal(ticketPayload(value).ticket_number, payload.ticket_number, 'Retry must retain the same case reference');
 assert.equal(payload.occurred_at, '2026-10-03T23:55:19.000Z');
});
