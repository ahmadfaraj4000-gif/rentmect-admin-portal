import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { draftKey, readDraft, writeDraft, removeDraft } from './lib/taskDraft.js';

export const DraftOwnerContext = createContext('');
function sessionStorageOrNull() { try { return window.sessionStorage; } catch { return null; } }

// Explicit field allowlists exclude confirmations, signatures, uploaded files,
// previews and authentication data. Restored work must be reviewed again.
export function useTaskDraft(task, initialValue, fields, explicitOwner) {
  const contextOwner = useContext(DraftOwnerContext);
  const owner = explicitOwner ?? contextOwner;
  const key = draftKey(owner, task);
  const storage = sessionStorageOrNull();
  const defaults = useRef(typeof initialValue === 'function' ? initialValue() : initialValue);
  const [state, setState] = useState(() => ({ key, value: readDraft(storage, key, defaults.current, fields) }));
  const current = useRef(state);
  if (current.current.key !== key) current.current = { key, value: readDraft(storage, key, defaults.current, fields) };
  const value = current.current.value;
  useEffect(() => { setState(current.current); }, [key]);
  const setValue = (update) => {
    const next = typeof update === 'function' ? update(current.current.value) : update;
    current.current = { key, value: next };
    writeDraft(storage, key, next, fields);
    setState(current.current);
  };
  const clear = () => removeDraft(storage, key);
  return [value, setValue, clear];
}
