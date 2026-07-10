import React, { useEffect, useState } from 'react';
import { ref, get, update, runTransaction, push, serverTimestamp } from 'firebase/database';
import { db, auth } from '../../firebase';


interface Deposit {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  amount: number;
  paymentMethod: string;
  upiId: string;
  utr: string;
  status: 'pending' | 'completed' | 'rejected';
  timestamp: number;
  processedAt?: number;
  rejectReason?: string;
}

const AdminDeposits: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'pending' | 'completed' | 'rejected'>('pending');
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [loading, setLoading] = useState(true);

  // Rejection Modal states
  const [selectedReq, setSelectedReq] = useState<Deposit | null>(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReasonText, setRejectReasonText] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchDeposits = async () => {
    setLoading(true);
    try {
      const snapshot = await get(ref(db, 'deposits'));
      if (snapshot.exists()) {
        const list = Object.entries(snapshot.val()).map(([id, val]: any) => ({
          id,
          ...val
        })).filter((d: any) => d.status === activeTab);
        // Sort newest first
        list.sort((a, b) => b.timestamp - a.timestamp);
        setDeposits(list);
      } else {
        setDeposits([]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeposits();
  }, [activeTab]);

  // Approve Recharge Request
  const handleApprove = async (dep: Deposit) => {
    if (!confirm(`Are you sure you want to approve this recharge of ₹${dep.amount} for ${dep.userName}? This will credit the balance to their wallet.`)) return;

    setActionLoading(true);
    const processedTime = serverTimestamp();

    try {
      // 1. Transaction to check and lock status to 'completed'
      let alreadyProcessed = false;
      await runTransaction(ref(db, `deposits/${dep.id}`), (currDep) => {
        if (!currDep) return currDep;
        if (currDep.status !== 'pending') {
          alreadyProcessed = true;
          return; // Aborts transaction
        }
        currDep.status = 'completed';
        currDep.processedAt = processedTime;
        return currDep;
      });

      if (alreadyProcessed) {
        alert('This deposit request has already been processed.');
        fetchDeposits();
        return;
      }

      // 2. Transaction to credit wallet balance
      const userRef = ref(db, `users/${dep.userId}`);
      await runTransaction(userRef, (prof) => {
        if (prof) {
          prof.balance = (prof.balance || 0) + dep.amount;
          return prof;
        }
        return prof;
      });

      const updates: any = {};
      
      // Create transaction log
      const txKey = push(ref(db, `transactions/${dep.userId}`)).key;
      updates[`transactions/${dep.userId}/${txKey}`] = {
        type: 'deposit',
        amount: dep.amount,
        description: `Deposit Approved (UTR: ${dep.utr})`,
        timestamp: serverTimestamp(),
        balanceAfter: (await get(ref(db, `users/${dep.userId}/balance`))).val()
      };

      // Send Notification to user
      const notifKey = push(ref(db, `users/${dep.userId}/notifications`)).key;
      updates[`users/${dep.userId}/notifications/${notifKey}`] = {
        title: 'Deposit Approved',
        message: `Your deposit request of ₹${dep.amount.toFixed(2)} (UTR: ${dep.utr}) has been approved and credited to your wallet.`,
        timestamp: serverTimestamp()
      };

      await update(ref(db), updates);

      // Write admin action log
      const logRef = push(ref(db, 'adminLogs'));
      const loggedInStaffStr = sessionStorage.getItem('loggedInStaff');
      const loggedInStaff = loggedInStaffStr ? JSON.parse(loggedInStaffStr) : null;
      await update(ref(db), {
        [logRef.key!]: {
          actor: loggedInStaff?.id || auth.currentUser?.email || 'admin',
          actorType: loggedInStaff ? 'staff' : 'admin',
          event: 'approve_deposit',
          description: `Approved deposit of ₹${dep.amount} for ${dep.userName} (UTR: ${dep.utr})`,
          targetUser: dep.userId,
          amount: dep.amount,
          timestamp: Date.now()
        }
      }).catch(() => {});

      alert('Recharge approved and credited successfully.');
      fetchDeposits();
    } catch (err: any) {
      console.error(err);
      alert('Approval failed: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Reject Recharge Request Open Form
  const handleOpenReject = (dep: Deposit) => {
    setSelectedReq(dep);
    setRejectReasonText('');
    setShowRejectModal(true);
  };

  // Submit Rejection
  const handleRejectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReq || !rejectReasonText.trim()) return;

    setActionLoading(true);
    const processedTime = serverTimestamp();

    try {
      // 1. Transaction to check and lock status to 'rejected'
      let alreadyProcessed = false;
      await runTransaction(ref(db, `deposits/${selectedReq.id}`), (currDep) => {
        if (!currDep) return currDep;
        if (currDep.status !== 'pending') {
          alreadyProcessed = true;
          return; // Aborts transaction
        }
        currDep.status = 'rejected';
        currDep.rejectReason = rejectReasonText.trim();
        currDep.processedAt = processedTime;
        return currDep;
      });

      if (alreadyProcessed) {
        alert('This deposit request has already been processed.');
        setShowRejectModal(false);
        fetchDeposits();
        return;
      }

      const updates: any = {};

      // Send Notification to user
      const notifKey = push(ref(db, `users/${selectedReq.userId}/notifications`)).key;
      updates[`users/${selectedReq.userId}/notifications/${notifKey}`] = {
        title: 'Deposit Request Rejected',
        message: `Your deposit request of ₹${selectedReq.amount.toFixed(2)} (UTR: ${selectedReq.utr}) was rejected. Reason: ${rejectReasonText.trim()}`,
        timestamp: serverTimestamp()
      };

      await update(ref(db), updates);

      // Write admin action log
      const logRefRej = push(ref(db, 'adminLogs'));
      const loggedInStaffStrR = sessionStorage.getItem('loggedInStaff');
      const loggedInStaffR = loggedInStaffStrR ? JSON.parse(loggedInStaffStrR) : null;
      await update(ref(db), {
        [logRefRej.key!]: {
          actor: loggedInStaffR?.id || auth.currentUser?.email || 'admin',
          actorType: loggedInStaffR ? 'staff' : 'admin',
          event: 'reject_deposit',
          description: `Rejected deposit of ₹${selectedReq.amount} for ${selectedReq.userName} (UTR: ${selectedReq.utr}). Reason: ${rejectReasonText.trim()}`,
          targetUser: selectedReq.userId,
          amount: selectedReq.amount,
          timestamp: Date.now()
        }
      }).catch(() => {});

      alert('Request rejected successfully.');
      setShowRejectModal(false);
      fetchDeposits();
    } catch (err: any) {
      console.error(err);
      alert('Rejection failed: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="admin-deposits-view">
      <h2 className="mb-4">Deposit Requests (Audits)</h2>

      {/* Tabs */}
      <div className="custom-tabs-container">
        <button className={`tab-btn ${activeTab === 'pending' ? 'active' : ''}`} onClick={() => setActiveTab('pending')}>
          Pending
        </button>
        <button className={`tab-btn ${activeTab === 'completed' ? 'active' : ''}`} onClick={() => setActiveTab('completed')}>
          Completed
        </button>
        <button className={`tab-btn ${activeTab === 'rejected' ? 'active' : ''}`} onClick={() => setActiveTab('rejected')}>
          Rejected
        </button>
      </div>

      {loading ? (
        <div className="placeholder-glow py-5 rounded-3" style={{ height: '300px' }}></div>
      ) : (
        <div className="card custom-card">
          <div className="table-responsive">
            <table className="table table-dark table-hover mb-0">
              <thead>
                <tr>
                  <th>Submitted At</th>
                  {activeTab !== 'pending' && <th>Processed At</th>}
                  <th>Player Account</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>UTR / Txn ID</th>
                  {activeTab === 'rejected' && <th>Rejection Reason</th>}
                  {activeTab === 'pending' && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {deposits.length > 0 ? (
                  deposits.map(d => {
                    const subTime = new Date(d.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
                    const procTime = d.processedAt ? new Date(d.processedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : '';

                    return (
                      <tr key={d.id}>
                        <td className="align-middle small">{subTime}</td>
                        {activeTab !== 'pending' && <td className="align-middle small">{procTime}</td>}
                        <td className="align-middle text-start">
                          <div className="fw-bold">{d.userName}</div>
                          <small className="text-secondary">{d.userEmail}</small>
                        </td>
                        <td className="align-middle fw-bold text-success">₹{d.amount}</td>
                        <td className="align-middle text-start">
                          <span className="badge bg-secondary">{d.paymentMethod}</span>
                          <div className="small font-monospace text-secondary">{d.upiId}</div>
                        </td>
                        <td className="align-middle font-monospace text-warning fw-bold">{d.utr}</td>
                        {activeTab === 'rejected' && <td className="align-middle text-danger small text-start">{d.rejectReason}</td>}
                        {activeTab === 'pending' && (
                          <td className="align-middle">
                            <button 
                              className="btn btn-sm btn-success me-2" 
                              onClick={() => handleApprove(d)} 
                              disabled={actionLoading}
                              title="Approve"
                            >
                              <i className="bi bi-check-circle"></i>
                            </button>
                            <button 
                              className="btn btn-sm btn-danger" 
                              onClick={() => handleOpenReject(d)} 
                              disabled={actionLoading}
                              title="Reject"
                            >
                              <i className="bi bi-x-circle"></i>
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={activeTab === 'pending' ? 7 : 8} className="text-center text-secondary py-3">
                      No {activeTab} deposits found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Reject Reason Modal Dialog */}
      {showRejectModal && selectedReq && (
        <div 
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
          style={{ zIndex: 1050, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
        >
          <div className="custom-card p-4 mx-3" style={{ width: '100%', maxWidth: '420px' }}>
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h5 className="modal-title m-0 text-danger"><i className="bi bi-exclamation-triangle-fill"></i> Reject Recharge</h5>
              <button className="btn-close btn-close-white" onClick={() => setShowRejectModal(false)}></button>
            </div>

            <form onSubmit={handleRejectSubmit} className="text-start">
              <p className="small text-secondary">
                Amount: <strong className="text-white">₹{selectedReq.amount}</strong> (UTR: {selectedReq.utr}) for {selectedReq.userName}
              </p>

              <div className="form-group mb-4">
                <label className="form-label">Reason for Rejection</label>
                <textarea 
                  className="form-control"
                  value={rejectReasonText}
                  onChange={(e) => setRejectReasonText(e.target.value)}
                  placeholder="e.g. UTR is invalid / payment not received in bank account / screenshot is fake"
                  style={{ minHeight: '80px' }}
                  required
                />
              </div>

              <div className="d-flex gap-2">
                <button 
                  type="button" 
                  className="btn-custom btn-custom-secondary flex-grow-1" 
                  onClick={() => setShowRejectModal(false)}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn-custom btn-custom-danger flex-grow-1"
                  disabled={actionLoading}
                >
                  {actionLoading ? 'Rejecting...' : 'Confirm Reject'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDeposits;
