export type AuthLockoutScope = 'admin' | 'student' | 'class';

const DEVICE_ID_KEY = 'edunexus_did';
const LOCKOUT_PREFIX = 'edunexus_lockout_until_';

function fnv1aHash(str: string): string {
  let h1 = 0xdeadbeef ^ str.length;
  let h2 = 0x41c6ce57 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

function readCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  try {
    const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : '';
  } catch {
    return '';
  }
}

function writeCookie(name: string, value: string, maxAgeSeconds = 31536000): void {
  if (typeof document === 'undefined') return;
  try {
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSeconds}; SameSite=Lax`;
  } catch {
    // ignore cookie errors
  }
}

let cachedFingerprint: string | null = null;

export function getDeviceFingerprint(): string {
  if (cachedFingerprint) return cachedFingerprint;
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return 'ssr_device';
  }

  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    const screenSig = typeof screen !== 'undefined'
      ? `${screen.width}x${screen.height}x${screen.colorDepth}x${window.devicePixelRatio || 1}`
      : '';
    const hw = `${navigator.hardwareConcurrency || 0}|${(navigator as any).deviceMemory || 0}|${navigator.maxTouchPoints || 0}`;

    const raw = [
      navigator.userAgent || '',
      navigator.language || '',
      (navigator.languages || []).join(','),
      navigator.platform || '',
      screenSig,
      tz,
      hw,
    ].join('||');

    cachedFingerprint = `fp_${fnv1aHash(raw)}_${fnv1aHash(raw.split('').reverse().join(''))}`;
    return cachedFingerprint;
  } catch {
    return 'fp_fallback';
  }
}

export function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') return 'ssr';
  let id = '';
  try {
    id = localStorage.getItem(DEVICE_ID_KEY) || '';
  } catch {
    // ignore
  }
  if (!id) {
    id = readCookie(DEVICE_ID_KEY);
  }
  if (!id) {
    const rand = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '')
      : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
    id = `dev_${rand}`;
  }
  try {
    localStorage.setItem(DEVICE_ID_KEY, id);
  } catch {
    // ignore
  }
  writeCookie(DEVICE_ID_KEY, id);
  return id;
}

export function getDeviceHeaders(): Record<string, string> {
  return {
    'X-Device-Id': getOrCreateDeviceId(),
    'X-Device-Fingerprint': getDeviceFingerprint(),
  };
}

export function getCachedLockoutUntil(scope: AuthLockoutScope): number {
  const key = `${LOCKOUT_PREFIX}${scope}`;
  const now = Date.now();
  let maxUntil = 0;

  try {
    const lsVal = Number(localStorage.getItem(key) || '0');
    if (lsVal > now) maxUntil = Math.max(maxUntil, lsVal);
    else if (lsVal > 0) localStorage.removeItem(key);
  } catch {
    // ignore
  }

  try {
    const ssVal = Number(sessionStorage.getItem(key) || '0');
    if (ssVal > now) maxUntil = Math.max(maxUntil, ssVal);
    else if (ssVal > 0) sessionStorage.removeItem(key);
  } catch {
    // ignore
  }

  const cookieVal = Number(readCookie(key) || '0');
  if (cookieVal > now) maxUntil = Math.max(maxUntil, cookieVal);

  return maxUntil;
}

export function setCachedLockoutUntil(scope: AuthLockoutScope, lockedUntilMs: number): void {
  const key = `${LOCKOUT_PREFIX}${scope}`;
  const now = Date.now();
  if (!lockedUntilMs || lockedUntilMs <= now) {
    try { localStorage.removeItem(key); } catch {}
    try { sessionStorage.removeItem(key); } catch {}
    writeCookie(key, '', 0);
    return;
  }
  const str = String(Math.floor(lockedUntilMs));
  try { localStorage.setItem(key, str); } catch {}
  try { sessionStorage.setItem(key, str); } catch {}
  const maxAge = Math.max(1, Math.ceil((lockedUntilMs - now) / 1000) + 10);
  writeCookie(key, str, maxAge);
}

export function formatLockoutCountdown(totalSeconds: number): string {
  const safe = Math.max(0, Math.ceil(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export interface PasswordPolicyResult {
  valid: boolean;
  error?: string;
  checks: {
    minLength: boolean;
    noSpaces: boolean;
    startsUppercase: boolean;
    restLowercaseOnly: boolean;
    hasNumber: boolean;
    hasSymbol: boolean;
  };
}

export function validateAdminPasswordFormat(password: string): PasswordPolicyResult {
  const pwd = typeof password === 'string' ? password : '';
  const checks = {
    minLength: pwd.length >= 6 && pwd.length <= 64,
    noSpaces: !/\s/.test(pwd),
    startsUppercase: /^[A-Z]/.test(pwd),
    restLowercaseOnly: pwd.length > 1 && !/[A-Z]/.test(pwd.slice(1)) && /[a-z]/.test(pwd.slice(1)),
    hasNumber: /[0-9]/.test(pwd),
    hasSymbol: /[^A-Za-z0-9\s]/.test(pwd),
  };

  if (!checks.minLength) {
    return { valid: false, error: 'Password must be between 6 and 64 characters.', checks };
  }
  if (!checks.noSpaces) {
    return { valid: false, error: 'Password must not contain spaces.', checks };
  }
  if (!checks.startsUppercase) {
    return { valid: false, error: 'First character must be an uppercase letter (A-Z).', checks };
  }
  if (!checks.restLowercaseOnly) {
    return {
      valid: false,
      error: 'Only the first letter may be uppercase; all other letters must be lowercase.',
      checks,
    };
  }
  if (!checks.hasNumber) {
    return { valid: false, error: 'Password must include at least one number (0-9).', checks };
  }
  if (!checks.hasSymbol) {
    return { valid: false, error: 'Password must include at least one symbol (e.g. @, #, $, !).', checks };
  }

  return { valid: true, checks };
}
