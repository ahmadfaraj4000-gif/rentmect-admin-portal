// Best-effort, session-only measurements. Never persist customer data, block a
// business promise, retry a failed upload, or grow the queue without a bound.
export const PERFORMANCE_ACTIONS = Object.freeze({
  rental_list: { label: 'Rentals', target: 1500 },
  rental_archive: { label: 'Archive', target: 1500 },
  rental_detail: { label: 'Rental details', target: 1000 },
  payment_totals: { label: 'Payment totals', target: 2000 },
});
export const PERFORMANCE_MODES = ['initial', 'navigation', 'filter', 'search', 'load_more', 'refresh', 'background'];
export const PERFORMANCE_OUTCOMES = ['success', 'error', 'timeout', 'cancelled', 'hidden'];
const CACHE_TYPES = ['network', 'cache', 'mixed'];
export const PERFORMANCE_LIMITS = Object.freeze({ queue: 100, batch: 20, flushMs: 60_000, timeoutMs: 120_000, uploadMs: 5000 });

export function createPerformanceCollector({
  now = () => performance.now(), uuid = () => crypto.randomUUID(),
  setTimer = setTimeout, clearTimer = clearTimeout,
  visible = () => true, online = () => true, device = () => 'desktop',
  scheduleIdle = callback => { const id = setTimer(callback, 0); return () => clearTimer(id); },
  frame = callback => requestAnimationFrame(callback), cancelFrame = id => cancelAnimationFrame(id),
  release = 'local', send = async () => {},
} = {}) {
  let owner = '', queue = [], timer = null, cancelIdle = null, flight = null, busy = 0;
  let accepted = 0, dropped = 0, disabledUntil = 0;
  const active = new Map(), intents = new Map();
  const version = /^[a-f0-9]{7,40}$/.test(release) ? release : 'local';
  function schedule() {
    if (!owner || !queue.length || timer !== null || cancelIdle || flight || !visible()) return;
    timer = setTimer(() => {
      timer = null;
      if (busy || active.size || !online() || now() < disabledUntil) { schedule(); return; }
      cancelIdle = scheduleIdle(() => { cancelIdle = null; void flush(); });
    }, PERFORMANCE_LIMITS.flushMs);
  }
  function finish(token, outcome = 'success') {
    if (!token || active.get(token.action) !== token) return;
    active.delete(token.action); clearTimer(token.deadline);
    token.frames.forEach(cancelFrame);
    const event = {
      id: token.id, action: token.action, mode: token.mode, cache: token.cache,
      outcome: PERFORMANCE_OUTCOMES.includes(outcome) ? outcome : 'error',
      duration_ms: Math.min(PERFORMANCE_LIMITS.timeoutMs, Math.max(0, Math.round(now() - token.start))),
      device: token.device, release: version,
    };
    if (queue.length >= PERFORMANCE_LIMITS.queue) { queue.shift(); dropped++; }
    queue.push(event); schedule();
  }
  function cancel(action) { finish(active.get(action), 'cancelled'); intents.delete(action); }
  async function flush() {
    if (!owner || flight || busy || active.size || !queue.length || !visible() || !online() || now() < disabledUntil) { schedule(); return; }
    const batch = queue.splice(0, PERFORMANCE_LIMITS.batch), generation = owner;
    const controller = new AbortController(); flight = controller;
    const timeout = setTimer(() => controller.abort(), PERFORMANCE_LIMITS.uploadMs);
    try {
      const result = await send(batch, controller.signal);
      if (owner === generation) {
        accepted += Number(result?.accepted ?? batch.length);
        dropped += batch.length - Number(result?.accepted ?? batch.length);
        if (result?.enabled === false) disabledUntil = now() + 15 * 60_000;
      }
    } catch { if (owner === generation) dropped += batch.length; }
    finally { clearTimer(timeout); if (flight === controller) flight = null; schedule(); }
  }
  return {
    setOwner(id) {
      if (owner === (id || '')) return;
      active.forEach(token => { clearTimer(token.deadline); token.frames.forEach(cancelFrame); });
      active.clear(); intents.clear(); queue = []; accepted = 0; dropped = 0; disabledUntil = 0;
      if (timer !== null) clearTimer(timer); timer = null;
      cancelIdle?.(); cancelIdle = null; flight?.abort();
      owner = id || '';
    },
    intent(action, mode = 'navigation') {
      if (!owner || !visible() || !PERFORMANCE_ACTIONS[action]) return;
      intents.set(action, { start: now(), mode: PERFORMANCE_MODES.includes(mode) ? mode : 'navigation' });
    },
    start(action, { mode = 'background', cache = 'network' } = {}) {
      if (!owner || !visible() || !PERFORMANCE_ACTIONS[action]) return null;
      finish(active.get(action), 'cancelled');
      const intent = intents.get(action); intents.delete(action);
      const recent = intent && now() - intent.start < 10_000 ? intent : null;
      const token = { id: uuid(), action, start: recent?.start ?? now(), mode: recent?.mode ?? mode,
        cache: CACHE_TYPES.includes(cache) ? cache : 'network', device: device() === 'mobile' ? 'mobile' : 'desktop', frames: [] };
      if (!PERFORMANCE_MODES.includes(token.mode)) token.mode = 'background';
      active.set(action, token);
      token.deadline = setTimer(() => finish(token, visible() ? 'timeout' : 'hidden'), PERFORMANCE_LIMITS.timeoutMs);
      return token;
    },
    cache(token, value) { if (token && CACHE_TYPES.includes(value)) token.cache = value; },
    isActive: token => Boolean(token && active.get(token.action) === token),
    finish,
    afterPaint(token, outcome = 'success') {
      if (!token || active.get(token.action) !== token) return () => {};
      if (!visible()) { finish(token, 'hidden'); return () => {}; }
      // Called from a React effect after committed content. A second frame
      // gives the browser a paint opportunity; this is not an exact paint timestamp.
      token.frames.push(frame(() => token.frames.push(frame(() => finish(token, visible() ? outcome : 'hidden')))));
      return () => { token.frames.forEach(cancelFrame); token.frames = []; };
    },
    cancel,
    visibilityChanged() {
      if (!visible()) {
        [...active.values()].forEach(token => finish(token, 'hidden'));
        intents.clear();
        if (timer !== null) clearTimer(timer); timer = null;
        cancelIdle?.(); cancelIdle = null;
      } else schedule();
    },
    networkActivity(delta) { busy = Math.max(0, busy + delta); },
    flush,
    status: () => ({ queued: queue.length, accepted, dropped, active: active.size, sending: Boolean(flight) }),
  };
}

export function performanceOutcome(error) {
  return /timed?\s*out|timeout|took too long|loading took too long/i.test(error?.message || String(error || '')) ? 'timeout' : 'error';
}
