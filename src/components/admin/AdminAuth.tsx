import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  updateProfile 
} from 'firebase/auth';
import { ref, get, set, serverTimestamp } from 'firebase/database';
import { auth, db } from '../../firebase';

const AdminAuth: React.FC = () => {
  const { org } = useParams<{ org: string }>();
  const [isSetup, setIsSetup] = useState(false);
  const [setupStep, setSetupStep] = useState<1 | 2>(1); // 1 = enter code, 2 = enter email/password
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [setupKey, setSetupKey] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'danger' | 'warning' } | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [orgDetails, setOrgDetails] = useState<any>(null);

  useEffect(() => {
    document.body.classList.add('admin-body');
    
    const checkAdminConfig = async () => {
      try {
        const snap = await get(ref(db, 'adminConfig/adminUid'));
        if (!snap.exists()) {
          setIsSetup(true);
        }
      } catch (err) {
        console.error('Error checking admin config:', err);
      } finally {
        setChecking(false);
      }
    };
    checkAdminConfig();

    if (org) {
      get(ref(db, 'settings')).then((snap) => {
        if (snap.exists()) {
          setOrgDetails(snap.val());
        }
      }).catch(err => console.error('Error fetching org settings:', err));
    }

    return () => {
      document.body.classList.remove('admin-body');
    };
  }, []);

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!setupKey) {
      setMsg({ text: 'Initialization code is required.', type: 'warning' });
      return;
    }
    if (setupKey.trim().length !== 12) {
      setMsg({ text: 'The code must be exactly 12 digits.', type: 'warning' });
      return;
    }

    setLoading(true);
    setMsg(null);

    try {
      const codeRef = ref(db, `organisations/${org}/initCode`);
      const snap = await get(codeRef);
      if (snap.exists() && snap.val() === setupKey.trim()) {
        setSetupStep(2);
        setMsg({ text: 'Code verified successfully! Please enter your admin login details below.', type: 'success' });
      } else {
        setMsg({ text: 'Invalid initialization code. Please contact your host operator.', type: 'danger' });
      }
    } catch (err: any) {
      console.error(err);
      setMsg({ text: err.message || 'Verification failed.', type: 'danger' });
    } finally {
      setLoading(false);
    }
  };

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setMsg({ text: 'All fields are required.', type: 'warning' });
      return;
    }

    setLoading(true);
    setMsg(null);

    try {
      // Double check code is still valid
      const codeRef = ref(db, `organisations/${org}/initCode`);
      const codeSnap = await get(codeRef);
      if (!codeSnap.exists() || codeSnap.val() !== setupKey.trim()) {
        throw new Error('Initialization code expired or invalid.');
      }

      // Create user in Firebase Auth
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      await updateProfile(cred.user, { displayName: 'System Admin' });

      // Write admin config
      await set(ref(db, 'adminConfig'), {
        adminUid: cred.user.uid,
        adminEmail: email.trim(),
        createdAt: serverTimestamp()
      });

      // Write user profile as admin
      await set(ref(db, `users/${cred.user.uid}`), {
        uid: cred.user.uid,
        displayName: 'System Admin',
        email: email.trim(),
        isAdmin: true,
        balance: 0,
        winningCash: 0,
        bonusCash: 0,
        createdAt: serverTimestamp(),
        status: 'active'
      });

      // Mark initialization code as used
      await set(codeRef, 'USED');

      alert('Admin account initialized successfully! Logging in...');
      setIsSetup(false);
    } catch (err: any) {
      console.error(err);
      setMsg({ text: err.message || 'Setup failed.', type: 'danger' });
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setMsg({ text: 'Enter email & password.', type: 'warning' });
      return;
    }

    setLoading(true);
    setMsg(null);

    try {
      const snap = await get(ref(db, 'adminConfig/adminUid'));
      const adminUid = snap.val();

      if (!adminUid) {
        throw new Error('Admin account not set up yet. Refresh page to initialize setup.');
      }

      // Sign out first if already logged in to force an onAuthStateChanged event
      if (auth.currentUser) {
        await auth.signOut();
      }

      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      
      if (cred.user.uid !== adminUid) {
        // Sign out user since they are not authorized admin
        await auth.signOut();
        throw new Error('Unauthorized Access. You are not configured as the system administrator.');
      }

      // Clear any previous staff session on successful admin login
      sessionStorage.removeItem('loggedInStaff');
    } catch (err: any) {
      console.error(err);
      setMsg({ text: err.message || 'Login failed.', type: 'danger' });
    } finally {
      setLoading(false);
    }
  };

  const [loginMode, setLoginMode] = useState<'admin' | 'staff'>('admin');

  const handleToggleMode = () => {
    setLoginMode(prev => prev === 'admin' ? 'staff' : 'admin');
    setEmail('');
    setPassword('');
    setMsg(null);
  };

  const handleStaffLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setMsg({ text: 'Enter Staff ID & Password.', type: 'warning' });
      return;
    }

    setLoading(true);
    setMsg(null);

    try {
      const staffId = email.trim().toLowerCase();
      const staffEmail = `${staffId}@${org}.esports.com`;

      // Log out standard admin/user auth session first if any
      if (auth.currentUser) {
        await auth.signOut();
      }

      // 1. Authenticate with Firebase Auth
      let cred;
      try {
        cred = await signInWithEmailAndPassword(auth, staffEmail, password.trim());
      } catch (authErr: any) {
        throw new Error('Invalid Staff ID or password.');
      }

      // 2. Fetch corresponding staff configuration record from RTDB using Auth UID
      const staffRef = ref(db, `organisations/${org}/staffs/${cred.user.uid}`);
      const snap = await get(staffRef);

      if (!snap.exists()) {
        await auth.signOut();
        throw new Error('Staff configuration record not found.');
      }

      const staffData = snap.val();
      if (!staffData.active) {
        await auth.signOut();
        throw new Error('Your staff account is currently suspended. Please contact the administrator.');
      }

      // Store staff session in sessionStorage
      sessionStorage.setItem('loggedInStaff', JSON.stringify({
        id: staffData.id,
        uid: cred.user.uid,
        org: org,
        accessibleMenus: staffData.accessibleMenus || []
      }));

      alert('Staff logged in successfully! Redirecting...');
      window.location.reload();
    } catch (err: any) {
      console.error(err);
      setMsg({ text: err.message || 'Login failed.', type: 'danger' });
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
    <div className="admin-auth-page-container">
      <style>{`
        .admin-auth-page-container {
          min-height: 100vh;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #0B0F19; /* Deep executive dark background */
          position: relative;
          padding: 2.5rem 1rem;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }

        .admin-glass-card {
          background: #111827; /* Clean, professional slate background */
          border: 1px solid rgba(255, 255, 255, 0.05); /* Thin elegant border */
          border-radius: 12px;
          width: 100%;
          max-width: 420px;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
          overflow: hidden;
          z-index: 10;
        }

        .admin-brand-icon {
          width: 60px;
          height: 60px;
          border-radius: 12px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: #F59E0B; /* Classic flat amber brand color */
          margin-bottom: 1rem;
          color: #0F172A;
          font-size: 1.8rem;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.15);
        }

        .admin-header-title {
          font-size: 1.5rem;
          font-weight: 700;
          letter-spacing: 0.02em;
          color: #F9FAFB;
          margin-bottom: 0.2rem;
          text-transform: uppercase;
        }

        .admin-input-group {
          position: relative;
          display: flex;
          align-items: center;
        }

        .admin-input-icon {
          position: absolute;
          left: 14px;
          color: #4B5563;
          font-size: 1rem;
          transition: color 0.2s ease;
          pointer-events: none;
        }

        .admin-input-field {
          width: 100%;
          padding: 11px 16px 11px 44px;
          background: #1F2937; /* Dark clean input background */
          border: 1px solid #374151; /* Neutral grey border */
          border-radius: 8px;
          color: #F9FAFB;
          font-size: 0.88rem;
          transition: all 0.2s ease;
        }

        .admin-input-field:focus {
          border-color: #F59E0B; /* Amber theme accent */
          outline: none;
          box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.2);
        }

        .admin-input-field:focus + .admin-input-icon {
          color: #F59E0B;
        }

        .admin-password-toggle {
          position: absolute;
          right: 14px;
          color: #4B5563;
          cursor: pointer;
          font-size: 1rem;
          transition: color 0.2s ease;
          background: none;
          border: none;
          padding: 0;
        }

        .admin-password-toggle:hover {
          color: #9CA3AF;
        }

        .admin-btn-primary {
          background: #F59E0B; /* Classic flat amber brand color */
          color: #0F172A;
          border: none;
          padding: 12px;
          border-radius: 8px;
          font-size: 0.92rem;
          font-weight: 600;
          transition: all 0.2s ease;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
          letter-spacing: 0.02em;
        }

        .admin-btn-primary:hover:not(:disabled) {
          background: #D97706;
        }

        .admin-btn-secondary {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #F9FAFB;
          padding: 12px;
          border-radius: 8px;
          font-size: 0.92rem;
          font-weight: 600;
          transition: all 0.2s ease;
        }

        .admin-btn-secondary:hover {
          background: rgba(255, 255, 255, 0.1);
          border-color: rgba(255, 255, 255, 0.15);
        }

        .admin-link {
          color: #F59E0B;
          text-decoration: none;
          font-size: 0.85rem;
          transition: color 0.2s ease;
          font-weight: 600;
        }

        .admin-link:hover {
          color: #D97706;
        }
      `}</style>

      <div className="admin-glass-card">
        <div className="p-4 p-md-5">
          {/* Header Branding */}
          <div className="text-center mb-4">
            {orgDetails?.logoUrl ? (
              <img src={orgDetails.logoUrl} alt="Logo" className="admin-brand-icon" style={{ objectFit: 'cover' }} />
            ) : (
              <div className="admin-brand-icon">
                <i className={isSetup ? "bi bi-gear-fill" : "bi bi-shield-lock-fill"}></i>
              </div>
            )}
            <h2 className="admin-header-title">
              {orgDetails?.appName || (isSetup ? 'ADMIN SETUP' : 'ADMIN PORTAL')}
            </h2>
            <p className="text-secondary small m-0 mt-1">
              {isSetup 
                ? 'Initialize the Esports Tournament Admin Panel' 
                : 'Sign in to access admin privileges'}
            </p>
          </div>

          {msg && (
            <div className={`alert alert-${msg.type === 'danger' ? 'danger' : msg.type === 'warning' ? 'warning' : 'success'} py-2.5 px-3 small mb-4 border-0`} role="alert" style={{ fontSize: '0.8rem', borderRadius: '10px', background: msg.type === 'danger' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)', color: msg.type === 'danger' ? '#F87171' : '#34D399' }}>
              <i className={`bi bi-${msg.type === 'danger' ? 'exclamation-octagon-fill' : 'check-circle-fill'} me-2`}></i>
              {msg.text}
            </div>
          )}

          {isSetup ? (
            setupStep === 1 ? (
              <form onSubmit={handleVerifyCode} className="d-flex flex-column gap-3">
                <div>
                  <label className="form-label text-secondary small fw-semibold">12-Digit Setup Code</label>
                  <div className="admin-input-group">
                    <input 
                      type="text" 
                      className="admin-input-field text-center font-monospace tracking-wider"
                      style={{ fontSize: '1.2rem', letterSpacing: '0.1em' }}
                      maxLength={12}
                      value={setupKey}
                      onChange={(e) => setSetupKey(e.target.value.replace(/\D/g, ''))}
                      placeholder="000000000000" 
                      required 
                    />
                    <i className="bi bi-key-fill admin-input-icon"></i>
                  </div>
                  <small className="text-muted small block mt-2 text-center" style={{ fontSize: '0.72rem' }}>
                    Enter the initialization code provided by your SaaS host.
                  </small>
                </div>

                <button type="submit" className="admin-btn-primary w-100" disabled={loading}>
                  {loading ? 'Verifying...' : 'Verify Code'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleSetup} className="d-flex flex-column gap-3">
                <div>
                  <label className="form-label text-secondary small fw-semibold">Admin Email Address</label>
                  <div className="admin-input-group">
                    <input 
                      type="email" 
                      className="admin-input-field"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="admin@esports.com" 
                      required 
                    />
                    <i className="bi bi-envelope-fill admin-input-icon"></i>
                  </div>
                </div>

                <div>
                  <label className="form-label text-secondary small fw-semibold">Choose Password (min 6 chars)</label>
                  <div className="admin-input-group">
                    <input 
                      type={showPassword ? 'text' : 'password'} 
                      className="admin-input-field"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Choose strong password" 
                      required 
                      minLength={6}
                    />
                    <i className="bi bi-lock-fill admin-input-icon"></i>
                    <button 
                      type="button" 
                      className="admin-password-toggle"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      <i className={`bi bi-eye${showPassword ? '-slash' : ''}`}></i>
                    </button>
                  </div>
                </div>

                <button type="submit" className="admin-btn-primary w-100 mt-2" disabled={loading}>
                  {loading ? 'Initializing...' : 'Register Admin Account'}
                </button>
              </form>
            )
          ) : (
            <form onSubmit={loginMode === 'staff' ? handleStaffLogin : handleLogin} className="d-flex flex-column gap-3">
              <div>
                <label className="form-label text-secondary small fw-semibold">
                  {loginMode === 'staff' ? 'Staff Username / ID' : 'Admin Email'}
                </label>
                <div className="admin-input-group">
                  <input 
                    type={loginMode === 'staff' ? 'text' : 'email'} 
                    className="admin-input-field"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={loginMode === 'staff' ? 'e.g. support_john' : 'admin@esports.com'} 
                    required 
                  />
                  <i className={loginMode === 'staff' ? "bi bi-person-badge-fill admin-input-icon" : "bi bi-envelope-fill admin-input-icon"}></i>
                </div>
              </div>

              <div>
                <label className="form-label text-secondary small fw-semibold">Password</label>
                <div className="admin-input-group">
                  <input 
                    type={showPassword ? 'text' : 'password'} 
                    className="admin-input-field"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password" 
                    required 
                  />
                  <i className="bi bi-lock-fill admin-input-icon"></i>
                  <button 
                    type="button" 
                    className="admin-password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    <i className={`bi bi-eye${showPassword ? '-slash' : ''}`}></i>
                  </button>
                </div>
              </div>

              <button type="submit" className="admin-btn-primary w-100 mt-2" disabled={loading}>
                {loading ? (
                  <span><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Logging in...</span>
                ) : loginMode === 'staff' ? 'Staff Sign In' : 'Login to Console'}
              </button>

              <div className="text-center mt-3 pt-2 border-top border-secondary border-opacity-10">
                <button 
                  type="button" 
                  className="btn btn-link admin-link p-0 text-decoration-none" 
                  onClick={handleToggleMode}
                >
                  <i className={`bi bi-${loginMode === 'staff' ? 'shield-lock-fill' : 'person-badge-fill'} me-1.5`}></i>
                  {loginMode === 'staff' ? 'Sign in as System Admin' : 'Sign in as Staff Member'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminAuth;
