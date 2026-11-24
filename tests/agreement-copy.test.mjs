import test from 'node:test';
import assert from 'node:assert/strict';
import {agreementCopy} from '../src/lib/agreementCopy.js';
test('agreement download uses signer and dates, escapes content and preserves signature',()=>{
 const result=agreementCopy({agreement_signature_name:'Jane Smith',pickup_date:'2026-11-24',return_date:'2026-11-26',agreement_snapshot:'<script>test</script> Drawn Signature Image: data:image/png;base64,YQ=='});
 assert.equal(result.filename,'Jane Smith - Agreement - 2026-11-24 to 2026-11-26.html');
 assert.ok(result.html.includes('<title>Jane Smith - Agreement - 2026-11-24 to 2026-11-26</title>'));
 assert.ok(!result.html.includes('<script>'));assert.ok(result.html.includes('src="data:image/png;base64,YQ=="'));
 assert.throws(()=>agreementCopy({}));
});

import { AGREEMENT_TEXT } from '../src/rentalAgreement.js';
import { agreementMarkup, taxRateSuffix } from '../src/lib/agreementCopy.js';

test('saved details replace duplicate paper fields while preserving terms and signature evidence', () => {
  const snapshot = ['AUTO-FILLED RENTAL DETAILS', 'Renter Name: Taylor Example', 'Pickup Date/Time: Nov 24 at 10:30 AM',
    'Return Date/Time: Nov 26 at 10:30 AM', 'Tax Amount (9.35%): $18.70', 'Typed Signature: Taylor Example',
    '------------------------------------------------------------', AGREEMENT_TEXT].join('\n');
  const html = agreementMarkup(snapshot);
  assert.match(html, /Tax Amount \(9\.35%\)<\/dt><dd>\$18\.70/);
  assert.doesNotMatch(html, /Full Legal Name: ___|Rental Start Date: ___|Rental End Date: ___|Printed Name: ___/);
  assert.match(html, /<h3>Renter signature<\/h3><p>Taylor Example/);
  assert.match(html, /Company Representative: ___/);
  for (const line of AGREEMENT_TEXT.split('\n').filter(line => line.length > 100)) {
    assert.ok(html.includes(line.replaceAll('&', '&amp;').replaceAll("'", '&#39;')), line);
  }
  assert.match(agreementMarkup('LEGACY NOTE'), /<h3>LEGACY NOTE<\/h3>/);
  for (const [rate, label] of [[null,''],[0,' (0.00%)'],[0.0935,' (9.35%)'],['0.0635',' (6.35%)'],[0.0775,' (7.75%)']]) {
    assert.equal(taxRateSuffix(rate), label);
  }
});
