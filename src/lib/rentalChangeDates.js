// Match server billing: a day is 24 elapsed hours, including DST transitions.
export function rentalDayShortcut(start, days) {
  const date = new Date(new Date(start).getTime() + days * 86400000);
  if (!Number.isFinite(date.getTime())) return null;
  return {
    returnDate: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date),
    returnTime: new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', hour12: true }).format(date),
  };
}
