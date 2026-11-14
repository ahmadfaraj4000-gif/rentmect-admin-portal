import React, {useEffect, useRef, useState} from 'react';
import {useTaskDraft} from './useTaskDraft.js';
import {trackTaskDialog} from './lib/taskDraft.js';

export function RentalRateChange({rental, client, initialEffectiveAt, toIso, formatDate, onClose, onApply}) {
 const dialog=useRef(null),review=useRef(null);
 const [form,setForm,clearDraft]=useTaskDraft(`RentalRateChange:${rental.id}`,{effectiveAt:initialEffectiveAt,dailyRate:'',reason:''},['effectiveAt','dailyRate','reason']);
 const [preview,setPreview]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[key,setKey]=useState(()=>crypto.randomUUID());
 const money=n=>Number(n||0).toLocaleString('en-US',{style:'currency',currency:'USD'});
 useEffect(()=>trackTaskDialog(),[]);
 useEffect(()=>{const old=document.activeElement,overflow=document.body.style.overflow;document.body.style.overflow='hidden';dialog.current?.focus();return()=>{document.body.style.overflow=overflow;old?.focus?.();};},[]);
 function change(field,value){setForm(f=>({...f,[field]:value}));setPreview(null);setError('');setKey(crypto.randomUUID());}
 function args(){const effective=toIso(form.effectiveAt);if(!effective)throw Error('Choose a valid start date and time (Eastern).');return{p_rental_id:rental.id,p_effective_at:effective,p_daily_rate:Number(form.dailyRate),p_reason:form.reason.trim()};}
 async function check(e){e.preventDefault();setBusy(true);setError('');try{const{data,error}=await client.rpc('admin_preview_rental_rate_change',args());if(error)throw error;setPreview(data);requestAnimationFrame(()=>review.current?.scrollIntoView({block:'nearest'}));}catch(e){setError(e.message);}finally{setBusy(false);}}
 async function save(){setBusy(true);setError('');try{const data=await onApply(rental,{...form,operation:'rate_change',revision:preview.revision},key);if(!data)throw Error('The price change was not saved.');clearDraft();onClose();}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <div className="admin-modal-backdrop rental-amendment-backdrop"><form ref={dialog} className="admin-modal rental-amendment-modal" role="dialog" aria-modal="true" aria-label="Change rental price" tabIndex={-1} onSubmit={check} onKeyDown={e=>{if(e.key==='Escape'&&!busy)onClose();if(e.key==='Tab'){const items=[...dialog.current.querySelectorAll('button,input,textarea')].filter(n=>!n.disabled&&n.getClientRects().length),first=items[0],last=items.at(-1);if(e.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}}}>
  <header className="admin-modal-header"><div><strong>Change rental price</strong><span>{rental.profiles?.full_name} · {rental.vehicles?.name}</span></div><button type="button" className="admin-close-button" disabled={busy} onClick={onClose} aria-label="Close price change">×</button></header>
  <div className="rental-amendment-scroll">
   <p>Choose when the new price starts. Earlier dates keep their existing charges. The new rate applies from that time through the booked return.</p>
   <fieldset disabled={busy} className="rental-amendment-grid" style={{border:0,padding:0,margin:0}}>
    <label><span>Change price starting on (Eastern)</span><input type="datetime-local" required value={form.effectiveAt} onChange={e=>change('effectiveAt',e.target.value)}/></label>
    <label><span>New daily rate</span><input type="number" required min="0" max="100000" step="0.01" inputMode="decimal" value={form.dailyRate} onChange={e=>change('dailyRate',e.target.value)}/></label>
    <label className="wide"><span>Reason and customer agreement</span><textarea required maxLength={1000} value={form.reason} onChange={e=>change('reason',e.target.value)}/></label>
   </fieldset>
   {preview&&<section ref={review} className="rental-amendment-preview" aria-live="polite"><strong>Review price change</strong>
    <p>Before {formatDate(preview.effective_at)}: existing charges stay the same.</p>
    {preview.periods.map((p,i)=><p key={i}>{formatDate(p.from)} → {formatDate(p.until)}: {money(p.old_rate)}/day → <strong>{money(p.new_rate)}/day</strong></p>)}
    <p>Part-days are prorated. Existing discounts are preserved.</p>
    <div className="rental-amendment-ledger"><span>Price adjustment, including tax <strong>{Number(preview.total_delta)<0?'−':'+'}{money(Math.abs(Number(preview.total_delta)))}</strong></span><span>Balance after change <strong>{money(preview.balance_due)}</strong></span>{Number(preview.credit_due)>0&&<span>Customer credit after change <strong>{money(preview.credit_due)}</strong></span>}<span>Deposit held <strong>{money(preview.deposit_held)}</strong></span></div>
    <p>Recorded payments stay unchanged. Saving does not charge or refund money. The customer will need to sign the updated agreement.</p>
   </section>}
   {error&&<p role="alert" className="form-error">{error}</p>}
  </div>
  <footer className="rental-amendment-actions"><button type="button" disabled={busy} onClick={onClose}>Cancel</button>{preview?<button type="button" className="primary-btn" disabled={busy} onClick={save}>{busy?'Saving…':'Confirm price change'}</button>:<button className="primary-btn" disabled={busy}>{busy?'Reviewing…':'Review price change'}</button>}</footer>
 </form></div>;
}
