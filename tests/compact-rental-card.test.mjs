import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/final-overrides.css', import.meta.url), 'utf8');

test('every Rentals filter uses the same compact operational card', () => {
  assert.match(source, /rentalFilterOptions\(\)\.map/);
  assert.match(source, /displayedRentals\.map\(\(r\) => <RentalRow/);
  assert.match(source, /rental-operations-card/);
  assert.match(source, /rental-card-header/);
  assert.match(source, /rental-card-workspace/);
  assert.match(source, /rental-card-left-column/);
  assert.match(source, /rental-card-financial/);
});

test('rental cards start minimized and reveal one complete detail workspace on demand', () => {
  assert.match(source, /const \[detailsExpanded, setDetailsExpanded\] = useState\(false\)/);
  assert.match(source, /aria-expanded=\{detailsExpanded\}/);
  assert.match(source, /aria-controls=\{`rental-expanded-details-\$\{rental\.id\}`\}/);
  assert.match(source, /detailsExpanded \? 'Hide rental details' : 'Show rental details'/);
  assert.match(source, /\{detailsExpanded && <div className="rental-card-expanded-content"/);
  assert.match(source, /rental-card-expanded-content[\s\S]*rental-card-workspace[\s\S]*rental-card-activity/);
  assert.match(styles, /\.rental-card-expanded-content\s*\{[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(styles, /\.rental-card-details-toggle\s*\{[\s\S]*width: 100% !important/);
});

test('rare rental actions use a clearly labelled More Actions menu', () => {
  assert.match(source, /<summary aria-label="More rental actions"><span>More Actions<\/span><ChevronDown/);
  assert.match(source, /More Actions[\s\S]*Global emergency override[\s\S]*Cancel rental/);
  assert.doesNotMatch(source, /aria-label="More rental actions">•••/);
  assert.match(styles, /\.rental-overflow-menu > summary\s*\{[\s\S]*display: flex !important/);
  assert.match(styles, /\.rental-overflow-menu\s*\{[\s\S]*flex: 0 0 auto !important/);
  assert.match(styles, /\.rental-overflow-menu > summary\s*\{[\s\S]*white-space: nowrap !important/);
  assert.match(styles, /\.rental-overflow-menu > summary\s*\{[\s\S]*background: #fff !important;[\s\S]*color: #111713 !important/);
  assert.match(styles, /\.rental-overflow-menu\[open\] > summary\s*\{[\s\S]*background: #111713 !important;[\s\S]*color: #fff !important/);
});

test('the card renders exactly one clickable horizontal workflow rail', () => {
  assert.equal((source.match(/<RentalProgressTracker/g) || []).length, 1);
  assert.doesNotMatch(source, /<AdminBookingProcedure/);
  assert.match(source, /onStepClick=\{\(step\) => setAdminStepScope\(step\.key\)\}/);
  assert.match(styles, /grid-template-columns: repeat\(9, minmax\(74px, 1fr\)\)/);
  assert.match(styles, /\.rental-card-workflow \.rental-progress-tracker[\s\S]*overflow-x: auto !important/);
});

test('manual completion and per-step bypass stay attached to the workflow', () => {
  assert.match(source, /<AdminStepCompletionModal/);
  assert.match(source, /completeAdminRentalStep\?\.\(rental, adminStepScope, note, metadata\)/);
  assert.match(source, /<EmergencyStepBypassModal/);
  assert.match(source, /addEmergencyExceptionScope\?\.\(rental, form\)/);
  assert.match(source, /Bypass only \{label\}/);
});

test('documents and financial actions remain reachable without permanent button clutter', () => {
  assert.match(source, /className="document-overflow-menu"/);
  assert.match(source, /openDocument\(document\)/);
  assert.match(source, /markDocument\(document\.id, 'approved'\)/);
  assert.match(source, /markDocument\(document\.id, 'rejected'\)/);
  assert.match(source, /deleteDocument\(document\)/);
  assert.match(source, /> Take Payment<\/button>/);
  assert.match(source, /> Refund<\/button>/);
  assert.match(source, /<RentalChargeManager compact/);
});

test('the compact card stacks cleanly only at narrow widths', () => {
  assert.match(styles, /\.rental-card-workspace[\s\S]*grid-template-columns: minmax\(0, 1\.55fr\) minmax\(330px, 1fr\)/);
  assert.match(styles, /@media \(max-width: 780px\)[\s\S]*\.rental-card-workspace[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(styles, /@media \(max-width: 780px\)[\s\S]*\.rental-card-secondary-actions\s*\{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\) !important/);
  assert.match(styles, /\.rental-card-secondary-actions > \.rental-overflow-menu > summary\s*\{[\s\S]*width: 100% !important/);
});
