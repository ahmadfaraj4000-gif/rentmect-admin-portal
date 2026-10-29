# Settings → Performance

The dashboard measures Rentals, Archive, rental-detail reads/cache handoffs,
and the Payments “Made This Month / Year” cards in the production admin portal.
It does not yet measure booking quotes, saves, other payment widgets, or the
customer-facing website. Development and preview hosts do not upload samples.

## Measurement contract

- Navigation, filter, search, load-more and manual refresh start at the action.
  Initial/automatic loads start when loading begins. Search includes debounce.
- A successful result ends after React commits and two animation callbacks
  provide a paint opportunity. This approximates readiness; it is not an exact
  paint timestamp or an independent backend trace.
- Existing reads, retries, hydration, revenue calculation and rendering remain
  in the measured path. There are no extra rental or payment queries.
- Successful samples feed exact median/p95/p99 calculations. Errors and
  timeouts are separate, and count against the successful-within-target rate.
  Cancelled/hidden work is excluded from those calculations. Unfinished work
  times out after 120 seconds.
- p95 needs 20 successes; p99 needs 100. Small samples are preliminary.
  Percentiles are computed from observations, never averaged across days.
- Default filters exclude automatic refreshes. Compare the same action,
  cache/network source, viewport class, load type and window across releases.
  Receipt times determine day buckets in America/New_York.
- Initial objectives: Rentals/Archive 1,500 ms; details 1,000 ms; totals 2,000 ms.
  These are targets, not measured baseline values or contractual guarantees.

## Bounded overhead

The dashboard and its CSS are lazy loaded only on opening Performance. It
fetches aggregates once, or when filters/Refresh are used, with a 30-second,
eight-entry component-local cache. There is no polling or charting dependency.
The current account's Settings component remounts on account change.

Collection uses a 100-item memory queue, at most 20 events per upload, and at
least 60 seconds between automatically scheduled uploads. It waits until the
document is visible, the browser is online, there are no active measurements
or business requests, and an idle opportunity is available. Requests abort
after five seconds; failed batches are dropped without retry. Metrics are
never awaited by business operations and never create uncertain-write tasks.
Other writes retain the existing recovery protection.

The database reserves at most 5,000 events per UTC day across all browsers.
Raw data expires after seven days, with hourly cleanup and a daily intake
fallback. Reports cover only 24 hours or seven days and at most five releases.
No user/customer IDs, URLs, search text, error messages or financial values
are stored. Only action, load type, source, duration, outcome, viewport class,
build SHA, event UUID and server receipt time are retained.

Best-effort collection is not a complete availability SLI: closed tabs,
offline clients, saturation and sampling limits can omit observations. The
dashboard shows excluded outcomes and daily intake-limit warnings. Use an
independent synthetic availability check before claiming an availability SLA.

## Access and operations

Authenticated staff can submit strictly validated batches. Reading aggregates
requires `tab.settings`; pausing/resuming additionally requires
`settings.operational`. Tables expose no direct anonymous/authenticated grants
and have RLS enabled. RPCs recheck authorization server-side.

“Pause collection” stops database acceptance. Clients back off for 15 minutes
after a paused response, so re-enabling may take that long to resume uploads.
For immediate incident mitigation, pause here or invoke the authorized
`admin_performance_set_enabled(false)` RPC. A frontend rollback can leave the
isolated telemetry tables in place without affecting operational tables.

Migration: `supabase/migrations/20261029030000_admin_performance_telemetry.sql`.
Apply only this migration transaction and register its migration history; do
not push unrelated pending migrations. The hourly job is
`admin-performance-retention`.

## Verification (2026-10-28)

- 187 deployment-suite tests passed, including collection bounds, failed
  uploads, account isolation, timeout/visibility classification, unchanged
  rental caching, transport recovery protections and dashboard statistics.
- SQL tests ran in a rolled-back transaction against the target database:
  authorization, exact percentile values, duplicate IDs, batch/privacy checks,
  global intake limit, pause/resume and retention.
- A rolled-back synthetic 35,000-row report took 221.5 ms server execution
  time on existing compute. This is a test result, not a production p95.
- A local 10,000-event collector microbenchmark took 11.4 ms total; queue
  length remained 100. This is not an end-to-end browser benchmark.
- Production build adds approximately 3.2 KB gzipped to the main bundle
  relative to the preceding performance release. The dashboard's approximately
  5 KB gzipped JS/CSS is fetched only on opening it. No new dependencies.
