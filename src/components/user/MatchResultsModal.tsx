import React, { useEffect, useState } from 'react';
import { ref, get } from 'firebase/database';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';

interface MatchResultsModalProps {
  tournamentId: string;
  tournamentName: string;
  onClose: () => void;
  onBack?: () => void; // optional back to match history
}

interface ResultEntry {
  uid: string;
  displayName: string;
  inGameUsername?: string;
  photoURL?: string;
  appliedBadgeUrl?: string;
  rank: number;
  kills: number;
  winnings: number;
}

const MatchResultsModal: React.FC<MatchResultsModalProps> = ({ tournamentId, tournamentName, onClose, onBack }) => {
  const { currentUser } = useAuth();
  const [results, setResults] = useState<ResultEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchResults = async () => {
      try {
        const snap = await get(ref(db, `tournaments/${tournamentId}`));
        if (snap.exists()) {
          const data = snap.val();
          const raw: ResultEntry[] = data.fullResults || [];
          // Sort by rank ascending
          raw.sort((a, b) => (a.rank || 999) - (b.rank || 999));
          setResults(raw);
        } else {
          setError('Tournament not found.');
        }
      } catch (err: any) {
        setError('Failed to load results.');
      } finally {
        setLoading(false);
      }
    };
    fetchResults();
  }, [tournamentId]);

  const getRankStyle = (rank: number) => {
    if (rank === 1) return { color: '#FACC15', bg: 'rgba(250,204,21,0.1)', border: 'rgba(250,204,21,0.25)', icon: 'bi-trophy-fill' };
    if (rank === 2) return { color: '#94A3B8', bg: 'rgba(148,163,184,0.08)', border: 'rgba(148,163,184,0.2)', icon: 'bi-award-fill' };
    if (rank === 3) return { color: '#C07434', bg: 'rgba(192,116,52,0.08)', border: 'rgba(192,116,52,0.2)', icon: 'bi-award-fill' };
    return { color: '#475569', bg: 'transparent', border: 'rgba(255,255,255,0.05)', icon: '' };
  };

  const myEntry = results.find(r => r.uid === currentUser?.uid);

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1070,
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
      }}
    >
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        maxHeight: '93vh',
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
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '14px 18px 12px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
        }}>
          {onBack && (
            <button onClick={onBack} style={{
              width: '30px', height: '30px', borderRadius: '6px',
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
              color: '#94A3B8', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <i className="bi bi-arrow-left" style={{ fontSize: '0.8rem' }}></i>
            </button>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#E2E8F0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {tournamentName}
            </div>
            <div style={{ fontSize: '0.68rem', color: '#475569', marginTop: '1px' }}>
              <i className="bi bi-bar-chart-line-fill me-1" style={{ color: '#334155' }}></i>
              Match Results · {results.length} players
            </div>
          </div>
          <button onClick={onClose} style={{
            width: '30px', height: '30px', borderRadius: '6px',
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
            color: '#64748B', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <i className="bi bi-x-lg" style={{ fontSize: '0.75rem' }}></i>
          </button>
        </div>

        {/* My result banner */}
        {!loading && myEntry && (
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
        )}

        {/* Results list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px 24px' }}>
          {loading ? (
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
          ) : error ? (
            <div style={{ textAlign: 'center', padding: '48px 20px', color: '#475569', fontSize: '0.85rem' }}>
              <i className="bi bi-exclamation-circle d-block mb-2" style={{ fontSize: '2rem' }}></i>
              {error}
            </div>
          ) : results.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingTop: '4px' }}>
              {results.map((player, idx) => {
                const rs = getRankStyle(player.rank);
                const isMe = player.uid === currentUser?.uid;
                const avatarUrl = player.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(player.displayName)}&background=1E293B&color=E2E8F0&bold=true&size=36`;

                return (
                  <div
                    key={player.uid + idx}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '9px 12px',
                      borderRadius: '0px',
                      border: 'none',
                      background: 'url(/images/match_results_item_bg.webp) no-repeat center center',
                      backgroundSize: '100% 300%, cover',
                    }}
                  >
                    {/* Rank number */}
                    <div style={{
                      width: '32px', textAlign: 'center', flexShrink: 0,
                    }}>
                      {player.rank <= 3 ? (
                        <i className={`bi ${rs.icon}`} style={{ color: rs.color, fontSize: '1rem' }}></i>
                      ) : (
                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#94A3B8' }}>#{player.rank}</span>
                      )}
                    </div>

                    {/* Avatar */}
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <img
                        src={avatarUrl}
                        alt={player.displayName}
                        style={{ width: '34px', height: '34px', borderRadius: '0px', objectFit: 'cover' }}
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
                        <div style={{ fontSize: '0.62rem', color: '#94A3B8', marginTop: '1px' }}>{player.inGameUsername}</div>
                      )}
                    </div>

                    {/* Kill count */}
                    <div style={{ textAlign: 'center', flexShrink: 0, minWidth: '40px' }}>
                      <div style={{ fontSize: '0.62rem', color: '#FFFFFF', marginBottom: '1px', opacity: 0.8 }}>Kills</div>
                      <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#FFFFFF' }}>{player.kills ?? 0}</div>
                    </div>

                    {/* Winnings */}
                    <div style={{ textAlign: 'right', flexShrink: 0, minWidth: '54px' }}>
                      <div style={{ fontSize: '0.62rem', color: '#FFFFFF', marginBottom: '1px', opacity: 0.8 }}>Earned</div>
                      <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#FFFFFF' }}>
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
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>Results not published yet</div>
              <div style={{ fontSize: '0.74rem', color: '#1E293B', marginTop: '4px' }}>Check back after the match ends.</div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes mhSlideUp {
          from { transform: translateY(40px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>
    </div>
  );
};

export default MatchResultsModal;
