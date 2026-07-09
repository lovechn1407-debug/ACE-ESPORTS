import React, { useEffect, useState, useRef } from 'react';
import { ref, get } from 'firebase/database';
import { db } from '../../firebase';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

const AdminDashboard: React.FC = () => {
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeTournaments: 0,
    finishedTournaments: 0,
    pendingWithdrawals: 0,
    completedWithdrawals: 0,
    rejectedWithdrawals: 0,
    totalGames: 0,
    totalPromotions: 0
  });
  const [loading, setLoading] = useState(true);
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstanceRef = useRef<Chart | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const usersSnap = await get(ref(db, 'users'));
        const gamesSnap = await get(ref(db, 'games'));
        const promosSnap = await get(ref(db, 'promotions'));
        const tourneysSnap = await get(ref(db, 'tournaments'));

        const withdrawalsSnap = await get(ref(db, 'withdrawals'));
        let pendingSize = 0;
        let completedSize = 0;
        let rejectedSize = 0;
        if (withdrawalsSnap.exists()) {
          Object.values(withdrawalsSnap.val()).forEach((w: any) => {
            if (w && w.status === 'pending') pendingSize++;
            else if (w && w.status === 'completed') completedSize++;
            else if (w && w.status === 'rejected') rejectedSize++;
          });
        }

        let activeCount = 0;
        let finishedCount = 0;
        if (tourneysSnap.exists()) {
          tourneysSnap.forEach((child) => {
            const status = child.val().status;
            if (status === 'ongoing' || status === 'upcoming') activeCount++;
            else finishedCount++;
          });
        }

        const totalUsers = usersSnap.exists() ? usersSnap.size : 0;
        setStats({
          totalUsers,
          activeTournaments: activeCount,
          finishedTournaments: finishedCount,
          pendingWithdrawals: pendingSize,
          completedWithdrawals: completedSize,
          rejectedWithdrawals: rejectedSize,
          totalGames: gamesSnap.exists() ? gamesSnap.size : 0,
          totalPromotions: promosSnap.exists() ? promosSnap.size : 0
        });

        // Generate Chart
        if (usersSnap.exists()) {
          const usersList: any[] = [];
          usersSnap.forEach((child) => {
            usersList.push(child.val());
          });

          const days = Array(7).fill(0).map((_, i) => {
            const d = new Date();
            d.setDate(d.getDate() - i);
            return d;
          }).reverse();

          const labels = days.map(d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
          const data = Array(7).fill(0);

          usersList.forEach(user => {
            if (user.createdAt) {
              const signupDate = new Date(user.createdAt);
              for (let i = 0; i < 7; i++) {
                const dayStart = new Date(days[i]).setHours(0, 0, 0, 0);
                const dayEnd = new Date(days[i]).setHours(23, 59, 59, 999);
                if (signupDate.getTime() >= dayStart && signupDate.getTime() <= dayEnd) {
                  data[i]++;
                  break;
                }
              }
            }
          });

          if (chartInstanceRef.current) {
            chartInstanceRef.current.destroy();
          }

          if (chartRef.current) {
            chartInstanceRef.current = new Chart(chartRef.current, {
              type: 'bar',
              data: {
                labels,
                datasets: [{
                  label: 'New Users',
                  data,
                  backgroundColor: 'rgba(250, 204, 21, 0.7)',
                  borderColor: 'rgb(250, 204, 21)',
                  borderWidth: 1
                }]
              },
              options: {
                responsive: true,
                plugins: {
                  legend: { display: false }
                },
                scales: {
                  y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(148, 163, 184, 0.1)' },
                    ticks: { color: '#94A3B8', stepSize: 1 }
                  },
                  x: {
                    grid: { color: 'rgba(148, 163, 184, 0.1)' },
                    ticks: { color: '#94A3B8' }
                  }
                }
              }
            });
          }
        }
      } catch (err) {
        console.error('Error loading dashboard stats:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();

    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
      }
    };
  }, []);

  return (
    <div className="admin-dashboard-view">
      <h2 className="mb-4">Dashboard Overview</h2>
      
      {loading ? (
        <div className="placeholder-glow py-5 rounded-3" style={{ height: '300px' }}></div>
      ) : (
        <>
          {/* Stats Cards Row */}
          <div className="row">
            {/* Row 1 */}
            <div className="col-lg-3 col-md-6 mb-4">
              <div className="card text-bg-primary shadow-sm h-100">
                <div className="card-body">
                  <h5 className="card-title">Total Users</h5>
                  <p className="card-text fs-3 fw-bold mb-0">{stats.totalUsers}</p>
                  <i className="bi bi-people-fill dash-card-icon"></i>
                </div>
              </div>
            </div>

            <div className="col-lg-3 col-md-6 mb-4">
              <div className="card text-bg-info shadow-sm h-100">
                <div className="card-body">
                  <h5 className="card-title">Active/Upcoming Tournaments</h5>
                  <p className="card-text fs-3 fw-bold mb-0">{stats.activeTournaments}</p>
                  <i className="bi bi-trophy-fill dash-card-icon"></i>
                </div>
              </div>
            </div>

            <div className="col-lg-3 col-md-6 mb-4">
              <div className="card text-bg-warning shadow-sm h-100">
                <div className="card-body">
                  <h5 className="card-title">Pending Withdrawals</h5>
                  <p className="card-text fs-3 fw-bold mb-0">{stats.pendingWithdrawals}</p>
                  <i className="bi bi-hourglass-split dash-card-icon"></i>
                </div>
              </div>
            </div>

            <div className="col-lg-3 col-md-6 mb-4">
              <div className="card text-bg-success shadow-sm h-100">
                <div className="card-body">
                  <h5 className="card-title">Completed Withdrawals</h5>
                  <p className="card-text fs-3 fw-bold mb-0">{stats.completedWithdrawals}</p>
                  <i className="bi bi-check-circle-fill dash-card-icon"></i>
                </div>
              </div>
            </div>

            {/* Row 2 */}
            <div className="col-lg-3 col-md-6 mb-4">
              <div className="card text-bg-dark shadow-sm h-100">
                <div className="card-body">
                  <h5 className="card-title">Rejected Withdrawals</h5>
                  <p className="card-text fs-3 fw-bold mb-0">{stats.rejectedWithdrawals}</p>
                  <i className="bi bi-x-octagon-fill dash-card-icon"></i>
                </div>
              </div>
            </div>

            <div className="col-lg-3 col-md-6 mb-4">
              <div className="card text-bg-secondary shadow-sm h-100">
                <div className="card-body">
                  <h5 className="card-title">Total Games</h5>
                  <p className="card-text fs-3 fw-bold mb-0">{stats.totalGames}</p>
                  <i className="bi bi-controller dash-card-icon"></i>
                </div>
              </div>
            </div>

            <div className="col-lg-3 col-md-6 mb-4">
              <div className="card text-bg-secondary shadow-sm h-100">
                <div className="card-body">
                  <h5 className="card-title">Total Promotions</h5>
                  <p className="card-text fs-3 fw-bold mb-0">{stats.totalPromotions}</p>
                  <i className="bi bi-images dash-card-icon"></i>
                </div>
              </div>
            </div>

            <div className="col-lg-3 col-md-6 mb-4">
              <div className="card text-bg-secondary shadow-sm h-100">
                <div className="card-body">
                  <h5 className="card-title">Finished Tournaments</h5>
                  <p className="card-text fs-3 fw-bold mb-0">{stats.finishedTournaments}</p>
                  <i className="bi bi-flag-fill dash-card-icon"></i>
                </div>
              </div>
            </div>
          </div>

          {/* Signups Chart */}
          <div className="card custom-card p-4 mb-4">
            <h5 className="card-title mb-3">New User Signups (Last 7 Days)</h5>
            <div style={{ height: '300px', position: 'relative' }}>
              <canvas ref={chartRef}></canvas>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default AdminDashboard;
