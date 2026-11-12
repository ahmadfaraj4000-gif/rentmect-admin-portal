// Session-scoped, read-only ticket flag loader. One request at a time; failures
// affect only that batch and never erase a previously confirmed customer flag.
export function createCustomerTicketFlagStore({ fetchFlags, onChange, onError = () => {}, setTimer = setTimeout, clearTimer = clearTimeout,
  debounceMs = 100, retryMs = 1000, maxRetryMs = 30000, deadlineMs = 25000 } = {}) {
  const users = new Map(), entries = new Map(), dirty = new Set();
  let timer = null, flight = null, disposed = false, failures = 0;
  const publish = () => { if (!disposed) onChange(new Map(entries)); };
  const transient = error => error?.code === '57014' || [408,429,500,502,503,504].includes(Number(error?.status))
    || /failed to fetch|fetch failed|network|load failed|connection|timed out|timeout|took too long|502|503|504/i.test(error?.message || '');
  function schedule(delay = debounceMs) {
    if (disposed || flight || timer !== null || !dirty.size) return;
    timer = setTimer(() => { timer = null; void load(); }, delay);
  }
  async function load() {
    if (disposed || flight) return;
    const ids = [...dirty].filter(id => users.has(id));
    dirty.clear();
    if (!ids.length) return;
    const controller = new AbortController(); flight = controller;
    let needsRetry = false;
    try {
      for (let offset = 0; offset < ids.length && !disposed; offset += 500) {
        const batch = ids.slice(offset, offset + 500).filter(id => users.has(id));
        if (!batch.length) continue;
        let deadline;
        try {
          const result = await Promise.race([
            Promise.resolve().then(() => fetchFlags(batch, controller.signal)),
            new Promise((_, reject) => { deadline = setTimer(() => {
              const error = new Error('Ticket flag lookup timed out.'); error.code = '57014';
              reject(error); controller.abort();
            }, deadlineMs); }),
          ]);
          if (disposed) return;
          if (result.error) throw Object.assign(new Error(result.error.message || 'Ticket flag lookup failed.'), { code: result.error.code, status: result.status });
          if (!Array.isArray(result.data)) throw new Error('Ticket flag service returned an invalid response.');
          for (const id of batch) if (users.has(id)) entries.set(id, { rows: result.data.filter(row => row.user_id === id), checked: true, error: '', retrying: false });
        } catch (error) {
          if (disposed) return;
          const retrying = transient(error);
          for (const id of batch) if (users.has(id)) {
            entries.set(id, { ...entries.get(id), error: error.message || 'Ticket flag lookup failed.', retrying });
            if (retrying) dirty.add(id);
          }
          needsRetry ||= retrying;
          // Do not log customer IDs, notes, or ticket contents.
          onError({ operation: 'admin_ticket_customer_flags', code: error.code || '', status: error.status || 0, retrying });
        } finally { clearTimer(deadline); }
        publish();
        if (controller.signal.aborted) {
          ids.slice(offset + 500).forEach(id => { if (users.has(id)) dirty.add(id); });
          break;
        }
      }
    } finally {
      flight = null;
      if (needsRetry) failures++; else failures = 0;
      schedule(needsRetry ? Math.min(maxRetryMs, retryMs * 2 ** Math.min(failures - 1, 5)) : debounceMs);
    }
  }
  function refresh() {
    if (disposed) return;
    for (const id of users.keys()) dirty.add(id);
    failures = 0;
    if (timer !== null) { clearTimer(timer); timer = null; }
    schedule();
  }
  return {
    register(id) {
      if (!id || disposed) return () => {};
      const count = users.get(id) || 0; users.set(id, count + 1);
      if (!count) { entries.set(id, { rows: [], checked: false, error: '', retrying: false }); dirty.add(id); schedule(); }
      let registered = true;
      return () => {
        if (!registered || disposed) return; registered = false;
        const remaining = (users.get(id) || 1) - 1;
        if (remaining) users.set(id, remaining);
        else { users.delete(id); entries.delete(id); dirty.delete(id); }
      };
    },
    refresh,
    dispose() { disposed = true; clearTimer(timer); flight?.abort(); users.clear(); entries.clear(); dirty.clear(); },
  };
}
