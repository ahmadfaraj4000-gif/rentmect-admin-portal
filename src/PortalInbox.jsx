import React, { useEffect, useState } from 'react';
import { useHistoryPage, PageControls } from './HistoryScreens.jsx';
export function PortalInbox({ client, revision, Panel, canSend, notify }) {
  const [search,setSearch] = useState('');
  const [query,setQuery] = useState('');
  const [offset,setOffset] = useState(0);
  const [refresh,setRefresh] = useState(0);
  const [selected,setSelected] = useState(null);
  useEffect(() => { if (search === query) return; const timer=setTimeout(() => { setQuery(search);setOffset(0); },300); return () => clearTimeout(timer); },[search,query]);
  const state=useHistoryPage(async signal => {
    const { data,error }=await client.rpc('admin_communication_threads',{p_search:query,p_offset:offset}).abortSignal(signal);
    if(error) throw error; return data;
  },`${query}:${offset}`,`${revision}:${refresh}`);
  return <section className="communications-inbox">
    <Panel title="Customer Inbox" eyebrow={`${state.unread ?? '…'} Unread`}>
      <input aria-label="Search conversations" value={search} maxLength={120} onChange={event=>setSearch(event.target.value)} placeholder="Search conversations…"/>
      <PageControls state={state} offset={offset} setOffset={setOffset} refresh={()=>setRefresh(value=>value+1)}/>
      <div className="communications-thread-list">{state.rows.map(row=><button key={row.user_id} className={`communications-thread ${selected?.user_id===row.user_id?'active':''}`} onClick={()=>setSelected(row)}>
        <span><strong>{row.full_name || row.email}</strong><small>{row.preview}</small></span><em>{row.unread || new Date(row.latest_at).toLocaleDateString()}</em>
      </button>)}</div>
    </Panel>
    {selected ? <PortalThread key={selected.user_id} client={client} thread={selected} revision={revision} Panel={Panel} canSend={canSend} notify={notify} onRead={()=>setRefresh(value=>value+1)} onClose={()=>setSelected(null)}/>
      : <Panel title="Select a customer" eyebrow="Portal Conversation"><p>Choose a conversation to read and reply.</p></Panel>}
  </section>;
}
function PortalThread({ client,thread,revision,Panel,canSend,notify,onRead,onClose }) {
  const [offset,setOffset]=useState(0);
  const [refresh,setRefresh]=useState(0);
  const [draft,setDraft]=useState('');
  const [sending,setSending]=useState(false);
  const state=useHistoryPage(async signal=>{
    const {data,error}=await client.from('rental_messages').select('id,user_id,rental_id,sender_role,message,created_at,read_by_admin').eq('user_id',thread.user_id)
      .order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+50).abortSignal(signal);
    if(error) throw error;
    const rows=data.slice(0,50);
    const unread=rows.filter(row=>row.sender_role!=='admin'&&!row.read_by_admin).map(row=>row.id);
    if(unread.length && !signal.aborted) {
      const result=await client.from('rental_messages').update({read_by_admin:true}).in('id',unread).eq('read_by_admin',false).abortSignal(signal);
      if(result.error) throw result.error;
      if(!signal.aborted) onRead();
    }
    return {rows,has_more:data.length>50};
  },`${thread.user_id}:${offset}`,`${revision}:${refresh}`);
  async function send(event) {
    event.preventDefault(); if(!canSend||!draft.trim()||sending) return;
    setSending(true);
    try {
      const {error}=await client.from('rental_messages').insert({user_id:thread.user_id,rental_id:thread.rental_id,sender_role:'admin',message:draft.trim(),read_by_admin:true,read_by_client:false});
      if(error) throw error;
      setDraft('');setOffset(0);setRefresh(value=>value+1);onRead();
    }catch(error){notify(error.message,'error');}finally{setSending(false);}
  }
  return <Panel title={thread.full_name || thread.email} eyebrow="Portal Conversation"><button onClick={onClose}>Close conversation</button>
    <p>{thread.email} • {thread.vehicle_name} • {thread.pickup_date}</p>
    <PageControls state={state} offset={offset} setOffset={setOffset} refresh={()=>setRefresh(value=>value+1)}/>
    <div className="message-box communications-message-box">{[...state.rows].reverse().map(row=><div key={row.id} className={row.sender_role==='admin'?'message own':'message'}><strong>{row.sender_role==='admin'?'Admin':thread.full_name}</strong><p>{row.message}</p><span>{new Date(row.created_at).toLocaleString()}</span></div>)}</div>
    <form className="support-form" onSubmit={send}><input value={draft} maxLength={1000} onChange={event=>setDraft(event.target.value)} disabled={!canSend||sending} placeholder="Write a portal reply…"/><button disabled={!canSend||sending||!draft.trim()}>Send Reply</button></form>
  </Panel>;
}
