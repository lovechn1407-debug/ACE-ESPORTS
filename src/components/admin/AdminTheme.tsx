import React, { useEffect, useState } from 'react';
import { ref, get, set } from 'firebase/database';
import { db } from '../../firebase';


interface ThemeConfig {
  primaryH: number;
  primaryS: number;
  primaryL: number;
  accentH: number;
  accentS: number;
  accentL: number;
  bgL: number;
  cardOpacity: number;
  activePreset?: string;
}

const PRESETS: Record<string, ThemeConfig> = {
  'Default Theme (Esports Dark)': {
    primaryH: 217, primaryS: 91, primaryL: 60,
    accentH: 47, accentS: 95, accentL: 53,
    bgL: 9, cardOpacity: 0.12,
    activePreset: 'default'
  },
  'Holi Festival (Dynamic Pink)': {
    primaryH: 330, primaryS: 85, primaryL: 55,
    accentH: 190, accentS: 90, accentL: 50,
    bgL: 8, cardOpacity: 0.12,
    activePreset: 'holi'
  },
  'Diwali Light (Bright Gold)': {
    primaryH: 35, primaryS: 90, primaryL: 50,
    accentH: 15, accentS: 95, accentL: 50,
    bgL: 6, cardOpacity: 0.15,
    activePreset: 'diwali'
  },
  'Gaming Cyberpunk (Red & Cyan)': {
    primaryH: 345, primaryS: 95, primaryL: 48,
    accentH: 180, accentS: 100, accentL: 45,
    bgL: 7, cardOpacity: 0.1,
    activePreset: 'cyberpunk'
  },
  'Deep Emerald (Modern Forest)': {
    primaryH: 160, primaryS: 80, primaryL: 40,
    accentH: 45, accentS: 90, accentL: 50,
    bgL: 9, cardOpacity: 0.14,
    activePreset: 'emerald'
  }
};

