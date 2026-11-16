import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  Grid,
  Waves,
  Image as ImageIcon,
  Cpu,
  CircleDot,
  Check,
  Sliders,
  X,
  ExternalLink,
} from 'lucide-react';
import { BackgroundStyle } from '../types';
import {
  CURATED_WALLPAPERS,
  getStoredBackgroundSettings,
  setStoredBackgroundSettings,
  BackgroundSettings,
} from './AnimatedDotMatrix';

interface BackgroundPickerProps {
  className?: string;
  theme?: 'light' | 'dark';
}

interface StyleCard {
  id: BackgroundStyle;
  name: string;
  tagline: string;
  recommendedFor: 'light' | 'both' | 'dark';
  icon: React.ElementType;
  previewGradient: string;
}

const STYLE_CARDS: StyleCard[] = [
  {
    id: 'aurora',
    name: 'Sonoma Light Aura',
    tagline: 'Lush Apple-style ambient daylight mesh glow (No dots)',
    recommendedFor: 'light',
    icon: Sparkles,
    previewGradient: 'from-blue-500 via-cyan-400 to-amber-300',
  },
  {
    id: 'blueprint',
    name: 'Architectural Grid',
    tagline: 'Crisp drafting graph paper & subtle coordinates',
    recommendedFor: 'both',
    icon: Grid,
    previewGradient: 'from-slate-200 via-blue-200 to-indigo-100 dark:from-slate-800 dark:to-slate-900',
  },
  {
    id: 'silk',
    name: 'Fluid Silk Wave',
    tagline: 'Smooth 3D satin gradient curves that deflect with mouse',
    recommendedFor: 'both',
    icon: Waves,
    previewGradient: 'from-indigo-500 via-purple-400 to-pink-400',
  },
  {
    id: 'wallpaper',
    name: 'HD Aesthetic Wallpaper',
    tagline: 'High-res abstract 3D, landscape, or custom wallpaper',
    recommendedFor: 'both',
    icon: ImageIcon,
    previewGradient: 'from-emerald-400 via-teal-500 to-cyan-600',
  },
  {
    id: 'matrix',
    name: 'Cyber Constellation',
    tagline: 'Interactive network nodes and travelling data packets',
    recommendedFor: 'dark',
    icon: Cpu,
    previewGradient: 'from-cyan-400 to-blue-600',
  },
  {
    id: 'minimal',
    name: 'Clean Minimal Studio',
    tagline: 'Distraction-free pure off-white studio canvas',
    recommendedFor: 'light',
    icon: CircleDot,
    previewGradient: 'from-slate-100 to-slate-200 dark:from-slate-900 dark:to-black',
  },
];

