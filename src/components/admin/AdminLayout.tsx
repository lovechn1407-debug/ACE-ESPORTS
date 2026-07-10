import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { ref, onValue, get, set, push } from 'firebase/database';
import { auth, db } from '../../firebase';
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
import AdminStaffs from './AdminStaffs';
import AdminLogs from './AdminLogs';

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
  | 'settings'
  | 'staffs'
  | 'logs';

const AdminLayout: React.FC = () => {
  const { org } = useParams<{ org: string }>();
  const [orgDetails, setOrgDetails] = useState<any>(null);
  const [settings, setSettings] = useState<any>(null);

  const loggedInStaffStr = sessionStorage.getItem('loggedInStaff');
  const loggedInStaff = loggedInStaffStr ? JSON.parse(loggedInStaffStr) : null;
  const isStaff = !!loggedInStaff;
  const { userProfile } = useAuth();
  const defaultTab = isStaff && loggedInStaff.accessibleMenus?.[0]
    ? loggedInStaff.accessibleMenus[0]
    : 'dashboard';
  const [activeTab, setActiveTab] = useState<AdminTab>(defaultTab as AdminTab);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Badge counts for menu items
  const [badgeCounts, setBadgeCounts] = useState<Record<string, number>>({});
  const loginLoggedRef = useRef(false);

  // Support Chat Modal state
  const [showSupportChat, setShowSupportChat] = useState(false);
  const [supportMessages, setSupportMessages] = useState<any[]>([]);
  const [supportMsgText, setSupportMsgText] = useState('');

  // Expiry Reminder Modal state
  const [showExpiryWarning, setShowExpiryWarning] = useState(false);
  const [showWarningsPopover, setShowWarningsPopover] = useState(false);

  // Subscription Details and Renew state
  const [showSubDetailsModal, setShowSubDetailsModal] = useState(false);
  const [showRenewContacts, setShowRenewContacts] = useState(false);
  const [supportSettings, setSupportSettings] = useState<any>(null);

  // Support Chat unread messages count state
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    get(ref(db, 'organisations/supportSettings')).then(snap => {
      if (snap.exists()) {
        setSupportSettings(snap.val());
      }
    });
  }, []);

  // Write login log once per session
  useEffect(() => {
    if (loginLoggedRef.current) return;
    loginLoggedRef.current = true;

    const actor = isStaff ? loggedInStaff.id : (auth.currentUser?.email || 'admin');
    const actorType = isStaff ? 'staff' : 'admin';
    const logRef = push(ref(db, 'adminLoginLogs'));
    set(logRef, {
      actor,
      actorType,
      event: 'login',
      timestamp: Date.now(),
      userAgent: navigator.userAgent.slice(0, 200)
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Real-time badge count listeners
  useEffect(() => {
    const unsubs: (() => void)[] = [];

    // Pending withdrawals
    unsubs.push(onValue(ref(db, 'withdrawals'), snap => {
      let count = 0;
      if (snap.exists()) {
        snap.forEach(c => { if (c.val()?.status === 'pending') count++; });
      }
      setBadgeCounts(prev => ({ ...prev, withdrawals: count }));
    }));

    // Pending deposits
    unsubs.push(onValue(ref(db, 'deposits'), snap => {
      let count = 0;
      if (snap.exists()) {
        snap.forEach(c => { if (c.val()?.status === 'pending') count++; });
      }
      setBadgeCounts(prev => ({ ...prev, deposits: count }));
    }));

    // Open reports
    unsubs.push(onValue(ref(db, 'reports'), snap => {
      let count = 0;
      if (snap.exists()) {
        snap.forEach(tSnap => {
          tSnap.forEach(accused => {
            if ((accused.val()?.status || 'open') === 'open') count++;
          });
        });
      }
      setBadgeCounts(prev => ({ ...prev, reports: count }));
    }));

    // Pending earning zone claims
    unsubs.push(onValue(ref(db, 'earningZoneClaims'), snap => {
      let count = 0;
      if (snap.exists()) {
        snap.forEach(c => { if (c.val()?.status === 'pending') count++; });
      }
      setBadgeCounts(prev => ({ ...prev, earningZone: count }));
    }));

    // Live matches count
    unsubs.push(onValue(ref(db, 'tournaments'), snap => {
      let count = 0;
      if (snap.exists()) {
        snap.forEach(c => { if (c.val()?.status === 'live') count++; });
      }
      setBadgeCounts(prev => ({ ...prev, tournaments: count }));
    }));

    return () => unsubs.forEach(u => u());
  }, []);

  useEffect(() => {
    if (!org) return;
    const orgRef = ref(db, `organisations/${org}`);
    const unsubscribe = onValue(orgRef, (snap) => {
      if (snap.exists()) {
        setOrgDetails(snap.val());
      }
    });
    return () => unsubscribe();
  }, [org]);

  useEffect(() => {
    if (!org) return;
    const settingsRef = ref(db, 'settings');
    const unsubscribe = onValue(settingsRef, (snap) => {
      if (snap.exists()) {
        setSettings(snap.val());
      } else {
        setSettings({});
      }
    });
    return () => unsubscribe();
  }, [org]);

  useEffect(() => {
    if (!orgDetails?.subExpiry) return;
    const days = Math.max(0, Math.ceil((orgDetails.subExpiry - Date.now()) / (1000 * 60 * 60 * 24)));
    if (days <= 5) {
      const dismissed = localStorage.getItem(`sub_remind_dismissed_${orgDetails.subExpiry}`);
      if (!dismissed) {
        setShowExpiryWarning(true);
      }
    }
  }, [orgDetails]);

  useEffect(() => {
    if (!showSupportChat || !org) return;
    const messagesRef = ref(db, `supportChats/${org}/messages`);
    const unsubscribe = onValue(messagesRef, (snap) => {
      if (snap.exists()) {
        const msgs = Object.values(snap.val()) as any[];
        msgs.sort((a, b) => a.timestamp - b.timestamp);
        setSupportMessages(msgs);
      } else {
        setSupportMessages([]);
      }
    });
    return () => unsubscribe();
  }, [showSupportChat, org]);

  // Listen to unread messages count in support chat
  useEffect(() => {
    if (!org) return;
    const messagesRef = ref(db, `supportChats/${org}/messages`);
    const unsubscribe = onValue(messagesRef, (snap) => {
      if (snap.exists()) {
        const lastRead = Number(localStorage.getItem(`last_read_support_chat_${org}`) || '0');
        const msgs = Object.values(snap.val()) as any[];
        const unread = msgs.filter(m => m.sender === 'host' && m.timestamp > lastRead).length;
        setUnreadCount(showSupportChat ? 0 : unread);
      } else {
        setUnreadCount(0);
      }
    });
    return () => unsubscribe();
  }, [org, showSupportChat]);

  // Update last read timestamp when modal is open and new messages arrive
  useEffect(() => {
    if (showSupportChat && org) {
      localStorage.setItem(`last_read_support_chat_${org}`, Date.now().toString());
      setUnreadCount(0);
    }
  }, [showSupportChat, org, supportMessages]);

  const handleDismissExpiryWarning = () => {
    if (orgDetails?.subExpiry) {
      localStorage.setItem(`sub_remind_dismissed_${orgDetails.subExpiry}`, 'true');
    }
    setShowExpiryWarning(false);
  };

  const handleSendSupportMsg = async () => {
    if (!org || !supportMsgText.trim()) return;
    try {
      const messagesRef = ref(db, `supportChats/${org}/messages`);
      const newMsgRef = push(messagesRef);
      await set(newMsgRef, {
        sender: 'admin',
        message: supportMsgText.trim(),
        timestamp: Date.now()
      });
      setSupportMsgText('');
    } catch (err) {
      console.error('Error sending support message:', err);
    }
  };

  const daysLeft = orgDetails?.subExpiry 
    ? Math.max(0, Math.ceil((orgDetails.subExpiry - Date.now()) / (1000 * 60 * 60 * 24))) 
    : 0;

  useEffect(() => {
    document.body.classList.add('admin-body');

    // Add CSS animations dynamically to the document head
    const styleId = 'admin-layout-sub-styles';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        @keyframes sub-sweep {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes sub-pulse {
          0%, 100% { opacity: 0.85; }
          50% { opacity: 1; filter: brightness(1.2); }
        }
        @keyframes popover-fade {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .warning-popover-item:hover {
          background: rgba(255, 255, 255, 0.045) !important;
          border-color: rgba(255, 255, 255, 0.08) !important;
        }
      `;
      document.head.appendChild(style);
    }

    return () => {
      document.body.classList.remove('admin-body');
      const style = document.getElementById(styleId);
      if (style) style.remove();
    };
  }, []);

  const handleLogout = () => {
    if (confirm('Logout from Admin Console?')) {
      sessionStorage.removeItem('loggedInStaff');
      auth.signOut();
      window.location.reload();
    }
  };

  const isSubExpired = orgDetails?.subExpiry ? Date.now() > orgDetails.subExpiry : false;
  const unlockedTabs = orgDetails?.unlockedTabsWhenExpired || [
    'withdrawals', 'deposits', 'notifications', 'earningZone', 'users', 'settings'
  ];

  const warnings: { message: string; actionTab: AdminTab; label: string }[] = [];
  if (settings) {
    if (!settings.upiDetails) {
      warnings.push({
        message: 'UPI ID is not configured. Players will not be able to recharge accounts.',
        actionTab: 'settings',
        label: 'Setup UPI ID'
      });
    }
    if (!settings.qrCodeUrl) {
      warnings.push({
        message: 'Payment QR Code is not uploaded. Players will not see a scan code on recharge.',
        actionTab: 'settings',
        label: 'Upload QR Code'
      });
    }

    // Check if legal policy details are configured
    const defaultPrivacy = 'Privacy Policy details will be updated here.';
    const defaultTerms = 'Terms and Conditions details will be updated here.';
    const defaultRefund = 'Refund Policy & details will be updated here.';
    
    const isLegalConfigured = 
      settings.policyPrivacy && 
      settings.policyPrivacy.trim() !== '' && 
      settings.policyPrivacy.trim() !== defaultPrivacy &&
      settings.policyTerms && 
      settings.policyTerms.trim() !== '' && 
      settings.policyTerms.trim() !== defaultTerms &&
      settings.policyRefund && 
      settings.policyRefund.trim() !== '' && 
      settings.policyRefund.trim() !== defaultRefund;

    if (!isLegalConfigured) {
      warnings.push({
        message: 'Your legal policy details are not configured. Please customize the default template policies.',
        actionTab: 'settings',
        label: 'Configure Legal Policies'
      });
    }
  }
  if (orgDetails) {
    if (isSubExpired) {
      warnings.push({
        message: 'Your system subscription has expired. Access to core panels is restricted.',
        actionTab: 'dashboard',
        label: 'Renew Subscription'
      });
    } else if (daysLeft <= 5) {
      warnings.push({
        message: `Your subscription is expiring in ${daysLeft} days. Please renew to avoid service disruption.`,
        actionTab: 'dashboard',
        label: 'Renew Now'
      });
    }
  }

  useEffect(() => {
    if (isSubExpired) {
      const isCurrentTabLocked = !unlockedTabs.includes(activeTab) && activeTab !== 'tournaments';
      if (isCurrentTabLocked) {
        const firstUnlocked = unlockedTabs[0] || 'withdrawals';
        setActiveTab(firstUnlocked as AdminTab);
      }
    }
  }, [isSubExpired, activeTab, unlockedTabs]);

  const rawNavItems = [
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
    { id: 'settings', label: 'Global Configs', icon: 'bi-gear-fill' },
    { id: 'staffs', label: 'Manage Staffs', icon: 'bi-person-badge-fill' },
    { id: 'logs', label: 'Audit Logs', icon: 'bi-clipboard2-data-fill' }
  ];

  const navItems = isStaff 
    ? rawNavItems.filter(item => loggedInStaff.accessibleMenus?.includes(item.id))
    : rawNavItems;

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
            src={isStaff ? `https://ui-avatars.com/api/?name=${encodeURIComponent(loggedInStaff.id)}&background=1E293B&color=E2E8F0&bold=true` : (userProfile?.photoURL || `https://ui-avatars.com/api/?name=Admin&background=1E293B&color=E2E8F0&bold=true`)}
            alt="User avatar" 
            className="rounded-circle"
            style={{ width: '40px', height: '40px', objectFit: 'cover' }}
          />
          <div className="text-start overflow-hidden">
            <span className="text-white fw-bold d-block text-truncate small">{isStaff ? `@${loggedInStaff.id}` : (userProfile?.displayName || 'System Admin')}</span>
            <span className="text-success small block d-flex align-items-center gap-1">
              <span className="spinner-grow spinner-grow-sm text-success" style={{ width: '8px', height: '8px' }}></span> {isStaff ? 'Staff Panel' : 'Online'}
            </span>
          </div>
        </div>

        {/* Links */}
        <nav className="flex-grow-1 p-2 overflow-y-auto d-flex flex-column gap-1">
          {navItems.map(item => {
            const isLocked = isSubExpired && !unlockedTabs.includes(item.id) && item.id !== 'tournaments';
            const badgeCount = badgeCounts[item.id] || 0;
            return (
              <button
                key={item.id}
                className={`nav-link text-start px-3 py-2.5 rounded-3 d-flex align-items-center gap-3 border-0 bg-transparent transition-all ${
                  activeTab === item.id 
                    ? 'text-warning bg-warning bg-opacity-10 fw-bold' 
                    : 'text-secondary hover-text-white'
                }`}
                onClick={() => { 
                  if (isLocked) {
                    alert(`This feature is locked because your subscription has expired. Please renew your subscription to unlock.`);
                    return;
                  }
                  setActiveTab(item.id as AdminTab); 
                  setSidebarOpen(false); 
                }}
                style={{ opacity: isLocked ? 0.5 : 1 }}
              >
                <i className={`bi ${item.icon}`}></i>
                <span style={{ fontSize: '0.9rem' }}>{item.label}</span>
                {isLocked ? (
                  <i className="bi bi-lock-fill ms-auto text-danger" style={{ fontSize: '0.85rem' }}></i>
                ) : badgeCount > 0 ? (
                  <span
                    className="ms-auto badge rounded-pill"
                    style={{
                      background: '#EF4444',
                      color: '#fff',
                      fontSize: '0.6rem',
                      padding: '3px 7px',
                      fontWeight: 800,
                      minWidth: '20px',
                      animation: 'badge-pulse 2s infinite'
                    }}
                  >
                    {badgeCount > 99 ? '99+' : badgeCount}
                  </span>
                ) : null}
              </button>
            );
          })}
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
            {warnings.length > 0 && (
              <div className="position-relative">
                {/* Warning Icon Trigger */}
                <div 
                  onClick={() => setShowWarningsPopover(!showWarningsPopover)}
                  className="d-flex align-items-center justify-content-center position-relative"
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    transition: 'all 0.2s ease',
                    cursor: 'pointer'
                  }}
                  title={`${warnings.length} active warnings`}
                >
                  <i className="bi bi-exclamation-triangle-fill text-warning" style={{ fontSize: '1.05rem', animation: 'sub-pulse 2s infinite' }}></i>
                  <span 
                    className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger border border-dark"
                    style={{ fontSize: '0.6rem', padding: '0.25em 0.45em', transform: 'translate(-35%, -35%)' }}
                  >
                    {warnings.length}
                  </span>
                </div>

                {/* Floating Popover Drawer */}
                {showWarningsPopover && (
                  <>
                    <div 
                      className="position-fixed top-0 start-0 w-100 h-100" 
                      style={{ zIndex: 999, background: 'transparent' }}
                      onClick={() => setShowWarningsPopover(false)}
                    />
                    <div 
                      className="position-absolute end-0 mt-2 text-start"
                      style={{
                        width: '320px',
                        background: '#0B0F19',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '12px',
                        boxShadow: '0 15px 30px rgba(0, 0, 0, 0.5)',
                        zIndex: 1000,
                        overflow: 'hidden',
                        animation: 'popover-fade 0.18s cubic-bezier(0.16, 1, 0.3, 1)'
                      }}
                    >
                      {/* Popover Header */}
                      <div className="p-3 d-flex align-items-center justify-content-between" style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.06)', background: 'rgba(255, 255, 255, 0.01)' }}>
                        <span className="fw-bold text-white-50" style={{ fontSize: '0.68rem', letterSpacing: '0.05em' }}>CONFIGURATION WARNINGS</span>
                        <span 
                          className="badge bg-danger bg-opacity-10 text-danger border border-danger border-opacity-10" 
                          style={{ fontSize: '0.62rem', padding: '3px 8px' }}
                        >
                          {warnings.length} Issues
                        </span>
                      </div>

                      {/* Popover Items */}
                      <div className="p-2 d-flex flex-column gap-1.5" style={{ maxHeight: '280px', overflowY: 'auto' }}>
                        {warnings.map((w, idx) => (
                          <div 
                            key={idx} 
                            onClick={() => {
                              setActiveTab(w.actionTab);
                              setShowWarningsPopover(false);
                            }}
                            className="p-2.5 rounded-3 d-flex flex-column gap-1 cursor-pointer warning-popover-item"
                            style={{ 
                              background: 'rgba(255, 255, 255, 0.015)',
                              border: '1px solid rgba(255, 255, 255, 0.03)',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            <div className="d-flex align-items-center justify-content-between">
                              <div className="d-flex align-items-center gap-2">
                                <i className="bi bi-exclamation-circle text-danger" style={{ fontSize: '0.85rem' }}></i>
                                <span className="text-white fw-bold" style={{ fontSize: '0.74rem' }}>{w.label}</span>
                              </div>
                              <i className="bi bi-chevron-right text-secondary" style={{ fontSize: '0.65rem' }}></i>
                            </div>
                            <p className="m-0 text-white-50" style={{ fontSize: '0.68rem', paddingLeft: '18px', lineHeight: '1.4' }}>
                              {w.message}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
            {orgDetails && (
              <div className="d-flex align-items-center gap-2">
                {/* Subscription Countdown with Light Sweep */}
                <div 
                  onClick={() => { setShowSubDetailsModal(true); setShowRenewContacts(false); }}
                  className="sub-countdown-badge"
                  style={{
                    padding: '6px 14px',
                    borderRadius: '8px',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    color: '#fff',
                    background: isSubExpired
                      ? 'linear-gradient(90deg, #7f1d1d 0%, #dc2626 40%, #fee2e2 50%, #dc2626 60%, #7f1d1d 100%)'
                      : daysLeft <= 5 
                      ? 'linear-gradient(90deg, #9a3412 0%, #ea580c 40%, #ffedd5 50%, #ea580c 60%, #9a3412 100%)' 
                      : 'linear-gradient(90deg, #064e3b 0%, #10b981 40%, #d1fae5 50%, #10b981 60%, #064e3b 100%)',
                    backgroundSize: '200% 100%',
                    animation: 'sub-sweep 5s infinite linear',
                    border: isSubExpired 
                      ? '1px solid rgba(239, 68, 68, 0.5)' 
                      : daysLeft <= 5 
                      ? '1px solid rgba(251, 146, 60, 0.5)'
                      : '1px solid rgba(16, 185, 129, 0.5)',
                    boxShadow: isSubExpired
                      ? '0 0 15px rgba(220, 38, 38, 0.35)'
                      : daysLeft <= 5
                      ? '0 0 12px rgba(234, 88, 12, 0.25)'
                      : '0 0 12px rgba(16, 185, 129, 0.2)',
                    whiteSpace: 'nowrap',
                    cursor: 'pointer',
                    userSelect: 'none',
                    transition: 'transform 0.15s ease-in-out, filter 0.15s',
                    letterSpacing: '0.3px'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform = 'scale(1.03)';
                    e.currentTarget.style.filter = 'brightness(1.1)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.filter = 'brightness(1)';
                  }}
                  title="Click to view subscription details"
                >
                  <i className={`bi ${isSubExpired ? 'bi-arrow-repeat' : 'bi-clock-history'} me-1.5`}></i>
                  {isSubExpired ? 'Click to Renew' : `${daysLeft} days left`}
                </div>

                {/* Custom sub message notice if enabled */}
                {orgDetails.showSubMessage && orgDetails.subMessage && (
                  <span 
                    className="text-warning small d-none d-md-inline-block text-truncate me-2"
                    style={{ maxWidth: '280px', animation: 'sub-pulse 2s infinite' }}
                    title={orgDetails.subMessage}
                  >
                    <i className="bi bi-info-circle-fill me-1"></i>
                    {orgDetails.subMessage}
                  </span>
                )}
              </div>
            )}

            <button 
              onClick={() => setShowSupportChat(true)}
              className="btn btn-outline-info btn-sm d-flex align-items-center gap-2 position-relative"
            >
              <i className="bi bi-chat-dots-fill"></i> Support
              {unreadCount > 0 && (
                <span 
                  className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger border border-dark animate-pulse" 
                  style={{ fontSize: '0.68rem', padding: '0.28em 0.55em', transform: 'translate(-50%, -50%)', zIndex: 5 }}
                >
                  {unreadCount}
                </span>
              )}
            </button>
            <a href={`/${org}`} className="btn btn-outline-warning btn-sm d-flex align-items-center gap-2" target="_blank" rel="noopener noreferrer">
              <i className="bi bi-box-arrow-up-right"></i> Open Player Site
            </a>
          </div>
        </header>

        {/* Inner Panels Render */}
        <main className="flex-grow-1 p-4 overflow-y-auto" style={{ background: '#0F172A' }}>
          <style>{`
            @keyframes badge-pulse {
              0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.6); }
              50% { box-shadow: 0 0 0 4px rgba(239,68,68,0); }
            }
          `}</style>
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
          {activeTab === 'staffs' && <AdminStaffs />}
          {activeTab === 'logs' && <AdminLogs />}
        </main>
      </div>

      {/* Support Chat Modal */}
      {showSupportChat && (
        <div className="modal fade show d-block" tabIndex={-1} style={{ background: 'rgba(0,0,0,0.5)', zIndex: 1050 }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content bg-dark text-white border border-secondary border-opacity-25 text-start" style={{ borderRadius: '12px' }}>
              <div className="modal-header border-bottom border-secondary border-opacity-25">
                <h5 className="modal-title text-warning d-flex align-items-center gap-2">
                  <i className="bi bi-chat-dots-fill"></i> Host Support Chat
                </h5>
                <button type="button" className="btn-close btn-close-white" onClick={() => setShowSupportChat(false)}></button>
              </div>
              <div className="modal-body p-3">
                <div className="p-3 bg-black bg-opacity-35 rounded mb-3 d-flex flex-column gap-2" style={{ height: '300px', overflowY: 'auto' }}>
                  {supportMessages.length === 0 ? (
                    <p className="text-secondary small text-center my-auto">Need help? Send a message to the host administrator...</p>
                  ) : (
                    supportMessages.map((msg, i) => (
                      <div 
                        key={i} 
                        className={`p-2 rounded ${msg.sender === 'admin' ? 'align-self-end text-end bg-info text-dark' : 'align-self-start bg-secondary text-white'}`}
                        style={{ maxWidth: '85%', fontSize: '0.85rem', borderRadius: '8px' }}
                      >
                        <p className="m-0 text-start">{msg.message}</p>
                        <span className="small opacity-50 d-block mt-1 text-end" style={{ fontSize: '0.62rem' }}>
                          {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                        </span>
                      </div>
                    ))
                  )}
                </div>
                <div className="d-flex gap-2">
                  <input 
                    type="text" 
                    className="form-control bg-dark border-secondary text-white py-2" 
                    placeholder="Type issue description..." 
                    value={supportMsgText}
                    onChange={e => setSupportMsgText(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSendSupportMsg()}
                    style={{ borderRadius: '8px' }}
                  />
                  <button onClick={handleSendSupportMsg} className="btn btn-warning text-dark fw-bold px-3" style={{ borderRadius: '8px' }}>
                    Send
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Expiry Warning Popup */}
      {showExpiryWarning && (
        <div className="modal fade show d-block" tabIndex={-1} style={{ background: 'rgba(0,0,0,0.7)', zIndex: 1060 }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content text-bg-warning text-dark border-0" style={{ borderRadius: '12px', boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}>
              <div className="modal-header border-0 pb-0">
                <h5 className="modal-title fw-bold d-flex align-items-center gap-2">
                  <i className="bi bi-exclamation-triangle-fill fs-4 text-danger"></i> Subscription Expiry Reminder
                </h5>
                <button type="button" className="btn-close" onClick={() => setShowExpiryWarning(false)}></button>
              </div>
              <div className="modal-body p-4 text-start">
                <p className="fw-semibold m-0" style={{ fontSize: '1rem' }}>
                  Attention Admin! Your license for <strong>{orgDetails?.name || 'this Esports panel'}</strong> is expiring soon.
                </p>
                <div className="mt-3 p-3 bg-white bg-opacity-25 rounded-3 d-flex align-items-center justify-content-between">
                  <div>
                    <span className="small d-block text-black-50 fw-bold uppercase" style={{ fontSize: '0.62rem' }}>TIME REMAINING</span>
                    <strong className="fs-5 text-danger">{daysLeft} Days Left</strong>
                  </div>
                  <i className="bi bi-clock-history fs-2 text-dark opacity-50"></i>
                </div>
                <p className="small text-dark-50 mt-3 mb-0" style={{ fontSize: '0.8rem' }}>
                  Please renew your subscription with the host master administrator to avoid tournament management interruptions.
                </p>
              </div>
              <div className="modal-footer border-0 pt-0 d-flex gap-2 justify-content-end">
                <button 
                  onClick={handleDismissExpiryWarning}
                  className="btn btn-outline-dark fw-bold btn-sm rounded-pill"
                >
                  Don't show again
                </button>
                <button 
                  onClick={() => setShowExpiryWarning(false)} 
                  className="btn btn-dark text-white fw-bold btn-sm rounded-pill px-4"
                >
                  Okay
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Subscription Details Modal */}
      {showSubDetailsModal && (
        <div className="modal fade show d-block" tabIndex={-1} style={{ background: 'rgba(15,23,42,0.85)', backdropFilter: 'blur(8px)', zIndex: 1070 }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 text-white animate-fade-in" style={{ borderRadius: '16px', background: 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)' }}>
              
              {/* Glowing Top Line indicator */}
              <div style={{ height: '4px', background: isSubExpired ? 'linear-gradient(90deg, #ef4444, #f87171)' : 'linear-gradient(90deg, #eab308, #facc15)', borderTopLeftRadius: '16px', borderTopRightRadius: '16px' }} />

              <div className="modal-header border-0 px-4 pt-4 pb-0">
                <h5 className="modal-title fw-bold text-white d-flex align-items-center gap-2" style={{ fontSize: '1.2rem' }}>
                  <i className="bi bi-shield-check text-warning"></i> Subscription Details
                </h5>
                <button type="button" className="btn-close btn-close-white" onClick={() => setShowSubDetailsModal(false)}></button>
              </div>

              <div className="modal-body p-4 text-start">
                <div className="d-flex flex-column gap-3">
                  
                  {/* Status Card Banner */}
                  <div 
                    className="p-4 rounded-3 border text-center d-flex flex-column align-items-center justify-content-center"
                    style={{
                      background: isSubExpired ? 'rgba(239, 68, 68, 0.05)' : 'rgba(250, 204, 21, 0.03)',
                      borderColor: isSubExpired ? 'rgba(239, 68, 68, 0.15)' : 'rgba(250, 204, 21, 0.1)'
                    }}
                  >
                    <div 
                      className="d-flex align-items-center justify-content-center rounded-circle mb-3 animate-pulse"
                      style={{
                        width: '60px',
                        height: '60px',
                        background: isSubExpired ? 'rgba(239, 68, 68, 0.1)' : 'rgba(250, 204, 21, 0.1)',
                        color: isSubExpired ? '#EF4444' : '#FACC15',
                        fontSize: '1.6rem'
                      }}
                    >
                      <i className={isSubExpired ? 'bi bi-shield-slash-fill' : 'bi bi-shield-fill-check'}></i>
                    </div>
                    <h4 className="fw-bold m-0 text-white text-capitalize">{orgDetails?.name || 'Esports Organization'}</h4>
                    <span className="text-secondary small mt-1">Slug ID: /{org}</span>
                    
                    <span className={`badge py-1.5 px-3 rounded-pill text-black fw-bold mt-3`} style={{ backgroundColor: isSubExpired ? '#EF4444' : '#4ADE80', fontSize: '0.75rem' }}>
                      {isSubExpired ? 'Expired / Needs Renewal' : 'Active / Valid License'}
                    </span>
                  </div>

                  {/* Pricing and Expiry metrics */}
                  <div className="row g-2">
                    <div className="col-6">
                      <div className="p-3 rounded-3 text-start" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
                        <span className="text-secondary small d-block mb-1" style={{ fontSize: '0.65rem', fontWeight: 600 }}>LICENSE RATE</span>
                        <strong className="text-white fs-5">₹{orgDetails?.subPrice ?? 0}</strong>
                        <span className="text-secondary small d-block" style={{ fontSize: '0.62rem' }}>per license term</span>
                      </div>
                    </div>
                    <div className="col-6">
                      <div className="p-3 rounded-3 text-start" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
                        <span className="text-secondary small d-block mb-1" style={{ fontSize: '0.65rem', fontWeight: 600 }}>DAYS REMAINING</span>
                        <strong className={isSubExpired ? 'text-danger fs-5' : 'text-warning fs-5'}>
                          {isSubExpired ? '0 Days' : `${daysLeft} Days`}
                        </strong>
                        <span className="text-secondary small d-block" style={{ fontSize: '0.62rem' }}>left in license</span>
                      </div>
                    </div>
                  </div>

                  {/* Dates list */}
                  <div className="p-3 rounded-3 d-flex justify-content-between align-items-center" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
                    <div>
                      <span className="text-secondary small d-block" style={{ fontSize: '0.65rem' }}>VALID FROM</span>
                      <strong className="text-white small">{orgDetails?.createdAt ? new Date(orgDetails.createdAt).toLocaleDateString() : 'N/A'}</strong>
                    </div>
                    <div className="text-end">
                      <span className="text-secondary small d-block" style={{ fontSize: '0.65rem' }}>EXPIRATION DATE</span>
                      <strong className="text-white small">{orgDetails?.subExpiry ? new Date(orgDetails.subExpiry).toLocaleDateString() : 'N/A'}</strong>
                    </div>
                  </div>

                  {/* Locked functionality warnings */}
                  {isSubExpired && (
                    <div className="p-3 rounded-3 text-start animate-fade-in" style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.15)' }}>
                      <h6 className="fw-bold text-danger mb-1" style={{ fontSize: '0.82rem' }}>
                        <i className="bi bi-exclamation-triangle-fill me-1"></i> License Expired
                      </h6>
                      <p className="text-secondary small m-0" style={{ fontSize: '0.75rem', lineHeight: '1.25' }}>
                        Features relating to live tournament brackets, match results editing, and scoring tables are locked. Financial withdraw/deposit and communications remain available.
                      </p>
                    </div>
                  )}

                  {/* Actions & Support Reveal cards */}
                  <div className="d-flex flex-column gap-2 mt-2">
                    {!showRenewContacts ? (
                      <button 
                        onClick={() => setShowRenewContacts(true)} 
                        className="btn btn-warning w-100 fw-bold py-2.5 d-flex align-items-center justify-content-center gap-2"
                        style={{ borderRadius: '8px', color: '#000', fontSize: '0.88rem' }}
                      >
                        <i className="bi bi-arrow-repeat fs-5"></i>
                        {isSubExpired ? 'Renew Subcription Now' : 'Contact Support / Renew'}
                      </button>
                    ) : (
                      <div 
                        className="p-3 border rounded-3 animate-fade-in text-start"
                        style={{ background: 'rgba(250, 204, 21, 0.02)', borderColor: 'rgba(250, 204, 21, 0.15)', borderRadius: '10px' }}
                      >
                        <h6 className="fw-bold text-warning mb-3 d-flex align-items-center justify-content-between" style={{ fontSize: '0.82rem' }}>
                          <span><i className="bi bi-telephone-fill me-1"></i> Select Renewal Support</span>
                          <button className="btn btn-xs btn-link text-secondary p-0 text-decoration-none" onClick={() => setShowRenewContacts(false)} style={{ fontSize: '0.72rem' }}>Back</button>
                        </h6>
                        <div className="d-flex flex-column gap-2" style={{ fontSize: '0.8rem' }}>
                          {supportSettings?.whatsapp && (
                            <a 
                              href={`https://wa.me/${supportSettings.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(`i want to renew my portal orginisation name :${orgDetails?.name || ''}`)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn btn-sm btn-outline-success text-start d-flex align-items-center gap-2 py-2 px-3 justify-content-between"
                              style={{ textDecoration: 'none', borderRadius: '6px' }}
                            >
                              <span><i className="bi bi-whatsapp"></i> WhatsApp Message</span>
                              <span className="text-secondary small">{supportSettings.whatsapp}</span>
                            </a>
                          )}
                          {supportSettings?.mobile && (
                            <a 
                              href={`tel:${supportSettings.mobile}`}
                              className="btn btn-sm btn-outline-info text-start d-flex align-items-center gap-2 py-2 px-3 justify-content-between"
                              style={{ textDecoration: 'none', borderRadius: '6px' }}
                            >
                              <span><i className="bi bi-telephone-fill"></i> Call Support Mobile</span>
                              <span className="text-secondary small">{supportSettings.mobile}</span>
                            </a>
                          )}
                          {supportSettings?.email && (
                            <a 
                              href={`mailto:${supportSettings.email}?subject=Portal%20Renewal%20Request&body=Hi%2C%20I%20want%20to%20renew%20my%20portal%20organisation%20name%3A%20${encodeURIComponent(orgDetails?.name || '')}`}
                              className="btn btn-sm btn-outline-danger text-start d-flex align-items-center gap-2 py-2 px-3 justify-content-between"
                              style={{ textDecoration: 'none', borderRadius: '6px' }}
                            >
                              <span><i className="bi bi-envelope-fill"></i> Email Support</span>
                              <span className="text-secondary small">{supportSettings.email}</span>
                            </a>
                          )}
                          {supportSettings?.instagram && (
                            <a 
                              href={`https://instagram.com/${supportSettings.instagram.replace('@', '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn btn-sm btn-outline-primary text-start d-flex align-items-center gap-2 py-2 px-3 justify-content-between"
                              style={{ textDecoration: 'none', borderRadius: '6px' }}
                            >
                              <span><i className="bi bi-instagram"></i> DM Instagram</span>
                              <span className="text-secondary small">@{supportSettings.instagram}</span>
                            </a>
                          )}
                        </div>
                      </div>
                    )}

                    <button 
                      onClick={() => setShowSubDetailsModal(false)}
                      className="btn btn-outline-secondary w-100 py-2 mt-1"
                      style={{ borderRadius: '8px', fontSize: '0.85rem' }}
                    >
                      Close Details
                    </button>
                  </div>

                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Warnings List Modal Removed */}

    </div>
  );
};

export default AdminLayout;
