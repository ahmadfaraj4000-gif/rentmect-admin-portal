import React, { useEffect, useState } from 'react';

export const DOCUMENT_SUMMARY_COLUMNS = 'id,user_id,rental_id,document_type,insurance_coverage_type,extension_request_id,status,created_at,profiles!rental_documents_user_id_profiles_fkey(full_name),rentals(vehicles(name))';

export function useHistoryPage(read, key, revision) {
  const [state, setState] = useState({ rows: [], loading: true, error: '', has_more: false });
  useEffect(() => {
    const controller = new AbortController();
    setState({ rows: [], loading: true, error: '', has_more: false });
    Promise.resolve().then(() => read(controller.signal)).then(data => {
      if (!controller.signal.aborted) setState({ ...data, loading: false, error: '' });
    }).catch(error => {
      if (!controller.signal.aborted) setState({ rows: [], loading: false, error: error.message || 'History could not load.', has_more: false });
    });
    return () => controller.abort();
  }, [key, revision]);
  return state;
}

export function PageControls({ state, offset, setOffset, refresh }) {
  return <div className="row-actions">
    <button disabled={state.loading || offset === 0} onClick={() => setOffset(Math.max(0, offset - 50))}>Previous</button>
    <span>{state.loading ? 'Loading…' : state.rows.length ? `${offset + 1}–${offset + state.rows.length}` : 'No matching records'}</span>
    <button disabled={state.loading || !state.has_more} onClick={() => setOffset(offset + 50)}>Next</button>
    <button disabled={state.loading} onClick={refresh}>Refresh</button>
    {state.error && <p role="alert" className="form-error">{state.error}</p>}
  </div>;
}

export function LazyHistoryDetail({ id, read, children }) {
  const [open, setOpen] = useState(false);
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState({ loading: false });
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setState({ loading: true });
    Promise.resolve().then(() => read(controller.signal)).then(data => {
      if (!data) throw new Error('This record is no longer available. Refresh the list.');
      if (!controller.signal.aborted) setState({ data });
    }).catch(error => { if (!controller.signal.aborted) setState({ error: error.message }); });
    return () => controller.abort();
  }, [id, open, retry]);
  return <div>
    <button aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? 'Hide details' : 'Show more details'}</button>
    {open && (state.loading ? <p>Loading details…</p> : state.error ? <p role="alert">{state.error} <button onClick={() => setRetry(value => value + 1)}>Retry</button></p> : state.data && children(state.data, () => setRetry(value => value + 1)))}
  </div>;
}

export function AuditHistory({ client, revision = 0, Panel, prettyStatus, actionLabel }) {
  const [filters, setFilters] = useState({ search: '', actor: '', entity: '', action: '' });
  const [query, setQuery] = useState(filters);
  const [offset, setOffset] = useState(0);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => { const timer = setTimeout(() => { setQuery(filters); setOffset(0); }, 300); return () => clearTimeout(timer); }, [filters]);
  const key = JSON.stringify([query, offset]);
  const state = useHistoryPage(async signal => {
    const { data, error } = await client.rpc('admin_audit_history_page', {
      p_search: query.search, p_actor: query.actor, p_entity: query.entity, p_action: query.action, p_offset: offset,
    }).abortSignal(signal);
    if (error) throw error;
    return data;
  }, key, `${revision}:${refresh}`);
  return <Panel title="Staff Activity" eyebrow="Audit Log">
    <p className="muted">Search all recorded actions. Detailed changes load when opened.</p>
    <div className="audit-filters">{[['search', 'Search staff, action, record ID'], ['actor', 'Staff email or ID'], ['entity', 'Record type (exact)'], ['action', 'Action (exact)']].map(([name, label]) =>
      <label key={name}>{label}<input aria-label={label} value={filters[name]} maxLength={160} onChange={event => setFilters(current => ({ ...current, [name]: event.target.value }))}/></label>)}</div>
    <PageControls state={state} offset={offset} setOffset={setOffset} refresh={() => setRefresh(value => value + 1)}/>
    <div className="table-list audit-list">{state.rows.map(log => <article className="data-row audit-row" key={log.id}>
      <div className="audit-row-main"><strong>{actionLabel(log.action)}</strong><span>{log.actor_email || 'System process'} • {prettyStatus(log.actor_role || '')}</span>
        <small>{prettyStatus(log.entity_type)} • {log.entity_id}</small><small>Changed: {(log.changed_fields || []).map(prettyStatus).join(', ')}</small></div>
      <div className="audit-row-side"><time dateTime={log.created_at}>{new Date(log.created_at).toLocaleString()}</time>
        <LazyHistoryDetail id={log.id} read={async signal => { const { data, error } = await client.rpc('admin_audit_history_detail', { p_id: log.id }).abortSignal(signal); if (error) throw error; return data; }}>
          {data => <pre>{JSON.stringify(data, null, 2)}</pre>}
        </LazyHistoryDetail></div>
    </article>)}</div>
  </Panel>;
}

