// Exercise production row callbacks, tab navigation, Rentals rendering and workspace
// reads together. Only RPC data and unrelated card controls are synthetic.
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = resolve(process.env.ADMIN_TEST_ROOT || '.');
const source = await readFile(process.env.ADMIN_NAV_SOURCE_FILE || root + '/src/main.jsx', 'utf8');
const between = (start, end) => {
  const from = source.indexOf(start);
  assert.ok(from >= 0, start);
  const until = source.indexOf(end, from + start.length);
  assert.ok(until > from, end);
  return source.slice(from, until);
};
const navigation = between(source.includes('  function openRentalCard(') ? '  function openRentalCard(' : '  function selectAdminTab(', '  useEffect(() => {');
const callback = name => {
  const line = source.split('\n').find(line => line.includes(`<${name} `) && line.includes('onOpenRental='));
  return line.match(/onOpenRental=\{(.+)\} \/>/)[1];
};
const components = [
  between('function Dashboard(', 'function DepositActionPanel('),
  between('function ReturnMonitorRow(', 'function rentalActivityDescription('),
  between('function Rentals(', 'function Customers('),
].join('\n');
const folder = await mkdtemp(root + '/.rental-navigation-check-');
await writeFile(folder + '/index.html', '<meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div><script type="module" src="./check.jsx"></script>');
await writeFile(folder + '/check.jsx', `
import React,{useState,useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {Car,AlertTriangle,Wrench,Banknote,CreditCard,CheckCircle2,FileText,XCircle,Search} from 'lucide-react';
import {useRentalWorkspace} from '../src/useRentalWorkspace.js';
import {performanceTelemetry} from '../src/lib/performance.js';
import '../src/styles.css';import '../src/final-overrides.css';
const rows=Array.from({length:35},(_,i)=>({id:'overdue-'+i,customer_name:'Customer '+i,vehicle_name:'Vehicle '+i,status:'overdue',return_date:'2020-01-01',return_time:'5:00 PM',profiles:{full_name:'Customer '+i},vehicles:{name:'Vehicle '+i}}));
window.reads=[];
const client={rpc:async(name,args)=>{window.reads.push({name,args});await new Promise(r=>setTimeout(r,20));
 if(name==='admin_rental_list'){const found=args.p_rental_id?rows.filter(r=>r.id===args.p_rental_id):rows;return {data:{rows:found.slice(args.p_offset,args.p_offset+args.p_limit),total:found.length,counts:{},offset:0}};}
 if(name==='admin_rental_detail')return {data:{rental:rows.find(r=>r.id===args.p_rental_id)}};
 if(name==='admin_rental_details')return {data:args.p_rental_ids.map(id=>({rental:rows.find(r=>r.id===id)}))};
 throw Error(name);}};
const Panel=({title,children})=><section><h2>{title}</h2>{children}</section>,Metric=()=>null,DepositActionPanel=()=>null,ReminderMenu=()=>null;
const RentalRow=({rental,onCloseDetails})=><article data-rental-id={rental.id}><h3>{rental.profiles.full_name}</h3><p>{rental.vehicles.name}</p><button onClick={onCloseDetails}>Hide rental details</button></article>;
const isToday=()=>false,getLateReturnState=()=>({overdue:true,hardLocked:true}),formatRentalDate=(d,t)=>d+' '+t,prettyStatus=s=>s,money=n=>'$'+n;
const rentalFilterOptions=()=>[{key:'needs_action',label:'Needs action'},{key:'archive',label:'Archive'}],limitText=(s,n)=>s.slice(0,n);
${components}
function App(){
 const [activeTab,setActiveTab]=useState(new URLSearchParams(location.search).get('source')||'dashboard');
 const [manualBookingFocusId,setManualBookingFocusId]=useState('');
 const [rentalFilter,setRentalFilter]=useState('all'),[search,setSearch]=useState('');
 const [loaded,setLoaded]=useState({});
 const isMobileAdminNav=innerWidth<600,setNavCollapsed=()=>{};
 const rentalWorkspace=useRentalWorkspace({client,enabled:activeTab==='rentals',userId:'test-staff',filter:rentalFilter,search,focusId:manualBookingFocusId,
   hydrate:data=>setLoaded(current=>({...current,[data.rental.id]:data.rental})),prepareDetails:async()=>{}});
 window.refreshRentals=()=>rentalWorkspace.refresh();
 ${navigation}
 const dashboardOpen=(${callback('Dashboard')}),queueOpen=(${callback('OperationsQueue')});
 return <>
 {activeTab==='dashboard'&&<Dashboard snapshot={{overdue_rentals:rows,due_soon_rentals:[]}} dashboard={{active:[],overdue:rows,dueSoon:[]}} vehicles={[]} onOpenRental={dashboardOpen}/>}
 {activeTab==='queue'&&<OperationsQueue queue={rows.map(r=>({id:r.id,bucket:'return_attention',severity:'critical',title:'Overdue',subtitle:r.profiles.full_name,rental:r}))} onOpenRental={queueOpen}/>}
 {activeTab==='rentals'&&<Rentals manager={rentalWorkspace} rentals={Object.values(loaded)} focusRentalId={manualBookingFocusId} clearRentalFocus={()=>setManualBookingFocusId('')}
   search={search} setSearch={setSearch} rentalFilter={rentalFilter} setRentalFilter={setRentalFilter} rentalPayments={[]} extensionRequests={[]} vehicles={[]} reports={[]} documentsByRentalId={{}}/>}
 </>;
}
createRoot(document.getElementById('root')).render(<App/>);
`);
const server = spawn(process.execPath, [root + '/node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5197', '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
let browser;
let serverOutput = '';
server.stdout.on('data', chunk => { serverOutput += chunk.toString(); });
server.stderr.on('data', chunk => { serverOutput += chunk.toString(); });
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error('Navigation fixture server exited: ' + serverOutput);
    try { await fetch('http://127.0.0.1:5197', { signal: AbortSignal.timeout(1000) }); ready = true; break; }
    catch { await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  assert.ok(ready, 'Navigation fixture server did not become ready: ' + serverOutput);
  console.log('Navigation fixture server ready; starting browser checks.');
  browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL === 'chromium' ? undefined : process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
  for (const viewport of [{ width: 1366, height: 768 }, { width: 390, height: 720 }]) {
    const page = await browser.newPage({ viewport });
    page.setDefaultTimeout(5000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const origin of ['dashboard', 'queue']) for (let i = 0; i < 5; i++) {
      await page.goto('http://127.0.0.1:5197/' + folder.split('/').at(-1) + '/index.html?source=' + origin);
      await page.getByRole('button', { name: 'View rental', exact: true }).nth(i).click();
      await page.locator('[data-rental-id="overdue-' + i + '"]').waitFor();
      assert.equal(await page.locator('[data-rental-id]').count(), 1, 'Only the clicked rental card is rendered');
      assert.equal(await page.getByRole('button', { name: 'Show All Rentals' }).count(), 1);
      const reads = await page.evaluate(() => window.reads);
      assert.ok(reads.some(r => r.name === 'admin_rental_detail' && r.args.p_rental_id === 'overdue-' + i));
      assert.ok(reads.filter(r => r.name === 'admin_rental_list').every(r => r.args.p_rental_id === 'overdue-' + i), 'Navigation must not fall back to a general rental list');
      await page.getByRole('button', { name: 'Show All Rentals' }).click();
      await page.waitForFunction(() => document.querySelectorAll('[data-rental-id]').length === 25);
    }
    await page.goto('http://127.0.0.1:5197/' + folder.split('/').at(-1) + '/index.html?source=rentals');
    await page.getByRole('button', { name: 'Show rental details', exact: true }).first().waitFor();
    assert.equal(await page.locator('[data-rental-id]').count(), 25);
    assert.equal((await page.evaluate(() => window.reads)).filter(r => r.name !== 'admin_rental_list').length, 0);
    await page.getByRole('button', { name: 'Show rental details', exact: true }).nth(2).click();
    await page.getByRole('button', { name: 'Hide rental details' }).waitFor();
    assert.deepEqual((await page.evaluate(() => window.reads)).filter(r => r.name === 'admin_rental_detail').map(r => r.args.p_rental_id), ['overdue-2']);
    await page.getByRole('button', { name: 'Load 25 more rentals' }).click();
    await page.waitForFunction(() => document.querySelectorAll('[data-rental-id]').length === 35);
    assert.deepEqual((await page.evaluate(() => window.reads)).filter(r => r.name === 'admin_rental_list').map(r => r.args.p_offset), [0,25]);
    await page.getByRole('button', { name: 'Hide rental details' }).click();
    await page.evaluate(() => window.refreshRentals());
    assert.equal((await page.evaluate(() => window.reads)).filter(r => r.name === 'admin_rental_detail').length, 1);
    assert.equal(await page.getByRole('button', { name: 'Show rental details', exact: true }).count(), 35);
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('PASS: all five overdue rows open only their exact rental from Dashboard and Return Attention on desktop and mobile; selected details load, collapsed cards make no detail reads, and Load more reads only the next page.');
} finally {
  await browser?.close();
  server.kill();
  await rm(folder, { recursive: true, force: true });
}
