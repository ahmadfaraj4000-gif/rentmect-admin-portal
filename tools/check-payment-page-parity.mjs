import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { chargeRemaining,flexibleCashEvents } from '../src/lib/paymentAllocation.js';
import { groupPaymentHistory } from '../src/lib/externalPayment.js';
const source=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
const names=['buildPaymentEvents','buildDepositRefundHistory','normalizeLedgerStatus','normalizePaymentStatus','isPartialPaymentStatus','paymentSourceDetail','shortPaymentReference','prettyStatus','money','formatRentalDate','externalPaymentMethodLabel'];
const code=names.map(name=>{const a=source.indexOf(`function ${name}(`);assert.ok(a>=0,name);const b=source.indexOf('\nfunction ',a+1);return source.slice(a,b<0?undefined:b);}).join('\n');
const build=new Function('chargeRemaining','flexibleCashEvents','groupPaymentHistory',code+'\nreturn buildPaymentEvents;')(chargeRemaining,flexibleCashEvents,groupPaymentHistory);
const {input,pages}=JSON.parse(await readFile('/tmp/rentme-screen-payment-parity.json','utf8'));
const expected=build(input);
const actual=pages.flatMap(page=>page.rows);
assert.equal(actual.length,expected.length,'All pages must preserve event count');
const moneyFields=['amount','cashImpact','outstandingAmount'];
for(const row of expected){const found=actual.find(candidate=>candidate.id===row.id);assert.ok(found,`missing ${row.id}`);for(const key of moneyFields)assert.ok(Math.abs(Number(row[key]||0)-Number(found[key]||0))<0.00001,`${row.id} ${key}: ${row[key]} vs ${found[key]}`);assert.equal(found.type,row.type);assert.equal(found.statusGroup,row.statusGroup);}
const totals={collected:expected.reduce((n,r)=>n+Math.max(0,r.cashImpact||0),0),refunded:expected.reduce((n,r)=>n+Math.max(0,-r.cashImpact||0),0),outstanding:expected.reduce((n,r)=>n+Math.max(0,r.outstandingAmount||0),0)};
for(const page of pages)for(const key in totals)assert.ok(Math.abs(page.totals[key]-totals[key])<0.00001,`full-dataset ${key}`);
console.log(`PASS: ${actual.length} payment events match existing financial calculations across every page; totals do not depend on page.`);
