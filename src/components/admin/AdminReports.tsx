import React, { useEffect, useState } from 'react';
import { ref, get, update, push, serverTimestamp } from 'firebase/database';
import { db } from '../../firebase';

interface ReportDetail {
  reporterName: string;
  reporterUid: string;
  reportType: string;
  description: string;
  imageUrl?: string;
}

interface AccusedPlayer {
  uid: string;
  accusedPlayerName: string;
  status: 'pending' | 'resolved';
  replySent?: boolean;
  reports: ReportDetail[];
}

interface TournamentReportGroup {
  tournamentId: string;
  tournamentName: string;
  accusedList: AccusedPlayer[];
  totalReportCount: number;
  status: 'pending' | 'resolved';
}

const AdminReports: React.FC = () => {
  const [reportGroups, setReportGroups] = useState<TournamentReportGroup[]>([]);
  const [filterStatus, setFilterStatus] = useState<'pending' | 'resolved'>('pending');
  const [loading, setLoading] = useState(true);
  
  // Detail selection view
  const [selectedGroup, setSelectedGroup] = useState<TournamentReportGroup | null>(null);
  
  // Reply and Action states
  const [replyType, setReplyType] = useState<Record<string, 'banned' | 'insufficient'>>({});
  const [submittingReply, setSubmittingReply] = useState<Record<string, boolean>>({});
  const [refunding, setRefunding] = useState(false);
  const [resolvingUid, setResolvingUid] = useState<string | null>(null);

  // Lightbox Modal for screenshots
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const snap = await get(ref(db, 'reports'));
      if (!snap.exists()) {
        setReportGroups([]);
        setLoading(false);
        return;
      }

      const rawReports = snap.val();
      const tournamentIds = Object.keys(rawReports);

      // Fetch tournament names
      const namesMap: Record<string, string> = {};
      const tPromises = tournamentIds.map(id => get(ref(db, `tournaments/${id}`)));
      const tSnaps = await Promise.all(tPromises);
      tSnaps.forEach(s => {
        if (s.exists()) {
          namesMap[s.key!] = s.val().name || 'Unknown Match';
        }
      });

      const groups: TournamentReportGroup[] = [];

      for (const tournamentId of tournamentIds) {
        const accusedMap = rawReports[tournamentId];
        const accusedList: AccusedPlayer[] = [];
        let totalCount = 0;
        let groupResolved = true;

        for (const accusedUid in accusedMap) {
          const val = accusedMap[accusedUid];
          const reports = Object.values(val.reports || {}) as ReportDetail[];
          totalCount += reports.length;

          if (val.status !== 'resolved') {
            groupResolved = false;
          }

          accusedList.push({
            uid: accusedUid,
            accusedPlayerName: val.accusedPlayerName || 'Player',
            status: val.status || 'pending',
            replySent: val.replySent || false,
            reports
          });
        }

        groups.push({
          tournamentId,
          tournamentName: namesMap[tournamentId] || tournamentId,
          accusedList,
          totalReportCount: totalCount,
          status: groupResolved ? 'resolved' : 'pending'
        });
      }

      setReportGroups(groups);
    } catch (err) {
      console.error('Error fetching reports:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const handleSendReply = async (accused: AccusedPlayer) => {
    if (!selectedGroup) return;
    const type = replyType[accused.uid] || 'banned';
    
    setSubmittingReply(prev => ({ ...prev, [accused.uid]: true }));
    try {
      const updates: any = {};
      let notifTitle = '';
      let notifMsg = '';

      for (const r of accused.reports) {
        if (type === 'banned') {
          notifTitle = "Dispute Resolved: Cheater Banned";
          notifMsg = `Dear ${r.reporterName}, the player ${accused.accusedPlayerName} (${accused.uid}) you reported has been Banned. The match entry fees may be refunded within 24 hours.`;
        } else {
          notifTitle = "Dispute Resolved: Insufficient Evidence";
          notifMsg = `Dear ${r.reporterName}, your report against ${accused.accusedPlayerName} has been dismissed due to insufficient evidence.`;
        }

        const newNotifKey = push(ref(db, `users/${r.reporterUid}/notifications`)).key;
        updates[`users/${r.reporterUid}/notifications/${newNotifKey}`] = {
          title: notifTitle,
          message: notifMsg,
          timestamp: serverTimestamp()
        };
      }

      // Mark reply as sent
      updates[`reports/${selectedGroup.tournamentId}/${accused.uid}/replySent`] = true;

      await update(ref(db), updates);
      alert('Replies dispatched to all reporters.');
      
      // Update local state
      accused.replySent = true;
      setReportGroups([...reportGroups]);
    } catch (err: any) {
      alert('Failed to send reply: ' + err.message);
    } finally {
      setSubmittingReply(prev => ({ ...prev, [accused.uid]: false }));
    }
  };

  const handleResolveDirect = async (accusedUid: string) => {
    if (!selectedGroup) return;
    if (!confirm('Mark this dispute resolved without making refunds?')) return;

    setResolvingUid(accusedUid);
    try {
      await update(ref(db, `reports/${selectedGroup.tournamentId}/${accusedUid}`), {
        status: 'resolved'
      });
      alert('Report marked as resolved.');
      fetchReports();
      setSelectedGroup(null);
    } catch (err: any) {
      alert('Resolve failed: ' + err.message);
    } finally {
      setResolvingUid(null);
    }
  };

  const handleRefundMatch = async (accusedUid: string) => {
    if (!selectedGroup) return;
    if (!confirm('Are you sure you want to refund entry fees to all players in this match and deduct winner payouts? This action is irreversible.')) return;

    setRefunding(true);
    try {
      // 1. Fetch tournament details
      const tSnap = await get(ref(db, `tournaments/${selectedGroup.tournamentId}`));
      if (!tSnap.exists()) throw new Error('Tournament details not found.');
      
      const tournament = tSnap.val();
      const entryFee = tournament.entryFee || 0;
      if (entryFee === 0) throw new Error('Cannot refund for a free match (Entry Fee is ₹0).');

      const registeredPlayers = Object.keys(tournament.registeredPlayers || {});
      const fullResults = tournament.fullResults || [];

      if (registeredPlayers.length === 0) throw new Error('No registered players found.');

      // 2. Fetch current wallet data of all players
      const userPromises = registeredPlayers.map(uid => get(ref(db, `users/${uid}`)));
      const userSnaps = await Promise.all(userPromises);
      const allUsersData: Record<string, any> = {};
      userSnaps.forEach(snap => {
        if (snap.exists()) allUsersData[snap.key!] = snap.val();
      });

      const updates: Record<string, any> = {};

      // 3. Refund Entry Fees (except the accused player)
      for (const uid of registeredPlayers) {
        const userProfile = allUsersData[uid];
        if (!userProfile || uid === accusedUid) continue; // Skip accused

        const newBal = (userProfile.balance || 0) + entryFee;
        updates[`users/${uid}/balance`] = newBal;

        // Tx Log
        const txKey = push(ref(db, `transactions/${uid}`)).key;
        updates[`transactions/${uid}/${txKey}`] = {
          type: 'refund',
          amount: entryFee,
          description: `Refund: ${tournament.name || 'Match'}`,
          timestamp: serverTimestamp(),
          balanceAfter: newBal
        };

        // Notification
        const notifKey = push(ref(db, `users/${uid}/notifications`)).key;
        updates[`users/${uid}/notifications/${notifKey}`] = {
          title: "Match Refunded",
          message: `Entry fee of ₹${entryFee} refunded for '${tournament.name || 'Match'}' due to a fair play violation.`,
          timestamp: serverTimestamp()
        };
      }

      // 4. Deduct Winnings from Result payouts (Winnings Normalize)
      for (const res of fullResults) {
        const userProfile = allUsersData[res.uid];
        if (!userProfile || res.winnings <= 0) continue;

        const currentBal = updates[`users/${res.uid}/balance`] ?? userProfile.balance;
        const currentWin = userProfile.winningCash || 0;

        const newBal = currentBal - res.winnings;
        const newWin = Math.max(0, currentWin - res.winnings);

        updates[`users/${res.uid}/balance`] = newBal;
        updates[`users/${res.uid}/winningCash`] = newWin;

        const txKey = push(ref(db, `transactions/${res.uid}`)).key;
        updates[`transactions/${res.uid}/${txKey}`] = {
          type: 'winnings_deducted',
          amount: -res.winnings,
          description: `Winnings Deducted: ${tournament.name || 'Match'}`,
          timestamp: serverTimestamp(),
          balanceAfter: newBal
        };
      }

      // 5. Mark report status as resolved
      updates[`reports/${selectedGroup.tournamentId}/${accusedUid}/status`] = 'resolved';

      // 6. Push all updates atomically
      await update(ref(db), updates);

      alert('Refund and winnings rollback completed successfully.');
      fetchReports();
      setSelectedGroup(null);
    } catch (err: any) {
      alert('Refund failed: ' + err.message);
    } finally {
      setRefunding(false);
    }
  };

  const filteredGroups = reportGroups.filter(g => g.status === filterStatus);

  return (
    <div className="admin-reports-view text-start">
      {/* Detail View */}
      {selectedGroup ? (
        <div>
          <div className="d-flex align-items-center gap-2 mb-4">
            <button className="btn btn-outline-secondary btn-sm" onClick={() => setSelectedGroup(null)}>
              <i className="bi bi-arrow-left"></i> Back to List
            </button>
            <h3 className="m-0 text-white">Dispute Details: {selectedGroup.tournamentName}</h3>
          </div>

          {selectedGroup.accusedList.map(accused => {
            const isResolved = accused.status === 'resolved';
            return (
              <div key={accused.uid} className="card custom-card p-4 mb-4">
                <div className="d-flex justify-content-between align-items-start border-bottom border-secondary border-opacity-25 pb-3 mb-3">
                  <div>
                    <h5 className="text-white m-0">Accused: {accused.accusedPlayerName}</h5>
                    <small className="text-secondary font-monospace">UID: {accused.uid}</small>
                  </div>
                  <span className={`badge text-bg-${isResolved ? 'success' : 'warning'} text-uppercase`}>
                    {accused.status}
                  </span>
                </div>

                {/* Reports details list */}
                <div className="mb-4">
                  <h6 className="text-accent mb-3">Filed Complaints ({accused.reports.length})</h6>
                  <div className="list-group">
                    {accused.reports.map((r, i) => (
                      <div key={i} className="list-group-item bg-dark border-secondary text-white py-3">
                        <div className="d-flex justify-content-between align-items-start mb-2">
                          <strong className="text-warning">Filed by: {r.reporterName}</strong>
                          <span className="badge bg-secondary">{r.reportType}</span>
                        </div>
                        <p className="mb-2 text-secondary">{r.description || 'No description provided.'}</p>
                        {r.imageUrl && (
                          <div>
                            <span className="text-secondary small d-block mb-1">Attached Evidence:</span>
                            <img 
                              src={r.imageUrl} 
                              alt="Evidence" 
                              className="img-thumbnail bg-transparent border-secondary"
                              style={{ maxHeight: '80px', cursor: 'pointer' }}
                              onClick={() => setLightboxUrl(r.imageUrl!)}
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Admin Actions */}
                {!isResolved && (
                  <div className="bg-black bg-opacity-20 p-3 rounded border border-secondary border-opacity-20 text-start">
                    <h6 className="text-danger mb-3"><i className="bi bi-shield-slash-fill me-2"></i>Admin Resolution Center</h6>
                    
                    <div className="row g-3 align-items-end">
                      <div className="col-md-5">
                        <label className="form-label small text-secondary">Dispatch Reply Message Template</label>
                        <select 
                          className="form-select form-select-sm bg-dark text-white border-secondary"
                          value={replyType[accused.uid] || 'banned'}
                          onChange={(e: any) => setReplyType(prev => ({ ...prev, [accused.uid]: e.target.value }))}
                          disabled={accused.replySent}
                        >
                          <option value="banned">Cheating Confirmed (Banned &amp; Refund pending)</option>
                          <option value="insufficient">Insufficient Evidence (Case dismissed)</option>
                        </select>
                      </div>

                      <div className="col-md-3">
                        <button 
                          className="btn btn-primary btn-sm w-100"
                          onClick={() => handleSendReply(accused)}
                          disabled={accused.replySent || submittingReply[accused.uid]}
                        >
                          {submittingReply[accused.uid] ? 'Sending...' : accused.replySent ? 'Replies Sent' : 'Send Replies'}
                        </button>
                      </div>

                      <div className="col-md-2">
                        <button 
                          className="btn btn-secondary btn-sm w-100"
                          onClick={() => handleResolveDirect(accused.uid)}
                          disabled={resolvingUid === accused.uid}
                        >
                          {resolvingUid === accused.uid ? 'Resolving...' : 'Resolve Case'}
                        </button>
                      </div>

                      <div className="col-md-2">
                        <button 
                          className="btn btn-danger btn-sm w-100"
                          onClick={() => handleRefundMatch(accused.uid)}
                          disabled={refunding}
                        >
                          {refunding ? 'Refunds processing...' : 'Refund Match'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* List View */
        <div>
          <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
            <h2>Player Disputes &amp; Reports</h2>
            
            <select 
              className="form-select form-select-sm bg-dark text-white border-secondary"
              style={{ width: '150px' }}
              value={filterStatus}
              onChange={(e: any) => setFilterStatus(e.target.value)}
            >
              <option value="pending">Pending Cases</option>
              <option value="resolved">Resolved Cases</option>
            </select>
          </div>

          {loading ? (
            <div className="placeholder-glow py-5 rounded-3" style={{ height: '300px' }}></div>
          ) : filteredGroups.length === 0 ? (
            <div className="card custom-card text-center py-5 text-secondary">
              <i className="bi bi-shield-check fs-1 d-block mb-2 text-success"></i>
              No {filterStatus} disputes found. Clean records!
            </div>
          ) : (
            <div className="card custom-card">
              <div className="table-responsive">
                <table className="table table-dark table-hover mb-0">
                  <thead>
                    <tr>
                      <th>Match Name</th>
                      <th className="text-center">Active Complaints</th>
                      <th>Group Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredGroups.map(g => (
                      <tr key={g.tournamentId}>
                        <td className="align-middle fw-bold text-start">{g.tournamentName}</td>
                        <td className="align-middle text-center fw-bold text-warning">{g.totalReportCount} Reports</td>
                        <td className="align-middle">
                          <span className={`badge text-bg-${g.status === 'resolved' ? 'success' : 'warning'} text-uppercase`}>
                            {g.status}
                          </span>
                        </td>
                        <td className="align-middle">
                          <button className="btn btn-sm btn-info" onClick={() => setSelectedGroup(g)}>
                            <i className="bi bi-search"></i> Inspect Details
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Lightbox Backdrop Overlay */}
      {lightboxUrl && (
        <div 
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
          style={{ zIndex: 2000, background: 'rgba(0,0,0,0.9)', cursor: 'zoom-out' }}
          onClick={() => setLightboxUrl(null)}
        >
          <img 
            src={lightboxUrl} 
            alt="Evidence Fullscreen" 
            className="img-fluid" 
            style={{ maxHeight: '95vh', maxWidth: '95vw', objectFit: 'contain' }}
          />
        </div>
      )}
    </div>
  );
};

export default AdminReports;