export const BackgroundPicker: React.FC<BackgroundPickerProps> = ({ className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [settings, setSettings] = useState<BackgroundSettings>(getStoredBackgroundSettings());
  const [customUrlInput, setCustomUrlInput] = useState('');
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleSettingsChange = (e: Event) => {
      const customEvent = e as CustomEvent<BackgroundSettings>;
      if (customEvent.detail) {
        setSettings(customEvent.detail);
      }
    };
    window.addEventListener('scholarboard:bg-settings-change', handleSettingsChange);
    return () => {
      window.removeEventListener('scholarboard:bg-settings-change', handleSettingsChange);
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleSelectStyle = (style: BackgroundStyle) => {
    const updated = { style };
    setSettings((prev) => ({ ...prev, ...updated }));
    setStoredBackgroundSettings(updated);
  };

  const handleSelectWallpaper = (url: string) => {
    const updated = { style: 'wallpaper' as BackgroundStyle, wallpaperUrl: url };
    setSettings((prev) => ({ ...prev, ...updated }));
    setStoredBackgroundSettings(updated);
  };

  const handleApplyCustomUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (customUrlInput.trim()) {
      handleSelectWallpaper(customUrlInput.trim());
      setCustomUrlInput('');
    }
  };

  const handleIntensityChange = (val: number) => {
    const updated = { intensity: val };
    setSettings((prev) => ({ ...prev, ...updated }));
    setStoredBackgroundSettings(updated);
  };

  const currentCard = STYLE_CARDS.find((c) => c.id === settings.style) || STYLE_CARDS[0];
  const CurrentIcon = currentCard.icon;

  return (
    <div className={`relative inline-block ${className}`} ref={popoverRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        id="bg-picker-toggle-btn"
        className={`h-[34px] sm:h-[36px] flex items-center justify-center gap-1.5 py-1 px-2.5 sm:px-3 rounded-lg border border-[var(--border)] bg-[var(--surface-higher)] hover:bg-[var(--surface-highest)] text-xs font-semibold transition cursor-pointer shadow-2xs shrink-0 active:scale-[0.98] ${
          isOpen ? 'ring-2 ring-blue-500/40 border-blue-500/50' : ''
        }`}
        title="Customize Background Atmosphere & Wallpaper"
        aria-label="Change Background Style"
      >
        <span className="relative flex items-center justify-center shrink-0">
          <CurrentIcon className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
          <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
        </span>
        <span className="hidden sm:inline text-[var(--ink)] text-xs font-medium truncate max-w-[120px]">
          {currentCard.name}
        </span>
      </button>

      {/* Popover / Modal Menu */}
      {isOpen && (
        <div className="fixed inset-x-2.5 top-3 sm:top-auto sm:inset-x-auto sm:absolute sm:right-0 sm:mt-2 w-auto sm:w-[400px] max-w-[calc(100vw-20px)] max-h-[82dvh] overflow-y-auto rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-2xl p-3.5 sm:p-4 z-50 animate-in fade-in zoom-in-95 duration-150 backdrop-blur-2xl">
          {/* Header */}
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-[var(--border)]">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <h3 className="text-sm font-bold text-[var(--ink)]">
                  Background Atmosphere
                </h3>
              </div>
              <p className="text-[11px] text-[var(--ink-muted)] mt-0.5">
                Instant live preview across light & dark themes
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-lg text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-higher)] transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Primary Style Cards Grid */}
          <div className="space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--ink-muted)] px-1">
              Select Background Archetype
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {STYLE_CARDS.map((card) => {
                const isSelected = settings.style === card.id;
                const IconComp = card.icon;

                return (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => handleSelectStyle(card.id)}
                    id={`bg-style-card-${card.id}`}
                    className={`flex flex-col text-left p-2.5 rounded-xl border transition cursor-pointer relative overflow-hidden ${
                      isSelected
                        ? 'bg-blue-500/10 border-blue-500/60 shadow-sm ring-1 ring-blue-500/30'
                        : 'border-[var(--border)] bg-[var(--surface-higher)] hover:bg-[var(--surface-highest)] hover:border-[var(--border-hover)]'
                    }`}
                  >
                    {/* Top Preview Bar */}
                    <div
                      className={`h-2.5 w-full rounded-md bg-gradient-to-r ${card.previewGradient} mb-2 shadow-xs`}
                    />

                    <div className="flex items-start justify-between gap-1">
                      <div className="flex items-center gap-1.5">
                        <IconComp
                          className={`w-3.5 h-3.5 shrink-0 ${
                            isSelected
                              ? 'text-blue-600 dark:text-blue-400 font-bold'
                              : 'text-[var(--ink-muted)]'
                          }`}
                        />
                        <span className="text-xs font-semibold text-[var(--ink)]">
                          {card.name}
                        </span>
                      </div>
                      {isSelected && (
                        <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                      )}
                    </div>

                    <p className="text-[10.5px] text-[var(--ink-muted)] leading-tight mt-1 line-clamp-2">
                      {card.tagline}
                    </p>

                    {card.recommendedFor === 'light' && (
                      <span className="mt-1.5 inline-block text-[9px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-md w-fit">
                        Light Mode Pick
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* If Wallpaper Style is selected, show curated wallpaper options */}
          {settings.style === 'wallpaper' && (
            <div className="mt-4 pt-3 border-t border-[var(--border)] space-y-2.5">
              <div className="flex items-center justify-between px-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--ink-muted)]">
                  Curated Wallpapers
                </span>
                <span className="text-[10px] text-[var(--ink-muted)]">High-Res</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {CURATED_WALLPAPERS.map((wp) => {
                  const isWpSelected = settings.wallpaperUrl === wp.url;
                  return (
                    <button
                      key={wp.id}
                      type="button"
                      onClick={() => handleSelectWallpaper(wp.url)}
                      className={`group relative rounded-xl overflow-hidden border text-left p-1 transition cursor-pointer ${
                        isWpSelected
                          ? 'border-blue-500 ring-2 ring-blue-500/40'
                          : 'border-[var(--border)] hover:border-blue-400'
                      }`}
                    >
                      <div className="h-14 w-full rounded-lg overflow-hidden relative bg-slate-100 dark:bg-slate-800">
                        <img
                          src={wp.url}
                          alt={wp.name}
                          className="w-full h-full object-cover transition duration-300 group-hover:scale-105"
                          referrerPolicy="no-referrer"
                          loading="lazy"
                        />
                        {isWpSelected && (
                          <div className="absolute inset-0 bg-blue-600/30 flex items-center justify-center">
                            <span className="bg-blue-600 text-white p-1 rounded-full shadow">
                              <Check className="w-3 h-3" />
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="px-1 py-1">
                        <div className="text-[10.5px] font-semibold text-[var(--ink)] truncate">
                          {wp.name}
                        </div>
                        <div className="text-[9px] text-[var(--ink-muted)] truncate">
                          {wp.category}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Custom Image URL Input */}
              <form onSubmit={handleApplyCustomUrl} className="mt-2 flex flex-col xs:flex-row gap-1.5">
                <input
                  type="url"
                  placeholder="Or paste any custom image URL..."
                  value={customUrlInput}
                  onChange={(e) => setCustomUrlInput(e.target.value)}
                  className="flex-1 min-w-0 text-xs px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-higher)] text-[var(--ink)] focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                />
                <button
                  type="submit"
                  disabled={!customUrlInput.trim()}
                  className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer transition shrink-0"
                >
                  Apply
                </button>
              </form>
            </div>
          )}

          {/* Intensity & Contrast Slider */}
          <div className="mt-4 pt-3 border-t border-[var(--border)] space-y-2">
            <div className="flex items-center justify-between text-xs px-1">
              <span className="flex items-center gap-1.5 font-medium text-[var(--ink)]">
                <Sliders className="w-3.5 h-3.5 text-[var(--ink-muted)]" />
                Background Brightness & Intensity
              </span>
              <span className="font-mono text-xs text-blue-600 dark:text-blue-400 font-bold">
                {Math.round(settings.intensity * 100)}%
              </span>
            </div>

            <input
              type="range"
              min="0.2"
              max="1.0"
              step="0.05"
              value={settings.intensity}
              onChange={(e) => handleIntensityChange(parseFloat(e.target.value))}
              className="w-full accent-blue-600 cursor-pointer"
            />
          </div>

          {/* Footer note */}
          <div className="mt-3 pt-2.5 border-t border-[var(--border)] flex flex-wrap items-center justify-between gap-1 text-[10px] text-[var(--ink-muted)] px-1">
            <span>Changes persist automatically across sessions</span>
            <span className="font-semibold text-blue-600 dark:text-blue-400">
              Live Atmosphere
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
