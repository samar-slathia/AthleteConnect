import React from 'react';
import { ShieldCheck, Info } from 'lucide-react';

export const CoachesPlaceholderPage: React.FC = () => {
  return (
    <div className="placeholder-page-container">
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Coach Accreditation & Compliance</h2>
            <p className="panel-subtitle">Trainer verification and professional compliance pipeline.</p>
          </div>
          <span className="badge-status badge-phase">Phase 2 Planned</span>
        </div>

        <div className="placeholder-card">
          <div className="placeholder-icon">
            <ShieldCheck size={32} />
          </div>
          <h3 className="placeholder-title">Coach Verification Pipeline</h3>
          <p className="placeholder-desc">
            The coach accreditation pipeline—including background check evaluations, certification document reviews for Boxing, Kickboxing, and Wushu, and hourly rate auditing—will be integrated in Admin Phase 2.
          </p>
          <div className="placeholder-note">
            <Info size={16} />
            <span>Currently active and registered coach totals can be monitored in real time on the Operations Dashboard.</span>
          </div>
        </div>
      </div>
    </div>
  );
};

