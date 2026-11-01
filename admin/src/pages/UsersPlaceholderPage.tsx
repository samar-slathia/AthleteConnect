import React from 'react';
import { Users, Info } from 'lucide-react';

export const UsersPlaceholderPage: React.FC = () => {
  return (
    <div className="placeholder-page-container">
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">User Accounts Management</h2>
            <p className="panel-subtitle">Dedicated member administration and account governance.</p>
          </div>
          <span className="badge-status badge-phase">Phase 2 Planned</span>
        </div>

        <div className="placeholder-card">
          <div className="placeholder-icon">
            <Users size={32} />
          </div>
          <h3 className="placeholder-title">User Management Module</h3>
          <p className="placeholder-desc">
            Granular user administration—including profile moderation, account deactivation/reactivation, role auditing, and parent-athlete link inspection—will be implemented in Admin Phase 2.
          </p>
          <div className="placeholder-note">
            <Info size={16} />
            <span>To view verified user counts across Parent, Individual, and Coach accounts, refer to the Operations Dashboard.</span>
          </div>
        </div>
      </div>
    </div>
  );
};

