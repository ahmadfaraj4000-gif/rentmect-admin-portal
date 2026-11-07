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
  amount:'',paymentMethod:'cash_app',receivedDate:today(),receivedTime:'',reference:'',notes:'',selectedJson:'[]',receiptId:'',requestJson:'',confirmed:false,
 },['amount','paymentMethod','receivedDate','receivedTime','reference','notes','selectedJson','receiptId','requestJson']);
 const pending=form.requestJson?JSON.parse(form.requestJson):null;
 const selected=JSON.parse(form.selectedJson);
 const eligible=canManageCharges?eligiblePaymentCharges(charges):[], due=canCollectRent?paymentCents(Number(rentalDue).toFixed(2)):0;
 const selectedTotal=eligible.filter(c=>selected.includes(c.id)).reduce((n,c)=>n+paymentCents(c.total_amount),0);
 const remainder=pending?.rentalAmountCents??Math.max(0,Math.round(Number(form.amount||0)*100)-selectedTotal);
 const dialog=useRef(null);
 useEffect(()=>trackTaskDialog(),[]);
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
  const nodes=[...dialog.current.querySelectorAll('button,input,textarea,select')].filter(n=>!n.disabled);const first=nodes[0],last=nodes.at(-1);
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
 }}
 return createPortal(<div className="admin-modal-backdrop external-charge-payment-backdrop"><form ref={dialog} tabIndex={-1} onKeyDown={keyboard} onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="receive-payment-title" className="admin-modal external-charge-payment-modal toll-payment-modal receive-payment-modal">
  <header className="admin-modal-header"><div><strong id="receive-payment-title">Receive payment</strong><span>{rental.vehicles?.name} · {rental.profiles?.full_name}</span></div><button type="button" className="admin-close-button" disabled={saving} onClick={onClose} aria-label="Close payment dialog">×</button></header>
  {loading?<p>Checking for an unfinished payment…</p>:done?<><p role="status">{done.status === 'refunded' ? 'This payment was already refunded. No new payment was recorded.' : `${money(done.amountCents/100)} recorded. Rental balance: ${money(done.balanceDue)}.`}</p><small>Receipt {done.receiptId}</small><button type="button" onClick={onClose}>Done</button></>:<>
  {pending&&<p role="status">This payment is awaiting confirmation. Resume the same receipt, or cancel its recording. Cancelling does not return funds.</p>}
  <fieldset disabled={saving||!!pending||!recoveryReady} className="toll-payment-fields">
   <label className="modal-field"><span>Amount received</span><input required type="number" min="0.01" step="0.01" value={pending?(pending.amountCents/100).toFixed(2):form.amount} onChange={e=>change('amount',e.target.value)}/></label>
   <label className="modal-field"><span>Payment method</span><select value={pending?.paymentMethod||form.paymentMethod} onChange={e=>change('paymentMethod',e.target.value)}>{[['cash_app','Cash App'],['cash','Cash'],['terminal','Card terminal'],['card','Card collected externally'],['bank_transfer','Bank transfer'],['other','Other']].map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></label>
   <label className="modal-field"><span>Date received</span><input type="date" required max={today()} value={pending?.receivedDate||form.receivedDate} onChange={e=>change('receivedDate',e.target.value)}/></label>
   <label className="modal-field"><span>Time received (optional, Eastern)</span><input type="time" value={pending?.receivedTime??form.receivedTime} onChange={e=>change('receivedTime',e.target.value)}/></label>
   <label className="modal-field"><span>Reference</span><input maxLength={120} value={pending?.reference??form.reference} onChange={e=>change('reference',e.target.value)}/></label>
   <label className="modal-field"><span>Payment notes</span><textarea maxLength={2000} value={pending?.notes??form.notes} onChange={e=>change('notes',e.target.value)}/></label>
   {!pending&&<><label className="select-all-tolls"><input type="checkbox" checked={eligible.some(c=>c.charge_type==='toll')&&eligible.filter(c=>c.charge_type==='toll').every(c=>selected.includes(c.id))} onChange={e=>change('selected',e.target.checked?[...new Set([...selected,...eligible.filter(c=>c.charge_type==='toll').map(c=>c.id)])]:selected.filter(id=>!eligible.some(c=>c.id===id&&c.charge_type==='toll')))}/>Select all tolls</label>
   <div className="toll-payment-selection">{eligible.map(c=><label className="toll-payment-option" key={c.id}><input type="checkbox" checked={selected.includes(c.id)} onChange={e=>change('selected',e.target.checked?[...selected,c.id]:selected.filter(id=>id!==c.id))}/><span>{c.name}</span><b>{money(c.total_amount)}</b></label>)}</div></>}
  </fieldset>
  <div className="external-payment-total"><span>Selected charges</span><strong>{money((pending?pending.amountCents-pending.rentalAmountCents:selectedTotal)/100)}</strong></div>
  <div className="external-payment-total"><span>Applied to rental</span><strong>{money(remainder/100)}</strong></div>
  <div className="external-payment-total"><span>Rental balance after payment</span><strong>{money(Math.max(0,(pending?.expectedRentalDueCents??due)-remainder)/100)}</strong></div>
  <label className="external-payment-confirmation"><input type="checkbox" checked={form.confirmed} disabled={saving} onChange={e=>setForm(f=>({...f,confirmed:e.target.checked}))}/>I confirm this payment was received and cleared.</label>
  <div className="modal-actions"><button type="button" disabled={saving} onClick={pending?cancel:onClose}>{pending?'Cancel recording':'Cancel'}</button><button className="approve" disabled={saving||!recoveryReady||!form.confirmed}>{saving?'Recording…':pending?'Resume recording':`Record ${money(Number(form.amount||0))} payment`}</button></div>
  </>}{error&&<p role="alert" className="form-error">{error}</p>}
 </form></div>,document.body);
}
