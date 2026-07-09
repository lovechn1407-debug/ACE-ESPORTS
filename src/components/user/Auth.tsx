import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  sendPasswordResetEmail,
  updateProfile
} from 'firebase/auth';
import { 
  ref, 
  get, 
  set, 
  push, 
  query, 
  orderByChild, 
  equalTo,
  serverTimestamp 
} from 'firebase/database';

import { auth, db } from '../../firebase';
import { useSettings } from '../../contexts/SettingsContext';

const generateReferralCode = (length = 8) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

const Auth: React.FC = () => {
  const { org } = useParams<{ org: string }>();
  const [orgDetails, setOrgDetails] = useState<any>(null);
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'danger' | 'warning' } | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const { settings } = useSettings();

  useEffect(() => {
    if (!org) return;
    get(ref(db, `organisations/${org}`)).then(snap => {
      if (snap.exists()) {
        setOrgDetails(snap.val());
      }
    });
  }, [org]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setMessage({ text: 'Enter email & password.', type: 'warning' });
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err: any) {
      console.error(err);
      let errMsg = 'Login failed.';
      switch (err.code) {
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
          errMsg = 'Invalid email or password.';
          break;
        case 'auth/invalid-email':
          errMsg = 'Invalid email format.';
          break;
        case 'auth/too-many-requests':
          errMsg = 'Too many attempts. Reset password or wait.';
          break;
        case 'auth/network-request-failed':
          errMsg = 'Network error.';
          break;
        case 'auth/user-disabled':
          errMsg = 'Account disabled.';
          break;
        default:
          errMsg = err.message;
      }
      setMessage({ text: errMsg, type: 'danger' });
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !password) {
      setMessage({ text: 'Name, Email and Password are required.', type: 'warning' });
      return;
    }
    if (password.length < 6) {
      setMessage({ text: 'Password must be at least 6 characters.', type: 'warning' });
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      
      // Update Firebase Auth profile
      await updateProfile(cred.user, { displayName: name.trim() });

      const signupBonus = settings.signupBonus ?? 10;
      const refCode = generateReferralCode();
      
      const newUserProfile: any = {
        uid: cred.user.uid,
        displayName: name.trim(),
        email: cred.user.email,
        photoURL: null,
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

      // Process referral code if provided
      if (referralCode.trim()) {
        const usersSnap = await get(ref(db, 'users'));
        let referrerId: string | null = null;
        let referrerProfile: any = null;

        if (usersSnap.exists()) {
          const targetCode = referralCode.trim().toUpperCase();
          const found = Object.entries(usersSnap.val()).find(([_, val]: any) => val?.referralCode === targetCode);
          if (found) {
            referrerId = found[0];
            referrerProfile = found[1];
          }
        }
        
        if (referrerId && referrerProfile) {
          
          // Log a pending referral
          const pendingReferralRef = push(ref(db, 'pendingReferrals'));
          await set(pendingReferralRef, {
            referrerUid: referrerId,
            referrerEmail: referrerProfile.email,
            referredUid: cred.user.uid,
            referredEmail: cred.user.email,
            status: 'pending',
            timestamp: serverTimestamp()
          });
          
          newUserProfile.referredBy = referrerId;
        }
      }

      await set(ref(db, `users/${cred.user.uid}`), newUserProfile);
      
      // Log signup transaction
      if (signupBonus > 0) {
        const txKey = push(ref(db, `transactions/${cred.user.uid}`)).key;
        await set(ref(db, `transactions/${cred.user.uid}/${txKey}`), {
          type: 'signup_bonus',
          amount: signupBonus,
          description: 'Welcome Bonus',
          timestamp: serverTimestamp(),
          balanceAfter: signupBonus
        });
      }
    } catch (err: any) {
      console.error(err);
      let errMsg = 'Signup failed.';
      switch (err.code) {
        case 'auth/email-already-in-use':
          errMsg = 'Email already registered.';
          break;
        case 'auth/weak-password':
          errMsg = 'Password too weak.';
          break;
        case 'auth/invalid-email':
          errMsg = 'Invalid email.';
          break;
        case 'auth/network-request-failed':
          errMsg = 'Network error.';
          break;
        default:
          errMsg = err.message;
      }
      setMessage({ text: errMsg, type: 'danger' });
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setMessage({ text: 'Enter email for password reset.', type: 'warning' });
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setMessage({ text: 'Password reset email sent! Check inbox/spam.', type: 'success' });
    } catch (err: any) {
      console.error(err);
      let errMsg = 'Failed to send reset email.';
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-email') {
        errMsg = 'Email not found.';
      } else if (err.code === 'auth/network-request-failed') {
        errMsg = 'Network error.';
      }
      setMessage({ text: errMsg, type: 'danger' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page-container">
      <style>{`
        .auth-page-container {
          min-height: 100vh;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #0B0F19; /* Solid deep premium dark background */
          position: relative;
          padding: 2.5rem 1rem;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }

        .auth-glass-card {
          background: #111827; /* Solid clean slate background */
          border: 1px solid rgba(255, 255, 255, 0.05); /* Thin elegant border */
          border-radius: 12px;
          width: 100%;
          max-width: 440px;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
          overflow: hidden;
          z-index: 10;
        }

        .auth-brand-logo {
          width: 60px;
          height: 60px;
          border-radius: 12px;
          object-fit: cover;
          border: 1px solid rgba(255, 255, 255, 0.08);
          margin-bottom: 1rem;
        }

        .auth-brand-name {
          font-size: 1.6rem;
          font-weight: 700;
          letter-spacing: -0.02em;
          color: #F9FAFB;
          margin-bottom: 0.2rem;
        }

        .auth-input-group {
          position: relative;
          display: flex;
          align-items: center;
        }

        .auth-input-icon {
          position: absolute;
          left: 14px;
          color: #4B5563;
          font-size: 1rem;
          transition: color 0.2s ease;
          pointer-events: none;
        }

        .auth-input-field {
          width: 100%;
          padding: 11px 16px 11px 42px;
          background: #1F2937; /* Dark clean input background */
          border: 1px solid #374151; /* Neutral grey border */
          border-radius: 8px;
          color: #F9FAFB;
          font-size: 0.88rem;
          transition: all 0.2s ease;
        }

        .auth-input-field:focus {
          border-color: #4F46E5; /* Indigo primary focus accent */
          outline: none;
          box-shadow: 0 0 0 2px rgba(79, 70, 229, 0.2);
        }

        .auth-input-field:focus + .auth-input-icon {
          color: #6366F1;
        }

        .auth-password-toggle {
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

        .auth-password-toggle:hover {
          color: #9CA3AF;
        }

        .auth-btn-primary {
          background: #4F46E5; /* Premium Indigo button */
          color: #FFFFFF;
          border: none;
          padding: 12px;
          border-radius: 8px;
          font-size: 0.9rem;
          font-weight: 600;
          transition: all 0.2s ease;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }

        .auth-btn-primary:hover:not(:disabled) {
          background: #4338CA;
        }

        .auth-btn-accent {
          background: #3B82F6; /* Solid Blue button */
          color: #FFFFFF;
          border: none;
          padding: 12px;
          border-radius: 8px;
          font-size: 0.9rem;
          font-weight: 600;
          transition: all 0.2s ease;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }

        .auth-btn-accent:hover:not(:disabled) {
          background: #2563EB;
        }

        .auth-link {
          color: #9CA3AF;
          text-decoration: none;
          font-size: 0.82rem;
          transition: color 0.2s ease;
          font-weight: 500;
        }

        .auth-link:hover {
          color: #F9FAFB;
        }
      `}</style>

      <div className="auth-glass-card">
        <div className="p-4 p-md-5">
          {/* Brand Header */}
          <div className="text-center mb-4">
            {orgDetails?.logoUrl ? (
              <img src={orgDetails.logoUrl} alt="Logo" className="auth-brand-logo" />
            ) : settings?.logoUrl ? (
              <img src={settings.logoUrl} alt="Logo" className="auth-brand-logo" />
            ) : (
              <div className="d-inline-flex align-items-center justify-content-center auth-brand-logo bg-gradient-indigo" style={{ background: 'linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)' }}>
                <i className="bi bi-controller text-white fs-2"></i>
              </div>
            )}
            <h1 className="auth-brand-name">{orgDetails?.name || settings?.appName || 'Esports League'}</h1>
            <p className="text-secondary small m-0">{isLogin ? 'Welcome back, challenger!' : 'Create your tournament account'}</p>
          </div>

          {message && (
            <div className={`alert alert-${message.type === 'danger' ? 'danger' : message.type === 'warning' ? 'warning' : 'success'} py-2.5 px-3 small mb-4 border-0`} role="alert" style={{ fontSize: '0.8rem', borderRadius: '10px', background: message.type === 'danger' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)', color: message.type === 'danger' ? '#F87171' : '#34D399' }}>
              <i className={`bi bi-${message.type === 'danger' ? 'exclamation-octagon-fill' : 'check-circle-fill'} me-2`}></i>
              {message.text}
            </div>
          )}

          {isLogin ? (
            <form onSubmit={handleLogin} id="emailLoginForm">
              <div className="mb-3">
                <label className="form-label text-secondary small fw-semibold">Email Address</label>
                <div className="auth-input-group">
                  <input 
                    type="email" 
                    className="auth-input-field" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com" 
                    required 
                  />
                  <i className="bi bi-envelope auth-input-icon"></i>
                </div>
              </div>
              
              <div className="mb-4">
                <div className="d-flex justify-content-between mb-1">
                  <label className="form-label text-secondary small m-0 fw-semibold">Password</label>
                </div>
                <div className="auth-input-group">
                  <input 
                    type={showPassword ? 'text' : 'password'} 
                    className="auth-input-field" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password" 
                    required 
                  />
                  <i className="bi bi-lock auth-input-icon"></i>
                  <button 
                    type="button" 
                    className="auth-password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    <i className={`bi bi-eye${showPassword ? '-slash' : ''}`}></i>
                  </button>
                </div>
              </div>

              <div className="d-flex flex-column gap-3">
                <button type="submit" className="auth-btn-primary w-100" disabled={loading}>
                  {loading ? (
                    <span><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Loading...</span>
                  ) : 'Sign In'}
                </button>
                
                <div className="d-flex align-items-center justify-content-between mt-1">
                  <button 
                    type="button" 
                    className="btn btn-link p-0 auth-link"
                    onClick={() => { setIsLogin(false); setMessage(null); }}
                  >
                    New player? Sign Up
                  </button>

                  <a 
                    href="#" 
                    className="auth-link"
                    onClick={(e) => { e.preventDefault(); handleForgotPassword(); }}
                  >
                    Forgot Password?
                  </a>
                </div>
              </div>
            </form>
          ) : (
            <form onSubmit={handleRegister} id="emailSignupForm">
              <div className="mb-3">
                <label className="form-label text-secondary small fw-semibold">Player Name</label>
                <div className="auth-input-group">
                  <input 
                    type="text" 
                    className="auth-input-field" 
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter public name" 
                    required 
                  />
                  <i className="bi bi-person auth-input-icon"></i>
                </div>
              </div>

              <div className="mb-3">
                <label className="form-label text-secondary small fw-semibold">Email Address</label>
                <div className="auth-input-group">
                  <input 
                    type="email" 
                    className="auth-input-field" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com" 
                    required 
                  />
                  <i className="bi bi-envelope auth-input-icon"></i>
                </div>
              </div>

              <div className="mb-3">
                <label className="form-label text-secondary small fw-semibold">Password (min 6 chars)</label>
                <div className="auth-input-group">
                  <input 
                    type={showPassword ? 'text' : 'password'} 
                    className="auth-input-field" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Choose password" 
                    required 
                    minLength={6}
                  />
                  <i className="bi bi-lock auth-input-icon"></i>
                  <button 
                    type="button" 
                    className="auth-password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    <i className={`bi bi-eye${showPassword ? '-slash' : ''}`}></i>
                  </button>
                </div>
              </div>

              <div className="mb-4">
                <label className="form-label text-secondary small fw-semibold">Referral Code (Optional)</label>
                <div className="auth-input-group">
                  <input 
                    type="text" 
                    className="auth-input-field" 
                    value={referralCode}
                    onChange={(e) => setReferralCode(e.target.value)}
                    placeholder="Enter code if referred" 
                  />
                  <i className="bi bi-gift auth-input-icon"></i>
                </div>
              </div>

              <div className="d-flex flex-column gap-3">
                <button type="submit" className="auth-btn-accent w-100" disabled={loading}>
                  {loading ? (
                    <span><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Creating...</span>
                  ) : 'Create Account'}
                </button>
                
                <button 
                  type="button" 
                  className="btn btn-link p-0 auth-link text-center w-100 mt-1"
                  onClick={() => { setIsLogin(true); setMessage(null); }}
                >
                  Already registered? Login here
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default Auth;
