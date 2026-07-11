import React, { useEffect, useState } from 'react';
import { ref, get } from 'firebase/database';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';

interface MatchResultsModalProps {
  tournamentId: string;
  tournamentName: string;
  onClose: () => void;
  onBack?: () => void; // optional back to match history
  onReportClick?: () => void;
}

interface ResultEntry {
  uid: string;
  displayName: string;
  inGameUsername?: string;
  photoURL?: string;
  appliedBadgeUrl?: string;
  appliedBadgeEffect?: string;
  appliedBadgeColor?: string;
  rank: number;
  kills: number; // total team kills
  leaderKills?: number;
  teammates?: { username: string; gameUid: string; kills: number }[];
  winnings: number;
  blacklisted?: boolean;
  blacklistReason?: string;
  unfairBonus?: number;
}

/** Convert "#RRGGBB" → "R, G, B" for CSS rgba() */
const hexToRgbStr = (hex: string): string => {
  const clean = (hex || '#FFFFFF').replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16) || 255;
  const g = parseInt(clean.substring(2, 4), 16) || 255;
  const b = parseInt(clean.substring(4, 6), 16) || 255;
  return `${r}, ${g}, ${b}`;
};

const MatchResultsModal: React.FC<MatchResultsModalProps> = ({ tournamentId, tournamentName, onClose, onBack, onReportClick }) => {
  const { currentUser } = useAuth();
  const [results, setResults] = useState<ResultEntry[]>([]);
  const [mode, setMode] = useState<'Solo' | 'Duo' | 'Squad'>('Solo');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchResults = async () => {
      try {
        const snap = await get(ref(db, `tournaments/${tournamentId}`));
        if (snap.exists()) {
          const data = snap.val();
          setMode(data.mode || 'Solo');
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
              {results.some(r => r.blacklisted) && (
                <span style={{ marginLeft: '8px', fontSize: '0.6rem', background: 'rgba(239,68,68,0.15)', color: '#F87171', padding: '1px 5px', borderRadius: '3px', fontWeight: 700, border: '1px solid rgba(239,68,68,0.3)' }}>
                  ⛔ DISQUALIFICATIONS ACTIVE
                </span>
              )}
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '4px' }}>
              {results.map((player, idx) => {
                const rs = getRankStyle(player.rank);
                const isMe = player.uid === currentUser?.uid;
                const avatarUrl = player.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(player.displayName)}&background=1E293B&color=E2E8F0&bold=true&size=36`;
                const teammates = player.teammates || [];
                const isTeamMode = mode === 'Duo' || mode === 'Squad';
                const isBlacklisted = !!player.blacklisted;

                if (isTeamMode && teammates.length > 0) {
                  return (
                    <div
                      key={player.uid + idx}
                      style={{
                        borderRadius: isBlacklisted ? '0px' : '8px',
                        overflow: 'hidden',
                        border: isBlacklisted ? '1.5px solid #EF4444' : '1px solid rgba(124, 58, 237, 0.15)',
                        background: isBlacklisted ? 'rgba(15, 21, 38, 0.5)' : 'rgba(15, 21, 38, 0.5)',
                        display: 'flex',
                        flexDirection: 'column',
                      }}
                    >
                      {/* Leader Row */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '9px 12px',
                          position: 'relative',
                          backgroundImage: isBlacklisted ? 'none' : `url('/images/match_results_item_bg.webp')`,
                          backgroundSize: '125% 175%',
                          backgroundPosition: 'center',
                          backgroundRepeat: 'no-repeat',
                          borderBottom: '1px solid rgba(124, 58, 237, 0.12)',
                        }}
                      >
                        {/* Hue-rotated red bg for blacklisted: purple(270°) + hue-rotate(110°) = red(360°/0°) */}
                        {isBlacklisted && (
                          <div style={{
                            position: 'absolute', inset: 0,
                            backgroundImage: `url('/images/match_results_item_bg.webp')`,
                            backgroundSize: '125% 175%',
                            backgroundPosition: 'center',
                            backgroundRepeat: 'no-repeat',
                            filter: 'hue-rotate(110deg) saturate(2.5) brightness(0.9)',
                            pointerEvents: 'none',
                            zIndex: 0,
                          }} />
                        )}

                        {/* Rank */}
                        <div style={{ width: '32px', textAlign: 'center', flexShrink: 0, position: 'relative', zIndex: 1 }}>
                          {player.rank <= 3 ? (
                            <i className={`bi ${rs.icon}`} style={{ color: isBlacklisted ? '#F87171' : rs.color, fontSize: '1rem' }}></i>
                          ) : (
                            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: isBlacklisted ? '#FCA5A5' : '#94A3B8' }}>#{player.rank}</span>
                          )}
                        </div>

                        {/* Leader Avatar */}
                        <div style={{ position: 'relative', flexShrink: 0, zIndex: 1 }}>
                          <img
                            src={avatarUrl}
                            alt={player.displayName}
                            style={{ width: '34px', height: '34px', borderRadius: '0px', objectFit: 'cover', filter: isBlacklisted ? 'grayscale(0.4) brightness(0.7)' : 'none' }}
                          />
                          {player.appliedBadgeUrl && !isBlacklisted && (
                            <span 
                              className="badge-sweep-wrap" 
                              data-effect={player.appliedBadgeEffect || 'light-sweep'}
                              style={{
                                bottom: '-3px',
                                right: '-3px',
                                width: '14px',
                                height: '14px',
                                ['--badge-color' as any]: hexToRgbStr(player.appliedBadgeColor || '#FFFFFF')
                              }}
                            >
                              <img src={player.appliedBadgeUrl} alt="Badge" style={{ width: '14px', height: '14px' }} />
                            </span>
                          )}
                        </div>

                        {/* Leader Info */}
                        <div style={{ flex: 1, minWidth: 0, position: 'relative', zIndex: 1 }}>
                          <div style={{
                            fontSize: '0.8rem', fontWeight: isMe ? 700 : 600,
                            color: isBlacklisted ? '#FECACA' : (isMe ? '#E2E8F0' : '#FFFFFF'),
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          }}>
                            {player.displayName}
                            {!isBlacklisted && <span style={{ marginLeft: '4px', fontSize: '0.58rem', background: 'rgba(74,222,128,0.15)', color: '#4ADE80', padding: '1px 4px', borderRadius: '3px', fontWeight: 600 }}>LDR</span>}
                            {isMe && !isBlacklisted && <span style={{ marginLeft: '4px', fontSize: '0.58rem', background: 'rgba(250,204,21,0.15)', color: '#FACC15', padding: '1px 4px', borderRadius: '3px', fontWeight: 600 }}>YOU</span>}
                          </div>
                          {player.inGameUsername && (
                            <div style={{ fontSize: '0.62rem', color: isBlacklisted ? '#FCA5A5' : '#94A3B8', marginTop: '1px', opacity: isBlacklisted ? 0.7 : 1 }}>{player.inGameUsername}</div>
                          )}
                        </div>

                        {/* Leader Individual Kills */}
                        <div style={{ textAlign: 'center', flexShrink: 0, minWidth: '40px', position: 'relative', zIndex: 1 }}>
                          <div style={{ fontSize: '0.55rem', color: isBlacklisted ? '#FCA5A5' : '#94A3B8', marginBottom: '1px' }}>Ldr Kills</div>
                          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: isBlacklisted ? '#FECACA' : '#CBD5E1' }}>{player.leaderKills ?? player.kills ?? 0}</div>
                        </div>

                        {/* Team Total Kills */}
                        <div style={{ textAlign: 'center', flexShrink: 0, minWidth: '40px', position: 'relative', zIndex: 1 }}>
                          <div style={{ fontSize: '0.55rem', color: isBlacklisted ? '#FCA5A5' : '#FACC15', marginBottom: '1px', fontWeight: 600 }}>Team Kills</div>
                          <div style={{ fontSize: '0.82rem', fontWeight: 800, color: isBlacklisted ? '#FECACA' : '#FACC15' }}>{player.kills ?? 0}</div>
                        </div>

                        {/* Winnings */}
                        <div style={{ textAlign: 'right', flexShrink: 0, minWidth: '54px', position: 'relative', zIndex: 1 }}>
                          {isBlacklisted ? (
                            <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#FEE2E2' }}>₹0</div>
                          ) : (
                            <>
                              <div style={{ fontSize: '0.55rem', color: '#4ADE80', marginBottom: '1px' }}>Earned</div>
                              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#4ADE80' }}>
                                {(player.winnings || 0) > 0 ? `₹${player.winnings.toFixed(0)}` : '—'}
                              </div>
                              {(player.unfairBonus || 0) > 0 && (
                                <div style={{ fontSize: '0.55rem', color: '#FB923C', marginTop: '1px' }}>+₹{player.unfairBonus!.toFixed(0)} Unfair Bonus</div>
                              )}
                            </>
                          )}
                        </div>
                      </div>

                      {/* Teammates List */}
                      {teammates.map((tm, tmIdx) => (
                        <div
                          key={tmIdx}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            padding: '6px 12px 6px 52px',
                            background: isBlacklisted ? 'rgba(120,10,10,0.25)' : 'rgba(0,0,0,0.18)',
                            borderBottom: tmIdx < teammates.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none',
                          }}
                        >
                          <i className="bi bi-arrow-return-right" style={{ color: isBlacklisted ? '#F87171' : '#475569', fontSize: '0.65rem', flexShrink: 0 }}></i>
                          
                          <div style={{ width: '24px', height: '24px', flexShrink: 0, border: '0.5px solid rgba(255,255,255,0.08)' }}>
                            <img
                              src={`https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(tm.username)}`}
                              alt="tm"
                              style={{ width: '24px', height: '24px', objectFit: 'cover', filter: isBlacklisted ? 'grayscale(0.5) brightness(0.6)' : 'none' }}
                            />
                          </div>

                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '0.72rem', color: isBlacklisted ? '#FCA5A5' : '#CBD5E1', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {tm.username}
                            </div>
                            <div style={{ fontSize: '0.58rem', color: isBlacklisted ? '#F87171' : '#475569', opacity: 0.7 }}>UID: {tm.gameUid}</div>
                          </div>

                          <div style={{ textAlign: 'center', flexShrink: 0, minWidth: '40px', paddingRight: '98px' }}>
                            <div style={{ fontSize: '0.55rem', color: isBlacklisted ? '#FCA5A5' : '#94A3B8', marginBottom: '1px' }}>Kills</div>
                            <div style={{ fontSize: '0.72rem', fontWeight: 600, color: isBlacklisted ? '#FECACA' : '#CBD5E1' }}>{tm.kills}</div>
                          </div>
                        </div>
                      ))}

                      {/* Reason snackbar — flat, no border-radius, no gap */}
                      {isBlacklisted && (
                        <div style={{
                          background: '#7F1D1D',
                          padding: '5px 12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}>
                          <i className="bi bi-slash-circle-fill" style={{ color: '#FCA5A5', fontSize: '0.7rem', flexShrink: 0 }} />
                          <span style={{ fontSize: '0.68rem', color: '#FEE2E2', fontWeight: 600 }}>
                            Disqualified{player.blacklistReason ? `: ${player.blacklistReason}` : ' by admin'}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                }

                return (
                  <div
                    key={player.uid + idx}
                    style={{
                      display: 'flex', flexDirection: 'column',
                      borderRadius: '0px',
                      border: isBlacklisted ? '1.5px solid #EF4444' : 'none',
                      overflow: 'hidden',
                    }}
                  >
                  {/* Main player row */}
                  <div
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '9px 12px',
                      position: 'relative',
                      backgroundImage: isBlacklisted ? 'none' : 'url(/images/match_results_item_bg.webp)',
                      backgroundSize: '125% 175%',
                      backgroundPosition: 'center',
                      backgroundRepeat: 'no-repeat',
                    }}
                  >
                    {/* Hue-rotated red bg for blacklisted: purple(270°) + hue-rotate(110°) = red(360°/0°) */}
                    {isBlacklisted && (
                      <div style={{
                        position: 'absolute', inset: 0,
                        backgroundImage: 'url(/images/match_results_item_bg.webp)',
                        backgroundSize: '125% 175%',
                        backgroundPosition: 'center',
                        backgroundRepeat: 'no-repeat',
                        filter: 'hue-rotate(110deg) saturate(2.5) brightness(0.9)',
                        pointerEvents: 'none',
                        zIndex: 0,
                      }} />
                    )}
                    {/* Rank number */}
                    <div style={{
                      width: '32px', textAlign: 'center', flexShrink: 0, position: 'relative', zIndex: 1,
                    }}>
                      {player.rank <= 3 ? (
                        <i className={`bi ${rs.icon}`} style={{ color: isBlacklisted ? '#F87171' : rs.color, fontSize: '1rem' }}></i>
                      ) : (
                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: isBlacklisted ? '#FCA5A5' : '#94A3B8' }}>#{player.rank}</span>
                      )}
                    </div>

                    {/* Avatar */}
                    <div style={{ position: 'relative', flexShrink: 0, zIndex: 1 }}>
                      <img
                        src={avatarUrl}
                        alt={player.displayName}
                        style={{ width: '34px', height: '34px', borderRadius: '0px', objectFit: 'cover', filter: isBlacklisted ? 'grayscale(0.4) brightness(0.65)' : 'none' }}
                      />
                      {player.appliedBadgeUrl && !isBlacklisted && (
                        <span 
                          className="badge-sweep-wrap" 
                          data-effect={player.appliedBadgeEffect || 'light-sweep'}
                          style={{
                            bottom: '-3px',
                            right: '-3px',
                            width: '14px',
                            height: '14px',
                            ['--badge-color' as any]: hexToRgbStr(player.appliedBadgeColor || '#FFFFFF')
                          }}
                        >
                          <img src={player.appliedBadgeUrl} alt="Badge" style={{ width: '14px', height: '14px' }} />
                        </span>
                      )}
                    </div>

                    {/* Name + IGN */}
                    <div style={{ flex: 1, minWidth: 0, position: 'relative', zIndex: 1 }}>
                      <div style={{
                        fontSize: '0.8rem', fontWeight: isMe ? 700 : 500,
                        color: isBlacklisted ? '#FECACA' : (isMe ? '#E2E8F0' : '#94A3B8'),
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {player.displayName}
                        {isMe && !isBlacklisted && <span style={{ marginLeft: '6px', fontSize: '0.6rem', background: 'rgba(250,204,21,0.15)', color: '#FACC15', padding: '1px 5px', borderRadius: '3px', fontWeight: 600, letterSpacing: '0.04em' }}>YOU</span>}
                      </div>
                      {player.inGameUsername && (
                        <div style={{ fontSize: '0.62rem', color: isBlacklisted ? '#FCA5A5' : '#94A3B8', marginTop: '1px', opacity: isBlacklisted ? 0.7 : 1 }}>{player.inGameUsername}</div>
                      )}
                    </div>

                    {/* Kill count */}
                    <div style={{ textAlign: 'center', flexShrink: 0, minWidth: '40px', position: 'relative', zIndex: 1 }}>
                      <div style={{ fontSize: '0.62rem', color: isBlacklisted ? '#FCA5A5' : '#FFFFFF', marginBottom: '1px', opacity: 0.8 }}>Kills</div>
                      <div style={{ fontSize: '0.82rem', fontWeight: 700, color: isBlacklisted ? '#FECACA' : '#FFFFFF' }}>{player.kills ?? 0}</div>
                    </div>

                    {/* Winnings */}
                    <div style={{ textAlign: 'right', flexShrink: 0, minWidth: '54px', position: 'relative', zIndex: 1 }}>
                      {isBlacklisted ? (
                        <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#FEE2E2' }}>₹0</div>
                      ) : (
                        <>
                          <div style={{ fontSize: '0.62rem', color: '#FFFFFF', marginBottom: '1px', opacity: 0.8 }}>Earned</div>
                          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#FFFFFF' }}>
                            {(player.winnings || 0) > 0 ? `₹${player.winnings.toFixed(0)}` : '—'}
                          </div>
                          {(player.unfairBonus || 0) > 0 && (
                            <div style={{ fontSize: '0.55rem', color: '#FB923C', marginTop: '1px' }}>+₹{player.unfairBonus!.toFixed(0)} Unfair Bonus</div>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Reason snackbar — flat, zero border-radius, zero gap, flush below the card */}
                  {isBlacklisted && (
                    <div style={{
                      background: '#7F1D1D',
                      padding: '5px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}>
                      <i className="bi bi-slash-circle-fill" style={{ color: '#FCA5A5', fontSize: '0.7rem', flexShrink: 0 }} />
                      <span style={{ fontSize: '0.68rem', color: '#FEE2E2', fontWeight: 600 }}>
                        Disqualified{player.blacklistReason ? `: ${player.blacklistReason}` : ' by admin'}
                      </span>
                    </div>
                  )}
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

        {/* Footer buttons */}
        <div style={{
          display: 'flex', gap: '8px',
          padding: '12px 18px 16px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
          background: 'rgba(0,0,0,0.2)',
        }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: '10px',
              borderRadius: '8px',
              border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(255,255,255,0.06)',
              color: '#CBD5E1',
              fontWeight: 600,
              fontSize: '0.82rem',
              cursor: 'pointer',
            }}
          >
            Close
          </button>
          {onReportClick && currentUser && results.some(p => p.uid === currentUser.uid) && (
            <button
              onClick={onReportClick}
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: '8px',
                border: '1px solid rgba(239,68,68,0.3)',
                background: 'rgba(239,68,68,0.1)',
                color: '#F87171',
                fontWeight: 600,
                fontSize: '0.82rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              <i className="bi bi-flag-fill" style={{ fontSize: '0.75rem' }}></i>
              Report Player
            </button>
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
