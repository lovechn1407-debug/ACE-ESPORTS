import React, { useEffect, useState } from 'react';
import { ref, get, push, set, runTransaction, serverTimestamp } from 'firebase/database';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { useSettings } from '../../contexts/SettingsContext';

interface Transaction {
  id: string;
  type: string;
  amount: number;
  description: string;
  timestamp?: number;
  balanceAfter?: number;
}

const Wallet: React.FC = () => {
  const { currentUser, userProfile } = useAuth();
  const { settings } = useSettings();

  // Sub-views: 'wallet' | 'recharge_1' | 'recharge_2' | 'recharge_3'
  const [subView, setSubView] = useState<'wallet' | 'recharge_1' | 'recharge_2' | 'recharge_3'>('wallet');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingTx, setLoadingTx] = useState(true);

  // Recharge state
  const [rechargeAmt, setRechargeAmt] = useState<number>(100);
  const [rechargeMethod, setRechargeMethod] = useState<string>('PhonePe');
  const [utr, setUtr] = useState<string>('');
  const [rechargeError, setRechargeError] = useState<string>('');
  const [rechargeLoading, setRechargeLoading] = useState(false);

  // Withdrawal state
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAmt, setWithdrawAmt] = useState<string>('');
  const [withdrawMethod, setWithdrawMethod] = useState<string>('');
  const [withdrawMsg, setWithdrawMsg] = useState<{ text: string; type: 'success' | 'danger' | 'warning' } | null>(null);
  const [withdrawLoading, setWithdrawLoading] = useState(false);

  // User's withdrawal requests history states
  const [withdrawalRequests, setWithdrawalRequests] = useState<any[]>([]);
  const [loadingWithdrawals, setLoadingWithdrawals] = useState<boolean>(true);
  const [activeWalletTab, setActiveWalletTab] = useState<'transactions' | 'withdrawals'>('transactions');

  // Fetch Transactions
  useEffect(() => {
    const fetchTransactions = async () => {
      if (!currentUser) return;
      try {
        const transRef = ref(db, `transactions/${currentUser.uid}`);
        const snapshot = await get(transRef);
        if (snapshot.exists()) {
          const data = snapshot.val();
          const list = Object.entries(data).map(([id, val]: any) => ({
            id,
            ...val
          }));
          list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
          setTransactions(list.slice(0, 20)); // show recent 20
        }
      } catch (err) {
        console.error('Error fetching transactions:', err);
      } finally {
        setLoadingTx(false);
      }
    };
    if (subView === 'wallet') {
      fetchTransactions();
    }
  }, [currentUser, subView]);

  // Fetch Withdrawal Requests
  useEffect(() => {
    const fetchWithdrawals = async () => {
      if (!currentUser) return;
      try {
        const wdRef = ref(db, 'withdrawals');
        const snapshot = await get(wdRef);
        if (snapshot.exists()) {
          const allData = snapshot.val();
          const list = Object.entries(allData)
            .map(([id, val]: any) => ({
              id,
              ...val
            }))
            .filter(w => w.userId === currentUser.uid);
          
          // Sort newest first
          list.sort((a, b) => (b.requestTimestamp || 0) - (a.requestTimestamp || 0));
          setWithdrawalRequests(list);
        } else {
          setWithdrawalRequests([]);
        }
      } catch (err) {
        console.error('Error loading withdrawals:', err);
      } finally {
        setLoadingWithdrawals(false);
      }
    };
    if (subView === 'wallet') {
      fetchWithdrawals();
    }
  }, [currentUser, subView, showWithdrawModal]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Copied: ' + text);
  };

  const handleRechargeNext1 = () => {
    if (rechargeAmt < 10 || rechargeAmt > 1000) {
      setRechargeError('Please enter an amount between ₹10 and ₹1000.');
      return;
    }
    setRechargeError('');
    setSubView('recharge_2');
  };

  const handleRechargeSubmit = async () => {
    if (!utr.trim()) {
      setRechargeError('Please enter the 12-digit UTR/Transaction ID.');
      return;
    }
    if (!currentUser) return;

    setRechargeLoading(true);
    setRechargeError('');

    const upiMap: Record<string, string> = {
      'PhonePe': '8383090874@fam',
      'Paytm': '8383090874@fam',
      'GPay': '8383090874@fam'
    };

    const upiId = settings.upiDetails || upiMap[rechargeMethod] || '8383090874@fam';

    const depositRequest = {
      userId: currentUser.uid,
      userEmail: currentUser.email,
      userName: userProfile?.displayName || 'N/A',
      amount: rechargeAmt,
      paymentMethod: rechargeMethod,
      upiId: upiId,
      utr: utr.trim(),
      status: 'pending',
      timestamp: serverTimestamp()
    };

    try {
      await set(push(ref(db, 'deposits')), depositRequest);
      alert('Deposit request submitted successfully! Funds will credit after admin verification.');
      setSubView('wallet');
      setUtr('');
    } catch (err: any) {
      setRechargeError(`Request failed: ${err.message}`);
    } finally {
      setRechargeLoading(false);
    }
  };

  const handleWithdrawalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(withdrawAmt);
    const method = withdrawMethod.trim();
    const winningCash = userProfile?.winningCash || 0;
    const minW = settings.minWithdraw || 50;

    setWithdrawMsg(null);

    if (isNaN(amount) || amount <= 0) {
      setWithdrawMsg({ text: 'Please enter a valid positive amount.', type: 'warning' });
      return;
    }
    if (amount < minW) {
      setWithdrawMsg({ text: `Minimum withdrawal limit is ₹${minW}.`, type: 'warning' });
      return;
    }
    if (amount > winningCash) {
      setWithdrawMsg({ text: 'Amount exceeds your withdrawable winning cash.', type: 'warning' });
      return;
    }
    if (!method) {
      setWithdrawMsg({ text: 'Please input withdrawal details.', type: 'warning' });
      return;
    }
    if (!currentUser) return;

    setWithdrawLoading(true);
    let txnCommitted = false;

    try {
      const userRef = ref(db, `users/${currentUser.uid}`);
      const txResult = await runTransaction(userRef, (profData) => {
        if (profData) {
          if (profData.status === 'blocked') {
            throw new Error('This account has been blocked by administration.');
          }
          if ((profData.winningCash || 0) >= amount) {
            profData.winningCash = (profData.winningCash || 0) - amount;
            profData.balance = Math.max(0, (profData.balance || 0) - amount);
            return profData;
          } else {
            throw new Error('Insufficient winning cash.');
          }
        }
        return profData;
      });

      if (!txResult.committed) {
        throw new Error('Transaction processing failed. Please retry.');
      }
      txnCommitted = true;

      const withdrawalsRef = push(ref(db, 'withdrawals'));
      await set(withdrawalsRef, {
        userId: currentUser.uid,
        userName: userProfile?.displayName || currentUser.email,
        amount: amount,
        methodDetails: {
          methodName: method.includes('@') ? 'UPI' : 'Bank Transfer',
          accountInfo: method
        },
        status: 'pending',
        requestTimestamp: serverTimestamp(),
        userEmail: currentUser.email || 'N/A'
      });

      const txKey = push(ref(db, `transactions/${currentUser.uid}`)).key;
      await set(ref(db, `transactions/${currentUser.uid}/${txKey}`), {
        type: 'withdraw_request',
        amount: -amount,
        description: `Withdrawn to ${method.substring(0, 15)}${method.length > 15 ? '...' : ''}`,
        timestamp: serverTimestamp(),
        balanceAfter: (userProfile?.balance || 0) - amount,
        withdrawalId: withdrawalsRef.key
      });

      setWithdrawMsg({ text: 'Withdrawal request submitted successfully!', type: 'success' });
      setWithdrawAmt('');
      setWithdrawMethod('');
      setTimeout(() => setShowWithdrawModal(false), 1500);
    } catch (err: any) {
      setWithdrawMsg({ text: err.message, type: 'danger' });

      if (txnCommitted) {
        try {
          await runTransaction(ref(db, `users/${currentUser.uid}`), (profData) => {
            if (profData) {
              profData.winningCash = (profData.winningCash || 0) + amount;
              profData.balance = (profData.balance || 0) + amount;
            }
            return profData;
          });
        } catch (rollErr) {
          console.error(rollErr);
        }
      }
    } finally {
      setWithdrawLoading(false);
    }
  };

  const handleDialerClick = (numStr: string) => {
    setWithdrawMsg(null);
    if (numStr === 'BACK') {
      setWithdrawAmt(prev => prev.slice(0, -1));
    } else if (numStr === 'CLEAR') {
      setWithdrawAmt('');
    } else {
      if (withdrawAmt.length >= 6) return;
      setWithdrawAmt(prev => {
        if (prev === '0') return numStr;
        return prev + numStr;
      });
    }
  };

  const handleQuickAdd = (val: number) => {
    setWithdrawMsg(null);
    setWithdrawAmt(prev => {
      const current = parseFloat(prev) || 0;
      return String(current + val);
    });
  };

  const handleSetMax = () => {
    setWithdrawMsg(null);
    const maxWin = userProfile?.winningCash || 0;
    setWithdrawAmt(String(Math.floor(maxWin)));
  };


  const getTxIcon = (type: string) => {
    if (type.includes('withdraw')) return <i className="bi bi-box-arrow-up-right text-danger"></i>;
    if (type.includes('deposit') || type.includes('credit')) return <i className="bi bi-box-arrow-down-left text-success"></i>;
    if (type.includes('refund')) return <i className="bi bi-arrow-counterclockwise text-info"></i>;
    return <i className="bi bi-controller text-warning"></i>;
  };

  return (
    <div className="section py-3">
      {subView === 'wallet' && (
        <>
          {/* ── Premium Wallet Card ── */}
          <div className="premium-wallet-card">
            <div className="wallet-card-gloss"></div>
            
            <div className="d-flex align-items-center justify-content-between mb-4 position-relative z-2">
              <span className="wallet-glow-title"><i className="bi bi-wallet2 me-2"></i>My Balance</span>
              <span className="wallet-chip">ESPORTS SECURE</span>
            </div>

            <div className="total-balance-display position-relative z-2 mb-4">
              <span className="balance-currency">₹</span>
              <span className="balance-amount">
                {userProfile?.balance != null ? userProfile.balance.toFixed(2) : '0.00'}
              </span>
              <small className="d-block text-secondary mt-1">Combined Account Balance</small>
            </div>

            {/* Quick Actions */}
            <div className="d-flex gap-3 position-relative z-2 mb-4">
              <button className="wallet-action-btn add-money-btn flex-grow-1" onClick={() => setSubView('recharge_1')}>
                <i className="bi bi-plus-circle-fill"></i> Add Cash
              </button>
              <button className="wallet-action-btn withdraw-btn flex-grow-1" onClick={() => setShowWithdrawModal(true)}>
                <i className="bi bi-cash-stack"></i> Withdraw
              </button>
            </div>

            {/* Balances Breakdown Grid */}
            <div className="balance-breakdown-row position-relative z-2">
              <div className="breakdown-col border-end border-secondary border-opacity-25">
                <span className="breakdown-label">Deposit Cash</span>
                <span className="breakdown-value">
                  ₹{((userProfile?.balance || 0) - (userProfile?.winningCash || 0) - (userProfile?.bonusCash || 0)).toFixed(2)}
                </span>
              </div>
              <div className="breakdown-col border-end border-secondary border-opacity-25">
                <span className="breakdown-label text-success">Winning Cash</span>
                <span className="breakdown-value text-success">
                  ₹{userProfile?.winningCash != null ? userProfile.winningCash.toFixed(2) : '0.00'}
                </span>
              </div>
              <div className="breakdown-col">
                <span className="breakdown-label text-warning">Bonus Cash</span>
                <span className="breakdown-value text-warning">
                  ₹{userProfile?.bonusCash != null ? userProfile.bonusCash.toFixed(2) : '0.00'}
                </span>
              </div>
            </div>
          </div>

          {/* ── Tabbed History Feed ── */}
          <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: '14px', marginTop: '24px' }}>
            <button
              type="button"
              onClick={() => setActiveWalletTab('transactions')}
              style={{
                flex: 1,
                background: 'none',
                border: 'none',
                borderBottom: activeWalletTab === 'transactions' ? '2.5px solid var(--accent-color)' : '2.5px solid transparent',
                color: activeWalletTab === 'transactions' ? '#F1F5F9' : '#64748B',
                padding: '10px 0',
                fontSize: '0.84rem',
                fontWeight: activeWalletTab === 'transactions' ? 700 : 500,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <i className="bi bi-clock-history me-1.5"></i>Transactions
            </button>
            <button
              type="button"
              onClick={() => setActiveWalletTab('withdrawals')}
              style={{
                flex: 1,
                background: 'none',
                border: 'none',
                borderBottom: activeWalletTab === 'withdrawals' ? '2.5px solid var(--accent-color)' : '2.5px solid transparent',
                color: activeWalletTab === 'withdrawals' ? '#F1F5F9' : '#64748B',
                padding: '10px 0',
                fontSize: '0.84rem',
                fontWeight: activeWalletTab === 'withdrawals' ? 700 : 500,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <i className="bi bi-cash-stack me-1.5"></i>Withdraw Requests
            </button>
          </div>

          {activeWalletTab === 'transactions' ? (
            /* ───── TRANSACTIONS TAB ───── */
            loadingTx ? (
              <div className="placeholder-glow py-5 rounded-3" style={{ height: '200px' }}></div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {transactions.length > 0 ? (
                  transactions.map(tx => {
                    const isCredit = tx.amount > 0;
                    const dateStr = tx.timestamp 
                      ? new Date(tx.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) 
                      : 'N/A';

                    // Parse detailed breakdown
                    let title = tx.type ? tx.type.replace(/_/g, ' ').toUpperCase() : 'TRANSACTION';
                    let desc = tx.description || '';
                    let reason = '';

                    if (tx.type === 'tournament_join') {
                      title = 'Joined Match';
                      desc = tx.description ? tx.description.replace('Joined match:', '').trim() : '';
                    } else if (tx.type === 'admin_refund') {
                      title = 'Match Refund';
                      const reasonMatch = tx.description?.match(/\(Removed:\s*([^\)]+)\)/);
                      if (reasonMatch) {
                        reason = reasonMatch[1].trim();
                      }
                      desc = tx.description ? tx.description.replace(/\(Removed:[^\)]+\)/, '').replace('Refund for Tournament:', '').trim() : 'Refund';
                    } else if (tx.type === 'withdraw_request') {
                      title = 'Withdraw Cash';
                      desc = tx.description ? tx.description.replace('Withdrawn to', 'To:').trim() : '';
                    } else if (tx.type === 'deposit_approved') {
                      title = 'Deposit Added';
                    } else if (tx.type === 'deposit_rejected') {
                      title = 'Deposit Rejected';
                      const reasonMatch = tx.description?.match(/Reason:\s*(.+)$/i);
                      if (reasonMatch) {
                        reason = reasonMatch[1].trim();
                      }
                    } else if (tx.type === 'admin_adjustment') {
                      title = 'Admin Adjustment';
                    }

                    return (
                      <div 
                        key={tx.id}
                        style={{
                          background: 'rgba(255,255,255,0.015)',
                          border: '1px solid rgba(255,255,255,0.04)',
                          borderRadius: '8px',
                          padding: '12px 14px',
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '12px',
                          position: 'relative',
                          overflow: 'hidden'
                        }}
                      >
                        {/* Left icon circle */}
                        <div style={{
                          width: '38px',
                          height: '38px',
                          borderRadius: '50%',
                          background: isCredit ? 'rgba(34, 197, 94, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                          border: isCredit ? '1.5px solid rgba(34, 197, 94, 0.15)' : '1.5px solid rgba(239, 68, 68, 0.15)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          fontSize: '1rem'
                        }}>
                          {getTxIcon(tx.type)}
                        </div>

                        {/* Content block */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                            <div>
                              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#E2E8F0', letterSpacing: '-0.01em' }}>
                                {title}
                              </div>
                              {desc && (
                                <div style={{ fontSize: '0.74rem', color: '#94A3B8', marginTop: '2px', wordBreak: 'break-word' }}>
                                  {desc}
                                </div>
                              )}
                              <div style={{ fontSize: '0.65rem', color: '#64748B', marginTop: '4px' }}>
                                {dateStr}
                              </div>
                            </div>

                            {/* Right Amount block */}
                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                              <div style={{
                                fontSize: '0.9rem',
                                fontWeight: 800,
                                color: isCredit ? '#4ADE80' : '#F87171',
                                letterSpacing: '-0.01em'
                              }}>
                                {isCredit ? '+' : '-'}₹{Math.abs(tx.amount).toFixed(0)}
                              </div>
                              {tx.balanceAfter !== undefined && (
                                <div style={{ fontSize: '0.62rem', color: '#475569', marginTop: '1px' }}>
                                  Bal: ₹{Number(tx.balanceAfter).toFixed(0)}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Audit Reason sub-box */}
                          {reason && (
                            <div style={{
                              marginTop: '8px',
                              padding: '6px 10px',
                              background: 'rgba(239, 68, 68, 0.05)',
                              border: '1px solid rgba(239, 68, 68, 0.1)',
                              borderRadius: '4px',
                              fontSize: '0.7rem',
                              color: '#F87171',
                              display: 'flex',
                              gap: '4px'
                            }}>
                              <span style={{ fontWeight: 700, color: '#EF4444' }}>Reason:</span>
                              <span>{reason}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-5 text-secondary custom-card">
                    <i className="bi bi-clock-history fs-2 d-block mb-2"></i>
                    No transaction history recorded yet.
                  </div>
                )}
              </div>
            )
          ) : (
            /* ───── WITHDRAWALS TAB ───── */
            loadingWithdrawals ? (
              <div className="placeholder-glow py-5 rounded-3" style={{ height: '200px' }}></div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {withdrawalRequests.length > 0 ? (
                  withdrawalRequests.map(wd => {
                    const dateStr = wd.requestTimestamp 
                      ? new Date(wd.requestTimestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) 
                      : 'N/A';

                    let statusText = 'PENDING';
                    let statusColor = '#E2E8F0'; // light gray
                    let statusBg = 'rgba(255,255,255,0.05)';
                    let statusBorder = 'rgba(255,255,255,0.1)';
                    let iconClass = 'bi-hourglass-split text-warning animate-pulse';

                    if (wd.status === 'completed') {
                      statusText = 'APPROVED';
                      statusColor = '#4ADE80'; // soft green
                      statusBg = 'rgba(34, 197, 94, 0.06)';
                      statusBorder = 'rgba(34, 197, 94, 0.15)';
                      iconClass = 'bi-check-circle-fill text-success';
                    } else if (wd.status === 'rejected') {
                      statusText = 'REJECTED';
                      statusColor = '#F87171'; // soft red
                      statusBg = 'rgba(239, 68, 68, 0.06)';
                      statusBorder = 'rgba(239, 68, 68, 0.15)';
                      iconClass = 'bi-x-circle-fill text-danger';
                    }

                    return (
                      <div
                        key={wd.id}
                        style={{
                          background: 'rgba(255,255,255,0.015)',
                          border: '1px solid rgba(255,255,255,0.04)',
                          borderRadius: '8px',
                          padding: '12px 14px',
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '12px',
                          position: 'relative'
                        }}
                      >
                        {/* Icon circle */}
                        <div style={{
                          width: '38px',
                          height: '38px',
                          borderRadius: '50%',
                          background: 'rgba(255,255,255,0.02)',
                          border: '1.5px solid rgba(255,255,255,0.06)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          fontSize: '1.1rem'
                        }}>
                          <i className={`bi ${iconClass}`}></i>
                        </div>

                        {/* Content block */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#E2E8F0' }}>Withdrawal Request</span>
                                <span style={{
                                  fontSize: '0.6rem',
                                  fontWeight: 700,
                                  color: statusColor,
                                  background: statusBg,
                                  border: `1px solid ${statusBorder}`,
                                  padding: '1px 5px',
                                  borderRadius: '3px'
                                }}>
                                  {statusText}
                                </span>
                              </div>
                              <div style={{ fontSize: '0.74rem', color: '#94A3B8', marginTop: '2px', wordBreak: 'break-all' }}>
                                To: {wd.methodDetails?.accountInfo || 'N/A'}
                              </div>
                              <div style={{ fontSize: '0.65rem', color: '#64748B', marginTop: '4px' }}>
                                {dateStr}
                              </div>
                            </div>

                            {/* Amount */}
                            <strong style={{ fontSize: '1rem', color: '#CBD5E1', letterSpacing: '-0.01em', flexShrink: 0 }}>
                              ₹{wd.amount}
                            </strong>
                          </div>

                          {/* Admin Note if completed */}
                          {wd.status === 'completed' && wd.adminNote && (
                            <div style={{
                              marginTop: '8px',
                              padding: '6px 10px',
                              background: 'rgba(34, 197, 94, 0.05)',
                              border: '1px solid rgba(34, 197, 94, 0.1)',
                              borderRadius: '4px',
                              fontSize: '0.7rem',
                              color: '#4ADE80'
                            }}>
                              <strong style={{ color: '#22C55E' }}>Note:</strong> {wd.adminNote}
                            </div>
                          )}

                          {/* Reject Reason if rejected */}
                          {wd.status === 'rejected' && wd.rejectReason && (
                            <div style={{
                              marginTop: '8px',
                              padding: '6px 10px',
                              background: 'rgba(239, 68, 68, 0.05)',
                              border: '1px solid rgba(239, 68, 68, 0.1)',
                              borderRadius: '4px',
                              fontSize: '0.7rem',
                              color: '#F87171'
                            }}>
                              <strong style={{ color: '#EF4444' }}>Reason:</strong> {wd.rejectReason}
                            </div>
                          )}

                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-5 text-secondary custom-card">
                    <i className="bi bi-cash-stack fs-2 d-block mb-2"></i>
                    No withdrawal requests submitted yet.
                  </div>
                )}
              </div>
            )
          )}
        </>
      )}

      {/* ── Stepper Sub View ── */}
      {subView.startsWith('recharge') && (
        <div className="recharge-flow-container text-start">
          
          {/* Stepper Progress Bar */}
          <div className="stepper-progress-header mb-4">
            <div className={`step-dot ${subView === 'recharge_1' ? 'active' : 'completed'}`}>1</div>
            <div className={`step-line ${subView !== 'recharge_1' ? 'completed' : ''}`}></div>
            <div className={`step-dot ${subView === 'recharge_2' ? 'active' : subView === 'recharge_3' ? 'completed' : ''}`}>2</div>
            <div className={`step-line ${subView === 'recharge_3' ? 'completed' : ''}`}></div>
            <div className={`step-dot ${subView === 'recharge_3' ? 'active' : ''}`}>3</div>
          </div>

          {/* Stepper Step 1: Input Amount */}
          {subView === 'recharge_1' && (
            <div className="card custom-card p-4">
              <h5 className="mb-4 text-white text-center"><i className="bi bi-cash-coin me-2"></i>Enter Amount to Add</h5>
              
              <div className="amount-input-group mb-4">
                <span className="currency-prefix">₹</span>
                <input 
                  type="number" 
                  className="amount-field"
                  value={rechargeAmt || ''} 
                  onChange={(e) => setRechargeAmt(Math.min(1000, Number(e.target.value)))}
                  placeholder="10 - 1000"
                  min="10"
                  max="1000"
                />
              </div>

              <div className="amount-presets mb-4">
                {[50, 100, 200, 500, 1000].map(val => (
                  <button 
                    key={val}
                    className={`preset-pill ${rechargeAmt === val ? 'active' : ''}`}
                    onClick={() => setRechargeAmt(val)}
                  >
                    +₹{val}
                  </button>
                ))}
              </div>

              {rechargeError && <div className="alert alert-danger py-2 small mb-3">{rechargeError}</div>}

              <div className="d-flex gap-2">
                <button className="btn-custom btn-custom-secondary flex-grow-1" onClick={() => setSubView('wallet')}>
                  Cancel
                </button>
                <button className="btn-custom btn-custom-primary flex-grow-1" onClick={handleRechargeNext1}>
                  Next
                </button>
              </div>
            </div>
          )}

          {/* Stepper Step 2: Choose Payment Method */}
          {subView === 'recharge_2' && (
            <div className="card custom-card p-4">
              <h5 className="mb-4 text-white text-center"><i className="bi bi-wallet2 me-2"></i>Select UPI App</h5>
              
              <div className="d-flex flex-column gap-3 mb-4">
                {[
                  { id: 'PhonePe', label: 'PhonePe', logo: 'https://i.ibb.co/CK4YGNCd/phone-pay.png' },
                  { id: 'Paytm', label: 'Paytm', logo: 'https://pwebassets.paytm.com/commonwebassets/ir/images/press-kit/brand.png' },
                  { id: 'GPay', label: 'Google Pay', logo: 'https://telecomtalk.info/wp-content/uploads/2022/12/gpay-how-to-create-or-find-upi.jpg.webp' }
                ].map(app => (
                  <div 
                    key={app.id} 
                    className={`upi-app-card ${rechargeMethod === app.id ? 'active' : ''}`}
                    onClick={() => setRechargeMethod(app.id)}
                  >
                    <div className="d-flex align-items-center gap-3">
                      <img src={app.logo} alt={app.id} className="upi-logo" />
                      <span className="fw-bold">{app.label}</span>
                    </div>
                    <div className="checkbox-ring">
                      {rechargeMethod === app.id && <div className="checkbox-dot"></div>}
                    </div>
                  </div>
                ))}
              </div>

              <div className="d-flex gap-2">
                <button className="btn-custom btn-custom-secondary flex-grow-1" onClick={() => setSubView('recharge_1')}>
                  Back
                </button>
                <button className="btn-custom btn-custom-primary flex-grow-1" onClick={() => setSubView('recharge_3')}>
                  Next
                </button>
              </div>
            </div>
          )}

          {/* Stepper Step 3: View Details & Input UTR */}
          {subView === 'recharge_3' && (
            <div className="card custom-card p-4">
              <h5 className="mb-4 text-white text-center"><i className="bi bi-qr-code-scan me-2"></i>Scan and Pay</h5>

              {/* QR display */}
              <div className="text-center mb-4">
                <div className="qr-wrapper-glow mx-auto mb-3">
                  <img 
                    src={settings.qrCodeUrl || 'https://placehold.co/600x400?text=Loading+QR'} 
                    alt="Scan UPI QR Code" 
                    className="qr-img"
                  />
                </div>
                <div className="small text-secondary mb-1">UPI ID: <strong className="text-accent">{settings.upiDetails || '8383090874@fam'}</strong></div>
                <div className="small text-secondary">Payable Amount: <strong className="text-success">₹{rechargeAmt}</strong></div>
              </div>

              <div className="d-flex gap-2 mb-4">
                <button className="btn btn-sm btn-outline-secondary w-50" onClick={() => copyToClipboard(String(rechargeAmt))}>
                  <i className="bi bi-clipboard-check me-1"></i> Copy Amt
                </button>
                <button className="btn btn-sm btn-outline-secondary w-50" onClick={() => copyToClipboard(settings.upiDetails || '8383090874@fam')}>
                  <i className="bi bi-clipboard-check me-1"></i> Copy UPI
                </button>
              </div>

              <div className="form-group mb-4">
                <label className="form-label text-warning small fw-bold">Enter 12-Digit Payment UTR / Ref Number</label>
                <input 
                  type="text" 
                  className="form-control text-center font-monospace"
                  value={utr}
                  onChange={(e) => setUtr(e.target.value.replace(/\D/g, '').substring(0, 12))}
                  placeholder="e.g. 302829402948"
                  required
                />
                <small className="text-secondary d-block mt-1">Submit the correct UTR to avoid request cancellations.</small>
              </div>

              {rechargeError && <div className="alert alert-danger py-2 small mb-3">{rechargeError}</div>}

              <div className="d-flex gap-2">
                <button className="btn-custom btn-custom-secondary flex-grow-1" onClick={() => setSubView('recharge_2')}>
                  Back
                </button>
                <button 
                  className="btn-custom btn-custom-primary flex-grow-1" 
                  onClick={handleRechargeSubmit}
                  disabled={rechargeLoading}
                >
                  {rechargeLoading ? 'Submitting...' : 'Submit Deposit'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Withdrawal Modal ── */}
      {showWithdrawModal && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setShowWithdrawModal(false); }}
          className="position-fixed top-0 start-0 w-100 h-100"
          style={{
            zIndex: 1050,
            background: 'rgba(0,0,0,0.72)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
          }}
        >
          {/* Bottom sheet */}
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
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 18px 12px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              flexShrink: 0,
            }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#E2E8F0', letterSpacing: '-0.01em' }}>
                  Withdraw Earnings
                </div>
                <div style={{ fontSize: '0.7rem', color: '#64748B', marginTop: '1px' }}>
                  Transfer your winnings to UPI or Bank Account
                </div>
              </div>
              <button
                onClick={() => setShowWithdrawModal(false)}
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

            {/* Scrollable details */}
            <form onSubmit={handleWithdrawalSubmit} style={{ flex: 1, overflowY: 'auto', padding: '12px 14px 24px', display: 'flex', flexDirection: 'column' }}>
              
              {/* Balances status widget */}
              <div style={{
                background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.08) 0%, rgba(34, 197, 94, 0.02) 100%)',
                border: '1px solid rgba(34, 197, 94, 0.15)',
                borderRadius: '8px', padding: '10px 14px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: '14px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="bi bi-shield-check" style={{ color: '#4ADE80', fontSize: '1rem' }}></i>
                  <span style={{ fontSize: '0.74rem', color: '#CBD5E1' }}>Withdrawable Winnings</span>
                </div>
                <strong style={{ fontSize: '0.92rem', color: '#4ADE80' }}>₹{userProfile?.winningCash?.toFixed(2) || '0.00'}</strong>
              </div>

              {withdrawMsg && (
                <div className={`alert alert-${withdrawMsg.type} py-2 px-3 border-0 rounded-2 small mb-3`} style={{ fontSize: '0.75rem' }}>
                  <i className="bi bi-exclamation-triangle-fill me-2"></i>{withdrawMsg.text}
                </div>
              )}

              {/* Amount input block */}
              <div style={{ marginBottom: '6px' }}>
                <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>
                  Amount to Withdraw (Min ₹{settings.minWithdraw || 50})
                </label>
                
                <div style={{
                  background: '#090F1B',
                  border: '1px solid rgba(255,255,255,0.05)',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '10px'
                }}>
                  <span style={{ fontSize: '1.2rem', color: 'var(--accent-color)', fontWeight: 800, marginRight: '4px' }}>₹</span>
                  <input 
                    type="text" 
                    value={withdrawAmt}
                    onChange={(e) => {
                      const cleaned = e.target.value.replace(/[^0-9]/g, '');
                      setWithdrawAmt(cleaned);
                    }}
                    placeholder="0"
                    required
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#F1F5F9',
                      fontSize: '1.35rem',
                      fontWeight: 800,
                      width: '100%',
                      textAlign: 'center',
                      outline: 'none',
                    }}
                  />
                </div>
              </div>

              {/* Quick presets and MAX selection */}
              <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
                {[50, 100, 200, 500].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => handleQuickAdd(val)}
                    style={{
                      flex: 1,
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      borderRadius: '6px',
                      padding: '6px 4px',
                      color: '#94A3B8',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                    }}
                  >
                    +₹{val}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleSetMax}
                  style={{
                    flex: 1.2,
                    background: 'rgba(34, 197, 94, 0.08)',
                    border: '1px solid rgba(34, 197, 94, 0.18)',
                    borderRadius: '6px',
                    padding: '6px 4px',
                    color: '#4ADE80',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                  }}
                >
                  MAX
                </button>
              </div>

              {/* Numerical dialer grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginBottom: '16px' }}>
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((key) => {
                  const isSpecial = key === 'C' || key === '⌫';
                  const actionVal = key === 'C' ? 'CLEAR' : key === '⌫' ? 'BACK' : key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleDialerClick(actionVal)}
                      style={{
                        background: isSpecial ? 'rgba(255,255,255,0.035)' : 'rgba(255,255,255,0.015)',
                        border: '1px solid rgba(255,255,255,0.04)',
                        borderRadius: '6px',
                        padding: '11px',
                        color: isSpecial ? '#64748B' : '#CBD5E1',
                        fontSize: '1.1rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      onMouseDown={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.08)';
                        (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.96)';
                      }}
                      onMouseUp={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background = isSpecial ? 'rgba(255,255,255,0.035)' : 'rgba(255,255,255,0.015)';
                        (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
                      }}
                    >
                      {key}
                    </button>
                  );
                })}
              </div>

              {/* Payment Destination Details */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>
                  UPI ID or Bank Account Details
                </label>
                <textarea 
                  value={withdrawMethod}
                  onChange={(e) => setWithdrawMethod(e.target.value)}
                  placeholder="Enter UPI ID (e.g. name@upi) or Bank Name, A/C, IFSC Code"
                  required
                  style={{
                    width: '100%',
                    background: '#090F1B',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    fontSize: '0.78rem',
                    color: '#F1F5F9',
                    minHeight: '66px',
                    outline: 'none'
                  }}
                />
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
                <button
                  type="button"
                  className="btn-custom btn-custom-secondary w-100"
                  onClick={() => setShowWithdrawModal(false)}
                  style={{ borderRadius: '6px', fontSize: '0.8rem', padding: '10px' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-custom btn-custom-accent w-100"
                  disabled={withdrawLoading}
                  style={{ borderRadius: '6px', fontSize: '0.8rem', padding: '10px' }}
                >
                  {withdrawLoading ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Wallet;
