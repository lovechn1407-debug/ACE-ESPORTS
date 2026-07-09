import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ref, get, set, update, onValue } from 'firebase/database';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { db, firebaseConfig } from '../../firebase';

interface StaffMember {
  uid: string;
  id: string; // Username ID
  password?: string;
  accessibleMenus: string[];
  active: boolean;
  createdAt: number;
}

const MENU_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  games: 'Manage Games',
  promotions: 'Promotions Slider',
  tournaments: 'Manage Matches',
  score: 'Match Scores',
  leaderboard: 'Rank Leaderboard',
  users: 'Player Accounts',
  badges: 'Player Badges',
  earningZone: 'Earning Zone',
  withdrawals: 'Withdraw Requests',
  deposits: 'Deposit Requests',
  referrals: 'Referral Audits',
  notifications: 'Broadcast Alerts',
  analytics: 'Player Analytics',
  reports: 'Match Disputes',
  theme: 'Live Theme Editor',
  settings: 'Global Configs',
  staffs: 'Manage Staffs'
};

const AdminStaffs: React.FC = () => {
  const { org } = useParams<{ org: string }>();
  const [staffs, setStaffs] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);

  // Form Modals states
  const [showModal, setShowModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [selectedStaffUid, setSelectedStaffUid] = useState('');
  
  // Inputs
  const [staffIdInput, setStaffIdInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!org) return;
    const staffsRef = ref(db, `organisations/${org}/staffs`);
    const unsubscribe = onValue(staffsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const list = Object.entries(data).map(([uid, val]: any) => ({
          uid,
          ...val
        }));
        setStaffs(list);
      } else {
        setStaffs([]);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [org]);

  const handleOpenCreate = () => {
    setEditMode(false);
    setSelectedStaffUid('');
    setStaffIdInput('');
    setPasswordInput('');
    // Init all permissions as false
    const initPerms: Record<string, boolean> = {};
    Object.keys(MENU_LABELS).forEach(k => {
      initPerms[k] = false;
    });
    setPermissions(initPerms);
    setShowModal(true);
  };

  const handleOpenEdit = (staff: StaffMember) => {
    setEditMode(true);
    setSelectedStaffUid(staff.uid);
    setStaffIdInput(staff.id);
    setPasswordInput(staff.password || '');
    const initPerms: Record<string, boolean> = {};
    Object.keys(MENU_LABELS).forEach(k => {
      initPerms[k] = staff.accessibleMenus.includes(k);
    });
    setPermissions(initPerms);
    setShowModal(true);
  };

  const handleToggleActive = async (staff: StaffMember) => {
    if (!org) return;
    try {
      const staffRef = ref(db, `organisations/${org}/staffs/${staff.uid}`);
      await update(staffRef, { active: !staff.active });
      alert(`Staff status successfully updated to ${!staff.active ? 'Active' : 'Suspended'}.`);
    } catch (err: any) {
      alert('Failed to update staff status: ' + err.message);
    }
  };

  const handleCheckboxChange = (menuKey: string) => {
    setPermissions(prev => ({
      ...prev,
      [menuKey]: !prev[menuKey]
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!org) return;
    
    const finalStaffId = staffIdInput.trim().toLowerCase();
    if (!finalStaffId) {
      alert('Staff ID is required.');
      return;
    }

    if (!editMode && staffs.some(s => s.id === finalStaffId)) {
      alert('Staff ID username already exists. Please choose a different one.');
      return;
    }

    if (!passwordInput.trim() || passwordInput.trim().length < 6) {
      alert('Password is required and must be at least 6 characters.');
      return;
    }

    setSaving(true);
    const selectedMenus = Object.keys(permissions).filter(k => permissions[k]);

    try {
      if (editMode) {
        // Edit existing staff permissions and password record
        const staffRef = ref(db, `organisations/${org}/staffs/${selectedStaffUid}`);
        await update(staffRef, {
          password: passwordInput.trim(),
          accessibleMenus: selectedMenus
        });
        alert('Staff permissions updated successfully!');
      } else {
        // Create new Firebase Auth user under the hood using secondary app instance
        const staffEmail = `${finalStaffId}@${org}.esports.com`;
        const secondaryApp = initializeApp(firebaseConfig, 'SecondaryAuthApp');
        const secondaryAuth = getAuth(secondaryApp);
        
        let newUid = '';
        try {
          const cred = await createUserWithEmailAndPassword(secondaryAuth, staffEmail, passwordInput.trim());
          newUid = cred.user.uid;
        } catch (authErr: any) {
          if (authErr.code === 'auth/email-already-in-use') {
            throw new Error('Staff Auth account already exists for this username.');
          }
          throw authErr;
        } finally {
          await deleteApp(secondaryApp);
        }

        // Save staff configuration record in RTDB under their Auth UID key
        const staffRef = ref(db, `organisations/${org}/staffs/${newUid}`);
        await set(staffRef, {
          id: finalStaffId,
          password: passwordInput.trim(),
          accessibleMenus: selectedMenus,
          active: true,
          createdAt: Date.now()
        });
        alert('Staff account created successfully!');
      }
      setShowModal(false);
    } catch (err: any) {
      alert('Failed to save staff: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-staffs-view">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>Staff Management</h2>
        <button className="btn btn-success btn-sm" onClick={handleOpenCreate}>
          <i className="bi bi-plus-circle me-1"></i> Create Staff
        </button>
      </div>

      {loading ? (
        <div className="placeholder-glow py-5 rounded-3" style={{ height: '300px' }}></div>
      ) : (
        <div className="table-responsive card custom-card">
          <table className="table table-dark table-hover mb-0">
            <thead>
              <tr>
                <th>Staff Username / ID</th>
                <th>Menu Access Permissions</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {staffs.length > 0 ? (
                staffs.map((staff) => {
                  return (
                    <tr key={staff.uid}>
                      <td className="align-middle fw-bold text-accent">@{staff.id}</td>
                      <td className="align-middle">
                        <div className="d-flex flex-wrap gap-1">
                          {staff.accessibleMenus && staff.accessibleMenus.length > 0 ? (
                            staff.accessibleMenus.map((menu) => (
                              <span key={menu} className="badge bg-secondary text-capitalize" style={{ fontSize: '0.72rem' }}>
                                {MENU_LABELS[menu] || menu}
                              </span>
                            ))
                          ) : (
                            <span className="text-secondary small">No menus permitted</span>
                          )}
                        </div>
                      </td>
                      <td className="align-middle">
                        <span className={`badge bg-${staff.active ? 'success' : 'danger'}`}>
                          {staff.active ? 'Active' : 'Suspended'}
                        </span>
                      </td>
                      <td className="align-middle">
                        <button 
                          className="btn btn-sm btn-outline-info me-2" 
                          onClick={() => handleOpenEdit(staff)}
                          title="Edit staff access rules"
                        >
                          <i className="bi bi-shield-lock-fill me-1"></i> Edit Rules
                        </button>
                        <button 
                          className={`btn btn-sm btn-outline-${staff.active ? 'danger' : 'success'}`}
                          onClick={() => handleToggleActive(staff)}
                          title={staff.active ? 'Suspend Staff Account' : 'Activate Staff Account'}
                        >
                          <i className={`bi bi-${staff.active ? 'lock-fill' : 'unlock-fill'} me-1`}></i>
                          {staff.active ? 'Suspend' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={4} className="text-center text-secondary py-4">No staff accounts created yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit Modal Dialog */}
      {showModal && (
        <div 
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
          style={{ zIndex: 1050, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
        >
          <div className="custom-card p-4 mx-3" style={{ width: '100%', maxWidth: '580px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h5 className="modal-title m-0">{editMode ? 'Edit Staff Rules' : 'Create Staff Member'}</h5>
              <button className="btn-close btn-close-white" onClick={() => setShowModal(false)}></button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="row g-2 mb-3">
                <div className="col-md-6">
                  <label className="form-label text-start">Staff Username / ID</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    value={staffIdInput} 
                    onChange={(e) => setStaffIdInput(e.target.value)} 
                    placeholder="e.g. support_john" 
                    required 
                    disabled={editMode}
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label text-start">Password (min 6 characters)</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    value={passwordInput} 
                    onChange={(e) => setPasswordInput(e.target.value)} 
                    placeholder="Enter password" 
                    required 
                    minLength={6}
                  />
                </div>
              </div>

              <div className="mb-4">
                <label className="form-label text-start d-block fw-bold mb-2">Configure Accessible Menus</label>
                <div className="row g-2 bg-dark bg-opacity-25 p-3 rounded border border-secondary border-opacity-10">
                  {Object.entries(MENU_LABELS).map(([key, label]) => (
                    <div className="col-6 col-md-4" key={key}>
                      <div className="form-check text-start">
                        <input 
                          type="checkbox" 
                          className="form-check-input" 
                          id={`permCheck_${key}`}
                          checked={permissions[key] || false}
                          onChange={() => handleCheckboxChange(key)}
                        />
                        <label className="form-check-label small text-white-50" htmlFor={`permCheck_${key}`}>
                          {label}
                        </label>
                      </div>
                    </div>
                  ))}
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
                  type="submit" 
                  className="btn-custom btn-custom-primary flex-grow-1"
                  disabled={saving}
                >
                  {saving ? 'Saving...' : 'Confirm'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminStaffs;
