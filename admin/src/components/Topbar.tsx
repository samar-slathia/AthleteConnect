import React from 'react';

interface TopbarProps {
  title: string;
}

export const Topbar: React.FC<TopbarProps> = ({ title }) => {
  return (
    <header className="admin-topbar">
      <div className="topbar-left">
        <h1 className="topbar-page-title">{title}</h1>
      </div>
      <div className="topbar-right">
        <div className="phase-pill">
          <span className="status-dot" aria-hidden="true"></span>
          <span>Phase 1 Preview Mode</span>
        </div>
        <div className="admin-user-badge">
          <div className="admin-avatar">AD</div>
          <span className="admin-name">Admin Preview</span>
        </div>
      </div>
    </header>
  );
};
