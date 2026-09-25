import test from 'node:test';
import assert from 'node:assert/strict';
import { appendReturnFiles, needsReturnEvidenceReport } from '../src/lib/returnEvidence.js';

const front = { name: 'front.jpg', size: 100, lastModified: 1, type: 'image/jpeg' };
const rear = { name: 'rear.jpg', size: 200, lastModified: 2, type: 'image/jpeg' };
const interior = { name: 'interior.jpg', size: 300, lastModified: 3, type: 'image/jpeg' };

test('keeps all photos when selected individually or in batches', () => {
  const initial = [front];
  assert.deepEqual(appendReturnFiles(appendReturnFiles(initial, [rear]), [interior]), [front, rear, interior]);
  assert.deepEqual(appendReturnFiles(initial, [rear, interior]), [front, rear, interior]);
  assert.deepEqual(initial, [front]);
});

test('canceling the picker preserves files; duplicates are skipped and removed files can be added again', () => {
  assert.deepEqual(appendReturnFiles([front], []), [front]);
  assert.deepEqual(appendReturnFiles([front], [{ ...front }, rear, rear]), [front, rear]);
  assert.deepEqual(appendReturnFiles([rear], [front]), [rear, front]);
  const otherCameraPhoto = { ...front, lastModified: 5 };
  assert.deepEqual(appendReturnFiles([front], [otherCameraPhoto]), [front, otherCameraPhoto]);
});

test('hold-deposit evidence gets a report without requiring a damage flag', () => {
  assert.equal(needsReturnEvidenceReport({ damageFound: false, depositDecision: 'hold', files: [front, rear] }), true);
  assert.equal(needsReturnEvidenceReport({ damageFound: true, depositDecision: 'hold', files: [] }), true);
  assert.equal(needsReturnEvidenceReport({ damageFound: false, depositDecision: 'hold', files: [] }), false);
  assert.equal(needsReturnEvidenceReport({ damageFound: false, depositDecision: 'release', files: [] }), false);
});
