import React, { useEffect, useState } from 'react';
import { ref, get, set, update, runTransaction, push, serverTimestamp } from 'firebase/database';
import { db } from '../../firebase';
import { useSettings } from '../../contexts/SettingsContext';


interface Referral {
  id: string;
  referrerUid: string;
  referrerEmail: string;
  referredUid: string;
  referredEmail: string;
  status: 'pending' | 'completed' | 'rejected';
  timestamp: number;
}

const AdminReferrals: React.FC = () => {
  const { settings } = useSettings();
  const [activeTab, setActiveTab] = useState<'pending' | 'completed' | 'rejected'>('pending');
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchReferrals = async () => {
    setLoading(true);
    try {
      const snapshot = await get(ref(db, 'pendingReferrals'));
      if (snapshot.exists()) {
        const list = Object.entries(snapshot.val()).map(([id, val]: any) => ({
          id,
          ...val
        })).filter((r: any) => {
          if (activeTab === 'pending') return r.status === 'pending';
          if (activeTab === 'completed') return r.status === 'completed';
          return r.status === 'rejected';
        });

        // Sort newest first
        list.sort((a, b) => b.timestamp - a.timestamp);
        setReferrals(list);
      } else {
        setReferrals([]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReferrals();
  }, [activeTab]);

  // Approve Referral Credit Payout
  const handleApproveReferral = async (refItem: Referral) => {
    const bonus = settings.referralBonus ?? 5;
    if (!confirm(`Are you sure you want to approve this referral? This will credit a reward of ₹${bonus} to the referrer (${refItem.referrerEmail}).`)) return;

    setActionLoading(true);

    try {
      // Transaction to credit referrer
      const referrerRef = ref(db, `users/${refItem.referrerUid}`);
      await runTransaction(referrerRef, (prof) => {
        if (prof) {
          prof.balance = (prof.balance || 0) + bonus;
          prof.bonusCash = (prof.bonusCash || 0) + bonus;
          prof.referralEarnings = (prof.referralEarnings || 0) + bonus;
          prof.totalEarnings = (prof.totalEarnings || 0) + bonus;
          return prof;
        }
        return prof;
      });

      // Update status
      const updates: any = {};
      updates[`pendingReferrals/${refItem.id}/status`] = 'completed';
      updates[`pendingReferrals/${refItem.id}/processedAt`] = serverTimestamp();
      await update(ref(db), updates);

      // Create transaction log
      const txKey = push(ref(db, `transactions/${refItem.referrerUid}`)).key;
      await set(ref(db, `transactions/${refItem.referrerUid}/${txKey}`), {
        type: 'referral_bonus',
        amount: bonus,
        description: `Referral Bonus for inviting: ${refItem.referredEmail}`,
        timestamp: serverTimestamp(),
        balanceAfter: (await get(ref(db, `users/${refItem.referrerUid}/balance`))).val()
      });

      // Send Notification to referrer
      const notifKey = push(ref(db, `users/${refItem.referrerUid}/notifications`)).key;
      await set(ref(db, `users/${refItem.referrerUid}/notifications/${notifKey}`), {
        title: 'Referral Bonus Credited',
        message: `Congratulations! Your referral link registration for '${refItem.referredEmail}' has been approved. ₹${bonus.toFixed(2)} credited to bonus wallet.`,
        timestamp: serverTimestamp()
      });

      alert('Referral bonus approved and credited successfully.');
      fetchReferrals();
    } catch (err: any) {
      console.error(err);
      alert('Referral approval failed: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Reject Referral Linkage
  const handleRejectReferral = async (refItem: Referral) => {
    if (!confirm('Are you sure you want to reject this referral request? No bonus will be paid.')) return;
    setActionLoading(true);

    try {
      const updates: any = {};
      updates[`pendingReferrals/${refItem.id}/status`] = 'rejected';
      updates[`pendingReferrals/${refItem.id}/processedAt`] = serverTimestamp();
      await update(ref(db), updates);

      alert('Referral request rejected.');
      fetchReferrals();
    } catch (err: any) {
      console.error(err);
      alert('Action failed: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="admin-referrals-view">
      <h2 className="mb-4">Referral Audits</h2>

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
                  <th>Date Linked</th>
                  <th>Inviter (Referrer) Email</th>
                  <th>Invited Player Email</th>
                  <th>Bonus Amount</th>
                  {activeTab === 'pending' && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {referrals.length > 0 ? (
                  referrals.map(r => {
                    const dateStr = new Date(r.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
                    return (
                      <tr key={r.id}>
                        <td className="align-middle small">{dateStr}</td>
                        <td className="align-middle text-start">{r.referrerEmail}</td>
                        <td className="align-middle text-start">{r.referredEmail}</td>
                        <td className="align-middle fw-bold text-accent">₹{settings.referralBonus ?? 5}</td>
                        {activeTab === 'pending' && (
                          <td className="align-middle">
                            <button 
                              className="btn btn-sm btn-success me-2" 
                              onClick={() => handleApproveReferral(r)}
                              disabled={actionLoading}
                              title="Approve Bonus"
                            >
                              <i className="bi bi-check-circle"></i>
                            </button>
                            <button 
                              className="btn btn-sm btn-danger" 
                              onClick={() => handleRejectReferral(r)}
                              disabled={actionLoading}
                              title="Reject Linkage"
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
                    <td colSpan={activeTab === 'pending' ? 5 : 4} className="text-center text-secondary py-3">
                      No {activeTab} referrals found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminReferrals;
