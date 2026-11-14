import React, { useEffect, useState } from 'react';
import { useHistoryPage, PageControls } from './HistoryScreens.jsx';
import { CustomerTicketFlags } from './CustomerTicketFlags.jsx';

export function CustomerDirectory({ client, revision, Panel, renderDetails, renderContact }) {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [selection, setSelection] = useState(null);
  const [detail, setDetail] = useState({});
  const [retry, setRetry] = useState(0);
  const reload = () => setRefresh(value => value + 1);
  useEffect(() => { const timer = setTimeout(() => { setQuery(search); setOffset(0); }, 300); return () => clearTimeout(timer); }, [search]);
  const state = useHistoryPage(async signal => {
    const { data, error } = await client.rpc('admin_customer_directory_page', { p_search: query, p_offset: offset }).abortSignal(signal);
    if (error) throw error;
    return data;
  }, `${query}:${offset}`, `${revision}:${refresh}`);
  useEffect(() => {
    if (!selection) { setDetail({}); return; }
    const controller = new AbortController();
    const id = selection.id;
    setDetail({ loading: true });
    const reads = [
      client.from('profiles').select('*').eq('id', id).single(),
      client.from('rentals').select('id,user_id,vehicle_id,status,created_at,pickup_date,pickup_time,return_date,return_time,late_return_count,chargeback_count,blocked_customer,deposit_held_amount,deposit_released_amount,agreement_signed,agreement_signature_name,agreement_signed_at,agreement_version,agreement_hash,rental_total,tax_amount,security_deposit,vehicles(id,name)').eq('user_id', id).order('created_at', { ascending: false }),
      ...(selection.mode === 'details' ? [
        client.from('rental_documents').select('id,user_id,rental_id,document_type,status,created_at,insurance_packet_id,insurance_coverage_type,extension_request_id').eq('user_id', id).order('created_at', { ascending: false }),
        client.from('vehicle_reports').select('id,user_id,rental_id,status,created_at,description').eq('user_id', id).order('created_at', { ascending: false }),
      ] : [
        client.from('email_templates').select('id,template_key,name,subject,text_body,category,enabled').eq('category','manual').eq('enabled',true).order('name'),
        client.from('sms_templates').select('id,template_key,name,body,category,enabled').eq('category','manual').eq('enabled',true).order('name'),
      ]),
    ];
    Promise.all(reads.map(read => read.abortSignal(controller.signal))).then(results => {
      const failed = results.find(result => result.error);
      if (failed) throw failed.error;
      if (!controller.signal.aborted) setDetail({ profile: results[0].data, rentals: results[1].data,
        documents: selection.mode === 'details' ? results[2].data : [], reports: selection.mode === 'details' ? results[3].data : [],
        emailTemplates: selection.mode === 'contact' ? results[2].data : [], smsTemplates: selection.mode === 'contact' ? results[3].data : [] });
    }).catch(error => { if (!controller.signal.aborted) setDetail({ error: error.message || 'Customer details could not load.' }); });
    return () => controller.abort();
  }, [selection?.id, selection?.mode, retry]);
  const close = () => setSelection(null);
  const saved = updated => { if (updated) setDetail(current => ({ ...current, profile: { ...current.profile, ...updated } })); reload(); };
  return <>
    <Panel title="Client Accounts" eyebrow="Customers">
      <label>Search customers<input value={search} maxLength={140} onChange={event => setSearch(event.target.value)} placeholder="Name, email, phone, vehicle, status…"/></label>
      <PageControls state={state} offset={offset} setOffset={setOffset} refresh={reload}/>
      <div className="table-list customer-summary-list">{state.rows.map(profile => <article className="customer-summary-row" key={profile.id}>
        <div className="customer-summary-identity"><div><strong>{profile.full_name || 'Unnamed Client'}</strong><span>{profile.email}</span><small>{profile.phone} • {profile.phone_verified ? 'Phone verified' : 'Phone unverified'}</small>
          {profile.role === 'admin' && <em className="customer-admin-account-badge">Administrator account • available for assisted rentals</em>}</div></div>
        <div className="customer-summary-activity"><strong>{profile.rental_count} rentals</strong><span>{profile.latest_rental?.vehicle_name || 'No vehicle history'}</span><small>{profile.latest_rental?.status} {profile.latest_rental?.pickup_date}</small></div>
        <aside className={`customer-risk-summary ${profile.risk.level}`}><span>{profile.risk.level} risk</span><small>{profile.risk.summary}</small></aside>
        <div className="customer-row-actions"><button onClick={() => setSelection({ id: profile.id, mode: 'contact' })}>Message</button><button onClick={() => setSelection({ id: profile.id, mode: 'details' })}>Details</button></div>
        <CustomerTicketFlags userId={profile.id}/>
      </article>)}</div>
    </Panel>
    {selection && !detail.profile && <div role="dialog" aria-label="Customer details" className="modal-backdrop"><div className="panel"><button onClick={close}>Close</button>{detail.loading ? <p>Loading selected customer…</p> : <p role="alert">{detail.error}<button onClick={() => setRetry(value => value + 1)}>Retry</button></p>}</div></div>}
    {selection && detail.profile && (selection.mode === 'details' ? renderDetails(detail, close, saved) : renderContact(detail, close))}
  </>;
}
