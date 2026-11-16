import React, { useState, useEffect } from 'react';
import { ClassItem, StudentUser } from '../types';
import { loginStudent, registerStudent, fetchLockoutStatus } from '../lib/api';
import {
  formatLockoutCountdown,
  getCachedLockoutUntil,
  setCachedLockoutUntil,
} from '../lib/deviceFingerprint';
import { formatRollWithSection } from './StudentIdPassModal';
import {
  X,
  User,
  Lock,
  GraduationCap,
  Sparkles,
  LogIn,
  UserPlus,
  CheckCircle2,
  AlertCircle,
  Hash,
  Eye,
  EyeOff,
  LogOut,
  ShieldCheck,
  Clock
} from 'lucide-react';

interface StudentAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  classes: ClassItem[];
  currentStudent?: StudentUser | null;
  onLoginSuccess: (student: StudentUser) => void;
  onRegisterSuccess?: (student: StudentUser) => void;
  onLogout?: () => void;
  initialMode?: 'login' | 'register';
  defaultClassId?: string;
}

export const StudentAuthModal: React.FC<StudentAuthModalProps> = ({
  isOpen,
  onClose,
  classes,
  currentStudent = null,
  onLoginSuccess,
  onRegisterSuccess,
  onLogout,
  initialMode = 'login',
  defaultClassId,
}) => {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);

  // Form Fields
  const [studentId, setStudentId] = useState<string>('');
  const [rollNo, setRollNo] = useState<string>('');
  const [section, setSection] = useState<'A' | 'B'>('A');
  const [name, setName] = useState<string>('');
  const [classId, setClassId] = useState<string>(() => {
    if (defaultClassId && classes.some(c => c.id === defaultClassId)) {
      return defaultClassId;
    }
    return classes[0]?.id || 'grade-9';
  });
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');

  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [lockedUntilMs, setLockedUntilMs] = useState<number>(() => getCachedLockoutUntil('student'));
  const [lockoutSeconds, setLockoutSeconds] = useState<number>(() => {
    const until = getCachedLockoutUntil('student');
    return until > Date.now() ? Math.ceil((until - Date.now()) / 1000) : 0;
  });

  React.useEffect(() => {
    if (defaultClassId && classes.some(c => c.id === defaultClassId)) {
      setClassId(defaultClassId);
    }
    if (initialMode) {
      setMode(initialMode);
    }
    setError(null);
    setSuccessMsg(null);
  }, [isOpen, defaultClassId, initialMode, classes]);

  // Restore & sync 2-minute lockout across page refreshes
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const cached = getCachedLockoutUntil('student');
    if (cached > Date.now()) {
      setLockedUntilMs(cached);
      setLockoutSeconds(Math.ceil((cached - Date.now()) / 1000));
    }
    fetchLockoutStatus('student')
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
  }, [isOpen]);

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
        setCachedLockoutUntil('student', 0);
        setError(null);
      } else {
        setLockoutSeconds(remaining);
      }
    };
    tick();
    const timer = setInterval(tick, 500);
    return () => clearInterval(timer);
  }, [lockedUntilMs]);

  if (!isOpen) return null;

  const isLoginLocked = lockoutSeconds > 0;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoginLocked || isLoading) return;
    if (!studentId.trim() || !password.trim()) {
      setError('Please enter your Roll No / Student ID and Password.');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const res = await loginStudent({
        studentId: studentId.trim(),
        password: password.trim(),
        classId: defaultClassId && defaultClassId !== 'all' ? defaultClassId : undefined,
      });
      if (res.success && res.student) {
        if (defaultClassId && defaultClassId !== 'all' && res.student.classId && res.student.classId !== defaultClassId) {
          setError('The account does not exist in this class.');
          return;
        }
        setLockedUntilMs(0);
        setLockoutSeconds(0);
        onLoginSuccess(res.student);
        onClose();
      }
    } catch (err: any) {
      if (err?.retryAfterSeconds && Number(err.retryAfterSeconds) > 0) {
        const until = Number(err.lockedUntil) || Date.now() + Number(err.retryAfterSeconds) * 1000;
        setLockedUntilMs(until);
        setLockoutSeconds(Math.max(1, Math.ceil((until - Date.now()) / 1000)));
      }
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const effectiveRollNo = formatRollWithSection(rollNo.trim() || '1', section);
    const effectiveStudentId = studentId.trim() || (effectiveRollNo ? `STD-${effectiveRollNo}` : '');

    if (!effectiveStudentId || !name.trim() || !password.trim()) {
      setError('Please fill in your Full Name, Roll No, and Password.');
      return;
    }

    if (
      effectiveStudentId.toLowerCase() === name.trim().toLowerCase() ||
      (effectiveRollNo && effectiveRollNo.toLowerCase() === name.trim().toLowerCase())
    ) {
      setError('Roll No / Student ID and Full Name must be different.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match. Please verify.');
      return;
    }

    if (password.length < 3) {
      setError('Password must be at least 3 characters.');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const res = await registerStudent({
        studentId: effectiveStudentId,
        rollNo: effectiveRollNo,
        name: name.trim(),
        classId,
        password: password.trim(),
      });
      if (res.success && res.student) {
        setSuccessMsg('Account created successfully! Taking you in...');
        setTimeout(() => {
          const callback = onRegisterSuccess || onLoginSuccess;
          callback(res.student);
          onClose();
        }, 1000);
      }
    } catch (err: any) {
      setError(err.message || 'Registration failed. That Roll No or Student ID may already be registered.');
    } finally {
      setIsLoading(false);
    }
  };

  const currentStudentClass = classes.find((c) => c.id === currentStudent?.classId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/65 backdrop-blur-xs animate-in fade-in duration-200 overflow-y-auto">
      <div
        className="bg-[var(--surface)] border border-[var(--border)] max-w-md w-full my-auto text-[var(--ink)] animate-in zoom-in-95 duration-200 rounded-2xl shadow-xl flex flex-col max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Top Header */}
        <div className="px-4 sm:px-5 py-3 border-b border-[var(--border)] flex items-center justify-between bg-[var(--surface-higher)] shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 bg-[var(--accent)]/15 text-[var(--accent)] flex items-center justify-center rounded-lg shrink-0">
              <GraduationCap className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-geist font-bold text-[var(--ink)] tracking-tight truncate">Student Assessment Portal</h2>
              <p className="text-[11px] text-[var(--ink-muted)] truncate">Sign in or register to record test scores</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--surface)] rounded-lg border border-transparent hover:border-[var(--border)] transition cursor-pointer shrink-0 ml-2"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* If Already Logged In */}
        {currentStudent ? (
          <div className="p-4 sm:p-5 space-y-3.5 overflow-y-auto">
            <div className="p-3.5 bg-[var(--surface-higher)] border border-[var(--accent)]/30 flex items-start gap-3 rounded-xl">
              <div className="p-2 bg-[var(--surface)] text-[var(--accent)] font-bold text-xs rounded-lg">
                <User className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-geist font-bold text-[var(--ink)] text-sm truncate">{currentStudent.name}</h3>
                  <span className="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 bg-[var(--accent)]/15 text-[var(--accent)] rounded-md font-semibold">
                    Logged In
                  </span>
                </div>
                <div className="text-xs text-[var(--ink-muted)] mt-2 space-y-1">
                  <p className="flex items-center gap-1.5">
                    <Hash className="w-3.5 h-3.5 text-[var(--accent)]" />
                    Student ID: <strong className="text-[var(--ink)] font-mono">{currentStudent.studentId}</strong>
                  </p>
                  <p className="flex items-center gap-1.5">
                    <GraduationCap className="w-3.5 h-3.5 text-[var(--accent)]" />
                    Enrolled Class: <strong className="text-[var(--ink)]">{currentStudentClass?.name || currentStudent.classId}</strong>
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-[var(--surface-higher)] p-3.5 border border-[var(--border)] flex items-center gap-2.5 text-xs text-[var(--ink-muted)] rounded-xl">
              <ShieldCheck className="w-4 h-4 text-[var(--accent)] shrink-0" />
              <span>Your assessment attempts and scores are automatically saved to this account.</span>
            </div>

            <div className="flex flex-col-reverse xs:flex-row gap-2.5 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="btn btn-primary flex-1 py-2.5 justify-center rounded-xl text-xs font-semibold"
              >
                Continue as {currentStudent.name.split(' ')[0]}
              </button>
              <button
                type="button"
                onClick={() => {
                  onLogout && onLogout();
                  setMode('login');
                }}
                className="btn py-2.5 px-3 justify-center text-rose-400 border-rose-500/30 hover:bg-rose-500/10 rounded-xl text-xs font-semibold"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Log Out</span>
              </button>
            </div>
          </div>
        ) : (
          /* Login / Register Forms */
          <div className="p-4 sm:p-6 space-y-4 sm:space-y-5 overflow-y-auto">
            {/* Mode Switcher Tabs */}
            <div className="flex p-1 bg-[var(--surface-higher)] border border-[var(--border)] rounded-xl">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                  setSuccessMsg(null);
                }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 text-[11px] xs:text-xs font-semibold rounded-lg transition cursor-pointer ${
                  mode === 'login'
                    ? 'bg-[var(--surface)] text-[var(--accent)] shadow-xs font-bold'
                    : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
                }`}
              >
                <LogIn className="w-3.5 h-3.5 shrink-0" />
                <span>Sign In</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setError(null);
                  setSuccessMsg(null);
                }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 text-[11px] xs:text-xs font-semibold rounded-lg transition cursor-pointer ${
                  mode === 'register'
                    ? 'bg-[var(--surface)] text-[var(--accent)] shadow-xs font-bold'
                    : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
                }`}
              >
                <UserPlus className="w-3.5 h-3.5 shrink-0" />
                <span>Create ID &amp; Password</span>
              </button>
            </div>

            {/* Error / Success Messages */}
            {error && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 flex items-start gap-2.5 text-xs text-rose-400 rounded-xl">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {successMsg && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2.5 text-xs text-emerald-400 rounded-xl">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            {mode === 'login' ? (
              /* SIGN IN FORM */
              <form onSubmit={handleLogin} className="space-y-4">
                {defaultClassId && defaultClassId !== 'all' && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-blue-500/10 border border-blue-500/20 rounded-xl text-xs text-blue-600 dark:text-blue-400">
                    <GraduationCap className="w-4 h-4 shrink-0 text-blue-500" />
                    <span>Active Classroom: <strong>{classes.find(c => c.id === defaultClassId)?.name || 'Current Class'}</strong></span>
                  </div>
                )}

                {isLoginLocked && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 flex items-center justify-between gap-2.5 text-xs text-rose-400">
                    <div className="flex items-center gap-2 font-semibold min-w-0">
                      <Clock className="w-4 h-4 shrink-0 text-rose-400" />
                      <span>Too many failed attempts. Wait 2 minutes.</span>
                    </div>
                    <span className="font-mono font-bold px-2 py-0.5 rounded-lg bg-rose-500/20 text-rose-300 shrink-0">
                      {formatLockoutCountdown(lockoutSeconds)}
                    </span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-[var(--ink-muted)] mb-1.5">
                    Roll No or Student ID
                  </label>
                  <div className="relative">
                    <Hash className="w-4 h-4 text-[var(--ink-muted)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      required
                      disabled={isLoginLocked || isLoading}
                      value={studentId}
                      onChange={(e) => setStudentId(e.target.value)}
                      placeholder={isLoginLocked ? `Locked (${formatLockoutCountdown(lockoutSeconds)})` : 'e.g. 1A, 1B, or STD-1A'}
                      className="w-full input-with-left-icon !pl-11 pr-3.5 py-2.5 bg-[var(--surface-higher)] border border-[var(--border)] focus:border-[var(--accent)] font-mono text-xs sm:text-sm text-[var(--ink)] placeholder-[var(--ink-muted)]/50 outline-none transition rounded-xl disabled:opacity-50"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--ink-muted)] mb-1.5">Password</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-[var(--ink-muted)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      disabled={isLoginLocked || isLoading}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={isLoginLocked ? `Locked (${formatLockoutCountdown(lockoutSeconds)})` : 'Enter your student password'}
                      className="w-full input-with-left-icon input-with-right-icon !pl-11 !pr-10 py-2.5 bg-[var(--surface-higher)] border border-[var(--border)] focus:border-[var(--accent)] font-mono text-xs sm:text-sm text-[var(--ink)] placeholder-[var(--ink-muted)]/50 outline-none transition rounded-xl disabled:opacity-50"
                    />
                    <button
                      type="button"
                      disabled={isLoginLocked || isLoading}
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--ink-muted)] hover:text-[var(--ink)] transition cursor-pointer p-1 disabled:opacity-30"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-[var(--ink-muted)] mt-1.5">
                    Sign in with the Roll No / Student ID and password you registered.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={isLoginLocked || isLoading}
                  className="btn btn-primary w-full py-2.5 justify-center mt-2 rounded-xl text-xs font-semibold disabled:opacity-50"
                >
                  {isLoading ? (
                    <span>Verifying...</span>
                  ) : isLoginLocked ? (
                    <>
                      <Clock className="w-4 h-4" />
                      <span>Locked — Wait {formatLockoutCountdown(lockoutSeconds)}</span>
                    </>
                  ) : (
                    <>
                      <LogIn className="w-4 h-4" />
                      <span>Sign In & Continue</span>
                    </>
                  )}
                </button>
              </form>
            ) : (
              /* SELF REGISTRATION FORM */
              <form onSubmit={handleRegister} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-[var(--ink-muted)] mb-1.5">
                    Your Full Name <span className="text-amber-500">*</span>
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-[var(--ink-muted)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Alex Johnson"
                      className="w-full input-with-left-icon !pl-11 pr-3.5 py-2.5 bg-[var(--surface-higher)] border border-[var(--border)] focus:border-[var(--accent)] font-sans text-xs sm:text-sm text-[var(--ink)] placeholder-[var(--ink-muted)]/50 outline-none transition rounded-xl"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--ink-muted)] mb-1.5">
                      Roll No <span className="text-amber-500">*</span>
                    </label>
                    <div className="relative">
                      <Hash className="w-4 h-4 text-[var(--ink-muted)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        required
                        value={rollNo}
                        onChange={(e) => {
                          const val = e.target.value;
                          setRollNo(val);
                          const base = val.replace(/[a-zA-Z]+$/, '');
                          if (!studentId || studentId.startsWith('STD-')) {
                            setStudentId(base ? `STD-${base}${section}` : '');
                          }
                        }}
                        placeholder="e.g. 1 or 15"
                        className="w-full input-with-left-icon !pl-11 pr-3.5 py-2.5 bg-[var(--surface-higher)] border border-[var(--border)] focus:border-[var(--accent)] font-mono text-xs text-[var(--ink)] placeholder-[var(--ink-muted)]/50 outline-none transition rounded-xl"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[var(--ink-muted)] mb-1.5">
                      Student ID / Username
                    </label>
                    <div className="relative">
                      <User className="w-4 h-4 text-[var(--ink-muted)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={studentId}
                        onChange={(e) => setStudentId(e.target.value)}
                        placeholder="e.g. STD-15 or alex15"
                        className="w-full input-with-left-icon !pl-11 pr-3.5 py-2.5 bg-[var(--surface-higher)] border border-[var(--border)] focus:border-[var(--accent)] font-mono text-xs text-[var(--ink)] placeholder-[var(--ink-muted)]/50 outline-none transition rounded-xl"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex flex-wrap items-center justify-between gap-1 mb-1.5">
                    <label className="block text-xs font-semibold text-[var(--ink-muted)]">
                      Enrolled Class <span className="text-amber-500">*</span>
                    </label>
                    {defaultClassId && defaultClassId !== 'all' && (
                      <span className="text-[10px] font-mono text-amber-500 font-semibold">Locked to current class</span>
                    )}
                  </div>
                  <select
                    value={classId}
                    onChange={(e) => setClassId(e.target.value)}
                    disabled={Boolean(defaultClassId && defaultClassId !== 'all')}
                    className="w-full px-3 py-2.5 bg-[var(--surface-higher)] border border-[var(--border)] focus:border-[var(--accent)] text-xs font-sans text-[var(--ink)] outline-none transition cursor-pointer rounded-xl disabled:opacity-80 disabled:cursor-not-allowed"
                  >
                    {classes.map((c) => (
                      <option key={c.id} value={c.id} className="bg-[var(--surface)] text-[var(--ink)]">
                        {c.name} {c.section ? `(${c.section})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Section Selection under Class */}
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-1 mb-1.5">
                    <label className="block text-xs font-semibold text-[var(--ink-muted)]">
                      Section (under Class) <span className="text-amber-500">*</span>
                    </label>
                    <span className="text-[10px] font-mono text-purple-400 font-semibold">
                      Will save as: Roll #{formatRollWithSection(rollNo || '1', section)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSection('A');
                        const base = (rollNo || '1').replace(/[a-zA-Z]+$/, '');
                        if (!studentId || studentId.startsWith('STD-')) {
                          setStudentId(`STD-${base}A`);
                        }
                      }}
                      className={`py-2 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                        section === 'A'
                          ? 'border-purple-500 bg-purple-500/15 text-purple-400 shadow-2xs'
                          : 'border-[var(--border)] bg-[var(--surface-higher)] text-[var(--ink-muted)] hover:text-[var(--ink)]'
                      }`}
                    >
                      <span>Section A</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSection('B');
                        const base = (rollNo || '1').replace(/[a-zA-Z]+$/, '');
                        if (!studentId || studentId.startsWith('STD-')) {
                          setStudentId(`STD-${base}B`);
                        }
                      }}
                      className={`py-2 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                        section === 'B'
                          ? 'border-purple-500 bg-purple-500/15 text-purple-400 shadow-2xs'
                          : 'border-[var(--border)] bg-[var(--surface-higher)] text-[var(--ink-muted)] hover:text-[var(--ink)]'
                      }`}
                    >
                      <span>Section B</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--ink-muted)] mb-1.5">
                      Choose Password <span className="text-amber-500">*</span>
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-[var(--ink-muted)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="New password"
                        className="w-full input-with-left-icon !pl-11 pr-3.5 py-2.5 bg-[var(--surface-higher)] border border-[var(--border)] focus:border-[var(--accent)] font-mono text-xs text-[var(--ink)] placeholder-[var(--ink-muted)]/50 outline-none transition rounded-xl"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[var(--ink-muted)] mb-1.5">
                      Confirm Password <span className="text-amber-500">*</span>
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-[var(--ink-muted)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Repeat password"
                        className="w-full input-with-left-icon !pl-11 pr-3.5 py-2.5 bg-[var(--surface-higher)] border border-[var(--border)] focus:border-[var(--accent)] font-mono text-xs text-[var(--ink)] placeholder-[var(--ink-muted)]/50 outline-none transition rounded-xl"
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="btn btn-primary w-full py-2.5 justify-center mt-2 rounded-xl text-xs font-semibold disabled:opacity-50"
                >
                  {isLoading ? (
                    <span>Registering Account...</span>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4" />
                      <span>Create Account & Register</span>
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
