// Billing follows the scheduled Eastern clock, not elapsed UTC hours.
function easternParts(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
}
function calendarValue(value) {
  const p = easternParts(value);
  return p ? Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) : NaN;
}
export function rentalCalendarMinutes(start, end) {
  return Math.floor((calendarValue(end) - calendarValue(start)) / 60000);
}
export function rentalDayShortcut(start, days) {
  const value = calendarValue(start);
  if (!Number.isFinite(value) || !Number.isInteger(days)) return null;
  const wall = new Date(value);
  wall.setUTCDate(wall.getUTCDate() + days);
  const hour = wall.getUTCHours();
  return {
    returnDate: wall.toISOString().slice(0, 10),
    returnTime: `${hour % 12 || 12}:${String(wall.getUTCMinutes()).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`,
  };
}
