import React, { useEffect, useState } from 'react';
import { appendReturnFiles } from './lib/returnEvidence.js';
import { supabase } from './lib/supabase';

function FilePreview({ file }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!file.type.startsWith('image/')) return;
    const preview = URL.createObjectURL(file);
    setUrl(preview);
    return () => URL.revokeObjectURL(preview);
  }, [file]);
  return url ? <img src={url} alt={file.name}/> : <span>Document</span>;
}

export function ReturnEvidencePicker({ files, setFiles, disabled }) {
  return <div className="return-evidence-picker">
    <label className="field-label return-evidence-upload"><span>Add photos or documents</span>
      <input type="file" multiple accept="image/*,application/pdf" disabled={disabled} onChange={(event) => {
        const selected = Array.from(event.target.files || []);
        setFiles((current) => appendReturnFiles(current, selected));
        event.target.value = '';
      }}/>
    </label>
    <small aria-live="polite">{files.length} {files.length === 1 ? 'file' : 'files'} selected. Add photos together or one at a time.</small>
    <small>Files are saved when you close the rental. Keep this form open until then.</small>
    <ul className="return-evidence-list">
      {files.map((file, index) => <li key={`${file.name}-${file.size}-${file.lastModified}-${file.type}`}>
        <FilePreview file={file}/><span>{file.name}</span>
        <button type="button" disabled={disabled} aria-label={`Remove ${file.name}`} onClick={() => setFiles((current) => current.filter((_, position) => position !== index))}>Remove</button>
      </li>)}
    </ul>
  </div>;
}

export function SavedReturnEvidence({ paths = [] }) {
  const [links, setLinks] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (!Array.isArray(paths) || !paths.length) return null;
  async function load() {
    setBusy(true);
    setError('');
    try {
      const { data, error: signError } = await supabase.storage.from('rental-documents').createSignedUrls(paths, 300);
      if (signError || data?.some((item) => item.error) || data?.length !== paths.length) throw signError || new Error('Unable to open all evidence files. Try again.');
      setLinks(data);
    } catch (err) {
      setError(err.message || 'Unable to open evidence. Try again.');
    } finally {
      setBusy(false);
    }
  }
  return <div className="saved-return-evidence">
    <button type="button" onClick={load} disabled={busy}>{busy ? 'Loading evidence…' : `View ${paths.length} evidence ${paths.length === 1 ? 'file' : 'files'}`}</button>
    {error && <small role="alert">{error}</small>}
    {links.length > 0 && <ul>{links.map((item, index) => <li key={item.path}><a href={item.signedUrl} target="_blank" rel="noopener noreferrer">Evidence {index + 1}: {item.path.split('/').pop()}</a></li>)}</ul>}
  </div>;
}
