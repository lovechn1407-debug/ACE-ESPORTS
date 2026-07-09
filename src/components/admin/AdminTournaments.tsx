import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ref, get, set, update, remove, runTransaction, push, serverTimestamp, onValue } from 'firebase/database';
import { db } from '../../firebase';

interface Game {
  id: string;
  name: string;
}

interface Tournament {
  id: string;
  name: string;
  gameId: string;
  startTime: number;
  status: 'upcoming' | 'ongoing' | 'completed' | 'result' | 'cancelled';
  mode: 'Solo' | 'Duo';
  entryFee: number;
  prizePool: number;
  perKillPrize: number;
  maxPlayers: number;
  tags?: string[];
  bannerUrl?: string;
  description?: string;
  roomId?: string;
  roomPassword?: string;
  showIdPass?: boolean;
  prizeDistribution?: Record<string, number> | string;
  registeredPlayers?: Record<string, any>;
}

const IMGBB_API_KEY = '17524c13e2cca244c03f6ad0db42e5e0';

const AdminTournaments: React.FC = () => {
  const { org } = useParams<{ org: string }>();
  const [orgDetails, setOrgDetails] = useState<any>(null);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!org) return;
    const orgRef = ref(db, `organisations/${org}`);
    const unsubscribe = onValue(orgRef, (snap) => {
      if (snap.exists()) {
        setOrgDetails(snap.val());
      }
    });
    return () => unsubscribe();
  }, [org]);

  useEffect(() => {
    const bannersRef = ref(db, 'uploads/banners');
    get(bannersRef).then(snap => {
      if (snap.exists()) {
        setBannerLibrary(Object.entries(snap.val()).map(([id, url]) => ({ id, url: url as string })));
      } else {
        setBannerLibrary([]);
      }
    }).catch(err => console.error(err));
  }, []);

  const isSubExpired = orgDetails?.subExpiry ? Date.now() > orgDetails.subExpiry : false;
  const unlockedTabs = orgDetails?.unlockedTabsWhenExpired || [
    'withdrawals', 'deposits', 'notifications', 'earningZone', 'users', 'settings'
  ];
  const isTournamentsLocked = isSubExpired && !unlockedTabs.includes('tournaments');

  // Form states
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  
  const [name, setName] = useState('');
  const [gameId, setGameId] = useState('');
  const [startTimeStr, setStartTimeStr] = useState('');
  const [status, setStatus] = useState<'upcoming' | 'ongoing' | 'completed' | 'result' | 'cancelled'>('upcoming');
  const [mode, setMode] = useState<'Solo' | 'Duo'>('Solo');
  const [entryFee, setEntryFee] = useState(0);
  const [prizePool, setPrizePool] = useState(0);
  const [perKillPrize, setPerKillPrize] = useState(0);
  const [maxPlayers, setMaxPlayers] = useState(0);
  const [tagsStr, setTagsStr] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');
  const [description, setDescription] = useState('');
  const [roomId, setRoomId] = useState('');
  const [showBannerSelector, setShowBannerSelector] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);
  const bannerFileInputRef = React.useRef<HTMLInputElement>(null);
  const [roomPassword, setRoomPassword] = useState('');
  const [showIdPass, setShowIdPass] = useState(false);
  const [showCardPreview, setShowCardPreview] = useState(false);
  const [prizeDistStr, setPrizeDistStr] = useState(''); // Textarea mapping "1: 100\n2: 50"

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'danger' | 'warning' } | null>(null);

  // Registered players management states
  const [showPlayersModal, setShowPlayersModal] = useState(false);
  const [selectedTourney, setSelectedTourney] = useState<Tournament | null>(null);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [registeredPlayersList, setRegisteredPlayersList] = useState<any[]>([]);

  // State for removing player
  const [removingPlayer, setRemovingPlayer] = useState<any | null>(null);
  const [removeReason, setRemoveReason] = useState('');
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [removeLoading, setRemoveLoading] = useState(false);

  // Match banners library
  const [bannerLibrary, setBannerLibrary] = useState<{ id: string; url: string }[]>([]);

  const fetchGamesAndTournaments = async () => {
    setLoading(true);
    try {
      const [gSnap, tSnap] = await Promise.all([
        get(ref(db, 'games')),
        get(ref(db, 'tournaments'))
      ]);

      if (gSnap.exists()) {
        const list = Object.entries(gSnap.val()).map(([id, val]: any) => ({
          id,
          name: val.name
        }));
        setGames(list);
      }

      if (tSnap.exists()) {
        const list = Object.entries(tSnap.val()).map(([id, val]: any) => ({
          id,
          ...val
        }));
        // Sort by start time descending
        list.sort((a, b) => b.startTime - a.startTime);
        setTournaments(list);
      } else {
        setTournaments([]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGamesAndTournaments();
  }, []);

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
              email: s.val().email || '',
              photoURL: s.val().photoURL,
              balance: s.val().balance || 0,
              username: playersData[uid].username,
              gameUid: playersData[uid].gameUid,
              entryFeePaid: playersData[uid].entryFeeDeducted !== undefined ? Number(playersData[uid].entryFeeDeducted) : Number(t.entryFee)
            };
          }
          return {
            uid,
            displayName: 'Unknown Player',
            username: playersData[uid].username,
            gameUid: playersData[uid].gameUid,
            entryFeePaid: Number(t.entryFee)
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

  const handleRemovePlayerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTourney || !removingPlayer) return;
    if (!removeReason.trim()) {
      alert('Please enter a reason for player removal.');
      return;
    }

    setRemoveLoading(true);
    const refundAmt = Number(removingPlayer.entryFeePaid) || 0;
    
    try {
      // 1. Transaction to refund user's wallet AND clean up joinedTournaments
      const userRef = ref(db, `users/${removingPlayer.uid}`);
      await runTransaction(userRef, (profData) => {
        if (profData) {
          // Refund balance
          if (refundAmt > 0) {
            profData.balance = (profData.balance || 0) + refundAmt;
          }
          // Remove from joined match roster check
          if (profData.joinedTournaments) {
            delete profData.joinedTournaments[selectedTourney.id];
          }
        }
        return profData;
      });

      // Write transaction log for the player if refund was made
      if (refundAmt > 0) {
        const txKey = push(ref(db, `transactions/${removingPlayer.uid}`)).key;
        await set(ref(db, `transactions/${removingPlayer.uid}/${txKey}`), {
          type: 'admin_refund',
          amount: refundAmt,
          description: `Refund for Tournament: ${selectedTourney.name} (Removed: ${removeReason.trim()})`,
          timestamp: serverTimestamp()
        });
      }

      // 2. Remove player from tournament
      await remove(ref(db, `tournaments/${selectedTourney.id}/registeredPlayers/${removingPlayer.uid}`));

      // 3. Send notification to user's notifications node
      const notifKey = push(ref(db, `users/${removingPlayer.uid}/notifications`)).key;
      await set(ref(db, `users/${removingPlayer.uid}/notifications/${notifKey}`), {
        title: 'Match Registration Cancelled',
        message: `You have been removed from the match "${selectedTourney.name}" by the Administrator. Reason: "${removeReason.trim()}". A refund of ₹${refundAmt} has been credited back to your wallet.`,
        timestamp: serverTimestamp(),
        read: false
      });

      alert(`Player successfully removed from tournament and ₹${refundAmt} refunded.`);
      setShowRemoveConfirm(false);
      setRemovingPlayer(null);
      setRemoveReason('');
      
      // Reload players list
      handleOpenPlayers(selectedTourney);
      // Reload tournaments list
      fetchGamesAndTournaments();
    } catch (err: any) {
      console.error(err);
      alert('Failed to remove player: ' + err.message);
    } finally {
      setRemoveLoading(false);
    }
  };

  const parsePrizeDistribution = (str: string): Record<string, number> => {
    const obj: Record<string, number> = {};
    if (!str.trim()) return obj;
    const lines = str.split('\n');
    lines.forEach(line => {
      const parts = line.split(':');
      if (parts.length === 2) {
        // Strip out forbidden Firebase key characters: . $ # [ ] /
        const rank = parts[0].replace(/[\.\$#\[\]\/]/g, '').trim();
        const prize = parseFloat(parts[1].trim());
        if (rank && !isNaN(prize)) {
          obj[rank] = prize;
        }
      }
    });
    return obj;
  };

  const formatPrizeDistribution = (dist: Record<string, number> | string | undefined): string => {
    if (!dist) return '';
    if (typeof dist === 'string') return dist;
    return Object.entries(dist)
      .map(([rank, prize]) => `${rank}: ${prize}`)
      .join('\n');
  };

  const handleOpenAdd = () => {
    setEditId(null);
    setName('');
    setGameId(games[0]?.id || '');
    // Default current time offset by 1 hour
    const now = new Date();
    now.setHours(now.getHours() + 1);
    const tzoffset = now.getTimezoneOffset() * 60000;
    const localISOTime = new Date(now.getTime() - tzoffset).toISOString().slice(0, 16);
    setStartTimeStr(localISOTime);

    setStatus('upcoming');
    setMode('Solo');
    setEntryFee(10);
    setPrizePool(100);
    setPerKillPrize(2);
    setMaxPlayers(50);
    setTagsStr('Mobile, Bermuda');
    setBannerUrl('');
    setDescription('1. Hacker/Cheaters are banned.\n2. Team-up leads to disqualification.\n3. Take screenshot of your match result.');
    setRoomId('');
    setRoomPassword('');
    setShowIdPass(false);
    setPrizeDistStr('1: 50\n2: 30\n3: 20');
    setMsg(null);
    setShowModal(true);
  };

  const handleOpenEdit = (t: Tournament) => {
    setEditId(t.id);
    setName(t.name);
    setGameId(t.gameId);
    
    // Format timestamp back to HTML local datetime
    const date = new Date(t.startTime);
    const tzoffset = date.getTimezoneOffset() * 60000;
    const localISOTime = new Date(date.getTime() - tzoffset).toISOString().slice(0, 16);
    setStartTimeStr(localISOTime);

    setStatus(t.status);
    setMode(t.mode || 'Solo');
    setEntryFee(t.entryFee);
    setPrizePool(t.prizePool);
    setPerKillPrize(t.perKillPrize);
    setMaxPlayers(t.maxPlayers);
    setTagsStr((t.tags || []).join(', '));
    setBannerUrl(t.bannerUrl || '');
    setDescription(t.description || '');
    setRoomId(t.roomId || '');
    setRoomPassword(t.roomPassword || '');
    setShowIdPass(t.showIdPass || false);
    setPrizeDistStr(formatPrizeDistribution(t.prizeDistribution));
    setMsg(null);
    setShowModal(true);
  };

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBannerUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const resp = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
        method: 'POST',
        body: formData
      });
      const data = await resp.json();
      if (data.success) {
        const url = data.data.url;
        setBannerUrl(url);
        
        // Auto-save uploaded banners to match banner library (uploads/banners)
        try {
          await push(ref(db, 'uploads/banners'), url);
          // Sync locally so it appears in Selector immediately without refetching
          setBannerLibrary(prev => [...prev, { id: Math.random().toString(36).substr(2, 9), url }]);
        } catch (dbErr) {
          console.error('Failed to add uploaded banner to Match Banner Library:', dbErr);
        }
        alert('Banner uploaded and saved to library!');
      } else {
        throw new Error(data.error?.message || 'Failed to upload image.');
      }
    } catch (err: any) {
      alert('Upload failed: ' + err.message);
    } finally {
      setBannerUploading(false);
      if (bannerFileInputRef.current) bannerFileInputRef.current.value = '';
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this tournament? This will also remove all logs.')) return;
    try {
      await remove(ref(db, `tournaments/${id}`));
      alert('Tournament deleted.');
      fetchGamesAndTournaments();
    } catch (err: any) {
      alert('Delete failed: ' + err.message);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !gameId || !startTimeStr) {
      setMsg({ text: 'Name, game, and start time are required.', type: 'warning' });
      return;
    }

    setSaving(true);
    setMsg(null);

    const timestamp = new Date(startTimeStr).getTime();
    const tags = tagsStr.split(',').map(x => x.trim()).filter(Boolean);
    const prizeDistribution = parsePrizeDistribution(prizeDistStr);

    const tData: any = {
      name: name.trim(),
      gameId,
      startTime: timestamp,
      status,
      mode,
      entryFee: Number(entryFee) || 0,
      prizePool: Number(prizePool) || 0,
      perKillPrize: Number(perKillPrize) || 0,
      maxPlayers: Number(maxPlayers) || 0,
      tags,
      bannerUrl: bannerUrl.trim() || null,
      description: description.trim(),
      roomId: roomId.trim() || null,
      roomPassword: roomPassword.trim() || null,
      showIdPass,
      prizeDistribution
    };

    try {
      if (editId) {
        if (status === 'cancelled') {
          const tSnap = await get(ref(db, `tournaments/${editId}`));
          if (tSnap.exists()) {
            const tVal = tSnap.val();
            if (tVal.status !== 'cancelled') {
              const regPlayers = tVal.registeredPlayers || {};
              const uids = Object.keys(regPlayers);
              for (const uid of uids) {
                const refundAmt = Number(regPlayers[uid].entryFeeDeducted !== undefined ? regPlayers[uid].entryFeeDeducted : tVal.entryFee) || 0;
                if (refundAmt > 0) {
                  // 1. Transaction to refund user's wallet AND clean up joinedTournaments
                  const userRef = ref(db, `users/${uid}`);
                  await runTransaction(userRef, (profData) => {
                    if (profData) {
                      profData.balance = (profData.balance || 0) + refundAmt;
                      if (profData.joinedTournaments) {
                        delete profData.joinedTournaments[editId];
                      }
                    }
                    return profData;
                  });

                  // 2. Write transaction log
                  const txKey = push(ref(db, `transactions/${uid}`)).key;
                  await set(ref(db, `transactions/${uid}/${txKey}`), {
                    type: 'match_cancelled_refund',
                    amount: refundAmt,
                    description: `Refund for Cancelled Match: ${tVal.name}`,
                    timestamp: serverTimestamp()
                  });

                  // 3. Write notification log
                  const notifKey = push(ref(db, `users/${uid}/notifications`)).key;
                  await set(ref(db, `users/${uid}/notifications/${notifKey}`), {
                    title: 'Match Cancelled & Refunded',
                    message: `The match "${tVal.name}" has been cancelled by the administrator. A full refund of ₹${refundAmt} has been credited to your wallet.`,
                    timestamp: serverTimestamp(),
                    read: false
                  });
                }
              }
              tData.cancelledAt = Date.now();
            } else if (tVal.cancelledAt) {
              tData.cancelledAt = tVal.cancelledAt;
            }
          }
        }

        tData.updatedAt = serverTimestamp();
        await update(ref(db, `tournaments/${editId}`), tData);
      } else {
        tData.createdAt = serverTimestamp();
        tData.registeredPlayers = {};
        const newRef = push(ref(db, 'tournaments'));
        await set(newRef, tData);
      }

      alert('Tournament saved successfully!');
      setShowModal(false);
      fetchGamesAndTournaments();
    } catch (err: any) {
      console.error(err);
      setMsg({ text: err.message || 'Saving failed.', type: 'danger' });
    } finally {
      setSaving(false);
    }
  };

  const getGameName = (id: string) => {
    const game = games.find(g => g.id === id);
    return game ? game.name : 'Unknown Game';
  };

  return (
    <div className="admin-tournaments-view">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>Manage Tournaments</h2>
        {!isTournamentsLocked && (
          <button className="btn btn-success btn-sm" onClick={handleOpenAdd}>
            <i className="bi bi-plus-circle"></i> Create Tournament
          </button>
        )}
      </div>

      {loading ? (
        <div className="placeholder-glow py-5 rounded-3" style={{ height: '300px' }}></div>
      ) : (
        <div className="table-responsive card custom-card">
          <table className="table table-dark table-hover mb-0">
            <thead>
              <tr>
                <th>Tournament Name</th>
                <th>Game</th>
                <th>Entry Fee</th>
                <th>Prize Pool</th>
                <th>Spots (Joined/Max)</th>
                <th>Status</th>
                <th>Starts At</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tournaments.length > 0 ? (
                tournaments.map(t => {
                  let statusColor = 'secondary';
                  if (t.status === 'upcoming') statusColor = 'info';
                  else if (t.status === 'ongoing') statusColor = 'success';
                  else if (t.status === 'result') statusColor = 'primary';
                  else if (t.status === 'cancelled') statusColor = 'danger';

                  const regCount = t.registeredPlayers ? Object.keys(t.registeredPlayers).length : 0;
                  const spotsColor = regCount >= t.maxPlayers ? 'text-danger fw-bold' : 'text-secondary';

                  return (
                    <tr key={t.id}>
                      <td className="align-middle fw-bold">{t.name}</td>
                      <td className="align-middle text-secondary">{getGameName(t.gameId)}</td>
                      <td className="align-middle">₹{t.entryFee}</td>
                      <td className="align-middle text-accent fw-bold">₹{t.prizePool}</td>
                      <td className="align-middle small">
                        <span className={spotsColor}>{regCount}</span> / <span className="text-white fw-bold">{t.maxPlayers}</span>
                      </td>
                      <td className="align-middle">
                        <span className={`badge text-bg-${statusColor} text-uppercase`}>
                          {t.status}
                        </span>
                      </td>
                      <td className="align-middle small">
                        {new Date(t.startTime).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td className="align-middle">
                        <button 
                          className="btn btn-sm btn-outline-warning me-2" 
                          onClick={() => {
                            if (isTournamentsLocked) {
                              alert('This feature is locked because your subscription has expired. Please renew to manage players.');
                              return;
                            }
                            handleOpenPlayers(t);
                          }}
                          style={{ opacity: isTournamentsLocked ? 0.5 : 1 }}
                          title={isTournamentsLocked ? "Feature locked (Subscription expired)" : "View Registered Players"}
                        >
                          <i className="bi bi-people-fill me-1"></i> Players
                        </button>
                        <button 
                          className="btn btn-sm btn-info me-2" 
                          onClick={() => {
                            if (isTournamentsLocked) {
                              alert('This feature is locked because your subscription has expired. Please renew to edit tournaments.');
                              return;
                            }
                            handleOpenEdit(t);
                          }}
                          style={{ opacity: isTournamentsLocked ? 0.5 : 1 }}
                          title={isTournamentsLocked ? "Feature locked (Subscription expired)" : "Edit"}
                        >
                          <i className="bi bi-pencil-square"></i>
                        </button>
                        <button className="btn btn-sm btn-danger" onClick={() => handleDelete(t.id)}>
                          <i className="bi bi-trash"></i>
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} className="text-center text-secondary py-3">No tournaments created.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Modal Dialog */}
      {showModal && (
        <div 
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
          style={{ zIndex: 1050, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
        >
          <div className="custom-card p-4 mx-3" style={{ width: '100%', maxWidth: '650px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h5 className="modal-title m-0">{editId ? 'Edit Tournament' : 'Create Tournament'}</h5>
              <button className="btn-close btn-close-white" onClick={() => setShowModal(false)}></button>
            </div>

            <form onSubmit={handleSubmit}>
              {msg && <div className={`alert alert-${msg.type} py-2 small`}>{msg.text}</div>}

              <div className="row g-2 mb-3">
                <div className="col-md-6">
                  <label className="form-label text-start">Tournament Name</label>
                  <input type="text" className="form-control" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Daily Bermuda Rush" required />
                </div>
                <div className="col-md-6">
                  <label className="form-label text-start">Game Category</label>
                  <select className="form-select" value={gameId} onChange={(e) => setGameId(e.target.value)} required>
                    <option value="" disabled>-- Select Game --</option>
                    {games.map(g => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="row g-2 mb-3">
                <div className="col-md-4">
                  <label className="form-label text-start">Start Time</label>
                  <input type="datetime-local" className="form-control" value={startTimeStr} onChange={(e) => setStartTimeStr(e.target.value)} required />
                </div>
                <div className="col-md-4">
                  <label className="form-label text-start">Match Status</label>
                  <select className="form-select" value={status} onChange={(e: any) => setStatus(e.target.value)}>
                    <option value="upcoming">Upcoming</option>
                    <option value="ongoing">Ongoing</option>
                    <option value="completed">Completed</option>
                    <option value="result">Result Declared</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                <div className="col-md-4">
                  <label className="form-label text-start">Match Mode</label>
                  <select className="form-select" value={mode} onChange={(e: any) => setMode(e.target.value)}>
                    <option value="Solo">Solo Mode</option>
                    <option value="Duo">Duo Mode</option>
                  </select>
                </div>
              </div>

              <div className="row g-2 mb-3">
                <div className="col-md-3">
                  <label className="form-label text-start">Entry Fee (₹)</label>
                  <input type="number" className="form-control" value={entryFee} onChange={(e) => setEntryFee(Number(e.target.value))} min={0} required />
                </div>
                <div className="col-md-3">
                  <label className="form-label text-start">Prize Pool (₹)</label>
                  <input type="number" className="form-control" value={prizePool} onChange={(e) => setPrizePool(Number(e.target.value))} min={0} required />
                </div>
                <div className="col-md-3">
                  <label className="form-label text-start">Per Kill Prize (₹)</label>
                  <input type="number" className="form-control" value={perKillPrize} onChange={(e) => setPerKillPrize(Number(e.target.value))} min={0} required />
                </div>
                <div className="col-md-3">
                  <label className="form-label text-start">Max Players</label>
                  <input type="number" className="form-control" value={maxPlayers} onChange={(e) => setMaxPlayers(Number(e.target.value))} min={0} required />
                </div>
              </div>

              <div className="row g-2 mb-3">
                <div className="col-md-6">
                  <label className="form-label text-start">Tags (comma-separated)</label>
                  <input type="text" className="form-control" value={tagsStr} onChange={(e) => setTagsStr(e.target.value)} placeholder="e.g. Mobile, Classic" />
                </div>
                <div className="col-md-6">
                  <label className="form-label text-start small text-secondary fw-semibold">Tournament Banner</label>
                  <div 
                    className="d-flex gap-2 p-2 rounded-3" 
                    style={{ 
                      background: 'rgba(255, 255, 255, 0.015)',
                      border: '1px solid rgba(255, 255, 255, 0.06)'
                    }}
                  >
                    <button 
                      type="button"
                      className="btn text-white d-flex align-items-center gap-2 flex-grow-1 py-2 justify-content-center"
                      onClick={() => bannerFileInputRef.current?.click()}
                      disabled={bannerUploading}
                      style={{ 
                        borderRadius: '6px', 
                        fontSize: '0.78rem', 
                        fontWeight: 600,
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        transition: 'all 0.15s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                      }}
                    >
                      {bannerUploading ? (
                        <><span className="spinner-border spinner-border-sm me-1" style={{ width: '12px', height: '12px' }}></span>Uploading...</>
                      ) : (
                        <><i className="bi bi-cloud-upload text-warning"></i> Upload Banner</>
                      )}
                    </button>
                    <button 
                      type="button"
                      className="btn text-white d-flex align-items-center gap-2 flex-grow-1 py-2 justify-content-center"
                      onClick={() => setShowBannerSelector(true)}
                      style={{ 
                        borderRadius: '6px', 
                        fontSize: '0.78rem', 
                        fontWeight: 600,
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        transition: 'all 0.15s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                      }}
                    >
                      <i className="bi bi-images text-info"></i> Select from Library
                    </button>
                    <input 
                      ref={bannerFileInputRef}
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={handleBannerUpload}
                    />
                  </div>
                  {bannerUrl && (
                    <div className="mt-3 p-2 bg-dark bg-opacity-25 rounded border border-secondary border-opacity-25 text-start d-flex align-items-center justify-content-between">
                      <div className="d-flex align-items-center gap-2">
                        <img 
                          src={bannerUrl} 
                          alt="Banner Preview" 
                          style={{ width: '80px', height: '45px', borderRadius: '4px', objectFit: 'cover', border: '1px solid rgba(255,255,255,0.1)' }} 
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                        <span className="text-secondary small text-truncate" style={{ maxWidth: '180px', fontSize: '0.72rem' }}>
                          {bannerUrl}
                        </span>
                      </div>
                      <button 
                        type="button" 
                        className="btn btn-sm btn-outline-danger" 
                        onClick={() => setBannerUrl('')}
                        style={{ fontSize: '0.72rem', padding: '3px 8px', borderRadius: '4px' }}
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Room credentials */}
              <div className="row g-2 mb-3 p-3 bg-dark bg-opacity-25 rounded border border-secondary border-opacity-50">
                <div className="col-md-4">
                  <label className="form-label text-start">Custom Room ID</label>
                  <input type="text" className="form-control form-control-sm" value={roomId} onChange={(e) => setRoomId(e.target.value)} placeholder="Room ID" />
                </div>
                <div className="col-md-4">
                  <label className="form-label text-start">Room Password</label>
                  <input type="text" className="form-control form-control-sm" value={roomPassword} onChange={(e) => setRoomPassword(e.target.value)} placeholder="Password" />
                </div>
                <div className="col-md-4 d-flex align-items-center justify-content-center pt-4">
                  <div className="form-check">
                    <input 
                      type="checkbox" 
                      className="form-check-input" 
                      id="showIdPassCheck" 
                      checked={showIdPass} 
                      onChange={(e) => setShowIdPass(e.target.checked)} 
                    />
                    <label className="form-check-label text-light small" htmlFor="showIdPassCheck">Show Credentials to Players</label>
                  </div>
                </div>
              </div>

              <div className="row g-2 mb-4">
                <div className="col-md-6">
                  <label className="form-label text-start">Prize Payout Mapping (Format: "Rank: Prize")</label>
                  <textarea 
                    className="form-control font-monospace" 
                    value={prizeDistStr} 
                    onChange={(e) => setPrizeDistStr(e.target.value)}
                    placeholder="1: 50&#10;2: 30&#10;3: 20" 
                    style={{ minHeight: '120px', fontSize: '0.85rem' }}
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label text-start">Guidelines & Rules (Markdown/Plain)</label>
                  <textarea 
                    className="form-control" 
                    value={description} 
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Rules list..." 
                    style={{ minHeight: '120px', fontSize: '0.85rem' }}
                  />
                </div>
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
                  type="button" 
                  className="btn btn-outline-info flex-grow-1 d-flex align-items-center justify-content-center gap-1.5"
                  onClick={() => setShowCardPreview(true)}
                  style={{ borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600 }}
                >
                  <i className="bi bi-eye"></i> Preview Card
                </button>
                <button 
                  type="submit" 
                  className="btn-custom btn-custom-primary flex-grow-1"
                  disabled={saving}
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Match Banner Library Selector Modal */}
      {showBannerSelector && (
        <div 
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
          style={{ zIndex: 1100, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)' }}
          onClick={() => setShowBannerSelector(false)}
        >
          <div 
            className="custom-card p-4 mx-3" 
            style={{ width: '100%', maxWidth: '520px', maxHeight: '80vh', overflowY: 'auto', background: '#0B0F19', border: '1px solid rgba(255,255,255,0.08)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="d-flex justify-content-between align-items-center mb-4">
              <h5 className="modal-title m-0 text-white fw-bold">
                <i className="bi bi-images text-warning me-2"></i>Select Match Banner
              </h5>
              <button className="btn-close btn-close-white" onClick={() => setShowBannerSelector(false)}></button>
            </div>

            {bannerLibrary.length === 0 ? (
              <div className="text-center text-secondary py-5">
                <i className="bi bi-image fs-1 d-block mb-3 text-muted"></i>
                <p className="m-0">No banners found in library.</p>
                <small className="text-secondary">Upload banners in Settings to choose them here.</small>
              </div>
            ) : (
              <div className="row g-3" style={{ maxHeight: '450px', overflowY: 'auto' }}>
                {bannerLibrary.map((b) => {
                  const isSelected = b.url === bannerUrl;
                  return (
                    <div className="col-6 col-sm-4" key={b.id}>
                      <div 
                        onClick={() => {
                          setBannerUrl(b.url);
                          setShowBannerSelector(false);
                        }}
                        style={{
                          cursor: 'pointer',
                          position: 'relative',
                          borderRadius: '10px',
                          overflow: 'hidden',
                          border: isSelected ? '3px solid #facc15' : '1px solid rgba(255,255,255,0.1)',
                          background: '#1F2937',
                          aspectRatio: '16/9',
                          transition: 'all 0.2s ease',
                          boxShadow: isSelected ? '0 0 15px rgba(250, 204, 21, 0.4)' : 'none'
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)';
                          e.currentTarget.style.transform = 'scale(1.03)';
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                          e.currentTarget.style.transform = 'scale(1)';
                        }}
                      >
                        <img 
                          src={b.url} 
                          alt="Banner option" 
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                        {isSelected && (
                          <div 
                            style={{
                              position: 'absolute',
                              top: '4px',
                              right: '4px',
                              background: '#facc15',
                              color: '#000',
                              borderRadius: '50%',
                              width: '18px',
                              height: '18px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '0.7rem',
                              fontWeight: 'bold'
                            }}
                          >
                            ✓
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="d-flex justify-content-end mt-4">
              <button 
                type="button" 
                className="btn btn-secondary btn-sm px-4" 
                style={{ borderRadius: '6px' }}
                onClick={() => setShowBannerSelector(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Match Card Preview Modal */}
      {showCardPreview && (
        <div 
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
          style={{ zIndex: 1120, background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(8px)' }}
          onClick={() => setShowCardPreview(false)}
        >
          <div 
            className="custom-card p-4 mx-3" 
            style={{ width: '100%', maxWidth: '400px', background: '#0B0F19', border: '1px solid rgba(255,255,255,0.08)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="d-flex justify-content-between align-items-center mb-4">
              <h6 className="modal-title m-0 text-white fw-bold">
                <i className="bi bi-eye text-info me-2"></i>Match Card Preview
              </h6>
              <button className="btn-close btn-close-white" onClick={() => setShowCardPreview(false)}></button>
            </div>

            {/* Replicated User Panel Tournament Card */}
            <div className="tournament-card text-start animate-fade-in" style={{ background: '#111827', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
              <img 
                src={bannerUrl || 'https://via.placeholder.com/400x225/1E293B/94A3B8?text=Match+Banner'} 
                alt="Tournament Banner" 
                className="tournament-banner-image" 
                style={{ width: '100%', height: '170px', objectFit: 'cover' }}
              />
              
              <div className="tournament-card-content p-3.5" style={{ padding: '14px' }}>
                <div className="tournament-card-header d-flex justify-content-between align-items-center mb-2" style={{ display: 'flex', justifycontent: 'space-between', alignitems: 'center' }}>
                  <div className="tournament-card-tags d-flex gap-1" style={{ display: 'flex', gap: '4px' }}>
                    <span className="badge bg-secondary text-white-50" style={{ fontSize: '0.62rem', padding: '3px 8px', background: 'rgba(255,255,255,0.05)' }}>{mode || 'Solo'}</span>
                    <span className="badge bg-secondary text-white-50" style={{ fontSize: '0.62rem', padding: '3px 8px', background: 'rgba(255,255,255,0.05)' }}>Bermuda</span>
                  </div>
                  <div className="tournament-card-timer text-warning fw-bold" style={{ fontSize: '0.72rem' }}>02d 14h 30m</div>
                </div>
                
                <h3 className="tournament-card-title text-white fw-bold fs-6 mb-2" style={{ fontSize: '0.92rem', color: '#F3F4F6' }}>
                  <i className="bi bi-joystick text-accent me-1.5" style={{ color: '#FACC15' }}></i> {name || 'Bermuda Grand Cup'}
                </h3>
                
                <p className="small text-secondary mb-3 d-flex align-items-center gap-1.5" style={{ fontSize: '0.75rem', color: '#9CA3AF' }}>
                  <i className="bi bi-calendar-event"></i> {startTimeStr ? new Date(startTimeStr).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : '07/15/2026, 18:00'}
                </p>
                
                <div className="tournament-card-info d-flex justify-content-between p-2.5 rounded mb-3" style={{ display: 'flex', justifycontent: 'space-between', padding: '10px', background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '8px' }}>
                  <div className="info-item d-flex flex-column" style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '0.65rem', color: '#6B7280' }}>Prize Pool</span>
                    <strong style={{ fontSize: '0.8rem', color: '#FACC15' }}><i className="bi bi-trophy-fill me-1"></i>₹{prizePool || 0}</strong>
                  </div>
                  <div className="info-item d-flex flex-column" style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '0.65rem', color: '#6B7280' }}>Per Kill</span>
                    <strong style={{ fontSize: '0.8rem', color: '#E5E7EB' }}>₹{perKillPrize || 0}</strong>
                  </div>
                  <div className="info-item d-flex flex-column" style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '0.65rem', color: '#6B7280' }}>Entry Fee</span>
                    <strong style={{ fontSize: '0.8rem', color: '#3B82F6' }}>{entryFee > 0 ? `₹${entryFee}` : 'Free'}</strong>
                  </div>
                </div>

                <div className="tournament-card-spots mt-3">
                  <div className="d-flex justify-content-between mb-1 text-secondary" style={{ display: 'flex', justifycontent: 'space-between', fontSize: '0.7rem' }}>
                    <span>{maxPlayers || 100} Spots Left</span>
                    <span>0 / {maxPlayers || 100}</span>
                  </div>
                  <div className="progress" style={{ height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px' }}>
                    <div className="progress-bar" style={{ width: '0%', background: '#FACC15', borderRadius: '3px' }}></div>
                  </div>
                </div>

                <div className="tournament-card-actions d-flex gap-2 mt-3" style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn btn-secondary btn-sm flex-grow-1" style={{ fontSize: '0.75rem', borderRadius: '6px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#9CA3AF' }} disabled>Rules</button>
                  <button className="btn btn-warning text-dark fw-bold btn-sm flex-grow-1" style={{ fontSize: '0.75rem', borderRadius: '6px', background: '#FACC15', border: 'none' }} disabled>₹{entryFee} Join</button>
                </div>
              </div>
            </div>

            <div className="d-flex justify-content-end mt-4">
              <button 
                type="button" 
                className="btn btn-secondary btn-sm px-4" 
                style={{ borderRadius: '6px' }}
                onClick={() => setShowCardPreview(false)}
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Registered Players Modal */}
      {showPlayersModal && selectedTourney && (
        <div 
          onClick={(e) => { if (e.target === e.currentTarget) setShowPlayersModal(false); }}
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
          style={{ zIndex: 1050, background: 'rgba(0,0,0,0.76)', backdropFilter: 'blur(5px)' }}
        >
          <div className="custom-card p-4 mx-3" style={{ width: '100%', maxWidth: '680px', maxHeight: '85vh', overflowY: 'auto' }}>
            <div className="d-flex justify-content-between align-items-center mb-4">
              <div>
                <h5 className="modal-title m-0 text-white fw-bold">
                  <i className="bi bi-people-fill text-warning me-2"></i>Match Registration Roster
                </h5>
                <span className="text-secondary small">{selectedTourney.name}</span>
              </div>
              <button className="btn-close btn-close-white" onClick={() => setShowPlayersModal(false)}></button>
            </div>

            {/* Roster Spot Stats Row */}
            <div className="row g-2 mb-4 text-center">
              <div className="col-4">
                <div className="p-2.5 rounded-2 bg-dark bg-opacity-25 border border-secondary border-opacity-10">
                  <span className="text-secondary small d-block">TOTAL SPOTS</span>
                  <strong className="text-white">{selectedTourney.maxPlayers}</strong>
                </div>
              </div>
              <div className="col-4">
                <div className="p-2.5 rounded-2 bg-dark bg-opacity-25 border border-secondary border-opacity-10">
                  <span className="text-secondary small d-block">JOINED SPOTS</span>
                  <strong className="text-success">{registeredPlayersList.length}</strong>
                </div>
              </div>
              <div className="col-4">
                <div className="p-2.5 rounded-2 bg-dark bg-opacity-25 border border-secondary border-opacity-10">
                  <span className="text-secondary small d-block">SPOTS REMAINING</span>
                  <strong className="text-accent">{Math.max(0, selectedTourney.maxPlayers - registeredPlayersList.length)}</strong>
                </div>
              </div>
            </div>

            {loadingPlayers ? (
              <div className="text-center py-5">
                <div className="spinner-border text-warning" role="status"></div>
                <div className="text-secondary small mt-2">Retrieving player entries...</div>
              </div>
            ) : (
              <div className="table-responsive card bg-dark bg-opacity-25 border border-secondary border-opacity-10 mb-4" style={{ maxHeight: '350px' }}>
                <table className="table table-dark table-hover mb-0 align-middle small text-start">
                  <thead>
                    <tr className="border-bottom border-secondary border-opacity-25" style={{ color: '#64748B' }}>
                      <th className="py-2.5 ps-3">Player Detail</th>
                      <th className="py-2.5">Game IGN</th>
                      <th className="py-2.5">Game UID</th>
                      <th className="py-2.5">Fee Paid</th>
                      <th className="py-2.5 pe-3 text-end">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {registeredPlayersList.length > 0 ? (
                      registeredPlayersList.map((player) => (
                        <tr key={player.uid} className="border-bottom border-secondary border-opacity-10">
                          <td className="py-2 ps-3">
                            <div className="fw-bold text-white">{player.displayName}</div>
                            <div className="text-secondary" style={{ fontSize: '0.72rem' }}>{player.email || 'No email'}</div>
                          </td>
                          <td className="py-2 font-monospace text-accent">{player.username}</td>
                          <td className="py-2 font-monospace text-secondary">{player.gameUid}</td>
                          <td className="py-2 text-success fw-bold">₹{player.entryFeePaid}</td>
                          <td className="py-2 pe-3 text-end">
                            <button 
                              className="btn btn-sm btn-outline-danger py-1 px-2"
                              onClick={() => {
                                setRemovingPlayer(player);
                                setRemoveReason('');
                                setShowRemoveConfirm(true);
                              }}
                              style={{ fontSize: '0.72rem', fontWeight: 600 }}
                            >
                              <i className="bi bi-person-dash-fill"></i> Remove
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="text-center text-secondary py-5">
                          <i className="bi bi-people fs-3 d-block mb-2"></i>
                          No registered participants in this match yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            <button className="btn-custom btn-custom-secondary w-100" onClick={() => setShowPlayersModal(false)}>
              Close Roster
            </button>
          </div>
        </div>
      )}

      {/* Remove Player & Refund Confirmation Modal */}
      {showRemoveConfirm && selectedTourney && removingPlayer && (
        <div 
          onClick={(e) => { if (e.target === e.currentTarget) setShowRemoveConfirm(false); }}
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
          style={{ zIndex: 1100, background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(3px)' }}
        >
          <div className="custom-card p-4 mx-3" style={{ width: '100%', maxWidth: '440px' }}>
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h5 className="modal-title m-0 text-danger fw-bold">
                <i className="bi bi-exclamation-triangle-fill me-2"></i>Confirm Player Removal
              </h5>
              <button className="btn-close btn-close-white" onClick={() => setShowRemoveConfirm(false)}></button>
            </div>

            <form onSubmit={handleRemovePlayerSubmit} className="text-start">
              <div className="p-3 bg-danger bg-opacity-10 border border-danger border-opacity-25 rounded-2 mb-3">
                <div className="small text-white mb-1">
                  You are removing <strong className="text-accent">{removingPlayer.displayName}</strong> ({removingPlayer.username}) from the match.
                </div>
                <div className="small text-danger fw-bold">
                  A full refund of ₹{removingPlayer.entryFeePaid} will be credited to their wallet balance automatically.
                </div>
              </div>

              <div className="mb-3">
                <label className="form-label text-secondary small">Reason for Removal (Sent to Player)</label>
                <textarea 
                  className="form-control"
                  rows={3}
                  value={removeReason}
                  onChange={(e) => setRemoveReason(e.target.value)}
                  placeholder="e.g. Incomplete profile / Wrong game name / Code of conduct violation"
                  required
                  style={{ fontSize: '0.85rem' }}
                />
              </div>

              <div className="d-flex gap-2">
                <button 
                  type="button" 
                  className="btn-custom btn-custom-secondary flex-grow-1"
                  onClick={() => setShowRemoveConfirm(false)}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-danger flex-grow-1"
                  disabled={removeLoading}
                  style={{ borderRadius: '4px', fontSize: '0.82rem', fontWeight: 700 }}
                >
                  {removeLoading ? 'Removing & Refunding...' : 'Confirm Remove'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminTournaments;
