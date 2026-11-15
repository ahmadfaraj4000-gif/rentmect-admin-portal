import {chargeRemainingCents} from './paymentAllocation.js';
export function depositReviewPreview(allocations,charges,selected,credits=[],includeCredit=true) {
 const deposits=allocations.map(a=>({...a,kind:'deposit',remaining:Math.max(0,Math.round(Number(a.amount_held||0)*100)-Math.round(Number(a.amount_applied||0)*100)-Math.round(Number(a.amount_released||0)*100))})).filter(a=>a.remaining>0).sort((a,b)=>Number(b.payment_provider==='local')-Number(a.payment_provider==='local')||a.id.localeCompare(b.id));
 const creditSources=includeCredit?credits.filter(c=>c.remaining>0).map(c=>({...c,kind:'credit'})).sort((a,b)=>a.id.localeCompare(b.id)):[];
 const held=deposits.reduce((s,a)=>s+a.remaining,0),credit=creditSources.reduce((s,a)=>s+a.remaining,0);
 const chargesTotal=charges.filter(c=>selected.includes(c.id)).reduce((s,c)=>s+chargeRemainingCents(c),0);
 let toApply=Math.min(held+credit,chargesTotal);
 const returns=[...deposits,...creditSources].map(a=>{const deduction=Math.min(toApply,a.remaining);toApply-=deduction;return {...a,deduction,refund:a.remaining-deduction};});
 return {held,credit,chargesTotal,applied:Math.min(held+credit,chargesTotal),refund:Math.max(0,held+credit-chargesTotal),returns};
}

export function creditReturnHistory(sources=[]) {
 return sources.filter(s=>s.refund_cents>0).map(s=>({id:`return-credit-${s.review_id}-${s.source_receipt_id}`,kind:'refund',refund:true,amount:Number(s.refund_cents)/100,date:s.returned_at||s.created_at,status:s.status,provider:s.provider,method:s.payout_method||s.payment_method,reference:s.payout_reference,label:'Customer credit return',moneyReturned:s.status==='succeeded'}));
}