const AdminTheme: React.FC = () => {
  const [theme, setTheme] = useState<ThemeConfig>({
    primaryH: 345, primaryS: 95, primaryL: 48,
    accentH: 180, accentS: 100, accentL: 45,
    bgL: 7, cardOpacity: 0.1,
    activePreset: 'custom'
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchTheme = async () => {
      try {
        const snap = await get(ref(db, 'settings/theme'));
        if (snap.exists()) {
          setTheme(snap.val());
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchTheme();
  }, []);

  const handleSliderChange = (field: keyof ThemeConfig, val: number) => {
    setTheme(prev => ({
      ...prev,
      [field]: val,
      activePreset: 'custom'
    }));
  };

  const applyPreset = async (presetName: string) => {
    const preset = PRESETS[presetName];
    if (preset) {
      setTheme(preset);
      try {
        await set(ref(db, 'settings/theme'), preset);
      } catch (err) {
        console.error('Failed to auto-apply preset:', err);
      }
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await set(ref(db, 'settings/theme'), theme);
      alert('Theme configuration updated successfully! Changes will propagate in real-time to all clients.');
    } catch (err: any) {
      alert('Failed to save theme: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-theme-view">
      <h2 className="mb-4">Live Theme Customization</h2>

      {loading ? (
        <div className="placeholder-glow py-5 rounded-3" style={{ height: '300px' }}></div>
      ) : (
        <div className="row g-4 text-start">
          {/* Controls Card */}
          <div className="col-lg-7">
            <div className="card custom-card p-4">
              <h5 className="mb-3 text-white">Visual Settings Sliders</h5>

              {/* Presets Grid */}
              <div className="mb-4">
                <span className="small text-secondary mb-2 d-block">Preconfigured Presets</span>
                <div className="row g-2">
                  {Object.keys(PRESETS).map(name => (
                    <div className="col-6" key={name}>
                      <button 
                        type="button" 
                        className="btn btn-sm btn-outline-warning w-100 py-2 small"
                        onClick={() => applyPreset(name)}
                      >
                        {name}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <hr className="border-secondary border-opacity-30" />

              {/* Primary HSL */}
              <div className="mb-3">
                <label className="form-label d-flex justify-content-between">
                  <span>Primary Color Hue</span>
                  <span className="text-accent">{theme.primaryH}°</span>
                </label>
                <input 
                  type="range" className="form-range" min="0" max="360"
                  value={theme.primaryH} onChange={(e) => handleSliderChange('primaryH', Number(e.target.value))}
                />
              </div>

              <div className="row g-3 mb-3">
                <div className="col-6">
                  <label className="form-label d-flex justify-content-between">
                    <span>Saturation</span>
                    <span className="text-secondary">{theme.primaryS}%</span>
                  </label>
                  <input 
                    type="range" className="form-range" min="0" max="100"
                    value={theme.primaryS} onChange={(e) => handleSliderChange('primaryS', Number(e.target.value))}
                  />
                </div>
                <div className="col-6">
                  <label className="form-label d-flex justify-content-between">
                    <span>Lightness</span>
                    <span className="text-secondary">{theme.primaryL}%</span>
                  </label>
                  <input 
                    type="range" className="form-range" min="20" max="80"
                    value={theme.primaryL} onChange={(e) => handleSliderChange('primaryL', Number(e.target.value))}
                  />
                </div>
              </div>

              <hr className="border-secondary border-opacity-25" />

              {/* Accent HSL */}
              <div className="mb-3">
                <label className="form-label d-flex justify-content-between">
                  <span>Accent Color Hue</span>
                  <span className="text-accent">{theme.accentH}°</span>
                </label>
                <input 
                  type="range" className="form-range" min="0" max="360"
                  value={theme.accentH} onChange={(e) => handleSliderChange('accentH', Number(e.target.value))}
                />
              </div>

              <div className="row g-3 mb-3">
                <div className="col-6">
                  <label className="form-label d-flex justify-content-between">
                    <span>Saturation</span>
                    <span className="text-secondary">{theme.accentS}%</span>
                  </label>
                  <input 
                    type="range" className="form-range" min="0" max="100"
                    value={theme.accentS} onChange={(e) => handleSliderChange('accentS', Number(e.target.value))}
                  />
                </div>
                <div className="col-6">
                  <label className="form-label d-flex justify-content-between">
                    <span>Lightness</span>
                    <span className="text-secondary">{theme.accentL}%</span>
                  </label>
                  <input 
                    type="range" className="form-range" min="20" max="80"
                    value={theme.accentL} onChange={(e) => handleSliderChange('accentL', Number(e.target.value))}
                  />
                </div>
              </div>

              <hr className="border-secondary border-opacity-25" />

              {/* Background Lightness & Card Opacity */}
              <div className="row g-3 mb-4">
                <div className="col-6">
                  <label className="form-label d-flex justify-content-between">
                    <span>Dark BG Lightness</span>
                    <span className="text-secondary">{theme.bgL}%</span>
                  </label>
                  <input 
                    type="range" className="form-range" min="2" max="15"
                    value={theme.bgL} onChange={(e) => handleSliderChange('bgL', Number(e.target.value))}
                  />
                </div>
                <div className="col-6">
                  <label className="form-label d-flex justify-content-between">
                    <span>Card Glass Opacity</span>
                    <span className="text-secondary">{theme.cardOpacity}</span>
                  </label>
                  <input 
                    type="range" className="form-range" min="0.05" max="0.3" step="0.01"
                    value={theme.cardOpacity} onChange={(e) => handleSliderChange('cardOpacity', Number(e.target.value))}
                  />
                </div>
              </div>

              <button className="btn-custom btn-custom-accent w-100" onClick={handleSave} disabled={saving}>
                {saving ? 'Updating Live DB...' : 'Apply Live Theme'}
              </button>
            </div>
          </div>

          {/* Preview Panel Card */}
          <div className="col-lg-5">
            <div className="card custom-card p-4 h-100 d-flex flex-column align-items-stretch" style={{
              background: `hsl(${theme.primaryH}, ${theme.primaryS}%, ${theme.bgL}%)`,
              border: `1px solid hsl(${theme.primaryH}, ${theme.primaryS}%, 20%)`
            }}>
              <h5 className="mb-4 text-white">Live Client Preview</h5>

              {/* Preview components */}
              <div 
                className="p-3 mb-3 text-start" 
                style={{
                  background: `hsla(0, 0%, 100%, ${theme.cardOpacity})`,
                  backdropFilter: 'blur(10px)',
                  borderRadius: '12px',
                  border: `1px solid hsla(0, 0%, 100%, ${theme.cardOpacity + 0.1})`
                }}
              >
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <span style={{ color: `hsl(${theme.accentH}, ${theme.accentS}%, ${theme.accentL}%)`, fontSize: '0.8rem', fontWeight: 'bold' }}>PREVIEW ACCENT</span>
                  <span className="badge text-uppercase" style={{ background: `hsl(${theme.primaryH}, ${theme.primaryS}%, ${theme.primaryL}%)` }}>status</span>
                </div>
                <h6 className="text-white mb-2">Glassmorphic Container</h6>
                <p className="small text-secondary mb-0">This demonstrates card contrast against backdrops.</p>
              </div>

              <button 
                type="button" 
                className="py-2 px-4 rounded-3 border-0 text-white mb-2 font-monospace fw-bold"
                style={{
                  background: `linear-gradient(135deg, hsl(${theme.primaryH}, ${theme.primaryS}%, ${theme.primaryL}%), hsl(${theme.primaryH}, ${theme.primaryS}%, ${theme.primaryL - 10}%))`
                }}
              >
                Primary Button
              </button>

              <button 
                type="button" 
                className="py-2 px-4 rounded-3 border-0 text-dark font-monospace fw-bold"
                style={{
                  background: `linear-gradient(135deg, hsl(${theme.accentH}, ${theme.accentS}%, ${theme.accentL}%), hsl(${theme.accentH}, ${theme.accentS}%, ${theme.accentL - 10}%))`
                }}
              >
                Accent Button
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminTheme;
