import ExcelJS from 'exceljs';
import { calculatePaymentRevenue } from './paymentRevenue.js';

const dateFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
const day = value => !value ? null : /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : dateFormat.format(new Date(value));
const money = '#,##0.00;[Red](#,##0.00);0.00';
const num = value => Number(value || 0);
const label = value => value?.replaceAll('_', ' ');
const dollars = value => value / 100;

export function feeBreakdown(fee) {
  const billed = Math.round(num(fee.total_amount) * 100);
  let collected = num(fee.allocated_payment_cents);
  let deposit = num(fee.allocated_deposit_cents);
  if (!fee.allocation_managed) {
    if (fee.payment_provider === 'deposit' && fee.status === 'paid') deposit = billed;
    else if (fee.status === 'paid' || ['partial','partially_paid','partial_paid'].includes(fee.status)) {
      collected = fee.payment_amount_cents ?? (fee.status === 'paid' ? billed : 0);
    }
  }
  const waived = fee.status === 'waived' ? Math.max(0, billed - collected - deposit) : num(fee.allocated_waiver_cents);
  const remainder = Math.max(0, billed - collected - deposit - waived);
  return [billed, collected, deposit, waived, fee.status === 'cancelled' ? remainder : 0,
    fee.included_in_initial_payment || fee.status === 'cancelled' ? 0 : remainder].map(dollars);
}

