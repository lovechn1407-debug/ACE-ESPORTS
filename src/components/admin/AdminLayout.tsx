import React, { useState, useEffect } from 'react';
import { auth } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import AdminDashboard from './AdminDashboard';
import AdminGames from './AdminGames';
import AdminTournaments from './AdminTournaments';
import AdminTournamentManagement from './AdminTournamentManagement';
import AdminUsers from './AdminUsers';
import AdminWithdrawals from './AdminWithdrawals';
import AdminDeposits from './AdminDeposits';
import AdminReferrals from './AdminReferrals';
import AdminTheme from './AdminTheme';
import AdminSettings from './AdminSettings';
import AdminPromotions from './AdminPromotions';
import AdminLeaderboard from './AdminLeaderboard';
import AdminNotifications from './AdminNotifications';
import AdminAnalytics from './AdminAnalytics';
import AdminReports from './AdminReports';
import AdminBadges from './AdminBadges';
import AdminEarningZone from './AdminEarningZone';

type AdminTab = 
  | 'dashboard'
  | 'games'
  | 'promotions'
  | 'tournaments'
  | 'score'
  | 'leaderboard'
  | 'users'
  | 'badges'
  | 'earningZone'
  | 'withdrawals'
  | 'deposits'
  | 'referrals'
  | 'notifications'
  | 'analytics'
  | 'reports'
  | 'theme'
  | 'settings';

