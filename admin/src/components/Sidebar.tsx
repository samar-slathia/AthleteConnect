import React from 'react';
import { 
  LayoutDashboard, 
  ShieldCheck, 
  Users, 
  CalendarDays, 
  CreditCard,
  Zap
} from 'lucide-react';
import type { NavigationItemKey } from '../theme/tokens';

interface SidebarProps {
  currentTab: NavigationItemKey;
  onSelectTab: (tab: NavigationItemKey) => void;
}

interface NavItemConfig {
  key: NavigationItemKey;
  label: string;
  icon: React.ReactNode;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, onSelectTab }) => {
  const navItems: NavItemConfig[] = [
    { key: 'overview', label: 'Overview', icon: <LayoutDashboard size={18} /> },
    { key: 'coaches', label: 'Coach Verification', icon: <ShieldCheck size={18} /> },
    { key: 'users', label: 'Users', icon: <Users size={18} /> },
    { key: 'bookings', label: 'Bookings', icon: <CalendarDays size={18} /> },
    { key: 'finance', label: 'Finance', icon: <CreditCard size={18} /> },
  ];

  return (
    <aside className="admin-sidebar" aria-label="Admin Navigation">
      <div className="sidebar-brand">
        <div className="brand-icon-wrapper" aria-hidden="true">
          <Zap size={22} fill="#101C2C" />
        </div>
        <div>
          <div className="brand-title">AthleteConnect</div>
          <span className="brand-badge">Admin Shell</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item) => {
          const isActive = currentTab === item.key;
          return (
            <button
              key={item.key}
              type="button"
              className={`nav-link ${isActive ? 'active' : ''}`}
              onClick={() => onSelectTab(item.key)}
              aria-current={isActive ? 'page' : undefined}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div><strong>AthleteConnect v0.1.0</strong></div>
        <div>Phase 1 Foundation Preview</div>
        <div style={{ marginTop: '4px', opacity: 0.75 }}>Standalone Ops Console</div>
      </div>
    </aside>
  );
};
