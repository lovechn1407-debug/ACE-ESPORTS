import React from 'react';

interface BottomNavProps {
  activeSection: string;
  onSelectSection: (section: string) => void;
}

const BottomNav: React.FC<BottomNavProps> = ({ activeSection, onSelectSection }) => {
  return (
    <nav className="bottom-nav">
      <button 
        className={`nav-item ${activeSection === 'home-section' ? 'active' : ''}`}
        onClick={() => onSelectSection('home-section')}
      >
        <i className="bi bi-house-door-fill"></i>
        <span>Home</span>
      </button>

      <button 
        className={`nav-item ${activeSection === 'wallet-section' ? 'active' : ''}`}
        onClick={() => onSelectSection('wallet-section')}
      >
        <i className="bi bi-wallet-fill"></i>
        <span>Wallet</span>
      </button>

      <button 
        className={`nav-item nav-item-center ${activeSection === 'leaderboard-section' ? 'active' : ''}`}
        onClick={() => onSelectSection('leaderboard-section')}
        aria-label="Leaderboard"
      >
        <i className="bi bi-trophy-fill"></i>
      </button>

      <button 
        className={`nav-item ${activeSection === 'earnings-section' ? 'active' : ''}`}
        onClick={() => onSelectSection('earnings-section')}
      >
        <i className="bi bi-coin"></i>
        <span>Earnings</span>
      </button>

      <button 
        className={`nav-item ${activeSection === 'profile-section' ? 'active' : ''}`}
        onClick={() => onSelectSection('profile-section')}
      >
        <i className="bi bi-person-fill"></i>
        <span>Profile</span>
      </button>
    </nav>
  );
};

export default BottomNav;
