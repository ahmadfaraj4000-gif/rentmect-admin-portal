const currency = '#,##0.00;[Red](#,##0.00);0.00';
const categories = [
  'Insurance', 'Repairs and maintenance', 'Cleaning and detailing', 'Fuel and charging',
  'Tolls and parking', 'Registration and licenses', 'Processor and bank fees', 'Rent and storage',
  'Advertising', 'Office and software', 'Professional services', 'Interest', 'Payroll and contractors',
  'Supplies', 'Other operating expense', 'Pending classification',
];

// Each entry sheet is an Excel table. Structured references grow when the owner adds rows.
function entryTable(sheet, name, tableName, note, headers, widths, formats) {
  const ws = sheet(name,note,headers,widths,[],Infinity);
  ws.autoFilter = undefined;
  ws.addTable({ name:tableName, ref:'A4', headerRow:true, totalsRow:false,
    style:{theme:'TableStyleMedium2',showRowStripes:true},
    columns:headers.map(header => ({name:header,filterButton:true})), rows:[headers.map(() => null)] });
  for (const [column,format] of Object.entries(formats)) ws.getColumn(column).numFmt = format;
  return ws;
}

export function addTaxWorkpapers({workbook,sheet,year,report,fees,day,feeBreakdown}) {
  workbook.calcProperties.fullCalcOnLoad = true;
  const annual = new Map();
  for (const entry of report.events) {
    const date = day(entry.date);
    if (!date) continue;
    const key = Number(date.slice(0,4));
    const values = annual.get(key) || [0,0];
    values[entry.net < 0 ? 1 : 0] += entry.net;
    annual.set(key,values);
  }
  const current = annual.get(year) || [0,0];
  const tax = sheet('Tax preparation','Select a calendar year in B5. Enter documented spending in Business expenses and vehicle purchases in Fleet assets. Keep the completed file with its supporting records.',
    ['Workpaper','Value','Source and interpretation'],[39,23,88],[
      ['Calendar year',year,'Change the year to review another period in this export.'],
      ['Rental revenue before refunds',null,'Dated revenue entries before recorded rental refunds. Sales tax and refundable deposits are excluded.'],
      ['Rental refunds reducing revenue',null,'Signed revenue reversals. Deposit returns are tracked separately in Payment activity.'],
      ['Net rental revenue',null,'Compare with Monthly revenue and resolve the items on Review before filing.'],
      ['Expense entries for this year',null,'A blank expense total means no business-share amounts have been entered for this year.'],
      ['Business share entered',null,'Includes vendor credits entered as negative amounts. The accountant determines tax treatment.'],
      ['Expense rows needing support',null,'Counts dated rows missing a payee, category, purpose, business share, payment reference, or receipt reference.'],
      ['Undated expense entries',null,'All years. Add the paid date to assign an amount to a calendar year.'],
    ],Infinity);
  const expr = (row,formula,result,format=currency) => {
    const cell=tax.getCell(row,2);
    cell.value={formula,result};
    cell.numFmt=format;
  };
  tax.getCell('B5').dataValidation={type:'whole',operator:'between',formulae:[1900,9999],showErrorMessage:true,error:'Enter a four-digit calendar year.'};
  tax.getCell('B5').font={bold:true,color:{argb:'FF155DA1'}};
  const dateCriteria='ExpenseLog[Date paid],">="&DATE($B$5,1,1),ExpenseLog[Date paid],"<"&DATE($B$5+1,1,1)';
  expr(6,'SUMIF(\'Annual revenue\'!A:A,B5,\'Annual revenue\'!B:B)',current[0]/100);
  expr(7,'SUMIF(\'Annual revenue\'!A:A,B5,\'Annual revenue\'!C:C)',current[1]/100);
  expr(8,'SUM(B6:B7)',(current[0]+current[1])/100);
  expr(9,`COUNTIFS(${dateCriteria})`,0,'0');
  expr(10,`IF(COUNTIFS(${dateCriteria},ExpenseLog[Business share USD],"<>")=0,"",SUMIFS(ExpenseLog[Business share USD],${dateCriteria}))`,'');
  expr(11,'SUMPRODUCT(--(ExpenseLog[Date paid]>=DATE(B5,1,1)),--(ExpenseLog[Date paid]<DATE(B5+1,1,1)),--(((ExpenseLog[Payee]="")+(ExpenseLog[Category]="")+(ExpenseLog[Business purpose]="")+(ExpenseLog[Business share USD]="")+(ExpenseLog[Amount paid USD]="")+(ExpenseLog[Payment reference]="")+(ExpenseLog[Receipt reference]=""))>0))',0,'0');
  expr(12,'COUNTIFS(ExpenseLog[Date paid],"",ExpenseLog[Amount paid USD],"<>")',0,'0');
  sheet('Annual revenue','Calendar years follow Connecticut receipt and refund dates. Open Review for unresolved or undated records.',
    ['Year','Before refunds','Refund reductions','Net rental revenue'],[18,24,24,28],
    [...annual].sort(([a],[b])=>a-b).map(([y,[positive,negative]])=>[y,positive/100,negative/100,(positive+negative)/100]),2);
  const expense=entryTable(sheet,'Business expenses','ExpenseLog',
    'Enter paid bills and vendor credits here. Use a negative amount for a credit. Record each cost once and keep the receipt or invoice under its reference.',
    ['Date paid','Payee','Category','Business purpose','Vehicle or rental ID','Amount paid USD','Business share USD','Payment reference','Receipt reference','Accountant notes'],
    [16,26,26,42,27,19,20,27,30,42],{A:'yyyy-mm-dd',F:currency,G:currency});
  const rollup=sheet('Expense categories','Totals use the paid date and calendar year selected on Tax preparation. Enter the business-use amount supported by each receipt.',
    ['Category','Business share USD'],[40,32],categories.map(c=>[c,null]),2);
  workbook.definedNames.add("'Expense categories'!$A$5:$A$"+(4+categories.length),'ExpenseCategories');
  expense.dataValidations.add('C5:C1048576',{type:'list',allowBlank:true,formulae:['ExpenseCategories'],showErrorMessage:true,error:'Select a category from the list.'});
  expense.dataValidations.add('G5:G1048576',{type:'custom',allowBlank:true,formulae:['AND(ISNUMBER(F5),ISNUMBER(G5),ABS(G5)<=ABS(F5),OR(G5=0,SIGN(G5)=SIGN(F5)))'],showErrorMessage:true,error:'Enter a business share within the signed amount paid.'});
  for(let row=5;row<5+categories.length;row++) {
    rollup.getCell(row,2).value={formula:`IF('Tax preparation'!$B$10="","",SUMIFS(ExpenseLog[Business share USD],ExpenseLog[Category],A${row},${dateCriteria.replaceAll('$B$5',"'Tax preparation'!$B$5")}))`,result:''};
    rollup.getCell(row,2).numFmt=currency;
  }
  entryTable(sheet,'Fleet assets','FleetAssets','Enter each vehicle or major improvement from purchase documents. Include prior depreciation and disposal records for the accountant.',
    ['Vehicle or VIN','Asset or improvement','Purchase date','In-service date','Cost USD','Business use %','Prior depreciation USD','Disposal date','Sale proceeds USD','Purchase or sale reference','Accountant notes'],
    [31,32,15,15,17,17,24,16,21,34,38],{C:'yyyy-mm-dd',D:'yyyy-mm-dd',E:currency,F:'0.0%',G:currency,H:'yyyy-mm-dd',I:currency});
  const periods=[...new Set([...annual.keys(), year])].sort();
  const settlements=sheet('Processor reconciliation','Enter monthly totals from the processor statement and corresponding bank deposits. Use positive refunds and fees, signed other activity, and opening and closing processor balances.',
    ['Month','Opening balance','Gross collections','Refunds','Fees','Other activity (+/−)','Closing balance','Expected payouts','Bank deposits','Difference','Statement references / timing notes'],
    [15,17,20,16,16,22,17,20,18,17,55],
    periods.flatMap(y=>Array.from({length:12},(_,m)=>[y+'-'+String(m+1).padStart(2,'0')])),2,10);
  for(let row=5;row<=settlements.rowCount;row++) {
    const inputs='B'+row+':G'+row;
    settlements.getCell(row,8).value={formula:`IF(COUNT(${inputs})<6,"",ROUND(B${row}+C${row}-D${row}-E${row}+F${row}-G${row},2))`,result:''};
    settlements.getCell(row,10).value={formula:`IF(COUNT(H${row}:I${row})<2,"",ROUND(I${row}-H${row},2))`,result:''};
    for(let col=2;col<=10;col++) settlements.getCell(row,col).numFmt=currency;
  }
  const groups=new Map();
  for(const fee of fees) {
    const date=day(fee.created_at);
    const key=JSON.stringify([date?.slice(0,4)||'Undated',fee.charge_type]);
    const totals=groups.get(key)||Array(6).fill(0);
    feeBreakdown(fee).forEach((amount,index)=>{totals[index]+=Math.round(amount*100);});
    groups.set(key,totals);
  }
  sheet('Fee adjustments','Grouped by year the charge was posted. Columns reflect status on the export date. Use Fees for rental IDs and charge-level evidence.',
    ['Year posted','Charge category','Billed','Payment recorded','Deposit applied','Waived','Cancelled','Still open'],[16,33,18,20,20,18,18,18],
    [...groups].sort(([a],[b])=>a.localeCompare(b)).map(([key,totals])=>{
      const [y,type]=JSON.parse(key);
      return [y,type?.replaceAll('_',' '),...totals.map(c=>c/100)];
    }),3);
  sheet('Records to gather','Use the source documents below to complete the handoff. Keep completed workpapers with the receipts and statements for the same period.',
    ['Area','Records to provide','What to check'],[31,67,79],[
      ['Bank and card accounts','Monthly bank and business credit-card statements, including the final statement of the year.','Match deposits and payments to statements. Identify transfers, owner contributions, loan proceeds, and draws separately.'],
      ['Payment processors','Stripe payout and balance reports, fees, disputes, and any Form 1099-K received.','Bridge gross collections to deposits through refunds, processing fees, disputes, and payout timing. Enter processor fees once.'],
      ['Operating expenses','Vendor bills, paid invoices, receipts, payment dates, and descriptions of business purpose.','Enter documented business amounts on Business expenses. Attach or retain the document named in Receipt reference.'],
      ['Fleet and financing','Vehicle purchase agreements, titles, in-service dates, mileage or use records, lender statements, and sales documents.','Complete Fleet assets. Separate loan principal and interest and give the accountant the prior depreciation schedule.'],
      ['Customer adjustments','Fees, Fee adjustments, Rentals, Revenue detail, and Review sheets.','Discounts already reduce rental pricing. Uncollected and waived charges require accounting-method review before any bad-debt treatment.'],
      ['Deposits and sales tax','Deposit activity, refund evidence, sales-tax filings, and remittance confirmations.','Reconcile refundable deposit balances and sales-tax collections and remittances separately from rental revenue.'],
      ['Payroll and insurance','Payroll reports, contractor statements, insurance policies, reimbursements, and claim settlements.','Identify business-paid costs and any reimbursements. Link each figure to the applicable period and source.'],
    ],Infinity);
}
