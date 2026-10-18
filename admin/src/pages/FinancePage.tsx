import React from 'react';
import { CreditCard, DollarSign, ArrowDownRight, Wallet } from 'lucide-react';
import { NoticeBanner } from '../components/NoticeBanner';

export const FinancePage: React.FC = () => {
  return (
    <div>
      <NoticeBanner message="Payment gateways, automated payouts, escrow splits, and invoice generation will be developed in a later phase. No financial transactions take place in Phase 1." />

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Finance & Payout Settlement (Preview Shell)</h2>
            <p className="panel-subtitle">Simulated financial indicators for coaching fees and platform commission.</p>
          </div>
          <span className="badge-status badge-demo">Simulated Financials</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          <div style={{ padding: '16px', borderRadius: '8px', border: '1px solid var(--color-border)', backgroundColor: '#FAFBFD' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-navy)', fontWeight: 600, fontSize: '0.85rem' }}>
              <DollarSign size={16} /> Gross Booking Value (Sample)
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '8px', color: 'var(--color-navy)' }}>$48,250</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Simulated GMV</div>
          </div>

          <div style={{ padding: '16px', borderRadius: '8px', border: '1px solid var(--color-border)', backgroundColor: '#FAFBFD' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-success)', fontWeight: 600, fontSize: '0.85rem' }}>
              <Wallet size={16} /> Coach Payouts Queue (Sample)
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '8px', color: 'var(--color-navy)' }}>$41,012</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>85% Coach Share</div>
          </div>

          <div style={{ padding: '16px', borderRadius: '8px', border: '1px solid var(--color-border)', backgroundColor: '#FAFBFD' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#B45309', fontWeight: 600, fontSize: '0.85rem' }}>
              <ArrowDownRight size={16} /> Platform Take Rate (Sample)
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '8px', color: 'var(--color-navy)' }}>$7,238</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>15% Commission Rate</div>
          </div>
        </div>

        <div className="placeholder-card">
          <div className="placeholder-icon">
            <CreditCard size={26} />
          </div>
          <h3 className="placeholder-title">Automated Escrow & Payout System</h3>
          <p className="placeholder-desc">
            Direct deposit via Stripe/payment provider, automated tax reporting, refund management, and coach earnings statements will be fully implemented in a later phase.
          </p>
        </div>
      </section>
    </div>
  );
};
