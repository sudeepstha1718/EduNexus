import express from 'express';
import path from 'path';
import zlib from 'zlib';
import crypto from 'crypto';
import dotenv from 'dotenv';
import pg from 'pg';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import { INITIAL_CLASSES, SUBJECT_CATEGORIES, INITIAL_FILES, INITIAL_QUIZZES } from './src/lib/sampleData.js';
import {
  evaluateEntireQuiz,
  evaluateSingleQuestion,
  calculateQuizScore,
  calcGradeLetter,
  normalizeText,
  matchMcqAnswer,
  matchTrueFalseAnswer,
  matchFillInBlank,
  evaluateMatchFollowing,
  evaluateMultiBlankItems,
  evaluateSubQuestions,
  evaluateLiveAttemptProgress,
  countAnsweredQuestions
} from './src/lib/scoringEngine.js';
import {
  generatePrintableStudentAnswerHtml,
  generateBatchPrintableStudentAnswersHtml,
  generatePrintableQuestionsOnlyHtml,
  compareSubmissionsForPrint,
  resolveStudentRollNo
} from './src/lib/printEngine.js';
import {
  buildQuizRandomizationMap,
  parseRandomizationMap,
  parseOptionIndex,
  validateQuizRandomizationMap
} from './src/lib/randomization.js';

dotenv.config();

// Prevent transient async errors from crashing the server while students are in an exam
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Promise Rejection (caught safely):', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception (caught safely):', err);
});

const app = express();
const PORT = 3000;

// Gemini AI Client Initializer
const geminiClient = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// Increase payload limit for uploading binary files as base64 into PostgreSQL
app.use(express.json({ limit: '50mb' }));
app.use(express.text({ type: 'text/plain', limit: '2mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Lightweight Gzip Compression for JSON /API responses (> 1KB) so 40+ concurrent students load fast
app.use('/api', (req, res, next) => {
  const acceptEncoding = String(req.headers['accept-encoding'] || '');
  if (!acceptEncoding.includes('gzip')) return next();

  const origJson = res.json.bind(res);
  res.json = (body: any) => {
    try {
      const jsonStr = JSON.stringify(body);
      if (jsonStr && jsonStr.length > 1024 && !res.headersSent) {
        const compressed = zlib.gzipSync(jsonStr);
        res.setHeader('Content-Encoding', 'gzip');
        res.setHeader('Vary', 'Accept-Encoding');
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        return res.status(res.statusCode || 200).send(compressed);
      }
    } catch {
      // Fallback to standard JSON if compression fails
    }
    return origJson(body);
  };
  next();
});

// PostgreSQL Pool Connection (Tuned for Neon serverless + concurrent classroom sessions)
const dbUrl = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_lrBud4VC6mnE@ep-curly-moon-azxpjffu-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

const pool = new pg.Pool({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
  max: 25,
  idleTimeoutMillis: 20000,
  connectionTimeoutMillis: 10000,
  statement_timeout: 20000,
  allowExitOnIdle: false,
});

// Critical: handle idle client socket drops from Neon so Node never crashes
pool.on('error', (err) => {
  console.error('PostgreSQL pool background client error (safely handled):', err.message);
});

// Short-TTL In-Memory Read Cache + Singleflight Request Coalescing
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}
const apiReadCache = new Map<string, CacheEntry<any>>();
const apiInFlight = new Map<string, Promise<any>>();

async function cachedRead<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = apiReadCache.get(key);
  if (hit && hit.expiresAt > now) {
    return hit.data as T;
  }
  const pending = apiInFlight.get(key);
  if (pending) {
    return pending as Promise<T>;
  }
  const promise = loader()
    .then((data) => {
      apiReadCache.set(key, { data, expiresAt: Date.now() + ttlMs });
      apiInFlight.delete(key);
      return data;
    })
    .catch((err) => {
      apiInFlight.delete(key);
      throw err;
    });
  apiInFlight.set(key, promise);
  return promise;
}

function invalidateCachePrefix(prefix: string) {
  for (const key of apiReadCache.keys()) {
    if (key.startsWith(prefix)) {
      apiReadCache.delete(key);
    }
  }
}

async function getCanonicalQuestionsCached(quizId: string): Promise<any[]> {
  return cachedRead(`canonical_questions:${quizId}`, 30000, async () => {
    const { rows } = await pool.query(
      `SELECT id, type, question_text, points, options, matching_pairs, blank_items, sub_questions, correct_answer
       FROM questions
       WHERE quiz_id = $1
       ORDER BY order_index ASC, id ASC`,
      [quizId]
    );
    return rows;
  });
}

async function getQuizMetaCached(quizId: string): Promise<{ id: string; title: string; subject: string; class_id: string; is_published: boolean } | null> {
  return cachedRead(`quiz_meta:${quizId}`, 15000, async () => {
    const { rows } = await pool.query(
      `SELECT id, title, subject, class_id, is_published FROM quizzes WHERE id = $1`,
      [quizId]
    );
    return rows[0] || null;
  });
}

async function getStudentMetaMapCached(): Promise<Map<string, { rollNo: string; classId: string; name: string }>> {
  const entries = await cachedRead('live_student_meta', 15000, async () => {
    const { rows } = await pool.query(`SELECT student_id, roll_no, class_id, name FROM students`);
    const list: Array<[string, { rollNo: string; classId: string; name: string }]> = [];
    for (const st of rows) {
      const sid = String(st.student_id || '').trim().toLowerCase();
      if (!sid) continue;
      const meta = {
        rollNo: st.roll_no ? String(st.roll_no).trim() : '',
        classId: st.class_id ? String(st.class_id).trim() : '',
        name: st.name ? String(st.name).trim() : '',
      };
      list.push([sid, meta]);
      if (sid.startsWith('std-')) {
        list.push([sid.slice(4), meta]);
      } else {
        list.push([`std-${sid}`, meta]);
      }
    }
    return list;
  });
  return new Map(entries);
}

function resolveGuestRollFallback(studentId: string): string {
  const sIdRaw = String(studentId || '');
  const guestRollMatch = sIdRaw.match(/^guest_[^_]+_([^_]+)/i);
  if (guestRollMatch && /^[0-9]+[a-zA-Z]?$/.test(guestRollMatch[1])) {
    return guestRollMatch[1];
  }
  return '-';
}

// Bounded Gemini AI Concurrency Gate (prevents 429 overload when an entire class submits simultaneously)
let activeAiCalls = 0;
const MAX_CONCURRENT_AI_CALLS = 6;

async function runWithTimeoutAndGate<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
  if (activeAiCalls >= MAX_CONCURRENT_AI_CALLS) {
    throw new Error('AI concurrency gate saturated; switching cleanly to deterministic rubric grading');
  }
  activeAiCalls++;
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      fn(),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`AI grading timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    activeAiCalls = Math.max(0, activeAiCalls - 1);
  }
}

// =========================================================================
// STATELESS AUTH TOKENS, PASSWORD ENCRYPTION & IP RATE LIMITING
// =========================================================================
let SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
let CURRENT_ADMIN_CRED_VERSION = '1';

interface AuthTokenPayload {
  role: 'admin' | 'student';
  studentId?: string;
  id?: string;
  classId?: string;
  name?: string;
  credVersion?: string;
  iat: number;
  exp: number;
}

function getEncryptionKey(): Buffer {
  return crypto.createHash('sha256').update(SESSION_SECRET).digest();
}

function encryptPassword(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc$v1$${iv.toString('base64')}$${tag.toString('base64')}$${encrypted.toString('base64')}`;
}

