// Exercise the actual edit dialog with synthetic rentals; no live records are changed.
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = resolve(process.env.ADMIN_TEST_ROOT || '.');
const folder = await mkdtemp(root + '/.rental-edit-test-');
const source = await readFile(root + '/src/main.jsx', 'utf8');
const modal = source.slice(source.indexOf('function VehicleSwapModal('), source.indexOf('function RentalAmendmentModal('));
const focus = source.slice(source.indexOf('function useDialogFocus('), source.indexOf('class PortalErrorBoundary'));
const parseDates = source.slice(source.indexOf('function parseBookingDateTime('),source.indexOf('function localDateInput('));
const dateInputs = source.slice(source.indexOf('function formatEasternDateTimeInput('), source.indexOf('function bookingProviderLabel('));
const times = source.slice(source.indexOf('function calendarTimeOptions('), source.indexOf("createRoot(document.getElementById('root'))"));
await writeFile(folder + '/index.html', '<meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div><script type="module" src="./test.jsx"></script>');
await writeFile(folder + '/test.jsx', `import React,{useState,useEffect,useRef} from 'react';import {createRoot} from 'react-dom/client';import {Car,X,CalendarClock,ShieldCheck,XCircle,CheckCircle2,ArrowRight,ReceiptText,FileSignature,AlertTriangle} from 'lucide-react';
import {MoneyInput} from '../src/MoneyInput.jsx';import {useTaskDraft,DraftOwnerContext} from '../src/useTaskDraft.js';import {trackTaskDialog} from '../src/lib/taskDraft.js';import {tripStartIsLocked,replacementRentalForm} from '../src/lib/rentalTripStart.js';import {isReturnWindowExtended} from '../src/lib/lateFeePolicy.js';import '../src/styles.css';import '../src/final-overrides.css';
import {returnMileageContext} from '../src/lib/rentalMileage.js';import {useVehicleAvailability} from '../src/useVehicleAvailability.js';import {swapTimeMessage,swapAvailabilityStart,swapAvailabilityLabel} from '../src/lib/rentalSwapTime.js';
const supabase={rpc:async(name,args)=>{if(name!=='admin_rental_vehicle_availability')return {data:{daily_rate:54}};window.checks=(window.checks||[]).concat([args]);await new Promise(r=>setTimeout(r,100));return window.failAvailability?{error:new Error('Offline test')}:{data:[{vehicle_id:'replacement',available:true}]}}};
function RentalAvailabilityNotice({availability}){return <p role='status'>{availability.loading?'Checking availability':availability.error||'Availability loaded'}</p>}
const formatEasternDateTime=v=>v||'',MILEAGE_MAX=9999999;
const MONEY_MAX=100000,money=n=>'$'+Number(n||0).toFixed(2),prettyStatus=s=>s,formatRentalDate=(d,t)=>d+' '+t;
${focus}\n${parseDates}\n${dateInputs}\n${modal}\n${times}
const rental={id:'swap-test',vehicle_id:'car',pickup_date:'2026-11-24',pickup_time:'9:00 AM',return_date:'2026-11-26',return_time:'9:00 AM',vehicles:{name:'Synthetic car',daily_rate:54}};
createRoot(document.getElementById('root')).render(<DraftOwnerContext.Provider value="test"><VehicleSwapModal rental={rental} vehicles={[{id:'replacement',name:'Replacement car',daily_rate:54}]} onCancel={()=>{}}/></DraftOwnerContext.Provider>);`);
const server = spawn(process.execPath, [root + '/node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5197', '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
let browser;
try {
  // Vite suppresses its interactive Local banner in CI. Probe the actual server.
  const deadline = Date.now() + 30_000;
  for (;;) {
    if (server.exitCode !== null) throw Error('Vite exited before the fixture was ready');
    try { const response = await fetch('http://127.0.0.1:5197'); if (response.status < 500) break; } catch { /* Starting. */ }
    if (Date.now() > deadline) throw Error('Vite fixture startup timed out');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL === 'chromium' ? undefined : process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
  for (const viewport of [{ width: 1366, height: 768 }, { width: 800, height: 600 }, { width: 390, height: 720 }]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('pageerror', error => { errors.push(error.message); console.error('BROWSER:',error.message); });
    await page.goto('http://127.0.0.1:5197/' + folder.split('/').at(-1) + '/index.html');
    const time=page.getByLabel('Actual swap time (Eastern)',{exact:true});
    await time.waitFor();
    assert.equal(await page.getByLabel('When are the vehicles being exchanged?').inputValue(),'custom');
    const vehicle=page.locator('select[required]');
    await page.waitForFunction(()=>document.querySelector('option[value="replacement"]')?.textContent.includes('— Available'));
    await time.fill('2026-11-25T12:00:00');
    await page.waitForFunction(()=>window.checks?.at(-1)?.p_from==='2026-11-25T17:00:00.000Z');
    await page.waitForFunction(()=>!document.querySelector('select[required]').disabled);
    const out=await page.getByLabel('Outgoing vehicle return odometer').boundingBox();
    const incoming=await page.getByLabel('Replacement vehicle pickup odometer').boundingBox();
    if(viewport.width>640)assert.ok(Math.abs(out.y-incoming.y)<2,'Odometers share one row');
    else assert.ok(incoming.y>out.y,'Phone fields stack');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');
    await page.evaluate(()=>{window.failAvailability=true});
    await page.getByRole('button',{name:'Recheck availability',exact:true}).click();
    await page.getByRole('status').filter({hasText:'Offline test'}).waitFor();
    assert.equal(await vehicle.isDisabled(),true);
    await page.evaluate(()=>{window.failAvailability=false});
    await page.getByRole('button',{name:'Recheck availability',exact:true}).click();
    await page.waitForFunction(()=>!document.querySelector('select[required]').disabled);
    await page.locator('.rental-amendment-scroll').evaluate(el=>{el.scrollTop=0});
    await page.screenshot({path:'/tmp/swap-layout-'+viewport.width+'.png',fullPage:true});
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('PASS: swap layout, manual time default, availability reload and retry on desktop, tablet and phone.');
} finally {
  await browser?.close();
  server.kill();
  await rm(folder, { recursive: true, force: true });
}
