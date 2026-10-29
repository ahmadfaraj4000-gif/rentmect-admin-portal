import { createPerformanceCollector } from './performanceTelemetry.js';

let sender = async () => { throw new Error('Telemetry is not connected.'); };
const productionPortal = import.meta.env.PROD && window.location.hostname === 'admin.rentmect.com';
const collector = createPerformanceCollector({
  release: import.meta.env.VITE_PERFORMANCE_RELEASE || 'local',
  visible: () => document.visibilityState === 'visible',
  online: () => navigator.onLine !== false,
  device: () => window.matchMedia('(max-width: 760px)').matches ? 'mobile' : 'desktop',
  scheduleIdle(callback) {
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(callback); // No deadline: foreground work wins.
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(callback, 1000);
    return () => window.clearTimeout(id);
  },
  send: (...args) => sender(...args),
});
// Optional browser APIs or observer failures must never escape into portal work.
export const performanceTelemetry = Object.fromEntries(Object.entries(collector).map(([name, method]) => [name, (...args) => {
  if (name === 'setOwner' && !productionPortal) return method('');
  try { return method(...args); } catch { return name === 'afterPaint' ? () => {} : name === 'status' ? {queued:0,accepted:0,dropped:0,active:0,sending:false} : null; }
}]));
export function connectPerformanceSender(send) { sender = send; }
document.addEventListener('visibilitychange', () => performanceTelemetry.visibilityChanged());
