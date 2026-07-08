import React, { useEffect, useState } from 'react';
import { ref, get, set, update, runTransaction, push, serverTimestamp } from 'firebase/database';
import { db } from '../../firebase';

interface Withdrawal {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  amount: number;
  methodDetails?: {
    methodName: string;
    accountInfo: string;
  };
  method?: string;
  status: 'pending' | 'completed' | 'rejected';
  requestTimestamp: number;
  processedAt?: number;
  adminNote?: string;
  rejectReason?: string;
}

const AdminWithdrawals: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'pending' | 'completed' | 'rejected'>('pending');
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);

  // Note Modal states
  const [selectedReq, setSelectedReq] = useState<Withdrawal | null>(null);
  const [actionType, setActionType] = useState<'approve' | 'reject'>('approve');
  const [showModal, setShowModal] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchWithdrawals = async () => {
    setLoading(true);
    try {
      const snapshot = await get(ref(db, 'withdrawals'));
      if (snapshot.exists()) {
        const list = Object.entries(snapshot.val()).map(([id, val]: any) => ({
          id,
          ...val
        })).filter((w: any) => w.status === activeTab);
        // Sort newest requests first
        list.sort((a, b) => b.requestTimestamp - a.requestTimestamp);
        setWithdrawals(list);
      } else {
        setWithdrawals([]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWithdrawals();
  }, [activeTab]);

  const handleOpenAction = (req: Withdrawal, type: 'approve' | 'reject') => {
    setSelectedReq(req);
    setActionType(type);
    setNoteText('');
    setShowModal(true);
  };

  const handleProcessAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReq) return;
    if (!noteText.trim()) {
      alert('Please enter a note / reference code / reason.');
      return;
    }

    setActionLoading(true);
    const updates: any = {};
    const processedTime = serverTimestamp();

    try {
      if (actionType === 'approve') {
        // Just mark as completed
        updates[`withdrawals/${selectedReq.id}/status`] = 'completed';
        updates[`withdrawals/${selectedReq.id}/adminNote`] = noteText.trim();
        updates[`withdrawals/${selectedReq.id}/processedAt`] = processedTime;
        
        await update(ref(db), updates);
        
        // Notify user
        const notifKey = push(ref(db, `users/${selectedReq.userId}/notifications`)).key;
        await set(ref(db, `users/${selectedReq.userId}/notifications/${notifKey}`), {
          title: 'Withdrawal Approved',
          message: `Your withdrawal request of ₹${selectedReq.amount.toFixed(2)} has been processed. Info: ${noteText.trim()}`,
          timestamp: serverTimestamp()
        });

        alert('Request approved successfully.');
      } else {
        // REJECT workflow: must refund winningCash and balance
        const userRef = ref(db, `users/${selectedReq.userId}`);
        
        await runTransaction(userRef, (prof) => {
          if (prof) {
            prof.winningCash = (prof.winningCash || 0) + selectedReq.amount;
            prof.balance = (prof.balance || 0) + selectedReq.amount;
            return prof;
          }
          return prof;
        });

        // Set status
        updates[`withdrawals/${selectedReq.id}/status`] = 'rejected';
        updates[`withdrawals/${selectedReq.id}/rejectReason`] = noteText.trim();
        updates[`withdrawals/${selectedReq.id}/processedAt`] = processedTime;
        await update(ref(db), updates);

        // Transaction log for refund
        const txKey = push(ref(db, `transactions/${selectedReq.userId}`)).key;
        await set(ref(db, `transactions/${selectedReq.userId}/${txKey}`), {
          type: 'withdraw_failed_refund',
          amount: selectedReq.amount,
          description: `Withdrawal Rejected: ${noteText.trim()}`,
          timestamp: serverTimestamp(),
          balanceAfter: (await get(ref(db, `users/${selectedReq.userId}/balance`))).val()
        });

        // Notify user
        const notifKey = push(ref(db, `users/${selectedReq.userId}/notifications`)).key;
        await set(ref(db, `users/${selectedReq.userId}/notifications/${notifKey}`), {
          title: 'Withdrawal Rejected',
          message: `Withdrawal request of ₹${selectedReq.amount.toFixed(2)} was rejected. Reason: ${noteText.trim()}. Funds returned to winning balance.`,
          timestamp: serverTimestamp()
        });

        alert('Request rejected. Funds returned to user.');
      }

      setShowModal(false);
      fetchWithdrawals();
    } catch (err: any) {
      console.error(err);
      alert('Action failed: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };


  return (
    <div className="admin-withdrawals-view">
      <h2 className="mb-4">Withdrawal Requests</h2>

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
                  <th>Requested At</th>
                  {activeTab !== 'pending' && <th>Processed At</th>}
                  <th>Player Account</th>
                  <th>Amount</th>
                  <th>Payment Details</th>
                  {activeTab === 'completed' && <th>Admin Note</th>}
                  {activeTab === 'rejected' && <th>Rejection Reason</th>}
                  {activeTab === 'pending' && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {withdrawals.length > 0 ? (
                  withdrawals.map(w => {
                    const reqTime = new Date(w.requestTimestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
                    const procTime = w.processedAt ? new Date(w.processedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : '';
                    
                    const methodStr = w.methodDetails?.methodName || w.method || 'N/A';
                    const methodVal = w.methodDetails?.accountInfo || 'N/A';

                    return (
                      <tr key={w.id}>
                        <td className="align-middle small">{reqTime}</td>
                        {activeTab !== 'pending' && <td className="align-middle small">{procTime}</td>}
                        <td className="align-middle text-start">
                          <div className="fw-bold">{w.userName}</div>
                          <small className="text-secondary">{w.userEmail}</small>
                        </td>
                        <td className="align-middle fw-bold text-accent">₹{w.amount}</td>
                        <td className="align-middle text-start">
                          <span className="badge bg-secondary mb-1">{methodStr}</span>
                          <div className="font-monospace small text-wrap" style={{ wordBreak: 'break-word', minWidth: '150px' }}>
                            {methodVal}
                          </div>
                        </td>
                        {activeTab === 'completed' && <td className="align-middle text-secondary small text-start">{w.adminNote}</td>}
                        {activeTab === 'rejected' && <td className="align-middle text-danger small text-start">{w.rejectReason}</td>}
                        {activeTab === 'pending' && (
                          <td className="align-middle">
                            <button className="btn btn-sm btn-success me-2" onClick={() => handleOpenAction(w, 'approve')} title="Approve">
                              <i className="bi bi-check-circle"></i>
                            </button>
                            <button className="btn btn-sm btn-danger" onClick={() => handleOpenAction(w, 'reject')} title="Reject">
                              <i className="bi bi-x-circle"></i>
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={activeTab === 'pending' ? 6 : 7} className="text-center text-secondary py-3">
                      No {activeTab} withdrawals found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Action Notes Modal */}
      {showModal && selectedReq && (
        <div 
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
          style={{ zIndex: 1050, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
        >
          <div className="custom-card p-4 mx-3" style={{ width: '100%', maxWidth: '420px' }}>
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h5 className="modal-title m-0">
                {actionType === 'approve' ? 'Approve Withdrawal' : 'Reject Withdrawal'}
              </h5>
              <button className="btn-close btn-close-white" onClick={() => setShowModal(false)}></button>
            </div>

            <form onSubmit={handleProcessAction} className="text-start">
              <p className="small text-secondary">
                Amount: <strong className="text-white">₹{selectedReq.amount}</strong> to {selectedReq.userName} ({selectedReq.userEmail})
              </p>

              <div className="form-group mb-4">
                <label className="form-label">
                  {actionType === 'approve' ? 'Payment Reference Note' : 'Rejection Reason'}
                </label>
                <textarea 
                  className="form-control"
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder={actionType === 'approve' ? 'e.g. Sent via GPay (Txn ID: 94829)' : 'e.g. Invalid UPI ID / UPI ID not matching account name'}
                  style={{ minHeight: '80px' }}
                  required
                />
              </div>

              <div className="d-flex gap-2">
                <button 
                  type="button" 
                  className="btn-custom btn-custom-secondary flex-grow-1" 
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className={`btn-custom flex-grow-1 ${actionType === 'approve' ? 'btn-custom-primary' : 'btn-custom-danger'}`}
                  disabled={actionLoading}
                >
                  {actionLoading ? 'Processing...' : (actionType === 'approve' ? 'Approve' : 'Reject')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminWithdrawals;
