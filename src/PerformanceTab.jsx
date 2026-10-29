import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './lib/supabase.js';
import { performanceTelemetry } from './lib/performance.js';
import { PERFORMANCE_ACTIONS } from './lib/performanceTelemetry.js';
import './performance.css';

const duration = value => value == null ? '—' : value < 1000 ? `${Math.round(value)} ms` : `${(value / 1000).toFixed(2)} s`;
const percent = (part, total) => total ? `${(100 * part / total).toFixed(1)}%` : '—';
const attempts = row => Number(row.successes || 0) + Number(row.errors || 0) + Number(row.timeouts || 0);
const percentile = (row, index) => row?.successes >= (index === 2 ? 100 : 20) ? duration(row.latency_ms?.[index]) : 'Collecting';

export function PerformanceReportView({ report, action, setAction }) {
  const groups = report.groups || [];
  const summary = groups.filter(row => row.kind === 'action');
  const days = groups.filter(row => row.kind === 'day' && row.action === action).sort((a,b) => a.local_day.localeCompare(b.local_day));
  const releases = groups.filter(row => row.kind === 'release' && row.action === action);
  const max = Math.max(PERFORMANCE_ACTIONS[action].target, ...days.map(row => Number(row.latency_ms?.[1] || 0)));
  return <>
    {!summary.length && <div className="performance-empty" role="status"><strong>No measurements for these filters yet.</strong><p>Use Rentals, Archive or Payments, then return here. Completed measurements upload during an idle period, no more than once a minute.</p></div>}
    <div className="performance-cards">{Object.entries(PERFORMANCE_ACTIONS).map(([key, info]) => {
      const row = summary.find(item => item.action === key);
      const enough = row?.successes >= 20;
      const slow = enough && row.latency_ms?.[1] > info.target;
      return <article className={`performance-card ${slow ? 'performance-slow' : ''}`} key={key}>
        <span>{info.label}</span><strong>{row ? percentile(row, 1) : '—'}</strong><small>p95 · target {duration(info.target)}</small>
        <p>{Number(row?.successes || 0)} successful measurements{row && row.successes < 100 ? ' · preliminary' : ''}</p>
        <span className="performance-badge">{!enough ? 'Needs 20 successful measurements' : slow ? 'Above target' : 'Within target'}</span>
      </article>;
    })}</div>
    <div className="performance-table-wrap"><table className="performance-table" aria-label="Performance by action">
      <thead><tr><th>Action</th><th>Completed attempts</th><th>Median</th><th>p95</th><th>p99</th><th>Errors / timeouts</th><th>Failure rate</th><th>Successful within target</th><th>Cancelled / hidden</th></tr></thead>
      <tbody>{summary.map(row => <tr key={row.action}>
        <th scope="row">{PERFORMANCE_ACTIONS[row.action]?.label || row.action}</th><td>{attempts(row)}</td><td>{duration(row.latency_ms?.[0])}</td><td>{percentile(row,1)}</td><td>{percentile(row,2)}</td>
        <td>{row.errors} / {row.timeouts}</td><td>{percent(Number(row.errors)+Number(row.timeouts),attempts(row))}</td><td>{percent(row.within_target,attempts(row))}</td><td>{row.cancelled} / {row.hidden}</td>
      </tr>)}</tbody>
    </table></div>
    <div className="performance-trend-header"><div><h3>Daily trend & releases</h3><p>Days use Connecticut time. Compare releases with the same filters.</p></div><label>Action<select value={action} onChange={event=>setAction(event.target.value)}>{Object.entries(PERFORMANCE_ACTIONS).map(([key,info])=><option key={key} value={key}>{info.label}</option>)}</select></label></div>
    <div className="performance-trends">
      <section aria-label="Daily p95 trend"><h4>Daily p95</h4>{!days.length && <p>No daily observations yet.</p>}{days.map(row => <div className="performance-day" key={row.local_day}>
        <span>{row.local_day}</span><div className="performance-track" aria-hidden="true"><div style={{ width: row.successes >= 20 ? `${Math.min(100, 100 * row.latency_ms[1] / max)}%` : '0%' }}/></div><strong>{percentile(row,1)}</strong><small>{row.successes} successful</small>
      </div>)}</section>
      <section aria-label="Release comparison"><h4>Recent releases</h4><table className="performance-table"><thead><tr><th>Release</th><th>Successful</th><th>p95</th><th>Failures</th></tr></thead><tbody>{releases.map(row => <tr key={row.release}><th scope="row"><code>{row.release}</code></th><td>{row.successes}</td><td>{percentile(row,1)}</td><td>{Number(row.errors)+Number(row.timeouts)}</td></tr>)}</tbody></table>{!releases.length && <p>No release observations yet.</p>}</section>
    </div>
    {report.limited_days?.length > 0 && <p className="form-error" role="status">The collection limit was reached on {report.limited_days.join(', ')} (UTC dates). Measurements are incomplete for those days.</p>}
  </>;
}

