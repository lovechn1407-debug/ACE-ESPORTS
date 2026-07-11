import React, { useEffect, useState, useRef } from 'react';
import { ref, get } from 'firebase/database';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay, EffectFade } from 'swiper/modules';
import type { Swiper as SwiperType } from 'swiper';

// Import Swiper styles
import 'swiper/css';
import 'swiper/css/effect-fade';

interface Promotion {
  id: string;
  imageUrl: string;
  link?: string;
}

interface Game {
  id: string;
  name: string;
  imageUrl: string;
  order?: number;
  category?: 'battle' | 'arcade' | 'casual'; // internal mock sorting category
}

interface Tournament {
  id: string;
  name: string;
  gameId: string;
  mode: string;
  map?: string;
  entryFee: number;
  perKillPrize: number;
  prizePool: number;
  startTime: number;
  status: 'upcoming' | 'ongoing' | 'completed' | 'result' | 'cancelled';
  bannerUrl?: string;
  maxPlayers?: number;
  registeredPlayers?: Record<string, any>;
  showIdPass?: boolean;
}

interface HomeProps {
  onSelectGame: (gameId: string, gameName: string) => void;
  onViewTournamentDetails: (tournamentId: string, gameId: string, gameName: string) => void;
  onOpenChat: (tournamentId: string, tournamentName: string) => void;
  onOpenPlayers: (tournamentId: string, tournamentName: string, gameId: string, gameName: string) => void;
  onOpenIdPass: (tournamentId: string, gameId: string, gameName: string) => void;
  onNavigateTab: (tab: 'home' | 'wallet' | 'leaderboard' | 'earnings' | 'profile' | 'earningZone') => void;
}

