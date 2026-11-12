// Real provider + Supabase client, synthetic responses; no production writes.
import {writeFile,mkdtemp,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'/tmp/rentme-card-tools/node_modules/playwright/index.mjs');
const root=resolve('.'),folder=await mkdtemp(root+'/.ticket-flags-browser-');
await writeFile(folder+'/index.html','<meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div><script type="module" src="./test.jsx"></script>');
await writeFile(folder+'/test.jsx',`import React from 'react';import{createRoot}from'react-dom/client';import{CustomerTicketFlagProvider,CustomerTicketFlags}from'../src/CustomerTicketFlags.jsx';
createRoot(document.getElementById('root')).render(<React.StrictMode><CustomerTicketFlagProvider><CustomerTicketFlags userId="a"/><CustomerTicketFlags userId="a"/><CustomerTicketFlags userId="b"/><button onClick={()=>window.dispatchEvent(new Event('ticket-flags-changed'))}>Refresh flags</button></CustomerTicketFlagProvider></React.StrictMode>);`);
const server=spawn(process.execPath,[root+'/node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5199','--strictPort'],{cwd:root,env:{...process.env,VITE_SUPABASE_URL:'http://127.0.0.1:5199/fixture',VITE_SUPABASE_ANON_KEY:'synthetic'},stdio:['ignore','pipe','pipe']});
let browser;
try{
 let output='';server.stdout.on('data',d=>output+=d);server.stderr.on('data',d=>output+=d);
 const deadline=Date.now()+30000;
 for(;;){if(server.exitCode!==null)throw Error(output);try{const r=await fetch('http://127.0.0.1:5199/',{signal:AbortSignal.timeout(1000)});if(r.status<500)break;}catch{}if(Date.now()>deadline)throw Error(output);await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL==='chromium'?undefined:process.env.PLAYWRIGHT_CHANNEL||'chrome'});
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 let mode='initial-fail',calls=0,refreshFailed=false;
 await page.route('**/fixture/rest/v1/rpc/admin_ticket_customer_flags',async route=>{
  calls++;assert.deepEqual(route.request().postDataJSON().p_user_ids.sort(),['a','b']);
  if(mode==='initial-fail'||mode==='refresh-fail'){mode='success';refreshFailed=true;await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({code:'57014',message:'canceling statement due to statement timeout'})});return;}
  if(mode==='denied'){await route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({code:'42501',message:'Staff access is required.'})});return;}
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(mode==='clear'?[]:[{id:'ticket',user_id:'a',rental_id:'rental',ticket_number:'TEST-1',violation_date:'2026-01-01',note:'Synthetic reviewed flag',amount:25}])});
 });
 await page.goto('http://127.0.0.1:5199/'+folder.split('/').at(-1)+'/index.html');
 await page.getByRole('complementary',{name:'Customer ticket red flag'}).first().waitFor();
 assert.equal(calls,2,'one transient failure automatically retries, duplicate cards are batched');
 assert.equal(await page.getByRole('complementary').count(),2);
 mode='refresh-fail';refreshFailed=false;await page.getByRole('button',{name:'Refresh flags'}).click();
 await page.getByText(/Showing the last checked ticket flags/).first().waitFor();
 assert.equal(refreshFailed,true);assert.equal(await page.getByRole('complementary').count(),2,'known flags survive failed refresh');
 await page.getByText(/Reconnecting automatically/).first().waitFor({state:'hidden'});
 mode='denied';await page.getByRole('button',{name:'Refresh flags'}).click();await page.getByText(/lookup needs attention/).first().waitFor();
 assert.equal(await page.getByRole('complementary').count(),2,'permission failure cannot erase known flags');
 mode='clear';await page.getByRole('button',{name:'Retry now'}).first().click();await page.getByRole('complementary').first().waitFor({state:'hidden'});
 assert.equal(await page.getByRole('status').count(),0);assert.deepEqual(errors,[]);
 console.log('PASS: real provider automatically recovers, deduplicates Strict Mode subscriptions, retains confirmed flags on failure and clears them only after a successful read.');
}finally{await browser?.close();server.kill();await rm(folder,{recursive:true,force:true});}
