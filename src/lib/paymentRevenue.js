// Cash-based revenue reporting, separate from the existing cash/deposit cards.
// All arithmetic is in cents. Never use updated_at as a receipt date.
export const REVENUE_ACCOUNT = 'anconamgt@aol.com';
export const canViewRevenue = (email) => String(email || '').trim().toLowerCase() === REVENUE_ACCOUNT;
const cents = (value) => Math.round(Number(value || 0) * 100);
const positive = (value) => Math.max(0, cents(value));
const paid = (status) => ['paid', 'partially_paid', 'succeeded', 'refunded', 'partially_refunded'].includes(String(status || '').toLowerCase());
const dateFormatter = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
const dateKey = (date) => {
  const value = new Date(date || 'invalid');
  if (!Number.isFinite(value.getTime())) return null;
  const parts = dateFormatter.formatToParts(value);
  return ['year', 'month', 'day'].map((key) => parts.find((part) => part.type === key).value).join('-');
};
const referenceKeys = (row) => [row.stripe_payment_intent_id && `intent:${row.stripe_payment_intent_id}`, row.stripe_checkout_session_id && `session:${row.stripe_checkout_session_id}`].filter(Boolean);

export function calculatePaymentRevenue(data = {}, now = new Date()) {
  const { rentals = [], payments = [], charges = [], extensions = [], refunds = [], externalActions = [], applications = [], allocations = [] } = data;
  const today = dateKey(now);
  const issues = [];
  const receipts = [];
  const events = [];
  const seen = new Map();
  const byRental = new Map(rentals.map((row) => [row.id, row]));
  const byCharge = new Map(charges.map((row) => [row.id, row]));
  const group = (rows, key) => {
    const result = new Map();
    for (const row of rows) { const list = result.get(row[key]) || []; list.push(row); result.set(row[key], list); }
    return result;
  };
  const rentalExtensions = group(extensions, 'rental_id');
  const rentalCharges = group(charges, 'rental_id');
  const sourceAllocations = group(allocations, 'source_rental_id');
  const allocationApplications = group(applications, 'allocation_id');
  const receiptAliases = new Map();
  const originalReceipts = new Map();
  const issue = (row, reason) => issues.push({ rentalId: row.rental_id || row.id, recordId: row.id, refundId: row.stripe_refund_id || null, reason, date: row.paid_at || row.created_at || null, amount: row.amount == null ? null : Number(row.amount), kind: row.source_type === 'stripe_manual_review' ? 'refund_category' : 'record_review' });
  const add = (receipt, source) => {
    const keys = referenceKeys(source);
    const existing = keys.map((key) => seen.get(key)).find(Boolean);
    if (existing) {
      // Associate every representation with the same receipt for refund lookup.
      existing.aliases.push(receipt.id);
      receiptAliases.set(receipt.id, existing);
      return;
    }
    if (![receipt.gross, receipt.deposit, receipt.tax].every(Number.isSafeInteger)
      || receipt.gross < 0 || receipt.deposit < 0 || receipt.tax < 0 || receipt.deposit + receipt.tax > receipt.gross) {
      issue(source, 'A receipt has inconsistent amounts.'); return;
    }
    receipt.net = receipt.gross - receipt.deposit - receipt.tax;
    receipt.aliases = [receipt.id];
    receipts.push(receipt);
    receiptAliases.set(receipt.id, receipt);
    keys.forEach((key) => seen.set(key, receipt));
  };
  const taxShare = (amount, total, tax) => total > 0 ? Math.min(amount, Math.round(amount * Math.min(tax, total) / total)) : 0;
  const canonicalRentals = new Set();
  const canonicalByRental = new Map();
  for (const row of payments) {
    if (!paid(row.status)) continue;
    const extension = String(row.payment_type || '').includes('extension');
    const depositOnly = String(row.payment_type || '').includes('deposit');
    const chargePayment = /charge|balance|amendment|installment/.test(String(row.payment_type || ''));
    const gross = row.total_amount == null ? positive(row.rental_amount) + positive(row.tax_amount) + positive(row.deposit_amount) : positive(row.total_amount);
    if (!extension && !depositOnly && !chargePayment) canonicalRentals.add(row.rental_id);
    add({ id: `payment:${row.id}`, rentalId: row.rental_id, date: row.paid_at,
      gross, deposit: depositOnly ? gross : positive(row.deposit_amount), tax: depositOnly ? 0 : positive(row.tax_amount) }, row);
    const receipt = receiptAliases.get(`payment:${row.id}`);
    if (receipt && !extension && (!chargePayment || /balance|amendment|installment/.test(String(row.payment_type)))) {
      const list = canonicalByRental.get(row.rental_id) || [];
      if (!list.includes(receipt)) list.push(receipt);
      canonicalByRental.set(row.rental_id, list);
      if (!depositOnly && !chargePayment && !originalReceipts.has(row.rental_id)) originalReceipts.set(row.rental_id, receipt);
    }
  }
  const continuationIds = new Set(extensions.filter((row) => row.status === 'activated').map((row) => row.replacement_rental_id).filter(Boolean));
  const appliedCharges = new Set(applications.map((row) => row.charge_id));
  for (const rental of rentals) {
    // Rental-balance receipts include deposit funding. Allocate against the
    // recorded booking invoice first, matching the external-payment ledger.
    const sameVehicleExtensions = (rentalExtensions.get(rental.id) || []).filter((row) => row.status === 'activated' && row.request_kind === 'same_vehicle_extension');
    const base = Math.max(0, positive(rental.rental_total) + positive(rental.service_fee_total)
      - sameVehicleExtensions.reduce((sum, row) => sum + positive(row.extension_rental_amount), 0));
    const tax = Math.max(0, positive(rental.tax_amount) - sameVehicleExtensions.reduce((sum, row) => sum + positive(row.extension_tax_amount), 0));
    const invoice = base + tax;
    const candidates = [];
    if (rental.paid_at && !canonicalRentals.has(rental.id) && !continuationIds.has(rental.id)) {
      if (rental.payment_amount_cents == null) issue(rental, 'An original receipt has no captured amount.');
      else candidates.push({ row: rental, id: `initial:${rental.id}`, gross: Number(rental.payment_amount_cents), date: rental.paid_at });
    }
    for (const row of (rentalCharges.get(rental.id) || []).filter((item) => item.charge_type === 'rental_amendment' && !item.included_in_initial_payment && paid(item.status) && item.payment_provider !== 'deposit')) {
      candidates.push({ row, id: `charge:${row.id}`, gross: row.payment_amount_cents == null ? positive(row.total_amount) : Number(row.payment_amount_cents), date: row.paid_at });
    }
    candidates.sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.id.localeCompare(b.id));
    const candidateReferences = new Set(seen.keys());
    for (const candidate of candidates) {
      const keys = referenceKeys(candidate.row);
      candidate.duplicate = keys.some((key) => candidateReferences.has(key));
      keys.forEach((key) => candidateReferences.add(key));
    }
    const canonical = canonicalByRental.get(rental.id) || [];
    let covered = canonical.reduce((sum, row) => sum + row.gross - row.deposit, 0);
    const depositCovered = canonical.reduce((sum, row) => sum + row.deposit, 0);
    // Allocations retain the original captured deposit even after it is applied,
    // refunded or transferred. Prefer that evidence to today's changed invoice.
    const ownedAllocations = (sourceAllocations.get(rental.id) || []).filter((row) => row.source_kind !== 'switch_increase');
    const cashReceived = candidates.filter((row) => !row.duplicate).reduce((sum, row) => sum + row.gross, 0) + covered + depositCovered;
    const recordedDeposit = positive(rental.deposit_held_amount) + positive(rental.deposit_released_amount);
    const inferredDeposit = rental.deposit_status === 'waived' ? 0 : recordedDeposit || Math.min(positive(rental.security_deposit), Math.max(0, cashReceived - invoice));
    const capturedDeposit = ownedAllocations.length
      ? ownedAllocations.reduce((sum, row) => sum + positive(row.amount_held), 0) : inferredDeposit;
    let unassignedDeposit = Math.max(0, capturedDeposit - depositCovered);
    for (const candidate of candidates) {
      candidate.deposit = 0;
      if (candidate.duplicate) continue;
      const intent = candidate.row.stripe_payment_intent_id;
      const matched = intent ? ownedAllocations.filter((row) => row.stripe_payment_intent_id === intent).reduce((sum, row) => sum + positive(row.amount_held), 0) : 0;
      candidate.deposit = Math.min(candidate.gross, unassignedDeposit, matched);
      unassignedDeposit -= candidate.deposit;
    }
    // External installments fund deposits after the rental portion. Consume
    // their latest receipts first when the allocation has no provider reference.
    for (const candidate of [...candidates].reverse()) {
      if (candidate.duplicate) continue;
      const assigned = Math.min(Math.max(0, candidate.gross - candidate.deposit), unassignedDeposit);
      candidate.deposit += assigned;
      unassignedDeposit -= assigned;
    }
    if (unassignedDeposit > 1 && !continuationIds.has(rental.id)) issue(rental, 'A captured deposit cannot be matched to its receipts.');
    for (const candidate of candidates) {
      if (referenceKeys(candidate.row).some((key) => seen.has(key))) {
        add({ ...candidate, rentalId: rental.id, deposit: 0, tax: 0 }, candidate.row); continue;
      }
      // This is a cash report: include the actual receipt even if a later
      // invoice revision reduced the bill. Its refund is a separate dated event.
      const nonDeposit = candidate.gross - candidate.deposit;
      if (nonDeposit > 0 && invoice <= 0) issue(rental, 'A paid rental is missing its invoice tax breakdown.');
      add({ id: candidate.id, rentalId: rental.id, date: candidate.date,
        gross: candidate.gross, deposit: candidate.deposit, tax: taxShare(covered + nonDeposit, invoice, tax) - taxShare(covered, invoice, tax) }, candidate.row);
      covered += nonDeposit;
    }
  }
  for (const row of extensions) {
    if (!paid(row.payment_status) && row.status !== 'activated') continue;
    const gross = row.payment_amount_cents == null || Number(row.payment_amount_cents) === 0 ? positive(row.extension_total_amount) : Number(row.payment_amount_cents);
    const deposit = Math.min(gross, positive(row.extension_deposit_amount));
    add({ id: `extension:${row.id}`, rentalId: row.rental_id, date: row.paid_at,
      gross, deposit, tax: taxShare(gross - deposit, positive(row.extension_total_amount) - positive(row.extension_deposit_amount), positive(row.extension_tax_amount)) }, row);
  }
  for (const row of charges) {
    if (row.included_in_initial_payment || !paid(row.status) || row.charge_type === 'rental_amendment' || row.charge_type === 'rental_installment') continue;
    if (row.payment_provider === 'deposit') {
      if (!appliedCharges.has(row.id)) issue(row, 'A deposit-paid charge is missing its application record.');
      continue;
    }
    const gross = row.payment_amount_cents == null ? positive(row.total_amount) : Number(row.payment_amount_cents);
    add({ id: `charge:${row.id}`, rentalId: row.rental_id, date: row.paid_at,
      gross, deposit: 0, tax: taxShare(gross, positive(row.total_amount), positive(row.tax_amount)) }, row);
  }
  for (const row of applications) {
    const charge = byCharge.get(row.charge_id);
    if (!charge || charge.status !== 'paid' || charge.payment_provider !== 'deposit') { issue(row, 'A deposit application does not match a paid charge.'); continue; }
    let total = positive(charge.total_amount), tax = positive(charge.tax_amount);
    if (charge.charge_type === 'rental_amendment') {
      const rental = byRental.get(row.rental_id);
      if (!rental) { issue(row, 'A deposit application is missing its rental.'); continue; }
      tax = positive(rental.tax_amount);
      total = positive(rental.rental_total) + positive(rental.service_fee_total) + tax;
    }
    const gross = positive(row.amount);
    add({ id: `application:${row.id}`, rentalId: row.rental_id, date: row.created_at,
      gross, deposit: 0, tax: taxShare(gross, total, tax) }, row);
  }
  for (const allocation of allocations) {
    const applied = (allocationApplications.get(allocation.id) || []).reduce((sum, row) => sum + positive(row.amount), 0);
    if (applied !== positive(allocation.amount_applied)) issue({ rental_id: allocation.holder_rental_id }, 'Applied deposits do not reconcile with their charge records.');
  }
  for (const row of payments) {
    if (positive(row.refunded_amount) > 0 && !row.deposit_refunded_at
      && !refunds.some((refund) => refund.stripe_payment_intent_id && refund.stripe_payment_intent_id === row.stripe_payment_intent_id)) {
      issue(row, 'A legacy refund needs a dated refund record.');
    }
  }
  const refunded = new Map();
  const addRefund = (row, source, amount, date) => {
    if (!Number.isSafeInteger(amount) || amount < 0) { issue(row, 'A refund has inconsistent amounts.'); return; }
    if (!amount) return;
    if (!source) { issue(row, 'A refund cannot be linked to its original receipt.'); return; }
    const taxableReceipt = source.gross - source.deposit;
    const previous = refunded.get(source.id) || 0;
    if (previous + amount > taxableReceipt + 1) { issue(row, 'Refunds exceed the non-deposit receipt.'); return; }
    // Cumulative rounding makes two partial refunds equal a single full refund.
    const net = (value) => taxableReceipt > 0 ? Math.round(value * source.net / taxableReceipt) : 0;
    events.push({ rentalId: row.rental_id, date, net: -(net(previous + amount) - net(previous)) });
    refunded.set(source.id, previous + amount);
  };
  const alias = (id) => receiptAliases.get(id);
  const seenRefunds = new Set();
  for (const row of refunds) {
    if (row.status !== 'succeeded') continue;
    if (row.stripe_refund_id && seenRefunds.has(row.stripe_refund_id)) continue;
    if (row.stripe_refund_id) seenRefunds.add(row.stripe_refund_id);
    if (String(row.source_type || '').includes('deposit')) continue;
    if (row.source_type === 'stripe_manual_review') { issue(row, 'A Stripe refund still needs to be classified as rental money or a deposit return.'); continue; }
    const source = seen.get(`intent:${row.stripe_payment_intent_id}`)
      || (row.extension_request_id ? alias(`extension:${row.extension_request_id}`) : null);
    addRefund(row, source, positive(row.amount), row.succeeded_at || row.created_at);
  }
  for (const row of externalActions) {
    if (row.action_type !== 'refund') continue;
    const amount = positive(row.amount) - positive(row.deposit_amount_returned);
    const source = row.payment_charge_id ? alias(`charge:${row.payment_charge_id}`)
      : alias(`initial:${row.rental_id}`) || originalReceipts.get(row.rental_id);
    addRefund(row, source, amount, row.created_at);
  }
  events.push(...receipts);
  let monthCents = 0, yearCents = 0;
  for (const row of events) {
    if (!row.net) continue;
    const key = dateKey(row.date);
    if (!key) { issue({ rental_id: row.rentalId }, 'A revenue transaction is missing its payment date.'); continue; }
    if (new Date(row.date) > now || key.slice(0, 4) !== today.slice(0, 4)) continue;
    yearCents += row.net;
    if (key.slice(0, 7) === today.slice(0, 7)) monthCents += row.net;
  }
  const periodIssues = issues.map((item) => {
    const key = dateKey(item.date);
    const periods = !key ? ['month', 'year'] : key > today || key.slice(0, 4) !== today.slice(0, 4) ? []
      : key.slice(0, 7) === today.slice(0, 7) ? ['month', 'year'] : ['year'];
    return { ...item, periods };
  }).filter((item) => item.periods.length);
  return { month: monthCents / 100, year: yearCents / 100, monthLabel: new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'long', year: 'numeric' }).format(now), yearLabel: today.slice(0, 4), monthKey: today.slice(0, 7), issues: periodIssues };
}

