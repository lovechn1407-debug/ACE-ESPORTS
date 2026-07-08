import React, { useEffect, useState } from 'react';
import { ref, get } from 'firebase/database';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';

interface EarningsProps {
  onBack?: () => void;
}

const Earnings: React.FC<EarningsProps> = ({ onBack }) => {
  const { currentUser, userProfile } = useAuth();
  const [matchEarnings, setMatchEarnings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchEarningsHistory = async () => {
      if (!currentUser) return;
      try {
        const transRef = ref(db, `transactions/${currentUser.uid}`);
        const snapshot = await get(transRef);
        if (snapshot.exists()) {
          const data = snapshot.val();
          const list = Object.entries(data)
            .map(([id, val]: any) => ({
              id,
              ...val
            }))
            .filter((tx: any) => tx.type === 'tournament_winnings');
          
          list.sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0));
          setMatchEarnings(list);
        } else {
          setMatchEarnings([]);
        }
      } catch (err) {
        console.error('Error fetching earnings history:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchEarningsHistory();
  }, [currentUser]);

  const parseMatchWinning = (desc: string) => {
    let matchName = 'Tournament Match';
    let performance = '';

    const matchParts = desc.match(/Winnings:\s*(.*?)\s*in\s*(.*)$/i);
    if (matchParts) {
      performance = matchParts[1].trim();
      matchName = matchParts[2].trim();
    } else {
      matchName = desc.replace('Winnings:', '').trim();
    }
    return { matchName, performance };
  };

  return (
    <section className="section py-3 text-start">
      {onBack && (
        <div className="d-flex align-items-center gap-3 mb-3">
          <button className="btn btn-sm btn-link text-white p-0" onClick={onBack}>
            <i className="bi bi-arrow-left fs-4"></i>
          </button>
          <h2 className="section-title m-0">Earnings Summary</h2>
        </div>
      )}
      {!onBack && <h2 className="section-title"><i className="bi bi-award-fill text-accent me-2"></i>Earnings Summary</h2>}

      <div style={{
        background: 'linear-gradient(135deg, rgba(250, 204, 21, 0.08) 0%, rgba(250, 204, 21, 0.02) 100%)',
        border: '1px solid rgba(250, 204, 21, 0.15)',
        borderRadius: '10px',
        padding: '16px',
        marginBottom: '20px'
      }}>
        <div className="row text-center">
          <div className="col-6 border-end border-secondary border-opacity-20">
            <span className="text-secondary small d-block mb-1">Total Winnings</span>
            <h3 className="fw-bold m-0" style={{ color: 'var(--accent-color)' }}>
              ₹{userProfile?.totalEarnings != null ? userProfile.totalEarnings.toFixed(2) : '0.00'}
            </h3>
          </div>
          <div className="col-6">
            <span className="text-secondary small d-block mb-1">Referral Rewards</span>
            <h3 className="text-success fw-bold m-0">
              ₹{userProfile?.referralEarnings != null ? userProfile.referralEarnings.toFixed(2) : '0.00'}
            </h3>
          </div>
        </div>
      </div>

      <h3 className="section-title mb-3" style={{ fontSize: '0.86rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <i className="bi bi-controller text-info"></i> Match Winnings History
      </h3>

      {loading ? (
        <div className="placeholder-glow py-4 rounded-3" style={{ height: '140px' }}></div>
      ) : matchEarnings.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {matchEarnings.map((tx) => {
            const { matchName, performance } = parseMatchWinning(tx.description || '');
            const dateStr = tx.timestamp 
              ? new Date(tx.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) 
              : 'N/A';

            return (
              <div
                key={tx.id}
                style={{
                  background: 'rgba(255, 255, 255, 0.015)',
                  border: '1px solid rgba(255, 255, 255, 0.04)',
                  borderRadius: '8px',
                  padding: '12px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px'
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#E2E8F0', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                    {matchName}
                  </div>
                  {performance && (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(59, 130, 246, 0.06)', border: '1px solid rgba(59, 130, 246, 0.15)', borderRadius: '3px', padding: '1px 6px', fontSize: '0.66rem', color: '#60A5FA', marginTop: '4px' }}>
                      <i className="bi bi-lightning-fill" style={{ fontSize: '0.6rem' }}></i> {performance}
                    </div>
                  )}
                  <div style={{ fontSize: '0.64rem', color: '#64748B', marginTop: '4px' }}>
                    {dateStr}
                  </div>
                </div>

                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <strong style={{ fontSize: '0.92rem', color: '#4ADE80' }}>
                    +₹{Math.abs(tx.amount).toFixed(0)}
                  </strong>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-5 text-secondary custom-card">
          <i className="bi bi-trophy fs-2 d-block mb-2" style={{ color: 'var(--accent-color)' }}></i>
          No match earnings or prizes won yet. Join matches to start earning!
        </div>
      )}
    </section>
  );
};

export default Earnings;
