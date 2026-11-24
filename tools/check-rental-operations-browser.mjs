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
const photos=[]; const incidents=[];
const client={rpc:async(name,args)=>{
 if(name==='record_rental_driving_incident'){incidents.push({incident_reference:args.p_reference,peak_mph:args.p_peak_mph});return {data:{requires_review:true,count:1}};}
 if(name==='remove_unused_rental')return {data:'delete'};
 if(name==='undo_rental_return')return {data:args.p_code==='test-ok'?{status:'reversed',origin_tab:window.originTab}:{error:'Incorrect return recovery code.'}};
 if(name==='rental_operations_staff_name')return {data:'Jennifer'};
 if(name==='rental_balance_statement')return {data:{recipient:'renter@example.invalid',due:10,statement:'Additional charge $10.00'}};
 if(name==='email_rental_balance_statement')return {data:'job1'};
 throw Error(name);
},from:()=>({select:()=>({eq:()=>({order:async()=>({data:[...incidents]}),single:async()=>({data:{status:'sent'}})})})}),storage:{from:()=>({
 list:async(folder)=>({data:photos.filter(p=>p.folder===folder)}),upload:async(path)=>{const [r,stage,name]=path.split('/');photos.push({folder:r+'/'+stage,name,created_at:new Date().toISOString()});return{};},
 createSignedUrl:async()=>({data:{signedUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9d8AAAAASUVORK5CYII='}})
})}};
createRoot(document.querySelector('#root')).render(<main><h1>Fixture rental</h1><div style={{height:'80vh'}}/><UndoReturn client={client} rental={rental} onComplete={tab=>window.undo=tab}/>
<RemoveUnusedRental client={client} rental={rental} onComplete={value=>window.removed=value}/><BalanceEmail rentalId="r1" client={client}/><InspectionPhotos client={client} rentalId="r1"/><DrivingIncidents client={client} rentalId="r1"/></main>);`);
const server = spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{stdio:['ignore','pipe','pipe']});
let browser;
try {
  await new Promise((ok,fail)=>{server.stdout.on('data',d=>{if(String(d).includes('Local:'))ok();});server.once('exit',()=>fail(Error('Vite exited')));});
  browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'});
  for(const width of [390,1280]){
    const page=await browser.newPage({viewport:{width,height:660}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:'+port+'/'+basename(dir)+'/index.html');
    const button=name=>page.getByRole('button',{name,exact:true});
    await button('Undo return').click();await button('Cancel').click();await button('Undo return').click();
    await page.getByLabel('Recovery code').fill('wrong');await button('Restore rental').click();
    await page.getByRole('alert').filter({hasText:'Incorrect'}).waitFor();
    const originTab = width === 390 ? 'needs_action' : 'returns_today';
    await page.evaluate(tab => { window.originTab = tab; }, originTab);
    await page.getByLabel('Recovery code').fill('test-ok');await button('Restore rental').click();await page.waitForFunction(tab=>window.undo===tab,originTab);
    await button('Review unused rental for removal').click();await button('Delete draft permanently').click();
    await page.waitForFunction(()=>window.removed==='delete');
    await button('Preview customer balance email').click();await page.getByText('To renter@example.invalid').waitFor();
    await button('Send balance to customer').click();await button('Check delivery').click();await page.getByText('Delivery status: sent').waitFor();await button('Close preview').click();
    await page.getByText('Vehicle inspection photos',{exact:true}).click();
    for(const stage of ['Pickup photos','Return photos']){
      const region=page.getByRole('region',{name:stage});const picker=page.waitForEvent('filechooser');
      await region.getByRole('button',{name:'Add '+stage.toLowerCase()}).click();
      await (await picker).setFiles({name:'test.png',mimeType:'image/png',buffer:Buffer.from('fixture')});
      await region.getByText(/Uploaded by Jennifer/).waitFor();
      await region.getByRole('button',{name:'View photo'}).click();await region.getByRole('img').waitFor();
      await region.getByRole('button',{name:'Close photo'}).click();
    }
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
