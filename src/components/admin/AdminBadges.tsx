import React, { useEffect, useState, useRef } from 'react';
import { ref, get, push, set, remove, update } from 'firebase/database';
import { db } from '../../firebase';

/* ─────────────────────────── Types ─────────────────────────── */
type BadgeEffect = 'light-sweep' | 'glow' | 'glitter-shine' | 'sparkle';

interface BadgeItem {
  id: string;
  name: string;
  imageUrl: string;
  effect?: BadgeEffect;
  effectColor?: string; // hex, e.g. "#FACC15"
}

interface UserItem {
  uid: string;
  displayName: string;
  email: string;
  gameUid?: string;
  appliedBadgeUrl?: string;
  photoURL?: string;
}

/* ─────────────────────── Constants ─────────────────────────── */
const IMGBB_API_KEY = '17524c13e2cca244c03f6ad0db42e5e0';

const EFFECTS: { id: BadgeEffect; label: string; icon: string; desc: string }[] = [
  { id: 'light-sweep',   label: 'Light Sweep',    icon: 'bi-stars',         desc: 'A bright beam sweeps across the badge' },
  { id: 'glow',          label: 'Glow',            icon: 'bi-circle',        desc: 'Pulsating outer glow aura' },
  { id: 'glitter-shine', label: 'Glitter Shine',   icon: 'bi-brightness-high', desc: 'Rapid multi-beam shimmer effect' },
  { id: 'sparkle',       label: 'Sparkle',         icon: 'bi-star-fill',     desc: 'Animated star sparks around badge' },
];

const PRESET_COLORS = [
  { label: 'Gold',    hex: '#FACC15' },
  { label: 'White',   hex: '#FFFFFF' },
  { label: 'Cyan',    hex: '#22D3EE' },
  { label: 'Violet',  hex: '#A78BFA' },
  { label: 'Pink',    hex: '#F472B6' },
  { label: 'Orange',  hex: '#FB923C' },
  { label: 'Green',   hex: '#4ADE80' },
  { label: 'Red',     hex: '#F87171' },
  { label: 'Sky',     hex: '#38BDF8' },
  { label: 'Lime',    hex: '#A3E635' },
];

/* ─────────────────────── Helper ────────────────────────────── */
/** Convert hex "#RRGGBB" → "R, G, B" for use in CSS rgba() */
const hexToRgbStr = (hex: string): string => {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `${r}, ${g}, ${b}`;
};

