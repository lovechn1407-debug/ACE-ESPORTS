import React, { useState } from 'react';
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
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'danger' | 'warning' } | null>(null);
  const [loading, setLoading] = useState(false);

  const { settings } = useSettings();

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
        const referralCodeQuery = query(ref(db, 'users'), orderByChild('referralCode'), equalTo(referralCode.trim().toUpperCase()));
        const referrerSnap = await get(referralCodeQuery);
        
        if (referrerSnap.exists()) {
          const referrerData = referrerSnap.val();
          const referrerId = Object.keys(referrerData)[0];
          const referrerProfile = referrerData[referrerId];
          
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
    <section id="login-section" className="section">
      <div className="container" style={{ maxWidth: '450px' }}>
        <div className="card shadow-sm custom-card">
          <div className="card-body p-4">
            {message && (
              <div className={`alert alert-${message.type} py-2 small mb-3`} role="alert">
                {message.text}
              </div>
            )}

            {isLogin ? (
              <form onSubmit={handleLogin} id="emailLoginForm">
                <h2 className="card-title text-center mb-4">Login</h2>
                
                <div className="mb-3">
                  <label className="form-label">Email</label>
                  <input 
                    type="email" 
                    className="form-control" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com" 
                    required 
                  />
                </div>
                
                <div className="mb-3">
                  <label className="form-label">Password</label>
                  <input 
                    type="password" 
                    className="form-control" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password" 
                    required 
                  />
                </div>

                <div className="d-grid gap-2 mb-3">
                  <button type="submit" className="btn btn-custom btn-custom-primary" disabled={loading}>
                    {loading ? 'Logging in...' : 'Login'}
                  </button>
                  
                  <button 
                    type="button" 
                    className="btn-custom-link btn-sm p-0 text-center d-block"
                    onClick={() => { setIsLogin(false); setMessage(null); }}
                  >
                    Need an account? Sign Up
                  </button>

                  <a 
                    href="#" 
                    className="text-center small mt-2 d-block" 
                    style={{ color: 'var(--text-secondary)' }}
                    onClick={(e) => { e.preventDefault(); handleForgotPassword(); }}
                  >
                    Forgot Password?
                  </a>
                </div>
              </form>
            ) : (
              <form onSubmit={handleRegister} id="emailSignupForm">
                <h2 className="card-title text-center mb-4">Sign Up</h2>
                
                <div className="mb-3">
                  <label className="form-label">Name</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter your name" 
                    required 
                  />
                </div>

                <div className="mb-3">
                  <label className="form-label">Email</label>
                  <input 
                    type="email" 
                    className="form-control" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com" 
                    required 
                  />
                </div>

                <div className="mb-3">
                  <label className="form-label">Password (min 6 chars)</label>
                  <input 
                    type="password" 
                    className="form-control" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password" 
                    required 
                    minLength={6}
                  />
                </div>

                <div className="mb-3">
                  <label className="form-label">Referral Code (Optional)</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    value={referralCode}
                    onChange={(e) => setReferralCode(e.target.value)}
                    placeholder="Enter referral code" 
                  />
                </div>

                <div className="d-grid gap-2 mb-3">
                  <button type="submit" className="btn btn-custom btn-custom-accent" disabled={loading}>
                    {loading ? 'Creating Account...' : 'Sign Up'}
                  </button>
                  
                  <button 
                    type="button" 
                    className="btn-custom-link btn-sm p-0 text-center d-block"
                    onClick={() => { setIsLogin(true); setMessage(null); }}
                  >
                    Already have account? Login
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default Auth;
