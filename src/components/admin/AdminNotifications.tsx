import React, { useEffect, useState, useRef } from 'react';
import { ref, get, push, set, serverTimestamp } from 'firebase/database';
import { db } from '../../firebase';

interface NotificationLog {
  id: string;
  title: string;
  message: string;
  imageUrl?: string;
  timestamp?: number;
}

interface UserListItem {
  uid: string;
  displayName: string;
  email: string;
}

const IMGBB_API_KEY = '17524c13e2cca244c03f6ad0db42e5e0';

const AdminNotifications: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'global' | 'individual'>('global');
  
  // Global form states
  const [globalTitle, setGlobalTitle] = useState('');
  const [globalMsg, setGlobalMsg] = useState('');
  const [globalImageUrl, setGlobalImageUrl] = useState('');
  const [globalFile, setGlobalFile] = useState<File | null>(null);
  const [globalLoading, setGlobalLoading] = useState(false);

  // Individual form states
  const [indTitle, setIndTitle] = useState('');
  const [indMsg, setIndMsg] = useState('');
  const [indImageUrl, setIndImageUrl] = useState('');
  const [indFile, setIndFile] = useState<File | null>(null);
  const [selectedUserUid, setSelectedUserUid] = useState('');
  const [indLoading, setIndLoading] = useState(false);

  // Users autocomplete list
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [userSearch, setUserSearch] = useState('');
  
  // Global history
  const [history, setHistory] = useState<NotificationLog[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const globalFileRef = useRef<HTMLInputElement>(null);
  const indFileRef = useRef<HTMLInputElement>(null);

  // Load sent global notification logs
  const fetchGlobalHistory = async () => {
    setHistoryLoading(true);
    try {
      const snap = await get(ref(db, 'notifications'));
      if (snap.exists()) {
        const list = Object.entries(snap.val()).map(([id, val]: any) => ({
          id,
          ...val
        }));
        list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        setHistory(list);
      } else {
        setHistory([]);
      }
    } catch (err) {
      console.error('Error fetching notification history:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  // Load all users for individual notification autocomplete
  const fetchUsers = async () => {
    try {
      const snap = await get(ref(db, 'users'));
      if (snap.exists()) {
        const list = Object.entries(snap.val()).map(([uid, val]: any) => ({
          uid,
          displayName: val.displayName || 'Player',
          email: val.email || 'N/A'
        }));
        setUsers(list);
      }
    } catch (err) {
      console.error('Error loading users list:', err);
    }
  };

  useEffect(() => {
    fetchGlobalHistory();
    fetchUsers();
  }, []);

  const handleUploadImage = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('image', file);
    const resp = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
      method: 'POST',
      body: formData
    });
    const data = await resp.json();
    if (data.success) {
      return data.data.url;
    } else {
      throw new Error(data.error?.message || 'Image upload failed.');
    }
  };

  const handleSendGlobal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!globalTitle.trim() || !globalMsg.trim()) {
      alert('Title and Message description are required.');
      return;
    }
    setGlobalLoading(true);
    try {
      let finalImgUrl = globalImageUrl.trim();
      if (globalFile) {
        finalImgUrl = await handleUploadImage(globalFile);
      }
      
      const newRef = push(ref(db, 'notifications'));
      await set(newRef, {
        title: globalTitle.trim(),
        message: globalMsg.trim(),
        imageUrl: finalImgUrl || null,
        timestamp: serverTimestamp()
      });

      alert('Global notification broadcasted successfully!');
      setGlobalTitle('');
      setGlobalMsg('');
      setGlobalImageUrl('');
      setGlobalFile(null);
      if (globalFileRef.current) globalFileRef.current.value = '';
      fetchGlobalHistory();
    } catch (err: any) {
      alert('Broadcast failed: ' + err.message);
    } finally {
      setGlobalLoading(false);
    }
  };

  const handleSendIndividual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserUid) {
      alert('Please select a target user.');
      return;
    }
    if (!indTitle.trim() || !indMsg.trim()) {
      alert('Title and Message description are required.');
      return;
    }
    setIndLoading(true);
    try {
      let finalImgUrl = indImageUrl.trim();
      if (indFile) {
        finalImgUrl = await handleUploadImage(indFile);
      }

      const userNotifRef = push(ref(db, `users/${selectedUserUid}/notifications`));
      await set(userNotifRef, {
        title: indTitle.trim(),
        message: indMsg.trim(),
        imageUrl: finalImgUrl || null,
        timestamp: serverTimestamp()
      });

      alert('Individual notification sent successfully!');
      setIndTitle('');
      setIndMsg('');
      setIndImageUrl('');
      setIndFile(null);
      setSelectedUserUid('');
      setUserSearch('');
      if (indFileRef.current) indFileRef.current.value = '';
    } catch (err: any) {
      alert('Deduction/delivery failed: ' + err.message);
    } finally {
      setIndLoading(false);
    }
  };

  const filteredUsers = users.filter(u => 
    u.displayName.toLowerCase().includes(userSearch.toLowerCase()) || 
    u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.uid.toLowerCase().includes(userSearch.toLowerCase())
  ).slice(0, 5);

  return (
    <div className="admin-notifications-view text-start">
      <h2 className="mb-4">Announcements &amp; Alerts</h2>

      {/* Tabs */}
      <ul className="nav nav-tabs mb-4">
        <li className="nav-item">
          <button 
            className={`nav-link ${activeTab === 'global' ? 'active' : ''}`}
            onClick={() => setActiveTab('global')}
          >
            <i className="bi bi-globe me-2"></i>Global Broadcaster
          </button>
        </li>
        <li className="nav-item">
          <button 
            className={`nav-link ${activeTab === 'individual' ? 'active' : ''}`}
            onClick={() => setActiveTab('individual')}
          >
            <i className="bi bi-person-badge me-2"></i>Individual Alert
          </button>
        </li>
      </ul>

      <div className="row g-4">
        <div className="col-lg-6">
          {activeTab === 'global' ? (
            <form onSubmit={handleSendGlobal} className="card custom-card p-4">
              <h5 className="mb-3 text-white">Broadcast Global Notification</h5>
              
              <div className="form-group mb-3">
                <label className="form-label">Alert Title</label>
                <input 
                  type="text" 
                  className="form-control"
                  value={globalTitle}
                  onChange={(e) => setGlobalTitle(e.target.value)}
                  placeholder="e.g. Server Maintenance Scheduled"
                  required
                />
              </div>

              <div className="form-group mb-3">
                <label className="form-label">Message Details</label>
                <textarea 
                  className="form-control"
                  value={globalMsg}
                  onChange={(e) => setGlobalMsg(e.target.value)}
                  placeholder="Write message content here..."
                  style={{ minHeight: '100px' }}
                  required
                />
              </div>

              <div className="form-group mb-3">
                <label className="form-label">Banner Image URL (Optional)</label>
                <input 
                  type="url" 
                  className="form-control"
                  value={globalImageUrl}
                  onChange={(e) => setGlobalImageUrl(e.target.value)}
                  placeholder="https://..."
                />
              </div>

              <div className="form-group mb-4">
                <label className="form-label">Or Upload Banner File</label>
                <input 
                  ref={globalFileRef}
                  type="file" 
                  className="form-control"
                  accept="image/*"
                  onChange={(e) => setGlobalFile(e.target.files?.[0] || null)}
                />
              </div>

              <button type="submit" className="btn-custom btn-custom-primary w-100" disabled={globalLoading}>
                {globalLoading ? 'Broadcasting...' : 'Broadcast Alert'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleSendIndividual} className="card custom-card p-4">
              <h5 className="mb-3 text-white">Send Individual Alert</h5>

              {/* User search & selection autocomplete */}
              <div className="form-group mb-3 position-relative">
                <label className="form-label">Target Player Search</label>
                <input 
                  type="text" 
                  className="form-control"
                  value={userSearch}
                  onChange={(e) => {
                    setUserSearch(e.target.value);
                    if (selectedUserUid) setSelectedUserUid('');
                  }}
                  placeholder="Search by name, email or UID..."
                  required={!selectedUserUid}
                />
                
                {userSearch.trim() && !selectedUserUid && (
                  <div className="list-group position-absolute w-100 z-3 mt-1 shadow-lg bg-dark text-white border border-secondary">
                    {filteredUsers.length > 0 ? (
                      filteredUsers.map(u => (
                        <button
                          key={u.uid}
                          type="button"
                          className="list-group-item list-group-item-action bg-dark text-white border-0 border-bottom border-secondary border-opacity-25"
                          onClick={() => {
                            setSelectedUserUid(u.uid);
                            setUserSearch(`${u.displayName} (${u.email})`);
                          }}
                        >
                          <div className="fw-bold">{u.displayName}</div>
                          <small className="text-secondary">{u.uid}</small>
                        </button>
                      ))
                    ) : (
                      <div className="list-group-item bg-dark text-secondary border-0 small">No players found.</div>
                    )}
                  </div>
                )}
              </div>

              <div className="form-group mb-3">
                <label className="form-label">Alert Title</label>
                <input 
                  type="text" 
                  className="form-control"
                  value={indTitle}
                  onChange={(e) => setIndTitle(e.target.value)}
                  placeholder="e.g. Deposit Completed Successfully"
                  required
                />
              </div>

              <div className="form-group mb-3">
                <label className="form-label">Message Details</label>
                <textarea 
                  className="form-control"
                  value={indMsg}
                  onChange={(e) => setIndMsg(e.target.value)}
                  placeholder="Write message content here..."
                  style={{ minHeight: '100px' }}
                  required
                />
              </div>

              <div className="form-group mb-3">
                <label className="form-label">Attached Image URL (Optional)</label>
                <input 
                  type="url" 
                  className="form-control"
                  value={indImageUrl}
                  onChange={(e) => setIndImageUrl(e.target.value)}
                  placeholder="https://..."
                />
              </div>

              <div className="form-group mb-4">
                <label className="form-label">Or Upload File Image</label>
                <input 
                  ref={indFileRef}
                  type="file" 
                  className="form-control"
                  accept="image/*"
                  onChange={(e) => setIndFile(e.target.files?.[0] || null)}
                />
              </div>

              <button type="submit" className="btn-custom btn-custom-accent w-100" disabled={indLoading}>
                {indLoading ? 'Sending Alert...' : 'Send Alert'}
              </button>
            </form>
          )}
        </div>

        <div className="col-lg-6">
          <div className="card custom-card p-4">
            <h5 className="mb-3 text-white">Broadcast History Logs</h5>

            {historyLoading ? (
              <div className="text-center py-5">
                <div className="spinner-border text-warning"></div>
              </div>
            ) : history.length === 0 ? (
              <div className="text-center text-secondary py-5">
                <i className="bi bi-clock-history fs-2 d-block mb-2"></i>
                No announcements broadcasted yet.
              </div>
            ) : (
              <div className="table-responsive" style={{ maxHeight: '420px', overflowY: 'auto' }}>
                <table className="table table-dark table-striped small align-middle">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Title</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map(h => (
                      <tr key={h.id}>
                        <td className="text-nowrap text-secondary">
                          {h.timestamp ? new Date(h.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'N/A'}
                        </td>
                        <td className="fw-bold">{h.title}</td>
                        <td className="text-truncate" style={{ maxWidth: '180px' }} title={h.message}>
                          {h.message}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminNotifications;