export function buildAccountantLedger(data) {
  const { asOf, revenue, rentals, fees, transactions } = data;
  const report = calculatePaymentRevenue(revenue, new Date(asOf), true);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Rent Me CT';
  workbook.created = new Date(asOf);
  const asOfText = new Intl.DateTimeFormat('en-US', { timeZone:'America/New_York',dateStyle:'medium',timeStyle:'short' }).format(workbook.created);
  function sheet(name, note, headers, widths, rows, moneyFrom, moneyTo = headers.length) {
    const ws = workbook.addWorksheet(name, { views:[{ state:'frozen', ySplit:4, showGridLines:false }],
      pageSetup:{ orientation:'landscape', paperSize:5, fitToPage:true, fitToWidth:1, fitToHeight:0, printTitlesRow:'1:4' } });
    ws.columns = widths.map(width => ({ width }));
    for (const [index, title] of [`Rent Me CT   /   ${name}`, note, `All records as of ${asOfText} Eastern   •   USD`].entries()) {
      ws.mergeCells(index+1, 1, index+1, headers.length);
      const cell = ws.getCell(index+1,1);
      cell.value = title;
      cell.font = { name:'Calibri', size:index === 0 ? 18 : 11, bold:index === 0, color:{argb:index === 0 ? 'FFFFFFFF' : 'FF334B5B'} };
      cell.fill = { type:'pattern', pattern:'solid', fgColor:{argb:index === 0 ? 'FF17394A' : 'FFEAF1F2'} };
      cell.alignment = { vertical:'middle', wrapText:true, indent:1 };
      ws.getRow(index+1).height = index === 0 ? 34 : index === 1 ? 34 : 20;
    }
    const header = ws.addRow(headers);
    header.height = 32;
    header.eachCell(cell => {
      cell.fill = {type:'pattern',pattern:'solid',fgColor:{argb:'FF26665F'}};
      cell.font = { bold:true,color:{argb:'FFFFFFFF'} };
      cell.alignment = { vertical:'middle',wrapText:true };
    });
    for (const values of rows) {
      const row = ws.addRow(values);
      row.eachCell((cell, col) => {
        if (col >= moneyFrom && col <= moneyTo && typeof cell.value === 'number') cell.numFmt = money;
        if (row.number % 2) cell.fill = {type:'pattern',pattern:'solid',fgColor:{argb:'FFF2F6F7'}};
        cell.alignment = { vertical:'top',wrapText:typeof cell.value === 'string' };
      });
    }
    ws.autoFilter = { from:{row:4,column:1},to:{row:4,column:headers.length} };
    ws.headerFooter.oddFooter = '&LRent Me CT   |   '+name+'&RPage &P of &N';
    return ws;
  }
  const months = new Map();
  for (const event of report.events) {
    const month = day(event.date)?.slice(0,7);
    if (month) months.set(month,(months.get(month) || 0) + event.net);
  }
  const feeRows = fees.map(fee => ({ fee, amounts:feeBreakdown(fee) }));
  const feeSum = (index, filter = () => true) => feeRows.filter(({fee}) => filter(fee)).reduce((sum,{amounts}) => sum + Math.round(amounts[index]*100),0)/100;
  const openLate = fee => ['late_fee','late_rental_day'].includes(fee.charge_type);
  sheet('Overview','Revenue follows the portal’s receipt and refund calculations. Review flagged records before closing the books.',
    ['Measure','Amount (USD)','Basis'],[38,19,83],[
      ['Revenue records for review',report.reviewItems.length,'See Review for receipt or refund issues that may affect the figures below.'],
      ['Month-to-date revenue',report.month,report.monthLabel+' • excludes sales tax and refundable deposits'],
      ['Year-to-date revenue',report.year,report.yearLabel+' • before business expenses and processor fees'],
      ['Additional fees outstanding',feeSum(5),'Current unpaid fee balances across all rentals'],
      ['Late charges outstanding',feeSum(5,openLate),'Included in additional fees outstanding'],
      ['Fees waived',feeSum(3),'All recorded fee waivers, including partial waivers'],
      ['Late charges waived',feeSum(3,openLate),'Included in fees waived'],
    ],2,2);
  sheet('Monthly revenue','Net revenue by receipt or refund month in Connecticut. The Revenue detail sheet lists the entries.',
    ['Month','Net revenue (USD)'],[44,37],Array.from(months).sort(([a],[b])=>a.localeCompare(b)).map(([m,n])=>[m,dollars(n)]),2);
  sheet('Rentals','Invoice snapshots include cancelled bookings. Discounts and under-25 markup are already reflected in rental price. Deposit is refundable.',
    ['Rental ID','Customer','Vehicle','Pickup','Return','Rental status','Payment status','Coupon code','Coupon discount','Manual discount','Under-25 markup','Rental after discounts','Booking fees','Sales tax','Deposit required','Deposit held (recorded)','Deposit returned'],
    [39,24,27,13,13,21,19,17,16,16,16,18,14,14,16,16,16],rentals.map(r=>[r.id,r.customer,r.vehicle,r.pickup_date,r.return_date,label(r.status),label(r.payment_status),r.discount_code,
      ...[r.discount_amount,r.manual_discount_amount,r.under_25_markup_amount,r.rental_total,r.service_fee_total,r.tax_amount,r.security_deposit,r.deposit_held_amount,r.deposit_released_amount].map(num)]),9);
  const outstandingByRental = new Map();
  for (const {fee,amounts} of feeRows) {
    outstandingByRental.set(fee.rental_id,(outstandingByRental.get(fee.rental_id) || 0) + Math.round(amounts[5]*100));
  }
  sheet('Balances','Current booking invoice includes refundable deposit. Open additional fees are listed individually on the Fees sheet.',
    ['Rental ID','Customer','Status','Booking invoice','Net booking paid','Booking due','Additional fees due','Total due','Booking credit'],
    [39,26,22,18,18,16,18,16,17],rentals.map(r => {
      const extra = outstandingByRental.get(r.id) || 0;
      return [r.id,r.customer,label(r.status),num(r.invoice_total),num(r.net_paid),num(r.booking_due),
        dollars(extra),dollars(Math.round(num(r.booking_due)*100)+extra),num(r.credit_due)];
    }),4);
  sheet('Fees','Amounts include applicable tax. Rows included in the booking are tracked on the rental invoice. Refunds are shown separately.',
    ['Rental ID','Fee ID','Posted (ET)','Category','Fee','Status','Included in booking','Billed','Recorded payment','Deposit applied','Waived','Cancelled','Outstanding','Tax in billed','External refund'],
    [39,39,14,19,35,18,15,15,16,16,15,15,16,15,16],feeRows.map(({fee:f,amounts})=>[f.rental_id,f.id,day(f.created_at),label(f.charge_type),f.name,label(f.status),f.included_in_initial_payment?'Yes':'No',...amounts,num(f.tax_amount),num(f.external_refunded_amount)]),8);
  sheet('Payment activity','Includes payment attempts, credits, deposit movements and refunds. Cash impact follows the Payments screen and includes deposits and tax.',
    ['Rental ID','Activity ID','Customer','Vehicle','Activity date (ET)','Received date','Type','Status','Description','Face amount','Cash impact','Outstanding per activity'],
    [39,50,24,27,15,15,18,18,56,16,16,18],transactions.map(t=>[t.rentalId,t.id,t.customer,t.vehicle,day(t.date),t.receivedDate,label(t.type),label(t.displayStatus),t.detail,num(t.amount),num(t.cashImpact),num(t.outstandingAmount)]),10);
  sheet('Extensions','Extension pricing and status. Activated extensions may already be reflected in the rental invoice.',
    ['Rental ID','Extension ID','Created (ET)','Type','Status','Payment status','Rental','Tax','Deposit','Total'],
    [39,39,15,26,24,18,15,15,15,15],revenue.extensions.map(e=>[e.rental_id,e.id,day(e.created_at),label(e.request_kind),label(e.status),label(e.payment_status),num(e.extension_rental_amount),num(e.extension_tax_amount),num(e.extension_deposit_amount),num(e.extension_total_amount)]),7);
  sheet('Revenue detail','Signed revenue recognized per entry. Sales tax can be estimated proportionally when the original receipt lacks a breakdown.',
    ['Rental ID','Source record','Revenue date (ET)','Net revenue (USD)'],[39,88,19,20],report.events.map(e=>[e.rentalId,e.id,day(e.date),dollars(e.net)]),4);
  sheet('Review','Records requiring reconciliation. Missing dates or refund classifications can affect reported revenue.',
    ['Rental ID','Record ID','Date (ET)','Amount (USD)','Reason'],[39,50,15,18,72],[
      ...report.reviewItems.map(i=>[i.rentalId,i.recordId,day(i.date),i.amount,i.reason]),
      ...transactions.filter(t=>t.type==='reconciliation' && ['failed','pending'].includes(t.statusGroup)).map(t=>[t.rentalId,t.id,day(t.date),t.amount,t.detail])],4,4);
  return workbook;
}
