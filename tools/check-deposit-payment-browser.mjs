// Synthetic provider; real payment components and production stylesheet cascade.
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'/tmp/rentme-card-tools/node_modules/playwright/index.mjs');
const root=resolve('.'),folder=await mkdtemp(root+'/.ux-deposit-');
const source=await readFile(root+'/src/main.jsx','utf8');
const entry=source.slice(source.indexOf('  const pendingPayment ='),source.indexOf('  function openReceivePayment('));
await writeFile(folder+'/index.html','<meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="./test.jsx"></script>');
await writeFile(folder+'/test.jsx',`import React,{useState}from'react';import{createRoot}from'react-dom/client';import{FlexibleReceivePayment}from'../src/FlexibleReceivePayment.jsx';import{DraftOwnerContext}from'../src/useTaskDraft.js';import '../src/styles.css';import '../src/final-overrides.css';
window.calls=[];let state={version:2,depositAllocationsEnabled:true,dueParts:{rentalDueCents:7870,depositDueCents:30000,bookingDueCents:37870},availableCreditCents:0,receipts:[],allocations:[]};window.zeroDeposit=()=>{state={...state,dueParts:{rentalDueCents:7870,depositDueCents:0,bookingDueCents:7870}}};const rental={id:'deposit-test',vehicles:{name:'Test car'},profiles:{full_name:'Test customer'}};const client={rpc:async()=>({data:state})};
function App(){const[open,setOpen]=useState(false),[flexibleState,setFlexibleState]=useState(state);${entry}
async function record(rentalId,id,request,action){window.calls.push({id,request,action});const status=action==='admin_create_allocated_stripe'?'pending':action==='admin_cancel_allocated_stripe'?'cancelled':'posted';const result={status,amountCents:request.amountCents,creditAmountCents:request.creditAmountCents,url:status==='pending'?'https://checkout.stripe.com/synthetic':null};state={...state,receipts:status==='pending'?[{id,status,funding_kind:'stripe',allocation_version:2,request,result}]:[]};setFlexibleState(state);return result;}
return <DraftOwnerContext.Provider value="deposit-synthetic"><button onClick={()=>setOpen(true)}>{hasPendingPayment?'Resume Payment':'Take Payment'}</button>{open&&<FlexibleReceivePayment client={client} rental={rental} rentalDue={378.7} onRecord={record} onClose={()=>setOpen(false)}/>}</DraftOwnerContext.Provider>;}createRoot(document.getElementById('root')).render(<App/>);`);
const server=spawn(process.execPath,[root+'/node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5198','--strictPort'],{cwd:root,stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{await fetch('http://127.0.0.1:5198');break;}catch{await new Promise(r=>setTimeout(r,100));}}
 browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL==='chromium'?undefined:process.env.PLAYWRIGHT_CHANNEL||'chrome'});
 for(const width of [1440,800,390]){
 const page=await browser.newPage({viewport:{width,height:850}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5198/'+folder.split('/').at(-1)+'/index.html');
 await page.getByRole('button',{name:'Take Payment',exact:true}).click();
 await page.getByLabel('Amount toward security deposit',{exact:true}).waitFor();
 assert.equal(await page.getByLabel('Amount toward rental',{exact:true}).inputValue(),'78.70');
 assert.equal(await page.getByLabel('Amount toward security deposit',{exact:true}).inputValue(),'300.00');
 assert.match(await page.getByRole('dialog').innerText(),/You selected \$378.70 to pay/);
 assert.doesNotMatch(await page.getByRole('dialog').innerText(),/Overallocated|Applied to rental|Rental balance after this payment/);

 await page.getByRole('tab',{name:'Stripe payments',exact:true}).click();
 assert.equal(await page.getByLabel('Stripe payment amount',{exact:true}).inputValue(),'378.70');
 const stripe=page.getByRole('tabpanel',{name:'Stripe payments',exact:true});
 await stripe.getByRole('checkbox',{name:'Rental balance',exact:true}).uncheck();
 await page.getByLabel('Stripe amount toward security deposit',{exact:true}).fill('150.00');
 await page.getByLabel('Stripe payment amount',{exact:true}).fill('150.00');
 await page.getByRole('button',{name:'Open Stripe link',exact:true}).click();
 await page.getByRole('button',{name:'Confirm and create Stripe link',exact:true}).click();
 await page.getByRole('button',{name:'Cancel unpaid Stripe attempt',exact:true}).waitFor();
 let calls=await page.evaluate(()=>window.calls);assert.equal(calls[0].request.depositAmountCents,15000);assert.equal(calls[0].request.rentalAmountCents,0);assert.equal(calls[0].request.creditAmountCents,0);
 await page.getByRole('button',{name:'Close payment dialog',exact:true}).click();
 await page.getByRole('button',{name:'Resume Payment',exact:true}).click();
 await page.getByRole('button',{name:'Cancel unpaid Stripe attempt',exact:true}).waitFor();
 assert.equal(await page.getByRole('tab',{name:'Stripe payments',exact:true}).getAttribute('aria-selected'),'true');
 assert.equal(await page.getByLabel('Stripe payment amount',{exact:true}).inputValue(),'150.00');
 assert.equal(await page.getByLabel('Stripe payment amount',{exact:true}).isDisabled(),true);
 assert.equal((await page.evaluate(()=>window.calls)).length,1);
 await page.screenshot({path:'/tmp/deposit-resume-'+width+'.png'});
 await page.getByRole('button',{name:'Cancel unpaid Stripe attempt',exact:true}).click();
 await page.getByText('The unpaid Stripe attempt was cancelled. You can change the amount and allocations.').waitFor();
 await page.getByRole('button',{name:'Close payment dialog',exact:true}).click();
 await page.getByRole('button',{name:'Take Payment',exact:true}).click();
 await page.getByLabel('Amount toward security deposit',{exact:true}).waitFor();
 const external=page.getByRole('tabpanel',{name:'External payments',exact:true});
 await external.getByRole('checkbox',{name:'Rental balance',exact:true}).uncheck();
 await page.getByLabel('Amount toward security deposit',{exact:true}).fill('100.00');
 await external.getByLabel('Payment amount',{exact:true}).fill('100.00');
 await page.getByRole('checkbox',{name:/I confirm this money was received/}).check();
 await page.getByRole('button',{name:'Record payment',exact:true}).click();
 calls=await page.evaluate(()=>window.calls);assert.equal(calls.at(-1).request.depositAmountCents,10000);assert.equal(calls.at(-1).request.rentalAmountCents,0);
 assert.ok(await page.getByRole('dialog').evaluate(n=>n.scrollWidth<=n.clientWidth+1));
 await page.getByRole('button',{name:'Close payment dialog',exact:true}).click();await page.evaluate(()=>window.zeroDeposit());
 await page.getByRole('button',{name:'Take Payment',exact:true}).click();
 await page.getByLabel('Amount toward security deposit',{exact:true}).waitFor();
 assert.equal(await page.getByLabel('Amount toward security deposit',{exact:true}).isDisabled(),true);
 await page.getByRole('tab',{name:'Stripe payments',exact:true}).click();
 assert.equal(await page.getByLabel('Stripe amount toward security deposit',{exact:true}).isDisabled(),true);
 assert.equal(await page.getByLabel('Stripe payment amount',{exact:true}).inputValue(),'78.70');
 assert.deepEqual(errors,[]);await page.close();
 console.log('PASS '+width+': partial Stripe/external deposits, unpaid resume, cancel restores Take Payment, no duplicate session.');
 }
}finally{await browser?.close();server.kill();await rm(folder,{recursive:true,force:true});}
