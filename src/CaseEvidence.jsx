import React,{useEffect,useRef,useState} from 'react';
import {optimizeVehicleImage} from './lib/imageOptimizer.js';

export function CaseEvidence({client,reportId,onBusy}) {
 const [expanded,setExpanded]=useState(false),[offset,setOffset]=useState(0),[revision,setRevision]=useState(0),[page,setPage]=useState({rows:[],has_more:false});
 const [loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState(''),[queue,setQueue]=useState([]),[opened,setOpened]=useState(null);
 const openRequest=useRef(0);
 useEffect(()=>{if(!expanded)return;const abort=new AbortController();setLoading(true);setError('');setPage({rows:[],has_more:false});setOpened(null);openRequest.current++;
 client.rpc('admin_case_evidence_page',{p_report_id:reportId,p_offset:offset}).abortSignal(abort.signal).then(({data,error})=>{if(abort.signal.aborted)return;if(error)throw error;setPage(data);}).catch(e=>{if(!abort.signal.aborted)setError(e.message);}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});return()=>abort.abort();},[expanded,offset,revision,reportId]);
 useEffect(()=>()=>{openRequest.current++;},[]);
 function select(files){if(files.length>10){setError('Choose up to 10 photos per upload batch.');return;}setError('');setQueue(files.map(file=>({file,id:crypto.randomUUID()})));}
 async function upload(){setBusy(true);onBusy(true);setError('');let remaining=[...queue];try{
  for(const item of queue){setStatus(`Compressing and uploading ${queue.length-remaining.length+1} of ${queue.length}…`);
   item.optimized??=await optimizeVehicleImage(item.file);
   const prepared=await client.rpc('admin_case_evidence_save',{p_report_id:reportId,p_id:item.id,p_action:'prepare',p_name:item.optimized.name,p_size:item.optimized.size});if(prepared.error)throw prepared.error;
   if(!prepared.data.uploaded_at){const uploaded=await client.storage.from('damage-case-evidence').upload(prepared.data.object_path,item.optimized,{contentType:'image/webp',upsert:false});if(uploaded.error&&String(uploaded.error.statusCode)!=='409')throw uploaded.error;
    const completed=await client.rpc('admin_case_evidence_save',{p_report_id:reportId,p_id:item.id,p_action:'complete'});if(completed.error)throw completed.error;
   }
   remaining=remaining.slice(1);setQueue(remaining);
  }
  setStatus('Photos saved to this case. Open evidence to view them.');
 }catch(e){setError(`${e.message||'Upload failed.'} Completed photos are saved; retry the remaining photos.`);setStatus('');}
 finally{setBusy(false);onBusy(false);setRevision(v=>v+1);}}
 async function open(item){const request=++openRequest.current;setError('');setOpened({id:item.id,loading:true});try{const {data,error}=await client.storage.from(item.bucket).createSignedUrl(item.object_path,300);if(error)throw error;if(request===openRequest.current)setOpened({...item,url:data.signedUrl});}catch(e){if(request===openRequest.current){setOpened(null);setError(e.message||'Unable to open photo. Retry.');}}}
 return <section className="case-evidence" aria-label="Case photos and evidence">
 <h3>Photos &amp; evidence</h3>
 <label>Add photos<input type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e=>{select(Array.from(e.target.files||[]));e.target.value='';}}/></label>
 <small>JPG, PNG or WebP · up to 15 MB each · 10 per batch. Photos are compressed before upload. Keep the case open until saved.</small>
 {queue.length>0&&<div><p>{queue.length} photos ready{queue[0]?.optimized?' to retry':''}.</p><button disabled={busy} onClick={upload}>{busy?'Uploading…':'Upload photos'}</button><button disabled={busy} onClick={()=>setQueue([])}>Clear selection</button></div>}
 {status&&<p role="status">{status}</p>}{error&&<p role="alert">{error}</p>}
 <button disabled={busy} onClick={()=>{setExpanded(v=>!v);setOpened(null);openRequest.current++;}}>{expanded?'Hide evidence':'View evidence'}</button>
 {expanded&&<><div className="case-evidence-pages"><button disabled={loading||busy||offset===0} onClick={()=>setOffset(v=>Math.max(0,v-8))}>Previous evidence</button><span>Page {offset/8+1}</span><button disabled={loading||busy||!page.has_more} onClick={()=>setOffset(v=>v+8)}>Next evidence</button><button disabled={loading||busy} onClick={()=>setRevision(v=>v+1)}>Refresh evidence</button></div>
 {loading?<p role="status">Loading evidence list…</p>:!page.rows.length?<p>No evidence on this page.</p>:<ul>{page.rows.map(item=><li key={item.id}><span>{item.file_name}</span><button disabled={busy} onClick={()=>open(item)}>Open file</button></li>)}</ul>}
 {opened&&<div className="case-evidence-preview">{opened.loading?<p role="status">Opening file…</p>:<><button onClick={()=>{openRequest.current++;setOpened(null);}}>Close file</button>{/\.(webp|jpg|jpeg|png)$/i.test(opened.object_path)?<img src={opened.url} alt={opened.file_name} onError={()=>{setOpened(null);setError('Photo could not load. Open it again to retry.');}}/>:<a href={opened.url} target="_blank" rel="noopener noreferrer">Open document</a>}</>}</div>}</>}
 </section>;
}
