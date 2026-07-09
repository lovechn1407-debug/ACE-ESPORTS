import React, { useEffect, useState } from 'react';
import { ref, get, set, update, remove, runTransaction, push, serverTimestamp } from 'firebase/database';
import { db } from '../../firebase';

interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  balance: number;
  winningCash: number;
  bonusCash: number;
  totalEarnings?: number;
  referralCode?: string;
  referredBy?: string;
  status?: 'active' | 'blocked' | 'deleted';
  createdAt?: number;
  totalMatches?: number;
  wonMatches?: number;
  photoURL?: string;
  appliedBadgeUrl?: string;
}

const AdminUsers: React.FC = () => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Detail Modal states
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [showModal, setShowModal] = useState(false);

  // Manual Adjustments Form states
  const [adjustType, setAdjustType] = useState<'credit' | 'debit'>('credit');
  const [walletType, setWalletType] = useState<'balance' | 'winningCash' | 'bonusCash'>('balance');
  const [adjustAmt, setAdjustAmt] = useState('');
  const [adjustNote, setAdjustNote] = useState('');
  const [adjustLoading, setAdjustLoading] = useState(false);
  const [adjustMsg, setAdjustMsg] = useState<{ text: string; type: 'success' | 'danger' } | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const snapshot = await get(ref(db, 'users'));
      if (snapshot.exists()) {
        const list = Object.entries(snapshot.val()).map(([uid, val]: any) => ({
          uid,
          ...val
        }));
        setUsers(list);
      } else {
        setUsers([]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleOpenDetails = (user: UserProfile) => {
    setSelectedUser(user);
    setAdjustAmt('');
    setAdjustNote('');
    setAdjustMsg(null);
    setShowModal(true);
  };

  // Block/Unblock Toggle
  const handleToggleBlock = async () => {
    if (!selectedUser) return;
    const nextStatus = selectedUser.status === 'blocked' ? 'active' : 'blocked';
    
    if (!confirm(`Are you sure you want to ${nextStatus === 'blocked' ? 'Block' : 'Unblock'} ${selectedUser.displayName}?`)) return;

    try {
      await update(ref(db, `users/${selectedUser.uid}`), { status: nextStatus });
      alert(`User status updated to ${nextStatus}.`);
      
      const updated = { ...selectedUser, status: nextStatus } as UserProfile;
      setSelectedUser(updated);
      setUsers(users.map(u => u.uid === selectedUser.uid ? updated : u));
    } catch (err: any) {
      alert('Action failed: ' + err.message);
    }
  };

  // Delete User
  const handleDeleteUser = async () => {
    if (!selectedUser) return;
    if (!confirm(`CRITICAL WARNING: Are you sure you want to delete ${selectedUser.displayName} from the Database? This will erase their user profile documentation.`)) return;

    try {
      await remove(ref(db, `users/${selectedUser.uid}`));
      alert('User deleted.');
      setShowModal(false);
      fetchUsers();
    } catch (err: any) {
      alert('Delete failed: ' + err.message);
    }
  };

  // Manual Adjustments Submission
  const handleAdjustBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(adjustAmt);
    if (isNaN(amount) || amount <= 0 || !selectedUser) {
      setAdjustMsg({ text: 'Please enter a valid positive amount.', type: 'danger' });
      return;
    }
    if (!adjustNote.trim()) {
      setAdjustMsg({ text: 'Please enter a description note.', type: 'danger' });
      return;
    }

    setAdjustLoading(true);
    setAdjustMsg(null);

    const userRef = ref(db, `users/${selectedUser.uid}`);
    const actualAdjustment = adjustType === 'credit' ? amount : -amount;

    try {
      await runTransaction(userRef, (profData) => {
        if (profData === null) {
          return profData;
        }

        const currentVal = Number(profData[walletType] || 0);
        const nextVal = currentVal + actualAdjustment;
        
        if (nextVal < 0) {
          throw new Error(`Insufficient funds. Cannot debit past ₹0. Current ${walletType}: ₹${currentVal}`);
        }

        profData[walletType] = nextVal;
        
        // If updating winningCash or bonusCash, synchronize the main balance accordingly
        if (walletType === 'winningCash' || walletType === 'bonusCash') {
          profData.balance = Math.max(0, (profData.balance || 0) + actualAdjustment);
        } else {
          profData.balance = nextVal;
        }

        return profData;
      });

      // Fetch fresh profile to show in details
      const snap = await get(userRef);
      if (snap.exists()) {
        const fresh = { uid: selectedUser.uid, ...snap.val() } as UserProfile;
        setSelectedUser(fresh);
        setUsers(users.map(u => u.uid === selectedUser.uid ? fresh : u));
      }

      // Write transaction history
      const txKey = push(ref(db, `transactions/${selectedUser.uid}`)).key;
      await set(ref(db, `transactions/${selectedUser.uid}/${txKey}`), {
        type: adjustType === 'credit' ? 'admin_credit' : 'admin_debit',
        amount: actualAdjustment,
        description: `Admin Adjustment: ${adjustNote.trim()}`,
        timestamp: serverTimestamp(),
        balanceAfter: snap.val().balance
      });

      setAdjustMsg({ text: 'Funds adjusted successfully!', type: 'success' });
      setAdjustAmt('');
      setAdjustNote('');
    } catch (err: any) {
      console.error(err);
      setAdjustMsg({ text: err.message || 'Adjustment failed.', type: 'danger' });
    } finally {
      setAdjustLoading(false);
    }
  };

  const filtered = users.filter(u => 
    u.displayName?.toLowerCase().includes(search.toLowerCase()) || 
    u.email?.toLowerCase().includes(search.toLowerCase()) ||
    u.uid.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="admin-users-view">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h2 className="m-0 text-white fw-bold">User Directory</h2>
          <p className="text-secondary small m-0">Monitor player records, profiles, and execute balance adjustments</p>
        </div>
      </div>

      {/* Search Input Bar */}
      <div className="card custom-card p-3 mb-4">
        <div className="position-relative">
          <i className="bi bi-search text-secondary position-absolute top-50 start-0 translate-middle-y ms-3" style={{ fontSize: '0.9rem' }}></i>
          <input 
            type="text" 
            className="form-control ps-5 py-2.5 bg-dark bg-opacity-20 border border-secondary border-opacity-20 rounded-2"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search players by display name, email address, or unique UID..."
            style={{ fontSize: '0.88rem' }}
          />
        </div>
      </div>

      {loading ? (
        <div className="placeholder-glow py-5 rounded-3 animate-pulse" style={{ height: '300px', background: 'rgba(255,255,255,0.02)' }}></div>
      ) : (
        <div className="card custom-card overflow-hidden">
          <div className="table-responsive">
            <table className="table table-dark table-hover mb-0 align-middle">
              <thead>
                <tr className="border-bottom border-secondary border-opacity-25" style={{ fontSize: '0.82rem', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <th className="py-3 px-4">Player Details</th>
                  <th className="py-3">Unique UID</th>
                  <th className="py-3">Main Balance</th>
                  <th className="py-3">Status</th>
                  <th className="py-3 text-end px-4">Management</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length > 0 ? (
                  filtered.map(u => (
                    <tr key={u.uid} className="border-bottom border-secondary border-opacity-10">
                      <td className="py-3 px-4 text-start">
                        <div className="d-flex align-items-center gap-3">
                          {/* Avatar Circle */}
                          <div className="position-relative" style={{ width: '40px', height: '40px' }}>
                            <img 
                              src={u.photoURL || 'https://api.dicebear.com/7.x/adventurer/svg?seed=' + encodeURIComponent(u.displayName || u.uid)} 
                              alt="Avatar"
                              className="rounded-circle border border-secondary border-opacity-20 w-100 h-100 object-fit-cover"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = 'https://api.dicebear.com/7.x/adventurer/svg?seed=' + encodeURIComponent(u.uid);
                              }}
                            />
                            {/* Optional Active Badge */}
                            {u.appliedBadgeUrl && (
                              <div className="position-absolute bottom-0 end-0 badge-sweep-wrap" style={{ width: '16px', height: '16px', borderRadius: '50%', overflow: 'hidden' }}>
                                <img src={u.appliedBadgeUrl} alt="badge" className="w-100 h-100 object-fit-contain" />
                              </div>
                            )}
                          </div>
                          <div>
                            <div className="fw-bold text-white small">{u.displayName || 'Guest Player'}</div>
                            <div className="text-secondary" style={{ fontSize: '0.72rem' }}>{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="font-monospace text-secondary small text-start">
                        {u.uid}
                      </td>
                      <td>
                        <strong className="text-white small">₹{u.balance?.toFixed(2) || '0.00'}</strong>
                      </td>
                      <td>
                        <span className={`badge rounded-1 py-1 px-2 text-uppercase fw-bold`} style={{
                          fontSize: '0.62rem',
                          background: u.status === 'blocked' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(34, 197, 94, 0.12)',
                          color: u.status === 'blocked' ? '#EF4444' : '#10B981',
                          border: `1px solid ${u.status === 'blocked' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)'}`
                        }}>
                          {u.status || 'active'}
                        </span>
                      </td>
                      <td className="text-end px-4">
                        <button 
                          className="btn btn-sm btn-outline-warning rounded-2 py-1.5 px-3" 
                          onClick={() => handleOpenDetails(u)}
                          style={{ fontSize: '0.75rem', fontWeight: 600 }}
                        >
                          <i className="bi bi-gear-fill me-1.5"></i> Manage Player
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="text-center text-secondary py-5">No players found matching your criteria.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* User Details Modal Overlay */}
      {showModal && selectedUser && (
        <div 
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
          style={{ zIndex: 1050, background: 'rgba(0,0,0,0.76)', backdropFilter: 'blur(5px)' }}
        >
          <div className="custom-card p-4 mx-3" style={{ width: '100%', maxWidth: '640px', maxHeight: '90vh', overflowY: 'auto' }}>
            {/* Modal Header */}
            <div className="d-flex justify-content-between align-items-center pb-3 mb-3 border-bottom border-secondary border-opacity-20">
              <div className="d-flex align-items-center gap-3">
                <img 
                  src={selectedUser.photoURL || 'https://api.dicebear.com/7.x/adventurer/svg?seed=' + encodeURIComponent(selectedUser.displayName || selectedUser.uid)} 
                  alt="avatar"
                  className="rounded-circle border border-warning border-opacity-30 object-fit-cover"
                  style={{ width: '48px', height: '48px' }}
                />
                <div className="text-start">
                  <h5 className="modal-title m-0 text-white fw-bold">{selectedUser.displayName}</h5>
                  <span className="text-secondary" style={{ fontSize: '0.75rem' }}>{selectedUser.email}</span>
                </div>
              </div>
              <button className="btn-close btn-close-white" onClick={() => setShowModal(false)}></button>
            </div>

            {/* Profile Grid Detail Cards */}
            <div className="row g-3 mb-4 text-start">
              {/* Account Details Box */}
              <div className="col-md-6">
                <div className="p-3 rounded-2 bg-dark bg-opacity-20 border border-secondary border-opacity-20 h-100">
                  <h6 className="text-warning small text-uppercase fw-bold mb-3" style={{ letterSpacing: '0.04em' }}>Account Parameters</h6>
                  <div className="d-flex flex-column gap-2" style={{ fontSize: '0.78rem' }}>
                    <div className="d-flex justify-content-between"><span className="text-secondary">UID:</span> <span className="text-white font-monospace">{selectedUser.uid}</span></div>
                    <div className="d-flex justify-content-between"><span className="text-secondary">Created On:</span> <span className="text-white">{selectedUser.createdAt ? new Date(selectedUser.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' }) : 'N/A'}</span></div>
                    <div className="d-flex justify-content-between">
                      <span className="text-secondary">Status:</span> 
                      <span className={`fw-bold text-${selectedUser.status === 'blocked' ? 'danger' : 'success'}`}>{selectedUser.status?.toUpperCase() || 'ACTIVE'}</span>
                    </div>
                    <div className="d-flex justify-content-between"><span className="text-secondary">Referral Code:</span> <span className="text-accent font-monospace fw-bold">{selectedUser.referralCode || 'N/A'}</span></div>
                    <div className="d-flex justify-content-between"><span className="text-secondary">Referred By:</span> <span className="text-white">{selectedUser.referredBy || 'N/A'}</span></div>
                  </div>
                </div>
              </div>

              {/* Wallet Balances Box */}
              <div className="col-md-6">
                <div className="p-3 rounded-2 bg-dark bg-opacity-20 border border-secondary border-opacity-20 h-100">
                  <h6 className="text-warning small text-uppercase fw-bold mb-3" style={{ letterSpacing: '0.04em' }}>Wallet Balance Ledger</h6>
                  <div className="d-flex flex-column gap-2" style={{ fontSize: '0.78rem' }}>
                    <div className="d-flex justify-content-between"><span className="text-secondary">Main Deposit:</span> <strong className="text-white">₹{selectedUser.balance?.toFixed(2) || '0.00'}</strong></div>
                    <div className="d-flex justify-content-between"><span className="text-secondary">Winning Ledger:</span> <strong className="text-success">₹{selectedUser.winningCash?.toFixed(2) || '0.00'}</strong></div>
                    <div className="d-flex justify-content-between"><span className="text-secondary">Bonus Cash:</span> <strong className="text-info">₹{selectedUser.bonusCash?.toFixed(2) || '0.00'}</strong></div>
                    <div className="d-flex justify-content-between border-top border-secondary border-opacity-25 pt-2 mt-1">
                      <span className="text-secondary fw-bold">Total Earnings:</span> 
                      <strong className="text-warning">₹{selectedUser.totalEarnings?.toFixed(2) || '0.00'}</strong>
                    </div>
                    <div className="d-flex justify-content-between"><span className="text-secondary">Matches Played:</span> <span className="text-white fw-bold">{selectedUser.totalMatches || 0}</span></div>
                    <div className="d-flex justify-content-between"><span className="text-secondary">Matches Won:</span> <span className="text-success fw-bold">{selectedUser.wonMatches || 0}</span></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Actions Danger Zone */}
            <div className="p-3 rounded-2 border border-danger border-opacity-20 bg-danger bg-opacity-5 mb-4 text-start">
              <h6 className="text-danger small text-uppercase fw-bold mb-2">Player Integrity Control Zone</h6>
              <p className="text-secondary mb-3" style={{ fontSize: '0.74rem' }}>Temporary account lock blocks lobby joins. Database erasure is un-doable.</p>
              <div className="d-flex gap-2">
                <button 
                  className={`btn btn-sm ${selectedUser.status === 'blocked' ? 'btn-success' : 'btn-danger'} px-3 rounded-2`} 
                  onClick={handleToggleBlock}
                  style={{ fontSize: '0.75rem', fontWeight: 600 }}
                >
                  <i className={`bi bi-${selectedUser.status === 'blocked' ? 'unlock-fill' : 'lock-fill'} me-1.5`}></i>
                  {selectedUser.status === 'blocked' ? 'Unblock Player' : 'Suspend / Block Player'}
                </button>
                <button 
                  className="btn btn-sm btn-outline-danger px-3 rounded-2" 
                  onClick={handleDeleteUser}
                  style={{ fontSize: '0.75rem', fontWeight: 600 }}
                >
                  <i className="bi bi-trash-fill me-1.5"></i> Delete Profile
                </button>
              </div>
            </div>

            {/* Manual ledger adjustment section */}
            <div className="p-3 rounded-2 bg-dark bg-opacity-30 border border-secondary border-opacity-25 text-start">
              <h6 className="text-warning small text-uppercase fw-bold mb-3 d-flex align-items-center gap-2">
                <i className="bi bi-currency-exchange text-warning"></i> Adjust Funds Ledger Manually
              </h6>
              
              <form onSubmit={handleAdjustBalance}>
                {adjustMsg && (
                  <div className={`alert alert-${adjustMsg.type} py-2 small border-0`} role="alert" style={{ fontSize: '0.78rem' }}>
                    {adjustMsg.text}
                  </div>
                )}

                <div className="row g-2 mb-3">
                  <div className="col-md-4">
                    <label className="form-label text-secondary small">Ledger Mode</label>
                    <select className="form-select form-select-sm" value={adjustType} onChange={(e: any) => setAdjustType(e.target.value)} style={{ background: '#0F172A', border: '1px solid rgba(255,255,255,0.08)' }}>
                      <option value="credit">Credit Funds (+)</option>
                      <option value="debit">Debit Funds (-)</option>
                    </select>
                  </div>
                  <div className="col-md-4">
                    <label className="form-label text-secondary small">Sub-Wallet Target</label>
                    <select className="form-select form-select-sm" value={walletType} onChange={(e: any) => setWalletType(e.target.value)} style={{ background: '#0F172A', border: '1px solid rgba(255,255,255,0.08)' }}>
                      <option value="balance">Main Deposit</option>
                      <option value="winningCash">Winning Cash</option>
                      <option value="bonusCash">Bonus Cash</option>
                    </select>
                  </div>
                  <div className="col-md-4">
                    <label className="form-label text-secondary small">Amount (₹)</label>
                    <input 
                      type="number" 
                      className="form-control form-control-sm"
                      value={adjustAmt}
                      onChange={(e) => setAdjustAmt(e.target.value)}
                      placeholder="e.g. 100"
                      min="1"
                      required
                      style={{ background: '#0F172A', border: '1px solid rgba(255,255,255,0.08)' }}
                    />
                  </div>
                </div>

                <div className="form-group mb-3">
                  <label className="form-label text-secondary small">Audit Reason Log Note</label>
                  <input 
                    type="text" 
                    className="form-control form-control-sm"
                    value={adjustNote}
                    onChange={(e) => setAdjustNote(e.target.value)}
                    placeholder="e.g. Award for match win / Support refund"
                    required
                    style={{ background: '#0F172A', border: '1px solid rgba(255,255,255,0.08)' }}
                  />
                </div>

                <button 
                  type="submit" 
                  className="btn-custom btn-custom-accent w-100 py-2 rounded-2"
                  disabled={adjustLoading}
                  style={{ fontSize: '0.8rem', fontWeight: 700 }}
                >
                  {adjustLoading ? 'Executing Audit Update...' : 'Commit Ledger Adjustments'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminUsers;

