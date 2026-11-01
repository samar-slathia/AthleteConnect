import React from 'react';
import { CalendarDays, Info } from 'lucide-react';

export const BookingsPlaceholderPage: React.FC = () => {
  return (
    <div className="placeholder-page-container">
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Training Sessions & Bookings Management</h2>
            <p className="panel-subtitle">Comprehensive training session oversight and dispute mediation.</p>
          </div>
          <span className="badge-status badge-phase">Phase 2 Planned</span>
        </div>

        <div className="placeholder-card">
          <div className="placeholder-icon">
            <CalendarDays size={32} />
          </div>
          <h3 className="placeholder-title">Session Scheduling & Mediation</h3>
          <p className="placeholder-desc">
            Complete booking lifecycle operations—including schedule adjustments, cancellation mediation, address validation, and coach attendance verification—will be implemented in Admin Phase 2.
          </p>
          <div className="placeholder-note">
            <Info size={16} />
            <span>Live booking totals (Pending, Accepted, Completed, and Cancelled/Declined) and recent session records are available on the Operations Dashboard.</span>
          </div>
        </div>
      </div>
    </div>
  );
};

