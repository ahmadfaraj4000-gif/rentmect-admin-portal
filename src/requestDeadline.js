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
  return Promise.race([Promise.resolve(request).catch((error) => ({ data: null, error })), deadline])
    .finally(() => window.clearTimeout(timeoutId));
}

// Read-only factory: retry a transient failure with a new request, never a write.
export async function withReadRetry(createRequest, label, deadlineMs = PORTAL_REQUEST_DEADLINE_MS) {
  let result;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    result = await withRequestDeadline(Promise.resolve().then(createRequest), label, deadlineMs);
    if (!result?.error) return result;
    const transient = result.timedOut || /failed to fetch|network|load failed|connection|timed out|timeout|502|503|504/i.test(result.error.message || '');
    if (!transient) return result;
  }
  return result;
}
