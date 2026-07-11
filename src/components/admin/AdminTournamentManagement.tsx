import React, { useEffect, useState, useRef } from 'react';
import { ref, get, update, push, serverTimestamp } from 'firebase/database';
import { db, auth } from '../../firebase';


interface Tournament {
  id: string;
  name: string;
  status: string;
  mode?: string;
  perKillPrize: number;
  entryFee: number;
  winningsCredited?: boolean;
  winningsCreditedAt?: number;
  createdAt?: number;
  startTime?: number;
  prizeDistribution?: Record<string, number>;
  registeredPlayers?: Record<string, any>;
  fullResults?: any[];
  maxKillsPlayers?: number | string;
  minKills?: number;
  blacklistedTeams?: Record<string, any>;
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
  blacklisted?: boolean;
  blacklistReason?: string;
}

const fmtTime = (ts?: number) => {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const AdminTournamentManagement: React.FC = () => {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [selectedTourney, setSelectedTourney] = useState<Tournament | null>(null);

  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'danger' | 'info' } | null>(null);

  const [activeFilterTab, setActiveFilterTab] = useState<'pending' | 'completed'>('pending');
  const [maxKillsPlayers, setMaxKillsPlayers] = useState<string>('All');
  const [minKills, setMinKills] = useState<number>(0);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // Blacklist state
  const [blacklistMode, setBlacklistMode] = useState(false);
  const [blacklistChecked, setBlacklistChecked] = useState<string[]>([]);
  const [blacklistReason, setBlacklistReason] = useState('');
  const [blacklistConfirmLoading, setBlacklistConfirmLoading] = useState(false);

  // Distribute blacklist money modal
  const [showDistributeModal, setShowDistributeModal] = useState(false);
  const [distributeLeaderKills, setDistributeLeaderKills] = useState<Record<string, number>>({});
  const [distributeTm1Kills, setDistributeTm1Kills] = useState<Record<string, number>>({});
  const [distributeTm2Kills, setDistributeTm2Kills] = useState<Record<string, number>>({});
  const [distributeTm3Kills, setDistributeTm3Kills] = useState<Record<string, number>>({});
  const [distributeLoading, setDistributeLoading] = useState(false);

  const scoreEditorRef = useRef<HTMLDivElement>(null);

  const isLocked = selectedTourney?.winningsCredited ||
    selectedTourney?.status === 'refunded' ||
    selectedTourney?.status === 'cancelled';

  useEffect(() => {
    const fetchTourneys = async () => {
      try {
        const snapshot = await get(ref(db, 'tournaments'));
        if (snapshot.exists()) {
          const list = Object.entries(snapshot.val()).map(([id, val]: any) => ({
            id,
            ...val
          })).filter((t: any) => ['ongoing', 'completed', 'result'].includes(t.status));

          // Sort start time descending (latest first)
          list.sort((a, b) => (b.startTime || 0) - (a.startTime || 0));
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
    setBlacklistMode(false);
    setBlacklistChecked([]);
    setBlacklistReason('');

    if (!id) return;

    setLoading(true);
    try {
      const tSnap = await get(ref(db, `tournaments/${id}`));
      if (!tSnap.exists()) throw new Error('Tournament not found.');
      const t = { id, ...tSnap.val() } as Tournament;
      setSelectedTourney(t);
      setMaxKillsPlayers(t.maxKillsPlayers !== undefined ? String(t.maxKillsPlayers) : 'All');
      setMinKills(t.minKills !== undefined ? Number(t.minKills) : 0);

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

      // Blacklisted teams map
      const blacklisted = t.blacklistedTeams || {};

      const promises = uids.map(uid => get(ref(db, `users/${uid}`)));
      const snaps = await Promise.all(promises);

      const playerRows: PlayerRow[] = snaps.map((s, index) => {
        const uid = uids[index];
        const regData = registered[uid];
        const resData = resultsMap[uid] || {};
        const bData = blacklisted[uid];

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
            rank: resData.rank != null ? String(resData.rank) : '',
            blacklisted: !!bData,
            blacklistReason: bData?.reason || ''
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
          rank: '',
          blacklisted: !!bData,
          blacklistReason: bData?.reason || ''
        };
      });

      setPlayers(playerRows);

      if (t.winningsCredited) {
        setMsg({ text: 'Winnings have been credited for this match. Editing is locked.', type: 'info' });
      } else if (t.status === 'refunded' || t.status === 'cancelled') {
        setMsg({ text: `This match is ${t.status}. Actions locked.`, type: 'info' });
      }

      // Scroll to score editor
      setTimeout(() => {
        scoreEditorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 200);
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
    // Blacklisted players always get ₹0
    if (p.blacklisted) return 0;

    const perKill = selectedTourney.perKillPrize || 0;

    // Check eligibility
    let qualifiesForKills = true;
    const rankNum = parseInt(p.rank);

    if (maxKillsPlayers !== 'All') {
      const maxRankVal = parseInt(maxKillsPlayers);
      if (isNaN(rankNum) || rankNum > maxRankVal) {
        qualifiesForKills = false;
      }
    }

    if (p.kills < minKills) {
      qualifiesForKills = false;
    }

    const killsAmt = qualifiesForKills ? (p.kills * perKill) : 0;

    let rankAmt = 0;
    const dist = selectedTourney.prizeDistribution || {};

    if (!isNaN(rankNum) && rankNum > 0) {
      if (dist[String(rankNum)] !== undefined) {
        rankAmt = Number(dist[String(rankNum)]) || 0;
      } else {
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

  const handleSortByKills = () => {
    if (isLocked) return;
    const sorted = [...players].sort((a, b) => b.kills - a.kills);
    setPlayers(sorted);
  };

  const handleAutoAssignRanks = () => {
    if (isLocked) return;
    setPlayers(prev => prev.map((p, idx) => ({
      ...p,
      rank: p.blacklisted ? '' : String(idx + 1)
    })));
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    if (isLocked) return;
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index || isLocked) return;

    const list = [...players];
    const draggedItem = list[draggedIndex];
    list.splice(draggedIndex, 1);
    list.splice(index, 0, draggedItem);

    const updated = list.map((p, idx) => ({
      ...p,
      rank: p.blacklisted ? '' : String(idx + 1)
    }));

    setPlayers(updated);
    setDraggedIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  // --- Blacklist Handlers ---

  const handleToggleBlacklistCheck = (uid: string) => {
    setBlacklistChecked(prev =>
      prev.includes(uid) ? prev.filter(x => x !== uid) : [...prev, uid]
    );
  };

  const handleConfirmBlacklist = async () => {
    if (!selectedTourney || blacklistChecked.length === 0) return;
    if (!confirm(`Disqualify ${blacklistChecked.length} team(s)? They will receive ₹0 and cannot be edited. This is saved to the database.`)) return;

    setBlacklistConfirmLoading(true);
    try {
      const updates: any = {};
      const loggedInStaffStr = sessionStorage.getItem('loggedInStaff');
      const loggedInStaff = loggedInStaffStr ? JSON.parse(loggedInStaffStr) : null;
      const actor = loggedInStaff?.id || auth.currentUser?.email || 'admin';

      blacklistChecked.forEach(uid => {
        const p = players.find(x => x.uid === uid);
        updates[`tournaments/${selectedTourney.id}/blacklistedTeams/${uid}`] = {
          displayName: p?.displayName || uid,
          reason: blacklistReason.trim() || null,
          blacklistedAt: Date.now(),
          blacklistedBy: actor
        };
      });

      await update(ref(db), updates);

      // Update local state
      setPlayers(prev => prev.map(p => {
        if (blacklistChecked.includes(p.uid)) {
          return { ...p, blacklisted: true, blacklistReason: blacklistReason.trim(), rank: '', extraAmount: 0 };
        }
        return p;
      }));

      setBlacklistMode(false);
      setBlacklistChecked([]);
      setBlacklistReason('');
      setMsg({ text: `${blacklistChecked.length} team(s) blacklisted/disqualified successfully.`, type: 'success' });
    } catch (err: any) {
      setMsg({ text: 'Blacklist failed: ' + err.message, type: 'danger' });
    } finally {
      setBlacklistConfirmLoading(false);
    }
  };

  const handleRemoveBlacklist = async (uid: string) => {
    if (!selectedTourney) return;
    if (!confirm('Remove blacklist/disqualification for this team? They will be re-enabled for scoring.')) return;
    try {
      await update(ref(db), {
        [`tournaments/${selectedTourney.id}/blacklistedTeams/${uid}`]: null
      });
      setPlayers(prev => prev.map(p =>
        p.uid === uid ? { ...p, blacklisted: false, blacklistReason: '' } : p
      ));
      setMsg({ text: 'Blacklist removed. Team re-enabled.', type: 'success' });
    } catch (err: any) {
      setMsg({ text: 'Remove blacklist failed: ' + err.message, type: 'danger' });
    }
  };

  // --- Distribute Blacklist Money ---

  const computeBlacklistHypotheticalPrize = (): number => {
    if (!selectedTourney) return 0;
    const blPlayers = players.filter(p => p.blacklisted);
    let total = 0;

    blPlayers.forEach(p => {
      const perKill = selectedTourney.perKillPrize || 0;
      const lk = distributeLeaderKills[p.uid] || 0;
      const t1k = p.teammateUsername ? (distributeTm1Kills[p.uid] || 0) : 0;
      const t2k = p.teammate2Username ? (distributeTm2Kills[p.uid] || 0) : 0;
      const t3k = p.teammate3Username ? (distributeTm3Kills[p.uid] || 0) : 0;
      const teamKills = lk + t1k + t2k + t3k;

      // We add kill amount (no rank prize distributed for blacklisted)
      total += teamKills * perKill;
    });
    return total;
  };

  const handleDistributeBlacklistMoney = async () => {
    if (!selectedTourney) return;
    const amount = computeBlacklistHypotheticalPrize();
    if (amount <= 0) {
      alert('No amount to distribute. Enter kill counts for the blacklisted team(s) first.');
      return;
    }

    const nonBlacklisted = players.filter(p => !p.blacklisted);
    if (nonBlacklisted.length === 0) {
      alert('No non-blacklisted players to distribute money to.');
      return;
    }

    const share = amount / nonBlacklisted.length;
    if (!confirm(`Distribute ₹${amount.toFixed(2)} equally among ${nonBlacklisted.length} remaining players (₹${share.toFixed(2)} each) as bonus?`)) return;

    setDistributeLoading(true);
    try {
      setPlayers(prev => prev.map(p => {
        if (!p.blacklisted) {
          return { ...p, extraAmount: (p.extraAmount || 0) + share };
        }
        return p;
      }));
      setShowDistributeModal(false);
      setDistributeLeaderKills({});
      setDistributeTm1Kills({});
      setDistributeTm2Kills({});
      setDistributeTm3Kills({});
      setMsg({ text: `₹${amount.toFixed(2)} distributed as unfair bonus among ${nonBlacklisted.length} players (₹${share.toFixed(2)} each). Remember to save by crediting winnings.`, type: 'success' });
    } catch (err: any) {
      setMsg({ text: 'Distribution failed: ' + err.message, type: 'danger' });
    } finally {
      setDistributeLoading(false);
    }
  };

  // --- Credit Winnings ---
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
        const totalPrize = p.blacklisted ? 0 : calculateRowWinnings(p);

        // Match history entry
        const matchHistoryData = {
          tournamentId: selectedTourney.id,
          tournamentName: selectedTourney.name,
          rank: rankNum,
          kills: p.kills,
          earnings: totalPrize,
          date: serverTimestamp(),
          blacklisted: p.blacklisted || false
        };
        updates[`users/${p.uid}/matchHistory/${selectedTourney.id}`] = matchHistoryData;

        // Build teammates array
        const teammatesResultList: any[] = [];
        if (p.teammateUsername) {
          teammatesResultList.push({ username: p.teammateUsername, gameUid: p.teammateGameUid || 'N/A', kills: Number(p.teammateKills) || 0 });
        }
        if (p.teammate2Username) {
          teammatesResultList.push({ username: p.teammate2Username, gameUid: p.teammate2GameUid || 'N/A', kills: Number(p.teammate2Kills) || 0 });
        }
        if (p.teammate3Username) {
          teammatesResultList.push({ username: p.teammate3Username, gameUid: p.teammate3GameUid || 'N/A', kills: Number(p.teammate3Kills) || 0 });
        }

        // Unfair bonus: extraAmount minus any pre-existing extra from before distribution
        // We'll track total extra amount as unfairBonus for display
        const unfairBonus = p.blacklisted ? 0 : Number(p.extraAmount || 0);

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
          winnings: totalPrize,
          blacklisted: p.blacklisted || false,
          blacklistReason: p.blacklistReason || '',
          unfairBonus: p.blacklisted ? 0 : unfairBonus
        });

        // Update stats
        updates[`users/${p.uid}/totalMatches`] = (freshUser.totalMatches || 0) + 1;
        if (rankNum === 1 && !p.blacklisted) {
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
      updates[`tournaments/${selectedTourney.id}/winningsCreditedAt`] = Date.now();
      updates[`tournaments/${selectedTourney.id}/status`] = 'result';
      updates[`tournaments/${selectedTourney.id}/maxKillsPlayers`] = maxKillsPlayers === 'All' ? 'All' : Number(maxKillsPlayers);
      updates[`tournaments/${selectedTourney.id}/minKills`] = minKills;

      fullResults.sort((a, b) => (a.rank || 999) - (b.rank || 999));
      updates[`tournaments/${selectedTourney.id}/fullResults`] = fullResults;

      await update(ref(db), updates);

      const logRef = push(ref(db, 'adminLogs'));
      const loggedInStaffStr = sessionStorage.getItem('loggedInStaff');
      const loggedInStaff = loggedInStaffStr ? JSON.parse(loggedInStaffStr) : null;
      await update(ref(db), {
        [`adminLogs/${logRef.key}`]: {
          actor: loggedInStaff?.id || auth.currentUser?.email || 'admin',
          actorType: loggedInStaff ? 'staff' : 'admin',
          event: 'credit_winnings',
          description: `Credited winnings for match: ${selectedTourney.name}. Max Kills Players: ${maxKillsPlayers}, Min Kills: ${minKills}`,
          tournamentId: selectedTourney.id,
          amount: totalCredited,
          timestamp: Date.now()
        }
      }).catch(() => {});

      alert(`Winnings credited! ₹${totalCredited.toFixed(2)} split among ${playersCount} players.`);
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

      if (tourney.status === 'refunded' || tourney.status === 'cancelled') {
        throw new Error(`This match has already been cancelled/refunded.`);
      }

      const registered = tourney.registeredPlayers || {};
      const regUids = Object.keys(registered);
      const results = tourney.fullResults || [];

      if (regUids.length === 0) {
        throw new Error('No players found in this match.');
      }

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

      regUids.forEach(uid => {
        const user = freshUserMap[uid];
        if (!user) return;

        const regData = registered[uid];
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

      updates[`tournaments/${selectedTourney.id}/status`] = 'refunded';

      await update(ref(db), updates);

      const logRefRefund = push(ref(db, 'adminLogs'));
      const loggedInStaffStrRef = sessionStorage.getItem('loggedInStaff');
      const loggedInStaffRef = loggedInStaffStrRef ? JSON.parse(loggedInStaffStrRef) : null;
      await update(ref(db), {
        [`adminLogs/${logRefRefund.key}`]: {
          actor: loggedInStaffRef?.id || auth.currentUser?.email || 'admin',
          actorType: loggedInStaffRef ? 'staff' : 'admin',
          event: 'refund_match',
          description: `Refunded match and reversed winnings for: ${selectedTourney.name}`,
          tournamentId: selectedTourney.id,
          critical: true,
          timestamp: Date.now()
        }
      }).catch(() => {});

      alert('Match cancelled and refunded successfully.');
      handleSelectTournament(selectedTourney.id);
    } catch (err: any) {
      console.error(err);
      setMsg({ text: 'Refund failed: ' + err.message, type: 'danger' });
    } finally {
      setActionLoading(false);
    }
  };

  const pendingTourneys = tournaments.filter(t => !t.winningsCredited);
  const completedTourneys = tournaments.filter(t => t.winningsCredited);
  const visibleTourneys = activeFilterTab === 'pending' ? pendingTourneys : completedTourneys;
  const blacklistedPlayers = players.filter(p => p.blacklisted);

  const modeBadgeColor = (mode?: string) => {
    if (mode === 'Squad') return { bg: 'rgba(168,85,247,0.15)', color: '#C084FC', border: 'rgba(168,85,247,0.3)' };
    if (mode === 'Duo') return { bg: 'rgba(59,130,246,0.15)', color: '#60A5FA', border: 'rgba(59,130,246,0.3)' };
    return { bg: 'rgba(74,222,128,0.12)', color: '#4ADE80', border: 'rgba(74,222,128,0.3)' };
  };

  const statusBadgeColor = (status: string, credited?: boolean) => {
    if (credited) return { bg: 'rgba(74,222,128,0.12)', color: '#4ADE80' };
    if (status === 'ongoing') return { bg: 'rgba(250,204,21,0.12)', color: '#FACC15' };
    if (status === 'result') return { bg: 'rgba(74,222,128,0.12)', color: '#4ADE80' };
    if (status === 'refunded' || status === 'cancelled') return { bg: 'rgba(239,68,68,0.12)', color: '#F87171' };
    return { bg: 'rgba(100,116,139,0.15)', color: '#94A3B8' };
  };

  return (
    <div className="admin-tourney-mgt-view">
      <h2 className="mb-4">Tournament Management</h2>

      {/* Tabs */}
      <ul className="nav nav-tabs mb-3 border-secondary border-opacity-25">
        <li className="nav-item">
          <button
            className={`nav-link text-white border-0 ${activeFilterTab === 'pending' ? 'active bg-warning text-dark fw-bold' : 'bg-transparent text-secondary'}`}
            onClick={() => { setActiveFilterTab('pending'); setSelectedId(''); setSelectedTourney(null); setPlayers([]); }}
            style={{ borderRadius: '8px 8px 0 0' }}
          >
            Pending Scores ({pendingTourneys.length})
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link text-white border-0 ${activeFilterTab === 'completed' ? 'active bg-success text-white fw-bold' : 'bg-transparent text-secondary'}`}
            onClick={() => { setActiveFilterTab('completed'); setSelectedId(''); setSelectedTourney(null); setPlayers([]); }}
            style={{ borderRadius: '8px 8px 0 0' }}
          >
            Completed Matches ({completedTourneys.length})
          </button>
        </li>
      </ul>

      {/* Match List */}
      <div className="card custom-card p-3 mb-4">
        <div className="mb-3 d-flex align-items-center gap-2">
          <i className="bi bi-collection-fill text-accent" />
          <span className="fw-semibold text-white">Select a Match to Manage</span>
          <span className="ms-auto badge bg-secondary bg-opacity-25 text-secondary">{visibleTourneys.length} matches</span>
        </div>

        {visibleTourneys.length === 0 ? (
          <div className="text-center py-5 text-secondary">
            <i className="bi bi-inbox d-block mb-2" style={{ fontSize: '2rem', opacity: 0.3 }} />
            <div style={{ fontSize: '0.85rem' }}>No matches in this category</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '480px', overflowY: 'auto', paddingRight: '4px' }}>
            {visibleTourneys.map(t => {
              const isSelected = selectedId === t.id;
              const mb = modeBadgeColor(t.mode);
              const sb = statusBadgeColor(t.status, t.winningsCredited);
              return (
                <div
                  key={t.id}
                  style={{
                    borderRadius: '10px',
                    border: isSelected ? '1.5px solid rgba(250,204,21,0.5)' : '1px solid rgba(255,255,255,0.07)',
                    background: isSelected ? 'rgba(250,204,21,0.04)' : 'rgba(255,255,255,0.02)',
                    padding: '12px 14px',
                    transition: 'all 0.15s',
                    cursor: 'default',
                  }}
                >
                  <div className="d-flex align-items-start gap-2 flex-wrap">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Match Name */}
                      <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#E2E8F0', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t.name}
                      </div>

                      {/* Badges */}
                      <div className="d-flex gap-1 flex-wrap mb-2">
                        {t.mode && (
                          <span style={{ fontSize: '0.6rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: mb.bg, color: mb.color, border: `1px solid ${mb.border}` }}>
                            {t.mode.toUpperCase()}
                          </span>
                        )}
                        <span style={{ fontSize: '0.6rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: sb.bg, color: sb.color }}>
                          {t.winningsCredited ? 'CREDITED' : t.status.toUpperCase()}
                        </span>
                        {t.blacklistedTeams && Object.keys(t.blacklistedTeams).length > 0 && (
                          <span style={{ fontSize: '0.6rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: 'rgba(239,68,68,0.12)', color: '#F87171' }}>
                            {Object.keys(t.blacklistedTeams).length} BLACKLISTED
                          </span>
                        )}
                      </div>

                      {/* Meta info grid */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 12px', fontSize: '0.65rem', color: '#64748B' }}>
                        <div><span style={{ color: '#475569' }}>Created:</span> {fmtTime(t.createdAt || t.startTime)}</div>
                        <div><span style={{ color: '#475569' }}>Completed:</span> {fmtTime(t.winningsCreditedAt)}</div>
                        <div style={{ gridColumn: '1/-1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <span style={{ color: '#475569' }}>ID:</span>{' '}
                          <span style={{ fontFamily: 'monospace', color: '#64748B' }}>{t.id}</span>
                        </div>
                      </div>
                    </div>

                    {/* Action button */}
                    <button
                      onClick={() => handleSelectTournament(t.id)}
                      disabled={loading && selectedId === t.id}
                      style={{
                        padding: '8px 14px',
                        borderRadius: '7px',
                        border: isSelected ? '1px solid rgba(250,204,21,0.5)' : '1px solid rgba(255,255,255,0.1)',
                        background: isSelected ? 'rgba(250,204,21,0.12)' : 'rgba(255,255,255,0.04)',
                        color: isSelected ? '#FACC15' : '#94A3B8',
                        fontWeight: 600,
                        fontSize: '0.75rem',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                        transition: 'all 0.15s',
                      }}
                    >
                      {loading && selectedId === t.id ? (
                        <span className="spinner-border spinner-border-sm me-1" />
                      ) : (
                        <i className="bi bi-pencil-square me-1" />
                      )}
                      {isSelected ? 'Selected' : 'Manage Scores'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {msg && <div className={`alert alert-${msg.type} mb-4`}>{msg.text}</div>}

      {selectedId && (
        <>
          <style>{`
            .drag-handle {
              cursor: grab;
              color: #64748B;
              transition: color 0.15s;
            }
            .drag-handle:hover {
              color: #FACC15;
            }
            .draggable-row {
              transition: background-color 0.2s;
            }
            .draggable-row:hover {
              background: rgba(255, 255, 255, 0.02) !important;
            }
            .draggable-row.dragging {
              opacity: 0.4;
              background: rgba(250, 204, 21, 0.1) !important;
              border: 1px dashed #FACC15;
            }
            .blacklisted-row {
              background: rgba(239,68,68,0.08) !important;
              border-left: 3px solid rgba(239,68,68,0.5) !important;
            }
            .blacklist-checkbox {
              width: 17px; height: 17px; cursor: pointer; accent-color: #EF4444;
            }
          `}</style>
          {loading ? (
            <div className="placeholder-glow py-5 rounded-3" style={{ height: '200px' }}></div>
          ) : (
            <div className="card custom-card p-3 mb-4" ref={scoreEditorRef}>
              <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
                <h5 className="m-0 text-white">Registered Players &amp; Score Inputs</h5>
                <div className="d-flex gap-2 flex-wrap">
                  {/* Blacklist button */}
                  {!isLocked && (
                    <>
                      <button
                        className={`btn btn-sm ${blacklistMode ? 'btn-danger' : 'btn-outline-danger'}`}
                        onClick={() => {
                          setBlacklistMode(prev => !prev);
                          setBlacklistChecked([]);
                          setBlacklistReason('');
                        }}
                      >
                        <i className="bi bi-slash-circle me-1" />
                        {blacklistMode ? 'Cancel Blacklist' : 'Blacklist'}
                      </button>
                      {blacklistedPlayers.length > 0 && (
                        <button
                          className="btn btn-outline-warning btn-sm"
                          onClick={() => setShowDistributeModal(true)}
                        >
                          <i className="bi bi-arrow-left-right me-1" />
                          Distribute Blacklist Money
                        </button>
                      )}
                    </>
                  )}
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={handleRefundMatch}
                    disabled={actionLoading || selectedTourney?.status === 'refunded'}
                  >
                    <i className="bi bi-arrow-counterclockwise" /> Refund Match
                  </button>
                  <button
                    className="btn btn-success btn-sm"
                    onClick={handleCreditWinnings}
                    disabled={actionLoading || isLocked}
                  >
                    <i className="bi bi-check-circle-fill" /> Credit All Winnings
                  </button>
                </div>
              </div>

              {/* Blacklist mode controls */}
              {blacklistMode && !isLocked && (
                <div style={{
                  background: 'rgba(239,68,68,0.06)',
                  border: '1px solid rgba(239,68,68,0.2)',
                  borderRadius: '8px',
                  padding: '12px 14px',
                  marginBottom: '16px',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '10px',
                  alignItems: 'center'
                }}>
                  <i className="bi bi-slash-circle text-danger me-1" />
                  <span style={{ color: '#F87171', fontSize: '0.8rem', fontWeight: 600 }}>
                    Blacklist Mode — check team(s) to disqualify
                  </span>
                  <div style={{ flex: 1, minWidth: '200px' }}>
                    <input
                      type="text"
                      className="form-control form-control-sm bg-dark border-danger border-opacity-25 text-white"
                      placeholder="Reason (optional, e.g. Hacking detected)"
                      value={blacklistReason}
                      onChange={e => setBlacklistReason(e.target.value)}
                    />
                  </div>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={handleConfirmBlacklist}
                    disabled={blacklistChecked.length === 0 || blacklistConfirmLoading}
                  >
                    {blacklistConfirmLoading ? <span className="spinner-border spinner-border-sm me-1" /> : null}
                    Confirm Disqualify ({blacklistChecked.length})
                  </button>
                </div>
              )}

              {/* Kill distribution settings */}
              <div className="row g-3 mb-4 align-items-end text-start p-3 bg-black bg-opacity-20 rounded-3 border border-secondary border-opacity-10 mx-0">
                <div className="col-12 col-md-3">
                  <label className="form-label text-secondary small fw-bold mb-1">Max Players for Kill Winnings</label>
                  <select
                    className="form-select bg-dark border-secondary border-opacity-25 text-white form-select-sm"
                    value={maxKillsPlayers}
                    onChange={(e) => setMaxKillsPlayers(e.target.value)}
                    disabled={isLocked}
                  >
                    <option value="All">All Players</option>
                    {Array.from({ length: 50 }, (_, i) => String(i + 1)).map(val => (
                      <option key={val} value={val}>Top {val} Players</option>
                    ))}
                  </select>
                </div>
                <div className="col-12 col-md-3">
                  <label className="form-label text-secondary small fw-bold mb-1">Min Kills for Crediting</label>
                  <input
                    type="number"
                    className="form-control bg-dark border-secondary border-opacity-25 text-white form-control-sm"
                    min="0"
                    value={minKills}
                    onChange={(e) => setMinKills(Math.max(0, parseInt(e.target.value) || 0))}
                    disabled={isLocked}
                  />
                </div>
                <div className="col-12 col-md-6 d-flex justify-content-md-end gap-2 flex-wrap mt-2 mt-md-0">
                  <button
                    className="btn btn-outline-warning btn-sm"
                    onClick={handleSortByKills}
                    disabled={isLocked || players.length === 0}
                  >
                    <i className="bi bi-sort-numeric-down" /> Sort by Kills
                  </button>
                  <button
                    className="btn btn-outline-info btn-sm"
                    onClick={handleAutoAssignRanks}
                    disabled={isLocked || players.length === 0}
                  >
                    <i className="bi bi-list-ol" /> Auto Rank 1 to N
                  </button>
                </div>
              </div>

              <div className="table-responsive">
                <table className="table table-dark table-hover mb-0 align-middle">
                  <thead>
                    <tr>
                      {blacklistMode && <th style={{ width: '36px' }}></th>}
                      <th className="text-start">Team Member</th>
                      <th className="text-start">Game IGN &amp; UID</th>
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
                      players.map((p, idx) => {
                        const hasTeammates = !!(p.teammateUsername || p.teammate2Username || p.teammate3Username);
                        const rows = [];
                        const isCurrentlyDragging = draggedIndex === idx;
                        const isBlacklisted = !!p.blacklisted;
                        const isChecked = blacklistChecked.includes(p.uid);

                        // 1. Leader Row
                        rows.push(
                          <tr
                            key={p.uid + '-leader'}
                            style={{ borderBottom: hasTeammates ? 'none' : undefined }}
                            draggable={!isLocked && !isBlacklisted}
                            onDragStart={(e) => handleDragStart(e, idx)}
                            onDragOver={(e) => handleDragOver(e)}
                            onDrop={(e) => handleDrop(e, idx)}
                            onDragEnd={handleDragEnd}
                            className={`draggable-row ${isCurrentlyDragging ? 'dragging' : ''} ${isBlacklisted ? 'blacklisted-row' : ''}`}
                          >
                            {/* Blacklist checkbox */}
                            {blacklistMode && (
                              <td style={{ width: '36px', textAlign: 'center' }}>
                                {!isBlacklisted && (
                                  <input
                                    type="checkbox"
                                    className="blacklist-checkbox"
                                    checked={isChecked}
                                    onChange={() => handleToggleBlacklistCheck(p.uid)}
                                  />
                                )}
                              </td>
                            )}
                            <td className="text-start d-flex align-items-center" style={{ minHeight: '52px' }}>
                              {!isLocked && !isBlacklisted && (
                                <i
                                  className="bi bi-grip-vertical drag-handle me-2 fs-5"
                                  style={{ cursor: 'grab' }}
                                  title="Drag to reorder/change rank"
                                />
                              )}
                              <div>
                                <div className="fw-bold text-white" style={{ opacity: isBlacklisted ? 0.5 : 1 }}>{p.displayName}</div>
                                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center', marginTop: '2px' }}>
                                  <span style={{ fontSize: '0.62rem', background: 'rgba(74,222,128,0.15)', color: '#4ADE80', padding: '1px 5px', borderRadius: '3px', fontWeight: 600 }}>LEADER</span>
                                  {isBlacklisted && (
                                    <span style={{ fontSize: '0.62rem', background: 'rgba(239,68,68,0.2)', color: '#F87171', padding: '1px 5px', borderRadius: '3px', fontWeight: 700, border: '1px solid rgba(239,68,68,0.35)' }}>
                                      ⛔ DISQUALIFIED
                                    </span>
                                  )}
                                </div>
                                {isBlacklisted && p.blacklistReason && (
                                  <div style={{ fontSize: '0.6rem', color: '#F87171', opacity: 0.7, marginTop: '2px', fontStyle: 'italic' }}>
                                    Reason: {p.blacklistReason}
                                  </div>
                                )}
                                {isBlacklisted && !isLocked && (
                                  <button
                                    style={{ fontSize: '0.6rem', marginTop: '3px', padding: '1px 6px', borderRadius: '3px', border: '1px solid rgba(239,68,68,0.3)', background: 'transparent', color: '#F87171', cursor: 'pointer' }}
                                    onClick={() => handleRemoveBlacklist(p.uid)}
                                  >
                                    Remove Blacklist
                                  </button>
                                )}
                              </div>
                            </td>
                            <td className="text-start" style={{ opacity: isBlacklisted ? 0.45 : 1 }}>
                              <div className="text-accent small fw-semibold">{p.username}</div>
                              <div className="text-secondary small font-monospace">{p.gameUid}</div>
                            </td>
                            <td style={{ opacity: isBlacklisted ? 0.35 : 1 }}>₹{selectedTourney?.perKillPrize || 0}</td>

                            <td style={{ opacity: isBlacklisted ? 0.35 : 1 }}>
                              <input
                                type="number"
                                className="form-control form-control-sm text-center mx-auto"
                                style={{ width: '70px' }}
                                value={p.leaderKills}
                                onChange={(e) => updatePlayerField(p.uid, 'leaderKills', Math.max(0, Number(e.target.value)))}
                                disabled={isLocked || isBlacklisted}
                              />
                            </td>
                            <td className="fw-bold text-warning fs-6" style={{ opacity: isBlacklisted ? 0.35 : 1 }}>
                              {p.kills}
                            </td>
                            <td style={{ opacity: isBlacklisted ? 0.35 : 1 }}>
                              <input
                                type="number"
                                className="form-control form-control-sm text-center mx-auto"
                                style={{ width: '80px' }}
                                value={p.extraAmount || ''}
                                onChange={(e) => updatePlayerField(p.uid, 'extraAmount', Math.max(0, parseFloat(e.target.value) || 0))}
                                disabled={isLocked || isBlacklisted}
                              />
                            </td>
                            <td style={{ opacity: isBlacklisted ? 0.35 : 1 }}>
                              <input
                                type="number"
                                className="form-control form-control-sm text-center mx-auto"
                                style={{ width: '70px' }}
                                value={p.rank}
                                onChange={(e) => updatePlayerField(p.uid, 'rank', e.target.value)}
                                placeholder="Rank"
                                disabled={isLocked || isBlacklisted}
                              />
                            </td>
                            <td className="text-end fw-bold fs-5" style={{ opacity: isBlacklisted ? 0.35 : 1 }}>
                              {isBlacklisted ? (
                                <div style={{ color: '#EF4444', fontSize: '0.9rem' }}>₹0.00</div>
                              ) : (
                                <>
                                  <div style={{ color: 'var(--text-accent, #FACC15)' }}>₹{calculateRowWinnings(p).toFixed(2)}</div>
                                  {(() => {
                                    const rankNum = parseInt(p.rank);
                                    let rankAmt = 0;
                                    const dist = selectedTourney?.prizeDistribution || {};

                                    if (!isNaN(rankNum) && rankNum > 0) {
                                      if (dist[String(rankNum)] !== undefined) {
                                        rankAmt = Number(dist[String(rankNum)]) || 0;
                                      } else {
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

                                    const listInfo: string[] = [];
                                    const perKill = selectedTourney?.perKillPrize || 0;
                                    let qualifiesForKills = true;
                                    if (maxKillsPlayers !== 'All') {
                                      const maxRankVal = parseInt(maxKillsPlayers);
                                      if (isNaN(rankNum) || rankNum > maxRankVal) {
                                        qualifiesForKills = false;
                                        listInfo.push(`Exceeds Top ${maxKillsPlayers}`);
                                      }
                                    }
                                    if (p.kills < minKills) {
                                      qualifiesForKills = false;
                                      listInfo.push(`Kills < ${minKills}`);
                                    }
                                    const killsAmt = qualifiesForKills ? (p.kills * perKill) : 0;

                                    return (
                                      <div style={{ fontSize: '0.62rem', marginTop: '2px', fontWeight: 500 }}>
                                        {perKill > 0 && p.kills > 0 && (
                                          listInfo.length > 0 ? (
                                            <div className="text-danger" style={{ fontWeight: 'bold' }}>
                                              No Kills Reward ({listInfo.join(', ')})
                                            </div>
                                          ) : (
                                            <div className="text-success">
                                              Kills: +₹{killsAmt.toFixed(2)}
                                            </div>
                                          )
                                        )}
                                        {rankAmt > 0 && (
                                          <div className="text-info">
                                            Rank {rankNum} Prize: +₹{rankAmt.toFixed(2)}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })()}
                                </>
                              )}
                            </td>
                          </tr>
                        );

                        // 2. Teammate Rows
                        if (p.teammateUsername) {
                          rows.push(
                            <tr key={p.uid + '-tm1'} style={{ background: isBlacklisted ? 'rgba(239,68,68,0.05)' : 'rgba(0,0,0,0.15)', borderBottom: (p.teammate2Username || p.teammate3Username) ? 'none' : undefined, opacity: isBlacklisted ? 0.4 : 1 }}>
                              {blacklistMode && <td />}
                              <td className="text-start ps-4">
                                <span className="text-secondary small"><i className="bi bi-arrow-return-right me-1" />Teammate 1</span>
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
                                  disabled={isLocked || isBlacklisted}
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
                            <tr key={p.uid + '-tm2'} style={{ background: isBlacklisted ? 'rgba(239,68,68,0.05)' : 'rgba(0,0,0,0.15)', borderBottom: p.teammate3Username ? 'none' : undefined, opacity: isBlacklisted ? 0.4 : 1 }}>
                              {blacklistMode && <td />}
                              <td className="text-start ps-4">
                                <span className="text-secondary small"><i className="bi bi-arrow-return-right me-1" />Teammate 2</span>
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
                                  disabled={isLocked || isBlacklisted}
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
                            <tr key={p.uid + '-tm3'} style={{ background: isBlacklisted ? 'rgba(239,68,68,0.05)' : 'rgba(0,0,0,0.15)', opacity: isBlacklisted ? 0.4 : 1 }}>
                              {blacklistMode && <td />}
                              <td className="text-start ps-4">
                                <span className="text-secondary small"><i className="bi bi-arrow-return-right me-1" />Teammate 3</span>
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
                                  disabled={isLocked || isBlacklisted}
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
                        <td colSpan={blacklistMode ? 9 : 8} className="text-center text-secondary py-3">No teams registered for this match.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Distribute Blacklist Money Modal */}
      {showDistributeModal && selectedTourney && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setShowDistributeModal(false); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 1080,
            background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '16px'
          }}
        >
          <div style={{
            background: 'linear-gradient(180deg, #111827 0%, #0D1526 100%)',
            border: '1px solid rgba(250,204,21,0.2)',
            borderRadius: '14px',
            padding: '24px',
            maxWidth: '520px',
            width: '100%',
            maxHeight: '85vh',
            overflowY: 'auto'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'rgba(250,204,21,0.12)', border: '1px solid rgba(250,204,21,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <i className="bi bi-arrow-left-right" style={{ color: '#FACC15' }} />
              </div>
              <div>
                <div style={{ fontWeight: 700, color: '#E2E8F0', fontSize: '0.95rem' }}>Distribute Blacklist Money</div>
                <div style={{ fontSize: '0.68rem', color: '#64748B' }}>Enter the blacklisted team's kill counts to compute redistribution</div>
              </div>
              <button onClick={() => setShowDistributeModal(false)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', fontSize: '1.1rem' }}>
                <i className="bi bi-x-lg" />
              </button>
            </div>

            {blacklistedPlayers.length === 0 ? (
              <div className="text-secondary text-center py-3">No blacklisted teams found.</div>
            ) : (
              <>
                <div style={{ fontSize: '0.78rem', color: '#94A3B8', marginBottom: '14px' }}>
                  Fill in the kill counts for each disqualified team below. The hypothetical prize will be calculated and split equally among <strong style={{ color: '#FACC15' }}>{players.filter(p => !p.blacklisted).length}</strong> non-blacklisted players as an unfair bonus.
                </div>

                {blacklistedPlayers.map(p => (
                  <div key={p.uid} style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
                    <div style={{ fontWeight: 600, color: '#F87171', fontSize: '0.82rem', marginBottom: '8px' }}>
                      ⛔ {p.displayName}
                      {p.blacklistReason && <span style={{ fontSize: '0.65rem', marginLeft: '8px', opacity: 0.7, fontStyle: 'italic' }}>({p.blacklistReason})</span>}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '8px' }}>
                      <div>
                        <label style={{ fontSize: '0.62rem', color: '#94A3B8', display: 'block', marginBottom: '3px' }}>Leader Kills</label>
                        <input
                          type="number" min="0"
                          className="form-control form-control-sm bg-dark border-secondary border-opacity-25 text-white"
                          value={distributeLeaderKills[p.uid] || ''}
                          onChange={e => setDistributeLeaderKills(prev => ({ ...prev, [p.uid]: Math.max(0, parseInt(e.target.value) || 0) }))}
                        />
                      </div>
                      {p.teammateUsername && (
                        <div>
                          <label style={{ fontSize: '0.62rem', color: '#94A3B8', display: 'block', marginBottom: '3px' }}>TM1 Kills</label>
                          <input
                            type="number" min="0"
                            className="form-control form-control-sm bg-dark border-secondary border-opacity-25 text-white"
                            value={distributeTm1Kills[p.uid] || ''}
                            onChange={e => setDistributeTm1Kills(prev => ({ ...prev, [p.uid]: Math.max(0, parseInt(e.target.value) || 0) }))}
                          />
                        </div>
                      )}
                      {p.teammate2Username && (
                        <div>
                          <label style={{ fontSize: '0.62rem', color: '#94A3B8', display: 'block', marginBottom: '3px' }}>TM2 Kills</label>
                          <input
                            type="number" min="0"
                            className="form-control form-control-sm bg-dark border-secondary border-opacity-25 text-white"
                            value={distributeTm2Kills[p.uid] || ''}
                            onChange={e => setDistributeTm2Kills(prev => ({ ...prev, [p.uid]: Math.max(0, parseInt(e.target.value) || 0) }))}
                          />
                        </div>
                      )}
                      {p.teammate3Username && (
                        <div>
                          <label style={{ fontSize: '0.62rem', color: '#94A3B8', display: 'block', marginBottom: '3px' }}>TM3 Kills</label>
                          <input
                            type="number" min="0"
                            className="form-control form-control-sm bg-dark border-secondary border-opacity-25 text-white"
                            value={distributeTm3Kills[p.uid] || ''}
                            onChange={e => setDistributeTm3Kills(prev => ({ ...prev, [p.uid]: Math.max(0, parseInt(e.target.value) || 0) }))}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                <div style={{ background: 'rgba(250,204,21,0.06)', border: '1px solid rgba(250,204,21,0.2)', borderRadius: '8px', padding: '10px 14px', marginTop: '4px', marginBottom: '16px' }}>
                  <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>Total to distribute:</div>
                  <div style={{ fontWeight: 700, fontSize: '1.2rem', color: '#FACC15' }}>₹{computeBlacklistHypotheticalPrize().toFixed(2)}</div>
                  {players.filter(p => !p.blacklisted).length > 0 && computeBlacklistHypotheticalPrize() > 0 && (
                    <div style={{ fontSize: '0.68rem', color: '#64748B', marginTop: '2px' }}>
                      ÷ {players.filter(p => !p.blacklisted).length} players = ₹{(computeBlacklistHypotheticalPrize() / players.filter(p => !p.blacklisted).length).toFixed(2)} each
                    </div>
                  )}
                </div>

                <div className="d-flex gap-2">
                  <button className="btn btn-secondary btn-sm flex-fill" onClick={() => setShowDistributeModal(false)}>
                    Cancel
                  </button>
                  <button
                    className="btn btn-warning btn-sm flex-fill fw-bold"
                    onClick={handleDistributeBlacklistMoney}
                    disabled={distributeLoading || computeBlacklistHypotheticalPrize() <= 0}
                  >
                    {distributeLoading ? <span className="spinner-border spinner-border-sm me-1" /> : null}
                    Distribute Money
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminTournamentManagement;
