import React, { useEffect, useState } from 'react';
import { ref, onValue } from 'firebase/database';
import { db } from '../../firebase';

const TABS = [
  { id: 'staff', label: 'Staff Activity', icon: 'bi-person-gear' },
  { id: 'login', label: 'Login History', icon: 'bi-door-open-fill' },
  { id: 'transactions', label: 'All Transactions', icon: 'bi-arrow-left-right' },
  { id: 'withdrawals', label: 'Withdrawals', icon: 'bi-cash-stack' },
  { id: 'deposits', label: 'Deposits', icon: 'bi-credit-card-fill' },
  { id: 'disputes', label: 'Match Disputes', icon: 'bi-exclamation-triangle-fill' },
];

const TYPE_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  approve_deposit:    { color: '#4ADE80', bg: 'rgba(74,222,128,0.12)', label: 'Deposit Approved' },
  reject_deposit:     { color: '#F87171', bg: 'rgba(248,113,113,0.12)', label: 'Deposit Rejected' },
  approve_withdrawal: { color: '#34D399', bg: 'rgba(52,211,153,0.12)', label: 'Withdrawal Approved' },
  reject_withdrawal:  { color: '#F87171', bg: 'rgba(248,113,113,0.12)', label: 'Withdrawal Rejected' },
  credit_winnings:    { color: '#FACC15', bg: 'rgba(250,204,21,0.12)', label: 'Winnings Credited' },
  refund_match:       { color: '#FB923C', bg: 'rgba(251,146,60,0.12)', label: 'Match Refunded' },
  resolve_dispute:    { color: '#A78BFA', bg: 'rgba(167,139,250,0.12)', label: 'Dispute Resolved' },
  refund_dispute:     { color: '#F97316', bg: 'rgba(249,115,22,0.12)', label: 'Dispute Refund' },
  login:              { color: '#38BDF8', bg: 'rgba(56,189,248,0.12)', label: 'Login' },
  tournament_winnings:{ color: '#FACC15', bg: 'rgba(250,204,21,0.12)', label: 'Tournament Win' },
  deposit:            { color: '#4ADE80', bg: 'rgba(74,222,128,0.12)', label: 'Deposit' },
  refund:             { color: '#FB923C', bg: 'rgba(251,146,60,0.12)', label: 'Refund' },
  winnings_deducted:  { color: '#F87171', bg: 'rgba(248,113,113,0.12)', label: 'Winnings Deducted' },
  mission_reward:     { color: '#A78BFA', bg: 'rgba(167,139,250,0.12)', label: 'Mission Reward' },
  withdraw_failed_refund: { color: '#FB923C', bg: 'rgba(251,146,60,0.12)', label: 'Withdrawal Refund' },
  tournament_join:    { color: '#38BDF8', bg: 'rgba(56,189,248,0.12)', label: 'Tournament Join' },
  earning_zone_milestone_win: { color: '#FACC15', bg: 'rgba(250,204,21,0.12)', label: 'Milestone Win' },
};

function TypeBadge({ type }: { type: string }) {
  const cfg = TYPE_CONFIG[type] || { color: '#94A3B8', bg: 'rgba(148,163,184,0.12)', label: type };
  return (
    <span style={{
      padding: '3px 10px',
      borderRadius: '20px',
      fontSize: '0.68rem',
      fontWeight: 700,
      background: cfg.bg,
      color: cfg.color,
      border: `1px solid ${cfg.color}33`,
      whiteSpace: 'nowrap'
    }}>
      {cfg.label}
    </span>
  );
}

function fmtTime(ts: number) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
  });
}

function AmountCell({ amount }: { amount?: number }) {
  if (amount === undefined || amount === null) return <span className="text-secondary">—</span>;
  const isPos = amount >= 0;
  return (
    <span style={{ color: isPos ? '#4ADE80' : '#F87171', fontWeight: 700, fontFamily: 'monospace' }}>
      {isPos ? '+' : ''}₹{Math.abs(amount).toFixed(2)}
    </span>
  );
}

