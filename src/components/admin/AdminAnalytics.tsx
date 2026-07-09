import React, { useEffect, useState } from 'react';
import { ref, get, query, orderByChild, equalTo } from 'firebase/database';
import { db } from '../../firebase';

interface SpenderItem {
  uid: string;
  name: string;
  email: string;
  totalDeposit: number;
}

interface ActiveItem {
  uid: string;
  name: string;
  email: string;
  matchCount: number;
}

interface InactiveItem {
  uid: string;
  name: string;
  email: string;
  lastLogin?: number;
}

const AdminAnalytics: React.FC = () => {
  const [spenders, setSpenders] = useState<SpenderItem[]>([]);
  const [activePlayers, setActivePlayers] = useState<ActiveItem[]>([]);
  const [inactiveUsers, setInactiveUsers] = useState<InactiveItem[]>([]);
  
  const [loading, setLoading] = useState(true);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      // 1. Fetch all users
      const usersSnap = await get(ref(db, 'users'));
      const usersData = usersSnap.exists() ? usersSnap.val() : {};

      // Helper to get name/email
      const getUserMeta = (uid: string) => {
        const u = usersData[uid];
        return {
          name: u?.displayName || 'Player',
          email: u?.email || 'N/A'
        };
      };

      // 2. Fetch completed deposits for Top Spenders
      const depositsSnap = await get(ref(db, 'deposits'));
      const spendersMap: Record<string, number> = {};
      if (depositsSnap.exists()) {
        Object.values(depositsSnap.val()).forEach((d: any) => {
          if (d && d.status === 'completed' && d.userId && d.amount) {
            spendersMap[d.userId] = (spendersMap[d.userId] || 0) + d.amount;
          }
        });
      }
      const sortedSpenders = Object.entries(spendersMap)
        .map(([uid, totalDeposit]) => {
          const meta = getUserMeta(uid);
          return { uid, ...meta, totalDeposit };
        })
        .sort((a, b) => b.totalDeposit - a.totalDeposit)
        .slice(0, 10);
      setSpenders(sortedSpenders);

      // 3. Fetch tournaments to determine Most Active Players
      const tournamentsSnap = await get(ref(db, 'tournaments'));
      const activeMap: Record<string, number> = {};
      if (tournamentsSnap.exists()) {
        tournamentsSnap.forEach(child => {
          const t = child.val();
          const regs = t.registeredPlayers;
          if (regs) {
            Object.keys(regs).forEach(uid => {
              activeMap[uid] = (activeMap[uid] || 0) + 1;
            });
          }
        });
      }
      const sortedActive = Object.entries(activeMap)
        .map(([uid, matchCount]) => {
          const meta = getUserMeta(uid);
          return { uid, ...meta, matchCount };
        })
        .sort((a, b) => b.matchCount - a.matchCount)
        .slice(0, 10);
      setActivePlayers(sortedActive);

      // 4. Determine Inactive Users (lastLogin older than 15 days or missing)
      const fifteenDaysAgo = Date.now() - 15 * 24 * 60 * 60 * 1000;
      const inactiveList: InactiveItem[] = [];
      Object.entries(usersData).forEach(([uid, u]: any) => {
        if (!u.lastLogin || u.lastLogin < fifteenDaysAgo) {
          inactiveList.push({
            uid,
            name: u.displayName || 'Player',
            email: u.email || 'N/A',
            lastLogin: u.lastLogin
          });
        }
      });
      // Sort: never logged in first, then oldest logins
      inactiveList.sort((a, b) => (a.lastLogin || 0) - (b.lastLogin || 0));
      setInactiveUsers(inactiveList.slice(0, 15)); // Show top 15 inactive players

    } catch (err) {
      console.error('Error computing analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  return (
    <div className="admin-analytics-view text-start">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>Performance &amp; User Analytics</h2>
        <button className="btn btn-outline-warning btn-sm" onClick={fetchAnalytics} disabled={loading}>
          <i className="bi bi-arrow-clockwise me-1"></i> Refresh Data
        </button>
      </div>

      {loading ? (
        <div className="placeholder-glow py-5 rounded-3" style={{ height: '400px' }}></div>
      ) : (
        <div className="row g-4">
          {/* Top Spenders Card */}
          <div className="col-md-6 col-lg-4">
            <div className="card custom-card h-100 p-4">
              <div className="d-flex align-items-center justify-content-between mb-3 border-bottom border-secondary border-opacity-25 pb-2">
                <h5 className="m-0 text-white">Top Deposit Spenders</h5>
                <i className="bi bi-wallet2 text-success fs-5"></i>
              </div>
              {spenders.length === 0 ? (
                <div className="text-secondary text-center py-4 small">No deposit logs found.</div>
              ) : (
                <div className="table-responsive">
                  <table className="table table-dark table-striped table-sm mb-0 small">
                    <thead>
                      <tr>
                        <th>Player Name</th>
                        <th className="text-end">Deposits</th>
                      </tr>
                    </thead>
                    <tbody>
                      {spenders.map(s => (
                        <tr key={s.uid}>
                          <td className="text-truncate" style={{ maxWidth: '140px' }} title={s.name}>
                            <div className="fw-bold">{s.name}</div>
                            <small className="text-secondary">{s.email}</small>
                          </td>
                          <td className="text-end align-middle fw-bold text-success">₹{s.totalDeposit.toLocaleString('en-IN')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Most Active Players Card */}
          <div className="col-md-6 col-lg-4">
            <div className="card custom-card h-100 p-4">
              <div className="d-flex align-items-center justify-content-between mb-3 border-bottom border-secondary border-opacity-25 pb-2">
                <h5 className="m-0 text-white">Most Active Players</h5>
                <i className="bi bi-activity text-warning fs-5"></i>
              </div>
              {activePlayers.length === 0 ? (
                <div className="text-secondary text-center py-4 small">No tournament activities recorded.</div>
              ) : (
                <div className="table-responsive">
                  <table className="table table-dark table-striped table-sm mb-0 small">
                    <thead>
                      <tr>
                        <th>Player Name</th>
                        <th className="text-end">Matches Joined</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activePlayers.map(p => (
                        <tr key={p.uid}>
                          <td className="text-truncate" style={{ maxWidth: '140px' }} title={p.name}>
                            <div className="fw-bold">{p.name}</div>
                            <small className="text-secondary">{p.email}</small>
                          </td>
                          <td className="text-end align-middle fw-bold text-warning">{p.matchCount} Matches</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Inactive Players Card */}
          <div className="col-md-12 col-lg-4">
            <div className="card custom-card h-100 p-4">
              <div className="d-flex align-items-center justify-content-between mb-3 border-bottom border-secondary border-opacity-25 pb-2">
                <h5 className="m-0 text-white">Inactive Players (15d+)</h5>
                <i className="bi bi-clock-history text-danger fs-5"></i>
              </div>
              {inactiveUsers.length === 0 ? (
                <div className="text-secondary text-center py-4 small">All users are active.</div>
              ) : (
                <div className="table-responsive" style={{ maxHeight: '350px', overflowY: 'auto' }}>
                  <table className="table table-dark table-striped table-sm mb-0 small">
                    <thead>
                      <tr>
                        <th>Player Details</th>
                        <th className="text-end">Last Online</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inactiveUsers.map(u => (
                        <tr key={u.uid}>
                          <td>
                            <div className="fw-bold">{u.name}</div>
                            <small className="text-secondary">{u.email}</small>
                          </td>
                          <td className="text-end align-middle text-secondary">
                            {u.lastLogin ? new Date(u.lastLogin).toLocaleDateString() : 'Never'}
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
      )}
    </div>
  );
};

export default AdminAnalytics;
