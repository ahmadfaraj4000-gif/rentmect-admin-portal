import { ChargeScrollList } from './ChargeScrollList.jsx';
import './payment-receipts.css';
import React, {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {useTaskDraft} from './useTaskDraft.js';
import {trackTaskDialog} from './lib/taskDraft.js';
import {buildExternalPayment,eligiblePaymentCharges,paymentCents} from './lib/externalPayment.js';
const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n);
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function ReceivePayment({client,rental,charges,rentalDue,onRecord,onClose,canCollectRent=true,canManageCharges=true}) {
 const [saving,setSaving]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[done,setDone]=useState(null),[recoveryReady,setRecoveryReady]=useState(false);
 const [form,setForm,clearDraft]=useTaskDraft(`receive-payment:${rental.id}`,{
  amount:'0.00',applyToRental:true,paymentMethod:'cash_app',receivedDate:today(),receivedTime:'',reference:'',notes:'',selectedJson:'[]',receiptId:'',requestJson:'',confirmed:false,
 },['amount','applyToRental','paymentMethod','receivedDate','receivedTime','reference','notes','selectedJson','receiptId','requestJson']);
 const pending=form.requestJson?JSON.parse(form.requestJson):null;
 const selected=JSON.parse(form.selectedJson);
 const eligible=canManageCharges?eligiblePaymentCharges(charges):[], due=canCollectRent?paymentCents(Number(rentalDue).toFixed(2)):0;
 const selectedTotal=eligible.filter(c=>selected.includes(c.id)).reduce((n,c)=>n+paymentCents(c.total_amount),0);
 const amountNumber=Number(form.amount||0), amountValid=Number.isFinite(amountNumber)&&amountNumber>0;
 const unallocated=Math.max(0,Math.round((Number.isFinite(amountNumber)?amountNumber:0)*100)-selectedTotal);
 const appliesToRental=pending?pending.rentalAmountCents>0:form.applyToRental!==false&&canCollectRent;
 const remainder=pending?.rentalAmountCents??(appliesToRental?unallocated:0);
 const tolls=eligible.filter(c=>c.charge_type==='toll');
 const formatAmount=()=>{try{change('amount',(paymentCents(form.amount||'0')/100).toFixed(2));}catch{/* Keep invalid input visible for validation. */}};
 const dialog=useRef(null), selectAmountOnClick=useRef(false);
 function focusAmount(event){
  if(Number(form.amount||0)===0)change('amount','');
  else event.currentTarget.select();
 }
 function finishAmountClick(event){
  // Mouse-up can undo focus selection in Safari. Select after the completed click.
  if(selectAmountOnClick.current){
   const input=event.currentTarget, value=input.value;
   input.select();
   window.setTimeout(()=>{if(document.activeElement===input&&input.value===value)input.select();},0);
  }
  selectAmountOnClick.current=false;
 }
 useEffect(()=>trackTaskDialog(),[]);
 useEffect(()=>{if(form.amount==='')setForm(f=>({...f,amount:'0.00'}));},[]);
 useEffect(()=>{const previous=document.activeElement;dialog.current?.focus();return()=>previous?.focus?.();},[]);
 useEffect(()=>{let active=true;(async()=>{
  try{
   let q=client.from('external_payment_receipts').select('id,status,request,result').eq('rental_id',rental.id);
   q=form.receiptId?q.eq('id',form.receiptId):q.eq('status','pending');
   const {data,error}=await q.maybeSingle();if(error)throw error;if(!active)return;
   if(data && ['posted','refunded'].includes(data.status)){setDone(data.result);clearDraft();}
   else if(data?.status==='pending')setForm(f=>({...f,receiptId:data.id,requestJson:JSON.stringify(data.request),confirmed:false}));
   else if(data?.status==='cancelled'){clearDraft();setForm(f=>({...f,receiptId:'',requestJson:'',confirmed:false}));}
   setRecoveryReady(true);
  }catch(e){if(active)setError(e.message);}finally{if(active)setLoading(false);}
 })();return()=>{active=false;};},[rental.id]);
 const change=(key,value)=>{setError('');setForm(f=>({...f,[key==='selected'?'selectedJson':key]:key==='selected'?JSON.stringify(value):value,confirmed:false}));};
 async function submit(e){e.preventDefault();if(saving||loading||!recoveryReady||!form.confirmed)return;setSaving(true);setError('');
  try{const request=pending||buildExternalPayment(charges,selected,due,form);const id=form.receiptId||crypto.randomUUID();
   setForm(f=>({...f,receiptId:id,requestJson:JSON.stringify(request)}));
   const result=await onRecord(rental.id,id,request,false);setDone(result);clearDraft();
  }catch(e){setError(e.message||'Recording is unconfirmed. Resume this receipt.');}finally{setSaving(false);}
 }
 async function cancel(){setSaving(true);setError('');try{
  const {data,error}=await client.from('external_payment_receipts').select('id').eq('id',form.receiptId).maybeSingle();if(error)throw error;
  if(data){const result=await onRecord(rental.id,form.receiptId,pending,true);if(['posted','refunded'].includes(result.status)){setDone(result);clearDraft();return;}}
  clearDraft();onClose();
 }catch(e){setError(e.message);}finally{setSaving(false);}}
 function keyboard(e){if(e.key==='Escape'&&!saving){e.stopPropagation();onClose();}if(e.key==='Tab'){
  const nodes=[...dialog.current.querySelectorAll('button,input,textarea,select,[tabindex="0"]')].filter(n=>!n.matches(':disabled'));const first=nodes[0],last=nodes.at(-1);
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
 }}
 return createPortal(<div className="admin-modal-backdrop receive-payment-backdrop"><form ref={dialog} tabIndex={-1} onKeyDown={keyboard} onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="receive-payment-title" className="receive-payment-modal">
  <header className="rp-header"><div><h2 id="receive-payment-title">Receive payment</h2><p>{rental.vehicles?.name} · {rental.profiles?.full_name}</p></div><button type="button" className="rp-close" disabled={saving} onClick={onClose} aria-label="Close payment dialog">×</button></header>
  <div className="rp-body">
  {loading?<p>Checking for an unfinished payment…</p>:done?<><p role="status">{done.status === 'refunded' ? 'This payment was already refunded. No new payment was recorded.' : `${money(done.amountCents/100)} recorded. Rental balance: ${money(done.balanceDue)}.`}</p><small>Receipt {done.receiptId}</small></>:<>
  {pending&&<p className="rp-notice" role="status">This payment is awaiting confirmation. Resume the same receipt, or cancel its recording. Cancelling does not return funds.</p>}
  <fieldset disabled={saving||!!pending||!recoveryReady} className="rp-fields">
   <div className="rp-grid">
    <label className="rp-field"><span>Amount received</span><div className="rp-money"><span aria-hidden="true">$</span><input required type="text" inputMode="decimal" autoComplete="off" aria-label="Amount received" value={pending?(pending.amountCents/100).toFixed(2):form.amount} placeholder="0.00" onPointerDown={e=>{selectAmountOnClick.current=document.activeElement!==e.currentTarget;}} onClick={finishAmountClick} onFocus={focusAmount} onBlur={formatAmount} onChange={e=>change('amount',e.target.value)}/></div></label>
    <label className="rp-field"><span>Payment method</span><select value={pending?.paymentMethod||form.paymentMethod} onChange={e=>change('paymentMethod',e.target.value)}>{[['cash_app','Cash App'],['cash','Cash'],['terminal','Card terminal'],['card','Card collected externally'],['bank_transfer','Bank transfer'],['other','Other']].map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></label>
    <label className="rp-field"><span>Date received</span><input type="date" required max={today()} value={pending?.receivedDate||form.receivedDate} onChange={e=>change('receivedDate',e.target.value)}/></label>
    <label className="rp-field"><span>Time received <small>(Eastern, optional)</small></span><input type="time" value={pending?.receivedTime??form.receivedTime} onChange={e=>change('receivedTime',e.target.value)}/></label>
    <label className="rp-field"><span>Reference <small>(optional)</small></span><input aria-label="Reference" placeholder="Transaction or receipt ID" maxLength={120} value={pending?.reference??form.reference} onChange={e=>change('reference',e.target.value)}/></label>
    <label className="rp-field"><span>Payment notes <small>(optional)</small></span><textarea aria-label="Payment notes" placeholder="Add a note to the ledger" rows={1} maxLength={2000} value={pending?.notes??form.notes} onChange={e=>change('notes',e.target.value)}/></label>
   </div>
   <section className="rp-allocation" aria-labelledby="rp-allocation-title">
    <h3 id="rp-allocation-title">Apply payment</h3>
    {canCollectRent&&<label className={`rp-choice rp-rental ${appliesToRental?'is-selected':''}`}><input type="checkbox" aria-label="Apply to rental" checked={appliesToRental} onChange={e=>change('applyToRental',e.target.checked)}/><span><strong>Apply to rental</strong><small>{money((pending?.expectedRentalDueCents??due)/100)} rental balance due</small></span><b>{money(remainder/100)}</b></label>}
    {canCollectRent&&<p className="rp-help">To pay rent only, leave additional charges unchecked. Selected charges are paid first; the remainder goes to rent.</p>}
    {!pending&&eligible.length>0&&<><div className="rp-charges-heading"><h4>Additional charges</h4>{tolls.length>0&&<label className="rp-select-all"><input type="checkbox" checked={tolls.every(c=>selected.includes(c.id))} onChange={e=>change('selected',e.target.checked?[...new Set([...selected,...tolls.map(c=>c.id)])]:selected.filter(id=>!tolls.some(c=>c.id===id)))}/>Select all tolls</label>}</div>
    <ChargeScrollList className="rp-charge-list" label="Additional charges — scroll for more">{eligible.map(c=><label className={`rp-choice ${selected.includes(c.id)?'is-selected':''}`} key={c.id}><input type="checkbox" checked={selected.includes(c.id)} onChange={e=>change('selected',e.target.checked?[...selected,c.id]:selected.filter(id=>id!==c.id))}/><span>{c.name}</span><b>{money(c.total_amount)}</b></label>)}</ChargeScrollList></>}
   </section>
  </fieldset>
  <dl className="rp-summary" aria-label="Payment summary">
   <div><dt>Selected charges</dt><dd>{money((pending?pending.amountCents-pending.rentalAmountCents:selectedTotal)/100)}</dd></div>
   <div><dt>Applied to rental</dt><dd>{money(remainder/100)}</dd></div>
   <div className="rp-balance"><dt>Rental balance after payment</dt><dd>{money(Math.max(0,(pending?.expectedRentalDueCents??due)-remainder)/100)}</dd></div>
  </dl>
  {!pending&&!appliesToRental&&unallocated>0&&<p className="rp-notice">{money(unallocated/100)} is unassigned. Select “Apply to rental” or change the amount to match the selected charges.</p>}
  <label className="rp-confirmation"><input type="checkbox" checked={form.confirmed} disabled={saving||!recoveryReady} onChange={e=>setForm(f=>({...f,confirmed:e.target.checked}))}/><span>I confirm this payment was received and cleared.</span></label>
  </>}{error&&<p role="alert" className="rp-error">{error}</p>}
  </div>
  <footer className="rp-footer">{done?<button type="button" className="rp-primary" onClick={onClose}>Done</button>:<><button type="button" className="rp-secondary" disabled={saving||loading} onClick={pending?cancel:onClose}>{pending?'Cancel recording':'Cancel'}</button><button type="submit" className="rp-primary" disabled={saving||loading||!recoveryReady||!form.confirmed||(!pending&&!amountValid)}>{saving?'Recording…':pending?'Resume recording':`Record ${money(Number.isFinite(amountNumber)?amountNumber:0)} payment`}</button></>}</footer>
 </form></div>,document.body);
}
