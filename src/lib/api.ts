import {
  ClassItem,
  FileItem,
  SubjectCategory,
  QuizItem,
  QuizSubmission,
  QuizEvaluationReport,
  StudentUser,
  HomeworkItem,
  LessonItem,
  LessonStatus,
  LiveExamAttempt
} from '../types';

import {
  AuthLockoutScope,
  getDeviceHeaders,
  setCachedLockoutUntil,
} from './deviceFingerprint';

// Session tokens are held strictly in memory so browser refreshes log out the session automatically.
let memAdminToken: string | null = null;
let memStudentToken: string | null = null;

// Purge any legacy persisted auth tokens from browser storage on startup
try {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('scholarboard_admin_token');
    localStorage.removeItem('scholarboard_student_token');
    localStorage.removeItem('scholarboard_student');
    localStorage.removeItem('scholarboard_unlocked_class');
    localStorage.removeItem('scholarboard_active_quiz_id');
  }
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem('scholarboard_admin_token');
    sessionStorage.removeItem('scholarboard_student_token');
    sessionStorage.removeItem('scholarboard_student');
    sessionStorage.removeItem('scholarboard_unlocked_class');
    sessionStorage.removeItem('scholarboard_active_quiz_id');
  }
} catch {
  // ignore storage errors
}

export function getAdminToken(): string | null {
  return memAdminToken;
}

export function setAdminToken(token: string | null): void {
  memAdminToken = token || null;
}

export function getStudentToken(): string | null {
  return memStudentToken;
}

export function setStudentToken(token: string | null): void {
  memStudentToken = token || null;
}

export function getAuthToken(): string | null {
  return memAdminToken || memStudentToken;
}

export function getAuthenticatedPrintUrl(path: string, explicitToken?: string | null): string {
  const token = explicitToken !== undefined ? explicitToken : getAuthToken();
  if (!token) return path;
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}token=${encodeURIComponent(token)}`;
}

async function parseErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    if (data && typeof data.error === 'string' && data.error.trim()) {
      return data.error;
    }
  } catch {
    // ignore JSON parse failure
  }
  return fallback;
}

interface ResilientFetchOptions {
  timeoutMs?: number;
  retries?: number;
  retryOnPost?: boolean;
  signal?: AbortSignal;
  onRetry?: (attempt: number) => void;
}

const TRANSIENT_STATUSES = new Set([408, 425, 429, 502, 503, 504]);

async function resilientFetch(
  input: string,
  init: RequestInit = {},
  opts: ResilientFetchOptions = {}
): Promise<Response> {
  const method = (init.method || 'GET').toUpperCase();
  const isRetryableMethod = method === 'GET' || method === 'PUT' || opts.retryOnPost === true;
  const maxRetries = isRetryableMethod ? (opts.retries ?? 2) : 0;
  const timeoutMs = opts.timeoutMs ?? 15000;
  const externalSignal = opts.signal || init.signal;

  const headers = new Headers(init.headers || {});
  const token = getAuthToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const devHeaders = getDeviceHeaders();
  if (!headers.has('X-Device-Id')) {
    headers.set('X-Device-Id', devHeaders['X-Device-Id']);
  }
  if (!headers.has('X-Device-Fingerprint')) {
    headers.set('X-Device-Fingerprint', devHeaders['X-Device-Fingerprint']);
  }

  let lastError: any = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (externalSignal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onExternalAbort = () => controller.abort();
    externalSignal?.addEventListener('abort', onExternalAbort, { once: true });

    try {
      const res = await fetch(input, {
        ...init,
        headers,
        signal: controller.signal,
      });
      clearTimeout(timer);
      externalSignal?.removeEventListener('abort', onExternalAbort);

      if (TRANSIENT_STATUSES.has(res.status) && attempt < maxRetries) {
        opts.onRetry?.(attempt + 1);
        const delay = Math.min(2500, 350 * Math.pow(2, attempt) + Math.floor(Math.random() * 200));
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      return res;
    } catch (err: any) {
      clearTimeout(timer);
      externalSignal?.removeEventListener('abort', onExternalAbort);
      lastError = err;
      if (externalSignal?.aborted) {
        throw err;
      }
      if (attempt < maxRetries) {
        opts.onRetry?.(attempt + 1);
        const delay = Math.min(2500, 350 * Math.pow(2, attempt) + Math.floor(Math.random() * 200));
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      if (err?.name === 'AbortError') {
        throw new Error('Server request timed out due to heavy network traffic. Please retry.');
      }
      throw err;
    }
  }

  throw lastError || new Error('Network request failed');
}

// Fetch all classes from database
export async function fetchClasses(): Promise<ClassItem[]> {
  const res = await resilientFetch('/api/classes');
  if (!res.ok) throw new Error(await parseErrorMessage(res, 'Failed to fetch classes from database'));
  return res.json();
}

// Verify class portal passcode server-side with persistent brute-force protection
export async function verifyClassPassword(classId: string, password: string): Promise<boolean> {
  const res = await resilientFetch(
    `/api/classes/${encodeURIComponent(classId)}/verify`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    },
    { retries: 0 }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 429 && (data.lockedUntil || data.retryAfterSeconds)) {
      const until = Number(data.lockedUntil) || Date.now() + Number(data.retryAfterSeconds || 120) * 1000;
      setCachedLockoutUntil('class', until);
    }
    const err: any = new Error(data.error || 'Access denied: Invalid class passcode.');
    err.status = res.status;
    err.retryAfterSeconds = data.retryAfterSeconds;
    err.lockedUntil = data.lockedUntil;
    err.remainingAttempts = data.remainingAttempts;
    throw err;
  }
  setCachedLockoutUntil('class', 0);
  return true;
}

// Save or update class in database
export async function saveClass(classData: ClassItem): Promise<void> {
  const res = await resilientFetch('/api/classes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(classData),
  });
  if (!res.ok) throw new Error(await parseErrorMessage(res, 'Failed to save class to database'));
}

// Delete class from database
export async function deleteClass(id: string): Promise<void> {
  const res = await resilientFetch(`/api/classes/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(await parseErrorMessage(res, 'Failed to delete class from database'));
}

