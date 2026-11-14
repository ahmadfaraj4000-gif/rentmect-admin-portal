// Exercise the actual edit dialog with synthetic rentals; no live records are changed.
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = resolve(process.env.ADMIN_TEST_ROOT || '.');
const folder = await mkdtemp(root + '/.rental-edit-test-');
const source = await readFile(root + '/src/main.jsx', 'utf8');
const modal = source.slice(source.indexOf('function RentalAmendmentModal('), source.indexOf('function AdminBookingProcedure('));
const focus = source.slice(source.indexOf('function useDialogFocus('), source.indexOf('class PortalErrorBoundary'));
const times = source.slice(source.indexOf('function calendarTimeOptions('), source.indexOf("createRoot(document.getElementById('root'))"));
await writeFile(folder + '/index.html', '<meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div><script type="module" src="./test.jsx"></script>');
await writeFile(folder + '/test.jsx', `import React,{useState,useEffect,useRef} from 'react';import {createRoot} from 'react-dom/client';import {CalendarClock,ShieldCheck,XCircle,CheckCircle2,ArrowRight,ReceiptText,FileSignature,AlertTriangle} from 'lucide-react';
import {MoneyInput} from '../src/MoneyInput.jsx';import {useTaskDraft,DraftOwnerContext} from '../src/useTaskDraft.js';import {trackTaskDialog} from '../src/lib/taskDraft.js';import {tripStartIsLocked,replacementRentalForm} from '../src/lib/rentalTripStart.js';import {isReturnWindowExtended} from '../src/lib/lateFeePolicy.js';import '../src/styles.css';import '../src/final-overrides.css';
const MONEY_MAX=100000,money=n=>'$'+Number(n||0).toFixed(2),prettyStatus=s=>s,formatRentalDate=(d,t)=>d+' '+t;
${focus}\n${modal}\n${times}
const rental={id:'edit-test',vehicle_id:'car',pickup_date:'2026-11-08',pickup_time:'5:00 PM',return_date:'2026-11-10',return_time:'2:30 PM',security_deposit:300,base_rental_total:148,status:'documents_needed',vehicles:{name:'Synthetic car',daily_rate:74},profiles:{full_name:'Synthetic Customer'}};
function App(){const[done,setDone]=useState(false);return done?<p role="status">Rental saved</p>:<RentalAmendmentModal rental={rental} vehicles={[{id:'car',name:'Synthetic car',daily_rate:74}]} onCancel={()=>setDone(true)} onPreview={async(r,form)=>{if(window.failReview)throw new Error('Availability could not be checked. Retry review.');window.reviewed=form;return {old:{...r,vehicle_name:r.vehicles.name},new:{...r,return_date:form.returnDate,security_deposit:Number(form.securityDeposit),vehicle_name:r.vehicles.name}}}} onApply={async(r,form)=>{window.saved=form;return true}}/>};createRoot(document.getElementById('root')).render(<DraftOwnerContext.Provider value="test"><App/></DraftOwnerContext.Provider>);`);
const server = spawn(process.execPath, [root + '/node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5196', '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
let browser;
try {
  // Vite suppresses its interactive Local banner in CI. Probe the actual server.
  const deadline = Date.now() + 30_000;
  for (;;) {
    if (server.exitCode !== null) throw Error('Vite exited before the fixture was ready');
    try { const response = await fetch('http://127.0.0.1:5196'); if (response.status < 500) break; } catch { /* Starting. */ }
    if (Date.now() > deadline) throw Error('Vite fixture startup timed out');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL === 'chromium' ? undefined : process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
  for (const viewport of [{ width: 1366, height: 768 }, { width: 800, height: 600 }, { width: 390, height: 720 }]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('pageerror', error => { errors.push(error.message); console.error('BROWSER:',error.message); });
    await page.goto('http://127.0.0.1:5196/' + folder.split('/').at(-1) + '/index.html');
    await page.getByLabel('Return date', { exact: true }).fill('2026-11-12');
    await page.getByLabel('Security deposit').fill('250.00');
    await page.getByText('Admin notes (optional)', { exact: true }).click();
    await page.getByLabel('Admin notes', { exact: true }).fill('Changed Rental Date');
    await page.getByRole('button', { name: 'Review Changes', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Admin notes do not replace the required reason' }).waitFor();
    assert.equal(await page.evaluate(() => window.reviewed), undefined);
    const reason = page.getByLabel('Reason for change (required)', { exact: true });
    await reason.fill('x');
    await page.evaluate(() => { window.failReview = true; });
    await page.getByRole('button', { name: 'Review Changes', exact: true }).click();
    const alert = page.getByRole('alert').filter({ hasText: 'Availability could not be checked' });
    await alert.waitFor();
    const alertBox = await alert.boundingBox();
    assert.ok(alertBox.y >= 0 && alertBox.y + alertBox.height <= viewport.height, 'Review errors stay visible');
    assert.equal(await page.getByLabel('Return date', { exact: true }).isEditable(), true);
    assert.equal(await page.getByLabel('Security deposit').isEditable(), true);
    await page.evaluate(() => { window.failReview = false; });
    await page.getByRole('button', { name: 'Review Changes', exact: true }).click();
    await page.getByRole('button', { name: 'Apply Rental Changes', exact: true }).waitFor();
    const reviewed = await page.evaluate(() => window.reviewed);
    assert.equal(reviewed.returnDate, '2026-11-12');
    assert.equal(reviewed.securityDeposit, '250.00');
    // A subsequent edit must invalidate the earlier review.
    await page.getByLabel('Security deposit').fill('275.00');
    assert.equal(await page.getByRole('button', { name: 'Apply Rental Changes', exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Review Changes', exact: true }).click();
    await page.getByRole('button', { name: 'Apply Rental Changes', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Rental saved' }).waitFor();
    const saved = await page.evaluate(() => window.saved);
    assert.equal(saved.returnDate, '2026-11-12');
    assert.equal(saved.securityDeposit, '275.00');
    assert.equal(saved.adminNotes, 'Changed Rental Date');
    assert.equal(saved.reason, 'x');
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('PASS: return/deposit edits, required reason versus optional notes, visible review errors, retry, re-review after edits and apply payload on desktop, small screen and mobile.');
} finally {
  await browser?.close();
  server.kill();
  await rm(folder, { recursive: true, force: true });
}
