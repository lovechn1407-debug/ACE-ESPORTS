import React, { useEffect, useState, useRef } from 'react';
import { ref, get, set, update, remove, push } from 'firebase/database';
import { db } from '../../firebase';


interface Coupon {
  code: string;
  discountType: 'percentage' | 'flat';
  discountValue: number;
  minEntryFee: number;
  maxUses: number;
  timesUsed: number;
  status: 'active' | 'inactive';
}

const IMGBB_API_KEY = '17524c13e2cca244c03f6ad0db42e5e0';

const AdminSettings: React.FC = () => {
  // Global settings state
  const [appName, setAppName] = useState('');
  const [supportContact, setSupportContact] = useState('');
  const [minWithdraw, setMinWithdraw] = useState(50);
  const [signupBonus, setSignupBonus] = useState(10);
  const [referralBonus, setReferralBonus] = useState(5);
  const [upiDetails, setUpiDetails] = useState('');
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [qrCodeFile, setQrCodeFile] = useState<File | null>(null);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [registrationMode, setRegistrationMode] = useState<'manual' | 'api'>('manual');
  const [announcementText, setAnnouncementText] = useState('');
  
  // Policies
  const [policyPrivacy, setPolicyPrivacy] = useState('');
  const [policyTerms, setPolicyTerms] = useState('');
  const [policyRefund, setPolicyRefund] = useState('');
  const [policyFairPlay, setPolicyFairPlay] = useState('');

  // Update Now Configs
  const [updateForce, setUpdateForce] = useState(false);
  const [updateAppLink, setUpdateAppLink] = useState('');
  const [updateVersion, setUpdateVersion] = useState('');
  const [lastHardRefresh, setLastHardRefresh] = useState(0);

  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);

  // Coupon states
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [showCouponModal, setShowCouponModal] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [couponDiscType, setCouponDiscType] = useState<'percentage' | 'flat'>('flat');
  const [couponDiscVal, setCouponDiscVal] = useState(10);
  const [couponMinFee, setCouponMinFee] = useState(20);
  const [couponMaxUses, setCouponMaxUses] = useState(100);
  const [couponStatus, setCouponStatus] = useState<'active' | 'inactive'>('active');
  const [couponSaving, setCouponSaving] = useState(false);

  // Avatar Library
  const [avatarLibrary, setAvatarLibrary] = useState<{ id: string; url: string }[]>([]);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarFileRef = useRef<HTMLInputElement>(null);

  // Banner Library
  const [bannerLibrary, setBannerLibrary] = useState<{ id: string; url: string }[]>([]);
  const [bannerUploading, setBannerUploading] = useState(false);
  const bannerLibAdminRef = useRef<HTMLInputElement>(null);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [settingsSnap, couponsSnap] = await Promise.all([
        get(ref(db, 'settings')),
        get(ref(db, 'coupons'))
      ]);

      if (settingsSnap.exists()) {
        const s = settingsSnap.val();
        setAppName(s.appName || 'Esports App');
        setSupportContact(s.supportContact || '9389660753');
        setMinWithdraw(s.minWithdraw || 50);
        setSignupBonus(s.signupBonus || 10);
        setReferralBonus(s.referralBonus || 5);
        setUpiDetails(s.upiDetails || '8383090874@fam');
        setQrCodeUrl(s.qrCodeUrl || '');
        setMaintenanceMode(s.maintenanceMode || false);
        setRegistrationMode(s.registrationMode || 'manual');
        setAnnouncementText(s.announcementText || '');
        setPolicyPrivacy(s.policyPrivacy || '');
        setPolicyTerms(s.policyTerms || '');
        setPolicyRefund(s.policyRefund || '');
        setPolicyFairPlay(s.policyFairPlay || '');

        if (s.updateConfig) {
          setUpdateForce(s.updateConfig.forceUpdate || false);
          setUpdateAppLink(s.updateConfig.appLink || '');
          setUpdateVersion(s.updateConfig.appVersion || '');
          setLastHardRefresh(s.updateConfig.lastHardRefresh || 0);
        }
      }

      if (couponsSnap.exists()) {
        const list = Object.entries(couponsSnap.val()).map(([code, val]: any) => ({
          code,
          ...val
        }));
        setCoupons(list);
      } else {
        setCoupons([]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch avatar library
  const fetchAvatarLibrary = async () => {
    try {
      const snap = await get(ref(db, 'uploads/avatars'));
      if (snap.exists()) {
        const list = Object.entries(snap.val()).map(([id, url]) => ({ id, url: url as string }));
        setAvatarLibrary(list);
      } else {
        setAvatarLibrary([]);
      }
    } catch (err) {
      console.error('Error fetching avatar library:', err);
    }
  };

  useEffect(() => {
    fetchAllData();
    fetchAvatarLibrary();
    fetchBannerLibrary();
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    let finalQrUrl = qrCodeUrl.trim();

    try {
      if (qrCodeFile) {
        const formData = new FormData();
        formData.append('image', qrCodeFile);
        const resp = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
          method: 'POST',
          body: formData
        });
        const data = await resp.json();
        if (data.success) {
          finalQrUrl = data.data.url;
          setQrCodeUrl(finalQrUrl);
        } else {
          throw new Error(data.error?.message || 'Failed to upload QR Code.');
        }
      }

      const settingsData = {
        appName: appName.trim(),
        supportContact: supportContact.trim(),
        minWithdraw: Number(minWithdraw) || 50,
        signupBonus: Number(signupBonus) || 10,
        referralBonus: Number(referralBonus) || 5,
        upiDetails: upiDetails.trim(),
        qrCodeUrl: finalQrUrl,
        maintenanceMode,
        registrationMode,
        announcementText: announcementText.trim(),
        policyPrivacy: policyPrivacy.trim(),
        policyTerms: policyTerms.trim(),
        policyRefund: policyRefund.trim(),
        policyFairPlay: policyFairPlay.trim(),
        updateConfig: {
          forceUpdate: updateForce,
          appLink: updateAppLink.trim(),
          appVersion: updateVersion.trim(),
          lastHardRefresh: lastHardRefresh
        }
      };

      // Use update to preserve other setting subkeys if any
      await update(ref(db, 'settings'), settingsData);
      setQrCodeFile(null);
      alert('Global configurations saved successfully!');
    } catch (err: any) {
      console.error(err);
      alert('Save failed: ' + err.message);
    } finally {
      setSavingSettings(false);
    }
  };

  // Instant toggle — writes maintenanceMode to Firebase immediately (no Save needed)
  const handleToggleMaintenance = async (value: boolean) => {
    setMaintenanceMode(value);
    try {
      await set(ref(db, 'settings/maintenanceMode'), value);
    } catch (err) {
      console.error('Failed to toggle maintenance mode:', err);
      setMaintenanceMode(!value); // revert on failure
    }
  };

  // Instant toggle — writes registrationMode to Firebase immediately (no Save needed)
  const handleToggleRegistrationMode = async (value: 'manual' | 'api') => {
    setRegistrationMode(value);
    try {
      await set(ref(db, 'settings/registrationMode'), value);
    } catch (err) {
      console.error('Failed to toggle registration mode:', err);
    }
  };

  // Trigger global hard refresh for all users
  const handleTriggerHardRefresh = async () => {
    if (!confirm('This will immediately force clear browser caches and refresh the page for all active users. Are you sure you want to trigger this?')) return;
    try {
      const now = Date.now();
      setLastHardRefresh(now);
      await set(ref(db, 'settings/updateConfig/lastHardRefresh'), now);
      alert('Hard Refresh command broadcasted successfully!');
    } catch (err: any) {
      alert('Failed to broadcast refresh command: ' + err.message);
    }
  };

  // Coupons creation
  const handleOpenAddCoupon = () => {
    setCouponCode('');
    setCouponDiscType('flat');
    setCouponDiscVal(10);
    setCouponMinFee(20);
    setCouponMaxUses(100);
    setCouponStatus('active');
    setShowCouponModal(true);
  };

  const handleSaveCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = couponCode.toUpperCase().trim();
    if (!code) {
      alert('Code is required.');
      return;
    }

    setCouponSaving(true);
    try {
      const couponData = {
        discountType: couponDiscType,
        discountValue: Number(couponDiscVal) || 0,
        minEntryFee: Number(couponMinFee) || 0,
        maxUses: Number(couponMaxUses) || 100,
        timesUsed: 0,
        status: couponStatus
      };

      await set(ref(db, `coupons/${code}`), couponData);
      alert('Coupon created successfully!');
      setShowCouponModal(false);
      fetchAllData();
    } catch (err: any) {
      alert('Save failed: ' + err.message);
    } finally {
      setCouponSaving(false);
    }
  };

  const handleDeleteCoupon = async (code: string) => {
    if (!confirm(`Are you sure you want to delete coupon "${code}"?`)) return;
    try {
      await remove(ref(db, `coupons/${code}`));
      alert('Coupon deleted.');
      fetchAllData();
    } catch (err: any) {
      alert('Delete failed: ' + err.message);
    }
  };

  // Upload avatar to library
  const handleAvatarLibraryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
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
        await push(ref(db, 'uploads/avatars'), url);
        await fetchAvatarLibrary();
        alert('Image added to avatar library!');
      } else {
        throw new Error(data.error?.message || 'Upload failed');
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setAvatarUploading(false);
      if (avatarFileRef.current) avatarFileRef.current.value = '';
    }
  };

  const handleDeleteAvatarFromLibrary = async (id: string) => {
    if (!confirm('Remove this image from the avatar library?')) return;
    try {
      await remove(ref(db, `uploads/avatars/${id}`));
      await fetchAvatarLibrary();
    } catch (err: any) {
      alert('Delete failed: ' + err.message);
    }
  };

  // Fetch banner library
  const fetchBannerLibrary = async () => {
    try {
      const snap = await get(ref(db, 'uploads/banners'));
      if (snap.exists()) {
        const list = Object.entries(snap.val()).map(([id, url]) => ({ id, url: url as string }));
        setBannerLibrary(list);
      } else {
        setBannerLibrary([]);
      }
    } catch (err) {
      console.error('Error fetching banner library:', err);
    }
  };

  // Upload banner to library
  const handleBannerLibraryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBannerUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const resp = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method: 'POST', body: formData });
      const data = await resp.json();
      if (data.success) {
        await push(ref(db, 'uploads/banners'), data.data.url);
        await fetchBannerLibrary();
        alert('Banner added to library!');
      } else throw new Error(data.error?.message || 'Upload failed');
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setBannerUploading(false);
      if (bannerLibAdminRef.current) bannerLibAdminRef.current.value = '';
    }
  };

  const handleDeleteBannerFromLibrary = async (id: string) => {
    if (!confirm('Remove this banner from the library?')) return;
    try {
      await remove(ref(db, `uploads/banners/${id}`));
      await fetchBannerLibrary();
    } catch (err: any) {
      alert('Delete failed: ' + err.message);
    }
  };

  return (
    <div className="admin-settings-view">
      <h2 className="mb-4">Global Site Settings</h2>

      {loading ? (
        <div className="placeholder-glow py-5 rounded-3" style={{ height: '300px' }}></div>
      ) : (
        <div className="row g-4 text-start">
          {/* Settings form */}
          <div className="col-lg-7">
            <form onSubmit={handleSaveSettings} className="card custom-card p-4">
              <h5 className="mb-3 text-white">General Parameters</h5>

              <div className="row g-2 mb-3">
                <div className="col-md-6">
                  <label className="form-label">Application Name</label>
                  <input type="text" className="form-control form-control-sm" value={appName} onChange={(e) => setAppName(e.target.value)} required />
                </div>
                <div className="col-md-6">
                  <label className="form-label">WhatsApp Helpline Contact</label>
                  <input type="text" className="form-control form-control-sm" value={supportContact} onChange={(e) => setSupportContact(e.target.value)} required />
                </div>
              </div>

              <div className="row g-2 mb-3">
                <div className="col-md-4">
                  <label className="form-label">Min Withdraw (₹)</label>
                  <input type="number" className="form-control form-control-sm" value={minWithdraw} onChange={(e) => setMinWithdraw(Number(e.target.value))} required />
                </div>
                <div className="col-md-4">
                  <label className="form-label">Signup Welcome Cash (₹)</label>
                  <input type="number" className="form-control form-control-sm" value={signupBonus} onChange={(e) => setSignupBonus(Number(e.target.value))} required />
                </div>
                <div className="col-md-4">
                  <label className="form-label">Referral Reward Cash (₹)</label>
                  <input type="number" className="form-control form-control-sm" value={referralBonus} onChange={(e) => setReferralBonus(Number(e.target.value))} required />
                </div>
              </div>

              <div className="form-group mb-3">
                <label className="form-label">Admin UPI ID</label>
                <input type="text" className="form-control form-control-sm" value={upiDetails} onChange={(e) => setUpiDetails(e.target.value)} required />
              </div>

              <div className="row g-2 mb-3">
                <div className="col-md-7">
                  <label className="form-label">UPI QR Code Image URL</label>
                  <input type="url" className="form-control form-control-sm" value={qrCodeUrl} onChange={(e) => setQrCodeUrl(e.target.value)} />
                </div>
                <div className="col-md-5">
                  <label className="form-label">Or Upload New QR File</label>
                  <input type="file" className="form-control form-control-sm" accept="image/*" onChange={(e) => setQrCodeFile(e.target.files?.[0] || null)} />
                </div>
              </div>

              <hr className="border-secondary border-opacity-30" />

              <div className="form-check form-switch mb-3">
                <input 
                  type="checkbox" 
                  className="form-check-input" 
                  role="switch" 
                  id="maintModeCheck"
                  checked={maintenanceMode}
                  onChange={(e) => handleToggleMaintenance(e.target.checked)}
                />
                <label className="form-check-label fw-bold" htmlFor="maintModeCheck" style={{ color: maintenanceMode ? '#ef4444' : '#facc15' }}>
                  {maintenanceMode
                    ? <><i className="bi bi-shield-fill-exclamation me-2"></i>Maintenance Mode is ACTIVE — Users are blocked</>  
                    : <><i className="bi bi-shield-check me-2"></i>Enable Site Maintenance Mode (Blocks Users Panel)</>}
                </label>
              </div>

              <div className="form-group mb-3">
                <label className="form-label">Global Notification/Announcement Headline</label>
                <textarea 
                  className="form-control" 
                  value={announcementText} 
                  onChange={(e) => setAnnouncementText(e.target.value)}
                  placeholder="e.g. Join the Diwali Grand Cup and win up to ₹5000 cash prizes today!" 
                  style={{ minHeight: '60px', fontSize: '0.85rem' }}
                />
              </div>

              <hr className="border-secondary border-opacity-30" />

              {/* Registration Mode Toggle */}
              <div className="mb-4">
                <h6 className="text-white mb-1">Tournament Registration Mode</h6>
                <p className="text-secondary mb-3" style={{ fontSize: '0.78rem' }}>
                  Controls how players register for matches — <strong className="text-white">API mode</strong> fetches the player's nickname, level, rank and ban status from the game server automatically.
                </p>
                <div className="reg-mode-toggle-group">
                  <button
                    type="button"
                    className={`reg-mode-btn ${registrationMode === 'manual' ? 'active' : ''}`}
                    onClick={() => handleToggleRegistrationMode('manual')}
                  >
                    <i className="bi bi-pencil-square me-2"></i>
                    <span>
                      <strong>Manual</strong>
                      <small className="d-block">Player types IGN &amp; UID manually</small>
                    </span>
                  </button>
                  <button
                    type="button"
                    className={`reg-mode-btn ${registrationMode === 'api' ? 'active api' : ''}`}
                    onClick={() => handleToggleRegistrationMode('api')}
                  >
                    <i className="bi bi-cpu me-2"></i>
                    <span>
                      <strong>API Verify</strong>
                      <small className="d-block">Auto-fetch via UID lookup API</small>
                    </span>
                  </button>
                </div>
                {registrationMode === 'api' && (
                  <div className="mt-2 p-2 bg-success bg-opacity-10 border border-success border-opacity-25 rounded-2 small text-success">
                    <i className="bi bi-check-circle-fill me-1"></i>
                    API mode active — players must verify their UID before registering.
                  </div>
                )}
              </div>
              <hr className="border-secondary border-opacity-30" />
              
              {/* App Update & Refresh Manager */}
              <div className="mb-4">
                <h6 className="text-white mb-2"><i className="bi bi-cloud-arrow-down-fill text-warning me-2"></i>App Update &amp; Refresh Manager</h6>
                <p className="text-secondary" style={{ fontSize: '0.78rem' }}>
                  Manage client app updates and cache maintenance operations.
                </p>

                <div className="form-check form-switch mb-3">
                  <input 
                    type="checkbox" 
                    className="form-check-input" 
                    role="switch" 
                    id="forceUpdateCheck"
                    checked={updateForce}
                    onChange={(e) => setUpdateForce(e.target.checked)}
                  />
                  <label className="form-check-label fw-semibold text-light small" htmlFor="forceUpdateCheck">
                    {updateForce 
                      ? <><span className="text-danger"><i className="bi bi-exclamation-triangle-fill me-1"></i>Force Update Banner is ACTIVE</span></>
                      : <>Enable Force Update Overlay (Blocks user panel)</>
                    }
                  </label>
                </div>

                <div className="row g-2 mb-3">
                  <div className="col-md-8">
                    <label className="form-label small text-secondary">New App Download Link (URL)</label>
                    <input 
                      type="url" 
                      className="form-control form-control-sm" 
                      placeholder="e.g. https://play.google.com/store/apps/details?id=..." 
                      value={updateAppLink}
                      onChange={(e) => setUpdateAppLink(e.target.value)}
                    />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label small text-secondary">Target Version Code</label>
                    <input 
                      type="text" 
                      className="form-control form-control-sm" 
                      placeholder="e.g. 1.2.0" 
                      value={updateVersion}
                      onChange={(e) => setUpdateVersion(e.target.value)}
                    />
                  </div>
                </div>

                <div className="p-3 bg-dark bg-opacity-40 rounded-3 border border-secondary border-opacity-25 mt-3 text-start">
                  <h6 className="text-white small mb-1" style={{ fontSize: '0.8rem' }}><i className="bi bi-arrow-clockwise text-warning me-2"></i>Maintenance: Force Hard Refresh</h6>
                  <p className="text-secondary mb-3" style={{ fontSize: '0.72rem', lineHeight: '1.4' }}>
                    Clicking this triggers an instant service reload on all connected players' browsers. It clears old site assets from browser cache storage and updates their panel automatically.
                  </p>
                  <button 
                    type="button" 
                    className="btn btn-warning btn-sm fw-bold px-3"
                    onClick={handleTriggerHardRefresh}
                  >
                    <i className="bi bi-lightning-charge-fill me-1"></i> Broadcast Hard Refresh
                  </button>
                </div>
              </div>

              <hr className="border-secondary border-opacity-30" />
              <h6 className="text-white mb-3">Agreement & Policy Editor</h6>
              
              <div className="form-group mb-2">
                <label className="form-label small text-secondary">Privacy Policy</label>
                <textarea className="form-control font-monospace" value={policyPrivacy} onChange={(e) => setPolicyPrivacy(e.target.value)} style={{ minHeight: '70px', fontSize: '0.75rem' }} />
              </div>
              <div className="form-group mb-2">
                <label className="form-label small text-secondary">Terms and Conditions</label>
                <textarea className="form-control font-monospace" value={policyTerms} onChange={(e) => setPolicyTerms(e.target.value)} style={{ minHeight: '70px', fontSize: '0.75rem' }} />
              </div>
              <div className="form-group mb-2">
                <label className="form-label small text-secondary">Refund & Cancellation Policy</label>
                <textarea className="form-control font-monospace" value={policyRefund} onChange={(e) => setPolicyRefund(e.target.value)} style={{ minHeight: '70px', fontSize: '0.75rem' }} />
              </div>
              <div className="form-group mb-3">
                <label className="form-label small text-secondary">Fair Play Rules</label>
                <textarea className="form-control font-monospace" value={policyFairPlay} onChange={(e) => setPolicyFairPlay(e.target.value)} style={{ minHeight: '70px', fontSize: '0.75rem' }} />
              </div>

              <button className="btn-custom btn-custom-primary w-100" type="submit" disabled={savingSettings}>
                {savingSettings ? 'Saving Settings...' : 'Save Settings'}
              </button>
            </form>
          </div>

          {/* Coupons Card */}
          <div className="col-lg-5 text-start">
            <div className="card custom-card p-4">
              <div className="d-flex justify-content-between align-items-center mb-3">
                <h5 className="m-0 text-white">Promo Coupons</h5>
                <button className="btn btn-success btn-xs py-1 px-2 text-xs" onClick={handleOpenAddCoupon}>
                  Add
                </button>
              </div>

              <div className="table-responsive" style={{ maxHeight: '500px', overflowY: 'auto' }}>
                <table className="table table-dark table-striped mb-0 small">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Discount</th>
                      <th>Uses</th>
                      <th>Del</th>
                    </tr>
                  </thead>
                  <tbody>
                    {coupons.length > 0 ? (
                      coupons.map(cp => (
                        <tr key={cp.code}>
                          <td className="align-middle fw-bold text-warning">{cp.code}</td>
                          <td className="align-middle">
                            {cp.discountType === 'percentage' ? `${cp.discountValue}%` : `₹${cp.discountValue}`}
                          </td>
                          <td className="align-middle">{cp.timesUsed}/{cp.maxUses}</td>
                          <td className="align-middle">
                            <button className="btn btn-sm btn-link text-danger p-0" onClick={() => handleDeleteCoupon(cp.code)}>
                              <i className="bi bi-trash"></i>
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="text-center text-secondary py-3">No coupons found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Avatar Library Card ── */}
      <div className="card custom-card p-4 mt-4">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <div>
            <h5 className="m-0 text-white">Avatar Library</h5>
            <small className="text-secondary">Images uploaded here are available for users to pick as their profile photo.</small>
          </div>
          <button
            className="btn btn-success btn-sm"
            onClick={() => avatarFileRef.current?.click()}
            disabled={avatarUploading}
          >
            {avatarUploading ? (
              <><span className="spinner-border spinner-border-sm me-1"></span>Uploading...</>
            ) : (
              <><i className="bi bi-cloud-upload-fill me-1"></i>Upload Image</>
            )}
          </button>
          <input
            ref={avatarFileRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleAvatarLibraryUpload}
          />
        </div>

        {avatarLibrary.length === 0 ? (
          <div className="text-center text-secondary py-4">
            <i className="bi bi-images fs-2 d-block mb-2"></i>
            No images in the library yet. Upload some for users to choose from.
          </div>
        ) : (
          <div className="avatar-library-admin-grid">
            {avatarLibrary.map(img => (
              <div key={img.id} className="avatar-library-admin-item">
                <img src={img.url} alt="Library Avatar" />
                <button
                  className="avatar-library-delete-btn"
                  onClick={() => handleDeleteAvatarFromLibrary(img.id)}
                  title="Remove"
                >
                  <i className="bi bi-trash-fill"></i>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Banner Library Card ── */}
      <div className="card custom-card p-4 mt-4">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <div>
            <h5 className="m-0 text-white">Banner Library</h5>
            <small className="text-secondary">Banners are used as profile &amp; leaderboard backgrounds by users.</small>
          </div>
          <button
            className="btn btn-success btn-sm"
            onClick={() => bannerLibAdminRef.current?.click()}
            disabled={bannerUploading}
          >
            {bannerUploading
              ? <><span className="spinner-border spinner-border-sm me-1"></span>Uploading...</>
              : <><i className="bi bi-cloud-upload-fill me-1"></i>Upload Banner</>
            }
          </button>
          <input ref={bannerLibAdminRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleBannerLibraryUpload} />
        </div>

        {bannerLibrary.length === 0 ? (
          <div className="text-center text-secondary py-4">
            <i className="bi bi-image fs-2 d-block mb-2"></i>
            No banners yet. Upload wide/landscape images for best results.
          </div>
        ) : (
          <div className="banner-library-admin-grid">
            {bannerLibrary.map(img => (
              <div key={img.id} className="banner-library-admin-item">
                <img src={img.url} alt="Banner" />
                <button
                  className="avatar-library-delete-btn"
                  onClick={() => handleDeleteBannerFromLibrary(img.id)}
                  title="Remove"
                >
                  <i className="bi bi-trash-fill"></i>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Coupon Modal */}
      {showCouponModal && (
        <div 
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
          style={{ zIndex: 1050, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
        >
          <div className="custom-card p-4 mx-3" style={{ width: '100%', maxWidth: '400px' }}>
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h5 className="modal-title m-0">Add Coupon Code</h5>
              <button className="btn-close btn-close-white" onClick={() => setShowCouponModal(false)}></button>
            </div>

            <form onSubmit={handleSaveCoupon} className="text-start">
              <div className="form-group">
                <label className="form-label">Coupon Code (Uppercase)</label>
                <input 
                  type="text" 
                  className="form-control"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                  placeholder="e.g. WELCOME50"
                  required
                />
              </div>

              <div className="row g-2 mb-3">
                <div className="col-6">
                  <label className="form-label">Discount Type</label>
                  <select className="form-select form-select-sm" value={couponDiscType} onChange={(e: any) => setCouponDiscType(e.target.value)}>
                    <option value="flat">Flat Cash (₹)</option>
                    <option value="percentage">Percentage (%)</option>
                  </select>
                </div>
                <div className="col-6">
                  <label className="form-label">Discount Value</label>
                  <input 
                    type="number" 
                    className="form-control form-control-sm"
                    value={couponDiscVal}
                    onChange={(e) => setCouponDiscVal(Number(e.target.value))}
                    min="1"
                    required
                  />
                </div>
              </div>

              <div className="row g-2 mb-4">
                <div className="col-6">
                  <label className="form-label">Min Match Fee (₹)</label>
                  <input 
                    type="number" 
                    className="form-control form-control-sm"
                    value={couponMinFee}
                    onChange={(e) => setCouponMinFee(Number(e.target.value))}
                    min="0"
                    required
                  />
                </div>
                <div className="col-6">
                  <label className="form-label">Max Uses Limit</label>
                  <input 
                    type="number" 
                    className="form-control form-control-sm"
                    value={couponMaxUses}
                    onChange={(e) => setCouponMaxUses(Number(e.target.value))}
                    min="1"
                    required
                  />
                </div>
              </div>

              <div className="form-group mb-4">
                <label className="form-label">Coupon Status</label>
                <select className="form-select form-select-sm" value={couponStatus} onChange={(e: any) => setCouponStatus(e.target.value)}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              <div className="d-flex gap-2">
                <button 
                  type="button" 
                  className="btn-custom btn-custom-secondary flex-grow-1" 
                  onClick={() => setShowCouponModal(false)}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn-custom btn-custom-primary flex-grow-1"
                  disabled={couponSaving}
                >
                  {couponSaving ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminSettings;