// Fetch all subjects from database
export async function fetchSubjects(): Promise<SubjectCategory[]> {
  const res = await resilientFetch('/api/subjects');
  if (!res.ok) throw new Error('Failed to fetch subjects from database');
  return res.json();
}

// Save subject in database
export async function saveSubject(subject: SubjectCategory): Promise<void> {
  const res = await resilientFetch('/api/subjects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(subject),
  });
  if (!res.ok) throw new Error('Failed to save subject to database');
}

// Delete subject from database
export async function deleteSubject(id: string): Promise<void> {
  const res = await resilientFetch(`/api/subjects/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete subject from database');
}

// Fetch all files metadata from database
export async function fetchFiles(): Promise<FileItem[]> {
  const res = await resilientFetch('/api/files', {}, { timeoutMs: 20000 });
  if (!res.ok) throw new Error('Failed to fetch files from database');
  return res.json();
}

// Save file metadata and optional blob to database
export async function saveFile(
  fileData: FileItem,
  blobData?: string,
  mimeType?: string
): Promise<void> {
  const res = await resilientFetch('/api/files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...fileData,
      blobData,
      mimeType,
    }),
  }, { timeoutMs: 45000 });
  if (!res.ok) throw new Error('Failed to save file to database');
}

// Delete file from database
export async function deleteFile(id: string): Promise<void> {
  const res = await resilientFetch(`/api/files/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete file from database');
}

// Increment download counter in database
export async function incrementDownloadCount(id: string): Promise<void> {
  await resilientFetch(`/api/files/${id}/download`, { method: 'POST' }, { retries: 0 });
}

// Fetch raw binary payload blob from database
export async function fetchFileBlob(blobId: string): Promise<{ id: string; mime_type: string; data_url: string }> {
  const res = await resilientFetch(`/api/files/blob/${blobId}`, {}, { timeoutMs: 30000 });
  if (!res.ok) throw new Error('Failed to fetch file payload from database');
  return res.json();
}

export interface LockoutStatusResponse {
  locked: boolean;
  retryAfterSeconds: number;
  lockedUntil: number;
  failures: number;
  remainingAttempts: number;
}

// Query persistent server-side lockout status for this device/IP
export async function fetchLockoutStatus(scope: AuthLockoutScope, account?: string): Promise<LockoutStatusResponse> {
  const query = new URLSearchParams({ scope });
  if (account) query.set('account', account);
  const res = await fetch(`/api/auth/lockout-status?${query.toString()}`, {
    headers: { ...getDeviceHeaders() },
  });
  if (!res.ok) {
    return { locked: false, retryAfterSeconds: 0, lockedUntil: 0, failures: 0, remainingAttempts: 5 };
  }
  const data = await res.json();
  if (data.locked && (data.lockedUntil || data.retryAfterSeconds)) {
    const until = Number(data.lockedUntil) || Date.now() + Number(data.retryAfterSeconds || 120) * 1000;
    setCachedLockoutUntil(scope, until);
  } else if (!data.locked) {
    setCachedLockoutUntil(scope, 0);
  }
  return data;
}

// Admin username + password login (no automatic retries so failed attempts don't multiply)
export async function loginAdmin(
  username: string,
  password: string
): Promise<{ success: boolean; token: string; username: string; name?: string }> {
  const res = await fetch('/api/admin/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getDeviceHeaders(),
    },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json().catch(() => ({ error: 'Verification failed' }));
  if (!res.ok) {
    if (res.status === 429 && (data.lockedUntil || data.retryAfterSeconds)) {
      const until = Number(data.lockedUntil) || Date.now() + Number(data.retryAfterSeconds || 120) * 1000;
      setCachedLockoutUntil('admin', until);
    }
    const err: any = new Error(data.error || 'Invalid admin username or password.');
    err.status = res.status;
    err.retryAfterSeconds = data.retryAfterSeconds;
    err.lockedUntil = data.lockedUntil;
    err.remainingAttempts = data.remainingAttempts;
    throw err;
  }
  setCachedLockoutUntil('admin', 0);
  if (data?.token) {
    setAdminToken(data.token);
  }
  return data;
}

// Fetch current admin display name & username ONLY (never exposes password)
export async function fetchAdminCredentials(): Promise<{ name: string; username: string }> {
  const res = await resilientFetch('/api/admin/credentials');
  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, 'Failed to fetch admin account details'));
  }
  return res.json();
}

