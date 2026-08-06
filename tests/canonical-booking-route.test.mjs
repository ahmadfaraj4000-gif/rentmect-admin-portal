import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');

test('admin booking routing is permanently locked to Cars-2', () => {
  assert.match(source, /active_provider: 'supabase'/);
  assert.match(source, /effective_provider: 'supabase'/);
  assert.match(source, /Cars-2 is the permanent customer booking page/);
  assert.match(source, /Open live booking page/);
  assert.doesNotMatch(source, /cars\.html/);
  assert.doesNotMatch(source, />\s*Switch now\s*</i);
  assert.doesNotMatch(source, /schedule_booking_page_switch/);
  assert.doesNotMatch(source, /set_booking_page_now/);
});

test('promotions can target only current public surfaces', () => {
  assert.match(source, /Cars and booking page \(cars-2\.html\)/);
  assert.match(source, /cta_url: 'cars-2\.html'/);
  assert.match(source, /banner_pages: \['cars-2\.html'\]/);
});

