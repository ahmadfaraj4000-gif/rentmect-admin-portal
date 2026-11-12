import React, {useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import './rental-ledger.css';
import {trackTaskDialog} from './lib/taskDraft.js';
import {chargeRemainingCents} from './lib/paymentAllocation.js';
const money = cents => (cents/100).toLocaleString('en-US',{style:'currency',currency:'USD'});
export function depositReviewPreview(allocations,charges,selected) {
 const sources=allocations.map(a=>({...a,remaining:Math.max(0,Math.round(Number(a.amount_held||0)*100)-Math.round(Number(a.amount_applied||0)*100)-Math.round(Number(a.amount_released||0)*100))})).filter(a=>a.remaining>0).sort((a,b)=>Number(b.payment_provider==='local')-Number(a.payment_provider==='local')||a.id.localeCompare(b.id));
 const held=sources.reduce((s,a)=>s+a.remaining,0),chargesTotal=charges.filter(c=>selected.includes(c.id)).reduce((s,c)=>s+chargeRemainingCents(c),0);
 let toApply=Math.min(held,chargesTotal);
 const returns=sources.map(a=>{const deduction=Math.min(toApply,a.remaining);toApply-=deduction;return {...a,deduction,refund:a.remaining-deduction};});
 return {held,chargesTotal,applied:Math.min(held,chargesTotal),refund:Math.max(0,held-chargesTotal),returns};
}
export function DepositReview({rental,allocations,charges,balanceDue,onClose,onConfirm,onExternalReturn,onHold}) {
 const eligible=charges.filter(c=>!['rental_amendment','rental_installment'].includes(c.charge_type)&&chargeRemainingCents(c)>0);
 const [selected,setSelected]=useState(eligible.map(c=>c.id)),[reason,setReason]=useState('Return reviewed; selected charges checked against the deposit.');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[result,setResult]=useState(null),[hold,setHold]=useState(false),[followUp,setFollowUp]=useState('');
 const [key]=useState(()=>crypto.randomUUID());const request=useRef(null),dialog=useRef(null);
 useEffect(()=>trackTaskDialog(),[]);
 const preview=depositReviewPreview(allocations,eligible,selected);
 const dueAfter=Math.max(0,Math.round(balanceDue*100)-preview.applied);
 useEffect(()=>{const old=document.activeElement,overflow=document.body.style.overflow;document.body.style.overflow='hidden';dialog.current?.focus();return()=>{document.body.style.overflow=overflow;old?.focus?.();};},[]);
 async function confirm(){setBusy(true);setError('');try{request.current??={review:true,idempotencyKey:key,chargeIds:selected,expectedHeld:preview.held/100,expectedApplied:preview.chargesTotal/100,reason};const saved=await onConfirm(request.current);if(saved)setResult(saved);else setError('Deposit review was not completed. Refresh the rental before trying again.');}catch(e){setError(e.message);}finally{setBusy(false);}}
 return createPortal(<div className="admin-modal-backdrop rental-ledger-dialog-backdrop"><section className="admin-modal flexible-payment-dialog deposit-review-dialog" role="dialog" aria-modal="true" aria-label="Refund Deposit" tabIndex={-1} ref={dialog} onKeyDown={e=>{if(e.key==='Escape'&&!busy)onClose();if(e.key==='Tab'){const items=[...dialog.current.querySelectorAll('button,input,textarea,select')].filter(n=>!n.disabled&&n.getClientRects().length),first=items[0],last=items.at(-1);if(e.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}}}>
 <header className="admin-modal-header"><div><strong>Refund Deposit</strong><span>{rental.profiles?.full_name||'Customer'} · {rental.vehicles?.name}</span></div><button type="button" disabled={busy} onClick={onClose} aria-label="Close deposit review">×</button></header>
 <div className="payment-dialog-scroll">
 {rental.deposit_review_note&&<p className="deposit-review-note">{rental.deposit_review_note}{rental.deposit_review_follow_up_at&&<> · Follow up {new Date(rental.deposit_review_follow_up_at).toLocaleString()}</>}</p>}
 {result?<div role="status"><p><strong>{money(Math.round(result.applied*100))} applied to charges.</strong></p>{result.refundError?<p role="alert">Deductions are saved. Refund not completed: {result.refundError}</p>:result.refund?<p>Stripe refund {result.refund.status==='released'?'completed':'processing'}.</p>:null}{result.externalRemaining>0&&<p>{money(Math.round(result.externalRemaining*100))} remains to be returned externally. {result.refundError?'It stays held until the blockers are resolved.':'Record it after returning the money.'}</p>}{!result.refund&&result.externalRemaining<=0&&result.remaining<=0&&<p>The deposit has been fully applied. No refund remains.</p>}
 {result.refundError&&<button type="button" className="approve" disabled={busy} onClick={confirm}>Retry remaining refund</button>}
 {result.externalRemaining>0&&!result.refundError&&onExternalReturn&&<button type="button" disabled={busy} onClick={onExternalReturn}>Record external deposit return</button>}
 </div>:<>
 <p>Review the return and select the charges to deduct. Nothing is applied or refunded until you confirm.</p>
 <fieldset disabled={busy||Boolean(request.current)} className="deposit-review-fields">
 {eligible.map(c=><label className="deposit-review-charge" key={c.id}><input type="checkbox" checked={selected.includes(c.id)} onChange={e=>setSelected(e.target.checked?[...selected,c.id]:selected.filter(id=>id!==c.id))}/><span>{c.name}</span><strong>{money(chargeRemainingCents(c))}</strong></label>)}
 <dl className="allocation-review"><dt>Deposit held</dt><dd>{money(preview.held)}</dd><dt>Apply to selected charges</dt><dd>{money(preview.applied)}</dd><dt>{preview.refund===0?'Deposit left after deductions':dueAfter>0?'Deposit remaining on hold':'Refund to customer'}</dt><dd>{money(preview.refund)}</dd>{dueAfter>0&&<><dt>Customer balance after deductions</dt><dd>{money(dueAfter)}</dd></>}</dl>
 {preview.returns.map(a=><p key={a.id}>{a.payment_provider==='stripe'?'Original Stripe payment':'External deposit'}: {money(a.deduction)} to apply{a.refund>0&&<> · {money(a.refund)} {dueAfter>0?'to hold':'to return'}</>}</p>)}
 {preview.refund===0?<p>No deposit left to refund.{dueAfter>0&&<> Customer still owes {money(dueAfter)}.</>}</p>:dueAfter>0&&<p>The remaining customer balance must be resolved before returning the deposit remainder.</p>}
 <label>Review note<textarea value={reason} onChange={e=>setReason(e.target.value)} maxLength={1000}/></label>
 {hold&&<label>Follow-up date and time (Eastern)<input type="datetime-local" value={followUp} onChange={e=>setFollowUp(e.target.value)}/></label>}
 </fieldset>
 </>}
 {error&&<p role="alert">{error}</p>}
 <div className="modal-actions">{result?<button type="button" onClick={onClose}>Done</button>:<><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button type="button" disabled={busy||reason.trim().length<5||Boolean(request.current)} onClick={async()=>{if(!hold){setHold(true);return;}setBusy(true);try{if(await onHold(reason,followUp))onClose();}catch(e){setError(e.message);}finally{setBusy(false);}}}>{hold?'Save hold':'Hold for review'}</button>{!hold&&<button type="button" className="approve" disabled={busy||reason.trim().length<5||preview.held<=0||(dueAfter>0&&preview.applied===0)} onClick={confirm}>{busy?'Processing…':preview.applied>0?`Apply ${money(preview.applied)}${preview.refund===0?' to charges':dueAfter>0?' & hold remainder':` & refund ${money(preview.refund)}`}`:`Refund ${money(preview.refund)}`}</button>}</>}</div>
 </div></section></div>,document.body);
}