// Update admin display name, username and/or password (requires current password verification server-side)
export async function updateAdminCredentials(payload: {
  currentPassword: string;
  newName?: string;
  newUsername: string;
  newPassword?: string;
}): Promise<{ success: boolean; name: string; username: string; token?: string }> {
  const res = await resilientFetch('/api/admin/credentials', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }, { retries: 0 });
  const data = await res.json().catch(() => ({ error: 'Failed to update admin credentials' }));
  if (!res.ok) {
    throw new Error(data.error || 'Failed to update admin credentials');
  }
  if (data?.token) {
    setAdminToken(data.token);
  }
  return data;
}

// QUIZ & ASSESSMENT API CALLS

// Fetch quizzes (teacher or student mode)
export async function fetchQuizzes(params?: { classId?: string; subject?: string; isStudent?: boolean }): Promise<QuizItem[]> {
  const query = new URLSearchParams();
  if (params?.classId) query.set('classId', params.classId);
  if (params?.subject) query.set('subject', params.subject);
  if (params?.isStudent) query.set('isStudent', 'true');

  const res = await resilientFetch(`/api/quizzes?${query.toString()}`, {}, { timeoutMs: 20000 });
  if (!res.ok) throw new Error('Failed to fetch quizzes from database');
  return res.json();
}

// Fetch single quiz
export async function fetchQuizById(id: string, isStudent: boolean = false): Promise<QuizItem> {
  const res = await resilientFetch(`/api/quizzes/${id}?isStudent=${isStudent ? 'true' : 'false'}`, {}, { timeoutMs: 20000 });
  if (!res.ok) throw new Error('Failed to fetch quiz');
  return res.json();
}

// Save or update quiz (teacher)
export async function saveQuiz(quiz: QuizItem): Promise<{ success: boolean; id: string; totalPoints: number }> {
  const res = await resilientFetch('/api/quizzes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(quiz),
  }, { timeoutMs: 30000 });
  if (!res.ok) throw new Error('Failed to save quiz to database');
  return res.json();
}

