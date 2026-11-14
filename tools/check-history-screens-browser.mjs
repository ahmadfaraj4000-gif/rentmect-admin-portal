import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import {resolve} from 'node:path';
const root=resolve(process.env.ADMIN_TEST_ROOT || '.');
const folder=await mkdtemp(root+'/.history-check-');
await writeFile(folder+'/index.html','<meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="./check.jsx"></script>');
await writeFile(folder+'/check.jsx',`import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{AuditHistory,DocumentHistory}from'../src/HistoryScreens.jsx';import '../src/styles.css';import '../src/final-overrides.css';
window.calls=[];const log=(kind,data)=>window.calls.push({kind,...data});
const client={rpc(name,args){return{abortSignal:async()=>{log(name,args);if(name==='admin_audit_history_detail')return{data:{metadata:{proof:'expanded payload'}}};return{data:{rows:Array.from({length:args.p_offset?11:50},(_,i)=>({id:String(args.p_offset+i),action:'update',entity_type:'rental',created_at:'2026-11-14T00:00:00Z',changed_fields:['status']})),has_more:args.p_offset===0}}}}},from(table){let q={table};const b={select(cols){q.cols=cols;return b},order(){return b},range(a,z){q.offset=a;q.end=z;return b},eq(k,v){q[k]=v;return b},single(){q.single=true;return b},abortSignal:async()=>{log('document',q);return{data:q.single?{id:q.id,status:'pending_review',file_path:'private-path'}:Array.from({length:q.offset?2:51},(_,i)=>({id:String((q.offset||0)+i),document_type:'license',status:'pending_review',created_at:'2026-11-14T00:00:00Z',profiles:{full_name:'Synthetic Customer'}}))}}};return b}};
const Panel=({title,children})=><section><h2>{title}</h2>{children}</section>;
function App(){const[tab,setTab]=useState('audit');return <><button onClick={()=>setTab('audit')}>Audit</button><button onClick={()=>setTab('documents')}>Documents</button>{tab==='audit'?<AuditHistory client={client} Panel={Panel} prettyStatus={x=>x} actionLabel={x=>x}/>:<DocumentHistory client={client} Panel={Panel} docLabel={x=>x} renderDocument={x=><p>{x.file_path}</p>}/>}</>};createRoot(document.getElementById('root')).render(<App/>);`);
const server=spawn(process.execPath,[root+'/node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5199'],{cwd:root,stdio:'ignore'});
let browser;
try{for(let i=0;i<40;i++){try{await fetch('http://127.0.0.1:5199');break}catch{await new Promise(r=>setTimeout(r,150))}}
browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL || 'chrome'});
for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
const page=await browser.newPage({viewport});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:5199/'+folder.split('/').at(-1)+'/index.html');await page.getByText('1–50',{exact:true}).waitFor();
assert.equal(await page.evaluate(()=>window.calls.filter(x=>x.kind==='admin_audit_history_detail').length),0);
await page.getByRole('button',{name:'Show more details'}).first().click();await page.getByText(/expanded payload/).waitFor();assert.equal(await page.evaluate(()=>window.calls.filter(x=>x.kind==='admin_audit_history_detail').length),1);
await page.getByRole('button',{name:'Next',exact:true}).click();await page.getByText('51–61',{exact:true}).waitFor();
await page.getByLabel('Search staff, action, record ID').fill('older-record');await page.waitForFunction(()=>window.calls.some(x=>x.p_search==='older-record'&&x.p_offset===0));
await page.getByRole('button',{name:'Documents',exact:true}).click();await page.getByText('1–50',{exact:true}).waitFor();
assert.equal(await page.evaluate(()=>window.calls.filter(x=>x.kind==='document'&&x.single).length),0);
assert.ok(await page.evaluate(()=>window.calls.filter(x=>x.kind==='document').every(x=>!x.cols.includes('*'))));
await page.getByRole('button',{name:'Show more details'}).first().click();await page.getByText('private-path',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.calls.filter(x=>x.kind==='document'&&x.single).length),1);
await page.getByRole('button',{name:'Next',exact:true}).click();await page.getByText('51–52',{exact:true}).waitFor();assert.deepEqual(errors,[]);await page.close();}
console.log('PASS desktop/mobile: bounded pages, server search resets paging, no collapsed detail reads, only opened record fetched.');
}finally{await browser?.close();server.kill();await rm(folder,{recursive:true,force:true});}
