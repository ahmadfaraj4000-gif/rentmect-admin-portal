import { useCallback, useEffect, useRef, useState } from 'react';

// Readers return one extra row to indicate whether there is another page.
export function useSectionPages(read, size, key, enabled = true) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [more, setMore] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const cursor = useRef(null);

  const next = useCallback(async () => {
    const page = cursor.current;
    if (!page || page.pending || page.done) return [];
    page.pending = true;
    setLoading(true);
    setError('');
    try {
      const data = await read(page.offset, size + 1, page.controller.signal);
      if (cursor.current !== page) return [];
      const batch = data.slice(0, size);
      page.offset += batch.length;
      page.done = data.length <= size;
      setRows(previous => [...previous, ...batch]);
      setMore(!page.done);
      return batch;
    } catch (e) {
      if (cursor.current === page) setError(e.message || 'Unable to load records.');
      return [];
    } finally {
      page.pending = false;
      if (cursor.current === page) setLoading(false);
    }
  }, [read, size]);

  useEffect(() => {
    setRows([]); setMore(false); setError(''); setLoading(false);
    if (!enabled) return;
    const controller = new AbortController();
    cursor.current = { offset: 0, pending: false, done: false, controller };
    void next();
    return () => { cursor.current = null; controller.abort(); };
  }, [enabled, key, revision, next]);
  return { rows, loading, more, error, next, refresh: () => setRevision(n => n + 1) };
}
