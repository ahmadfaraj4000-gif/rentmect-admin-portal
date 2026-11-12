// Synthetic component interactions with the production stylesheet cascade. No live payment requests.
import {readFile,writeFile,mkdtemp,rm,mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'/tmp/rentme-card-tools/node_modules/playwright/index.mjs');
const root=resolve(process.env.RENTMECT_ADMIN_ROOT||'.'),folder=await mkdtemp(root+'/.ux-browser-');
await writeFile(folder+'/index.html','<meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div><script type="module" src="./test.jsx"></script>');
await writeFile(folder+'/test.jsx',`import React,{useState}from'react';import{createRoot}from'react-dom/client';import{ReceiptActions}from'../src/ReceiptActions.jsx';import{RentalReceiptDialog}from'../src/RentalLedger.jsx';import{FlexibleReceivePayment}from'../src/FlexibleReceivePayment.jsx';import{DraftOwnerContext}from'../src/useTaskDraft.js';
import '../src/styles.css';import '../src/final-overrides.css';import '../src/payment-receipts.css';
window.calls=[];window.copied=[];window.emails=[];Object.defineProperty(navigator,'clipboard',{value:{writeText:async url=>window.copied.push(url)},configurable:true});
let state={version:2,availableCreditCents:0,receipts:[],allocations:[]};
const client={rpc:async()=>({data:state}),functions:{invoke:async(_,body)=>{window.calls.push(body.body);const b=body.body;const result=b.action==='admin_cancel_allocated_stripe'?{status:'cancelled'}:b.action==='admin_charge_allocated_stripe'?{status:'posted',amountCents:b.externalPayment.amountCents,creditAmountCents:b.externalPayment.creditAmountCents}:{status:'pending',url:'https://checkout.stripe.com/test'};state={...state,receipts:result.status==='pending'?[{id:b.idempotencyKey,status:'pending',funding_kind:'stripe',request:b.externalPayment,result}]:[]};return{data:result};}}};
function App(){const[view,setView]=useState('history');return <DraftOwnerContext.Provider value="synthetic"><button onClick={()=>setView('history')}>History fixture</button><button onClick={()=>setView('stripe')}>Stripe fixture</button>{view==='history'&&<RentalReceiptDialog title="Payment history and details" onClose={()=>setView('')}><div className="rental-payment-history"><ol><li><strong>$986.19 · Cash</strong><ReceiptActions payment={{amount:986.19,provider:'external',method:'Cash',date:'2026-11-10T12:00:00Z',legacySource:{type:'rental_charge',id:'receipt'}}} onAction={async(id,form,action)=>{window.calls.push({id,form,action});return form.reviewToken?{status:'corrected'}:{status:'review',reviewToken:'synthetic-review',beforeCents:98619,afterCents:form.amountCents,creditCents:0,rentalBalanceAfterCents:8619,allocations:[{id:'rent',name:'Rental',beforeCents:98619,afterCents:form.amountCents}]};}}/></li>{Array.from({length:8},(_,i)=><li key={i}>Other recorded payment {i}<p>Payment history remains visible and scrollable.</p></li>)}</ol></div></RentalReceiptDialog>}{view==='stripe'&&<FlexibleReceivePayment initialTab="stripe" client={client} rental={{id:'rental',vehicles:{name:'Synthetic car'},profiles:{full_name:'Synthetic customer'}}} charges={[{id:'toll',name:'Bridge toll',charge_type:'toll',status:'pending',total_amount:26},{id:'fee',name:'Transport',charge_type:'manual',status:'pending',total_amount:50}]} rentalDue={78.7} onClose={()=>setView('')} onStripeEmail={(target,url,channel)=>window.emails.push({target,url,channel})}/>}</DraftOwnerContext.Provider>};createRoot(document.getElementById('root')).render(<App/>);`);
const server=spawn(process.execPath,[root+'/node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5196','--strictPort'],{cwd:root,stdio:['ignore','pipe','pipe']});let browser;
try{
 let serverOutput='';server.stdout.on('data',d=>{serverOutput+=d});server.stderr.on('data',d=>{serverOutput+=d});
 const deadline=Date.now()+30000;
 for(;;){
  if(server.exitCode!==null)throw Error(`Vite exited: ${serverOutput}`);
  try{const response=await fetch('http://127.0.0.1:5196/',{signal:AbortSignal.timeout(1000)});if(response.status<500)break;}catch{}
  if(Date.now()>deadline)throw Error(`Vite did not become ready: ${serverOutput}`);
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 console.log('Payment fixture server ready; starting browser checks.');
 browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL==='chromium'?undefined:process.env.PLAYWRIGHT_CHANNEL||'chrome'});await mkdir('/tmp/rentme-card-screenshots',{recursive:true});
 for(const viewport of [{width:1440,height:900},{width:800,height:700},{width:390,height:700}]){
  const page=await browser.newPage({viewport}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5196/'+folder.split('/').at(-1)+'/index.html');
  const edit=page.getByRole('button',{name:'Edit payment amount and details'});await edit.waitFor();
  assert.equal(await edit.evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(35, 104, 71)');
  const close=page.getByRole('button',{name:'Close payment details'}),dialog=page.getByRole('dialog');
  assert.ok(await close.evaluate(n=>{const d=n.closest('[role=dialog]').getBoundingClientRect(),r=n.getBoundingClientRect();return d.right-r.right<30&&r.top-d.top<30}),'X in top right');
  await edit.click();await page.getByLabel('Amount paid',{exact:true}).fill('900.00');await page.getByLabel('Reason for correction',{exact:true}).fill('Correct the transcribed cash amount');
  await page.getByRole('button',{name:'Review changes',exact:true}).click();
  await page.getByRole('button',{name:'Confirm payment changes',exact:true}).waitFor();
  assert.equal((await page.evaluate(()=>window.calls)).length,1,'review only, no commit');
  assert.ok(await page.locator('.payment-dialog-scroll').evaluate(n=>{n.scrollTop=n.scrollHeight;return n.scrollHeight>n.clientHeight&&n.scrollTop>0}),'expanded editor scrolls to bottom');
  await page.getByRole('button',{name:'Confirm payment changes',exact:true}).scrollIntoViewIfNeeded();
  await page.screenshot({path:'/tmp/rentme-card-screenshots/correction-review-'+viewport.width+'.png'});
  await page.getByRole('button',{name:'Confirm payment changes',exact:true}).click();await page.getByText('Payment changes saved. Balances are refreshing.').waitFor();
  assert.equal((await page.evaluate(()=>window.calls))[1].form.amountCents,90000);
  await close.click();await page.getByRole('button',{name:'Stripe fixture'}).click();
  const amount=page.getByLabel('Stripe payment amount',{exact:true});await amount.waitFor();assert.equal(await amount.inputValue(),'154.70');assert.equal(await amount.isEnabled(),true);
  await amount.fill('200.00');await page.getByLabel('Stripe amount toward rental',{exact:true}).fill('50.00');await page.getByLabel('Stripe amount toward Bridge toll',{exact:true}).fill('10.00');
  await page.getByRole('button',{name:'Open Stripe link',exact:true}).click();await page.getByRole('button',{name:'Confirm and create Stripe link',exact:true}).click();
  await page.getByRole('button',{name:'Copy link',exact:true}).click();
  await page.getByText('Stripe payment link copied.',{exact:true}).waitFor();
  const calls=await page.evaluate(()=>window.calls),call=calls.at(-1);assert.equal(call.externalPayment.amountCents,20000);assert.equal(call.externalPayment.rentalAmountCents,5000);assert.equal(call.externalPayment.creditAmountCents,9000);
  assert.equal((await page.evaluate(()=>window.copied)).length,1);
  await page.getByRole('button',{name:'Email link',exact:true}).click();assert.equal((await page.evaluate(()=>window.emails))[0].channel,'email');assert.equal((await page.evaluate(()=>window.calls)).length,calls.length,'email reuses reserved checkout');
  await page.screenshot({path:'/tmp/rentme-card-screenshots/stripe-allocation-'+viewport.width+'.png'});
  await page.getByRole('button',{name:'Cancel unpaid Stripe attempt',exact:true}).click();await page.getByText(/unpaid Stripe attempt was cancelled/).waitFor();assert.equal(await amount.isEnabled(),true);
  await page.getByRole('button',{name:'Charge saved card',exact:true}).click();await page.getByRole('button',{name:'Confirm and charge saved card',exact:true}).click();await page.getByText(/received through Stripe/).waitFor();
  assert.ok(await dialog.evaluate(n=>n.scrollWidth<=n.clientWidth+1),'no horizontal dialog overflow');assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS: desktop/tablet/mobile modal scroll and top-right close, green edit button, editable paid amount, review before confirmation, full Stripe default, split allocation/overpayment, copy/email checkout reuse, cancel and saved-card confirmation.');
}finally{await browser?.close();server.kill();await rm(folder,{recursive:true,force:true});}