function decryptPassword(stored: string): string {
  if (!stored) return '';
  if (!stored.startsWith('enc$v1$')) return stored; // Legacy plaintext fallback
  try {
    const parts = stored.split('$');
    if (parts.length !== 5) return '';
    const iv = Buffer.from(parts[2], 'base64');
    const tag = Buffer.from(parts[3], 'base64');
    const ciphertext = Buffer.from(parts[4], 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function hashAdminPassword(plain: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(plain, salt, 64).toString('hex');
  return `scrypt$v1$${salt}$${derived}`;
}

function verifyAdminPassword(input: string, storedHash: string): boolean {
  if (!storedHash || !storedHash.startsWith('scrypt$v1$')) {
    // Perform dummy scrypt work to avoid timing leaks
    crypto.scryptSync(input || 'dummy', '00112233445566778899aabbccddeeff', 64);
    return false;
  }
  const parts = storedHash.split('$');
  if (parts.length !== 4) return false;
  const [, , salt, expectedHex] = parts;
  if (!salt || !expectedHex) return false;
  try {
    const derived = crypto.scryptSync(input, salt, 64);
    const expected = Buffer.from(expectedHex, 'hex');
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

function validateAdminUsername(username: string): { valid: boolean; error?: string } {
  const clean = String(username || '').trim();
  if (clean.length < 3 || clean.length > 50) {
    return { valid: false, error: 'Admin username must be between 3 and 50 characters.' };
  }
  if (!/^[A-Za-z0-9._@-]{3,50}$/.test(clean)) {
    return { valid: false, error: 'Admin username may only contain letters, numbers, dots, underscores, hyphens, or @ (no spaces).' };
  }
  return { valid: true };
}

function validateAdminPasswordPolicy(pwd: string): { valid: boolean; error?: string } {
  if (typeof pwd !== 'string' || pwd.length < 6 || pwd.length > 64) {
    return { valid: false, error: 'Password must be between 6 and 64 characters long.' };
  }
  if (/\s/.test(pwd)) {
    return { valid: false, error: 'Password cannot contain spaces.' };
  }
  if (!/^[A-Z]/.test(pwd)) {
    return { valid: false, error: 'Password must start with an uppercase letter (A-Z).' };
  }
  if (/[A-Z]/.test(pwd.slice(1))) {
    return { valid: false, error: 'Only the first character may be uppercase; all remaining letters must be lowercase.' };
  }
  if (!/[a-z]/.test(pwd.slice(1))) {
    return { valid: false, error: 'Password must include lowercase letters after the first character.' };
  }
  if (!/[0-9]/.test(pwd)) {
    return { valid: false, error: 'Password must include at least one number (0-9).' };
  }
  if (!/[^A-Za-z0-9\s]/.test(pwd)) {
    return { valid: false, error: 'Password must include at least one symbol (e.g. @, #, $, !, _).' };
  }
  return { valid: true };
}

function verifyPassword(input: string, stored: string): boolean {
  const plainStored = decryptPassword(stored);
  if (!plainStored) return false;
  return constantTimeEquals(input, plainStored);
}

function signAuthToken(payload: Omit<AuthTokenPayload, 'iat' | 'exp'>, ttlMs = 12 * 60 * 60 * 1000): string {
  const now = Date.now();
  const fullPayload: AuthTokenPayload = {
    ...payload,
    iat: now,
    exp: now + ttlMs,
  };
  const body = Buffer.from(JSON.stringify(fullPayload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyAuthToken(token: string | undefined): AuthTokenPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  if (!body || !sig) return null;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  if (!constantTimeEquals(sig, expectedSig)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as AuthTokenPayload;
    if (!parsed || typeof parsed.exp !== 'number' || parsed.exp <= Date.now()) return null;
    if (parsed.role !== 'admin' && parsed.role !== 'student') return null;
    if (parsed.role === 'admin' && parsed.credVersion !== CURRENT_ADMIN_CRED_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

function extractRawToken(req: express.Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  if (typeof req.query.token === 'string' && req.query.token.trim()) {
    return req.query.token.trim();
  }
  return undefined;
}

function getAuthUser(req: express.Request): AuthTokenPayload | null {
  return verifyAuthToken(extractRawToken(req));
}

function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const user = getAuthUser(req);
  if (!user) {
    if (req.path.startsWith('/api/print/')) {
      return res.status(401).send('<!DOCTYPE html><html><body style="font-family:sans-serif;padding:40px"><h2>401 Unauthorized</h2><p>Please sign in as a teacher or student to view or print this document.</p></body></html>');
    }
    return res.status(401).json({ error: 'Authentication required. Please sign in.' });
  }
  (req as any).authUser = user;
  next();
}

function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const user = getAuthUser(req);
  if (!user || user.role !== 'admin') {
    if (req.path.startsWith('/api/print/')) {
      return res.status(401).send('<!DOCTYPE html><html><body style="font-family:sans-serif;padding:40px"><h2>401 Teacher Authorization Required</h2><p>Please unlock Teacher Admin Mode before printing this paper.</p></body></html>');
    }
    return res.status(401).json({ error: 'Teacher administrator authorization required.' });
  }
  (req as any).authUser = user;
  next();
}

// Persistent DB-backed Brute-Force Protection (5 failed attempts -> 2-minute lockout)
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS = 2 * 60 * 1000; // 120 seconds

function getClientIp(req: express.Request): string {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) return xff.split(',')[0].trim().toLowerCase();
  return String(req.ip || req.socket?.remoteAddress || 'unknown').toLowerCase();
}

function parseCookieValue(cookieHeader: string | undefined, name: string): string {
  if (!cookieHeader) return '';
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    const k = pair.slice(0, idx).trim();
    if (k === name) {
      return decodeURIComponent(pair.slice(idx + 1).trim());
    }
  }
  return '';
}

function sanitizeIdentifier(val: unknown, maxLen = 80): string {
  if (typeof val !== 'string') return '';
  return val.trim().replace(/[^a-zA-Z0-9._-]/g, '').slice(0, maxLen);
}

type AuthScope = 'admin' | 'student' | 'class';

function getAttemptKeys(req: express.Request, scope: AuthScope, accountIdentifier?: string): string[] {
  const ip = getClientIp(req);
  const rawDeviceId =
    sanitizeIdentifier(req.headers['x-device-id']) ||
    sanitizeIdentifier((req.body as any)?.deviceId) ||
    sanitizeIdentifier(parseCookieValue(req.headers.cookie, 'edunexus_did'));
  const rawFingerprint =
    sanitizeIdentifier(req.headers['x-device-fingerprint']) ||
    sanitizeIdentifier((req.body as any)?.deviceFingerprint);
  const cleanAccount = accountIdentifier ? accountIdentifier.trim().toLowerCase().slice(0, 60) : '';

  const keys = new Set<string>();
  if (rawDeviceId) keys.add(`${scope}:dev:${rawDeviceId}`);
  if (rawFingerprint) keys.add(`${scope}:fp:${rawFingerprint}`);

  if (scope === 'admin' || scope === 'class') {
    // Admin gate & Class portal lock device, browser fingerprint, and IP so browser refresh, incognito, or switching classes/browsers all wait 2 mins
    keys.add(`${scope}:ip:${ip}`);
    if (cleanAccount) {
      keys.add(`${scope}:ipacct:${ip}:${cleanAccount}`);
    }
  } else {
    // Student login: lock device, browser fingerprint (consistent across normal + incognito), and IP+account
    if (cleanAccount) {
      keys.add(`${scope}:ipacct:${ip}:${cleanAccount}`);
    }
    if (!rawDeviceId && !rawFingerprint) {
      // Raw API / curl requests without browser device headers
      keys.add(`${scope}:ip:${ip}`);
    }
  }
  return Array.from(keys);
}

async function checkLoginLockout(keys: string[]): Promise<{
  locked: boolean;
  retryAfterSeconds: number;
  lockedUntil: number;
  failures: number;
  remainingAttempts: number;
}> {
  if (!keys.length) {
    return { locked: false, retryAfterSeconds: 0, lockedUntil: 0, failures: 0, remainingAttempts: MAX_LOGIN_ATTEMPTS };
  }
  const now = Date.now();
  const { rows } = await pool.query(
    `SELECT attempt_key, failures, locked_until FROM login_attempts WHERE attempt_key = ANY($1)`,
    [keys]
  );

  let maxLockedUntil = 0;
  let maxFailures = 0;
  for (const row of rows) {
    const lockedUntil = Number(row.locked_until || 0);
    const failures = Number(row.failures || 0);
    if (lockedUntil > now) {
      if (lockedUntil > maxLockedUntil) maxLockedUntil = lockedUntil;
    } else if (lockedUntil === 0) {
      if (failures > maxFailures) maxFailures = failures;
    }
  }

  if (maxLockedUntil > now) {
    const retryAfterSeconds = Math.max(1, Math.ceil((maxLockedUntil - now) / 1000));
    return {
      locked: true,
      retryAfterSeconds,
      lockedUntil: maxLockedUntil,
      failures: MAX_LOGIN_ATTEMPTS,
      remainingAttempts: 0,
    };
  }

  return {
    locked: false,
    retryAfterSeconds: 0,
    lockedUntil: 0,
    failures: maxFailures,
    remainingAttempts: Math.max(0, MAX_LOGIN_ATTEMPTS - maxFailures),
  };
}

async function recordLoginFailure(keys: string[], scope: AuthScope): Promise<{
  locked: boolean;
  retryAfterSeconds: number;
  lockedUntil: number;
  failures: number;
  remainingAttempts: number;
}> {
  const now = Date.now();
  let maxLockedUntil = 0;
  let maxFailures = 0;

  for (const key of keys) {
    const { rows } = await pool.query(
      `INSERT INTO login_attempts (attempt_key, scope, failures, locked_until, updated_at)
       VALUES ($1, $2, 1, 0, NOW())
       ON CONFLICT (attempt_key) DO UPDATE SET
         failures = CASE
           WHEN login_attempts.locked_until > 0 AND login_attempts.locked_until <= $3 THEN 1
           ELSE login_attempts.failures + 1
         END,
         locked_until = CASE
           WHEN (CASE WHEN login_attempts.locked_until > 0 AND login_attempts.locked_until <= $3 THEN 1 ELSE login_attempts.failures + 1 END) >= $4
             THEN $3 + $5
           ELSE 0
         END,
         updated_at = NOW()
       RETURNING failures, locked_until`,
      [key, scope, now, MAX_LOGIN_ATTEMPTS, LOGIN_LOCKOUT_MS]
    );
    const row = rows[0];
    if (row) {
      const f = Number(row.failures || 0);
      const lu = Number(row.locked_until || 0);
      if (f > maxFailures) maxFailures = f;
      if (lu > maxLockedUntil) maxLockedUntil = lu;
    }
  }

  // Probabilistic cleanup of stale expired records
  if (Math.random() < 0.05) {
    pool.query(`DELETE FROM login_attempts WHERE locked_until > 0 AND locked_until < $1`, [now - 3600_000]).catch(() => {});
  }

  if (maxLockedUntil > now) {
    const retryAfterSeconds = Math.max(1, Math.ceil((maxLockedUntil - now) / 1000));
    return {
      locked: true,
      retryAfterSeconds,
      lockedUntil: maxLockedUntil,
      failures: maxFailures,
      remainingAttempts: 0,
    };
  }

  return {
    locked: false,
    retryAfterSeconds: 0,
    lockedUntil: 0,
    failures: maxFailures,
    remainingAttempts: Math.max(0, MAX_LOGIN_ATTEMPTS - maxFailures),
  };
}

async function clearLoginFailures(keys: string[]): Promise<void> {
  if (!keys.length) return;
  await pool.query(`DELETE FROM login_attempts WHERE attempt_key = ANY($1)`, [keys]).catch(() => {});
}

// Immutable submission snapshot helper (called before/during critical writes & deletes)
async function backupSubmissionRow(
  db: pg.Pool | pg.PoolClient,
  row: any,
  reason: string
): Promise<void> {
  try {
    const backupId = `bkp-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const snapshotObj = {
      ...row,
      student_answers: typeof row.student_answers === 'string' ? JSON.parse(row.student_answers) : row.student_answers,
      ai_evaluation: typeof row.ai_evaluation === 'string' ? JSON.parse(row.ai_evaluation) : row.ai_evaluation,
      questions_snapshot: typeof row.questions_snapshot === 'string' ? JSON.parse(row.questions_snapshot) : row.questions_snapshot,
    };
    await db.query(
      `INSERT INTO submission_backups (
        id, submission_id, quiz_id, student_id, student_name, student_roll, class_id, total_score, max_score, backup_reason, snapshot, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())`,
      [
        backupId,
        row.id || null,
        row.quiz_id || null,
        row.student_id || null,
        row.student_name || null,
        row.student_roll || null,
        row.class_id || null,
        Number(row.total_score || 0),
        Number(row.max_score || 0),
        reason,
        JSON.stringify(snapshotObj),
      ]
    );
  } catch (err: any) {
    console.error('Warning: failed to write submission backup:', err?.message || err);
  }
}

// Database Initialization & Migration Helper
async function initDatabase() {
  console.log('Connecting to Neon PostgreSQL Database...');
  const client = await pool.connect();
  try {
    // 1. Classes Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS classes (
        id VARCHAR(100) PRIMARY KEY,
        name TEXT NOT NULL,
        section TEXT,
        description TEXT,
        color TEXT,
        icon TEXT,
        password TEXT
      );
    `);

    // 2. Subjects Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS subjects (
        id VARCHAR(100) PRIMARY KEY,
        name TEXT NOT NULL,
        color TEXT
      );
    `);

    // 3. File Blobs Table (Stores actual binary file payloads)
    await client.query(`
      CREATE TABLE IF NOT EXISTS file_blobs (
        id VARCHAR(100) PRIMARY KEY,
        mime_type TEXT,
        data_url TEXT NOT NULL
      );
    `);

    // 4. Files Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS files (
        id VARCHAR(100) PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        class_id VARCHAR(100) NOT NULL,
        subject TEXT NOT NULL,
        file_type VARCHAR(50) NOT NULL,
        file_name TEXT,
        file_size BIGINT DEFAULT 0,
        file_data_url TEXT,
        external_url TEXT,
        upload_date TIMESTAMPTZ DEFAULT NOW(),
        uploader_name TEXT,
        is_pinned BOOLEAN DEFAULT FALSE,
        is_locked BOOLEAN DEFAULT FALSE,
        file_password TEXT,
        downloads_count INTEGER DEFAULT 0,
        blob_id VARCHAR(100) REFERENCES file_blobs(id) ON DELETE SET NULL
      );
    `);

    // 5. Admin Settings Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS settings (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    // 6. Quizzes Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS quizzes (
        id VARCHAR(100) PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        class_id VARCHAR(100) NOT NULL,
        subject TEXT NOT NULL,
        time_limit_minutes INTEGER DEFAULT 0,
        total_points NUMERIC DEFAULT 0,
        is_published BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        created_by TEXT
      );
    `);

    // 7. Questions Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS questions (
        id VARCHAR(100) PRIMARY KEY,
        quiz_id VARCHAR(100) REFERENCES quizzes(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        question_text TEXT NOT NULL,
        image_url TEXT,
        points NUMERIC DEFAULT 1,
        options JSONB,
        matching_pairs JSONB,
        blank_template TEXT,
        sub_questions JSONB,
        correct_answer TEXT NOT NULL,
        grading_rubric TEXT,
        order_index INTEGER DEFAULT 0
      );
    `);

    // Ensure sub_questions and blank_items columns exist for existing tables
    await client.query(`
      ALTER TABLE questions ADD COLUMN IF NOT EXISTS sub_questions JSONB;
      ALTER TABLE questions ADD COLUMN IF NOT EXISTS blank_items JSONB;
    `);

    // 8. Quiz Submissions Table (Detached from cascading deletes so quiz edits/deletes never wipe student records)
    await client.query(`
      CREATE TABLE IF NOT EXISTS quiz_submissions (
        id VARCHAR(100) PRIMARY KEY,
        quiz_id VARCHAR(100),
        student_id VARCHAR(100),
        student_name TEXT NOT NULL,
        student_roll TEXT,
        class_id VARCHAR(100),
        submitted_at TIMESTAMPTZ DEFAULT NOW(),
        student_answers JSONB NOT NULL,
        ai_evaluation JSONB,
        total_score NUMERIC DEFAULT 0,
        max_score NUMERIC DEFAULT 0,
        status VARCHAR(50) DEFAULT 'graded'
      );
    `);

    // Ensure self-contained snapshot & fast query columns exist on quiz_submissions, and drop destructive ON DELETE CASCADE FK
    await client.query(`
      ALTER TABLE quiz_submissions DROP CONSTRAINT IF EXISTS quiz_submissions_quiz_id_fkey;
      ALTER TABLE quiz_submissions ADD COLUMN IF NOT EXISTS student_id VARCHAR(100);
      ALTER TABLE quiz_submissions ADD COLUMN IF NOT EXISTS attempt_id VARCHAR(100);
      ALTER TABLE quiz_submissions ADD COLUMN IF NOT EXISTS quiz_title TEXT;
      ALTER TABLE quiz_submissions ADD COLUMN IF NOT EXISTS quiz_subject TEXT;
      ALTER TABLE quiz_submissions ADD COLUMN IF NOT EXISTS grade_letter VARCHAR(10);
      ALTER TABLE quiz_submissions ADD COLUMN IF NOT EXISTS questions_snapshot JSONB;
    `);

    // 8.1 Immutable Submission Backups Table (Protects against accidental deletion & enables audit/restore)
    await client.query(`
      CREATE TABLE IF NOT EXISTS submission_backups (
        id VARCHAR(100) PRIMARY KEY,
        submission_id VARCHAR(100),
        quiz_id VARCHAR(100),
        student_id VARCHAR(100),
        student_name TEXT,
        student_roll TEXT,
        class_id VARCHAR(100),
        total_score NUMERIC DEFAULT 0,
        max_score NUMERIC DEFAULT 0,
        backup_reason VARCHAR(50) NOT NULL,
        snapshot JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // 9. Students Table (Self-registration, Student ID, Password)
    await client.query(`
      CREATE TABLE IF NOT EXISTS students (
        id VARCHAR(100) PRIMARY KEY,
        student_id VARCHAR(100) UNIQUE NOT NULL,
        name TEXT NOT NULL,
        class_id VARCHAR(100) NOT NULL,
        password TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        last_login TIMESTAMPTZ
      );
    `);

    // 10. Quiz Attempts Table (Strict single-attempt / no-retest tracking)
    await client.query(`
      CREATE TABLE IF NOT EXISTS quiz_attempts (
        id VARCHAR(100) PRIMARY KEY,
        quiz_id VARCHAR(100) REFERENCES quizzes(id) ON DELETE CASCADE,
        student_id VARCHAR(100) NOT NULL,
        student_name TEXT NOT NULL,
        started_at TIMESTAMPTZ DEFAULT NOW(),
        status VARCHAR(50) DEFAULT 'in_progress',
        UNIQUE(quiz_id, student_id)
      );
    `);

    // 11. Homework of the Day Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS homework (
        id VARCHAR(100) PRIMARY KEY,
        class_id VARCHAR(100) NOT NULL,
        subject TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        assigned_date VARCHAR(20) NOT NULL,
        due_date VARCHAR(20) NOT NULL,
        term VARCHAR(20) DEFAULT 'term1',
        priority VARCHAR(20) DEFAULT 'normal',
        submission_instructions TEXT,
        page_reference TEXT,
        teacher_name TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // 12. Lesson Plans / Syllabus Table (1st, 2nd, 3rd, 4th Term)
    await client.query(`
      CREATE TABLE IF NOT EXISTS lesson_plans (
        id VARCHAR(100) PRIMARY KEY,
        class_id VARCHAR(100) NOT NULL,
        subject TEXT NOT NULL,
        term VARCHAR(20) NOT NULL,
        chapter_no TEXT,
        title TEXT NOT NULL,
        description TEXT,
        topics_covered JSONB,
        status VARCHAR(30) DEFAULT 'planned',
        estimated_weeks TEXT,
        order_index INTEGER DEFAULT 0,
        resource_file_id VARCHAR(100),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Ensure roll_no and section exist on students table, and draft_answers on quiz_attempts
    await client.query(`
      ALTER TABLE students ADD COLUMN IF NOT EXISTS roll_no TEXT;
      ALTER TABLE students ADD COLUMN IF NOT EXISTS section VARCHAR(10);
      ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS draft_answers JSONB;
      ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
      ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS randomization_map JSONB;
      ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS live_score NUMERIC DEFAULT 0;
      ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS max_score NUMERIC DEFAULT 0;
      ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS answered_count INTEGER DEFAULT 0;
      ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS total_questions INTEGER DEFAULT 0;
      ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS draft_updated_ms BIGINT DEFAULT 0;
    `);

    // High-performance database & expression indexes (for simultaneous classroom access & large dashboards)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_questions_quiz_order ON questions(quiz_id, order_index, id);
      CREATE INDEX IF NOT EXISTS idx_submissions_quiz ON quiz_submissions(quiz_id);
      CREATE INDEX IF NOT EXISTS idx_submissions_class ON quiz_submissions(class_id);
      CREATE INDEX IF NOT EXISTS idx_submissions_student_id ON quiz_submissions(student_id);
      CREATE INDEX IF NOT EXISTS idx_submissions_student_roll ON quiz_submissions(student_roll);
      CREATE INDEX IF NOT EXISTS idx_submissions_attempt_id ON quiz_submissions(attempt_id);
      CREATE INDEX IF NOT EXISTS idx_submissions_quiz_lower_student ON quiz_submissions(quiz_id, LOWER(student_id));
      CREATE INDEX IF NOT EXISTS idx_submissions_submitted ON quiz_submissions(submitted_at DESC);
      CREATE INDEX IF NOT EXISTS idx_submissions_quiz_submitted ON quiz_submissions(quiz_id, submitted_at DESC);
      CREATE INDEX IF NOT EXISTS idx_submissions_class_submitted ON quiz_submissions(class_id, submitted_at DESC);
      CREATE INDEX IF NOT EXISTS idx_sub_backups_sub ON submission_backups(submission_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_sub_backups_quiz ON submission_backups(quiz_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_attempts_quiz_student ON quiz_attempts(quiz_id, student_id);
      CREATE INDEX IF NOT EXISTS idx_attempts_quiz_lower_student ON quiz_attempts(quiz_id, LOWER(student_id));
      CREATE INDEX IF NOT EXISTS idx_attempts_quiz_status ON quiz_attempts(quiz_id, status);
      CREATE INDEX IF NOT EXISTS idx_attempts_status_updated ON quiz_attempts(status, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_attempts_student ON quiz_attempts(student_id);
      CREATE INDEX IF NOT EXISTS idx_students_class ON students(class_id);
      CREATE INDEX IF NOT EXISTS idx_students_id ON students(student_id);
      CREATE INDEX IF NOT EXISTS idx_students_roll ON students(roll_no);
      CREATE INDEX IF NOT EXISTS idx_students_lower_id ON students(LOWER(student_id));
      CREATE INDEX IF NOT EXISTS idx_students_lower_roll ON students(LOWER(roll_no));
      CREATE INDEX IF NOT EXISTS idx_students_lower_name ON students(LOWER(name));
    `);

    // Enforce DB-level uniqueness on non-null attempt_id to guarantee zero duplicate submissions under races
    try {
      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_submission_attempt_id
        ON quiz_submissions(attempt_id)
        WHERE attempt_id IS NOT NULL;
      `);
    } catch (idxErr: any) {
      console.warn('Note creating idx_unique_submission_attempt_id:', idxErr?.message || idxErr);
    }

    // Prevent concurrent race from creating two submissions for the same non-admin student on the same exam
    try {
      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_submission_quiz_student
        ON quiz_submissions(quiz_id, LOWER(student_id))
        WHERE student_id IS NOT NULL AND student_id NOT LIKE 'admin%';
      `);
    } catch (idxErr: any) {
      console.warn('Note creating idx_unique_submission_quiz_student:', idxErr?.message || idxErr);
    }

    // 13. Persistent Login Attempt Lockout Table (survives refreshes & server restarts)
    await client.query(`
      CREATE TABLE IF NOT EXISTS login_attempts (
        attempt_key VARCHAR(240) PRIMARY KEY,
        scope VARCHAR(30) NOT NULL,
        failures INTEGER NOT NULL DEFAULT 0,
        locked_until BIGINT NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_login_attempts_locked_until ON login_attempts(locked_until);
    `);

    // Load or generate persistent cryptographic session_secret (for stateless HMAC tokens + password encryption)
    const secretRes = await client.query(`SELECT value FROM settings WHERE key = 'session_secret'`);
    if (secretRes.rows.length > 0 && secretRes.rows[0].value) {
      SESSION_SECRET = secretRes.rows[0].value;
    } else {
      if (!process.env.SESSION_SECRET) {
        SESSION_SECRET = crypto.randomBytes(32).toString('hex');
      }
      await client.query(
        `INSERT INTO settings (key, value) VALUES ('session_secret', $1) ON CONFLICT (key) DO NOTHING`,
        [SESSION_SECRET]
      );
    }

    // Bootstrap hashed Admin Display Name, Username & Password (server-only, never exposed to client bundle)
    const adminNameRes = await client.query(`SELECT value FROM settings WHERE key = 'admin_display_name'`);
    const adminUserRes = await client.query(`SELECT value FROM settings WHERE key = 'admin_username'`);
    const adminHashRes = await client.query(`SELECT value FROM settings WHERE key = 'admin_password_hash'`);
    const adminVerRes = await client.query(`SELECT value FROM settings WHERE key = 'admin_cred_version'`);

    if (adminNameRes.rows.length === 0 || !adminNameRes.rows[0]?.value) {
      const initialDisplayName = (process.env.ADMIN_DISPLAY_NAME || 'Sudeep Shrestha').trim();
      await client.query(
        `INSERT INTO settings (key, value) VALUES ('admin_display_name', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [initialDisplayName]
      );
    }
    if (adminUserRes.rows.length === 0 || !adminUserRes.rows[0]?.value) {
      const initialUsername = (process.env.ADMIN_USERNAME || 'NexusAdmin').trim();
      await client.query(
        `INSERT INTO settings (key, value) VALUES ('admin_username', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [initialUsername]
      );
    }
    if (adminHashRes.rows.length === 0 || !adminHashRes.rows[0]?.value) {
      const initialPassword = (process.env.ADMIN_PASSWORD || 'Nexus@2083').trim();
      const hashed = hashAdminPassword(initialPassword);
      await client.query(
        `INSERT INTO settings (key, value) VALUES ('admin_password_hash', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [hashed]
      );
    }
    if (adminVerRes.rows.length === 0 || !adminVerRes.rows[0]?.value) {
      await client.query(
        `INSERT INTO settings (key, value) VALUES ('admin_cred_version', '1') ON CONFLICT (key) DO NOTHING`
      );
      CURRENT_ADMIN_CRED_VERSION = '1';
    } else {
      CURRENT_ADMIN_CRED_VERSION = String(adminVerRes.rows[0].value);
    }
    // Remove legacy weak plaintext admin_pin if present
    await client.query(`DELETE FROM settings WHERE key = 'admin_pin'`);

    // Check if classes exist, if not seed initial classes
    const classesRes = await client.query(`SELECT COUNT(*) FROM classes`);
    if (parseInt(classesRes.rows[0].count, 10) === 0) {
      console.log('Seeding initial classes into PostgreSQL database...');
      for (const c of INITIAL_CLASSES) {
        await client.query(
          `INSERT INTO classes (id, name, section, description, color, icon, password) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [c.id, c.name, c.section, c.description, c.color, c.icon, c.password || '']
        );
      }
    }

    // Check if subjects exist, if not seed initial subjects
    const subjectsRes = await client.query(`SELECT COUNT(*) FROM subjects`);
    if (parseInt(subjectsRes.rows[0].count, 10) === 0) {
      console.log('Seeding initial subjects into PostgreSQL database...');
      for (const s of SUBJECT_CATEGORIES) {
        await client.query(
          `INSERT INTO subjects (id, name, color) VALUES ($1, $2, $3)`,
          [s.id, s.name, s.color]
        );
      }
    }

    // Check if files exist, if not seed initial files
    const filesRes = await client.query(`SELECT COUNT(*) FROM files`);
    if (parseInt(filesRes.rows[0].count, 10) === 0) {
      console.log('Seeding initial files into PostgreSQL database...');
      for (const f of INITIAL_FILES) {
        await client.query(
          `INSERT INTO files (
            id, title, description, class_id, subject, file_type, file_name, file_size,
            file_data_url, external_url, upload_date, uploader_name, is_pinned, is_locked, file_password, downloads_count
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
          [
            f.id,
            f.title,
            f.description || '',
            f.classId,
            f.subject,
            f.fileType,
            f.fileName || '',
            f.fileSize || 0,
            f.fileDataUrl || '',
            f.externalUrl || '',
            f.uploadDate || new Date().toISOString(),
            f.uploaderName || 'Teacher Admin',
            f.isPinned || false,
            f.isLocked || false,
            f.filePassword || '',
            f.downloadsCount || 0
          ]
        );
      }
    }

    // Homework & Lesson plans tables initialized without dummy seed data
    console.log('PostgreSQL database ready. Homework and Syllabus ready.');

    // Quizzes table check - do not auto-seed sample demo quizzes so user tests remain pristine
    const quizzesRes = await client.query(`SELECT COUNT(*) FROM quizzes`);
    console.log(`Database ready. Current quizzes count: ${quizzesRes.rows[0].count}`);

    console.log('PostgreSQL database successfully initialized & verified.');
  } catch (error) {
    console.error('Database migration/seed error:', error);
  } finally {
    client.release();
  }
}

// REST API ROUTES

// 0. Fast Healthcheck Endpoint
app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, timestamp: Date.now() });
  } catch (err: any) {
    res.status(503).json({ ok: false, error: err.message });
  }
});

// 1. Classes API
app.get('/api/classes', async (req, res) => {
  try {
    const isAdminCaller = getAuthUser(req)?.role === 'admin';
    const classes = await cachedRead(`classes:all:${isAdminCaller ? 'admin' : 'public'}`, 30000, async () => {
      const { rows } = await pool.query(`SELECT * FROM classes ORDER BY name ASC`);
      return rows.map(r => ({
        id: r.id,
        name: r.name,
        section: r.section,
        description: r.description,
        color: r.color,
        icon: r.icon,
        hasPassword: Boolean(r.password && String(r.password).trim()),
        ...(isAdminCaller ? { password: r.password } : {})
      }));
    });
    res.json(classes);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Verify class portal passcode server-side with persistent 5-attempt / 2-minute lockout protection
app.post('/api/classes/:id/verify', async (req, res) => {
  try {
    const { id } = req.params;
    const keys = getAttemptKeys(req, 'class', id);
    const lockState = await checkLoginLockout(keys);
    if (lockState.locked) {
      return res.status(429).json({
        error: `Too many failed attempts. Access temporarily locked for ${lockState.retryAfterSeconds}s.`,
        retryAfterSeconds: lockState.retryAfterSeconds,
        lockedUntil: lockState.lockedUntil,
        remainingAttempts: 0,
      });
    }

    const { password } = req.body || {};
    const { rows } = await pool.query(`SELECT id, name, password FROM classes WHERE id = $1`, [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Selected classroom could not be found.' });
    }
    const cls = rows[0];
    const expected = (cls.password || '').trim();
    if (!expected || constantTimeEquals(String(password || '').trim(), expected)) {
      await clearLoginFailures(keys);
      return res.json({ success: true, classId: cls.id });
    }

    const failState = await recordLoginFailure(keys, 'class');
    if (failState.locked) {
      return res.status(429).json({
        error: `Too many failed attempts. Access temporarily locked for ${failState.retryAfterSeconds}s.`,
        retryAfterSeconds: failState.retryAfterSeconds,
        lockedUntil: failState.lockedUntil,
      });
    }
    return res.status(401).json({
      error: `Invalid passcode for ${cls.name}.`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/classes', requireAdmin, async (req, res) => {
  try {
    const { id, name, section, description, color, icon, password } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Class name is required' });
    }
    const classId = id || `class-${Date.now()}`;
    await pool.query(
      `INSERT INTO classes (id, name, section, description, color, icon, password)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name, section = EXCLUDED.section, description = EXCLUDED.description,
       color = EXCLUDED.color, icon = EXCLUDED.icon, password = EXCLUDED.password`,
      [classId, String(name).trim(), section || '', description || '', color || '', icon || 'BookOpen', password || '']
    );
    invalidateCachePrefix('classes:');
    res.json({ success: true, id: classId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/classes/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, section, description, color, icon, password } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Class name is required' });
    }
    await pool.query(
      `UPDATE classes SET name = $1, section = $2, description = $3, color = $4, icon = $5, password = $6 WHERE id = $7`,
      [String(name).trim(), section || '', description || '', color || '', icon || 'BookOpen', password || '', id]
    );
    invalidateCachePrefix('classes:');
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/classes/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query(`DELETE FROM classes WHERE id = $1`, [id]);
    invalidateCachePrefix('classes:');
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Subjects API
app.get('/api/subjects', async (req, res) => {
  try {
    const rows = await cachedRead('subjects:all', 30000, async () => {
      const result = await pool.query(`SELECT * FROM subjects`);
      return result.rows;
    });
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/subjects', requireAdmin, async (req, res) => {
  try {
    const { id, name, color } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Subject name is required' });
    }
    const subjectId = id || String(name).trim();
    await pool.query(
      `INSERT INTO subjects (id, name, color) VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, color = EXCLUDED.color`,
      [subjectId, String(name).trim(), color || 'bg-slate-100 text-slate-700']
    );
    invalidateCachePrefix('subjects:');
    res.json({ success: true, id: subjectId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/subjects/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query(`DELETE FROM subjects WHERE id = $1`, [id]);
    invalidateCachePrefix('subjects:');
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Files API
app.get('/api/files', async (req, res) => {
  try {
    const files = await cachedRead('files:all', 20000, async () => {
      const { rows } = await pool.query(`SELECT * FROM files ORDER BY is_pinned DESC, upload_date DESC`);
      return rows.map(r => ({
        id: r.id,
        title: r.title,
        description: r.description,
        classId: r.class_id,
        subject: r.subject,
        fileType: r.file_type,
        fileName: r.file_name,
        fileSize: Number(r.file_size),
        fileDataUrl: r.file_data_url,
        externalUrl: r.external_url,
        uploadDate: r.upload_date,
        uploaderName: r.uploader_name,
        isPinned: r.is_pinned,
        isLocked: r.is_locked,
        filePassword: r.file_password,
        downloadsCount: r.downloads_count,
        blobId: r.blob_id
      }));
    });
    res.json(files);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create/Update File (including optional binary payload blob) - Teacher Admin Only
app.post('/api/files', requireAdmin, async (req, res) => {
  try {
    const {
      id,
      title,
      description,
      classId,
      subject,
      fileType,
      fileName,
      fileSize,
      fileDataUrl,
      externalUrl,
      uploadDate,
      uploaderName,
      isPinned,
      isLocked,
      filePassword,
      downloadsCount,
      blobData, // base64 payload if user attached binary file
      mimeType
    } = req.body;

    if (!title || !classId || !subject || !fileType) {
      return res.status(400).json({ error: 'Title, classId, subject, and fileType are required' });
    }

    const fileId = id || `file-${Date.now()}`;
    let blobId = null;

    if (blobData) {
      blobId = `blob-${fileId}`;
      await pool.query(
        `INSERT INTO file_blobs (id, mime_type, data_url) VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET mime_type = EXCLUDED.mime_type, data_url = EXCLUDED.data_url`,
        [blobId, mimeType || 'application/octet-stream', blobData]
      );
    }

    await pool.query(
      `INSERT INTO files (
        id, title, description, class_id, subject, file_type, file_name, file_size,
        file_data_url, external_url, upload_date, uploader_name, is_pinned, is_locked, file_password, downloads_count, blob_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        class_id = EXCLUDED.class_id,
        subject = EXCLUDED.subject,
        file_type = EXCLUDED.file_type,
        file_name = EXCLUDED.file_name,
        file_size = EXCLUDED.file_size,
        file_data_url = EXCLUDED.file_data_url,
        external_url = EXCLUDED.external_url,
        uploader_name = EXCLUDED.uploader_name,
        is_pinned = EXCLUDED.is_pinned,
        is_locked = EXCLUDED.is_locked,
        file_password = EXCLUDED.file_password,
        downloads_count = EXCLUDED.downloads_count,
        blob_id = COALESCE(EXCLUDED.blob_id, files.blob_id)`,
      [
        fileId,
        title,
        description || '',
        classId,
        subject,
        fileType,
        fileName || '',
        fileSize || 0,
        fileDataUrl || '',
        externalUrl || '',
        uploadDate || new Date().toISOString(),
        uploaderName || 'Teacher Admin',
        isPinned || false,
        isLocked || false,
        filePassword || '',
        downloadsCount || 0,
        blobId
      ]
    );

    invalidateCachePrefix('files:');
    res.json({ success: true, id: fileId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete file - Teacher Admin Only
app.delete('/api/files/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    // Get blob ID first
    const fileRes = await pool.query(`SELECT blob_id FROM files WHERE id = $1`, [id]);
    const blobId = fileRes.rows[0]?.blob_id;

    await pool.query(`DELETE FROM files WHERE id = $1`, [id]);

    if (blobId) {
      await pool.query(`DELETE FROM file_blobs WHERE id = $1`, [blobId]);
    }

    invalidateCachePrefix('files:');
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Increment Download Counter
app.post('/api/files/:id/download', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `UPDATE files SET downloads_count = downloads_count + 1 WHERE id = $1 RETURNING *`,
      [id]
    );
    res.json({ success: true, file: rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Fetch File Blob Binary Content
app.get('/api/files/blob/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(`SELECT * FROM file_blobs WHERE id = $1`, [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Blob payload not found' });
    }
    res.json(rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Auth Lockout Status & Admin Authentication / Credential Management APIs
app.get('/api/auth/lockout-status', async (req, res) => {
  try {
    const rawScope = String(req.query.scope || 'student');
    const scope: AuthScope = rawScope === 'admin' || rawScope === 'class' ? rawScope : 'student';
    const account = typeof req.query.account === 'string' ? req.query.account : undefined;
    const keys = getAttemptKeys(req, scope, account);
    const status = await checkLoginLockout(keys);
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/login', async (req, res) => {
  try {
    const keys = getAttemptKeys(req, 'admin');
    const lockState = await checkLoginLockout(keys);
    if (lockState.locked) {
      return res.status(429).json({
        error: `Too many failed attempts. Admin login locked for ${lockState.retryAfterSeconds}s.`,
        retryAfterSeconds: lockState.retryAfterSeconds,
        lockedUntil: lockState.lockedUntil,
      });
    }

    const inputUsername = String(req.body?.username || '').trim();
    const inputPassword = String(req.body?.password || '');
    if (!inputUsername || !inputPassword) {
      return res.status(400).json({ error: 'Admin username and password are required.' });
    }

    const { rows } = await pool.query(
      `SELECT key, value FROM settings WHERE key IN ('admin_display_name', 'admin_username', 'admin_password_hash', 'admin_cred_version')`
    );
    const settingsMap: Record<string, string> = {};
    for (const r of rows) settingsMap[r.key] = String(r.value || '');

    const storedDisplayName = settingsMap.admin_display_name || 'Sudeep Shrestha';
    const storedUsername = settingsMap.admin_username || '';
    const storedHash = settingsMap.admin_password_hash || '';
    const credVersion = settingsMap.admin_cred_version || CURRENT_ADMIN_CRED_VERSION || '1';
    CURRENT_ADMIN_CRED_VERSION = credVersion;

    const usernameMatch = Boolean(storedUsername) && constantTimeEquals(inputUsername.toLowerCase(), storedUsername.toLowerCase());
    const passwordMatch = verifyAdminPassword(inputPassword, storedHash);

    if (usernameMatch && passwordMatch) {
      await clearLoginFailures(keys);
      const token = signAuthToken({ role: 'admin', name: storedDisplayName, credVersion });
      return res.json({ success: true, token, username: storedUsername, name: storedDisplayName });
    }

    const failState = await recordLoginFailure(keys, 'admin');
    if (failState.locked) {
      return res.status(429).json({
        error: `Too many failed attempts. Admin login locked for ${failState.retryAfterSeconds}s.`,
        retryAfterSeconds: failState.retryAfterSeconds,
        lockedUntil: failState.lockedUntil,
      });
    }

    return res.status(401).json({
      error: 'Invalid admin username or password.',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/credentials', requireAdmin, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT key, value FROM settings WHERE key IN ('admin_display_name', 'admin_username')`
    );
    const settingsMap: Record<string, string> = {};
    for (const r of rows) settingsMap[r.key] = String(r.value || '');
    res.json({
      name: settingsMap.admin_display_name || 'Sudeep Shrestha',
      username: settingsMap.admin_username || '',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/credentials', requireAdmin, async (req, res) => {
  try {
    const { currentPassword, newName, newUsername, newPassword } = req.body || {};
    if (!currentPassword) {
      return res.status(400).json({ error: 'Current password is required to update your profile.' });
    }

    const { rows } = await pool.query(
      `SELECT key, value FROM settings WHERE key IN ('admin_display_name', 'admin_username', 'admin_password_hash', 'admin_cred_version')`
    );
    const settingsMap: Record<string, string> = {};
    for (const r of rows) settingsMap[r.key] = String(r.value || '');

    if (!verifyAdminPassword(String(currentPassword), settingsMap.admin_password_hash || '')) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }

    const cleanName = String(newName !== undefined ? newName : (settingsMap.admin_display_name || 'Sudeep Shrestha')).trim();
    if (cleanName.length < 2 || cleanName.length > 80) {
      return res.status(400).json({ error: 'Admin name must be between 2 and 80 characters.' });
    }

    const cleanUsername = String(newUsername || settingsMap.admin_username || '').trim();
    const userCheck = validateAdminUsername(cleanUsername);
    if (!userCheck.valid) {
      return res.status(400).json({ error: userCheck.error });
    }

    let nextHash = settingsMap.admin_password_hash || '';
    const hasNewPassword = typeof newPassword === 'string' && newPassword.length > 0;
    if (hasNewPassword) {
      const pwdCheck = validateAdminPasswordPolicy(newPassword);
      if (!pwdCheck.valid) {
        return res.status(400).json({ error: pwdCheck.error });
      }
      nextHash = hashAdminPassword(newPassword);
    }

    const nextVersion = String(Date.now());
    await pool.query(
      `INSERT INTO settings (key, value) VALUES
         ('admin_display_name', $1),
         ('admin_username', $2),
         ('admin_password_hash', $3),
         ('admin_cred_version', $4)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [cleanName, cleanUsername, nextHash, nextVersion]
    );
    CURRENT_ADMIN_CRED_VERSION = nextVersion;

    const token = signAuthToken({ role: 'admin', name: cleanName, credVersion: nextVersion });
    res.json({ success: true, name: cleanName, username: cleanUsername, token });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 4.1. Homework of the Day APIs
app.get('/api/homework', async (req, res) => {
  try {
    const { classId } = req.query;
    const cacheKey = `homework:${String(classId || 'all')}`;
    const items = await cachedRead(cacheKey, 20000, async () => {
      let query = `SELECT * FROM homework`;
      const params: any[] = [];
      if (classId && classId !== 'all') {
        query += ` WHERE class_id = $1 OR class_id = 'all'`;
        params.push(classId);
      }
      query += ` ORDER BY due_date ASC, created_at DESC`;
      const { rows } = await pool.query(query, params);
      return rows.map((r: any) => ({
        id: r.id,
        classId: r.class_id,
        subject: r.subject,
        title: r.title,
        description: r.description,
        assignedDate: r.assigned_date,
        dueDate: r.due_date,
        term: r.term || 'term1',
        priority: r.priority || 'normal',
        submissionInstructions: r.submission_instructions || '',
        pageReference: r.page_reference || '',
        teacherName: r.teacher_name || '',
        createdAt: r.created_at
      }));
    });
    res.json(items);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/homework', requireAdmin, async (req, res) => {
  try {
    const {
      id,
      classId,
      subject,
      title,
      description,
      assignedDate,
      dueDate,
      term = 'term1',
      priority = 'normal',
      submissionInstructions = '',
      pageReference = '',
      teacherName = 'Teacher'
    } = req.body;

    if (!classId || !subject || !title) {
      return res.status(400).json({ error: 'classId, subject, and title are required' });
    }

    const hwId = id || `hw-${Date.now()}`;
    const { rows } = await pool.query(
      `INSERT INTO homework (
        id, class_id, subject, title, description, assigned_date, due_date, term, priority, submission_instructions, page_reference, teacher_name
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (id) DO UPDATE SET
        class_id = EXCLUDED.class_id,
        subject = EXCLUDED.subject,
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        assigned_date = EXCLUDED.assigned_date,
        due_date = EXCLUDED.due_date,
        term = EXCLUDED.term,
        priority = EXCLUDED.priority,
        submission_instructions = EXCLUDED.submission_instructions,
        page_reference = EXCLUDED.page_reference,
        teacher_name = EXCLUDED.teacher_name
      RETURNING *`,
      [
        hwId,
        classId,
        subject,
        title,
        description || '',
        assignedDate || new Date().toISOString().slice(0, 10),
        dueDate || new Date().toISOString().slice(0, 10),
        term,
        priority,
        submissionInstructions,
        pageReference,
        teacherName
      ]
    );

    invalidateCachePrefix('homework:');
    res.json({ success: true, homework: rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/homework/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query(`DELETE FROM homework WHERE id = $1`, [id]);
    invalidateCachePrefix('homework:');
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 4.2. Lesson Plans / Term Syllabus APIs (1st, 2nd, 3rd, 4th Term)
app.get('/api/lessons', async (req, res) => {
  try {
    const { classId, term, subject } = req.query;
    const cacheKey = `lessons:${String(classId || 'all')}:${String(term || 'all')}:${String(subject || 'all')}`;
    const lessons = await cachedRead(cacheKey, 20000, async () => {
      let query = `SELECT * FROM lesson_plans WHERE 1=1`;
      const params: any[] = [];

      if (classId && classId !== 'all') {
        params.push(classId);
        query += ` AND (class_id = $${params.length} OR class_id = 'all')`;
      }
      if (term && term !== 'all') {
        params.push(term);
        query += ` AND term = $${params.length}`;
      }
      if (subject && subject !== 'all') {
        params.push(subject);
        query += ` AND subject = $${params.length}`;
      }

      query += ` ORDER BY order_index ASC, created_at ASC`;
      const { rows } = await pool.query(query, params);

      return rows.map((r: any) => {
        let topics: string[] = [];
        if (typeof r.topics_covered === 'string') {
          try { topics = JSON.parse(r.topics_covered); } catch { topics = []; }
        } else if (Array.isArray(r.topics_covered)) {
          topics = r.topics_covered;
        }

        return {
          id: r.id,
          classId: r.class_id,
          subject: r.subject,
          term: r.term,
          chapterNo: r.chapter_no,
          title: r.title,
          description: r.description,
          topicsCovered: topics,
          status: r.status || 'planned',
          estimatedWeeks: r.estimated_weeks,
          orderIndex: r.order_index,
          resourceFileId: r.resource_file_id,
          createdAt: r.created_at
        };
      });
    });

    res.json(lessons);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/lessons', requireAdmin, async (req, res) => {
  try {
    const {
      id,
      classId,
      subject,
      term = 'term1',
      chapterNo = '',
      title,
      description = '',
      topicsCovered = [],
      status = 'planned',
      estimatedWeeks = '',
      orderIndex = 0,
      resourceFileId = null
    } = req.body;

    if (!classId || !subject || !title) {
      return res.status(400).json({ error: 'classId, subject, and title are required' });
    }

    const lessonId = id || `les-${Date.now()}`;
    const { rows } = await pool.query(
      `INSERT INTO lesson_plans (
        id, class_id, subject, term, chapter_no, title, description, topics_covered, status, estimated_weeks, order_index, resource_file_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (id) DO UPDATE SET
        class_id = EXCLUDED.class_id,
        subject = EXCLUDED.subject,
        term = EXCLUDED.term,
        chapter_no = EXCLUDED.chapter_no,
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        topics_covered = EXCLUDED.topics_covered,
        status = EXCLUDED.status,
        estimated_weeks = EXCLUDED.estimated_weeks,
        order_index = EXCLUDED.order_index,
        resource_file_id = EXCLUDED.resource_file_id
      RETURNING *`,
      [
        lessonId,
        classId,
        subject,
        term,
        chapterNo,
        title,
        description,
        JSON.stringify(topicsCovered),
        status,
        estimatedWeeks,
        orderIndex,
        resourceFileId || null
      ]
    );

    invalidateCachePrefix('lessons:');
    res.json({ success: true, lesson: rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/lessons/:id/status', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const { rows } = await pool.query(
      `UPDATE lesson_plans SET status = $1 WHERE id = $2 RETURNING *`,
      [status, id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Lesson not found' });
    }
    invalidateCachePrefix('lessons:');
    res.json({ success: true, lesson: rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/lessons/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query(`DELETE FROM lesson_plans WHERE id = $1`, [id]);
    invalidateCachePrefix('lessons:');
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Quizzes & Assessment APIs

// Helper to map DB question to JSON object
function mapDbQuestion(row: any, isStudent: boolean = false) {
  let options = [];
  try {
    options = typeof row.options === 'string' ? JSON.parse(row.options) : (row.options || []);
  } catch {
    options = [];
  }

  let matchingPairs = [];
  try {
    matchingPairs = typeof row.matching_pairs === 'string' ? JSON.parse(row.matching_pairs) : (row.matching_pairs || []);
  } catch {
    matchingPairs = [];
  }

  let rawSubQuestions = [];
  try {
    rawSubQuestions = typeof row.sub_questions === 'string' ? JSON.parse(row.sub_questions) : (row.sub_questions || []);
  } catch {
    rawSubQuestions = [];
  }

  let rawBlankItems = [];
  try {
    rawBlankItems = typeof row.blank_items === 'string' ? JSON.parse(row.blank_items) : (row.blank_items || []);
  } catch {
    rawBlankItems = [];
  }

  const subQuestions = Array.isArray(rawSubQuestions) && rawSubQuestions.length > 0
    ? rawSubQuestions.map((sq: any) => {
        if (isStudent) {
          const { correctAnswer, gradingRubric, ...studentSq } = sq;
          return studentSq;
        }
        return sq;
      })
    : undefined;

  const blankItems = Array.isArray(rawBlankItems) && rawBlankItems.length > 0
    ? rawBlankItems.map((bi: any) => {
        if (isStudent) {
          const { correctAnswer, ...studentBi } = bi;
          return studentBi;
        }
        return bi;
      })
    : undefined;

  const q: any = {
    id: row.id,
    quizId: row.quiz_id,
    type: row.type,
    questionText: row.question_text,
    imageUrl: row.image_url,
    points: Number(row.points || 1),
    options: options,
    matchingPairs: matchingPairs && matchingPairs.length > 0 ? matchingPairs : undefined,
    matching_pairs: matchingPairs && matchingPairs.length > 0 ? matchingPairs : undefined,
    blankTemplate: row.blank_template,
    blankItems: blankItems && blankItems.length > 0 ? blankItems : undefined,
    blank_items: blankItems && blankItems.length > 0 ? blankItems : undefined,
    subQuestions: subQuestions && subQuestions.length > 0 ? subQuestions : undefined,
    sub_questions: subQuestions && subQuestions.length > 0 ? subQuestions : undefined,
    orderIndex: row.order_index
  };

  // Only include reference answers for teacher / admin view
  if (!isStudent) {
    q.correctAnswer = row.correct_answer;
    q.gradingRubric = row.grading_rubric;
  }

  return q;
}

// Get all quizzes (Batched question fetch + singleflight cache — zero N+1 queries; strict server answer-key stripping)
app.get('/api/quizzes', async (req, res) => {
  try {
    const { classId, subject, isStudent } = req.query;
    const callerIsAdmin = getAuthUser(req)?.role === 'admin';
    const studentMode = !callerIsAdmin || isStudent === 'true';
    const cacheKey = `quizzes:${String(classId || 'all')}:${String(subject || 'all')}:${studentMode}`;

    const quizzes = await cachedRead(cacheKey, 20000, async () => {
      let query = `SELECT * FROM quizzes WHERE 1=1`;
      const params: any[] = [];

      if (classId && classId !== 'all') {
        params.push(classId);
        query += ` AND class_id = $${params.length}`;
      }
      if (subject && subject !== 'all') {
        params.push(subject);
        query += ` AND subject = $${params.length}`;
      }
      if (studentMode) {
        query += ` AND is_published = true`;
      }

      query += ` ORDER BY created_at DESC`;

      const { rows: quizRows } = await pool.query(query, params);
      if (quizRows.length === 0) return [];

      // Single batched query instead of N+1 per-quiz queries
      const quizIds = quizRows.map((r) => r.id);
      const { rows: allQuestions } = await pool.query(
        `SELECT * FROM questions WHERE quiz_id = ANY($1::varchar[]) ORDER BY order_index ASC, id ASC`,
        [quizIds]
      );

      const qMap = new Map<string, any[]>();
      for (const item of allQuestions) {
        const list = qMap.get(item.quiz_id) || [];
        list.push(mapDbQuestion(item, studentMode));
        qMap.set(item.quiz_id, list);
      }

      return quizRows.map((qRow) => ({
        id: qRow.id,
        title: qRow.title,
        description: qRow.description,
        classId: qRow.class_id,
        subject: qRow.subject,
        timeLimitMinutes: Number(qRow.time_limit_minutes || 0),
        totalPoints: Number(qRow.total_points || 0),
        isPublished: qRow.is_published,
        createdAt: qRow.created_at,
        createdBy: qRow.created_by,
        questions: qMap.get(qRow.id) || []
      }));
    });

    res.json(quizzes);
  } catch (err: any) {
    console.error('Error fetching quizzes:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get single quiz (cached & coalesced; NEVER returns answer keys unless caller holds verified Admin token)
app.get('/api/quizzes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const callerIsAdmin = getAuthUser(req)?.role === 'admin';
    const studentMode = !callerIsAdmin || req.query.isStudent === 'true';
    const cacheKey = `quiz:${id}:${studentMode}`;

    const quizObj = await cachedRead(cacheKey, 20000, async () => {
      const { rows: quizRows } = await pool.query(`SELECT * FROM quizzes WHERE id = $1`, [id]);
      if (quizRows.length === 0) return null;

      const qRow = quizRows[0];
      if (studentMode && !qRow.is_published) return null;

      const { rows: qItems } = await pool.query(
        `SELECT * FROM questions WHERE quiz_id = $1 ORDER BY order_index ASC, id ASC`,
        [id]
      );

      return {
        id: qRow.id,
        title: qRow.title,
        description: qRow.description,
        classId: qRow.class_id,
        subject: qRow.subject,
        timeLimitMinutes: Number(qRow.time_limit_minutes || 0),
        totalPoints: Number(qRow.total_points || 0),
        isPublished: qRow.is_published,
        createdAt: qRow.created_at,
        createdBy: qRow.created_by,
        questions: qItems.map(item => mapDbQuestion(item, studentMode))
      };
    });

    if (!quizObj) {
      return res.status(404).json({ error: 'Quiz not found' });
    }
    res.json(quizObj);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create or update quiz (Teacher / Admin Only with Server Validation)
app.post('/api/quizzes', requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      id,
      title,
      description,
      classId,
      subject,
      timeLimitMinutes,
      isPublished,
      createdBy,
      questions
    } = req.body;

    if (!title || !String(title).trim() || !classId || !subject) {
      return res.status(400).json({ error: 'Assessment title, classId, and subject are required.' });
    }

    const questionList = Array.isArray(questions) ? questions : [];
    if (questionList.length === 0) {
      return res.status(400).json({ error: 'Assessment must include at least one question.' });
    }

    for (let i = 0; i < questionList.length; i++) {
      const pts = Number(questionList[i].points ?? 1);
      if (!Number.isFinite(pts) || pts <= 0) {
        return res.status(400).json({ error: `Question #${i + 1} must have positive points.` });
      }
    }

    await client.query('BEGIN');

    const quizId = id || `quiz-${Date.now()}`;
    const totalPoints = questionList.reduce((sum: number, q: any) => sum + (Number(q.points) || 1), 0);

    // Upsert Quiz
    await client.query(
      `INSERT INTO quizzes (id, title, description, class_id, subject, time_limit_minutes, total_points, is_published, created_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9)
       ON CONFLICT (id) DO UPDATE SET
       title = EXCLUDED.title,
       description = EXCLUDED.description,
       class_id = EXCLUDED.class_id,
       subject = EXCLUDED.subject,
       time_limit_minutes = EXCLUDED.time_limit_minutes,
       total_points = EXCLUDED.total_points,
       is_published = EXCLUDED.is_published`,
      [quizId, String(title).trim(), description || '', classId, subject, Math.max(0, Number(timeLimitMinutes || 0)), totalPoints, isPublished ?? true, createdBy || 'Teacher Admin']
    );

    // Delete existing questions for this quiz and recreate
    await client.query(`DELETE FROM questions WHERE quiz_id = $1`, [quizId]);

    const candidateIds = questionList.map((q: any) => q.id).filter(Boolean);
    let takenIds = new Set<string>();
    if (candidateIds.length > 0) {
      const { rows: conflicting } = await client.query(
        `SELECT id FROM questions WHERE id = ANY($1::text[])`,
        [candidateIds]
      );
      takenIds = new Set(conflicting.map((r: any) => String(r.id)));
    }

    for (const [idx, q] of questionList.entries()) {
      const rawId = q.id ? String(q.id) : '';
      const qId = rawId && !takenIds.has(rawId)
        ? rawId
        : `q-${quizId}-${idx + 1}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      takenIds.add(qId);
      await client.query(
        `INSERT INTO questions (id, quiz_id, type, question_text, image_url, points, options, matching_pairs, blank_template, blank_items, sub_questions, correct_answer, grading_rubric, order_index)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          qId,
          quizId,
          q.type || 'question_answer',
          q.questionText || '',
          q.imageUrl || '',
          Number(q.points || 1),
          q.options ? JSON.stringify(q.options) : null,
          (q.matchingPairs || (q as any).matching_pairs) ? JSON.stringify(q.matchingPairs || (q as any).matching_pairs) : null,
          q.blankTemplate || '',
          (q.blankItems || (q as any).blank_items) ? JSON.stringify(q.blankItems || (q as any).blank_items) : null,
          (q.subQuestions || (q as any).sub_questions) ? JSON.stringify(q.subQuestions || (q as any).sub_questions) : null,
          q.correctAnswer || '',
          q.gradingRubric || '',
          q.orderIndex ?? idx
        ]
      );
    }

    await client.query('COMMIT');
    invalidateCachePrefix('quizzes:');
    invalidateCachePrefix(`quiz:${quizId}:`);
    invalidateCachePrefix(`canonical_questions:${quizId}`);
    invalidateCachePrefix(`quiz_meta:${quizId}`);
    res.json({ success: true, id: quizId, totalPoints });
  } catch (err: any) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('Error saving quiz:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Delete quiz (Teacher Admin Only — backs up any existing submissions first, and keeps quiz_submissions rows intact!)
app.delete('/api/quizzes/:id', requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    await client.query('BEGIN');
    const { rows: existingSubs } = await client.query(`SELECT * FROM quiz_submissions WHERE quiz_id = $1`, [id]);
    for (const row of existingSubs) {
      await backupSubmissionRow(client, row, 'pre_quiz_delete');
    }
    await client.query(`DELETE FROM quizzes WHERE id = $1`, [id]);
    await client.query('COMMIT');
    invalidateCachePrefix('quizzes:');
    invalidateCachePrefix(`quiz:${id}:`);
    invalidateCachePrefix(`canonical_questions:${id}`);
    invalidateCachePrefix(`quiz_meta:${id}`);
    res.json({ success: true });
  } catch (err: any) {
    try { await client.query('ROLLBACK'); } catch {}
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Educational Profile Helper to determine student age, school stage, and teacher persona
interface EducationalProfile {
  gradeLevel: string;
  schoolStage: string;
  ageRange: string;
  personaSummary: string;
  pedagogicalGuidelines: string;
}

function getClassEducationalProfile(className: string, section?: string, description?: string): EducationalProfile {
  const text = `${className || ''} ${section || ''} ${description || ''}`.toLowerCase();
  
  // Detect Class / Grade numbers
  const match = text.match(/(?:class|grade|std|standard|year)\s*([0-9]{1,2})/i) || text.match(/\b([0-9]{1,2})(?:st|nd|rd|th)\s*(?:grade|class|standard)?/i);
  let classNum: number | null = null;
  if (match && match[1]) {
    classNum = parseInt(match[1], 10);
  }

  if (text.includes('kindergarten') || text.includes('kg') || text.includes('nursery') || text.includes('prep') || text.includes('preschool') || classNum === 0) {
    return {
      gradeLevel: 'Kindergarten / Early Years',
      schoolStage: 'Pre-Primary / Early Childhood',
      ageRange: '4–6 years old',
      personaSummary: 'Nurturing Early Childhood Teacher (Age 4–6)',
      pedagogicalGuidelines: 'You are a warm, gentle, and highly supportive kindergarten/early years teacher. Students are 4-6 years old. Praise enthusiasm and effort with joyful words. Forgive any phonetic spellings, backwards letters, or incomplete phrases as long as the child recognized the basic item or idea.'
    };
  }

  if (classNum !== null) {
    if (classNum >= 1 && classNum <= 3) {
      const age = classNum === 1 ? '6–7' : classNum === 2 ? '7–8' : '8–9';
      return {
        gradeLevel: `Class ${classNum}`,
        schoolStage: 'Early Primary (Grades 1–3)',
        ageRange: `${age} years old`,
        personaSummary: `Warm Primary School Teacher (Class ${classNum} • Age ${age})`,
        pedagogicalGuidelines: `You are an affectionate, motivating, and cheerful primary school teacher for Class ${classNum} students (aged ${age} years old).
- Be very encouraging and kind in your evaluation.
- Forgive minor spelling mistakes (e.g., phonetic spelling like 'sunlite' for 'sunlight', 'foteosynthesis' for 'photosynthesis') and simple childlike phrasing if the child demonstrates correct comprehension of the concept.
- In descriptive questions and fill-in-the-blanks, award full or high partial credit if they capture the essential idea, even if expressed in simple words.
- Provide simple, relatable, friendly feedback that a ${age}-year-old child can easily understand.`
      };
    }

    if (classNum >= 4 && classNum <= 5) {
      const age = classNum === 4 ? '9–10' : '10–11';
      return {
        gradeLevel: `Class ${classNum}`,
        schoolStage: 'Upper Primary (Grades 4–5)',
        ageRange: `${age} years old`,
        personaSummary: `Encouraging Elementary Teacher (Class ${classNum} • Age ${age})`,
        pedagogicalGuidelines: `You are a supportive, clear, and inspiring elementary school teacher for Class ${classNum} students (aged ${age} years old).
- Look for comprehension of core concepts and basic subject terminology.
- Reward logical thinking and good effort. Forgive minor grammatical or spelling slips if the meaning is obvious.
- Compare their explanation to the teacher's reference answer and award proportional credit for identifying the main facts.
- Provide friendly, constructive explanations highlighting what they did well and simple tips to improve.`
      };
    }

    if (classNum >= 6 && classNum <= 8) {
      const age = classNum === 6 ? '11–12' : classNum === 7 ? '12–13' : '13–14';
      return {
        gradeLevel: `Class ${classNum}`,
        schoolStage: 'Middle School (Grades 6–8)',
        ageRange: `${age} years old`,
        personaSummary: `Inquisitive Middle School Teacher (Class ${classNum} • Age ${age})`,
        pedagogicalGuidelines: `You are an engaging, supportive, and structured middle school teacher for Class ${classNum} students (aged ${age} years old).
- Check for conceptual accuracy, logical flow, and introductory scientific/mathematical/historical terminology.
- Compare their response thoughtfully against the teacher's reference answer and rubric. Award partial credit if key steps or components of the answer are present.
- Provide encouraging feedback that builds curiosity and guides them on articulating their thoughts clearly.`
      };
    }

    if (classNum >= 9 && classNum <= 10) {
      const age = classNum === 9 ? '14–15' : '15–16';
      return {
        gradeLevel: `Class ${classNum}`,
        schoolStage: 'Secondary / High School (Grades 9–10)',
        ageRange: `${age} years old`,
        personaSummary: `Academic Secondary School Teacher (Class ${classNum} • Age ${age})`,
        pedagogicalGuidelines: `You are a thorough, fair, and academically rigorous secondary school teacher preparing Class ${classNum} students (aged ${age} years old) for board/standardized examinations.
- Expect clear technical terminology, conceptual depth, step-by-step reasoning, and accurate definitions according to the teacher's reference answer.
- Autonomously analyze the student's submission against the teacher's reference solution and rubric, awarding precise partial credit for each valid concept or step identified.
- Provide constructive, exam-ready feedback highlighting analytical strengths and specific conceptual gaps.`
      };
    }

    if (classNum >= 11 && classNum <= 12) {
      const age = classNum === 11 ? '16–17' : '17–18';
      return {
        gradeLevel: `Class ${classNum}`,
        schoolStage: 'Senior Secondary / Pre-University (Grades 11–12)',
        ageRange: `${age} years old`,
        personaSummary: `Senior Secondary Educator (Class ${classNum} • Age ${age})`,
        pedagogicalGuidelines: `You are an expert senior secondary / pre-university instructor for Class ${classNum} students (aged ${age} years old).
- Expect formal academic rigor, comprehensive conceptual mastery, precise mathematical/scientific vocabulary, and structured reasoning.
- Evaluate the student's answer against the teacher's model answer and rubric with meticulous, fair grading.
- Provide scholarly, actionable feedback targeting advanced mastery and critical thinking.`
      };
    }
  }

  // Fallback for general / unspecified classes
  return {
    gradeLevel: className || 'General Class',
    schoolStage: 'School Assessment',
    ageRange: 'School Student',
    personaSummary: `Dedicated Classroom Teacher (${className || 'Standard'})`,
    pedagogicalGuidelines: `You are an experienced, empathetic, and constructive classroom teacher assessing student submissions.
- Autonomously compare the student's answers against the teacher's reference answers and rubric.
- Focus on conceptual understanding, valid reasoning, and clarity of thought.
- Provide encouraging, constructive feedback and clear educational explanations for every question.`
  };
}

// Canonical Fallback deterministic grading algorithm if Gemini is unavailable or times out
function calculateFallbackEvaluation(
  quiz: any,
  questions: any[],
  studentName: string,
  studentAnswers: Record<string, any>,
  profile: EducationalProfile,
  studentMeta?: any
) {
  const result = evaluateEntireQuiz(quiz, questions, studentAnswers, {
    studentId: studentMeta?.studentId || 'student',
    studentName,
    studentRoll: studentMeta?.studentRoll || '-',
    classId: quiz.class_id,
    quizTitle: quiz.title,
    subject: quiz.subject,
  });

  return {
    ...result,
    overallFeedback: `Teacher assessment for ${studentName} (${profile.gradeLevel}, ${profile.ageRange}): Scored ${result.totalScore} / ${result.maxScore} (${result.percentage}%). Review explanations for missed questions to strengthen concepts.`,
    educationalProfile: {
      gradeLevel: profile.gradeLevel,
      schoolStage: profile.schoolStage,
      ageRange: profile.ageRange,
      personaSummary: profile.personaSummary
    }
  };
}

// 6. Student Evaluation API (Fast, Idempotent, Transactional, Self-Contained & Server-Validated)
app.post('/api/quizzes/evaluate', async (req, res) => {
  try {
    const {
      quizId,
      studentName,
      studentRoll,
      studentId,
      classId,
      studentAnswers,
      studentOptionSelections: rawOptionSelections,
      studentSubOptionSelections: rawSubOptionSelections,
      attemptId: rawAttemptId
    } = req.body || {};

    const cleanName = typeof studentName === 'string' ? studentName.trim().slice(0, 200) : '';
    if (!quizId || !cleanName) {
      return res.status(400).json({ error: 'quizId and studentName are required' });
    }
    if (!studentAnswers || typeof studentAnswers !== 'object' || Array.isArray(studentAnswers)) {
      return res.status(400).json({ error: 'studentAnswers must be a valid key-value answer map' });
    }

    // Derive role STRICTLY from cryptographic server token — never trust client-supplied isAdmin flag
    const authUser = getAuthUser(req);
    const isAdminUser = authUser?.role === 'admin';

    let effectiveStudentId = '';
    if (isAdminUser) {
      effectiveStudentId = String(studentId || `admin_${Date.now()}`).trim();
    } else if (authUser?.role === 'student') {
      effectiveStudentId = String(authUser.studentId || authUser.id || '').trim();
    } else {
      const rawGuestId = String(studentId || studentRoll || cleanName.toLowerCase().replace(/[^a-z0-9]/g, '')).trim();
      effectiveStudentId = rawGuestId.toLowerCase().startsWith('admin') ? `guest_${Date.now()}` : rawGuestId;
    }

    if (!effectiveStudentId) {
      effectiveStudentId = `guest_${Date.now()}`;
    }

    const altStdId = effectiveStudentId.toUpperCase().startsWith('STD-')
      ? effectiveStudentId.slice(4).trim()
      : `STD-${effectiveStudentId}`;

    // 0. Idempotency Guard: If this exact attemptId was ALREADY saved (e.g., student retried after a dropped HTTP response),
    // return the stored evaluation cleanly instead of failing or double-inserting!
    if (rawAttemptId) {
      const { rows: existingByAttempt } = await pool.query(
        `SELECT s.*, COALESCE(q.title, s.quiz_title, 'Assessment') as resolved_quiz_title FROM quiz_submissions s LEFT JOIN quizzes q ON s.quiz_id = q.id WHERE s.attempt_id = $1 LIMIT 1`,
        [String(rawAttemptId)]
      );
      if (existingByAttempt.length > 0) {
        const sub = existingByAttempt[0];
        const parsedEval = typeof sub.ai_evaluation === 'string' ? JSON.parse(sub.ai_evaluation) : sub.ai_evaluation;
        return res.json({
          success: true,
          submissionId: sub.id,
          quizTitle: sub.resolved_quiz_title || parsedEval?.quizTitle || 'Assessment',
          studentName: sub.student_name,
          evaluation: parsedEval,
          deduplicated: true
        });
      }
    }

    // Check if re-test is blocked (only for non-admin students)
    if (!isAdminUser) {
      const [attemptCheck, subCheck] = await Promise.all([
        pool.query(
          `SELECT status FROM quiz_attempts WHERE quiz_id = $1 AND LOWER(student_id) IN (LOWER($2), LOWER($3)) LIMIT 1`,
          [quizId, effectiveStudentId, altStdId]
        ),
        pool.query(
          `SELECT s.*, COALESCE(q.title, s.quiz_title, 'Assessment') as resolved_quiz_title FROM quiz_submissions s LEFT JOIN quizzes q ON s.quiz_id = q.id WHERE s.quiz_id = $1 AND LOWER(s.student_id) IN (LOWER($2), LOWER($3)) LIMIT 1`,
          [quizId, effectiveStudentId, altStdId]
        )
      ]);
      if ((attemptCheck.rows.length > 0 && attemptCheck.rows[0].status === 'submitted') || subCheck.rows.length > 0) {
        if (rawAttemptId && subCheck.rows[0] && String(subCheck.rows[0].attempt_id || '') === String(rawAttemptId)) {
          const sub = subCheck.rows[0];
          const parsedEval = typeof sub.ai_evaluation === 'string' ? JSON.parse(sub.ai_evaluation) : sub.ai_evaluation;
          return res.json({
            success: true,
            submissionId: sub.id,
            quizTitle: sub.resolved_quiz_title || parsedEval?.quizTitle || 'Assessment',
            studentName: sub.student_name,
            evaluation: parsedEval,
            deduplicated: true
          });
        }
        return res.status(403).json({
          error: 'This assessment has already been submitted. Retests are strictly restricted for this examination.'
        });
      }
    }

    // 1. Fetch Quiz, Class & Questions
    const { rows: quizRows } = await pool.query(`SELECT * FROM quizzes WHERE id = $1`, [quizId]);
    if (quizRows.length === 0) {
      return res.status(404).json({ error: 'Quiz not found' });
    }
    const quiz = quizRows[0];
    if (!isAdminUser && !quiz.is_published) {
      return res.status(403).json({ error: 'This assessment is not currently published for students.' });
    }

    const targetClassId = classId || quiz.class_id;
    const [classRes, questionsRes] = await Promise.all([
      (targetClassId && targetClassId !== 'all')
        ? pool.query(`SELECT * FROM classes WHERE id = $1`, [targetClassId])
        : Promise.resolve({ rows: [] as any[] }),
      pool.query(`SELECT * FROM questions WHERE quiz_id = $1 ORDER BY order_index ASC, id ASC`, [quizId])
    ]);

    const classRow = classRes.rows[0] || null;
    const questions = questionsRes.rows;

    if (questions.length === 0) {
      return res.status(400).json({ error: 'Quiz has no questions to evaluate' });
    }

    // Collect permanent option IDs from request body, inline helpers, or saved attempt draft as resilient fallback
    const resolvedOptionSelections: Record<string, string> = {
      ...(studentAnswers?.__optionSelections && typeof studentAnswers.__optionSelections === 'object' ? studentAnswers.__optionSelections : {}),
      ...(rawOptionSelections && typeof rawOptionSelections === 'object' ? rawOptionSelections : {}),
    };
    const resolvedSubOptionSelections: Record<string, Record<string, string>> = {
      ...(studentAnswers?.__subOptionSelections && typeof studentAnswers.__subOptionSelections === 'object' ? studentAnswers.__subOptionSelections : {}),
      ...(rawSubOptionSelections && typeof rawSubOptionSelections === 'object' ? rawSubOptionSelections : {}),
    };

    if (!isAdminUser && (Object.keys(resolvedOptionSelections).length === 0 || Object.keys(resolvedSubOptionSelections).length === 0)) {
      try {
        const { rows: draftRows } = await pool.query(
          `SELECT draft_answers FROM quiz_attempts WHERE quiz_id = $1 AND LOWER(student_id) IN (LOWER($2), LOWER($3)) LIMIT 1`,
          [quizId, effectiveStudentId, altStdId]
        );
        const draftRaw = draftRows[0]?.draft_answers;
        const parsedDraft = typeof draftRaw === 'string' ? JSON.parse(draftRaw) : draftRaw;
        if (parsedDraft && typeof parsedDraft === 'object') {
          if (parsedDraft.__optionSelections && typeof parsedDraft.__optionSelections === 'object') {
            for (const [k, v] of Object.entries(parsedDraft.__optionSelections)) {
              if (!resolvedOptionSelections[k] && typeof v === 'string') {
                resolvedOptionSelections[k] = v;
              }
            }
          }
          if (parsedDraft.__subOptionSelections && typeof parsedDraft.__subOptionSelections === 'object') {
            for (const [k, v] of Object.entries(parsedDraft.__subOptionSelections)) {
              if (!resolvedSubOptionSelections[k] && v && typeof v === 'object') {
                resolvedSubOptionSelections[k] = v as Record<string, string>;
              }
            }
          }
        }
      } catch {
        // non-fatal draft recovery fallback
      }
    }

    // Build clean canonical studentAnswers stripped of internal tracking keys and mapped cleanly by questionId & optionId
    const cleanStudentAnswers: Record<string, any> = {};
    for (const [k, v] of Object.entries(studentAnswers || {})) {
      if (k === '__optionSelections' || k === '__subOptionSelections') continue;
      cleanStudentAnswers[k] = v;
    }
    for (const q of questions) {
      let opts: any[] = [];
      let subQs: any[] = [];
      try {
        if (q.options) opts = typeof q.options === 'string' ? JSON.parse(q.options) : q.options;
        if (q.sub_questions) subQs = typeof q.sub_questions === 'string' ? JSON.parse(q.sub_questions) : q.sub_questions;
      } catch {}

      const optId = resolvedOptionSelections[q.id];
      if (optId && Array.isArray(opts) && opts.length > 0 && (q.type === 'mcq' || (q.type === 'picture_question' && subQs.length === 0))) {
        const origIdx = parseOptionIndex(optId);
        if (origIdx !== null && origIdx >= 0 && origIdx < opts.length) {
          cleanStudentAnswers[q.id] = opts[origIdx];
        }
      }

      if (Array.isArray(subQs) && subQs.length > 0 && resolvedSubOptionSelections[q.id]) {
        const subAnswerObj = (typeof cleanStudentAnswers[q.id] === 'object' && cleanStudentAnswers[q.id] !== null)
          ? { ...cleanStudentAnswers[q.id] }
          : {};
        for (let sqIdx = 0; sqIdx < subQs.length; sqIdx++) {
          const sq = subQs[sqIdx];
          const sqKey = String(sq.id || `sq_${sqIdx}`);
          const subOptId = resolvedSubOptionSelections[q.id]?.[sq.id] || resolvedSubOptionSelections[q.id]?.[sqKey];
          if (subOptId && sq.type === 'mcq' && Array.isArray(sq.options)) {
            const origIdx = parseOptionIndex(subOptId);
            if (origIdx !== null && origIdx >= 0 && origIdx < sq.options.length) {
              subAnswerObj[sqKey] = sq.options[origIdx];
              if (sq.id && sq.id !== sqKey) subAnswerObj[sq.id] = sq.options[origIdx];
            }
          }
        }
        cleanStudentAnswers[q.id] = subAnswerObj;
      }
    }

    const educationalProfile = getClassEducationalProfile(
      classRow?.name || targetClassId || '',
      classRow?.section || '',
      classRow?.description || ''
    );

    // Build payload for AI evaluation (NEVER inline massive base64 image data URIs into the text prompt)
    const evaluationQuestions = questions.map(q => {
      let options = null;
      let matchingPairs = null;
      let subQuestions = null;
      let blankItems = null;
      try {
        if (q.options) options = typeof q.options === 'string' ? JSON.parse(q.options) : q.options;
        if (q.matching_pairs) matchingPairs = typeof q.matching_pairs === 'string' ? JSON.parse(q.matching_pairs) : q.matching_pairs;
        if (q.sub_questions) subQuestions = typeof q.sub_questions === 'string' ? JSON.parse(q.sub_questions) : q.sub_questions;
        if (q.blank_items) blankItems = typeof q.blank_items === 'string' ? JSON.parse(q.blank_items) : q.blank_items;
      } catch {}

      return {
        questionId: q.id,
        type: q.type,
        questionText: q.question_text,
        hasReferenceImage: Boolean(q.image_url),
        points: Number(q.points || 1),
        options: options || undefined,
        matchingPairs: matchingPairs || undefined,
        blankTemplate: q.blank_template || undefined,
        blankItems: blankItems || undefined,
        subQuestions: subQuestions || undefined,
        teacherCorrectAnswer: q.correct_answer,
        teacherGradingRubric: q.grading_rubric || undefined,
        studentAnswer: cleanStudentAnswers[q.id] ?? null
      };
    });

    // Determine whether this quiz actually contains descriptive open-ended questions requiring Gemini AI.
    // 100% objective tests (MCQ, True/False, Fill Blanks, Match Following, MCQ sub-questions) grade instantaneously in ~2ms!
    const hasDescriptiveQuestions = evaluationQuestions.some((eq) => {
      if (Array.isArray(eq.subQuestions) && eq.subQuestions.length > 0) {
        return eq.subQuestions.some((sq: any) => sq.type !== 'mcq');
      }
      return eq.type === 'question_answer' || eq.type === 'picture_question';
    });

    let evaluationResult: any = null;

    if (hasDescriptiveQuestions && process.env.GEMINI_API_KEY) {
      try {
        const prompt = `
You are an expert, professional, and fair classroom school teacher assessing a student's quiz submission.

EDUCATIONAL CONTEXT & TEACHER PERSONA:
- Target Grade / Class Level: ${educationalProfile.gradeLevel}
- Student Age Group: ${educationalProfile.ageRange}
- School Stage: ${educationalProfile.schoolStage}
- Teacher Persona Profile: ${educationalProfile.personaSummary}

PEDAGOGICAL EVALUATION GUIDELINES FOR THIS AGE & CLASS:
${educationalProfile.pedagogicalGuidelines}

ASSESSMENT DETAILS:
- Quiz Title: "${quiz.title}"
- Subject: "${quiz.subject}"
- Student Name: "${studentName}" ${studentRoll ? `(Roll/ID: ${studentRoll})` : ''}

QUESTIONS, TEACHER'S REFERENCE ANSWERS, SUB-QUESTIONS, AND STUDENT'S SUBMITTED ANSWERS:
${JSON.stringify(evaluationQuestions)}

CRITICAL TEACHER GRADING RULES (ZERO EFFORT/PITY MARKS FOR WRONG ANSWERS):
1. REAL TEACHER STANDARDS: Marks are awarded ONLY for factual accuracy and genuine understanding. If an answer is wrong, award ZERO marks.
2. Multiple Choice (MCQ), True/False, Fill in the Blanks, Match Following: Compare strictly against teacherCorrectAnswer.
3. Picture Questions & Questions with Sub-Questions: Populate "subEvaluations" for each sub-question individually and sum to pointsAwarded.
4. Descriptive Q&A / Open Questions: Grade against teacherCorrectAnswer and teacherGradingRubric; award 0 marks if factually wrong/irrelevant.

For EVERY question, provide: questionId, pointsAwarded, maxPoints, isCorrect ("true", "false", or "partial"), feedback, explanation, and optional subEvaluations.
Also provide: totalScore, maxScore, percentage, gradeLetter, overallFeedback, strengths, improvements.
`;

        // Bounded 4.5s timeout + concurrency gate so 40+ concurrent submissions NEVER hang or rate-limit!
        const response = await runWithTimeoutAndGate(
          () => geminiClient.models.generateContent({
            model: 'gemini-3.7-flash',
            contents: prompt,
            config: {
              systemInstruction: `You are an authentic classroom teacher grading assessments for ${educationalProfile.gradeLevel} students (${educationalProfile.ageRange}). Grade with strict academic integrity: wrong answers in objective questions must receive 0 marks. Return only valid JSON adhering strictly to the schema.`,
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  totalScore: { type: Type.NUMBER },
                  maxScore: { type: Type.NUMBER },
                  percentage: { type: Type.NUMBER },
                  gradeLetter: { type: Type.STRING },
                  overallFeedback: { type: Type.STRING },
                  strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
                  improvements: { type: Type.ARRAY, items: { type: Type.STRING } },
                  questions: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        questionId: { type: Type.STRING },
                        pointsAwarded: { type: Type.NUMBER },
                        maxPoints: { type: Type.NUMBER },
                        isCorrect: { type: Type.STRING },
                        feedback: { type: Type.STRING },
                        explanation: { type: Type.STRING },
                        subEvaluations: {
                          type: Type.ARRAY,
                          items: {
                            type: Type.OBJECT,
                            properties: {
                              subQuestionId: { type: Type.STRING },
                              label: { type: Type.STRING },
                              pointsAwarded: { type: Type.NUMBER },
                              maxPoints: { type: Type.NUMBER },
                              isCorrect: { type: Type.STRING },
                              feedback: { type: Type.STRING },
                              explanation: { type: Type.STRING }
                            },
                            required: ['subQuestionId', 'pointsAwarded', 'maxPoints', 'isCorrect', 'feedback', 'explanation']
                          }
                        }
                      },
                      required: ['questionId', 'pointsAwarded', 'maxPoints', 'isCorrect', 'feedback', 'explanation']
                    }
                  }
                },
                required: ['totalScore', 'maxScore', 'percentage', 'gradeLetter', 'overallFeedback', 'strengths', 'improvements', 'questions']
              }
            }
          }),
          2500
        );

        if (response.text) {
          let cleanText = response.text.trim();
          if (cleanText.startsWith('```json')) {
            cleanText = cleanText.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
          } else if (cleanText.startsWith('```')) {
            cleanText = cleanText.replace(/^```\s*/i, '').replace(/\s*```$/, '');
          }
          evaluationResult = JSON.parse(cleanText);
        }
      } catch (aiErr: any) {
        console.warn('Gemini AI evaluation skipped/timed out, executing fast deterministic rubric engine:', aiErr?.message || aiErr);
      }
    }

    // Fallback or instant objective evaluation
    if (!evaluationResult || !Array.isArray(evaluationResult.questions)) {
      evaluationResult = calculateFallbackEvaluation(quiz, questions, studentName, cleanStudentAnswers, educationalProfile);
    }

    // Reconcile STRICTLY against canonical teacher question order (questions ORDER BY order_index ASC, id ASC)
    // and canonical option order, grading via permanent questionId + optionId
    const aiEvalByQId = new Map<string, any>();
    for (const qr of (evaluationResult.questions || [])) {
      if (qr?.questionId) {
        aiEvalByQId.set(String(qr.questionId), qr);
      }
    }

    evaluationResult.questions = questions.map((matchingQ: any) => {
      const qr = aiEvalByQId.get(String(matchingQ.id)) || {};
      const studentAns = cleanStudentAnswers[matchingQ.id];
      const qPoints = Number(matchingQ?.points || qr.maxPoints || 1);
      const qType = matchingQ?.type || qr.type || 'question_answer';
      const selectedOptId = resolvedOptionSelections[matchingQ.id];
      const selectedSubOptMap = resolvedSubOptionSelections[matchingQ.id];

      const canonical = evaluateSingleQuestion(
        matchingQ,
        studentAns,
        undefined,
        selectedOptId,
        selectedSubOptMap
      );

      if (qType === 'question_answer') {
        const boundedScore = Number(Math.min(qPoints, Math.max(0, Number(qr.pointsAwarded ?? canonical.pointsAwarded))).toFixed(1));
        const isCorr = boundedScore >= qPoints ? true : boundedScore > 0 ? 'partial' : false;
        return {
          ...canonical,
          pointsAwarded: boundedScore,
          isCorrect: isCorr,
          feedback: qr.feedback || canonical.feedback,
          explanation: qr.explanation || canonical.explanation,
        };
      }

      return {
        ...canonical,
        feedback: qr.feedback || canonical.feedback,
        explanation: qr.explanation || canonical.explanation,
      };
    });

    const finalScoreStats = calculateQuizScore(evaluationResult.questions);
    evaluationResult.totalScore = finalScoreStats.totalScore;
    evaluationResult.maxScore = finalScoreStats.maxScore;
    evaluationResult.percentage = finalScoreStats.percentage;
    evaluationResult.gradeLetter = finalScoreStats.gradeLetter;

    evaluationResult.studentName = studentName;
    evaluationResult.studentRoll = studentRoll || '';
    evaluationResult.studentId = effectiveStudentId;
    evaluationResult.classId = classId || quiz.class_id || '';
    evaluationResult.educationalProfile = {
      gradeLevel: educationalProfile.gradeLevel,
      schoolStage: educationalProfile.schoolStage,
      ageRange: educationalProfile.ageRange,
      personaSummary: educationalProfile.personaSummary
    };

    // Resolve real student roll number cleanly
    let finalStudentRoll = (studentRoll || '').trim();
    const isBadInitialRoll = !finalStudentRoll ||
      !/^[0-9]+[a-zA-Z]?$/.test(finalStudentRoll) ||
      finalStudentRoll.toLowerCase() === effectiveStudentId.toLowerCase() ||
      finalStudentRoll.toLowerCase().startsWith('student-') ||
      finalStudentRoll.toLowerCase().startsWith('admin_') ||
      finalStudentRoll.toLowerCase().startsWith('sub-') ||
      finalStudentRoll === 'Student';

    if (isBadInitialRoll && !isAdminUser) {
      try {
        const { rows: stuRows } = await pool.query(
          `SELECT roll_no FROM students
           WHERE LOWER(student_id) = LOWER($1)
              OR LOWER(id) = LOWER($1)
           ORDER BY (roll_no IS NOT NULL AND roll_no != '') DESC
           LIMIT 1`,
          [effectiveStudentId]
        );
        if (stuRows.length > 0 && stuRows[0].roll_no && /^[0-9]+[a-zA-Z]?$/.test(String(stuRows[0].roll_no).trim())) {
          finalStudentRoll = String(stuRows[0].roll_no).trim();
        } else {
          finalStudentRoll = '-';
        }
      } catch {
        finalStudentRoll = '-';
      }
    }
    evaluationResult.studentName = cleanName;
    evaluationResult.studentRoll = finalStudentRoll;
    evaluationResult.quizTitle = quiz.title;
    evaluationResult.subject = quiz.subject;

    // Preserve immutable self-contained questions snapshot so submission records never depend on mutable/deleted quizzes
    const questionsSnapshot = questions.map((item) => mapDbQuestion(item, false));

    // 5. Atomic DB Write Transaction + Immediate Backup Snapshot
    const submissionId = `sub-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const attemptId = rawAttemptId ? String(rawAttemptId) : `att-${quizId}-${effectiveStudentId}-${Date.now()}`;
    const resolvedClassId = classId || quiz.class_id;
    const nowIso = new Date().toISOString();

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Re-check idempotency / duplicate inside transaction
      if (!isAdminUser) {
        const { rows: dupSubs } = await client.query(
          `SELECT id, ai_evaluation, student_name, quiz_title FROM quiz_submissions WHERE attempt_id = $1 OR (quiz_id = $2 AND LOWER(student_id) IN (LOWER($3), LOWER($4))) LIMIT 1`,
          [attemptId, quizId, effectiveStudentId, altStdId]
        );
        if (dupSubs.length > 0) {
          await client.query('ROLLBACK');
          const dupEval = typeof dupSubs[0].ai_evaluation === 'string' ? JSON.parse(dupSubs[0].ai_evaluation) : dupSubs[0].ai_evaluation;
          return res.json({
            success: true,
            submissionId: dupSubs[0].id,
            quizTitle: dupSubs[0].quiz_title || quiz.title,
            studentName: dupSubs[0].student_name,
            evaluation: dupEval,
            deduplicated: true
          });
        }
      }

      const insertValues = [
        submissionId,
        quizId,
        effectiveStudentId,
        attemptId,
        cleanName,
        finalStudentRoll || '',
        resolvedClassId,
        nowIso,
        JSON.stringify(cleanStudentAnswers || {}),
        JSON.stringify(evaluationResult),
        evaluationResult.totalScore,
        evaluationResult.maxScore,
        'graded',
        quiz.title,
        quiz.subject,
        evaluationResult.gradeLetter || 'F',
        JSON.stringify(questionsSnapshot)
      ];

      await client.query(
        `INSERT INTO quiz_submissions (
           id, quiz_id, student_id, attempt_id, student_name, student_roll, class_id, submitted_at,
           student_answers, ai_evaluation, total_score, max_score, status, quiz_title, quiz_subject, grade_letter, questions_snapshot
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
        insertValues
      );

      // Record immutable backup snapshot in the same transaction
      await backupSubmissionRow(client, {
        id: submissionId,
        quiz_id: quizId,
        student_id: effectiveStudentId,
        attempt_id: attemptId,
        student_name: cleanName,
        student_roll: finalStudentRoll || '',
        class_id: resolvedClassId,
        submitted_at: nowIso,
        student_answers: cleanStudentAnswers || {},
        ai_evaluation: evaluationResult,
        total_score: evaluationResult.totalScore,
        max_score: evaluationResult.maxScore,
        status: 'graded',
        quiz_title: quiz.title,
        quiz_subject: quiz.subject,
        grade_letter: evaluationResult.gradeLetter || 'F',
        questions_snapshot: questionsSnapshot,
      }, 'submitted');

      const submittedAnsweredCount = countAnsweredQuestions(questions, cleanStudentAnswers);
      const submittedTotalQuestions = questions.length;

      // Mark attempt completed safely with final score & question counts
      const { rowCount: updatedAttempts } = await client.query(
        `UPDATE quiz_attempts
         SET status = 'submitted',
             live_score = $4,
             max_score = $5,
             answered_count = $6,
             total_questions = $7,
             updated_at = NOW()
         WHERE quiz_id = $1 AND LOWER(student_id) IN (LOWER($2), LOWER($3))`,
        [
          quizId,
          effectiveStudentId,
          altStdId,
          Number(evaluationResult.totalScore || 0),
          Number(evaluationResult.maxScore || 0),
          submittedAnsweredCount,
          submittedTotalQuestions
        ]
      );
      if (!updatedAttempts) {
        await client.query(
          `INSERT INTO quiz_attempts (id, quiz_id, student_id, student_name, started_at, status, live_score, max_score, answered_count, total_questions, updated_at)
           VALUES ($1, $2, $3, $4, NOW(), 'submitted', $5, $6, $7, $8, NOW())
           ON CONFLICT (quiz_id, student_id) DO UPDATE SET
             status = 'submitted',
             live_score = EXCLUDED.live_score,
             max_score = EXCLUDED.max_score,
             answered_count = EXCLUDED.answered_count,
             total_questions = EXCLUDED.total_questions,
             updated_at = NOW()`,
          [
            `att-${quizId}-${effectiveStudentId}`,
            quizId,
            effectiveStudentId,
            cleanName,
            Number(evaluationResult.totalScore || 0),
            Number(evaluationResult.maxScore || 0),
            submittedAnsweredCount,
            submittedTotalQuestions
          ]
        );
      }

      await client.query('COMMIT');
      broadcastLiveMonitorEvent('attempt:submitted', {
        quizId,
        quizTitle: quiz.title,
        quizSubject: quiz.subject,
        classId: resolvedClassId,
        studentId: effectiveStudentId,
        studentName: cleanName,
        studentRoll: finalStudentRoll || resolveGuestRollFallback(effectiveStudentId),
        submissionId,
        attemptId,
        totalScore: Number(evaluationResult.totalScore || 0),
        maxScore: Number(evaluationResult.maxScore || 0),
        percentage: Number(evaluationResult.percentage || 0),
        gradeLetter: evaluationResult.gradeLetter || 'F',
        answeredCount: submittedAnsweredCount,
        totalQuestions: submittedTotalQuestions,
        progressPercentage: submittedTotalQuestions > 0 ? Math.round((submittedAnsweredCount / submittedTotalQuestions) * 100) : 100,
        submittedAt: nowIso,
        status: 'graded'
      });
    } catch (txErr: any) {
      try { await client.query('ROLLBACK'); } catch {}
      // Handle rare concurrent race on unique attempt_id or (quiz_id, student_id) cleanly as idempotent success
      if (txErr?.code === '23505') {
        const { rows: raceSubs } = await pool.query(
          `SELECT id, ai_evaluation, student_name FROM quiz_submissions WHERE attempt_id = $1 OR (quiz_id = $2 AND LOWER(student_id) IN (LOWER($3), LOWER($4))) LIMIT 1`,
          [attemptId, quizId, effectiveStudentId, altStdId]
        );
        if (raceSubs.length > 0) {
          const raceEval = typeof raceSubs[0].ai_evaluation === 'string'
            ? JSON.parse(raceSubs[0].ai_evaluation)
            : raceSubs[0].ai_evaluation;
          return res.json({
            success: true,
            submissionId: raceSubs[0].id,
            quizTitle: quiz.title,
            studentName: raceSubs[0].student_name,
            evaluation: raceEval,
            deduplicated: true
          });
        }
      }
      throw txErr;
    } finally {
      client.release();
    }

    res.json({
      success: true,
      submissionId,
      quizTitle: quiz.title,
      studentName: cleanName,
      evaluation: evaluationResult
    });
  } catch (err: any) {
    console.error('Evaluation route error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Teacher AI Assistant: Auto-generate Model Answer & Rubric for Question Prompt
app.post('/api/quizzes/generate-solution', requireAdmin, async (req, res) => {
  try {
    const { questionText, type, classId, subject } = req.body;
    if (!questionText || !questionText.trim()) {
      return res.status(400).json({ error: 'Question text is required' });
    }

    let classRow: any = null;
    if (classId && classId !== 'all') {
      const { rows: cRows } = await pool.query(`SELECT * FROM classes WHERE id = $1`, [classId]);
      if (cRows.length > 0) classRow = cRows[0];
    }
    const profile = getClassEducationalProfile(classRow?.name || classId || '', classRow?.section || '', classRow?.description || '');

    const prompt = `
You are a master teacher generating the definitive reference solution and grading rubric for a school exam question.

Question Type: ${type || 'question_answer'}
Target Grade/Class Level: ${profile.gradeLevel} (${profile.ageRange})
Subject: ${subject || 'General'}
Question Prompt: "${questionText}"

Generate:
1. correctAnswer: The comprehensive, accurate model solution/reference answer that a student should ideally provide.
2. gradingRubric: A concise guideline for scoring criteria (key concepts, partial marks, terminology to check).
${type === 'mcq' ? '3. options: Array of 4 realistic multiple-choice options (with one matching correctAnswer).' : ''}
${type === 'fill_blanks' ? '3. blankAnswer: The single exact word/phrase that completes the blank.' : ''}

Respond in pure JSON.
`;

    const response = await geminiClient.models.generateContent({
      model: 'gemini-3.7-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            correctAnswer: { type: Type.STRING },
            gradingRubric: { type: Type.STRING },
            options: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            blankAnswer: { type: Type.STRING }
          },
          required: ['correctAnswer', 'gradingRubric']
        }
      }
    });

    if (response.text) {
      let cleanText = response.text.trim();
      if (cleanText.startsWith('```json')) {
        cleanText = cleanText.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
      } else if (cleanText.startsWith('```')) {
        cleanText = cleanText.replace(/^```\s*/i, '').replace(/\s*```$/, '');
      }
      const data = JSON.parse(cleanText);
      return res.json({ success: true, data });
    }

    res.json({
      success: true,
      data: {
        correctAnswer: 'Model answer for: ' + questionText,
        gradingRubric: 'Award full marks for stating the core concept clearly.'
      }
    });
  } catch (err: any) {
    console.error('Error generating AI solution:', err);
    res.status(500).json({ error: err.message });
  }
});

// Helper to ensure every submission has rich question-by-question evaluation details (supports batched pre-fetched questions & self-contained questions_snapshot)
async function ensureSubmissionEvaluation(r: any, prefetchedQuizQuestions?: any[]) {
  let parsedEval = typeof r.ai_evaluation === 'string' ? JSON.parse(r.ai_evaluation) : r.ai_evaluation;
  const studentAnswers = typeof r.student_answers === 'string' ? JSON.parse(r.student_answers) : r.student_answers || {};

  const getQuizQuestions = async () => {
    if (prefetchedQuizQuestions && prefetchedQuizQuestions.length > 0) return prefetchedQuizQuestions;
    const { rows } = await pool.query(
      `SELECT * FROM questions WHERE quiz_id = $1 ORDER BY order_index ASC, id ASC`,
      [r.quiz_id]
    );
    if (rows.length > 0) return rows;
    // Fallback to immutable snapshot stored inside quiz_submissions if quiz was later modified/deleted
    if (r.questions_snapshot) {
      try {
        const snap = typeof r.questions_snapshot === 'string' ? JSON.parse(r.questions_snapshot) : r.questions_snapshot;
        if (Array.isArray(snap)) return snap;
      } catch {}
    }
    return [];
  };

  // If questions array is missing or empty, fetch the questions from database / snapshot and construct evaluation items
  if (!parsedEval || !Array.isArray(parsedEval.questions) || parsedEval.questions.length === 0) {
    const quizQuestions = await getQuizQuestions();

    const constructedQuestions = quizQuestions.map((q: any) => {
      const sAns = studentAnswers ? studentAnswers[q.id] : undefined;
      return evaluateSingleQuestion(q, sAns);
    });

    const scoreStats = calculateQuizScore(constructedQuestions);
    const finalTotal = scoreStats.totalScore;
    const finalMax = scoreStats.maxScore;
    const pct = scoreStats.percentage;
    const gradeLetter = scoreStats.gradeLetter;

    parsedEval = {
      ...(parsedEval || {}),
      submissionId: r.id,
      quizId: r.quiz_id,
      quizTitle: r.quiz_title || 'Assessment',
      studentName: r.student_name,
      studentRoll: (r.student_roll && /^[0-9]+[a-zA-Z]?$/.test(String(r.student_roll).trim()) ? String(r.student_roll).trim() : '-'),
      studentId: r.student_id,
      classId: r.class_id,
      subject: r.quiz_subject || 'General',
      submittedAt: r.submitted_at,
      totalScore: finalTotal,
      maxScore: finalMax,
      percentage: pct,
      gradeLetter,
      overallFeedback: parsedEval?.overallFeedback || `Completed with score of ${finalTotal}/${finalMax} (${pct}%).`,
      questions: constructedQuestions
    };

    pool.query(
      `UPDATE quiz_submissions SET ai_evaluation = $1, total_score = $2, max_score = $3, grade_letter = $4 WHERE id = $5`,
      [JSON.stringify(parsedEval), finalTotal, finalMax, gradeLetter, r.id]
    ).catch(e => console.error('Failed to update submission cache in Neon:', e));
  } else {
    // Check if any question is missing details or imageUrl
    const quizQuestions = await getQuizQuestions();

    let needsUpdate = false;

    // Enforce canonical teacher question order when quizQuestions is present
    if (quizQuestions.length > 0 && Array.isArray(parsedEval.questions)) {
      const existingOrderIds = parsedEval.questions.map((qr: any) => String(qr?.questionId || ''));
      const evalByQId = new Map<string, any>();
      parsedEval.questions.forEach((qr: any) => {
        if (qr?.questionId) evalByQId.set(String(qr.questionId), qr);
      });
      const usedEvalIds = new Set<string>();
      const reorderedQuestions: any[] = [];
      for (const qq of quizQuestions) {
        const matchQr = evalByQId.get(String(qq.id));
        if (matchQr) {
          usedEvalIds.add(String(qq.id));
          reorderedQuestions.push(matchQr);
        }
      }
      for (const qr of parsedEval.questions) {
        if (!qr?.questionId || !usedEvalIds.has(String(qr.questionId))) {
          reorderedQuestions.push(qr);
        }
      }
      const newOrderIds = reorderedQuestions.map((qr: any) => String(qr?.questionId || ''));
      if (JSON.stringify(existingOrderIds) !== JSON.stringify(newOrderIds)) {
        needsUpdate = true;
      }
      parsedEval.questions = reorderedQuestions;
    }

    parsedEval.questions = parsedEval.questions.map((qr: any) => {
      const matchingQ = quizQuestions.find((q: any) => q.id === qr.questionId);
      if (matchingQ) {
        let canonicalOpts: any = null;
        if (matchingQ.options) {
          try {
            canonicalOpts = typeof matchingQ.options === 'string' ? JSON.parse(matchingQ.options) : matchingQ.options;
          } catch {}
        }
        const opts = (Array.isArray(canonicalOpts) && canonicalOpts.length > 0) ? canonicalOpts : qr.options;
        let matchingPairs = qr.matchingPairs || (qr as any).matching_pairs;
        const rawMP = matchingQ.matching_pairs ?? matchingQ.matchingPairs;
        if ((!matchingPairs || matchingPairs.length === 0) && rawMP) {
          try {
            matchingPairs = typeof rawMP === 'string' ? JSON.parse(rawMP) : rawMP;
          } catch {}
        }
        let blankItems = qr.blankItems || (qr as any).blank_items;
        const rawBI = matchingQ.blank_items ?? matchingQ.blankItems;
        if ((!blankItems || blankItems.length === 0) && rawBI) {
          try {
            blankItems = typeof rawBI === 'string' ? JSON.parse(rawBI) : rawBI;
          } catch {}
        }
        let rawSubQ: any[] = [];
        const rawSQ = matchingQ.sub_questions ?? matchingQ.subQuestions;
        if (rawSQ) {
          try {
            rawSubQ = typeof rawSQ === 'string' ? JSON.parse(rawSQ) : rawSQ;
          } catch {}
        }
        let subEvaluations = qr.subEvaluations;
        if ((!Array.isArray(subEvaluations) || subEvaluations.length === 0) && Array.isArray(rawSubQ) && rawSubQ.length > 0) {
          const sAns = qr.studentAnswer !== undefined ? qr.studentAnswer : (studentAnswers ? studentAnswers[qr.questionId] : undefined);
          subEvaluations = evaluateSubQuestions(rawSubQ, sAns, Number(matchingQ.points || qr.maxPoints || 1)).subEvaluations;
          needsUpdate = true;
        } else if (Array.isArray(subEvaluations) && Array.isArray(rawSubQ) && rawSubQ.length > 0) {
          const subById = new Map<string, any>();
          subEvaluations.forEach((se: any) => {
            if (se?.subQuestionId) subById.set(String(se.subQuestionId), se);
          });
          subEvaluations = rawSubQ.map((matchingSq: any, sIdx: number) => {
            const se = subById.get(String(matchingSq.id)) || subEvaluations[sIdx] || {};
            return {
              ...se,
              subQuestionId: se.subQuestionId || matchingSq.id,
              label: se.label || matchingSq?.label,
              questionText: se.questionText || matchingSq?.questionText,
              correctAnswer: se.correctAnswer || matchingSq?.correctAnswer,
            };
          });
        }
        const rawImg = matchingQ.image_url ?? matchingQ.imageUrl;
        const img = qr.imageUrl || rawImg;
        if (!qr.imageUrl && rawImg) {
          needsUpdate = true;
        }
        return {
          ...qr,
          questionText: qr.questionText || matchingQ.question_text || matchingQ.questionText,
          correctAnswer: qr.correctAnswer || matchingQ.correct_answer || matchingQ.correctAnswer,
          type: qr.type || matchingQ.type,
          options: opts,
          matchingPairs: matchingPairs || qr.matchingPairs,
          matching_pairs: matchingPairs || qr.matching_pairs,
          blankItems: blankItems || qr.blankItems,
          blank_items: blankItems || qr.blank_items,
          blankTemplate: qr.blankTemplate || matchingQ.blank_template || matchingQ.blankTemplate,
          subEvaluations: subEvaluations || qr.subEvaluations,
          imageUrl: img || qr.imageUrl,
          gradingRubric: qr.gradingRubric || matchingQ.grading_rubric || matchingQ.gradingRubric,
          studentAnswer: qr.studentAnswer !== undefined ? qr.studentAnswer : (studentAnswers ? studentAnswers[qr.questionId] : undefined)
        };
      }
      return qr;
    });

    // Ensure totalScore, maxScore, percentage, and gradeLetter are strictly in sync with question items
    const scoreStats = calculateQuizScore(parsedEval.questions);
    if (parsedEval.totalScore !== scoreStats.totalScore || parsedEval.maxScore !== scoreStats.maxScore || !parsedEval.gradeLetter) {
      parsedEval.totalScore = scoreStats.totalScore;
      parsedEval.maxScore = scoreStats.maxScore;
      parsedEval.percentage = scoreStats.percentage;
      parsedEval.gradeLetter = scoreStats.gradeLetter;
      needsUpdate = true;
    }

    if (needsUpdate) {
      pool.query(
        `UPDATE quiz_submissions SET ai_evaluation = $1, total_score = $2, max_score = $3, grade_letter = $4 WHERE id = $5`,
        [JSON.stringify(parsedEval), parsedEval.totalScore, parsedEval.maxScore, parsedEval.gradeLetter, r.id]
      ).catch(e => console.error('Failed to update submission cache in Neon:', e));
    }
  }

  return parsedEval;
}

// 7. Get Submissions (Authenticated — Strictly Scoped per Student OR Full Teacher View, Zero TOAST overhead on list load)
app.get('/api/submissions', requireAuth, async (req, res) => {
  try {
    const authUser: AuthTokenPayload = (req as any).authUser;
    const { quizId, classId, studentName, studentId } = req.query;
    const isFull = req.query.full === 'true';
    const limitParam = Math.min(2000, Math.max(1, parseInt(String(req.query.limit || '2000'), 10) || 2000));
    const offsetParam = Math.max(0, parseInt(String(req.query.offset || '0'), 10) || 0);

    let query = `
      SELECT 
        ${isFull
          ? 's.*'
          : 's.id, s.quiz_id, s.student_name, s.student_roll, s.student_id, s.class_id, s.submitted_at, s.total_score, s.max_score, s.status, s.grade_letter'},
        COALESCE(q.title, s.quiz_title, 'Assessment') as quiz_title, 
        COALESCE(q.subject, s.quiz_subject, 'General') as quiz_subject
      FROM quiz_submissions s
      LEFT JOIN quizzes q ON s.quiz_id = q.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (quizId && quizId !== 'all') {
      params.push(quizId);
      query += ` AND s.quiz_id = $${params.length}`;
    }
    if (classId && classId !== 'all') {
      params.push(classId);
      query += ` AND s.class_id = $${params.length}`;
    }

    // Strict Isolation: Students can ONLY ever list their own submissions regardless of query params
    if (authUser.role === 'student') {
      const ownId = String(authUser.studentId || authUser.id || '').trim();
      const altOwnId = ownId.toUpperCase().startsWith('STD-') ? ownId.slice(4).trim() : `STD-${ownId}`;
      params.push(ownId, altOwnId);
      query += ` AND (LOWER(TRIM(s.student_id)) IN (LOWER($${params.length - 1}), LOWER($${params.length})))`;
    } else if (studentId) {
      params.push(studentId);
      query += ` AND (LOWER(TRIM(s.student_id)) = LOWER(TRIM($${params.length})) OR LOWER(TRIM(s.id)) = LOWER(TRIM($${params.length})))`;
    }

    if (authUser.role === 'admin' && studentName) {
      params.push(`%${studentName}%`);
      query += ` AND s.student_name ILIKE $${params.length}`;
    }

    params.push(limitParam, offsetParam);
    query += ` ORDER BY s.submitted_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const { rows } = await pool.query(query, params);

    if (isFull) {
      // Batch pre-fetch all questions for all referenced quizzes once (eliminates N+1 query storm)
      const uniqueQuizIds = Array.from(new Set(rows.map((r: any) => r.quiz_id).filter(Boolean)));
      const questionsByQuiz = new Map<string, any[]>();
      if (uniqueQuizIds.length > 0) {
        const { rows: allQs } = await pool.query(
          `SELECT * FROM questions WHERE quiz_id = ANY($1::varchar[]) ORDER BY order_index ASC, id ASC`,
          [uniqueQuizIds]
        );
        for (const q of allQs) {
          const arr = questionsByQuiz.get(q.quiz_id) || [];
          arr.push(q);
          questionsByQuiz.set(q.quiz_id, arr);
        }
      }

      const fullSubmissions = await Promise.all(rows.map(async r => {
        const parsedEval = await ensureSubmissionEvaluation(r, questionsByQuiz.get(r.quiz_id) || []);
        const cleanRoll = (/^[0-9]+[a-zA-Z]?$/.test(String(r.student_roll || '').trim()) && String(r.student_roll || '').trim().toLowerCase() !== String(r.student_id || '').toLowerCase().trim())
          ? String(r.student_roll).trim()
          : '-';

        if (parsedEval) {
          parsedEval.studentRoll = cleanRoll;
          parsedEval.studentId = r.student_id;
        }

        return {
          id: r.id,
          quizId: r.quiz_id,
          quizTitle: r.quiz_title,
          quizSubject: r.quiz_subject,
          studentName: r.student_name,
          studentRoll: cleanRoll,
          studentId: r.student_id,
          classId: r.class_id,
          submittedAt: r.submitted_at,
          studentAnswers: typeof r.student_answers === 'string' ? JSON.parse(r.student_answers) : (r.student_answers || {}),
          evaluation: parsedEval,
          aiEvaluation: parsedEval,
          totalScore: Number(parsedEval?.totalScore ?? r.total_score ?? 0),
          maxScore: Number(parsedEval?.maxScore ?? r.max_score ?? 0),
          status: r.status
        };
      }));
      return res.json(fullSubmissions);
    }

    const submissions = rows.map(r => {
      const totalScore = Number(r.total_score ?? 0);
      const maxScore = Number(r.max_score ?? 0);
      const pct = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
      const gradeLetter = r.grade_letter || calcGradeLetter(pct);

      const parsedEval = {
        submissionId: r.id,
        quizId: r.quiz_id,
        quizTitle: r.quiz_title,
        studentName: r.student_name,
        studentRoll: r.student_roll || '-',
        studentId: r.student_id,
        classId: r.class_id,
        subject: r.quiz_subject,
        submittedAt: r.submitted_at,
        totalScore,
        maxScore,
        percentage: pct,
        gradeLetter,
        overallFeedback: '',
        questions: []
      };

      return {
        id: r.id,
        quizId: r.quiz_id,
        quizTitle: r.quiz_title,
        quizSubject: r.quiz_subject,
        studentName: r.student_name,
        studentRoll: r.student_roll || '-',
        studentId: r.student_id,
        classId: r.class_id,
        submittedAt: r.submitted_at,
        studentAnswers: {},
        evaluation: parsedEval,
        aiEvaluation: parsedEval,
        totalScore,
        maxScore,
        status: r.status
      };
    });

    res.json(submissions);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get single submission (Authenticated — Students Strictly Isolated to Their Own Submission)
app.get('/api/submissions/:id', requireAuth, async (req, res) => {
  try {
    const authUser: AuthTokenPayload = (req as any).authUser;
    const { id } = req.params;
    const { rows } = await pool.query(
      `SELECT s.*, 
              COALESCE(q.title, s.quiz_title, s.ai_evaluation->>'quizTitle', 'Assessment') as quiz_title, 
              COALESCE(q.subject, s.quiz_subject, s.ai_evaluation->>'subject', 'General') as quiz_subject
       FROM quiz_submissions s
       LEFT JOIN quizzes q ON s.quiz_id = q.id
       WHERE s.id = $1`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    const r = rows[0];
    if (authUser.role === 'student') {
      const ownId = String(authUser.studentId || authUser.id || '').trim().toLowerCase();
      const altOwnId = ownId.startsWith('std-') ? ownId.slice(4).trim() : `std-${ownId}`;
      const subStudentId = String(r.student_id || '').trim().toLowerCase();
      if (!subStudentId || (subStudentId !== ownId && subStudentId !== altOwnId)) {
        return res.status(403).json({ error: 'Access denied: you may only view your own submission.' });
      }
    }

    const parsedEval = await ensureSubmissionEvaluation(r);
    const cleanRoll = (/^[0-9]+[a-zA-Z]?$/.test(String(r.student_roll || '').trim()) && String(r.student_roll || '').trim().toLowerCase() !== String(r.student_id || '').toLowerCase().trim())
      ? String(r.student_roll).trim()
      : '-';

    if (parsedEval) {
      parsedEval.studentRoll = cleanRoll;
      parsedEval.studentId = r.student_id;
    }

    res.json({
      id: r.id,
      quizId: r.quiz_id,
      quizTitle: r.quiz_title,
      quizSubject: r.quiz_subject,
      studentName: r.student_name,
      studentRoll: cleanRoll,
      studentId: r.student_id,
      classId: r.class_id,
      submittedAt: r.submitted_at,
      studentAnswers: typeof r.student_answers === 'string' ? JSON.parse(r.student_answers) : r.student_answers,
      evaluation: parsedEval,
      aiEvaluation: parsedEval,
      totalScore: Number(parsedEval.totalScore ?? r.total_score ?? 0),
      maxScore: Number(parsedEval.maxScore ?? r.max_score ?? 0),
      status: r.status
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Teacher / Admin: Manual Grade Override / Adjust Marks (Server-Validated & Backed Up)
app.put('/api/submissions/:id/grade', requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { evaluation, totalScore, maxScore, status } = req.body || {};

    if (!evaluation || typeof evaluation !== 'object') {
      return res.status(400).json({ error: 'Valid evaluation object is required' });
    }

    const { rows: curRows } = await client.query(`SELECT * FROM quiz_submissions WHERE id = $1`, [id]);
    if (curRows.length === 0) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    let finalMax = Math.max(0, Number(maxScore ?? curRows[0].max_score ?? 0));
    let finalTotal = Math.max(0, Number(totalScore ?? 0));
    if (finalMax > 0) {
      finalTotal = Math.min(finalMax, finalTotal);
    }

    if (Array.isArray(evaluation.questions) && evaluation.questions.length > 0) {
      evaluation.questions = evaluation.questions.map((q: any) => {
        const qMax = Math.max(0, Number(q.maxPoints || 1));
        const qPts = Math.min(qMax, Math.max(0, Number(q.pointsAwarded || 0)));
        return {
          ...q,
          maxPoints: qMax,
          pointsAwarded: Number(qPts.toFixed(1)),
          isCorrect: qPts >= qMax ? true : qPts > 0 ? 'partial' : false,
        };
      });
      const stats = calculateQuizScore(evaluation.questions);
      finalTotal = stats.totalScore;
      finalMax = stats.maxScore;
      evaluation.totalScore = finalTotal;
      evaluation.maxScore = finalMax;
      evaluation.percentage = stats.percentage;
      evaluation.gradeLetter = stats.gradeLetter;
    } else {
      const pct = finalMax > 0 ? Math.round((finalTotal / finalMax) * 100) : 0;
      evaluation.totalScore = finalTotal;
      evaluation.maxScore = finalMax;
      evaluation.percentage = pct;
      evaluation.gradeLetter = calcGradeLetter(pct);
    }

    const finalGradeLetter = evaluation.gradeLetter || calcGradeLetter(finalMax > 0 ? Math.round((finalTotal / finalMax) * 100) : 0);

    await client.query('BEGIN');
    const { rows: updated } = await client.query(
      `UPDATE quiz_submissions
       SET ai_evaluation = $1, total_score = $2, max_score = $3, grade_letter = $4, status = $5
       WHERE id = $6
       RETURNING *`,
      [
        JSON.stringify(evaluation),
        finalTotal,
        finalMax,
        finalGradeLetter,
        status || 'graded',
        id
      ]
    );
    if (updated[0]) {
      await backupSubmissionRow(client, updated[0], 'grade_updated');
    }
    await client.query('COMMIT');

    res.json({ success: true, message: 'Grade updated successfully', totalScore: finalTotal, maxScore: finalMax });
  } catch (err: any) {
    try { await client.query('ROLLBACK'); } catch {}
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Teacher / Admin: Delete Submission permanently from DB (writes backup snapshot first for accidental deletion recovery)
app.delete('/api/submissions/:id', requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    await client.query('BEGIN');
    const { rows } = await client.query(`SELECT * FROM quiz_submissions WHERE id = $1`, [id]);
    let deletedQuizId: string | null = null;
    let deletedStudentId: string | null = null;
    if (rows.length > 0) {
      await backupSubmissionRow(client, rows[0], 'pre_delete');
      const { quiz_id, student_id } = rows[0];
      deletedQuizId = quiz_id;
      deletedStudentId = student_id;
      await client.query(
        `DELETE FROM quiz_attempts WHERE quiz_id = $1 AND LOWER(student_id) = LOWER($2)`,
        [quiz_id, student_id]
      );
    }
    await client.query(`DELETE FROM quiz_submissions WHERE id = $1`, [id]);
    await client.query('COMMIT');
    broadcastLiveMonitorEvent('attempt:reset', { quizId: deletedQuizId, studentId: deletedStudentId, submissionId: id });
    res.json({ success: true });
  } catch (err: any) {
    try { await client.query('ROLLBACK'); } catch {}
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Teacher / Admin: Bulk Delete All / Filtered Submissions permanently from DB (writes backup snapshots first)
app.post('/api/submissions/bulk-delete', requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const ids = Array.isArray(req.body?.ids)
      ? req.body.ids.map((id: any) => String(id).trim()).filter(Boolean)
      : [];

    if (ids.length === 0) {
      return res.json({ success: true, deletedCount: 0 });
    }

    await client.query('BEGIN');
    const { rows: rowsToBackup } = await client.query(
      `SELECT * FROM quiz_submissions WHERE id = ANY($1::text[])`,
      [ids]
    );
    for (const row of rowsToBackup) {
      await backupSubmissionRow(client, row, 'pre_bulk_delete');
    }

    const { rows: deletedRows } = await client.query(
      `DELETE FROM quiz_submissions WHERE id = ANY($1::text[]) RETURNING id, quiz_id, student_id`,
      [ids]
    );

    if (deletedRows.length > 0) {
      const quizIds = deletedRows.map((r) => r.quiz_id || '');
      const studentIds = deletedRows.map((r) => String(r.student_id || '').toLowerCase());
      await client.query(
        `DELETE FROM quiz_attempts a
         USING UNNEST($1::text[], $2::text[]) AS d(quiz_id, student_id)
         WHERE a.quiz_id = d.quiz_id AND LOWER(a.student_id) = d.student_id`,
        [quizIds, studentIds]
      );
    }

    await client.query('COMMIT');
    broadcastLiveMonitorEvent('attempt:reset', {
      bulkDeleted: deletedRows.length,
      submissionIds: deletedRows.map((r) => r.id),
    });
    res.json({ success: true, deletedCount: deletedRows.length });
  } catch (err: any) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('Error bulk deleting submissions:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Teacher / Admin: Inspect & Restore Submission Backups
app.get('/api/admin/backups', requireAdmin, async (req, res) => {
  try {
    const { quizId, studentId } = req.query;
    let query = `
      SELECT id, submission_id, quiz_id, student_id, student_name, student_roll, class_id, total_score, max_score, backup_reason, created_at
      FROM submission_backups
      WHERE 1=1
    `;
    const params: any[] = [];
    if (quizId) {
      params.push(quizId);
      query += ` AND quiz_id = $${params.length}`;
    }
    if (studentId) {
      params.push(studentId);
      query += ` AND LOWER(student_id) = LOWER($${params.length})`;
    }
    query += ` ORDER BY created_at DESC LIMIT 200`;
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/backups/:backupId/restore', requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { backupId } = req.params;
    const { rows } = await client.query(`SELECT * FROM submission_backups WHERE id = $1`, [backupId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Backup record not found' });
    }
    const bkp = rows[0];
    const snap = typeof bkp.snapshot === 'string' ? JSON.parse(bkp.snapshot) : bkp.snapshot;
    const restoreId = snap.id || bkp.submission_id || `sub-restored-${Date.now()}`;

    await client.query('BEGIN');
    await client.query(
      `INSERT INTO quiz_submissions (
         id, quiz_id, student_id, attempt_id, student_name, student_roll, class_id, submitted_at,
         student_answers, ai_evaluation, total_score, max_score, status, quiz_title, quiz_subject, grade_letter, questions_snapshot
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       ON CONFLICT (id) DO UPDATE SET
         student_answers = EXCLUDED.student_answers,
         ai_evaluation = EXCLUDED.ai_evaluation,
         total_score = EXCLUDED.total_score,
         max_score = EXCLUDED.max_score,
         grade_letter = EXCLUDED.grade_letter,
         status = EXCLUDED.status`,
      [
        restoreId,
        snap.quiz_id || bkp.quiz_id,
        snap.student_id || bkp.student_id,
        snap.attempt_id || null,
        snap.student_name || bkp.student_name,
        snap.student_roll || bkp.student_roll || '',
        snap.class_id || bkp.class_id || '',
        snap.submitted_at || bkp.created_at || new Date().toISOString(),
        JSON.stringify(snap.student_answers || {}),
        JSON.stringify(snap.ai_evaluation || {}),
        Number(snap.total_score ?? bkp.total_score ?? 0),
        Number(snap.max_score ?? bkp.max_score ?? 0),
        snap.status || 'graded',
        snap.quiz_title || snap.ai_evaluation?.quizTitle || 'Assessment',
        snap.quiz_subject || snap.ai_evaluation?.subject || 'General',
        snap.grade_letter || snap.ai_evaluation?.gradeLetter || 'F',
        snap.questions_snapshot ? JSON.stringify(snap.questions_snapshot) : null
      ]
    );
    await client.query('COMMIT');
    res.json({ success: true, submissionId: restoreId });
  } catch (err: any) {
    try { await client.query('ROLLBACK'); } catch {}
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ==========================================
// 7.1. DEDICATED STANDALONE PRINTING ROUTES
// (Serves self-contained A4 HTML with instant print dialogue execution)
// ==========================================

// Single Student Printable Exam Answer Sheet (Authenticated — Admins see any; students ONLY their own)
app.get('/api/print/submission/:id', requireAuth, async (req, res) => {
  try {
    const authUser: AuthTokenPayload = (req as any).authUser;
    const { id } = req.params;
    const { rows } = await pool.query(
      `SELECT s.*, 
              COALESCE(q.title, s.quiz_title, s.ai_evaluation->>'quizTitle', 'Assessment') as quiz_title, 
              COALESCE(q.subject, s.quiz_subject, s.ai_evaluation->>'subject', 'General') as quiz_subject
       FROM quiz_submissions s
       LEFT JOIN quizzes q ON s.quiz_id = q.id
       WHERE s.id = $1`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).send('<!DOCTYPE html><html><body><h1>Submission not found</h1></body></html>');
    }

    const r = rows[0];
    if (authUser.role === 'student') {
      const ownId = String(authUser.studentId || authUser.id || '').trim().toLowerCase();
      const altOwnId = ownId.startsWith('std-') ? ownId.slice(4).trim() : `std-${ownId}`;
      const subStudentId = String(r.student_id || '').trim().toLowerCase();
      if (!subStudentId || (subStudentId !== ownId && subStudentId !== altOwnId)) {
        return res.status(403).send('<!DOCTYPE html><html><body style="font-family:sans-serif;padding:40px"><h2>403 Access Denied</h2><p>Students can only print their own exam paper.</p></body></html>');
      }
    }

    const parsedEval = await ensureSubmissionEvaluation(r);
    const cleanRoll = resolveStudentRollNo(r.student_roll, r.student_id);

    if (parsedEval) {
      parsedEval.studentRoll = cleanRoll;
      parsedEval.studentId = r.student_id;
    }

    // Retrieve readable class name
    let classNameStr = r.class_id || 'Class';
    if (r.class_id && r.class_id !== 'all') {
      try {
        const { rows: cRows } = await pool.query(`SELECT name, section FROM classes WHERE id = $1`, [r.class_id]);
        if (cRows.length > 0) {
          classNameStr = `${cRows[0].name}${cRows[0].section ? ` (${cRows[0].section})` : ''}`;
        }
      } catch {}
    }

    const submissionData = {
      id: r.id,
      quizId: r.quiz_id,
      quizTitle: r.quiz_title,
      subject: r.quiz_subject,
      studentName: r.student_name,
      studentRoll: cleanRoll,
      studentId: r.student_id,
      classId: r.class_id,
      submittedAt: r.submitted_at,
      totalScore: Number(parsedEval?.totalScore ?? r.total_score ?? 0),
      maxScore: Number(parsedEval?.maxScore ?? r.max_score ?? 0),
      status: r.status,
    };

    const paperStyle = (req.query.style as any) || 'twocolumn';
    const fontSize = (req.query.fontSize as any) || 'normal';

    const html = generatePrintableStudentAnswerHtml(parsedEval, submissionData, classNameStr, {
      schoolName: 'ACADEMIC EVALUATION & ASSESSMENT BOARD',
      paperStyle,
      fontSize,
      showKeyForWrong: false,
    });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err: any) {
    console.error('Error generating printable submission:', err);
    res.status(500).send(`<!DOCTYPE html><html><body><h1>Error generating printable answer sheet: ${err.message}</h1></body></html>`);
  }
});

// Batch Printable Exam Papers for all Students (Teacher Admin Only)
app.get('/api/print/batch', requireAdmin, async (req, res) => {
  try {
    const { classId, quizId, section, search } = req.query;
    let query = `
      SELECT s.*, 
             COALESCE(q.title, s.quiz_title, s.ai_evaluation->>'quizTitle', 'Assessment') as quiz_title, 
             COALESCE(q.subject, s.quiz_subject, s.ai_evaluation->>'subject', 'General') as quiz_subject
      FROM quiz_submissions s
      LEFT JOIN quizzes q ON s.quiz_id = q.id
      WHERE 1=1
    `;
    const params: any[] = [];
    if (quizId && quizId !== 'all') {
      params.push(quizId);
      query += ` AND s.quiz_id = $${params.length}`;
    }
    if (classId && classId !== 'all') {
      params.push(classId);
      query += ` AND s.class_id = $${params.length}`;
    }

    query += ` ORDER BY s.submitted_at DESC`;
    const { rows } = await pool.query(query, params);

    // Section & Search filters (match SubmissionsListView client filtering)
    let filteredRows = rows;
    if (section && section !== 'all') {
      const targetSec = String(section).toUpperCase().trim();
      filteredRows = filteredRows.filter(r => {
        const roll = (r.student_roll && r.student_roll !== '-' ? r.student_roll : r.student_id || '').toUpperCase().trim();
        return roll.endsWith(targetSec);
      });
    }
    if (search && String(search).trim().length > 0) {
      const qStr = String(search).toLowerCase().trim();
      filteredRows = filteredRows.filter(r => {
        const matchesName = String(r.student_name || '').toLowerCase().includes(qStr);
        const matchesQuiz = String(r.quiz_title || '').toLowerCase().includes(qStr);
        const matchesRoll = String(r.student_roll || r.student_id || '').toLowerCase().includes(qStr);
        return matchesName || matchesQuiz || matchesRoll;
      });
    }

    // Deduplicate: latest submission per student for each quiz
    const map = new Map<string, any>();
    for (const r of filteredRows) {
      const key = `${r.quiz_id}::${(r.student_id || r.student_name || '').toLowerCase().trim()}`;
      if (!map.has(key)) {
        map.set(key, r);
      } else {
        const existing = map.get(key);
        if (new Date(r.submitted_at).getTime() > new Date(existing.submitted_at).getTime()) {
          map.set(key, r);
        }
      }
    }

    const deduplicated = Array.from(map.values());
    deduplicated.sort(compareSubmissionsForPrint);

    if (deduplicated.length === 0) {
      return res.status(404).send('<!DOCTYPE html><html><body><h1>No student submissions found to print.</h1></body></html>');
    }

    // Fetch classes & questions in batch to eliminate N+1 queries during Print All
    const uniqueBatchQuizIds = Array.from(new Set(deduplicated.map((r: any) => r.quiz_id).filter(Boolean)));
    const [classesResult, batchQuestionsResult] = await Promise.all([
      pool.query(`SELECT id, name, section FROM classes`),
      uniqueBatchQuizIds.length > 0
        ? pool.query(`SELECT * FROM questions WHERE quiz_id = ANY($1::varchar[]) ORDER BY order_index ASC, id ASC`, [uniqueBatchQuizIds])
        : Promise.resolve({ rows: [] as any[] })
    ]);

    const classMap = new Map<string, string>();
    for (const c of classesResult.rows) {
      classMap.set(c.id, `${c.name}${c.section ? ` (${c.section})` : ''}`);
    }
    const batchQMap = new Map<string, any[]>();
    for (const q of batchQuestionsResult.rows) {
      const list = batchQMap.get(q.quiz_id) || [];
      list.push(q);
      batchQMap.set(q.quiz_id, list);
    }

    const submissionsWithEval = await Promise.all(
      deduplicated.map(async (r) => {
        const parsedEval = await ensureSubmissionEvaluation(r, batchQMap.get(r.quiz_id) || []);
        const cleanRoll = resolveStudentRollNo(r.student_roll, r.student_id);
        if (parsedEval) {
          parsedEval.studentRoll = cleanRoll;
          parsedEval.studentId = r.student_id;
        }

        const classNameStr = classMap.get(r.class_id) || r.class_id || 'Class';
        const subData = {
          id: r.id,
          quizId: r.quiz_id,
          quizTitle: r.quiz_title,
          subject: r.quiz_subject,
          studentName: r.student_name,
          studentRoll: cleanRoll,
          studentId: r.student_id,
          classId: r.class_id,
          submittedAt: r.submitted_at,
          totalScore: Number(parsedEval?.totalScore ?? r.total_score ?? 0),
          maxScore: Number(parsedEval?.maxScore ?? r.max_score ?? 0),
          status: r.status,
        };

        return {
          evaluation: parsedEval,
          submission: subData,
          className: classNameStr,
        };
      })
    );

    const html = generateBatchPrintableStudentAnswersHtml(submissionsWithEval, {
      schoolName: 'ACADEMIC EVALUATION & ASSESSMENT BOARD',
      paperStyle: 'twocolumn',
      fontSize: 'normal',
      showKeyForWrong: false,
    });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err: any) {
    console.error('Error generating batch print:', err);
    res.status(500).send(`<!DOCTYPE html><html><body><h1>Error generating batch print: ${err.message}</h1></body></html>`);
  }
});

// Printable Blank Question Paper Only (Teacher Admin Only)
app.get('/api/print/quiz/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows: quizRows } = await pool.query(`SELECT * FROM quizzes WHERE id = $1`, [id]);
    if (quizRows.length === 0) {
      return res.status(404).send('<!DOCTYPE html><html><body><h1>Test / Assessment not found</h1></body></html>');
    }

    const qRow = quizRows[0];
    const { rows: qItems } = await pool.query(
      `SELECT * FROM questions WHERE quiz_id = $1 ORDER BY order_index ASC, id ASC`,
      [id]
    );

    const quizObj = {
      id: qRow.id,
      title: qRow.title,
      description: qRow.description,
      classId: qRow.class_id,
      subject: qRow.subject,
      timeLimitMinutes: Number(qRow.time_limit_minutes || 0),
      totalPoints: Number(qRow.total_points || 0),
      questions: qItems.map(item => mapDbQuestion(item, false)),
    };

    const paperStyle = (req.query.style as any) || 'twocolumn';
    const fontSize = (req.query.fontSize as any) || 'normal';

    const html = generatePrintableQuestionsOnlyHtml(quizObj, {
      schoolName: 'ACADEMIC EVALUATION & ASSESSMENT BOARD',
      paperStyle,
      fontSize,
      autoPrint: true,
      showTickBoxes: true,
      tickBoxStyle: 'square',
      instructions: qRow.description || 'Answer all questions clearly.',
    });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err: any) {
    console.error('Error generating printable question paper:', err);
    res.status(500).send(`<!DOCTYPE html><html><body><h1>Error generating printable question paper: ${err.message}</h1></body></html>`);
  }
});

// ==========================================
// 8. STUDENT AUTHENTICATION & ACCOUNT APIS
// ==========================================

// Student Self-Registration (Validates fields + verifies classId + encrypts password + issues token)
app.post('/api/students/register', async (req, res) => {
  try {
    const { studentId, rollNo, name, classId, password } = req.body || {};
    if ((!studentId && !rollNo) || !name || !classId || !password) {
      return res.status(400).json({ error: 'Full Name, Roll No / Student ID, Class, and Password are required' });
    }

    const cleanRollNo = rollNo ? String(rollNo).trim().slice(0, 40) : '';
    const cleanStudentId = studentId ? String(studentId).trim().slice(0, 60) : (cleanRollNo ? `STD-${cleanRollNo}` : '');
    const cleanName = String(name).trim().slice(0, 120);
    const cleanPassword = String(password).trim();

    if (cleanName.length < 2) {
      return res.status(400).json({ error: 'Student Full Name must be at least 2 characters.' });
    }
    if (cleanPassword.length < 3 || cleanPassword.length > 100) {
      return res.status(400).json({ error: 'Password must be between 3 and 100 characters.' });
    }

    // Verify class exists in database
    const { rows: clsRows } = await pool.query(`SELECT id FROM classes WHERE id = $1`, [classId]);
    if (clsRows.length === 0) {
      return res.status(400).json({ error: 'Selected class does not exist.' });
    }

    // Enforce that Student ID / Roll No and Name must be different
    if (cleanStudentId.toLowerCase() === cleanName.toLowerCase() || (cleanRollNo && cleanRollNo.toLowerCase() === cleanName.toLowerCase())) {
      return res.status(400).json({ error: 'Student ID / Roll No and Student Name must be different' });
    }

    // Check if Student ID or Roll No in this class already exists (case-insensitive)
    let checkQuery = `SELECT * FROM students WHERE LOWER(student_id) = LOWER($1)`;
    const checkParams: any[] = [cleanStudentId];
    if (cleanRollNo) {
      checkParams.push(cleanRollNo, classId);
      checkQuery += ` OR (roll_no IS NOT NULL AND roll_no != '' AND LOWER(roll_no) = LOWER($2) AND class_id = $3)`;
    }

    const { rows: existing } = await pool.query(checkQuery, checkParams);

    if (existing.length > 0) {
      return res.status(400).json({
        error: `Student ID "${cleanStudentId}" or Roll No "${cleanRollNo}" is already registered. Please sign in or contact your teacher.`
      });
    }

    const id = `student-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const encryptedPwd = encryptPassword(cleanPassword);
    await pool.query(
      `INSERT INTO students (id, student_id, roll_no, name, class_id, password, created_at, last_login)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
      [id, cleanStudentId, cleanRollNo || null, cleanName, classId, encryptedPwd]
    );
    invalidateCachePrefix('live_student_meta');

    const token = signAuthToken({
      role: 'student',
      id,
      studentId: cleanStudentId,
      classId,
      name: cleanName,
    });

    res.json({
      success: true,
      token,
      student: {
        id,
        studentId: cleanStudentId,
        rollNo: cleanRollNo,
        name: cleanName,
        classId
      }
    });
  } catch (err: any) {
    console.error('Registration error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Student Login (verifies encrypted or legacy password + persistent 5-attempt 2-minute lockout + signed token)
app.post('/api/students/login', async (req, res) => {
  try {
    const { studentId, password, classId } = req.body || {};
    const cleanInput = String(studentId || '').trim();
    const cleanPassword = String(password || '').trim();
    const keys = getAttemptKeys(req, 'student', cleanInput);

    const lockState = await checkLoginLockout(keys);
    if (lockState.locked) {
      return res.status(429).json({
        error: `Too many failed login attempts. Temporarily locked for ${lockState.retryAfterSeconds}s.`,
        retryAfterSeconds: lockState.retryAfterSeconds,
        lockedUntil: lockState.lockedUntil,
        remainingAttempts: 0,
      });
    }

    if (!cleanInput || !cleanPassword) {
      return res.status(400).json({ error: 'Student ID or Roll No, and password are required' });
    }

    const altStdId = cleanInput.toUpperCase().startsWith('STD-')
      ? cleanInput.slice(4).trim()
      : `STD-${cleanInput}`;

    let query = `SELECT * FROM students 
       WHERE LOWER(student_id) = LOWER($1) 
          OR LOWER(student_id) = LOWER($2)
          OR LOWER(COALESCE(roll_no, '')) = LOWER($1) 
          OR LOWER(COALESCE(roll_no, '')) = LOWER($2)
          OR LOWER(name) = LOWER($1)`;
    let params: any[] = [cleanInput, altStdId];

    if (classId && classId !== 'all') {
      query = `SELECT * FROM students 
       WHERE class_id = $3
         AND (LOWER(student_id) = LOWER($1) 
           OR LOWER(student_id) = LOWER($2)
           OR LOWER(COALESCE(roll_no, '')) = LOWER($1) 
           OR LOWER(COALESCE(roll_no, '')) = LOWER($2)
           OR LOWER(name) = LOWER($1))`;
      params = [cleanInput, altStdId, classId];
    }

    query += ` ORDER BY (LOWER(student_id) = LOWER($1)) DESC, (LOWER(COALESCE(roll_no, '')) = LOWER($1)) DESC`;

    const { rows } = await pool.query(query, params);

    if (rows.length === 0) {
      const failState = await recordLoginFailure(keys, 'student');
      if (failState.locked) {
        return res.status(429).json({
          error: `Too many failed login attempts. Temporarily locked for ${failState.retryAfterSeconds}s.`,
          retryAfterSeconds: failState.retryAfterSeconds,
          lockedUntil: failState.lockedUntil,
        });
      }
      const baseMsg = classId && classId !== 'all'
        ? 'The account does not exist in this class.'
        : 'Student account not found. Please check your Student ID or Roll No.';
      return res.status(401).json({
        error: baseMsg,
      });
    }

    const student = rows[0];
    if (!verifyPassword(cleanPassword, String(student.password || ''))) {
      const failState = await recordLoginFailure(keys, 'student');
      if (failState.locked) {
        return res.status(429).json({
          error: `Too many failed login attempts. Temporarily locked for ${failState.retryAfterSeconds}s.`,
          retryAfterSeconds: failState.retryAfterSeconds,
          lockedUntil: failState.lockedUntil,
        });
      }
      return res.status(401).json({
        error: 'Incorrect password.',
      });
    }

    await clearLoginFailures(keys);

    // Lazily upgrade legacy plaintext password to AES-256-GCM encryption + update last login
    if (!String(student.password || '').startsWith('enc$v1$')) {
      const upgradedPwd = encryptPassword(cleanPassword);
      await pool.query(`UPDATE students SET last_login = NOW(), password = $1 WHERE id = $2`, [upgradedPwd, student.id]);
    } else {
      await pool.query(`UPDATE students SET last_login = NOW() WHERE id = $1`, [student.id]);
    }

    const token = signAuthToken({
      role: 'student',
      id: student.id,
      studentId: student.student_id,
      classId: student.class_id,
      name: student.name,
    });

    res.json({
      success: true,
      token,
      student: {
        id: student.id,
        studentId: student.student_id,
        rollNo: student.roll_no || '',
        name: student.name,
        classId: student.class_id,
        createdAt: student.created_at,
        lastLogin: student.last_login
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Get all registered students (Teacher Admin Only — decrypts password for exam ID slips)
app.get('/api/students', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM students ORDER BY created_at DESC`);
    const students = rows.map(r => {
      const derivedSec = (r.roll_no ? String(r.roll_no).match(/[a-zA-Z]+$/)?.[0]?.toUpperCase() : '') || 'A';
      return {
        id: r.id,
        studentId: r.student_id,
        rollNo: r.roll_no || '',
        section: r.section || derivedSec,
        name: r.name,
        classId: r.class_id,
        password: decryptPassword(String(r.password || '')),
        createdAt: r.created_at,
        lastLogin: r.last_login
      };
    });
    res.json(students);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Update Student Info (ID, Roll No, Name, Class, Password, Section)
app.put('/api/students/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { studentId, rollNo, name, classId, password, section } = req.body;

    const { rows: curRows } = await pool.query(`SELECT * FROM students WHERE id = $1`, [id]);
    if (curRows.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }
    const cur = curRows[0];

    const cleanName = name !== undefined && String(name).trim() ? String(name).trim() : cur.name;
    let cleanRollNo = rollNo !== undefined ? String(rollNo).trim() : (cur.roll_no || '');

    // If section ('A' | 'B') is specified, ensure roll ends with section
    let cleanSection = section && (section === 'A' || section === 'B') ? section : (cur.section || '');
    if (cleanSection) {
      const numPart = cleanRollNo.replace(/[a-zA-Z]+$/, '').trim() || '1';
      cleanRollNo = `${numPart}${cleanSection}`;
    } else {
      const extracted = cleanRollNo.match(/[a-zA-Z]+$/)?.[0]?.toUpperCase();
      cleanSection = extracted || 'A';
    }

    let cleanStudentId = studentId !== undefined && String(studentId).trim() ? String(studentId).trim() : cur.student_id;
    // If student ID follows standard STD- format, update it to match new roll
    if (cleanStudentId.startsWith('STD-') && cleanRollNo) {
      cleanStudentId = `STD-${cleanRollNo}`;
    }

    if (cleanStudentId.toLowerCase() === cleanName.toLowerCase()) {
      return res.status(400).json({ error: 'Student ID and Student Name must be different' });
    }

    const cleanClassId = classId !== undefined ? classId : cur.class_id;

    if (password && String(password).trim()) {
      const encryptedPwd = encryptPassword(String(password).trim());
      await pool.query(
        `UPDATE students
         SET student_id = $1, roll_no = $2, name = $3, class_id = $4, password = $5, section = $6
         WHERE id = $7`,
        [cleanStudentId, cleanRollNo, cleanName, cleanClassId, encryptedPwd, cleanSection, id]
      );
    } else {
      await pool.query(
        `UPDATE students
         SET student_id = $1, roll_no = $2, name = $3, class_id = $4, section = $5
         WHERE id = $6`,
        [cleanStudentId, cleanRollNo, cleanName, cleanClassId, cleanSection, id]
      );
    }

    invalidateCachePrefix('live_student_meta');
    res.json({
      success: true,
      message: 'Student credentials updated successfully',
      student: {
        id,
        studentId: cleanStudentId,
        rollNo: cleanRollNo,
        section: cleanSection,
        name: cleanName,
        classId: cleanClassId
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Reset Student Password (Teacher Admin Only)
app.post('/api/students/:id/reset-password', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body || {};
    const newPwd = (password && String(password).trim()) ? String(password).trim() : 'password';
    const encryptedPwd = encryptPassword(newPwd);
    await pool.query(`UPDATE students SET password = $1 WHERE id = $2`, [encryptedPwd, id]);
    res.json({ success: true, message: `Password has been reset to: ${newPwd}` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Delete Student (Teacher Admin Only — backs up student's submissions before removing account)
app.delete('/api/students/:id', requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    await client.query('BEGIN');
    const { rows } = await client.query(`SELECT student_id, name FROM students WHERE id = $1`, [id]);
    if (rows.length > 0) {
      const studentId = rows[0].student_id;
      const studentName = rows[0].name;
      const { rows: subsToBackup } = await client.query(
        `SELECT * FROM quiz_submissions WHERE LOWER(student_id) = LOWER($1) OR LOWER(student_roll) = LOWER($1) OR LOWER(student_name) = LOWER($2)`,
        [studentId, studentName]
      );
      for (const sRow of subsToBackup) {
        await backupSubmissionRow(client, sRow, 'pre_student_delete');
      }
      await client.query(
        `DELETE FROM quiz_attempts WHERE LOWER(student_id) = LOWER($1) OR LOWER(student_name) = LOWER($2)`,
        [studentId, studentName]
      );
      await client.query(
        `DELETE FROM quiz_submissions WHERE LOWER(student_id) = LOWER($1) OR LOWER(student_roll) = LOWER($1) OR LOWER(student_name) = LOWER($2)`,
        [studentId, studentName]
      );
    }
    await client.query(`DELETE FROM students WHERE id = $1`, [id]);
    await client.query('COMMIT');
    invalidateCachePrefix('live_student_meta');
    res.json({ success: true });
  } catch (err: any) {
    try { await client.query('ROLLBACK'); } catch {}
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ==========================================
// 9. QUIZ ATTEMPTS & NO-RETEST ENFORCEMENT
// ==========================================

// Start Test Attempt (records test start immediately; never trusts client-forged isAdmin)
app.post('/api/quizzes/:id/start-attempt', async (req, res) => {
  try {
    const { id: quizId } = req.params;
    const { studentId, studentName } = req.body || {};

    if (!studentId || !studentName) {
      return res.status(400).json({ error: 'studentId and studentName are required' });
    }

    const authUser = getAuthUser(req);
    const isAdminUser = authUser?.role === 'admin';

    if (isAdminUser) {
      const { rows: adminQRows } = await pool.query(
        `SELECT id, type, options, sub_questions FROM questions WHERE quiz_id = $1 ORDER BY order_index ASC, id ASC`,
        [quizId]
      );
      const adminRandomizationMap = buildQuizRandomizationMap(adminQRows, (max) => crypto.randomInt(max));
      return res.json({
        allowed: true,
        startedAt: new Date().toISOString(),
        isAdmin: true,
        randomizationMap: adminRandomizationMap
      });
    }

    // Verify quiz exists and is published for non-admins (cached + coalesced for high concurrency)
    const quizMeta = await getQuizMetaCached(quizId);
    if (!quizMeta || !quizMeta.is_published) {
      return res.status(404).json({ allowed: false, error: 'This assessment is not available.' });
    }

    const cleanStudentId = authUser?.role === 'student'
      ? String(authUser.studentId || authUser.id || studentId).trim()
      : (String(studentId).trim().toLowerCase().startsWith('admin') ? `guest_${Date.now()}` : String(studentId).trim());

    const altStdId = cleanStudentId.toUpperCase().startsWith('STD-')
      ? cleanStudentId.slice(4).trim()
      : `STD-${cleanStudentId}`;

    // Run submission + attempt checks in parallel using expression indexes
    const [subsRes, attemptRes, qList] = await Promise.all([
      pool.query(
        `SELECT id FROM quiz_submissions WHERE quiz_id = $1 AND LOWER(student_id) IN (LOWER($2), LOWER($3)) LIMIT 1`,
        [quizId, cleanStudentId, altStdId]
      ),
      pool.query(
        `SELECT id, started_at, status, draft_answers, randomization_map, updated_at FROM quiz_attempts WHERE quiz_id = $1 AND LOWER(student_id) IN (LOWER($2), LOWER($3)) LIMIT 1`,
        [quizId, cleanStudentId, altStdId]
      ),
      getCanonicalQuestionsCached(quizId)
    ]);

    if (subsRes.rows.length > 0) {
      return res.status(403).json({
        allowed: false,
        status: 'submitted',
        error: 'You have already submitted this assessment. Retests are strictly restricted for this examination.'
      });
    }

    if (attemptRes.rows.length > 0) {
      const existing = attemptRes.rows[0];
      if (existing.status === 'in_progress') {
        const draftAnswers = typeof existing.draft_answers === 'string'
          ? JSON.parse(existing.draft_answers)
          : (existing.draft_answers || null);

        let randomizationMap = parseRandomizationMap(existing.randomization_map);
        if (!randomizationMap) {
          const fallbackMap = buildQuizRandomizationMap(qList, (max) => crypto.randomInt(max));
          const { rows: updatedMapRows } = await pool.query(
            `UPDATE quiz_attempts
             SET randomization_map = COALESCE(randomization_map, $1::jsonb)
             WHERE id = $2
             RETURNING randomization_map`,
            [JSON.stringify(fallbackMap), existing.id]
          );
          randomizationMap = parseRandomizationMap(updatedMapRows[0]?.randomization_map) || fallbackMap;
        }

        const mapValidation = validateQuizRandomizationMap(qList, randomizationMap);
        if (!mapValidation.valid) {
          return res.status(409).json({
            allowed: false,
            randomizationError: true,
            error: 'Your saved examination question sequence no longer matches the current assessment paper. Please ask your teacher to reset this attempt.'
          });
        }

        return res.json({
          allowed: true,
          startedAt: existing.started_at,
          updatedAt: existing.updated_at,
          isResume: true,
          draftAnswers,
          randomizationMap
        });
      }
      return res.status(403).json({
        allowed: false,
        status: existing.status,
        startedAt: existing.started_at,
        error: 'You have already submitted this assessment. Retests are strictly restricted for this examination.'
      });
    }

    const freshRandomizationMap = buildQuizRandomizationMap(qList, (max) => crypto.randomInt(max));
    const initialMaxScore = Number(
      qList.reduce((sum: number, q: any) => sum + (Number(q.points) || 1), 0).toFixed(1)
    );
    const initialTotalQuestions = qList.length;

    // Atomic idempotent insert
    const attemptId = `att-${quizId}-${cleanStudentId}`;
    const cleanStuName = String(studentName).trim().slice(0, 200);
    const nowIso = new Date().toISOString();
    const { rows: inserted } = await pool.query(
      `INSERT INTO quiz_attempts (id, quiz_id, student_id, student_name, started_at, status, randomization_map, live_score, max_score, answered_count, total_questions, draft_updated_ms, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), 'in_progress', $5::jsonb, 0, $6, 0, $7, 0, NOW())
       ON CONFLICT (quiz_id, student_id) DO NOTHING
       RETURNING started_at, updated_at, randomization_map`,
      [
        attemptId,
        quizId,
        cleanStudentId,
        cleanStuName,
        JSON.stringify(freshRandomizationMap),
        initialMaxScore,
        initialTotalQuestions
      ]
    );

    if (inserted.length > 0) {
      const stuMetaMap = await getStudentMetaMapCached().catch(() => new Map());
      const stuMeta = stuMetaMap.get(cleanStudentId.toLowerCase());
      const resolvedRoll = stuMeta?.rollNo || resolveGuestRollFallback(cleanStudentId);
      const resolvedClass = stuMeta?.classId || quizMeta.class_id || '';
      broadcastLiveMonitorEvent('attempt:updated', {
        attemptId,
        quizId,
        quizTitle: quizMeta.title || 'Assessment',
        quizSubject: quizMeta.subject || 'General',
        classId: resolvedClass,
        studentId: cleanStudentId,
        studentName: cleanStuName,
        studentRoll: resolvedRoll,
        status: 'in_progress',
        liveScore: 0,
        maxScore: initialMaxScore,
        answeredCount: 0,
        totalQuestions: initialTotalQuestions,
        progressPercentage: 0,
        startedAt: inserted[0].started_at || nowIso,
        updatedAt: inserted[0].updated_at || nowIso,
      });
      const savedMap = parseRandomizationMap(inserted[0].randomization_map) || freshRandomizationMap;
      return res.json({
        allowed: true,
        startedAt: inserted[0].started_at || nowIso,
        randomizationMap: savedMap
      });
    }

    // Concurrent race recovery: return the row that won the INSERT
    const { rows: raced } = await pool.query(
      `SELECT started_at, updated_at, draft_answers, randomization_map FROM quiz_attempts WHERE quiz_id = $1 AND LOWER(student_id) IN (LOWER($2), LOWER($3)) LIMIT 1`,
      [quizId, cleanStudentId, altStdId]
    );
    const racedRow = raced[0];
    const racedMap = parseRandomizationMap(racedRow?.randomization_map) || freshRandomizationMap;
    const racedValidation = validateQuizRandomizationMap(qList, racedMap);
    if (!racedValidation.valid) {
      return res.status(409).json({
        allowed: false,
        randomizationError: true,
        error: 'Examination randomization sequence failed validation. Please try again.'
      });
    }
    return res.json({
      allowed: true,
      startedAt: racedRow?.started_at || nowIso,
      updatedAt: racedRow?.updated_at,
      isResume: Boolean(racedRow),
      draftAnswers: racedRow?.draft_answers
        ? (typeof racedRow.draft_answers === 'string' ? JSON.parse(racedRow.draft_answers) : racedRow.draft_answers)
        : null,
      randomizationMap: racedMap
    });
  } catch (err: any) {
    console.error('Error starting attempt:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// LIVE MONITORING SSE BROADCASTER & ADMIN API
// ==========================================
const liveMonitorClients = new Set<express.Response>();

function broadcastLiveMonitorEvent(eventName: string, payload: any) {
  if (liveMonitorClients.size === 0) return;
  const msg = `event: ${eventName}\ndata: ${JSON.stringify({ ...payload, ts: Date.now() })}\n\n`;
  for (const clientRes of Array.from(liveMonitorClients)) {
    if (clientRes.writableEnded || clientRes.destroyed) {
      liveMonitorClients.delete(clientRes);
      continue;
    }
    try {
      clientRes.write(msg);
    } catch {
      liveMonitorClients.delete(clientRes);
    }
  }
}

app.get('/api/admin/live-monitoring/stream', requireAdmin, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof (res as any).flushHeaders === 'function') {
    (res as any).flushHeaders();
  }

  liveMonitorClients.add(res);
  try {
    res.write(`event: connected\ndata: ${JSON.stringify({ ok: true, ts: Date.now() })}\n\n`);
  } catch {
    liveMonitorClients.delete(res);
    return;
  }

  const keepAlive = setInterval(() => {
    if (res.writableEnded || res.destroyed) {
      clearInterval(keepAlive);
      liveMonitorClients.delete(res);
      return;
    }
    try {
      res.write(`: heartbeat ${Date.now()}\n\n`);
    } catch {
      clearInterval(keepAlive);
      liveMonitorClients.delete(res);
    }
  }, 20000);

  const cleanup = () => {
    clearInterval(keepAlive);
    liveMonitorClients.delete(res);
  };
  req.on('close', cleanup);
  req.on('error', cleanup);
  res.on('error', cleanup);
});

app.get('/api/admin/live-monitoring', requireAdmin, async (req, res) => {
  try {
    const { quizId, classId } = req.query;
    const filterQuiz = quizId && quizId !== 'all' ? String(quizId) : null;
    const filterClass = classId && classId !== 'all' ? String(classId) : null;

    const attemptsParams: any[] = [];
    let attemptsWhere = `a.status = 'in_progress' AND LOWER(a.student_id) NOT LIKE 'admin%' AND LOWER(a.student_id) <> 'admin'`;
    if (filterQuiz) {
      attemptsParams.push(filterQuiz);
      attemptsWhere += ` AND a.quiz_id = $${attemptsParams.length}`;
    }

    const subsParams: any[] = [];
    let subsWhere = `1=1`;
    if (filterQuiz) {
      subsParams.push(filterQuiz);
      subsWhere += ` AND s.quiz_id = $${subsParams.length}`;
    }
    if (filterClass) {
      subsParams.push(filterClass);
      subsWhere += ` AND s.class_id = $${subsParams.length}`;
    }

    const [attemptsRes, subsRes, studentMetaMap] = await Promise.all([
      pool.query(
        `SELECT a.id, a.quiz_id, a.student_id, a.student_name, a.started_at, a.status,
                a.draft_answers, a.live_score, a.max_score, a.answered_count, a.total_questions, a.updated_at,
                q.title AS quiz_title, q.subject AS quiz_subject, q.class_id AS quiz_class_id
         FROM quiz_attempts a
         JOIN quizzes q ON a.quiz_id = q.id
         WHERE ${attemptsWhere}
         ORDER BY a.updated_at DESC NULLS LAST, a.started_at DESC`,
        attemptsParams
      ),
      pool.query(
        `SELECT s.id, s.quiz_id, s.student_id, s.student_name, s.student_roll, s.class_id,
                s.submitted_at, s.total_score, s.max_score, s.grade_letter, s.student_answers,
                COALESCE(q.title, s.quiz_title, 'Assessment') AS quiz_title,
                COALESCE(q.subject, s.quiz_subject, 'General') AS quiz_subject
         FROM quiz_submissions s
         LEFT JOIN quizzes q ON s.quiz_id = q.id
         WHERE ${subsWhere}
         ORDER BY s.submitted_at DESC`,
        subsParams
      ),
      getStudentMetaMapCached()
    ]);

    // Track already-submitted (quiz_id, student_id) pairs to guarantee zero duplicates
    const submittedKeySet = new Set<string>();
    for (const sub of subsRes.rows) {
      const qId = String(sub.quiz_id || '');
      const sId = String(sub.student_id || '').trim().toLowerCase();
      if (!qId || !sId) continue;
      submittedKeySet.add(`${qId}::${sId}`);
      if (sId.startsWith('std-')) {
        submittedKeySet.add(`${qId}::${sId.slice(4)}`);
      } else {
        submittedKeySet.add(`${qId}::std-${sId}`);
      }
    }

    const activeAttempts = attemptsRes.rows.filter((a) => {
      const sId = String(a.student_id || '').trim().toLowerCase();
      return !submittedKeySet.has(`${a.quiz_id}::${sId}`);
    });

    const quizIdsNeeded = new Set<string>();
    for (const a of activeAttempts) quizIdsNeeded.add(String(a.quiz_id));
    for (const s of subsRes.rows) {
      if (s.quiz_id) quizIdsNeeded.add(String(s.quiz_id));
    }

    // Load canonical questions using shared per-quiz cache (eliminates repeated DB reads)
    const questionsByQuiz = new Map<string, any[]>();
    await Promise.all(
      Array.from(quizIdsNeeded).map(async (qId) => {
        const qs = await getCanonicalQuestionsCached(qId);
        questionsByQuiz.set(qId, qs);
      })
    );

    const liveAttempts: any[] = [];

    for (const a of activeAttempts) {
      const stuLookup = studentMetaMap.get(String(a.student_id || '').trim().toLowerCase());
      const resolvedClassId = stuLookup?.classId || String(a.quiz_class_id || '');
      if (filterClass && resolvedClassId !== filterClass) continue;

      const qList = questionsByQuiz.get(String(a.quiz_id)) || [];
      let draftObj: Record<string, any> | null = null;
      try {
        draftObj = typeof a.draft_answers === 'string' ? JSON.parse(a.draft_answers) : (a.draft_answers || null);
      } catch {
        draftObj = null;
      }

      const liveEval = qList.length > 0
        ? evaluateLiveAttemptProgress(qList, draftObj)
        : {
            liveScore: Number(a.live_score || 0),
            maxScore: Number(a.max_score || 0),
            answeredCount: Number(a.answered_count || 0),
            totalQuestions: Number(a.total_questions || 0),
            progressPercentage: Number(a.total_questions || 0) > 0
              ? Math.round((Number(a.answered_count || 0) / Number(a.total_questions || 0)) * 100)
              : 0,
          };

      const cleanRoll = stuLookup?.rollNo || resolveGuestRollFallback(String(a.student_id || ''));

      liveAttempts.push({
        attemptId: a.id,
        quizId: a.quiz_id,
        quizTitle: a.quiz_title || 'Assessment',
        quizSubject: a.quiz_subject || 'General',
        classId: resolvedClassId,
        studentId: a.student_id,
        studentName: a.student_name,
        studentRoll: cleanRoll || '-',
        status: 'in_progress',
        answeredCount: liveEval.answeredCount,
        totalQuestions: liveEval.totalQuestions,
        liveScore: liveEval.liveScore,
        maxScore: liveEval.maxScore,
        progressPercentage: liveEval.progressPercentage,
        startedAt: a.started_at,
        updatedAt: a.updated_at || a.started_at,
      });
    }

    for (const s of subsRes.rows) {
      const stuLookup = studentMetaMap.get(String(s.student_id || '').trim().toLowerCase());
      const resolvedClassId = String(s.class_id || stuLookup?.classId || '');
      if (filterClass && resolvedClassId !== filterClass) continue;

      const qList = questionsByQuiz.get(String(s.quiz_id)) || [];
      let subAnswersObj: Record<string, any> | null = null;
      try {
        subAnswersObj = typeof s.student_answers === 'string' ? JSON.parse(s.student_answers) : (s.student_answers || null);
      } catch {
        subAnswersObj = null;
      }

      const totalQuestions = qList.length > 0 ? qList.length : (subAnswersObj ? Object.keys(subAnswersObj).length : 0);
      const answeredCount = qList.length > 0 && subAnswersObj && Object.keys(subAnswersObj).length > 0
        ? countAnsweredQuestions(qList, subAnswersObj)
        : totalQuestions;

      const finalScore = Number(s.total_score || 0);
      const maxScore = Number(s.max_score || 0);

      liveAttempts.push({
        attemptId: `sub-${s.id}`,
        submissionId: s.id,
        quizId: s.quiz_id,
        quizTitle: s.quiz_title || 'Assessment',
        quizSubject: s.quiz_subject || 'General',
        classId: resolvedClassId,
        studentId: s.student_id,
        studentName: s.student_name,
        studentRoll: (s.student_roll && s.student_roll !== '-' ? s.student_roll : stuLookup?.rollNo) || '-',
        status: 'submitted',
        answeredCount,
        totalQuestions,
        liveScore: finalScore,
        maxScore,
        progressPercentage: totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 100,
        gradeLetter: s.grade_letter || calcGradeLetter(maxScore > 0 ? (finalScore / maxScore) * 100 : 0),
        startedAt: s.submitted_at,
        updatedAt: s.submitted_at,
      });
    }

    res.json({ liveAttempts, serverTime: new Date().toISOString() });
  } catch (err: any) {
    console.error('Error loading admin live monitoring:', err);
    res.status(500).json({ error: err.message });
  }
});

// Save in-progress student draft answers safely to PostgreSQL + recalculate live score (supports PUT and POST / sendBeacon)
async function handleSaveQuizDraft(req: express.Request, res: express.Response) {
  try {
    const { id: quizId } = req.params;
    let bodyPayload: any = req.body;
    if (typeof bodyPayload === 'string') {
      try {
        bodyPayload = JSON.parse(bodyPayload);
      } catch {
        bodyPayload = null;
      }
    }
    const { studentId, answers, clientUpdatedAt } = bodyPayload || {};
    if (!studentId || !answers || typeof answers !== 'object' || Array.isArray(answers)) {
      return res.json({ saved: false });
    }
    const authUser = getAuthUser(req);
    const cleanStudentId = authUser?.role === 'student'
      ? String(authUser.studentId || authUser.id || studentId).trim()
      : String(studentId).trim();

    if (cleanStudentId === 'admin' || cleanStudentId.startsWith('admin_')) {
      return res.json({ saved: false });
    }
    const altStdId = cleanStudentId.toUpperCase().startsWith('STD-')
      ? cleanStudentId.slice(4).trim()
      : `STD-${cleanStudentId}`;

    const clientTsMs = Number.isFinite(Number(clientUpdatedAt)) && Number(clientUpdatedAt) > 0
      ? Math.floor(Number(clientUpdatedAt))
      : Date.now();

    // Use cached canonical questions & metadata to keep concurrent writes lightweight
    const [qList, quizMeta, stuMetaMap] = await Promise.all([
      getCanonicalQuestionsCached(quizId),
      getQuizMetaCached(quizId).catch(() => null),
      getStudentMetaMapCached().catch(() => new Map())
    ]);
    const liveProgress = evaluateLiveAttemptProgress(qList, answers);

    // Atomic monotonic LWW update: out-of-order delayed network packets cannot overwrite newer saved answers
    const { rows } = await pool.query(
      `UPDATE quiz_attempts
       SET draft_answers = $1::jsonb,
           live_score = $2,
           max_score = $3,
           answered_count = $4,
           total_questions = $5,
           draft_updated_ms = $9,
           updated_at = NOW()
       WHERE quiz_id = $6
         AND status = 'in_progress'
         AND LOWER(student_id) IN (LOWER($7), LOWER($8))
         AND COALESCE(draft_updated_ms, 0) <= $9
       RETURNING id, student_id, student_name, started_at, updated_at`,
      [
        JSON.stringify(answers),
        liveProgress.liveScore,
        liveProgress.maxScore,
        liveProgress.answeredCount,
        liveProgress.totalQuestions,
        quizId,
        cleanStudentId,
        altStdId,
        clientTsMs
      ]
    );

    if (rows.length > 0) {
      const updatedRow = rows[0];
      const stuMeta = stuMetaMap.get(String(updatedRow.student_id || cleanStudentId).toLowerCase());
      const resolvedRoll = stuMeta?.rollNo || resolveGuestRollFallback(String(updatedRow.student_id || cleanStudentId));
      const resolvedClass = stuMeta?.classId || quizMeta?.class_id || '';

      broadcastLiveMonitorEvent('attempt:updated', {
        attemptId: updatedRow.id,
        quizId,
        quizTitle: quizMeta?.title || 'Assessment',
        quizSubject: quizMeta?.subject || 'General',
        classId: resolvedClass,
        studentId: updatedRow.student_id || cleanStudentId,
        studentName: updatedRow.student_name || stuMeta?.name || 'Student',
        studentRoll: resolvedRoll,
        status: 'in_progress',
        liveScore: liveProgress.liveScore,
        maxScore: liveProgress.maxScore,
        answeredCount: liveProgress.answeredCount,
        totalQuestions: liveProgress.totalQuestions,
        progressPercentage: liveProgress.progressPercentage,
        startedAt: updatedRow.started_at,
        updatedAt: updatedRow.updated_at
      });
      // Do NOT expose liveScore/correctness to the active student client to preserve exam answer security
      return res.json({ saved: true, updatedAt: updatedRow.updated_at });
    }

    // Check if update was skipped strictly because a newer write already won (not because attempt is missing)
    const { rows: checkRows } = await pool.query(
      `SELECT status, updated_at, draft_updated_ms FROM quiz_attempts WHERE quiz_id = $1 AND LOWER(student_id) IN (LOWER($2), LOWER($3)) LIMIT 1`,
      [quizId, cleanStudentId, altStdId]
    );
    if (checkRows.length > 0 && checkRows[0].status === 'in_progress' && Number(checkRows[0].draft_updated_ms || 0) > clientTsMs) {
      return res.json({ saved: true, staleSkipped: true, updatedAt: checkRows[0].updated_at });
    }

    res.json({ saved: false });
  } catch (err: any) {
    res.status(500).json({ saved: false, error: err.message });
  }
}

app.put('/api/quizzes/:id/draft', handleSaveQuizDraft);
app.post('/api/quizzes/:id/draft', handleSaveQuizDraft);

// Check Attempt Status for a Student
app.get('/api/quizzes/:id/attempt-status', async (req, res) => {
  try {
    const { id: quizId } = req.params;
    const { studentId } = req.query;

    const authUser = getAuthUser(req);
    const isAdminUser = authUser?.role === 'admin';

    if (isAdminUser) {
      return res.json({ hasAttempted: false, status: 'none', isAdmin: true });
    }

    if (!studentId) {
      return res.json({ hasAttempted: false, status: 'none' });
    }

    const cleanStudentId = authUser?.role === 'student'
      ? String(authUser.studentId || authUser.id || studentId).trim()
      : String(studentId).trim();

    const altStdId = cleanStudentId.toUpperCase().startsWith('STD-')
      ? cleanStudentId.slice(4).trim()
      : `STD-${cleanStudentId}`;

    // Run both indexed lookups in parallel
    const [attemptsRes, submissionsRes] = await Promise.all([
      pool.query(
        `SELECT id, status, started_at, draft_answers, randomization_map, updated_at FROM quiz_attempts WHERE quiz_id = $1 AND LOWER(student_id) IN (LOWER($2), LOWER($3)) LIMIT 1`,
        [quizId, cleanStudentId, altStdId]
      ),
      pool.query(
        `SELECT id, total_score, max_score, submitted_at, status, ai_evaluation FROM quiz_submissions WHERE quiz_id = $1 AND LOWER(student_id) IN (LOWER($2), LOWER($3)) ORDER BY submitted_at DESC LIMIT 1`,
        [quizId, cleanStudentId, altStdId]
      )
    ]);

    const attempts = attemptsRes.rows;
    const submissions = submissionsRes.rows;

    if (attempts.length === 0 && submissions.length === 0) {
      return res.json({ hasAttempted: false, status: 'none' });
    }

    // Only expose evaluation details inside attempt-status if caller has a valid student token matching the owner
    const canViewDetails = authUser?.role === 'student' && (
      String(authUser.studentId || authUser.id || '').toLowerCase() === cleanStudentId.toLowerCase() ||
      `std-${String(authUser.studentId || authUser.id || '').toLowerCase()}` === cleanStudentId.toLowerCase()
    );

    const submission = submissions[0] ? {
      id: submissions[0].id,
      totalScore: Number(submissions[0].total_score || 0),
      maxScore: Number(submissions[0].max_score || 0),
      submittedAt: submissions[0].submitted_at,
      status: submissions[0].status,
      aiEvaluation: canViewDetails
        ? (typeof submissions[0].ai_evaluation === 'string' ? JSON.parse(submissions[0].ai_evaluation) : submissions[0].ai_evaluation)
        : undefined
    } : null;

    const draftAnswers = attempts[0]?.draft_answers
      ? (typeof attempts[0].draft_answers === 'string' ? JSON.parse(attempts[0].draft_answers) : attempts[0].draft_answers)
      : null;

    const resolvedStatus = submissions.length > 0 ? 'submitted' : (attempts[0]?.status || 'in_progress');
    let randomizationMap = parseRandomizationMap(attempts[0]?.randomization_map);
    let randomizationError: string | undefined;
    if (resolvedStatus === 'in_progress' && attempts[0]?.id) {
      const qList = await getCanonicalQuestionsCached(quizId);
      if (!randomizationMap) {
        const fallbackMap = buildQuizRandomizationMap(qList, (max) => crypto.randomInt(max));
        const { rows: updatedMapRows } = await pool.query(
          `UPDATE quiz_attempts
           SET randomization_map = COALESCE(randomization_map, $1::jsonb)
           WHERE id = $2
           RETURNING randomization_map`,
          [JSON.stringify(fallbackMap), attempts[0].id]
        );
        randomizationMap = parseRandomizationMap(updatedMapRows[0]?.randomization_map) || fallbackMap;
      }
      const check = validateQuizRandomizationMap(qList, randomizationMap);
      if (!check.valid) {
        randomizationMap = null;
        randomizationError = 'Saved examination sequence failed integrity validation against canonical questions.';
      }
    }

    res.json({
      hasAttempted: true,
      status: resolvedStatus,
      startedAt: attempts[0]?.started_at,
      updatedAt: attempts[0]?.updated_at,
      draftAnswers,
      randomizationMap,
      randomizationError,
      submission
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Reset Attempt (Teacher Admin Only — backs up previous submission before granting retest)
app.post('/api/quizzes/:id/reset-attempt', requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id: quizId } = req.params;
    const { studentId } = req.body;

    if (!studentId) {
      return res.status(400).json({ error: 'studentId is required' });
    }

    const cleanStudentId = String(studentId).trim();
    const altStdId = cleanStudentId.toUpperCase().startsWith('STD-')
      ? cleanStudentId.slice(4).trim()
      : `STD-${cleanStudentId}`;

    await client.query('BEGIN');
    const { rows: subsToBackup } = await client.query(
      `SELECT * FROM quiz_submissions 
       WHERE quiz_id = $1 
         AND (LOWER(student_id) IN (LOWER($2), LOWER($3)) 
              OR LOWER(student_roll) IN (LOWER($2), LOWER($3)) 
              OR LOWER(student_name) = LOWER($2))`,
      [quizId, cleanStudentId, altStdId]
    );
    for (const sRow of subsToBackup) {
      await backupSubmissionRow(client, sRow, 'pre_retest_reset');
    }

    await client.query(
      `DELETE FROM quiz_attempts 
       WHERE quiz_id = $1 
         AND (LOWER(student_id) IN (LOWER($2), LOWER($3)) 
              OR LOWER(student_name) = LOWER($2))`,
      [quizId, cleanStudentId, altStdId]
    );

    await client.query(
      `DELETE FROM quiz_submissions 
       WHERE quiz_id = $1 
         AND (LOWER(student_id) IN (LOWER($2), LOWER($3)) 
              OR LOWER(student_roll) IN (LOWER($2), LOWER($3)) 
              OR LOWER(student_name) = LOWER($2))`,
      [quizId, cleanStudentId, altStdId]
    );

    await client.query('COMMIT');
    broadcastLiveMonitorEvent('attempt:reset', { quizId, studentId: cleanStudentId });
    res.json({ success: true, message: `Attempt reset for student ${cleanStudentId}. Retest is now enabled.` });
  } catch (err: any) {
    try { await client.query('ROLLBACK'); } catch {}
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// START SERVER FUNCTION WITH VITE MIDDLEWARE
async function startServer() {
  await initDatabase();

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 School Board server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
