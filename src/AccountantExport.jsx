import React, { useState } from 'react';

export function AccountantExport({ client }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function download() {
    setBusy(true);
    setError('');
    try {
      const [{ data, error: readError }, { buildAccountantLedger }] = await Promise.all([
        client.rpc('admin_accountant_ledger'), import('./lib/accountantLedger.js'),
      ]);
      if (readError) throw readError;
      const workbook = buildAccountantLedger(data);
      const bytes = await workbook.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `Rent-Me-CT-accountant-ledger-${new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(data.asOf))}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (failure) {
      setError(failure.message || 'Download failed. Please retry.');
    } finally {
      setBusy(false);
    }
  }
  return <div className="row-actions"><button className="secondary-btn" type="button" disabled={busy} onClick={download}>
    {busy ? 'Preparing ledger…' : 'Download accountant ledger (.xlsx)'}</button>
    {error && <span role="alert">{error}</span>}</div>;
}
