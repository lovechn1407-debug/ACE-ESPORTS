import React, { useEffect, useState } from 'react';
import { ref, get, query, orderByChild, limitToFirst } from 'firebase/database';
import { db } from '../../firebase';

interface LeaderboardUser {
  uid: string;
  displayName: string;
  photoURL?: string;
  appliedBadgeUrl?: string;
  leaderboardRank: number;
  leaderboardDisplayEarnings: number;
}

const Leaderboard: React.FC = () => {
  const [list, setList] = useState<LeaderboardUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        const snapshot = await get(ref(db, 'users'));
        if (snapshot.exists()) {
          const users: LeaderboardUser[] = [];
          Object.entries(snapshot.val()).forEach(([uid, val]: any) => {
            if (val && val.leaderboardRank) {
              users.push({
                uid,
                displayName: val.displayName || 'Player',
                photoURL: val.photoURL,
                appliedBadgeUrl: val.appliedBadgeUrl || '',
                leaderboardRank: val.leaderboardRank,
                leaderboardDisplayEarnings: val.leaderboardDisplayEarnings || 0
              });
            }
          });
          users.sort((a, b) => a.leaderboardRank - b.leaderboardRank);
          setList(users.slice(0, 100));
        }
      } catch (err) {
        console.error('Error fetching leaderboard:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchLeaderboard();
  }, []);

  const firstPlace = list.find(u => u.leaderboardRank === 1);
  const secondPlace = list.find(u => u.leaderboardRank === 2);
  const thirdPlace = list.find(u => u.leaderboardRank === 3);
  const listPlayers = list.filter(u => u.leaderboardRank > 3);

  const defaultAvatar = (name: string, size = 55) =>
    `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=1E293B&color=E2E8F0&bold=true&size=${size}`;

  return (
    <section className="section py-3">
      <h2 className="section-title">Top Players</h2>

      {loading ? (
        <div className="placeholder-glow py-5 rounded-3" style={{ height: '300px' }}></div>
      ) : (
        <>
          {/* ── Podium UI ── */}
          {list.length > 0 && (firstPlace || secondPlace || thirdPlace) && (
            <div className="leaderboard-podium">
              {/* 2nd Place */}
              {secondPlace ? (
                <div className="podium-column podium-2nd">
                  {/* Rank logo — OUTSIDE above the card */}
                  <img src="/images/rank_second.webp" alt="2nd" style={{ width: '60px', objectFit: 'contain', marginBottom: '4px' }} />
                  <div className="podium-card">
                    {/* Avatar — absolutely inside card at top center */}
                    <div style={{ position: 'absolute', top: '8px', left: '50%', transform: 'translateX(-50%)', zIndex: 2 }}>
                      <div style={{ position: 'relative', display: 'inline-block' }}>
                        <img
                          src={secondPlace.photoURL || defaultAvatar(secondPlace.displayName, 52)}
                          alt="2nd Place"
                          className="podium-avatar"
                        />
                        {secondPlace.appliedBadgeUrl && (
                          <span className="badge-sweep-wrap" style={{ position: 'absolute', bottom: '-4px', right: '-4px', width: '18px', height: '18px' }}>
                            <img src={secondPlace.appliedBadgeUrl} alt="Badge" style={{ width: '18px', height: '18px' }} />
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="podium-name marquee-hover">
                      <span>{secondPlace.displayName}</span>
                    </div>
                    <div className="podium-earnings">₹{secondPlace.leaderboardDisplayEarnings.toLocaleString('en-IN')}</div>
                  </div>
                </div>
              ) : (
                <div className="podium-column podium-2nd opacity-25">
                  <div className="podium-card"><div className="podium-name">-</div><div className="podium-earnings">₹0</div></div>
                </div>
              )}

              {/* 1st Place */}
              {firstPlace ? (
                <div className="podium-column podium-1st">
                  {/* Rank logo — OUTSIDE above the card */}
                  <img src="/images/rank_first.webp" alt="1st" style={{ width: '70px', objectFit: 'contain', marginBottom: '4px' }} />
                  <div className="podium-card">
                    {/* Avatar — absolutely inside card at top center */}
                    <div style={{ position: 'absolute', top: '8px', left: '50%', transform: 'translateX(-50%)', zIndex: 2 }}>
                      <div style={{ position: 'relative', display: 'inline-block' }}>
                        <img
                          src={firstPlace.photoURL || defaultAvatar(firstPlace.displayName, 60)}
                          alt="1st Place"
                          className="podium-avatar"
                        />
                        {firstPlace.appliedBadgeUrl && (
                          <span className="badge-sweep-wrap" style={{ position: 'absolute', bottom: '-4px', right: '-4px', width: '20px', height: '20px' }}>
                            <img src={firstPlace.appliedBadgeUrl} alt="Badge" style={{ width: '20px', height: '20px' }} />
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="podium-name marquee-hover">
                      <span>{firstPlace.displayName}</span>
                    </div>
                    <div className="podium-earnings">₹{firstPlace.leaderboardDisplayEarnings.toLocaleString('en-IN')}</div>
                  </div>
                </div>
              ) : (
                <div className="podium-column podium-1st opacity-25">
                  <div className="podium-card"><div className="podium-name">-</div><div className="podium-earnings">₹0</div></div>
                </div>
              )}

              {/* 3rd Place */}
              {thirdPlace ? (
                <div className="podium-column podium-3rd">
                  {/* Rank logo — OUTSIDE above the card */}
                  <img src="/images/rank_third.webp" alt="3rd" style={{ width: '60px', objectFit: 'contain', marginBottom: '4px' }} />
                  <div className="podium-card">
                    {/* Avatar — absolutely inside card at top center */}
                    <div style={{ position: 'absolute', top: '8px', left: '50%', transform: 'translateX(-50%)', zIndex: 2 }}>
                      <div style={{ position: 'relative', display: 'inline-block' }}>
                        <img
                          src={thirdPlace.photoURL || defaultAvatar(thirdPlace.displayName, 52)}
                          alt="3rd Place"
                          className="podium-avatar"
                        />
                        {thirdPlace.appliedBadgeUrl && (
                          <span className="badge-sweep-wrap" style={{ position: 'absolute', bottom: '-4px', right: '-4px', width: '18px', height: '18px' }}>
                            <img src={thirdPlace.appliedBadgeUrl} alt="Badge" style={{ width: '18px', height: '18px' }} />
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="podium-name marquee-hover">
                      <span>{thirdPlace.displayName}</span>
                    </div>
                    <div className="podium-earnings">₹{thirdPlace.leaderboardDisplayEarnings.toLocaleString('en-IN')}</div>
                  </div>
                </div>
              ) : (
                <div className="podium-column podium-3rd opacity-25">
                  <div className="podium-card"><div className="podium-name">-</div><div className="podium-earnings">₹0</div></div>
                </div>
              )}
            </div>
          )}

          {/* ── Remaining Players List ── */}
          <div className="leaderboard-list mt-3">
            {listPlayers.length > 0 ? (
              listPlayers.map(user => {
                const photoURL = user.photoURL || defaultAvatar(user.displayName);

                return (
                  <div className="leaderboard-item leaderboard-item-custom" key={user.uid}>
                    {/* Rank */}
                    <div className="leaderboard-rank" style={{ color: '#FFFFFF', fontWeight: 700, width: '38px', textAlign: 'center' }}>
                      #{user.leaderboardRank}
                    </div>

                    {/* Avatar with badge overlay - Added margins for clean gaps */}
                    <div style={{ position: 'relative', display: 'inline-block', width: '48px', height: '48px', flexShrink: 0, marginLeft: '12px', marginRight: '16px' }}>
                      <img 
                        src={photoURL} 
                        alt={user.displayName} 
                        className="w-100 h-100 object-fit-cover" 
                        style={{ borderRadius: '0px', border: '1.5px solid rgba(255,255,255,0.06)' }}
                      />
                      {user.appliedBadgeUrl && (
                        <span className="badge-sweep-wrap" style={{ position: 'absolute', bottom: '-5px', right: '-5px', zIndex: 5, width: '19px', height: '19px', borderRadius: '50%', overflow: 'hidden' }}>
                          <img src={user.appliedBadgeUrl} alt="Badge" className="w-100 h-100 object-fit-contain" />
                        </span>
                      )}
                    </div>

                    {/* Stacked name and amount */}
                    <div className="leaderboard-user-info" style={{ display: 'flex', flexDirection: 'column', gap: '2px', overflow: 'hidden' }}>
                      <div className="leaderboard-name marquee-hover" style={{ color: '#FACC15', fontWeight: 600, fontSize: '0.78rem' }}>
                        <span>{user.displayName}</span>
                      </div>
                      <div style={{ color: '#FFFFFF', fontWeight: 800, fontSize: '0.92rem', opacity: 0.98 }}>
                        ₹{user.leaderboardDisplayEarnings.toLocaleString('en-IN')}
                      </div>
                    </div>
                  </div>
                );
              })
            ) : list.length <= 3 ? (
              <p className="text-secondary text-center py-4 bg-dark-subtle bg-opacity-25 rounded-3 border border-secondary border-opacity-10">Showcase players loaded on the stage.</p>
            ) : (
              <p className="text-secondary text-center py-4 bg-dark-subtle rounded-3">Leaderboard is empty.</p>
            )}
          </div>
        </>
      )}
    </section>
  );
};

export default Leaderboard;
