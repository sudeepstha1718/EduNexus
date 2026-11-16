import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { QuizItem, QuestionItem, QuizEvaluationReport, StudentUser } from '../types';
import {
  evaluateQuizSubmission,
  startQuizAttempt,
  fetchQuizAttemptStatus,
  saveQuizDraft,
  flushQuizDraftBeacon,
  getAuthenticatedPrintUrl
} from '../lib/api';
import {
  cleanOptionText,
  cleanQuestionPrompt
} from './TeacherGradeModal';
import {
  QuizRandomizationMap,
  buildQuizRandomizationMap,
  parseRandomizationMap,
  applyQuizRandomization,
  validateQuizRandomizationMap,
  validateRandomizedQuiz
} from '../lib/randomization';
import {
  ArrowLeft,
  CheckCircle2,
  Sparkles,
  Send,
  User,
  Hash,
  Clock,
  Award,
  AlertCircle,
  HelpCircle,
  ImageIcon,
  ChevronRight,
  ChevronLeft,
  RefreshCw,
  BookOpen,
  Timer,
  AlertTriangle,
  Play,
  Check,
  Layers,
  FileText,
  Printer,
  Bookmark,
  BookmarkCheck,
  Grid,
  ShieldAlert,
  LogIn,
  Eye,
  Download
} from 'lucide-react';

interface LocalDraftEnvelope {
  answers: Record<string, any>;
  optionSelections?: Record<string, string>;
  subOptionSelections?: Record<string, Record<string, string>>;
  updatedAt: number;
}

function splitDraftFields(rawObj: Record<string, any> | null | undefined): {
  cleanAnswers: Record<string, any>;
  optionSelections: Record<string, string>;
  subOptionSelections: Record<string, Record<string, string>>;
} {
  const cleanAnswers: Record<string, any> = {};
  const optionSelections: Record<string, string> = {};
  const subOptionSelections: Record<string, Record<string, string>> = {};
  if (!rawObj || typeof rawObj !== 'object') {
    return { cleanAnswers, optionSelections, subOptionSelections };
  }
  if (rawObj.__optionSelections && typeof rawObj.__optionSelections === 'object') {
    for (const [k, v] of Object.entries(rawObj.__optionSelections)) {
      if (typeof v === 'string') optionSelections[k] = v;
    }
  }
  if (rawObj.__subOptionSelections && typeof rawObj.__subOptionSelections === 'object') {
    for (const [k, v] of Object.entries(rawObj.__subOptionSelections)) {
      if (v && typeof v === 'object') subOptionSelections[k] = { ...(v as Record<string, string>) };
    }
  }
  for (const [k, v] of Object.entries(rawObj)) {
    if (k === '__optionSelections' || k === '__subOptionSelections') continue;
    cleanAnswers[k] = v;
  }
  return { cleanAnswers, optionSelections, subOptionSelections };
}

function buildCombinedDraftPayload(
  answers: Record<string, any>,
  optionSelections: Record<string, string>,
  subOptionSelections: Record<string, Record<string, string>>
): Record<string, any> {
  const payload: Record<string, any> = { ...answers };
  if (Object.keys(optionSelections).length > 0) {
    payload.__optionSelections = optionSelections;
  }
  if (Object.keys(subOptionSelections).length > 0) {
    payload.__subOptionSelections = subOptionSelections;
  }
  return payload;
}

function parseDraftPayload(raw: string | null): LocalDraftEnvelope | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (
      typeof parsed.updatedAt === 'number' &&
      parsed.answers &&
      typeof parsed.answers === 'object'
    ) {
      const split = splitDraftFields(parsed.answers);
      return {
        answers: split.cleanAnswers,
        optionSelections: parsed.optionSelections || split.optionSelections,
        subOptionSelections: parsed.subOptionSelections || split.subOptionSelections,
        updatedAt: parsed.updatedAt,
      };
    }
    const split = splitDraftFields(parsed);
    return {
      answers: split.cleanAnswers,
      optionSelections: split.optionSelections,
      subOptionSelections: split.subOptionSelections,
      updatedAt: 1,
    };
  } catch {
    return null;
  }
}

function readLocalDraft(key: string): LocalDraftEnvelope {
  try {
    const s = parseDraftPayload(sessionStorage.getItem(key));
    const l = parseDraftPayload(localStorage.getItem(key));
    if (s && l) {
      return l.updatedAt > s.updatedAt ? l : s;
    }
    return l || s || { answers: {}, optionSelections: {}, subOptionSelections: {}, updatedAt: 0 };
  } catch {
    return { answers: {}, optionSelections: {}, subOptionSelections: {}, updatedAt: 0 };
  }
}

function writeLocalDraft(
  key: string,
  answers: Record<string, any>,
  updatedAt: number,
  optionSelections: Record<string, string> = {},
  subOptionSelections: Record<string, Record<string, string>> = {}
): void {
  try {
    const serialized = JSON.stringify({ answers, optionSelections, subOptionSelections, updatedAt });
    sessionStorage.setItem(key, serialized);
    localStorage.setItem(key, serialized);
  } catch {
    // ignore storage quota errors gracefully
  }
}

function readLocalRandMap(key: string): QuizRandomizationMap | null {
  try {
    const sRaw = sessionStorage.getItem(key);
    const lRaw = localStorage.getItem(key);
    return parseRandomizationMap(sRaw) || parseRandomizationMap(lRaw);
  } catch {
    return null;
  }
}

function writeLocalRandMap(key: string, map: QuizRandomizationMap | null | undefined): void {
  if (!map) return;
  try {
    const serialized = JSON.stringify(map);
    sessionStorage.setItem(key, serialized);
    localStorage.setItem(key, serialized);
  } catch {
    // ignore storage quota errors gracefully
  }
}

interface QuizTakerProps {
  quiz: QuizItem;
  onBack: () => void;
  onEvaluationComplete: (report: QuizEvaluationReport) => void;
  onPrintQuiz?: (quiz: QuizItem) => void;
  currentStudent?: StudentUser | null;
  onOpenAuth?: () => void;
  isAdmin?: boolean;
}

