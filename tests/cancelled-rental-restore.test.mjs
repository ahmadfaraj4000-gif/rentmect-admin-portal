import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/final-overrides.css', import.meta.url), 'utf8');

test('cancelled unpaid rentals require a new deadline before restore', () => {
  assert.match(source, /admin_restore_cancelled_unpaid_rental/);
  assert.match(source, /rental\.status === 'cancelled'/);
  assert.match(source, /Restore rental<\/button>/);
  assert.match(source, /function RestoreCancelledRentalModal/);
  assert.match(source, /const \[deadline, setDeadline\] = useState\(''\)/);
  assert.match(source, /A cancellation time is mandatory/);
  assert.match(source, /No time is preselected\. The administrator must choose one\./);
  assert.match(source, /Restore With This Deadline/);
  assert.match(source, /rental-overflow-menu-label">Reservation actions/);
  assert.match(styles, /\.restore-rental-action/);
  assert.match(styles, /\.restore-deadline-warning/);
  assert.match(styles, /\.rental-overflow-menu > summary\s*\{[\s\S]*background: #12633d/);
  assert.match(styles, /\.rental-overflow-menu > div \.emergency-exception-action/);
  assert.match(styles, /\.rental-overflow-menu > div button\.reject/);
});
