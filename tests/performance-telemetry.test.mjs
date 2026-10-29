import test from 'node:test';
import assert from 'node:assert/strict';
import { createPerformanceCollector, PERFORMANCE_LIMITS, performanceOutcome } from '../src/lib/performanceTelemetry.js';
import { createRentalWorkspace } from '../src/lib/rentalWorkspace.js';
import { createPortalTransport, describeRequest } from '../src/lib/portalTransport.js';

function harness(overrides = {}) {
  let clock = 0, counter = 0, shown = true;
  const timers = new Map(), frames = new Map(), sent = [];
  const collector = createPerformanceCollector({
    now: () => clock, uuid: () => `00000000-0000-4000-8000-${String(++counter).padStart(12,'0')}`,
    setTimer: (fn,delay) => {const id=++counter;timers.set(id,{fn,at:clock+delay,delay});return id;},
    clearTimer: id => timers.delete(id),
    frame: fn => {const id=++counter;frames.set(id,fn);return id;}, cancelFrame: id => frames.delete(id),
    scheduleIdle: fn => {fn();return ()=>{};}, visible: () => shown,
    send: async batch => {sent.push(batch);return {accepted:batch.length,enabled:true};}, release:'abcdef123456', ...overrides,
  });
  collector.setOwner('staff-a');
  return {collector,timers,frames,sent,
    time: ms => {clock=ms;}, hidden: () => {shown=false;collector.visibilityChanged();},
    paint: () => {const work=[...frames.values()];frames.clear();work.forEach(fn=>fn());},
    finish: (action='rental_list', outcome='success', duration=100) => {const token=collector.start(action);clock+=duration;collector.finish(token,outcome);return token;},
  };
}

test('capturing and painting never sends a request on the critical path; intent includes dispatch time', async () => {
  const h=harness();h.time(10);h.collector.intent('rental_list','navigation');h.time(30);
  const token=h.collector.start('rental_list');h.time(300);h.collector.afterPaint(token);
  assert.equal(h.collector.status().queued,0);assert.equal(h.sent.length,0);
  h.paint();assert.equal(h.collector.status().queued,0);
  h.time(320);h.paint();assert.equal(h.collector.status().queued,1);assert.equal(h.sent.length,0);
  assert.ok([...h.timers.values()].some(timer=>timer.delay===60_000));
  await h.collector.flush();assert.equal(h.sent[0][0].duration_ms,310);assert.equal(h.sent[0][0].mode,'navigation');
});

test('100-record memory bound, 20-record upload bound, and explicit metadata allowlist', async () => {
  const h=harness();for(let i=0;i<125;i++)h.finish();
  assert.equal(h.collector.status().queued,100);assert.equal(h.collector.status().dropped,25);
  await h.collector.flush();assert.equal(h.sent[0].length,20);assert.equal(h.collector.status().queued,80);
  assert.deepEqual(Object.keys(h.sent[0][0]).sort(),['id','action','mode','cache','outcome','duration_ms','device','release'].sort());
});

test('business requests and active measurements defer collection', async () => {
  const h=harness();h.finish();h.collector.networkActivity(1);await h.collector.flush();assert.equal(h.sent.length,0);
  h.collector.networkActivity(-1);const token=h.collector.start('rental_archive');await h.collector.flush();assert.equal(h.sent.length,0);
  h.collector.finish(token);await h.collector.flush();assert.equal(h.sent.length,1);
});

test('failed batches are dropped, never replayed or thrown into business operations', async () => {
  let calls=0;const h=harness({send:async()=>{calls++;throw Error('offline');}});h.finish();
  await h.collector.flush();await h.collector.flush();assert.equal(calls,1);assert.equal(h.collector.status().dropped,1);assert.equal(h.collector.status().queued,0);
});

test('hidden and superseded journeys are distinct from success; completion happens once', async () => {
  const h=harness();const old=h.collector.start('rental_list');const next=h.collector.start('rental_list');
  h.collector.finish(old);h.collector.finish(next);h.collector.finish(next);
  assert.equal(h.collector.status().queued,2);await h.collector.flush();
  assert.deepEqual(h.sent[0].map(event=>event.outcome),['cancelled','success']);
  h.collector.start('rental_archive');h.hidden();assert.equal(h.collector.status().active,0);assert.equal(h.collector.start('rental_list'),null);
  assert.equal(h.collector.status().queued,1);await h.collector.flush();assert.equal(h.sent.length,1);
});

