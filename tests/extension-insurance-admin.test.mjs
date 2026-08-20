import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/final-overrides.css', import.meta.url), 'utf8');

test('admin uploads extension insurance against the exact extension request', () => {
  assert.match(source, /uploadAdminBookingDocument\?\.\(rental, 'insurance', items, \{ extensionRequestId: extensionInsuranceRequest\.id \}\)/);
  assert.match(source, /extension_request_id: extensionRequestId/);
  assert.match(source, /Extension insurance.*packet uploaded/);
  assert.match(source, /Any older extension packet remains in the document history/);
});

test('extension history exposes add and replace insurance controls', () => {
  assert.match(source, /onManageInsurance=\{uploadAdminBookingDocument/);
  assert.match(source, /'Add Extension Insurance'/);
  assert.match(source, /'Replace Extension Insurance'/);
  assert.match(source, /\['pending', 'approved_pending_payment', 'activated'\]\.includes\(status\)/);
});

test('saved extension documents can reopen the replacement workflow', () => {
  assert.match(source, /if \(document\.extension_request_id\) setExtensionInsuranceRequestId\(document\.extension_request_id\)/);
  assert.match(source, /document\.extension_request_id \? 'Replace extension insurance' : 'Replace or manage'/);
});

test('extension insurance modal explains replacement history and validates a complete packet', () => {
  assert.match(source, /function ExtensionInsuranceDocumentModal/);
  assert.match(source, /Upload the policy covering the extended rental dates/);
  assert.match(source, /keeps these files in history and makes the new packet the one requiring review/);
  assert.match(source, /!insurancePacketItemsComplete\(items\)/);
  assert.match(source, /Upload Replacement Packet/);
  assert.match(styles, /\.extension-insurance-modal \{ max-width: 620px !important; \}/);
});