const AdminLogs: React.FC = () => {
  const [activeTab, setActiveTab] = useState('staff');
  const [search, setSearch] = useState('');

  // --- Staff Activity Logs ---
  const [staffLogs, setStaffLogs] = useState<any[]>([]);

  // --- Login Logs ---
  const [loginLogs, setLoginLogs] = useState<any[]>([]);

  // --- All Transactions (aggregated across users) ---
  const [transactions, setTransactions] = useState<any[]>([]);

  // --- Withdrawals ---
  const [withdrawals, setWithdrawals] = useState<any[]>([]);

  // --- Deposits ---
  const [deposits, setDeposits] = useState<any[]>([]);

  // --- Disputes ---
  const [disputes, setDisputeLogs] = useState<any[]>([]);

  useEffect(() => {
    const unsubs: (() => void)[] = [];

    // Staff Activity
    unsubs.push(onValue(ref(db, 'adminLogs'), (snap) => {
      if (!snap.exists()) { setStaffLogs([]); return; }
      const arr = Object.entries(snap.val()).map(([id, v]: any) => ({ id, ...v }));
      arr.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      setStaffLogs(arr);
    }));

    // Login Logs
    unsubs.push(onValue(ref(db, 'adminLoginLogs'), (snap) => {
      if (!snap.exists()) { setLoginLogs([]); return; }
      const arr = Object.entries(snap.val()).map(([id, v]: any) => ({ id, ...v }));
      arr.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      setLoginLogs(arr);
    }));

    // Transactions — flatten across all user tx nodes
    unsubs.push(onValue(ref(db, 'transactions'), (snap) => {
      if (!snap.exists()) { setTransactions([]); return; }
      const all: any[] = [];
      snap.forEach((userSnap) => {
        const uid = userSnap.key;
        userSnap.forEach((txSnap) => {
          all.push({ id: txSnap.key, uid, ...txSnap.val() });
        });
      });
      all.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      setTransactions(all);
    }));

    // Withdrawals
    unsubs.push(onValue(ref(db, 'withdrawals'), (snap) => {
      if (!snap.exists()) { setWithdrawals([]); return; }
      const arr = Object.entries(snap.val()).map(([id, v]: any) => ({ id, ...v }));
      arr.sort((a, b) => (b.requestTimestamp || 0) - (a.requestTimestamp || 0));
      setWithdrawals(arr);
    }));

    // Deposits
    unsubs.push(onValue(ref(db, 'deposits'), (snap) => {
      if (!snap.exists()) { setDeposits([]); return; }
      const arr = Object.entries(snap.val()).map(([id, v]: any) => ({ id, ...v }));
      arr.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      setDeposits(arr);
    }));

    // Disputes — flatten from reports/{tournamentId}/{accusedUid}
    unsubs.push(onValue(ref(db, 'reports'), (snap) => {
      if (!snap.exists()) { setDisputeLogs([]); return; }
      const all: any[] = [];
      snap.forEach((tSnap) => {
        const tournamentId = tSnap.key;
        tSnap.forEach((accusedSnap) => {
          all.push({ id: `${tournamentId}_${accusedSnap.key}`, tournamentId, accusedUid: accusedSnap.key, ...accusedSnap.val() });
        });
      });
      all.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      setDisputeLogs(all);
    }));

    return () => unsubs.forEach(u => u());
  }, []);

  const q = search.trim().toLowerCase();

  const filteredStaff = staffLogs.filter(l =>
    !q || (l.actor || '').toLowerCase().includes(q) || (l.description || '').toLowerCase().includes(q) || (l.event || '').toLowerCase().includes(q)
  );

  const filteredLogin = loginLogs.filter(l =>
    !q || (l.actor || '').toLowerCase().includes(q) || (l.actorType || '').toLowerCase().includes(q)
  );

  const filteredTx = transactions.filter(l =>
    !q || (l.uid || '').toLowerCase().includes(q) || (l.description || '').toLowerCase().includes(q) || (l.type || '').toLowerCase().includes(q)
  );

  const filteredWithdrawals = withdrawals.filter(l =>
    !q || (l.userName || '').toLowerCase().includes(q) || (l.userEmail || '').toLowerCase().includes(q) || (l.status || '').toLowerCase().includes(q)
  );

  const filteredDeposits = deposits.filter(l =>
    !q || (l.userName || '').toLowerCase().includes(q) || (l.userEmail || '').toLowerCase().includes(q) || (l.utr || '').toLowerCase().includes(q) || (l.status || '').toLowerCase().includes(q)
  );

  const filteredDisputes = disputes.filter(l =>
    !q || (l.tournamentId || '').toLowerCase().includes(q) || (l.accusedUid || '').toLowerCase().includes(q) || (l.status || '').toLowerCase().includes(q)
  );

  const tabCounts: Record<string, number> = {
    staff: staffLogs.length,
    login: loginLogs.length,
    transactions: transactions.length,
    withdrawals: withdrawals.length,
    deposits: deposits.length,
    disputes: disputes.length,
  };

  return (
    <div className="admin-logs-view text-start" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <style>{`
        .log-table { width: 100%; border-collapse: collapse; }
        .log-table th { 
          background: rgba(255,255,255,0.03);
          color: #64748B;
          font-size: 0.65rem;
          font-weight: 700;
          letter-spacing: 0.07em;
          padding: 10px 14px;
          text-transform: uppercase;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          white-space: nowrap;
        }
        .log-table td {
          padding: 10px 14px;
          font-size: 0.78rem;
          color: #CBD5E1;
          border-bottom: 1px solid rgba(255,255,255,0.04);
          vertical-align: middle;
        }
        .log-table tr:hover td { background: rgba(255,255,255,0.02); }
        .log-row-critical td { border-left: 3px solid #EF4444; }
        .logs-tab-btn {
          background: transparent;
          border: none;
          color: #64748B;
          padding: 8px 14px;
          border-radius: 8px;
          font-size: 0.78rem;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
          transition: all 0.15s;
          white-space: nowrap;
        }
        .logs-tab-btn:hover { background: rgba(255,255,255,0.04); color: #E2E8F0; }
        .logs-tab-btn.active { background: rgba(250,204,21,0.1); color: #FACC15; }
        .status-badge {
          padding: 2px 9px;
          border-radius: 12px;
          font-size: 0.65rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .log-search {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 8px;
          color: #E2E8F0;
          padding: 8px 14px 8px 36px;
          font-size: 0.82rem;
          width: 100%;
          max-width: 320px;
          outline: none;
          transition: border 0.2s;
        }
        .log-search:focus { border-color: rgba(250,204,21,0.4); }
        .log-search::placeholder { color: #475569; }
        .empty-state {
          text-align: center;
          padding: 60px 20px;
          color: #475569;
          font-size: 0.85rem;
        }
      `}</style>

      {/* Header */}
      <div className="d-flex align-items-center justify-content-between mb-4 flex-wrap gap-3">
        <div>
          <h2 className="fw-bold m-0 d-flex align-items-center gap-2">
            <i className="bi bi-clipboard2-data-fill text-warning"></i> Audit Logs
          </h2>
          <p className="text-secondary small m-0 mt-1">Complete audit trail of all system events, transactions, and staff actions</p>
        </div>
        <div className="position-relative">
          <i className="bi bi-search position-absolute" style={{ left: 12, top: '50%', transform: 'translateY(-50%)', color: '#475569', fontSize: '0.8rem' }}></i>
          <input
            className="log-search"
            placeholder="Search logs..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="d-flex gap-1 mb-4 flex-wrap" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '4px' }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`logs-tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <i className={`bi ${tab.icon}`}></i>
            {tab.label}
            <span style={{
              marginLeft: 2,
              background: activeTab === tab.id ? 'rgba(250,204,21,0.2)' : 'rgba(255,255,255,0.06)',
              color: activeTab === tab.id ? '#FACC15' : '#64748B',
              borderRadius: '10px',
              padding: '1px 7px',
              fontSize: '0.62rem',
              fontWeight: 800
            }}>
              {tabCounts[tab.id]}
            </span>
          </button>
        ))}
      </div>

      {/* Staff Activity */}
      {activeTab === 'staff' && (
        <div>
          <div style={{ background: 'rgba(250,204,21,0.06)', border: '1px solid rgba(250,204,21,0.15)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: '0.76rem', color: '#FACC15' }}>
            <i className="bi bi-info-circle-fill me-2"></i>
            This table records all major admin and staff actions — approvals, rejections, refunds, winnings credits, and dispute resolutions.
          </div>
          {filteredStaff.length === 0 ? (
            <div className="empty-state">
              <i className="bi bi-journal-x" style={{ fontSize: '2rem', display: 'block', marginBottom: 8 }}></i>
              No staff activity logs yet.
              <br /><span style={{ fontSize: '0.72rem' }}>Actions like approving deposits, crediting winnings, etc. will appear here.</span>
            </div>
          ) : (
            <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)' }}>
              <table className="log-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Actor</th>
                    <th>Role</th>
                    <th>Event</th>
                    <th>Description</th>
                    <th>Target</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStaff.map(log => (
                    <tr key={log.id} className={log.critical ? 'log-row-critical' : ''}>
                      <td style={{ color: '#64748B', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>{fmtTime(log.timestamp)}</td>
                      <td>
                        <span style={{ fontWeight: 700, color: '#E2E8F0' }}>
                          {log.actorType === 'staff' ? (
                            <><i className="bi bi-person-badge-fill text-info me-1"></i>@{log.actor}</>
                          ) : (
                            <><i className="bi bi-shield-fill-check text-warning me-1"></i>{log.actor || 'Admin'}</>
                          )}
                        </span>
                      </td>
                      <td>
                        <span className="status-badge" style={{
                          background: log.actorType === 'staff' ? 'rgba(56,189,248,0.12)' : 'rgba(250,204,21,0.12)',
                          color: log.actorType === 'staff' ? '#38BDF8' : '#FACC15'
                        }}>
                          {log.actorType || 'admin'}
                        </span>
                      </td>
                      <td><TypeBadge type={log.event || log.type || ''} /></td>
                      <td style={{ maxWidth: 260 }}>
                        {log.critical && <i className="bi bi-exclamation-triangle-fill text-danger me-1" style={{ fontSize: '0.7rem' }}></i>}
                        {log.description || '—'}
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: '#94A3B8' }}>{log.targetUser || log.tournamentId || '—'}</td>
                      <td><AmountCell amount={log.amount} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Login History */}
      {activeTab === 'login' && (
        <div>
          {filteredLogin.length === 0 ? (
            <div className="empty-state">
              <i className="bi bi-door-open" style={{ fontSize: '2rem', display: 'block', marginBottom: 8 }}></i>
              No login records found.
            </div>
          ) : (
            <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)' }}>
              <table className="log-table">
                <thead>
                  <tr>
                    <th>Login Time</th>
                    <th>Actor</th>
                    <th>Role</th>
                    <th>Event</th>
                    <th>Browser / Device</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogin.map(log => (
                    <tr key={log.id}>
                      <td style={{ color: '#64748B', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>{fmtTime(log.timestamp)}</td>
                      <td>
                        <span style={{ fontWeight: 700, color: '#E2E8F0' }}>
                          {log.actorType === 'staff' ? (
                            <><i className="bi bi-person-badge-fill text-info me-1"></i>@{log.actor}</>
                          ) : (
                            <><i className="bi bi-shield-fill-check text-warning me-1"></i>{log.actor || 'Admin'}</>
                          )}
                        </span>
                      </td>
                      <td>
                        <span className="status-badge" style={{
                          background: log.actorType === 'staff' ? 'rgba(56,189,248,0.12)' : 'rgba(250,204,21,0.12)',
                          color: log.actorType === 'staff' ? '#38BDF8' : '#FACC15'
                        }}>
                          {log.actorType || 'admin'}
                        </span>
                      </td>
                      <td><TypeBadge type="login" /></td>
                      <td style={{ fontSize: '0.7rem', color: '#64748B', maxWidth: 220 }}>{log.userAgent ? log.userAgent.slice(0, 80) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* All Transactions */}
      {activeTab === 'transactions' && (
        <div>
          {filteredTx.length === 0 ? (
            <div className="empty-state">
              <i className="bi bi-receipt" style={{ fontSize: '2rem', display: 'block', marginBottom: 8 }}></i>
              No transactions found.
            </div>
          ) : (
            <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)' }}>
              <table className="log-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>User UID</th>
                    <th>Type</th>
                    <th>Amount</th>
                    <th>Balance After</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTx.slice(0, 200).map(tx => (
                    <tr key={tx.id}>
                      <td style={{ color: '#64748B', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>{fmtTime(tx.timestamp)}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.68rem', color: '#94A3B8', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>{tx.uid}</td>
                      <td><TypeBadge type={tx.type || ''} /></td>
                      <td><AmountCell amount={tx.amount} /></td>
                      <td style={{ fontFamily: 'monospace', color: '#64748B', fontSize: '0.75rem' }}>
                        {tx.balanceAfter !== undefined ? `₹${Number(tx.balanceAfter).toFixed(2)}` : '—'}
                      </td>
                      <td style={{ maxWidth: 240, fontSize: '0.75rem' }}>{tx.description || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredTx.length > 200 && (
                <div style={{ padding: '10px 14px', fontSize: '0.72rem', color: '#64748B', textAlign: 'center' }}>
                  Showing 200 of {filteredTx.length} transactions. Use search to narrow results.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Withdrawals */}
      {activeTab === 'withdrawals' && (
        <div>
          {filteredWithdrawals.length === 0 ? (
            <div className="empty-state">
              <i className="bi bi-cash" style={{ fontSize: '2rem', display: 'block', marginBottom: 8 }}></i>
              No withdrawal records found.
            </div>
          ) : (
            <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)' }}>
              <table className="log-table">
                <thead>
                  <tr>
                    <th>Requested</th>
                    <th>Processed</th>
                    <th>Player</th>
                    <th>Amount</th>
                    <th>Method</th>
                    <th>Status</th>
                    <th>Note / Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredWithdrawals.map(w => {
                    const statusColor = w.status === 'completed' ? '#4ADE80' : w.status === 'rejected' ? '#F87171' : '#FACC15';
                    return (
                      <tr key={w.id}>
                        <td style={{ color: '#64748B', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>{fmtTime(w.requestTimestamp)}</td>
                        <td style={{ color: '#64748B', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>{w.processedAt ? fmtTime(w.processedAt) : '—'}</td>
                        <td>
                          <div style={{ fontWeight: 700, color: '#E2E8F0', fontSize: '0.8rem' }}>{w.userName || '—'}</div>
                          <div style={{ color: '#64748B', fontSize: '0.65rem' }}>{w.userEmail}</div>
                        </td>
                        <td style={{ fontWeight: 700, color: '#FACC15', fontFamily: 'monospace' }}>₹{w.amount}</td>
                        <td style={{ fontSize: '0.72rem' }}>{w.methodDetails?.methodName || w.method || '—'}</td>
                        <td>
                          <span className="status-badge" style={{ background: `${statusColor}18`, color: statusColor }}>
                            {w.status || 'pending'}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.72rem', color: '#94A3B8', maxWidth: 200 }}>{w.adminNote || w.rejectReason || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Deposits */}
      {activeTab === 'deposits' && (
        <div>
          {filteredDeposits.length === 0 ? (
            <div className="empty-state">
              <i className="bi bi-wallet2" style={{ fontSize: '2rem', display: 'block', marginBottom: 8 }}></i>
              No deposit records found.
            </div>
          ) : (
            <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)' }}>
              <table className="log-table">
                <thead>
                  <tr>
                    <th>Submitted</th>
                    <th>Processed</th>
                    <th>Player</th>
                    <th>Amount</th>
                    <th>UTR / Txn ID</th>
                    <th>Status</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDeposits.map(d => {
                    const statusColor = d.status === 'completed' ? '#4ADE80' : d.status === 'rejected' ? '#F87171' : '#FACC15';
                    return (
                      <tr key={d.id}>
                        <td style={{ color: '#64748B', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>{fmtTime(d.timestamp)}</td>
                        <td style={{ color: '#64748B', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>{d.processedAt ? fmtTime(d.processedAt) : '—'}</td>
                        <td>
                          <div style={{ fontWeight: 700, color: '#E2E8F0', fontSize: '0.8rem' }}>{d.userName || '—'}</div>
                          <div style={{ color: '#64748B', fontSize: '0.65rem' }}>{d.userEmail}</div>
                        </td>
                        <td style={{ fontWeight: 700, color: '#4ADE80', fontFamily: 'monospace' }}>₹{d.amount}</td>
                        <td style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: '#FACC15' }}>{d.utr || '—'}</td>
                        <td>
                          <span className="status-badge" style={{ background: `${statusColor}18`, color: statusColor }}>
                            {d.status || 'pending'}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.72rem', color: '#94A3B8', maxWidth: 180 }}>{d.rejectReason || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Disputes */}
      {activeTab === 'disputes' && (
        <div>
          {filteredDisputes.length === 0 ? (
            <div className="empty-state">
              <i className="bi bi-shield-slash" style={{ fontSize: '2rem', display: 'block', marginBottom: 8 }}></i>
              No dispute records found.
            </div>
          ) : (
            <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)' }}>
              <table className="log-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Tournament ID</th>
                    <th>Accused UID</th>
                    <th>Status</th>
                    <th>Reporters</th>
                    <th>Resolved By</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDisputes.map(d => {
                    const statusColor = d.status === 'resolved' ? '#4ADE80' : '#FACC15';
                    return (
                      <tr key={d.id}>
                        <td style={{ color: '#64748B', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>{fmtTime(d.timestamp)}</td>
                        <td style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: '#94A3B8' }}>{d.tournamentId || '—'}</td>
                        <td style={{ fontFamily: 'monospace', fontSize: '0.68rem', color: '#94A3B8' }}>{d.accusedUid || '—'}</td>
                        <td>
                          <span className="status-badge" style={{ background: `${statusColor}18`, color: statusColor }}>
                            {d.status || 'open'}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.75rem' }}>{d.reporters ? Object.keys(d.reporters).length : '—'}</td>
                        <td style={{ fontSize: '0.72rem', color: '#94A3B8' }}>{d.resolvedBy || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminLogs;
