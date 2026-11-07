import React from 'react';
import { ChevronDown } from 'lucide-react';
import { ChargeScrollList } from './ChargeScrollList.jsx';
import './rental-pricing-history.css';

const money = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);

export function RentalPricingHistory({ account, formatDate }) {
  const periods = account?.pricing_periods || [];
  const swaps = account?.swaps || [];
  if (!periods.length && !swaps.length) return null;
  return <details className="rental-pricing-history">
    <summary><strong>Agreed pricing periods</strong><span>{periods.length} period{periods.length === 1 ? '' : 's'}{swaps.length > 0 ? ` · ${swaps.length} swap${swaps.length === 1 ? '' : 's'}` : ''}</span><ChevronDown size={16}/></summary>
    <ChargeScrollList className="rental-pricing-history-list" label="Agreed pricing history — scroll for more">
      {periods.map(period => <p key={`period-${period.id}`}>{formatDate(period.starts_at)} → {formatDate(period.ends_at)}: {money(period.daily_rate)}/day · {money(Number(period.rental_amount) + Number(period.tax_amount))} including tax</p>)}
      {swaps.map(swap => <p key={`swap-${swap.id}`}>Swap effective {formatDate(swap.effective_at)} · recorded {formatDate(swap.recorded_at)} · {swap.reason}</p>)}
    </ChargeScrollList>
  </details>;
}