test('hung measurements hit a bounded deadline and are counted as timeouts', async () => {
  const h=harness();h.collector.start('payment_totals');h.time(PERFORMANCE_LIMITS.timeoutMs);
  const timeout=[...h.timers.values()].find(timer=>timer.delay===PERFORMANCE_LIMITS.timeoutMs);timeout.fn();
  await h.collector.flush();assert.equal(h.sent[0][0].outcome,'timeout');assert.equal(h.sent[0][0].duration_ms,120000);
});

test('sign-out clears queue, intents, timers and active measurements without leaking to next account', async () => {
  const h=harness();h.finish();h.collector.intent('rental_archive');h.collector.start('rental_detail');
  h.collector.setOwner('');assert.deepEqual(h.collector.status(),{queued:0,accepted:0,dropped:0,active:0,sending:false});
  assert.equal(h.timers.size,0);assert.equal(h.collector.start('rental_list'),null);
  h.collector.setOwner('staff-b');h.finish('rental_archive');await h.collector.flush();assert.equal(h.sent[0][0].mode,'background');
});

test('disabled collection backs off rather than polling the database', async () => {
  let calls=0;const h=harness({send:async()=>{calls++;return {accepted:0,enabled:false};}});
  h.finish();await h.collector.flush();h.finish();await h.collector.flush();assert.equal(calls,1);
  h.time(16*60_000);await h.collector.flush();assert.equal(calls,2);
});

test('telemetry failures create no uncertain-write records; real writes retain protection', async () => {
  const activity=[];const transport=createPortalTransport({fetch:async()=>{throw Error('offline');},onActivity:value=>activity.push(value)});
  transport.setOwner('staff');const url='https://example.test/rest/v1/rpc/admin_record_performance';
  assert.equal(describeRequest(url,{method:'POST'}).background,true);
  await assert.rejects(transport.fetch(url,{method:'POST'}));assert.equal(transport.snapshot().length,0);assert.deepEqual(activity,[]);
  await assert.rejects(transport.fetch('https://example.test/rest/v1/rpc/admin_performance_report',{method:'POST'}));
  assert.equal(transport.snapshot().length,0);assert.deepEqual(activity,[1,-1]);
  await assert.rejects(transport.fetch('https://example.test/rest/v1/rpc/admin_performance_set_enabled',{method:'POST'}));
  assert.equal(transport.snapshot().length,1);
});

test('rental measurements complete after hydration, keep caching, and do not add reads', async () => {
  const observed=[],hydrated=[];let reads=0;
  const workspace=createRentalWorkspace({inline:true,readList:async()=>{reads++;return {rows:[{id:'r1'}],total:1};},
    readDetails:async ids=>{reads++;return ids.map(id=>({rental:{id}}));},hydrate:data=>hydrated.push(data),changed:state=>{if(state.listPerformance)assert.equal(hydrated.length>0,true);},
    observe:{start:(action)=>({action}),cache:(token,value)=>observed.push(value)}});
  await workspace.list({filter:'archive'});assert.equal(reads,2);assert.equal(workspace.getState().listPerformance.outcome,'success');
  await workspace.list({filter:'archive'});assert.equal(reads,2);assert.deepEqual(observed,['network','cache']);
});

test('an observation exception cannot turn a successful rental read into a failure', async () => {
  const workspace=createRentalWorkspace({inline:true,readList:async()=>({rows:[],total:0}),hydrate:()=>{},changed:()=>{},observe:{start:()=>{throw Error('observer failed');}}});
  await workspace.list({filter:'archive'});assert.equal(workspace.getState().error,'');assert.equal(workspace.getState().loading,false);
});

test('timeout classification uses error types without retaining private messages',()=>{
  assert.equal(performanceOutcome(new Error('Rental details request timed out after 9 seconds.')),'timeout');
  assert.equal(performanceOutcome(new Error('Customer private text')),'error');
});
