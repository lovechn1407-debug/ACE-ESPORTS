import React, { useEffect, useState } from 'react';
import { 
  ref, 
  get, 
  set, 
  update, 
  push, 
  query, 
  orderByChild, 
  equalTo, 
  runTransaction,
  serverTimestamp 
} from 'firebase/database';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';

interface TournamentsProps {
  gameId: string;
  gameName: string;
  onOpenChat: (tournamentId: string, tournamentName: string) => void;
  onBack: () => void;
  initialSelectedTournamentId?: string | null;
  initialModalType?: 'rules' | 'players' | 'idpass' | null;
}

interface Tournament {
  id: string;
  name: string;
  gameId: string;
  mode: string;
  map?: string;
  entryFee: number;
  perKillPrize: number;
  prizePool: number;
  startTime: number;
  status: 'upcoming' | 'ongoing' | 'completed' | 'result' | 'cancelled';
  bannerUrl?: string;
  maxPlayers?: number;
  description?: string;
  prizeDistribution?: Record<string, any> | string;
  roomId?: string;
  roomPassword?: string;
  showIdPass?: boolean;
  registeredPlayers?: Record<string, any>;
  fullResults?: any[];
}

const IMGBB_API_KEY = '17524c13e2cca244c03f6ad0db42e5e0';

