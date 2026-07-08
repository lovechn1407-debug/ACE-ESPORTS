import React, { useEffect, useState } from 'react';
import { ref, get, update } from 'firebase/database';
import { db } from '../../firebase';

interface UserItem {
  uid: string;
  displayName: string;
  email: string;
  leaderboardRank?: number;
  leaderboardDisplayEarnings?: number;
}

const AdminLeaderboard: React.FC = () => {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const snapshot = await get(ref(db, 'users'));
      if (snapshot.exists()) {
        const list = Object.entries(snapshot.val()).map(([uid, val]: any) => ({
          uid,
          displayName: val.displayName || 'Player',
          email: val.email || 'N/A',
          leaderboardRank: val.leaderboardRank,
          leaderboardDisplayEarnings: val.leaderboardDisplayEarnings
        }));
        // Sort alphabetically by name
        list.sort((a, b) => a.displayName.localeCompare(b.displayName));
        setUsers(list);
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

  const handleFieldChange = (uid: string, field: 'leaderboardRank' | 'leaderboardDisplayEarnings', value: string) => {
    setUsers(prev => prev.map(u => {
      if (u.uid === uid) {
        const parsed = value === '' ? undefined : parseFloat(value);
        return {
          ...u,
          [field]: parsed
        };
      }
      return u;
    }));
  };

  const handleSave = async () => {
    if (!confirm('Are you sure you want to save all leaderboard rank modifications?')) return;
    setSaving(true);
    const updates: any = {};

    users.forEach(u => {
      updates[`users/${u.uid}/leaderboardRank`] = u.leaderboardRank != null && u.leaderboardRank > 0 ? u.leaderboardRank : null;
      updates[`users/${u.uid}/leaderboardDisplayEarnings`] = u.leaderboardDisplayEarnings != null && u.leaderboardDisplayEarnings >= 0 ? u.leaderboardDisplayEarnings : null;
    });

    try {
      await update(ref(db), updates);
      alert('Leaderboard data updated successfully!');
      fetchUsers();
    } catch (err: any) {
      alert('Failed to save settings: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const filtered = users.filter(u => 
    u.displayName.toLowerCase().includes(search.toLowerCase()) || 
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="admin-leaderboard-view">
      <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
        <h2>Leaderboard Management</h2>
        <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving Changes...' : 'Save Rankings'}
        </button>
      </div>

      <div className="card custom-card p-3 mb-4">
        <div className="form-group mb-0">
          <input 
            type="text" 
            className="form-control"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search players by name or email..."
          />
        </div>
      </div>

      {loading ? (
        <div className="placeholder-glow py-5 rounded-3" style={{ height: '300px' }}></div>
      ) : (
        <div className="card custom-card">
          <div className="table-responsive">
            <table className="table table-dark table-hover mb-0">
              <thead>
                <tr>
                  <th>Player Account</th>
                  <th>Leaderboard Rank (#)</th>
                  <th>Display Earnings (₹)</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length > 0 ? (
                  filtered.map(u => (
                    <tr key={u.uid}>
                      <td className="align-middle text-start">
                        <div className="fw-bold">{u.displayName}</div>
                        <small className="text-secondary">{u.email}</small>
                      </td>
                      <td className="align-middle">
                        <input 
                          type="number" 
                          className="form-control form-control-sm"
                          style={{ width: '120px' }}
                          value={u.leaderboardRank ?? ''}
                          onChange={(e) => handleFieldChange(u.uid, 'leaderboardRank', e.target.value)}
                          placeholder="e.g. 1"
                          min="1"
                        />
                      </td>
                      <td className="align-middle">
                        <input 
                          type="number" 
                          className="form-control form-control-sm"
                          style={{ width: '160px' }}
                          value={u.leaderboardDisplayEarnings ?? ''}
                          onChange={(e) => handleFieldChange(u.uid, 'leaderboardDisplayEarnings', e.target.value)}
                          placeholder="e.g. 5000"
                          min="0"
                        />
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} className="text-center text-secondary py-3">No users found.</td>
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

export default AdminLeaderboard;
