import React, { useEffect, useRef, useState } from 'react';

function splitDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  return match ? { month: match[2], day: match[3], year: match[1] } : { month: '', day: '', year: '' };
}

function birthdayAge(value, today = new Date()) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const birthDate = new Date(year, month - 1, day);
  if (
    birthDate.getFullYear() !== year ||
    birthDate.getMonth() + 1 !== month ||
    birthDate.getDate() !== day ||
    birthDate > today
  ) return null;
  let age = today.getFullYear() - year;
  if (today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day)) age -= 1;
  return age;
}

function readableBirthday(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return '';
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    .toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export function isEligibleAdminBirthday(value, minimumAge = 21) {
  const age = birthdayAge(value);
  return age !== null && age >= minimumAge && age <= 120;
}

export default function AdminBirthdayInput({
  value,
  onChange,
  idPrefix = 'admin-birthday',
  minimumAge = 21,
  required = true,
}) {
  const [parts, setParts] = useState(() => splitDate(value));
  const internalValue = useRef(String(value || ''));
  const monthRef = useRef(null);
  const dayRef = useRef(null);
  const yearRef = useRef(null);

  useEffect(() => {
    const external = String(value || '');
    if (external === internalValue.current) return;
    internalValue.current = external;
    setParts(splitDate(external));
  }, [value]);

  const complete = parts.month.length === 2 && parts.day.length === 2 && parts.year.length === 4;
  const candidate = complete ? `${parts.year}-${parts.month}-${parts.day}` : '';
  const age = birthdayAge(candidate);
  const eligible = age !== null && age >= minimumAge && age <= 120;
  const hasInput = Boolean(parts.month || parts.day || parts.year);

  function updatePart(key, raw) {
    const maxLength = key === 'year' ? 4 : 2;
    const digits = String(raw || '').replace(/\D/g, '').slice(0, maxLength);
    const next = { ...parts, [key]: digits };
    setParts(next);
    const nextComplete = next.month.length === 2 && next.day.length === 2 && next.year.length === 4;
    const nextValue = nextComplete ? `${next.year}-${next.month}-${next.day}` : '';
    internalValue.current = nextValue;
    onChange(nextValue);
    if (key === 'month' && digits.length === 2) dayRef.current?.focus();
    if (key === 'day' && digits.length === 2) yearRef.current?.focus();
  }

  function handleBackspace(event, key) {
    if (event.key !== 'Backspace' || event.currentTarget.value) return;
    if (key === 'day') monthRef.current?.focus();
    if (key === 'year') dayRef.current?.focus();
  }

  const statusId = `${idPrefix}-status`;
  return (
    <fieldset className="admin-birthday-input" aria-describedby={statusId}>
      <legend>Date of birth{required ? ' *' : ''}</legend>
      <div className="admin-birthday-segments" role="group" aria-label="Date of birth, month day and year">
        <input ref={monthRef} type="text" inputMode="numeric" autoComplete="bday-month" pattern="[0-9]*" placeholder="MM" value={parts.month} onChange={(event) => updatePart('month', event.target.value)} aria-label="Birth month, two digits" />
        <span aria-hidden="true">/</span>
        <input ref={dayRef} type="text" inputMode="numeric" autoComplete="bday-day" pattern="[0-9]*" placeholder="DD" value={parts.day} onChange={(event) => updatePart('day', event.target.value)} onKeyDown={(event) => handleBackspace(event, 'day')} aria-label="Birth day, two digits" />
        <span aria-hidden="true">/</span>
        <input className="admin-birthday-year" ref={yearRef} type="text" inputMode="numeric" autoComplete="bday-year" pattern="[0-9]*" placeholder="YYYY" value={parts.year} onChange={(event) => updatePart('year', event.target.value)} onKeyDown={(event) => handleBackspace(event, 'year')} aria-label="Birth year, four digits" />
      </div>
      <div id={statusId} className={`admin-birthday-status ${complete && !eligible ? 'error' : eligible ? 'valid' : ''}`} aria-live="polite">
        {!complete && hasInput && 'Enter the full month, day, and four-digit year.'}
        {complete && age === null && 'That is not a real calendar date. Check all three fields.'}
        {age !== null && age > 120 && 'Check the four-digit year.'}
        {age !== null && age < minimumAge && `Renters must be at least ${minimumAge}. This customer is not eligible.`}
        {eligible && <strong>{readableBirthday(candidate)} — Age {age}</strong>}
      </div>
    </fieldset>
  );
}
