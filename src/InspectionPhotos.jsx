import React, { useEffect, useRef, useState } from 'react';

import './inspection-photos.css';

const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif' };

function InspectionPhotoDialog({ client, folder, title, names, initialName, onClose }) {
  const dialog = useRef(null);
  const [index, setIndex] = useState(() => names.indexOf(initialName));
  const [image, setImage] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const name = names[index];

  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const { data, error } = await client.storage.from('rental-inspections').createSignedUrl(folder + '/' + name, 120);
        if (error) throw error;
        if (active) setImage({ name, url: data.signedUrl });
      } catch (e) {
        if (active) setImage({ name, error: e.message || 'Photo could not be loaded.' });
      }
    }
    load();
    return () => { active = false; };
  }, [client, folder, name, attempt]);

  function move(step) {
    setIndex(current => (current + step + names.length) % names.length);
  }

  return <dialog ref={dialog} className="inspection-photo-dialog" aria-label={title}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onKeyDown={event => {
      if (names.length === 1 || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      move(event.key === 'ArrowRight' ? 1 : -1);
    }}>
    <header><strong>{title}</strong><button type="button" autoFocus onClick={onClose}>Close photo</button></header>
    <div className="inspection-photo-canvas">
      {image?.name !== name ? <span role="status">Loading photo…</span>
        : image.error ? <div role="alert">{image.error} <button type="button" onClick={() => { setImage(null); setAttempt(n => n + 1); }}>Retry</button></div>
        : <img key={name} src={image.url} alt={title + ' · ' + (index + 1) + ' of ' + names.length}
            onError={() => setImage({ name, error: 'This photo could not be displayed.' })}/>}
    </div>
    {names.length > 1 && <footer>
      <button type="button" aria-label="Previous photo" onClick={() => move(-1)}>←</button>
      <span aria-live="polite">{index + 1} of {names.length}</span>
      <button type="button" aria-label="Next photo" onClick={() => move(1)}>→</button>
    </footer>}
  </dialog>;
}

function PhotoStage({ client, rentalId, staffName, stage }) {
  const folder = rentalId + '/' + stage;
  const bucket = client.storage.from('rental-inspections');
  const [photos, setPhotos] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [preview, setPreview] = useState('');
  const [deleteName, setDeleteName] = useState('');
  const input = useRef(null);
  const viewButton = useRef(null);
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

  async function remove(name) {
    setBusy(true);
    setError('');
    try {
      const { data, error } = await bucket.remove([folder + '/' + name]);
      if (error) throw error;
      if (!data?.length) throw Error('Photo could not be deleted. Refresh photos to check its status.');
      setPhotos(items => items.filter(item => item.name !== name));
      setDeleteName('');
    } catch (e) { setError(e.message); }
    finally { setBusy(false); setRevision(n => n + 1); }
  }

  const title = stage === 'pickup' ? 'Pickup photos' : 'Return photos';
  return <section className="inspection-stage" aria-label={title}>
    <div className="inspection-stage-heading">
      <h4>{title}</h4>
      <input ref={input} type="file" multiple accept={Object.keys(extensions).join(',')} hidden onChange={upload}/>
      <button type="button" className="inspection-add" disabled={busy || !!deleteName} onClick={() => input.current?.click()}>{busy && !deleteName ? 'Uploading…' : 'Add ' + title.toLowerCase()}</button>
    </div>
    {photos.map(photo => <div className="inspection-photo-row" key={photo.name}>
      <small>Uploaded by {photo.name.split('-')[0]} · {new Date(photo.created_at).toLocaleString('en-US', { timeZone: 'America/New_York' })} ET</small>
      <div className="inspection-photo-actions">
        <button type="button" className="secondary-btn" disabled={busy} onClick={event => {
          viewButton.current = event.currentTarget;
          setPreview({ initialName: photo.name, names: photos.map(item => item.name) });
        }}>View photo</button>
        <button type="button" className="inspection-delete" disabled={busy} onClick={() => setDeleteName(photo.name)}>Delete photo</button>
      </div>
      {deleteName === photo.name && <div className="inspection-confirm">
        <strong>Permanently delete this {stage} photo?</strong>
        <div className="inspection-photo-actions">
          <button type="button" className="secondary-btn" disabled={busy} onClick={() => setDeleteName('')}>Cancel</button>
          <button type="button" className="inspection-delete-confirm" disabled={busy} onClick={() => remove(photo.name)}>{busy ? 'Deleting…' : 'Delete permanently'}</button>
        </div>
      </div>}
    </div>)}
    {preview && <InspectionPhotoDialog {...{ client, folder, title }} {...preview} onClose={() => { setPreview(null); requestAnimationFrame(() => viewButton.current?.focus()); }}/>}
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
