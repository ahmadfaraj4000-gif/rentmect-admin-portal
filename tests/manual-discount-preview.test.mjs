import test from 'node:test';
import assert from 'node:assert/strict';
import { manualDiscountPreviewMatches as matches } from '../src/lib/manualDiscountPreview.js';

test('a changed amount, mode, or rental cannot submit an earlier preview', () => {
  const preview = { rental_id: 'r1', mode: 'fixed', manual_discount_value: 126.86 };
  assert.equal(matches(preview, 'r1', 'fixed', '126.86'), true);
  assert.equal(matches(preview, 'r1', 'fixed', '120'), false);
  assert.equal(matches(preview, 'r1', 'percentage', '126.86'), false);
  assert.equal(matches(preview, 'r2', 'fixed', '126.86'), false);
  assert.equal(matches(null, 'r1', 'fixed', '126.86'), false);
  assert.equal(matches(preview, 'r1', 'fixed', 'invalid'), false);
});

test('removing a discount requires a matching removal preview', () => {
  assert.equal(matches({ rental_id: 'r1', mode: 'fixed', manual_discount_value: 20 }, 'r1', 'remove', 0), false);
  assert.equal(matches({ rental_id: 'r1', mode: 'remove', manual_discount_value: null }, 'r1', 'remove', 0), true);
});