const Tournaments: React.FC<TournamentsProps> = ({ 
  gameId, 
  gameName, 
  onOpenChat, 
  onBack,
  initialSelectedTournamentId = null,
  initialModalType = null
}) => {
  const { currentUser, userProfile } = useAuth();

  useEffect(() => {
    console.log('Loading matches for', gameName, 'back action:', !!onBack);
  }, [gameName, onBack]);

  const [activeTab, setActiveTab] = useState<'upcoming' | 'ongoing' | 'completed'>('upcoming');
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [registrationMode, setRegistrationMode] = useState<'manual' | 'api'>('manual');

  // Modal active objects
  const [selectedTourney, setSelectedTourney] = useState<Tournament | null>(null);
  
  // Modals visibility toggles
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showIdPassModal, setShowIdPassModal] = useState(false);
  const [showPlayersModal, setShowPlayersModal] = useState(false);
  const [showResultsModal, setShowResultsModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);

  // Join Tournament form states
  const [joinUsername, setJoinUsername] = useState('');
  const [joinGameUid, setJoinGameUid] = useState('');
  const [joinTeammateName, setJoinTeammateName] = useState('');
  const [joinTeammateUid, setJoinTeammateUid] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discount: number } | null>(null);
  const [couponMsg, setCouponMsg] = useState<{ text: string; type: 'success' | 'danger' } | null>(null);
  const [joinMsg, setJoinMsg] = useState<string>('');
  const [joinLoading, setJoinLoading] = useState(false);

  // UID Fetch / Player Info states
  const [fetchedPlayer, setFetchedPlayer] = useState<{
    nickname: string;
    level: number;
    rankingName: string;
    banStatus: string;
    region: string;
    levelProgress: string;
  } | null>(null);
  const [fetchingUid, setFetchingUid] = useState(false);
  const [fetchError, setFetchError] = useState<string>('');

  // Players list state
  const [registeredPlayersList, setRegisteredPlayersList] = useState<any[]>([]);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [resultsPlayersList, setResultsPlayersList] = useState<any[]>([]);
  const [loadingResults, setLoadingResults] = useState(false);

  // Reporting states
  const [accusedPlayerUid, setAccusedPlayerUid] = useState('');
  const [reportType, setReportType] = useState('');
  const [reportDesc, setReportDesc] = useState('');
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [reportMsg, setReportMsg] = useState<{ text: string; type: 'success' | 'danger' } | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  // Fetch tournaments + settings
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [tourneysSnap, settingsSnap] = await Promise.all([
          get(query(ref(db, 'tournaments'), orderByChild('gameId'), equalTo(gameId))),
          get(ref(db, 'settings/registrationMode'))
        ]);

        if (settingsSnap.exists()) {
          setRegistrationMode(settingsSnap.val() as 'manual' | 'api');
        }

        if (tourneysSnap.exists()) {
          const list: Tournament[] = Object.entries(tourneysSnap.val())
            .map(([id, val]: any) => ({ id, ...val }))
            .filter((t: any) => {
              if (activeTab === 'upcoming') return t.status === 'upcoming';
              if (activeTab === 'ongoing') return t.status === 'ongoing';
              return t.status === 'completed' || t.status === 'result' || t.status === 'cancelled';
            });

          list.sort((a, b) => {
            if (activeTab === 'upcoming') return a.startTime - b.startTime;
            return b.startTime - a.startTime;
          });

          setSetTournaments(list);
        } else {
          setSetTournaments([]);
        }
      } catch (err) {
        console.error('Error loading tournaments:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [gameId, activeTab]);

  // Hacky wrapper to fix state type checks
  const setSetTournaments = (val: Tournament[]) => {
    setTournaments(val);
  };

  const getTimeRemaining = (startTime: number) => {
    const diff = startTime - Date.now();
    if (diff <= 0) return 'Starting Soon';
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    let out = '';
    if (days > 0) out += `${days}d `;
    if (hours > 0 || days > 0) out += `${hours}h `;
    out += `${minutes}m`;
    return out.trim();
  };

  // Open Details Modal
  const handleOpenDetails = (t: Tournament) => {
    setSelectedTourney(t);
    setShowDetailsModal(true);
  };

  // Open ID & Password Modal
  const handleOpenIdPass = (t: Tournament) => {
    setSelectedTourney(t);
    setShowIdPassModal(true);
  };

  // Fetch and Open Players Modal
  const handleOpenPlayers = async (t: Tournament) => {
    setSelectedTourney(t);
    setShowPlayersModal(true);
    setLoadingPlayers(true);
    setRegisteredPlayersList([]);
    try {
      const playersRef = ref(db, `tournaments/${t.id}/registeredPlayers`);
      const snapshot = await get(playersRef);
      if (snapshot.exists()) {
        const playersData = snapshot.val();
        const uids = Object.keys(playersData);
        
        const promises = uids.map(uid => get(ref(db, `users/${uid}`)));
        const snaps = await Promise.all(promises);

        const list = snaps.map((s, idx) => {
          const uid = uids[idx];
          if (s.exists()) {
            return {
              uid,
              displayName: s.val().displayName || 'Player',
              photoURL: s.val().photoURL,
              appliedBadgeUrl: s.val().appliedBadgeUrl || '',
              username: playersData[uid].username,
              gameUid: playersData[uid].gameUid
            };
          }
          return {
            uid,
            displayName: 'Unknown Player',
            username: playersData[uid].username,
            gameUid: playersData[uid].gameUid,
            appliedBadgeUrl: ''
          };
        });
        setRegisteredPlayersList(list);
      }
    } catch (err) {
      console.error('Error fetching registered players:', err);
    } finally {
      setLoadingPlayers(false);
    }
  };

  // Open Results Modal
  const handleOpenResults = async (t: Tournament) => {
    setSelectedTourney(t);
    setShowResultsModal(true);
    setLoadingResults(true);
    setResultsPlayersList([]);
    try {
      const raw = t.fullResults || [];
      if (raw.length > 0) {
        const promises = raw.map(p => get(ref(db, `users/${p.uid}`)));
        const snaps = await Promise.all(promises);
        const list = raw.map((p, idx) => {
          const s = snaps[idx];
          return {
            ...p,
            photoURL: s.exists() ? (s.val().photoURL || p.photoURL) : p.photoURL,
            appliedBadgeUrl: s.exists() ? (s.val().appliedBadgeUrl || '') : ''
          };
        });
        list.sort((a, b) => (a.rank || 999) - (b.rank || 999));
        setResultsPlayersList(list);
      }
    } catch (err) {
      console.error('Error fetching results users metadata:', err);
    } finally {
      setLoadingResults(false);
    }
  };

  // Open Report Modal
  const handleOpenReport = () => {
    setAccusedPlayerUid('');
    setReportType('');
    setReportDesc('');
    setEvidenceFile(null);
    setReportMsg(null);
    setShowResultsModal(false);
    setShowReportModal(true);
  };

  // Apply Coupon
  const handleApplyCoupon = async () => {
    const code = couponCode.toUpperCase().trim();
    if (!code || !selectedTourney) {
      setCouponMsg({ text: 'Please enter a code.', type: 'danger' });
      return;
    }
    setCouponMsg(null);

    try {
      const [cSnap, uSnap] = await Promise.all([
        get(ref(db, `coupons/${code}`)),
        get(ref(db, `users/${currentUser?.uid}/usedCoupons/${code}`))
      ]);

      if (!cSnap.exists()) throw new Error('Invalid coupon code.');
      const coupon = cSnap.val();

      if (coupon.status !== 'active') throw new Error('This coupon is inactive.');
      if ((coupon.timesUsed || 0) >= coupon.maxUses) throw new Error('Coupon has reached its limit.');
      if (uSnap.exists()) throw new Error('You have already used this coupon.');
      if (selectedTourney.entryFee < coupon.minEntryFee) {
        throw new Error(`Minimum entry fee for this code is ₹${coupon.minEntryFee}.`);
      }

      let discount = 0;
      if (coupon.discountType === 'percentage') {
        discount = (selectedTourney.entryFee * coupon.discountValue) / 100;
      } else {
        discount = coupon.discountValue;
      }

      setAppliedCoupon({ code, discount });
      setCouponMsg({ 
        text: `Success! ₹${discount.toFixed(2)} discount applied.`, 
        type: 'success' 
      });
    } catch (err: any) {
      setCouponMsg({ text: err.message || 'Coupon verification failed.', type: 'danger' });
      setAppliedCoupon(null);
    }
  };

  // Fetch Player Info from API
  const handleFetchPlayerInfo = async () => {
    const uid = joinGameUid.trim();
    if (!uid) {
      setFetchError('Please enter your game UID first.');
      return;
    }
    setFetchingUid(true);
    setFetchError('');
    setFetchedPlayer(null);

    try {
      const res = await fetch(`https://info.killersharmabot.online/player-info?uid=${uid}`);
      if (!res.ok) throw new Error('Failed to fetch player info. Check UID.');
      const data = await res.json();
      const info = data?.basicInfo;
      if (!info) throw new Error('Invalid response from server.');

      setFetchedPlayer({
        nickname: info.nickname || 'Unknown',
        level: info.level || 0,
        rankingName: info.rankingName || 'Unranked',
        banStatus: info.banStatus || 'Normal',
        region: info.region || 'N/A',
        levelProgress: info.levelProgress || '0%'
      });

      // Auto-fill the username with the fetched nickname
      if (info.banStatus !== 'Banned') {
        setJoinUsername(info.nickname || '');
      }
    } catch (err: any) {
      setFetchError(err.message || 'Could not fetch player data.');
    } finally {
      setFetchingUid(false);
    }
  };

  // Open Join Form Modal
  const handleOpenJoin = (t: Tournament) => {
    if (!currentUser) {
      alert('Please login to join.');
      return;
    }
    setSelectedTourney(t);
    setJoinUsername('');
    setJoinGameUid('');
    setJoinTeammateName('');
    setJoinTeammateUid('');
    setCouponCode('');
    setAppliedCoupon(null);
    setCouponMsg(null);
    setJoinMsg('');
    setFetchedPlayer(null);
    setFetchError('');
    setShowJoinModal(true);
  };

  // Submit Join Registration Transaction
  const handleJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTourney || !currentUser || !userProfile) return;

    const fee = selectedTourney.entryFee;
    const isDuo = selectedTourney.mode === 'Duo';
    
    let totalFee = isDuo ? fee * 2 : fee;
    if (appliedCoupon) {
      totalFee = Math.max(0, totalFee - appliedCoupon.discount);
    }

    if (!joinUsername.trim() || !joinGameUid.trim()) {
      setJoinMsg('In-Game Username and UID are required.');
      return;
    }

    if (isDuo && (!joinTeammateName.trim() || !joinTeammateUid.trim())) {
      setJoinMsg("Teammate's details are required for Duo mode.");
      return;
    }

    setJoinLoading(true);
    setJoinMsg('');

    const userRef = ref(db, `users/${currentUser.uid}`);

    try {
      await runTransaction(userRef, (profData) => {
        if (!profData) throw new Error('User profile not found.');
        if ((profData.balance || 0) < totalFee) throw new Error('Insufficient balance.');
        if (profData.joinedTournaments?.[selectedTourney.id]) {
          throw new Error('You have already joined this match.');
        }

        profData.balance = (profData.balance || 0) - totalFee;
        if (!profData.joinedTournaments) profData.joinedTournaments = {};
        profData.joinedTournaments[selectedTourney.id] = true;

        if (appliedCoupon) {
          if (!profData.usedCoupons) profData.usedCoupons = {};
          profData.usedCoupons[appliedCoupon.code] = true;
        }

        return profData;
      });

      // Write registration record to tournament node
      const registrationData: any = {
        joinedAt: serverTimestamp(),
        username: joinUsername.trim(),
        gameUid: joinGameUid.trim(),
        amountPaid: totalFee
      };

      if (isDuo) {
        registrationData.teammateUsername = joinTeammateName.trim();
        registrationData.teammateGameUid = joinTeammateUid.trim();
      }

      const updates: any = {};
      updates[`tournaments/${selectedTourney.id}/registeredPlayers/${currentUser.uid}`] = registrationData;

      if (appliedCoupon) {
        // Increment coupon timesUsed
        const couponRef = ref(db, `coupons/${appliedCoupon.code}/timesUsed`);
        await runTransaction(couponRef, (count) => (count || 0) + 1);
      }

      await update(ref(db), updates);

      // Record transaction
      const txKey = push(ref(db, `transactions/${currentUser.uid}`)).key;
      await set(ref(db, `transactions/${currentUser.uid}/${txKey}`), {
        type: 'tournament_join',
        amount: -totalFee,
        description: `Joined match: ${selectedTourney.name}`,
        timestamp: serverTimestamp(),
        balanceAfter: (userProfile.balance || 0) - totalFee,
        tournamentId: selectedTourney.id
      });

      alert(`Successfully registered! ₹${totalFee.toFixed(2)} deducted.`);
      setShowJoinModal(false);

      // Refresh list
      const tRef = ref(db, `tournaments/${selectedTourney.id}`);
      const snap = await get(tRef);
      if (snap.exists()) {
        const updated = { id: selectedTourney.id, ...snap.val() };
        setSetTournaments(tournaments.map(x => x.id === selectedTourney.id ? updated : x));
      }
    } catch (err: any) {
      console.error(err);
      setJoinMsg(err.message || 'Registration failed.');
    } finally {
      setJoinLoading(false);
    }
  };

  // Submit Player Cheating Report
  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTourney || !currentUser || !userProfile || !accusedPlayerUid) return;

    setReportLoading(true);
    setReportMsg(null);
    let imageUrl = null;

    try {
      if (evidenceFile) {
        const formData = new FormData();
        formData.append('image', evidenceFile);
        const resp = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
          method: 'POST',
          body: formData
        });
        const data = await resp.json();
        if (data.success) {
          imageUrl = data.data.url;
        } else {
          throw new Error(data.error?.message || 'Evidence upload failed.');
        }
      }

      const selectedName = selectedTourney.fullResults?.find(x => x.uid === accusedPlayerUid)?.displayName || 'Player';

      const reportData = {
        reporterUid: currentUser.uid,
        reporterName: userProfile.displayName,
        reportType: reportType,
        description: reportDesc,
        imageUrl: imageUrl,
        timestamp: serverTimestamp(),
        status: 'pending'
      };

      const accusedPlayerRef = ref(db, `reports/${selectedTourney.id}/${accusedPlayerUid}`);
      
      // Update details once
      await update(accusedPlayerRef, {
        accusedPlayerName: selectedName,
        status: 'pending'
      });

      // Push report entry
      const reportListRef = ref(db, `reports/${selectedTourney.id}/${accusedPlayerUid}/reports`);
      const newReportRef = push(reportListRef);
      await set(newReportRef, reportData);

      setReportMsg({ text: 'Report submitted successfully!', type: 'success' });
      setTimeout(() => setShowReportModal(false), 2000);
    } catch (err: any) {
      console.error(err);
      setReportMsg({ text: err.message || 'Failed to submit report.', type: 'danger' });
    } finally {
      setReportLoading(false);
    }
  };

  // Trigger auto-open modals if deep-linked from home battles list
  useEffect(() => {
    if (tournaments.length > 0 && initialSelectedTournamentId) {
      const match = tournaments.find(x => x.id === initialSelectedTournamentId);
      if (match) {
        setSelectedTourney(match);
        if (initialModalType === 'rules') {
          setShowDetailsModal(true);
        } else if (initialModalType === 'players') {
          handleOpenPlayers(match);
        } else if (initialModalType === 'idpass') {
          setShowIdPassModal(true);
        }
      }
    }
  }, [tournaments, initialSelectedTournamentId, initialModalType]);

  return (
    <section className="section">
      {/* Tabs list */}
      <div className="tournament-tabs">
        <button 
          className={`tab-item ${activeTab === 'upcoming' ? 'active' : ''}`}
          onClick={() => setActiveTab('upcoming')}
        >
          <i className="bi bi-calendar-event-fill"></i> Upcoming
        </button>
        <button 
          className={`tab-item ${activeTab === 'ongoing' ? 'active' : ''}`}
          onClick={() => setActiveTab('ongoing')}
        >
          <i className="bi bi-play-circle-fill"></i> Ongoing
        </button>
        <button 
          className={`tab-item ${activeTab === 'completed' ? 'active' : ''}`}
          onClick={() => setActiveTab('completed')}
        >
          <i className="bi bi-trophy-fill"></i> Results
        </button>
      </div>

      {loading ? (
        <div className="placeholder-glow py-5 rounded-3" style={{ height: '300px' }}></div>
      ) : (
        <div className="tournaments-list">
          {tournaments.length > 0 ? (
            tournaments.map(t => {
              const regCount = t.registeredPlayers ? Object.keys(t.registeredPlayers).length : 0;
              const maxP = t.maxPlayers || 0;
              const spotsL = maxP > 0 ? Math.max(0, maxP - regCount) : Infinity;
              const isFull = maxP > 0 && spotsL <= 0;
              const isJoined = currentUser && userProfile?.joinedTournaments?.[t.id];
              const showIdBtn = t.status === 'ongoing' || 
                (t.status === 'upcoming' && t.showIdPass && Date.now() > t.startTime - 900000);

              let timerTxt = t.status?.toUpperCase() || 'N/A';
              if (t.status === 'upcoming') timerTxt = getTimeRemaining(t.startTime);
              else if (t.status === 'ongoing') timerTxt = 'LIVE';
              else if (t.status === 'completed' || t.status === 'result') timerTxt = 'ENDED';

              let spotsTxt = 'Unlimited Spots';
              let progP = 0;
              if (maxP > 0) {
                spotsTxt = `${spotsL} Spots Left (${regCount}/${maxP})`;
                progP = Math.min(100, (regCount / maxP) * 100);
              }

              const bannerUrl = t.bannerUrl || 'https://via.placeholder.com/400x225/1E293B/94A3B8?text=16:9+Banner';

              return (
                <div className="tournament-card" key={t.id}>
                  <img src={bannerUrl} alt="Tournament Banner" className="tournament-banner-image" />
                  
                  <div className="tournament-card-content">
                    <div className="tournament-card-header">
                      <div className="tournament-card-tags">
                        {t.mode && <span>{t.mode}</span>}
                        {t.map && <span>{t.map}</span>}
                      </div>
                      <div className="tournament-card-timer">{timerTxt}</div>
                    </div>
                    
                    <h3 className="tournament-card-title">
                      <i className="bi bi-joystick text-accent"></i> {t.name}
                    </h3>
                    
                    <p className="small text-secondary mb-2">
                      <i className="bi bi-calendar-event"></i> {new Date(t.startTime).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                    </p>
                    
                    <div className="tournament-card-info">
                      <div className="info-item">
                        <span>Prize Pool</span>
                        <strong><i className="bi bi-trophy-fill text-accent prize-icon"></i> ₹{t.prizePool}</strong>
                      </div>
                      <div className="info-item">
                        <span>Per Kill</span>
                        <strong>₹{t.perKillPrize}</strong>
                      </div>
                      <div className="info-item">
                        <span>Entry Fee</span>
                        <strong className={t.entryFee > 0 ? 'text-info' : ''}>
                          {t.entryFee > 0 ? `₹${t.entryFee}` : 'Free'}
                        </strong>
                      </div>
                    </div>

                    {maxP > 0 && (
                      <div className="tournament-card-spots">
                        <div className="d-flex justify-content-between mb-1">
                          <span>{spotsTxt}</span>
                        </div>
                        <div className="progress">
                          <div 
                            className="progress-bar" 
                            style={{ width: `${progP}%` }}
                          ></div>
                        </div>
                      </div>
                    )}

                    <div className="tournament-card-actions">
                      <button 
                        className="btn-custom btn-custom-secondary btn-sm"
                        onClick={() => handleOpenDetails(t)}
                      >
                        Rules
                      </button>

                      {isJoined ? (
                        <>
                          <button 
                            className="btn-custom btn-custom-primary btn-sm btn-view-players"
                            onClick={() => handleOpenPlayers(t)}
                          >
                            <i className="bi bi-eye-fill"></i> View Players
                          </button>
                          
                          {(t.status === 'upcoming' || t.status === 'ongoing') && (
                            <button 
                              className="btn-custom btn-custom-secondary btn-sm btn-chat"
                              onClick={() => onOpenChat(t.id, t.name)}
                            >
                              <i className="bi bi-chat-dots-fill"></i> Chat
                            </button>
                          )}
                        </>
                      ) : t.status === 'upcoming' ? (
                        <button 
                          className="btn-custom btn-custom-accent btn-sm btn-join"
                          onClick={() => handleOpenJoin(t)}
                          disabled={isFull}
                        >
                          {isFull ? 'Match Full' : `₹${t.entryFee} Join`}
                        </button>
                      ) : (
                        <button 
                          className="btn-custom btn-custom-secondary btn-sm btn-disabled"
                          disabled
                        >
                          Closed
                        </button>
                      )}

                      {(t.status === 'completed' || t.status === 'result') && (
                        <button 
                          className="btn-custom btn-custom-accent btn-sm"
                          onClick={() => handleOpenResults(t)}
                        >
                          Results
                        </button>
                      )}
                    </div>

                    {isJoined && showIdBtn && (
                      <button 
                        className="btn-custom btn-idpass w-100 mt-2 btn-sm"
                        onClick={() => handleOpenIdPass(t)}
                      >
                        <i className="bi bi-key-fill"></i> View ID & Pass
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <p className="text-secondary text-center py-5 bg-dark-subtle rounded-3">No tournaments found in this section.</p>
          )}
        </div>
      )}

      {/* Rules Details Modal Overlay */}
      {showDetailsModal && selectedTourney && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setShowDetailsModal(false); }}
          className="position-fixed top-0 start-0 w-100 h-100"
          style={{
            zIndex: 1050,
            background: 'rgba(0,0,0,0.72)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
          }}
        >
          {/* Bottom sheet */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            maxHeight: '91vh',
            background: '#0D1526',
            borderTop: '1px solid rgba(255,255,255,0.07)',
            borderRadius: '14px 14px 0 0',
            display: 'flex', flexDirection: 'column',
            animation: 'mhSlideUp 0.3s cubic-bezier(0.22,1,0.36,1)',
            overflow: 'hidden',
          }}>
            {/* Drag handle */}
            <div style={{ width: '36px', height: '3px', background: 'rgba(255,255,255,0.12)', borderRadius: '99px', margin: '10px auto 0', flexShrink: 0 }} />

            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 18px 12px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              flexShrink: 0,
            }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#E2E8F0', letterSpacing: '-0.01em' }}>
                  Match Factsheet
                </div>
                <div style={{ fontSize: '0.7rem', color: '#475569', marginTop: '1px' }}>
                  Overview, payouts and rules
                </div>
              </div>
              <button
                onClick={() => setShowDetailsModal(false)}
                style={{
                  width: '30px', height: '30px', borderRadius: '6px',
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
                  color: '#64748B', cursor: 'pointer', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <i className="bi bi-x-lg" style={{ fontSize: '0.75rem' }}></i>
              </button>
            </div>

            {/* Scrollable details */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px 24px' }}>
              <h5 style={{ fontWeight: 750, fontSize: '1rem', color: '#E2E8F0', marginBottom: '14px', letterSpacing: '-0.01em' }}>
                {selectedTourney.name}
              </h5>

              {/* Grid of parameters */}
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px',
                marginBottom: '16px'
              }}>
                <div style={{
                  padding: '10px 8px', borderRadius: '8px', background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.05)', textAlign: 'center'
                }}>
                  <i className="bi bi-controller" style={{ color: '#38BDF8', fontSize: '1rem', display: 'block', marginBottom: '4px' }}></i>
                  <div style={{ fontSize: '0.62rem', color: '#475569', textTransform: 'uppercase', fontWeight: 600 }}>Mode</div>
                  <strong style={{ fontSize: '0.76rem', color: '#CBD5E1', display: 'block', marginTop: '2px' }}>{selectedTourney.mode}</strong>
                </div>
                <div style={{
                  padding: '10px 8px', borderRadius: '8px', background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.05)', textAlign: 'center'
                }}>
                  <i className="bi bi-map" style={{ color: '#4ADE80', fontSize: '1rem', display: 'block', marginBottom: '4px' }}></i>
                  <div style={{ fontSize: '0.62rem', color: '#475569', textTransform: 'uppercase', fontWeight: 600 }}>Map</div>
                  <strong style={{ fontSize: '0.76rem', color: '#CBD5E1', display: 'block', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {selectedTourney.map || 'Erangel'}
                  </strong>
                </div>
                <div style={{
                  padding: '10px 8px', borderRadius: '8px', background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.05)', textAlign: 'center'
                }}>
                  <i className="bi bi-ticket-perforated" style={{ color: '#FACC15', fontSize: '1rem', display: 'block', marginBottom: '4px' }}></i>
                  <div style={{ fontSize: '0.62rem', color: '#475569', textTransform: 'uppercase', fontWeight: 600 }}>Entry Fee</div>
                  <strong style={{ fontSize: '0.76rem', color: '#FDE68A', display: 'block', marginTop: '2px' }}>
                    {selectedTourney.entryFee > 0 ? `₹${selectedTourney.entryFee}` : 'Free'}
                  </strong>
                </div>
              </div>

              {/* Pool distributions */}
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px',
                marginBottom: '16px'
              }}>
                <div style={{
                  padding: '10px 14px', borderRadius: '8px', background: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.12)', display: 'flex', alignItems: 'center', gap: '10px'
                }}>
                  <i className="bi bi-crosshair" style={{ color: '#F87171', fontSize: '1.15rem' }}></i>
                  <div>
                    <span style={{ fontSize: '0.62rem', color: '#64748B', display: 'block' }}>Per Kill Reward</span>
                    <strong style={{ fontSize: '1.15rem', fontWeight: 800, color: '#F87171', lineHeight: '1.2', display: 'block' }}>₹{selectedTourney.perKillPrize}</strong>
                  </div>
                </div>
                <div style={{
                  padding: '10px 14px', borderRadius: '8px', background: 'rgba(34,197,94,0.08)',
                  border: '1px solid rgba(34,197,94,0.12)', display: 'flex', alignItems: 'center', gap: '10px'
                }}>
                  <i className="bi bi-wallet2" style={{ color: '#4ADE80', fontSize: '1.15rem' }}></i>
                  <div>
                    <span style={{ fontSize: '0.62rem', color: '#64748B', display: 'block' }}>Total Prize Pool</span>
                    <strong style={{ fontSize: '1.15rem', fontWeight: 800, color: '#4ADE80', lineHeight: '1.2', display: 'block' }}>₹{selectedTourney.prizePool}</strong>
                  </div>
                </div>
              </div>

              {/* Payout distribution cards stack */}
              <h6 style={{ fontSize: '0.78rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '18px 0 10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <i className="bi bi-trophy-fill" style={{ color: '#FACC15', fontSize: '0.85rem' }}></i> Prize Distribution
              </h6>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '20px' }}>
                {selectedTourney.prizeDistribution && typeof selectedTourney.prizeDistribution === 'object' ? (() => {
                  const getSortRank = (k: string): number => {
                    const firstNum = parseInt(k.split(/[-to]/)[0]);
                    return isNaN(firstNum) ? 999 : firstNum;
                  };

                  return Object.entries(selectedTourney.prizeDistribution)
                    .sort(([a], [b]) => getSortRank(a) - getSortRank(b))
                    .map(([rankStr, prize]) => {
                      const parsedNum = parseInt(rankStr.trim());
                      const isRange = rankStr.includes('-') || rankStr.toLowerCase().includes('to');
                      
                      let rsColor = '#475569';
                      let rsBg = 'rgba(255,255,255,0.01)';
                      let rsBorder = 'rgba(255,255,255,0.04)';
                      let rsIcon = 'bi-hash';

                      if (!isRange && !isNaN(parsedNum)) {
                        if (parsedNum === 1) {
                          rsColor = '#FACC15';
                          rsBg = 'rgba(250,204,21,0.05)';
                          rsBorder = 'rgba(250,204,21,0.15)';
                          rsIcon = 'bi-trophy-fill';
                        } else if (parsedNum === 2) {
                          rsColor = '#94A3B8';
                          rsBg = 'rgba(148,163,184,0.04)';
                          rsBorder = 'rgba(148,163,184,0.1)';
                          rsIcon = 'bi-award-fill';
                        } else if (parsedNum === 3) {
                          rsColor = '#C07434';
                          rsBg = 'rgba(192,116,52,0.04)';
                          rsBorder = 'rgba(192,116,52,0.1)';
                          rsIcon = 'bi-award-fill';
                        }
                      } else if (isRange) {
                        if (parsedNum === 1) {
                          rsColor = '#FACC15';
                          rsBg = 'rgba(250,204,21,0.05)';
                          rsBorder = 'rgba(250,204,21,0.15)';
                          rsIcon = 'bi-trophy-fill';
                        } else {
                          rsColor = '#64748B';
                          rsIcon = 'bi-award-fill';
                        }
                      }

                      return (
                        <div
                          key={rankStr}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '8px 12px', borderRadius: '6px',
                            background: rsBg, border: `1px solid ${rsBorder}`
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <i className={`bi ${rsIcon}`} style={{ color: rsColor, fontSize: '0.82rem' }}></i>
                            <span style={{ fontSize: '0.78rem', color: (parsedNum <= 3 || isRange) ? '#CBD5E1' : '#64748B', fontWeight: (parsedNum <= 3 || isRange) ? 600 : 500 }}>
                              Rank {rankStr}
                            </span>
                          </div>
                          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: (parsedNum === 1 || isRange) ? '#FACC15' : '#E2E8F0' }}>₹{Number(prize).toFixed(0)}</span>
                        </div>
                      );
                    });
                })() : (
                  <div style={{
                    padding: '10px 12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
                    borderRadius: '6px', fontSize: '0.75rem', color: '#94A3B8', whiteSpace: 'pre-line'
                  }}>
                    {String(selectedTourney.prizeDistribution || 'Standard payouts')}
                  </div>
                )}
              </div>

              {/* Match rules */}
              <h6 style={{ fontSize: '0.78rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '18px 0 10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <i className="bi bi-file-earmark-ruled" style={{ color: '#FACC15', fontSize: '0.85rem' }}></i> Rules &amp; Regulations
              </h6>
              <div style={{
                color: '#94A3B8', padding: '12px 14px', background: 'rgba(255,255,255,0.015)',
                border: '1px solid rgba(255,255,255,0.04)', borderLeft: '3px solid #FACC15',
                borderRadius: '0 6px 6px 0', fontSize: '0.78rem', whiteSpace: 'pre-line', lineHeight: '1.6'
              }}>
                {selectedTourney.description || '• Cheating / hacking is strictly prohibited.\n• Team-up leads to instant ban without refund.\n• Room ID and Password will be shared 15 mins prior.'}
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: '8px', padding: '14px 18px', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
              <button
                className="btn-custom btn-custom-secondary w-100"
                onClick={() => setShowDetailsModal(false)}
                style={{ borderRadius: '6px', fontSize: '0.8rem', padding: '10px' }}
              >
                Close Factsheet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ID & Password Modal Overlay */}
      {showIdPassModal && selectedTourney && (
        <div className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center" style={{ zIndex: 1050, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
          <div className="custom-card p-4 mx-3 text-center" style={{ width: '100%', maxWidth: '400px' }}>
            <div className="d-flex justify-content-between align-items-center mb-4">
              <h5 className="modal-title m-0 text-white fw-bold"><i className="bi bi-shield-lock-fill text-warning me-2"></i>Room Access</h5>
              <button className="btn-close btn-close-white" onClick={() => setShowIdPassModal(false)}></button>
            </div>
            
            <div className="p-3 bg-warning bg-opacity-10 border border-warning border-opacity-20 rounded-3 text-warning text-start mb-4" style={{ fontSize: '0.78rem' }}>
              <i className="bi bi-info-circle-fill me-2"></i>Room credentials are live. Copy and enter them inside the game custom room lobby.
            </div>
            
            {/* Room ID card */}
            <div className="p-3 bg-dark bg-opacity-40 rounded-3 border border-secondary border-opacity-20 mb-3 text-start d-flex align-items-center justify-content-between">
              <div>
                <span className="text-secondary small d-block">ROOM ID</span>
                <strong className="text-white fs-5 font-monospace">{selectedTourney.roomId || 'NOT UPDATED YET'}</strong>
              </div>
              {selectedTourney.roomId && (
                <button className="btn btn-sm btn-custom-accent py-1 px-3" onClick={() => { navigator.clipboard.writeText(selectedTourney.roomId || ''); alert('Room ID copied!'); }}>
                  <i className="bi bi-clipboard"></i> Copy
                </button>
              )}
            </div>

            {/* Room Pass card */}
            <div className="p-3 bg-dark bg-opacity-40 rounded-3 border border-secondary border-opacity-20 mb-4 text-start d-flex align-items-center justify-content-between">
              <div>
                <span className="text-secondary small d-block">ROOM PASSWORD</span>
                <strong className="text-white fs-5 font-monospace">{selectedTourney.roomPassword || 'NOT UPDATED YET'}</strong>
              </div>
              {selectedTourney.roomPassword && (
                <button className="btn btn-sm btn-custom-accent py-1 px-3" onClick={() => { navigator.clipboard.writeText(selectedTourney.roomPassword || ''); alert('Room Password copied!'); }}>
                  <i className="bi bi-clipboard"></i> Copy
                </button>
              )}
            </div>
            
            <p className="text-danger small mb-0"><i className="bi bi-exclamation-triangle-fill"></i> Sharing credentials with other players will result in a permanent ban.</p>
          </div>
        </div>
      )}

      {/* Joined Players Modal Overlay */}
      {showPlayersModal && selectedTourney && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setShowPlayersModal(false); }}
          className="position-fixed top-0 start-0 w-100 h-100"
          style={{
            zIndex: 1050,
            background: 'rgba(0,0,0,0.72)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
          }}
        >
          {/* Bottom sheet */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            maxHeight: '91vh',
            background: '#0D1526',
            borderTop: '1px solid rgba(255,255,255,0.07)',
            borderRadius: '14px 14px 0 0',
            display: 'flex', flexDirection: 'column',
            animation: 'mhSlideUp 0.3s cubic-bezier(0.22,1,0.36,1)',
            overflow: 'hidden',
          }}>
            {/* Drag handle */}
            <div style={{ width: '36px', height: '3px', background: 'rgba(255,255,255,0.12)', borderRadius: '99px', margin: '10px auto 0', flexShrink: 0 }} />

            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 18px 12px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              flexShrink: 0,
            }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#E2E8F0', letterSpacing: '-0.01em' }}>
                  Match Roster
                </div>
                <div style={{ fontSize: '0.7rem', color: '#64748B', marginTop: '1px' }}>
                  Joined players: <span style={{ color: 'var(--accent-color)', fontWeight: 600 }}>{registeredPlayersList.length}</span> / {selectedTourney.maxPlayers || 100}
                </div>
              </div>
              <button
                onClick={() => setShowPlayersModal(false)}
                style={{
                  width: '30px', height: '30px', borderRadius: '6px',
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
                  color: '#64748B', cursor: 'pointer', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <i className="bi bi-x-lg" style={{ fontSize: '0.75rem' }}></i>
              </button>
            </div>

            {/* Scrollable list */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px 24px' }}>
              {loadingPlayers ? (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '60px 0' }}>
                  <div className="spinner-border text-warning" style={{ width: '1.5rem', height: '1.5rem' }}></div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {registeredPlayersList.length > 0 ? (
                    registeredPlayersList.map((player, idx) => (
                      <div
                        key={player.uid}
                        className="player-list-item-custom"
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '6px 12px', borderRadius: '0px',
                          background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.04)'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ fontSize: '0.72rem', color: '#FFFFFF', fontWeight: 700, width: '18px', textAlign: 'center' }}>
                            #{idx + 1}
                          </span>
                          
                          {/* Avatar Circle with Badge Overlay */}
                          <div style={{ position: 'relative', width: '48px', height: '48px', flexShrink: 0 }}>
                            <img 
                              src={player.photoURL || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(player.username || player.displayName)}`} 
                              alt="avatar" 
                              className="w-100 h-100 object-fit-cover"
                              style={{ border: '1.5px solid rgba(255,255,255,0.06)', borderRadius: '0px' }}
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(player.uid)}`;
                              }}
                            />
                             {player.appliedBadgeUrl && (
                              <span className="badge-sweep-wrap" style={{ position: 'absolute', bottom: '-5px', right: '-5px', width: '19px', height: '19px', borderRadius: '50%', overflow: 'hidden' }}>
                                <img src={player.appliedBadgeUrl} alt="Badge" className="w-100 h-100 object-fit-contain" />
                              </span>
                            )}
                          </div>

                          <div>
                            <div style={{ fontSize: '0.9rem', fontWeight: 650, color: '#FACC15' }}>
                              {player.username}
                            </div>
                            <div style={{ fontSize: '0.66rem', color: '#FFFFFF' }}>
                              UID: {player.gameUid}
                            </div>
                          </div>
                        </div>

                        <span style={{
                          fontSize: '0.85rem', color: '#FACC15', fontWeight: 700,
                          background: 'rgba(250,204,21,0.05)', border: '1px solid rgba(250,204,21,0.12)',
                          padding: '3px 8px', borderRadius: '4px', fontFamily: 'monospace'
                        }}>
                          {player.displayName}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div style={{ textAlign: 'center', padding: '50px 0', color: '#64748B' }}>
                      <i className="bi bi-people" style={{ fontSize: '2rem', display: 'block', marginBottom: '8px' }}></i>
                      <div style={{ fontSize: '0.78rem' }}>No players have joined this match yet.</div>
                    </div>
                  )}
                </div>
              )}
            </div>
            
            <div style={{ display: 'flex', gap: '8px', padding: '14px 18px', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
              <button
                className="btn-custom btn-custom-secondary w-100"
                onClick={() => setShowPlayersModal(false)}
                style={{ borderRadius: '6px', fontSize: '0.8rem', padding: '10px' }}
              >
                Close Roster
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Registration Details Form Modal Overlay */}
      {showJoinModal && selectedTourney && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setShowJoinModal(false); }}
          className="position-fixed top-0 start-0 w-100 h-100"
          style={{
            zIndex: 1050,
            background: 'rgba(0,0,0,0.72)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
          }}
        >
          {/* Bottom sheet */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            maxHeight: '92vh',
            background: '#0D1526',
            borderTop: '1px solid rgba(255,255,255,0.07)',
            borderRadius: '14px 14px 0 0',
            display: 'flex', flexDirection: 'column',
            animation: 'mhSlideUp 0.3s cubic-bezier(0.22,1,0.36,1)',
            overflow: 'hidden',
          }}>
            {/* Drag handle */}
            <div style={{ width: '36px', height: '3px', background: 'rgba(255,255,255,0.12)', borderRadius: '99px', margin: '10px auto 0', flexShrink: 0 }} />

            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifycontent: 'space-between',
              padding: '14px 18px 12px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              flexShrink: 0,
            }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#E2E8F0', letterSpacing: '-0.01em' }}>
                  Register for Match
                </div>
                <div style={{ fontSize: '0.7rem', color: '#64748B', marginTop: '1px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '280px' }}>
                  {selectedTourney.name}
                </div>
              </div>
              <button
                onClick={() => setShowJoinModal(false)}
                style={{
                  width: '30px', height: '30px', borderRadius: '6px',
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
                  color: '#64748B', cursor: 'pointer', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <i className="bi bi-x-lg" style={{ fontSize: '0.75rem' }}></i>
              </button>
            </div>

            {/* Scrollable details */}
            <form onSubmit={handleJoinSubmit} style={{ flex: 1, overflowY: 'auto', padding: '12px 14px 24px', display: 'flex', flexDirection: 'column' }}>
              {joinMsg && (
                <div className="alert alert-danger py-2 px-3 border-0 rounded-2 small mb-3" style={{ fontSize: '0.75rem' }}>
                  <i className="bi bi-exclamation-triangle-fill me-2"></i>{joinMsg}
                </div>
              )}

              {/* Wallet Balance Widget Card */}
              <div style={{
                background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(59, 130, 246, 0.02) 100%)',
                border: '1px solid rgba(59, 130, 246, 0.15)',
                borderRadius: '8px', padding: '12px 16px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: '16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <i className="bi bi-wallet2" style={{ color: '#38BDF8', fontSize: '1.05rem' }}></i>
                  <div>
                    <span style={{ fontSize: '0.62rem', color: '#64748B', display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Your Balance</span>
                    <strong style={{ fontSize: '0.9rem', color: '#CBD5E1' }}>₹{userProfile?.balance?.toFixed(2) || '0.00'}</strong>
                  </div>
                </div>
                <span style={{ fontSize: '0.62rem', background: 'rgba(56, 189, 248, 0.12)', color: '#38BDF8', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>Esports Wallet</span>
              </div>

              {/* Entry Fee Ledger Summary */}
              <div style={{
                background: 'linear-gradient(135deg, rgba(250, 204, 21, 0.06) 0%, rgba(250, 204, 21, 0.02) 100%)',
                border: '1px solid rgba(250, 204, 21, 0.15)',
                borderRadius: '8px', padding: '12px 14px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: '16px'
              }}>
                <span style={{ fontSize: '0.74rem', color: '#94A3B8' }}>Deduction Entry Fee</span>
                <strong style={{ fontSize: '1rem', color: '#FACC15' }}>
                  ₹{(() => {
                    const fee = selectedTourney.entryFee;
                    const baseFee = selectedTourney.mode === 'Duo' ? fee * 2 : fee;
                    return appliedCoupon ? Math.max(0, baseFee - appliedCoupon.discount).toFixed(0) : baseFee.toFixed(0);
                  })()}
                </strong>
              </div>

              {registrationMode === 'api' ? (
                /* ───── API VERIFY MODE ───── */
                <>
                  {/* UID Entry + Fetch */}
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#94A3B8', marginBottom: '6px' }}>Your Game UID</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="text"
                        className="form-control"
                        value={joinGameUid}
                        onChange={(e) => { setJoinGameUid(e.target.value); setFetchedPlayer(null); setFetchError(''); }}
                        placeholder="Enter Free Fire UID"
                        required
                        style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '6px', fontSize: '0.8rem' }}
                      />
                      <button
                        type="button"
                        className="btn btn-custom-accent px-3 flex-shrink-0"
                        onClick={handleFetchPlayerInfo}
                        disabled={fetchingUid || !joinGameUid.trim()}
                        style={{ borderRadius: '6px', fontSize: '0.8rem', padding: '10px' }}
                      >
                        {fetchingUid ? (
                          <span className="spinner-border spinner-border-sm" style={{ width: '14px', height: '14px' }}></span>
                        ) : (
                          <><i className="bi bi-search me-1"></i>Verify</>
                        )}
                      </button>
                    </div>
                    {fetchError && (
                      <div style={{ marginTop: '6px', padding: '8px 10px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.12)', borderRadius: '6px', fontSize: '0.72rem', color: '#F87171' }}>
                        <i className="bi bi-exclamation-circle-fill me-1.5"></i>{fetchError}
                      </div>
                    )}
                  </div>

                  {/* Fetched Player Card */}
                  {fetchedPlayer && (
                    fetchedPlayer.banStatus === 'Banned' ? (
                      <div style={{ padding: '12px 14px', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.15)', borderRadius: '6px', marginBottom: '16px', textAlign: 'start' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                          <i className="bi bi-shield-slash-fill" style={{ color: '#EF4444', fontSize: '1rem' }}></i>
                          <strong style={{ color: '#EF4444', fontSize: '0.8rem' }}>Account Suspended / Banned</strong>
                        </div>
                        <p style={{ fontSize: '0.72rem', color: '#94A3B8', margin: '0 0 10px' }}>UID <strong style={{ color: '#E2E8F0' }}>{joinGameUid}</strong> has been blacklisted for security policies. Resubmit with a normal account.</p>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-warning w-100"
                          onClick={() => { setFetchedPlayer(null); setJoinGameUid(''); setFetchError(''); }}
                          style={{ fontSize: '0.7rem', padding: '6px', borderRadius: '4px' }}
                        >
                          Try Another UID
                        </button>
                      </div>
                    ) : (
                      <div className="uid-player-card" style={{ marginBottom: '16px' }}>
                        <div className="d-flex align-items-center justify-content-between mb-3">
                          <div className="d-flex align-items-center gap-3">
                            <div className="uid-avatar-circle">
                              <img 
                                src={`https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(fetchedPlayer.nickname || joinGameUid)}`}
                                alt="avatar"
                                className="w-100 h-100 object-fit-cover"
                              />
                            </div>
                            <div>
                              <div className="text-white fw-bold" style={{ fontSize: '0.82rem' }}>{fetchedPlayer.nickname}</div>
                              <div className="text-secondary" style={{ fontSize: '0.68rem' }}>UID: {joinGameUid} &bull; {fetchedPlayer.region}</div>
                            </div>
                          </div>
                          <span className="uid-verified-badge"><i className="bi bi-patch-check-fill me-1"></i>Verified</span>
                        </div>
                        <div className="row g-2 text-center">
                          <div className="col-4">
                            <div className="uid-stat-block">
                              <span className="uid-stat-label">Level</span>
                              <strong className="uid-stat-value text-accent" style={{ fontSize: '0.8rem' }}>{fetchedPlayer.level}</strong>
                            </div>
                          </div>
                          <div className="col-8">
                            <div className="uid-stat-block">
                              <span className="uid-stat-label">Rank Division</span>
                              <strong className="uid-stat-value text-warning" style={{ fontSize: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fetchedPlayer.rankingName}</strong>
                            </div>
                          </div>
                        </div>
                        <div className="mt-2">
                          <div className="d-flex justify-content-between mb-1" style={{ fontSize: '0.62rem' }}>
                            <span className="text-secondary">Exp Progress</span>
                            <span className="text-accent font-monospace">{fetchedPlayer.levelProgress}</span>
                          </div>
                          <div className="progress" style={{ height: '4px', background: 'rgba(255,255,255,0.06)' }}>
                            <div className="progress-bar" style={{ width: fetchedPlayer.levelProgress, background: 'linear-gradient(to right, var(--accent-color), #fb923c)' }}></div>
                          </div>
                        </div>
                      </div>
                    )
                  )}

                  {/* Promo Coupons + Duo Details — only loaded after verification */}
                  {fetchedPlayer && fetchedPlayer.banStatus !== 'Banned' && (
                    <>
                      {/* Coupon Code section */}
                      <div style={{
                        padding: '12px 14px', background: 'rgba(255,255,255,0.015)',
                        border: '1px solid rgba(255,255,255,0.04)', borderRadius: '8px', marginBottom: '12px'
                      }}>
                        <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>Promo Coupon Code</label>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <input
                            type="text"
                            value={couponCode}
                            onChange={(e) => setCouponCode(e.target.value)}
                            placeholder="Enter Promo Code"
                            style={{ flex: 1, background: '#090F1B', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '6px', fontSize: '0.76rem', padding: '6px 10px' }}
                          />
                          <button
                            type="button"
                            className="btn btn-sm btn-custom-secondary"
                            onClick={handleApplyCoupon}
                            style={{ fontSize: '0.74rem', padding: '6px 12px', borderRadius: '6px' }}
                          >
                            Apply
                          </button>
                        </div>
                        {couponMsg && (
                          <div style={{ fontSize: '0.7rem', marginTop: '6px', color: couponMsg.type === 'success' ? '#10B981' : '#EF4444' }}>
                            <i className={`bi bi-${couponMsg.type === 'success' ? 'check-circle' : 'exclamation-circle'}-fill me-1`}></i>
                            {couponMsg.text}
                          </div>
                        )}
                      </div>

                      {/* Duo Details Box */}
                      {selectedTourney.mode === 'Duo' && (
                        <div style={{
                          padding: '14px', background: 'rgba(255,255,255,0.015)',
                          border: '1px solid rgba(255,255,255,0.04)', borderRadius: '8px', marginBottom: '12px'
                        }}>
                          <h6 style={{ fontSize: '0.74rem', fontWeight: 700, color: '#38BDF8', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '10px' }}>Teammate Register IGN</h6>
                          <div className="mb-2">
                            <label style={{ display: 'block', fontSize: '0.65rem', color: '#64748B', marginBottom: '4px' }}>Teammate Username (IGN)</label>
                            <input
                              type="text"
                              value={joinTeammateName}
                              onChange={(e) => setJoinTeammateName(e.target.value)}
                              placeholder="Teammate Game IGN"
                              required
                              style={{ width: '100%', background: '#090F1B', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '6px', fontSize: '0.78rem', padding: '7px 10px' }}
                            />
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: '0.65rem', color: '#64748B', marginBottom: '4px' }}>Teammate UID</label>
                            <input
                              type="text"
                              value={joinTeammateUid}
                              onChange={(e) => setJoinTeammateUid(e.target.value)}
                              placeholder="Teammate Free Fire UID"
                              required
                              style={{ width: '100%', background: '#090F1B', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '6px', fontSize: '0.78rem', padding: '7px 10px' }}
                            />
                          </div>
                        </div>
                      )}



                      {/* Footer Actions */}
                      <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
                        <button
                          type="button"
                          className="btn-custom btn-custom-secondary w-100"
                          onClick={() => setShowJoinModal(false)}
                          style={{ borderRadius: '6px', fontSize: '0.8rem', padding: '10px' }}
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="btn-custom btn-custom-accent w-100"
                          disabled={joinLoading}
                          style={{ borderRadius: '6px', fontSize: '0.8rem', padding: '10px' }}
                        >
                          {joinLoading ? 'Checking balance...' : <><i className="bi bi-check-lg me-1"></i>Confirm Join</>}
                        </button>
                      </div>
                    </>
                  )}

                  {!fetchedPlayer && (
                    <button
                      type="button"
                      className="btn-custom btn-custom-secondary w-100 mt-auto"
                      onClick={() => setShowJoinModal(false)}
                      style={{ borderRadius: '6px', fontSize: '0.8rem', padding: '10px' }}
                    >
                      Cancel Registration
                    </button>
                  )}
                </>
              ) : (
                /* ───── MANUAL ENTRY MODE ───── */
                <>
                  <div style={{ marginBottom: '14px' }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#94A3B8', marginBottom: '6px' }}>Your Game Username (IGN)</label>
                    <input
                      type="text"
                      className="form-control"
                      value={joinUsername}
                      onChange={(e) => setJoinUsername(e.target.value)}
                      placeholder="In-Game nickname"
                      required
                      style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '6px', fontSize: '0.8rem' }}
                    />
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#94A3B8', marginBottom: '6px' }}>Your Free Fire UID</label>
                    <input
                      type="text"
                      className="form-control"
                      value={joinGameUid}
                      onChange={(e) => setJoinGameUid(e.target.value)}
                      placeholder="e.g. 2453801299"
                      required
                      style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '6px', fontSize: '0.8rem' }}
                    />
                  </div>

                  {/* Promo Coupons box */}
                  <div style={{
                    padding: '12px 14px', background: 'rgba(255,255,255,0.015)',
                    border: '1px solid rgba(255,255,255,0.04)', borderRadius: '8px', marginBottom: '12px'
                  }}>
                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>Promo Coupon Code</label>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <input
                        type="text"
                        value={couponCode}
                        onChange={(e) => setCouponCode(e.target.value)}
                        placeholder="Enter Promo Code"
                        style={{ flex: 1, background: '#090F1B', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '6px', fontSize: '0.76rem', padding: '6px 10px' }}
                      />
                      <button
                        type="button"
                        className="btn btn-sm btn-custom-secondary"
                        onClick={handleApplyCoupon}
                        style={{ fontSize: '0.74rem', padding: '6px 12px', borderRadius: '6px' }}
                      >
                        Apply
                      </button>
                    </div>
                    {couponMsg && (
                      <div style={{ fontSize: '0.7rem', marginTop: '6px', color: couponMsg.type === 'success' ? '#10B981' : '#EF4444' }}>
                        <i className={`bi bi-${couponMsg.type === 'success' ? 'check-circle' : 'exclamation-circle'}-fill me-1`}></i>
                        {couponMsg.text}
                      </div>
                    )}
                  </div>

                  {/* Duo Details Box */}
                  {selectedTourney.mode === 'Duo' && (
                    <div style={{
                      padding: '14px', background: 'rgba(255,255,255,0.015)',
                      border: '1px solid rgba(255,255,255,0.04)', borderRadius: '8px', marginBottom: '12px'
                    }}>
                      <h6 style={{ fontSize: '0.74rem', fontWeight: 700, color: '#38BDF8', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '10px' }}>Teammate Register IGN</h6>
                      <div className="mb-2">
                        <label style={{ display: 'block', fontSize: '0.65rem', color: '#64748B', marginBottom: '4px' }}>Teammate Username (IGN)</label>
                        <input
                          type="text"
                          value={joinTeammateName}
                          onChange={(e) => setJoinTeammateName(e.target.value)}
                          placeholder="Teammate Game IGN"
                          required
                          style={{ width: '100%', background: '#090F1B', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '6px', fontSize: '0.78rem', padding: '7px 10px' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.65rem', color: '#64748B', marginBottom: '4px' }}>Teammate UID</label>
                        <input
                          type="text"
                          value={joinTeammateUid}
                          onChange={(e) => setJoinTeammateUid(e.target.value)}
                          placeholder="Teammate Free Fire UID"
                          required
                          style={{ width: '100%', background: '#090F1B', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '6px', fontSize: '0.78rem', padding: '7px 10px' }}
                        />
                      </div>
                    </div>
                  )}



                  {/* Footer Actions */}
                  <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
                    <button
                      type="button"
                      className="btn-custom btn-custom-secondary w-100"
                      onClick={() => setShowJoinModal(false)}
                      style={{ borderRadius: '6px', fontSize: '0.8rem', padding: '10px' }}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn-custom btn-custom-accent w-100"
                      disabled={joinLoading}
                      style={{ borderRadius: '6px', fontSize: '0.8rem', padding: '10px' }}
                    >
                      {joinLoading ? 'Registering...' : <><i className="bi bi-check-lg me-1"></i>Register</>}
                    </button>
                  </div>
                </>
              )}
            </form>
          </div>
        </div>
      )}

      {/* Results Modal Overlay */}
      {showResultsModal && selectedTourney && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setShowResultsModal(false); }}
          className="position-fixed top-0 start-0 w-100 h-100"
          style={{
            zIndex: 1050,
            background: 'rgba(0,0,0,0.72)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
          }}
        >
          {/* Bottom sheet */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            maxHeight: '91vh',
            background: '#0D1526',
            borderTop: '1px solid rgba(255,255,255,0.07)',
            borderRadius: '14px 14px 0 0',
            display: 'flex', flexDirection: 'column',
            animation: 'mhSlideUp 0.3s cubic-bezier(0.22,1,0.36,1)',
            overflow: 'hidden',
          }}>
            {/* Drag handle */}
            <div style={{ width: '36px', height: '3px', background: 'rgba(255,255,255,0.12)', borderRadius: '99px', margin: '10px auto 0', flexShrink: 0 }} />

            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 18px 12px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              flexShrink: 0,
            }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#E2E8F0', letterSpacing: '-0.01em' }}>
                  {selectedTourney.name}
                </div>
                <div style={{ fontSize: '0.7rem', color: '#475569', marginTop: '1px' }}>
                  Match Results · {resultsPlayersList.length} players
                </div>
              </div>
              <button
                onClick={() => setShowResultsModal(false)}
                style={{
                  width: '30px', height: '30px', borderRadius: '6px',
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
                  color: '#64748B', cursor: 'pointer', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <i className="bi bi-x-lg" style={{ fontSize: '0.75rem' }}></i>
              </button>
            </div>

            {/* Highlighted user result banner */}
            {!loadingResults && resultsPlayersList.find(r => r.uid === currentUser?.uid) && (() => {
              const myEntry = resultsPlayersList.find(r => r.uid === currentUser?.uid);
              return (
                <div style={{
                  margin: '10px 14px 0',
                  padding: '10px 13px',
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, rgba(250,204,21,0.07), rgba(250,204,21,0.02))',
                  border: '1px solid rgba(250,204,21,0.18)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  flexShrink: 0,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <i className="bi bi-person-fill" style={{ color: '#FACC15', fontSize: '0.8rem' }}></i>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#CBD5E1' }}>Your Result</span>
                  </div>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>Rank <strong style={{ color: '#FACC15' }}>#{myEntry.rank}</strong></span>
                    <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>Kills <strong style={{ color: '#F87171' }}>{myEntry.kills}</strong></span>
                    <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>Won <strong style={{ color: '#4ADE80' }}>₹{(myEntry.winnings || 0).toFixed(2)}</strong></span>
                  </div>
                </div>
              );
            })()}

            {/* Roster list */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px 24px' }}>
              {loadingResults ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '4px' }}>
                  {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} style={{
                      height: '58px', borderRadius: '8px',
                      background: 'linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.055) 50%, rgba(255,255,255,0.03) 75%)',
                      backgroundSize: '200% 100%',
                      animation: `shimmer 1.4s ease-in-out ${i * 0.1}s infinite`,
                    }} />
                  ))}
                </div>
              ) : resultsPlayersList.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingTop: '4px' }}>
                  {resultsPlayersList.map((player, idx) => {
                    const isWinner = player.rank === 1;
                    const isRunnerUp = player.rank === 2;
                    const isThird = player.rank === 3;
                    
                    const rsColor = isWinner ? '#FACC15' : isRunnerUp ? '#94A3B8' : isThird ? '#C07434' : '#475569';
                    const rsBg = isWinner ? 'rgba(250,204,21,0.1)' : isRunnerUp ? 'rgba(148,163,184,0.08)' : isThird ? 'rgba(192,116,52,0.08)' : 'transparent';
                    const rsBorder = isWinner ? 'rgba(250,204,21,0.25)' : isRunnerUp ? 'rgba(148,163,184,0.2)' : isThird ? 'rgba(192,116,52,0.2)' : 'rgba(255,255,255,0.05)';
                    const rsIcon = isWinner ? 'bi-trophy-fill' : (isRunnerUp || isThird) ? 'bi-award-fill' : '';

                    const isMe = player.uid === currentUser?.uid;
                    const avatarUrl = player.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(player.displayName)}&background=1E293B&color=E2E8F0&bold=true&size=36`;

                    return (
                      <div
                        key={player.uid + idx}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '10px',
                          padding: '9px 12px',
                          borderRadius: '8px',
                          background: isMe ? 'rgba(250,204,21,0.05)' : rsBg,
                          border: `1px solid ${isMe ? 'rgba(250,204,21,0.2)' : rsBorder}`,
                        }}
                      >
                        {/* Rank tag */}
                        <div style={{ width: '32px', textAlign: 'center', flexShrink: 0 }}>
                          {player.rank <= 3 ? (
                            <i className={`bi ${rsIcon}`} style={{ color: rsColor, fontSize: '1rem' }}></i>
                          ) : (
                            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155' }}>#{player.rank}</span>
                          )}
                        </div>

                        {/* Avatar */}
                        <div style={{ position: 'relative', flexShrink: 0 }}>
                          <img
                            src={avatarUrl}
                            alt={player.displayName}
                            style={{ width: '34px', height: '34px', borderRadius: '6px', objectFit: 'cover' }}
                          />
                          {player.appliedBadgeUrl && (
                            <span className="badge-sweep-wrap" style={{ bottom: '-3px', right: '-3px' }}>
                              <img src={player.appliedBadgeUrl} alt="Badge" style={{ width: '14px', height: '14px' }} />
                            </span>
                          )}
                        </div>

                        {/* Name + IGN */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: '0.8rem', fontWeight: isMe ? 700 : 500,
                            color: isMe ? '#E2E8F0' : '#94A3B8',
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          }}>
                            {player.displayName}
                            {isMe && <span style={{ marginLeft: '6px', fontSize: '0.6rem', background: 'rgba(250,204,21,0.15)', color: '#FACC15', padding: '1px 5px', borderRadius: '3px', fontWeight: 600, letterSpacing: '0.04em' }}>YOU</span>}
                          </div>
                          {player.inGameUsername && (
                            <div style={{ fontSize: '0.62rem', color: '#334155', marginTop: '1px' }}>{player.inGameUsername}</div>
                          )}
                        </div>

                        {/* Kills */}
                        <div style={{ textAlign: 'center', flexShrink: 0, minWidth: '40px' }}>
                          <div style={{ fontSize: '0.62rem', color: '#334155', marginBottom: '1px' }}>Kills</div>
                          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: player.kills > 0 ? '#F87171' : '#334155' }}>{player.kills ?? 0}</div>
                        </div>

                        {/* Winnings */}
                        <div style={{ textAlign: 'right', flexShrink: 0, minWidth: '54px' }}>
                          <div style={{ fontSize: '0.62rem', color: '#334155', marginBottom: '1px' }}>Earned</div>
                          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: (player.winnings || 0) > 0 ? '#4ADE80' : '#334155' }}>
                            {(player.winnings || 0) > 0 ? `₹${player.winnings.toFixed(0)}` : '—'}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '56px 20px' }}>
                  <i className="bi bi-bar-chart-line" style={{ fontSize: '2.2rem', color: 'rgba(255,255,255,0.08)', display: 'block', marginBottom: '12px' }}></i>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>No results records.</div>
                </div>
              )}
            </div>

            {/* Footer buttons */}
            <div style={{ display: 'flex', gap: '8px', padding: '14px 18px', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
              <button
                className="btn-custom btn-custom-secondary flex-grow-1"
                onClick={() => setShowResultsModal(false)}
                style={{ borderRadius: '6px', fontSize: '0.8rem', padding: '10px' }}
              >
                Close
              </button>
              {currentUser && selectedTourney.fullResults && selectedTourney.fullResults.some(p => p.uid === currentUser.uid) && (
                <button
                  className="btn-custom btn-custom-danger flex-grow-1"
                  onClick={handleOpenReport}
                  style={{ borderRadius: '6px', fontSize: '0.8rem', padding: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                >
                  <i className="bi bi-flag-fill"></i> Report Player
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cheating Report Modal Overlay */}
      {showReportModal && selectedTourney && (
        <div className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center" style={{ zIndex: 1050, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
          <div className="custom-card p-4 mx-3" style={{ width: '100%', maxWidth: '450px' }}>
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h5 className="modal-title m-0">Report Cheating / Abuse</h5>
              <button className="btn-close btn-close-white" onClick={() => setShowReportModal(false)}></button>
            </div>

            <form onSubmit={handleReportSubmit}>
              {reportMsg && (
                <div className={`alert alert-${reportMsg.type} py-2 small`} role="alert">
                  {reportMsg.text}
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Select Accused Player</label>
                <select 
                  className="form-select"
                  value={accusedPlayerUid}
                  onChange={(e) => setAccusedPlayerUid(e.target.value)}
                  required
                >
                  <option value="" disabled>-- Select player to report --</option>
                  {selectedTourney.fullResults
                    ?.filter(p => p.uid !== currentUser?.uid)
                    .map(p => (
                      <option key={p.uid} value={p.uid}>
                        {p.displayName} (IGN: {p.inGameUsername})
                      </option>
                    ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Reason</label>
                <select 
                  className="form-select"
                  value={reportType}
                  onChange={(e) => setReportType(e.target.value)}
                  required
                >
                  <option value="" disabled>-- Select a reason --</option>
                  <option value="Hacker / Panel User">Hacker / Panel User</option>
                  <option value="Glitch User">Glitch User</option>
                  <option value="Violence / Abusing">Violence / Abusing</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Description / Evidence Details</label>
                <textarea 
                  className="form-control"
                  value={reportDesc}
                  onChange={(e) => setReportDesc(e.target.value)}
                  placeholder="Provide timestamps or specific details..."
                  style={{ minHeight: '80px' }}
                  required
                />
              </div>

              <div className="form-group mb-4">
                <label className="form-label">Upload Evidence Screenshot (Optional)</label>
                <input 
                  type="file" 
                  className="form-control" 
                  accept="image/*"
                  onChange={(e) => setEvidenceFile(e.target.files?.[0] || null)}
                />
              </div>

              <div className="d-flex gap-2">
                <button 
                  type="button" 
                  className="btn-custom btn-custom-secondary flex-grow-1" 
                  onClick={() => { setShowReportModal(false); setShowResultsModal(true); }}
                >
                  Back
                </button>
                <button 
                  type="submit" 
                  className="btn-custom btn-custom-danger flex-grow-1"
                  disabled={reportLoading}
                >
                  {reportLoading ? 'Submitting...' : 'Submit Report'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};

export default Tournaments;
