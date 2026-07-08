import React, { useEffect, useState } from 'react';
import { ref, get, update, serverTimestamp } from 'firebase/database';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';

interface NotificationsModalProps {
  onClose: () => void;
}

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  timestamp: number;
  imageUrl?: string;
}

const NotificationsModal: React.FC<NotificationsModalProps> = ({ onClose }) => {
  const { currentUser } = useAuth();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchNotifications = async () => {
      if (!currentUser) return;
      try {
        const globalRef = ref(db, 'notifications');
        const userRef = ref(db, `users/${currentUser.uid}/notifications`);

        const [globalSnap, userSnap] = await Promise.all([
          get(globalRef),
          get(userRef)
        ]);

        const list: NotificationItem[] = [];

        if (globalSnap.exists()) {
          Object.entries(globalSnap.val()).forEach(([id, val]: any) => {
            list.push({ id: `global-${id}`, ...val });
          });
        }

        if (userSnap.exists()) {
          Object.entries(userSnap.val()).forEach(([id, val]: any) => {
            list.push({ id: `user-${id}`, ...val });
          });
        }

        // Sort descending by timestamp
        list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        setNotifications(list);

        // Mark notifications as read
        await update(ref(db, `users/${currentUser.uid}`), {
          lastCheckedNotifications: serverTimestamp()
        });
      } catch (err) {
        console.error('Error fetching notifications:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchNotifications();
  }, [currentUser]);

  const formatDate = (ts: number) => {
    if (!ts) return '';
    const date = new Date(ts);
    return date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="console-notif-overlay">
      <div className="console-notif-container">
        {/* Header */}
        <div className="console-notif-header">
          <div className="d-flex align-items-center gap-2">
            <i className="bi bi-bell-fill text-warning fs-5"></i>
            <span className="console-notif-title">NOTIFICATIONS</span>
            {!loading && notifications.length > 0 && (
              <span className="console-notif-badge">{notifications.length}</span>
            )}
          </div>
          <button className="console-close-btn" onClick={onClose}>
            <i className="bi bi-x-lg"></i>
          </button>
        </div>

        {/* List */}
        <div className="console-notif-body">
          {loading ? (
            <div className="text-center py-5">
              <div className="spinner-border spinner-border-sm text-warning" role="status"></div>
              <span className="ms-2 text-secondary small">Loading...</span>
            </div>
          ) : notifications.length > 0 ? (
            <div className="d-flex flex-column gap-3">
              {notifications.map((notif) => (
                <div className="console-notif-card" key={notif.id}>
                  <div className="console-notif-card-header">
                    <h6 className="console-notif-card-title">{notif.title}</h6>
                    <span className="console-notif-time">{formatDate(notif.timestamp)}</span>
                  </div>
                  
                  <p className="console-notif-message">{notif.message}</p>
                  
                  {/* Full size Image Show */}
                  {notif.imageUrl && (
                    <div className="console-notif-img-box mt-3">
                      <img 
                        src={notif.imageUrl} 
                        alt="Promo Banner" 
                        className="console-notif-img"
                      />
                    </div>
                  )}

                  {notif.id.startsWith('global') && (
                    <div className="mt-3 text-end">
                      <span className="console-announcement-tag">Official Announcement</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="console-notif-empty">
              <i className="bi bi-bell-slash fs-2 mb-2 text-secondary"></i>
              <p className="mb-0 fw-bold">NO NOTIFICATIONS</p>
              <small className="text-secondary">We'll alert you when there is news or updates.</small>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="console-notif-footer">
          <button className="console-btn-primary" onClick={onClose}>
            CLOSE
          </button>
        </div>
      </div>

      {/* Inline styling to maintain a solid console layout */}
      <style>{`
        .console-notif-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: rgba(0, 0, 0, 0.8);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1050;
          padding: 16px;
        }
        .console-notif-container {
          width: 100%;
          max-width: 480px;
          height: 80vh;
          background: #0f172a;
          border: 1px solid #334155;
          border-radius: 12px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
        }
        .console-notif-header {
          padding: 16px;
          border-bottom: 1px solid #1e293b;
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #090d16;
        }
        .console-notif-title {
          font-weight: 800;
          font-size: 0.95rem;
          color: #f1f5f9;
          letter-spacing: 0.05em;
        }
        .console-notif-badge {
          background: #eab308;
          color: #0f172a;
          font-size: 0.72rem;
          font-weight: 800;
          padding: 2px 6px;
          border-radius: 4px;
        }
        .console-close-btn {
          background: transparent;
          border: none;
          color: #94a3b8;
          cursor: pointer;
          font-size: 1.1rem;
          padding: 4px;
        }
        .console-close-btn:hover {
          color: #f1f5f9;
        }
        .console-notif-body {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          background: #0b0f19;
        }
        .console-notif-card {
          background: #1e293b;
          border: 1px solid #334155;
          border-radius: 8px;
          padding: 16px;
        }
        .console-notif-card-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
          margin-bottom: 8px;
        }
        .console-notif-card-title {
          margin: 0;
          font-size: 0.92rem;
          font-weight: 700;
          color: #f8fafc;
          line-height: 1.3;
        }
        .console-notif-time {
          font-size: 0.7rem;
          color: #64748b;
          white-space: nowrap;
        }
        .console-notif-message {
          font-size: 0.82rem;
          color: #94a3b8;
          line-height: 1.5;
          margin: 0;
          white-space: pre-line;
        }
        .console-notif-img-box {
          border-radius: 6px;
          overflow: hidden;
          border: 1px solid #334155;
          max-height: 220px;
        }
        .console-notif-img {
          width: 100%;
          height: auto;
          display: block;
          object-fit: contain;
        }
        .console-announcement-tag {
          font-size: 0.65rem;
          color: #eab308;
          background: rgba(234, 179, 8, 0.1);
          border: 1px solid rgba(234, 179, 8, 0.2);
          padding: 3px 8px;
          border-radius: 4px;
          font-weight: 700;
        }
        .console-notif-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          text-align: center;
          color: #64748b;
          padding-top: 40px;
        }
        .console-notif-footer {
          padding: 12px 16px;
          background: #090d16;
          border-top: 1px solid #1e293b;
        }
        .console-btn-primary {
          width: 100%;
          background: #1e293b;
          border: 1px solid #475569;
          color: #e2e8f0;
          padding: 10px;
          font-size: 0.85rem;
          font-weight: 700;
          border-radius: 6px;
          cursor: pointer;
        }
        .console-btn-primary:hover {
          background: #334155;
          color: #f1f5f9;
        }
      `}</style>
    </div>
  );
};

export default NotificationsModal;
