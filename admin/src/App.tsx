import React, { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import type { NavigationItemKey } from './theme/tokens';
import { OverviewPage } from './pages/OverviewPage';
import { CoachVerificationPage } from './pages/CoachVerificationPage';
import { UsersPage } from './pages/UsersPage';
import { BookingsPage } from './pages/BookingsPage';
import { FinancePage } from './pages/FinancePage';

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<NavigationItemKey>('overview');

  const pageTitles: Record<NavigationItemKey, string> = {
    overview: 'Operations Overview',
    coaches: 'Coach Verification & Compliance',
    users: 'User Account Management',
    bookings: 'Training Sessions & Bookings',
    finance: 'Financial Operations & Payouts',
  };

  const renderContent = () => {
    switch (currentTab) {
      case 'overview':
        return <OverviewPage />;
      case 'coaches':
        return <CoachVerificationPage />;
      case 'users':
        return <UsersPage />;
      case 'bookings':
        return <BookingsPage />;
      case 'finance':
        return <FinancePage />;
      default:
        return <OverviewPage />;
    }
  };

  return (
    <div className="admin-layout">
      <Sidebar currentTab={currentTab} onSelectTab={setCurrentTab} />
      <main className="admin-main">
        <Topbar title={pageTitles[currentTab]} />
        <div className="admin-content">
          {renderContent()}
        </div>
      </main>
    </div>
  );
};

export default App;