/* ─────────────────────── Component ─────────────────────────── */
const AdminBadges: React.FC = () => {
  const [badges, setBadges]               = useState<BadgeItem[]>([]);
  const [users, setUsers]                 = useState<UserItem[]>([]);
  const [searchQuery, setSearchQuery]     = useState('');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [selectedBadgeUrl, setSelectedBadgeUrl] = useState<string>('');
  const [loading, setLoading]             = useState(true);

  // Create badge form
  const [badgeName, setBadgeName]   = useState('');
  const [badgeFile, setBadgeFile]   = useState<File | null>(null);
  const [uploading, setUploading]   = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Per-badge style config panel
  const [configuringBadgeId, setConfiguringBadgeId] = useState<string | null>(null);
  const [configEffect, setConfigEffect]     = useState<BadgeEffect>('light-sweep');
  const [configColor, setConfigColor]       = useState('#FACC15');
  const [savingStyle, setSavingStyle]       = useState(false);

  /* ── Fetch ── */
  const fetchBadgesAndUsers = async () => {
    try {
      const badgesSnap = await get(ref(db, 'uploads/badges'));
      const badgesList: BadgeItem[] = [];
      if (badgesSnap.exists()) {
        Object.entries(badgesSnap.val()).forEach(([id, val]: any) => {
          badgesList.push({
            id,
            name:        val.name,
            imageUrl:    val.imageUrl,
            effect:      val.effect      || 'light-sweep',
            effectColor: val.effectColor || '#FFFFFF',
          });
        });
      }
      setBadges(badgesList);

      const usersSnap = await get(ref(db, 'users'));
      const usersList: UserItem[] = [];
      if (usersSnap.exists()) {
        Object.entries(usersSnap.val()).forEach(([uid, val]: any) => {
          usersList.push({
            uid,
            displayName:     val.displayName || 'Unnamed User',
            email:           val.email || 'N/A',
            gameUid:         val.gameUid || '',
            appliedBadgeUrl: val.appliedBadgeUrl || '',
            photoURL:        val.photoURL || '',
          });
        });
      }
      setUsers(usersList);
    } catch (err) {
      console.error('Error loading badges/users:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchBadgesAndUsers(); }, []);

  /* ── Create ── */
  const handleCreateBadge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!badgeName.trim() || !badgeFile) {
      alert('Please fill badge name and choose an image file.');
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', badgeFile);
      const resp = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method: 'POST', body: formData });
      const data = await resp.json();
      if (data.success) {
        const newBadgeRef = push(ref(db, 'uploads/badges'));
        await set(newBadgeRef, {
          name:        badgeName.trim(),
          imageUrl:    data.data.url,
          effect:      'light-sweep',
          effectColor: '#FFFFFF',
        });
        setBadgeName(''); setBadgeFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        alert('Badge created successfully!');
        await fetchBadgesAndUsers();
      } else {
        throw new Error(data.error?.message || 'Upload failed');
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  /* ── Delete ── */
  const handleDeleteBadge = async (id: string) => {
    if (!confirm('Delete this badge?')) return;
    await remove(ref(db, `uploads/badges/${id}`));
    await fetchBadgesAndUsers();
  };

  /* ── Open style config ── */
  const openConfig = (badge: BadgeItem) => {
    setConfiguringBadgeId(badge.id);
    setConfigEffect(badge.effect || 'light-sweep');
    setConfigColor(badge.effectColor || '#FFFFFF');
  };

  /* ── Save style config ── */
  const handleSaveStyle = async () => {
    if (!configuringBadgeId) return;
    setSavingStyle(true);
    try {
      await update(ref(db, `uploads/badges/${configuringBadgeId}`), {
        effect:      configEffect,
        effectColor: configColor,
      });
      await fetchBadgesAndUsers();
      setConfiguringBadgeId(null);
    } catch (err: any) {
      alert('Error saving: ' + err.message);
    } finally {
      setSavingStyle(false);
    }
  };

  /* ── Apply badge to users ── */
  const handleSelectUser    = (uid: string, checked: boolean) =>
    setSelectedUsers(prev => checked ? [...prev, uid] : prev.filter(id => id !== uid));

  const handleSelectAllVisible = (checked: boolean, visibleUids: string[]) =>
    setSelectedUsers(checked ? visibleUids : []);

  const handleApplyBadge = async () => {
    if (selectedUsers.length === 0) { alert('Select at least one user.'); return; }
    if (!confirm(selectedBadgeUrl ? `Apply badge to ${selectedUsers.length} user(s)?` : `Remove badge from ${selectedUsers.length} user(s)?`)) return;
    setLoading(true);
    try {
      const updates: any = {};
      // Find the badge data for effect/color
      const badgeData = badges.find(b => b.imageUrl === selectedBadgeUrl);
      selectedUsers.forEach(uid => {
        updates[`/users/${uid}/appliedBadgeUrl`]    = selectedBadgeUrl || null;
        updates[`/users/${uid}/appliedBadgeEffect`] = selectedBadgeUrl ? (badgeData?.effect || 'light-sweep') : null;
        updates[`/users/${uid}/appliedBadgeColor`]  = selectedBadgeUrl ? (badgeData?.effectColor || '#FFFFFF') : null;
      });
      await update(ref(db), updates);
      alert('Badges updated!');
      setSelectedUsers([]);
      await fetchBadgesAndUsers();
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = users.filter(u =>
    u.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.uid.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (u.gameUid && u.gameUid.toLowerCase().includes(searchQuery.toLowerCase()))
  );
  const visibleUids = filteredUsers.map(u => u.uid);

  const configuringBadge = badges.find(b => b.id === configuringBadgeId) || null;

  /* ─────────────────────────── Render ─────────────────────────── */
  return (
    <div className="admin-badges-view">
      <h2 className="mb-4">Badge Management</h2>

      <div className="row">
        {/* ─── Left Column: Create + Gallery ─── */}
        <div className="col-lg-4 mb-4">

          {/* Create Badge */}
          <div className="card custom-card">
            <div className="card-body text-start">
              <h5 className="card-title text-accent mb-3">
                <i className="bi bi-patch-check-fill me-2"></i>Create New Badge
              </h5>
              <form onSubmit={handleCreateBadge}>
                <div className="mb-3">
                  <label className="form-label text-secondary small">Badge Name</label>
                  <input type="text" className="form-control form-control-sm"
                    placeholder="e.g. Champion, Pro Player"
                    value={badgeName} onChange={e => setBadgeName(e.target.value)} required />
                </div>
                <div className="mb-3">
                  <label className="form-label text-secondary small">Badge Image (PNG recommended)</label>
                  <input type="file" ref={fileInputRef} className="form-control form-control-sm"
                    accept="image/*" onChange={e => setBadgeFile(e.target.files?.[0] || null)} required />
                </div>
                <button type="submit" className="btn btn-warning btn-sm w-100 fw-bold" disabled={uploading}>
                  {uploading ? <><span className="spinner-border spinner-border-sm me-2"></span>Uploading…</> : 'Save Badge'}
                </button>
              </form>
            </div>
          </div>

          {/* Badge Gallery */}
          <div className="card custom-card mt-4">
            <div className="card-body text-start">
              <h5 className="card-title text-white mb-3">Available Badges</h5>
              {badges.length === 0 ? (
                <div className="text-secondary small">No badges uploaded yet.</div>
              ) : (
                <div className="d-flex flex-column gap-2" style={{ maxHeight: '420px', overflowY: 'auto' }}>
                  {badges.map(b => {
                    const rgbStr = hexToRgbStr(b.effectColor || '#FFFFFF');
                    return (
                      <div key={b.id} style={{
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.07)',
                        borderRadius: '10px',
                        padding: '10px 12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                      }}>
                        {/* Badge preview with live effect */}
                        <div style={{ position: 'relative', width: '48px', height: '48px', flexShrink: 0 }}>
                          <span
                            className="badge-sweep-wrap"
                            data-effect={b.effect || 'light-sweep'}
                            style={{
                              position: 'relative',
                              width: '48px',
                              height: '48px',
                              display: 'inline-block',
                              ['--badge-color' as any]: rgbStr,
                            }}
                          >
                            <img src={b.imageUrl} alt={b.name}
                              style={{ width: '48px', height: '48px', objectFit: 'contain', display: 'block' }} />
                          </span>
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#E2E8F0', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {b.name}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <span style={{
                              fontSize: '0.65rem', padding: '1px 6px', borderRadius: '99px',
                              background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)',
                              color: '#A78BFA', fontWeight: 600, textTransform: 'capitalize'
                            }}>
                              <i className="bi bi-magic me-1"></i>{b.effect || 'light-sweep'}
                            </span>
                            <span style={{
                              width: '12px', height: '12px', borderRadius: '50%',
                              background: b.effectColor || '#FFFFFF',
                              border: '1px solid rgba(255,255,255,0.2)', display: 'inline-block',
                              flexShrink: 0,
                            }} />
                          </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0 }}>
                          <button className="btn btn-sm btn-outline-info py-0 px-2"
                            style={{ fontSize: '0.7rem' }} onClick={() => openConfig(b)}>
                            <i className="bi bi-sliders me-1"></i>Style
                          </button>
                          <button className="btn btn-sm btn-link text-danger p-0"
                            style={{ fontSize: '0.7rem' }} onClick={() => handleDeleteBadge(b.id)}>
                            <i className="bi bi-trash-fill"></i> Del
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ─── Right Column: Apply Badges + Users ─── */}
        <div className="col-lg-8 mb-4">

          {/* ─── Style Config Modal (inline) ─── */}
          {configuringBadge && (
            <div className="card custom-card mb-4" style={{
              border: '1px solid rgba(139,92,246,0.4)',
              background: 'linear-gradient(135deg, rgba(88,28,135,0.15) 0%, rgba(15,23,42,0.95) 100%)',
            }}>
              <div className="card-body text-start">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <h5 style={{ margin: 0, color: '#E2E8F0', fontWeight: 700 }}>
                    <i className="bi bi-sliders me-2" style={{ color: '#A78BFA' }}></i>
                    Configure Style — <span style={{ color: '#FACC15' }}>{configuringBadge.name}</span>
                  </h5>
                  <button onClick={() => setConfiguringBadgeId(null)}
                    style={{ background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '6px',
                             width: '28px', height: '28px', color: '#94A3B8', cursor: 'pointer' }}>
                    <i className="bi bi-x-lg" style={{ fontSize: '0.7rem' }}></i>
                  </button>
                </div>

                <div className="row g-4">
                  {/* Left: Effect picker + Color picker */}
                  <div className="col-md-7">

                    {/* Effect Selection */}
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ fontSize: '0.75rem', color: '#94A3B8', fontWeight: 600,
                                      textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px', display: 'block' }}>
                        Animation Effect
                      </label>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        {EFFECTS.map(eff => (
                          <button key={eff.id} onClick={() => setConfigEffect(eff.id)}
                            style={{
                              padding: '8px 10px',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              textAlign: 'left',
                              border: configEffect === eff.id
                                ? '1.5px solid #A78BFA'
                                : '1px solid rgba(255,255,255,0.06)',
                              background: configEffect === eff.id
                                ? 'rgba(139,92,246,0.2)'
                                : 'rgba(255,255,255,0.03)',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                              <i className={`bi ${eff.icon}`} style={{ color: configEffect === eff.id ? '#A78BFA' : '#64748B', fontSize: '0.85rem' }}></i>
                              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: configEffect === eff.id ? '#E2E8F0' : '#94A3B8' }}>
                                {eff.label}
                              </span>
                            </div>
                            <div style={{ fontSize: '0.65rem', color: '#475569', lineHeight: 1.3 }}>{eff.desc}</div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Color Picker */}
                    <div>
                      <label style={{ fontSize: '0.75rem', color: '#94A3B8', fontWeight: 600,
                                      textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px', display: 'block' }}>
                        Effect Color
                      </label>

                      {/* Preset swatches */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
                        {PRESET_COLORS.map(c => (
                          <button key={c.hex} onClick={() => setConfigColor(c.hex)} title={c.label}
                            style={{
                              width: '24px', height: '24px', borderRadius: '50%',
                              background: c.hex, border: 'none', cursor: 'pointer',
                              boxShadow: configColor.toLowerCase() === c.hex.toLowerCase()
                                ? `0 0 0 2px #0f172a, 0 0 0 4px ${c.hex}`
                                : '0 0 0 1px rgba(255,255,255,0.1)',
                              transition: 'box-shadow 0.15s ease',
                            }}
                          />
                        ))}
                      </div>

                      {/* Custom color input */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input type="color" value={configColor} onChange={e => setConfigColor(e.target.value)}
                          style={{ width: '36px', height: '36px', border: 'none', borderRadius: '6px',
                                   background: 'none', cursor: 'pointer', padding: 0 }} />
                        <input type="text" value={configColor} onChange={e => setConfigColor(e.target.value)}
                          maxLength={7}
                          style={{
                            flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '6px', padding: '4px 10px', color: '#E2E8F0', fontSize: '0.82rem',
                            fontFamily: 'monospace',
                          }} />
                      </div>
                    </div>
                  </div>

                  {/* Right: Live preview */}
                  <div className="col-md-5">
                    <label style={{ fontSize: '0.75rem', color: '#94A3B8', fontWeight: 600,
                                    textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px', display: 'block' }}>
                      Live Preview
                    </label>
                    <div style={{
                      background: 'rgba(0,0,0,0.4)',
                      borderRadius: '12px',
                      border: '1px solid rgba(255,255,255,0.06)',
                      padding: '24px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '16px',
                    }}>
                      {/* Large preview */}
                      <span
                        className="badge-sweep-wrap"
                        data-effect={configEffect}
                        style={{
                          position: 'relative',
                          width: '72px',
                          height: '72px',
                          display: 'inline-block',
                          ['--badge-color' as any]: hexToRgbStr(configColor),
                        }}
                      >
                        <img src={configuringBadge.imageUrl} alt="preview"
                          style={{ width: '72px', height: '72px', objectFit: 'contain', display: 'block' }} />
                      </span>

                      {/* Small preview (as it appears on avatar) */}
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '0.65rem', color: '#475569', marginBottom: '8px' }}>As appears on name</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.04)',
                                      borderRadius: '6px', padding: '6px 10px' }}>
                          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#FACC15' }}>PlayerName</span>
                          <span
                            className="badge-sweep-wrap"
                            data-effect={configEffect}
                            style={{
                              position: 'relative',
                              width: '18px',
                              height: '18px',
                              display: 'inline-block',
                              flexShrink: 0,
                              ['--badge-color' as any]: hexToRgbStr(configColor),
                            }}
                          >
                            <img src={configuringBadge.imageUrl} alt="preview"
                              style={{ width: '18px', height: '18px', objectFit: 'contain', display: 'block' }} />
                          </span>
                        </div>
                      </div>

                      <div style={{
                        fontSize: '0.7rem', padding: '3px 10px', borderRadius: '99px',
                        background: `rgba(${hexToRgbStr(configColor)}, 0.15)`,
                        border: `1px solid rgba(${hexToRgbStr(configColor)}, 0.4)`,
                        color: configColor,
                        fontWeight: 600,
                      }}>
                        {configEffect}
                      </div>
                    </div>

                    <button
                      className="btn btn-warning btn-sm w-100 fw-bold mt-3"
                      onClick={handleSaveStyle}
                      disabled={savingStyle}
                    >
                      {savingStyle ? <><span className="spinner-border spinner-border-sm me-2"></span>Saving…</> : <><i className="bi bi-check-lg me-1"></i>Save Style</>}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Apply Badges to Players */}
          <div className="card custom-card">
            <div className="card-body text-start">
              <h5 className="card-title text-white mb-3">Apply Badges to Players</h5>

              {/* Batch bar */}
              <div className="d-flex flex-wrap gap-2 align-items-center mb-3 p-3 bg-dark bg-opacity-40 rounded-3 border border-secondary border-opacity-25">
                <div className="form-check me-2">
                  <input type="checkbox" className="form-check-input" id="selectAllVisibleCheck"
                    checked={visibleUids.length > 0 && visibleUids.every(id => selectedUsers.includes(id))}
                    onChange={e => handleSelectAllVisible(e.target.checked, visibleUids)} />
                  <label className="form-check-label text-secondary small" htmlFor="selectAllVisibleCheck">
                    Select All Visible ({visibleUids.length})
                  </label>
                </div>
                <div className="ms-md-auto d-flex gap-2 w-100 w-md-auto mt-2 mt-md-0">
                  <select className="form-select form-select-sm" value={selectedBadgeUrl}
                    onChange={e => setSelectedBadgeUrl(e.target.value)} style={{ minWidth: '180px' }}>
                    <option value="">-- Remove Badge --</option>
                    {badges.map(b => <option key={b.id} value={b.imageUrl}>{b.name}</option>)}
                  </select>
                  <button className="btn btn-warning btn-sm fw-bold px-3" onClick={handleApplyBadge}
                    disabled={selectedUsers.length === 0}>
                    Apply Badge
                  </button>
                </div>
              </div>

              {/* Search */}
              <div className="input-group input-group-sm mb-3">
                <span className="input-group-text bg-dark border-secondary border-opacity-50 text-secondary">
                  <i className="bi bi-search"></i>
                </span>
                <input type="search" className="form-control"
                  placeholder="Search player by Display Name, Email, UID, or In-Game UID..."
                  value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
              </div>

              {/* Table */}
              <div className="table-responsive" style={{ maxHeight: '550px', overflowY: 'auto' }}>
                <table className="table table-dark table-hover mb-0 align-middle">
                  <thead>
                    <tr>
                      <th style={{ width: '40px' }}></th>
                      <th>Avatar / Badge</th>
                      <th>Name</th>
                      <th>In-Game ID</th>
                      <th>User UID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={5} className="text-center py-5">
                        <div className="spinner-border spinner-border-sm text-warning"></div>
                      </td></tr>
                    ) : filteredUsers.length > 0 ? (
                      filteredUsers.map(u => {
                        const avatarUrl = u.photoURL ||
                          `https://ui-avatars.com/api/?name=${encodeURIComponent(u.displayName)}&background=1E293B&color=E2E8F0&bold=true`;
                        return (
                          <tr key={u.uid}>
                            <td>
                              <input type="checkbox" className="form-check-input"
                                checked={selectedUsers.includes(u.uid)}
                                onChange={e => handleSelectUser(u.uid, e.target.checked)} />
                            </td>
                            <td>
                              <div style={{ position: 'relative', display: 'inline-block', width: '42px', height: '42px' }}>
                                <img src={avatarUrl} alt="Avatar"
                                  className="rounded-circle border border-secondary border-opacity-20"
                                  style={{ width: '42px', height: '42px', objectFit: 'cover' }} />
                                {u.appliedBadgeUrl && (() => {
                                  const badgeData = badges.find(b => b.imageUrl === u.appliedBadgeUrl);
                                  const rgbStr = hexToRgbStr(badgeData?.effectColor || '#FFFFFF');
                                  return (
                                    <span
                                      className="badge-sweep-wrap"
                                      data-effect={badgeData?.effect || 'light-sweep'}
                                      style={{ ['--badge-color' as any]: rgbStr }}
                                    >
                                      <img src={u.appliedBadgeUrl} alt="Badge"
                                        style={{ width: '16px', height: '16px', objectFit: 'contain' }} />
                                    </span>
                                  );
                                })()}
                              </div>
                            </td>
                            <td className="fw-bold text-white text-start">{u.displayName}</td>
                            <td className="text-secondary text-start">{u.gameUid || 'N/A'}</td>
                            <td className="font-monospace text-secondary small text-start">{u.uid}</td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr><td colSpan={5} className="text-center text-secondary py-4">No players found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminBadges;
