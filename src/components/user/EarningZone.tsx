import React, { useEffect, useState, useRef } from 'react';
import { ref, get, set, update, push, runTransaction, serverTimestamp } from 'firebase/database';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';

interface EarningZoneProps {
  onBack?: () => void;
}

interface Sector {
  id: string;
  label: string;
  value: number;
  type: 'coin' | 'diamond' | 'google_play' | 'amazon' | 'myntra' | 'custom';
  winRate: number;
  dailyLimit?: number;
  isShowpiece: boolean;
  imageUrl?: string;
}

interface Mission {
  id: string;
  title: string;
  type: 'play_matches' | 'booyah_matches' | 'spin_wheel' | 'deposit_cash' | 'withdraw_cash' | 'leaderboard_rank' | 'leaderboard_top50' | 'profile_pic';
  targetValue: number;
  rewardAmount: number;
  rewardType: 'coin' | 'bonus';
  resetLimit: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'none';
}

interface Claim {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  itemLabel: string;
  itemType: string;
  value?: number;
  timestamp: number;
  status: 'pending' | 'completed';
  voucherCode?: string;
  voucherPin?: string;
  pinEnabled?: boolean;
  adminNote?: string;
  processedAt?: number;
}

const EarningZone: React.FC<EarningZoneProps> = ({ onBack: _onBack }) => {
  const { currentUser, userProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<'wheel' | 'missions' | 'vouchers'>('wheel');
  const [loading, setLoading] = useState(true);

  // Config settings
  const [config, setConfig] = useState({
    wheelEnabled: true,
    adCountRequired: 3,
    spinCoinCost: 10,
    dailySpinLimit: 5
  });
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [userVouchers, setUserVouchers] = useState<Claim[]>([]);

  // Milestones configs & progress
  const milestoneTracks = {
    withdraw: [200, 500, 1000, 5000, 8000, 10000, 15000, 18000, 20000],
    matches: [1, 5, 10, 20, 50, 65, 70, 85, 100],
    wins: [1, 5, 10, 20, 30, 50, 65, 75, 80, 90, 100]
  };
  const [milestonesConfig, setMilestonesConfig] = useState<Record<string, Record<string, { label: string; type: string; value: number }>>>({
    withdraw: {},
    matches: {},
    wins: {}
  });
  const [totalWithdrawn, setTotalWithdrawn] = useState(0);
  const [totalMatches, setTotalMatches] = useState(0);
  const [totalWins, setTotalWins] = useState(0);
  const [claimedMilestones, setClaimedMilestones] = useState<Record<string, boolean>>({});
  const [claimingMilestoneKey, setClaimingMilestoneKey] = useState<string | null>(null);

  // User tracking
  const [spinsToday, setSpinsToday] = useState(0);
  const [adsWatched, setAdsWatched] = useState(0);

  // Wheel state variables
  const [spinning, setSpinning] = useState(false);
  const [spinError, setSpinError] = useState<string | null>(null);
  const [rewardMsg, setRewardMsg] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [currentAngle, setCurrentAngle] = useState(0);

  // Ad simulation
  const [adOverlayOpen, setAdOverlayOpen] = useState(false);
  const [adCountdown, setAdCountdown] = useState(5);
  const [adLoadingText, setAdLoadingText] = useState('Loading Sponsor Video...');

  // Achievements progress
  const [missionProgress, setMissionProgress] = useState<Record<string, { current: number; claimed: boolean }>>({});
  const [claimLoadingId, setClaimLoadingId] = useState<string | null>(null);

  const fetchUserData = async () => {
    if (!currentUser) return;
    try {
      // 1. Fetch Config
      const configSnap = await get(ref(db, 'earningZoneConfig'));
      if (configSnap.exists()) {
        const val = configSnap.val();
        setConfig({
          wheelEnabled: val.wheelEnabled ?? true,
          adCountRequired: val.adCountRequired ?? 3,
          spinCoinCost: val.spinCoinCost ?? 10,
          dailySpinLimit: val.dailySpinLimit ?? 5
        });

        if (val.wheelSectors) {
          setSectors(Object.entries(val.wheelSectors).map(([id, s]: any) => ({ id, ...s })));
        }

        if (val.milestones) {
          setMilestonesConfig({
            withdraw: val.milestones.withdraw || {},
            matches: val.milestones.matches || {},
            wins: val.milestones.wins || {}
          });
        } else {
          const initialMap: any = { withdraw: {}, matches: {}, wins: {} };
          milestoneTracks.withdraw.forEach(amt => {
            initialMap.withdraw[amt] = { label: `₹50 Coins`, type: 'coin', value: 50 };
          });
          milestoneTracks.matches.forEach(amt => {
            initialMap.matches[amt] = { label: `₹50 Coins`, type: 'coin', value: 50 };
          });
          milestoneTracks.wins.forEach(amt => {
            initialMap.wins[amt] = { label: `₹50 Coins`, type: 'coin', value: 50 };
          });
          setMilestonesConfig(initialMap);
        }
      }

      // 2. Fetch Missions
      const missionsSnap = await get(ref(db, 'missionConfig'));
      if (missionsSnap.exists()) {
        setMissions(Object.entries(missionsSnap.val()).map(([id, m]: any) => ({ id, ...m })));
      }

      // 3. Fetch User claims/vouchers
      const claimsSnap = await get(ref(db, 'earningZoneClaims'));
      if (claimsSnap.exists()) {
        const list = Object.entries(claimsSnap.val())
          .map(([id, c]: any) => ({ id, ...c } as Claim))
          .filter(c => c.userId === currentUser.uid);
        setUserVouchers(list);
      }

      // 4. Fetch user transactions (for booyahs & deposits calculation)
      const transRef = ref(db, `transactions/${currentUser.uid}`);
      const transSnap = await get(transRef);
      const allTx = transSnap.exists()
        ? Object.entries(transSnap.val()).map(([id, tx]: any) => ({ id, ...tx }))
        : [];
      
      const winningsList = allTx.filter((t: any) => t.type === 'tournament_winnings');

      // 5. Fetch User Spin/Ad tracking
      const todayStr = new Date().toISOString().split('T')[0];
      const trackingSnap = await get(ref(db, `users/${currentUser.uid}/earningZoneTracking/${todayStr}`));
      if (trackingSnap.exists()) {
        const val = trackingSnap.val();
        setSpinsToday(val.spinsCount || 0);
        setAdsWatched(val.adsCount || 0);
      } else {
        setSpinsToday(0);
        setAdsWatched(0);
      }

      // Fetch user completed withdrawals to calculate milestone progress
      const withdrawalsSnap = await get(ref(db, 'withdrawals'));
      if (withdrawalsSnap.exists()) {
        const list = Object.entries(withdrawalsSnap.val())
          .map(([id, val]: any) => ({ id, ...val }))
          .filter((w: any) => w.userId === currentUser.uid && w.status === 'completed');
        const sum = list.reduce((acc: number, curr: any) => acc + (curr.amount || 0), 0);
        setTotalWithdrawn(sum);
      } else {
        setTotalWithdrawn(0);
      }

      // Fetch claimed milestones map
      const claimedMilestonesSnap = await get(ref(db, `users/${currentUser.uid}/claimedMilestones`));
      if (claimedMilestonesSnap.exists()) {
        setClaimedMilestones(claimedMilestonesSnap.val());
      } else {
        setClaimedMilestones({});
      }

      // Calculate achievements progress dynamically
      const progressMap: Record<string, { current: number; claimed: boolean }> = {};
      const claimsConfigSnap = await get(ref(db, `users/${currentUser.uid}/claimedMissions`));
      const claimedMap = claimsConfigSnap.exists() ? claimsConfigSnap.val() : {};

      const playCount = userProfile?.joinedTournaments ? Object.keys(userProfile.joinedTournaments).length : 0;
      const booyahCount = winningsList.filter((t: any) => (t.description || '').toLowerCase().includes('rank 1')).length;
      setTotalMatches(playCount);
      setTotalWins(booyahCount);
      
      const totalSpinsSnap = await get(ref(db, `users/${currentUser.uid}/totalSpinsCounter`));
      const totalSpinsCount = totalSpinsSnap.exists() ? totalSpinsSnap.val() : 0;

      const depositCount = allTx.filter((t: any) => t.type === 'deposit_approved').length;
      const withdrawCount = allTx.filter((t: any) => t.type === 'withdraw_request').length;
      const hasAvatar = userProfile?.photoURL ? 1 : 0;

      // Mock Rank Leaderboard checked against profile tier/rank
      const isLeaderboardTop3 = (userProfile as any)?.tierLevel <= 3 ? 1 : 0;
      const isLeaderboardTop50 = (userProfile as any)?.tierLevel <= 50 ? 1 : 0;

      missionsSnap.forEach((child) => {
        const m = { id: child.key, ...child.val() } as Mission;
        let current = 0;
        if (m.type === 'play_matches') current = playCount;
        else if (m.type === 'booyah_matches') current = booyahCount;
        else if (m.type === 'spin_wheel') current = totalSpinsCount;
        else if (m.type === 'deposit_cash') current = depositCount;
        else if (m.type === 'withdraw_cash') current = withdrawCount;
        else if (m.type === 'leaderboard_rank') current = isLeaderboardTop3;
        else if (m.type === 'leaderboard_top50') current = isLeaderboardTop50;
        else if (m.type === 'profile_pic') current = hasAvatar;

        progressMap[m.id] = {
          current,
          claimed: !!claimedMap[m.id]
        };
      });

      setMissionProgress(progressMap);

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUserData();
  }, [currentUser, userProfile]);

  // Draw Canvas Wheel
  useEffect(() => {
    if (!canvasRef.current || sectors.length === 0) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const center = width / 2;
    const radius = center - 8;
    const sliceAngle = (2 * Math.PI) / sectors.length;

    ctx.clearRect(0, 0, width, height);

    sectors.forEach((sec, idx) => {
      const angle = currentAngle + idx * sliceAngle;

      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.arc(center, center, radius, angle, angle + sliceAngle);
      ctx.closePath();

      ctx.fillStyle = idx % 2 === 0 ? '#1E293B' : '#0F172A';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.stroke();

      ctx.save();
      ctx.translate(center, center);
      ctx.rotate(angle + sliceAngle / 2);
      ctx.textAlign = 'right';
      ctx.fillStyle = sec.isShowpiece ? '#64748B' : '#F8FAFC';
      ctx.font = 'bold 9px Poppins, sans-serif';
      
      let label = sec.label;
      if (label.length > 15) label = label.substring(0, 13) + '..';
      ctx.fillText(label, radius - 15, 3);
      ctx.restore();
    });

    ctx.beginPath();
    ctx.arc(center, center, 14, 0, 2 * Math.PI);
    ctx.fillStyle = 'var(--accent-color)';
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(center, center, radius, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.35)';
    ctx.lineWidth = 3;
    ctx.stroke();

  }, [sectors, currentAngle]);

  // Watch Ad simulation
  const handleWatchAd = () => {
    if (spinning) return;
    setAdCountdown(5);
    setAdLoadingText('Loading Sponsor Video...');
    setAdOverlayOpen(true);

    setTimeout(() => {
      setAdLoadingText('Sponsored Video Playing...');
    }, 1500);

    const countdownInterval = setInterval(() => {
      setAdCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownInterval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleCloseAd = async () => {
    if (adCountdown > 0) return;
    setAdOverlayOpen(false);

    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const userTrackingRef = ref(db, `users/${currentUser?.uid}/earningZoneTracking/${todayStr}`);
      
      const newAds = adsWatched + 1;
      await update(userTrackingRef, {
        adsCount: newAds
      });
      setAdsWatched(newAds);
      alert(`Ad watched! Ads count: ${newAds} / ${config.adCountRequired}.`);
    } catch (err: any) {
      console.error(err);
    }
  };

  // Spin Wheel trigger
  const handleSpin = async (method: 'ad' | 'coin') => {
    if (spinning || !currentUser || sectors.length === 0) return;
    setSpinError(null);
    setRewardMsg(null);

    if (spinsToday >= config.dailySpinLimit) {
      setSpinError('Daily spin limit reached. Come back tomorrow!');
      return;
    }

    if (method === 'ad' && adsWatched < config.adCountRequired) {
      setSpinError(`Watch ${config.adCountRequired} ads to get a free spin!`);
      return;
    }

    if (method === 'coin' && (userProfile?.balance || 0) < config.spinCoinCost) {
      setSpinError(`Insufficient balance. Spin cost is ₹${config.spinCoinCost}.`);
      return;
    }

    setSpinning(true);

    const availableSectors = sectors.filter(s => !s.isShowpiece);
    if (availableSectors.length === 0) {
      setSpinError('Error: No winnable slices found.');
      setSpinning(false);
      return;
    }

    const totalWeight = availableSectors.reduce((acc, curr) => acc + curr.winRate, 0);
    let rand = Math.random() * totalWeight;
    let winner = availableSectors[0];

    for (let i = 0; i < availableSectors.length; i++) {
      rand -= availableSectors[i].winRate;
      if (rand <= 0) {
        winner = availableSectors[i];
        break;
      }
    }

    const winIndex = sectors.findIndex(s => s.id === winner.id);
    const sliceAngle = (2 * Math.PI) / sectors.length;

    const targetAngle = 10 * Math.PI * 2 - (winIndex * sliceAngle) - (sliceAngle / 2) - (Math.PI / 2);
    
    let startAngle = currentAngle % (Math.PI * 2);
    let duration = 3000;
    let startTime: number | null = null;

    const animateWheel = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      const ease = 1 - Math.pow(1 - progress, 3);
      const angle = startAngle + (targetAngle - startAngle) * ease;
      
      setCurrentAngle(angle);

      if (progress < 1) {
        requestAnimationFrame(animateWheel);
      } else {
        processWinner(winner, method);
      }
    };

    requestAnimationFrame(animateWheel);
  };

  const processWinner = async (winItem: Sector, method: 'ad' | 'coin') => {
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const updates: any = {};

      if (method === 'coin') {
        await runTransaction(ref(db, `users/${currentUser?.uid}`), (prof) => {
          if (prof) {
            prof.balance = (prof.balance || 0) - config.spinCoinCost;
          }
          return prof;
        });

        const feeKey = push(ref(db, `transactions/${currentUser?.uid}`)).key;
        updates[`transactions/${currentUser?.uid}/${feeKey}`] = {
          type: 'earning_zone_spin_fee',
          amount: -config.spinCoinCost,
          description: `Earning Zone Lucky Spin Entry Fee`,
          timestamp: serverTimestamp()
        };
      } else {
        updates[`users/${currentUser?.uid}/earningZoneTracking/${todayStr}/adsCount`] = 0;
        setAdsWatched(0);
      }

      updates[`users/${currentUser?.uid}/earningZoneTracking/${todayStr}/spinsCount`] = spinsToday + 1;
      setSpinsToday(spinsToday + 1);

      const totalSpinsRef = ref(db, `users/${currentUser?.uid}/totalSpinsCounter`);
      let prevSpins = 0;
      const prevSpinsSnap = await get(totalSpinsRef);
      if (prevSpinsSnap.exists()) prevSpins = prevSpinsSnap.val();
      await set(totalSpinsRef, prevSpins + 1);

      if (winItem.type === 'coin') {
        await runTransaction(ref(db, `users/${currentUser?.uid}`), (prof) => {
          if (prof) {
            prof.balance = (prof.balance || 0) + winItem.value;
            prof.winningCash = (prof.winningCash || 0) + winItem.value;
            prof.totalEarnings = (prof.totalEarnings || 0) + winItem.value;
          }
          return prof;
        });

        const winKey = push(ref(db, `transactions/${currentUser?.uid}`)).key;
        updates[`transactions/${currentUser?.uid}/${winKey}`] = {
          type: 'earning_zone_spin_win',
          amount: winItem.value,
          description: `Lucky Spin Reward: ${winItem.label}`,
          timestamp: serverTimestamp()
        };

        setRewardMsg(`Congratulations! You won direct credit of ₹${winItem.value}! 💸`);
      } else {
        const claimRef = push(ref(db, 'earningZoneClaims'));
        await set(claimRef, {
          userId: currentUser?.uid,
          userName: userProfile?.displayName || currentUser?.email,
          userEmail: currentUser?.email,
          itemLabel: winItem.label,
          itemType: winItem.type,
          value: winItem.value || 0,
          timestamp: serverTimestamp(),
          status: 'pending'
        });

        setRewardMsg(`Congratulations! You won "${winItem.label}"! Admin will dispatch your voucher code soon. Check "My Vouchers" tab.`);
      }

      const logRef = push(ref(db, 'earningZoneHistory'));
      updates[`earningZoneHistory/${logRef.key}`] = {
        userId: currentUser?.uid,
        userName: userProfile?.displayName || currentUser?.email,
        userEmail: currentUser?.email,
        itemLabel: winItem.label,
        itemType: winItem.type,
        value: winItem.value,
        timestamp: serverTimestamp()
      };

      await update(ref(db), updates);
      fetchUserData();

    } catch (err: any) {
      alert('Error saving reward: ' + err.message);
    } finally {
      setSpinning(false);
    }
  };

  // Claim mission rewards
  const handleClaimMission = async (mId: string, amount: number, rType: 'coin' | 'bonus') => {
    if (claimLoadingId || !currentUser) return;
    setClaimLoadingId(mId);

    try {
      let alreadyClaimed = false;
      await runTransaction(ref(db, `users/${currentUser.uid}`), (prof) => {
        if (!prof) return prof;
        if (!prof.claimedMissions) {
          prof.claimedMissions = {};
        }
        if (prof.claimedMissions[mId] === true) {
          alreadyClaimed = true;
          return; // Aborts transaction
        }
        prof.claimedMissions[mId] = true;
        prof.balance = (prof.balance || 0) + amount;
        if (rType === 'coin') {
          prof.winningCash = (prof.winningCash || 0) + amount;
        } else {
          prof.bonusCash = (prof.bonusCash || 0) + amount;
        }
        return prof;
      });

      if (alreadyClaimed) {
        alert("This mission reward has already been claimed.");
        return;
      }

      const txRef = push(ref(db, `transactions/${currentUser.uid}`));
      await set(txRef, {
        type: 'mission_reward',
        amount: amount,
        description: `Mission Reward Claimed`,
        timestamp: serverTimestamp()
      });

      alert(`Claimed ₹${amount} reward successfully!`);
      fetchUserData();
    } catch (err: any) {
      alert('Claim failed: ' + err.message);
    } finally {
      setClaimLoadingId(null);
    }
  };

  // Claim milestone rewards
  const handleClaimMilestone = async (track: 'withdraw' | 'matches' | 'wins', amt: number) => {
    const claimKey = `${track}_${amt}`;
    if (claimingMilestoneKey || !currentUser) return;
    
    // Check if unlocked
    let currentValue = 0;
    let trackName = '';
    if (track === 'withdraw') {
      currentValue = totalWithdrawn;
      trackName = 'withdrawal';
    } else if (track === 'matches') {
      currentValue = totalMatches;
      trackName = 'matches completed';
    } else {
      currentValue = totalWins;
      trackName = 'match wins';
    }

    if (currentValue < amt) {
      alert(`Locked: You need ${amt} ${trackName} to claim this reward. Currently: ${currentValue}.`);
      return;
    }
    if (claimedMilestones[claimKey]) {
      alert(`Already Claimed: You have already claimed this milestone reward.`);
      return;
    }

    setClaimingMilestoneKey(claimKey);
    try {
      const trackConfig = milestonesConfig[track] || {};
      const reward = trackConfig[amt] || { label: `₹50 Coins`, type: 'coin', value: 50 };
      const updates: any = {};
      let alreadyClaimed = false;

      if (reward.type === 'coin') {
        // Direct coin payout to user balance
        await runTransaction(ref(db, `users/${currentUser.uid}`), (prof) => {
          if (!prof) return prof;
          if (!prof.claimedMilestones) {
            prof.claimedMilestones = {};
          }
          if (prof.claimedMilestones[claimKey] === true) {
            alreadyClaimed = true;
            return; // Aborts transaction
          }
          prof.claimedMilestones[claimKey] = true;
          prof.balance = (prof.balance || 0) + reward.value;
          prof.winningCash = (prof.winningCash || 0) + reward.value;
          prof.totalEarnings = (prof.totalEarnings || 0) + reward.value;
          return prof;
        });

        if (alreadyClaimed) {
          alert(`Already Claimed: You have already claimed this milestone reward.`);
          return;
        }

        const txKey = push(ref(db, `transactions/${currentUser.uid}`)).key;
        updates[`transactions/${currentUser.uid}/${txKey}`] = {
          type: 'earning_zone_milestone_win',
          amount: reward.value,
          description: `Milestone Reward: ${trackName} ${amt} checkpoint`,
          timestamp: serverTimestamp()
        };

        alert(`Congratulations! You claimed ₹${reward.value} coins directly to your wallet! 💸`);
      } else {
        // Voucher or custom reward: create a Claim ticket
        await runTransaction(ref(db, `users/${currentUser.uid}`), (prof) => {
          if (!prof) return prof;
          if (!prof.claimedMilestones) {
            prof.claimedMilestones = {};
          }
          if (prof.claimedMilestones[claimKey] === true) {
            alreadyClaimed = true;
            return; // Aborts transaction
          }
          prof.claimedMilestones[claimKey] = true;
          return prof;
        });

        if (alreadyClaimed) {
          alert(`Already Claimed: You have already claimed this milestone reward.`);
          return;
        }

        const claimRef = push(ref(db, 'earningZoneClaims'));
        await set(claimRef, {
          userId: currentUser.uid,
          userName: userProfile?.displayName || currentUser.email,
          userEmail: currentUser.email,
          itemLabel: reward.label,
          itemType: reward.type,
          value: reward.value || 0,
          timestamp: serverTimestamp(),
          status: 'pending'
        });

        alert(`Congratulations! You won "${reward.label}" for reaching the ${amt} ${trackName} checkpoint! Check "My Vouchers" once approved.`);
      }

      // Create history log entry
      const logRef = push(ref(db, 'earningZoneHistory'));
      updates[`earningZoneHistory/${logRef.key}`] = {
        userId: currentUser.uid,
        userName: userProfile?.displayName || currentUser.email,
        userEmail: currentUser.email,
        itemLabel: reward.label,
        itemType: reward.type,
        value: reward.value,
        timestamp: serverTimestamp(),
        milestoneTarget: amt,
        milestoneTrack: track
      };

      await update(ref(db), updates);
      fetchUserData();

    } catch (err: any) {
      alert('Claim milestone failed: ' + err.message);
    } finally {
      setClaimingMilestoneKey(null);
    }
  };

  return (
    <section className="section py-3 text-start position-relative">


      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: '16px' }}>
        {['wheel', 'missions', 'vouchers'].map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab as any)}
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab ? '2.5px solid var(--accent-color)' : '2.5px solid transparent',
              color: activeTab === tab ? '#F1F5F9' : '#64748B',
              padding: '10px 0',
              fontSize: '0.78rem',
              fontWeight: activeTab === tab ? 700 : 500,
              cursor: 'pointer'
            }}
          >
            {tab === 'wheel' && 'Lucky Spin'}
            {tab === 'missions' && 'Daily Missions'}
            {tab === 'vouchers' && 'My Vouchers'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="placeholder-glow py-5 rounded-3" style={{ height: '300px' }}></div>
      ) : (
        <>
          {/* TAB 1: Lucky Spin Wheel */}
          {activeTab === 'wheel' && (
            <div className="card custom-card p-4 text-center">
              {!config.wheelEnabled ? (
                <div className="py-4 text-secondary">
                  <i className="bi bi-slash-circle fs-1 d-block mb-2"></i>
                  Lucky Spin Wheel is currently disabled by administration.
                </div>
              ) : (
                <>
                  <h5 className="text-white mb-1"><i className="bi bi-gift-fill text-warning me-2"></i>Earning Lucky Wheel</h5>
                  <p className="text-secondary small mb-4">
                    Daily Limit: {spinsToday} / {config.dailySpinLimit} spins used today.
                  </p>

                  <div style={{ position: 'relative', width: '220px', height: '220px', margin: '0 auto 20px' }}>
                    <div style={{
                      position: 'absolute', top: '-10px', left: '50%',
                      transform: 'translateX(-50%)', zIndex: 10,
                      width: 0, height: 0,
                      borderLeft: '10px solid transparent',
                      borderRight: '10px solid transparent',
                      borderTop: '18px solid var(--accent-color)',
                      filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))'
                    }} />
                    <canvas 
                      ref={canvasRef} 
                      width="220" 
                      height="220" 
                      style={{ transition: spinning ? 'none' : 'transform 0.15s ease' }} 
                    />
                  </div>

                  {spinError && <div className="alert alert-danger py-2 small mb-3">{spinError}</div>}
                  {rewardMsg && (
                    <div className="alert alert-success py-2 border-0 rounded-2 small mb-3">
                      <div className="fw-semibold text-success">{rewardMsg}</div>
                    </div>
                  )}

                  <div className="d-flex flex-column gap-2" style={{ maxWidth: '280px', margin: '0 auto' }}>
                    <button
                      className="btn-custom btn-custom-accent py-2 w-100 font-semibold"
                      onClick={handleWatchAd}
                      disabled={spinning || spinsToday >= config.dailySpinLimit}
                    >
                      <i className="bi bi-play-btn-fill me-1.5"></i> Watch Ads ({adsWatched} / {config.adCountRequired})
                    </button>

                    {adsWatched >= config.adCountRequired && (
                      <button
                        className="btn btn-success py-2 w-100 fw-bold animate-pulse"
                        onClick={() => handleSpin('ad')}
                        disabled={spinning || spinsToday >= config.dailySpinLimit}
                      >
                        SPIN NOW (FREE)
                      </button>
                    )}

                    <button
                      className="btn btn-outline-warning py-2 w-100 fw-bold"
                      onClick={() => handleSpin('coin')}
                      disabled={spinning || spinsToday >= config.dailySpinLimit}
                    >
                      SPIN FOR ₹{config.spinCoinCost}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* TAB 2: Daily Missions */}
          {activeTab === 'missions' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {missions.length > 0 ? (
                  missions.map((m) => {
                    const progress = missionProgress[m.id] || { current: 0, claimed: false };
                    const percent = Math.min(100, (progress.current / m.targetValue) * 100);
                    const isCompleted = progress.current >= m.targetValue;

                    return (
                      <div
                        key={m.id}
                        style={{
                          background: 'rgba(255,255,255,0.015)',
                          border: '1px solid rgba(255,255,255,0.04)',
                          borderRadius: '8px',
                          padding: '12px 14px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '10px'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                          <div>
                            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#E2E8F0' }}>{m.title}</div>
                            <div style={{ fontSize: '0.64rem', color: '#64748B', marginTop: '2px' }}>
                              Reward: <span className="text-success fw-bold">₹{m.rewardAmount} {m.rewardType.toUpperCase()}</span>
                            </div>
                          </div>

                          {progress.claimed ? (
                            <span style={{ fontSize: '0.66rem', color: '#64748B', fontWeight: 600 }}>
                              <i className="bi bi-check-circle-fill text-success"></i> Claimed
                            </span>
                          ) : isCompleted ? (
                            <button
                              className="btn btn-xs btn-success py-1 px-3 text-xs fw-bold animate-pulse"
                              onClick={() => handleClaimMission(m.id, m.rewardAmount, m.rewardType)}
                              disabled={claimLoadingId === m.id}
                            >
                              {claimLoadingId === m.id ? 'Claiming...' : 'CLAIM'}
                            </button>
                          ) : (
                            <span style={{ fontSize: '0.66rem', color: '#64748B', fontWeight: 600 }}>
                              {progress.current} / {m.targetValue}
                            </span>
                          )}
                        </div>

                        {!progress.claimed && (
                          <div className="progress" style={{ height: '5px', background: 'rgba(255,255,255,0.05)', borderRadius: '99px' }}>
                            <div 
                              className="progress-bar bg-success"
                              style={{ 
                                width: `${percent}%`, 
                                transition: 'width 0.4s ease',
                                background: isCompleted ? 'var(--accent-color)' : ''
                              }} 
                            />
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-4 text-secondary custom-card">
                    <i className="bi bi-card-checklist fs-2 d-block mb-2"></i>
                    No daily missions active. Check back later!
                  </div>
                )}
              </div>

              {/* Milestone Checkpoints Section */}
              <div 
                className="mt-3"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px'
                }}
              >
                <style>{`
                  @keyframes goldSweep {
                    0% { left: -100%; }
                    100% { left: 200%; }
                  }
                  @keyframes sparkleGlitter {
                    0%, 100% { opacity: 0.2; transform: scale(0.6); }
                    50% { opacity: 1; transform: scale(1.2); }
                  }
                  .glitter-sparkle {
                    position: absolute;
                    width: 3px;
                    height: 3px;
                    background: #ffffff;
                    border-radius: 50%;
                    box-shadow: 0 0 5px #facc15, 0 0 2px #ffffff;
                    animation: sparkleGlitter 1.5s infinite ease-in-out;
                    pointer-events: none;
                    z-index: 6;
                  }
                `}</style>

                {[
                  { key: 'withdraw', label: 'Withdrawal Milestones', icon: 'bi bi-trophy-fill text-warning', unit: '₹', tracker: totalWithdrawn },
                  { key: 'matches', label: 'Matches Completed Milestones', icon: 'bi bi-controller text-info', unit: ' Matches', tracker: totalMatches },
                  { key: 'wins', label: 'Match Wins Checkpoints', icon: 'bi bi-shield-fill-check text-success', unit: ' Wins', tracker: totalWins }
                ].map((track) => {
                  const amounts = milestoneTracks[track.key as 'withdraw' | 'matches' | 'wins'] || [];
                  const trackConfig = milestonesConfig[track.key as 'withdraw' | 'matches' | 'wins'] || {};
                  
                  return (
                    <div 
                      key={track.key}
                      style={{
                        background: 'rgba(255,255,255,0.015)',
                        border: '1px solid rgba(255,255,255,0.04)',
                        borderRadius: '12px',
                        padding: '18px 16px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <h6 style={{ margin: 0, fontSize: '0.82rem', fontWeight: 700, color: '#f8fafc' }}>
                          <i className={`${track.icon} me-2`}></i>{track.label}
                        </h6>
                        <span style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--accent-color)' }}>
                          Total: {track.key === 'withdraw' ? `₹${track.tracker}` : `${track.tracker} ${track.key === 'wins' ? 'Wins' : 'Matches'}`}
                        </span>
                      </div>

                      {/* Horizontal scroll timeline wrapper */}
                      <div 
                        style={{
                          overflowX: 'auto',
                          paddingBottom: '12px',
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '0',
                          width: '100%'
                        }}
                      >
                        {amounts.map((amt, idx) => {
                          const isReached = track.tracker >= amt;
                          const claimKey = `${track.key}_${amt}`;
                          const isClaimed = claimedMilestones[claimKey] === true;
                          const reward = trackConfig[amt] || { label: '₹50 Coins', type: 'coin', value: 50 };
                          
                          // Connection line to next node
                          const nextAmt = amounts[idx + 1];
                          const isLineActive = track.tracker >= nextAmt;
                          const isVoucher = ['amazon', 'google_play', 'myntra'].includes(reward.type);

                          return (
                            <div key={amt} style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                              {/* Node block */}
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '120px', textAlign: 'center', flexShrink: 0 }}>
                                
                                {/* Checkpoint node Circle */}
                                <div 
                                  onClick={() => {
                                    if (isReached && !isClaimed) {
                                      handleClaimMilestone(track.key as any, amt);
                                    }
                                  }}
                                  style={{
                                    width: '44px',
                                    height: '44px',
                                    borderRadius: '0px',
                                    backgroundImage: isVoucher
                                      ? "url('/images/lucky_wheel_itembg_red.webp')"
                                      : "url('/images/lucky_wheel_itembg_white.webp')",
                                    backgroundSize: '100% 100%',
                                    backgroundRepeat: 'no-repeat',
                                    backgroundPosition: 'center',
                                    border: '0.5px solid #FACC15',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: (isReached && !isClaimed) ? 'pointer' : 'default',
                                    boxShadow: 'none',
                                    position: 'relative',
                                    zIndex: 2,
                                    transition: 'all 0.2s ease',
                                    overflow: 'hidden',
                                    filter: isReached ? 'none' : 'brightness(0.5) grayscale(40%)'
                                  }}
                                  className={isReached && !isClaimed ? 'animate-pulse' : ''}
                                >
                                  {/* Red glow & Golden light sweep sweep & glitter overlay for Vouchers */}
                                  {isVoucher && (
                                    <>
                                      <div className="glitter-sparkle" style={{ top: '6px', left: '10px', animationDelay: '0s' }} />
                                      <div className="glitter-sparkle" style={{ bottom: '8px', right: '12px', animationDelay: '0.4s' }} />
                                      <div className="glitter-sparkle" style={{ top: '24px', right: '6px', animationDelay: '0.8s' }} />
                                      <div style={{
                                        position: 'absolute',
                                        top: 0,
                                        left: '-100%',
                                        width: '40%',
                                        height: '100%',
                                        background: 'linear-gradient(90deg, transparent, rgba(255, 215, 0, 0.6), transparent)',
                                        transform: 'skewX(-25deg)',
                                        animation: 'goldSweep 2.5s infinite linear',
                                        pointerEvents: 'none',
                                        zIndex: 5
                                      }} />
                                    </>
                                  )}

                                  {isClaimed ? (
                                    <i className="bi bi-check-lg text-success fw-bold" style={{ fontSize: '1.1rem' }}></i>
                                  ) : isVoucher ? (
                                    (() => {
                                      const logoSrc = reward.type === 'amazon' 
                                        ? '/voucher_img/Amazon_icon.png' 
                                        : reward.type === 'myntra' 
                                        ? '/voucher_img/myntra-logo.webp' 
                                        : '/voucher_img/google-play.png';
                                      return (
                                        <img 
                                          src={logoSrc} 
                                          alt={reward.type}
                                          style={{ 
                                            width: '26px', 
                                            height: '26px', 
                                            objectFit: 'contain',
                                            filter: isReached ? 'none' : 'grayscale(100%) opacity(0.35)',
                                            borderRadius: '4px',
                                            position: 'relative',
                                            zIndex: 4
                                          }}
                                        />
                                      );
                                    })()
                                  ) : isReached ? (
                                    <i className="bi bi-gift-fill text-warning" style={{ fontSize: '1.05rem' }}></i>
                                  ) : (
                                    <i className="bi bi-gift-fill text-secondary" style={{ fontSize: '1.05rem', color: '#475569', opacity: 0.35 }}></i>
                                  )}
                                </div>

                                {/* Checkpoint Info Details */}
                                <div style={{ marginTop: '8px' }}>
                                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: isReached ? '#f8fafc' : '#64748b' }}>
                                    {track.key === 'withdraw' ? `₹${amt}` : `${amt} ${track.key === 'wins' ? 'Wins' : 'Matches'}`}
                                  </div>
                                  <div style={{ fontSize: '0.62rem', color: isClaimed ? '#64748b' : isReached ? '#34d399' : '#475569', fontWeight: 600, marginTop: '2px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '110px' }}>
                                    {reward.label}
                                  </div>
                                  
                                  {/* Action text indicator */}
                                  <div style={{ marginTop: '6px' }}>
                                    {isClaimed ? (
                                      <span style={{ fontSize: '0.58rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Claimed</span>
                                    ) : isReached ? (
                                      <button 
                                        onClick={() => handleClaimMilestone(track.key as any, amt)}
                                        disabled={claimingMilestoneKey === claimKey}
                                        style={{
                                          border: 'none',
                                          borderRadius: '4px',
                                          background: 'var(--accent-color)',
                                          color: '#0f172a',
                                          fontSize: '0.58rem',
                                          fontWeight: 800,
                                          padding: '2px 8px',
                                          textTransform: 'uppercase',
                                          cursor: 'pointer'
                                        }}
                                      >
                                        {claimingMilestoneKey === claimKey ? '...' : 'Claim'}
                                      </button>
                                    ) : (
                                      <span style={{ fontSize: '0.55rem', color: '#475569', fontWeight: 600 }}>Locked</span>
                                    )}
                                  </div>
                                </div>

                              </div>

                              {/* Connection Line Segment to next checkpoint */}
                              {idx < amounts.length - 1 && (
                                <div 
                                  style={{
                                    position: 'absolute',
                                    top: '20px',
                                    left: '82px',
                                    width: '76px',
                                    height: '4px',
                                    background: isLineActive 
                                      ? 'linear-gradient(to right, var(--accent-color), #34d399)' 
                                      : isReached 
                                      ? 'rgba(250, 204, 21, 0.3)' 
                                      : 'rgba(255, 255, 255, 0.05)',
                                    zIndex: 1
                                  }}
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: My Vouchers */}
          {activeTab === 'vouchers' && (
            <div>
              <style>{`
                .voucher-premium-card {
                  position: relative;
                  background: #1e293b;
                  border: 1px solid rgba(255, 255, 255, 0.08);
                  border-radius: 16px;
                  overflow: hidden;
                  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                }
                .voucher-premium-card:hover {
                  transform: translateY(-2px);
                  border-color: rgba(255, 255, 255, 0.15);
                  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.3);
                }
                .v-glow-dot {
                  width: 6px;
                  height: 6px;
                  border-radius: 50%;
                  display: inline-block;
                  margin-right: 6px;
                }
                .v-glow-dot.ready {
                  background: #10b981;
                  box-shadow: 0 0 8px #10b981;
                }
                .v-glow-dot.pending {
                  background: #f59e0b;
                  box-shadow: 0 0 8px #f59e0b;
                }
                .v-copy-btn {
                  background: rgba(255, 255, 255, 0.07);
                  border: 1px solid rgba(255, 255, 255, 0.1);
                  color: #e2e8f0;
                  border-radius: 8px;
                  padding: 6px 12px;
                  font-size: 0.75rem;
                  font-weight: 600;
                  cursor: pointer;
                  transition: all 0.2s ease;
                }
                .v-copy-btn:hover {
                  background: rgba(255, 255, 255, 0.15);
                  color: #ffffff;
                }
                .logo-img-wrapper {
                  width: 120px;
                  height: 48px;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  background: transparent;
                }
                .logo-img-wrapper img {
                  max-width: 100%;
                  max-height: 100%;
                  object-fit: contain;
                }
              `}</style>

              {userVouchers.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {userVouchers.map((v) => {
                    const isPending = v.status === 'pending';
                    const dateStr = new Date(v.timestamp).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });

                    type BK = 'amazon' | 'google_play' | 'myntra' | 'diamond' | 'default';
                    const BM: Record<BK, { accent: string; tag: string; logoImg?: string; logoEmoji: string; logoFilter?: string; }> = {
                      amazon: {
                        accent: '#FF9900',
                        tag: 'Amazon Pay',
                        logoImg: '/voucher_img/Amazon_logo.svg.webp',
                        logoEmoji: '🛒',
                        logoFilter: 'brightness(0) invert(1)',
                      },
                      google_play: {
                        accent: '#00E676',
                        tag: 'Google Play',
                        logoImg: '/voucher_img/Google_Play_2022_logo.svg.webp',
                        logoEmoji: '▶',
                      },
                      myntra: {
                        accent: '#FF4D8D',
                        tag: 'Myntra',
                        logoImg: '/voucher_img/Myntra_logo.png',
                        logoEmoji: 'M',
                      },
                      diamond: {
                        accent: '#00E5FF',
                        tag: 'Game Diamonds',
                        logoEmoji: '💎',
                      },
                      default: {
                        accent: '#94A3B8',
                        tag: 'Gift Voucher',
                        logoEmoji: '🎁',
                      },
                    };

                    const bk: BK = (['amazon','google_play','myntra','diamond'] as BK[]).includes(v.itemType as BK)
                      ? v.itemType as BK : 'default';
                    const b = BM[bk];

                    const getVoucherValue = (claim: Claim) => {
                      if (claim.value !== undefined && claim.value > 0) return claim.value;
                      const numMatch = claim.itemLabel.match(/\d+/);
                      return numMatch ? parseInt(numMatch[0], 10) : 50;
                    };

                    return (
                      <div
                        key={v.id}
                        className="voucher-premium-card"
                        style={{
                          borderLeft: `4px solid ${b.accent}`,
                        }}
                      >
                        <div style={{ padding: '20px' }}>
                          {/* Top Row: Date, Status on Left | Rupees Value on Right */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                background: isPending ? 'rgba(245, 158, 11, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                                padding: '4px 10px',
                                borderRadius: '20px',
                                fontSize: '0.7rem',
                                fontWeight: 600,
                                color: isPending ? '#fbbf24' : '#34d399',
                                border: `1px solid ${isPending ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.2)'}`
                              }}>
                                <span className={`v-glow-dot ${isPending ? 'pending' : 'ready'}`}></span>
                                {isPending ? 'Pending' : 'Ready'}
                              </div>
                              <span style={{ fontSize: '0.65rem', color: '#64748b' }}>
                                Claimed on {dateStr}
                              </span>
                            </div>
                            <div style={{
                              fontSize: '1.75rem',
                              fontWeight: 900,
                              background: `linear-gradient(135deg, ${b.accent} 0%, #ffffff 100%)`,
                              WebkitBackgroundClip: 'text',
                              WebkitTextFillColor: 'transparent',
                            }}>
                              ₹{getVoucherValue(v)}
                            </div>
                          </div>

                          {/* Middle Row: Transparent Logo (No Label details) */}
                          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
                            <div className="logo-img-wrapper">
                              {b.logoImg ? (
                                <img
                                  src={b.logoImg}
                                  alt={bk}
                                  style={{
                                    filter: b.logoFilter || 'none',
                                  }}
                                />
                              ) : (
                                <span style={{ fontSize: '2rem' }}>{b.logoEmoji}</span>
                              )}
                            </div>
                          </div>

                          {/* Bottom Row: Code or Pending Status */}
                          {!isPending ? (
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              background: '#0f172a',
                              border: '1px solid rgba(255, 255, 255, 0.05)',
                              borderRadius: '10px',
                              padding: '10px 14px',
                              gap: '12px',
                            }}>
                              <div style={{ display: 'flex', gap: '24px', flex: 1, minWidth: 0, alignItems: 'center' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                                  <span style={{ fontSize: '0.6rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>
                                    Redeem Code
                                  </span>
                                  <span style={{
                                    fontFamily: 'monospace',
                                    fontSize: '0.95rem',
                                    fontWeight: 700,
                                    color: '#ffffff',
                                    letterSpacing: '1px',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis'
                                  }}>
                                    {v.voucherCode}
                                  </span>
                                </div>
                                {v.pinEnabled && v.voucherPin && (
                                  <div style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    borderLeft: '1px solid rgba(255, 255, 255, 0.1)',
                                    paddingLeft: '20px',
                                    flexShrink: 0,
                                  }}>
                                    <span style={{ fontSize: '0.6rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>
                                      PIN
                                    </span>
                                    <span style={{
                                      fontFamily: 'monospace',
                                      fontSize: '0.95rem',
                                      fontWeight: 700,
                                      color: b.accent,
                                      letterSpacing: '1px',
                                    }}>
                                      {v.voucherPin}
                                    </span>
                                  </div>
                                )}
                              </div>
                              <button
                                className="v-copy-btn"
                                style={{ flexShrink: 0 }}
                                onClick={() => {
                                  navigator.clipboard.writeText(v.voucherCode || '');
                                  alert('Redeem code copied!');
                                }}
                              >
                                <i className="bi bi-clipboard me-1"></i> Copy
                              </button>
                            </div>
                          ) : (
                            <div style={{
                              background: 'rgba(255, 255, 255, 0.02)',
                              border: '1px dashed rgba(255, 255, 255, 0.08)',
                              borderRadius: '10px',
                              padding: '12px',
                              textAlign: 'center',
                              fontSize: '0.75rem',
                              color: '#94a3b8'
                            }}>
                              <i className="bi bi-hourglass-split me-1" style={{ color: b.accent }}></i>
                              Generating redeem code. Usually approved within 2-4 hours.
                            </div>
                          )}

                          {v.adminNote && (
                            <div style={{
                              marginTop: '12px',
                              fontSize: '0.7rem',
                              color: '#94a3b8',
                              background: 'rgba(255, 255, 255, 0.02)',
                              padding: '8px 12px',
                              borderRadius: '8px',
                              border: '1px solid rgba(255, 255, 255, 0.04)'
                            }}>
                              <strong style={{ color: b.accent }}>Note: </strong> {v.adminNote}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{
                  textAlign: 'center',
                  padding: '48px 24px',
                  background: '#1e293b',
                  borderRadius: '16px',
                  border: '1px dashed rgba(255, 255, 255, 0.08)'
                }}>
                  <div style={{ fontSize: '3rem', marginBottom: '12px' }}>🎫</div>
                  <div style={{ fontWeight: 700, color: '#e2e8f0', fontSize: '1rem', marginBottom: '6px' }}>No Vouchers Yet</div>
                  <div style={{ color: '#64748b', fontSize: '0.8rem' }}>Spin the wheel to win exclusive gift cards & redeem codes!</div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Simulated Advertisement Overlay */}
      {adOverlayOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: '#070C15', zIndex: 10000,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            width: '100%', maxWidth: '380px',
            background: 'linear-gradient(135deg, #0f172a 0%, #020617 100%)',
            border: '1px solid var(--accent-color)',
            borderRadius: '12px',
            position: 'relative',
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 0 20px rgba(250, 204, 21, 0.15)',
            aspectRatio: '9 / 16'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px', background: 'rgba(0,0,0,0.4)', zIndex: 2 }}>
              <span style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 600 }}>Sponsored Video Ad</span>
              <span style={{ fontSize: '0.7rem', color: '#FACC15', fontWeight: 700 }}>
                {adCountdown > 0 ? `Reward in ${adCountdown}s` : 'Ready to claim reward!'}
              </span>
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 2, padding: '30px' }}>
              <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'rgba(250,204,21,0.06)', border: '2px solid #FACC15', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FACC15', fontSize: '1.5rem', marginBottom: '16px' }} className="animate-pulse">
                <i className="bi bi-play-fill"></i>
              </div>
              <h5 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#E2E8F0', margin: '0 0 8px', textAlign: 'center' }}>
                Gamer Arena App Sponsor
              </h5>
              <p style={{ fontSize: '0.74rem', color: '#64748B', textAlign: 'center', margin: 0 }}>
                Download & play daily games to win real cash prizes instantly!
              </p>
            </div>

            <div style={{ padding: '14px', background: 'rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', gap: '8px', zIndex: 2 }}>
              <div style={{ fontSize: '0.64rem', color: '#94A3B8', textAlign: 'center' }}>
                {adLoadingText}
              </div>
              <button
                type="button"
                onClick={handleCloseAd}
                disabled={adCountdown > 0}
                style={{
                  width: '100%',
                  background: adCountdown > 0 ? 'rgba(255,255,255,0.05)' : 'var(--accent-color)',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '10px',
                  color: adCountdown > 0 ? '#64748B' : '#0F172A',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: adCountdown > 0 ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                {adCountdown > 0 ? `Skip in ${adCountdown}s` : 'Claim reward & close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default EarningZone;