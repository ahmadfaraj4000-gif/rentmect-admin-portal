import pdfMake from 'pdfmake/build/pdfmake';
import fonts from 'pdfmake/build/vfs_fonts';

pdfMake.addVirtualFileSystem(fonts);

const green = '#185C40';
const muted = '#54685F';
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

function section(title, rightLabel, rows, keepRows = true) {
  if (!rows.length) return [];
  return [{
    margin: [0, 14, 0, 0],
    table: { headerRows: 1, keepWithHeaderRows: 1, dontBreakRows: keepRows, widths: ['*', 'auto'], body: [[
      { text: title, fontSize: 13, bold: true, color: green, fillColor: '#E9F2ED' },
      { text: rightLabel, alignment: 'right', color: green, fillColor: '#E9F2ED' }
    ], ...rows] },
    layout: { vLineWidth: () => 0, hLineWidth: i => i > 1 ? 0.5 : 0, hLineColor: () => '#DCE5DF',
      paddingLeft: () => 9, paddingRight: () => 9, paddingTop: () => 6, paddingBottom: () => 6 }
  }];
}

function amountRows(items) {
  return items.map(item => [{ text: item.label, bold: item.total }, { text: item.amount, bold: item.total, alignment: 'right' }]);
}

export async function downloadInvoice(statement, rental, reference, breakdown) {
  if (!breakdown) throw new Error('Refresh the balance preview to download the updated invoice.');
  const { period, rental: charges, payments, charges: extras, notes } = breakdown;
  const extraRows = extras.map(c => [{ stack: [
    { text: c.name, bold: true },
    { text: c.status + '  ·  ' + c.gross + ' including ' + c.tax + ' tax', color: green, margin: [0, 2, 0, 0], fontSize: 9 },
    ...(c.detail ? [{ text: c.detail, fontSize: 9, color: muted, margin: [0, 2, 0, 0] }] : [])
  ] }, { text: c.remaining, alignment: 'right', bold: true }]);
  const date = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'America/New_York' }).format(new Date());
  const label = text => ({ text, fontSize: 9, color: muted, bold: true, margin: [0, 0, 0, 5] });
  const logo = new URL('assets/logo-mobile.png', document.baseURI).href;
  const documentDefinition = {
    info: { title: 'Rent Me CT · Invoice ' + reference, author: 'Rent Me CT' },
    pageSize: 'LETTER',
    pageMargins: [42, 44, 42, 52],
    defaultStyle: { fontSize: 10, color: '#182D24', lineHeight: 1.2 },
    images: { logo },
    footer: (page, count) => ({
      columns: ['Rent Me CT', { text: 'Page ' + page + ' of ' + count, alignment: 'right' }],
      margin: [42, 15, 42, 0], color: muted, fontSize: 9
    }),
    content: [
      { columns: [{ image: 'logo', width: 124 }, { stack: [
        { text: 'INVOICE', fontSize: 27, bold: true, color: green },
        { text: 'Rental reference  ' + reference },
        { text: 'Issued  ' + date, color: muted }
      ], alignment: 'right' }] },
      { columns: [
        { stack: [label('BILL TO'), { text: rental.profiles?.full_name || rental.customer_name_snapshot || 'Rental customer', bold: true }, statement.recipient || ''] },
        { stack: [label('RENTAL DETAILS'), { text: rental.vehicles?.name || '', bold: true }, period] }
      ], columnGap: 24, margin: [0, 30, 0, 22] },
      { unbreakable: true, margin: [0, 0, 0, 0], table: { widths: ['*', 'auto'], body: [[
        { text: Number(statement.due) === 0 ? 'Balance due · Paid in full' : 'Balance due', bold: true, color: 'white', margin: 8 },
        { text: money.format(statement.due), alignment: 'right', bold: true, fontSize: 21, color: 'white', margin: 6 }
      ]] }, layout: { hLineWidth: () => 0, vLineWidth: () => 0, fillColor: () => green } },
      ...section('Rental charges', 'Amount', amountRows(charges)),
      ...section('Payments and credits', 'Amount', amountRows(payments)),
      ...section('Additional charges', 'Remaining', extraRows, extras.every(c => c.name.length + c.detail.length < 800)),
      ...notes.map(text => ({ text, margin: [0, 6, 0, 0] }))
    ]
  };
  await pdfMake.createPdf(documentDefinition).download('Rent-Me-CT-Invoice-' + String(reference).replace(/[^a-z0-9_-]/gi, '-') + '.pdf');
}
