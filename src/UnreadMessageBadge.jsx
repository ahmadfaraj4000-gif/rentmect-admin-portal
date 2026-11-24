import React, { useEffect, useState } from 'react';

export function UnreadMessageBadge({ client, revision }) {
  const [count, setCount] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    let loading = false;
    async function refresh() {
      if (loading || document.visibilityState === 'hidden') return;
      loading = true;
      try {
        const { count: total, error } = await client.from('rental_messages')
          .select('id', { head: true, count: 'exact' })
          .neq('sender_role', 'admin')
          .eq('read_by_admin', false)
          .abortSignal(controller.signal);
        if (!controller.signal.aborted && !error && Number.isInteger(total)) setCount(total);
      } finally {
        loading = false;
      }
    }
    // Marking a conversation read can update several rows together.
    const timer = setTimeout(refresh, 150);
    const poll = setInterval(refresh, 20_000);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('online', refresh);
    return () => {
      clearTimeout(timer);
      clearInterval(poll);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('online', refresh);
      controller.abort();
    };
  }, [client, revision]);

  if (!count) return null;
  return <strong className="communications-nav-count" aria-label={`${count} unread ${count === 1 ? 'message' : 'messages'}`}>{count}</strong>;
}
