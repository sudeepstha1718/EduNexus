import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { ClassItem } from '../types';
import { AnimatedDotMatrix } from './AnimatedDotMatrix';
import { BackgroundPicker } from './BackgroundPicker';
import { AppLogo } from './AppLogo';
import { verifyClassPassword, fetchLockoutStatus } from '../lib/api';
import {
  formatLockoutCountdown,
  getCachedLockoutUntil,
  setCachedLockoutUntil,
} from '../lib/deviceFingerprint';
import {
  ShieldCheck,
  ChevronDown,
  ArrowRight,
  AlertCircle,
  Eye,
  EyeOff,
  Sun,
  Moon,
  GraduationCap,
  BookOpen,
  RefreshCw,
  Clock,
} from 'lucide-react';

interface ClassPortalProps {
  classes: ClassItem[];
  onUnlockClass: (classId: string) => void;
  onOpenAdminLogin: () => void;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
}

export const ClassPortal: React.FC<ClassPortalProps> = ({
  classes,
  onUnlockClass,
  onOpenAdminLogin,
  theme = 'dark',
  onToggleTheme,
}) => {
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [lockedUntilMs, setLockedUntilMs] = useState<number>(() => getCachedLockoutUntil('class'));
  const [lockoutSeconds, setLockoutSeconds] = useState<number>(() => {
    const until = getCachedLockoutUntil('class');
    return until > Date.now() ? Math.ceil((until - Date.now()) / 1000) : 0;
  });

  useEffect(() => {
    let cancelled = false;
    fetchLockoutStatus('class', selectedClassId || undefined)
      .then((status) => {
        if (cancelled) return;
        if (status.locked && status.retryAfterSeconds > 0) {
          const until = status.lockedUntil || Date.now() + status.retryAfterSeconds * 1000;
          setLockedUntilMs(until);
          setLockoutSeconds(Math.max(1, Math.ceil((until - Date.now()) / 1000)));
        } else if (!status.locked) {
          setLockedUntilMs(0);
          setLockoutSeconds(0);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selectedClassId]);

  useEffect(() => {
    if (!lockedUntilMs || lockedUntilMs <= Date.now()) {
      setLockoutSeconds(0);
      return;
    }
    const tick = () => {
      const remaining = Math.ceil((lockedUntilMs - Date.now()) / 1000);
      if (remaining <= 0) {
        setLockedUntilMs(0);
        setLockoutSeconds(0);
        setCachedLockoutUntil('class', 0);
        setError('');
      } else {
        setLockoutSeconds(remaining);
      }
    };
    tick();
    const timer = setInterval(tick, 500);
    return () => clearInterval(timer);
  }, [lockedUntilMs]);

  const isLocked = lockoutSeconds > 0;
  const selectedClass = classes.find((c) => c.id === selectedClassId);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked || isVerifying) return;

    if (!selectedClassId) {
      setError('Please select a target classroom to proceed.');
      return;
    }

    if (!selectedClass) {
      setError('Selected classroom could not be found. Please choose a valid class.');
      return;
    }

    setIsVerifying(true);
    setError('');
    try {
      await verifyClassPassword(selectedClass.id, passwordInput.trim());
      setPasswordInput('');
      setLockedUntilMs(0);
      setLockoutSeconds(0);
      onUnlockClass(selectedClass.id);
    } catch (err: any) {
      setPasswordInput('');
      if (err?.retryAfterSeconds && Number(err.retryAfterSeconds) > 0) {
        const until = Number(err.lockedUntil) || Date.now() + Number(err.retryAfterSeconds) * 1000;
        setLockedUntilMs(until);
        setLockoutSeconds(Math.max(1, Math.ceil((until - Date.now()) / 1000)));
      }
      setError(err?.message || `Access denied: Invalid passcode for ${selectedClass.name}.`);
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[var(--bg)] text-[var(--ink)] flex flex-col justify-between relative overflow-x-hidden overflow-y-auto font-sans select-none transition-colors duration-200">
      {/* Dynamic Animated Dot Matrix Canvas across full viewport */}
      <AnimatedDotMatrix />

      {/* Atmospheric Ambient Glows */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-0 inset-x-0 h-80 bg-gradient-to-b from-blue-500/10 dark:from-blue-500/[0.035] to-transparent" />
        <div className="absolute top-1/4 left-1/5 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-tr from-blue-500/15 via-sky-400/10 to-transparent dark:bg-blue-500/[0.08] rounded-full blur-[140px]" />
        <div className="absolute bottom-1/4 right-1/6 translate-x-1/4 translate-y-1/4 w-[500px] h-[500px] bg-gradient-to-bl from-indigo-500/15 via-cyan-400/10 to-transparent dark:bg-cyan-500/[0.06] rounded-full blur-[120px]" />
      </div>

      {/* Top Navigation Bar */}
      <header className="relative z-20 w-full border-b border-[var(--border)] bg-[var(--surface)]/70 backdrop-blur-md transition-colors duration-200 shrink-0">
        <div className="max-w-[1720px] mx-auto px-3 xs:px-4 sm:px-8 lg:px-16 xl:px-24 py-2 xs:py-2.5 sm:py-3.5 flex items-center justify-between gap-2 sm:gap-3">
          {/* Brand: Custom Emblem + EduNexus */}
          <div className="flex items-center gap-2 xs:gap-2.5 sm:gap-3 shrink-0">
            <AppLogo size={28} className="xs:w-[32px] xs:h-[32px] sm:w-[34px] sm:h-[34px]" />
            <div className="flex flex-col">
              <span className="font-black text-base xs:text-lg sm:text-2xl tracking-tight text-[var(--ink)] leading-none">
                Edu<span className="text-amber-500 font-extrabold">Nexus</span>
              </span>
              <span className="text-[10px] sm:text-xs font-bold tracking-wider uppercase text-amber-600 dark:text-amber-400 mt-0.5">
                Learning Portal
              </span>
            </div>
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-1 xs:gap-1.5 sm:gap-2.5 shrink-0">
            <BackgroundPicker theme={theme} />

            {onToggleTheme && (
              <button
                type="button"
                onClick={onToggleTheme}
                id="portal-theme-toggle-btn"
                className="p-1.5 xs:p-2 sm:p-2.5 rounded-lg xs:rounded-xl bg-[var(--surface-higher)] hover:bg-[var(--surface-highest)] border border-[var(--border)] text-[var(--ink-muted)] hover:text-[var(--ink)] transition cursor-pointer shadow-sm active:scale-95"
                title={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
                aria-label="Toggle Theme"
              >
                {theme === 'dark' ? (
                  <Sun className="w-3.5 h-3.5 xs:w-4 xs:h-4 text-amber-400" />
                ) : (
                  <Moon className="w-3.5 h-3.5 xs:w-4 xs:h-4 text-blue-500" />
                )}
              </button>
            )}

            <button
              type="button"
              onClick={onOpenAdminLogin}
              id="portal-admin-btn"
              className="flex items-center gap-1 xs:gap-1.5 sm:gap-2 px-2 xs:px-2.5 sm:px-3 py-1.5 xs:py-2 rounded-lg xs:rounded-xl bg-[var(--surface-higher)] hover:bg-[var(--surface-highest)] border border-[var(--border)] text-[11px] xs:text-xs font-mono font-medium text-blue-600 dark:text-blue-400 hover:text-blue-500 transition cursor-pointer shadow-sm active:scale-95"
            >
              <ShieldCheck className="w-3.5 h-3.5 xs:w-4 xs:h-4 shrink-0" />
              <span className="hidden xs:inline">Admin</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Split Hero & Gate Access View */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-3.5 xs:px-5 sm:px-8 lg:px-14 xl:px-20 py-3 xs:py-4 sm:py-6 lg:py-4 w-full">
        <div className="w-full max-w-[1540px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-5 xs:gap-6 sm:gap-10 lg:gap-12 xl:gap-16 items-center">
          
          {/* Left Column: Bold, Large & Impactful Learning Portal Hero */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="lg:col-span-7 xl:col-span-7 space-y-2.5 xs:space-y-3.5 sm:space-y-4 lg:space-y-5 text-center lg:text-left"
          >
            {/* Tag */}
            <div className="inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-[10.5px] sm:text-xs font-semibold tracking-wider text-amber-600 dark:text-amber-400 uppercase max-w-full">
              <GraduationCap className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span className="truncate">Learning Portal &bull; Student Access</span>
            </div>

            {/* Headline - Properly proportioned and responsive */}
            <h1 className="text-2xl xs:text-3xl sm:text-4xl lg:text-[42px] xl:text-5xl font-black tracking-tight text-[var(--ink)] leading-[1.1]">
              Digital Learning<br />
              <span className="text-amber-500 font-black">Portal.</span>
            </h1>

            {/* Subtitle description */}
            <p className="text-[var(--ink-muted)] text-xs sm:text-sm md:text-base leading-relaxed max-w-lg mx-auto lg:mx-0 font-sans">
              Your official academic learning hub. Access verified class notes, syllabus guides, daily homework, and interactive practice tests.
            </p>
          </motion.div>

          {/* Right Column: Gate Access Form Card - Compact, sleek & neatly proportioned */}
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1], delay: 0.08 }}
            className="lg:col-span-5 xl:col-span-5 flex justify-center lg:justify-end w-full"
          >
            <div className="w-full max-w-[340px] xs:max-w-[360px] sm:max-w-[400px] bg-[var(--surface)]/95 border border-[var(--border)] rounded-2xl p-4 sm:p-5 shadow-lg backdrop-blur-xl relative overflow-hidden transition-colors duration-200">
              {/* Subtle top border sheen */}
              <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-amber-500/35 to-transparent" />

              <div className="mb-3">
                <h2 className="text-sm sm:text-base font-bold tracking-tight text-[var(--ink)]">
                  Classroom Access
                </h2>
                <p className="text-[11px] text-[var(--ink-muted)] mt-0.5 font-sans">
                  Select your class and enter your passcode below.
                </p>
              </div>

              <form onSubmit={handleUnlock} className="space-y-2 xs:space-y-2.5 sm:space-y-3.5">
                {/* CHOOSE CLASS field */}
                <div className="space-y-0.5 xs:space-y-1 sm:space-y-1.5">
                  <label className="block text-[9px] xs:text-[10px] sm:text-xs font-mono font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
                    CHOOSE CLASS
                  </label>
                  <div className="relative">
                    <select
                      value={selectedClassId}
                      onChange={(e) => {
                        setSelectedClassId(e.target.value);
                        setError('');
                      }}
                      id="select-class-dropdown"
                      className="w-full bg-[var(--surface-higher)] border border-[var(--border)] text-[var(--ink)] px-2.5 xs:px-3 sm:px-4 py-1.5 xs:py-2 sm:py-2.5 rounded-lg sm:rounded-xl font-sans text-xs sm:text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition appearance-none cursor-pointer"
                    >
                      <option value="" disabled className="bg-[var(--surface)] text-[var(--ink-muted)]">
                        Choose Class...
                      </option>
                      {classes.map((cls) => (
                        <option key={cls.id} value={cls.id} className="bg-[var(--surface)] text-[var(--ink)]">
                          {cls.name} {cls.section ? `(Section ${cls.section})` : ''}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 sm:w-4 sm:h-4 absolute right-2.5 xs:right-3 sm:right-4 top-1/2 -translate-y-1/2 text-[var(--ink-muted)] pointer-events-none" />
                  </div>
                </div>

                {/* ENTRY PASSCODE field */}
                <div className="space-y-0.5 xs:space-y-1 sm:space-y-1.5">
                  <label className="block text-[9px] xs:text-[10px] sm:text-xs font-mono font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
                    ENTRY PASSCODE
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={passwordInput}
                      disabled={isLocked || isVerifying}
                      onChange={(e) => {
                        setPasswordInput(e.target.value);
                        if (!isLocked) setError('');
                      }}
                      placeholder={isLocked ? `Locked (${formatLockoutCountdown(lockoutSeconds)})` : '••••••••'}
                      id="class-password-input"
                      autoComplete="current-password"
                      className="w-full bg-[var(--surface-higher)] border border-[var(--border)] text-[var(--ink)] px-2.5 xs:px-3 sm:px-4 pr-8 xs:pr-9 sm:pr-11 py-1.5 xs:py-2 sm:py-2.5 rounded-lg sm:rounded-xl font-mono text-xs sm:text-sm tracking-widest placeholder-[var(--ink-muted)] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition disabled:opacity-50"
                    />
                    <button
                      type="button"
                      disabled={isLocked || isVerifying}
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 text-[var(--ink-muted)] hover:text-[var(--ink)] transition cursor-pointer p-1 disabled:opacity-30"
                      title={showPassword ? 'Hide passcode' : 'Show passcode'}
                    >
                      {showPassword ? <EyeOff className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                    </button>
                  </div>

                  {isLocked && (
                    <div className="flex items-center justify-between gap-2 text-[10px] xs:text-[11px] sm:text-xs text-rose-500 dark:text-rose-300 mt-1.5 p-2 rounded-lg bg-rose-500/10 border border-rose-500/25">
                      <span className="flex items-center gap-1.5 font-semibold">
                        <Clock className="w-3.5 h-3.5 shrink-0 text-rose-500" />
                        <span>Access temporarily locked. Please wait</span>
                      </span>
                      <span className="font-mono font-bold px-1.5 py-0.5 rounded bg-rose-500/20">
                        {formatLockoutCountdown(lockoutSeconds)}
                      </span>
                    </div>
                  )}

                  {error && !isLocked && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center gap-1.5 sm:gap-2 text-[10px] xs:text-[11px] sm:text-xs text-rose-500 dark:text-rose-300 mt-1.5 p-1.5 xs:p-2 sm:p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 break-words"
                    >
                      <AlertCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 text-rose-500" />
                      <span>{error}</span>
                    </motion.div>
                  )}
                </div>

                {/* Enter Classroom Button */}
                <button
                  type="submit"
                  id="enter-class-board-btn"
                  disabled={isLocked || isVerifying}
                  className="w-full py-2 xs:py-2.5 sm:py-3 px-4 sm:px-6 rounded-lg sm:rounded-xl font-bold text-xs sm:text-sm text-white bg-blue-600 hover:bg-blue-500 active:scale-[0.99] transition shadow-md shadow-blue-500/25 flex items-center justify-center gap-2 cursor-pointer mt-2.5 xs:mt-3 sm:mt-4 disabled:opacity-60"
                >
                  {isVerifying ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 animate-spin" />
                      <span>Verifying...</span>
                    </>
                  ) : isLocked ? (
                    <>
                      <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                      <span>Wait {formatLockoutCountdown(lockoutSeconds)}</span>
                    </>
                  ) : (
                    <>
                      <span>Enter Classroom</span>
                      <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                    </>
                  )}
                </button>
              </form>
            </div>
          </motion.div>

        </div>
      </main>

      {/* Clean Bottom Strip */}
      <footer className="relative z-20 w-full border-t border-[var(--border)] bg-[var(--surface)]/70 backdrop-blur-md transition-colors duration-200 shrink-0">
        <div className="max-w-[1720px] mx-auto px-4 sm:px-8 py-2.5 sm:py-3 flex items-center justify-between text-xs text-[var(--ink-muted)]">
          <span className="font-semibold text-[var(--ink)]">EduNexus Learning Portal</span>
        </div>
      </footer>
    </div>
  );
};