// Delete quiz (teacher)
export async function deleteQuiz(id: string): Promise<void> {
  const res = await resilientFetch(`/api/quizzes/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete quiz');
}

// Generate teacher reference solution and rubric with Gemini AI
export async function generateAiSolution(payload: {
  questionText: string;
  type: string;
  classId?: string;
  subject?: string;
}): Promise<{
  correctAnswer: string;
  gradingRubric: string;
  options?: string[];
  blankAnswer?: string;
}> {
  const res = await resilientFetch('/api/quizzes/generate-solution', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }, { timeoutMs: 25000 });
  if (!res.ok) throw new Error('Failed to generate AI solution');
  const json = await res.json();
  return json.data;
}

// Submit student quiz answers for evaluation & grading (idempotent retry protected via attemptId)
export async function evaluateQuizSubmission(
  payload: {
    quizId: string;
    studentName: string;
    studentRoll?: string;
    studentId?: string;
    attemptId?: string;
    classId?: string;
    isAdmin?: boolean;
    studentAnswers: Record<string, any>;
    studentOptionSelections?: Record<string, string>;
    studentSubOptionSelections?: Record<string, Record<string, string>>;
  },
  opts?: { onRetry?: (attempt: number) => void }
): Promise<{
  success: boolean;
  submissionId: string;
  quizTitle: string;
  studentName: string;
  evaluation: QuizEvaluationReport;
  deduplicated?: boolean;
}> {
  const res = await resilientFetch(
    '/api/quizzes/evaluate',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    { timeoutMs: 25000, retries: 3, retryOnPost: true, onRetry: opts?.onRetry }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Evaluation failed' }));
    throw new Error(err.error || 'Failed to submit and evaluate assessment');
  }
  return res.json();
}

// Fetch past submissions (for student review or teacher grading record)
export async function fetchSubmissions(
  params?: {
    quizId?: string;
    classId?: string;
    studentName?: string;
    studentId?: string;
    full?: boolean;
  },
  opts?: { signal?: AbortSignal }
): Promise<QuizSubmission[]> {
  const query = new URLSearchParams();
  if (params?.quizId) query.set('quizId', params.quizId);
  if (params?.classId) query.set('classId', params.classId);
  if (params?.studentName) query.set('studentName', params.studentName);
  if (params?.studentId) query.set('studentId', params.studentId);
  if (params?.full) query.set('full', 'true');

  const res = await resilientFetch(`/api/submissions?${query.toString()}`, {}, { timeoutMs: 25000, signal: opts?.signal });
  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, 'Failed to fetch submissions'));
  }
  return res.json();
}

export async function fetchSubmissionById(id: string): Promise<QuizSubmission> {
  const res = await resilientFetch(`/api/submissions/${id}`);
  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, 'Failed to fetch submission'));
  }
  return res.json();
}

// Update submission grade (Teacher manual override)
export async function updateSubmissionGrade(
  id: string,
  payload: {
    evaluation: QuizEvaluationReport;
    totalScore: number;
    maxScore: number;
    status?: 'graded' | 'pending';
  }
): Promise<void> {
  const res = await resilientFetch(`/api/submissions/${id}/grade`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, 'Failed to update submission grade'));
  }
}

// Delete submission
export async function deleteSubmission(id: string): Promise<void> {
  const res = await resilientFetch(`/api/submissions/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, 'Failed to delete submission'));
  }
}

// Bulk delete submissions permanently from DB
export async function bulkDeleteSubmissions(ids: string[]): Promise<{ success: boolean; deletedCount: number }> {
  const res = await resilientFetch('/api/submissions/bulk-delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, 'Failed to delete submissions'));
  }
  return res.json();
}

// Admin: Fetch & restore immutable submission backups
export async function fetchSubmissionBackups(params?: {
  quizId?: string;
  studentId?: string;
}): Promise<any[]> {
  const query = new URLSearchParams();
  if (params?.quizId) query.set('quizId', params.quizId);
  if (params?.studentId) query.set('studentId', params.studentId);
  const res = await resilientFetch(`/api/admin/backups${query.toString() ? `?${query.toString()}` : ''}`);
  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, 'Failed to fetch submission backups'));
  }
  return res.json();
}

export async function restoreSubmissionBackup(backupId: string): Promise<{ success: boolean; submissionId: string }> {
  const res = await resilientFetch(`/api/admin/backups/${encodeURIComponent(backupId)}/restore`, {
    method: 'POST',
  });
  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, 'Failed to restore submission backup'));
  }
  return res.json();
}

// ==========================================
// STUDENT AUTH & ACCOUNT API HELPERS
// ==========================================

export async function registerStudent(payload: {
  studentId: string;
  rollNo?: string;
  name: string;
  classId: string;
  password: string;
}): Promise<{ success: boolean; token?: string; student: StudentUser }> {
  const res = await resilientFetch('/api/students/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Registration failed' }));
    throw new Error(err.error || 'Failed to register student');
  }
  const data = await res.json();
  if (data?.token) {
    setStudentToken(data.token);
  }
  return data;
}

