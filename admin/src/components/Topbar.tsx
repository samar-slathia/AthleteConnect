import React from 'react';
import { LogOut, Shield } from 'lucide-react';
import { useAuth } from '../context/useAuth';

interface TopbarProps {
  title: string;
}

export const Topbar: React.FC<TopbarProps> = ({ title }) => {
  const { user, logout } = useAuth();

  const getInitials = (name?: string) => {
    if (!name) return 'AD';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  return (
    <header className="admin-topbar">
      <div className="topbar-left">
        <h1 className="topbar-page-title">{title}</h1>
      </div>
      <div className="topbar-right">
        <div className="phase-pill" title="Connected to AthleteConnect MongoDB Backend">
          <span className="status-dot" aria-hidden="true"></span>
          <span>Live Backend</span>
        </div>

        <div className="admin-user-badge">
          <div className="admin-avatar" aria-hidden="true">
            {getInitials(user?.name)}
          </div>
          <div className="admin-user-details">
            <span className="admin-name">{user?.name || 'Administrator'}</span>
            <span className="admin-role-tag">
              <Shield size={11} /> Admin
            </span>
          </div>
        </div>

        <button
          type="button"
          className="btn-signout"
          onClick={logout}
          title="Sign out of Admin Portal"
          aria-label="Sign out"
        >
          <LogOut size={16} />
          <span>Sign Out</span>
        </button>
      </div>
    </header>
  );
};
