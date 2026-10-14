import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
const functionSource = (name, next) => source.slice(source.indexOf(`  async function ${name}(`), source.indexOf(`  async function ${next}(`));

test('confirmed external payment finishes while secondary refresh and SMS remain pending', async () => {
  const notices = []; const requests = []; let refreshes = 0;
  const never = new Promise(() => {});
  const rental = { id: 'r1', vehicle_id: 'v1', rental_total: 100, payment_status: 'unpaid' };
  const context = {
    requireStaffPermission: () => true, isPartialPaymentStatus: () => false,
    supabase: { rpc: async () => ({ data: { ...rental, payment_status: 'paid' } }),
      functions: { invoke: (name) => { requests.push(name); return never; } } },
    refreshAfterSavedTask: () => { refreshes++; },
    withRequestDeadline: promise => promise,
    setRentals: update => update([rental]), rentals: [rental],
    notify: (...args) => notices.push(args), money: n => `$${n}`, externalPaymentMethodLabel: s => s,
  };
  const record = vm.runInNewContext(`${functionSource('recordTestPayment','decideExtension')}\nrecordTestPayment`, context);
  const result = await record(rental, { amount: 100, paymentMethod: 'cash' });
  assert.equal(result, true);
  assert.equal(refreshes, 1);
  assert.deepEqual(requests, ['send-rental-due-reminders']);
  assert.ok(notices.some(([message, kind]) => message.includes('recorded') && kind === 'success'));
});

test('external-payment dialogs release all busy controls when their callback rejects and keep drafts', async () => {
  for (const name of ['ExternalPaymentModal', 'ChargeExternalPaymentModal']) {
    const component = source.slice(source.indexOf(`function ${name}(`));
    const start = component.indexOf('  async function submit(');
    const end = component.indexOf('\n  return createPortal', start);
    let saving = false, error = '', cleared = false;
    const submit = vm.runInNewContext(`${component.slice(start,end)}\nsubmit`, {
      form: { amount: '100', paymentMethod: 'cash', reference: 'receipt', confirmed: true }, amountDue: 100,
      saving: false, setSaving: v => { saving = v; }, setError: v => { error = v; },
      onConfirm: async () => { throw new Error('response interrupted'); },
      clearDraft: () => { cleared = true; }, money: n => `$${n}`,
    });
    await submit({ preventDefault() {} });
    assert.equal(saving, false); assert.equal(error, 'response interrupted'); assert.equal(cleared, false);
  }
});

test('external-payment dialogs clear their draft only after confirmed success', async () => {
  for (const success of [true, false]) {
    const component = source.slice(source.indexOf('function ExternalPaymentModal('));
    const start = component.indexOf('  async function submit(');
    const end = component.indexOf('\n  return createPortal', start);
    let cleared = false;
    const submit = vm.runInNewContext(`${component.slice(start,end)}\nsubmit`, {
      form: { amount: '100', paymentMethod: 'cash', reference: '', confirmed: true }, amountDue: 100,
      saving: false, setSaving: () => {}, setError: () => {}, onConfirm: async () => success,
      clearDraft: () => { cleared = true; }, money: n => `$${n}`,
    });
    await submit({ preventDefault() {} }); assert.equal(cleared, success);
  }
});

test('keyboard navigation reaches recovery controls without closing the active task', () => {
  const text = source.slice(source.indexOf('function useDialogFocus('), source.indexOf('class PortalErrorBoundary'));
  let handler, cleanup, released = false;
  const document = { activeElement: null, body: { style: { overflow: '' } } };
  const button = () => ({ offsetParent: {}, focus() { document.activeElement = this; } });
  const first = button(), submit = button(), minimize = button(), check = button();
  const dialog = { querySelectorAll: () => [first, submit], querySelector: () => first, offsetParent: {} };
  let top = dialog;
  document.querySelectorAll = selector => selector.includes('aria-modal') ? [top] : [minimize, check];
  vm.runInNewContext(`${text}\nuseDialogFocus(() => {});`, {
    document, HTMLElement: class {},
    useRef: initial => ({ current: initial === null ? dialog : initial }),
    useEffect: effect => { cleanup = effect(); }, trackTaskDialog: () => () => { released = true; },
    window: { requestAnimationFrame: () => {}, addEventListener: (_, fn) => { handler = fn; }, removeEventListener: () => {} },
  });
  document.activeElement = submit;
  handler({ key: 'Tab', preventDefault() {} });
  assert.equal(document.activeElement, minimize);
  handler({ key: 'Tab', shiftKey: true, preventDefault() {} });
  assert.equal(document.activeElement, submit);
  top = button();
  handler({ key: 'Tab', preventDefault() {} });
  assert.equal(document.activeElement, submit, 'a background modal must not steal focus from the top modal');
  cleanup(); assert.equal(released, true);
});
