import { MoneyInput } from './MoneyInput.jsx';
import React,{useRef,useState} from 'react';
import {paymentCents} from './lib/externalPayment.js';
const money=cents=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100);
const date=value=>value?new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value)):'';
export function ReceiptActions({payment,onAction,canRefund}) {
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[review,setReview]=useState(null),[saved,setSaved]=useState(false);
 const lock=useRef(false),key=useRef(crypto.randomUUID());
 const method=['cash','cash_app','terminal','card','bank_transfer','other'].includes(payment.method)?payment.method:({Cash:'cash','Cash App':'cash_app',Card:'card','Card terminal':'terminal','Bank transfer':'bank_transfer'}[payment.method]||'other');
 const [form,setForm]=useState({amount:Number(payment.amount).toFixed(2),paymentMethod:method,receivedDate:payment.receivedDate||date(payment.date),receivedTime:payment.receivedTime||'',reference:payment.reference||'',notes:payment.notes||'',reason:'',confirmRefund:false});
 const change=(name,value)=>{setForm(f=>({...f,[name]:value}));setReview(null);setError('');};
 const editable=payment.provider!=='stripe'&&payment.provider!=='credit'&&payment.legacySource?.type!=='payment';
 async function save(action){
  if(lock.current)return;lock.current=true;setBusy(true);setError('');
  try{
   if(action==='review'||action==='confirm'){
    const cents=paymentCents(form.amount);if(!Number.isSafeInteger(cents)||cents<1)throw new Error('Enter the actual amount received, at least $0.01.');
    const data=await onAction(payment.correctableReceiptId||payment.legacySource?.id,{...form,amountCents:cents,expectedAmountCents:Math.round(Number(payment.amount)*100),legacySource:payment.legacySource,correctionKey:key.current,reviewToken:action==='confirm'?review.reviewToken:null},'amountcorrect');
    if(data.status==='review'){setReview(data);return;}
    setSaved(true);setOpen(false);setReview(null);return;
   }
   await onAction(payment.correctableReceiptId||payment.legacySource?.id,{...form,legacySource:payment.legacySource},action);setOpen(false);setSaved(true);
  }catch(e){setError(e.message);}finally{setBusy(false);lock.current=false;}
 }
 if(payment.flexibleReceipt&&payment.status==='refunded')return <small>Receipt reversed · original posting retained</small>;
 if(saved)return <p role="status">Payment changes saved. Balances are refreshing.</p>;
 if(!open)return <button className="payment-edit-button" type="button" onClick={()=>setOpen(true)}>{editable?'Edit payment amount and details':'View payment details'}</button>;
 return <div className="receipt-correction">
  {editable?<><p>Correct the amount actually received. Review the effect on balances before confirming. This updates the accounting record; it does not charge or refund the customer.</p>
   <fieldset disabled={busy||!!review}>
    <label>Amount paid<MoneyInput type="number" min="0.01" step="0.01" inputMode="decimal" value={form.amount} onChange={e=>change('amount',e.target.value)}/></label>
    <label>Payment method<select value={form.paymentMethod} onChange={e=>change('paymentMethod',e.target.value)}>{[['cash','Cash'],['cash_app','Cash App'],['terminal','Card terminal'],['card','External card'],['bank_transfer','Bank transfer'],['other','Other']].map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></label>
    <label>Date received<input type="date" value={form.receivedDate} onChange={e=>change('receivedDate',e.target.value)}/></label>
    <label>Time received (Eastern, optional)<input type="time" value={form.receivedTime} onChange={e=>change('receivedTime',e.target.value)}/></label>
    <label>Reference<input value={form.reference} maxLength={120} onChange={e=>change('reference',e.target.value)}/></label>
    <label>Payment notes<textarea value={form.notes} maxLength={2000} onChange={e=>change('notes',e.target.value)}/></label>
    <label>Reason for correction<textarea value={form.reason} maxLength={500} onChange={e=>change('reason',e.target.value)} placeholder="Explain why the recorded payment needs correction"/></label>
   </fieldset>
   {review?<div className="receipt-confirmation"><strong>Review payment correction</strong><p>Amount paid: {money(review.beforeCents)} → {money(review.afterCents)}</p>{review.allocations?.map(a=><p key={a.id}>{a.name}: {money(a.beforeCents)} → {money(a.afterCents)}</p>)}<p>Customer credit: {money(review.creditCents)}. Rental balance after correction: {money(review.rentalBalanceAfterCents)}.</p><p>The original record and your reason will remain in the audit history. Any additional money is retained as credit; reductions remove unused credit first, then additional-charge allocations, then rental allocations.</p><button className="approve" type="button" disabled={busy} onClick={()=>save('confirm')}>{busy?'Saving changes…':'Confirm payment changes'}</button><button type="button" disabled={busy} onClick={()=>setReview(null)}>Back to edit</button></div>:<button className="approve" type="button" disabled={busy||form.reason.trim().length<5||!form.receivedDate} onClick={()=>save('review')}>{busy?'Checking balances…':'Review changes'}</button>}
  </>:<p>{payment.provider==='stripe'?'Stripe confirms the amount actually charged. Use Take Payment to collect additional money or the Stripe refund action to return it; the captured amount cannot be rewritten as an external correction.':'This is an application of existing credit. Reverse the application to change its allocations.'}</p>}
  {canRefund&&payment.refundBlockReason&&<p role="status">{payment.refundBlockReason}</p>}
  {canRefund&&!payment.legacySource&&!payment.refundBlockReason&&payment.provider!=='stripe'&&!review&&<><label><input type="checkbox" checked={form.confirmRefund} disabled={busy} onChange={e=>change('confirmRefund',e.target.checked)}/>{payment.provider==='credit'?'Reverse this credit application. Its allocations will become due again and the credit will be restored.':'I confirm the entire payment has been returned externally. Its allocations will become due again.'}</label>{!editable&&<label>Reason for reversal<textarea value={form.reason} onChange={e=>change('reason',e.target.value)}/></label>}<button type="button" disabled={busy||!form.confirmRefund||form.reason.trim().length<5} onClick={()=>save('refund')}>{payment.provider==='credit'?'Reverse credit application':'Record full receipt refund'}</button></>}
  <button type="button" disabled={busy} onClick={()=>{setOpen(false);setReview(null);}}>Cancel editing</button>{error&&<p role="alert">{error}</p>}
 </div>;
}