const AdminLayout: React.FC = () => {
  const { userProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    document.body.classList.add('admin-body');
    return () => {
      document.body.classList.remove('admin-body');
    };
  }, []);

  const handleLogout = () => {
    if (confirm('Logout from Admin Console?')) {
      auth.signOut();
    }
  };

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: 'bi-grid-1x2-fill' },
    { id: 'games', label: 'Manage Games', icon: 'bi-controller' },
    { id: 'promotions', label: 'Promotions Slider', icon: 'bi-images' },
    { id: 'tournaments', label: 'Manage Matches', icon: 'bi-trophy-fill' },
    { id: 'score', label: 'Match Scores', icon: 'bi-list-check' },
    { id: 'leaderboard', label: 'Rank Leaderboard', icon: 'bi-bar-chart-line-fill' },
    { id: 'users', label: 'Player Accounts', icon: 'bi-people-fill' },
    { id: 'badges', label: 'Player Badges', icon: 'bi-patch-check-fill' },
    { id: 'earningZone', label: 'Earning Zone', icon: 'bi-coin' },
    { id: 'withdrawals', label: 'Withdraw Requests', icon: 'bi-cash-stack' },
    { id: 'deposits', label: 'Deposit Requests', icon: 'bi-credit-card-fill' },
    { id: 'referrals', label: 'Referral Audits', icon: 'bi-person-plus-fill' },
    { id: 'notifications', label: 'Broadcast Alerts', icon: 'bi-bell-fill' },
    { id: 'analytics', label: 'Player Analytics', icon: 'bi-graph-up-arrow' },
    { id: 'reports', label: 'Match Disputes', icon: 'bi-exclamation-triangle-fill' },
    { id: 'theme', label: 'Live Theme Editor', icon: 'bi-palette-fill' },
    { id: 'settings', label: 'Global Configs', icon: 'bi-gear-fill' }
  ];

  return (
    <div className="admin-layout d-flex text-white" style={{ minHeight: '100vh', background: '#0F172A' }}>
      {/* Sidebar Navigation */}
      <aside 
        className={`bg-dark border-end border-secondary border-opacity-25 d-flex flex-column transition-all ${
          sidebarOpen ? 'sidebar-open' : 'sidebar-closed'
        }`}
        style={{ 
          width: '260px', 
          zIndex: 1040, 
          position: window.innerWidth < 992 ? 'fixed' : 'sticky', 
          top: 0, 
          height: '100vh',
          left: window.innerWidth < 992 && !sidebarOpen ? '-260px' : '0',
          transition: 'left 0.3s ease, width 0.3s ease'
        }}
      >
        <div className="p-3 border-bottom border-secondary border-opacity-25 d-flex justify-content-between align-items-center">
          <div className="d-flex align-items-center gap-2">
            <i className="bi bi-shield-lock-fill text-warning fs-4"></i>
            <span className="fw-bold tracking-wider fs-5">ADMIN CONSOLE</span>
          </div>
          {window.innerWidth < 992 && (
            <button className="btn btn-sm btn-link text-secondary p-0" onClick={() => setSidebarOpen(false)}>
              <i className="bi bi-x-lg fs-5"></i>
            </button>
          )}
        </div>

        {/* User Chip */}
        <div className="p-3 bg-black bg-opacity-20 d-flex align-items-center gap-3">
          <img 
            src={userProfile?.photoURL || `https://ui-avatars.com/api/?name=Admin&background=1E293B&color=E2E8F0&bold=true`}
            alt="Admin avatar" 
            className="rounded-circle"
            style={{ width: '40px', height: '40px', objectFit: 'cover' }}
          />
          <div className="text-start overflow-hidden">
            <span className="text-white fw-bold d-block text-truncate small">{userProfile?.displayName || 'System Admin'}</span>
            <span className="text-success small block d-flex align-items-center gap-1">
              <span className="spinner-grow spinner-grow-sm text-success" style={{ width: '8px', height: '8px' }}></span> Online
            </span>
          </div>
        </div>

        {/* Links */}
        <nav className="flex-grow-1 p-2 overflow-y-auto d-flex flex-column gap-1">
          {navItems.map(item => (
            <button
              key={item.id}
              className={`nav-link text-start px-3 py-2.5 rounded-3 d-flex align-items-center gap-3 border-0 bg-transparent transition-all ${
                activeTab === item.id 
                  ? 'text-warning bg-warning bg-opacity-10 fw-bold' 
                  : 'text-secondary hover-text-white'
              }`}
              onClick={() => { setActiveTab(item.id as AdminTab); setSidebarOpen(false); }}
            >
              <i className={`bi ${item.icon}`}></i>
              <span style={{ fontSize: '0.9rem' }}>{item.label}</span>
            </button>
          ))}
        </nav>

        {/* Sign Out */}
        <div className="p-3 border-top border-secondary border-opacity-25">
          <button 
            className="btn btn-outline-danger w-100 d-flex align-items-center justify-content-center gap-2 btn-sm"
            onClick={handleLogout}
          >
            <i className="bi bi-box-arrow-left"></i> Sign Out
          </button>
        </div>
      </aside>

      {/* Backdrop for mobile */}
      {sidebarOpen && window.innerWidth < 992 && (
        <div 
          className="position-fixed top-0 start-0 w-100 h-100 bg-black bg-opacity-50"
          style={{ zIndex: 1030 }}
          onClick={() => setSidebarOpen(false)}
        ></div>
      )}

      {/* Main Content Area */}
      <div className="flex-grow-1 d-flex flex-column" style={{ minWidth: 0 }}>
        {/* Header toolbar */}
        <header className="navbar navbar-dark bg-dark sticky-top border-bottom border-secondary border-opacity-25 px-3 py-2.5">
          <div className="d-flex align-items-center gap-2">
            <button 
              className="btn btn-link text-white p-0 me-2 d-lg-none"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              <i className="bi bi-list fs-3"></i>
            </button>
            <span className="navbar-brand m-0 fw-semibold text-capitalize">{activeTab} Panel</span>
          </div>
          
          <div className="d-flex align-items-center gap-3">
            <a href="/" className="btn btn-outline-warning btn-sm d-flex align-items-center gap-2" target="_blank" rel="noopener noreferrer">
              <i className="bi bi-box-arrow-up-right"></i> Open Player Site
            </a>
          </div>
        </header>

        {/* Inner Panels Render */}
        <main className="flex-grow-1 p-4 overflow-y-auto" style={{ background: '#0F172A' }}>
          {activeTab === 'dashboard' && <AdminDashboard />}
          {activeTab === 'games' && <AdminGames />}
          {activeTab === 'promotions' && <AdminPromotions />}
          {activeTab === 'tournaments' && <AdminTournaments />}
          {activeTab === 'score' && <AdminTournamentManagement />}
          {activeTab === 'leaderboard' && <AdminLeaderboard />}
          {activeTab === 'users' && <AdminUsers />}
          {activeTab === 'badges' && <AdminBadges />}
          {activeTab === 'earningZone' && <AdminEarningZone />}
          {activeTab === 'withdrawals' && <AdminWithdrawals />}
          {activeTab === 'deposits' && <AdminDeposits />}
          {activeTab === 'referrals' && <AdminReferrals />}
          {activeTab === 'notifications' && <AdminNotifications />}
          {activeTab === 'analytics' && <AdminAnalytics />}
          {activeTab === 'reports' && <AdminReports />}
          {activeTab === 'theme' && <AdminTheme />}
          {activeTab === 'settings' && <AdminSettings />}
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
