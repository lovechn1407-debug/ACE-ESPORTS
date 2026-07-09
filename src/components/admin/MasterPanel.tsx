import React, { useState, useEffect } from 'react';
import { ref, get, set, update, remove, onValue, push } from 'firebase/database';
import { db, auth } from '../../firebase';
import { onAuthStateChanged, signInWithEmailAndPassword, signInAnonymously, createUserWithEmailAndPassword } from 'firebase/auth';

interface Organisation {
  slug: string;
  name: string;
  subExpiry: number;
  subPrice: number;
  subClosed: boolean;
  showSubMessage: boolean;
  subMessage: string;
  createdAt: number;
  initCode?: string;
}

const MasterPanel: React.FC = () => {
  const [organisations, setOrganisations] = useState<Organisation[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [legacyDataExists, setLegacyDataExists] = useState(false);

  // Login form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passcode, setPasscode] = useState('');
  const [loginError, setLoginError] = useState('');

  // Organisation form states
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [subExpiryDate, setSubExpiryDate] = useState('');
  const [subPrice, setSubPrice] = useState(0);
  const [subClosed, setSubClosed] = useState(false);
  const [showSubMessage, setShowSubMessage] = useState(false);
  const [subMessage, setSubMessage] = useState('');
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  // Support Contacts State
  const [supportWhatsapp, setSupportWhatsapp] = useState('');
  const [supportMobile, setSupportMobile] = useState('');
  const [supportEmail, setSupportEmail] = useState('');
  const [supportInstagram, setSupportInstagram] = useState('');

  // Support Inbox State
  const [activeChatSlugs, setActiveChatSlugs] = useState<string[]>([]);
  const [selectedChatOrg, setSelectedChatOrg] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [replyText, setReplyText] = useState('');

  // Unlocked tabs state for expired subscriptions
  const [unlockedTabs, setUnlockedTabs] = useState<string[]>([
    'withdrawals', 'deposits', 'notifications', 'earningZone', 'users', 'settings'
  ]);

  const adminTabsList = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'games', label: 'Manage Games' },
    { id: 'promotions', label: 'Promotions Slider' },
    { id: 'tournaments', label: 'Manage Matches' },
    { id: 'score', label: 'Match Scores' },
    { id: 'leaderboard', label: 'Rank Leaderboard' },
    { id: 'users', label: 'Player Accounts' },
    { id: 'badges', label: 'Player Badges' },
    { id: 'earningZone', label: 'Earning Zone' },
    { id: 'withdrawals', label: 'Withdraw Requests' },
    { id: 'deposits', label: 'Deposit Requests' },
    { id: 'referrals', label: 'Referrals' },
    { id: 'notifications', label: 'Broadcast Alert' },
    { id: 'analytics', label: 'Analytics' },
    { id: 'reports', label: 'Reports' },
    { id: 'theme', label: 'Theme Settings' },
    { id: 'settings', label: 'Global Settings' }
  ];

  const authenticatePasscodeSession = async () => {
    const bypassEmail = 'master_passcode_bypass@esports.com';
    const bypassPassword = 'MasterPasscodeBypass123!';
    try {
      await signInWithEmailAndPassword(auth, bypassEmail, bypassPassword);
    } catch (err: any) {
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential' || err.code === 'auth/invalid-email') {
        try {
          await createUserWithEmailAndPassword(auth, bypassEmail, bypassPassword);
        } catch (createErr) {
          console.error('Failed to create passcode bypass user:', createErr);
        }
      } else {
        console.error('Failed to sign in passcode bypass user:', err);
      }
    }
  };

  useEffect(() => {
    // Authenticate using Firebase Auth & root adminConfig/adminUid, or passcode
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setAuthLoading(true);
      if (user) {
        try {
          const adminConfigRef = ref(db, 'adminConfig');
          const adminSnap = await get(adminConfigRef);
          if (adminSnap.exists() && adminSnap.val().adminUid === user.uid) {
            setIsAuthorized(true);
          } else {
            // Check passcode if they are logged in but not main admin UID
            const sessionAuth = localStorage.getItem('master_auth');
            if (sessionAuth === 'true') {
              setIsAuthorized(true);
            }
          }
        } catch (err) {
          console.error(err);
        }
      } else {
        const sessionAuth = localStorage.getItem('master_auth');
        if (sessionAuth === 'true') {
          authenticatePasscodeSession();
          setIsAuthorized(true);
        } else {
          setIsAuthorized(false);
        }
      }
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isAuthorized) return;

    // Check if legacy data exists at the root level
    const checkLegacyData = async () => {
      try {
        const snap = await get(ref(db, 'users'));
        const settingsSnap = await get(ref(db, 'settings'));
        const hasLegacy = snap.exists() || settingsSnap.exists();

        if (hasLegacy) {
          setLegacyDataExists(true);

          // Auto-register the legacy organization under slug 'default' if it doesn't exist
          const defaultOrgRef = ref(db, 'organisations/default');
          const defaultSnap = await get(defaultOrgRef);
          if (!defaultSnap.exists()) {
            await set(defaultOrgRef, {
              name: settingsSnap.val()?.appName || 'Legacy Esports App',
              subExpiry: Date.now() + 365 * 24 * 60 * 60 * 1000, // 1 year expiry
              subPrice: 0,
              subClosed: false,
              showSubMessage: false,
              subMessage: 'Legacy account auto-registered.',
              createdAt: Date.now(),
              initCode: Math.floor(100000000000 + Math.random() * 900000000000).toString()
            });
          }
        }
      } catch (err) {
        console.error('Error checking legacy data:', err);
      }
    };
    checkLegacyData();

    // Fetch global support settings
    get(ref(db, 'organisations/supportSettings')).then(snap => {
      if (snap.exists()) {
        const val = snap.val();
        setSupportWhatsapp(val.whatsapp || '');
        setSupportMobile(val.mobile || '');
        setSupportEmail(val.email || '');
        setSupportInstagram(val.instagram || '');
      }
    });

    // Listen to active chat slugs
    const supportChatsRef = ref(db, 'supportChats');
    const unsubChats = onValue(supportChatsRef, (snap) => {
      if (snap.exists()) {
        setActiveChatSlugs(Object.keys(snap.val()));
      } else {
        setActiveChatSlugs([]);
      }
    });

    const orgsRef = ref(db, 'organisations');
    const unsubscribe = onValue(orgsRef, (snapshot) => {
      setLoading(true);
      if (snapshot.exists()) {
        const data = snapshot.val();
        const list = Object.keys(data).map(key => ({
          slug: key,
          ...data[key]
        })) as Organisation[];
        setOrganisations(list);
      } else {
        setOrganisations([]);
      }
      setLoading(false);
    });

    return () => {
      unsubscribe();
      unsubChats();
    };
  }, [isAuthorized]);

  useEffect(() => {
    if (!selectedChatOrg || !isAuthorized) return;
    const messagesRef = ref(db, `supportChats/${selectedChatOrg}/messages`);
    const unsubscribe = onValue(messagesRef, (snap) => {
      if (snap.exists()) {
        const msgs = Object.values(snap.val()) as any[];
        msgs.sort((a, b) => a.timestamp - b.timestamp);
        setChatMessages(msgs);
      } else {
        setChatMessages([]);
      }
    });
    return () => unsubscribe();
  }, [selectedChatOrg, isAuthorized]);

  const handleSaveSupportSettings = async () => {
    try {
      const supportRef = ref(db, 'organisations/supportSettings');
      await set(supportRef, {
        whatsapp: supportWhatsapp.trim(),
        mobile: supportMobile.trim(),
        email: supportEmail.trim(),
        instagram: supportInstagram.trim()
      });
      alert('Global support settings saved successfully!');
    } catch (err) {
      console.error(err);
      alert('Failed to save support settings.');
    }
  };

  const handleSendReply = async () => {
    if (!selectedChatOrg || !replyText.trim()) return;
    try {
      const messagesRef = ref(db, `supportChats/${selectedChatOrg}/messages`);
      const newMsgRef = push(messagesRef);
      await set(newMsgRef, {
        sender: 'host',
        message: replyText.trim(),
        timestamp: Date.now()
      });
      setReplyText('');
    } catch (err) {
      console.error('Error sending reply:', err);
    }
  };

  const chatOrgs = activeChatSlugs.map(slug => {
    const org = organisations.find(o => o.slug === slug);
    return {
      slug,
      name: org ? org.name : slug
    };
  });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    try {
      // 1. First try logging in via standard passcode bypass
      if (passcode === 'host123' || passcode === 'HostPass123') {
        await authenticatePasscodeSession();
        localStorage.setItem('master_auth', 'true');
        setIsAuthorized(true);
        return;
      }

      // 2. Try firebase authentication
      if (email && password) {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        const adminConfigRef = ref(db, 'adminConfig');
        const adminSnap = await get(adminConfigRef);
        if (adminSnap.exists() && adminSnap.val().adminUid === cred.user.uid) {
          setIsAuthorized(true);
        } else {
          setLoginError('You are not registered as the master admin.');
        }
      } else {
        setLoginError('Please enter email/password or master passcode.');
      }
    } catch (err: any) {
      setLoginError(err.message || 'Login failed.');
    }
  };

  const handleLogout = () => {
    auth.signOut();
    localStorage.removeItem('master_auth');
    setIsAuthorized(false);
  };

  const handleCreateOrUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');

    const trimmedSlug = slug.trim().toLowerCase();
    const trimmedName = name.trim();

    if (!trimmedName || !trimmedSlug || !subExpiryDate) {
      setFormError('Name, Slug and Expiry Date are required.');
      return;
    }

    // Slug validation (alphanumeric and dashes)
    if (!/^[a-z0-9-]+$/.test(trimmedSlug)) {
      setFormError('Slug must contain only lowercase letters, numbers, and dashes.');
      return;
    }

    if (trimmedSlug === 'master' || trimmedSlug === 'admin') {
      setFormError('Slug cannot be reserved keywords like master or admin.');
      return;
    }

    const expiryTimestamp = new Date(subExpiryDate).getTime();

    try {
      const targetRef = ref(db, `organisations/${trimmedSlug}`);
      
      if (!editingSlug) {
        // Create Mode - check if already exists
        const checkSnap = await get(targetRef);
        if (checkSnap.exists()) {
          setFormError(`An organisation with slug "${trimmedSlug}" already exists.`);
          return;
        }

        // Fetch default policies from orgs/default/settings, fallback to root settings
        let defaultPolicies: any = {
          policyPrivacy: 'Privacy Policy details will be updated here.',
          policyTerms: 'Terms and Conditions details will be updated here.',
          policyRefund: 'Refund Policy & details will be updated here.',
          policyFairPlay: 'Fair Play Policy details will be updated here.'
        };
        try {
          const defaultSettingsSnap = await get(ref(db, 'orgs/default/settings'));
          if (defaultSettingsSnap.exists()) {
            const val = defaultSettingsSnap.val();
            if (val.policyPrivacy) defaultPolicies.policyPrivacy = val.policyPrivacy;
            if (val.policyTerms) defaultPolicies.policyTerms = val.policyTerms;
            if (val.policyRefund) defaultPolicies.policyRefund = val.policyRefund;
            if (val.policyFairPlay) defaultPolicies.policyFairPlay = val.policyFairPlay;
          } else {
            const rootSettingsSnap = await get(ref(db, 'settings'));
            if (rootSettingsSnap.exists()) {
              const val = rootSettingsSnap.val();
              if (val.policyPrivacy) defaultPolicies.policyPrivacy = val.policyPrivacy;
              if (val.policyTerms) defaultPolicies.policyTerms = val.policyTerms;
              if (val.policyRefund) defaultPolicies.policyRefund = val.policyRefund;
              if (val.policyFairPlay) defaultPolicies.policyFairPlay = val.policyFairPlay;
            }
          }
        } catch (fetchErr) {
          console.error('Error fetching default policies:', fetchErr);
        }

        // Initialize new organization's settings with these default policies
        const newSettingsRef = ref(db, `orgs/${trimmedSlug}/settings`);
        await set(newSettingsRef, {
          appName: trimmedName,
          ...defaultPolicies
        });

        // Copy default organization's games list to the new organization (sanitized to exclude matches/tournaments)
        try {
          const defaultGamesSnap = await get(ref(db, 'orgs/default/games'));
          if (defaultGamesSnap.exists()) {
            const rawGames = defaultGamesSnap.val();
            const sanitizedGames: Record<string, any> = {};
            
            Object.entries(rawGames).forEach(([gameId, gameVal]: [string, any]) => {
              if (gameVal && typeof gameVal === 'object') {
                sanitizedGames[gameId] = {
                  name: gameVal.name || '',
                  imageUrl: gameVal.imageUrl || '',
                  ...(gameVal.createdAt ? { createdAt: gameVal.createdAt } : {}),
                  ...(gameVal.updatedAt ? { updatedAt: gameVal.updatedAt } : {})
                };
              }
            });
            
            await set(ref(db, `orgs/${trimmedSlug}/games`), sanitizedGames);
          }
        } catch (gamesErr) {
          console.error('Error copying default games list:', gamesErr);
        }
      }

      const existingOrg = organisations.find(x => x.slug === trimmedSlug || x.slug === editingSlug);
      const orgData = {
        name: trimmedName,
        subExpiry: expiryTimestamp,
        subPrice: Number(subPrice) || 0,
        subClosed: subClosed,
        showSubMessage: showSubMessage,
        subMessage: subMessage.trim() || 'Subscription status updated.',
        createdAt: editingSlug ? (existingOrg?.createdAt || Date.now()) : Date.now(),
        initCode: existingOrg?.initCode || Math.floor(100000000000 + Math.random() * 900000000000).toString(),
        unlockedTabsWhenExpired: unlockedTabs
      };

      await set(targetRef, orgData);
      setFormSuccess(editingSlug ? 'Organisation updated successfully!' : 'Organisation created successfully!');
      
      // Reset Form
      setName('');
      setSlug('');
      setSubExpiryDate('');
      setSubPrice(0);
      setSubClosed(false);
      setShowSubMessage(false);
      setSubMessage('');
      setEditingSlug(null);
      setUnlockedTabs([
        'withdrawals', 'deposits', 'notifications', 'earningZone', 'users', 'settings'
      ]);
    } catch (err: any) {
      setFormError(err.message || 'Database write error.');
    }
  };

  const handleEditSelect = (org: Organisation) => {
    setEditingSlug(org.slug);
    setName(org.name);
    setSlug(org.slug);
    setSubPrice(org.subPrice);
    setSubClosed(org.subClosed);
    setShowSubMessage(org.showSubMessage);
    setSubMessage(org.subMessage || '');
    setUnlockedTabs(org.unlockedTabsWhenExpired || [
      'withdrawals', 'deposits', 'notifications', 'earningZone', 'users', 'settings'
    ]);
    
    // Format date string for HTML input (YYYY-MM-DD)
    const d = new Date(org.subExpiry);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    setSubExpiryDate(`${yyyy}-${mm}-${dd}`);
    setFormError('');
    setFormSuccess('');
  };

  const handleDelete = async (slugToDelete: string) => {
    if (!confirm(`Are you sure you want to delete "${slugToDelete}"? All tenant data will remain in database but the subscription and access route will be removed.`)) return;
    try {
      await remove(ref(db, `organisations/${slugToDelete}`));
      if (editingSlug === slugToDelete) {
        setEditingSlug(null);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to delete.');
    }
  };

  const handleMigrateLegacy = async (targetSlug: string) => {
    if (!confirm(`Are you sure you want to copy all root-level legacy data (users, settings, tournaments, etc.) into "orgs/${targetSlug}/"? This will overwrite any existing data in that organisation.`)) return;

    setLoading(true);
    try {
      const keys = [
        'users',
        'settings',
        'tournaments',
        'games',
        'chats',
        'withdrawals',
        'deposits',
        'promotions',
        'reports',
        'earningZoneConfig',
        'adminConfig',
        'coupons',
        'transactions'
      ];

      const updates: any = {};
      for (const key of keys) {
        const snap = await get(ref(db, key));
        if (snap.exists()) {
          updates[`orgs/${targetSlug}/${key}`] = snap.val();
        }
      }

      if (Object.keys(updates).length === 0) {
        alert('No legacy root-level data was found to migrate.');
        setLoading(false);
        return;
      }

      await update(ref(db), updates);
      alert(`Legacy data successfully copied to organisation "${targetSlug}"!`);
      
      if (confirm('Do you want to clear/delete the original root-level legacy data to avoid clashes? (Highly recommended)')) {
        const clears: any = {};
        for (const key of keys) {
          clears[key] = null;
        }
        await update(ref(db), clears);
        setLegacyDataExists(false);
        alert('Original root-level legacy data cleared.');
      }
    } catch (err: any) {
      alert('Migration failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Stats calculation
  const totalOrgs = organisations.length;
  const activeOrgs = organisations.filter(o => !o.subClosed && o.subExpiry > Date.now()).length;
  const totalRevenue = organisations.filter(o => !o.subClosed && o.subExpiry > Date.now()).reduce((sum, o) => sum + (o.subPrice || 0), 0);

  if (authLoading) {
    return (
      <div className="d-flex align-items-center justify-content-center" style={{ minHeight: '100vh', background: '#090D1A', color: '#fff' }}>
        <div className="spinner-border text-warning" role="status"></div>
      </div>
    );
  }

  // Not Logged In screen
  if (!isAuthorized) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'radial-gradient(circle at top, #1E293B 0%, #0F172A 70%, #090D1A 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px', fontFamily: 'system-ui'
      }}>
        <div className="card p-4 border border-secondary border-opacity-20 shadow-lg text-white" style={{ background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(10px)', borderRadius: '16px', width: '100%', maxWidth: '400px' }}>
          <div className="text-center mb-4">
            <i className="bi bi-shield-fill-check text-warning" style={{ fontSize: '3.5rem' }}></i>
            <h3 className="fw-bold mt-2">SAAS HOST CONSOLE</h3>
            <p className="text-secondary small">Access administration master panel</p>
          </div>

          <form onSubmit={handleLogin} className="d-flex flex-column gap-3">
            {loginError && (
              <div className="alert alert-danger border-0 py-2 small" role="alert">
                <i className="bi bi-exclamation-triangle-fill me-2"></i>{loginError}
              </div>
            )}

            <div>
              <label className="form-label text-secondary small fw-bold">MASTER PASSCODE</label>
              <input 
                type="password" 
                className="form-control bg-dark border-secondary border-opacity-25 text-white" 
                style={{ borderRadius: '8px' }} 
                value={passcode}
                onChange={e => setPasscode(e.target.value)}
                placeholder="Enter host passcode (e.g. HostPass123)"
              />
            </div>

            <div className="text-center text-secondary py-2 small">
              — OR SIGN IN WITH ADMIN CREDENTIALS —
            </div>

            <div>
              <label className="form-label text-secondary small fw-bold">ADMIN EMAIL</label>
              <input 
                type="email" 
                className="form-control bg-dark border-secondary border-opacity-25 text-white" 
                style={{ borderRadius: '8px' }} 
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="admin@esports.com"
              />
            </div>

            <div>
              <label className="form-label text-secondary small fw-bold">PASSWORD</label>
              <input 
                type="password" 
                className="form-control bg-dark border-secondary border-opacity-25 text-white" 
                style={{ borderRadius: '8px' }} 
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>

            <button 
              type="submit" 
              className="btn btn-warning py-2.5 mt-3 fw-bold shadow"
              style={{ borderRadius: '8px', color: '#000' }}
            >
              Sign In Master Panel
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#090D1A', color: '#E2E8F0', padding: '24px 16px', fontFamily: 'system-ui' }}>
      <div className="container-fluid" style={{ maxWidth: '1200px' }}>
        
        {/* Header */}
        <div className="d-flex flex-wrap justify-content-between align-items-center mb-4 border-bottom border-secondary border-opacity-10 pb-3 gap-3">
          <div>
            <h2 className="fw-extrabold text-white m-0 d-flex align-items-center gap-2">
              <i className="bi bi-clouds-fill text-warning"></i> SaaS Host Panel
            </h2>
            <p className="text-secondary small m-0 mt-1">Configure organizations, subscription licenses and platform status</p>
          </div>
          <button onClick={handleLogout} className="btn btn-outline-danger btn-sm px-3 rounded-pill">
            <i className="bi bi-box-arrow-left me-1"></i> Logout Host Console
          </button>
        </div>

        {/* Stats Grid */}
        <div className="row g-3 mb-4">
          {[
            { label: 'Total Organisations', value: totalOrgs, icon: 'bi-building-fill', color: '#38BDF8' },
            { label: 'Active Subscriptions', value: activeOrgs, icon: 'bi-check-circle-fill', color: '#4ADE80' },
            { label: 'Monthly SaaS Revenue', value: `₹${totalRevenue.toFixed(2)}`, icon: 'bi-wallet2', color: '#FACC15' }
          ].map((stat, i) => (
            <div key={i} className="col-12 col-md-4">
              <div className="card border-0 p-3 d-flex flex-row align-items-center justify-content-between" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '12px' }}>
                <div>
                  <span className="text-secondary small fw-semibold uppercase tracking-wider">{stat.label}</span>
                  <h3 className="fw-bold mt-1 text-white m-0">{stat.value}</h3>
                </div>
                <div style={{ width: '48px', height: '48px', borderRadius: '10px', background: `${stat.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i className={`bi ${stat.icon}`} style={{ color: stat.color, fontSize: '1.4rem' }}></i>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Main Work Area */}
        <div className="row g-4">
          
          {/* Creator/Editor Form */}
          <div className="col-12 col-lg-5">
            <div className="card p-4 border border-secondary border-opacity-10" style={{ background: 'rgba(255,255,255,0.01)', borderRadius: '16px' }}>
              <h4 className="fw-bold text-white mb-3">
                {editingSlug ? (
                  <>
                    <i className="bi bi-pencil-square text-warning me-2"></i>Edit Organisation
                  </>
                ) : (
                  <>
                    <i className="bi bi-plus-circle-fill text-warning me-2"></i>Register New Organisation
                  </>
                )}
              </h4>

              <form onSubmit={handleCreateOrUpdate} className="d-flex flex-column gap-3">
                {formError && (
                  <div className="alert alert-danger border-0 py-2 small m-0" role="alert">
                    <i className="bi bi-exclamation-triangle-fill me-2"></i>{formError}
                  </div>
                )}
                {formSuccess && (
                  <div className="alert alert-success border-0 py-2 small m-0" role="alert">
                    <i className="bi bi-check-circle-fill me-2"></i>{formSuccess}
                  </div>
                )}

                <div>
                  <label className="form-label text-secondary small fw-bold">ORGANISATION NAME</label>
                  <input 
                    type="text" 
                    className="form-control bg-dark border-secondary border-opacity-25 text-white" 
                    style={{ borderRadius: '8px' }} 
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="e.g. Matrix Gaming Esports"
                  />
                </div>

                <div>
                  <label className="form-label text-secondary small fw-bold">URL ENDPOINT SLUG</label>
                  <input 
                    type="text" 
                    className="form-control bg-dark border-secondary border-opacity-25 text-white" 
                    style={{ borderRadius: '8px' }} 
                    value={slug}
                    onChange={e => setSlug(e.target.value)}
                    placeholder="e.g. matrix-gaming"
                    disabled={!!editingSlug}
                  />
                  <span className="text-secondary" style={{ fontSize: '0.65rem' }}>
                    User link: <span className="text-warning">/{slug || 'slug'}</span> | Admin link: <span className="text-warning">/{slug || 'slug'}/admin</span>
                  </span>
                </div>

                <div className="row g-2">
                  <div className="col-6">
                    <label className="form-label text-secondary small fw-bold">SUBSCRIPTION PRICE (₹)</label>
                    <input 
                      type="number" 
                      className="form-control bg-dark border-secondary border-opacity-25 text-white" 
                      style={{ borderRadius: '8px' }} 
                      value={subPrice}
                      onChange={e => setSubPrice(Number(e.target.value) || 0)}
                      placeholder="99"
                    />
                  </div>
                  <div className="col-6">
                    <label className="form-label text-secondary small fw-bold">EXPIRY DATE</label>
                    <input 
                      type="date" 
                      className="form-control bg-dark border-secondary border-opacity-25 text-white" 
                      style={{ borderRadius: '8px' }} 
                      value={subExpiryDate}
                      onChange={e => setSubExpiryDate(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-check form-switch p-0 mt-2 d-flex justify-content-between align-items-center border-bottom border-secondary border-opacity-10 pb-2">
                  <div>
                    <label className="form-check-label text-white fw-bold small d-block">CLOSE SUBSCRIPTION</label>
                    <span className="text-secondary" style={{ fontSize: '0.7rem' }}>Suspend account immediately</span>
                  </div>
                  <input 
                    className="form-check-input ms-0" 
                    type="checkbox" 
                    checked={subClosed}
                    onChange={e => setSubClosed(e.target.checked)}
                    style={{ transform: 'scale(1.2)', cursor: 'pointer' }}
                  />
                </div>

                <div className="form-check form-switch p-0 d-flex justify-content-between align-items-center border-bottom border-secondary border-opacity-10 pb-2">
                  <div>
                    <label className="form-check-label text-white fw-bold small d-block">SHOW NOTICE MESSAGE</label>
                    <span className="text-secondary" style={{ fontSize: '0.7rem' }}>Display a message to tenant admins</span>
                  </div>
                  <input 
                    className="form-check-input ms-0" 
                    type="checkbox" 
                    checked={showSubMessage}
                    onChange={e => setShowSubMessage(e.target.checked)}
                    style={{ transform: 'scale(1.2)', cursor: 'pointer' }}
                  />
                </div>

                <div>
                  <label className="form-label text-secondary small fw-bold">NOTICE MESSAGE CONTENT</label>
                  <textarea 
                    className="form-control bg-dark border-secondary border-opacity-25 text-white" 
                    rows={2}
                    style={{ borderRadius: '8px' }} 
                    value={subMessage}
                    onChange={e => setSubMessage(e.target.value)}
                    placeholder="e.g. Your subscription is expiring soon. Contact Matrix Support."
                  />
                </div>

                <div>
                  <label className="form-label text-secondary small fw-bold">UNLOCKED MENUS ON EXPIRY</label>
                  <div className="row g-2 p-2 bg-dark bg-opacity-25 border border-secondary border-opacity-10 text-start" style={{ maxHeight: '180px', overflowY: 'auto', borderRadius: '8px' }}>
                    {adminTabsList.map(tab => {
                      const isChecked = unlockedTabs.includes(tab.id);
                      return (
                        <div key={tab.id} className="col-6">
                          <div className="form-check text-start">
                            <input 
                              className="form-check-input" 
                              type="checkbox" 
                              id={`tab-check-${tab.id}`}
                              checked={isChecked}
                              onChange={() => {
                                if (isChecked) {
                                  setUnlockedTabs(unlockedTabs.filter(x => x !== tab.id));
                                } else {
                                  setUnlockedTabs([...unlockedTabs, tab.id]);
                                }
                              }}
                              style={{ cursor: 'pointer' }}
                            />
                            <label className="form-check-label text-secondary small" htmlFor={`tab-check-${tab.id}`} style={{ cursor: 'pointer', userSelect: 'none', fontSize: '0.72rem' }}>
                              {tab.label}
                            </label>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="d-flex gap-2 mt-2">
                  {editingSlug && (
                    <button 
                      type="button" 
                      className="btn btn-outline-secondary w-50"
                      onClick={() => {
                        setEditingSlug(null);
                        setName('');
                        setSlug('');
                        setSubExpiryDate('');
                        setSubPrice(0);
                        setSubClosed(false);
                        setShowSubMessage(false);
                        setSubMessage('');
                        setFormError('');
                        setFormSuccess('');
                        setUnlockedTabs([
                          'withdrawals', 'deposits', 'notifications', 'earningZone', 'users', 'settings'
                        ]);
                      }}
                      style={{ borderRadius: '8px' }}
                    >
                      Cancel
                    </button>
                  )}
                  <button 
                    type="submit" 
                    className="btn btn-warning flex-grow-1 fw-bold"
                    style={{ borderRadius: '8px', color: '#000' }}
                  >
                    {editingSlug ? 'Save Changes' : 'Register Account'}
                  </button>
                </div>
              </form>
            </div>

            {/* Global Support Settings */}
            <div className="card p-4 border border-secondary border-opacity-10 mt-4 text-start" style={{ background: 'rgba(255,255,255,0.01)', borderRadius: '16px' }}>
              <h4 className="fw-bold text-white mb-3">
                <i className="bi bi-telephone-fill text-warning me-2"></i>Global Support Settings
              </h4>
              <div className="d-flex flex-column gap-3">
                <div>
                  <label className="form-label text-secondary small fw-bold">WHATSAPP NUMBER</label>
                  <input 
                    type="text" 
                    className="form-control bg-dark border-secondary border-opacity-25 text-white" 
                    value={supportWhatsapp} 
                    onChange={e => setSupportWhatsapp(e.target.value)} 
                    placeholder="e.g. +91 9876543210" 
                  />
                </div>
                <div>
                  <label className="form-label text-secondary small fw-bold">MOBILE NUMBER</label>
                  <input 
                    type="text" 
                    className="form-control bg-dark border-secondary border-opacity-25 text-white" 
                    value={supportMobile} 
                    onChange={e => setSupportMobile(e.target.value)} 
                    placeholder="e.g. +91 98765 43210" 
                  />
                </div>
                <div>
                  <label className="form-label text-secondary small fw-bold">EMAIL ID</label>
                  <input 
                    type="email" 
                    className="form-control bg-dark border-secondary border-opacity-25 text-white" 
                    value={supportEmail} 
                    onChange={e => setSupportEmail(e.target.value)} 
                    placeholder="e.g. support@esportsapp.com" 
                  />
                </div>
                <div>
                  <label className="form-label text-secondary small fw-bold">INSTAGRAM USERNAME</label>
                  <input 
                    type="text" 
                    className="form-control bg-dark border-secondary border-opacity-25 text-white" 
                    value={supportInstagram} 
                    onChange={e => setSupportInstagram(e.target.value)} 
                    placeholder="e.g. esports_support" 
                  />
                </div>
                <button onClick={handleSaveSupportSettings} className="btn btn-warning w-100 fw-bold mt-2" style={{ color: '#000', borderRadius: '8px' }}>
                  Save Support Settings
                </button>
              </div>
            </div>
          </div>

          {/* List of Organisations */}
          <div className="col-12 col-lg-7">
            <div className="card p-4 border border-secondary border-opacity-10 h-100" style={{ background: 'rgba(255,255,255,0.01)', borderRadius: '16px' }}>
              <h4 className="fw-bold text-white mb-3 d-flex justify-content-between align-items-center">
                <span>Registered Organisations</span>
                <span className="badge bg-secondary fs-6">{organisations.length} Total</span>
              </h4>

              {loading ? (
                <div className="text-center py-5">
                  <div className="spinner-border text-warning" role="status"></div>
                </div>
              ) : organisations.length > 0 ? (
                <div className="d-flex flex-column gap-3 overflow-y-auto" style={{ maxHeight: '600px' }}>
                  {legacyDataExists && (
                    <div className="p-3 bg-warning bg-opacity-10 border border-warning border-opacity-20 rounded-3 text-warning text-start mb-2" style={{ fontSize: '0.85rem' }}>
                      <h5 className="fw-bold mb-1"><i className="bi bi-exclamation-triangle-fill"></i> Legacy Root-Level Data Detected</h5>
                      <p className="m-0 text-secondary" style={{ fontSize: '0.78rem' }}>
                        You have database data stored at the root level from your previous single-tenant version. 
                        You can migrate all of it directly to one of the organizations below by clicking its <strong>Migrate Legacy Data</strong> button.
                      </p>
                    </div>
                  )}
                  {organisations.map(org => {
                    const daysLeft = Math.ceil((org.subExpiry - Date.now()) / (1000 * 60 * 60 * 24));
                    const isExpired = daysLeft <= 0;
                    const isClosed = org.subClosed;
                    
                    let statusLabel = 'Active';
                    let statusColor = '#4ADE80';
                    if (isClosed) {
                      statusLabel = 'Closed';
                      statusColor = '#EF4444';
                    } else if (isExpired) {
                      statusLabel = 'Expired';
                      statusColor = '#F59E0B';
                    }

                    return (
                      <div 
                        key={org.slug} 
                        className="p-3 border border-secondary border-opacity-10 d-flex flex-column gap-2"
                        style={{ background: 'rgba(255,255,255,0.015)', borderRadius: '12px' }}
                      >
                        <div className="d-flex justify-content-between align-items-start flex-wrap gap-2">
                          <div>
                            <strong className="text-white fs-5">{org.name}</strong>
                            <span className="text-secondary small d-block mt-0.5">
                              Slug: <span className="text-warning">/{org.slug}</span>
                            </span>
                          </div>

                          <span 
                            className="badge py-1.5 px-3 rounded-pill text-black small fw-bold" 
                            style={{ backgroundColor: statusColor }}
                          >
                            {statusLabel}
                          </span>
                        </div>

                        <div className="row g-2 text-secondary small py-1 border-top border-bottom border-secondary border-opacity-10 mt-1">
                          <div className="col-6 col-md-3">
                            <span className="d-block text-secondary" style={{ fontSize: '0.65rem' }}>PRICE (INR)</span>
                            <strong className="text-white">₹{org.subPrice || 0}</strong>
                          </div>
                          <div className="col-6 col-md-4">
                            <span className="d-block text-secondary" style={{ fontSize: '0.65rem' }}>EXPIRATION DATE</span>
                            <strong className="text-white">{new Date(org.subExpiry).toLocaleDateString()}</strong>
                          </div>
                          <div className="col-12 col-md-5">
                            <span className="d-block text-secondary" style={{ fontSize: '0.65rem' }}>TIME REMAINING</span>
                            <strong className={daysLeft <= 3 ? 'text-danger' : daysLeft <= 7 ? 'text-warning' : 'text-success'}>
                              {isClosed ? 'Suspended' : isExpired ? 'Expired' : `${daysLeft} days remaining`}
                            </strong>
                          </div>
                        </div>

                        {org.showSubMessage && org.subMessage && (
                          <div className="p-2 bg-warning bg-opacity-10 border border-warning border-opacity-20 rounded-3 text-warning text-start" style={{ fontSize: '0.72rem' }}>
                            <i className="bi bi-info-circle-fill me-1"></i> Admin Notification: "{org.subMessage}"
                          </div>
                        )}

                        <div className="mt-1 p-2 bg-black bg-opacity-30 rounded-3 border border-secondary border-opacity-10 d-flex align-items-center justify-content-between">
                          <div className="text-start">
                            <span className="text-secondary small d-block" style={{ fontSize: '0.62rem' }}>INITIALIZATION CODE</span>
                            <strong className="text-warning font-monospace" style={{ fontSize: '0.85rem' }}>{org.initCode || 'N/A'}</strong>
                          </div>
                          {org.initCode && (
                            <button 
                              className="btn btn-sm btn-outline-warning py-0.5 px-2 border-0 bg-transparent text-secondary hover-text-white"
                              style={{ fontSize: '0.7rem' }}
                              onClick={() => { navigator.clipboard.writeText(org.initCode || ''); alert('Setup code copied!'); }}
                            >
                              <i className="bi bi-clipboard"></i> Copy
                            </button>
                          )}
                        </div>

                        <div className="d-flex flex-wrap justify-content-between align-items-center mt-2 gap-2">
                          <div className="d-flex gap-1.5">
                            <a 
                              href={`/${org.slug}`} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className="btn btn-outline-info btn-xs py-1 px-2.5" 
                              style={{ fontSize: '0.72rem', borderRadius: '6px' }}
                            >
                              User Panel <i className="bi bi-box-arrow-up-right" style={{ fontSize: '0.65rem' }}></i>
                            </a>
                            <a 
                              href={`/${org.slug}/admin`} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className="btn btn-outline-warning btn-xs py-1 px-2.5 ms-2" 
                              style={{ fontSize: '0.72rem', borderRadius: '6px' }}
                            >
                              Admin Panel <i className="bi bi-box-arrow-up-right" style={{ fontSize: '0.65rem' }}></i>
                            </a>
                            {legacyDataExists && (
                              <button 
                                onClick={() => handleMigrateLegacy(org.slug)}
                                className="btn btn-outline-danger btn-xs py-1 px-2.5 ms-2 fw-bold"
                                style={{ fontSize: '0.72rem', borderRadius: '6px' }}
                              >
                                <i className="bi bi-database-fill-up"></i> Migrate Legacy Data
                              </button>
                            )}
                          </div>

                          <div className="d-flex gap-2">
                            <button 
                              onClick={() => handleEditSelect(org)} 
                              className="btn btn-warning py-1 px-2.5 text-black" 
                              style={{ fontSize: '0.72rem', borderRadius: '6px', fontWeight: 'bold' }}
                            >
                              <i className="bi bi-pencil-square"></i> Edit
                            </button>
                            <button 
                              onClick={() => handleDelete(org.slug)} 
                              className="btn btn-danger py-1 px-2.5" 
                              style={{ fontSize: '0.72rem', borderRadius: '6px' }}
                            >
                              <i className="bi bi-trash3-fill"></i> Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-5 text-secondary">
                  <i className="bi bi-emoji-neutral-fill text-muted mb-2" style={{ fontSize: '2.5rem' }}></i>
                  <p className="m-0">No organisations registered yet.</p>
                  <p className="small text-muted">Use the builder form on the left to add your first tenant.</p>
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Support Chats Inbox */}
        <div className="card p-4 border border-secondary border-opacity-10 mt-4 text-start" style={{ background: 'rgba(255,255,255,0.01)', borderRadius: '16px' }}>
          <h4 className="fw-bold text-white mb-3">
            <i className="bi bi-chat-dots-fill text-warning me-2"></i>Support Chats Inbox
          </h4>
          <div className="row g-3">
            {/* Active Chats List */}
            <div className="col-12 col-md-4 border-end border-secondary border-opacity-10 pe-3">
              <div className="d-flex flex-column gap-2" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                {chatOrgs.length === 0 ? (
                  <p className="text-secondary small text-center py-3">No active chats.</p>
                ) : (
                  chatOrgs.map(org => (
                    <div 
                      key={org.slug} 
                      onClick={() => setSelectedChatOrg(org.slug)}
                      className="p-3 rounded transition-all cursor-pointer border"
                      style={{
                        background: selectedChatOrg === org.slug ? 'rgba(250,204,21,0.08)' : 'rgba(255,255,255,0.02)',
                        borderColor: selectedChatOrg === org.slug ? '#FACC15' : 'rgba(255,255,255,0.05)',
                        borderRadius: '8px'
                      }}
                    >
                      <strong className="text-white d-block small">{org.name}</strong>
                      <span className="text-secondary" style={{ fontSize: '0.72rem' }}>/{org.slug}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
            {/* Chat Window */}
            <div className="col-12 col-md-8 ps-md-3 d-flex flex-column">
              {selectedChatOrg ? (
                <div className="d-flex flex-column h-100">
                  <div className="border-bottom border-secondary border-opacity-10 pb-2 mb-2">
                    <h6 className="text-warning m-0">Chatting with {organisations.find(o => o.slug === selectedChatOrg)?.name || selectedChatOrg}</h6>
                  </div>
                  {/* Message display */}
                  <div className="p-3 bg-dark bg-opacity-50 rounded mb-2 d-flex flex-column gap-2" style={{ height: '280px', overflowY: 'auto' }}>
                    {chatMessages.length === 0 ? (
                      <p className="text-secondary small text-center my-auto">Start the conversation...</p>
                    ) : (
                      chatMessages.map((msg, i) => (
                        <div 
                          key={i} 
                          className={`p-2 rounded ${msg.sender === 'host' ? 'align-self-end text-end bg-warning text-dark' : 'align-self-start bg-secondary text-white'}`}
                          style={{ maxWidth: '80%', fontSize: '0.85rem', borderRadius: '8px' }}
                        >
                          <p className="m-0 text-start">{msg.message}</p>
                          <span className="small opacity-50 d-block mt-1 text-end" style={{ fontSize: '0.65rem' }}>
                            {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                  {/* Message Input */}
                  <div className="d-flex gap-2">
                    <input 
                      type="text" 
                      className="form-control bg-dark border-secondary text-white py-2" 
                      placeholder="Type message..." 
                      value={replyText}
                      onChange={e => setReplyText(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSendReply()}
                      style={{ borderRadius: '8px' }}
                    />
                    <button onClick={handleSendReply} className="btn btn-warning text-dark fw-bold px-4" style={{ borderRadius: '8px' }}>
                      Send
                    </button>
                  </div>
                </div>
              ) : (
                <div className="d-flex align-items-center justify-content-center text-secondary small flex-grow-1" style={{ minHeight: '300px' }}>
                  Select an organization chat to view messages
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default MasterPanel;
