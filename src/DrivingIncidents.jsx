import React, { useState } from 'react';

export default function DrivingIncidents({ client, rentalId }) {
  const [reference, setReference] = useState('');
  const [speed, setSpeed] = useState('');
  const [reckless, setReckless] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [incidents, setIncidents] = useState([]);
  async function load() {
    const {data, error} = await client.from('rental_driving_incidents').select('incident_reference,peak_mph,reckless').eq('rental_id', rentalId).order('recorded_at');
    if (error) throw error;
    setIncidents(data);
  }
  async function record(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const {data, error} = await client.rpc('record_rental_driving_incident', {
        p_rental_id: rentalId, p_reference: reference.trim(), p_peak_mph: speed ? Number(speed) : null, p_reckless: reckless,
      });
      if (error) throw error;
      setMessage(data.requires_review ? 'Staff recovery review required. Verify the incident evidence and vehicle status.' : 'Incident recorded.');
      setReference(''); setSpeed(''); setReckless(false);
      await load();
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }
  return <details className="rental-card-supplement" onToggle={event => { if (event.currentTarget.open) load().catch(error => setMessage(error.message)); }}>
    <summary>Driving incidents</summary>
    {incidents.length > 0 && <ul>{incidents.map(i => <li key={i.incident_reference}>{i.incident_reference}{i.peak_mph ? ' · ' + i.peak_mph + ' mph' : ''}{i.reckless ? ' · Reckless driving' : ''}</li>)}</ul>}
    {(incidents.length >= 3 || incidents.some(i => i.peak_mph > 100)) && <p>Staff recovery review required.</p>}
    <form className="portal-form driving-incident-form" onSubmit={record}>
      <label>Incident report or trip event ID<input value={reference} maxLength={120} required onChange={e => setReference(e.target.value)}/></label>
      <label>Peak speed (mph)<input type="number" value={speed} min="0.1" max="399.9" step="0.1" onChange={e => setSpeed(e.target.value)}/></label>
      <label><input type="checkbox" checked={reckless} onChange={e => setReckless(e.target.checked)}/> Reckless driving documented</label>
      <button type="submit" className="secondary-btn" disabled={busy || !reference.trim() || (!reckless && Number(speed) <= 90)}>Record incident</button>
    </form>
    {message && <p role="status">{message}</p>}
  </details>;
}
