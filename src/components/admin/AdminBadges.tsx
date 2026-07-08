import React, { useEffect, useState, useRef } from 'react';
import { ref, get, push, set, remove, update } from 'firebase/database';
import { db } from '../../firebase';

interface BadgeItem {
  id: string;
  name: string;
  imageUrl: string;
}

interface UserItem {
  uid: string;
  displayName: string;
  email: string;
  gameUid?: string;
  appliedBadgeUrl?: string;
  photoURL?: string;
}

const IMGBB_API_KEY = '17524c13e2cca244c03f6ad0db42e5e0';

const AdminBadges: React.FC = () => {
  const [badges, setBadges] = useState<BadgeItem[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [selectedBadgeUrl, setSelectedBadgeUrl] = useState<string>('');
  
  // Badge creation form state
  const [badgeName, setBadgeName] = useState('');
  const [badgeFile, setBadgeFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);

  const fetchBadgesAndUsers = async () => {
    try {
      // 1. Fetch Badges
      const badgesSnap = await get(ref(db, 'uploads/badges'));
      const badgesList: BadgeItem[] = [];
      if (badgesSnap.exists()) {
        Object.entries(badgesSnap.val()).forEach(([id, val]: any) => {
          badgesList.push({ id, name: val.name, imageUrl: val.imageUrl });
        });
      }
      setBadges(badgesList);

      // 2. Fetch Users
      const usersSnap = await get(ref(db, 'users'));
      const usersList: UserItem[] = [];
      if (usersSnap.exists()) {
        Object.entries(usersSnap.val()).forEach(([uid, val]: any) => {
          usersList.push({
            uid,
            displayName: val.displayName || 'Unnamed User',
            email: val.email || 'N/A',
            gameUid: val.gameUid || '',
            appliedBadgeUrl: val.appliedBadgeUrl || '',
            photoURL: val.photoURL || ''
          });
        });
      }
      setUsers(usersList);
    } catch (err) {
      console.error('Error loading badges/users:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBadgesAndUsers();
  }, []);

  // Create badge
  const handleCreateBadge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!badgeName.trim() || !badgeFile) {
      alert('Please fill badge name and choose an image file.');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', badgeFile);

      const resp = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
        method: 'POST',
        body: formData
      });
      const data = await resp.json();
      if (data.success) {
        const imageUrl = data.data.url;
        const newBadgeRef = push(ref(db, 'uploads/badges'));
        await set(newBadgeRef, {
          name: badgeName.trim(),
          imageUrl
        });
        
        setBadgeName('');
        setBadgeFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        
        alert('Badge created successfully!');
        await fetchBadgesAndUsers();
      } else {
        throw new Error(data.error?.message || 'Upload to ImgBB failed');
      }
    } catch (err: any) {
      alert('Error creating badge: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  // Delete badge
  const handleDeleteBadge = async (id: string) => {
    if (!confirm('Are you sure you want to delete this badge? This won\'t remove the badge URL from users already wearing it, but they won\'t be able to select it anymore.')) return;
    try {
      await remove(ref(db, `uploads/badges/${id}`));
      alert('Badge deleted.');
      await fetchBadgesAndUsers();
    } catch (err: any) {
      alert('Error deleting: ' + err.message);
    }
  };

  // Select / Deselect individual user checkbox
  const handleSelectUser = (uid: string, checked: boolean) => {
    if (checked) {
      setSelectedUsers(prev => [...prev, uid]);
    } else {
      setSelectedUsers(prev => prev.filter(id => id !== uid));
    }
  };

  // Select all visible users
  const handleSelectAllVisible = (checked: boolean, visibleUids: string[]) => {
    if (checked) {
      setSelectedUsers(visibleUids);
    } else {
      setSelectedUsers([]);
    }
  };

  // Apply selected badge to checked users
  const handleApplyBadge = async () => {
    if (selectedUsers.length === 0) {
      alert('Please select at least one user.');
      return;
    }

    const confirmMsg = selectedBadgeUrl 
      ? `Apply this badge to ${selectedUsers.length} selected user(s)?`
      : `Remove badge from ${selectedUsers.length} selected user(s)?`;

    if (!confirm(confirmMsg)) return;

    setLoading(true);
    try {
      const updates: any = {};
      selectedUsers.forEach(uid => {
        updates[`/users/${uid}/appliedBadgeUrl`] = selectedBadgeUrl || null;
      });

      await update(ref(db), updates);
      alert('Badges updated successfully!');
      setSelectedUsers([]);
      await fetchBadgesAndUsers();
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Filter users based on search
  const filteredUsers = users.filter(u => 
    u.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.uid.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (u.gameUid && u.gameUid.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const visibleUids = filteredUsers.map(u => u.uid);

  return (
    <div className="admin-badges-view">
      <h2 className="mb-4">Badge Management</h2>

      <div className="row">
        {/* Create Badge Card */}
        <div className="col-lg-4 mb-4">
          <div className="card custom-card">
            <div className="card-body text-start">
              <h5 className="card-title text-accent mb-3"><i className="bi bi-patch-check-fill me-2"></i>Create New Badge</h5>
              <form onSubmit={handleCreateBadge}>
                <div className="mb-3">
                  <label className="form-label text-secondary small">Badge Name</label>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    placeholder="e.g. Champion, Pro Player"
                    value={badgeName}
                    onChange={e => setBadgeName(e.target.value)}
                    required
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label text-secondary small">Badge Image (PNG recommended)</label>
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="form-control form-control-sm"
                    accept="image/*"
                    onChange={e => setBadgeFile(e.target.files?.[0] || null)}
                    required
                  />
                </div>
                <button 
                  type="submit" 
                  className="btn btn-warning btn-sm w-100 fw-bold"
                  disabled={uploading}
                >
                  {uploading ? (
                    <><span className="spinner-border spinner-border-sm me-2"></span>Uploading...</>
                  ) : (
                    'Save Badge'
                  )}
                </button>
              </form>
            </div>
          </div>

          {/* Badge Gallery */}
          <div className="card custom-card mt-4">
            <div className="card-body text-start">
              <h5 className="card-title text-white mb-3">Available Badges</h5>
              {badges.length === 0 ? (
                <div className="text-secondary small">No badges uploaded yet.</div>
              ) : (
                <div className="row g-2" style={{ maxHeight: '350px', overflowY: 'auto' }}>
                  {badges.map(b => (
                    <div className="col-6" key={b.id}>
                      <div className="p-2 bg-dark bg-opacity-40 rounded-3 border border-secondary border-opacity-10 d-flex flex-column align-items-center text-center position-relative">
                        <img 
                          src={b.imageUrl} 
                          alt={b.name} 
                          style={{ width: '40px', height: '40px', objectFit: 'contain' }}
                          className="mb-1"
                        />
                        <span className="small text-white text-truncate w-100 fw-semibold" style={{ fontSize: '0.75rem' }}>{b.name}</span>
                        <button
                          className="btn btn-sm btn-link text-danger p-0 mt-1"
                          onClick={() => handleDeleteBadge(b.id)}
                          style={{ fontSize: '0.75rem' }}
                        >
                          <i className="bi bi-trash-fill"></i> Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Apply Badges to Players */}
        <div className="col-lg-8 mb-4">
          <div className="card custom-card">
            <div className="card-body text-start">
              <h5 className="card-title text-white mb-3">Apply Badges to Players</h5>
              
              {/* Batch apply actions bar */}
              <div className="d-flex flex-wrap gap-2 align-items-center mb-3 p-3 bg-dark bg-opacity-40 rounded-3 border border-secondary border-opacity-25">
                <div className="form-check me-2">
                  <input
                    type="checkbox"
                    className="form-check-input"
                    id="selectAllVisibleCheck"
                    checked={visibleUids.length > 0 && visibleUids.every(id => selectedUsers.includes(id))}
                    onChange={e => handleSelectAllVisible(e.target.checked, visibleUids)}
                  />
                  <label className="form-check-label text-secondary small" htmlFor="selectAllVisibleCheck">
                    Select All Visible ({visibleUids.length})
                  </label>
                </div>

                <div className="ms-md-auto d-flex gap-2 w-100 w-md-auto mt-2 mt-md-0">
                  <select 
                    className="form-select form-select-sm" 
                    value={selectedBadgeUrl}
                    onChange={e => setSelectedBadgeUrl(e.target.value)}
                    style={{ minWidth: '180px' }}
                  >
                    <option value="">-- Remove Badge --</option>
                    {badges.map(b => (
                      <option key={b.id} value={b.imageUrl}>{b.name}</option>
                    ))}
                  </select>
                  <button 
                    className="btn btn-warning btn-sm fw-bold px-3"
                    onClick={handleApplyBadge}
                    disabled={selectedUsers.length === 0}
                  >
                    Apply Badge
                  </button>
                </div>
              </div>

              {/* User search bar */}
              <div className="input-group input-group-sm mb-3">
                <span className="input-group-text bg-dark border-secondary border-opacity-50 text-secondary">
                  <i className="bi bi-search"></i>
                </span>
                <input
                  type="search"
                  className="form-control"
                  placeholder="Search player by Display Name, Email, UID, or In-Game UID..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>

              {/* Players Table */}
              <div className="table-responsive" style={{ maxHeight: '550px', overflowY: 'auto' }}>
                <table className="table table-dark table-hover mb-0 align-middle">
                  <thead>
                    <tr>
                      <th style={{ width: '40px' }}></th>
                      <th>Avatar / Badge</th>
                      <th>Name</th>
                      <th>In-Game ID</th>
                      <th>User UID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={5} className="text-center py-5">
                          <div className="spinner-border spinner-border-sm text-warning"></div>
                        </td>
                      </tr>
                    ) : filteredUsers.length > 0 ? (
                      filteredUsers.map(u => {
                        const avatarUrl = u.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.displayName)}&background=1E293B&color=E2E8F0&bold=true`;
                        return (
                          <tr key={u.uid}>
                            <td>
                              <input
                                type="checkbox"
                                className="form-check-input"
                                checked={selectedUsers.includes(u.uid)}
                                onChange={e => handleSelectUser(u.uid, e.target.checked)}
                              />
                            </td>
                            <td>
                              <div style={{ position: 'relative', display: 'inline-block', width: '42px', height: '42px' }}>
                                <img
                                  src={avatarUrl}
                                  alt="Avatar"
                                  className="rounded-circle border border-secondary border-opacity-20"
                                  style={{ width: '42px', height: '42px', objectFit: 'cover' }}
                                />
                                {u.appliedBadgeUrl && (
                                  <img
                                    src={u.appliedBadgeUrl}
                                    alt="Badge"
                                    style={{
                                      position: 'absolute',
                                      bottom: '-2px',
                                      right: '-2px',
                                      width: '18px',
                                      height: '18px',
                                      objectFit: 'contain',
                                      background: '#0f172a',
                                      borderRadius: '50%',
                                      padding: '1px'
                                    }}
                                  />
                                )}
                              </div>
                            </td>
                            <td className="fw-bold text-white text-start">{u.displayName}</td>
                            <td className="text-secondary text-start">{u.gameUid || 'N/A'}</td>
                            <td className="font-monospace text-secondary small text-start">{u.uid}</td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={5} className="text-center text-secondary py-4">No players found matching query.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminBadges;
