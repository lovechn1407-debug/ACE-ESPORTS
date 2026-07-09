import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { auth, db } from './firebase';
import { ref, onValue, get, set } from 'firebase/database';
import { useAuth } from './contexts/AuthContext';
import { useSettings } from './contexts/SettingsContext';
import MasterPanel from './components/admin/MasterPanel';

// Common Components
import Loader from './components/common/Loader';
import Header from './components/common/Header';
import BottomNav from './components/common/BottomNav';

// User Components
import Auth from './components/user/Auth';
import Home from './components/user/Home';
import Wallet from './components/user/Wallet';
import Leaderboard from './components/user/Leaderboard';
import Earnings from './components/user/Earnings';
import Profile from './components/user/Profile';
import Tournaments from './components/user/Tournaments';
import ChatModal from './components/user/ChatModal';
import NotificationsModal from './components/user/NotificationsModal';
import MatchHistoryModal from './components/user/MatchHistoryModal';
import MatchResultsModal from './components/user/MatchResultsModal';
import BannedPlayers from './components/user/BannedPlayers';
import EarningZone from './components/user/EarningZone';
import ProfileSetup from './components/user/ProfileSetup';

// Admin Components
import AdminAuth from './components/admin/AdminAuth';
import AdminLayout from './components/admin/AdminLayout';

// Bypass React JSX type-check warning for marquee
const Marquee = 'marquee' as any;

