import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const mainSource = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8');
const stripeSource = await readFile(new URL('../supabase/functions/stripe-web-hook/index.ts', import.meta.url), 'utf8');
const cssSource = await readFile(new URL('../src/final-overrides.css', import.meta.url), 'utf8');

test('Send Stripe link keeps the existing email and text delivery workspace', () => {
  assert.match(mainSource, /setContactModal\(\{ charge: openRentalBalance, rentalBalance: true \}\)/);
  assert.match(mainSource, /contact-channel-toggle/);
  assert.match(mainSource, /send-emails\/customer/);
  assert.match(mainSource, /send-rental-due-reminders/);
  assert.match(mainSource, /Send \$\{channel === 'email' \? 'email' : 'text'\}/);
});

test('the same workspace shows the actual checkout URL with manual copy controls', () => {
  assert.match(mainSource, /Stripe checkout URL/);
  assert.match(mainSource, /Nothing is sent automatically/);
  assert.match(mainSource, /navigator\.clipboard\.writeText\(paymentLink\.url\)/);
  assert.match(mainSource, />\{paymentLink\.copied \? 'Copied' : 'Copy link'\}</);
  assert.match(mainSource, /target="_blank" rel="noreferrer"/);
  assert.match(cssSource, /\.stripe-link-copy-panel/);
  assert.match(cssSource, /\.stripe-link-copy-row/);
});

test('admins can create or reuse charge and extension checkout URLs without sending a message', () => {
  assert.match(stripeSource, /admin_create_charge_checkout/);
  assert.match(stripeSource, /admin_create_extension_checkout/);
  assert.match(stripeSource, /createAdminRentalChargeCheckout/);
  assert.match(stripeSource, /createAdminExtensionCheckout/);
  assert.match(stripeSource, /return await createRentalChargeCheckout\(req, payload, charge\.user_id\)/);
  assert.match(stripeSource, /return await createExtensionCheckout\(req, payload, extension\.user_id\)/);
});
