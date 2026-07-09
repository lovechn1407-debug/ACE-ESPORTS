import React, { useState, useRef } from 'react';
import { updateProfile } from 'firebase/auth';
import { ref, get, update } from 'firebase/database';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { useSettings } from '../../contexts/SettingsContext';

interface ProfileProps {
  onOpenPolicy: (type: 'privacy' | 'terms' | 'refund' | 'fairPlay' | 'refer') => void;
  onOpenMatchHistory: () => void;
  onLogout: () => void;
  onNavigateToView: (view: 'earningZone' | 'banned') => void;
}

const IMGBB_API_KEY = '17524c13e2cca244c03f6ad0db42e5e0';

const Profile: React.FC<ProfileProps> = ({ onOpenPolicy, onOpenMatchHistory, onLogout, onNavigateToView }) => {
  const { currentUser, userProfile } = useAuth();
  const { settings } = useSettings();
  const usePremiumCard = true;

  const [editNameOpen, setEditNameOpen] = useState(false);
  const [newName, setNewName] = useState(userProfile?.displayName || '');
  const [nameLoading, setNameLoading] = useState(false);
  const [nameError, setNameError] = useState('');

  // ── Avatar picker state ──
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(null);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [avatarLibrary, setAvatarLibrary] = useState<{ id: string; url: string }[]>([]);
  const [avatarLibraryLoading, setAvatarLibraryLoading] = useState(false);

  // ── Banner picker state ──
  const [bannerPickerOpen, setBannerPickerOpen] = useState(false);
  const [selectedBanner, setSelectedBanner] = useState<string | null>(null);
  const [bannerSaving, setBannerSaving] = useState(false);
  const [bannerLibrary, setBannerLibrary] = useState<{ id: string; url: string }[]>([]);
  const [bannerLibraryLoading, setBannerLibraryLoading] = useState(false);

  const avatarFileRef = useRef<HTMLInputElement>(null);
  const bannerFileRef = useRef<HTMLInputElement>(null);

  // ── Fetch Libraries ──
  const fetchAvatarLibrary = async () => {
    setAvatarLibraryLoading(true);
    try {
      const snap = await get(ref(db, 'uploads/avatars'));
      if (snap.exists()) {
        setAvatarLibrary(Object.entries(snap.val()).map(([id, url]) => ({ id, url: url as string })));
      } else setAvatarLibrary([]);
    } catch (err) { console.error(err); }
    finally { setAvatarLibraryLoading(false); }
  };

  const fetchBannerLibrary = async () => {
    setBannerLibraryLoading(true);
    try {
      const snap = await get(ref(db, 'uploads/profileBanners'));
      if (snap.exists()) {
        setBannerLibrary(Object.entries(snap.val()).map(([id, url]) => ({ id, url: url as string })));
      } else setBannerLibrary([]);
    } catch (err) { console.error(err); }
    finally { setBannerLibraryLoading(false); }
  };

  const openAvatarPicker = () => { setAvatarPickerOpen(true); fetchAvatarLibrary(); };
  const openBannerPicker = () => { setBannerPickerOpen(true); fetchBannerLibrary(); };

  // ── Save Preset Avatar ──
  const handleSaveAvatar = async () => {
    if (!selectedAvatar || !currentUser) return;
    setAvatarSaving(true);
    try {
      await update(ref(db, `users/${currentUser.uid}`), { photoURL: selectedAvatar });
      await updateProfile(currentUser, { photoURL: selectedAvatar });
      setAvatarPickerOpen(false);
      setSelectedAvatar(null);
    } catch (err: any) { alert('Failed: ' + err.message); }
    finally { setAvatarSaving(false); }
  };

  // ── Save Preset Banner ──
  const handleSaveBanner = async () => {
    if (!selectedBanner || !currentUser) return;
    setBannerSaving(true);
    try {
      await update(ref(db, `users/${currentUser.uid}`), { bannerURL: selectedBanner });
      setBannerPickerOpen(false);
      setSelectedBanner(null);
    } catch (err: any) { alert('Failed: ' + err.message); }
    finally { setBannerSaving(false); }
  };

  // ── Upload custom avatar via imgbb ──
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUser) return;
    setAvatarPickerOpen(false);
    setAvatarLoading(true);
    const formData = new FormData();
    formData.append('image', file);
    try {
      const resp = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method: 'POST', body: formData });
      const data = await resp.json();
      if (data.success) {
        const url = data.data.url;
        await update(ref(db, `users/${currentUser.uid}`), { photoURL: url });
        await updateProfile(currentUser, { photoURL: url });
        alert('Avatar updated!');
      } else alert('Upload failed: ' + (data.error?.message || 'Unknown error'));
    } catch (err: any) { alert('Error: ' + err.message); }
    finally { setAvatarLoading(false); if (avatarFileRef.current) avatarFileRef.current.value = ''; }
  };

  // ── Upload custom banner via imgbb ──
  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUser) return;
    setBannerPickerOpen(false);
    setBannerSaving(true);
    const formData = new FormData();
    formData.append('image', file);
    try {
      const resp = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method: 'POST', body: formData });
      const data = await resp.json();
      if (data.success) {
        await update(ref(db, `users/${currentUser.uid}`), { bannerURL: data.data.url });
        alert('Banner updated!');
      } else alert('Upload failed: ' + (data.error?.message || 'Unknown error'));
    } catch (err: any) { alert('Error: ' + err.message); }
    finally { setBannerSaving(false); if (bannerFileRef.current) bannerFileRef.current.value = ''; }
  };

  const handleToggleNotifications = async (checked: boolean) => {
    if (!currentUser) return;
    try { await update(ref(db, `users/${currentUser.uid}`), { notificationsEnabled: checked }); }
    catch (err) { console.error(err); }
  };

  const handleNameChangeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !currentUser) return;
    setNameLoading(true); setNameError('');
    try {
      await updateProfile(currentUser, { displayName: newName.trim() });
      await update(ref(db, `users/${currentUser.uid}`), { displayName: newName.trim() });
      setEditNameOpen(false);
      alert('Name updated!');
    } catch (err: any) { setNameError(err.message || 'Failed.'); }
    finally { setNameLoading(false); }
  };

  const handleContactSupport = () => {
    const phone = settings.supportContact || '9389660753';
    const msg = encodeURIComponent(`Hi Admin, I need help with my Esports account (${currentUser?.email || ''})`);
    window.open(`https://wa.me/91${phone}?text=${msg}`, '_blank');
  };

  const bannerURL = (userProfile as any)?.bannerURL || null;

  return (
    <section className="section py-3">

      {/* ── Profile Header Card ── */}
      {usePremiumCard ? (
        <div 
          className="profile-premium-card mb-3 animate-pulse-slow"
          style={{
            position: 'relative',
            width: '100%',
            aspectRatio: '2.05 / 1',
            backgroundImage: bannerURL 
              ? `url('/images/profile_card_bg.webp'), url(${bannerURL})` 
              : `url('/images/profile_card_bg.webp')`,
            backgroundSize: '100% 179%, cover',
            backgroundRepeat: 'no-repeat, no-repeat',
            backgroundPosition: 'center, center',
            borderRadius: '12px',
            overflow: 'visible',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            border: '1px solid rgba(255,255,255,0.08)'
          }}
        >
          {/* Banner Edit Button - Top Left of Card */}
          <button
            onClick={openBannerPicker}
            disabled={bannerSaving}
            style={{
              position: 'absolute',
              left: '-8px',
              top: '-8px',
              zIndex: 15,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '26px',
              height: '26px',
              borderRadius: '50%',
              border: '1.5px solid #FACC15',
              background: '#0F172A',
              color: '#FACC15',
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
              padding: 0
            }}
            title="Change Profile Card Banner"
          >
            {bannerSaving ? (
              <span className="spinner-border spinner-border-sm text-warning" style={{ width: '10px', height: '10px' }}></span>
            ) : (
              <i className="bi bi-image" style={{ fontSize: '0.78rem' }}></i>
            )}
          </button>

          {/* Avatar Helper Box (With overflow: visible to allow camera button and badge to lie half inside/outside) */}
          <div 
            style={{
              position: 'absolute',
              left: '12.5%',
              top: '21.875%',
              width: '23.33%',
              height: '43.75%',
              zIndex: 5
            }}
          >
            {/* Avatar Photo Frame */}
            <div
              onClick={openAvatarPicker}
              style={{
                width: '100%',
                height: '100%',
                cursor: 'pointer',
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#1e293b',
                border: '2.5px solid #1e293b',
                borderRadius: '6px',
                boxShadow: '0 4px 10px rgba(0,0,0,0.5)',
                position: 'relative'
              }}
            >
              <img
                src={userProfile?.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(userProfile?.displayName || 'User')}&background=0F172A&color=E2E8F0&bold=true&size=100`}
                alt="Avatar"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover'
                }}
              />
              
              {/* Camera Hover overlay indicator */}
              <div 
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'rgba(0,0,0,0.5)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: 0,
                  transition: 'opacity 0.25s ease'
                }}
                className="avatar-hover-overlay"
              >
                <i className="bi bi-camera-fill text-white" style={{ fontSize: '0.9rem' }}></i>
              </div>
            </div>

            {/* Change Avatar Camera Button - Top Left of Avatar Photo */}
            <button
              onClick={openAvatarPicker}
              style={{
                position: 'absolute',
                left: '-8px',
                top: '-8px',
                width: '22px',
                height: '22px',
                borderRadius: '50%',
                border: '1.5px solid #1e293b',
                backgroundColor: '#FACC15', /* Yellow camera button */
                color: '#0F172A',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                zIndex: 10,
                boxShadow: '0 2px 5px rgba(0,0,0,0.4)',
                padding: 0
              }}
              title="Change Avatar"
            >
              <i className="bi bi-camera-fill" style={{ fontSize: '0.65rem' }}></i>
            </button>

            {/* Badge overlay - Lies half inside and half outside at bottom right corner */}
            {(userProfile as any)?.appliedBadgeUrl && (
              <span style={{
                position: 'absolute',
                bottom: '-10px',
                right: '-10px',
                zIndex: 10,
                background: 'rgba(15,23,42,0.95)',
                borderRadius: '50%',
                padding: '2px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1.5px solid #FACC15',
                boxShadow: '0 2px 6px rgba(0,0,0,0.4)'
              }}>
                <img
                  src={(userProfile as any).appliedBadgeUrl}
                  alt="Badge"
                  style={{ width: '20px', height: '20px' }}
                />
              </span>
            )}
          </div>

          <input type="file" ref={avatarFileRef} style={{ display: 'none' }} accept="image/*" onChange={handleAvatarUpload} />
          <input type="file" ref={bannerFileRef} style={{ display: 'none' }} accept="image/*" onChange={handleBannerUpload} />

          {/* Account Name with Edit Name icon at the end */}
          <div 
            onClick={() => { setNewName(userProfile?.displayName || ''); setEditNameOpen(true); }}
            style={{
              position: 'absolute',
              left: '42%',
              top: '20%',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              maxWidth: '52%',
              fontFamily: "'GFF Devanagari', 'Poppins', sans-serif"
            }}
            title="Click to edit name"
          >
            <span 
              style={{
                fontWeight: 900,
                fontSize: '1.45rem',
                color: '#0F172A',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
            >
              {userProfile?.displayName || 'Guest User'}
            </span>
            <i className="bi bi-pencil-fill" style={{ fontSize: '0.9rem', color: '#64748B' }}></i>
          </div>

          {/* Gmail ID */}
          <div 
            style={{
              position: 'absolute',
              left: '42%',
              top: '39%',
              fontSize: '0.82rem',
              color: '#334155',
              fontWeight: 600,
              maxWidth: '52%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            {currentUser?.email || 'N/A'}
          </div>

          {/* Won Amt */}
          <div 
            style={{
              position: 'absolute',
              left: '42%',
              top: '53%',
              fontWeight: 800,
              fontSize: '1.1rem',
              color: '#FFB300', /* Best Glowing Gold */
              fontFamily: "'GFF Devanagari', 'Poppins', sans-serif",
              textShadow: '1px 1px 2px rgba(0, 0, 0, 0.9)',
              background: 'linear-gradient(90deg, rgba(0, 0, 0, 0.65) 0%, rgba(0, 0, 0, 0.65) 75%, transparent 100%)',
              padding: '0px 32px 0px 8px',
              lineHeight: '1.2',
              borderRadius: '0px'
            }}
          >
            ₹{userProfile?.totalEarnings != null ? userProfile.totalEarnings.toFixed(2) : '0.00'}
          </div>

          {/* PLAYED:{N} */}
          <div 
            style={{
              position: 'absolute',
              left: '11.5%',
              bottom: '16.5%',
              fontWeight: 900,
              fontSize: '0.85rem',
              color: '#0F172A', /* Black */
              fontFamily: "'GFF Devanagari', 'Poppins', sans-serif",
              letterSpacing: '0.02em'
            }}
          >
            PLAYED:{userProfile?.totalMatches || 0}
          </div>

          {/* WIN:{N} */}
          <div 
            style={{
              position: 'absolute',
              left: '11.5%',
              bottom: '6.5%',
              fontWeight: 900,
              fontSize: '0.85rem',
              color: '#0F172A', /* Black */
              fontFamily: "'GFF Devanagari', 'Poppins', sans-serif",
              letterSpacing: '0.02em'
            }}
          >
            WIN:{userProfile?.wonMatches || 0}
          </div>
        </div>
      ) : (
        <div
          className="profile-header-card"
          style={bannerURL ? {
            backgroundImage: `url(${bannerURL})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          } : undefined}
        >
          {bannerURL && <div className="profile-banner-overlay"></div>}

          <button
            className="profile-banner-btn"
            onClick={openBannerPicker}
            disabled={bannerSaving}
            title="Change Banner"
          >
            {bannerSaving
              ? <span className="spinner-border spinner-border-sm text-warning" style={{ width: '12px', height: '12px' }}></span>
              : <><i className="bi bi-image-fill me-1"></i><span style={{ fontSize: '0.7rem' }}>Banner</span></>
            }
          </button>

          <div className="position-relative mb-2" style={{ zIndex: 2 }}>
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <img
                src={userProfile?.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(userProfile?.displayName || 'User')}&background=0F172A&color=E2E8F0&bold=true&size=80`}
                alt="Avatar"
                className="profile-avatar"
              />
              {(userProfile as any)?.appliedBadgeUrl && (
                <span className="badge-sweep-wrap">
                  <img
                    src={(userProfile as any).appliedBadgeUrl}
                    alt="Badge"
                    style={{ width: '28px', height: '28px' }}
                  />
                </span>
              )}
            </div>
            <button
              className="btn btn-sm btn-dark rounded-circle position-absolute border-2 border-dark"
              style={{ bottom: '-4px', right: '-4px', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onClick={openAvatarPicker}
              disabled={avatarLoading}
            >
              {avatarLoading
                ? <span className="spinner-border spinner-border-sm text-warning" style={{ width: '14px', height: '14px' }}></span>
                : <i className="bi bi-camera-fill text-light" style={{ fontSize: '0.85rem' }}></i>
              }
            </button>
            <input type="file" ref={avatarFileRef} style={{ display: 'none' }} accept="image/*" onChange={handleAvatarUpload} />
            <input type="file" ref={bannerFileRef} style={{ display: 'none' }} accept="image/*" onChange={handleBannerUpload} />
          </div>

          <div className="profile-name-container" style={{ zIndex: 2, position: 'relative' }}>
            <span className="profile-name">{userProfile?.displayName || 'Guest User'}</span>
            <button
              className="edit-name-btn"
              onClick={() => { setNewName(userProfile?.displayName || ''); setEditNameOpen(true); }}
              aria-label="Edit Name"
            >
              <i className="bi bi-pencil-square"></i>
            </button>
          </div>

          <div className="profile-email" style={{ zIndex: 2, position: 'relative' }}>{currentUser?.email || 'N/A'}</div>

          <div className="profile-stats" style={{ zIndex: 2, position: 'relative' }}>
            <div className="stat-item">
              <strong>{userProfile?.totalMatches || 0}</strong>
              <span>Total Matches</span>
            </div>
            <div className="stat-item">
              <strong>{userProfile?.wonMatches || 0}</strong>
              <span>Matches Won</span>
            </div>
            <div className="stat-item">
              <strong>₹{userProfile?.totalEarnings != null ? userProfile.totalEarnings.toFixed(2) : '0.00'}</strong>
              <span>Total Earnings</span>
            </div>
          </div>
        </div>
      )}



      {/* ── Account Settings ── */}
      <h3 className="section-title">Account Settings</h3>
      <div className="list-group custom-card mb-4" style={{ borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
        {/* Earning Zone - Unique Premium Style */}
        <button
          className="list-group-item list-group-item-action border-bottom border-secondary border-opacity-25 text-start py-3 text-light d-flex justify-content-between align-items-center"
          onClick={() => onNavigateToView('earningZone')}
          style={{
            background: 'linear-gradient(90deg, rgba(250, 204, 21, 0.08) 0%, rgba(250, 204, 21, 0.01) 60%, transparent 100%)',
            borderLeft: '3px solid #FACC15'
          }}
        >
          <div className="d-flex align-items-center">
            <i className="bi bi-gift-fill text-warning me-3" style={{ fontSize: '1.1rem' }}></i>
            <div>
              <span className="fw-bold" style={{ color: '#FDE68A' }}>Earning Zone</span>
              <span className="badge bg-warning text-dark ms-2" style={{ fontSize: '0.6rem', fontWeight: 700, padding: '2px 6px', borderRadius: '3px' }}>SPIN & WIN</span>
            </div>
          </div>
          <i className="bi bi-chevron-right text-warning"></i>
        </button>

        {/* Banned Players List - Unique Premium Style */}
        <button
          className="list-group-item list-group-item-action border-bottom border-secondary border-opacity-25 text-start py-3 text-light d-flex justify-content-between align-items-center"
          onClick={() => onNavigateToView('banned')}
          style={{
            background: 'linear-gradient(90deg, rgba(239, 68, 68, 0.08) 0%, rgba(239, 68, 68, 0.01) 60%, transparent 100%)',
            borderLeft: '3px solid #EF4444'
          }}
        >
          <div className="d-flex align-items-center">
            <i className="bi bi-shield-fill-x text-danger me-3" style={{ fontSize: '1.1rem' }}></i>
            <div>
              <span className="fw-bold" style={{ color: '#FCA5A5' }}>Banned Players List</span>
              <span className="badge bg-danger text-white ms-2" style={{ fontSize: '0.6rem', fontWeight: 600, padding: '2px 6px', borderRadius: '3px' }}>PUBLIC LOG</span>
            </div>
          </div>
          <i className="bi bi-chevron-right text-danger"></i>
        </button>

        <div className="list-group-item bg-transparent border-bottom border-secondary border-opacity-25 d-flex justify-content-between align-items-center py-3">
          <span className="text-light"><i className="bi bi-bell-fill text-warning me-3"></i> Notifications</span>
          <div className="form-check form-switch">
            <input className="form-check-input" type="checkbox" role="switch" id="notificationPreferenceSwitch"
              checked={userProfile?.notificationsEnabled !== false}
              onChange={(e) => handleToggleNotifications(e.target.checked)} />
          </div>
        </div>
        <button className="list-group-item list-group-item-action bg-transparent border-bottom border-secondary border-opacity-25 text-start py-3 text-light d-flex justify-content-between align-items-center" onClick={onOpenMatchHistory}>
          <span><i className="bi bi-clock-history text-warning me-3"></i> Match History</span>
          <i className="bi bi-chevron-right text-secondary"></i>
        </button>
        <button className="list-group-item list-group-item-action bg-transparent border-bottom border-secondary border-opacity-25 text-start py-3 text-light d-flex justify-content-between align-items-center" onClick={() => onOpenPolicy('refer')}>
          <span><i className="bi bi-person-plus-fill text-warning me-3"></i> Refer &amp; Earn</span>
          <i className="bi bi-chevron-right text-secondary"></i>
        </button>
        <button className="list-group-item list-group-item-action bg-transparent border-bottom border-secondary border-opacity-25 text-start py-3 text-light d-flex justify-content-between align-items-center" onClick={handleContactSupport}>
          <span><i className="bi bi-whatsapp text-success me-3"></i> Contact Support</span>
          <i className="bi bi-chevron-right text-secondary"></i>
        </button>
        <button className="list-group-item list-group-item-action bg-transparent border-bottom border-secondary border-opacity-25 text-start py-3 text-light d-flex justify-content-between align-items-center" onClick={() => onOpenPolicy('privacy')}>
          <span><i className="bi bi-shield-lock-fill text-warning me-3"></i> Privacy Policy</span>
          <i className="bi bi-chevron-right text-secondary"></i>
        </button>
        <button className="list-group-item list-group-item-action bg-transparent border-bottom border-secondary border-opacity-25 text-start py-3 text-light d-flex justify-content-between align-items-center" onClick={() => onOpenPolicy('terms')}>
          <span><i className="bi bi-file-text-fill text-warning me-3"></i> Terms and Conditions</span>
          <i className="bi bi-chevron-right text-secondary"></i>
        </button>
        <button className="list-group-item list-group-item-action bg-transparent border-bottom border-secondary border-opacity-25 text-start py-3 text-light d-flex justify-content-between align-items-center" onClick={() => onOpenPolicy('refund')}>
          <span><i className="bi bi-arrow-repeat text-warning me-3"></i> Refund &amp; Cancellation</span>
          <i className="bi bi-chevron-right text-secondary"></i>
        </button>
        <button className="list-group-item list-group-item-action bg-transparent border-bottom border-secondary border-opacity-25 text-start py-3 text-light d-flex justify-content-between align-items-center" onClick={() => onOpenPolicy('fairPlay')}>
          <span><i className="bi bi-patch-check-fill text-warning me-3"></i> Fair Play Policy</span>
          <i className="bi bi-chevron-right text-secondary"></i>
        </button>
        <button className="list-group-item list-group-item-action bg-transparent border-0 text-start py-3 text-danger d-flex justify-content-between align-items-center" onClick={onLogout}>
          <span><i className="bi bi-box-arrow-right me-3"></i> Log Out</span>
        </button>
      </div>

      {/* ══════════ AVATAR PICKER MODAL ══════════ */}
      {avatarPickerOpen && (
        <div className="avatar-picker-backdrop" onClick={(e) => { if (e.target === e.currentTarget) { setAvatarPickerOpen(false); setSelectedAvatar(null); } }}>
          <div className="avatar-picker-modal">
            <div className="avatar-picker-header">
              <div>
                <h5 className="m-0">Choose Avatar</h5>
                <p className="m-0 text-secondary" style={{ fontSize: '0.8rem' }}>Pick from library or upload your own</p>
              </div>
              <button className="avatar-picker-close" onClick={() => { setAvatarPickerOpen(false); setSelectedAvatar(null); }}>
                <i className="bi bi-x-lg"></i>
              </button>
            </div>

            <button className="avatar-upload-btn" onClick={() => avatarFileRef.current?.click()}>
              <i className="bi bi-cloud-upload-fill me-2"></i>Upload Your Own Photo
            </button>

            <div className="avatar-picker-divider"><span>or choose from library</span></div>

            {avatarLibraryLoading ? (
              <div className="text-center py-4"><span className="spinner-border text-warning"></span></div>
            ) : avatarLibrary.length === 0 ? (
              <div className="text-center text-secondary py-4" style={{ fontSize: '0.85rem' }}>
                <i className="bi bi-images fs-2 d-block mb-2"></i>
                No avatars in the library yet.
              </div>
            ) : (
              <div className="avatar-preset-grid">
                {avatarLibrary.map((img) => (
                  <button key={img.id} className={`avatar-preset-item ${selectedAvatar === img.url ? 'selected' : ''}`} onClick={() => setSelectedAvatar(img.url)}>
                    <img src={img.url} alt="Avatar" loading="lazy" />
                    {selectedAvatar === img.url && <div className="avatar-preset-check"><i className="bi bi-check2"></i></div>}
                  </button>
                ))}
              </div>
            )}

            {selectedAvatar && (
              <button className="avatar-save-btn" onClick={handleSaveAvatar} disabled={avatarSaving}>
                {avatarSaving ? <><span className="spinner-border spinner-border-sm me-2"></span>Saving...</> : <><i className="bi bi-check-circle-fill me-2"></i>Use This Avatar</>}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ══════════ BANNER PICKER MODAL ══════════ */}
      {bannerPickerOpen && (
        <div className="avatar-picker-backdrop" onClick={(e) => { if (e.target === e.currentTarget) { setBannerPickerOpen(false); setSelectedBanner(null); } }}>
          <div className="avatar-picker-modal">
            <div className="avatar-picker-header">
              <div>
                <h5 className="m-0">Choose Banner</h5>
                <p className="m-0 text-secondary" style={{ fontSize: '0.8rem' }}>Shown as your profile &amp; leaderboard background</p>
              </div>
              <button className="avatar-picker-close" onClick={() => { setBannerPickerOpen(false); setSelectedBanner(null); }}>
                <i className="bi bi-x-lg"></i>
              </button>
            </div>

            <button className="avatar-upload-btn" onClick={() => bannerFileRef.current?.click()}>
              <i className="bi bi-cloud-upload-fill me-2"></i>Upload Your Own Banner
            </button>

            <div className="avatar-picker-divider"><span>or choose from library</span></div>

            {bannerLibraryLoading ? (
              <div className="text-center py-4"><span className="spinner-border text-warning"></span></div>
            ) : bannerLibrary.length === 0 ? (
              <div className="text-center text-secondary py-4" style={{ fontSize: '0.85rem' }}>
                <i className="bi bi-image fs-2 d-block mb-2"></i>
                No banners in the library yet.<br />Ask the admin to upload some.
              </div>
            ) : (
              <div className="banner-picker-grid">
                {bannerLibrary.map((img) => (
                  <button key={img.id} className={`banner-picker-item ${selectedBanner === img.url ? 'selected' : ''}`} onClick={() => setSelectedBanner(img.url)}>
                    <img src={img.url} alt="Banner" loading="lazy" />
                    {selectedBanner === img.url && <div className="avatar-preset-check"><i className="bi bi-check2"></i></div>}
                  </button>
                ))}
              </div>
            )}

            {selectedBanner && (
              <button className="avatar-save-btn" onClick={handleSaveBanner} disabled={bannerSaving}>
                {bannerSaving ? <><span className="spinner-border spinner-border-sm me-2"></span>Saving...</> : <><i className="bi bi-check-circle-fill me-2"></i>Use This Banner</>}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Edit Name Modal ── */}
      {editNameOpen && (
        <div className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center" style={{ zIndex: 1050, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
          <div className="custom-card p-4 mx-3" style={{ width: '100%', maxWidth: '400px' }}>
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h5 className="modal-title m-0">Change Your Name</h5>
              <button className="btn-close btn-close-white" onClick={() => setEditNameOpen(false)}></button>
            </div>
            <form onSubmit={handleNameChangeSubmit}>
              {nameError && <div className="alert alert-danger py-2 small">{nameError}</div>}
              <div className="form-group mb-4">
                <label className="form-label">New Name</label>
                <input type="text" className="form-control" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Enter name" required />
              </div>
              <div className="d-flex gap-2">
                <button type="button" className="btn-custom btn-custom-secondary flex-grow-1" onClick={() => setEditNameOpen(false)}>Cancel</button>
                <button type="submit" className="btn-custom btn-custom-primary flex-grow-1" disabled={nameLoading}>{nameLoading ? 'Saving...' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};

export default Profile;