// App Layout for Players
const PlayerApp: React.FC = () => {
  const { currentUser, loading, isAdmin, userProfile } = useAuth();
  const { settings, loading: settingsLoading } = useSettings();

  // Selected navigation view: 'home' | 'wallet' | 'leaderboard' | 'earnings' | 'profile' | 'game' | 'earningZone'
  const [activeView, setActiveView] = useState<'home' | 'wallet' | 'leaderboard' | 'earnings' | 'profile' | 'game' | 'earningZone'>('home');
  const [selectedGame, setSelectedGame] = useState<{ id: string; name: string } | null>(null);
  // Sub-view within profile section
  const [profileSubView, setProfileSubView] = useState<null | 'earningZone' | 'banned'>(null);

  // Overlays
  const [activeChat, setActiveChat] = useState<{ id: string; name: string } | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [viewingResult, setViewingResult] = useState<{ id: string; name: string } | null>(null);
  
  // Policy Modal
  const [policyModal, setPolicyModal] = useState<{ title: string; content: string } | null>(null);

  // Deep-link triggers from Home to Tournaments modal
  const [initialSelectedTournamentId, setInitialSelectedTournamentId] = useState<string | null>(null);
  const [initialModalType, setInitialModalType] = useState<'rules' | 'players' | 'idpass' | null>(null);

  // Global Hard Refresh Broadcast Listener
  useEffect(() => {
    if (settings?.updateConfig?.lastHardRefresh) {
      const serverTS = settings.updateConfig.lastHardRefresh;
      const localAppliedStr = localStorage.getItem('lastAppliedRefresh') || '0';
      const localApplied = Number(localAppliedStr) || 0;

      if (serverTS > localApplied) {
        localStorage.setItem('lastAppliedRefresh', String(serverTS));
        console.log('Admin triggered hard refresh. Clearing caches and reloading...');
        
        if ('caches' in (window as any)) {
          caches.keys().then((names) => {
            Promise.all(names.map(name => caches.delete(name))).finally(() => {
              (window as any).location.reload();
            });
          }).catch(() => {
            (window as any).location.reload();
          });
        } else {
          (window as any).location.reload();
        }
      }
    }
  }, [settings]);

  if (loading || settingsLoading) {
    return <Loader fullPage />;
  }

  // Global Force Update Lock (Admins bypass force update to allow debugging/management)
  if (settings?.updateConfig?.forceUpdate && (!currentUser || !isAdmin)) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: 'linear-gradient(135deg, #0a0a0f 0%, #0f172a 50%, #0a0a0f 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          fontFamily: 'inherit'
        }}
      >
        <div style={{ width: '100%', maxWidth: '420px', textAlign: 'center' }}>
          {/* Glow ring icon */}
          <div style={{ position: 'relative', display: 'inline-block', marginBottom: '32px' }}>
            <div style={{
              width: '100px', height: '100px', borderRadius: '50%',
              background: 'rgba(250,204,21,0.08)',
              border: '2px solid rgba(250,204,21,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto',
              boxShadow: '0 0 40px rgba(250,204,21,0.12), 0 0 80px rgba(250,204,21,0.06)',
            }}>
              <i className="bi bi-cloud-arrow-down" style={{ fontSize: '2.5rem', color: '#facc15' }}></i>
            </div>
          </div>

          <h1 style={{
            fontSize: '1.6rem', fontWeight: 800, color: '#f1f5f9', marginBottom: '12px', letterSpacing: '-0.02em'
          }}>
            Update Required
          </h1>
          <p style={{ color: '#64748b', fontSize: '0.9rem', lineHeight: '1.7', marginBottom: '32px' }}>
            A new version of the app {settings.updateConfig.appVersion ? `(v${settings.updateConfig.appVersion})` : ''} is available.<br />
            Please update to continue participating in matches.
          </p>

          {/* Update Button */}
          <a
            href={settings.updateConfig.appLink || '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-custom btn-custom-accent w-100 py-3 fw-bold shadow-lg"
            style={{
              borderRadius: '12px',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              textDecoration: 'none'
            }}
          >
            <i className="bi bi-download"></i> Update Now
          </a>
        </div>
      </div>
    );
  }

  // Global Maintenance Lock (Admins bypass maintenance)
  if (settings.maintenanceMode && (!currentUser || !isAdmin)) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: 'linear-gradient(135deg, #0a0a0f 0%, #0f172a 50%, #0a0a0f 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          fontFamily: 'inherit'
        }}
      >
        <div style={{ width: '100%', maxWidth: '420px', textAlign: 'center' }}>
          {/* Admin bypass notice */}
          {currentUser && isAdmin && (
            <div className="alert alert-warning mb-4 py-2 border-0" style={{ fontSize: '0.8rem' }}>
              Maintenance mode is active. Users are currently locked out.
            </div>
          )}

          {/* Glow ring icon */}
          <div style={{ position: 'relative', display: 'inline-block', marginBottom: '32px' }}>
            <div style={{
              width: '100px', height: '100px', borderRadius: '50%',
              background: 'rgba(250,204,21,0.08)',
              border: '2px solid rgba(250,204,21,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto',
              boxShadow: '0 0 40px rgba(250,204,21,0.12), 0 0 80px rgba(250,204,21,0.06)',
              animation: 'pulse 2s infinite'
            }}>
              <i className="bi bi-wrench-adjustable" style={{ fontSize: '2.5rem', color: '#facc15' }}></i>
            </div>
          </div>

          <h1 style={{
            fontSize: '1.6rem', fontWeight: 800, color: '#f1f5f9', marginBottom: '12px', letterSpacing: '-0.02em'
          }}>
            Under Maintenance
          </h1>
          <p style={{ color: '#64748b', fontSize: '0.9rem', lineHeight: '1.7', marginBottom: '32px' }}>
            We're making improvements to give you a better experience.
            <br />This will only take a moment — hang tight!
          </p>

          {/* Skeleton shimmer lines */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '32px', opacity: 0.4 }}>
            {[90, 70, 80].map((w, i) => (
              <div key={i} style={{
                height: '8px', borderRadius: '8px',
                background: 'linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.04) 75%)',
                backgroundSize: '200% 100%',
                animation: `shimmer 1.6s infinite ${i * 0.2}s`,
                width: `${w}%`, margin: '0 auto'
              }}></div>
            ))}
          </div>

          {/* Spinner row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', color: '#475569', fontSize: '0.78rem' }}>
            <div className="spinner-border spinner-border-sm text-warning" role="status" style={{ width: '14px', height: '14px', borderWidth: '2px' }}></div>
            <span>Reconnecting automatically once we're back online...</span>
          </div>

          <style>{`
            @keyframes pulse {
              0%, 100% { box-shadow: 0 0 40px rgba(250,204,21,0.12), 0 0 80px rgba(250,204,21,0.06); }
              50% { box-shadow: 0 0 60px rgba(250,204,21,0.22), 0 0 120px rgba(250,204,21,0.1); }
            }
            @keyframes shimmer {
              0% { background-position: 200% 0; }
              100% { background-position: -200% 0; }
            }
          `}</style>
        </div>
      </div>
    );
  }

  // Auth Guard
  if (!currentUser) {
    return <Auth />;
  }

  // Profile Setup Guard for first-time tenant logins
  if (!userProfile) {
    return <ProfileSetup onSetupComplete={() => {}} />;
  }

  const handleSelectGame = (gameId: string, gameName: string) => {
    setSelectedGame({ id: gameId, name: gameName });
    setActiveView('game');
  };

  const handleOpenPolicy = (type: 'privacy' | 'terms' | 'refund' | 'fairPlay' | 'refer') => {
    const titles = {
      privacy: 'Privacy Policy',
      terms: 'Terms & Conditions',
      refund: 'Refund & Cancellations',
      fairPlay: 'Fair Play Policy',
      refer: 'Referral Program Rules'
    };

    let content = '';
    if (type === 'privacy') content = settings.policyPrivacy || 'Privacy Policy terms details.';
    else if (type === 'terms') content = settings.policyTerms || 'Terms and Conditions details.';
    else if (type === 'refund') content = settings.policyRefund || 'Refund details.';
    else if (type === 'fairPlay') content = settings.policyFairPlay || 'Fair Play guidelines.';
    else if (type === 'refer') {
      content = `Invite your friends and earn ₹${settings.referralBonus ?? 5} cash bonus for every friend who registers and joins tournaments. Your friend gets ₹${settings.signupBonus ?? 10} signup bonus instantly.`;
    }

    setPolicyModal({
      title: titles[type],
      content
    });
  };

  // Maps activeView tab value to BottomNav section string
  const activeSectionMap: Record<string, string> = {
    home: 'home-section',
    wallet: 'wallet-section',
    leaderboard: 'leaderboard-section',
    earnings: 'earnings-section',
    profile: 'profile-section',
    game: 'home-section',
    earningZone: 'home-section'
  };

  const reverseSectionMap: Record<string, 'home' | 'wallet' | 'leaderboard' | 'earnings' | 'profile' | 'earningZone'> = {
    'home-section': 'home',
    'wallet-section': 'wallet',
    'leaderboard-section': 'leaderboard',
    'earnings-section': 'earnings',
    'profile-section': 'profile',
    'earningZone-section': 'earningZone'
  };

  return (
    <div className="app-container d-flex flex-column" style={{ minHeight: '100vh' }}>
      {settings.maintenanceMode && isAdmin && (
        <div style={{ background: '#dc2626', color: '#ffffff', padding: '6px 12px', fontSize: '0.78rem', fontWeight: 'bold', textAlign: 'center', zIndex: 1060 }}>
          <i className="bi bi-shield-fill-exclamation me-1"></i> Maintenance Mode is LIVE (Normal users are currently blocked)
        </div>
      )}
      <Header 
        title={
          activeView === 'earningZone' || (activeView === 'profile' && profileSubView === 'earningZone')
            ? 'Earning Zone'
            : activeView === 'game' && selectedGame
            ? selectedGame.name
            : settings.appName
        }
        showBack={
          activeView === 'game' || 
          activeView === 'earningZone' || 
          (activeView === 'profile' && profileSubView === 'earningZone')
        }
        onBack={() => {
          if (activeView === 'earningZone') {
            setActiveView('home');
          } else if (activeView === 'profile' && profileSubView === 'earningZone') {
            setProfileSubView(null);
          } else {
            setSelectedGame(null);
            setActiveView('home');
          }
        }}
        onOpenNotifications={() => setShowNotifications(true)}
        onNavigateSection={(section) => {
          const tab = reverseSectionMap[section] || 'home';
          setSelectedGame(null);
          setProfileSubView(null);
          setActiveView(tab);
        }}
      />

      {/* Main viewport */}
      <main className="main-content">
        {/* Global Announcement Alert Banner */}
        {settings.announcementText && activeView === 'home' && (
          <div className="alert alert-warning py-2 px-3 small mb-3 border-0 rounded-3 d-flex align-items-center gap-2" role="alert">
            <i className="bi bi-megaphone-fill text-dark animate-pulse"></i>
            <Marquee className="text-dark fw-semibold m-0" scrollamount="4">
              {settings.announcementText}
            </Marquee>
          </div>
        )}

        {activeView === 'home' && (
          <Home 
            onSelectGame={handleSelectGame}
            onViewTournamentDetails={(tId, gId, gName) => {
              setInitialSelectedTournamentId(tId);
              setInitialModalType('rules');
              setSelectedGame({ id: gId, name: gName });
              setActiveView('game');
            }}
            onOpenChat={(tId, tName) => setActiveChat({ id: tId, name: tName })}
            onOpenPlayers={(tId, _tName, gId, gName) => {
              setInitialSelectedTournamentId(tId);
              setInitialModalType('players');
              setSelectedGame({ id: gId, name: gName });
              setActiveView('game');
            }}
            onOpenIdPass={(tId, gId, gName) => {
              setInitialSelectedTournamentId(tId);
              setInitialModalType('idpass');
              setSelectedGame({ id: gId, name: gName });
              setActiveView('game');
            }}
            onNavigateTab={(tab) => {
              setSelectedGame(null);
              setInitialSelectedTournamentId(null);
              setInitialModalType(null);
              setActiveView(tab);
            }}
          />
        )}


        {activeView === 'wallet' && <Wallet />}

        {activeView === 'leaderboard' && <Leaderboard />}

        {activeView === 'earnings' && <Earnings />}

        {activeView === 'earningZone' && (
          <EarningZone onBack={() => setActiveView('home')} />
        )}

        {activeView === 'profile' && profileSubView === null && (
          <Profile 
            onOpenPolicy={handleOpenPolicy}
            onOpenMatchHistory={() => setShowHistory(true)}
            onLogout={() => {
              if (confirm('Are you sure you want to logout?')) {
                auth.signOut();
              }
            }}
            onNavigateToView={(view) => setProfileSubView(view)}
          />
        )}

        {activeView === 'profile' && profileSubView === 'earningZone' && (
          <EarningZone onBack={() => setProfileSubView(null)} />
        )}

        {activeView === 'profile' && profileSubView === 'banned' && (
          <BannedPlayers onBack={() => setProfileSubView(null)} />
        )}

        {activeView === 'game' && selectedGame && (
          <Tournaments 
            gameId={selectedGame.id}
            gameName={selectedGame.name}
            initialSelectedTournamentId={initialSelectedTournamentId}
            initialModalType={initialModalType}
            onOpenChat={(tId, tName) => setActiveChat({ id: tId, name: tName })}
            onBack={() => {
              setSelectedGame(null);
              setInitialSelectedTournamentId(null);
              setInitialModalType(null);
              setActiveView('home');
            }}
          />
        )}
      </main>

      {/* Bottom Nav Bar */}
      <BottomNav 
        activeSection={activeSectionMap[activeView] || 'home-section'}
        onSelectSection={(section) => {
          const tab = reverseSectionMap[section] || 'home';
          setSelectedGame(null);
          setProfileSubView(null);
          setActiveView(tab);
        }}
      />

      {/* OVERLAY: Real-time Tournament Chat Room */}
      {activeChat && (
        <ChatModal 
          tournamentId={activeChat.id}
          tournamentName={activeChat.name}
          onClose={() => setActiveChat(null)}
        />
      )}

      {/* OVERLAY: Notifications List Modal */}
      {showNotifications && (
        <NotificationsModal 
          onClose={() => setShowNotifications(false)}
        />
      )}

      {/* OVERLAY: Match History Modal */}
      {showHistory && (
        <MatchHistoryModal 
          onClose={() => setShowHistory(false)}
          onViewResults={(tId, tName) => {
            setViewingResult({ id: tId, name: tName });
          }}
        />
      )}

      {/* OVERLAY: Match Results Modal (from history) */}
      {viewingResult && (
        <MatchResultsModal
          tournamentId={viewingResult.id}
          tournamentName={viewingResult.name}
          onClose={() => { setViewingResult(null); setShowHistory(false); }}
          onBack={() => { setViewingResult(null); setShowHistory(true); }}
        />
      )}

      {/* OVERLAY: Policy Modal */}
      {policyModal && (
        <div 
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
          style={{ zIndex: 1060, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(5px)' }}
        >
          <div className="custom-card p-4 mx-3" style={{ width: '100%', maxWidth: '500px', maxHeight: '80vh', overflowY: 'auto' }}>
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h5 className="modal-title m-0">{policyModal.title}</h5>
              <button className="btn-close btn-close-white" onClick={() => setPolicyModal(null)}></button>
            </div>
            <div className="text-secondary small text-start" style={{ whiteSpace: 'pre-wrap', lineHeight: '1.7' }}>
              {policyModal.content}
            </div>
            <button className="btn-custom btn-custom-secondary w-100 mt-4" onClick={() => setPolicyModal(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
};

// Admin Console Auth Guard
const AdminApp: React.FC = () => {
  const { currentUser, isAdmin, loading } = useAuth();
  const loggedInStaffStr = sessionStorage.getItem('loggedInStaff');
  const loggedInStaff = loggedInStaffStr ? JSON.parse(loggedInStaffStr) : null;

  if (loading) {
    return <Loader fullPage />;
  }

  // Admin Check: logged in AND authorized admin OR logged in as Staff
  if ((currentUser && isAdmin) || (loggedInStaff && loggedInStaff.id)) {
    return <AdminLayout />;
  }

  return <AdminAuth />;
};

interface TenantGuardProps {
  children: React.ReactNode;
  isAdminView?: boolean;
}

const TenantGuard: React.FC<TenantGuardProps> = ({ children, isAdminView }) => {
  const { org } = useParams<{ org: string }>();
  const [orgDetails, setOrgDetails] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [supportSettings, setSupportSettings] = useState<any>(null);

  useEffect(() => {
    get(ref(db, 'organisations/supportSettings')).then(snap => {
      if (snap.exists()) {
        setSupportSettings(snap.val());
      }
    });
  }, []);

  useEffect(() => {
    if (!org) {
      setLoading(false);
      return;
    }

    const orgRef = ref(db, `organisations/${org}`);
    const unsubscribe = onValue(orgRef, async (snapshot) => {
      if (snapshot.exists()) {
        setOrgDetails(snapshot.val());
        setLoading(false);
      } else if (org === 'default') {
        try {
          const snap = await get(ref(db, 'users'));
          const settingsSnap = await get(ref(db, 'settings'));
          const hasLegacy = snap.exists() || settingsSnap.exists();
          if (hasLegacy) {
            const defaultData = {
              name: settingsSnap.val()?.appName || 'Legacy Esports App',
              subExpiry: Date.now() + 365 * 24 * 60 * 60 * 1000,
              subPrice: 0,
              subClosed: false,
              showSubMessage: false,
              subMessage: 'Legacy account auto-registered.',
              createdAt: Date.now()
            };
            await set(orgRef, defaultData);
            setOrgDetails(defaultData);
          } else {
            setOrgDetails(null);
          }
        } catch (err) {
          console.error('Error auto-registering default org:', err);
          setOrgDetails(null);
        }
        setLoading(false);
      } else {
        setOrgDetails(null);
        setLoading(false);
      }
    }, (err) => {
      console.error('Error fetching org settings:', err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [org]);

  if (loading) {
    return <Loader fullPage />;
  }

  if (!orgDetails) {
    return (
      <div className="d-flex flex-column align-items-center justify-content-center text-white" style={{ minHeight: '100vh', background: '#0F172A', padding: '24px', fontFamily: 'system-ui' }}>
        <div className="text-center" style={{ maxWidth: '440px' }}>
          <i className="bi bi-exclamation-triangle text-danger" style={{ fontSize: '3.5rem' }}></i>
          <h1 className="fw-bold mt-3">Organisation Not Found</h1>
          <p className="text-secondary mt-2">The organisation URL you requested does not exist or has been removed. Please verify the URL and try again.</p>
          <a href="/master" className="btn btn-warning mt-4 px-4 py-2 fw-bold" style={{ color: '#000', borderRadius: '8px' }}>
            Go to Master Panel
          </a>
        </div>
      </div>
    );
  }

  const isClosed = orgDetails.subClosed;

  if (isClosed) {
    return (
      <div className="d-flex flex-column align-items-center justify-content-center text-white" style={{ minHeight: '100vh', background: '#0F172A', padding: '24px', fontFamily: 'system-ui' }}>
        <div className="text-center" style={{ maxWidth: '440px' }}>
          <i className="bi bi-shield-slash-fill text-danger animate-pulse" style={{ fontSize: '3.5rem' }}></i>
          <h1 className="fw-bold mt-3">Subscription Suspended</h1>
          <p className="text-secondary mt-2 mb-4">
            The subscription for <strong>{orgDetails.name}</strong> is currently suspended.<br />
            Please contact the system administrator to restore access.
          </p>

          {supportSettings && (
            <div className="p-3 mb-4 text-start" style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px' }}>
              <h6 className="fw-bold text-warning mb-3" style={{ fontSize: '0.85rem' }}>
                <i className="bi bi-telephone-fill me-1"></i> Contact Support
              </h6>
              <div className="d-flex flex-column gap-2" style={{ fontSize: '0.82rem' }}>
                {supportSettings.whatsapp && (
                  <div className="d-flex align-items-center gap-2">
                    <i className="bi bi-whatsapp text-success"></i>
                    <span>WhatsApp: <strong className="text-white">{supportSettings.whatsapp}</strong></span>
                  </div>
                )}
                {supportSettings.mobile && (
                  <div className="d-flex align-items-center gap-2">
                    <i className="bi bi-telephone-fill text-info"></i>
                    <span>Mobile: <strong className="text-white">{supportSettings.mobile}</strong></span>
                  </div>
                )}
                {supportSettings.email && (
                  <div className="d-flex align-items-center gap-2">
                    <i className="bi bi-envelope-fill text-danger"></i>
                    <span>Email: <strong className="text-white">{supportSettings.email}</strong></span>
                  </div>
                )}
                {supportSettings.instagram && (
                  <div className="d-flex align-items-center gap-2">
                    <i className="bi bi-instagram text-primary-emphasis" style={{ color: '#E1306C' }}></i>
                    <span>Instagram: <strong className="text-white">@{supportSettings.instagram}</strong></span>
                  </div>
                )}
              </div>
            </div>
          )}

          {isAdminView && (
            <a href="/master" className="btn btn-warning px-4 py-2 fw-bold" style={{ color: '#000', borderRadius: '8px' }}>
              Go to Host Master Panel
            </a>
          )}
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

function App() {
  return (
    <Router>
      <Routes>
        {/* Master Console Route */}
        <Route path="/master" element={<MasterPanel />} />

        {/* Admin Console Route */}
        <Route path="/:org/admin" element={<TenantGuard isAdminView><AdminApp /></TenantGuard>} />
        
        {/* Player App View Route */}
        <Route path="/:org" element={<TenantGuard><PlayerApp /></TenantGuard>} />

        {/* Catch-all redirect */}
        <Route path="*" element={<Navigate to="/master" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
