import React, { useEffect, useState } from 'react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  updateProfile 
} from 'firebase/auth';
import { ref, get, set, serverTimestamp } from 'firebase/database';
import { auth, db } from '../../firebase';

const AdminAuth: React.FC = () => {
  const [isSetup, setIsSetup] = useState(false);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [setupKey, setSetupKey] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'danger' | 'warning' } | null>(null);

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

    return () => {
      document.body.classList.remove('admin-body');
    };
  }, []);

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !setupKey) {
      setMsg({ text: 'All fields are required.', type: 'warning' });
      return;
    }
    // Hardcoded secure key for setting up admin initially
    if (setupKey.trim() !== 'ESPORTS_SETUP_2026') {
      setMsg({ text: 'Invalid Secret Setup Key. Check deployment logs.', type: 'danger' });
      return;
    }

    setLoading(true);
    setMsg(null);

    try {
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
        balance: 999999, // infinite fake balance
        winningCash: 999999,
        bonusCash: 999999,
        createdAt: serverTimestamp(),
        status: 'active'
      });

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

      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      
      if (cred.user.uid !== adminUid) {
        // Sign out user since they are not authorized admin
        await auth.signOut();
        throw new Error('Unauthorized Access. You are not configured as the system administrator.');
      }
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
    <div className="d-flex align-items-center justify-content-center min-vh-100 bg-dark py-4 text-white">
      <div className="card custom-card p-4 text-start shadow" style={{ width: '100%', maxWidth: '400px' }}>
        <div className="text-center mb-4">
          <h2 className="header-title" style={{ fontSize: '1.8rem' }}>
            {isSetup ? 'ADMIN SETUP' : 'ADMIN PORTAL'}
          </h2>
          <p className="text-secondary small mt-1">
            {isSetup 
              ? 'Initialize the Esports Tournament Admin Panel' 
              : 'Sign in to access admin privileges'}
          </p>
        </div>

        {msg && (
          <div className={`alert alert-${msg.type} py-2 small`} role="alert">
            {msg.text}
          </div>
        )}

        {isSetup ? (
          <form onSubmit={handleSetup}>
            <div className="form-group">
              <label className="form-label">Admin Email</label>
              <input 
                type="email" 
                className="form-control"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@esports.com" 
                required 
              />
            </div>
            <div className="form-group">
              <label className="form-label">Password (min 6 chars)</label>
              <input 
                type="password" 
                className="form-control"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Choose strong password" 
                required 
                minLength={6}
              />
            </div>
            <div className="form-group mb-4">
              <label className="form-label">Secret Setup Key</label>
              <input 
                type="password" 
                className="form-control"
                value={setupKey}
                onChange={(e) => setSetupKey(e.target.value)}
                placeholder="ESPORTS_SETUP_2026" 
                required 
              />
              <small className="text-secondary small block mt-1">
                Enter the secret installer key.
              </small>
            </div>

            <button type="submit" className="btn-custom btn-custom-accent w-100 text-dark fw-bold" disabled={loading}>
              {loading ? 'Initializing...' : 'Initialize Setup'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label className="form-label">Admin Email</label>
              <input 
                type="email" 
                className="form-control"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@esports.com" 
                required 
              />
            </div>
            <div className="form-group mb-4">
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

            <button type="submit" className="btn-custom btn-custom-primary w-100 fw-bold" disabled={loading}>
              {loading ? 'Logging in...' : 'Login to Console'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default AdminAuth;