export function DocumentHistory({ client, revision = 0, Panel, docLabel, renderDocument }) {
  const [status, setStatus] = useState('');
  const [offset, setOffset] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const state = useHistoryPage(async signal => {
    let request = client.from('rental_documents').select(DOCUMENT_SUMMARY_COLUMNS)
      .order('created_at', { ascending: false }).order('id', { ascending: false }).range(offset, offset + 50);
    if (status) request = request.eq('status', status);
    const { data, error } = await request.abortSignal(signal);
    if (error) throw error;
    return { rows: data.slice(0, 50), has_more: data.length > 50 };
  }, `${status}:${offset}`, `${revision}:${refresh}`);
  return <Panel title="Document Review" eyebrow="License & Insurance">
    <label>Status <select value={status} onChange={event => { setStatus(event.target.value); setOffset(0); }}>
      <option value="">All documents</option><option value="pending_review">Pending review</option><option value="approved">Approved</option><option value="rejected">Rejected</option>
    </select></label>
    <PageControls state={state} offset={offset} setOffset={setOffset} refresh={() => setRefresh(value => value + 1)}/>
    <div className="table-list">{state.rows.map(doc => <article className="data-row" key={doc.id}>
      <div><strong>{docLabel(doc.document_type)}</strong><span>{doc.profiles?.full_name || doc.user_id}</span><small>{doc.rentals?.vehicles?.name || 'No vehicle'} • {new Date(doc.created_at).toLocaleString()} • {doc.status}</small></div>
      <LazyHistoryDetail id={doc.id} read={async signal => {
        const { data, error } = await client.from('rental_documents').select('*,profiles!rental_documents_user_id_profiles_fkey(full_name),rentals(vehicles(name))').eq('id', doc.id).single().abortSignal(signal);
        if (error) throw error; return data;
      }}>{(data, reload) => renderDocument(data, () => { reload(); setRefresh(value => value + 1); })}</LazyHistoryDetail>
    </article>)}</div>
  </Panel>;
}

export function MaintenanceHistory({ client, vehicleId, prettyStatus, formatMiles }) {
  const [open, setOpen] = useState(false);
  return <section className="maintenance-history"><button type="button" aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? 'Hide service history' : 'Show service history'}</button>
    {open && <MaintenanceHistoryPage client={client} vehicleId={vehicleId} prettyStatus={prettyStatus} formatMiles={formatMiles}/>}</section>;
}
function MaintenanceHistoryPage({ client, vehicleId, prettyStatus, formatMiles }) {
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const state = useHistoryPage(async signal => {
    const { data, error } = await client.from('vehicle_maintenance_service_logs').select('id,service_type,completed_mileage,completed_at,notes').eq('vehicle_id',vehicleId)
      .order('completed_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+50).abortSignal(signal);
    if (error) throw error;
    return { rows: data.slice(0,50), has_more: data.length>50 };
  }, `${vehicleId}:${offset}`, revision);
  return <><PageControls state={state} offset={offset} setOffset={setOffset} refresh={() => setRevision(value => value+1)}/>
    <div className="maintenance-history-list">{state.rows.map(log => <article key={log.id}><div><strong>{prettyStatus(log.service_type)}</strong><span>{formatMiles(log.completed_mileage)} • {log.completed_at}</span></div><small>{log.notes || 'No service note'}</small></article>)}</div></>;
}

export function PaymentActivity({ client, revision, filter, type, render }) {
  const [offset, setOffset] = useState(0);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => setOffset(0), [filter,type]);
  const state = useHistoryPage(async signal => {
    const { data,error } = await client.rpc('admin_payment_activity_page', { p_filter:filter,p_type:type,p_offset:offset }).abortSignal(signal);
    if (error) throw error;
    return data;
  }, `${filter}:${type}:${offset}`, `${revision}:${refresh}`);
  return render({ paymentEvents:state.rows, activityTotals:state.totals, activityLoading:state.loading,
    reconciliationCount:state.reconciliation_count, loadError:state.error,
    pageControls:<PageControls state={state} offset={offset} setOffset={setOffset} refresh={() => setRefresh(value => value+1)}/> });
}

export function EmailHistory({ client, Panel, prettyStatus }) {
  const [open,setOpen]=useState('');
  return <div className="email-history-grid">{[['email_campaigns','Sent & Scheduled Emails'],['email_outbox','Automated Queue'],['email_delivery_events','Recent Provider Events']].map(([table,title]) => <Panel key={table} title={title} eyebrow="Delivery history">
    <button aria-expanded={open===table} onClick={()=>setOpen(value=>value===table?'':table)}>{open===table?'Hide history':'Show history'}</button>
    {open===table && <EmailHistoryPage client={client} table={table} prettyStatus={prettyStatus}/>}
  </Panel>)}</div>;
}
function EmailHistoryPage({ client,table,prettyStatus }) {
  const [offset,setOffset]=useState(0);
  const [revision,setRevision]=useState(0);
  const config={ email_campaigns:['id,status,name,subject,sent_count,recipient_count,created_at','created_at'],
    email_outbox:['id,status,email_type,recipient_email,sent_at,last_error,created_at','created_at'],
    email_delivery_events:['id,event_type,email,provider_message_id,event_at','event_at'] }[table];
  const state=useHistoryPage(async signal=>{
    const {data,error}=await client.from(table).select(config[0]).order(config[1],{ascending:false}).order('id',{ascending:false}).range(offset,offset+50).abortSignal(signal);
    if(error) throw error;return {rows:data.slice(0,50),has_more:data.length>50};
  },`${table}:${offset}`,revision);
  return <><PageControls state={state} offset={offset} setOffset={setOffset} refresh={()=>setRevision(value=>value+1)}/><div className="email-history-list">{state.rows.map(row=><article key={row.id}><span>{prettyStatus(row.status || row.event_type)}</span><div><strong>{row.name || row.email_type || row.email}</strong><small>{row.subject || row.recipient_email || row.provider_message_id}</small></div><em>{row.sent_count != null ? `${row.sent_count}/${row.recipient_count} sent` : row.sent_at || row.last_error || row.event_at || 'Queued'}</em></article>)}</div></>;
}