const Home: React.FC<HomeProps> = ({ 
  onSelectGame, 
  onViewTournamentDetails,
  onOpenChat,
  onOpenPlayers,
  onOpenIdPass,
  onNavigateTab
}) => {
  const { userProfile } = useAuth();
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [myContests, setMyContests] = useState<Tournament[]>([]);
  const [loadingPromos, setLoadingPromos] = useState(true);
  const [loadingGames, setLoadingGames] = useState(true);
  const [loadingContests, setLoadingContests] = useState(true);
  const swiperRef = useRef<SwiperType | null>(null);

  // Filter category tab
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'battle' | 'arcade' | 'casual'>('all');

  // Fetch Promotions
  useEffect(() => {
    const fetchPromos = async () => {
      try {
        const promoRef = ref(db, 'promotions');
        const snapshot = await get(promoRef);
        if (snapshot.exists()) {
          const promoData = snapshot.val();
          const list = Object.entries(promoData).map(([id, val]: any) => ({
            id,
            ...val
          })).filter(p => p.imageUrl);
          setPromotions(list);
        }
      } catch (err) {
        console.error('Error loading promotions:', err);
      } finally {
        setLoadingPromos(false);
      }
    };
    fetchPromos();
  }, []);

  // Fetch Games and auto-assign mock categories for classification filtering
  useEffect(() => {
    const fetchGames = async () => {
      try {
        const gamesRef = ref(db, 'games');
        const snapshot = await get(gamesRef);
        if (snapshot.exists()) {
          const gamesData = snapshot.val();
          const list = Object.entries(gamesData).map(([id, val]: any) => {
            const nameLower = (val.name || '').toLowerCase();
            let category: 'battle' | 'arcade' | 'casual' = 'arcade';
            if (nameLower.includes('fire') || nameLower.includes('pubg') || nameLower.includes('bgmi') || nameLower.includes('cod') || nameLower.includes('clash') || nameLower.includes('freefire')) {
              category = 'battle';
            } else if (nameLower.includes('ludo') || nameLower.includes('carrom') || nameLower.includes('chess')) {
              category = 'casual';
            }
            return {
              id,
              category,
              ...val
            } as Game;
          }).sort((a, b) => (a.order || 0) - (b.order || 0));
          setGames(list);
        }
      } catch (err) {
        console.error('Error loading games:', err);
      } finally {
        setLoadingGames(false);
      }
    };
    fetchGames();
  }, []);

  // Fetch Joined Contests
  useEffect(() => {
    const fetchMyContests = async () => {
      if (!userProfile?.joinedTournaments) {
        setMyContests([]);
        setLoadingContests(false);
        return;
      }
      try {
        const joinedIds = Object.keys(userProfile.joinedTournaments);
        const promises = joinedIds.map(id => get(ref(db, `tournaments/${id}`)));
        const snaps = await Promise.all(promises);
        
        const list: Tournament[] = snaps
          .map((snap, idx) => {
            if (snap.exists()) {
              return { id: joinedIds[idx], ...snap.val() } as Tournament;
            }
            return null;
          })
          .filter((t): t is Tournament => t !== null && (t.status === 'upcoming' || t.status === 'ongoing'));
        
        list.sort((a, b) => a.startTime - b.startTime);
        setMyContests(list);
      } catch (err) {
        console.error('Error loading joined contests:', err);
      } finally {
        setLoadingContests(false);
      }
    };
    fetchMyContests();
  }, [userProfile]);

  const getTimeRemaining = (startTime: number) => {
    const diff = startTime - Date.now();
    if (diff <= 0) return 'LIVE NOW';
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    let out = '';
    if (days > 0) out += `${days}d `;
    if (hours > 0 || days > 0) out += `${hours}h `;
    out += `${minutes}m`;
    return out.trim();
  };

  const filteredGames = games.filter(g => selectedCategory === 'all' || g.category === selectedCategory);

  return (
    <section className="section py-3 text-start">
      
      {/* ── Floating Promotion Swiper Card Stack ── */}
      {loadingPromos ? (
        <div className="promo-slider-skeleton mb-4" style={{ height: '140px' }}></div>
      ) : (
        promotions.length > 0 && (
          <div className="promo-slider-outer mb-4">
            <div className="promo-slider-wrapper">
              <Swiper
                modules={[Autoplay, EffectFade]}
                effect="fade"
                autoplay={{ delay: 4000, disableOnInteraction: false, pauseOnMouseEnter: true }}
                loop={promotions.length > 1}
                slidesPerView={1}
                speed={700}
                onSwiper={(swiper) => { swiperRef.current = swiper; }}
              >
                {promotions.map((promo, idx) => (
                  <SwiperSlide key={promo.id}>
                    <div className="promo-slide-inner rounded-2 overflow-hidden" style={{ aspectRatio: '21 / 9' }}>
                      {promo.link ? (
                        <a href={promo.link} target="_blank" rel="noopener noreferrer" className="d-block w-100 h-100">
                          <img src={promo.imageUrl} alt="Promo" className="promo-slide-img" />
                        </a>
                      ) : (
                        <img src={promo.imageUrl} alt="Promo" className="promo-slide-img" />
                      )}
                      <div className="promo-slide-overlay"></div>
                      <div className="promo-slide-counter" style={{ background: 'rgba(0,0,0,0.5)', top: '10px', right: '10px' }}>
                        {idx + 1} / {promotions.length}
                      </div>
                    </div>
                  </SwiperSlide>
                ))}
              </Swiper>
            </div>
          </div>
        )
      )}

      {/* ── Command Action Grid (4 Colored Cards) ── */}
      <div className="command-actions-grid mb-4">
        <div className="action-grid-card border-purple" onClick={() => onNavigateTab('earningZone')}>
          <div className="card-glare"></div>
          <div className="action-card-header text-purple">
            <i className="bi bi-compass"></i>
          </div>
          <div className="action-card-body">
            <h6 className="action-card-title text-white">Daily Draw</h6>
            <p className="action-card-desc">Spin &amp; win cash reward</p>
          </div>
          <span className="badge-new-neon">FREE</span>
        </div>

        <div className="action-grid-card border-green" onClick={() => onNavigateTab('wallet')}>
          <div className="card-glare"></div>
          <div className="action-card-header text-green">
            <i className="bi bi-wallet2"></i>
          </div>
          <div className="action-card-body">
            <h6 className="action-card-title text-white">Deposit</h6>
            <p className="action-card-desc">Add money to wallet</p>
          </div>
        </div>

        <div className="action-grid-card border-blue" onClick={() => onNavigateTab('leaderboard')}>
          <div className="card-glare"></div>
          <div className="action-card-header text-blue">
            <i className="bi bi-trophy"></i>
          </div>
          <div className="action-card-body">
            <h6 className="action-card-title text-white">Hall of Fame</h6>
            <p className="action-card-desc">Top earner ranking</p>
          </div>
        </div>

        <div className="action-grid-card border-orange" onClick={() => onNavigateTab('profile')}>
          <div className="card-glare"></div>
          <div className="action-card-header text-orange">
            <i className="bi bi-people"></i>
          </div>
          <div className="action-card-body">
            <h6 className="action-card-title text-white">Referrals</h6>
            <p className="action-card-desc">Earn ₹5 per friend</p>
          </div>
        </div>
      </div>

      {/* ── Ticket-Style My Matches (Horizontal Scroller) ── */}
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h2 className="section-title m-0"><i className="bi bi-controller text-accent me-2"></i>My Battles</h2>
        <span className="badge bg-secondary bg-opacity-25 border border-secondary border-opacity-20 px-2.5 py-1 text-xs">{myContests.length} ACTIVE</span>
      </div>

      {loadingContests ? (
        <div className="placeholder-glow py-4 rounded-3 mb-4" style={{ height: '140px' }}></div>
      ) : myContests.length === 0 ? (
        <div className="card custom-card p-4 text-center mb-4 text-secondary">
          <i className="bi bi-controller fs-2 d-block mb-2 opacity-50"></i>
          You have no active or joined tournament battles.
        </div>
      ) : (
        <div className="my-battles-horizontal-scroller mb-4">
          {myContests.map(t => {
            const regCount = t.registeredPlayers 
              ? Object.keys(t.registeredPlayers).length
              : 0;
            const maxP = t.maxPlayers || 0;
            const spotsL = maxP > 0 ? Math.max(0, maxP - regCount) : Infinity;
            const showIdBtn = t.status === 'ongoing' || 
              (t.status === 'upcoming' && t.showIdPass && Date.now() > t.startTime - 900000);

            // Resolve game name
            const gameObj = games.find(g => g.id === t.gameId);
            const gameName = gameObj ? gameObj.name : 'Tournament';

            let timerTxt = t.status?.toUpperCase() || 'N/A';
            let isLive = false;
            if (t.status === 'upcoming') timerTxt = getTimeRemaining(t.startTime);
            else if (t.status === 'ongoing') {
              timerTxt = 'LIVE';
              isLive = true;
            } else if (t.status === 'completed' || t.status === 'result') timerTxt = 'ENDED';

            const bannerUrl = t.bannerUrl || 'https://via.placeholder.com/400x225/1E293B/94A3B8?text=Match';

            return (
              <div className="ticket-match-card" key={t.id}>
                {/* Image side wrapper (maintains aspect ratio) */}
                <div className="ticket-banner-section">
                  <img src={bannerUrl} alt="Banner" className="ticket-banner-image" />
                  <div className="ticket-banner-overlay"></div>
                  {isLive ? (
                    <span className="ticket-badge-live">LIVE</span>
                  ) : (
                    <span className="ticket-badge-time"><i className="bi bi-clock-fill me-1"></i> {timerTxt}</span>
                  )}
                  <span className="ticket-joined-stamp"><i className="bi bi-check-circle-fill"></i> JOINED</span>
                </div>

                {/* Content side */}
                <div className="ticket-info-section">
                  <div className="ticket-tags mb-1">
                    {t.mode && <span className="ticket-mode-tag">{t.mode}</span>}
                    {t.map && <span className="ticket-mode-tag">{t.map}</span>}
                  </div>
                  <h5 className="ticket-title text-truncate text-white mb-2" title={t.name}>{t.name}</h5>
                  
                  {/* Stats Grid */}
                  <div className="ticket-stats-grid mb-2">
                    <div>
                      <small className="label">Pool</small>
                      <strong className="value text-accent">₹{t.prizePool}</strong>
                    </div>
                    <div>
                      <small className="label">Per Kill</small>
                      <strong className="value text-light">₹{t.perKillPrize}</strong>
                    </div>
                    <div>
                      <small className="label">Entry</small>
                      <strong className="value text-info">{t.entryFee > 0 ? `₹${t.entryFee}` : 'Free'}</strong>
                    </div>
                  </div>

                  {/* Spots indicator */}
                  {maxP > 0 && (
                    <div className="ticket-spots mb-3">
                      <div className="progress ticket-progress-bar">
                        <div className="progress-bar" style={{ width: `${(regCount / maxP) * 100}%` }}></div>
                      </div>
                      <span className="spots-left">{spotsL} spots left</span>
                    </div>
                  )}

                  {/* Actions Grid */}
                  <div className="d-flex gap-2">
                    <button className="btn btn-xs btn-outline-secondary py-1 px-2 text-xs flex-grow-1" onClick={() => onViewTournamentDetails(t.id, t.gameId, gameName)}>
                      Rules
                    </button>
                    <button className="btn btn-xs btn-primary py-1 px-2 text-xs flex-grow-1" onClick={() => onOpenPlayers(t.id, t.name, t.gameId, gameName)}>
                      Players
                    </button>
                    <button className="btn btn-xs btn-outline-warning py-1 px-1.5 text-xs" onClick={() => onOpenChat(t.id, t.name)} title="Chat">
                      <i className="bi bi-chat-dots-fill"></i>
                    </button>
                  </div>

                  {showIdBtn && (
                    <button className="btn btn-xs btn-warning w-100 mt-2 py-1 text-xs fw-bold" onClick={() => onOpenIdPass(t.id, t.gameId, gameName)}>
                      <i className="bi bi-key-fill me-1"></i> ID &amp; Password
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Games explorer with classification Category Filters ── */}
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h2 className="section-title m-0"><i className="bi bi-grid-fill text-accent me-2"></i>Esport Arenas</h2>
        
        {/* Category Pills Scroller */}
        <div className="category-filter-pills-row">
          {[
            { id: 'all', label: 'All' },
            { id: 'battle', label: 'Squad' },
            { id: 'casual', label: 'Casual' },
            { id: 'arcade', label: 'Arcade' }
          ].map(cat => (
            <button 
              key={cat.id} 
              className={`cat-pill ${selectedCategory === cat.id ? 'active' : ''}`}
              onClick={() => setSelectedCategory(cat.id as any)}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {loadingGames ? (
        <div className="row g-3 mb-4">
          <div className="col-6"><div className="game-card placeholder-glow" style={{ height: '140px' }}></div></div>
          <div className="col-6"><div className="game-card placeholder-glow" style={{ height: '140px' }}></div></div>
        </div>
      ) : (
        <div className="row g-3 mb-4">
          {filteredGames.length > 0 ? (
            filteredGames.map(game => (
              <div className="col-6" key={game.id}>
                <div 
                  className="premium-game-deck-card" 
                  onClick={() => onSelectGame(game.id, game.name)}
                >
                  <div className="game-deck-img-wrapper">
                    <img src={game.imageUrl} alt={game.name} className="game-deck-img" />
                    
                    {/* Hover Play Button Glow Overlay */}
                    <div className="game-deck-hover-overlay">
                      <div className="play-button-circle">
                        <i className="bi bi-play-fill"></i>
                      </div>
                    </div>
                  </div>
                  <div className="game-deck-info">
                    <span className="game-deck-title">{game.name}</span>
                    <span className="game-deck-subtitle">{game.category?.toUpperCase() || 'ARENA'}</span>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <p className="text-secondary text-center col-12 py-4">No matching esport arenas available.</p>
          )}
        </div>
      )}
    </section>
  );
};

export default Home;
