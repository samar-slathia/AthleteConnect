import React from 'react';
import { Users, ShieldAlert, CalendarCheck, TrendingUp, ArrowUpRight } from 'lucide-react';
import { NoticeBanner } from '../components/NoticeBanner';

export const OverviewPage: React.FC = () => {
  const sampleStats = [
    {
      label: 'Sample Athletes',
      value: '1,280',
      change: '+14% this month',
      icon: <Users size={20} />,
      isDemo: true,
    },
    {
      label: 'Sample Coaches',
      value: '142',
      change: '8 pending review',
      icon: <ShieldAlert size={20} />,
      isDemo: true,
    },
    {
      label: 'Sample Completed Sessions',
      value: '3,490',
      change: '98.4% satisfaction',
      icon: <CalendarCheck size={20} />,
      isDemo: true,
    },
    {
      label: 'Sample Platform Volume',
      value: '$48,250',
      change: 'Simulated estimate',
      icon: <TrendingUp size={20} />,
      isDemo: true,
    },
  ];

  const sampleCoaches = [
    {
      id: 'coach-01',
      name: 'Marcus Reed',
      discipline: 'Kickboxing',
      experience: '8 years',
      submittedDate: '2026-10-15',
      status: 'Pending Verification',
    },
    {
      id: 'coach-02',
      name: 'Elena Vance',
      discipline: 'Boxing',
      experience: '12 years',
      submittedDate: '2026-10-16',
      status: 'Pending Verification',
    },
    {
      id: 'coach-03',
      name: 'Jin Wei',
      discipline: 'Wushu',
      experience: '15 years',
      submittedDate: '2026-10-17',
      status: 'Verified (Sample)',
    },
  ];

  return (
    <div>
      <NoticeBanner message="Phase 1 Foundation Preview: All statistics, coach records, and metrics below are purely synthetic sample data. Live database connections and server-side authentication will be connected in Phase 2." />

      <section aria-label="Key Platform Metrics">
        <div className="stats-grid">
          {sampleStats.map((stat, i) => (
            <div key={i} className="stat-card">
              <div className="stat-card-header">
                <span className="stat-label">{stat.label}</span>
                <span className="stat-icon">{stat.icon}</span>
              </div>
              <div className="stat-value">{stat.value}</div>
              <div className="stat-footnote">
                <span className="stat-tag tag-sample">DEMO</span>
                <span>{stat.change}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="panel" aria-label="Sample Coach Applications">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Coach Verification Queue (Sample Preview)</h2>
            <p className="panel-subtitle">Demonstrates how administrator staff will triage and verify certified trainers.</p>
          </div>
          <span className="badge-status badge-demo">Simulated Data</span>
        </div>

        <div className="table-wrapper">
          <table className="demo-table">
            <thead>
              <tr>
                <th>Applicant Name</th>
                <th>Discipline</th>
                <th>Experience</th>
                <th>Submission Date</th>
                <th>Verification Status</th>
                <th>Action Preview</th>
              </tr>
            </thead>
            <tbody>
              {sampleCoaches.map((coach) => (
                <tr key={coach.id}>
                  <td>
                    <strong>{coach.name}</strong>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>ID: {coach.id}</div>
                  </td>
                  <td>
                    <span style={{ 
                      padding: '2px 8px', 
                      borderRadius: '4px', 
                      backgroundColor: 'var(--color-mist)',
                      fontWeight: 600,
                      fontSize: '0.8rem'
                    }}>
                      {coach.discipline}
                    </span>
                  </td>
                  <td>{coach.experience}</td>
                  <td>{coach.submittedDate}</td>
                  <td>
                    <span className={`badge-status ${coach.status.includes('Verified') ? 'badge-verified' : 'badge-pending'}`}>
                      {coach.status}
                    </span>
                  </td>
                  <td>
                    <button type="button" className="btn-secondary" style={{ padding: '4px 10px', fontSize: '0.75rem' }} disabled title="Backend action disabled in Phase 1">
                      Review Docs <ArrowUpRight size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel" aria-label="Disciplines Preview">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Initial Sports Preview</h2>
            <p className="panel-subtitle">Categories designated for AthleteConnect Phase 1 preview.</p>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          {[
            { name: 'Boxing', demoCoaches: '48 Demo Coaches', color: '#101C2C' },
            { name: 'Wushu', demoCoaches: '32 Demo Coaches', color: '#16805D' },
            { name: 'Kickboxing', demoCoaches: '62 Demo Coaches', color: '#B45309' },
          ].map((sport) => (
            <div key={sport.name} style={{
              padding: '16px',
              borderRadius: '8px',
              backgroundColor: 'var(--color-mist)',
              border: '1px solid var(--color-border)'
            }}>
              <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--color-navy)' }}>{sport.name}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: '4px' }}>{sport.demoCoaches}</div>
              <div style={{ marginTop: '8px', fontSize: '0.7rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Sample Category</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
