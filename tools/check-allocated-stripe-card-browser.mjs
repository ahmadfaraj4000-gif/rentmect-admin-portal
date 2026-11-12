// Entire real RentalRow and payment dialog; synthetic local API, no production calls.
import {readFile,writeFile,mkdtemp,rm,mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || '/tmp/rentme-card-tools/node_modules/playwright/index.mjs');
const root=resolve(process.env.RENTMECT_ADMIN_ROOT || '.'),folder=await mkdtemp(root+'/.flex-browser-');
const temporaryModule=root+'/src/.flex-card-browser.jsx';
const source=await readFile(root+'/src/main.jsx','utf8');
await writeFile(temporaryModule,source.replace("createRoot(document.getElementById('root')).render(<PortalErrorBoundary><App /></PortalErrorBoundary>);",'export { RentalRow };'));
await writeFile(folder+'/index.html','<meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div><script type="module" src="./test.jsx"></script>');
await writeFile(folder+'/refund.html','<div id="root"></div><script type="module" src="./refund.jsx"></script>');
await writeFile(folder+'/refund.jsx',`import React from 'react';import{createRoot}from'react-dom/client';import{ReceiptActions}from'../src/ReceiptActions.jsx';
window.refundCalls=0;createRoot(document.getElementById('root')).render(<ReceiptActions canRefund payment={{flexibleReceipt:true,status:'posted',provider:'external',refundBlockReason:'This rental deposit has already been used. Reconcile the deposit before returning money.'}} onAction={()=>{window.refundCalls++}}/>);`);
await writeFile(folder+'/test.jsx',`import React from 'react';import{createRoot}from'react-dom/client';import{RentalRow}from'../src/.flex-card-browser.jsx';import{DraftOwnerContext}from'../src/useTaskDraft.js';
const rental={id:'synthetic-rental',user_id:'customer',vehicle_id:'car',status:'overdue',payment_status:'partially_paid',rental_total:236.10000000000005,security_deposit:300,deposit_held_amount:300,deposit_status:'held',paid_at:'2026-11-01T14:00:00Z',payment_amount_cents:45740,payment_provider:'local',external_payment_method:'cash',pickup_date:'2026-11-01',pickup_time:'10:00 AM',return_date:'2026-11-02',return_time:'10:00 AM',agreement_signed:true,vehicles:{name:'Synthetic Cadillac ATS #780',daily_rate:74},profiles:{full_name:'Synthetic Customer',email:'synthetic@example.com',phone_verified:true,identity_verification_status:'verified'}};
const charges=[{id:'toll',name:'Bridge toll',charge_type:'toll',status:'pending',total_amount:26,amount:26},{id:'fee',name:'New insurance',charge_type:'add_on',status:'pending',total_amount:50,amount:50}, {id:'historical-insurance',name:'Historical insurance',charge_type:'add_on',status:'paid',total_amount:117.26,amount:117.26,paid_at:'2026-11-02T14:00:00Z',payment_provider:'local',external_payment_method:'cash_app'}, ...Array.from({length:30},(_,i)=>({id:'old-'+i,name:'Historical toll '+i,charge_type:'toll',status:'paid',total_amount:1,amount:1,paid_at:'2026-11-01T12:00:00Z',payment_provider:'local'}))].map(c=>({...c,rental_id:rental.id,user_id:rental.user_id}));
window.calls=[];window.stripeCalls=[];window.copiedLinks=[];Object.defineProperty(navigator,'clipboard',{value:{writeText:async url=>window.copiedLinks.push(url)},configurable:true});
async function record(rentalId,id,request,cancel){if(typeof cancel==='string'&&cancel.includes('allocated_stripe')){window.stripeCalls.push({id,request,action:cancel});const result={status:'pending',url:'https://checkout.stripe.com/c/pay/cs_test_allocated'};sessionStorage.setItem('receipt',JSON.stringify({id,allocation_version:2,funding_kind:'stripe',status:'pending',request,result}));return result;}window.calls.push({id,request,cancel});if(cancel){sessionStorage.removeItem('receipt');return{status:'cancelled'}}
 const result={status:'posted',receiptId:id,amountCents:request.amountCents,creditAmountCents:request.creditAmountCents,availableCreditCents:request.creditAmountCents,balanceDue:89,funding:request.funding};
 if(!sessionStorage.getItem('failed')){sessionStorage.setItem('failed','1');sessionStorage.setItem('receipt',JSON.stringify({id,allocation_version:2,status:'pending',request}));throw Error('Synthetic network interruption. Resume this same payment.');}
 sessionStorage.setItem('receipt',JSON.stringify({id,allocation_version:2,status:'posted',request,result}));return result;}
createRoot(document.getElementById('root')).render(<DraftOwnerContext.Provider value="synthetic-staff"><main className="admin-main" style={{padding:16,maxWidth:1400,margin:'auto',width:'100%',boxSizing:'border-box'}}><RentalRow rental={rental} rentalCharges={charges} detailed adjustExternalRentalPayment={()=>true} chargeRentalSavedCard={async charge=>{window.stripeCalls.push({kind:'saved',id:charge.id,amount:charge.total_amount});return true}} createAdminPaymentLink={async(r,mode,amount)=>{window.stripeCalls.push({kind:'rental',id:r.id,mode,amount});return 'https://checkout.stripe.com/c/pay/cs_test_synthetic_rental'}} createManualStripePaymentLink={async({charge})=>{window.stripeCalls.push({kind:'charge',id:charge.id});return 'https://checkout.stripe.com/c/pay/cs_test_synthetic_charge'}} recordTestPayment={()=>true} recordExternalRentalCharge={()=>true} recordExternalTollPayment={record} applyManualRentalDiscount={()=>true} addRentalCharge={()=>true} waiveRentalCharge={()=>true} notify={()=>{}}/></main></DraftOwnerContext.Provider>);`);
const server=spawn(process.execPath,[root+'/node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5195','--strictPort'],{cwd:root,env:{...process.env,VITE_SUPABASE_URL:'http://127.0.0.1:5195/fixture',VITE_SUPABASE_ANON_KEY:'synthetic-anon',VITE_FLEXIBLE_PAYMENTS:process.env.VITE_FLEXIBLE_PAYMENTS || 'true',VITE_UNIFIED_EXTERNAL_PAYMENTS:'true'},stdio:['ignore','pipe','pipe']});
let browser;
try{
 await new Promise((ok,no)=>{server.stdout.on('data',d=>{if(d.toString().includes('Local:'))ok()});server.on('error',no);server.on('exit',()=>no(Error('Vite exited')))});
 browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'});
 await mkdir('/tmp/rentme-card-screenshots',{recursive:true});
 for(const viewport of [{width:1440,height:1000},{width:800,height:900},{width:390,height:844}]){
  const page=await browser.newPage({viewport}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/fixture/**',async route=>{
   const url=route.request().url();let data=[];
   if(url.includes('admin_flexible_payment_state')){const receipt=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('receipt')||'null'));data={version:2,availableCreditCents:20000,receipts:receipt?[receipt]:[],allocations:[]};}
   if(url.includes('get_rental_account'))data={invoice_total:536.1000000000001,net_paid:457.4};
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto('http://127.0.0.1:5195/'+folder.split('/').at(-1)+'/index.html');
  await page.getByText(/PHYSICAL RETURN LOCK/).waitFor();
  assert.equal(await page.getByRole('button',{name:'Take Payment',exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:'Edit Payment Details',exact:true}).count(),0);
  await page.getByRole('button',{name:'Show rental details',exact:true}).click();
  assert.equal(await page.locator('.rental-card-expanded-content .rental-card-payment-toolbar').getByRole('button',{name:'Take Payment',exact:true}).count(),1);
  await page.getByRole('tab',{name:'Payments',exact:true}).waitFor();
  const buttonRects=await page.locator('.rental-card-payment-toolbar > button').evaluateAll(nodes=>nodes.map(n=>({top:n.getBoundingClientRect().top,left:n.getBoundingClientRect().left,right:n.getBoundingClientRect().right})));
  assert.equal(buttonRects.length,3);
  assert.ok(buttonRects.every(r=>Math.abs(r.top-buttonRects[0].top)<2),'all three buttons stay on one row');
  assert.ok(buttonRects.slice(1).every((r,i)=>r.left>=buttonRects[i].right),'buttons do not overlap');
  await page.screenshot({path:'/tmp/rentme-card-screenshots/card-'+viewport.width+'.png',fullPage:true});
  assert.ok(await page.locator('[role=tabpanel]:visible').evaluate(n=>n.scrollHeight>n.clientHeight),'long payment history scrolls inside ledger');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'card has no horizontal page overflow');
  await page.getByRole('tab',{name:'Charges',exact:true}).click();
  assert.equal(await page.getByText('Historical insurance • Paid',{exact:true}).count(),0);
  await page.getByLabel('Show charges').selectOption('paid');
  await page.getByText('Historical insurance • Paid',{exact:true}).waitFor();
  await page.getByRole('tab',{name:'Activity',exact:true}).click();
  await page.getByRole('tab',{name:'Activity',exact:true}).press('Home');
  assert.equal(await page.getByRole('tab',{name:'Payments',exact:true}).getAttribute('aria-selected'),'true');
  await page.getByRole('button',{name:'Edit Payment Details',exact:true}).click();
  const history=page.getByRole('dialog',{name:'Payment history and details'});
  await history.getByText('$457.40',{exact:true}).waitFor();await history.getByText('$117.26',{exact:true}).waitFor();
  const legacy=history.getByRole('button',{name:'Correct legacy rental payment method / refund'});
  assert.ok(await legacy.evaluate(n=>Math.abs(n.getBoundingClientRect().right-n.parentElement.getBoundingClientRect().right)<2),'legacy action aligns right');
  await legacy.scrollIntoViewIfNeeded();
  await history.screenshot({path:'/tmp/payment-history-aligned-'+viewport.width+'.png'});
  await page.getByRole('button',{name:'Close payment details',exact:true}).click();
  await page.getByRole('button',{name:'Take Payment',exact:true}).first().click();
  await page.getByRole('tabpanel',{name:'External payments'}).waitFor();
  await page.getByRole('tab',{name:'Stripe payments',exact:true}).click();
  assert.equal(await page.getByLabel('Stripe payment amount').inputValue(),'154.70');
  await page.getByLabel('Stripe payment amount').fill('200');
  await page.getByRole('button',{name:'Open Stripe link',exact:true}).click();
  await page.getByRole('button',{name:'Confirm and create Stripe link',exact:true}).click();
  await page.getByRole('button',{name:'Copy link',exact:true}).click();
  await page.getByText('Stripe payment link copied.',{exact:true}).waitFor();
  assert.equal((await page.evaluate(()=>window.stripeCalls))[0].request.creditAmountCents,4530);
  assert.equal((await page.evaluate(()=>window.copiedLinks))[0],'https://checkout.stripe.com/c/pay/cs_test_allocated');
  await page.getByRole('button',{name:'Email link',exact:true}).click();
  await page.getByRole('dialog',{name:'Message Synthetic Customer'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Email',exact:true}).getAttribute('class'),'active');
  await page.getByText(/A payment of \$200.00 has been requested/).waitFor();
  assert.equal((await page.evaluate(()=>window.stripeCalls)).length,1,'email reuses the exact allocated checkout');
  await page.screenshot({path:'/tmp/rentme-card-screenshots/allocated-email-'+viewport.width+'.png'});
  await page.getByRole('button',{name:'Close',exact:true}).click();
  assert.ok(await page.getByRole('region',{name:'Full accounting breakdown'}).isVisible());
  assert.equal(await page.locator('details.rental-accounting-breakdown').count(),0);
  assert.ok(await page.locator('.rental-card-payment-toolbar').evaluate(el=>{const b=el.getBoundingClientRect();const r=[...el.children].map(x=>x.getBoundingClientRect());return Math.abs((Math.min(...r.map(x=>x.left))+Math.max(...r.map(x=>x.right)))/2-(b.left+b.right)/2)<2;}));
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS: real RentalRow allocated Stripe amount, excess credit, copied link, email composer exact amount/link reuse, centered actions and visible accounting.');
}finally{await browser?.close();server.kill();await rm(folder,{recursive:true,force:true});await rm(temporaryModule,{force:true});}
