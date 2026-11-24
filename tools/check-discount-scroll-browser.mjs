// Exercise the actual edit dialog with synthetic rentals; no live records are changed.
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = resolve(process.env.ADMIN_TEST_ROOT || '.');
const folder = await mkdtemp(root + '/.rental-edit-test-');
const source = await readFile(root + '/src/main.jsx', 'utf8');
const modal = source.slice(source.indexOf('function ManualRentalDiscountModal('), source.indexOf('function CancelRentalModal('));
const focus = source.slice(source.indexOf('function useDialogFocus('), source.indexOf('class PortalErrorBoundary'));
await writeFile(folder + '/index.html', '<meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div><script type="module" src="./test.jsx"></script>');
await writeFile(folder + '/test.jsx', `import React,{useState,useEffect,useRef} from 'react';import {createRoot} from 'react-dom/client';import {Tag,X,CheckCircle2,AlertTriangle} from 'lucide-react';
import {trackTaskDialog} from '../src/lib/taskDraft.js';
import '../src/styles.css';import '../src/vehicle-editor.css';import '../src/admin-list-details.css';import '../src/emails.css';import '../src/final-overrides.css';import '../src/payment-receipts.css';import '../src/settings-layout.css';
import {MoneyInput} from '../src/MoneyInput.jsx';import {manualDiscountPreviewMatches} from '../src/lib/manualDiscountPreview.js';import {useTaskDraft,DraftOwnerContext} from '../src/useTaskDraft.js';
const money=v=>'$'+Number(v||0).toFixed(2),MONEY_MAX=100000,limitText=(s,n)=>s.slice(0,n);
${focus}\n${modal}
const rental={id:'synthetic',manual_discount_amount:0.25,manual_discount_reason:'Previous discount',rental_total:553,tax_amount:35.12,security_deposit:400,profiles:{full_name:'Test Customer'},vehicles:{name:'Test Vehicle'}};
createRoot(document.getElementById('root')).render(<DraftOwnerContext.Provider value="test"><ManualRentalDiscountModal rental={rental} onCancel={()=>{}} onApply={async(r,f)=>{(window.applied ||= []).push(f);return true}} onPreview={async(r,f)=>({rental_id:r.id,mode:f.mode,manual_discount_value:Number(f.value),pre_manual_discount_rental_total:553,manual_discount_amount:317.93,tax_amount:14.93,security_deposit:400,new_total:650,net_paid:0,total_balance_due:650})}/></DraftOwnerContext.Provider>);`);
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
    const dialog=page.getByRole('dialog');
    await dialog.waitFor();
    await page.getByRole('button',{name:'Desired balance due',exact:true}).click();
    await page.getByLabel('Desired balance due, including tax',{exact:true}).fill('650');
    await page.getByText('New balance due',{exact:true}).waitFor();
    assert.ok(await page.locator('.manual-discount-preview').innerText().then(t=>t.includes('$650.00')));
    assert.equal(await dialog.evaluate(el=>getComputedStyle(el).overflowY),'auto');
    assert.ok(await dialog.evaluate(el=>el.scrollHeight>el.clientHeight),'Long form needs scrolling');
    await dialog.hover();
    await page.mouse.wheel(0,3000);
    await page.waitForFunction(()=>document.querySelector('[role="dialog"]').scrollTop>0);
    const cancel=page.getByRole('button',{name:'Cancel',exact:true});
    await cancel.scrollIntoViewIfNeeded();
    const bounds=await cancel.boundingBox();
    assert.ok(bounds.y>=0 && bounds.y+bounds.height<=viewport.height,'Bottom action stays reachable');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');
    assert.equal(await cancel.evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
    const remove=dialog.getByRole('button',{name:'Remove $0.25 discount',exact:true});
    assert.equal(await remove.evaluate(el=>!!el.closest('.manual-discount-current')),true);
    await remove.click();
    await dialog.getByText('Remove manual discount',{exact:true}).waitFor();
    await dialog.getByText('New reservation total',{exact:true}).waitFor();
    const confirm=dialog.getByRole('button',{name:'Confirm removal of $0.25',exact:true});
    assert.ok(await confirm.isDisabled());
    await dialog.getByRole('textbox').fill('Correcting a duplicate manual discount');
    assert.ok(await confirm.isEnabled());
    assert.equal(await confirm.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(168, 43, 49)');
    assert.equal(await page.evaluate(()=>window.applied?.length||0),0);
    await confirm.click();
    await page.waitForFunction(()=>window.applied?.length===1);
    assert.equal(await page.evaluate(()=>window.applied[0].mode),'remove');
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('PASS: discount popup calculates target and scrolls to bottom controls on desktop, tablet and phone.');
} finally {
  await browser?.close();
  server.kill();
  await rm(folder, { recursive: true, force: true });
}
