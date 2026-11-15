import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {PageControls,useHistoryPage} from './HistoryScreens.jsx';
import './damage-cases.css';
import {CaseEvidence} from './CaseEvidence.jsx';
const label=value=>String(value||'open').replaceAll('_',' ');
export function DamageCases({client,revision,updateDamageCase,setCustomerStatus,renderEvidence,onOpenRental,onOpenArchive,canHold}) {
 const [filter,setFilter]=useState('open'),[offset,setOffset]=useState(0),[refresh,setRefresh]=useState(0),[selected,setSelected]=useState(null);
 const state=useHistoryPage(async signal=>{const {data,error}=await client.rpc('admin_damage_cases_page',{p_filter:filter,p_offset:offset}).abortSignal(signal);if(error)throw error;return data;},`${filter}:${offset}`,`${revision}:${refresh}`);
 return <section className="damage-cases">
 <div className="filter-pills">{[['open','Open'],['deposit_held','Deposit Held'],['resolved','Resolved'],['blocked','Blocked Customers'],['all','All']].map(([key,text])=><button key={key} className={key===filter?'active':''} onClick={()=>{setFilter(key);setOffset(0);}}>{text}</button>)}</div>
 <PageControls state={state} offset={offset} setOffset={setOffset} pageSize={25} refresh={()=>setRefresh(v=>v+1)}/>
 {state.loading&&<p role="status">Loading cases…</p>}
 {!state.loading&&!state.error&&!state.rows.length&&<p>No cases on this page. Choose another filter or return to the previous page.</p>}
 <div className="damage-case-list">{state.rows.map(report=><article className="damage-case-summary" key={report.id}>
 <div><strong>{report.vehicle_name||'Vehicle'}</strong><span>{report.full_name||'Customer'} · {label(report.issue_type||report.report_type)}</span></div>
 <span className="damage-case-status">{report.deposit_hold_active?'Deposit held':label(report.status)}</span>
 <time dateTime={report.created_at}>{new Date(report.created_at).toLocaleDateString()}</time>
 <button className="secondary-btn" onClick={()=>setSelected(report.id)}>Open case</button>
 </article>)}</div>
 {selected&&<CaseDialog key={selected} id={selected} client={client} canHold={canHold} updateDamageCase={updateDamageCase} setCustomerStatus={setCustomerStatus} renderEvidence={renderEvidence} onClose={()=>setSelected(null)} onChanged={()=>setRefresh(v=>v+1)} onOpenRental={onOpenRental} onOpenArchive={onOpenArchive}/>}
 </section>;
}
function CaseDialog({id,client,canHold,updateDamageCase,setCustomerStatus,renderEvidence,onClose,onChanged,onOpenRental,onOpenArchive}) {
 const [detail,setDetail]=useState(null),[form,setForm]=useState({}),[loading,setLoading]=useState(true),[busy,setBusy]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState(''),[reload,setReload]=useState(0);
 const dialog=useRef(null);
 function populate(data){setDetail(data);setForm({description:data.description||'',admin_notes:data.admin_notes||'',estimated_cost:data.estimated_cost||0,final_charge_amount:data.final_charge_amount||0});}
 useEffect(()=>{const controller=new AbortController();setLoading(true);setError('');client.from('vehicle_reports').select('id,user_id,rental_id,status,description,admin_notes,estimated_cost,final_charge_amount,deposit_hold_active,profiles(full_name,blocked_customer,customer_status),rentals(id,pickup_date,return_date,damage_deposit_hold,vehicles(name))').eq('id',id).abortSignal(controller.signal).single().then(({data,error})=>{if(controller.signal.aborted)return;if(error)setError(error.message);else populate(data);setLoading(false);}).catch(error=>{if(!controller.signal.aborted){setError(error.message||'Unable to load case details.');setLoading(false);}});return()=>controller.abort();},[id,reload]);
 useEffect(()=>{const old=document.activeElement,overflow=document.body.style.overflow;document.body.style.overflow='hidden';dialog.current?.focus();return()=>{document.body.style.overflow=overflow;old?.focus?.();};},[]);
 const blocked=detail?.profiles?.blocked_customer||detail?.profiles?.customer_status==='blocked';
 async function action(kind){setBusy(kind);setError('');setMessage('');try{
  let result;
  if(kind==='save')result=await updateDamageCase(id,{...form,estimated_cost:Number(form.estimated_cost),final_charge_amount:Number(form.final_charge_amount)});
  else if(kind==='block'||kind==='unblock')result=await setCustomerStatus(detail.user_id,kind==='block'?'blocked':'good',form.admin_notes||form.description||'Damage / incident case');
  else {const response=await client.rpc('admin_damage_case_action',{p_report_id:id,p_action:kind,p_note:form.admin_notes});if(response.error)throw response.error;result=response.data;}
  if(!result)throw new Error('The change was not saved. Check the error and retry.');
  onChanged();if(result.id===id)populate(result);else setReload(v=>v+1);
  setMessage(kind==='hold'?'Deposit held. This rental is in Archive, marked “Deposit kept · reviewed”.':kind==='resolve'?'Case resolved. Reopen the rental to review its deposit; an independent rental hold, other open cases or unpaid balances may still apply.':kind==='block'?'Customer blocked. The same blocked status is saved in Customers.':kind==='unblock'?'Customer unblocked in Customers.':'Case saved.');
 }catch(e){setError(e.message||'Unable to save. Please retry.');}finally{setBusy('');}}
 return createPortal(<div className="admin-modal-backdrop damage-case-backdrop"><section className="admin-modal damage-case-dialog" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="damage-case-title" tabIndex={-1} onKeyDown={e=>{if(e.key==='Escape'&&!busy)onClose();if(e.key==='Tab'){const nodes=[...dialog.current.querySelectorAll('button,input,textarea,a')].filter(n=>!n.disabled&&n.getClientRects().length);const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}}}>
 <header className="admin-modal-header"><div><h2 id="damage-case-title">Damage & incident case</h2>{detail&&<span>{detail.rentals?.vehicles?.name||'Vehicle'} · {detail.profiles?.full_name||'Customer'}</span>}</div><button disabled={Boolean(busy)} onClick={onClose} aria-label="Close case">×</button></header>
 <div className="damage-case-body" aria-busy={loading||Boolean(busy)}>
 {loading?<p role="status">Loading case details…</p>:detail&&<>
 <div className="damage-case-flags"><span className="damage-case-status">{label(detail.status)}</span>{(detail.deposit_hold_active||detail.rentals?.damage_deposit_hold)&&<strong>Deposit kept · reviewed</strong>}{blocked&&<strong>Customer blocked</strong>}</div>
 <p>{detail.rentals?`${detail.rentals.pickup_date} – ${detail.rentals.return_date}`:'No rental attached'}</p>
 <CaseEvidence client={client} reportId={id} onBusy={value=>setBusy(value?'photos':'')}/>
 <fieldset disabled={Boolean(busy)}><label htmlFor="case-description">Description<textarea id="case-description" rows={3} value={form.description} maxLength={1000} onChange={e=>setForm({...form,description:e.target.value})}/></label>
 <label>Case notes / deposit hold reason<textarea rows={3} value={form.admin_notes} maxLength={1500} onChange={e=>setForm({...form,admin_notes:e.target.value})}/></label>
 <div className="damage-case-amounts"><label>Estimated repair cost<input type="number" min="0" step="0.01" value={form.estimated_cost} onChange={e=>setForm({...form,estimated_cost:e.target.value})}/></label><label>Final charge estimate<input type="number" min="0" step="0.01" value={form.final_charge_amount} onChange={e=>setForm({...form,final_charge_amount:e.target.value})}/></label></div>
 <small>Case amounts are notes for review. Record any actual customer charge in the rental before returning its deposit.</small>
 </fieldset>
 </>}
 {error&&<p role="alert" className="form-error">{error}{!detail&&<button onClick={()=>setReload(v=>v+1)}>Retry loading</button>}</p>}
 {message&&<p role="status" className="damage-case-feedback">{message}</p>}
 </div>
 <footer className="damage-case-actions">
 {detail&&!loading&&<><button disabled={Boolean(busy)} onClick={()=>action('save')}>{busy==='save'?'Saving…':'Save case'}</button>
 <button disabled={Boolean(busy)||detail.status==='resolved'} onClick={()=>action('resolve')}>{busy==='resolve'?'Resolving…':'Mark resolved'}</button>
 {canHold&&<button disabled={Boolean(busy)||!detail.rental_id||!form.admin_notes.trim()||(detail.deposit_hold_active||detail.rentals?.damage_deposit_hold)} onClick={()=>action('hold')}>{busy==='hold'?'Holding…':'Hold deposit'}</button>}
 {detail.user_id&&<button className={blocked?'':'reject'} disabled={Boolean(busy)} onClick={()=>action(blocked?'unblock':'block')}>{busy==='block'||busy==='unblock'?'Saving…':blocked?'Unblock customer':'Block customer'}</button>}
 {detail.rental_id&&<button disabled={Boolean(busy)} onClick={()=>{onClose();((detail.deposit_hold_active||detail.rentals?.damage_deposit_hold)?onOpenArchive:onOpenRental)(detail.rental_id);}}>{(detail.deposit_hold_active||detail.rentals?.damage_deposit_hold)?'View archived rental':'View rental / refund'}</button>}</>}
 <button disabled={Boolean(busy)} onClick={onClose}>Close</button>
 </footer>
 </section></div>,document.body);
}
