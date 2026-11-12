import React, { useRef, useState } from 'react';
import { buildPaymentAllocation, chargeRemainingCents } from './lib/paymentAllocation.js';
const money = n => new Intl.NumberFormat('en-US', {style:'currency',currency:'USD'}).format(n / 100);
const today = () => new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function StripeAllocatedPayment({client,rental,charges,due,state,onEmail,onRefresh,onCollect,onBusyChange,canCollectRent=true}) {
 const pending = state?.receipts?.find(r=>r.status==='pending');
 const stripePending = pending?.funding_kind==='stripe' ? pending : null;
 const [form,setForm]=useState(()=>({amount:((due+charges.reduce((s,c)=>s+chargeRemainingCents(c),0))/100).toFixed(2),rentalAmount:(due/100).toFixed(2),allocations:Object.fromEntries(charges.map(c=>[c.id,(chargeRemainingCents(c)/100).toFixed(2)]))}));
 const [attempt,setAttempt]=useState(null),[review,setReview]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[done,setDone]=useState(null);
 const lock=useRef(false);
 const active=attempt || (stripePending && {id:stripePending.id,request:stripePending.request,url:stripePending.result?.url});
 const request=active?.request;
 const amount=request?.amountCents ?? Math.round(Number(form.amount||0)*100);
 const rent=request?.rentalAmountCents ?? Math.round(Number(form.rentalAmount||0)*100);
 const allocations=request ? Object.fromEntries(request.charges.map(c=>[c.id,(c.amountCents/100).toFixed(2)])) : form.allocations;
 const extras=Object.values(allocations).reduce((s,v)=>s+Math.round(Number(v||0)*100),0),credit=amount-rent-extras;
 const blocked=pending && !stripePending;
 function change(key,value){setForm(f=>({...f,[key]:value}));setReview(null);setError('');}
 function allocate(id,value){const next={...allocations};if(value===null)delete next[id];else next[id]=value;change('allocations',next);}
 function prepare(mode){
  setError('');setNotice('');
  try{
   const value=request || buildPaymentAllocation({charges,rentalDueCents:due,form:{...form,funding:'stripe',paymentMethod:'card',receivedDate:today(),confirmed:true}});
   if(value.amountCents<50)throw new Error('Enter at least $0.50 for Stripe.');
   if(value.creditAmountCents>0&&!canCollectRent)throw new Error('Payment collection permission is required to retain customer credit.');
   setReview({mode,request:value});
  }catch(e){setError(e.message);}
 }
 async function perform(mode,value=review?.request){
  if(lock.current)return;lock.current=true;setBusy(true);onBusyChange?.(true);setError('');setNotice('');
  const id=active?.id||crypto.randomUUID();
  const req=active?.request||value;
  const collectionMode=req?.collectionMode || (mode==='card'?'saved_card':'checkout');
  const saved={id,request:{...req,collectionMode},url:active?.url};setAttempt(saved);
  try{
   const action=mode==='cancel'?'admin_cancel_allocated_stripe':collectionMode==='saved_card'?'admin_charge_allocated_stripe':'admin_create_allocated_stripe';
   const {data,error}=onCollect ? {data:await onCollect(id,saved.request,action)} : await client.functions.invoke('stripe-web-hook',{body:{action,rentalId:rental.id,idempotencyKey:id,externalPayment:saved.request}});
   if(error||data?.error){let message=data?.error||error?.message;try{message=(await error?.context?.clone?.().json())?.error||message;}catch{}throw new Error(message||'Unable to confirm payment. Check this same attempt again.');}
   if(data.status==='posted'){setDone(data);setReview(null);await onRefresh?.();return;}
   if(data.status==='cancelled'){setAttempt(null);setReview(null);setNotice('The unpaid Stripe attempt was cancelled. You can change the amount and allocations.');await onRefresh?.();return;}
   setAttempt({...saved,url:data.url||active?.url});setReview(null);
   if(data.url){
    if(mode==='copy'){await navigator.clipboard.writeText(data.url);setNotice('Stripe payment link copied.');}
    else if(mode==='email'||mode==='link')onEmail?.({id:rental.id,kind:'rental',rental,paymentReceiptId:id,amount:req.amountCents/100,label:'Allocated rental payment'},data.url,mode==='email'?'email':'');
    else setNotice('Stripe payment link is ready. Open, copy, or email it below.');
   }else setNotice(data.message||'Payment is awaiting Stripe confirmation. Check payment status before starting another attempt.');
  }catch(e){setError(e.message);}
  finally{setBusy(false);onBusyChange?.(false);lock.current=false;}
 }
 if(done)return <div className="stripe-allocated-payment"><p role="status">{money(done.amountCents)} received through Stripe. {money(done.creditAmountCents||0)} retained as customer credit.</p></div>;
 return <div className="stripe-allocated-payment">
  <p>Enter the amount to collect through Stripe, then choose how it is applied. The full balance is selected initially. You can collect more than is owed; the remainder becomes customer credit for this rental.</p>
  {blocked&&<p role="alert">An external payment is unfinished. Resume or cancel it in External payments first.</p>}
  {active&&<p role="status">A Stripe payment is pending. Its amount and allocations are reserved until payment or cancellation. Use the same link to avoid duplicate payments.</p>}
  <fieldset className="flexible-payment-fields" disabled={busy||!!active||!!blocked||!state}>
   <label>Stripe payment amount<input type="number" step="0.01" min="0.50" inputMode="decimal" value={request?(amount/100).toFixed(2):form.amount} onChange={e=>change('amount',e.target.value)}/></label>
   <div className="allocation-table"><div className="allocation-table-heading"><span>Apply to</span><span>Outstanding</span><span>Amount to apply</span></div>
    {canCollectRent&&<div className="allocation-row"><label><input type="checkbox" checked={rent>0} onChange={e=>change('rentalAmount',e.target.checked?(due/100).toFixed(2):'0')}/>Rental balance</label><span>{money(due)}</span><input aria-label="Stripe amount toward rental" type="number" min="0" max={due/100} step="0.01" value={request?(rent/100).toFixed(2):form.rentalAmount} onChange={e=>change('rentalAmount',e.target.value)}/></div>}
    {charges.map(c=><div className="allocation-row" key={c.id}><label><input type="checkbox" checked={Object.hasOwn(allocations,c.id)} onChange={e=>allocate(c.id,e.target.checked?(chargeRemainingCents(c)/100).toFixed(2):null)}/>{c.name}</label><span>{money(chargeRemainingCents(c))}</span><input aria-label={`Stripe amount toward ${c.name}`} type="number" min="0.01" max={chargeRemainingCents(c)/100} step="0.01" disabled={!Object.hasOwn(allocations,c.id)} value={allocations[c.id]??''} onChange={e=>allocate(c.id,e.target.value)}/></div>)}
   </div>
  </fieldset>
  <dl className="allocation-review"><dt>Stripe amount</dt><dd>{money(amount||0)}</dd><dt>Rental allocation</dt><dd>{money(rent||0)}</dd><dt>Additional charges / tolls</dt><dd>{money(extras||0)}</dd><dt>{credit<0?'Reduce allocations by':'Customer credit'}</dt><dd>{money(Math.abs(credit)||0)}</dd></dl>
  {review?<div className="receipt-confirmation"><strong>Confirm {review.mode==='card'?'saved-card charge':'Stripe payment link'}</strong><p>Collect {money(review.request.amountCents)}: {money(review.request.rentalAmountCents)} to rental, {money(review.request.charges.reduce((s,c)=>s+c.amountCents,0))} to selected charges, and {money(review.request.creditAmountCents)} as credit. {review.mode==='card'?'Confirming will charge the saved card now.':'Creating a link does not mark the payment as received.'}</p><div className="rp-stripe-actions"><button type="button" disabled={busy} onClick={()=>perform(review.mode)}>{busy?'Checking Stripe…':review.mode==='card'?'Confirm and charge saved card':'Confirm and create Stripe link'}</button><button type="button" disabled={busy} onClick={()=>setReview(null)}>Back to edit</button></div></div>:<div className="rp-stripe-actions">
   {!active&&<><button type="button" disabled={busy||!!blocked||!state} onClick={()=>prepare('link')}>Send Stripe link</button><button type="button" disabled={busy||!!blocked||!state} onClick={()=>prepare('copy')}>Copy Stripe link</button><button type="button" disabled={busy||!!blocked||!state} onClick={()=>prepare('email')}>Email Stripe link</button><button type="button" disabled={busy||!!blocked||!state} onClick={()=>prepare('card')}>Charge saved card</button></>}
   {active&&<><button type="button" disabled={busy} onClick={()=>perform('status')}>{busy?'Checking Stripe…':'Check payment status'}</button><button type="button" disabled={busy} onClick={()=>perform('cancel')}>Cancel unpaid Stripe attempt</button></>}
  </div>}
  {active?.url&&<div className="rp-stripe-actions"><a href={active.url} target="_blank" rel="noopener noreferrer">Open Stripe payment link</a><button type="button" disabled={busy} onClick={async()=>{try{await navigator.clipboard.writeText(active.url);setNotice('Stripe payment link copied.');}catch{setError('Copy failed. Open the link and copy its address.');}}}>Copy link</button><button type="button" disabled={busy} onClick={()=>onEmail?.({id:rental.id,kind:'rental',rental,paymentReceiptId:active.id,amount:amount/100,label:'Allocated rental payment'},active.url,'email')}>Email link</button></div>}
  {notice&&<p role="status">{notice}</p>}{error&&<p role="alert" className="form-error">{error}</p>}
 </div>;
}