export default function PerformanceTab({ canManage = false }) {
  const reportCache = useRef(new Map()).current;
  const [hours,setHours] = useState(24), [device,setDevice] = useState('all'), [cache,setCache] = useState('all'), [mode,setMode] = useState('foreground');
  const [action,setAction] = useState('rental_list'), [revision,setRevision] = useState(0), [saving,setSaving] = useState(false);
  const [state,setState] = useState({ loading:true, data:null, error:'' });
  const key = `${hours}:${device}:${cache}:${mode}`;
  useEffect(() => {
    let current = true;
    const controller = new AbortController();
    const saved = reportCache.get(key);
    if (saved && Date.now()-saved.at < 30_000) { setState({loading:false,data:saved.data,error:''}); return; }
    setState({loading:true,data:null,error:''});
    const deadline = setTimeout(()=>controller.abort(),5000);
    void supabase.rpc('admin_performance_report',{p_hours:hours,p_device:device,p_cache:cache,p_mode:mode}).abortSignal(controller.signal).then(({data,error})=>{
      if (!current) return;
      if (error || !Array.isArray(data?.groups)) throw error || new Error('Incomplete report');
      reportCache.set(key,{at:Date.now(),data});
      if (reportCache.size>8) reportCache.delete(reportCache.keys().next().value);
      setState({loading:false,data,error:''});
    }).catch(()=>{if(current)setState({loading:false,data:null,error:'Performance data could not load. Your rental and payment operations are unaffected.'});}).finally(()=>clearTimeout(deadline));
    return ()=>{current=false;clearTimeout(deadline);controller.abort();};
  },[key,revision,hours,device,cache,mode]);
  const sessionStatus = useMemo(()=>performanceTelemetry.status(),[state,revision]);
  const refresh = ()=>{reportCache.clear();setRevision(value=>value+1);};
  async function toggleCollection() {
    setSaving(true);
    try {
      const {error} = await supabase.rpc('admin_performance_set_enabled',{p_enabled:!state.data.enabled});
      if(error)throw error;
      refresh();
    } catch { setState(current=>({...current,error:'Collection settings could not be saved. Refresh to check the saved state.'})); }
    finally {setSaving(false);}
  }
  return <section className="panel performance-panel" aria-label="Performance dashboard">
    <div className="performance-heading"><div><p className="eyebrow">Real user measurements</p><h3>Performance</h3><p>How long rental views and revenue totals take to become usable.</p></div><button type="button" className="secondary-btn" onClick={refresh} disabled={state.loading}>Refresh measurements</button></div>
    <div className="performance-controls">
      <label>Window<select value={hours} onChange={event=>setHours(Number(event.target.value))}><option value={24}>Last 24 hours</option><option value={168}>Last 7 days</option></select></label>
      <label>Device<select value={device} onChange={event=>setDevice(event.target.value)}><option value="all">All devices</option><option value="desktop">Desktop layout</option><option value="mobile">Mobile layout</option></select></label>
      <label>Data source<select value={cache} onChange={event=>setCache(event.target.value)}><option value="all">All sources</option><option value="network">Network</option><option value="cache">Cached</option><option value="mixed">Mixed cache / network</option></select></label>
      <label>Load type<select value={mode} onChange={event=>setMode(event.target.value)}>{[['foreground','User-facing loads'],['initial','Initial view'],['navigation','Navigation'],['filter','Filter change'],['search','Search'],['load_more','Load more'],['refresh','Manual refresh'],['background','Automatic refresh']].map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
    </div>
    {state.loading && <p role="status">Loading measurements…</p>}
    {state.error && <p className="form-error" role="alert">{state.error}</p>}
    {state.data && <>
      <div className="performance-collection"><span>Collection {state.data.enabled ? 'enabled' : 'paused'} · seven-day retention</span>{canManage && <button type="button" className="secondary-btn" disabled={saving} onClick={toggleCollection}>{saving?'Saving…':state.data.enabled?'Pause collection':'Resume collection'}</button>}</div>
      <PerformanceReportView report={state.data} action={action} setAction={setAction}/>
      <p className="muted">Report generated {new Date(state.data.generated_at).toLocaleString('en-US',{timeZone:'America/New_York'})} ET. Last received: {state.data.last_received_at ? new Date(state.data.last_received_at).toLocaleString('en-US',{timeZone:'America/New_York'})+' ET' : 'none yet'}.</p>
    </>}
    <details className="performance-method"><summary>What these measurements include</summary>
      <p>p95 means 95% of successful measurements took this long or less. Timings include data fetching, retries, processing and a paint opportunity after React commits the result. Navigation/filter/search timers start with the action; initial and automatic loads start when loading begins. Search includes its debounce. This is a browser timing approximation, not a separate database or network trace.</p>
      <p>Revenue totals cover the Made This Month and Made This Year cards. Rental detail timings cover the detail read or cache handoff when interacting with a rental, not every dialog or save. Booking quotes and payment mutations are not instrumented in this version.</p>
      <p>Percentiles use successful measurements directly, never averages of daily percentiles. p95 appears after 20 successes; p99 after 100. Small samples remain preliminary. Failures and timeouts count against the within-target rate. Cancelled actions and actions hidden by switching browser tabs are shown separately and excluded from that rate and latency percentiles. A measurement still unfinished after two minutes is recorded as a timeout.</p>
      <p>Targets are starting objectives, not guaranteed service levels. Device reflects viewport width. Day buckets use receipt time in Connecticut; releases identify the deployed build. Different user workloads and network conditions can still affect comparisons.</p>
      <p>Collection is best effort: up to 20 records per idle upload, at most once per minute per browser, a 100-record memory queue and 5,000 accepted/reserved records per UTC day across the portal. No upload retries, unload requests, customer identifiers, search text, full URLs or payment details are collected. Closing a tab, connection failures and collection limits can omit observations. Paused browsers may take up to 15 minutes to resume sending after collection is re-enabled.</p>
      <p>This browser session: {sessionStatus.queued} queued, {sessionStatus.accepted} accepted, {sessionStatus.dropped} dropped or rejected at the last dashboard update. The report loads only when this tab is opened or its filters/refresh are used; there is no dashboard polling.</p>
    </details>
  </section>;
}
