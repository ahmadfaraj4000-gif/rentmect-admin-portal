import React, { useLayoutEffect, useRef } from 'react';

// Values passed to callers remain dollar strings; typing always enters cents.
export function MoneyInput({ value, onChange, min, max, type, inputMode, step, decimalMode = false, onKeyDown, onFocus, ...props }) {
  const input = useRef(null);
  const display = decimalMode ? value : Number(value || 0).toFixed(2);
  useLayoutEffect(() => {
    const node = input.current;
    if (!node) return;
    node.setCustomValidity('');
    if (decimalMode || (!props.required && (value === '' || value == null))) return;
    const amount = Number(display);
    node.setCustomValidity(min != null && amount < Number(min) ? `Enter at least ${Number(min).toFixed(2)}.`
      : max != null && amount > Number(max) ? `Enter no more than ${Number(max).toFixed(2)}.` : '');
  }, [display, min, max, decimalMode, props.required, value]);
  return <input {...props} ref={input} type={decimalMode ? 'number' : 'text'} inputMode={decimalMode ? 'decimal' : 'numeric'}
    min={min} max={max} step={step} value={display} onFocus={event => {
      if (!decimalMode) event.target.select();
      onFocus?.(event);
    }} onKeyDown={event => {
      onKeyDown?.(event);
      if (decimalMode || event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) return;
      if (/^\d$/.test(event.key) || event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault();
        const node = event.target;
        const selectedAll = node.selectionStart === 0 && node.selectionEnd === node.value.length;
        const cents = selectedAll ? 0 : Math.round(Number(node.value || 0) * 100);
        const next = event.key === 'Delete' ? 0 : event.key === 'Backspace' ? Math.floor(cents / 10) : cents * 10 + Number(event.key);
        if (next > 999999999999) return;
        node.value = (next / 100).toFixed(2);
        node.setSelectionRange(node.value.length, node.value.length);
        onChange?.(event);
      } else if (['.', ',', '-', '+', 'e', 'E'].includes(event.key)) event.preventDefault();
    }} onChange={event => {
      if (!decimalMode) {
        if (!/^[\d.,$\s]*$/.test(event.target.value)) { event.target.value = display; return; }
        const digits = event.target.value.replace(/\D/g, '').replace(/^0+/, '') || '0';
        if (digits.length > 12) { event.target.value = display; return; }
        event.target.value = (Number(digits) / 100).toFixed(2);
        event.target.setSelectionRange(event.target.value.length, event.target.value.length);
      }
      onChange?.(event);
    }}/>;
}
