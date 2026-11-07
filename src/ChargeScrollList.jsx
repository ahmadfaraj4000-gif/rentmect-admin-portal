import React, { useLayoutEffect, useRef } from 'react';
import './charge-scroll-list.css';

// Measure real rows so wrapped names and responsive charge cards remain readable.
// A viewport cap also keeps unusually tall cards from expanding the rental page.
export function ChargeScrollList({ children, className = '', label = 'Rental charges' }) {
  const list = useRef(null);
  useLayoutEffect(() => {
    const node = list.current;
    const rows = [...node.children].slice(0, 5);
    function measure() {
      if (!rows.length || !node.getClientRects().length) return;
      const style = getComputedStyle(node);
      const last = rows.at(-1).getBoundingClientRect();
      const height = last.bottom - node.getBoundingClientRect().top + node.scrollTop
        + parseFloat(style.paddingBottom) + parseFloat(style.borderBottomWidth);
      if (height > 0) node.style.setProperty('--five-charge-rows', `${Math.ceil(height)}px`);
    }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    rows.forEach(row => observer.observe(row));
    return () => observer.disconnect();
  }, [children]);
  return <div ref={list} className={`${className} charge-scroll-list`} role="region" aria-label={label} tabIndex={0}>{children}</div>;
}
