import React from 'react';
import { 
  LayoutDashboard, 
  Users, 
  ShieldCheck, 
  CalendarDays, 
  BarChart3, 
  Settings,
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
    { key: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
    { key: 'users', label: 'Users', icon: <Users size={18} /> },
    { key: 'coaches', label: 'Coaches', icon: <ShieldCheck size={18} /> },
    { key: 'bookings', label: 'Bookings', icon: <CalendarDays size={18} /> },
    { key: 'reports', label: 'Reports', icon: <BarChart3 size={18} /> },
    { key: 'settings', label: 'Settings', icon: <Settings size={18} /> },
  ];

  return (
    <aside className="admin-sidebar" aria-label="Admin Navigation">
      <div className="sidebar-brand">
        <div className="brand-icon-wrapper" aria-hidden="true">
          <Zap size={22} fill="#101C2C" stroke="#101C2C" />
        </div>
        <div>
          <div className="brand-title">AthleteConnect</div>
          <span className="brand-badge">Admin Portal</span>
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
        <div><strong>AthleteConnect v1.0</strong></div>
        <div>Admin Phase 5 Active</div>
        <div style={{ marginTop: '4px', opacity: 0.75 }}>Connected to MongoDB</div>
      </div>
    </aside>
  );
};
