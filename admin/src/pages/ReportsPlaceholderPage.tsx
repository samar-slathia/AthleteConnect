import React from 'react';
import { BarChart3, ShieldCheck } from 'lucide-react';

export const ReportsPlaceholderPage: React.FC = () => {
  return (
    <div className="placeholder-page-container">
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Operational & Financial Reports</h2>
            <p className="panel-subtitle">Verified analytics, exportable audit trails, and reconciliation statements.</p>
          </div>
          <span className="badge-status badge-phase">Phase 4 Planned</span>
        </div>

        <div className="placeholder-card">
          <div className="placeholder-icon">
            <BarChart3 size={32} />
          </div>
          <h3 className="placeholder-title">Reports & Data Exports</h3>
          <p className="placeholder-desc">
            Operational reports and financial settlements will be built in Admin Phase 4 using strictly verified platform data. Per system safety rules, estimated or mock GMV, commission splits, and coach payout balances are not rendered.
          </p>
          <div className="placeholder-note">
            <ShieldCheck size={16} />
            <span>Financial reporting will connect only to verified payment records upon completion of payment processing integrations.</span>
          </div>
        </div>
      </div>
    </div>
  );
};

