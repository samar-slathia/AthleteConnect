import React from 'react';
import { Settings, Shield } from 'lucide-react';

export const SettingsPlaceholderPage: React.FC = () => {
  return (
    <div className="placeholder-page-container">
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">System Settings & Governance</h2>
            <p className="panel-subtitle">Platform configuration, role administration, and security policies.</p>
          </div>
          <span className="badge-status badge-phase">Phase 5 Planned</span>
        </div>

        <div className="placeholder-card">
          <div className="placeholder-icon">
            <Settings size={32} />
          </div>
          <h3 className="placeholder-title">Platform Administration Controls</h3>
          <p className="placeholder-desc">
            Administrative staff access provisioning, session timeout policies, system-wide maintenance toggles, and audit logging parameters will be managed here in Admin Phase 5.
          </p>
          <div className="placeholder-note">
            <Shield size={16} />
            <span>Administrator accounts must be securely provisioned via server-side database administration. Public registration of administrators is permanently disabled.</span>
          </div>
        </div>
      </div>
    </div>
  );
};

