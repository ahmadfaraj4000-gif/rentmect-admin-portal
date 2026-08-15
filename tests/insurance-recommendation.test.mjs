import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const mainSource = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8');

test('RentalCover is the sole recommended insurance resource', () => {
  assert.match(
    mainSource,
    /label: 'RentalCover'.*href: 'https:\/\/rentalcover\.com\/'.*recommended: true/,
  );
  assert.doesNotMatch(
    mainSource,
    /label: 'Bonzah Insurance'.*recommended: true/,
  );
});
