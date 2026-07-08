import React, { useEffect, useState } from 'react';
import { ref, get, set, update, push, serverTimestamp } from 'firebase/database';
import { db } from '../../firebase';

const IMGBB_API_KEY = '17524c13e2cca244c03f6ad0db42e5e0';

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
  timestamp: number;
  status: 'pending' | 'completed';
  voucherCode?: string;
  voucherPin?: string;
  pinEnabled?: boolean;
  adminNote?: string;
  processedAt?: number;
}

interface SpinWinRecord {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  itemLabel: string;
  itemType: string;
  value: number;
  timestamp: number;
}

const AdminEarningZone: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'wheel' | 'missions' | 'claims' | 'audit' | 'milestones'>('wheel');
  const [loading, setLoading] = useState(true);

  // Milestone configs
  const milestoneTargets = {
    withdraw: [200, 500, 1000, 5000, 8000, 10000, 15000, 18000, 20000],
    matches: [1, 5, 10, 20, 50, 65, 70, 85, 100],
    wins: [1, 5, 10, 20, 30, 50, 65, 75, 80, 90, 100]
  };
  const [milestonesConfig, setMilestonesConfig] = useState<Record<string, Record<string, { label: string; type: string; value: number }>>>({
    withdraw: {},
    matches: {},
    wins: {}
  });
  const [activeMilestoneSubTab, setActiveMilestoneSubTab] = useState<'withdraw' | 'matches' | 'wins'>('withdraw');
  const [savingMilestones, setSavingMilestones] = useState(false);

  // Wheel state variables
  const [wheelEnabled, setWheelEnabled] = useState(true);
  const [adCountRequired, setAdCountRequired] = useState(3);
  const [spinCoinCost, setSpinCoinCost] = useState(10);
  const [dailySpinLimit, setDailySpinLimit] = useState(5);
  const [sectors, setSectors] = useState<Sector[]>([]);

  // Slices editor states
  const [sliceLabel, setSliceLabel] = useState('');
  const [sliceValue, setSliceValue] = useState(0);
  const [sliceType, setSliceType] = useState<Sector['type']>('coin');
  const [sliceWinRate, setSliceWinRate] = useState(10);
  const [sliceDailyLimit, setSliceDailyLimit] = useState(100);
  const [sliceShowpiece, setSliceShowpiece] = useState(false);
  const [sliceFile, setSliceFile] = useState<File | null>(null);
  const [editorLoading, setEditorLoading] = useState(false);

  // Missions state variables
  const [missions, setMissions] = useState<Mission[]>([]);
  const [missionTitle, setMissionTitle] = useState('');
  const [missionType, setMissionType] = useState<Mission['type']>('play_matches');
  const [missionTarget, setMissionTarget] = useState(3);
  const [missionRewardAmt, setMissionRewardAmt] = useState(5);
  const [missionRewardType, setMissionRewardType] = useState<Mission['rewardType']>('coin');
  const [missionReset, setMissionReset] = useState<Mission['resetLimit']>('daily');

  // Claims state variables
  const [claims, setClaims] = useState<Claim[]>([]);
  const [selectedClaim, setSelectedClaim] = useState<Claim | null>(null);
  const [claimVoucherCode, setClaimVoucherCode] = useState('');
  const [pinEnabled, setPinEnabled] = useState(false);
  const [claimVoucherPin, setClaimVoucherPin] = useState('');
  const [claimAdminNote, setClaimAdminNote] = useState('');
  const [claimLoading, setClaimLoading] = useState(false);

  // Audit list
  const [spinHistory, setSpinHistory] = useState<SpinWinRecord[]>([]);

  const fetchEarningZoneData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Wheel configs
      const configSnap = await get(ref(db, 'earningZoneConfig'));
      if (configSnap.exists()) {
        const cVal = configSnap.val();
        setWheelEnabled(cVal.wheelEnabled ?? true);
        setAdCountRequired(cVal.adCountRequired ?? 3);
        setSpinCoinCost(cVal.spinCoinCost ?? 10);
        setDailySpinLimit(cVal.dailySpinLimit ?? 5);

        if (cVal.wheelSectors) {
          const list = Object.entries(cVal.wheelSectors).map(([id, val]: any) => ({
            id,
            ...val
          }));
          setSectors(list);
        } else {
          setSectors([]);
        }

        // Fetch milestones config
        if (cVal.milestones) {
          setMilestonesConfig({
            withdraw: cVal.milestones.withdraw || {},
            matches: cVal.milestones.matches || {},
            wins: cVal.milestones.wins || {}
          });
        } else {
          const initialMap: any = { withdraw: {}, matches: {}, wins: {} };
          milestoneTargets.withdraw.forEach(amt => {
            initialMap.withdraw[amt] = { label: `₹50 Coins`, type: 'coin', value: 50 };
          });
          milestoneTargets.matches.forEach(amt => {
            initialMap.matches[amt] = { label: `₹50 Coins`, type: 'coin', value: 50 };
          });
          milestoneTargets.wins.forEach(amt => {
            initialMap.wins[amt] = { label: `₹50 Coins`, type: 'coin', value: 50 };
          });
          setMilestonesConfig(initialMap);
        }
      } else {
        // Initialize config
        const defaults = {
          wheelEnabled: true,
          adCountRequired: 3,
          spinCoinCost: 10,
          dailySpinLimit: 5
        };
        await set(ref(db, 'earningZoneConfig'), defaults);
      }

      // 2. Fetch Missions
      const missionsSnap = await get(ref(db, 'missionConfig'));
      if (missionsSnap.exists()) {
        const list = Object.entries(missionsSnap.val()).map(([id, val]: any) => ({
          id,
          ...val
        }));
        setMissions(list);
      } else {
        setMissions([]);
      }

      // 3. Fetch Claim Tickets
      const claimsSnap = await get(ref(db, 'earningZoneClaims'));
      if (claimsSnap.exists()) {
        const list = Object.entries(claimsSnap.val()).map(([id, val]: any) => ({
          id,
          ...val
        }));
        // Sort newest first
        list.sort((a, b) => b.timestamp - a.timestamp);
        setClaims(list);
      } else {
        setClaims([]);
      }

      // 4. Fetch Spin Winnings Audit
      const historySnap = await get(ref(db, 'earningZoneHistory'));
      if (historySnap.exists()) {
        const list = Object.entries(historySnap.val()).map(([id, val]: any) => ({
          id,
          ...val
        }));
        list.sort((a, b) => b.timestamp - a.timestamp);
        setSpinHistory(list.slice(0, 100)); // Show latest 100
      } else {
        setSpinHistory([]);
      }

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEarningZoneData();
  }, []);

  // Update Config Global settings
  const handleUpdateConfig = async () => {
    try {
      await update(ref(db, 'earningZoneConfig'), {
        wheelEnabled,
        adCountRequired: Number(adCountRequired),
        spinCoinCost: Number(spinCoinCost),
        dailySpinLimit: Number(dailySpinLimit)
      });
      alert('Global configuration updated successfully.');
    } catch (err: any) {
      alert('Update failed: ' + err.message);
    }
  };

  // Add Wheel sector slice
  const handleAddSector = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sliceLabel.trim()) return;

    setEditorLoading(true);
    let imageUrl = '';

    try {
      if (sliceType === 'custom' && sliceFile) {
        const formData = new FormData();
        formData.append('image', sliceFile);
        const resp = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
          method: 'POST',
          body: formData
        });
        const respData = await resp.json();
        if (respData.data && respData.data.url) {
          imageUrl = respData.data.url;
        } else {
          throw new Error('Image upload failed to Imgbb.');
        }
      }

      const secRef = push(ref(db, 'earningZoneConfig/wheelSectors'));
      await set(secRef, {
        label: sliceLabel.trim(),
        value: Number(sliceValue),
        type: sliceType,
        winRate: Number(sliceWinRate),
        dailyLimit: Number(sliceDailyLimit),
        isShowpiece: sliceShowpiece,
        imageUrl: imageUrl || null
      });

      setSliceLabel('');
      setSliceValue(0);
      setSliceWinRate(10);
      setSliceDailyLimit(100);
      setSliceShowpiece(false);
      setSliceFile(null);

      alert('Wheel slice added successfully.');
      fetchEarningZoneData();
    } catch (err: any) {
      alert('Failed: ' + err.message);
    } finally {
      setEditorLoading(false);
    }
  };

  // Delete Wheel sector slice
  const handleDeleteSector = async (id: string) => {
    if (!confirm('Are you sure you want to delete this wheel slice?')) return;
    try {
      await set(ref(db, `earningZoneConfig/wheelSectors/${id}`), null);
      alert('Slice deleted.');
      fetchEarningZoneData();
    } catch (err: any) {
      alert('Failed: ' + err.message);
    }
  };

  // Add daily mission
  const handleAddMission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!missionTitle.trim()) return;

    try {
      const missionRef = push(ref(db, 'missionConfig'));
      await set(missionRef, {
        title: missionTitle.trim(),
        type: missionType,
        targetValue: Number(missionTarget),
        rewardAmount: Number(missionRewardAmt),
        rewardType: missionRewardType,
        resetLimit: missionReset
      });

      setMissionTitle('');
      setMissionTarget(3);
      setMissionRewardAmt(5);
      alert('Daily mission added successfully.');
      fetchEarningZoneData();
    } catch (err: any) {
      alert('Failed: ' + err.message);
    }
  };

  // Delete mission
  const handleDeleteMission = async (id: string) => {
    if (!confirm('Are you sure you want to delete this mission config?')) return;
    try {
      await set(ref(db, `missionConfig/${id}`), null);
      alert('Mission deleted.');
      fetchEarningZoneData();
    } catch (err: any) {
      alert('Failed: ' + err.message);
    }
  };

  // Handle claim request approval
  const handleProcessClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClaim) return;
    if (!claimVoucherCode.trim()) {
      alert('Please fill out the voucher code / reward details.');
      return;
    }
    if (pinEnabled && !claimVoucherPin.trim()) {
      alert('Please fill out the voucher PIN.');
      return;
    }

    setClaimLoading(true);
    try {
      const updates: any = {};
      updates[`earningZoneClaims/${selectedClaim.id}/status`] = 'completed';
      updates[`earningZoneClaims/${selectedClaim.id}/voucherCode`] = claimVoucherCode.trim();
      updates[`earningZoneClaims/${selectedClaim.id}/pinEnabled`] = pinEnabled;
      updates[`earningZoneClaims/${selectedClaim.id}/voucherPin`] = pinEnabled ? claimVoucherPin.trim() : null;
      updates[`earningZoneClaims/${selectedClaim.id}/adminNote`] = claimAdminNote.trim();
      updates[`earningZoneClaims/${selectedClaim.id}/processedAt`] = serverTimestamp();

      await update(ref(db), updates);

      // Notify User
      const notifKey = push(ref(db, `users/${selectedClaim.userId}/notifications`)).key;
      const pinMsg = pinEnabled ? ` (PIN: ${claimVoucherPin.trim()})` : '';
      await set(ref(db, `users/${selectedClaim.userId}/notifications/${notifKey}`), {
        title: 'Earning Zone Reward Claimed! 🎉',
        message: `Your reward request for "${selectedClaim.itemLabel}" was approved. Code: ${claimVoucherCode.trim()}${pinMsg}. Notes: ${claimAdminNote.trim()}`,
        timestamp: serverTimestamp()
      });

      alert('Claim request processed successfully!');
      setSelectedClaim(null);
      setClaimVoucherCode('');
      setPinEnabled(false);
      setClaimVoucherPin('');
      setClaimAdminNote('');
      fetchEarningZoneData();
    } catch (err: any) {
      alert('Approval failed: ' + err.message);
    } finally {
      setClaimLoading(false);
    }
  };

  const handleSaveMilestones = async () => {
    setSavingMilestones(true);
    try {
      await update(ref(db, 'earningZoneConfig'), {
        milestones: milestonesConfig
      });
      alert('Milestone configuration updated successfully.');
      fetchEarningZoneData();
    } catch (err: any) {
      alert('Update failed: ' + err.message);
    } finally {
      setSavingMilestones(false);
    }
  };

  return (
    <div className="admin-withdrawals-view">
      <h2 className="mb-4">Earning Zone Manager</h2>

      {/* Tabs list */}
      <div className="custom-tabs-container mb-4">
        <button className={`tab-btn ${activeTab === 'wheel' ? 'active' : ''}`} onClick={() => setActiveTab('wheel')}>
          Lucky Wheel
        </button>
        <button className={`tab-btn ${activeTab === 'missions' ? 'active' : ''}`} onClick={() => setActiveTab('missions')}>
          Daily Achievements
        </button>
        <button className={`tab-btn ${activeTab === 'milestones' ? 'active' : ''}`} onClick={() => setActiveTab('milestones')}>
          Withdrawal Milestones
        </button>
        <button className={`tab-btn ${activeTab === 'claims' ? 'active' : ''}`} onClick={() => setActiveTab('claims')}>
          Reward Claims ({claims.filter(c => c.status === 'pending').length})
        </button>
        <button className={`tab-btn ${activeTab === 'audit' ? 'active' : ''}`} onClick={() => setActiveTab('audit')}>
          Spin Logs Audit
        </button>
      </div>

      {loading ? (
        <div className="placeholder-glow py-5 rounded-3" style={{ height: '350px' }}></div>
      ) : (
        <>
          {/* TAB 1: Lucky Wheel Config */}
          {activeTab === 'wheel' && (
            <div className="row g-4 text-start">
              {/* Wheel Settings Column */}
              <div className="col-md-5">
                <div className="card custom-card p-4 mb-4">
                  <h5 className="mb-4 text-white">Wheel Config Settings</h5>
                  <div className="form-group form-check mb-3">
                    <input 
                      type="checkbox" 
                      className="form-check-input" 
                      id="wheelEnabled" 
                      checked={wheelEnabled}
                      onChange={(e) => setWheelEnabled(e.target.checked)}
                    />
                    <label className="form-check-label text-white ms-2" htmlFor="wheelEnabled">Enable Spin Wheel Game</label>
                  </div>

                  <div className="form-group mb-3">
                    <label className="form-label">No. of Ads Required (Free Spin)</label>
                    <input 
                      type="number" 
                      className="form-control" 
                      value={adCountRequired} 
                      onChange={(e) => setAdCountRequired(Number(e.target.value))}
                    />
                  </div>

                  <div className="form-group mb-3">
                    <label className="form-label">Spin Cost (Rupees / Coins)</label>
                    <input 
                      type="number" 
                      className="form-control" 
                      value={spinCoinCost} 
                      onChange={(e) => setSpinCoinCost(Number(e.target.value))}
                    />
                  </div>

                  <div className="form-group mb-4">
                    <label className="form-label">Max Spins Allowed per User Daily</label>
                    <input 
                      type="number" 
                      className="form-control" 
                      value={dailySpinLimit} 
                      onChange={(e) => setDailySpinLimit(Number(e.target.value))}
                    />
                  </div>

                  <button className="btn btn-primary w-100 fw-bold" onClick={handleUpdateConfig}>
                    Save Settings
                  </button>
                </div>

                {/* Add Slices Form */}
                <div className="card custom-card p-4">
                  <h5 className="mb-4 text-white">Add Wheel Slice Item</h5>
                  <form onSubmit={handleAddSector}>
                    <div className="form-group mb-3">
                      <label className="form-label">Display Label</label>
                      <input 
                        type="text" 
                        className="form-control" 
                        placeholder="e.g. ₹50 Amazon Code" 
                        value={sliceLabel}
                        onChange={(e) => setSliceLabel(e.target.value)}
                        required
                      />
                    </div>

                    <div className="form-group mb-3">
                      <label className="form-label">Item Type</label>
                      <select 
                        className="form-control" 
                        value={sliceType}
                        onChange={(e) => setSliceType(e.target.value as Sector['type'])}
                      >
                        <option value="coin">Coin Payout</option>
                        <option value="diamond">Free Fire Diamonds</option>
                        <option value="google_play">Google Play Voucher</option>
                        <option value="amazon">Amazon Gift Voucher</option>
                        <option value="myntra">Myntra Voucher</option>
                        <option value="custom">Custom Upload reward</option>
                      </select>
                    </div>

                    <div className="form-group mb-3">
                      <label className="form-label">Payout Amount (Optional)</label>
                      <input 
                        type="number" 
                        className="form-control" 
                        value={sliceValue} 
                        onChange={(e) => setSliceValue(Number(e.target.value))}
                      />
                    </div>

                    <div className="form-group mb-3">
                      <label className="form-label">Win probability weight (Win Rate %)</label>
                      <input 
                        type="number" 
                        className="form-control" 
                        value={sliceWinRate} 
                        onChange={(e) => setSliceWinRate(Number(e.target.value))}
                      />
                      <small className="text-secondary small mt-1 d-block">Weights will be normalized automatically</small>
                    </div>

                    <div className="form-group mb-3">
                      <label className="form-label">Daily Win Limit per item</label>
                      <input 
                        type="number" 
                        className="form-control" 
                        value={sliceDailyLimit} 
                        onChange={(e) => setSliceDailyLimit(Number(e.target.value))}
                      />
                    </div>

                    <div className="form-group form-check mb-3">
                      <input 
                        type="checkbox" 
                        className="form-check-input" 
                        id="sliceShowpiece" 
                        checked={sliceShowpiece}
                        onChange={(e) => setSliceShowpiece(e.target.checked)}
                      />
                      <label className="form-check-label text-white ms-2" htmlFor="sliceShowpiece">Showpiece Only (Cannot be won)</label>
                    </div>

                    {sliceType === 'custom' && (
                      <div className="form-group mb-4">
                        <label className="form-label">Upload Custom Item Icon</label>
                        <input 
                          type="file" 
                          className="form-control" 
                          accept="image/*"
                          onChange={(e) => setSliceFile(e.target.files?.[0] || null)}
                          required
                        />
                      </div>
                    )}

                    <button className="btn btn-accent w-100 fw-bold animate-pulse" type="submit" disabled={editorLoading}>
                      {editorLoading ? 'Adding...' : 'Add Sector Slice'}
                    </button>
                  </form>
                </div>
              </div>

              {/* Slices list */}
              <div className="col-md-7">
                <div className="card custom-card p-4">
                  <h5 className="mb-4 text-white">Current Wheel Slices ({sectors.length})</h5>
                  <div className="table-responsive">
                    <table className="table table-dark table-hover mb-0">
                      <thead>
                        <tr>
                          <th>Label</th>
                          <th>Type</th>
                          <th>Value</th>
                          <th>Weight</th>
                          <th>Showpiece</th>
                          <th>Image</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sectors.length > 0 ? (
                          sectors.map((s) => (
                            <tr key={s.id}>
                              <td className="align-middle fw-semibold">{s.label}</td>
                              <td className="align-middle text-accent">{s.type.toUpperCase()}</td>
                              <td className="align-middle">{s.value}</td>
                              <td className="align-middle">{s.winRate}</td>
                              <td className="align-middle">{s.isShowpiece ? 'Yes' : 'No'}</td>
                              <td className="align-middle">
                                {s.imageUrl ? (
                                  <img src={s.imageUrl} alt="Icon" style={{ width: '28px', height: '28px', borderRadius: '4px' }} />
                                ) : (
                                  'N/A'
                                )}
                              </td>
                              <td className="align-middle">
                                <button className="btn btn-sm btn-outline-danger" onClick={() => handleDeleteSector(s.id)}>
                                  <i className="bi bi-trash"></i>
                                </button>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={7} className="text-center text-secondary py-3">No wheel slices configured yet.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Daily Achievements */}
          {activeTab === 'missions' && (
            <div className="row g-4 text-start">
              {/* Left Column: Add Mission Config */}
              <div className="col-md-5">
                <div className="card custom-card p-4">
                  <h5 className="mb-4 text-white">Create Achievement Mission</h5>
                  <form onSubmit={handleAddMission}>
                    <div className="form-group mb-3">
                      <label className="form-label">Mission title / objective</label>
                      <input 
                        type="text" 
                        className="form-control" 
                        placeholder="e.g. Play 5 squad battles" 
                        value={missionTitle}
                        onChange={(e) => setMissionTitle(e.target.value)}
                        required
                      />
                    </div>

                    <div className="form-group mb-3">
                      <label className="form-label">Objective Action Type</label>
                      <select 
                        className="form-control"
                        value={missionType}
                        onChange={(e) => setMissionType(e.target.value as Mission['type'])}
                      >
                        <option value="play_matches">Play Match entries</option>
                        <option value="booyah_matches">Booyah (Rank 1 Placements)</option>
                        <option value="spin_wheel">Lucky Spins Made</option>
                        <option value="deposit_cash">Add Cash Deposits</option>
                        <option value="withdraw_cash">Requested Withdrawals</option>
                        <option value="leaderboard_rank">Reach Leaderboard Top 3</option>
                        <option value="leaderboard_top50">Reach Leaderboard Top 50</option>
                        <option value="profile_pic">Upload Custom Avatar</option>
                      </select>
                    </div>

                    <div className="form-group mb-3">
                      <label className="form-label">Target Milestones count</label>
                      <input 
                        type="number" 
                        className="form-control" 
                        value={missionTarget}
                        onChange={(e) => setMissionTarget(Number(e.target.value))}
                        required
                      />
                    </div>

                    <div className="form-group mb-3">
                      <label className="form-label">Reward Amount</label>
                      <input 
                        type="number" 
                        className="form-control" 
                        value={missionRewardAmt}
                        onChange={(e) => setMissionRewardAmt(Number(e.target.value))}
                        required
                      />
                    </div>

                    <div className="form-group mb-3">
                      <label className="form-label">Reward Type</label>
                      <select 
                        className="form-control"
                        value={missionRewardType}
                        onChange={(e) => setMissionRewardType(e.target.value as Mission['rewardType'])}
                      >
                        <option value="coin">Deposit Cash</option>
                        <option value="bonus">Bonus Cash</option>
                      </select>
                    </div>

                    <div className="form-group mb-4">
                      <label className="form-label">Auto-Reset Interval</label>
                      <select 
                        className="form-control"
                        value={missionReset}
                        onChange={(e) => setMissionReset(e.target.value as Mission['resetLimit'])}
                      >
                        <option value="daily">Daily Reset</option>
                        <option value="weekly">Weekly Reset</option>
                        <option value="monthly">Monthly Reset</option>
                        <option value="yearly">Yearly Reset</option>
                        <option value="none">Lifetime (No Reset)</option>
                      </select>
                    </div>

                    <button className="btn btn-accent w-100 fw-bold" type="submit">
                      Add Mission
                    </button>
                  </form>
                </div>
              </div>

              {/* Right Column: Achievements list */}
              <div className="col-md-7">
                <div className="card custom-card p-4">
                  <h5 className="mb-4 text-white">Active Achievements ({missions.length})</h5>
                  <div className="table-responsive">
                    <table className="table table-dark table-hover mb-0">
                      <thead>
                        <tr>
                          <th>Title</th>
                          <th>Action</th>
                          <th>Target</th>
                          <th>Reward</th>
                          <th>Reset</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {missions.length > 0 ? (
                          missions.map((m) => (
                            <tr key={m.id}>
                              <td className="align-middle fw-semibold">{m.title}</td>
                              <td className="align-middle text-info small">{m.type.toUpperCase()}</td>
                              <td className="align-middle">{m.targetValue}</td>
                              <td className="align-middle fw-bold text-success">
                                ₹{m.rewardAmount} ({m.rewardType.toUpperCase()})
                              </td>
                              <td className="align-middle text-secondary small">{m.resetLimit.toUpperCase()}</td>
                              <td className="align-middle">
                                <button className="btn btn-sm btn-outline-danger" onClick={() => handleDeleteMission(m.id)}>
                                  <i className="bi bi-trash"></i>
                                </button>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={6} className="text-center text-secondary py-3">No missions configured.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Reward Claims */}
          {activeTab === 'claims' && (
            <div className="card custom-card text-start">
              <div className="table-responsive">
                <table className="table table-dark table-hover mb-0">
                  <thead>
                    <tr>
                      <th>Win Time</th>
                      <th>Player Details</th>
                      <th>Item Label</th>
                      <th>Type</th>
                      <th>Status</th>
                      <th>Voucher Code</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {claims.length > 0 ? (
                      claims.map((c) => {
                        const winTime = new Date(c.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
                        return (
                          <tr key={c.id}>
                            <td className="align-middle small">{winTime}</td>
                            <td className="align-middle text-start">
                              <div className="fw-semibold">{c.userName}</div>
                              <small className="text-secondary">{c.userEmail}</small>
                            </td>
                            <td className="align-middle fw-bold text-accent">{c.itemLabel}</td>
                            <td className="align-middle text-secondary small">{c.itemType.toUpperCase()}</td>
                            <td className="align-middle">
                              <span className={`badge ${c.status === 'completed' ? 'bg-success' : 'bg-warning animate-pulse'}`}>
                                {c.status.toUpperCase()}
                              </span>
                            </td>
                            <td className="align-middle font-monospace small">
                              {c.voucherCode || <span className="text-secondary">N/A</span>}
                            </td>
                            <td className="align-middle">
                              {c.status === 'pending' ? (
                                <button 
                                  className="btn btn-sm btn-success fw-bold"
                                  onClick={() => {
                                    setSelectedClaim(c);
                                    setClaimVoucherCode('');
                                    setClaimAdminNote('');
                                  }}
                                >
                                  Process Claim
                                </button>
                              ) : (
                                <span className="text-success small"><i className="bi bi-shield-fill-check"></i> Dispatched</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={7} className="text-center text-secondary py-3">No claims requested yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 5: Milestones Checkpoints */}
          {activeTab === 'milestones' && (
            <div className="card custom-card text-start p-4">
              <h5 className="mb-3 text-white border-bottom border-secondary border-opacity-15 pb-2">
                <i className="bi bi-award me-2"></i>Configure Milestones Checkpoints Rewards
              </h5>

              {/* Sub tabs for different milestone tracks */}
              <div className="d-flex gap-2 mb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '10px' }}>
                <button
                  type="button"
                  className={`btn btn-sm ${activeMilestoneSubTab === 'withdraw' ? 'btn-primary' : 'btn-outline-secondary'}`}
                  onClick={() => setActiveMilestoneSubTab('withdraw')}
                >
                  Withdrawal Milestones
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${activeMilestoneSubTab === 'matches' ? 'btn-primary' : 'btn-outline-secondary'}`}
                  onClick={() => setActiveMilestoneSubTab('matches')}
                >
                  Matches Completed Milestones
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${activeMilestoneSubTab === 'wins' ? 'btn-primary' : 'btn-outline-secondary'}`}
                  onClick={() => setActiveMilestoneSubTab('wins')}
                >
                  Match Wins Checkpoints
                </button>
              </div>

              <p className="small text-secondary mb-4">
                {activeMilestoneSubTab === 'withdraw' && "Configure rewards for user cumulative completed withdrawals threshold checkpoints."}
                {activeMilestoneSubTab === 'matches' && "Configure rewards for user total matches completed checkpoints."}
                {activeMilestoneSubTab === 'wins' && "Configure rewards for user total 1st Rank match wins checkpoints."}
              </p>

              <div className="table-responsive">
                <table className="table table-dark table-hover mb-4">
                  <thead>
                    <tr>
                      <th style={{ width: '25%' }}>Checkpoint Target</th>
                      <th style={{ width: '35%' }}>Reward Label / Name</th>
                      <th style={{ width: '25%' }}>Reward Type</th>
                      <th style={{ width: '15%' }}>Reward Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {milestoneTargets[activeMilestoneSubTab].map((amt) => {
                      const trackConfig = milestonesConfig[activeMilestoneSubTab] || {};
                      const cfg = trackConfig[amt] || { label: '', type: 'coin', value: 0 };
                      return (
                        <tr key={amt}>
                          <td className="align-middle fw-bold text-accent">
                            {activeMilestoneSubTab === 'withdraw' && `Withdraw ₹${amt}`}
                            {activeMilestoneSubTab === 'matches' && `Complete ${amt} Matches`}
                            {activeMilestoneSubTab === 'wins' && `Win Rank 1: ${amt} times`}
                          </td>
                          <td className="align-middle">
                            <input
                              type="text"
                              className="form-control form-control-sm"
                              placeholder="e.g. ₹50 Amazon Voucher"
                              value={cfg.label}
                              onChange={(e) => {
                                setMilestonesConfig({
                                  ...milestonesConfig,
                                  [activeMilestoneSubTab]: {
                                    ...trackConfig,
                                    [amt]: { ...cfg, label: e.target.value }
                                  }
                                });
                              }}
                              required
                            />
                          </td>
                          <td className="align-middle">
                            <select
                              className="form-control form-control-sm"
                              value={cfg.type}
                              onChange={(e) => {
                                setMilestonesConfig({
                                  ...milestonesConfig,
                                  [activeMilestoneSubTab]: {
                                    ...trackConfig,
                                    [amt]: { ...cfg, type: e.target.value }
                                  }
                                });
                              }}
                            >
                              <option value="coin">Coin Direct Credit</option>
                              <option value="google_play">Google Play Redeem Code</option>
                              <option value="amazon">Amazon Gift Code</option>
                              <option value="myntra">Myntra Voucher Code</option>
                              <option value="diamond">Free Fire Diamonds</option>
                              <option value="custom">Custom Reward Item</option>
                            </select>
                          </td>
                          <td className="align-middle">
                            <input
                              type="number"
                              className="form-control form-control-sm"
                              value={cfg.value}
                              onChange={(e) => {
                                setMilestonesConfig({
                                  ...milestonesConfig,
                                  [activeMilestoneSubTab]: {
                                    ...trackConfig,
                                    [amt]: { ...cfg, value: Number(e.target.value) }
                                  }
                                });
                              }}
                              required
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="d-flex justify-content-end">
                <button
                  className="btn btn-primary fw-bold"
                  onClick={handleSaveMilestones}
                  disabled={savingMilestones}
                >
                  {savingMilestones ? 'Saving Configuration...' : 'Save Milestone Rewards'}
                </button>
              </div>
            </div>
          )}

          {/* TAB 4: Audit Log */}
          {activeTab === 'audit' && (
            <div className="card custom-card text-start">
              <h5 className="p-3 m-0 text-white border-bottom border-secondary border-opacity-15">Real-time Spin logs history</h5>
              <div className="table-responsive">
                <table className="table table-dark table-hover mb-0">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Player</th>
                      <th>Item Won</th>
                      <th>Type</th>
                      <th>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {spinHistory.length > 0 ? (
                      spinHistory.map((h) => {
                        const winTime = new Date(h.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
                        return (
                          <tr key={h.id}>
                            <td className="align-middle small">{winTime}</td>
                            <td className="align-middle">
                              <div className="fw-semibold">{h.userName}</div>
                              <small className="text-secondary">{h.userEmail}</small>
                            </td>
                            <td className="align-middle fw-bold text-accent">{h.itemLabel}</td>
                            <td className="align-middle small text-info">{h.itemType.toUpperCase()}</td>
                            <td className="align-middle">{h.value}</td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={5} className="text-center text-secondary py-3">No spin logs recorded yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Claim Processing Modal */}
      {selectedClaim && (
        <div 
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
          style={{ zIndex: 1050, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
        >
          <div className="custom-card p-4 mx-3" style={{ width: '100%', maxWidth: '445px' }}>
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h5 className="modal-title m-0 text-white"><i className="bi bi-wallet2 me-2"></i> Process Reward Voucher</h5>
              <button className="btn-close btn-close-white" onClick={() => setSelectedClaim(null)}></button>
            </div>

            <form onSubmit={handleProcessClaim} className="text-start">
              <p className="small text-secondary mb-3">
                Item: <strong className="text-white">{selectedClaim.itemLabel}</strong> to {selectedClaim.userName} ({selectedClaim.userEmail})
              </p>

              <div className="form-group mb-3">
                <label className="form-label">Voucher / Redeem Code details</label>
                <input 
                  type="text"
                  className="form-control"
                  value={claimVoucherCode}
                  onChange={(e) => setClaimVoucherCode(e.target.value)}
                  placeholder="e.g. Play Store code / Amazon voucher code / FF code"
                  required
                />
              </div>

              <div className="form-group form-check mb-3">
                <input 
                  type="checkbox" 
                  className="form-check-input" 
                  id="pinEnabledCheckbox" 
                  checked={pinEnabled}
                  onChange={(e) => setPinEnabled(e.target.checked)}
                />
                <label className="form-check-label text-white ms-2" htmlFor="pinEnabledCheckbox">
                  Enable Voucher PIN
                </label>
              </div>

              {pinEnabled && (
                <div className="form-group mb-3">
                  <label className="form-label">Voucher PIN</label>
                  <input 
                    type="text"
                    className="form-control"
                    value={claimVoucherPin}
                    onChange={(e) => setClaimVoucherPin(e.target.value)}
                    placeholder="e.g. 1234 / PIN code"
                    required={pinEnabled}
                  />
                </div>
              )}

              <div className="form-group mb-4">
                <label className="form-label">Admin Notes (Optional)</label>
                <textarea 
                  className="form-control"
                  value={claimAdminNote}
                  onChange={(e) => setClaimAdminNote(e.target.value)}
                  placeholder="e.g. Sent directly to registered email"
                  style={{ minHeight: '66px' }}
                />
              </div>

              <div className="d-flex gap-2">
                <button 
                  type="button" 
                  className="btn-custom btn-custom-secondary flex-grow-1" 
                  onClick={() => setSelectedClaim(null)}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn-custom btn-custom-accent flex-grow-1"
                  disabled={claimLoading}
                >
                  {claimLoading ? 'Processing...' : 'Approve & Dispatch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminEarningZone;
