import React, { useCallback, useEffect, useRef, useState } from 'react';

import { useSectionPages } from './useSectionPages.js';
import './inspection-photos.css';

const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif' };

function InspectionPhotoDialog({ client, folder, title, names, initialName, page, onClose }) {
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

  async function move(step) {
    if (page.loading) return;
    if (step === 1 && index === names.length - 1 && page.more) {
      const batch = await page.next();
      if (batch.length) setIndex(names.length);
      return;
    }
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
        : <>{!image.loaded && <span className="inspection-image-status" role="status">Loading photo…</span>}<img key={name} src={image.url} alt={title + ' · ' + (index + 1) + ' of ' + names.length}
            onLoad={() => setImage(current => current?.name === name ? { ...current, loaded: true } : current)}
            onError={() => setImage({ name, error: 'This photo could not be displayed.' })}/></>}
    </div>
    {names.length > 1 && <footer>
      <button type="button" aria-label="Previous photo" onClick={() => move(-1)}>←</button>
      <span aria-live="polite">{page.loading ? 'Loading…' : (index + 1) + ' of ' + names.length + (page.more ? '+' : '')}</span>
      <button type="button" aria-label="Next photo" onClick={() => move(1)}>→</button>
    </footer>}
    {page.error && <p role="alert">{page.error} <button type="button" onClick={() => move(1)}>Retry</button></p>}
  </dialog>;
}

function PhotoStage({ client, rentalId, staffName, stage }) {
  const folder = rentalId + '/' + stage;
  const bucket = client.storage.from('rental-inspections');
  const read = useCallback(async (offset, limit, signal) => {
    const { data, error } = await client.storage.from('rental-inspections').list(folder, {
      offset, limit, sortBy: { column: 'created_at', order: 'desc' },
    }, { signal });
    if (error) throw error;
    return data;
  }, [client, folder]);
  const page = useSectionPages(read, 10, folder);
  const photos = page.rows;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState('');
  const [deleteName, setDeleteName] = useState('');
  const input = useRef(null);
  const viewButton = useRef(null);
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
    finally { setBusy(false); page.refresh(); }
  }

  async function remove(name) {
    setBusy(true);
    setError('');
    try {
      const { data, error } = await bucket.remove([folder + '/' + name]);
      if (error) throw error;
      if (!data?.length) throw Error('Photo could not be deleted. Refresh photos to check its status.');
      setDeleteName('');
    } catch (e) { setError(e.message); }
    finally { setBusy(false); page.refresh(); }
  }

  const title = stage === 'pickup' ? 'Pickup photos' : 'Return photos';
  return <section className="inspection-stage" aria-label={title}>
    <div className="inspection-stage-heading">
      <h4>{title}</h4>
      <input ref={input} type="file" multiple accept={Object.keys(extensions).join(',')} hidden onChange={upload}/>
      <button type="button" className="inspection-add" disabled={busy || !!deleteName || !staffName} onClick={() => input.current?.click()}>{busy && !deleteName ? 'Uploading…' : 'Add ' + title.toLowerCase()}</button>
    </div>
    {photos.map(photo => <div className="inspection-photo-row" key={photo.name}>
      <small>Uploaded by {photo.name.split('-')[0]} · {new Date(photo.created_at).toLocaleString('en-US', { timeZone: 'America/New_York' })} ET</small>
      <div className="inspection-photo-actions">
        <button type="button" className="secondary-btn" disabled={busy} onClick={event => {
          viewButton.current = event.currentTarget;
          setPreview(photo.name);
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
    {page.loading && <small role="status">Loading photo list…</small>}
    {page.error && <p role="alert">{page.error} <button type="button" onClick={page.next}>Retry</button></p>}
    {page.more && !page.error && <button type="button" className="secondary-btn" disabled={page.loading} onClick={page.next}>Load more {title.toLowerCase()}</button>}
    {preview && <InspectionPhotoDialog {...{ client, folder, title }} initialName={preview} names={photos.map(item => item.name)} page={page} onClose={() => { setPreview(''); requestAnimationFrame(() => viewButton.current?.focus()); }}/>}
    {error && <p role="alert">{error} <button type="button" onClick={() => { setError(''); page.refresh(); }}>Refresh photos</button></p>}
  </section>;
}

export default function InspectionPhotos({ client, rentalId }) {
  const [open, setOpen] = useState(false);
  const [staffName, setStaffName] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open || staffName) return;
    setError('');
    let active = true;
    client.rpc('rental_operations_staff_name').then(({ data, error }) => {
      if (active) { setStaffName(data || ''); setError(error?.message || (data ? '' : 'Rental operations access required.')); }
    }, e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [client, open, staffName]);
  return <details className="rental-card-supplement" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>Vehicle inspection photos</summary>
    {open && error && <p role="alert">{error}</p>}
    {open && !error && ['pickup', 'return'].map(stage => <PhotoStage key={rentalId + stage} {...{ client, rentalId, staffName, stage }}/>)}
  </details>;
}
