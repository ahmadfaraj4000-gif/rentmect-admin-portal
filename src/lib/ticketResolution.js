export const TICKET_STATUSES = { needs_review: 'Needs review', matched: 'Matched', in_progress: 'In progress', resolved: 'Resolved' };
export const TICKET_OUTCOMES = { paid_to_agency: 'Paid to agency', transferred: 'Transferred', dismissed: 'Dismissed', closed_without_action: 'Closed without action' };
export const TICKET_BUCKET = 'ticket-evidence';
export const TICKET_FILE_LIMIT = 20 * 1024 * 1024;
const TYPES = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif' };
export function ticketFileType(file) {
  const type = file.type || TYPES[file.name.split('.').pop().toLowerCase()];
  if (!Object.values(TYPES).includes(type)) throw new Error('Choose a PDF, JPEG, PNG, WebP, HEIC, or HEIF file.');
  if (!file.size || file.size > TICKET_FILE_LIMIT) throw new Error('Each attachment must be between 1 byte and 20 MB.');
  return type;
}
export function ticketForm(ticket = {}) {
  return {
    id: ticket.id || crypto.randomUUID(), version: ticket.version || 0,
    agency: ticket.agency || '', ticket_number: ticket.ticket_number || '', ticket_type: ticket.ticket_type || 'speeding',
    vehicle_id: ticket.vehicle_id || '', plate_number: ticket.plate_number || '', plate_state: ticket.plate_state || '', vehicle_note: ticket.vehicle_note || '',
    violation_date: ticket.violation_date || '', violation_time: ticket.violation_time || '', time_unknown: ticket.id ? ticket.violation_time == null : false,
    timezone: ticket.timezone || 'America/New_York', occurred_at: ticket.occurred_at || '',
    location: ticket.location || '', amount: ticket.amount == null ? '' : String(ticket.amount), issue_date: ticket.issue_date || '',
    received_date: ticket.received_date || '', payment_deadline: ticket.payment_deadline || '', appeal_deadline: ticket.appeal_deadline || '', notes: ticket.notes || '',
  };
}
// Preserve local wall time. Browser timezone and DST defaults must not choose an occurrence for staff.
export function ticketTimeOptions(date, time, zone) {
  if (!date || !time) return [];
  const [y, m, d] = date.split('-').map(Number);
  const [h, min, sec = 0] = time.split(':').map(Number);
  const local = Date.UTC(y, m - 1, d, h, min, sec);
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const wall = instant => {
    const p = Object.fromEntries(formatter.formatToParts(new Date(instant)).map(part => [part.type, part.value]));
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  };
  const offsets = new Set();
  for (let hour = -48; hour <= 48; hour += 6) {
    const sample = local + hour * 3600000;
    offsets.add(wall(sample) - sample);
  }
  return [...offsets].map(offset => local - offset).filter(instant => wall(instant) === local).sort((a, b) => a - b).map(instant => new Date(instant).toISOString());
}
export function ticketPayload(form) {
  if (!form.violation_date) throw new Error('Enter the ticket date.');
  if (!form.vehicle_id && !(form.plate_number.trim() && form.plate_state.trim())) throw new Error('Select a vehicle or enter its plate and state.');
  // Validate even when the violation time is unknown.
  new Intl.DateTimeFormat('en-US', { timeZone: form.timezone }).format();
  let occurred_at = '';
  if (!form.time_unknown) {
    if (!form.violation_time) throw new Error('Enter the violation time or select Time unknown.');
    const options = ticketTimeOptions(form.violation_date, form.violation_time, form.timezone);
    if (!options.length) throw new Error('This local time does not exist because of a clock change. Check the notice.');
    occurred_at = options.length === 1 ? options[0] : options.find(option => Date.parse(option) === Date.parse(form.occurred_at));
    if (!occurred_at) throw new Error('This time occurs twice. Select the occurrence shown on the notice.');
  }
  if (form.amount !== '' && (!Number.isFinite(Number(form.amount)) || Number(form.amount) < 0)) throw new Error('Enter a valid nonnegative amount.');
  return { ...form, agency: form.agency.trim() || 'Not entered', ticket_number: form.ticket_number.trim() || `MANUAL-${form.id}`, violation_time: form.time_unknown ? '' : form.violation_time, occurred_at };
}
export function ticketNeedsNote(matches, candidate) {
  return Boolean(matches?.time_unknown || matches?.vehicle_verification_required || matches?.candidates?.length !== 1 || candidate?.booked_fallback || matches?.plate_vehicle_ids?.length > 1);
}
export async function ticketRpc(client, name, args) {
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(error.message || 'Ticket request failed. Please retry.');
  return data;
}
export async function uploadTicketFile(client, ticketId, file, attachmentId) {
  const mime = ticketFileType(file);
  const record = await ticketRpc(client, 'admin_ticket_attachment', { p_id: ticketId, p_attachment_id: attachmentId, p_action: 'prepare', p_data: { file_name: file.name, mime_type: mime, size_bytes: file.size } });
  if (record.uploaded_at) return record;
  const { error } = await client.storage.from(TICKET_BUCKET).upload(record.object_path, file, { contentType: mime, upsert: false });
  // A previous attempt may have uploaded successfully before losing its response.
  if (error && !['409', 'Duplicate'].includes(String(error.statusCode || error.code))) throw new Error(error.message || 'Upload failed. Retry this file.');
  return ticketRpc(client, 'admin_ticket_attachment', { p_id: ticketId, p_attachment_id: attachmentId, p_action: 'complete' });
}
