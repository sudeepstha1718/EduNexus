import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { QuizSubmission, QuizEvaluationReport, ClassItem, StudentUser, LiveExamAttempt } from '../types';
import {
  fetchSubmissions,
  fetchSubmissionById,
  fetchAdminLiveMonitoring,
  getAdminLiveMonitoringStreamUrl,
  resetQuizAttempt,
  deleteSubmission,
  bulkDeleteSubmissions,
  getAuthenticatedPrintUrl,
} from '../lib/api';
import { calcGradeLetter } from '../lib/scoringEngine';
import {
  TeacherGradeModal,
  compareSubmissionsForPrint,
  resolveStudentRollNo,
} from './TeacherGradeModal';
import {
  ArrowLeft,
  Search,
  Award,
  FileText,
  RefreshCw,
  TrendingUp,
  RotateCcw,
  Trash2,
  Check,
  Percent,
  Printer,
  Eye,
  X,
  AlertCircle,
  Activity,
  Clock,
  CheckCircle2,
} from 'lucide-react';

type SubmissionSortMode = 'roll_asc' | 'time_desc' | 'time_asc';
type MonitorStatusFilter = 'all' | 'in_progress' | 'submitted';

interface SubmissionsListViewProps {
  isAdmin: boolean;
  onBack: () => void;
  onOpenReport?: (report: QuizEvaluationReport) => void;
  onOpenAuth?: () => void;
  classes: ClassItem[];
  filterQuizId?: string;
  filterStudentQuery?: string;
  currentStudent?: StudentUser | null;
}