export const QuizTaker: React.FC<QuizTakerProps> = ({
  quiz,
  onBack,
  onEvaluationComplete,
  onPrintQuiz,
  currentStudent,
  onOpenAuth,
  isAdmin = false,
}) => {
  // Student Identifiers (Admin defaults to Teacher Admin / ADMIN)
  const [studentName, setStudentName] = useState<string>(
    currentStudent?.name || (isAdmin ? 'Teacher Admin' : '')
  );
  const [studentRoll, setStudentRoll] = useState<string>(
    currentStudent?.rollNo || (isAdmin ? 'ADMIN' : '')
  );
  const [nameError, setNameError] = useState<string | null>(null);

  // Stable fallback guest token if unauthenticated user hasn't typed name/roll yet
  const fallbackGuestTokenRef = useRef<string>(`anon_${Date.now()}`);

  // Compute a distinct, unique student identifier to prevent student mixing
  const effectiveStudentId = useMemo(() => {
    if (isAdmin) return 'admin';
    if (currentStudent?.studentId) return currentStudent.studentId.trim();
    if (currentStudent?.id) return currentStudent.id.trim();
    const roll = studentRoll.trim();
    const nameSlug = studentName.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
    if (roll && nameSlug) return `guest_${quiz.classId}_${roll}_${nameSlug}`;
    if (roll) return `guest_${quiz.classId}_${roll}`;
    if (nameSlug) return `guest_${quiz.classId}_${nameSlug}`;
    return fallbackGuestTokenRef.current;
  }, [isAdmin, currentStudent, studentRoll, studentName, quiz.classId]);

  // Namespaced storage keys for complete student isolation
  const draftStorageKey = useMemo(() => `quiz_draft_${quiz.id}_${effectiveStudentId}`, [quiz.id, effectiveStudentId]);
  const startedStorageKey = useMemo(() => `quiz_started_${quiz.id}_${effectiveStudentId}`, [quiz.id, effectiveStudentId]);
  const startTimeStorageKey = useMemo(() => `quiz_start_time_${quiz.id}_${effectiveStudentId}`, [quiz.id, effectiveStudentId]);
  const attemptIdStorageKey = useMemo(() => `quiz_attempt_id_${quiz.id}_${effectiveStudentId}`, [quiz.id, effectiveStudentId]);
  const randStorageKey = useMemo(() => `quiz_rand_${quiz.id}_${effectiveStudentId}`, [quiz.id, effectiveStudentId]);

  // Test Start State (Pre-test lobby vs active test - strictly namespaced to current student)
  const [isTestStarted, setIsTestStarted] = useState<boolean>(() => {
    try {
      const activeTestFlag =
        sessionStorage.getItem(startedStorageKey) ||
        localStorage.getItem(startedStorageKey);
      return activeTestFlag === 'true';
    } catch {
      return false;
    }
  });
  const [isStartingTest, setIsStartingTest] = useState<boolean>(false);

  // Persistent randomization map (locked per student attempt, restored on refresh/resume, never mutating teacher original quiz)
  const [randomizationMap, setRandomizationMap] = useState<QuizRandomizationMap | null>(() => {
    const localMap = readLocalRandMap(`quiz_rand_${quiz.id}_${effectiveStudentId}`);
    if (!localMap) return null;
    return validateQuizRandomizationMap(quiz.questions, localMap).valid ? localMap : null;
  });

  // Attempt Status State
  const [checkingAttempt, setCheckingAttempt] = useState<boolean>(!isAdmin);
  const [attemptStatus, setAttemptStatus] = useState<{
    hasAttempted: boolean;
    status: string;
    startedAt?: string;
    draftAnswers?: Record<string, any> | null;
    randomizationMap?: QuizRandomizationMap | null;
    randomizationError?: string;
    submission?: any;
  }>({ hasAttempted: false, status: 'none' });

  // Active question index
  const [activeQuestionIndex, setActiveQuestionIndex] = useState<number>(0);
  const [flaggedQuestions, setFlaggedQuestions] = useState<Record<string, boolean>>({});

  // Student Answers state map: questionId -> value (strictly namespaced to current student, with timestamped envelope)
  const initialDraftRef = useRef<LocalDraftEnvelope | null>(null);
  if (initialDraftRef.current === null) {
    try {
      sessionStorage.removeItem(`quiz_draft_${quiz.id}`);
      localStorage.removeItem(`quiz_draft_${quiz.id}`);
    } catch {
      // ignore
    }
    initialDraftRef.current = readLocalDraft(draftStorageKey);
  }

  const [answers, setAnswers] = useState<Record<string, any>>(() => initialDraftRef.current?.answers || {});
  const [optionSelections, setOptionSelections] = useState<Record<string, string>>(
    () => initialDraftRef.current?.optionSelections || {}
  );
  const [subOptionSelections, setSubOptionSelections] = useState<Record<string, Record<string, string>>>(
    () => initialDraftRef.current?.subOptionSelections || {}
  );

  // Always keep refs synced for timers, unload beacons, and submission snapshots
  const latestAnswersRef = useRef<Record<string, any>>(answers);
  const latestOptionSelectionsRef = useRef<Record<string, string>>(optionSelections);
  const latestSubOptionSelectionsRef = useRef<Record<string, Record<string, string>>>(subOptionSelections);
  const answersUpdatedAtRef = useRef<number>(initialDraftRef.current?.updatedAt || 0);
  const isDraftDirtyRef = useRef<boolean>(false);
  const hasUserEditedAnswerRef = useRef<boolean>(false);
  const lastEditKindRef = useRef<'selection' | 'text'>('selection');
  const skipNextAutoSaveRef = useRef<boolean>(false);
  const debounceSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedSnapshotTsRef = useRef<number>(0);
  const isFlushingDraftRef = useRef<boolean>(false);
  const pendingResyncAfterFlushRef = useRef<boolean>(false);

  const latestDraftKeyRef = useRef<string>(draftStorageKey);
  const latestStudentIdRef = useRef<string>(effectiveStudentId);
  const latestIsTestStartedRef = useRef<boolean>(isTestStarted);
  const latestIsAdminRef = useRef<boolean>(isAdmin);

  latestDraftKeyRef.current = draftStorageKey;
  latestStudentIdRef.current = effectiveStudentId;
  latestIsTestStartedRef.current = isTestStarted;
  latestIsAdminRef.current = isAdmin;

  // Submission / Loading / Auto-save status states
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const isSubmittingRef = useRef<boolean>(false);
  const [submissionStage, setSubmissionStage] = useState<'idle' | 'submitting' | 'retrying' | 'confirmed' | 'error'>('idle');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'offline' | 'error'>(() =>
    typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'saved'
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [showExitConfirmModal, setShowExitConfirmModal] = useState<boolean>(false);

  const clearLocalQuizState = useCallback(() => {
    try {
      sessionStorage.removeItem(startedStorageKey);
      localStorage.removeItem(startedStorageKey);
      sessionStorage.removeItem(startTimeStorageKey);
      localStorage.removeItem(startTimeStorageKey);
      sessionStorage.removeItem(draftStorageKey);
      localStorage.removeItem(draftStorageKey);
      sessionStorage.removeItem(attemptIdStorageKey);
      localStorage.removeItem(attemptIdStorageKey);
      sessionStorage.removeItem(randStorageKey);
      localStorage.removeItem(randStorageKey);
      sessionStorage.removeItem(`quiz_started_${quiz.id}`);
      sessionStorage.removeItem(`quiz_start_time_${quiz.id}`);
      sessionStorage.removeItem(`quiz_draft_${quiz.id}`);
      localStorage.removeItem(`quiz_draft_${quiz.id}`);
      sessionStorage.removeItem('scholarboard_active_quiz_id');
      localStorage.removeItem('scholarboard_active_quiz_id');
    } catch {
      // ignore
    }
  }, [startedStorageKey, startTimeStorageKey, draftStorageKey, attemptIdStorageKey, randStorageKey, quiz.id]);

  // Serialized server draft flush helper with monotonic timestamp protection
  const flushDraftToServer = useCallback(async () => {
    const stuId = latestStudentIdRef.current;
    if (
      !latestIsTestStartedRef.current ||
      latestIsAdminRef.current ||
      !stuId ||
      stuId.startsWith('anon_') ||
      isSubmittingRef.current
    ) {
      return;
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setSaveStatus('offline');
      return;
    }

    if (isFlushingDraftRef.current) {
      pendingResyncAfterFlushRef.current = true;
      return;
    }

    isFlushingDraftRef.current = true;
    try {
      do {
        pendingResyncAfterFlushRef.current = false;
        const activeStuId = latestStudentIdRef.current;
        if (
          !latestIsTestStartedRef.current ||
          latestIsAdminRef.current ||
          !activeStuId ||
          activeStuId.startsWith('anon_') ||
          isSubmittingRef.current
        ) {
          break;
        }
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          setSaveStatus('offline');
          break;
        }

        const snapshot = buildCombinedDraftPayload(
          latestAnswersRef.current,
          latestOptionSelectionsRef.current,
          latestSubOptionSelectionsRef.current
        );
        const snapshotTs = Math.max(Date.now(), answersUpdatedAtRef.current || 0);
        lastSavedSnapshotTsRef.current = snapshotTs;
        setSaveStatus('saving');

        const res = await saveQuizDraft(quiz.id, {
          studentId: activeStuId,
          answers: snapshot,
          clientUpdatedAt: snapshotTs,
        });
        if (res.saved) {
          // Only clear dirty flag if student did not make newer edits while request was in flight
          if ((answersUpdatedAtRef.current || 0) <= snapshotTs) {
            isDraftDirtyRef.current = false;
            setSaveStatus('saved');
          } else {
            pendingResyncAfterFlushRef.current = true;
          }
        } else if (res.offline) {
          setSaveStatus('offline');
          break;
        } else {
          setSaveStatus('error');
          break;
        }
      } while (pendingResyncAfterFlushRef.current);
    } finally {
      isFlushingDraftRef.current = false;
    }
  }, [quiz.id]);

  useEffect(() => {
    latestAnswersRef.current = answers;
  }, [answers]);

  useEffect(() => {
    latestOptionSelectionsRef.current = optionSelections;
  }, [optionSelections]);

  useEffect(() => {
    latestSubOptionSelectionsRef.current = subOptionSelections;
  }, [subOptionSelections]);

  // Strict session isolation: when student changes, reset or reload their specific draft & randomization map
  const currentStudentIdRef = useRef<string>(effectiveStudentId);
  useEffect(() => {
    if (currentStudentIdRef.current !== effectiveStudentId) {
      currentStudentIdRef.current = effectiveStudentId;
      const loaded = readLocalDraft(`quiz_draft_${quiz.id}_${effectiveStudentId}`);
      skipNextAutoSaveRef.current = true;
      answersUpdatedAtRef.current = loaded.updatedAt;
      isDraftDirtyRef.current = false;
      latestAnswersRef.current = loaded.answers;
      latestOptionSelectionsRef.current = loaded.optionSelections || {};
      latestSubOptionSelectionsRef.current = loaded.subOptionSelections || {};
      setAnswers(loaded.answers);
      setOptionSelections(loaded.optionSelections || {});
      setSubOptionSelections(loaded.subOptionSelections || {});
      const localMap = readLocalRandMap(`quiz_rand_${quiz.id}_${effectiveStudentId}`);
      if (localMap && validateQuizRandomizationMap(quiz.questions, localMap).valid) {
        setRandomizationMap(localMap);
      } else {
        setRandomizationMap(null);
      }
    }
  }, [effectiveStudentId, quiz.id, quiz.questions]);

  // Save answers draft on change - immediately locally (sessionStorage + localStorage) + fast debounced server sync for live monitoring
  useEffect(() => {
    if (skipNextAutoSaveRef.current) {
      skipNextAutoSaveRef.current = false;
      return;
    }

    if (
      !hasUserEditedAnswerRef.current &&
      Object.keys(answers).length === 0 &&
      Object.keys(optionSelections).length === 0 &&
      Object.keys(subOptionSelections).length === 0 &&
      !isDraftDirtyRef.current
    ) {
      return;
    }

    const now = Date.now();
    answersUpdatedAtRef.current = now;
    isDraftDirtyRef.current = true;
    writeLocalDraft(draftStorageKey, answers, now, optionSelections, subOptionSelections);

    if (!isTestStarted || isAdmin || effectiveStudentId.startsWith('anon_') || isSubmittingRef.current) {
      return;
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setSaveStatus('offline');
      return;
    }

    setSaveStatus('saving');
    if (debounceSaveTimerRef.current) {
      clearTimeout(debounceSaveTimerRef.current);
    }
    const debounceMs = lastEditKindRef.current === 'selection' ? 150 : 350;
    debounceSaveTimerRef.current = setTimeout(() => {
      flushDraftToServer();
    }, debounceMs);

    return () => {
      if (debounceSaveTimerRef.current) {
        clearTimeout(debounceSaveTimerRef.current);
      }
    };
  }, [answers, optionSelections, subOptionSelections, draftStorageKey, isTestStarted, isAdmin, effectiveStudentId, flushDraftToServer]);

  // Periodic background auto-save (every 15 seconds while active & dirty)
  useEffect(() => {
    if (!isTestStarted || isAdmin || effectiveStudentId.startsWith('anon_')) return;

    const interval = setInterval(() => {
      if (isDraftDirtyRef.current && !isSubmittingRef.current) {
        flushDraftToServer();
      }
    }, 15000);

    return () => clearInterval(interval);
  }, [isTestStarted, isAdmin, effectiveStudentId, flushDraftToServer]);

  // Fast 4-second retry loop whenever draft sync entered error state while dirty
  useEffect(() => {
    if (!isTestStarted || isAdmin || effectiveStudentId.startsWith('anon_') || saveStatus !== 'error') {
      return;
    }

    const retryTimer = setTimeout(() => {
      if (isDraftDirtyRef.current && !isSubmittingRef.current && navigator.onLine !== false) {
        flushDraftToServer();
      }
    }, 4000);

    return () => clearTimeout(retryTimer);
  }, [saveStatus, isTestStarted, isAdmin, effectiveStudentId, flushDraftToServer]);

  // Connectivity recovery ('online'/'offline') + Tab Close / Page Hide / Visibility beacon flush
  useEffect(() => {
    const handleOnline = () => {
      if (isDraftDirtyRef.current) {
        flushDraftToServer();
      } else {
        setSaveStatus('saved');
      }
    };
    const handleOffline = () => {
      setSaveStatus('offline');
    };
    const handleFlushOnLeave = () => {
      const hasAnyAnswers =
        Object.keys(latestAnswersRef.current).length > 0 ||
        Object.keys(latestOptionSelectionsRef.current).length > 0;
      if (hasAnyAnswers || isDraftDirtyRef.current) {
        writeLocalDraft(
          latestDraftKeyRef.current,
          latestAnswersRef.current,
          answersUpdatedAtRef.current || Date.now(),
          latestOptionSelectionsRef.current,
          latestSubOptionSelectionsRef.current
        );
      }
      const stuId = latestStudentIdRef.current;
      if (
        latestIsTestStartedRef.current &&
        !latestIsAdminRef.current &&
        stuId &&
        !stuId.startsWith('anon_') &&
        !isSubmittingRef.current &&
        isDraftDirtyRef.current
      ) {
        flushQuizDraftBeacon(quiz.id, {
          studentId: stuId,
          answers: buildCombinedDraftPayload(
            latestAnswersRef.current,
            latestOptionSelectionsRef.current,
            latestSubOptionSelectionsRef.current
          ),
          clientUpdatedAt: answersUpdatedAtRef.current || Date.now(),
        });
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        handleFlushOnLeave();
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('pagehide', handleFlushOnLeave);
    window.addEventListener('beforeunload', handleFlushOnLeave);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('pagehide', handleFlushOnLeave);
      window.removeEventListener('beforeunload', handleFlushOnLeave);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [quiz.id, flushDraftToServer]);

  // Timer state (deadline-based so background tab throttling or mobile sleep never drifts)
  const hasTimeLimit = Boolean(quiz.timeLimitMinutes && quiz.timeLimitMinutes > 0);
  const initialSeconds = hasTimeLimit ? (quiz.timeLimitMinutes || 0) * 60 : 0;

  const endTimeMsRef = useRef<number | null>(null);
  if (hasTimeLimit && endTimeMsRef.current === null) {
    try {
      const storedStart =
        sessionStorage.getItem(startTimeStorageKey) ||
        localStorage.getItem(startTimeStorageKey) ||
        sessionStorage.getItem(`quiz_start_time_${quiz.id}`);
      if (storedStart) {
        const startMs = parseInt(storedStart, 10);
        if (!Number.isNaN(startMs)) {
          endTimeMsRef.current = startMs + initialSeconds * 1000;
        }
      }
    } catch {
      // ignore
    }
  }

  const [secondsRemaining, setSecondsRemaining] = useState<number>(() => {
    if (!hasTimeLimit) return 0;
    if (endTimeMsRef.current !== null) {
      const rem = Math.ceil((endTimeMsRef.current - Date.now()) / 1000);
      return rem > 0 ? rem : 10;
    }
    return initialSeconds;
  });
  const [timeUpNotified, setTimeUpNotified] = useState<boolean>(false);

  // Reference to prevent multiple auto-submits
  const autoSubmittedRef = useRef<boolean>(false);

  // Keep state synced with currentStudent
  useEffect(() => {
    if (currentStudent) {
      setStudentName(currentStudent.name);
      setStudentRoll(currentStudent.rollNo || currentStudent.studentId || '');
    }
  }, [currentStudent]);

  // Check attempt status on mount & enforce rules / restore latest safely saved answers
  useEffect(() => {
    if (isAdmin) {
      setCheckingAttempt(false);
      setAttemptStatus({ hasAttempted: false, status: 'none' });
      return;
    }

    const studentIdToCheck = currentStudent?.studentId || effectiveStudentId;
    if (!studentIdToCheck || studentIdToCheck.startsWith('anon_')) {
      setCheckingAttempt(false);
      return;
    }

    let cancelled = false;
    const delayMs = currentStudent?.studentId ? 0 : 400;

    const timer = setTimeout(async () => {
      if (cancelled) return;
      setCheckingAttempt(true);
      try {
        const res = await fetchQuizAttemptStatus(quiz.id, studentIdToCheck);
        if (cancelled) return;

        // Transient server/network error must NEVER wipe an active student exam or kick them out
        if (res.status === 'error') {
          return;
        }

        setAttemptStatus(res);

        // Examination rule enforcement: if already submitted on server, lock out active test immediately
        if (res.status === 'submitted') {
          clearLocalQuizState();
          setIsTestStarted(false);
          return;
        }

        // If teacher explicitly reset attempt on server while student had stale local started flag, reset cleanly
        if (res.status === 'none' && latestIsTestStartedRef.current) {
          clearLocalQuizState();
          skipNextAutoSaveRef.current = true;
          answersUpdatedAtRef.current = 0;
          isDraftDirtyRef.current = false;
          latestAnswersRef.current = {};
          latestOptionSelectionsRef.current = {};
          latestSubOptionSelectionsRef.current = {};
          setAnswers({});
          setOptionSelections({});
          setSubOptionSelections({});
          setRandomizationMap(null);
          setIsTestStarted(false);
          return;
        }

        // Restore latest safely saved answers & persistent randomization map
        if (res.status === 'in_progress') {
          const serverMap = parseRandomizationMap(res.randomizationMap);
          if (serverMap && validateQuizRandomizationMap(quiz.questions, serverMap).valid) {
            writeLocalRandMap(randStorageKey, serverMap);
            setRandomizationMap(serverMap);
          } else if (res.randomizationError || (serverMap && !validateQuizRandomizationMap(quiz.questions, serverMap).valid)) {
            setRandomizationMap(null);
          }

          const serverUpdatedMs = res.updatedAt ? new Date(res.updatedAt).getTime() : 0;
          const validServerMs = Number.isFinite(serverUpdatedMs) ? serverUpdatedMs : 0;
          const localDraft = readLocalDraft(draftStorageKey);
          const hasServerDraft = Boolean(res.draftAnswers && Object.keys(res.draftAnswers).length > 0);
          const hasLocalDraft = Object.keys(localDraft.answers).length > 0;

          if (hasServerDraft && (!hasLocalDraft || validServerMs > localDraft.updatedAt)) {
            const split = splitDraftFields(res.draftAnswers);
            const restoredTs = validServerMs || Date.now();
            skipNextAutoSaveRef.current = true;
            writeLocalDraft(draftStorageKey, split.cleanAnswers, restoredTs, split.optionSelections, split.subOptionSelections);
            answersUpdatedAtRef.current = restoredTs;
            isDraftDirtyRef.current = false;
            latestAnswersRef.current = split.cleanAnswers;
            latestOptionSelectionsRef.current = split.optionSelections;
            latestSubOptionSelectionsRef.current = split.subOptionSelections;
            setAnswers(split.cleanAnswers);
            setOptionSelections(split.optionSelections);
            setSubOptionSelections(split.subOptionSelections);
            setSaveStatus('saved');
          } else if (hasLocalDraft && latestIsTestStartedRef.current && localDraft.updatedAt > validServerMs) {
            // Local unsynced edits are newer than server (e.g. offline edit before refresh) — flush them up!
            isDraftDirtyRef.current = true;
            flushDraftToServer();
          }

          // Synchronize authoritative server timer deadline
          if (hasTimeLimit && res.startedAt) {
            const startMs = new Date(res.startedAt).getTime();
            if (!Number.isNaN(startMs)) {
              const deadlineMs = startMs + initialSeconds * 1000;
              endTimeMsRef.current = deadlineMs;
              try {
                sessionStorage.setItem(startTimeStorageKey, String(startMs));
                localStorage.setItem(startTimeStorageKey, String(startMs));
              } catch {
                // ignore
              }
              const rem = Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000));
              setSecondsRemaining(rem);
            }
          }
        }
      } catch (err) {
        console.error('Error checking quiz attempt status:', err);
      } finally {
        if (!cancelled) setCheckingAttempt(false);
      }
    }, delayMs);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    quiz.id,
    effectiveStudentId,
    currentStudent?.studentId,
    isAdmin,
    draftStorageKey,
    randStorageKey,
    startTimeStorageKey,
    hasTimeLimit,
    initialSeconds,
    clearLocalQuizState,
    flushDraftToServer,
  ]);

  // Handle setting standard answer (supports clearing back to empty)
  const handleSetAnswer = (questionId: string, value: any) => {
    hasUserEditedAnswerRef.current = true;
    const isClearing = value === '' || value === null || value === undefined;
    lastEditKindRef.current = isClearing ? 'selection' : 'text';
    setAnswers((prev) => {
      if (isClearing) {
        const next = { ...prev };
        delete next[questionId];
        return next;
      }
      return {
        ...prev,
        [questionId]: value,
      };
    });
  };

  // Handle MCQ selection while tracking permanent optionId ('opt_0', 'opt_1'...) alongside canonical text
  const handleSelectMcqOption = (questionId: string, optionId: string, canonicalText: string) => {
    hasUserEditedAnswerRef.current = true;
    lastEditKindRef.current = 'selection';
    if (!optionId) {
      setOptionSelections((prev) => {
        const next = { ...prev };
        delete next[questionId];
        return next;
      });
      setAnswers((prev) => {
        const next = { ...prev };
        delete next[questionId];
        return next;
      });
      return;
    }
    setOptionSelections((prev) => ({
      ...prev,
      [questionId]: optionId,
    }));
    setAnswers((prev) => ({
      ...prev,
      [questionId]: canonicalText,
    }));
  };

  // Handle setting sub-question answer
  const handleSetSubAnswer = (questionId: string, subQuestionId: string, value: string) => {
    hasUserEditedAnswerRef.current = true;
    lastEditKindRef.current = 'text';
    setAnswers((prev) => {
      const current = typeof prev[questionId] === 'object' && prev[questionId] !== null ? prev[questionId] : {};
      return {
        ...prev,
        [questionId]: {
          ...current,
          [subQuestionId]: value,
        },
      };
    });
  };

  // Handle Sub-MCQ selection while tracking permanent optionId alongside canonical text
  const handleSelectSubMcqOption = (questionId: string, subQuestionKey: string, optionId: string, canonicalText: string) => {
    hasUserEditedAnswerRef.current = true;
    lastEditKindRef.current = 'selection';
    setSubOptionSelections((prev) => ({
      ...prev,
      [questionId]: {
        ...(prev[questionId] || {}),
        [subQuestionKey]: optionId,
      },
    }));
    setAnswers((prev) => {
      const current = typeof prev[questionId] === 'object' && prev[questionId] !== null ? prev[questionId] : {};
      return {
        ...prev,
        [questionId]: {
          ...current,
          [subQuestionKey]: canonicalText,
        },
      };
    });
  };

  // Handle setting multi-blank answer
  const handleSetBlankItemAnswer = (questionId: string, blankId: string, value: string) => {
    hasUserEditedAnswerRef.current = true;
    lastEditKindRef.current = 'text';
    setAnswers((prev) => {
      const current = typeof prev[questionId] === 'object' && prev[questionId] !== null ? prev[questionId] : {};
      return {
        ...prev,
        [questionId]: {
          ...current,
          [blankId]: value,
        },
      };
    });
  };

  // Handle Match the Following answer change
  const handleMatchPair = (questionId: string, leftItem: string, rightItem: string) => {
    hasUserEditedAnswerRef.current = true;
    lastEditKindRef.current = 'selection';
    setAnswers((prev) => {
      const current = typeof prev[questionId] === 'object' && prev[questionId] !== null ? prev[questionId] : {};
      return {
        ...prev,
        [questionId]: {
          ...current,
          [leftItem]: rightItem,
        },
      };
    });
  };

  // Toggle question flag for review
  const toggleFlagQuestion = (qId: string) => {
    setFlaggedQuestions((prev) => ({
      ...prev,
      [qId]: !prev[qId],
    }));
  };

  // Start Assessment Handler (guarded against double-clicks)
  const handleStartTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isStartingTest) return;

    // Admins can start tests immediately with zero restrictions or ID passwords
    if (isAdmin) {
      setNameError(null);
      setErrorMessage(null);
      setIsStartingTest(true);
      try {
        let adminMap: QuizRandomizationMap | null = null;
        try {
          const adminStart = await startQuizAttempt(quiz.id, {
            studentId: 'admin',
            studentName: studentName.trim() || 'Teacher Admin',
            isAdmin: true,
          });
          adminMap = parseRandomizationMap(adminStart?.randomizationMap);
        } catch {
          // fallback to local CSPRNG map
        }
        if (!adminMap || !validateQuizRandomizationMap(quiz.questions, adminMap).valid) {
          adminMap = buildQuizRandomizationMap(quiz.questions);
        }
        const adminCheck = validateQuizRandomizationMap(quiz.questions, adminMap);
        if (!adminCheck.valid) {
          setErrorMessage('Unable to prepare a valid question sequence. Please verify that every question has a unique ID.');
          return;
        }
        writeLocalRandMap(randStorageKey, adminMap);
        setRandomizationMap(adminMap);
        const nowMs = Date.now();
        if (hasTimeLimit) {
          endTimeMsRef.current = nowMs + initialSeconds * 1000;
          setSecondsRemaining(initialSeconds);
        }
        try {
          sessionStorage.setItem(startedStorageKey, 'true');
          sessionStorage.setItem(startTimeStorageKey, String(nowMs));
        } catch {}
        setActiveQuestionIndex(0);
        setIsTestStarted(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (adminErr: any) {
        setErrorMessage(adminErr?.message || 'Unable to prepare examination sequence safely.');
      } finally {
        setIsStartingTest(false);
      }
      return;
    }

    if (!studentName.trim()) {
      setNameError('Please enter your full name before starting the assessment.');
      return;
    }
    setNameError(null);
    setErrorMessage(null);
    setIsStartingTest(true);

    // Call startQuizAttempt to lock test, enforce no-retest rule, and obtain persistent per-attempt randomizationMap
    try {
      const startRes = await startQuizAttempt(quiz.id, {
        studentId: effectiveStudentId,
        studentName: studentName.trim(),
      });

      if (!startRes.allowed) {
        if (startRes.status === 'submitted') {
          clearLocalQuizState();
          const refreshed = await fetchQuizAttemptStatus(quiz.id, effectiveStudentId).catch(() => null);
          if (refreshed) setAttemptStatus(refreshed);
        }
        setErrorMessage(startRes.error || 'You have already started or submitted this assessment. Retests are restricted.');
        return;
      }

      // Persist & validate authoritative randomization map (never regenerate when resuming)
      const serverProvidedMap = parseRandomizationMap(startRes.randomizationMap);
      const localCachedMap = readLocalRandMap(randStorageKey);
      const resolvedMap = serverProvidedMap || localCachedMap || buildQuizRandomizationMap(quiz.questions);
      const mapCheck = validateQuizRandomizationMap(quiz.questions, resolvedMap);
      if (!mapCheck.valid) {
        setErrorMessage(
          `Examination integrity validation failed (${mapCheck.errors[0] || 'invalid sequence'}). Please refresh or ask your teacher to reset this attempt.`
        );
        return;
      }
      writeLocalRandMap(randStorageKey, resolvedMap);
      setRandomizationMap(resolvedMap);

      // Restore latest saved draft answers when resuming (server vs local timestamp comparison)
      if (startRes.isResume) {
        const serverUpdatedMs = startRes.updatedAt ? new Date(startRes.updatedAt).getTime() : 0;
        const validServerMs = Number.isFinite(serverUpdatedMs) ? serverUpdatedMs : 0;
        const localDraft = readLocalDraft(draftStorageKey);
        const hasServerDraft = Boolean(startRes.draftAnswers && Object.keys(startRes.draftAnswers).length > 0);
        const hasLocalDraft = Object.keys(localDraft.answers).length > 0;

        if (hasServerDraft && (!hasLocalDraft || validServerMs > localDraft.updatedAt)) {
          const split = splitDraftFields(startRes.draftAnswers);
          const restoredTs = validServerMs || Date.now();
          skipNextAutoSaveRef.current = true;
          writeLocalDraft(draftStorageKey, split.cleanAnswers, restoredTs, split.optionSelections, split.subOptionSelections);
          answersUpdatedAtRef.current = restoredTs;
          isDraftDirtyRef.current = false;
          latestAnswersRef.current = split.cleanAnswers;
          latestOptionSelectionsRef.current = split.optionSelections;
          latestSubOptionSelectionsRef.current = split.subOptionSelections;
          setAnswers(split.cleanAnswers);
          setOptionSelections(split.optionSelections);
          setSubOptionSelections(split.subOptionSelections);
        } else if (hasLocalDraft) {
          isDraftDirtyRef.current = true;
        }
      }

      const authoritativeStartMs = startRes.startedAt ? new Date(startRes.startedAt).getTime() : Date.now();
      const validStartMs = Number.isNaN(authoritativeStartMs) ? Date.now() : authoritativeStartMs;

      try {
        sessionStorage.setItem(startedStorageKey, 'true');
        localStorage.setItem(startedStorageKey, 'true');
        sessionStorage.setItem(`quiz_started_${quiz.id}`, 'true');
        sessionStorage.setItem(startTimeStorageKey, String(validStartMs));
        localStorage.setItem(startTimeStorageKey, String(validStartMs));
      } catch {}

      if (hasTimeLimit) {
        if (startRes.isResume) {
          const elapsedSec = Math.floor((Date.now() - validStartMs) / 1000);
          const remaining = Math.max(30, initialSeconds - elapsedSec);
          endTimeMsRef.current = Date.now() + remaining * 1000;
          setSecondsRemaining(remaining);
        } else {
          endTimeMsRef.current = Date.now() + initialSeconds * 1000;
          setSecondsRemaining(initialSeconds);
        }
      }
      setIsTestStarted(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      setErrorMessage(err.message || 'Unable to start assessment. Please check your connection and try again.');
    } finally {
      setIsStartingTest(false);
    }
  };

  // Timer countdown effect - wall-clock deadline synchronized so background tabs never drift
  useEffect(() => {
    if (!isTestStarted || !hasTimeLimit || isSubmitting) return;

    if (endTimeMsRef.current === null) {
      endTimeMsRef.current = Date.now() + secondsRemaining * 1000;
    }

    const syncClock = () => {
      if (endTimeMsRef.current === null) return;
      const rem = Math.max(0, Math.ceil((endTimeMsRef.current - Date.now()) / 1000));
      setSecondsRemaining(rem);
    };

    syncClock();
    const interval = setInterval(syncClock, 1000);
    document.addEventListener('visibilitychange', syncClock);
    window.addEventListener('focus', syncClock);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', syncClock);
      window.removeEventListener('focus', syncClock);
    };
  }, [isTestStarted, hasTimeLimit, isSubmitting]);

  // Handle auto-submission when timer hits 0
  useEffect(() => {
    if (isTestStarted && hasTimeLimit && secondsRemaining === 0 && !autoSubmittedRef.current && !isSubmitting) {
      autoSubmittedRef.current = true;
      setTimeUpNotified(true);
      submitAssessment(true);
    }
  }, [secondsRemaining, isTestStarted, hasTimeLimit, isSubmitting]);

  // Ephemeral randomized quiz view during active examination (never mutates teacher's original quiz)
  const displayQuiz = useMemo(() => {
    if (!isTestStarted || !randomizationMap) return quiz;
    return applyQuizRandomization(quiz, randomizationMap);
  }, [quiz, randomizationMap, isTestStarted]);

  // Mandatory pre-display validation verifying exact 1-to-1 question & option integrity
  const randomizationValidation = useMemo(() => {
    if (!isTestStarted) return { valid: true, errors: [] as string[] };
    if (!randomizationMap) {
      return { valid: false, errors: ['Randomization sequence has not been loaded for this attempt.'] };
    }
    if (attemptStatus.randomizationError) {
      return { valid: false, errors: [attemptStatus.randomizationError] };
    }
    return validateRandomizedQuiz(quiz, randomizationMap, displayQuiz);
  }, [isTestStarted, randomizationMap, attemptStatus.randomizationError, quiz, displayQuiz]);

  // Calculate answered count
  const answeredCount = useMemo(() => {
    return displayQuiz.questions.reduce((count, q) => {
      const val = answers[q.id];
      if (val !== undefined && val !== null && val !== '') {
        if (typeof val === 'object') {
          const hasVal = Object.values(val).some(v => v !== undefined && v !== null && String(v).trim() !== '');
          return hasVal ? count + 1 : count;
        }
        return count + 1;
      }
      return count;
    }, 0);
  }, [displayQuiz.questions, answers]);

  const unansweredCount = displayQuiz.questions.length - answeredCount;

  // Format seconds to mm:ss
  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const isTimeCritical = hasTimeLimit && secondsRemaining <= 60 && secondsRemaining > 0;
  const isTimeWarning = hasTimeLimit && secondsRemaining <= 300 && secondsRemaining > 60;

  // Final Assessment Submission (synchronous lock + idempotent retry-safe + confirmed server state before finalizing)
  const submitAssessment = async (_isAutoSubmit = false) => {
    if (isSubmittingRef.current || isSubmitting) return;
    isSubmittingRef.current = true;

    if (debounceSaveTimerRef.current) {
      clearTimeout(debounceSaveTimerRef.current);
      debounceSaveTimerRef.current = null;
    }

    setShowConfirmModal(false);
    setIsSubmitting(true);
    setSubmissionStage('submitting');
    setErrorMessage(null);

    const targetStudentId = isAdmin
      ? `admin_${Date.now()}`
      : effectiveStudentId;

    let stableAttemptId = '';
    try {
      stableAttemptId = sessionStorage.getItem(attemptIdStorageKey) || localStorage.getItem(attemptIdStorageKey) || '';
      if (!stableAttemptId) {
        stableAttemptId = `att-${quiz.id}-${targetStudentId}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        sessionStorage.setItem(attemptIdStorageKey, stableAttemptId);
        localStorage.setItem(attemptIdStorageKey, stableAttemptId);
      }
    } catch {
      stableAttemptId = `att-${quiz.id}-${targetStudentId}-${Date.now()}`;
    }

    const answerSnapshot = { ...latestAnswersRef.current };
    const optionSelectionsSnapshot = { ...latestOptionSelectionsRef.current };
    const subOptionSelectionsSnapshot = { ...latestSubOptionSelectionsRef.current };

    try {
      const result = await evaluateQuizSubmission(
        {
          quizId: quiz.id,
          studentName: studentName.trim() || (isAdmin ? 'Teacher Admin' : 'Student'),
          studentRoll: (currentStudent?.rollNo || studentRoll.trim() || (isAdmin ? 'ADMIN' : '1')),
          studentId: targetStudentId,
          attemptId: stableAttemptId,
          classId: quiz.classId,
          isAdmin,
          studentAnswers: answerSnapshot,
          studentOptionSelections: optionSelectionsSnapshot,
          studentSubOptionSelections: subOptionSelectionsSnapshot,
        },
        {
          onRetry: () => setSubmissionStage('retrying'),
        }
      );

      // Only mark as submitted and clear local drafts AFTER server confirms save success
      if (result.success && result.evaluation) {
        setSubmissionStage('confirmed');
        clearLocalQuizState();
        skipNextAutoSaveRef.current = true;
        isDraftDirtyRef.current = false;
        latestAnswersRef.current = {};
        latestOptionSelectionsRef.current = {};
        latestSubOptionSelectionsRef.current = {};
        setAnswers({});
        setOptionSelections({});
        setSubOptionSelections({});
        setRandomizationMap(null);

        setTimeout(() => {
          isSubmittingRef.current = false;
          setIsSubmitting(false);
          setSubmissionStage('idle');
          onEvaluationComplete(result.evaluation);
        }, 350);
      } else {
        throw new Error('Submission response was incomplete — please retry safely.');
      }
    } catch (err: any) {
      console.error('Submission error:', err);
      isSubmittingRef.current = false;
      setIsSubmitting(false);
      setSubmissionStage('error');
      setErrorMessage(
        err.message || 'Temporary connection issue while submitting. Your answers are safely saved — click Retry Submission below.'
      );
    }
  };

  // =========================================================================
  // VIEW 1: PRE-TEST LOBBY & INSTRUCTIONS (Timer NOT started yet)
  // =========================================================================
  if (!isTestStarted) {
    const isAlreadySubmitted = !isAdmin && attemptStatus.hasAttempted && attemptStatus.status === 'submitted';
    const isAlreadyInProgress = !isAdmin && attemptStatus.hasAttempted && attemptStatus.status === 'in_progress';

    return (
      <div className="max-w-3xl mx-auto px-2 sm:px-6 py-4 sm:py-10 space-y-4 sm:space-y-6 animate-in fade-in duration-200">
        {/* Back Button */}
        <button
          type="button"
          onClick={onBack}
          className="btn py-2 px-3 text-xs rounded-xl cursor-pointer"
          title="Exit to assessments"
        >
          <ArrowLeft className="w-3.5 h-3.5 mr-1" />
          <span>Exit</span>
        </button>

        {/* IN-PROGRESS RESUME BANNER */}
        {isAlreadyInProgress && !isAlreadySubmitted && (
          <div className="bg-blue-500/10 border border-blue-500/30 p-3.5 sm:p-4 rounded-2xl flex items-start gap-3 shadow-xs">
            <Clock className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
            <div className="space-y-1 min-w-0">
              <h4 className="text-xs font-bold text-[#f2f2f4]">
                Assessment In Progress
              </h4>
              <p className="text-[11px] text-[#f2f2f4]/70 font-sans leading-relaxed break-words">
                You have an active examination in progress. Click <strong className="text-[#4cc9f0]">"Resume Assessment"</strong> below to continue where you left off and submit your answers.
              </p>
            </div>
          </div>
        )}

        {/* ALREADY ATTEMPTED BLOCKING BANNER */}
        {isAlreadySubmitted ? (
          <div className="bg-[#1c1c1f] border border-[rgba(242,242,244,0.1)] p-4 sm:p-8 space-y-5 sm:space-y-6 text-center shadow-xl rounded-2xl sm:rounded-3xl">
            <div className="w-12 h-12 sm:w-14 sm:h-14 bg-[#111113] text-[#ff9f1c] border border-[#ff9f1c]/40 flex items-center justify-center mx-auto rounded-2xl">
              <ShieldAlert className="w-6 h-6 sm:w-7 sm:h-7" />
            </div>

            <div className="space-y-2">
              <h2 className="text-lg sm:text-2xl font-syne font-bold text-[#f2f2f4]">
                Assessment Already Completed
              </h2>
              <p className="text-xs sm:text-sm text-[#f2f2f4]/70 max-w-md mx-auto font-sans break-words">
                Student <strong className="text-[#f2f2f4]">{currentStudent?.name || studentName || studentRoll}</strong> has already submitted this examination. Retests are strictly restricted to preserve exam integrity.
              </p>
            </div>

            {attemptStatus.submission && (
              <div className="p-3 sm:p-4 bg-[#111113] border border-[rgba(242,242,244,0.1)] max-w-sm mx-auto flex items-center justify-around gap-2 font-mono rounded-xl">
                <div className="min-w-0">
                  <span className="text-[10px] text-[#f2f2f4]/40 uppercase tracking-wider block">Total Marks</span>
                  <div className="text-base sm:text-lg font-bold text-[#f2f2f4]">
                    {attemptStatus.submission.totalScore} / {attemptStatus.submission.maxScore}
                  </div>
                </div>
                <div className="h-8 w-px bg-[rgba(242,242,244,0.1)] shrink-0" />
                <div className="min-w-0">
                  <span className="text-[10px] text-[#f2f2f4]/40 uppercase tracking-wider block">Percentage</span>
                  <div className="text-base sm:text-lg font-bold text-[#4cc9f0]">
                    {attemptStatus.submission.maxScore
                      ? Math.round((attemptStatus.submission.totalScore / attemptStatus.submission.maxScore) * 100)
                      : 0}%
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 sm:gap-3 pt-2">
              {attemptStatus.submission?.aiEvaluation && (
                <button
                  type="button"
                  onClick={() => onEvaluationComplete(attemptStatus.submission.aiEvaluation)}
                  className="btn btn-primary w-full sm:w-auto py-2.5 px-5 text-xs justify-center rounded-xl"
                >
                  <Eye className="w-4 h-4 mr-1.5 shrink-0" />
                  <span>View My Scored Answer Paper</span>
                </button>
              )}
              <button
                type="button"
                onClick={onBack}
                className="btn w-full sm:w-auto py-2.5 px-6 text-xs justify-center rounded-xl"
              >
                Exit
              </button>
            </div>
          </div>
        ) : (
          /* PRE-TEST LOBBY CARD */
          <div className="bg-[var(--surface)] border border-[var(--border)] p-3.5 sm:p-6 space-y-4 shadow-md rounded-xl max-w-2xl mx-auto overflow-hidden">
            {/* Header */}
            <div className="space-y-1.5 border-b border-[var(--border)] pb-3.5 min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--accent)] bg-[var(--surface-higher)] px-2 py-0.5 border border-[var(--border)] rounded-md font-bold">
                  {quiz.subject}
                </span>
                <span className="text-[var(--ink-muted)]">•</span>
                <span className="font-mono text-[11px] text-[var(--ink-muted)]">
                  {quiz.questions.length} Questions
                </span>
                <span className="text-[var(--ink-muted)]">•</span>
                <span className="font-mono text-[11px] text-[var(--ink-muted)]">
                  {quiz.totalPoints} Total Marks
                </span>
              </div>
              <h1 className="text-base sm:text-xl font-bold text-[var(--ink)] tracking-tight break-words">
                {quiz.title}
              </h1>
              {quiz.description && (
                <p className="text-xs text-[var(--ink-muted)] leading-relaxed font-sans break-words">
                  {quiz.description}
                </p>
              )}
            </div>

            {/* Assessment Quick Stats */}
            <div className="grid grid-cols-3 gap-1 sm:gap-3 p-2 xs:p-3 sm:p-4 bg-[#111113] border border-[rgba(242,242,244,0.1)] rounded-xl sm:rounded-2xl">
              <div className="text-center space-y-0.5 min-w-0 px-0.5">
                <span className="font-mono text-[9px] xs:text-[9.5px] sm:text-[10px] uppercase tracking-wider text-[#f2f2f4]/40 block truncate">
                  Questions
                </span>
                <div className="font-syne text-xs xs:text-sm sm:text-lg font-bold text-[#f2f2f4] flex items-center justify-center gap-1 sm:gap-1.5">
                  <BookOpen className="w-3 h-3 xs:w-3.5 xs:h-3.5 sm:w-4 sm:h-4 text-[#4cc9f0] shrink-0" />
                  <span>{quiz.questions.length}</span>
                </div>
              </div>

              <div className="text-center space-y-0.5 border-x border-[rgba(242,242,244,0.1)] min-w-0 px-0.5 xs:px-1">
                <span className="font-mono text-[9px] xs:text-[9.5px] sm:text-[10px] uppercase tracking-wider text-[#f2f2f4]/40 block truncate">
                  Total Marks
                </span>
                <div className="font-syne text-xs xs:text-sm sm:text-lg font-bold text-[#f2f2f4] flex items-center justify-center gap-1 sm:gap-1.5">
                  <Award className="w-3 h-3 xs:w-3.5 xs:h-3.5 sm:w-4 sm:h-4 text-[#4cc9f0] shrink-0" />
                  <span>{quiz.totalPoints}</span>
                </div>
              </div>

              <div className="text-center space-y-0.5 min-w-0 px-0.5">
                <span className="font-mono text-[9px] xs:text-[9.5px] sm:text-[10px] uppercase tracking-wider text-[#f2f2f4]/40 block truncate">
                  Time Limit
                </span>
                <div className="font-syne text-xs xs:text-sm sm:text-lg font-bold text-[#f2f2f4] flex items-center justify-center gap-1 sm:gap-1.5 min-w-0">
                  <Clock className="w-3 h-3 xs:w-3.5 xs:h-3.5 sm:w-4 sm:h-4 text-[#ff9f1c] shrink-0" />
                  <span className="truncate">{hasTimeLimit ? `${quiz.timeLimitMinutes}m` : 'Untimed'}</span>
                </div>
              </div>
            </div>

            {/* Error Message */}
            {errorMessage && (
              <div className="p-4 bg-[#111113] border border-[#ff9f1c]/40 flex items-start gap-3 font-mono text-xs text-[#ff9f1c] rounded-xl">
                <AlertCircle className="w-5 h-5 text-[#ff9f1c] shrink-0 mt-0.5" />
                <div>
                  <p>{errorMessage}</p>
                  <p className="text-[11px] text-[#f2f2f4]/50 mt-0.5 font-sans">
                    If you believe this is an error, please ask your teacher to grant a retest permission.
                  </p>
                </div>
              </div>
            )}

            {/* Student Identifier / Account Verification */}
            <form onSubmit={handleStartTest} className="space-y-4">
              {isAdmin ? (
                /* Administrator Preview Banner - No Student ID or Password Needed */
                <div className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-xl sm:rounded-2xl space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-600 dark:text-purple-400 border border-purple-500/30 flex items-center justify-center font-bold shrink-0">
                      <ShieldAlert className="w-5 h-5 text-purple-500" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-sm text-[var(--ink)]">Teacher Administrator Mode</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-600 dark:text-purple-400 border border-purple-500/30">
                          Unlimited Retakes
                        </span>
                      </div>
                      <p className="text-xs text-[var(--ink-muted)] mt-0.5">
                        You can take, test, and retake this examination as many times as you like. No student ID or password required.
                      </p>
                    </div>
                  </div>
                </div>
              ) : currentStudent ? (
                /* Logged in student card */
                <div className="p-3.5 sm:p-4 bg-[#111113] border border-[#4cc9f0]/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl sm:rounded-2xl">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 bg-[#1c1c1f] text-[#4cc9f0] border border-[#4cc9f0]/40 flex items-center justify-center font-bold rounded-xl shrink-0">
                      <User className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-syne font-bold text-[#f2f2f4] text-xs sm:text-sm truncate">{currentStudent.name}</span>
                        <span className="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 bg-[#1c1c1f] text-[#4cc9f0] border border-[#4cc9f0]/30 rounded-md shrink-0">
                          Verified Student
                        </span>
                      </div>
                      <p className="font-mono text-xs text-[#f2f2f4]/60 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span>Roll No: <strong className="text-[#4cc9f0]">{currentStudent.rollNo || '-'}</strong></span>
                        <span aria-hidden="true">•</span>
                        <span className="truncate">Student ID: <strong className="text-[#f2f2f4]">{currentStudent.studentId}</strong></span>
                      </p>
                    </div>
                  </div>

                  {onOpenAuth && (
                    <button
                      type="button"
                      onClick={onOpenAuth}
                      className="font-mono text-[11px] text-[#4cc9f0] hover:underline cursor-pointer self-start sm:self-center shrink-0"
                    >
                      Switch Account
                    </button>
                  )}
                </div>
              ) : (
                /* Guest Student input form */
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="font-mono text-[10px] uppercase tracking-wider text-[#f2f2f4]/70 block">
                      Student Full Name <span className="text-[#ff9f1c]">*</span>
                    </label>
                    {onOpenAuth && (
                      <button
                        type="button"
                        onClick={onOpenAuth}
                        className="font-mono text-[11px] text-[#4cc9f0] hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <LogIn className="w-3.5 h-3.5 shrink-0" />
                        <span>Have an ID/Password? Sign In</span>
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <div className="relative">
                        <User className="w-4 h-4 text-[#f2f2f4]/30 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="text"
                          required
                          value={studentName}
                          onChange={(e) => {
                            setStudentName(e.target.value);
                            if (nameError) setNameError(null);
                          }}
                          placeholder="Your Full Name"
                          className="w-full input-with-left-icon !pl-11 pr-3.5 py-2.5 bg-[#111113] border border-[rgba(242,242,244,0.1)] focus:border-[#4cc9f0] font-sans text-xs sm:text-sm text-[#f2f2f4] placeholder-[#f2f2f4]/30 outline-none transition rounded-xl"
                        />
                      </div>
                      {nameError && <p className="font-mono text-[11px] text-rose-400 mt-1">{nameError}</p>}
                    </div>

                    <div>
                      <div className="relative">
                        <Hash className="w-4 h-4 text-[#f2f2f4]/30 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="text"
                          value={studentRoll}
                          onChange={(e) => setStudentRoll(e.target.value)}
                          placeholder="Roll Number (e.g. 1A, 2B, 15)"
                          className="w-full input-with-left-icon !pl-11 pr-3.5 py-2.5 bg-[#111113] border border-[rgba(242,242,244,0.1)] focus:border-[#4cc9f0] font-mono text-xs sm:text-sm text-[#f2f2f4] placeholder-[#f2f2f4]/30 outline-none transition rounded-xl"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* No-Retest / Timer Rules Warning */}
              <div className="p-4 bg-[#111113] border border-[#ff9f1c]/30 space-y-1.5 rounded-xl sm:rounded-2xl">
                <div className="font-mono text-xs font-bold flex items-center gap-1.5 text-[#ff9f1c] uppercase tracking-wider">
                  <Clock className="w-4 h-4 text-[#ff9f1c] shrink-0" />
                  <span>Important Examination Rules:</span>
                </div>
                <ul className="text-xs text-[#f2f2f4]/70 space-y-1 list-disc list-inside leading-relaxed font-sans">
                  <li>
                    Once you click <strong className="text-[#f2f2f4]">"Start Assessment"</strong>, the timer starts and your attempt is locked.
                  </li>
                  <li>
                    <strong className="text-[#f2f2f4]">Single Attempt Policy:</strong> Retests cannot be taken once started. Ensure you have a stable connection.
                  </li>
                  {hasTimeLimit && (
                    <li>
                      Your assessment will automatically submit when the {quiz.timeLimitMinutes}-minute countdown concludes.
                    </li>
                  )}
                </ul>
              </div>

              {/* Start Button */}
              <div className="pt-2 space-y-2.5">
                <button
                  type="submit"
                  disabled={isStartingTest || (!isAdmin && checkingAttempt)}
                  className="btn btn-primary w-full min-h-[44px] h-auto py-2.5 px-3 text-xs sm:text-sm justify-center text-center whitespace-normal leading-snug rounded-xl disabled:opacity-50 cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-current mr-1 shrink-0" />
                  <span>
                    {isStartingTest
                      ? 'Preparing Examination...'
                      : isAlreadyInProgress
                      ? 'Resume Assessment & Continue Test'
                      : isAdmin
                      ? 'Start Test as Admin (Unlimited Retakes)'
                      : 'Start Assessment & Begin Timer'}
                  </span>
                </button>

                {isAdmin && (
                  <a
                    href={getAuthenticatedPrintUrl(`/api/print/quiz/${quiz.id}`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn w-full min-h-[40px] h-auto py-2.5 px-3 text-xs justify-center text-center whitespace-normal leading-snug rounded-xl cursor-pointer flex items-center"
                    title="Print Question Paper (Questions Only)"
                  >
                    <Printer className="w-3.5 h-3.5 mr-1 text-[#4cc9f0] shrink-0" />
                    <span>Print Question Paper (Questions Only)</span>
                  </a>
                )}
              </div>
            </form>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // VIEW 2: ACTIVE ASSESSMENT SCREEN (User-Friendly UI with Question Navigator)
  // =========================================================================
  if (checkingAttempt && !randomizationMap) {
    return (
      <div className="max-w-2xl mx-auto px-3 sm:px-6 py-10 animate-in fade-in duration-200">
        <div className="bg-[#1c1c1f] border border-[rgba(242,242,244,0.1)] p-6 sm:p-8 rounded-2xl text-center space-y-4 shadow-xl">
          <RefreshCw className="w-8 h-8 animate-spin text-[#4cc9f0] mx-auto" />
          <div className="space-y-1">
            <h3 className="font-syne font-bold text-base text-[#f2f2f4]">
              Restoring Your Examination Sequence...
            </h3>
            <p className="font-mono text-xs text-[#f2f2f4]/55">
              Verifying question integrity and saved responses before opening the paper.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!randomizationValidation.valid) {
    return (
      <div className="max-w-2xl mx-auto px-3 sm:px-6 py-10 animate-in fade-in duration-200">
        <div className="bg-[#1c1c1f] border border-[#ff9f1c]/40 p-5 sm:p-8 rounded-2xl space-y-5 shadow-xl text-[#f2f2f4]">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-[#111113] text-[#ff9f1c] border border-[#ff9f1c]/40 flex items-center justify-center shrink-0 rounded-xl">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="space-y-1 min-w-0">
              <h3 className="font-syne font-bold text-base text-[#f2f2f4]">
                Examination Integrity Check Failed
              </h3>
              <p className="text-xs text-[#f2f2f4]/70 font-sans leading-relaxed">
                To prevent duplicate, missing, or mismatched questions, this examination paper was safely blocked before display. Please re-verify your session or ask your teacher to review or reset this attempt.
              </p>
            </div>
          </div>

          <div className="p-3.5 bg-[#111113] border border-[rgba(242,242,244,0.1)] rounded-xl font-mono text-[11px] text-[#ff9f1c] space-y-1">
            {randomizationValidation.errors.slice(0, 3).map((err, idx) => (
              <div key={idx}>• {err}</div>
            ))}
          </div>

          <div className="flex flex-col-reverse xs:flex-row gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => {
                if (isAdmin) clearLocalQuizState();
                setIsTestStarted(false);
                onBack();
              }}
              className="btn flex-1 py-2.5 text-xs justify-center rounded-xl cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5 mr-1" />
              <span>Exit to Tests</span>
            </button>
            <button
              type="button"
              onClick={async () => {
                try {
                  sessionStorage.removeItem(randStorageKey);
                  localStorage.removeItem(randStorageKey);
                } catch {}
                if (isAdmin) {
                  setIsTestStarted(false);
                  setRandomizationMap(null);
                  return;
                }
                setCheckingAttempt(true);
                try {
                  const res = await fetchQuizAttemptStatus(quiz.id, effectiveStudentId);
                  setAttemptStatus(res);
                  const serverMap = parseRandomizationMap(res.randomizationMap);
                  if (serverMap && validateQuizRandomizationMap(quiz.questions, serverMap).valid) {
                    writeLocalRandMap(randStorageKey, serverMap);
                    setRandomizationMap(serverMap);
                  } else {
                    setRandomizationMap(null);
                  }
                } catch {
                  // stay safely in error view
                } finally {
                  setCheckingAttempt(false);
                }
              }}
              className="btn btn-primary flex-1 py-2.5 text-xs justify-center rounded-xl cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1" />
              <span>Re-verify Examination</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const safeQuestionIndex = Math.min(
    Math.max(0, activeQuestionIndex),
    Math.max(0, displayQuiz.questions.length - 1)
  );
  const currentQuestion = displayQuiz.questions[safeQuestionIndex] || displayQuiz.questions[0];
  const isLastQuestion = safeQuestionIndex === displayQuiz.questions.length - 1;
  const isFlagged = Boolean(flaggedQuestions[currentQuestion?.id]);
  const totalQuestionsCount = displayQuiz.questions.length;
  const progressPercentage = totalQuestionsCount > 0 ? Math.round((answeredCount / totalQuestionsCount) * 100) : 0;

  return (
    <div className="max-w-5xl xl:max-w-6xl 2xl:max-w-7xl mx-auto px-1.5 xs:px-3 sm:px-6 lg:px-8 py-2 sm:py-6 space-y-3.5 sm:space-y-6 animate-in fade-in duration-200">
      {/* Sticky Countdown & Progress Header */}
      <div className="sticky top-2 sm:top-3 z-30 bg-[#111113]/95 backdrop-blur-md px-3 sm:px-5 py-2.5 sm:py-3.5 text-[#f2f2f4] border border-[rgba(242,242,244,0.12)] flex flex-col gap-2.5 shadow-2xl rounded-xl sm:rounded-2xl">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2 md:gap-3">
          {/* Student & Quiz info */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <div className="w-8 h-8 sm:w-9 sm:h-9 bg-[#1c1c1f] border border-[#4cc9f0]/40 text-[#4cc9f0] font-mono tabular-nums flex items-center justify-center font-bold text-xs rounded-xl shrink-0">
              Q{safeQuestionIndex + 1}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-syne font-bold text-[#f2f2f4] flex items-center gap-1.5 sm:gap-2 min-w-0">
                <span className="truncate flex-1 min-w-0">{quiz.title}</span>
                <span className="hidden xs:inline-block font-mono text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 bg-[#1c1c1f] text-[#4cc9f0] border border-[#4cc9f0]/30 rounded-md shrink-0 truncate max-w-[100px] sm:max-w-[160px]">
                  {studentName}
                </span>
              </div>
              <div className="font-mono tabular-nums text-[9.5px] sm:text-[10px] text-[#f2f2f4]/50 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span>Step {safeQuestionIndex + 1} of {totalQuestionsCount}</span>
                {!isAdmin && (
                  <span
                    className={`inline-flex items-center gap-1 font-mono text-[9.5px] ${
                      saveStatus === 'saving'
                        ? 'text-[#4cc9f0]'
                        : saveStatus === 'offline' || saveStatus === 'error'
                        ? 'text-[#ff9f1c]'
                        : 'text-emerald-400/90'
                    }`}
                  >
                    <span aria-hidden="true">·</span>
                    <span>
                      {saveStatus === 'saving'
                        ? 'Saving...'
                        : saveStatus === 'offline'
                        ? 'Offline (saved locally)'
                        : saveStatus === 'error'
                        ? 'Saved locally'
                        : 'All answers saved'}
                    </span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Timer & Exit / Submit buttons */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2.5 w-full md:w-auto justify-between md:justify-end shrink-0 pt-2 md:pt-0 border-t border-[rgba(242,242,244,0.08)] md:border-t-0">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => setShowExitConfirmModal(true)}
              className="btn min-h-[36px] py-1.5 px-2.5 sm:px-3 text-xs rounded-xl cursor-pointer disabled:opacity-50"
              title="Exit assessment and return to test list"
            >
              <ArrowLeft className="w-3.5 h-3.5 mr-1 shrink-0" />
              <span>Exit</span>
            </button>

            {hasTimeLimit && (
              <div
                className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 min-h-[36px] font-mono tabular-nums font-bold text-xs sm:text-sm border shrink-0 rounded-xl ${
                  isTimeCritical
                    ? 'bg-rose-950/60 text-rose-400 border-rose-800 animate-pulse'
                    : isTimeWarning
                    ? 'bg-amber-950/60 text-[#ff9f1c] border-[#ff9f1c]/50'
                    : 'bg-[#1c1c1f] text-[#4cc9f0] border-[#4cc9f0]/30'
                }`}
              >
                <Timer className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                <span>{formatTime(secondsRemaining)}</span>
              </div>
            )}

            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => setShowConfirmModal(true)}
              className="btn btn-primary min-h-[36px] py-1.5 px-3 sm:px-4 text-xs shrink-0 rounded-xl cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              <Send className="w-3.5 h-3.5 mr-1 shrink-0" />
              <span className="hidden xs:inline">Finish &amp; </span>
              <span>{isSubmitting ? 'Submitting...' : 'Submit'}</span>
            </button>
          </div>
        </div>

        {/* Visual Progress Bar & Question Steps Indicator */}
        <div className="pt-2 border-t border-[rgba(242,242,244,0.08)] space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 font-mono tabular-nums text-[10px] sm:text-[11px]">
            <div className="flex items-center gap-2">
              <span className={unansweredCount === 0 && totalQuestionsCount > 0 ? 'text-emerald-400 font-semibold' : 'text-[#4cc9f0] font-semibold'}>
                {answeredCount} Answered
              </span>
              <span className="text-[#f2f2f4]/30" aria-hidden="true">·</span>
              <span className={unansweredCount > 0 ? 'text-[#f2f2f4]/70' : 'text-emerald-400/90 font-medium'}>
                {unansweredCount} Remaining
              </span>
            </div>
            <span className="text-[#f2f2f4]/75 font-semibold">
              {answeredCount}/{totalQuestionsCount} ({progressPercentage}%)
            </span>
          </div>

          <div
            role="progressbar"
            aria-label="Assessment question progress"
            aria-valuemin={0}
            aria-valuemax={totalQuestionsCount}
            aria-valuenow={answeredCount}
            className="w-full h-1.5 bg-[#1c1c1f] rounded-full overflow-hidden border border-[rgba(242,242,244,0.06)]"
          >
            <div
              className={`h-full rounded-full transition-all duration-300 ease-out ${
                unansweredCount === 0 && totalQuestionsCount > 0 ? 'bg-emerald-400' : 'bg-[#4cc9f0]'
              }`}
              style={{ width: `${progressPercentage}%` }}
            />
          </div>

          {totalQuestionsCount > 1 && totalQuestionsCount <= 30 && (
            <div
              aria-label="Question step indicators"
              className="flex items-center gap-1 pt-0.5"
            >
              {displayQuiz.questions.map((q, idx) => {
                const qVal = answers[q.id];
                const stepAnswered =
                  qVal !== undefined &&
                  qVal !== null &&
                  qVal !== '' &&
                  (typeof qVal !== 'object' ||
                    Object.values(qVal).some((v) => v !== undefined && v !== null && String(v).trim() !== ''));
                const stepFlagged = Boolean(flaggedQuestions[q.id]);
                const stepCurrent = idx === safeQuestionIndex;

                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => {
                      if (isDraftDirtyRef.current) flushDraftToServer();
                      setActiveQuestionIndex(idx);
                    }}
                    title={`Question ${idx + 1}: ${stepFlagged ? 'Flagged' : stepAnswered ? 'Answered' : 'Remaining'}`}
                    aria-label={`Jump to Question ${idx + 1} (${stepFlagged ? 'Flagged' : stepAnswered ? 'Answered' : 'Remaining'})`}
                    className={`h-1.5 flex-1 rounded-full transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#4cc9f0] ${
                      stepFlagged
                        ? 'bg-[#ff9f1c]'
                        : stepAnswered
                        ? 'bg-[#4cc9f0]'
                        : 'bg-[#27272c] hover:bg-[#3a3a42]'
                    } ${stepCurrent ? 'ring-1 ring-[#f2f2f4] ring-offset-1 ring-offset-[#111113]' : ''}`}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Submission Recovery Banner in Active Exam View (if network hiccups during Submit/Time-Up) */}
      {errorMessage && (
        <div className="p-4 bg-rose-950/80 border border-rose-500/50 text-rose-100 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5 text-xs">
              <p className="font-bold text-white">Submission Needs Retry (Your Answers Are Saved)</p>
              <p className="text-rose-200/80 font-mono text-[11px]">{errorMessage}</p>
            </div>
          </div>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => submitAssessment(timeUpNotified)}
            className="btn btn-primary py-2 px-4 text-xs font-bold rounded-xl shrink-0 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${isSubmitting ? 'animate-spin' : ''}`} />
            <span>Retry Submission Now</span>
          </button>
        </div>
      )}

      {/* Main Test Grid: Left Question Sheet + Right Question Palette */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 items-start">
        {/* Left Column: Active Question Workspace */}
        <div className="lg:col-span-8 space-y-3.5 min-w-0">
          <div
            key={currentQuestion.id}
            className="bg-[var(--surface)] border border-[var(--border)] p-3 xs:p-4 sm:p-5 space-y-4 rounded-xl shadow-md overflow-hidden min-w-0"
          >
            {/* Question Top Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[var(--border)]">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--accent)] bg-[var(--surface-higher)] px-2 py-0.5 border border-[var(--border)] rounded-md font-bold">
                  Question {safeQuestionIndex + 1} of {displayQuiz.questions.length}
                </span>
                <span className="font-mono text-[10px] text-[var(--ink-muted)] bg-[var(--surface-higher)] px-2 py-0.5 border border-[var(--border)] rounded-md">
                  {currentQuestion.points || 1} {(currentQuestion.points || 1) === 1 ? 'Mark' : 'Marks'}
                </span>
              </div>

              {/* Bookmark / Flag toggle */}
              <button
                type="button"
                onClick={() => toggleFlagQuestion(currentQuestion.id)}
                className={`flex items-center gap-1 px-2.5 py-1 min-h-[30px] text-xs font-mono uppercase tracking-wider transition cursor-pointer border rounded-md ${
                  isFlagged
                    ? 'bg-amber-500/10 text-amber-500 border-amber-500/40 font-bold'
                    : 'bg-[var(--surface-higher)] text-[var(--ink-muted)] border-[var(--border)] hover:text-[var(--ink)]'
                }`}
              >
                {isFlagged ? (
                  <>
                    <BookmarkCheck className="w-3.5 h-3.5 text-amber-500" />
                    <span>Flagged</span>
                  </>
                ) : (
                  <>
                    <Bookmark className="w-3.5 h-3.5 text-[var(--ink-muted)]" />
                    <span>Flag</span>
                  </>
                )}
              </button>
            </div>

            {/* Question Prompt */}
            <div className="space-y-2.5 min-w-0">
              <h3 className="text-sm sm:text-base font-medium text-[var(--ink)] leading-relaxed break-words">
                {cleanQuestionPrompt(currentQuestion.questionText || (currentQuestion as any).question)}
              </h3>

              {/* Image Preview if provided */}
              {currentQuestion.imageUrl && (
                <div className="border border-[var(--border)] bg-[var(--surface-higher)] max-h-72 flex flex-col items-center justify-center p-2 space-y-1 rounded-lg overflow-hidden">
                  <img
                    key={currentQuestion.id}
                    src={currentQuestion.imageUrl}
                    alt={`Question ${safeQuestionIndex + 1} reference figure`}
                    loading="eager"
                    decoding="async"
                    className="max-h-60 object-contain border border-[var(--border)] bg-[var(--surface)] rounded-md"
                  />
                  <span className="font-mono text-[10px] text-[var(--ink-muted)] uppercase tracking-wider">
                    Figure: Reference Diagram
                  </span>
                </div>
              )}
            </div>

            {/* Answer Input Render based on question type */}
            <div className="pt-2">
              {renderQuestionInput(
                currentQuestion,
                answers[currentQuestion.id],
                (val) => handleSetAnswer(currentQuestion.id, val),
                (blankId, val) => handleSetBlankItemAnswer(currentQuestion.id, blankId, val),
                (left, right) => handleMatchPair(currentQuestion.id, left, right),
                (subId, val) => handleSetSubAnswer(currentQuestion.id, subId, val),
                optionSelections[currentQuestion.id],
                (optionId, text) => handleSelectMcqOption(currentQuestion.id, optionId, text),
                subOptionSelections[currentQuestion.id],
                (subKey, optionId, text) => handleSelectSubMcqOption(currentQuestion.id, subKey, optionId, text)
              )}
            </div>

            {/* Navigation Buttons: Previous / Next / Submit */}
            <div className="flex items-center justify-between gap-2 sm:gap-3 pt-4 sm:pt-6 border-t border-[rgba(242,242,244,0.1)]">
              <button
                type="button"
                disabled={safeQuestionIndex === 0}
                onClick={() => {
                  if (isDraftDirtyRef.current) flushDraftToServer();
                  setActiveQuestionIndex((prev) => Math.max(0, prev - 1));
                  window.scrollTo({ top: 100, behavior: 'smooth' });
                }}
                className="btn flex-1 xs:flex-none justify-center min-h-[44px] py-2.5 px-3 sm:px-4 text-xs font-semibold rounded-xl disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4 mr-1 shrink-0" />
                <span>Previous</span>
              </button>

              {isLastQuestion ? (
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => {
                    if (isDraftDirtyRef.current) flushDraftToServer();
                    setShowConfirmModal(true);
                  }}
                  className="btn btn-primary flex-1 xs:flex-none justify-center min-h-[44px] py-2.5 px-3.5 sm:px-5 text-xs font-bold rounded-xl cursor-pointer disabled:opacity-50"
                >
                  <span>Review &amp; Submit</span>
                  <Send className="w-4 h-4 ml-1.5 shrink-0" />
                </button>
              ) : (
                <button
                  type="button"
                    onClick={() => {
                    if (isDraftDirtyRef.current) flushDraftToServer();
                    setActiveQuestionIndex((prev) => Math.min(displayQuiz.questions.length - 1, prev + 1));
                    window.scrollTo({ top: 100, behavior: 'smooth' });
                  }}
                  className="btn btn-primary flex-1 xs:flex-none justify-center min-h-[44px] py-2.5 px-3.5 sm:px-5 text-xs font-bold rounded-xl cursor-pointer"
                >
                  <span>Next Question</span>
                  <ChevronRight className="w-4 h-4 ml-1.5 shrink-0" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Question Palette Navigator */}
        <div className="lg:col-span-4 space-y-4 min-w-0">
          <div className="bg-[#1c1c1f] border border-[rgba(242,242,244,0.1)] p-3.5 sm:p-5 space-y-3.5 sm:space-y-4 rounded-xl sm:rounded-3xl shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-[rgba(242,242,244,0.1)]">
              <h4 className="font-syne font-bold text-xs text-[#f2f2f4] flex items-center gap-1.5">
                <Grid className="w-4 h-4 text-[#4cc9f0] shrink-0" />
                <span>Question Palette</span>
              </h4>
              <span className="font-mono text-[10px] text-[#f2f2f4]/40 uppercase tracking-wider">
                {displayQuiz.questions.length} Items
              </span>
            </div>

            {/* Palette Grid */}
            <div className="grid grid-cols-5 xs:grid-cols-6 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-5 xl:grid-cols-6 gap-2">
              {displayQuiz.questions.map((q, idx) => {
                const isAnswered =
                  answers[q.id] !== undefined &&
                  answers[q.id] !== null &&
                  answers[q.id] !== '' &&
                  (typeof answers[q.id] !== 'object' || Object.values(answers[q.id]).some((v) => v !== undefined && v !== null && String(v).trim() !== ''));
                const isCurrent = idx === safeQuestionIndex;
                const flagged = Boolean(flaggedQuestions[q.id]);

                let cellStyle = 'bg-[#111113] text-[#f2f2f4]/50 border-[rgba(242,242,244,0.1)] hover:border-[#f2f2f4]/30 rounded-lg';
                if (flagged) {
                  cellStyle = 'bg-[#111113] text-[#ff9f1c] border-[#ff9f1c]/50 font-bold rounded-lg';
                } else if (isAnswered) {
                  cellStyle = 'bg-[#111113] text-[#4cc9f0] border-[#4cc9f0]/50 font-bold rounded-lg';
                }

                if (isCurrent) {
                  cellStyle += ' ring-2 ring-[#4cc9f0] border-[#4cc9f0]';
                }

                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => {
                      if (isDraftDirtyRef.current) flushDraftToServer();
                      setActiveQuestionIndex(idx);
                    }}
                    className={`h-9 sm:h-10 font-mono text-xs border flex items-center justify-center transition cursor-pointer relative ${cellStyle}`}
                  >
                    <span>{idx + 1}</span>
                    {flagged && (
                      <span className="w-1.5 h-1.5 bg-[#ff9f1c] absolute top-1 right-1 rounded-full" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="pt-3 border-t border-[rgba(242,242,244,0.1)] flex flex-wrap items-center gap-x-4 gap-y-2 lg:flex-col lg:items-start font-mono text-[10px] uppercase tracking-wider text-[#f2f2f4]/50">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 bg-[#111113] border border-[#4cc9f0]/60 inline-block rounded-xs shrink-0" />
                <span className="text-[#4cc9f0]">Answered ({answeredCount})</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 bg-[#111113] border border-[#ff9f1c]/60 inline-block rounded-xs shrink-0" />
                <span className="text-[#ff9f1c]">Flagged ({Object.values(flaggedQuestions).filter(Boolean).length})</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 bg-[#111113] border border-[rgba(242,242,244,0.1)] inline-block rounded-xs shrink-0" />
                <span>Unanswered ({unansweredCount})</span>
              </div>
            </div>

            {/* Quick Submit button */}
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => setShowConfirmModal(true)}
              className="btn btn-primary w-full py-2.5 text-xs justify-center mt-2 rounded-xl disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5 mr-1 shrink-0" />
              <span>{isSubmitting ? 'Submitting...' : 'Submit Entire Assessment'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* CONFIRMATION MODAL BEFORE FINAL SUBMIT */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#111113]/80 backdrop-blur-md animate-in fade-in">
          <div className="bg-[#1c1c1f] border border-[rgba(242,242,244,0.1)] max-w-md w-full max-h-[90vh] overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-5 shadow-2xl animate-in zoom-in-95 text-[#f2f2f4] rounded-2xl sm:rounded-3xl">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-[#111113] text-[#4cc9f0] border border-[#4cc9f0]/40 flex items-center justify-center shrink-0 rounded-xl">
                <HelpCircle className="w-5 h-5" />
              </div>
              <div className="space-y-1 min-w-0">
                <h3 className="font-syne font-bold text-base text-[#f2f2f4]">Submit Assessment Paper?</h3>
                <p className="font-mono text-[11px] text-[#f2f2f4]/50">
                  Please review your answering progress before finalizing.
                </p>
              </div>
            </div>

            <div className="p-4 bg-[#111113] border border-[rgba(242,242,244,0.1)] space-y-2 font-mono text-xs rounded-xl">
              <div className="flex justify-between">
                <span className="text-[#f2f2f4]/60">Answered Questions:</span>
                <span className="text-[#4cc9f0] font-bold">{answeredCount} of {displayQuiz.questions.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#f2f2f4]/60">Unanswered Questions:</span>
                <span className={unansweredCount > 0 ? 'text-[#ff9f1c] font-bold' : 'text-[#f2f2f4]/40'}>
                  {unansweredCount}
                </span>
              </div>
            </div>

            {unansweredCount > 0 && (
              <p className="font-mono text-xs text-[#ff9f1c] bg-[#111113] p-3 border border-[#ff9f1c]/30 rounded-xl">
                ⚠️ You have <strong>{unansweredCount} unanswered questions</strong>. You can still return to complete them before submitting.
              </p>
            )}

            <div className="flex flex-col-reverse xs:flex-row gap-2.5 sm:gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="btn flex-1 py-2.5 text-xs justify-center rounded-xl cursor-pointer"
              >
                Continue Answering
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => submitAssessment(false)}
                className="btn btn-primary flex-1 py-2.5 text-xs justify-center rounded-xl disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? <span>Grading...</span> : <span>Confirm & Submit</span>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION MODAL BEFORE EXITING TEST */}
      {showExitConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#111113]/85 backdrop-blur-md animate-in fade-in">
          <div className="bg-[#1c1c1f] border border-[rgba(242,242,244,0.12)] max-w-md w-full max-h-[90vh] overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-5 shadow-2xl animate-in zoom-in-95 text-[#f2f2f4] rounded-2xl sm:rounded-3xl">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-rose-500/10 text-rose-400 border border-rose-500/30 flex items-center justify-center shrink-0 rounded-xl">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1 min-w-0">
                <h3 className="font-syne font-bold text-base text-[#f2f2f4]">Exit This Assessment?</h3>
                <p className="text-xs text-[#f2f2f4]/60 leading-relaxed font-sans">
                  If you exit now, your test responses will not be evaluated and you will return to the Tests dashboard.
                </p>
              </div>
            </div>

            <div className="p-4 bg-[#111113] border border-[rgba(242,242,244,0.1)] space-y-1.5 font-mono text-xs rounded-xl">
              <div className="text-[11px] text-[#f2f2f4]/50">
                You will stay logged in as <strong className="text-[#4cc9f0]">{currentStudent?.name || studentName || 'Student'}</strong>.
              </div>
              <div className="text-[11px] text-[#f2f2f4]/40 font-sans">
                You can return to the test dashboard at any time.
              </div>
            </div>

            <div className="flex flex-col-reverse xs:flex-row gap-2.5 sm:gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowExitConfirmModal(false)}
                className="btn flex-1 py-2.5 text-xs justify-center rounded-xl cursor-pointer"
              >
                Stay & Continue
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowExitConfirmModal(false);
                  if (isAdmin) clearLocalQuizState();
                  onBack();
                }}
                className="btn py-2.5 px-4 text-xs justify-center rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/40 cursor-pointer"
              >
                Exit Test
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUBMISSION STATUS OVERLAY */}
      {isSubmitting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#111113]/90 backdrop-blur-md text-[#f2f2f4]">
          <div className="bg-[#1c1c1f] border border-[rgba(242,242,244,0.1)] p-5 sm:p-8 max-w-sm w-full text-center space-y-4 shadow-2xl rounded-2xl sm:rounded-3xl">
            {submissionStage === 'confirmed' ? (
              <CheckCircle2 className="w-11 h-11 text-emerald-400 mx-auto animate-in zoom-in-95" />
            ) : submissionStage === 'retrying' ? (
              <RefreshCw className="w-10 h-10 animate-spin text-[#ff9f1c] mx-auto" />
            ) : (
              <RefreshCw className="w-10 h-10 animate-spin text-[#4cc9f0] mx-auto" />
            )}
            <div className="space-y-1.5">
              <h3 className="font-syne font-bold text-base text-[#f2f2f4]">
                {submissionStage === 'confirmed'
                  ? 'Submission Confirmed & Saved!'
                  : submissionStage === 'retrying'
                  ? 'Connection Interrupted — Retrying...'
                  : 'Submitting & Saving Answers...'}
              </h3>
              <p className="font-mono text-xs text-[#f2f2f4]/55 leading-relaxed">
                {submissionStage === 'confirmed'
                  ? 'Your assessment has been verified and saved on the server. Opening your score report...'
                  : submissionStage === 'retrying'
                  ? 'Your answers remain safely protected. Reconnecting automatically to complete submission...'
                  : 'Recording your answers securely on the server and calculating your score report...'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Helper: Render input controls for different question types
function renderQuestionInput(
  q: QuestionItem,
  currentVal: any,
  onChange: (val: any) => void,
  onBlankChange: (blankId: string, val: string) => void,
  onMatchChange: (left: string, right: string) => void,
  onSubChange?: (subId: string, val: string) => void,
  selectedOptionId?: string,
  onMcqSelect?: (optionId: string, canonicalText: string) => void,
  selectedSubOptionMap?: Record<string, string>,
  onSubMcqSelect?: (subKey: string, optionId: string, canonicalText: string) => void
) {
  // If the question has structured sub-questions (e.g. for picture questions or multi-part diagram tasks)
  const effectiveSubQuestions = (Array.isArray(q.subQuestions) && q.subQuestions.length > 0)
    ? q.subQuestions
    : (Array.isArray((q as any).sub_questions) && (q as any).sub_questions.length > 0)
    ? (q as any).sub_questions
    : null;

  if (effectiveSubQuestions && effectiveSubQuestions.length > 0) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <div className="font-mono text-xs text-[#4cc9f0] font-bold uppercase tracking-wider flex items-center gap-1.5">
            <span>Sub-Questions / Multi-Part Tasks ({effectiveSubQuestions.length})</span>
          </div>
          <span className="font-mono text-[10px] text-[#f2f2f4]/50">
            Total {effectiveSubQuestions.reduce((sum: number, s: any) => sum + (Number(s.points) || 1), 0)} Marks
          </span>
        </div>

        <div className="space-y-3.5">
          {effectiveSubQuestions.map((sq: any, sqIdx: number) => {
            const sqKey = sq.id || `sq_${sqIdx}`;
            const subVal =
              typeof currentVal === 'object' && currentVal !== null
                ? currentVal[sqKey] ?? currentVal[sq.label || ''] ?? currentVal[String(sqIdx)] ?? ''
                : sqIdx === 0 && typeof currentVal === 'string'
                ? currentVal
                : '';
            const isSubMcq = sq.type === 'mcq';
            const sqPts = Number(sq.points) || 1;
            const subOpts = (Array.isArray(sq.randomizedOptions) && sq.randomizedOptions.length > 0)
              ? sq.randomizedOptions
              : (sq.options || ['Option A', 'Option B', 'Option C', 'Option D']).map((opt: any, idx: number) => ({
                  optionId: `opt_${idx}`,
                  origIndex: idx,
                  text: typeof opt === 'string' ? opt : String(opt ?? ''),
                }));
            const subSelOptId = selectedSubOptionMap?.[sqKey] || (sq.id ? selectedSubOptionMap?.[sq.id] : undefined);

            return (
              <div
                key={sqKey}
                className="bg-[#161619] border border-[rgba(242,242,244,0.12)] p-3.5 sm:p-4 rounded-2xl space-y-3 shadow-sm hover:border-[rgba(242,242,244,0.2)] transition"
              >
                {/* Sub-Question Header */}
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    <span className="px-2 py-0.5 rounded-lg bg-[#4cc9f0]/15 text-[#4cc9f0] border border-[#4cc9f0]/30 font-mono font-bold text-xs shrink-0 mt-0.5">
                      {sq.label || `(${String.fromCharCode(97 + sqIdx)})`}
                    </span>
                    <p className="font-sans font-medium text-xs sm:text-sm text-[#f2f2f4] leading-relaxed break-words flex-1 min-w-0">
                      {sq.questionText}
                    </p>
                  </div>
                  <span className="font-mono text-[11px] font-semibold text-[#f2f2f4]/50 shrink-0 bg-[#1c1c1f] px-2 py-0.5 rounded-md border border-[rgba(242,242,244,0.1)]">
                    {sqPts} {sqPts === 1 ? 'Mark' : 'Marks'}
                  </span>
                </div>

                {/* Sub-MCQ choices OR short answer text */}
                {isSubMcq ? (
                  <div className="space-y-2 pt-1">
                    <span className="font-mono text-[10px] text-[#f2f2f4]/40 uppercase tracking-wider block">
                      Choose one option:
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {subOpts.map((optObj: { optionId: string; origIndex: number; text: string }, optIdx: number) => {
                        const isSelected = subSelOptId ? subSelOptId === optObj.optionId : subVal === optObj.text;
                        const optLetter = String.fromCharCode(65 + optIdx);
                        return (
                          <button
                            key={optObj.optionId}
                            type="button"
                            onClick={() => {
                              if (onSubMcqSelect) {
                                onSubMcqSelect(sqKey, optObj.optionId, optObj.text);
                              } else if (onSubChange) {
                                onSubChange(sqKey, optObj.text);
                              }
                            }}
                            className={`p-3 border flex items-center gap-2.5 transition cursor-pointer text-xs font-sans rounded-xl text-left ${
                              isSelected
                                ? 'bg-[#4cc9f0]/15 border-[#4cc9f0] text-[#4cc9f0] shadow-sm font-semibold'
                                : 'bg-[#111113] hover:border-[#f2f2f4]/30 border-[rgba(242,242,244,0.1)] text-[#f2f2f4]/80'
                            }`}
                          >
                            <div
                              className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                                isSelected
                                  ? 'border-[#4cc9f0] bg-[#4cc9f0] text-[#111113]'
                                  : 'border-[rgba(242,242,244,0.3)] bg-[#1c1c1f]'
                              }`}
                            >
                              {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                            </div>
                            <span className="w-5 h-5 bg-[#1c1c1f] border border-[rgba(242,242,244,0.2)] text-[9.5px] font-mono font-bold text-[#f2f2f4]/70 flex items-center justify-center shrink-0 rounded-md">
                              {optLetter}
                            </span>
                            <span className="flex-1 min-w-0 leading-snug break-words">{cleanOptionText(optObj.text)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5 pt-1">
                    <textarea
                      rows={3}
                      value={subVal}
                      onChange={(e) => onSubChange && onSubChange(sqKey, e.target.value)}
                      placeholder={`Type your response for ${sq.label || `Part ${sqIdx + 1}`}...`}
                      className="w-full p-3 bg-[#111113] border border-[rgba(242,242,244,0.12)] focus:border-[#4cc9f0] font-sans text-xs sm:text-sm text-[#f2f2f4] placeholder-[#f2f2f4]/30 outline-none transition rounded-xl resize-y"
                    />
                    <div className="flex justify-between font-mono text-[9px] text-[#f2f2f4]/40 px-1">
                      <span>{subVal.trim() ? `${subVal.trim().split(/\s+/).length} words` : 'Empty response'}</span>
                      <span>Part {sqIdx + 1} of {effectiveSubQuestions.length}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (q.type === 'mcq' || (q.type === 'picture_question' && Array.isArray(q.options) && q.options.length > 0)) {
    const optionsList = (Array.isArray(q.randomizedOptions) && q.randomizedOptions.length > 0)
      ? q.randomizedOptions
      : (q.options || []).map((opt, idx) => ({
          optionId: `opt_${idx}`,
          origIndex: idx,
          text: typeof opt === 'string' ? opt : String(opt ?? ''),
        }));
    return (
      <div className="space-y-2.5">
        {optionsList.map((optObj, idx) => {
          const isSelected = selectedOptionId ? selectedOptionId === optObj.optionId : currentVal === optObj.text;
          return (
            <label
              key={optObj.optionId}
              onClick={() => {
                if (onMcqSelect) {
                  onMcqSelect(optObj.optionId, optObj.text);
                } else {
                  onChange(optObj.text);
                }
              }}
              className={`p-3 sm:p-3.5 min-h-[48px] border flex items-center gap-2.5 sm:gap-3 transition cursor-pointer text-xs sm:text-sm font-sans rounded-xl min-w-0 overflow-hidden ${
                isSelected
                  ? 'bg-[#111113] border-[#4cc9f0] text-[#4cc9f0] shadow-sm font-medium'
                  : 'bg-[#111113] hover:border-[#f2f2f4]/30 border-[rgba(242,242,244,0.1)] text-[#f2f2f4]/80'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
                  isSelected ? 'border-[#4cc9f0] bg-[#4cc9f0] text-[#111113]' : 'border-[rgba(242,242,244,0.2)] bg-[#1c1c1f]'
                }`}
              >
                {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
              </div>
              <span className="w-5 h-5 bg-[#1c1c1f] border border-[rgba(242,242,244,0.2)] text-[10px] font-mono font-bold text-[#f2f2f4]/70 flex items-center justify-center shrink-0 rounded-md">
                {String.fromCharCode(65 + idx)}
              </span>
              <span className="flex-1 min-w-0 leading-snug break-words">{cleanOptionText(optObj.text)}</span>
            </label>
          );
        })}
        {(selectedOptionId || currentVal) && (
          <div className="flex justify-end pt-0.5">
            <button
              type="button"
              onClick={() => {
                if (onMcqSelect) {
                  onMcqSelect('', '');
                } else {
                  onChange('');
                }
              }}
              className="text-[11px] font-mono text-[#f2f2f4]/50 hover:text-[#4cc9f0] transition cursor-pointer underline-offset-2 hover:underline"
            >
              Clear selection
            </button>
          </div>
        )}
      </div>
    );
  }

  switch (q.type) {

    case 'true_false': {
      return (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
            {['True', 'False'].map((val) => {
              const isSelected = String(currentVal).toLowerCase() === val.toLowerCase();
              return (
                <button
                  key={val}
                  type="button"
                  onClick={() => onChange(isSelected ? '' : val)}
                  className={`py-3 sm:py-4 px-3 sm:px-6 min-h-[48px] border font-syne font-bold text-sm sm:text-base transition cursor-pointer flex items-center justify-center gap-2 rounded-xl ${
                    isSelected
                      ? 'bg-[#4cc9f0] border-[#4cc9f0] text-[#111113]'
                      : 'bg-[#111113] hover:border-[#f2f2f4]/30 border-[rgba(242,242,244,0.1)] text-[#f2f2f4]'
                  }`}
                >
                  {isSelected && <Check className="w-4 h-4 stroke-[3] shrink-0" />}
                  <span>{val}</span>
                </button>
              );
            })}
          </div>
          {currentVal && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => onChange('')}
                className="text-[11px] font-mono text-[#f2f2f4]/50 hover:text-[#4cc9f0] transition cursor-pointer underline-offset-2 hover:underline"
              >
                Clear selection
              </button>
            </div>
          )}
        </div>
      );
    }

    case 'fill_blanks': {
      // Check if multi-blank array exists
      if (Array.isArray(q.blankItems) && q.blankItems.length > 0) {
        return (
          <div className="space-y-3">
            {q.blankItems.map((bi: any, bIdx: number) => {
              const val = typeof currentVal === 'object' && currentVal !== null ? currentVal[bi.id || `blank_${bIdx}`] || '' : '';
              return (
                <div key={bi.id || bIdx} className="space-y-1">
                  <label className="font-mono text-[11px] text-[#f2f2f4]/70 block break-words">
                    Blank #{bIdx + 1}: <span className="text-[#f2f2f4]/40">{bi.prefix ? `${bi.prefix} ... ${bi.suffix || ''}` : ''}</span>
                  </label>
                  <input
                    type="text"
                    value={val}
                    onChange={(e) => onBlankChange(bi.id || `blank_${bIdx}`, e.target.value)}
                    placeholder="Enter missing word..."
                    className="w-full p-3 bg-[#111113] border border-[rgba(242,242,244,0.1)] focus:border-[#4cc9f0] font-sans text-xs sm:text-sm text-[#f2f2f4] placeholder-[#f2f2f4]/30 outline-none transition rounded-xl"
                  />
                </div>
              );
            })}
          </div>
        );
      }

      return (
        <div className="space-y-2">
          <input
            type="text"
            value={currentVal || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Type your answer for the blank..."
            className="w-full p-3.5 bg-[#111113] border border-[rgba(242,242,244,0.1)] focus:border-[#4cc9f0] font-sans text-xs sm:text-sm text-[#f2f2f4] placeholder-[#f2f2f4]/30 outline-none transition rounded-xl"
          />
        </div>
      );
    }

    case 'match_following': {
      const matchPairs = q.matchingPairs || [];
      const rightOptions = matchPairs.map((p) => p.right);

      return (
        <div className="space-y-3">
          <p className="font-mono text-xs text-[#f2f2f4]/50">
            Match each item on the left with the correct option on the right:
          </p>
          {matchPairs.map((pair, pIdx) => {
            const currentRight = typeof currentVal === 'object' && currentVal !== null ? currentVal[pair.left] || '' : '';
            return (
              <div
                key={pIdx}
                className="p-3 sm:p-3.5 bg-[#111113] border border-[rgba(242,242,244,0.1)] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 rounded-xl min-w-0"
              >
                <span className="font-sans font-medium text-xs sm:text-sm text-[#f2f2f4] flex-1 min-w-0 break-words">
                  {pair.left}
                </span>

                <select
                  value={currentRight}
                  onChange={(e) => onMatchChange(pair.left, e.target.value)}
                  className="px-3 py-2 bg-[#1c1c1f] border border-[rgba(242,242,244,0.2)] text-xs font-mono text-[#f2f2f4] focus:border-[#4cc9f0] outline-none transition w-full sm:w-auto sm:max-w-[55%] max-w-full min-w-0 truncate rounded-lg"
                >
                  <option value="" className="bg-[#1c1c1f] text-[#f2f2f4]">-- Select Match --</option>
                  {rightOptions.map((opt, oIdx) => (
                    <option key={oIdx} value={opt} className="bg-[#1c1c1f] text-[#f2f2f4]">
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      );
    }

    case 'picture_question':
    case 'question_answer':
    default: {
      const textVal = typeof currentVal === 'string' ? currentVal : '';
      const wordCount = textVal.trim() ? textVal.trim().split(/\s+/).length : 0;

      return (
        <div className="space-y-2">
          <textarea
            rows={5}
            value={textVal}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Type your explanation or response clearly..."
            className="w-full p-4 bg-[#111113] border border-[rgba(242,242,244,0.1)] focus:border-[#4cc9f0] font-sans text-xs sm:text-sm text-[#f2f2f4] placeholder-[#f2f2f4]/30 outline-none transition resize-y leading-relaxed rounded-xl"
          />
          <div className="flex justify-between font-mono text-[10px] text-[#f2f2f4]/40 px-1">
            <span>Auto-saving response</span>
            <span>{wordCount} words • {textVal.length} chars</span>
          </div>
        </div>
      );
    }
  }
}
