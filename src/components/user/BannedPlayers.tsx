import React, { useEffect, useState } from 'react';
import { ref, get } from 'firebase/database';
import { db } from '../../firebase';

interface BannedPlayer {
  uid: string;
  displayName: string;
  photoURL?: string;
  appliedBadgeUrl?: string;
  blockReason?: string;
  gameUid?: string;
}

interface BannedPlayersProps {
  onBack: () => void;
}

const BannedPlayers: React.FC<BannedPlayersProps> = ({ onBack }) => {
  const [players, setPlayers] = useState<BannedPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const fetchBannedPlayers = async () => {
      try {
        const snap = await get(ref(db, 'users'));
        const list: BannedPlayer[] = [];
        if (snap.exists()) {
          Object.entries(snap.val()).forEach(([uid, val]: any) => {
            if (val && val.status === 'blocked') {
              list.push({
                uid,
                displayName: val.displayName || 'Unnamed Player',
                photoURL: val.photoURL || '',
                appliedBadgeUrl: val.appliedBadgeUrl || '',
                blockReason: val.blockReason || 'Violation of fair play policies.',
                gameUid: val.gameUid || ''
              });
            }
          });
        }
        setPlayers(list);
      } catch (err) {
        console.error('Error fetching banned players:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchBannedPlayers();
  }, []);

  const filtered = players.filter(p => 
    p.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.uid.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.gameUid && p.gameUid.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <section className="section py-3 text-start">
      {/* Header bar with Back button */}
      <div className="d-flex align-items-center gap-3 mb-4">
        <button className="btn btn-sm btn-link text-white p-0" onClick={onBack}>
          <i className="bi bi-arrow-left fs-4"></i>
        </button>
        <h2 className="section-title m-0">Banned Players List</h2>
      </div>

      <p className="text-secondary small mb-4">
        This is a public record of accounts blocked for game hacks, team-up violations, or fraud.
      </p>

      {/* Search box */}
      <div className="input-group input-group-sm mb-4">
        <span className="input-group-text bg-dark border-secondary border-opacity-25 text-secondary">
          <i className="bi bi-search"></i>
        </span>
        <input
          type="search"
          className="form-control"
          placeholder="Search by nickname, game UID..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="text-center py-5">
          <div className="spinner-border spinner-border-sm text-warning" role="status"></div>
          <span className="ms-2 text-secondary small">Loading Banned Records...</span>
        </div>
      ) : filtered.length > 0 ? (
        <div className="d-flex flex-column gap-3">
          {filtered.map(p => {
            const avatarUrl = p.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(p.displayName)}&background=1E293B&color=E2E8F0&bold=true`;
            return (
              <div 
                key={p.uid} 
                className="card custom-card banned-player-card d-flex flex-row align-items-center gap-3"
              >
                {/* Avatar with Badge overlay */}
                <div style={{ position: 'relative', display: 'inline-block', width: '42px', height: '42px', flexShrink: 0 }}>
                  <img
                    src={avatarUrl}
                    alt={p.displayName}
                    className="border border-danger border-opacity-20"
                    style={{ width: '42px', height: '42px', objectFit: 'cover', borderRadius: '0px' }}
                  />
                  {p.appliedBadgeUrl && (
                    <span className="badge-sweep-wrap" style={{ position: 'absolute', bottom: '-4px', right: '-4px', zIndex: 5 }}>
                      <img src={p.appliedBadgeUrl} alt="Badge" style={{ width: '20px', height: '20px' }} />
                    </span>
                  )}
                </div>

                <div className="flex-grow-1 min-w-0">
                  <h6 className="text-white fw-bold mb-1 text-truncate">{p.displayName}</h6>
                  {p.gameUid && (
                    <p className="text-secondary small mb-1">
                      Game UID: <span className="font-monospace text-white">{p.gameUid}</span>
                    </p>
                  )}
                  <p 
                    className="text-danger small mb-0 fw-semibold" 
                    style={{ 
                      fontSize: '0.75rem',
                      background: 'linear-gradient(90deg, rgba(0, 0, 0, 0.75) 0%, rgba(0, 0, 0, 0.75) 85%, transparent 100%)',
                      padding: '4px 10px',
                      borderRadius: '4px',
                      display: 'inline-block',
                      width: 'fit-content',
                      marginTop: '4px'
                    }}
                  >
                    <i className="bi bi-shield-fill-x me-1"></i>Reason: {p.blockReason}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-5 text-secondary">
          <i className="bi bi-shield-check display-5 text-secondary d-block mb-3"></i>
          <p className="fw-bold mb-0">NO BANNED PLAYERS</p>
          <small className="text-secondary">Everyone is playing fair & square!</small>
        </div>
      )}
    </section>
  );
};

export default BannedPlayers;
