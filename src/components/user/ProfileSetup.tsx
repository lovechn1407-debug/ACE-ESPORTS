import React, { useState, useEffect } from 'react';
import { ref, get, set, serverTimestamp, push } from 'firebase/database';
import { rawRef } from '../../firebase-database-wrapper';
import { db, auth } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { useSettings } from '../../contexts/SettingsContext';

interface ProfileSetupProps {
  onSetupComplete: () => void;
}

interface LegacyProfile {
  slug: string;
  orgName: string;
  displayName: string;
  photoURL: string | null;
  email: string;
}

const ProfileSetup: React.FC<ProfileSetupProps> = ({ onSetupComplete }) => {
  const { currentUser } = useAuth();
  const { settings } = useSettings();

  const [checking, setChecking] = useState(true);
  const [legacyOrgs, setLegacyOrgs] = useState<LegacyProfile[]>([]);
  const [avatars, setAvatars] = useState<string[]>([]);
  
  // Creation state
  const [username, setUsername] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(null);
  const [selectedImportOrg, setSelectedImportOrg] = useState<string>('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!currentUser) return;

    const initSetup = async () => {
      try {
        // 1. Fetch user's registered organizations globally
        const globalOrgsRef = ref(db, `globalUserOrgs/${currentUser.uid}`);
        const orgsSnap = await get(globalOrgsRef);
        let list: { slug: string; name: string }[] = [];

        if (orgsSnap.exists()) {
          const orgsData = orgsSnap.val();
          list = Object.entries(orgsData).map(([slug, name]) => ({
            slug,
            name: name as string
          }));
        }

        // Fallback: Check all registered organisations directly if list is empty
        if (list.length === 0) {
          const orgsRef = ref(db, 'organisations');
          const orgsSnapshot = await get(orgsRef);
          if (orgsSnapshot.exists()) {
            const orgsList = Object.keys(orgsSnapshot.val());
            const currentPath = window.location.pathname;
            const currentOrgSlug = currentPath.split('/').filter(Boolean)[0] || 'default';
            
            const checks = orgsList.map(async (slug) => {
              if (slug === currentOrgSlug) return null; // skip current
              const userRef = ref(db, `orgs/${slug}/users/${currentUser.uid}`);
              const userSnap = await get(userRef);
              if (userSnap.exists()) {
                const orgName = orgsSnapshot.val()[slug]?.name || slug;
                return { slug, name: orgName };
              }
              return null;
            });
            const checkedResults = await Promise.all(checks);
            list = checkedResults.filter(Boolean) as { slug: string; name: string }[];
          }
        }

        const profilesList: LegacyProfile[] = [];

        // Check if root-level legacy profile exists (before multi-tenant migration)
        try {
          const rootUserRef = rawRef(db, `users/${currentUser.uid}`);
          const rootUserSnap = await get(rootUserRef);
          if (rootUserSnap.exists()) {
            const val = rootUserSnap.val();
            profilesList.push({
              slug: '__root__',
              orgName: 'Original App Panel',
              displayName: val.displayName || 'Guest User',
              photoURL: val.photoURL || null,
              email: val.email || currentUser.email || ''
            });
          }
        } catch (err) {
          console.error('Error fetching root profile:', err);
        }

        for (const item of list) {
          try {
            const userSnap = await get(ref(db, `orgs/${item.slug}/users/${currentUser.uid}`));
            if (userSnap.exists()) {
              const val = userSnap.val();
              profilesList.push({
                slug: item.slug,
                orgName: item.name,
                displayName: val.displayName || 'Guest User',
                photoURL: val.photoURL || null,
                email: val.email || currentUser.email || ''
              });
            }
          } catch (err) {
            console.error('Error fetching org profile:', err);
          }
        }

        setLegacyOrgs(profilesList);
        if (profilesList.length > 0) {
          setSelectedImportOrg(profilesList[0].slug);
        }

        // 2. Fetch avatars list
        const avatarSnap = await get(ref(db, 'uploads/avatars'));
        if (avatarSnap.exists()) {
          setAvatars(Object.values(avatarSnap.val()) as string[]);
        }
      } catch (err) {
        console.error('Error loading setup configurations:', err);
      } finally {
        setChecking(false);
      }
    };

    initSetup();
  }, [currentUser]);

  // Helper to generate referral code
  const generateReferralCode = (length = 8) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  const handleImportProfile = async () => {
    if (!selectedImportOrg || !currentUser) return;
    setLoading(true);
    setError('');
    try {
      // 1. Fetch profile from target org (or root)
      const sourceProfileRef = selectedImportOrg === '__root__'
        ? rawRef(db, `users/${currentUser.uid}`)
        : ref(db, `orgs/${selectedImportOrg}/users/${currentUser.uid}`);
      const sourceSnap = await get(sourceProfileRef);
      if (!sourceSnap.exists()) {
        throw new Error('Could not find profile in selected organization.');
      }

      const sourceProfile = sourceSnap.val();
      const signupBonus = settings.signupBonus ?? 10;
      const refCode = generateReferralCode();

      // 2. Create profile in current organization, keeping only profile info, resetting wallets
      const currentOrgName = settings.appName || 'Esports App';
      const newProfile = {
        uid: currentUser.uid,
        displayName: sourceProfile.displayName || 'Guest User',
        email: currentUser.email,
        photoURL: sourceProfile.photoURL || null,
        bannerURL: sourceProfile.bannerURL || null,
        balance: signupBonus,
        winningCash: 0,
        bonusCash: signupBonus,
        totalMatches: 0,
        wonMatches: 0,
        totalEarnings: 0,
        referralEarnings: 0,
        createdAt: serverTimestamp(),
        referralCode: refCode,
        joinedTournaments: {},
        isAdmin: false,
        lastCheckedNotifications: Date.now(),
        lastLogin: serverTimestamp(),
        status: 'active'
      };

      // Write to current org's database
      await set(ref(db, `users/${currentUser.uid}`), newProfile);

      // Write global link
      const currentPath = window.location.pathname;
      const currentOrgSlug = currentPath.split('/').filter(Boolean)[0] || 'default';
      await set(ref(db, `globalUserOrgs/${currentUser.uid}/${currentOrgSlug}`), currentOrgName);

      // Log signup transaction
      if (signupBonus > 0) {
        const txKey = push(ref(db, `transactions/${currentUser.uid}`)).key;
        await set(ref(db, `transactions/${currentUser.uid}/${txKey}`), {
          type: 'signup_bonus',
          amount: signupBonus,
          description: 'Welcome Bonus',
          timestamp: serverTimestamp(),
          balanceAfter: signupBonus
        });
      }

      onSetupComplete();
    } catch (err: any) {
      setError(err.message || 'Import failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !currentUser) {
      setError('Please choose a username.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const signupBonus = settings.signupBonus ?? 10;
      const refCode = generateReferralCode();

      const newProfile = {
        uid: currentUser.uid,
        displayName: username.trim(),
        email: currentUser.email,
        photoURL: selectedAvatar,
        balance: signupBonus,
        winningCash: 0,
        bonusCash: signupBonus,
        totalMatches: 0,
        wonMatches: 0,
        totalEarnings: 0,
        referralEarnings: 0,
        createdAt: serverTimestamp(),
        referralCode: refCode,
        joinedTournaments: {},
        isAdmin: false,
        lastCheckedNotifications: Date.now(),
        lastLogin: serverTimestamp(),
        status: 'active'
      };

      // Write user profile to current org
      await set(ref(db, `users/${currentUser.uid}`), newProfile);

      // Write global link
      const currentOrgName = settings.appName || 'Esports App';
      const currentPath = window.location.pathname;
      const currentOrgSlug = currentPath.split('/').filter(Boolean)[0] || 'default';
      await set(ref(db, `globalUserOrgs/${currentUser.uid}/${currentOrgSlug}`), currentOrgName);

      // Log signup transaction
      if (signupBonus > 0) {
        const txKey = push(ref(db, `transactions/${currentUser.uid}`)).key;
        await set(ref(db, `transactions/${currentUser.uid}/${txKey}`), {
          type: 'signup_bonus',
          amount: signupBonus,
          description: 'Welcome Bonus',
          timestamp: serverTimestamp(),
          balanceAfter: signupBonus
        });
      }

      onSetupComplete();
    } catch (err: any) {
      setError(err.message || 'Creation failed.');
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="d-flex align-items-center justify-content-center min-vh-100 bg-dark text-white">
        <div className="spinner-border text-warning" role="status"></div>
      </div>
    );
  }

  return (
    <div className="d-flex flex-column min-vh-100 text-white" style={{ background: 'radial-gradient(circle at top, #15102a 0%, #07050f 100%)', minWidth: '100vw' }}>
      
      {/* Top Header */}
      <header className="w-100 d-flex align-items-center py-3 px-4 border-bottom text-start" style={{ background: 'rgba(15, 11, 28, 0.4)', backdropFilter: 'blur(10px)', borderColor: 'rgba(255, 255, 255, 0.05)' }}>
        <div className="d-flex align-items-center gap-3">
          <img 
            src={settings.logoUrl || 'https://via.placeholder.com/40/FFFFFF/0F172A?text=Logo'} 
            alt="Logo" 
            style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '0px' }} 
          />
          <div>
            <h4 className="fw-bold text-white m-0" style={{ fontSize: '1.1rem', letterSpacing: '-0.01em' }}>
              {settings.appName || 'Esports App'}
            </h4>
            <span className="text-secondary small" style={{ fontSize: '0.72rem' }}>Configure Profile</span>
          </div>
        </div>
      </header>

      {/* Centered Profile Card */}
      <div className="flex-grow-1 d-flex align-items-center justify-content-center p-3">
        <div className="card p-4 shadow-lg text-start position-relative" style={{ 
          width: '100%', 
          maxWidth: '500px', 
          borderRadius: '12px',
          background: 'rgba(15, 11, 28, 0.65)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.7)'
        }}>
          {/* Glow effect */}
          <div style={{
            position: 'absolute',
            top: '-10%',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '50%',
            height: '20%',
            background: 'rgba(250, 204, 21, 0.15)',
            filter: 'blur(35px)',
            borderRadius: '50%',
            zIndex: -1
          }}></div>

        <h3 className="fw-bold text-center text-white mb-2" style={{ letterSpacing: '-0.02em', background: 'linear-gradient(90deg, #FFFFFF, #A5B4FC)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Configure Your Profile
        </h3>
        <p className="text-secondary small text-center mb-4" style={{ color: '#94a3b8', lineHeight: '1.5' }}>
          To play tournaments on <strong>{settings.appName || 'Esports App'}</strong>, you need to configure your profile for this organization.
        </p>

        {error && (
          <div className="alert alert-danger py-2 small mb-3 border-0 bg-danger bg-opacity-20 text-danger" style={{ borderRadius: '6px' }} role="alert">
            <i className="bi bi-exclamation-octagon me-1"></i> {error}
          </div>
        )}

        {legacyOrgs.length > 0 ? (
          <div>
            {/* Import Profile Option */}
            <div className="p-3 bg-secondary bg-opacity-10 border border-secondary border-opacity-10 text-start" style={{ background: 'rgba(255,255,255,0.015)', borderRadius: '6px' }}>
              <h5 className="fw-bold text-warning mb-2" style={{ fontSize: '0.9rem', color: '#FACC15' }}>
                <i className="bi bi-cloud-arrow-down-fill me-1"></i> Import Profile details
              </h5>
              <p className="text-secondary mb-3" style={{ fontSize: '0.78rem', color: '#64748b' }}>
                We found existing profiles in other organizations under your account. Select a profile card to copy your name and avatar to start quickly.
              </p>
              
              <div className="d-flex flex-column gap-2 mb-3">
                {legacyOrgs.map(profile => {
                  const isSelected = selectedImportOrg === profile.slug;
                  return (
                    <div 
                      key={profile.slug}
                      onClick={() => setSelectedImportOrg(profile.slug)}
                      className="p-3 d-flex align-items-center gap-3 border transition-all cursor-pointer"
                      style={{
                        borderColor: isSelected ? '#FACC15' : 'rgba(255,255,255,0.06)',
                        background: isSelected ? 'rgba(250,204,21,0.04)' : 'rgba(255,255,255,0.01)',
                        boxShadow: isSelected ? '0 0 20px rgba(250, 204, 21, 0.1)' : 'none',
                        transition: 'all 0.2s ease-in-out',
                        transform: isSelected ? 'scale(1.01)' : 'none',
                        borderRadius: '6px'
                      }}
                    >
                      {/* Selection Indicator */}
                      <div className="d-flex align-items-center justify-content-center" style={{ width: '18px' }}>
                        <i className={`bi ${isSelected ? 'bi-check-circle-fill text-warning' : 'bi-circle text-secondary'}`} style={{ fontSize: '1rem' }}></i>
                      </div>

                      {/* Avatar (Sharp box style, radius = 0) */}
                      <div 
                        className="overflow-hidden border border-secondary border-opacity-20 d-flex align-items-center justify-content-center"
                        style={{ width: '48px', height: '48px', minWidth: '48px', background: '#1e293b', borderRadius: '0px' }}
                      >
                        <img 
                          src={profile.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.displayName)}&background=0F172A&color=E2E8F0&bold=true&size=100`} 
                          alt="avatar" 
                          style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '0px' }}
                        />
                      </div>

                      {/* Info */}
                      <div className="flex-grow-1 text-start overflow-hidden">
                        <strong className="text-white d-block" style={{ fontSize: '0.9rem' }}>{profile.displayName}</strong>
                        <span className="text-secondary small d-block overflow-hidden text-overflow-ellipsis" style={{ fontSize: '0.72rem' }}>{profile.email}</span>
                        <span className="badge bg-secondary bg-opacity-25 text-secondary mt-1" style={{ fontSize: '0.62rem', padding: '2px 6px', borderRadius: '4px' }}>
                          {profile.orgName}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <button 
                onClick={handleImportProfile} 
                className="btn btn-custom btn-custom-accent w-100 text-dark fw-bold py-2"
                style={{ borderRadius: '4px' }}
                disabled={loading}
              >
                {loading ? 'Importing...' : 'Use Existing Profile details'}
              </button>
            </div>

            <div className="text-center text-secondary small my-3 d-flex align-items-center justify-content-center gap-2">
              <hr className="flex-grow-1 border-secondary border-opacity-25" />
              <span className="fw-bold text-muted">OR</span>
              <hr className="flex-grow-1 border-secondary border-opacity-25" />
            </div>
          </div>
        ) : null}

        {/* Fresh Profile Creation Option */}
        <form onSubmit={handleCreateProfile} className="p-3" style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '6px' }}>
          <h5 className="fw-bold text-white mb-3 text-start" style={{ fontSize: '0.9rem', color: '#818CF8' }}>
            <i className="bi bi-person-plus-fill me-1"></i> Create Fresh Profile
          </h5>
          
          <div className="form-group mb-3">
            <label className="form-label small text-secondary">Username</label>
            <input 
              type="text" 
              className="form-control bg-dark bg-opacity-50 border-secondary text-white py-2" 
              style={{ borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)' }}
              placeholder="Choose username" 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required 
            />
          </div>

          <div className="form-group mb-4">
            <label className="form-label small text-secondary d-block mb-2">Select Avatar</label>
            {avatars.length > 0 ? (
              <div className="d-flex flex-wrap gap-2 justify-content-start overflow-x-auto py-1" style={{ maxHeight: '110px' }}>
                {avatars.map((url, i) => (
                  <button 
                    key={i} 
                    type="button" 
                    onClick={() => setSelectedAvatar(url)}
                    className="btn p-0 border-2 overflow-hidden d-flex align-items-center justify-content-center transition-all"
                    style={{ 
                      width: '46px', 
                      height: '46px', 
                      borderColor: selectedAvatar === url ? '#FACC15' : 'rgba(255,255,255,0.1)',
                      background: 'none',
                      boxShadow: selectedAvatar === url ? '0 0 10px rgba(250,204,21,0.3)' : 'none',
                      borderRadius: '0px',
                      transform: selectedAvatar === url ? 'scale(1.05)' : 'none'
                    }}
                  >
                    <img src={url} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '0px' }} />
                  </button>
                ))  }
              </div>
            ) : (
              <p className="text-secondary small italic">No preset avatars found. You can set a custom photo later in your Profile page.</p>
            )}
          </div>

          <button 
            type="submit" 
            className="btn btn-custom btn-custom-primary w-100 fw-bold py-2"
            style={{ borderRadius: '4px' }}
            disabled={loading}
          >
            {loading ? 'Creating...' : 'Create fresh Profile'}
          </button>
        </form>

        <div className="text-center mt-4">
          <button 
            type="button" 
            className="btn-custom-link btn-sm p-0 text-center d-inline-block text-secondary hover-text-white"
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.82rem', transition: 'color 0.2s' }}
            onClick={async () => {
              setLoading(true);
              try {
                await auth.signOut();
              } catch (err) {
                console.error(err);
              } finally {
                setLoading(false);
              }
            }}
            disabled={loading}
          >
            <i className="bi bi-box-arrow-left me-1"></i> Back to Login
          </button>
        </div>
      </div>
    </div>
  </div>
);
};

export default ProfileSetup;
