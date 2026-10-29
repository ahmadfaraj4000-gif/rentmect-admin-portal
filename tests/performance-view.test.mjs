import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';
import { PERFORMANCE_ACTIONS } from '../src/lib/performanceTelemetry.js';
const source=readFileSync(new URL('../src/PerformanceTab.jsx',import.meta.url),'utf8');
const viewSource=source.slice(0,source.indexOf('export default function')).replace(/^import .*;\n/gm,'').replace('export function','function');
const code=(await transformWithOxc(viewSource,'performance.jsx',{jsx:{runtime:'classic'}})).code;
const env=vm.createContext({React,PERFORMANCE_ACTIONS});vm.runInContext(code,env);
const render=groups=>renderToStaticMarkup(React.createElement(env.PerformanceReportView,{report:{groups,limited_days:[]},action:'rental_list',setAction:()=>{}}));
const row={kind:'action',action:'rental_list',successes:100,errors:2,timeouts:3,cancelled:4,hidden:5,within_target:90,latency_ms:[300,900,1800]};
test('empty dashboard shows collection state, never fabricated speed or zero latency',()=>{
  const html=render([]);assert.match(html,/No measurements/);assert.doesNotMatch(html,/0 ms|0\.00 s/);
});
test('small samples do not pretend to establish p95 or p99',()=>{
  const html=render([{...row,successes:2}]);assert.match(html,/Needs 20/);assert.match(html,/Collecting/);assert.doesNotMatch(html,/900 ms|1\.80 s/);
});
test('failure rate includes timeouts and target compliance excludes cancelled/hidden attempts',()=>{
  const html=render([row]);assert.match(html,/900 ms/);assert.match(html,/1\.80 s/);assert.match(html,/4\.8%/);assert.match(html,/85\.7%/);assert.match(html,/4 \/ 5/);
});
