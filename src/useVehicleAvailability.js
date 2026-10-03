import { useEffect, useState } from 'react';
import { withReadRetry } from './requestDeadline.js';

// A result belongs to its exact vehicle/time window. Never reuse an older
// window's green availability while the admin is changing the dates.
export function useVehicleAvailability(client, rentalId, from, until, vehicleId = null) {
  const key = JSON.stringify([rentalId, from, until, vehicleId]);
  const [state, setState] = useState({ key: '', rows: [], error: '', loading: false });
  const [attempt, setAttempt] = useState(0);
  const valid = Boolean(from && until && new Date(until) > new Date(from));
  useEffect(() => {
    if (!valid) return;
    let active = true;
    const timer = setTimeout(async () => {
      setState({ key, rows: [], error: '', loading: true });
      try {
        const { data, error } = await withReadRetry(() => client.rpc('admin_rental_vehicle_availability', {
          p_rental_id: rentalId, p_from: from, p_until: until, p_vehicle_id: vehicleId,
        }), 'Vehicle availability');
        if (error) throw error;
        if (!Array.isArray(data)) throw new Error('Availability response was incomplete. Please retry.');
        if (active) setState({ key, rows: data, error: '', loading: false });
      } catch (error) {
        if (active) setState({ key, rows: [], error: error.message || 'Availability could not be checked.', loading: false });
      }
    }, 200);
    return () => { active = false; clearTimeout(timer); };
  }, [client, rentalId, from, until, vehicleId, key, valid, attempt]);
  const current = state.key === key;
  return { rows: current ? state.rows : [], error: current ? state.error : '',
    loading: valid && (!current || state.loading), ready: valid && current && !state.loading && !state.error,
    retry: () => setAttempt((value) => value + 1) };
}
