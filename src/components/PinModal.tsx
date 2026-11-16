import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  KeyRound,
  User,
  X,
  AlertCircle,
  Eye,
  EyeOff,
  Lock,
  Clock,
  RefreshCw,
} from 'lucide-react';
import { loginAdmin, fetchLockoutStatus } from '../lib/api';
import {
  formatLockoutCountdown,
  getCachedLockoutUntil,
  setCachedLockoutUntil,
} from '../lib/deviceFingerprint';

interface PinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (adminName?: string) => void;
}

export const PinModal: React.FC<PinModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [lockedUntilMs, setLockedUntilMs] = useState<number>(() => getCachedLockoutUntil('admin'));
  const [lockoutSeconds, setLockoutSeconds] = useState<number>(() => {
    const until = getCachedLockoutUntil('admin');
    return until > Date.now() ? Math.ceil((until - Date.now()) / 1000) : 0;
  });

  // Sync persistent server + client lockout status whenever modal opens (survives browser refresh)
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    const cached = getCachedLockoutUntil('admin');
    if (cached > Date.now()) {
      setLockedUntilMs(cached);
      setLockoutSeconds(Math.ceil((cached - Date.now()) / 1000));
    }

    fetchLockoutStatus('admin')
      .then((status) => {
        if (cancelled) return;
        if (status.locked && status.retryAfterSeconds > 0) {
          const until = status.lockedUntil || Date.now() + status.retryAfterSeconds * 1000;
          setLockedUntilMs(until);
          setLockoutSeconds(Math.max(1, Math.ceil((until - Date.now()) / 1000)));
          setError(`Too many failed attempts. Please wait ${formatLockoutCountdown(status.retryAfterSeconds)} before trying again.`);
        } else if (!status.locked) {
          setLockedUntilMs(0);
          setLockoutSeconds(0);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  // Accurate timestamp-based countdown ticker
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
        setCachedLockoutUntil('admin', 0);
        setError('');
      } else {
        setLockoutSeconds(remaining);
      }
    };

    tick();
    const timer = setInterval(tick, 500);
    return () => clearInterval(timer);
  }, [lockedUntilMs]);

  if (!isOpen) return null;

  const isLocked = lockoutSeconds > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked || isVerifying || !username.trim() || !password) return;

    setIsVerifying(true);
    setError('');

    try {
      const result = await loginAdmin(username.trim(), password);
      setUsername('');
      setPassword('');
      setError('');
      setLockedUntilMs(0);
      setLockoutSeconds(0);
      onSuccess(result?.name);
    } catch (err: any) {
      setPassword('');
      if (err?.retryAfterSeconds && Number(err.retryAfterSeconds) > 0) {
        const until = Number(err.lockedUntil) || Date.now() + Number(err.retryAfterSeconds) * 1000;
        setLockedUntilMs(until);
        setLockoutSeconds(Math.max(1, Math.ceil((until - Date.now()) / 1000)));
      }
      setError(err?.message || 'Invalid admin username or password.');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[var(--surface)] border border-[var(--border)] w-full max-w-md max-h-[92vh] overflow-y-auto p-4 sm:p-6 text-[var(--ink)] space-y-4 sm:space-y-5 rounded-2xl shadow-2xl">
        {/* Dialog Header */}
        <div className="flex items-center justify-between gap-2 pb-3 sm:pb-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-500 flex items-center justify-center shadow-xs shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-geist font-bold text-sm sm:text-base text-[var(--ink)] truncate">
                Administrator Sign In
              </h3>
              <p className="text-xs text-[var(--ink-muted)] truncate">
                Enter your admin username and password
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-higher)] transition cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-[var(--ink-muted)] leading-relaxed">
          Authorized teachers can manage class materials, configure classrooms, edit assessments, and grade student submissions.
        </p>

        {isLocked && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-rose-400 font-semibold min-w-0">
              <Clock className="w-4 h-4 shrink-0 text-rose-400" />
              <span>Login temporarily locked. Please wait before trying again.</span>
            </div>
            <span className="font-mono text-xs font-bold px-2 py-1 rounded-lg bg-rose-500/20 text-rose-300 shrink-0">
              {formatLockoutCountdown(lockoutSeconds)}
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label htmlFor="admin-username-input" className="block text-xs font-semibold text-[var(--ink-muted)] mb-1.5">
              Admin Username
            </label>
            <div className="relative">
              <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--ink-muted)] pointer-events-none z-10" />
              <input
                type="text"
                value={username}
                disabled={isLocked || isVerifying}
                onChange={(e) => {
                  setUsername(e.target.value);
                  if (!isLocked) setError('');
                }}
                placeholder={isLocked ? `Locked (${formatLockoutCountdown(lockoutSeconds)})` : 'Enter admin username'}
                autoComplete="username"
                autoFocus
                id="admin-username-input"
                className="w-full !pl-11 pr-3.5 py-2.5 bg-[var(--surface-higher)] border border-[var(--border)] focus:border-amber-500 text-sm text-[var(--ink)] placeholder-[var(--ink-muted)]/60 outline-none rounded-xl font-mono transition disabled:opacity-50"
              />
            </div>
          </div>

          <div>
            <label htmlFor="admin-passcode-input" className="block text-xs font-semibold text-[var(--ink-muted)] mb-1.5">
              Admin Password
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--ink-muted)] pointer-events-none z-10" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                disabled={isLocked || isVerifying}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (!isLocked) setError('');
                }}
                placeholder={isLocked ? `Locked (${formatLockoutCountdown(lockoutSeconds)})` : 'Enter admin password'}
                autoComplete="current-password"
                id="admin-passcode-input"
                className="w-full !pl-11 !pr-11 py-2.5 bg-[var(--surface-higher)] border border-[var(--border)] focus:border-amber-500 text-sm text-[var(--ink)] placeholder-[var(--ink-muted)]/60 outline-none rounded-xl font-mono transition disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                disabled={isLocked || isVerifying}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--ink-muted)] hover:text-[var(--ink)] p-1 cursor-pointer transition disabled:opacity-30"
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {error && !isLocked && (
              <p className="flex items-center gap-1.5 text-xs text-rose-400 mt-2 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{error}</span>
              </p>
            )}
          </div>

          <div className="flex flex-col-reverse xs:flex-row items-stretch xs:items-center gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="btn flex-1 py-2.5 justify-center rounded-xl text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLocked || isVerifying || !username.trim() || !password}
              id="unlock-admin-btn"
              className="btn btn-primary flex-1 py-2.5 justify-center rounded-xl text-xs font-semibold disabled:opacity-50"
            >
              {isVerifying ? (
                <span className="flex items-center gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Verifying...
                </span>
              ) : isLocked ? (
                `Wait ${formatLockoutCountdown(lockoutSeconds)}`
              ) : (
                'Sign In as Admin'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
