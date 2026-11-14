// Real Rentals + RentalRow, synthetic summaries and local RPCs. Never accesses production.
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=resolve('.'),folder=await mkdtemp(root+'/.workflow-browser-'),module=root+'/src/.workflow-browser.jsx';
const source=await readFile(root+'/src/main.jsx','utf8');
await writeFile(module,source.replace("createRoot(document.getElementById('root')).render(<PortalErrorBoundary><App /></PortalErrorBoundary>);",'export { Rentals };'));
await writeFile(folder+'/index.html','<meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div><script type="module" src="./test.jsx"></script>');
await writeFile(folder+'/test.jsx',`import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{Rentals}from'../src/.workflow-browser.jsx';
import{DraftOwnerContext}from'../src/useTaskDraft.js';
const rows=Array.from({length:25},(_,i)=>({id:'rental-'+i,user_id:'customer-'+i,vehicle_id:'car-'+i,vehicle_name:'Audi Q5 #'+(225+i),customer_name:'Test Customer '+i,status:'documents_needed',payment_status:'pending',deposit_status:'pending',rental_total:173.8,security_deposit:600,pickup_date:'2026-11-13',pickup_time:'8:00 PM',return_date:'2026-11-15',return_time:'8:00 PM',card:{rental:{agreement_signed:true,profiles:{phone_verified:true,identity_verification_status:'pending'}},documents:[{id:'license-'+i,user_id:'customer-'+i,rental_id:'rental-'+i,document_type:'license',status:'approved',created_at:'2026-11-13'}],completion_scopes:[]}}));
window.detailReads=[];
function App(){const[id,setId]=useState('');const full=rows.filter(r=>r.id===id).map(r=>({...r,...r.card.rental,profiles:{...r.card.rental.profiles,full_name:r.customer_name},vehicles:{name:r.vehicle_name}}));
const manager={rows,selectedId:id,detailReady:!!id,counts:{},total:25,open:id=>{if(id)window.detailReads.push(id);setId(id)}};
return <DraftOwnerContext.Provider value="synthetic-staff"><main className="admin-main" style={{padding:8,width:'100%',boxSizing:'border-box'}}><Rentals manager={manager} rentals={full} rentalFilter="all" search="" setSearch={()=>{}} setRentalFilter={()=>{}} documentsByRentalId={Object.fromEntries(rows.map(r=>[r.id,r.card.documents]))} documents={rows.flatMap(r=>r.card.documents)} vehicles={[]} reports={[]} extensionRequests={[]} notify={()=>{}}/></main></DraftOwnerContext.Provider>};createRoot(document.getElementById('root')).render(<App/>);`);
const server=spawn(process.execPath,[root+'/node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5204','--strictPort'],{env:{...process.env,VITE_SUPABASE_URL:'http://127.0.0.1:5204/fixture',VITE_SUPABASE_ANON_KEY:'synthetic-anon',VITE_FLEXIBLE_PAYMENTS:'true'},stdio:'ignore'});
let browser;
try{
 const deadline=Date.now()+30000;for(;;){try{const r=await fetch('http://127.0.0.1:5204');if(r.status<500)break;}catch{}if(Date.now()>deadline)throw Error('Vite startup timeout');await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL==='chromium'?undefined:process.env.PLAYWRIGHT_CHANNEL||'chrome'});
 for(const width of [1440,390]){
 const page=await browser.newPage({viewport:{width,height:900}}),errors=[],reads=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/fixture/**',async route=>{const request=route.request();reads.push({url:request.url(),body:request.postData()});let data=[];if(request.url().includes('get_rental_account'))data={invoice_total:784.84,net_paid:0};if(request.url().includes('admin_flexible_payment_state'))data={receipts:[],allocations:[]};await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});});
 await page.goto('http://127.0.0.1:5204/'+folder.split('/').at(-1)+'/index.html');
 const cards=page.locator('article.rental-operations-card'),first=cards.first();await first.getByRole('button',{name:'Show rental details',exact:true}).waitFor();
 assert.equal(await cards.count(),25);assert.equal(await page.locator('.rental-card-expanded-content').count(),0);
 for(const label of ['Phone','Identity','Vehicle','License','Insurance','Agreement','Payment','Deposit','Ready']) assert.equal(await first.locator('.rental-card-workflow').getByText(label,{exact:true}).count(),1,label);
 for(const name of ['Edit','Agreement','Contact','Manage Identity'])assert.equal(await first.locator('.rental-card-header').getByRole('button',{name,exact:true}).isVisible(),true,name);
 assert.equal(await first.getByText('Payment Due',{exact:true}).isVisible(),true);assert.equal(await first.getByText('More Actions',{exact:true}).isVisible(),true);
 assert.deepEqual(await first.locator('.progress-step').evaluateAll(nodes=>nodes.map(n=>n.className.split(' ').filter(c=>['complete','current','missing','bypassed'].includes(c))[0])),['complete','current','complete','complete','missing','complete','missing','missing','missing']);
 assert.deepEqual(reads,[],'collapsed cards must not issue detail/background requests');assert.deepEqual(await page.evaluate(()=>window.detailReads),[]);
 await first.screenshot({path:'/tmp/restored-workflow-'+width+'.png'});
 await first.getByRole('button',{name:'Show rental details',exact:true}).click();await first.getByRole('button',{name:'Hide rental details',exact:true}).waitFor();
 assert.equal(await page.locator('.rental-card-expanded-content').count(),1);assert.deepEqual(await page.evaluate(()=>window.detailReads),['rental-0']);
 assert.ok(reads.every(r=>!r.body||!r.body.includes('rental-1')),'other cards remain unloaded');
 await first.getByRole('button',{name:'Hide rental details',exact:true}).click();await first.getByRole('button',{name:'Show rental details',exact:true}).waitFor();
 await first.getByRole('button',{name:'Agreement',exact:true}).click();await page.getByRole('dialog').waitFor();
 assert.equal(await page.locator('.rental-card-expanded-content').count(),0,'header action does not expand details');assert.deepEqual(await page.evaluate(()=>window.detailReads),['rental-0','rental-0']);
 assert.deepEqual(errors,[]);console.log('PASS '+width+': 25 original headers and nine-step rails, no collapsed requests, one selected detail, Agreement action');await page.close();
 }
}finally{await browser?.close();server.kill();await rm(folder,{recursive:true,force:true});await rm(module,{force:true});}
