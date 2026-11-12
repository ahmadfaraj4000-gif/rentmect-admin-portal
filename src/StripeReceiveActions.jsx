import React, {useRef,useState} from 'react';
const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n);
export function StripeReceiveActions({targets=[],onCreate,onEmail,onOpen,onSavedCard,protectedDeposit=0,disabled=false}) {
 const [selected,setSelected]=useState(targets[0]?.id||'');
 const [amount,setAmount]=useState(String(targets[0]?.amount||'')),[paid,setPaid]=useState(false);
 const [url,setUrl]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[copied,setCopied]=useState(false);
 const lock=useRef(false);
 const target=targets.find(t=>t.id===selected);
 async function act(kind){
  if(disabled||lock.current||!target)return;
  const value=Number(amount);
  if(!Number.isFinite(value)||value<0.5||value>target.amount||!/^\d+(\.\d{1,2})?$/.test(amount)){setError('Enter an amount from $0.50 to the selected balance, with no more than two decimal places.');return;}
  if(target.id==='rental'&&value<target.amount&&target.amount-value<protectedDeposit-0.005){setError(`Leave the ${money(protectedDeposit)} refundable deposit for the final Stripe payment, or collect the full balance.`);return;}
  lock.current=true;setBusy(true);setError('');setCopied(false);
  try{
   if(kind==='saved'){if(target.id!=='rental' && (value!==target.amount||!target.charge))throw Error('Select the full charge balance for the existing saved-card flow.');const success=await onSavedCard({...target,amount:value});if(success)setPaid(true);return;}
   if(kind==='open'){await onOpen({...target,amount:value});return;}
   const link=url||await onCreate({...target,amount:value});
   if(!link||!/^https:\/\//.test(link))throw Error('Stripe did not return a payment link. Please try again.');
   setUrl(link);
   if(kind==='copy'){try{await navigator.clipboard.writeText(link);setCopied(true);}catch{setError('Copy was blocked. Select the Stripe link below and copy it.');}}
   if(kind==='email'||kind==='create')onEmail?.(target,link,kind==='email'?'email':'');
  }catch(e){setError(e.message||'The Stripe payment link could not be created.');}
  finally{lock.current=false;setBusy(false);}
 }
 return <section className="rp-stripe" aria-label="Stripe payments">
  <h3>Stripe</h3><p>Create a secure checkout link, copy it, or review an email to the customer. Payment is recorded after Stripe confirms it.</p>
  {targets.length>0?<label className="rp-field"><span>Stripe payment for</span><select aria-label="Stripe payment for" value={selected} disabled={disabled||busy} onChange={e=>{setSelected(e.target.value);setAmount(String(targets.find(t=>t.id===e.target.value)?.amount||''));setPaid(false);setUrl('');setError('');setCopied(false);}}>{targets.map(t=><option key={t.id} value={t.id}>{t.label} · {money(t.amount)}</option>)}</select></label>:<p>No unpaid rental balance or additional charges are available for Stripe checkout.</p>}
  {target&&<label className="rp-field"><span>Payment amount</span><input aria-label="Stripe payment amount" type="text" inputMode="decimal" value={amount} disabled={disabled||busy||paid||target.id!=='rental'} onChange={e=>{setAmount(e.target.value);setUrl('');setError('');setCopied(false);}}/></label>}
  {paid&&<p role="status">Stripe confirmed the saved-card payment.</p>}
  <div className="rp-stripe-actions">
   <button type="button" disabled={disabled||busy||paid||!target||!onOpen} onClick={()=>act('open')}>Open Stripe checkout</button>
   {onSavedCard&&<button type="button" disabled={disabled||busy||paid||!target||(target.id!=='rental'&&(!target.charge||Number(amount)!==target.amount))} onClick={()=>act('saved')}>Charge saved card{target?` · ${money(Number(amount)||0)}`:''}</button>}
   <button type="button" disabled={disabled||busy||paid||!target} onClick={()=>act('create')}>{busy?'Preparing Stripe…':'Send Stripe link'}</button>
   <button type="button" disabled={disabled||busy||paid||!target} onClick={()=>act('copy')}>{copied?'Copied':'Copy link'}</button>
   <button type="button" disabled={disabled||busy||paid||!target||!onEmail} onClick={()=>act('email')}>Email link</button>
  </div>
  {url&&<label className="rp-field"><span>Stripe checkout link</span><input aria-label="Stripe checkout link" readOnly value={url} onFocus={e=>e.target.select()}/><a href={url} target="_blank" rel="noreferrer">Open Stripe checkout</a></label>}
  {error&&<p role="alert">{error}</p>}
 </section>;
}
