import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DraftOwnerContext, useTaskDraft } from '../src/useTaskDraft.js';

test('real draft hook writes synchronously, restores on remount, isolates staff and clears on success', () => {
  const stored = new Map();
  const originalWindow = globalThis.window;
  globalThis.window = { sessionStorage: { getItem: k => stored.get(k), setItem: (k,v) => stored.set(k,v), removeItem: k => stored.delete(k) } };
  let value, update, clear;
  function Probe() {
    [value, update, clear] = useTaskDraft('payment:r1', { amount: '', reference: '', confirmed: false }, ['amount','reference']);
    return React.createElement('span', null, value.amount);
  }
  const mount = owner => renderToStaticMarkup(React.createElement(DraftOwnerContext.Provider, { value: owner }, React.createElement(Probe)));
  try {
    mount('a');
    update(current => ({ ...current, amount: '120' }));
    update(current => ({ ...current, reference: 'receipt', confirmed: true }));
    mount('a');
    assert.deepEqual(value, { amount: '120', reference: 'receipt', confirmed: false });
    mount('b'); assert.equal(value.amount, '');
    mount('a'); clear(); mount('a'); assert.equal(value.amount, '');
  } finally { if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow; }
});
