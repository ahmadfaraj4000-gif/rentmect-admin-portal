import test from 'node:test';
import assert from 'node:assert/strict';
import {typedSignatureImage} from '../src/lib/typedSignature.js';
test('typed name renders the exact trimmed legal name as a PNG using the existing signature format',()=>{
 const calls=[];const context={fillText:(...args)=>calls.push(args)};
 const canvas={getContext:type=>{assert.equal(type,'2d');return context;},toDataURL:type=>{assert.equal(type,'image/png');return 'data:image/png;base64,synthetic';}};
 assert.equal(typedSignatureImage('  Synthetic Renter  ',()=>canvas),'data:image/png;base64,synthetic');
 assert.equal(canvas.width,900);assert.equal(canvas.height,240);assert.deepEqual(calls,[['Synthetic Renter',24,140,852]]);
 assert.throws(()=>typedSignatureImage(' ',()=>canvas));
 assert.throws(()=>typedSignatureImage('Renter',()=>({getContext:()=>null})),/could not be prepared/);
});
