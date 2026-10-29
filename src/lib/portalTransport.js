// Bound the complete response (including its body). A lost write response is
// an unknown outcome, never an instruction to submit the write again.
export const REQUEST_TIMEOUT_MS = 30_000;
export const UPLOAD_TIMEOUT_MS = 90_000;
const READ_RPC = /^(get_|is_|admin_preview_|admin_rental_(list|detail|details|change_context|vehicle_availability)$)/;
// Supabase sends RPC reads as POST. Keep these explicit so ticket mutations
// retain protection against replay after an interrupted response.
const TICKET_READ_RPC = new Set([
  'admin_ticket_list', 'admin_ticket_detail', 'admin_ticket_vehicles',
  'admin_ticket_lookup', 'admin_ticket_candidates', 'admin_ticket_customer_flags',
  'admin_performance_report',
]);
const isReadRpc = name => READ_RPC.test(name) || TICKET_READ_RPC.has(name);
function isStoredRead(entry) {
  // Older builds incorrectly persisted ticket reads as uncertain writes.
  // Only remove entries whose RPC URL proves that they are read-only.
  try {
    const url = new URL(entry.key, 'https://recovery.invalid');
    return url.pathname.startsWith('/rest/v1/rpc/') && isReadRpc(url.pathname.split('/').at(-1));
  } catch { return false; }
}

export function describeRequest(input, options = {}) {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  const method = (options.method || input.method || 'GET').toUpperCase();
  let body = {};
  try { body = JSON.parse(options.body || '{}'); } catch { /* File uploads have no JSON fields. */ }
  const route = url.pathname.split('/').at(-1);
  const rpc = url.pathname.includes('/rest/v1/rpc/');
  const read = ['GET', 'HEAD', 'OPTIONS'].includes(method)
    || (rpc && isReadRpc(route))
    || url.pathname.startsWith('/auth/')
    || url.pathname.includes('/storage/v1/object/sign/')
    || url.pathname.includes('/storage/v1/object/list/')
    || (rpc && route === 'record_admin_audit_event');
  const rentalId = body.rentalId || body.p_rental_id || null;
  const chargeId = body.chargeId || body.p_charge_id || null;
  const target = rentalId ? `rental:${rentalId}` : chargeId ? `charge:${chargeId}`
    : `${url.pathname}?${url.searchParams.toString()}`;
  return { read, background: rpc && route === 'admin_record_performance', key: target, rentalId, chargeId,
    label: String(body.action || route).replaceAll('_', ' '),
    upload: url.pathname.includes('/storage/v1/object/') && !read };
}

export function createPortalTransport({ fetch: fetchImpl, storage, now = Date.now,
  timeoutMs = REQUEST_TIMEOUT_MS, uploadTimeoutMs = UPLOAD_TIMEOUT_MS, onActivity } = {}) {
  let owner = '';
  let entries = new Map();
  const listeners = new Set();
  const storageKey = () => `rentmect:pending-operations:v1:${owner}`;
  const snapshot = () => [...entries.values()].filter(entry => entry.status === 'unknown');
  function publish() {
    if (owner) {
      try { storage?.setItem(storageKey(), JSON.stringify([...entries.values()])); } catch { /* Keep in-memory protection. */ }
    }
    listeners.forEach(listener => listener(snapshot()));
  }
  function setOwner(id) {
    if (owner === (id || '')) return;
    owner = id || '';
    entries = new Map();
    if (owner) {
      try {
        const saved = JSON.parse(storage?.getItem(storageKey()) || '[]');
        if (Array.isArray(saved)) saved.forEach(entry => {
          if (entry && typeof entry.key === 'string' && !isStoredRead(entry)) entries.set(entry.key, { ...entry, status: 'unknown' });
        });
      } catch { /* Corrupt storage must not stop sign-in. */ }
    }
    publish();
  }
  async function boundedFetch(input, options = {}) {
    const request = describeRequest(input, options);
    const requestOwner = owner;
    const tracked = !request.read && !request.background && Boolean(owner);
    if (tracked && entries.has(request.key)) {
      throw new Error('This task is still processing or needs its saved result checked. Use Check saved result before submitting it again.');
    }
    if (tracked) {
      entries.set(request.key, { ...request, startedAt: now(), status: 'sending' });
      publish();
    }
    const activity = delta => { try { if (!request.background) onActivity?.(delta); } catch { /* Optional observation cannot affect requests. */ } };
    activity(1);
    const controller = new AbortController();
    const originalSignal = options.signal || input.signal;
    const abort = () => controller.abort(originalSignal?.reason);
    let timer;
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => {
        const error = new Error(request.read ? 'The request took too long. Retry without reloading the page.'
          : 'The response took too long. The change may already be saved. Check saved result before submitting again.');
        // Do not let the SDK turn this bounded request into several long retries.
        error.name = 'AbortError';
        reject(error);
        controller.abort();
      }, request.upload ? uploadTimeoutMs : timeoutMs);
    });
    originalSignal?.addEventListener('abort', abort, { once: true });
    if (originalSignal?.aborted) abort();
    try {
      const response = await Promise.race([deadline, (async () => {
        const result = await fetchImpl(input, { ...options, signal: controller.signal });
        // Fetch can resolve headers while response.json() would wait forever.
        const bytes = await result.arrayBuffer();
        if (tracked && result.ok && bytes.byteLength) {
          // The caller must be able to read the acknowledgement before a write
          // is safe to consider complete. Proxy HTML or broken JSON is unknown.
          if (!result.headers.get('content-type')?.includes('json')) throw new Error('The saved result could not be read. Check saved result before submitting again.');
          JSON.parse(new TextDecoder().decode(bytes));
        }
        return new Response([101, 204, 205, 304].includes(result.status) ? null : bytes,
          { status: result.status, statusText: result.statusText, headers: result.headers });
      })()]);
      if (tracked && owner === requestOwner) {
        if (response.status >= 500 || response.status === 408) {
          entries.set(request.key, { ...entries.get(request.key), status: 'unknown' });
        } else entries.delete(request.key);
        publish();
      }
      return response;
    } catch (error) {
      if (tracked && owner === requestOwner) {
        entries.set(request.key, { ...entries.get(request.key), status: 'unknown' });
        publish();
      }
      throw error;
    } finally {
      activity(-1);
      clearTimeout(timer);
      originalSignal?.removeEventListener('abort', abort);
    }
  }
  return { fetch: boundedFetch, setOwner, snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    acknowledge(key) {
      if (entries.get(key)?.status !== 'unknown') return;
      entries.delete(key); publish();
    },
  };
}
