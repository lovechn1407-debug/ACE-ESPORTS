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
        
        {showBack ? (
          <div className="header-game-title">{title}</div>
        ) : (
          <div className="header-title" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#F3F4F6', display: 'block', lineHeight: '1.2' }}>
              {settings?.appName || 'ACE ESPORTS'}
            </span>
            <span style={{ fontSize: '0.72rem', color: '#9CA3AF', display: 'block', lineHeight: '1.2', marginTop: '2px' }}>
              {userProfile?.displayName || 'Guest'}
            </span>
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
              className="wallet-chip" 
              onClick={() => onNavigateSection && onNavigateSection('wallet-section')}
              style={{
                background: '#FACC15',
                color: '#000000',
                borderRadius: '6px',
                border: 'none',
                fontWeight: '700',
                padding: '5px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <i className="bi bi-wallet-fill" style={{ color: '#000000', fontSize: '0.98rem' }}></i>
              <span style={{ color: '#000000', fontSize: '0.96rem', fontWeight: 'bold' }}>₹{userProfile.balance != null ? userProfile.balance.toFixed(2) : '0.00'}</span>
            </button>
          </>
        )}
      </div>
    </header>
  );
};

export default Header;
