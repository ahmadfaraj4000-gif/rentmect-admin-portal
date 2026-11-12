import React,{useState} from 'react';
export function ReceiptActions({payment,onAction,canRefund}) {
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [form,setForm]=useState({paymentMethod:payment.method||'other',receivedDate:payment.receivedDate||'',receivedTime:payment.receivedTime||'',reference:payment.reference||'',notes:payment.notes||'',reason:'',confirmRefund:false});
 const change=(key,value)=>setForm(f=>({...f,[key]:value}));
 async function save(action){if(busy)return;setBusy(true);setError('');try{await onAction(payment.correctableReceiptId||payment.legacySource?.id,{...form,legacySource:payment.legacySource},payment.flexibleReceipt && action==='correct' ? 'flexcorrect' : payment.legacySource?'legacycorrect':action);setOpen(false);}catch(e){setError(e.message);}finally{setBusy(false);}}
 if(payment.flexibleReceipt && payment.status==='refunded') return <small>Receipt reversed · original posting retained</small>;
 if(!open)return <button type="button" onClick={()=>setOpen(true)}>Payment details / correction</button>;
 return <div className="receipt-correction">
  {payment.flexibleReceipt && payment.provider==='external' && <label>Payment method<select value={form.paymentMethod} onChange={e=>change('paymentMethod',e.target.value)} disabled={busy}>{[['cash','Cash'],['cash_app','Cash App'],['terminal','Card terminal'],['card','External card'],['bank_transfer','Bank transfer'],['other','Other']].map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></label>}
  <label>Date received<input type="date" value={form.receivedDate} onChange={e=>change('receivedDate',e.target.value)} disabled={busy}/></label>
  <label>Time received (Eastern, optional)<input type="time" value={form.receivedTime} onChange={e=>change('receivedTime',e.target.value)} disabled={busy}/></label>
  <label>Reference<input value={form.reference} maxLength={120} onChange={e=>change('reference',e.target.value)} disabled={busy}/></label>
  <label>Payment notes<textarea value={form.notes} maxLength={2000} onChange={e=>change('notes',e.target.value)} disabled={busy}/></label>
  <label>Reason for correction / refund<textarea value={form.reason} maxLength={500} onChange={e=>change('reason',e.target.value)} disabled={busy}/></label>
  {payment.provider!=='credit' && payment.provider!=='stripe' && <button type="button" disabled={busy||form.reason.trim().length<5||!form.receivedDate} onClick={()=>save('correct')}>Save payment details</button>}
  {canRefund&&payment.refundBlockReason&&<p role="status">{payment.refundBlockReason}</p>}
  {canRefund&&!payment.legacySource&&!payment.refundBlockReason&&payment.provider!=='stripe'&&<><label><input type="checkbox" checked={form.confirmRefund} disabled={busy} onChange={e=>change('confirmRefund',e.target.checked)}/>{payment.provider==='credit' ? 'Reverse this credit application. Its allocations will become due again and the credit will be restored.' : 'I confirm the entire payment has been returned externally. Its allocations will become due again.'}</label><button type="button" disabled={busy||!form.confirmRefund||form.reason.trim().length<5} onClick={()=>save('refund')}>{payment.provider==='credit' ? 'Reverse credit application' : 'Record full receipt refund'}</button></>}
  <button type="button" disabled={busy} onClick={()=>setOpen(false)}>Close</button>{error&&<p role="alert">{error}</p>}
 </div>;
}
