import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root=resolve('.'), folder=await mkdtemp(root+'/.lazy-screen-check-');
await writeFile(folder+'/index.html','<meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="./check.jsx"></script>');
await writeFile(folder+'/check.jsx',`import React,{useState}from'react';import{createRoot}from'react-dom/client';import{CustomerDirectory}from'../src/CustomerDirectory.jsx';import{PortalInbox}from'../src/PortalInbox.jsx';import{MaintenanceHistory,PaymentActivity,EmailHistory}from'../src/HistoryScreens.jsx';
window.calls=[];const log=q=>window.calls.push(q);const rows=(offset=0)=>Array.from({length:offset?2:51},(_,i)=>({id:String(offset+i),user_id:String(offset+i),full_name:'Customer '+(offset+i),rental_count:2,risk:{level:'low',summary:'Clean'},email:'synthetic@example.test',latest_at:'2026-11-14T00:00:00Z',rental_id:'r'+(offset+i),preview:'Preview',unread:0}));
const client={rpc(name,args){return{abortSignal:async()=>{log({name,...args});let r=rows(args.p_offset);return{data:{rows:r.slice(0,50),has_more:r.length>50,unread:4,totals:{collected:9000},reconciliation_count:2}}}}},from(table){let q={table};const b={select(cols){q.cols=cols;return b},eq(k,v){q[k]=v;return b},is(){return b},in(){return b},order(){return b},range(a,z){q.offset=a;q.end=z;return b},single(){q.single=true;return b},abortSignal:async()=>{log(q);if(table==='profiles')return{data:{id:q.id,full_name:'Opened '+q.id}};if(table==='rentals')return{data:[{id:'r'+q.user_id}]};if(table==='rental_messages')return{data:[{id:'m',message:'Private thread body',created_at:'2026-11-14',sender_role:'admin',read_by_admin:true}]};if(table==='vehicle_maintenance_service_logs')return{data:[{id:'service',service_type:'oil',completed_mileage:1000,completed_at:'2026-11-14',notes:'Private maintenance history'}]};return{data:[]}}};return b}};
const Panel=({title,children})=><section><h2>{title}</h2>{children}</section>;
function App(){const[tab,setTab]=useState('customers');return <><nav>{['customers','payments','inbox','maintenance','delivery'].map(t=><button key={t} onClick={()=>setTab(t)}>{t}</button>)}</nav>{tab==='customers'&&<CustomerDirectory client={client} Panel={Panel} renderDetails={(data,close)=><div role="dialog"><p>{data.profile.full_name}</p><button onClick={close}>Close</button></div>} renderContact={()=>null}/>} {tab==='payments'&&<PaymentActivity client={client} filter="all" type="all" render={p=><>{p.pageControls}<p>Total {p.activityTotals?.collected}</p></>}/>} {tab==='inbox'&&<PortalInbox client={client} Panel={Panel} canSend={false} notify={()=>{}}/>} {tab==='maintenance'&&<MaintenanceHistory client={client} vehicleId="car1" prettyStatus={x=>x} formatMiles={x=>x}/>} {tab==='delivery'&&<EmailHistory client={client} Panel={Panel} prettyStatus={x=>x}/>}</>};createRoot(document.getElementById('root')).render(<App/>);`);
const server=spawn(process.execPath,[root+'/node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5198'],{cwd:root,stdio:'ignore',env:{...process.env,VITE_SUPABASE_URL:'http://127.0.0.1:54321',VITE_SUPABASE_ANON_KEY:'test-only'}});
let browser;
try{
 for(let i=0;i<40;i++){try{await fetch('http://127.0.0.1:5198');break}catch{await new Promise(r=>setTimeout(r,150))}}
 browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'});
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const page=await browser.newPage({viewport});const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('Browser error:',e.message)});
  await page.goto('http://127.0.0.1:5198/'+folder.split('/').at(-1)+'/index.html');await page.getByText('1–50',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.table).length),0);
  await page.getByRole('button',{name:'Details',exact:true}).first().click();await page.getByText('Opened 0',{exact:true}).waitFor();
  const reads=await page.evaluate(()=>window.calls.filter(c=>c.table));assert.equal(reads.length,4);assert.ok(reads.every(c=>c.id==='0'||c.user_id==='0'));
  await page.getByRole('button',{name:'Close',exact:true}).click();await page.getByRole('button',{name:'Next',exact:true}).click();await page.getByText('51–52',{exact:true}).waitFor();
  await page.getByRole('button',{name:'payments',exact:true}).click();await page.getByText('Total 9000',{exact:true}).waitFor();await page.getByRole('button',{name:'Next',exact:true}).click();await page.getByText('51–52',{exact:true}).waitFor();assert.equal(await page.getByText('Total 9000',{exact:true}).count(),1);
  await page.getByRole('button',{name:'inbox',exact:true}).click();await page.getByText('Choose a conversation to read and reply.').waitFor();assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.table==='rental_messages').length),0);
  await page.locator('.communications-thread').first().click();await page.getByText('Private thread body',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.table==='rental_messages').length),1);
  await page.getByRole('button',{name:'maintenance',exact:true}).click();assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.table==='vehicle_maintenance_service_logs').length),0);await page.getByRole('button',{name:'Show service history'}).click();await page.getByText('Private maintenance history',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.table==='vehicle_maintenance_service_logs'&&c.vehicle_id==='car1').length),1);
  await page.getByRole('button',{name:'delivery',exact:true}).click();assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.table?.startsWith('email_')).length),0);await page.getByRole('button',{name:'Show history',exact:true}).first().click();await page.getByText('No matching records',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.table==='email_campaigns').length),1);
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS desktop/mobile: summaries only; selected customer/conversation reads; stable totals across pages; unopened maintenance/delivery make zero reads.');
}finally{await browser?.close();server.kill();await rm(folder,{recursive:true,force:true});}
