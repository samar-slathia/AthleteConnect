import React from 'react';
import { Users, UserCheck, Shield } from 'lucide-react';
import { NoticeBanner } from '../components/NoticeBanner';

export const UsersPage: React.FC = () => {
  return (
    <div>
      <NoticeBanner message="User management APIs, account moderation, and privacy-compliant data handling will be connected in Phase 2. The figures below are sample demonstration values." />

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Platform Users Directory (Preview Shell)</h2>
            <p className="panel-subtitle">Directory of registered Parents, Individual Customers, and Coaches.</p>
          </div>
          <span className="badge-status badge-demo">Simulated Breakdown</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          <div style={{ padding: '16px', borderRadius: '8px', border: '1px solid var(--color-border)', backgroundColor: '#FAFBFD' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-navy)', fontWeight: 600, fontSize: '0.85rem' }}>
              <Users size={16} /> Parents / Guardians
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '8px', color: 'var(--color-navy)' }}>640</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Managing minor athletes (Sample)</div>
          </div>

          <div style={{ padding: '16px', borderRadius: '8px', border: '1px solid var(--color-border)', backgroundColor: '#FAFBFD' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-navy)', fontWeight: 600, fontSize: '0.85rem' }}>
              <UserCheck size={16} /> Individual Customers
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '8px', color: 'var(--color-navy)' }}>640</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Adult trainees & hobbyists (Sample)</div>
          </div>

          <div style={{ padding: '16px', borderRadius: '8px', border: '1px solid var(--color-border)', backgroundColor: '#FAFBFD' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-navy)', fontWeight: 600, fontSize: '0.85rem' }}>
              <Shield size={16} /> Player / Coaches
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '8px', color: 'var(--color-navy)' }}>142</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Certified martial arts trainers (Sample)</div>
          </div>
        </div>

        <div className="placeholder-card">
          <div className="placeholder-icon">
            <Users size={26} />
          </div>
          <h3 className="placeholder-title">User Accounts Module</h3>
          <p className="placeholder-desc">
            Full profile management, role reassignment, activity logs, and account suspension tools will be implemented here alongside backend authentication and role-based access control.
          </p>
        </div>
      </section>
    </div>
  );
};