export const SubmissionsListView: React.FC<SubmissionsListViewProps> = ({
  isAdmin,
  onBack,
  onOpenAuth,
  classes,
  filterQuizId,
  filterStudentQuery,
  currentStudent,
}) => {
  const [submissions, setSubmissions] = useState<QuizSubmission[]>([]);
  const [liveAttempts, setLiveAttempts] = useState<LiveExamAttempt[]>([]);
  const [isLiveConnected, setIsLiveConnected] = useState<boolean>(false);
  const [statusFilter, setStatusFilter] = useState<MonitorStatusFilter>('all');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [syncWarning, setSyncWarning] = useState<string | null>(null);
  const [search, setSearch] = useState<string>(filterStudentQuery || '');
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [selectedSection, setSelectedSection] = useState<'all' | 'A' | 'B'>('all');
  const [selectedQuizId, setSelectedQuizId] = useState<string>(filterQuizId || 'all');
  const [sortBy, setSortBy] = useState<SubmissionSortMode>('roll_asc');
  const [selectedSubmissionForGrade, setSelectedSubmissionForGrade] = useState<QuizSubmission | null>(null);
  const [autoPrintForGrade, setAutoPrintForGrade] = useState<boolean>(false);
  const [hydratingSubmissionId, setHydratingSubmissionId] = useState<string | null>(null);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  const [confirmRetestSub, setConfirmRetestSub] = useState<QuizSubmission | null>(null);
  const [confirmResetLiveAttempt, setConfirmResetLiveAttempt] = useState<LiveExamAttempt | null>(null);
  const [confirmDeleteSub, setConfirmDeleteSub] = useState<QuizSubmission | null>(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState<boolean>(false);
  const [isProcessingAction, setIsProcessingAction] = useState<boolean>(false);

  const loadSeqRef = useRef<number>(0);
  const activeAbortRef = useRef<AbortController | null>(null);
  const hasLoadedOnceRef = useRef<boolean>(false);
  const isLiveConnectedRef = useRef<boolean>(false);
  const wasSseDisconnectedRef = useRef<boolean>(false);
  const liveRefreshSeqRef = useRef<number>(0);

  const availableQuizzes = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of submissions) {
      if (s.quizId && s.quizTitle) {
        map.set(s.quizId, s.quizTitle);
      }
    }
    for (const a of liveAttempts) {
      if (a.quizId && a.quizTitle && !map.has(a.quizId)) {
        map.set(a.quizId, a.quizTitle);
      }
    }
    return Array.from(map.entries()).map(([id, title]) => ({ id, title }));
  }, [submissions, liveAttempts]);

  const loadData = useCallback(async (showSpinner = true) => {
    if (activeAbortRef.current) {
      activeAbortRef.current.abort();
    }
    const controller = new AbortController();
    activeAbortRef.current = controller;
    const seq = ++loadSeqRef.current;

    const isInitialBlocking = showSpinner && !hasLoadedOnceRef.current;
    if (isInitialBlocking) {
      setIsLoading(true);
    } else if (showSpinner) {
      setIsRefreshing(true);
    }
    if (isInitialBlocking) {
      setLoadError(null);
    }

    try {
      const params: any = {};
      if (filterQuizId) params.quizId = filterQuizId;
      if (selectedClass !== 'all') params.classId = selectedClass;
      if (!isAdmin && currentStudent) {
        params.studentId = currentStudent.studentId;
      }

      if (isAdmin) {
        const [subData, liveRes] = await Promise.all([
          fetchSubmissions(params, { signal: controller.signal }),
          fetchAdminLiveMonitoring(
            {
              quizId: filterQuizId,
              classId: selectedClass !== 'all' ? selectedClass : undefined,
            },
            { signal: controller.signal }
          ).catch((liveErr: any) => {
            if (liveErr?.name === 'AbortError') throw liveErr;
            return null;
          }),
        ]);
        if (controller.signal.aborted || seq !== loadSeqRef.current) return;
        setSubmissions(subData);
        if (liveRes && Array.isArray(liveRes.liveAttempts)) {
          setLiveAttempts(liveRes.liveAttempts);
        }
      } else {
        const data = await fetchSubmissions(params, { signal: controller.signal });
        if (controller.signal.aborted || seq !== loadSeqRef.current) return;
        setSubmissions(data);
        setLiveAttempts([]);
      }

      hasLoadedOnceRef.current = true;
      setLoadError(null);
      setSyncWarning(null);
    } catch (err: any) {
      if (err?.name === 'AbortError' || controller.signal.aborted || seq !== loadSeqRef.current) {
        return;
      }
      console.error('Error fetching submissions:', err);
      const errMsg = err?.message || 'Unable to reach server for latest updates. Showing last synced records.';
      if (!hasLoadedOnceRef.current) {
        setLoadError(errMsg);
      } else {
        setSyncWarning(errMsg);
      }
    } finally {
      if (seq === loadSeqRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
        if (activeAbortRef.current === controller) {
          activeAbortRef.current = null;
        }
      }
    }
  }, [filterQuizId, selectedClass, isAdmin, currentStudent]);

  const refreshLiveOnly = useCallback(async () => {
    if (!isAdmin) return;
    const seq = ++liveRefreshSeqRef.current;
    try {
      const liveRes = await fetchAdminLiveMonitoring({
        quizId: filterQuizId,
        classId: selectedClass !== 'all' ? selectedClass : undefined,
      });
      if (seq !== liveRefreshSeqRef.current) return;
      if (Array.isArray(liveRes.liveAttempts)) {
        setLiveAttempts(liveRes.liveAttempts);
      }
      setSyncWarning(null);
    } catch {
      // ignore transient background live refresh errors; keep existing UI visible
    }
  }, [isAdmin, filterQuizId, selectedClass]);

  const handleInspectSubmission = useCallback(async (sub: QuizSubmission, autoPrint = false) => {
    setAutoPrintForGrade(autoPrint);
    if (sub.evaluation || sub.aiEvaluation) {
      setSelectedSubmissionForGrade(sub);
      return;
    }
    setHydratingSubmissionId(sub.id);
    try {
      const fullSub = await fetchSubmissionById(sub.id);
      setSubmissions((prev) => prev.map((item) => (item.id === fullSub.id ? { ...item, ...fullSub } : item)));
      setSelectedSubmissionForGrade(fullSub);
    } catch {
      // Fallback: open modal with whatever record we have
      setSelectedSubmissionForGrade(sub);
    } finally {
      setHydratingSubmissionId(null);
    }
  }, []);

  useEffect(() => {
    setSelectedQuizId(filterQuizId || 'all');
  }, [filterQuizId]);

  useEffect(() => {
    loadData(!hasLoadedOnceRef.current);
    return () => {
      if (activeAbortRef.current) {
        activeAbortRef.current.abort();
      }
    };
  }, [loadData]);

  // Real-Time Delta SSE stream + Reconnect Reconciliation + Adaptive Fallback Polling
  useEffect(() => {
    if (!isAdmin) {
      isLiveConnectedRef.current = false;
      setIsLiveConnected(false);
      return;
    }

    const matchesStudentId = (aId: string | undefined, bId: string): boolean => {
      const a = String(aId || '').trim().toLowerCase();
      const b = String(bId || '').trim().toLowerCase();
      if (!a || !b) return false;
      const bAlt = b.startsWith('std-') ? b.slice(4) : `std-${b}`;
      return a === b || a === bAlt;
    };

    const matchesActiveFilters = (payloadQuizId?: string, payloadClassId?: string): boolean => {
      if (filterQuizId && payloadQuizId && payloadQuizId !== filterQuizId) return false;
      if (selectedClass !== 'all' && payloadClassId && payloadClassId !== selectedClass) return false;
      return true;
    };

    let es: EventSource | null = null;
    try {
      const streamUrl = getAdminLiveMonitoringStreamUrl();
      es = new EventSource(streamUrl);

      es.addEventListener('connected', () => {
        const reconnected = wasSseDisconnectedRef.current;
        wasSseDisconnectedRef.current = false;
        isLiveConnectedRef.current = true;
        setIsLiveConnected(true);
        setSyncWarning(null);
        // After a real drop/reconnect, do one background reconciliation sync to catch any missed events
        if (reconnected) {
          loadData(false);
        }
      });

      es.addEventListener('attempt:updated', (evt: MessageEvent) => {
        isLiveConnectedRef.current = true;
        setIsLiveConnected(true);
        setSyncWarning(null);
        try {
          const payload = JSON.parse(evt.data);
          if (!payload?.quizId || !payload?.studentId) return;
          const pQuiz = String(payload.quizId);
          const pStu = String(payload.studentId);
          if (!matchesActiveFilters(pQuiz, payload.classId)) return;

          setLiveAttempts((prev) => {
            let found = false;
            const updated = prev.map((item) => {
              if (item.quizId !== pQuiz || !matchesStudentId(item.studentId, pStu)) return item;
              found = true;
              // Never regress a submitted attempt back to in_progress from a delayed draft delta
              if (item.status === 'submitted') return item;
              return {
                ...item,
                studentName: payload.studentName || item.studentName,
                studentRoll: payload.studentRoll || item.studentRoll,
                classId: payload.classId || item.classId,
                quizTitle: payload.quizTitle || item.quizTitle,
                quizSubject: payload.quizSubject || item.quizSubject,
                liveScore: Number(payload.liveScore ?? item.liveScore),
                maxScore: Number(payload.maxScore ?? item.maxScore),
                answeredCount: Number(payload.answeredCount ?? item.answeredCount),
                totalQuestions: Number(payload.totalQuestions ?? item.totalQuestions),
                progressPercentage: Number(payload.progressPercentage ?? item.progressPercentage),
                updatedAt: payload.updatedAt || new Date().toISOString(),
              };
            });

            if (found) return updated;

            // Only insert new live row if payload carries rich metadata; otherwise reconcile via light live fetch
            if (!payload.quizTitle || !payload.studentName) {
              refreshLiveOnly();
              return prev;
            }

            const newAttempt: LiveExamAttempt = {
              attemptId: payload.attemptId || `att-${pQuiz}-${pStu}`,
              quizId: pQuiz,
              quizTitle: payload.quizTitle,
              quizSubject: payload.quizSubject || 'General',
              classId: payload.classId || 'cls-1',
              studentId: pStu,
              studentName: payload.studentName,
              studentRoll: payload.studentRoll || '-',
              status: 'in_progress',
              answeredCount: Number(payload.answeredCount || 0),
              totalQuestions: Number(payload.totalQuestions || 0),
              liveScore: Number(payload.liveScore || 0),
              maxScore: Number(payload.maxScore || 0),
              progressPercentage: Number(payload.progressPercentage || 0),
              startedAt: payload.startedAt || new Date().toISOString(),
              updatedAt: payload.updatedAt || new Date().toISOString(),
            };
            return [newAttempt, ...updated];
          });
        } catch {
          refreshLiveOnly();
        }
      });

      es.addEventListener('attempt:submitted', (evt: MessageEvent) => {
        isLiveConnectedRef.current = true;
        setIsLiveConnected(true);
        setSyncWarning(null);
        try {
          const payload = JSON.parse(evt.data);
          if (!payload?.quizId || !payload?.studentId || !payload?.submissionId) {
            loadData(false);
            return;
          }
          const pQuiz = String(payload.quizId);
          const pStu = String(payload.studentId);
          if (!matchesActiveFilters(pQuiz, payload.classId)) return;

          const newSubmission: QuizSubmission = {
            id: String(payload.submissionId),
            quizId: pQuiz,
            quizTitle: payload.quizTitle || 'Assessment',
            studentName: payload.studentName || 'Student',
            studentRoll: payload.studentRoll || '-',
            studentId: pStu,
            attemptId: payload.attemptId,
            classId: payload.classId || 'cls-1',
            subject: payload.quizSubject || 'General',
            submittedAt: payload.submittedAt || new Date().toISOString(),
            studentAnswers: {},
            totalScore: Number(payload.totalScore ?? 0),
            maxScore: Number(payload.maxScore ?? 0),
            status: 'graded',
          };

          // Idempotent submission upsert (deduplicate by submissionId or same student+quiz)
          setSubmissions((prev) => {
            const existingIdx = prev.findIndex(
              (s) => s.id === newSubmission.id || (s.quizId === pQuiz && matchesStudentId(s.studentId, pStu))
            );
            if (existingIdx >= 0) {
              const next = [...prev];
              next[existingIdx] = { ...next[existingIdx], ...newSubmission };
              return next;
            }
            return [newSubmission, ...prev];
          });

          // Move liveAttempts entry cleanly from 'in_progress' to 'submitted' with final stats
          setLiveAttempts((prev) => {
            let matched = false;
            const next = prev.map((att) => {
              if (att.quizId === pQuiz && matchesStudentId(att.studentId, pStu)) {
                matched = true;
                return {
                  ...att,
                  status: 'submitted' as const,
                  submissionId: newSubmission.id,
                  liveScore: Number(payload.totalScore ?? att.liveScore),
                  maxScore: Number(payload.maxScore ?? att.maxScore),
                  answeredCount: Number(payload.answeredCount ?? att.answeredCount),
                  totalQuestions: Number(payload.totalQuestions ?? att.totalQuestions),
                  progressPercentage: Number(payload.progressPercentage ?? 100),
                  gradeLetter: payload.gradeLetter,
                  updatedAt: payload.submittedAt || new Date().toISOString(),
                };
              }
              return att;
            });

            if (matched) return next;

            return [
              {
                attemptId: payload.attemptId || `att-${pQuiz}-${pStu}`,
                quizId: pQuiz,
                quizTitle: newSubmission.quizTitle || 'Assessment',
                quizSubject: newSubmission.subject,
                classId: newSubmission.classId,
                studentId: pStu,
                studentName: newSubmission.studentName,
                studentRoll: newSubmission.studentRoll,
                status: 'submitted',
                answeredCount: Number(payload.answeredCount ?? 0),
                totalQuestions: Number(payload.totalQuestions ?? 0),
                liveScore: Number(payload.totalScore ?? 0),
                maxScore: Number(payload.maxScore ?? 0),
                progressPercentage: Number(payload.progressPercentage ?? 100),
                submissionId: newSubmission.id,
                gradeLetter: payload.gradeLetter,
                updatedAt: payload.submittedAt || new Date().toISOString(),
              },
              ...next,
            ];
          });
        } catch {
          loadData(false);
        }
      });

      es.addEventListener('attempt:reset', (evt: MessageEvent) => {
        isLiveConnectedRef.current = true;
        setIsLiveConnected(true);
        try {
          const payload = JSON.parse(evt.data);
          if (Array.isArray(payload?.submissionIds) && payload.submissionIds.length > 0) {
            const idSet = new Set(payload.submissionIds.map(String));
            setSubmissions((prev) => prev.filter((s) => !idSet.has(s.id)));
            setLiveAttempts((prev) => prev.filter((a) => !a.submissionId || !idSet.has(a.submissionId)));
            return;
          }
          if (payload?.submissionId) {
            const sid = String(payload.submissionId);
            setSubmissions((prev) => prev.filter((s) => s.id !== sid));
            setLiveAttempts((prev) => prev.filter((a) => a.submissionId !== sid));
          }
          if (payload?.quizId && payload?.studentId) {
            const pQuiz = String(payload.quizId);
            const pStu = String(payload.studentId);
            setSubmissions((prev) => prev.filter((s) => !(s.quizId === pQuiz && matchesStudentId(s.studentId, pStu))));
            setLiveAttempts((prev) => prev.filter((a) => !(a.quizId === pQuiz && matchesStudentId(a.studentId, pStu))));
            return;
          }
          loadData(false);
        } catch {
          loadData(false);
        }
      });

      es.onerror = () => {
        wasSseDisconnectedRef.current = true;
        isLiveConnectedRef.current = false;
        setIsLiveConnected(false);
      };
    } catch {
      wasSseDisconnectedRef.current = true;
      isLiveConnectedRef.current = false;
      setIsLiveConnected(false);
    }

    // Adaptive fallback polling: 12s when SSE is down, 60s lightweight safety net when SSE is healthy
    let pollCounter = 0;
    const fallbackInterval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      pollCounter += 1;
      if (!isLiveConnectedRef.current) {
        loadData(false);
      } else if (pollCounter % 5 === 0) {
        refreshLiveOnly();
      }
    }, 12000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        loadData(false);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (es) es.close();
      clearInterval(fallbackInterval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isAdmin, filterQuizId, selectedClass, loadData, refreshLiveOnly]);

  const handleAllowRetest = async (sub: QuizSubmission) => {
    setIsProcessingAction(true);
    setSubmissions((prev) => prev.filter((s) => s.id !== sub.id));
    setLiveAttempts((prev) => prev.filter((a) => a.submissionId !== sub.id));
    setConfirmRetestSub(null);
    setActionSuccessMsg(`Retest permitted for ${sub.studentName}. Previous attempt reset.`);
    setTimeout(() => setActionSuccessMsg(null), 3500);

    try {
      const studentIdToReset = sub.studentId || sub.studentRoll || sub.studentName;
      await resetQuizAttempt(sub.quizId, studentIdToReset);
    } catch (err: any) {
      console.error('Error resetting attempt:', err);
      setActionSuccessMsg(`Failed to reset attempt: ${err.message || 'Error'}`);
      setTimeout(() => setActionSuccessMsg(null), 3500);
      loadData(false);
    } finally {
      setIsProcessingAction(false);
    }
  };

  const handleResetLiveAttempt = async (attempt: LiveExamAttempt) => {
    setIsProcessingAction(true);
    setLiveAttempts((prev) => prev.filter((a) => a.attemptId !== attempt.attemptId));
    setConfirmResetLiveAttempt(null);
    setActionSuccessMsg(`In-progress attempt reset for ${attempt.studentName}.`);
    setTimeout(() => setActionSuccessMsg(null), 3500);

    try {
      await resetQuizAttempt(attempt.quizId, attempt.studentId);
    } catch (err: any) {
      console.error('Error resetting in-progress attempt:', err);
      setActionSuccessMsg(`Failed to reset attempt: ${err.message || 'Error'}`);
      setTimeout(() => setActionSuccessMsg(null), 3500);
      loadData(false);
    } finally {
      setIsProcessingAction(false);
    }
  };

  const handleDeleteSubmission = async (sub: QuizSubmission) => {
    setIsProcessingAction(true);
    setSubmissions((prev) => prev.filter((s) => s.id !== sub.id));
    setLiveAttempts((prev) => prev.filter((a) => a.submissionId !== sub.id));
    setConfirmDeleteSub(null);
    setActionSuccessMsg(`Submission for ${sub.studentName} removed.`);
    setTimeout(() => setActionSuccessMsg(null), 3500);

    try {
      await deleteSubmission(sub.id);
    } catch (err: any) {
      console.error('Error deleting submission:', err);
      setActionSuccessMsg(`Failed to delete: ${err.message || 'Error'}`);
      setTimeout(() => setActionSuccessMsg(null), 3500);
      loadData(false);
    } finally {
      setIsProcessingAction(false);
    }
  };

  const handleDeleteAllSubmissions = async () => {
    const idsToDelete = filteredSubmissions.map((s) => s.id);
    if (idsToDelete.length === 0) {
      setConfirmDeleteAll(false);
      return;
    }

    setIsProcessingAction(true);
    const idSet = new Set(idsToDelete);
    setSubmissions((prev) => prev.filter((s) => !idSet.has(s.id)));
    setLiveAttempts((prev) => prev.filter((a) => !a.submissionId || !idSet.has(a.submissionId)));
    setConfirmDeleteAll(false);

    try {
      const result = await bulkDeleteSubmissions(idsToDelete);
      setActionSuccessMsg(`Permanently deleted ${result.deletedCount ?? idsToDelete.length} submission(s) from database.`);
      setTimeout(() => setActionSuccessMsg(null), 4000);
    } catch (err: any) {
      console.error('Error bulk deleting submissions:', err);
      setActionSuccessMsg(`Failed to delete submissions: ${err.message || 'Error'}`);
      setTimeout(() => setActionSuccessMsg(null), 4000);
      loadData(false);
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Lookup map from submissionId -> live monitoring question completion stats
  const submittedStatsById = useMemo(() => {
    const map = new Map<string, LiveExamAttempt>();
    for (const item of liveAttempts) {
      if (item.status === 'submitted' && item.submissionId) {
        map.set(item.submissionId, item);
      }
    }
    return map;
  }, [liveAttempts]);

  const filteredInProgressAttempts = useMemo(() => {
    if (!isAdmin) return [];
    const filtered = liveAttempts.filter((att) => {
      if (att.status !== 'in_progress') return false;
      if (selectedQuizId !== 'all' && att.quizId !== selectedQuizId) return false;
      if (selectedClass !== 'all' && att.classId && att.classId !== selectedClass) return false;
      if (selectedSection !== 'all') {
        const r = (att.studentRoll && att.studentRoll !== '-' ? att.studentRoll : att.studentId || '').toUpperCase().trim();
        if (!r.endsWith(selectedSection)) return false;
      }
      if (!search.trim()) return true;
      const q = search.toLowerCase().trim();
      return (
        att.studentName?.toLowerCase().includes(q) ||
        att.quizTitle?.toLowerCase().includes(q) ||
        (att.studentRoll || att.studentId || '').toLowerCase().includes(q)
      );
    });

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      if (sortBy === 'roll_asc') {
        return compareSubmissionsForPrint(
          { studentRoll: a.studentRoll, studentId: a.studentId, studentName: a.studentName },
          { studentRoll: b.studentRoll, studentId: b.studentId, studentName: b.studentName }
        );
      }
      const timeA = new Date(a.updatedAt || a.startedAt || 0).getTime() || 0;
      const timeB = new Date(b.updatedAt || b.startedAt || 0).getTime() || 0;
      return sortBy === 'time_desc' ? timeB - timeA : timeA - timeB;
    });
    return sorted;
  }, [isAdmin, liveAttempts, selectedQuizId, selectedClass, selectedSection, search, sortBy]);

  const filteredSubmissions = useMemo(() => {
    const filtered = submissions.filter((sub) => {
      if (selectedQuizId !== 'all' && sub.quizId !== selectedQuizId) return false;
      if (selectedSection !== 'all') {
        const r = (sub.studentRoll && sub.studentRoll !== '-' ? sub.studentRoll : sub.studentId || '').toUpperCase().trim();
        if (!r.endsWith(selectedSection)) return false;
      }
      if (!search.trim()) return true;
      const q = search.toLowerCase().trim();
      const matchesName = sub.studentName?.toLowerCase().includes(q);
      const matchesQuiz = sub.quizTitle?.toLowerCase().includes(q);
      const matchesRoll = (sub.studentRoll || sub.studentId || '').toLowerCase().includes(q);
      return matchesName || matchesQuiz || matchesRoll;
    });

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      if (sortBy === 'roll_asc') {
        return compareSubmissionsForPrint(a, b);
      }
      const timeA = new Date(a.submittedAt).getTime() || 0;
      const timeB = new Date(b.submittedAt).getTime() || 0;
      if (sortBy === 'time_desc') {
        return timeB - timeA;
      }
      return timeA - timeB;
    });
    return sorted;
  }, [submissions, selectedQuizId, selectedSection, search, sortBy]);

  const visibleInProgress = statusFilter === 'submitted' ? [] : filteredInProgressAttempts;
  const visibleSubmissions = isAdmin && statusFilter === 'in_progress' ? [] : filteredSubmissions;
  const hasAnyVisibleRows = visibleInProgress.length > 0 || visibleSubmissions.length > 0;

  const batchPrintHref = useMemo(() => {
    const params = new URLSearchParams();
    params.set('classId', selectedClass || 'all');
    params.set('quizId', selectedQuizId || 'all');
    params.set('section', selectedSection || 'all');
    if (search.trim()) params.set('search', search.trim());
    return getAuthenticatedPrintUrl(`/api/print/batch?${params.toString()}`);
  }, [selectedClass, selectedQuizId, selectedSection, search, isAdmin]);

  // Aggregate stats
  const totalCount = filteredSubmissions.length;
  const inProgressCount = filteredInProgressAttempts.length;
  const avgPercentage =
    totalCount > 0
      ? Math.round(
          filteredSubmissions.reduce((acc, s) => {
            const pct = s.maxScore ? (s.totalScore / s.maxScore) * 100 : 0;
            return acc + pct;
          }, 0) / totalCount
        )
      : 0;
  const passCount = filteredSubmissions.filter((s) => {
    const pct = s.maxScore ? (s.totalScore / s.maxScore) * 100 : 0;
    return pct >= 50;
  }).length;
  const passRate = totalCount > 0 ? Math.round((passCount / totalCount) * 100) : 0;

  const getGradeStyle = (grade?: string) => {
    switch (grade) {
      case 'A+':
      case 'A':
        return {
          bg: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
          badge: 'bg-emerald-500 text-white',
          border: 'border-emerald-500/40',
        };
      case 'B':
      case 'B+':
        return {
          bg: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30',
          badge: 'bg-blue-500 text-white',
          border: 'border-blue-500/40',
        };
      case 'C':
      case 'C+':
        return {
          bg: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
          badge: 'bg-amber-500 text-white',
          border: 'border-amber-500/40',
        };
      case 'D':
        return {
          bg: 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30',
          badge: 'bg-orange-500 text-white',
          border: 'border-orange-500/40',
        };
      default:
        return {
          bg: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30',
          badge: 'bg-rose-500 text-white',
          border: 'border-rose-500/40',
        };
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-4 sm:space-y-5 min-w-0">
      {/* Action Notification Toast */}
      {actionSuccessMsg && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400 animate-in fade-in">
          <Check className="w-4 h-4 text-emerald-500 shrink-0" />
          <span className="min-w-0 break-words">{actionSuccessMsg}</span>
        </div>
      )}

      {/* Initial Blocking Load Error Banner (only when no cached/existing rows exist) */}
      {loadError && submissions.length === 0 && liveAttempts.length === 0 && (
        <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs text-rose-500 dark:text-rose-300">
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
            <span className="font-semibold break-words">{loadError}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!isAdmin && onOpenAuth && loadError.toLowerCase().includes('auth') && (
              <button
                type="button"
                onClick={onOpenAuth}
                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs cursor-pointer"
              >
                Sign In
              </button>
            )}
            <button
              type="button"
              onClick={() => loadData(true)}
              className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 font-semibold text-xs cursor-pointer flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Retry</span>
            </button>
          </div>
        </div>
      )}

      {/* Non-Blocking Background Sync Warning (keeps existing rows visible) */}
      {syncWarning && (submissions.length > 0 || liveAttempts.length > 0) && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-amber-700 dark:text-amber-300">
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
            <span className="font-medium break-words">Background sync notice: {syncWarning}</span>
          </div>
          <button
            type="button"
            onClick={() => loadData(true)}
            className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 font-semibold text-xs cursor-pointer flex items-center gap-1 self-start sm:self-auto shrink-0"
          >
            <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Retry Sync</span>
          </button>
        </div>
      )}

      {/* Top Header Section */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 pb-3 border-b border-[var(--border)]">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 min-w-0">
          <div className="flex items-center justify-between gap-2 sm:contents">
            <button
              onClick={onBack}
              type="button"
              className="btn min-h-[36px] py-1.5 px-3 text-xs font-semibold rounded-lg border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-higher)] text-[var(--ink)] shadow-2xs active:scale-95 cursor-pointer flex items-center gap-1.5 shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-blue-500" />
              <span>Back</span>
            </button>

            {isAdmin && (
              <span
                className={`sm:hidden inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                  isLiveConnected
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                    : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isLiveConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                  }`}
                />
                <span>{isLiveConnected ? 'Live Sync' : 'Auto Sync'}</span>
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-[var(--ink-muted)]">
              <span className="font-semibold text-[var(--accent)]">
                {isAdmin ? 'Live Monitoring & Evaluation' : 'My Records'}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                {isAdmin
                  ? `${inProgressCount} in progress · ${filteredSubmissions.length} submitted`
                  : `${filteredSubmissions.length} submission${filteredSubmissions.length === 1 ? '' : 's'}`}
              </span>
              {isAdmin && (
                <span
                  className={`hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                    isLiveConnected
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                      : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isLiveConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                    }`}
                  />
                  <span>{isLiveConnected ? 'Live Sync' : 'Auto Sync'}</span>
                </span>
              )}
            </div>
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-[var(--ink)] truncate">
              {isAdmin ? 'Exam Monitor & Submissions' : 'My Completed Tests'}
            </h1>
          </div>
        </div>

        <div className={`${isAdmin ? 'grid grid-cols-2 sm:flex sm:flex-wrap' : 'flex'} items-center gap-2 w-full xl:w-auto xl:shrink-0`}>
          {isAdmin && (
            <>
              <a
                href={batchPrintHref}
                target="_blank"
                rel="noopener noreferrer"
                id="print-all-submissions-btn"
                className={`btn btn-primary min-h-[38px] sm:flex-none justify-center py-2 sm:py-1.5 px-3 text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-2xs cursor-pointer whitespace-nowrap ${
                  filteredSubmissions.length === 0 ? 'opacity-50 pointer-events-none' : ''
                }`}
                title={`Print all ${filteredSubmissions.length} submitted papers roll-no wise`}
              >
                <Printer className="w-3.5 h-3.5 shrink-0" />
                <span>Print All{filteredSubmissions.length > 0 ? ` (${filteredSubmissions.length})` : ''}</span>
              </a>

              <button
                type="button"
                id="delete-all-submissions-btn"
                onClick={() => setConfirmDeleteAll(true)}
                disabled={filteredSubmissions.length === 0 || isProcessingAction}
                className={`min-h-[38px] sm:flex-none py-2 sm:py-1.5 px-3 text-xs font-semibold rounded-lg border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center gap-1.5 shadow-2xs transition cursor-pointer whitespace-nowrap ${
                  filteredSubmissions.length === 0 || isProcessingAction ? 'opacity-50 pointer-events-none' : 'active:scale-95'
                }`}
                title={`Permanently delete ${filteredSubmissions.length} submitted paper(s) from database`}
              >
                <Trash2 className="w-3.5 h-3.5 shrink-0" />
                <span>Delete All{filteredSubmissions.length > 0 ? ` (${filteredSubmissions.length})` : ''}</span>
              </button>
            </>
          )}

          <button
            onClick={() => loadData(true)}
            disabled={isLoading || isRefreshing}
            type="button"
            className={`btn min-h-[38px] py-2 sm:py-1.5 px-3 text-xs font-semibold rounded-lg border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-higher)] text-[var(--ink)] shadow-2xs active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 shrink-0 ${
              isAdmin ? 'col-span-2 sm:col-span-1 sm:w-auto' : 'w-full sm:w-auto'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading || isRefreshing ? 'animate-spin text-blue-500' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Modern Responsive Stats Grid (adapts smoothly across phone, tablet with sidebar, and desktop) */}
      <div
        className={`grid grid-cols-2 ${
          isAdmin
            ? 'sm:grid-cols-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5'
            : 'sm:grid-cols-4 md:grid-cols-2 lg:grid-cols-4'
        } gap-2.5 sm:gap-3`}
      >
        {isAdmin && (
          <div className="col-span-2 sm:col-span-1 md:col-span-2 lg:col-span-1 bg-[var(--surface)] border border-cyan-500/30 rounded-xl p-3 sm:p-3.5 shadow-2xs flex flex-col justify-between min-w-0">
            <div className="flex items-center justify-between gap-1 text-[11px] sm:text-xs font-semibold text-cyan-600 dark:text-cyan-400">
              <span className="truncate">In Progress Now</span>
              <div className="w-6 h-6 rounded-md bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 flex items-center justify-center shrink-0">
                <Activity className="w-3 h-3" />
              </div>
            </div>
            <div className="mt-1.5 flex items-baseline gap-2">
              <span className="font-mono text-lg sm:text-2xl font-bold text-cyan-600 dark:text-cyan-400">
                {inProgressCount}
              </span>
              <span className="text-[11px] text-[var(--ink-muted)] truncate">active student{inProgressCount === 1 ? '' : 's'}</span>
            </div>
          </div>
        )}

        {/* Total Submissions */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3 sm:p-3.5 shadow-2xs flex flex-col justify-between min-w-0">
          <div className="flex items-center justify-between gap-1 text-[11px] sm:text-xs font-semibold text-[var(--ink-muted)]">
            <span className="truncate">Submitted Papers</span>
            <div className="w-6 h-6 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <FileText className="w-3 h-3" />
            </div>
          </div>
          <div className="mt-1.5">
            <span className="font-mono text-lg sm:text-2xl font-bold text-[var(--ink)]">
              {totalCount}
            </span>
          </div>
        </div>

        {/* Average Score */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3 sm:p-3.5 shadow-2xs flex flex-col justify-between min-w-0">
          <div className="flex items-center justify-between gap-1 text-[11px] sm:text-xs font-semibold text-[var(--ink-muted)]">
            <span className="truncate">Average Score</span>
            <div className="w-6 h-6 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <Percent className="w-3 h-3" />
            </div>
          </div>
          <div className="mt-1.5">
            <span className="font-mono text-lg sm:text-2xl font-bold text-blue-600 dark:text-blue-400">
              {avgPercentage}%
            </span>
          </div>
        </div>

        {/* Pass Rate */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3 sm:p-3.5 shadow-2xs flex flex-col justify-between min-w-0">
          <div className="flex items-center justify-between gap-1 text-[11px] sm:text-xs font-semibold text-[var(--ink-muted)]">
            <span className="truncate">Pass Rate</span>
            <div className="w-6 h-6 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <TrendingUp className="w-3 h-3" />
            </div>
          </div>
          <div className="mt-1.5">
            <span className="font-mono text-lg sm:text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {passRate}%
            </span>
          </div>
        </div>

        {/* Passed Count */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3 sm:p-3.5 shadow-2xs flex flex-col justify-between min-w-0">
          <div className="flex items-center justify-between gap-1 text-[11px] sm:text-xs font-semibold text-[var(--ink-muted)]">
            <span className="truncate">Passed / Total</span>
            <div className="w-6 h-6 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <Award className="w-3 h-3" />
            </div>
          </div>
          <div className="mt-1.5">
            <span className="font-mono text-lg sm:text-2xl font-bold text-amber-600 dark:text-amber-400">
              {passCount} <span className="text-xs sm:text-sm font-semibold text-[var(--ink-muted)]">/ {totalCount}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Responsive Search, Sort & Filters Bar */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-3 sm:p-4 shadow-xs space-y-2.5 sm:space-y-3">
        {/* Row 1: Search Input + Compact Sort Dropdown */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          {/* Search Input */}
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 text-[var(--ink-muted)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search student name, roll no, or test..."
              className="w-full bg-[var(--surface-higher)] border border-[var(--border)] rounded-xl pl-10 pr-8 py-2 text-xs sm:text-sm text-[var(--ink)] placeholder-[var(--ink-muted)] outline-none focus:border-blue-500 transition"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--ink-muted)] hover:text-[var(--ink)] p-0.5 cursor-pointer"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Sort Mode Dropdown (Default: Roll No wise; switchable to Time wise) */}
          <div className="w-full sm:w-44 lg:w-52 shrink-0">
            <select
              aria-label="Sort submissions"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SubmissionSortMode)}
              className="w-full bg-[var(--surface-higher)] border border-[var(--border)] rounded-xl px-3 py-2 text-xs sm:text-sm font-medium text-[var(--ink)] outline-none focus:border-blue-500 transition cursor-pointer"
            >
              <option value="roll_asc">Sort: Roll No Wise</option>
              <option value="time_desc">Sort: Newest First</option>
              <option value="time_asc">Sort: Oldest First</option>
            </select>
          </div>
        </div>

        {/* Row 2: Test, Class, Section Dropdowns */}
        <div className={`grid grid-cols-1 sm:grid-cols-2 ${isAdmin ? 'lg:grid-cols-3' : 'lg:grid-cols-2'} gap-2.5 items-center`}>
          {/* Test / Quiz Filter Dropdown */}
          <div className="min-w-0">
            <select
              aria-label="Filter by test"
              value={selectedQuizId}
              onChange={(e) => setSelectedQuizId(e.target.value)}
              className="w-full min-h-[40px] bg-[var(--surface-higher)] border border-[var(--border)] rounded-xl px-3 py-2 text-xs sm:text-sm font-medium text-[var(--ink)] outline-none focus:border-blue-500 transition cursor-pointer truncate"
            >
              <option value="all">All Tests</option>
              {availableQuizzes.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.title}
                </option>
              ))}
            </select>
          </div>

          {/* Class Filter (Admin only) */}
          {isAdmin && (
            <div className="min-w-0">
              <select
                aria-label="Filter by class"
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                className="w-full min-h-[40px] bg-[var(--surface-higher)] border border-[var(--border)] rounded-xl px-3 py-2 text-xs sm:text-sm font-medium text-[var(--ink)] outline-none focus:border-blue-500 transition cursor-pointer truncate"
              >
                <option value="all">All Classes</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.section ? `(${c.section})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Section Filter Dropdown */}
          <div className={isAdmin ? 'sm:col-span-2 lg:col-span-1 min-w-0' : 'min-w-0'}>
            <select
              aria-label="Filter by section"
              value={selectedSection}
              onChange={(e) => setSelectedSection(e.target.value as 'all' | 'A' | 'B')}
              className="w-full min-h-[40px] bg-[var(--surface-higher)] border border-[var(--border)] rounded-xl px-3 py-2 text-xs sm:text-sm font-medium text-[var(--ink)] outline-none focus:border-blue-500 transition cursor-pointer"
            >
              <option value="all">All Sections</option>
              <option value="A">Section A</option>
              <option value="B">Section B</option>
            </select>
          </div>
        </div>

        {/* Status Filter Tabs (Admin only) + Showing count indicator */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-[11px] text-[var(--ink-muted)] pt-1 px-0.5">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 min-w-0">
            {isAdmin && (
              <div className="w-full sm:w-auto grid grid-cols-3 sm:inline-flex items-center rounded-xl bg-[var(--surface-higher)] border border-[var(--border)] p-1 gap-1">
                {(
                  [
                    { id: 'all', label: `All (${inProgressCount + totalCount})` },
                    { id: 'in_progress', label: `Live (${inProgressCount})`, fullLabel: `In Progress (${inProgressCount})` },
                    { id: 'submitted', label: `Done (${totalCount})`, fullLabel: `Submitted (${totalCount})` },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setStatusFilter(tab.id)}
                    className={`min-h-[32px] px-2 sm:px-3 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer whitespace-nowrap truncate text-center ${
                      statusFilter === tab.id
                        ? 'bg-[var(--accent)] text-white shadow-2xs'
                        : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
                    }`}
                  >
                    {'fullLabel' in tab ? (
                      <>
                        <span className="xs:hidden">{tab.label}</span>
                        <span className="hidden xs:inline">{tab.fullLabel}</span>
                      </>
                    ) : (
                      tab.label
                    )}
                  </button>
                ))}
              </div>
            )}
            <span className="leading-snug">
              Showing <strong className="text-[var(--ink)] font-bold">{visibleInProgress.length + visibleSubmissions.length}</strong>{' '}
              record{visibleInProgress.length + visibleSubmissions.length === 1 ? '' : 's'}
              <span className="hidden sm:inline">
                {' '}• Ordered by{' '}
                <strong className="text-[var(--ink)]">
                  {sortBy === 'roll_asc' ? 'Roll Number' : sortBy === 'time_desc' ? 'Newest First' : 'Oldest First'}
                </strong>
              </span>
            </span>
          </div>
          {(search || selectedQuizId !== 'all' || selectedSection !== 'all' || selectedClass !== 'all' || sortBy !== 'roll_asc' || statusFilter !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setSelectedQuizId('all');
                setSelectedSection('all');
                setSelectedClass('all');
                setSortBy('roll_asc');
                setStatusFilter('all');
              }}
              className="text-blue-500 hover:underline font-semibold cursor-pointer self-start sm:self-auto shrink-0"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Live Monitoring & Submissions List */}
      {isLoading && submissions.length === 0 && liveAttempts.length === 0 ? (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-10 sm:p-12 text-center space-y-3 shadow-xs">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-500 mx-auto" />
          <p className="text-xs font-semibold text-[var(--ink-muted)]">Loading student exam records...</p>
        </div>
      ) : hasAnyVisibleRows ? (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-xs">
          {/* Phone & Tablet Responsive Card Grid (1-col on phones & portrait tablet+sidebar; 2-col on small/landscape tablets; Zero Horizontal Scroll) */}
          <div className="xl:hidden grid grid-cols-1 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2 gap-3 p-2.5 sm:p-3.5 bg-[var(--bg)]/30">
            {/* Live In-Progress Cards */}
            {visibleInProgress.map((att) => {
              const className = classes.find((c) => c.id === att.classId)?.name || att.classId || 'Class';
              const cleanRoll = resolveStudentRollNo(att.studentRoll, att.studentId);
              const initial = (att.studentName || 'S').trim().charAt(0).toUpperCase();
              const pct = Math.min(100, Math.max(0, Number(att.progressPercentage || 0)));

              return (
                <div
                  key={`live-${att.attemptId}`}
                  className="p-3.5 rounded-2xl border border-cyan-500/30 bg-cyan-500/[0.04] hover:bg-cyan-500/[0.07] transition flex flex-col justify-between gap-3 shadow-2xs min-w-0"
                >
                  {/* Top Row: Student Info + Live Score */}
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className="w-9 h-9 rounded-lg bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30 flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
                        {initial}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-sm text-[var(--ink)] truncate max-w-full">
                            {att.studentName}
                          </span>
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 shrink-0">
                            <Clock className="w-2.5 h-2.5 animate-pulse" />
                            <span>In Progress</span>
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                          {cleanRoll !== '-' && (
                            <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                              Roll: {cleanRoll}
                            </span>
                          )}
                          <span className="text-[11px] text-[var(--ink-muted)] truncate">
                            {className}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
                        Live Score
                      </div>
                      <div className="font-mono font-bold text-sm text-[var(--ink)] leading-tight">
                        {att.liveScore ?? 0}
                        <span className="text-[11px] text-[var(--ink-muted)]"> / {att.maxScore ?? 0}</span>
                      </div>
                    </div>
                  </div>

                  {/* Progress & Questions Completed Row */}
                  <div className="bg-[var(--surface-higher)] px-3 py-2.5 rounded-xl border border-[var(--border)] space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="font-semibold text-[var(--ink)] truncate min-w-0 flex-1">
                        {att.quizTitle || 'Assessment Test'}
                      </span>
                      <span className="font-mono text-[11px] font-bold text-cyan-600 dark:text-cyan-400 shrink-0">
                        {att.answeredCount}/{att.totalQuestions} Qs ({pct}%)
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-[var(--border)] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-cyan-500 transition-all duration-300"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] text-[var(--ink-muted)] font-mono">
                      <span>Completed: {att.answeredCount}/{att.totalQuestions}</span>
                      {att.updatedAt && (
                        <span>
                          Synced {new Date(att.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Action Row */}
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setConfirmResetLiveAttempt(att)}
                      className="min-h-[38px] w-full sm:w-auto px-3 rounded-lg border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center gap-1.5 text-xs font-semibold transition cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Reset Attempt</span>
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Submitted Cards */}
            {visibleSubmissions.map((sub) => {
              const evalData = sub.evaluation;
              const percentage =
                evalData?.percentage ??
                (sub.maxScore ? Math.round(((sub.totalScore || 0) / sub.maxScore) * 100) : 0);
              const className = classes.find((c) => c.id === sub.classId)?.name || sub.classId;
              const effectiveGrade = evalData?.gradeLetter || calcGradeLetter(percentage);
              const gradeStyle = getGradeStyle(effectiveGrade);
              const cleanRoll = resolveStudentRollNo(sub.studentRoll, sub.studentId);
              const initial = (sub.studentName || 'S').trim().charAt(0).toUpperCase();
              const liveStat = submittedStatsById.get(sub.id);
              const totalQs = liveStat?.totalQuestions ?? (Array.isArray(evalData?.questions) ? evalData.questions.length : 0);
              const answeredQs =
                liveStat?.answeredCount ??
                (Array.isArray(evalData?.questions)
                  ? evalData.questions.filter((pq: any) => pq?.studentAnswer !== undefined && pq?.studentAnswer !== null && String(pq.studentAnswer).trim() !== '').length
                  : totalQs);
              const progressPct = totalQs > 0 ? Math.min(100, Math.round((answeredQs / totalQs) * 100)) : 100;

              return (
                <div
                  key={sub.id}
                  className="p-3.5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-higher)]/40 transition flex flex-col justify-between gap-3 shadow-2xs min-w-0"
                >
                  {/* Top Row: Student Info + Score */}
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className="w-9 h-9 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
                        {initial}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-sm text-[var(--ink)] truncate max-w-full">
                            {sub.studentName}
                          </span>
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 shrink-0">
                            <CheckCircle2 className="w-2.5 h-2.5" />
                            <span>Submitted</span>
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                          {cleanRoll !== '-' && (
                            <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                              Roll: {cleanRoll}
                            </span>
                          )}
                          <span className="text-[11px] text-[var(--ink-muted)] truncate">
                            {className}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right">
                        <div className="font-mono font-bold text-sm text-[var(--ink)] leading-tight">
                          {sub.totalScore ?? 0}
                          <span className="text-[11px] text-[var(--ink-muted)]"> / {sub.maxScore ?? 0}</span>
                        </div>
                        <div className="font-mono text-[10px] font-semibold text-[var(--ink-muted)]">
                          {percentage}%
                        </div>
                      </div>
                      <div
                        className={`w-7 h-7 rounded-lg border flex items-center justify-center font-bold text-xs shrink-0 ${gradeStyle.bg}`}
                      >
                        {effectiveGrade}
                      </div>
                    </div>
                  </div>

                  {/* Middle Row: Assessment Title, Completion Progress & Timestamp */}
                  <div className="space-y-1.5 bg-[var(--surface-higher)] px-2.5 py-2 rounded-xl border border-[var(--border)]">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                      <span className="font-semibold text-[var(--ink)] truncate min-w-0 flex-1">
                        {sub.quizTitle || 'Assessment Test'}
                      </span>
                      <span className="text-[var(--ink-muted)] whitespace-nowrap shrink-0 font-mono text-[10.5px]">
                        {new Date(sub.submittedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })} •{' '}
                        {new Date(sub.submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    {totalQs > 0 && (
                      <div className="space-y-1">
                        <div className="h-1.5 w-full rounded-full bg-[var(--border)] overflow-hidden">
                          <div
                            className="h-full rounded-full bg-emerald-500"
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                        <div className="text-[10px] font-mono text-[var(--ink-muted)]">
                          Completed: {answeredQs}/{totalQs} Qs ({progressPct}%)
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Bottom Action Row */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleInspectSubmission(sub, false)}
                      disabled={hydratingSubmissionId === sub.id}
                      className="flex-1 min-w-[115px] min-h-[38px] px-2.5 sm:px-3 rounded-lg text-xs font-semibold bg-[var(--accent)] hover:opacity-90 text-white flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer active:scale-95 disabled:opacity-60"
                    >
                      {hydratingSubmissionId === sub.id ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
                      ) : (
                        <Eye className="w-3.5 h-3.5 shrink-0" />
                      )}
                      {isAdmin ? (
                        <>
                          <span className="xs:hidden">Inspect</span>
                          <span className="hidden xs:inline">Inspect &amp; Grade</span>
                        </>
                      ) : (
                        <span>View Paper</span>
                      )}
                    </button>

                    {isAdmin && (
                      <>
                        <a
                          href={getAuthenticatedPrintUrl(`/api/print/submission/${sub.id}`)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-h-[38px] px-2.5 sm:px-3 rounded-lg border border-[var(--border)] bg-[var(--surface-higher)] hover:bg-[var(--surface-highest)] text-[var(--ink)] text-xs font-semibold flex items-center justify-center gap-1.5 shadow-2xs transition cursor-pointer shrink-0"
                          title="Print paper"
                        >
                          <Printer className="w-3.5 h-3.5 text-blue-500" />
                          <span className="hidden xs:inline">Print</span>
                        </a>
                        <button
                          type="button"
                          onClick={() => setConfirmRetestSub(sub)}
                          className="min-h-[38px] w-[38px] rounded-lg border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shadow-2xs transition cursor-pointer shrink-0"
                          title="Allow retest"
                          aria-label="Allow retest"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteSub(sub)}
                          className="min-h-[38px] w-[38px] rounded-lg border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 flex items-center justify-center transition cursor-pointer shrink-0"
                          title="Delete submission"
                          aria-label="Delete submission"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Table View (shown only at xl >= 1280px where sidebar + 6-column table fit cleanly) */}
          <div className="hidden xl:block overflow-x-auto overscroll-x-contain">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--surface-higher)] text-[11px] font-bold text-[var(--ink-muted)] uppercase tracking-wider">
                  <th className="py-3 px-3 lg:px-4">Student</th>
                  <th className="py-3 px-3 lg:px-4">Class &amp; Assessment</th>
                  <th className="py-3 px-3 lg:px-4">Status</th>
                  <th className="py-3 px-3 lg:px-4 min-w-[165px]">Progress</th>
                  <th className="py-3 px-3 lg:px-4 text-center">{isAdmin ? 'Live / Final Score' : 'Score'}</th>
                  <th className="py-3 px-3 lg:px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)] text-xs">
                {/* Live In-Progress Rows */}
                {visibleInProgress.map((att) => {
                  const className = classes.find((c) => c.id === att.classId)?.name || att.classId || 'Class';
                  const cleanRoll = resolveStudentRollNo(att.studentRoll, att.studentId);
                  const initial = (att.studentName || 'S').trim().charAt(0).toUpperCase();
                  const pct = Math.min(100, Math.max(0, Number(att.progressPercentage || 0)));

                  return (
                    <tr
                      key={`live-${att.attemptId}`}
                      className="bg-cyan-500/[0.03] hover:bg-cyan-500/[0.07] transition h-16"
                    >
                      {/* Student Column */}
                      <td className="py-2.5 px-3 lg:px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30 flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
                            {initial}
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-[var(--ink)] truncate max-w-[160px] lg:max-w-[210px]">
                              {att.studentName}
                            </div>
                            {cleanRoll !== '-' && (
                              <span className="font-mono text-[10px] font-bold px-1.5 py-0.2 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 inline-block">
                                Roll: {cleanRoll}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Class & Assessment Column */}
                      <td className="py-2.5 px-3 lg:px-4">
                        <div className="font-semibold text-[var(--ink)] truncate max-w-[180px] lg:max-w-[230px]">
                          {att.quizTitle || 'Assessment Test'}
                        </div>
                        <div className="text-[11px] text-[var(--ink-muted)] truncate max-w-[180px] lg:max-w-[230px]">
                          {className}
                        </div>
                      </td>

                      {/* Status Column */}
                      <td className="py-2.5 px-3 lg:px-4 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                          <Clock className="w-3 h-3 animate-pulse" />
                          <span>In Progress</span>
                        </span>
                        {att.updatedAt && (
                          <div className="text-[10px] text-[var(--ink-muted)] mt-0.5 font-mono">
                            {new Date(att.updatedAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                            })}
                          </div>
                        )}
                      </td>

                      {/* Progress Column */}
                      <td className="py-2.5 px-3 lg:px-4">
                        <div className="space-y-1 max-w-[190px]">
                          <div className="flex items-center justify-between text-[11px] font-mono">
                            <span className="font-bold text-[var(--ink)]">
                              {att.answeredCount}/{att.totalQuestions}
                            </span>
                            <span className="font-semibold text-cyan-600 dark:text-cyan-400">{pct}%</span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-[var(--border)] overflow-hidden">
                            <div
                              className="h-full rounded-full bg-cyan-500 transition-all duration-300"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Live Score Column */}
                      <td className="py-2.5 px-3 lg:px-4 text-center whitespace-nowrap">
                        <div className="inline-flex flex-col items-center">
                          <div className="font-mono font-bold text-cyan-600 dark:text-cyan-400 text-sm">
                            {att.liveScore ?? 0}{' '}
                            <span className="text-[10px] text-[var(--ink-muted)]">/ {att.maxScore ?? 0}</span>
                          </div>
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
                            Live Score
                          </span>
                        </div>
                      </td>

                      {/* Actions Column */}
                      <td className="py-2.5 px-3 lg:px-4 text-right">
                        <button
                          type="button"
                          onClick={() => setConfirmResetLiveAttempt(att)}
                          className="h-8 px-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-semibold inline-flex items-center gap-1.5 shadow-2xs transition cursor-pointer"
                          title="Reset in-progress exam attempt"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Reset</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {/* Submitted Rows */}
                {visibleSubmissions.map((sub) => {
                  const evalData = sub.evaluation;
                  const percentage =
                    evalData?.percentage ??
                    (sub.maxScore ? Math.round(((sub.totalScore || 0) / sub.maxScore) * 100) : 0);
                  const className = classes.find((c) => c.id === sub.classId)?.name || sub.classId;
                  const effectiveGrade = evalData?.gradeLetter || calcGradeLetter(percentage);
                  const gradeStyle = getGradeStyle(effectiveGrade);
                  const cleanRoll = resolveStudentRollNo(sub.studentRoll, sub.studentId);
                  const initial = (sub.studentName || 'S').trim().charAt(0).toUpperCase();
                  const liveStat = submittedStatsById.get(sub.id);
                  const totalQs = liveStat?.totalQuestions ?? (Array.isArray(evalData?.questions) ? evalData.questions.length : 0);
                  const answeredQs =
                    liveStat?.answeredCount ??
                    (Array.isArray(evalData?.questions)
                      ? evalData.questions.filter((pq: any) => pq?.studentAnswer !== undefined && pq?.studentAnswer !== null && String(pq.studentAnswer).trim() !== '').length
                      : totalQs);
                  const progressPct = totalQs > 0 ? Math.min(100, Math.round((answeredQs / totalQs) * 100)) : 100;

                  return (
                    <tr
                      key={sub.id}
                      className="hover:bg-[var(--surface-higher)]/50 transition h-16"
                    >
                      {/* Student Column */}
                      <td className="py-2.5 px-3 lg:px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
                            {initial}
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-[var(--ink)] truncate max-w-[160px] lg:max-w-[210px]">
                              {sub.studentName}
                            </div>
                            {cleanRoll !== '-' && (
                              <span className="font-mono text-[10px] font-bold px-1.5 py-0.2 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 inline-block">
                                Roll: {cleanRoll}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Class & Assessment Column */}
                      <td className="py-2.5 px-3 lg:px-4">
                        <div className="font-semibold text-[var(--ink)] truncate max-w-[180px] lg:max-w-[230px]">
                          {sub.quizTitle || 'Assessment Test'}
                        </div>
                        <div className="text-[11px] text-[var(--ink-muted)] truncate max-w-[180px] lg:max-w-[230px]">
                          {className}
                        </div>
                      </td>

                      {/* Status Column */}
                      <td className="py-2.5 px-3 lg:px-4 whitespace-nowrap text-[var(--ink-muted)] text-[11px]">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Submitted</span>
                        </span>
                        <div className="text-[10px] text-[var(--ink-muted)] mt-0.5 font-mono">
                          {new Date(sub.submittedAt).toLocaleDateString([], {
                            month: 'short',
                            day: 'numeric',
                          })}{' '}
                          •{' '}
                          {new Date(sub.submittedAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </td>

                      {/* Progress Column */}
                      <td className="py-2.5 px-3 lg:px-4">
                        {totalQs > 0 ? (
                          <div className="space-y-1 max-w-[190px]">
                            <div className="flex items-center justify-between text-[11px] font-mono">
                              <span className="font-bold text-[var(--ink)]">
                                {answeredQs}/{totalQs}
                              </span>
                              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                                {progressPct}%
                              </span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-[var(--border)] overflow-hidden">
                              <div
                                className="h-full rounded-full bg-emerald-500"
                                style={{ width: `${progressPct}%` }}
                              />
                            </div>
                          </div>
                        ) : (
                          <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
                            Completed
                          </span>
                        )}
                      </td>

                      {/* Score Column */}
                      <td className="py-2.5 px-3 lg:px-4 text-center whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          <div className="text-right">
                            <div className="font-mono font-bold text-[var(--ink)]">
                              {sub.totalScore ?? 0}{' '}
                              <span className="text-[10px] text-[var(--ink-muted)]">
                                / {sub.maxScore ?? 0}
                              </span>
                            </div>
                            <div className="font-mono text-[10px] font-semibold text-[var(--ink-muted)]">
                              {percentage}%
                            </div>
                          </div>
                          <div
                            className={`w-7 h-7 rounded-lg border flex items-center justify-center font-bold text-xs shrink-0 ${gradeStyle.bg}`}
                          >
                            {effectiveGrade}
                          </div>
                        </div>
                      </td>

                      {/* Actions Column */}
                      <td className="py-2.5 px-3 lg:px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Inspect Button */}
                          <button
                            type="button"
                            onClick={() => handleInspectSubmission(sub, false)}
                            disabled={hydratingSubmissionId === sub.id}
                            className="h-8 px-2.5 rounded-lg text-xs font-semibold bg-[var(--accent)] hover:opacity-90 text-white flex items-center gap-1 shadow-2xs cursor-pointer active:scale-95 shrink-0"
                            title={isAdmin ? 'Inspect test paper & edit marks' : 'View graded test paper'}
                          >
                            <Eye className="w-3.5 h-3.5 shrink-0" />
                            <span>{isAdmin ? 'Inspect' : 'View'}</span>
                          </button>

                          {isAdmin && (
                            <>
                              <a
                                href={getAuthenticatedPrintUrl(`/api/print/submission/${sub.id}`)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="h-8 px-2 rounded-lg border border-[var(--border)] bg-[var(--surface-higher)] hover:bg-[var(--surface-highest)] text-[var(--ink)] text-xs font-semibold flex items-center justify-center shadow-2xs transition cursor-pointer shrink-0"
                                title="Print paper"
                              >
                                <Printer className="w-3.5 h-3.5 text-blue-500" />
                              </a>
                              <button
                                type="button"
                                onClick={() => setConfirmRetestSub(sub)}
                                className="h-8 px-2 rounded-lg border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-semibold flex items-center justify-center shadow-2xs transition cursor-pointer shrink-0"
                                title="Allow retest"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteSub(sub)}
                                className="h-8 w-8 rounded-lg border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 flex items-center justify-center transition cursor-pointer shrink-0"
                                title="Delete submission"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Empty State */
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-8 sm:p-14 text-center space-y-3 shadow-xs max-w-lg mx-auto">
          <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-500 border border-blue-500/20 flex items-center justify-center mx-auto">
            <Award className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-base text-[var(--ink)]">
            {statusFilter === 'in_progress' ? 'No exams currently in progress' : 'No submissions found'}
          </h3>
          <p className="text-xs text-[var(--ink-muted)] max-w-sm mx-auto">
            {search
              ? 'No student records match your current search filters.'
              : statusFilter === 'in_progress'
              ? 'Active student examinations will appear here live as soon as students start a test.'
              : isAdmin
              ? 'Live active attempts and completed student tests will appear here automatically.'
              : 'You have not submitted any tests yet. Return to the Tests tab to begin an assessment.'}
          </p>
        </div>
      )}

      {/* CONFIRM RESET IN-PROGRESS ATTEMPT MODAL */}
      {confirmResetLiveAttempt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl sm:rounded-3xl p-4 sm:p-6 max-w-md w-full max-h-[90vh] overflow-y-auto space-y-4 shadow-2xl text-[var(--ink)]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0">
                <RotateCcw className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-base text-[var(--ink)]">Reset In-Progress Attempt?</h3>
                <p className="text-xs text-[var(--ink-muted)]">Clears active session for this student</p>
              </div>
            </div>

            <p className="text-xs text-[var(--ink-muted)] leading-relaxed bg-[var(--surface-higher)] p-3.5 rounded-xl border border-[var(--border)] break-words">
              Resetting the active attempt for <strong className="text-[var(--ink)]">{confirmResetLiveAttempt.studentName}</strong> on{' '}
              <strong className="text-[var(--ink)]">{confirmResetLiveAttempt.quizTitle}</strong> will clear their saved draft progress and let them start fresh.
            </p>

            <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-end gap-2 sm:gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmResetLiveAttempt(null)}
                disabled={isProcessingAction}
                className="w-full sm:w-auto px-4 py-2 text-xs font-semibold rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-higher)] text-[var(--ink)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleResetLiveAttempt(confirmResetLiveAttempt)}
                disabled={isProcessingAction}
                className="btn btn-primary w-full sm:w-auto px-4 py-2 text-xs font-bold rounded-xl cursor-pointer justify-center"
              >
                {isProcessingAction ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Resetting...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Reset Attempt</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM RETEST MODAL */}
      {confirmRetestSub && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl sm:rounded-3xl p-4 sm:p-6 max-w-md w-full max-h-[90vh] overflow-y-auto space-y-4 shadow-2xl text-[var(--ink)]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0">
                <RotateCcw className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-base text-[var(--ink)]">Allow Assessment Retest?</h3>
                <p className="text-xs text-[var(--ink-muted)]">Grant retake permission</p>
              </div>
            </div>

            <p className="text-xs text-[var(--ink-muted)] leading-relaxed bg-[var(--surface-higher)] p-3.5 rounded-xl border border-[var(--border)] break-words">
              Allowing a retest for <strong className="text-[var(--ink)]">{confirmRetestSub.studentName}</strong> (Roll No:{' '}
              <strong className="text-blue-500">{confirmRetestSub.studentRoll || '-'}</strong>) will reset their previous score for{' '}
              <strong className="text-[var(--ink)]">{confirmRetestSub.quizTitle}</strong>, allowing them to take the exam again.
            </p>

            <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-end gap-2 sm:gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmRetestSub(null)}
                disabled={isProcessingAction}
                className="w-full sm:w-auto px-4 py-2 text-xs font-semibold rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-higher)] text-[var(--ink)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleAllowRetest(confirmRetestSub)}
                disabled={isProcessingAction}
                className="btn btn-primary w-full sm:w-auto px-4 py-2 text-xs font-bold rounded-xl cursor-pointer justify-center"
              >
                {isProcessingAction ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Resetting...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Allow Retest</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE MODAL */}
      {confirmDeleteSub && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl sm:rounded-3xl p-4 sm:p-6 max-w-md w-full max-h-[90vh] overflow-y-auto space-y-4 shadow-2xl text-[var(--ink)]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/15 text-rose-500 border border-rose-500/30 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-base text-[var(--ink)]">Delete Submission Record?</h3>
                <p className="text-xs text-[var(--ink-muted)]">Action cannot be undone</p>
              </div>
            </div>

            <p className="text-xs text-[var(--ink-muted)] leading-relaxed bg-[var(--surface-higher)] p-3.5 rounded-xl border border-[var(--border)] break-words">
              Are you sure you want to delete the submission for{' '}
              <strong className="text-[var(--ink)]">{confirmDeleteSub.studentName}</strong>? Their score (
              {confirmDeleteSub.totalScore}/{confirmDeleteSub.maxScore}) and submitted answers will be permanently deleted.
            </p>

            <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-end gap-2 sm:gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteSub(null)}
                disabled={isProcessingAction}
                className="w-full sm:w-auto px-4 py-2 text-xs font-semibold rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-higher)] text-[var(--ink)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteSubmission(confirmDeleteSub)}
                disabled={isProcessingAction}
                className="w-full sm:w-auto px-4 py-2 text-xs font-bold rounded-xl border border-rose-500 bg-rose-600 hover:bg-rose-500 text-white cursor-pointer flex items-center justify-center gap-1.5"
              >
                {isProcessingAction ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Record</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE ALL MODAL */}
      {confirmDeleteAll && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl sm:rounded-3xl p-4 sm:p-6 max-w-md w-full max-h-[90vh] overflow-y-auto space-y-4 shadow-2xl text-[var(--ink)]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/15 text-rose-500 border border-rose-500/30 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-base text-[var(--ink)]">
                  Delete All {filteredSubmissions.length} Submitted Paper{filteredSubmissions.length === 1 ? '' : 's'}?
                </h3>
                <p className="text-xs text-[var(--ink-muted)]">Permanently removes records from database</p>
              </div>
            </div>

            <p className="text-xs text-[var(--ink-muted)] leading-relaxed bg-[var(--surface-higher)] p-3.5 rounded-xl border border-[var(--border)] break-words">
              This will permanently delete <strong className="text-[var(--ink)]">{filteredSubmissions.length}</strong> currently listed student submission record{filteredSubmissions.length === 1 ? '' : 's'} (and their attempt records) from the database. This action cannot be undone.
            </p>

            <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-end gap-2 sm:gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteAll(false)}
                disabled={isProcessingAction}
                className="w-full sm:w-auto px-4 py-2 text-xs font-semibold rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-higher)] text-[var(--ink)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteAllSubmissions}
                disabled={isProcessingAction}
                className="w-full sm:w-auto px-4 py-2 text-xs font-bold rounded-xl border border-rose-500 bg-rose-600 hover:bg-rose-500 text-white cursor-pointer flex items-center justify-center gap-1.5"
              >
                {isProcessingAction ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting All...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete All ({filteredSubmissions.length})</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Teacher Grade & Inspect Modal */}
      {selectedSubmissionForGrade && (
        <TeacherGradeModal
          key={selectedSubmissionForGrade.id}
          isOpen={!!selectedSubmissionForGrade}
          onClose={() => setSelectedSubmissionForGrade(null)}
          submission={selectedSubmissionForGrade}
          classes={classes}
          isAdmin={isAdmin}
          autoPrint={autoPrintForGrade}
          onGradeUpdated={() => {
            setSelectedSubmissionForGrade(null);
            loadData(false);
          }}
        />
      )}
    </div>
  );
};
