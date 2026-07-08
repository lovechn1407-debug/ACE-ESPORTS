import React, { useEffect, useState } from 'react';
import { ref, get } from 'firebase/database';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';

interface MatchHistoryModalProps {
  onClose: () => void;
  onViewResults: (tournamentId: string, tournamentName: string) => void;
}

interface MatchRecord {
  tournamentId: string;
  tournamentName: string;
  rank: number;
  kills: number;
  earnings: number;
  date: number;
}

const getRankMeta = (rank: number) => {
  if (rank === 1)  return { icon: 'bi-trophy-fill',  color: '#FACC15', label: 'Winner' };
  if (rank === 2)  return { icon: 'bi-award-fill',   color: '#94A3B8', label: '2nd Place' };
  if (rank === 3)  return { icon: 'bi-award-fill',   color: '#C07434', label: '3rd Place' };
  if (rank <= 10)  return { icon: 'bi-patch-check',  color: '#38BDF8', label: `Top 10` };
  return           { icon: 'bi-hash',               color: '#475569', label: `Rank ${rank}` };
};

const MatchHistoryModal: React.FC<MatchHistoryModalProps> = ({ onClose, onViewResults }) => {
  const { currentUser } = useAuth();
  const [history, setHistory] = useState<MatchRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      if (!currentUser) return;
      try {
        const snapshot = await get(ref(db, `users/${currentUser.uid}/matchHistory`));
        if (snapshot.exists()) {
          const list = Object.values(snapshot.val()) as MatchRecord[];
          list.sort((a, b) => (b.date || 0) - (a.date || 0));
          setHistory(list);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, [currentUser]);

  const totalEarnings = history.reduce((s, m) => s + (m.earnings || 0), 0);
  const totalKills    = history.reduce((s, m) => s + (m.kills || 0), 0);
  const bestRank      = history.length > 0 ? Math.min(...history.map(m => m.rank || 999)) : null;

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1060,
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
              Match History
            </div>
            <div style={{ fontSize: '0.7rem', color: '#475569', marginTop: '1px' }}>
              {loading ? '...' : `${history.length} matches`}
            </div>
          </div>
          <button
            onClick={onClose}
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

        {/* Summary strip */}
        {!loading && history.length > 0 && (
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
            gap: '1px', background: 'rgba(255,255,255,0.05)',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            flexShrink: 0,
          }}>
            {[
              { label: 'Total Earned',  value: `₹${totalEarnings.toFixed(2)}`, color: '#4ADE80' },
              { label: 'Total Kills',   value: totalKills.toString(),           color: '#F87171' },
              { label: 'Best Rank',     value: `#${bestRank ?? '—'}`,          color: '#FACC15' },
            ].map(stat => (
              <div key={stat.label} style={{ background: '#0D1526', padding: '10px 14px' }}>
                <div style={{ fontSize: '0.62rem', color: '#475569', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '3px' }}>{stat.label}</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 800, color: stat.color }}>{stat.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px 24px' }}>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '4px' }}>
              {[1,2,3].map(i => (
                <div key={i} style={{
                  height: '88px', borderRadius: '8px',
                  background: 'linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.055) 50%, rgba(255,255,255,0.03) 75%)',
                  backgroundSize: '200% 100%',
                  animation: `shimmer 1.4s ease-in-out ${i * 0.12}s infinite`,
                }} />
              ))}
            </div>
          ) : history.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '4px' }}>
              {history.map((match, idx) => {
                const meta = getRankMeta(match.rank || 99);
                const isWin = match.rank === 1;

                return (
                  <div
                    key={match.tournamentId + idx}
                    style={{
                      borderRadius: '0px',
                      border: 'none',
                      background: 'url(/images/match_history_item_bg.webp) no-repeat center center',
                      backgroundSize: 'cover',
                      padding: '12px 13px',
                      position: 'relative',
                      overflow: 'hidden',
                    }}
                  >
                    {/* Gold top line for winner */}
                    {isWin && (
                      <div style={{
                        position: 'absolute', top: 0, left: 0, right: 0, height: '1.5px',
                        background: 'linear-gradient(to right, transparent, rgba(250,204,21,0.7), transparent)',
                      }} />
                    )}

                    {/* Top row: name + rank */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '9px' }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{
                          fontWeight: 600, fontSize: '0.83rem', color: '#CBD5E1',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>{match.tournamentName}</div>
                        <div style={{ fontSize: '0.65rem', color: '#94A3B8', marginTop: '2px' }}>
                          <i className="bi bi-calendar3 me-1"></i>
                          {new Date(match.date).toLocaleString('en-IN', {
                            day: 'numeric', month: 'short', year: 'numeric',
                            hour: '2-digit', minute: '2-digit',
                          })}
                        </div>
                      </div>

                      {/* Rank tag */}
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: '4px',
                        flexShrink: 0,
                      }}>
                        <i className={`bi ${meta.icon}`} style={{ fontSize: '0.68rem', color: '#FACC15' }}></i>
                        <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#FACC15' }}>{meta.label}</span>
                      </div>
                    </div>

                    {/* Bottom row: kills · earnings · button */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: '4px',
                        padding: '3px 9px', borderRadius: '4px',
                        background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.12)',
                      }}>
                        <i className="bi bi-crosshair2" style={{ fontSize: '0.65rem', color: '#F87171' }}></i>
                        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#F87171' }}>{match.kills ?? 0}</span>
                        <span style={{ fontSize: '0.62rem', color: '#4B5563' }}>kills</span>
                      </div>

                      <div style={{
                        display: 'flex', alignItems: 'center', gap: '4px',
                        padding: '3px 9px', borderRadius: '4px',
                        background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.12)',
                      }}>
                        <i className="bi bi-coin" style={{ fontSize: '0.65rem', color: '#4ADE80' }}></i>
                        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#4ADE80' }}>₹{(match.earnings || 0).toFixed(2)}</span>
                      </div>

                      <button
                        onClick={() => onViewResults(match.tournamentId, match.tournamentName)}
                        style={{
                          marginLeft: 'auto', 
                          width: '84px', 
                          height: '30px', 
                          padding: '0px', 
                          borderRadius: '4px',
                          border: '1px solid rgba(250,204,21,0.18)',
                          background: "url('/images/results_btn_bg.webp') no-repeat center center / 135% 214%",
                          color: '#000000', 
                          fontSize: '0.68rem', 
                          fontWeight: 'normal',
                          overflow: 'hidden',
                          cursor: 'pointer', 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center', 
                          gap: '4px',
                        }}
                      >
                        <i className="bi bi-graph-up" style={{ fontSize: '0.6rem' }}></i>
                        Results
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '56px 20px' }}>
              <i className="bi bi-controller" style={{
                fontSize: '2.2rem', color: 'rgba(255,255,255,0.1)', display: 'block', marginBottom: '14px'
              }}></i>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#334155', marginBottom: '5px' }}>No match history</div>
              <div style={{ fontSize: '0.76rem', color: '#1E293B' }}>Join a tournament to start your record.</div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes mhSlideUp {
          from { transform: translateY(40px); opacity: 0; }
          to   { transform: translateY(0);   opacity: 1; }
        }
      `}</style>
    </div>
  );
};

export default MatchHistoryModal;
