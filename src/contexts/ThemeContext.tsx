import React, { createContext, useContext, useState, useEffect } from 'react';
import { ref, onValue, set } from 'firebase/database';
import { db } from '../firebase';


export interface ThemeColors {
  'primary-bg': string;
  'secondary-bg': string;
  'card-bg': string;
  'text-primary': string;
  'text-secondary': string;
  'accent-color': string;
  'primary-button-bg': string;
  'border-color': string;
  'success-color': string;
  'danger-color': string;
  'warning-color': string;
  'info-color': string;
  'sidebar-bg'?: string;
}

export const defaultTheme: ThemeColors = {
  'primary-bg': '#0F172A',
  'secondary-bg': '#1E293B',
  'card-bg': '#1E293B',
  'sidebar-bg': '#111827',
  'text-primary': '#E2E8F0',
  'text-secondary': '#94A3B8',
  'accent-color': '#FACC15',
  'primary-button-bg': '#3B82F6',
  'border-color': '#334155',
  'success-color': '#10B981',
  'danger-color': '#EF4444',
  'warning-color': '#F59E0B',
  'info-color': '#60A5FA'
};

export const themePresets: Record<string, ThemeColors> = {
  default: defaultTheme,
  light: {
    'primary-bg': '#F1F5F9',
    'secondary-bg': '#FFFFFF',
    'card-bg': '#FFFFFF',
    'sidebar-bg': '#E2E8F0',
    'text-primary': '#0F172A',
    'text-secondary': '#475569',
    'accent-color': '#F59E0B',
    'primary-button-bg': '#2563EB',
    'border-color': '#E2E8F0',
    'success-color': '#16A34A',
    'danger-color': '#DC2626',
    'warning-color': '#D97706',
    'info-color': '#3B82F6'
  },
  gamingRed: {
    'primary-bg': '#111827',
    'secondary-bg': '#1F2937',
    'card-bg': '#1F2937',
    'sidebar-bg': '#030712',
    'text-primary': '#F9FAFB',
    'text-secondary': '#9CA3AF',
    'accent-color': '#EF4444',
    'primary-button-bg': '#D97706',
    'border-color': '#374151',
    'success-color': '#10B981',
    'danger-color': '#EF4444',
    'warning-color': '#F59E0B',
    'info-color': '#3B82F6'
  },
  diwali: {
    'primary-bg': '#1e0524',
    'secondary-bg': '#350a3d',
    'card-bg': '#350a3d',
    'sidebar-bg': '#16021a',
    'text-primary': '#FFEAA7',
    'text-secondary': '#E2B13C',
    'accent-color': '#FF9F43',
    'primary-button-bg': '#D63031',
    'border-color': '#5f0f6d',
    'success-color': '#10B981',
    'danger-color': '#EF4444',
    'warning-color': '#F59E0B',
    'info-color': '#60A5FA'
  },
  holi: {
    'primary-bg': '#0f1c3f',
    'secondary-bg': '#192b5e',
    'card-bg': '#192b5e',
    'sidebar-bg': '#091129',
    'text-primary': '#FF7675',
    'text-secondary': '#00CEC9',
    'accent-color': '#E84393',
    'primary-button-bg': '#6C5CE7',
    'border-color': '#2a448a',
    'success-color': '#10B981',
    'danger-color': '#EF4444',
    'warning-color': '#F59E0B',
    'info-color': '#60A5FA'
  },
  independence: {
    'primary-bg': '#0C1A14',
    'secondary-bg': '#193026',
    'card-bg': '#193026',
    'sidebar-bg': '#07100c',
    'text-primary': '#FFFFFF',
    'text-secondary': '#FF9933',
    'accent-color': '#128807',
    'primary-button-bg': '#000080',
    'border-color': '#284d3d',
    'success-color': '#128807',
    'danger-color': '#FF9933',
    'warning-color': '#F59E0B',
    'info-color': '#60A5FA'
  },
  christmas: {
    'primary-bg': '#0F1E16',
    'secondary-bg': '#1C3528',
    'card-bg': '#1C3528',
    'sidebar-bg': '#09130E',
    'text-primary': '#F3F4F6',
    'text-secondary': '#EF4444',
    'accent-color': '#10B981',
    'primary-button-bg': '#DC2626',
    'border-color': '#2c533e',
    'success-color': '#10B981',
    'danger-color': '#EF4444',
    'warning-color': '#F59E0B',
    'info-color': '#60A5FA'
  },
  newYear: {
    'primary-bg': '#090A0F',
    'secondary-bg': '#151722',
    'card-bg': '#151722',
    'sidebar-bg': '#040508',
    'text-primary': '#FFFFFF',
    'text-secondary': '#D1D5DB',
    'accent-color': '#F59E0B',
    'primary-button-bg': '#F59E0B',
    'border-color': '#282C3F',
    'success-color': '#10B981',
    'danger-color': '#EF4444',
    'warning-color': '#F59E0B',
    'info-color': '#60A5FA'
  }
};

interface ThemeContextProps {
  currentTheme: ThemeColors;
  saveTheme: (colors: ThemeColors) => Promise<void>;
  resetTheme: () => Promise<void>;
  applyPreset: (presetName: string) => void;
}

const ThemeContext = createContext<ThemeContextProps | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentTheme, setCurrentTheme] = useState<ThemeColors>(defaultTheme);

  // Apply a theme configuration directly to CSS properties
  const applyThemeColors = (theme: ThemeColors) => {
    const root = document.documentElement;
    Object.entries(theme).forEach(([key, val]) => {
      if (val) root.style.setProperty(`--${key}`, val);
    });
    // Handle gradient computed from accent-color if needed
    if (theme['accent-color']) {
      root.style.setProperty('--accent-gradient', `linear-gradient(to right, ${theme['accent-color']}, #FBBF24)`);
    }
  };

  useEffect(() => {
    // Listen to Firebase RTDB database-wide settings/theme
    const themeRef = ref(db, 'settings/theme');
    const unsubscribe = onValue(themeRef, (snapshot) => {
      if (snapshot.exists()) {
        const themeData = snapshot.val() as ThemeColors;
        const mergedTheme = { ...defaultTheme, ...themeData };
        setCurrentTheme(mergedTheme);
        applyThemeColors(mergedTheme);
      } else {
        setCurrentTheme(defaultTheme);
        applyThemeColors(defaultTheme);
      }
    });

    return () => unsubscribe();
  }, []);

  const saveTheme = async (colors: ThemeColors) => {
    await set(ref(db, 'settings/theme'), colors);
  };

  const resetTheme = async () => {
    await set(ref(db, 'settings/theme'), null);
  };

  const applyPreset = (presetName: string) => {
    const preset = themePresets[presetName] || defaultTheme;
    setCurrentTheme(preset);
    applyThemeColors(preset);
  };

  return (
    <ThemeContext.Provider value={{ currentTheme, saveTheme, resetTheme, applyPreset }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within a ThemeProvider');
  return context;
};