export async function loginStudent(payload: {
  studentId: string;
  password: string;
  classId?: string;
}): Promise<{ success: boolean; token?: string; student: StudentUser }> {
  const res = await resilientFetch(
    '/api/students/login',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    { retries: 0 }
  );
  const data = await res.json().catch(() => ({ error: 'Login failed' }));
  if (!res.ok) {
    if (res.status === 429 && (data.lockedUntil || data.retryAfterSeconds)) {
      const until = Number(data.lockedUntil) || Date.now() + Number(data.retryAfterSeconds || 120) * 1000;
      setCachedLockoutUntil('student', until);
    }
    const err: any = new Error(data.error || 'Invalid Student ID or password');
    err.status = res.status;
    err.retryAfterSeconds = data.retryAfterSeconds;
    err.lockedUntil = data.lockedUntil;
    err.remainingAttempts = data.remainingAttempts;
    throw err;
  }
  setCachedLockoutUntil('student', 0);
  if (data?.token) {
    setStudentToken(data.token);
  }
  return data;
}

export async function fetchStudents(): Promise<StudentUser[]> {
  const res = await resilientFetch('/api/students');
  if (!res.ok) throw new Error('Failed to fetch students');
  return res.json();
}

export async function updateStudent(
  id: string,
  payload: { studentId?: string; rollNo?: string; name?: string; classId?: string; password?: string; section?: 'A' | 'B' | string }
): Promise<any> {
  const res = await resilientFetch(`/api/students/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Update failed' }));
    throw new Error(err.error || 'Failed to update student');
  }
  return res.json();
}

export async function resetStudentPassword(
  id: string,
  newPassword?: string
): Promise<{ success: boolean; message: string }> {
  const res = await resilientFetch(`/api/students/${id}/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: newPassword }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Reset password failed' }));
    throw new Error(err.error || 'Failed to reset student password');
  }
  return res.json();
}

export async function deleteStudent(id: string): Promise<void> {
  const res = await resilientFetch(`/api/students/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete student');
}

// ==========================================
// QUIZ ATTEMPTS, DRAFT BACKUP & NO-RETEST API HELPERS
// ==========================================

export async function startQuizAttempt(
  quizId: string,
  payload: { studentId: string; studentName: string; isAdmin?: boolean }
): Promise<{
  allowed: boolean;
  status?: string;
  startedAt?: string;
  updatedAt?: string;
  isResume?: boolean;
  draftAnswers?: Record<string, any> | null;
  randomizationMap?: any;
  randomizationError?: string;
  error?: string;
}> {
  const res = await resilientFetch(
    `/api/quizzes/${quizId}/start-attempt`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    { retries: 3, retryOnPost: true }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unable to start test attempt' }));
    return {
      allowed: false,
      status: err.status,
      randomizationError: err.randomizationError ? (err.error || 'Randomization validation failed') : undefined,
      error: err.error || 'Assessment attempt restricted',
    };
  }
  return res.json();
}

export async function saveQuizDraft(
  quizId: string,
  payload: { studentId: string; answers: Record<string, any>; clientUpdatedAt?: number }
): Promise<{ saved: boolean; updatedAt?: string; offline?: boolean }> {
  try {
    const res = await resilientFetch(
      `/api/quizzes/${quizId}/draft`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          clientUpdatedAt: payload.clientUpdatedAt || Date.now(),
        }),
      },
      { timeoutMs: 10000, retries: 2 }
    );
    if (!res.ok) return { saved: false };
    return await res.json();
  } catch {
    return { saved: false, offline: typeof navigator !== 'undefined' && navigator.onLine === false };
  }
}

// Flush latest draft answers reliably on tab close / pagehide / visibilitychange
export function flushQuizDraftBeacon(
  quizId: string,
  payload: { studentId: string; answers: Record<string, any>; clientUpdatedAt?: number }
): void {
  try {
    const url = getAuthenticatedPrintUrl(`/api/quizzes/${quizId}/draft`);
    const bodyStr = JSON.stringify({
      ...payload,
      clientUpdatedAt: payload.clientUpdatedAt || Date.now(),
    });
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const sent = navigator.sendBeacon(url, new Blob([bodyStr], { type: 'application/json' }));
      if (sent) return;
    }
    if (typeof fetch === 'function') {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const token = getAuthToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;
      fetch(`/api/quizzes/${quizId}/draft`, {
        method: 'POST',
        headers,
        body: bodyStr,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    // Silent fallback; local storage already holds the latest snapshot
  }
}

export async function fetchQuizAttemptStatus(
  quizId: string,
  studentId: string
): Promise<{
  hasAttempted: boolean;
  status: 'none' | 'in_progress' | 'submitted' | 'error';
  startedAt?: string;
  updatedAt?: string;
  draftAnswers?: Record<string, any> | null;
  randomizationMap?: any;
  randomizationError?: string;
  submission?: {
    id: string;
    totalScore: number;
    maxScore: number;
    submittedAt: string;
    status: string;
    aiEvaluation?: QuizEvaluationReport;
  } | null;
}> {
  try {
    const res = await resilientFetch(`/api/quizzes/${quizId}/attempt-status?studentId=${encodeURIComponent(studentId)}`);
    if (!res.ok) return { hasAttempted: false, status: 'error' };
    return await res.json();
  } catch {
    return { hasAttempted: false, status: 'error' };
  }
}

export async function resetQuizAttempt(
  quizId: string,
  studentId: string
): Promise<{ success: boolean; message: string }> {
  const res = await resilientFetch(`/api/quizzes/${quizId}/reset-attempt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ studentId }),
  });
  if (!res.ok) throw new Error('Failed to reset quiz attempt');
  return res.json();
}

