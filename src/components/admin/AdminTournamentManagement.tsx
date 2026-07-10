import React, { useEffect, useState } from 'react';
import { ref, get, update, push, serverTimestamp } from 'firebase/database';
import { db } from '../../firebase';


interface Tournament {
  id: string;
  name: string;
  status: string;
  perKillPrize: number;
  entryFee: number;
  winningsCredited?: boolean;
  prizeDistribution?: Record<string, number>;
  registeredPlayers?: Record<string, any>;
  fullResults?: any[];
}

interface PlayerRow {
  uid: string;
  displayName: string;
  username: string;
  gameUid: string;
  photoURL?: string;
  balance: number;
  winningCash: number;
  totalEarnings: number;
  totalMatches: number;
  wonMatches: number;
  kills: number; // calculated total team kills
  leaderKills: number;
  teammateUsername?: string;
  teammateGameUid?: string;
  teammateKills: number;
  teammate2Username?: string;
  teammate2GameUid?: string;
  teammate2Kills: number;
  teammate3Username?: string;
  teammate3GameUid?: string;
  teammate3Kills: number;
  extraAmount: number;
  rank: string; // string to allow empty input
}

const AdminTournamentManagement: React.FC = () => {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [selectedTourney, setSelectedTourney] = useState<Tournament | null>(null);
  
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'danger' | 'info' } | null>(null);

  useEffect(() => {
    const fetchTourneys = async () => {
      try {
        const snapshot = await get(ref(db, 'tournaments'));
        if (snapshot.exists()) {
          const list = Object.entries(snapshot.val()).map(([id, val]: any) => ({
            id,
            ...val
          })).filter((t: any) => ['ongoing', 'completed', 'result'].includes(t.status));
          
          // Sort start time descending
          list.sort((a, b) => b.startTime - a.startTime);
          setTournaments(list);
        }
      } catch (err) {
        console.error(err);
      }
    };
    fetchTourneys();
  }, []);

  const handleSelectTournament = async (id: string) => {
    setSelectedId(id);
    setPlayers([]);
    setSelectedTourney(null);
    setMsg(null);

    if (!id) return;

    setLoading(true);
    try {
      const tSnap = await get(ref(db, `tournaments/${id}`));
      if (!tSnap.exists()) throw new Error('Tournament not found.');
      const t = { id, ...tSnap.val() } as Tournament;
      setSelectedTourney(t);

      const registered = t.registeredPlayers || {};
      const uids = Object.keys(registered);
      
      if (uids.length === 0) {
        setLoading(false);
        return;
      }

      // Check results map if winnings already saved/credited
      const resultsMap: Record<string, any> = {};
      (t.fullResults || []).forEach(res => {
        resultsMap[res.uid] = res;
      });

      const promises = uids.map(uid => get(ref(db, `users/${uid}`)));
      const snaps = await Promise.all(promises);

      const playerRows: PlayerRow[] = snaps.map((s, index) => {
        const uid = uids[index];
        const regData = registered[uid];
        const resData = resultsMap[uid] || {};

        const leaderKills = resData.leaderKills ?? (resData.kills ?? 0);
        const teammateKills = resData.teammateKills ?? 0;
        const teammate2Kills = resData.teammate2Kills ?? 0;
        const teammate3Kills = resData.teammate3Kills ?? 0;
        const totalKills = leaderKills + 
          (regData.teammateUsername ? teammateKills : 0) + 
          (regData.teammate2Username ? teammate2Kills : 0) + 
          (regData.teammate3Username ? teammate3Kills : 0);

        if (s.exists()) {
          const u = s.val();
          return {
            uid,
            displayName: u.displayName || 'Player',
            photoURL: u.photoURL,
            username: regData.username || 'N/A',
            gameUid: regData.gameUid || 'N/A',
            balance: u.balance || 0,
            winningCash: u.winningCash || 0,
            totalEarnings: u.totalEarnings || 0,
            totalMatches: u.totalMatches || 0,
            wonMatches: u.wonMatches || 0,
            kills: totalKills,
            leaderKills,
            teammateUsername: regData.teammateUsername,
            teammateGameUid: regData.teammateGameUid,
            teammateKills,
            teammate2Username: regData.teammate2Username,
            teammate2GameUid: regData.teammate2GameUid,
            teammate2Kills,
            teammate3Username: regData.teammate3Username,
            teammate3GameUid: regData.teammate3GameUid,
            teammate3Kills,
            extraAmount: resData.extraAmount ?? 0,
            rank: resData.rank != null ? String(resData.rank) : ''
          };
        }

        return {
          uid,
          displayName: 'Deleted User',
          username: regData.username || 'N/A',
          gameUid: regData.gameUid || 'N/A',
          balance: 0,
          winningCash: 0,
          totalEarnings: 0,
          totalMatches: 0,
          wonMatches: 0,
          kills: totalKills,
          leaderKills,
          teammateUsername: regData.teammateUsername,
          teammateGameUid: regData.teammateGameUid,
          teammateKills,
          teammate2Username: regData.teammate2Username,
          teammate2GameUid: regData.teammate2GameUid,
          teammate2Kills,
          teammate3Username: regData.teammate3Username,
          teammate3GameUid: regData.teammate3GameUid,
          teammate3Kills,
          extraAmount: 0,
          rank: ''
        };
      });

      setPlayers(playerRows);
      
      if (t.winningsCredited) {
        setMsg({ text: 'Winnings have been credited for this match. Editing is locked.', type: 'info' });
      } else if (t.status === 'refunded' || t.status === 'cancelled') {
        setMsg({ text: `This match is ${t.status}. Actions locked.`, type: 'info' });
      }
    } catch (err: any) {
      console.error(err);
      setMsg({ text: err.message || 'Failed to load players.', type: 'danger' });
    } finally {
      setLoading(false);
    }
  };

  const updatePlayerField = (uid: string, field: 'kills' | 'leaderKills' | 'teammateKills' | 'teammate2Kills' | 'teammate3Kills' | 'extraAmount' | 'rank', val: any) => {
    setPlayers(prev => prev.map(p => {
      if (p.uid === uid) {
        const next = { ...p, [field]: val };
        // Recalculate total kills if any component changes
        const lKills = Number(next.leaderKills) || 0;
        const tm1Kills = next.teammateUsername ? (Number(next.teammateKills) || 0) : 0;
        const tm2Kills = next.teammate2Username ? (Number(next.teammate2Kills) || 0) : 0;
        const tm3Kills = next.teammate3Username ? (Number(next.teammate3Kills) || 0) : 0;
        next.kills = lKills + tm1Kills + tm2Kills + tm3Kills;
        return next;
      }
      return p;
    }));
  };

  const calculateRowWinnings = (p: PlayerRow): number => {
    if (!selectedTourney) return 0;
    const perKill = selectedTourney.perKillPrize || 0;
    const killsAmt = p.kills * perKill;
    
    let rankAmt = 0;
    const rankNum = parseInt(p.rank);
    const dist = selectedTourney.prizeDistribution || {};
    
    if (!isNaN(rankNum) && rankNum > 0) {
      // 1. Direct key match (e.g. "1")
      if (dist[String(rankNum)] !== undefined) {
        rankAmt = Number(dist[String(rankNum)]) || 0;
      } else {
        // 2. Range match (e.g. "1-5" or "1 to 5")
        for (const key of Object.keys(dist)) {
          const parts = key.split(/[-to]/).map(x => parseInt(x.trim()));
          if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
            const start = Math.min(parts[0], parts[1]);
            const end = Math.max(parts[0], parts[1]);
            if (rankNum >= start && rankNum <= end) {
              rankAmt = Number(dist[key]) || 0;
              break;
            }
          }
        }
      }
    }

    return killsAmt + Number(p.extraAmount || 0) + rankAmt;
  };

  // Credit Winnings
  const handleCreditWinnings = async () => {
    if (!selectedTourney || players.length === 0) return;
    if (!confirm(`Are you sure you want to credit winnings for "${selectedTourney.name}"? This action is permanent and cannot be undone.`)) return;

    setActionLoading(true);
    setMsg(null);

    const updates: any = {};
    const fullResults: any[] = [];
    let totalCredited = 0;
    let playersCount = 0;

    try {
      // Reload user data to prevent stale state issues
      const promises = players.map(p => get(ref(db, `users/${p.uid}`)));
      const snaps = await Promise.all(promises);
      const freshUserMap: Record<string, any> = {};
      snaps.forEach(s => {
        if (s.exists()) freshUserMap[s.key!] = s.val();
      });

      players.forEach(p => {
        const freshUser = freshUserMap[p.uid];
        if (!freshUser) return;

        const rankNum = parseInt(p.rank) || 0;
        const totalPrize = calculateRowWinnings(p);

        // Match history entry
        const matchHistoryData = {
          tournamentId: selectedTourney.id,
          tournamentName: selectedTourney.name,
          rank: rankNum,
          kills: p.kills,
          earnings: totalPrize,
          date: serverTimestamp()
        };
        updates[`users/${p.uid}/matchHistory/${selectedTourney.id}`] = matchHistoryData;

        // Build teammates array for results display
        const teammatesResultList: any[] = [];
        if (p.teammateUsername) {
          teammatesResultList.push({
            username: p.teammateUsername,
            gameUid: p.teammateGameUid || 'N/A',
            kills: Number(p.teammateKills) || 0
          });
        }
        if (p.teammate2Username) {
          teammatesResultList.push({
            username: p.teammate2Username,
            gameUid: p.teammate2GameUid || 'N/A',
            kills: Number(p.teammate2Kills) || 0
          });
        }
        if (p.teammate3Username) {
          teammatesResultList.push({
            username: p.teammate3Username,
            gameUid: p.teammate3GameUid || 'N/A',
            kills: Number(p.teammate3Kills) || 0
          });
        }

        // Results entry
        fullResults.push({
          uid: p.uid,
          displayName: freshUser.displayName || 'Player',
          inGameUsername: p.username,
          photoURL: freshUser.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(freshUser.displayName || 'Player')}`,
          appliedBadgeUrl: freshUser.appliedBadgeUrl || '',
          appliedBadgeEffect: freshUser.appliedBadgeEffect || '',
          appliedBadgeColor: freshUser.appliedBadgeColor || '',
          rank: rankNum,
          kills: p.kills,
          leaderKills: Number(p.leaderKills) || 0,
          teammateKills: Number(p.teammateKills) || 0,
          teammate2Kills: Number(p.teammate2Kills) || 0,
          teammate3Kills: Number(p.teammate3Kills) || 0,
          teammates: teammatesResultList,
          extraAmount: Number(p.extraAmount) || 0,
          winnings: totalPrize
        });

        // Update stats
        updates[`users/${p.uid}/totalMatches`] = (freshUser.totalMatches || 0) + 1;
        if (rankNum === 1) {
          updates[`users/${p.uid}/wonMatches`] = (freshUser.wonMatches || 0) + 1;
        }

        // Credit balance if prize > 0
        if (totalPrize > 0) {
          const newBalance = (freshUser.balance || 0) + totalPrize;
          const newWinning = (freshUser.winningCash || 0) + totalPrize;
          const newTotalEarn = (freshUser.totalEarnings || 0) + totalPrize;

          updates[`users/${p.uid}/balance`] = newBalance;
          updates[`users/${p.uid}/winningCash`] = newWinning;
          updates[`users/${p.uid}/totalEarnings`] = newTotalEarn;

          // Transaction log
          const txKey = push(ref(db, `transactions/${p.uid}`)).key;
          updates[`transactions/${p.uid}/${txKey}`] = {
            type: 'tournament_winnings',
            amount: totalPrize,
            description: `Winnings: ${p.kills} Kills + Rank ${rankNum} in ${selectedTourney.name}`,
            timestamp: serverTimestamp(),
            tournamentId: selectedTourney.id,
            balanceAfter: newBalance
          };

          totalCredited += totalPrize;
          playersCount++;
        }
      });

      updates[`tournaments/${selectedTourney.id}/winningsCredited`] = true;
      updates[`tournaments/${selectedTourney.id}/status`] = 'result';
      
      // Sort results by rank
      fullResults.sort((a, b) => (a.rank || 999) - (b.rank || 999));
      updates[`tournaments/${selectedTourney.id}/fullResults`] = fullResults;

      await update(ref(db), updates);
      alert(`Winnings credited! ₹${totalCredited.toFixed(2)} split among ${playersCount} players.`);
      
      // Reload UI
      handleSelectTournament(selectedTourney.id);
    } catch (err: any) {
      console.error(err);
      setMsg({ text: 'Crediting failed: ' + err.message, type: 'danger' });
    } finally {
      setActionLoading(false);
    }
  };

  // Refund Match
  const handleRefundMatch = async () => {
    if (!selectedTourney) return;
    if (selectedTourney.status === 'refunded' || selectedTourney.status === 'cancelled') {
      alert(`Match is already marked as ${selectedTourney.status}.`);
      return;
    }

    if (!confirm(`Are you sure you want to refund all registration fees for "${selectedTourney.name}"? This will return entry fees to players and cancel winnings. This action cannot be reversed.`)) return;

    setActionLoading(true);
    setMsg(null);

    try {
      const tRef = ref(db, `tournaments/${selectedTourney.id}`);
      const tSnap = await get(tRef);
      if (!tSnap.exists()) throw new Error('Tournament not found.');
      const tourney = tSnap.val();

      // Live DB check — prevents double-refund even if local state was stale
      if (tourney.status === 'refunded' || tourney.status === 'cancelled') {
        throw new Error(`This match has already been cancelled/refunded.`);
      }

      const registered = tourney.registeredPlayers || {};
      const regUids = Object.keys(registered);
      const results = tourney.fullResults || [];

      if (regUids.length === 0) {
        throw new Error('No players found in this match.');
      }

      // Fetch latest profile documents for both registered players AND results recipients
      const allUidsToFetch = new Set<string>([
        ...regUids,
        ...results.map((r: any) => r.uid).filter(Boolean)
      ]);
      const promises = Array.from(allUidsToFetch).map(uid => get(ref(db, `users/${uid}`)));
      const snaps = await Promise.all(promises);
      const freshUserMap: Record<string, any> = {};
      snaps.forEach(s => {
        if (s.exists()) freshUserMap[s.key!] = s.val();
      });

      const updates: any = {};

      // 1. Loop through players and credit entry fees
      regUids.forEach(uid => {
        const user = freshUserMap[uid];
        if (!user) return;

        const regData = registered[uid];
        // Refund coupon-adjusted or raw fee
        const refundAmt = regData.amountPaid ?? tourney.entryFee ?? 0;

        if (refundAmt > 0) {
          const newBalance = (user.balance || 0) + refundAmt;
          updates[`users/${uid}/balance`] = newBalance;

          const txKey = push(ref(db, `transactions/${uid}`)).key;
          updates[`transactions/${uid}/${txKey}`] = {
            type: 'refund',
            amount: refundAmt,
            description: `Refund for cancelled match: ${selectedTourney.name}`,
            timestamp: serverTimestamp(),
            balanceAfter: newBalance,
            tournamentId: selectedTourney.id
          };

          const notifKey = push(ref(db, `users/${uid}/notifications`)).key;
          updates[`users/${uid}/notifications/${notifKey}`] = {
            title: 'Match Refunded',
            message: `Match '${selectedTourney.name}' has been cancelled. Entry fee ₹${refundAmt.toFixed(2)} has been refunded to your wallet.`,
            timestamp: serverTimestamp()
          };
        }
      });

      // 2. Deduct winnings (if winnings were already credited)
      results.forEach((res: any) => {
        const user = freshUserMap[res.uid];
        if (!user || !res.winnings || res.winnings <= 0) return;

        const currentBal = updates[`users/${res.uid}/balance`] ?? user.balance;
        const currentWin = user.winningCash || 0;

        const newBalance = currentBal - res.winnings;
        const newWinning = Math.max(0, currentWin - res.winnings);

        updates[`users/${res.uid}/balance`] = newBalance;
        updates[`users/${res.uid}/winningCash`] = newWinning;

        const txKey = push(ref(db, `transactions/${res.uid}`)).key;
        updates[`transactions/${res.uid}/${txKey}`] = {
          type: 'winnings_deducted',
          amount: -res.winnings,
          description: `Winnings normalized for cancelled match: ${selectedTourney.name}`,
          timestamp: serverTimestamp(),
          balanceAfter: newBalance,
          tournamentId: selectedTourney.id
        };
      });

      // 3. Update status to refunded
      updates[`tournaments/${selectedTourney.id}/status`] = 'refunded';

      await update(ref(db), updates);
      alert('Match cancelled and refunded successfully.');
      handleSelectTournament(selectedTourney.id);
    } catch (err: any) {
      console.error(err);
      setMsg({ text: 'Refund failed: ' + err.message, type: 'danger' });
    } finally {
      setActionLoading(false);
    }
  };

  const isLocked = selectedTourney?.winningsCredited || 
    selectedTourney?.status === 'refunded' || 
    selectedTourney?.status === 'cancelled';

  return (
    <div className="admin-tourney-mgt-view">
      <h2 className="mb-4">Tournament Management</h2>

      {/* Selector Card */}
      <div className="card custom-card p-4 mb-4">
        <div className="form-group mb-0">
          <label className="form-label text-start">Select Tournament to Manage</label>
          <select 
            className="form-select"
            value={selectedId}
            onChange={(e) => handleSelectTournament(e.target.value)}
          >
            <option value="">-- Choose Match --</option>
            {tournaments.map(t => (
              <option key={t.id} value={t.id}>
                {t.name} (Status: {t.status})
              </option>
            ))}
          </select>
        </div>
      </div>

      {msg && <div className={`alert alert-${msg.type} mb-4`}>{msg.text}</div>}

      {selectedId && (
        <>
          {loading ? (
            <div className="placeholder-glow py-5 rounded-3" style={{ height: '200px' }}></div>
          ) : (
            <div className="card custom-card p-3 mb-4">
              <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
                <h5 className="m-0 text-white">Registered Players & Score Inputs</h5>
                <div className="d-flex gap-2">
                  <button 
                    className="btn btn-danger btn-sm"
                    onClick={handleRefundMatch}
                    disabled={actionLoading || selectedTourney?.status === 'refunded'}
                  >
                    <i className="bi bi-arrow-counterclockwise"></i> Refund Match
                  </button>
                  <button 
                    className="btn btn-success btn-sm"
                    onClick={handleCreditWinnings}
                    disabled={actionLoading || isLocked}
                  >
                    <i className="bi bi-check-circle-fill"></i> Credit All Winnings
                  </button>
                </div>
              </div>

              <div className="table-responsive">
                <table className="table table-dark table-hover mb-0 align-middle">
                  <thead>
                    <tr>
                      <th className="text-start">Team Member</th>
                      <th className="text-start">Game IGN & UID</th>
                      <th>Per Kill Prize</th>
                      <th>Individual Kills</th>
                      <th>Total Kills</th>
                      <th>Bonus Prize (₹)</th>
                      <th>Rank</th>
                      <th className="text-end">Calculated Prize</th>
                    </tr>
                  </thead>
                  <tbody>
                    {players.length > 0 ? (
                      players.map(p => {
                        const hasTeammates = !!(p.teammateUsername || p.teammate2Username || p.teammate3Username);
                        const rows = [];

                        // 1. Leader Row
                        rows.push(
                          <tr key={p.uid + '-leader'} style={{ borderBottom: hasTeammates ? 'none' : undefined }}>
                            <td className="text-start">
                              <div className="fw-bold text-white">{p.displayName}</div>
                              <span style={{ fontSize: '0.62rem', background: 'rgba(74,222,128,0.15)', color: '#4ADE80', padding: '1px 5px', borderRadius: '3px', fontWeight: 600 }}>
                                LEADER
                              </span>
                            </td>
                            <td className="text-start">
                              <div className="text-accent small fw-semibold">{p.username}</div>
                              <div className="text-secondary small font-monospace">{p.gameUid}</div>
                            </td>
                            <td>₹{selectedTourney?.perKillPrize || 0}</td>
                            
                            <td>
                              <input 
                                type="number" 
                                className="form-control form-control-sm text-center mx-auto" 
                                style={{ width: '70px' }}
                                value={p.leaderKills} 
                                onChange={(e) => updatePlayerField(p.uid, 'leaderKills', Math.max(0, Number(e.target.value)))}
                                disabled={isLocked}
                              />
                            </td>
                            <td className="fw-bold text-warning fs-6">
                              {p.kills}
                            </td>
                            <td>
                              <input 
                                type="number" 
                                className="form-control form-control-sm text-center mx-auto" 
                                style={{ width: '80px' }}
                                value={p.extraAmount || ''} 
                                onChange={(e) => updatePlayerField(p.uid, 'extraAmount', Math.max(0, parseFloat(e.target.value) || 0))}
                                disabled={isLocked}
                              />
                            </td>
                            <td>
                              <input 
                                type="number" 
                                className="form-control form-control-sm text-center mx-auto" 
                                style={{ width: '70px' }}
                                value={p.rank} 
                                onChange={(e) => updatePlayerField(p.uid, 'rank', e.target.value)}
                                placeholder="Rank"
                                disabled={isLocked}
                              />
                            </td>
                            <td className="text-end text-accent fw-bold fs-5">
                              ₹{calculateRowWinnings(p).toFixed(2)}
                            </td>
                          </tr>
                        );

                        // 2. Teammate Rows
                        if (p.teammateUsername) {
                          rows.push(
                            <tr key={p.uid + '-tm1'} style={{ background: 'rgba(0,0,0,0.15)', borderBottom: (p.teammate2Username || p.teammate3Username) ? 'none' : undefined }}>
                              <td className="text-start ps-4">
                                <span className="text-secondary small"><i className="bi bi-arrow-return-right me-1"></i>Teammate 1</span>
                              </td>
                              <td className="text-start">
                                <div className="text-white-50 small">{p.teammateUsername}</div>
                                <div className="text-secondary small font-monospace">{p.teammateGameUid || 'N/A'}</div>
                              </td>
                              <td className="text-secondary">—</td>
                              <td>
                                <input 
                                  type="number" 
                                  className="form-control form-control-sm text-center mx-auto" 
                                  style={{ width: '70px' }}
                                  value={p.teammateKills} 
                                  onChange={(e) => updatePlayerField(p.uid, 'teammateKills', Math.max(0, Number(e.target.value)))}
                                  disabled={isLocked}
                                />
                              </td>
                              <td className="text-secondary">—</td>
                              <td className="text-secondary">—</td>
                              <td className="text-secondary">—</td>
                              <td className="text-secondary">—</td>
                            </tr>
                          );
                        }

                        if (p.teammate2Username) {
                          rows.push(
                            <tr key={p.uid + '-tm2'} style={{ background: 'rgba(0,0,0,0.15)', borderBottom: p.teammate3Username ? 'none' : undefined }}>
                              <td className="text-start ps-4">
                                <span className="text-secondary small"><i className="bi bi-arrow-return-right me-1"></i>Teammate 2</span>
                              </td>
                              <td className="text-start">
                                <div className="text-white-50 small">{p.teammate2Username}</div>
                                <div className="text-secondary small font-monospace">{p.teammate2GameUid || 'N/A'}</div>
                              </td>
                              <td className="text-secondary">—</td>
                              <td>
                                <input 
                                  type="number" 
                                  className="form-control form-control-sm text-center mx-auto" 
                                  style={{ width: '70px' }}
                                  value={p.teammate2Kills} 
                                  onChange={(e) => updatePlayerField(p.uid, 'teammate2Kills', Math.max(0, Number(e.target.value)))}
                                  disabled={isLocked}
                                />
                              </td>
                              <td className="text-secondary">—</td>
                              <td className="text-secondary">—</td>
                              <td className="text-secondary">—</td>
                              <td className="text-secondary">—</td>
                            </tr>
                          );
                        }

                        if (p.teammate3Username) {
                          rows.push(
                            <tr key={p.uid + '-tm3'} style={{ background: 'rgba(0,0,0,0.15)' }}>
                              <td className="text-start ps-4">
                                <span className="text-secondary small"><i className="bi bi-arrow-return-right me-1"></i>Teammate 3</span>
                              </td>
                              <td className="text-start">
                                <div className="text-white-50 small">{p.teammate3Username}</div>
                                <div className="text-secondary small font-monospace">{p.teammate3GameUid || 'N/A'}</div>
                              </td>
                              <td className="text-secondary">—</td>
                              <td>
                                <input 
                                  type="number" 
                                  className="form-control form-control-sm text-center mx-auto" 
                                  style={{ width: '70px' }}
                                  value={p.teammate3Kills} 
                                  onChange={(e) => updatePlayerField(p.uid, 'teammate3Kills', Math.max(0, Number(e.target.value)))}
                                  disabled={isLocked}
                                />
                              </td>
                              <td className="text-secondary">—</td>
                              <td className="text-secondary">—</td>
                              <td className="text-secondary">—</td>
                              <td className="text-secondary">—</td>
                            </tr>
                          );
                        }

                        return rows;
                      })
                    ) : (
                      <tr>
                        <td colSpan={8} className="text-center text-secondary py-3">No teams registered for this match.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AdminTournamentManagement;
