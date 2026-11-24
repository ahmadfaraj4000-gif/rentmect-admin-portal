import React, { useEffect, useRef, useState } from 'react';

const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif' };

function PhotoStage({ client, rentalId, staffName, stage }) {
  const folder = rentalId + '/' + stage;
  const bucket = client.storage.from('rental-inspections');
  const [photos, setPhotos] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [preview, setPreview] = useState('');
  const input = useRef(null);
  useEffect(() => {
    let active = true;
    async function load() {
      const items = [];
      for (let offset = 0; ; offset += 100) {
        const { data, error } = await client.storage.from('rental-inspections').list(folder, {
          limit: 100, offset, sortBy: { column: 'name', order: 'asc' },
        });
        if (error) throw error;
        if (!active) return;
        items.push(...data);
        if (data.length < 100) break;
      }
      setPhotos(items.sort((a, b) => b.created_at.localeCompare(a.created_at)));
    }
    load().catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [client, folder, revision]);

  async function upload(event) {
    const files = Array.from(event.target.files);
    event.target.value = '';
    setBusy(true);
    setError('');
    try {
      for (const file of files) {
        if (!extensions[file.type] || file.size > 20 * 1024 * 1024) throw Error(file.name + ' must be a supported image under 20 MB.');
      }
      for (const file of files) {
        const path = folder + '/' + staffName + '-' + crypto.randomUUID() + '.' + extensions[file.type];
        const { error } = await bucket.upload(path, file, { contentType: file.type, upsert: false });
        if (error) throw Error(file.name + ': ' + error.message);
      }
    } catch (e) { setError(e.message); }
    finally { setBusy(false); setRevision(n => n + 1); }
  }

  async function view(name) {
    setError('');
    try {
      const { data, error } = await bucket.createSignedUrl(folder + '/' + name, 120);
      if (error) throw error;
      setPreview(data.signedUrl);
    } catch (e) { setError(e.message); }
  }

  const title = stage === 'pickup' ? 'Pickup photos' : 'Return photos';
  return <section aria-label={title}>
    <h4>{title}</h4>
    <input ref={input} type="file" multiple accept={Object.keys(extensions).join(',')} hidden onChange={upload}/>
    <button type="button" className="secondary-btn" disabled={busy} onClick={() => input.current?.click()}>{busy ? 'Uploading…' : 'Add ' + title.toLowerCase()}</button>
    {photos.map(photo => <p key={photo.name}><button type="button" className="secondary-btn" onClick={() => view(photo.name)}>View photo</button>{' '}Uploaded by {photo.name.split('-')[0]} · {new Date(photo.created_at).toLocaleString('en-US', { timeZone: 'America/New_York' })} ET</p>)}
    {preview && <div><img src={preview} alt={title + ' inspection'} style={{ maxWidth: '100%', maxHeight: '55vh' }}/><button type="button" className="secondary-btn" onClick={() => setPreview('')}>Close photo</button></div>}
    {error && <p role="alert">{error} <button type="button" onClick={() => { setError(''); setRevision(n => n + 1); }}>Refresh photos</button></p>}
  </section>;
}

export default function InspectionPhotos({ client, rentalId }) {
  const [open, setOpen] = useState(false);
  const [staffName, setStaffName] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    let active = true;
    client.rpc('rental_operations_staff_name').then(({ data, error }) => {
      if (active) { setStaffName(data || ''); setError(error?.message || (data ? '' : 'Rental operations access required.')); }
    }, e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [client, open]);
  return <details className="rental-card-supplement" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>Vehicle inspection photos</summary>
    {open && error && <p role="alert">{error}</p>}
    {open && staffName && ['pickup', 'return'].map(stage => <PhotoStage key={rentalId + stage} {...{ client, rentalId, staffName, stage }}/>)}
  </details>;
}
