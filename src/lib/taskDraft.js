export const DRAFT_MAX_AGE_MS = 12 * 60 * 60 * 1000;
export function draftKey(owner, task) { return owner ? `rentmect:draft:v1:${owner}:${task}` : ''; }
export function readDraft(storage, key, defaults, fields, now = Date.now()) {
  if (!key) return defaults;
  try {
    const saved = JSON.parse(storage?.getItem(key) || 'null');
    if (!saved || !Number.isFinite(saved.at) || now - saved.at > DRAFT_MAX_AGE_MS) { storage?.removeItem(key); return defaults; }
    const restored = { ...defaults };
    for (const field of fields) {
      if (typeof saved.value?.[field] === typeof defaults[field]
        && ['string', 'number', 'boolean'].includes(typeof defaults[field])) restored[field] = saved.value[field];
    }
    return restored;
  } catch { return defaults; }
}
export function writeDraft(storage, key, value, fields, now = Date.now()) {
  if (!key) return;
  const selected = {};
  for (const field of fields) if (['string', 'number', 'boolean'].includes(typeof value[field])) selected[field] = value[field];
  try { storage?.setItem(key, JSON.stringify({ at: now, value: selected })); } catch { /* Drafts are optional when storage is unavailable. */ }
}
export function removeDraft(storage, key) { try { if (key) storage?.removeItem(key); } catch { /* Storage is optional. */ } }

let dialogs = 0;
const listeners = new Set();
export function trackTaskDialog() {
  dialogs++;
  listeners.forEach(listener => listener(true));
  let closed = false;
  return () => {
    if (closed) return;
    closed = true;
    dialogs = Math.max(0, dialogs - 1);
    listeners.forEach(listener => listener(dialogs > 0));
  };
}
export function subscribeTaskDialogs(listener) {
  listeners.add(listener); listener(dialogs > 0);
  return () => listeners.delete(listener);
}
