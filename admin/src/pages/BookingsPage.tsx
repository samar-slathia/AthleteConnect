import React from 'react';
import { CalendarDays, Clock } from 'lucide-react';
import { NoticeBanner } from '../components/NoticeBanner';

export const BookingsPage: React.FC = () => {
  return (
    <div>
      <NoticeBanner message="Real booking management, cancellation workflows, and calendar synchronizations will be handled by the backend API in a later phase." />

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Training Sessions & Bookings (Preview Shell)</h2>
            <p className="panel-subtitle">Overview of scheduled sessions across all sports categories.</p>
          </div>
          <span className="badge-status badge-demo">Sample Listings</span>
        </div>

        <div className="table-wrapper" style={{ marginBottom: '24px' }}>
          <table className="demo-table">
            <thead>
              <tr>
                <th>Session ID</th>
                <th>Sport</th>
                <th>Coach</th>
                <th>Athlete / Role</th>
                <th>Schedule</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {[
                { id: 'BK-1049', sport: 'Boxing', coach: 'Elena Vance', client: 'Parent (Child: Leo)', time: 'Tomorrow, 10:00 AM', status: 'Confirmed (Demo)' },
                { id: 'BK-1050', sport: 'Kickboxing', coach: 'Marcus Reed', client: 'Individual (Alex M.)', time: 'Tomorrow, 2:30 PM', status: 'Confirmed (Demo)' },
                { id: 'BK-1051', sport: 'Wushu', coach: 'Jin Wei', client: 'Parent (Child: Maya)', time: 'Fri, 4:00 PM', status: 'Pending Coach' },
              ].map((b) => (
                <tr key={b.id}>
                  <td><strong>{b.id}</strong></td>
                  <td>
                    <span style={{ padding: '2px 8px', borderRadius: '4px', backgroundColor: 'var(--color-mist)', fontSize: '0.8rem', fontWeight: 600 }}>
                      {b.sport}
                    </span>
                  </td>
                  <td>{b.coach}</td>
                  <td>{b.client}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}>
                      <Clock size={14} color="var(--color-text-secondary)" /> {b.time}
                    </div>
                  </td>
                  <td>
                    <span className={`badge-status ${b.status.includes('Confirmed') ? 'badge-verified' : 'badge-pending'}`}>
                      {b.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="placeholder-card">
          <div className="placeholder-icon">
            <CalendarDays size={26} />
          </div>
          <h3 className="placeholder-title">Live Scheduling & Booking Control</h3>
          <p className="placeholder-desc">
            Complete booking lifecycle management (rescheduling, dispute mediation, facility location assignment, and attendance confirmation) will be active once database models are deployed.
          </p>
        </div>
      </section>
    </div>
  );
};