export const REVENUE_TABLES = {
  rentals: 'rentals', payments: 'rental_payments', charges: 'rental_charge_items',
  extensions: 'rental_extension_requests', refunds: 'rental_payment_refunds',
  externalActions: 'rental_external_payment_actions', applications: 'rental_deposit_charge_applications', allocations: 'rental_deposit_allocations',
};
// Reporting needs receipt amounts and links, never agreement snapshots, notes,
// customer contact details, or provider error payloads.
export const REVENUE_COLUMNS = {
  rentals: 'id,rental_total,service_fee_total,tax_amount,security_deposit,paid_at,payment_amount_cents,deposit_held_amount,deposit_released_amount,deposit_status,stripe_payment_intent_id,stripe_checkout_session_id,created_at',
  rental_payments: 'id,rental_id,status,payment_type,total_amount,rental_amount,tax_amount,deposit_amount,paid_at,refunded_amount,deposit_refunded_at,stripe_payment_intent_id,stripe_checkout_session_id,created_at',
  rental_charge_items: 'id,rental_id,charge_type,included_in_initial_payment,status,payment_provider,total_amount,tax_amount,payment_amount_cents,paid_at,stripe_payment_intent_id,stripe_checkout_session_id,amount,created_at',
  rental_extension_requests: 'id,rental_id,replacement_rental_id,status,payment_status,request_kind,extension_rental_amount,extension_tax_amount,extension_total_amount,extension_deposit_amount,payment_amount_cents,paid_at,stripe_payment_intent_id,stripe_checkout_session_id,created_at',
  rental_payment_refunds: 'id,rental_id,status,source_type,stripe_refund_id,stripe_payment_intent_id,extension_request_id,amount,created_at',
  rental_external_payment_actions: 'id,rental_id,action_type,amount,deposit_amount_returned,payment_charge_id,created_at',
  rental_deposit_charge_applications: 'id,rental_id,allocation_id,charge_id,amount,created_at',
  rental_deposit_allocations: 'id,source_rental_id,holder_rental_id,source_kind,amount_held,amount_applied,stripe_payment_intent_id',
};
export async function readRevenueRows(client, table, signal) {
  const rows = [];
  let lastId;
  let expected;
  // Keyset pagination also works when the server's row cap is below our page size.
  for (let page = 0; page < 1000; page += 1) {
    if (signal?.aborted) throw new Error('Revenue loading was interrupted.');
    let query = client.from(table).select(REVENUE_COLUMNS[table] || '*', page === 0 ? { count: 'exact' } : {}).order('id').limit(500);
    if (lastId) query = query.gt('id', lastId);
    if (signal) query = query.abortSignal(signal);
    const { data, error, count } = await query;
    if (error) throw new Error(`Could not load ${table}: ${error.message}`);
    if (!Array.isArray(data)) throw new Error(`Incomplete ${table} response.`);
    if (page === 0) expected = count;
    if (!data.length) {
      if (expected != null && rows.length !== expected) throw new Error('Payment records changed during loading. Refresh totals.');
      return rows;
    }
    if (data.some((row, index) => !row.id || row.id <= (index ? data[index - 1].id : lastId || ''))) throw new Error(`Unstable ${table} pagination.`);
    rows.push(...data);
    lastId = data.at(-1).id;
  }
  throw new Error('Revenue history exceeded the reporting limit.');
}
export async function loadPaymentRevenue(client, signal) {
  if (signal?.aborted) throw new Error('Revenue loading was interrupted.');
  let query = client.rpc('admin_payment_revenue_snapshot');
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) throw error;
  if (!data || Object.keys(REVENUE_TABLES).some(key => !Array.isArray(data[key]))) {
    throw new Error('Revenue snapshot was incomplete. Refresh totals.');
  }
  return data;
}
