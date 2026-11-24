import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { resolve, basename } from 'node:path';
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = resolve('.');
const dir = await mkdtemp(root + '/.ops-browser-');
const port = 5236;
await writeFile(dir + '/index.html', '<meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="./fixture.jsx"></script>');
await writeFile(dir + '/fixture.jsx', `
import React from 'react'; import {createRoot} from 'react-dom/client';
import DrivingIncidents from '../src/DrivingIncidents'; import BalanceEmail from '../src/BalanceEmail'; import UndoReturn from '../src/UndoReturn';
import RemoveUnusedRental from '../src/RemoveUnusedRental'; import InspectionPhotos from '../src/InspectionPhotos';
import '../src/styles.css'; import '../src/final-overrides.css';
const rental={id:'r1',profiles:{full_name:'Fixture Renter'},vehicles:{name:'Fixture Car'},pickup_date:'2026-11-20',return_date:'2026-11-23',return_time:'2:00 PM'};
const photos=Array.from({length:12},(_,i)=>({folder:'r1/pickup',name:'Jennifer-'+i+'.png',created_at:'2026-11-23'})); const incidents=[];
window.reads=[];
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const client={rpc:async(name,args)=>{
 window.reads.push(name);
 if(name==='record_rental_driving_incident'){incidents.push({incident_reference:args.p_reference,peak_mph:args.p_peak_mph});return {data:{requires_review:true,count:1}};}
 if(name==='delete_unused_rental')return {data:'delete'};
 if(name==='undo_rental_return')return {data:args.p_code==='test-ok'?{status:'reversed',origin_tab:window.originTab}:{error:'Incorrect return recovery code.'}};
 if(name==='rental_operations_staff_name')return {data:'Jennifer'};
 if(name==='rental_balance_statement')return {data:{recipient:'renter@example.invalid',due:10,statement:'Additional charge $10.00'}};
 if(name==='email_rental_balance_statement')return {data:'job1'};
 throw Error(name);
},functions:{invoke:async name=>{window.reads.push(name);return {data:{html:'<p>Fixture balance</p>',statement:{recipient:'renter@example.invalid',due:10}}};}},
from:()=>{const query={select:()=>query,eq:()=>query,order:()=>query,range:(a,b)=>({abortSignal:async()=>{window.reads.push('incidents');return {data:incidents.slice(a,b+1)};}}),single:async()=>({data:{status:'sent'}})};return query;},
storage:{from:()=>({
 list:async(folder,{offset,limit})=>{window.reads.push(['list',folder,offset,limit]);await wait(500);return {data:photos.filter(p=>p.folder===folder).slice(offset,offset+limit)};},
 upload:async(path)=>{const [r,stage,name]=path.split('/');photos.unshift({folder:r+'/'+stage,name,created_at:new Date().toISOString()});return{};},
 createSignedUrl:async(path)=>{window.reads.push(['sign',path]);return {data:{signedUrl:'/mock-image/'+path}};}
})}};
function Removal(){const [open,setOpen]=React.useState(false);return open?<RemoveUnusedRental client={client} rental={rental} onClose={()=>setOpen(false)} onComplete={value=>{window.removed=value;setOpen(false)}}/>:<button onClick={()=>setOpen(true)}>Delete unused rental</button>;}
createRoot(document.querySelector('#root')).render(<main><h1>Fixture rental</h1><div style={{height:'80vh'}}/><UndoReturn client={client} rental={rental} onComplete={tab=>window.undo=tab}/>
<Removal/><BalanceEmail rentalId="r1" client={client}/><InspectionPhotos client={client} rentalId="r1"/><DrivingIncidents client={client} rentalId="r1"/></main>);`);
const server = spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{stdio:['ignore','pipe','pipe']});
let browser;
try {
  await new Promise((ok,fail)=>{server.stdout.on('data',d=>{if(String(d).includes('Local:'))ok();});server.once('exit',()=>fail(Error('Vite exited')));});
  browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'});
  for(const width of [390,1280]){
    const page=await browser.newPage({viewport:{width,height:660}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const images=[];
    await page.route('**/mock-image/**',async route=>{
      images.push(route.request().url());
      await new Promise(resolve=>setTimeout(resolve,500));
      await route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'});
    });
    await page.goto('http://127.0.0.1:'+port+'/'+basename(dir)+'/index.html');
    const button=name=>page.getByRole('button',{name,exact:true});
    assert.deepEqual(await page.evaluate(()=>window.reads),[]);
    await button('Undo return').click();await button('Cancel').click();await button('Undo return').click();
    await page.getByLabel('Recovery code').fill('wrong');await button('Restore rental').click();
    await page.getByRole('alert').filter({hasText:'Incorrect'}).waitFor();
    const originTab = width === 390 ? 'needs_action' : 'returns_today';
    await page.evaluate(tab => { window.originTab = tab; }, originTab);
    await page.getByLabel('Recovery code').fill('test-ok');await button('Restore rental').click();await page.waitForFunction(tab=>window.undo===tab,originTab);
    await button('Delete unused rental').click();await button('Delete rental permanently').click();
    await page.waitForFunction(()=>window.removed==='delete');
    await button('Preview customer balance email').click();await page.getByText('To renter@example.invalid').waitFor();
    await button('Send balance to customer').click();await button('Check delivery').click();await page.getByText('Delivery status: sent').waitFor();await button('Close preview').click();
    assert.deepEqual(await page.evaluate(()=>window.reads.filter(Array.isArray)),[]);
    await page.evaluate(()=>{
      const measure=(label,ready)=>{
        document.addEventListener('click',function start(event){
          if(event.target.textContent!==label)return;
          document.removeEventListener('click',start,true);
          const began=performance.now();
          function frame(){
            if(ready()) requestAnimationFrame(()=>{window.timings[label]=Math.round(performance.now()-began);});
            else requestAnimationFrame(frame);
          }
          requestAnimationFrame(frame);
        },true);
      };
      window.timings={};
      measure('Vehicle inspection photos',()=>document.querySelectorAll('.inspection-photo-row').length===10);
      measure('View photo',()=>document.querySelector('dialog img')?.naturalWidth>0);
    });
    await page.getByText('Vehicle inspection photos',{exact:true}).click();
    const pickup=page.getByRole('region',{name:'Pickup photos'});
    const view=pickup.getByRole('button',{name:'View photo'});
    await view.nth(9).waitFor();

    assert.equal(await view.count(),10);
    assert.deepEqual(await page.evaluate(()=>window.reads.filter(Array.isArray)),[['list','r1/pickup',0,11],['list','r1/return',0,11]]);
    assert.equal(images.length,0);

    await view.nth(9).click();
    await page.getByRole('dialog').getByRole('img').waitFor();
    await page.waitForFunction(()=>document.querySelector('dialog img')?.naturalWidth>0);
    await page.waitForFunction(()=>Object.keys(window.timings).length===2);
    const timings=await page.evaluate(()=>window.timings);
    await button('Next photo').click();
    await page.getByText('11 of 12',{exact:true}).waitFor();
    await page.waitForFunction(()=>document.querySelector('dialog img')?.naturalWidth>0);
    assert.equal(images.length,2);
    await button('Close photo').click();
    const returns=page.getByRole('region',{name:'Return photos'});
    const picker=page.waitForEvent('filechooser');
    await returns.getByRole('button',{name:'Add return photos'}).click();
    await (await picker).setFiles({name:'test.png',mimeType:'image/png',buffer:Buffer.from('fixture')});
    await returns.getByRole('button',{name:'View photo'}).waitFor();
    assert.equal(images.length,2,'upload refresh must only read metadata');
    console.log(width,'metadata page',timings['Vehicle inspection photos'],'ms, selected image',timings['View photo'],'ms including 500 ms simulated response');
    await page.getByText('Driving incidents',{exact:true}).click();
    await page.getByLabel('Incident report or trip event ID').fill('trip-01');
    await page.getByLabel('Peak speed (mph)').fill('102');
    await button('Record incident').click();
    await page.getByText('trip-01 · 102 mph').waitFor();
    const overflow = await page.evaluate(() => [...document.querySelectorAll('*')].filter(el => el.getBoundingClientRect().right > innerWidth+1).map(el => el.tagName+'.'+el.className+' '+el.outerHTML.slice(0,100)).slice(-12));
    assert.deepEqual(overflow, []);
    assert.deepEqual(errors,[]);await page.close();console.log('PASS',width,'scroll, recovery code, removal, preview, delivery status, pickup and return photos');
  }
} finally {await browser?.close();server.kill();await once(server,'exit');await rm(dir,{recursive:true,force:true});}
