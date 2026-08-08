import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/final-overrides.css', import.meta.url), 'utf8');

test('Agreement opens the styled in-app review instead of starting a browser download', () => {
  assert.match(source, /onClick=\{\(\) => setAdminStepScope\('agreement'\)\}><FileSignature size=\{14\}\/> Agreement/);
  assert.doesNotMatch(source, /rental\.agreement_snapshot \? downloadAgreement\(rental\) : setAdminStepScope\('agreement'\)/);
  assert.match(source, /className=\{`admin-modal admin-step-modal \$\{scope === 'agreement' \? 'agreement-step-modal' : ''\}`\}/);
});

test('Agreement files download only from the explicit in-app action', () => {
  assert.match(source, /alreadySigned && <button type="button" className="secondary-btn" onClick=\{\(\) => downloadAgreement\(rental\)\}/);
  assert.match(source, /Download Agreement/);
});

test('Contact modal uses the light communication palette with green actions', () => {
  assert.match(styles, /\.customer-contact-modal > \.customer-contact-header \{[\s\S]*background: linear-gradient\(135deg, #f7fbf8 0%, #e8f4ed 100%\)/);
  assert.match(styles, /\.customer-contact-modal > \.customer-contact-header strong \{[\s\S]*color: #123d2b/);
  assert.match(styles, /\.customer-contact-modal \.contact-channel-toggle button\.active,[\s\S]*background: #0b6b3a/);
  assert.match(styles, /\.customer-contact-backdrop\.admin-modal-backdrop \{[\s\S]*rgba\(15, 28, 21, \.46\)/);
});
