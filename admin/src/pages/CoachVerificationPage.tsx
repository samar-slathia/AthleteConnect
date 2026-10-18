import React from 'react';
import { ShieldCheck, FileCheck2, Clock, CheckCircle2 } from 'lucide-react';
import { NoticeBanner } from '../components/NoticeBanner';

export const CoachVerificationPage: React.FC = () => {
  return (
    <div>
      <NoticeBanner message="Coach verification workflows will be integrated with real document storage and identity checking in Phase 2. The listings below are non-functional demonstration stubs." />

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Coach Accreditation Queue (Preview Shell)</h2>
            <p className="panel-subtitle">Review incoming coach certifications, background checks, and coaching licenses.</p>
          </div>
          <span className="badge-status badge-demo">Phase 1 Placeholder</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          <div style={{ padding: '16px', borderRadius: '8px', border: '1px solid var(--color-border)', backgroundColor: '#FAFBFD' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#B45309', fontWeight: 600, fontSize: '0.85rem' }}>
              <Clock size={16} /> Pending Document Checks
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '8px', color: 'var(--color-navy)' }}>8</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Demo Applications</div>
          </div>

          <div style={{ padding: '16px', borderRadius: '8px', border: '1px solid var(--color-border)', backgroundColor: '#FAFBFD' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-success)', fontWeight: 600, fontSize: '0.85rem' }}>
              <CheckCircle2 size={16} /> Approved This Month
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '8px', color: 'var(--color-navy)' }}>24</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Demo Coaches Verified</div>
          </div>
        </div>

        <div className="placeholder-card">
          <div className="placeholder-icon">
            <FileCheck2 size={26} />
          </div>
          <h3 className="placeholder-title">Coach Verification Pipeline Stubs</h3>
          <p className="placeholder-desc">
            This module will support multi-step coach reviews including identity verification, background screening, sport federation certifications (Boxing, Kickboxing, Wushu, etc.), and insurance policy validation in a later phase.
          </p>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="button" className="btn-primary" disabled style={{ opacity: 0.6, cursor: 'not-allowed' }}>
              <ShieldCheck size={16} /> Batch Verification (Phase 2)
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
