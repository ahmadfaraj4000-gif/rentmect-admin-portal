import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');

test('communications calls the customer email workspace Emails', () => {
  assert.match(source, /\['emails', 'Emails'\]/);
  assert.doesNotMatch(source, /\['campaigns', 'Campaigns'\]/);
  assert.match(source, /Automated Rental Emails/);
  assert.match(source, /Sent & Scheduled Emails/);
  assert.match(source, /Email name \(internal only\)/);
});

test('automated rental emails are shown in the Emails section', () => {
  assert.match(source, /section === 'emails'[\s\S]*automated\.map/);
  assert.match(source, /Booking confirmations, payment notices, document updates, reminders, refunds, and cancellations/);
});
