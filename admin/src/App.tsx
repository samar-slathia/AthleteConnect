import React, { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './context/useAuth';
import { LoginPage } from './pages/LoginPage';
import { OverviewPage } from './pages/OverviewPage';
import { UsersPage } from './pages/UsersPage';
import { CoachesPage } from './pages/CoachesPage';
import { BookingsPage } from './pages/BookingsPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';
import type { NavigationItemKey } from './theme/tokens';
import { Zap } from 'lucide-react';

const AdminAppContent: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const [currentTab, setCurrentTab] = useState<NavigationItemKey>('dashboard');

  const pageTitles: Record<NavigationItemKey, string> = {
    dashboard: 'Operations Overview',
    users: 'User Account Management',
    coaches: 'Coach Verification & Compliance',
    bookings: 'Training Sessions & Bookings',
    reports: 'Operational Reports & Analytics',
    settings: 'Platform Settings & Governance',
  };

  if (isLoading) {
    return (
      <div className="admin-loading-screen" aria-label="Loading admin portal">
        <div className="loading-card">
          <div className="login-brand-icon spin-subtle">
            <Zap size={32} fill="#101C2C" stroke="#101C2C" />
          </div>
          <div className="loading-text">Verifying administrative session...</div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  const renderContent = () => {
    switch (currentTab) {
      case 'dashboard':
        return <OverviewPage />;
      case 'users':
        return <UsersPage />;
      case 'coaches':
        return <CoachesPage />;
      case 'bookings':
        return <BookingsPage />;
      case 'reports':
        return <ReportsPage />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <OverviewPage />;
    }
  };

  return (
    <div className="admin-layout">
      <Sidebar currentTab={currentTab} onSelectTab={setCurrentTab} />
      <main className="admin-main">
        <Topbar title={pageTitles[currentTab] || 'Admin Portal'} />
        <div className="admin-content">
          {renderContent()}
        </div>
      </main>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <AdminAppContent />
    </AuthProvider>
  );
};

export default App;
