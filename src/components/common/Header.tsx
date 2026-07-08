import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useSettings } from '../../contexts/SettingsContext';

interface HeaderProps {
  title?: string;
  showBack?: boolean;
  onBack?: () => void;
  onNavigateSection?: (section: string) => void;
  onOpenNotifications?: () => void;
}

const Header: React.FC<HeaderProps> = ({ 
  title, 
  showBack = false, 
  onBack, 
  onNavigateSection,
  onOpenNotifications 
}) => {
  const { userProfile } = useAuth();
  const { settings } = useSettings();

  return (
    <header className="app-header">
      <div className="header-left">
        {showBack && onBack ? (
          <button className="header-back-button" onClick={onBack} aria-label="Go Back">
            <i className="bi bi-arrow-left" style={{ fontSize: '1.2rem' }}></i>
          </button>
        ) : (
          <img 
            src={settings.logoUrl || 'https://via.placeholder.com/40/FFFFFF/0F172A?text=G'} 
            alt="Logo" 
            className="header-logo" 
          />
        )}
        
        {title ? (
          <div className="header-game-title">{title}</div>
        ) : (
          <div className="header-title">
            Welcome <span>{userProfile?.displayName || 'Guest'}</span>
          </div>
        )}
      </div>

      <div className="header-right">
        {userProfile && (
          <>
            <button 
              className="notification-icon" 
              onClick={onOpenNotifications}
              aria-label="Notifications"
            >
              <i className="bi bi-bell-fill"></i>
              {/* Unread notification indicator - we can check userProfile metadata or unread list */}
              <span className="notification-badge"></span>
            </button>

            <button 
              className="header-spin-btn" 
              onClick={() => onNavigateSection && onNavigateSection('earningZone-section')}
              aria-label="Lucky Draw"
              title="Lucky Draw / Spin"
            >
              <i className="bi bi-compass-fill"></i>
            </button>

            <button 
              className="wallet-chip" 
              onClick={() => onNavigateSection && onNavigateSection('wallet-section')}
            >
              <i className="bi bi-wallet-fill"></i>
              <span>₹{userProfile.balance != null ? userProfile.balance.toFixed(2) : '0.00'}</span>
            </button>
          </>
        )}
      </div>
    </header>
  );
};

export default Header;
