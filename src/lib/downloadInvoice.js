import pdfMake from 'pdfmake/build/pdfmake';
import fonts from 'pdfmake/build/vfs_fonts';

pdfMake.addVirtualFileSystem(fonts);

const green = '#185C40';
const muted = '#54685F';
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

function itemRow(line) {
  const amount = line.match(/^(.*): (\$-?[\d,.]+)$/);
  if (amount) {
    const bold = ['Rental invoice', 'Remaining rental invoice'].includes(amount[1]);
    return [{ text: amount[1], bold }, { text: amount[2], bold, alignment: 'right' }];
  }
  const extra = line.match(/^(.*) — (\$[\d,.]+) including (\$[\d,.]+) tax\. (.*)\. Remaining (\$[\d,.]+)\.$/);
  if (extra) {
    return [{ stack: [extra[1], { text: 'Includes ' + extra[3] + ' tax · ' + extra[4] + ' · Remaining ' + extra[5], color: muted, fontSize: 9 }] }, { text: extra[2], alignment: 'right' }];
  }
  return [{ text: line, colSpan: 2 }, {}];
}

export async function downloadInvoice(statement, rental, reference) {
  const lines = statement.statement.split('\n');
  const period = lines[0].startsWith('Rental period: ') ? lines.shift().slice('Rental period: '.length) : '';
  const rows = lines.filter(line => line && line !== 'Paid in full' && !line.startsWith('Total still owed: ')).map(itemRow);
  const date = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'America/New_York' }).format(new Date());
  const label = text => ({ text, fontSize: 9, color: muted, bold: true, margin: [0, 0, 0, 5] });
  const header = (text, alignment) => ({ text, alignment, color: 'white', fillColor: green, bold: true });
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
      { table: { headerRows: 1, widths: ['*', 92], body: [[header('Description', 'left'), header('Amount', 'right')], ...rows] },
        layout: { vLineWidth: () => 0, hLineWidth: i => i > 1 ? 0.5 : 0, hLineColor: () => '#DCE5DF',
          paddingLeft: () => 10, paddingRight: () => 10, paddingTop: () => 7, paddingBottom: () => 7 } },
      { unbreakable: true, margin: [0, 16, 0, 0], table: { widths: ['*', 'auto'], body: [[
        { text: Number(statement.due) === 0 ? 'Balance due · Paid in full' : 'Balance due', bold: true, margin: 8 },
        { text: money.format(statement.due), alignment: 'right', bold: true, fontSize: 15, margin: 6 }
      ]] }, layout: { hLineWidth: () => 0, vLineWidth: () => 0, fillColor: () => '#E7F2EB' } }
    ]
  };
  await pdfMake.createPdf(documentDefinition).download('Rent-Me-CT-Invoice-' + String(reference).replace(/[^a-z0-9_-]/gi, '-') + '.pdf');
}
