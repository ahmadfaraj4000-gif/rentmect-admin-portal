// Real receive-payment component and draft storage; synthetic local API only.
import {readFile,writeFile,mkdtemp,rm,mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const artifacts=process.env.PAYMENT_BROWSER_ARTIFACTS||'/tmp/rentme-payment-browser';
await mkdir(artifacts,{recursive:true});
const root=resolve(import.meta.dirname,'..'),folder=await mkdtemp(root+'/.unified-test-');
const main=await readFile(root+'/src/main.jsx','utf8');
const ledger=main.slice(main.indexOf('function RentalPaymentHistory('),main.indexOf('function ExternalPaymentDetailsModal('));
await writeFile(folder+'/index.html','<meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div><script type="module" src="./test.jsx"></script>');
await writeFile(folder+'/test.jsx',`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {ReceiptActions} from '../src/ReceiptActions.jsx';import {receivedDateLabel} from '../src/lib/externalPayment.js';import {ReceivePayment} from '../src/ReceivePayment.jsx';import {DraftOwnerContext} from '../src/useTaskDraft.js';import '../src/styles.css';import '../src/vehicle-editor.css';import '../src/admin-list-details.css';import '../src/emails.css';import '../src/final-overrides.css';import '../src/payment-receipts.css';import '../src/settings-layout.css';
const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n);const formatEasternDateTime=d=>new Date(d).toLocaleString('en-US',{timeZone:'America/New_York'});
${ledger}
const client={from(){return{filters:[],select(){return this},eq(k,v){this.filters.push([k,v]);return this},async maybeSingle(){const r=JSON.parse(sessionStorage.getItem('receipt')||'null');return {data:r&&this.filters.every(([k,v])=>k==='rental_id'||r[k]===v)?r:null}}}}};window.calls=[];
function App(){if(location.search.includes('ledger'))return <RentalPaymentHistory payments={[{id:'receipt',correctableReceiptId:'receipt',amount:200,provider:'external',method:'Cash App',receivedDate:'2026-01-31',receivedTime:'23:30',date:'2026-02-01T17:00:00Z',label:'Payment received',reference:'Cash App #123',notes:'Paid last night. Entered this morning.',allocations:[{id:'toll',label:'Bridge tolls',amount:26},{id:'rent',label:'Rental payment',amount:174}]}]} onReceiptAction={async()=>{}}/>;return <ReceivePayment client={client} rental={{id:'test',vehicles:{name:'Audi Q5 #149'},profiles:{full_name:'Synthetic Renter'}}} rentalDue={189} charges={[{id:'t',name:'Bridge tolls',charge_type:'toll',status:'pending',total_amount:26},{id:'m',name:'Manual charge',charge_type:'late_fee',status:'pending',total_amount:10}].filter(c=>!location.search.includes('notolls')||c.charge_type!=='toll')} onClose={()=>{}} onRecord={async(rental,id,request,cancel)=>{
window.calls.push({id,request,cancel});if(cancel){sessionStorage.removeItem('receipt');return{status:'cancelled'}}
if(!sessionStorage.getItem('failed')){sessionStorage.setItem('failed','1');sessionStorage.setItem('receipt',JSON.stringify({id,status:'pending',request}));throw Error('Network interrupted. Resume recording.');}
const result={status:'posted',receiptId:id,amountCents:request.amountCents,balanceDue:15};sessionStorage.setItem('receipt',JSON.stringify({id,status:'posted',request,result}));throw Error('Posted response lost. Resume to check.');
}}/>};createRoot(document.getElementById('root')).render(<DraftOwnerContext.Provider value="test-staff"><App/></DraftOwnerContext.Provider>);`);
const server=spawn(process.execPath,[root+'/node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5198','--strictPort'],{cwd:root,stdio:['ignore','pipe','pipe']});let browser;
try{
 await new Promise((ok,no)=>{server.stdout.on('data',d=>{if(d.toString().includes('Local:'))ok()});server.on('error',no);server.on('exit',()=>no(Error('Server exited')))});
 browser=process.env.PAYMENT_BROWSER==='webkit'?await webkit.launch({headless:true}):await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'});
 for(const [mobile,height] of [[false,1000],[true,780],[false,720]]){
  console.log('Checking',process.env.PAYMENT_BROWSER||'chromium',mobile?'touch':'mouse',height);
  const context=await browser.newContext({hasTouch:mobile,isMobile:mobile,viewport:mobile?{width:390,height:780}:{width:1280,height}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5198/'+folder.split('/').at(-1)+'/index.html');
  assert.equal(await page.getByLabel('Amount received',{exact:true}).inputValue(),'0.00');
  const amount=page.getByLabel('Amount received',{exact:true});
  // Real click + typing catches cursor placement that fill() bypasses.
  if(mobile)await amount.tap({position:{x:120,y:20}});else await amount.click({position:{x:120,y:20}});
  assert.equal(await amount.inputValue(),'0.00');
  assert.equal(await amount.getAttribute('placeholder'),'0.00');
  await amount.pressSequentially('20000');
  assert.equal(await amount.inputValue(),'200.00');
  await page.getByRole('combobox',{name:'Payment method',exact:true}).focus();
  assert.equal(await amount.inputValue(),'200.00');
  if(mobile)await amount.tap({position:{x:120,y:20}});else await amount.click({position:{x:120,y:20}});
  await amount.pressSequentially('125.50');
  await page.getByRole('combobox',{name:'Payment method',exact:true}).focus();
  assert.equal(await amount.inputValue(),'125.50','Refocusing replaces the previous amount, including after pointer-up');
  await amount.focus();await amount.pressSequentially('7500');
  await page.getByRole('combobox',{name:'Payment method',exact:true}).focus();
  assert.equal(await amount.inputValue(),'75.00','Keyboard focus also replaces the amount');
  await amount.focus();await amount.press('Backspace');
  await page.getByRole('combobox',{name:'Payment method',exact:true}).focus();
  assert.equal(await amount.inputValue(),'0.00','Clearing an amount returns to zero');
  assert.equal(await page.getByLabel('Apply to rental',{exact:true}).isChecked(),true);
  assert.equal(await page.getByRole('checkbox',{name:/Manual charge/}).isChecked(),true,'late fee starts selected');
  await page.getByRole('checkbox',{name:/Manual charge/}).uncheck();
  await page.getByLabel('Select all tolls').uncheck();
  await page.getByLabel('Amount received',{exact:true}).fill('100.00');
  assert.match(await page.locator('.rp-summary').innerText(),/Applied to rental\s*\$100.00/);
  await page.getByLabel('Apply to rental',{exact:true}).uncheck();
  await page.getByLabel(/I confirm/).check();
  await page.getByRole('button',{name:'Record $100.00 payment',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'Select Apply to rental'}).waitFor();
  assert.equal(await page.evaluate(()=>window.calls.length),0);
  await page.getByLabel('Apply to rental',{exact:true}).check();
  const heights=await page.locator('.rp-field input, .rp-field select, .rp-field textarea').evaluateAll(ns=>ns.map(n=>n.getBoundingClientRect().height));
  assert.equal(new Set(heights).size,1,'Every payment field must have the same height');
  const footer=await page.locator('.rp-footer').boundingBox();
  assert.ok(footer.y>=0&&footer.y+footer.height<=page.viewportSize().height,'Footer stays within viewport');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'No horizontal overflow');
  await page.getByLabel('Select all tolls').check();await page.getByLabel('Amount received').fill('25.00');await page.getByLabel(/I confirm/).check();
  await page.getByRole('button',{name:'Record $25.00 payment',exact:true}).click();await page.getByRole('alert').filter({hasText:'cover the selected charges'}).waitFor();assert.equal(await page.evaluate(()=>window.calls.length),0);
  await page.getByLabel('Amount received').fill('200.00');await page.getByLabel('Date received',{exact:true}).fill('2026-01-31');await page.getByLabel('Payment notes').fill('Paid last night');
  assert.match(await page.getByRole('dialog').innerText(),/Applied to rental\s*\$174.00/);assert.match(await page.getByRole('dialog').innerText(),/Rental balance after payment\s*\$15.00/);
  await page.locator('.rp-confirmation').scrollIntoViewIfNeeded();

  if(mobile){await page.locator('.rp-body').evaluate(e=>e.scrollTop=0);await page.screenshot({path:artifacts+'/payment-form-mobile-top.png'});await page.locator('.rp-confirmation').scrollIntoViewIfNeeded();}
  await page.screenshot({path:artifacts+'/payment-form-'+(mobile?'mobile':'desktop')+'.png',fullPage:true});
  await page.getByLabel(/I confirm/).check();await page.getByRole('button',{name:'Record $200.00 payment',exact:true}).click();await page.getByRole('alert').filter({hasText:'Network interrupted'}).waitFor();
  const id=await page.evaluate(()=>window.calls[0].id);await page.reload();await page.getByRole('button',{name:'Resume recording'}).waitFor();assert.equal(await page.getByLabel('Amount received').isDisabled(),true);assert.equal(await page.getByLabel(/I confirm/).isChecked(),false);
  await page.getByLabel(/I confirm/).check();await page.getByRole('button',{name:'Resume recording'}).click();await page.getByRole('alert').filter({hasText:'Posted response lost'}).waitFor();assert.equal(await page.evaluate(()=>window.calls[0].id),id);
  await page.reload();await page.getByRole('status').filter({hasText:'$200.00 recorded. Rental balance: $15.00.'}).waitFor();assert.equal(await page.evaluate(()=>window.calls.length),0);assert.deepEqual(errors,[]);
  await page.screenshot({path:artifacts+'/payment-'+(mobile?'mobile':'desktop')+'.png',fullPage:true});await page.goto('http://127.0.0.1:5198/'+folder.split('/').at(-1)+'/index.html?ledger=1');
  await page.getByText('Payment allocations',{exact:true}).click();
  await page.getByText('Paid last night. Entered this morning.',{exact:true}).waitFor();
  const details=await page.locator('.payment-ledger-detail > small').evaluateAll(nodes=>nodes.map(n=>({top:n.getBoundingClientRect().top,bottom:n.getBoundingClientRect().bottom})));
  for(let i=1;i<details.length;i++)assert.ok(details[i].top>=details[i-1].bottom,'Ledger notes/date/reference must not overlap');
  await page.screenshot({path:artifacts+'/ledger-'+(mobile?'mobile':'desktop')+'.png',fullPage:true});
  assert.deepEqual(errors,[]);
  await page.evaluate(()=>sessionStorage.clear());
  await page.goto('http://127.0.0.1:5198/'+folder.split('/').at(-1)+'/index.html?notolls=1');
  await page.getByLabel('Apply to rental',{exact:true}).waitFor();
  assert.equal(await page.getByLabel('Select all tolls').count(),0,'Hide toll selection when there are no eligible tolls');
  assert.equal(await page.getByLabel('Amount received',{exact:true}).inputValue(),'0.00');
  await context.close();
 }
 console.log('PASS: dollar typing, click/tap replacement, decimal formatting, desktop/mobile $200 allocation, underfunded rejection, notes/date persistence, failed-request resume, lost-response recovery with no duplicate payment.');
}finally{await browser?.close();server.kill();await rm(folder,{recursive:true,force:true});}
