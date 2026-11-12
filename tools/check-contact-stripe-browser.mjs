// Synthetic fixtures exercise actual components without sending messages or taking payment.
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/tmp/rentme-card-tools/node_modules/playwright/index.mjs');
const root = resolve(process.env.RENTMECT_ADMIN_ROOT || '.');
const folder = await mkdtemp(root + '/.contact-browser-');
const modulePath = root + '/src/.contact-browser.jsx';
const source = await readFile(root + '/src/main.jsx', 'utf8');
await writeFile(modulePath, source.replace("createRoot(document.getElementById('root')).render(<PortalErrorBoundary><App /></PortalErrorBoundary>);", 'export { CustomerContactModal };'));
await writeFile(folder + '/index.html', '<meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div><script type="module" src="./test.jsx"></script>');
await writeFile(folder + '/test.jsx', `import React from 'react';import {createRoot} from 'react-dom/client';import {CustomerContactModal} from '../src/.contact-browser.jsx';import {StripeAllocatedPayment} from '../src/StripeAllocatedPayment.jsx';
const url='https://checkout.stripe.com/c/pay/cs_test_'+ 'a'.repeat(1200);window.copied=[];window.created=0;window.emails=0;
Object.defineProperty(navigator,'clipboard',{value:{writeText:async v=>window.copied.push(v)},configurable:true});
const profile={id:'test',full_name:'Test Customer',email:'customer@example.com'};
const modal=<CustomerContactModal profile={profile} rentals={[]} emailTemplates={[{id:'t',name:'Payment required',subject:'Payment required',text_body:'Please pay securely: '+url}]} createPaymentLink={async()=>url} notify={()=>{}} onClose={()=>{}}/>;
const stripe=<StripeAllocatedPayment rental={{id:'test'}} charges={[]} due={18573} state={{receipts:[]}} onCollect={async()=>{window.created++;return {status:'pending',url}}} onEmail={()=>window.emails++}/>;
createRoot(document.getElementById('root')).render(location.search ? stripe : modal);`);
const server=spawn(process.execPath,[root+'/node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5197','--strictPort'],{cwd:root,env:{...process.env,VITE_SUPABASE_URL:'http://127.0.0.1:5197/fixture',VITE_SUPABASE_ANON_KEY:'synthetic'},stdio:['ignore','pipe','pipe']});
let browser;
try {
 let serverOutput='';server.stdout.on('data',d=>{serverOutput+=d});server.stderr.on('data',d=>{serverOutput+=d});
 const deadline=Date.now()+30000;
 for(;;){
  if(server.exitCode!==null)throw Error(`Vite exited: ${serverOutput}`);
  try{const response=await fetch('http://127.0.0.1:5197/',{signal:AbortSignal.timeout(1000)});if(response.status<500)break;}catch{}
  if(Date.now()>deadline)throw Error(`Vite did not become ready: ${serverOutput}`);
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 console.log('Contact fixture server ready; starting browser checks.');
 browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL==='chromium'?undefined:process.env.PLAYWRIGHT_CHANNEL||'chrome'});
 for(const width of [1440,800,390]) {
  const page=await browser.newPage({viewport:{width,height:900}});
  await page.goto('http://127.0.0.1:5197/'+folder.split('/').at(-1)+'/index.html');
  await page.getByRole('button',{name:'Copy link',exact:true}).waitFor();
  const sizes=await page.locator('.customer-contact-modal, .customer-contact-body, .contact-preview').evaluateAll(nodes=>nodes.map(n=>({width:n.clientWidth,scroll:n.scrollWidth})));
  for(const size of sizes)assert.ok(size.scroll<=size.width+1,JSON.stringify({width,sizes}));
  for(const name of ['Copy link','Send email'])await page.getByRole('button',{name,exact:true}).scrollIntoViewIfNeeded();
  await page.getByRole('button',{name:'Copy link',exact:true}).click();assert.equal(await page.evaluate(()=>window.copied.length),1);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:'/tmp/contact-stripe-'+width+'.png'});
  await page.goto('http://127.0.0.1:5197/'+folder.split('/').at(-1)+'/index.html?stripe');
  assert.equal(await page.getByRole('button',{name:/^(Send|Email|Copy) Stripe link$/}).count(),0);
  await page.getByRole('button',{name:'Open Stripe link',exact:true}).click();
  await page.getByRole('button',{name:'Confirm and create Stripe link',exact:true}).click();
  await page.getByRole('button',{name:'Copy link',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>({created:window.created,emails:window.emails,copied:window.copied.length})),{created:1,emails:0,copied:1});
  await page.getByRole('button',{name:'Email link',exact:true}).click();assert.equal(await page.evaluate(()=>window.emails),1);
  await page.close();
 }
 console.log('PASS: long URL contained at 1440/800/390px; single generation action reveals copy/open/email controls without automatic email.');
} finally {await browser?.close();server.kill();await rm(folder,{recursive:true,force:true});await rm(modulePath,{force:true});}
