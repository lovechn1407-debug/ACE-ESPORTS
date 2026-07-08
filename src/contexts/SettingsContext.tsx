import React, { createContext, useContext, useState, useEffect } from 'react';
import { ref, onValue } from 'firebase/database';
import { db } from '../firebase';

export interface MaintenanceSettings {
  isActive: boolean;
  title: string;
  description: string;
  showTimer: boolean;
  endTime?: string;
}

export interface HeadlineSettings {
  isActive: boolean;
  speed: number;
  content?: Record<string, string>;
}

export interface AppSettings {
  appName?: string;
  supportContact?: string;
  minWithdraw?: number;
  qrCodeUrl?: string;
  logoUrl?: string;
  signupBonus?: number;
  referralBonus?: number;
  maintenance?: MaintenanceSettings;
  headline?: HeadlineSettings;
  upiDetails?: string;
  maintenanceMode?: boolean;
  announcementText?: string;
  policyPrivacy?: string;
  policyTerms?: string;
  policyRefund?: string;
  policyFairPlay?: string;
  theme?: {
    primaryH: number;
    primaryS: number;
    primaryL: number;
    accentH: number;
    accentS: number;
    accentL: number;
    bgL: number;
    cardOpacity: number;
    activePreset?: string;
  };
  updateConfig?: {
    lastHardRefresh?: number;
    forceUpdate?: boolean;
    appVersion?: string;
    appLink?: string;
  };
}


interface SettingsContextProps {
  settings: AppSettings;
  loading: boolean;
}

const SettingsContext = createContext<SettingsContextProps | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<AppSettings>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const settingsRef = ref(db, 'settings');
    const unsubscribe = onValue(settingsRef, (snapshot) => {
      if (snapshot.exists()) {
        const val = snapshot.val();
        setSettings(val);

        // Dynamically inject settings HSL variables into root style
        if (val.theme) {
          const root = document.documentElement;
          const { primaryH, primaryS, primaryL, accentH, accentS, accentL, bgL, cardOpacity, activePreset } = val.theme;

          if (activePreset === 'default') {
            // Restore exact default solid colors
            root.style.setProperty('--primary-bg', '#0F172A');
            root.style.setProperty('--secondary-bg', '#1E293B');
            root.style.setProperty('--card-bg', '#1E293B');
            root.style.setProperty('--border-color', '#334155');
            root.style.setProperty('--accent-color', '#FACC15');
            root.style.setProperty('--accent-gradient', 'linear-gradient(to right, #FACC15, #FBBF24)');
            root.style.setProperty('--primary-button-bg', '#3B82F6');
          } else {
            root.style.setProperty('--primary-bg', `hsl(${primaryH}, ${primaryS}%, ${bgL}%)`);
            root.style.setProperty('--secondary-bg', `hsl(${primaryH}, ${primaryS}%, ${Math.max(5, bgL + 4)}%)`);
            root.style.setProperty('--card-bg', `hsla(${primaryH}, ${primaryS}%, ${Math.max(8, bgL + 8)}%, ${cardOpacity})`);
            root.style.setProperty('--border-color', `hsla(${primaryH}, ${primaryS}%, 20%, 0.45)`);
            
            root.style.setProperty('--accent-color', `hsl(${accentH}, ${accentS}%, ${accentL}%)`);
            root.style.setProperty('--accent-gradient', `linear-gradient(to right, hsl(${accentH}, ${accentS}%, ${accentL}%), hsl(${accentH}, ${accentS}%, ${Math.max(20, accentL - 8)}%))`);
            root.style.setProperty('--primary-button-bg', `hsl(${primaryH}, ${primaryS}%, ${primaryL}%)`);
          }
          
          // Clear old preset classes on body
          document.body.className = document.body.className.replace(/\btheme-\S+/g, '');
          
          // Add current preset class
          if (activePreset && activePreset !== 'custom') {
            document.body.classList.add(`theme-${activePreset}`);
          }
        }
      }
      setLoading(false);
    }, (err) => {
      console.error('Error fetching settings:', err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, loading }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('useSettings must be used within a SettingsProvider');
  return context;
};
