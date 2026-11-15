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