export async function fetchAdminLiveMonitoring(
  params?: {
    quizId?: string;
    classId?: string;
  },
  opts?: { signal?: AbortSignal }
): Promise<{ liveAttempts: LiveExamAttempt[]; serverTime: string }> {
  const query = new URLSearchParams();
  if (params?.quizId && params.quizId !== 'all') query.set('quizId', params.quizId);
  if (params?.classId && params.classId !== 'all') query.set('classId', params.classId);
  const qs = query.toString();
  const res = await resilientFetch(
    `/api/admin/live-monitoring${qs ? `?${qs}` : ''}`,
    {},
    { timeoutMs: 12000, retries: 2, signal: opts?.signal }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to load live monitoring' }));
    throw new Error(err.error || 'Failed to load live monitoring');
  }
  return res.json();
}

export function getAdminLiveMonitoringStreamUrl(): string {
  return getAuthenticatedPrintUrl('/api/admin/live-monitoring/stream');
}

// ==========================================
// HOMEWORK OF THE DAY API HELPERS
// ==========================================

export async function fetchHomeworkList(classId?: string): Promise<HomeworkItem[]> {
  const url = classId && classId !== 'all' ? `/api/homework?classId=${encodeURIComponent(classId)}` : '/api/homework';
  const res = await resilientFetch(url);
  if (!res.ok) throw new Error('Failed to fetch homework list');
  return res.json();
}

export async function saveHomeworkItem(item: Partial<HomeworkItem>): Promise<{ success: boolean; homework: any }> {
  const res = await resilientFetch('/api/homework', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(item),
  });
  if (!res.ok) throw new Error('Failed to save homework assignment');
  return res.json();
}

export async function deleteHomeworkItem(id: string): Promise<void> {
  const res = await resilientFetch(`/api/homework/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete homework assignment');
}

// ==========================================
// TERM LESSON PLAN / SYLLABUS API HELPERS
// ==========================================

export async function fetchLessonList(params?: {
  classId?: string;
  term?: string;
  subject?: string;
}): Promise<LessonItem[]> {
  const query = new URLSearchParams();
  if (params?.classId && params.classId !== 'all') query.set('classId', params.classId);
  if (params?.term && params.term !== 'all') query.set('term', params.term);
  if (params?.subject && params.subject !== 'all') query.set('subject', params.subject);

  const url = `/api/lessons${query.toString() ? `?${query.toString()}` : ''}`;
  const res = await resilientFetch(url);
  if (!res.ok) throw new Error('Failed to fetch lesson list');
  return res.json();
}

export async function saveLessonItem(item: Partial<LessonItem>): Promise<{ success: boolean; lesson: any }> {
  const res = await resilientFetch('/api/lessons', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(item),
  });
  if (!res.ok) throw new Error('Failed to save lesson plan');
  return res.json();
}

export async function updateLessonStatus(id: string, status: LessonStatus): Promise<void> {
  const res = await resilientFetch(`/api/lessons/${encodeURIComponent(id)}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error('Failed to update lesson status');
}

export async function deleteLessonItem(id: string): Promise<void> {
  const res = await resilientFetch(`/api/lessons/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete lesson item');
}


