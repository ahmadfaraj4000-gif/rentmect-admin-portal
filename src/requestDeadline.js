export const PORTAL_REQUEST_DEADLINE_MS = 9000;

export function withRequestDeadline(request, label, deadlineMs = PORTAL_REQUEST_DEADLINE_MS) {
  let timeoutId;
  const deadline = new Promise((resolve) => {
    timeoutId = window.setTimeout(() => resolve({
      data: null,
      error: new Error(`${label} request timed out after ${Math.round(deadlineMs / 1000)} seconds.`),
      timedOut: true,
    }), deadlineMs);
  });
  return Promise.race([Promise.resolve(request), deadline])
    .finally(() => window.clearTimeout(timeoutId));
}
