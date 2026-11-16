import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { QuizSubmission, QuizEvaluationReport, ClassItem } from '../types';
import { updateSubmissionGrade, fetchQuizById, fetchSubmissionById, getAuthenticatedPrintUrl } from '../lib/api';
import { generateDynamicPaginationScript } from '../lib/dynamicPrintPaginator';
import {
  X,
  Award,
  Calendar,
  User,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Printer,
  Save,
  Edit3,
  BookOpen,
  HelpCircle,
  Hash,
  Layers,
  FileCheck,
  Check,
  AlertTriangle,
  ChevronRight,
  TrendingUp,
  Lightbulb,
  Download,
  RefreshCw,
  Eye,
  MinusCircle,
  PlusCircle,
  RotateCcw,
  Image as ImageIcon,
  ExternalLink,
  FileText,
  ArrowLeft,
  School,
} from 'lucide-react';
import { printHtml, downloadHtmlFile } from '../lib/printService';

interface TeacherGradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  submission: QuizSubmission;
  classes: ClassItem[];
  isAdmin: boolean;
  onGradeUpdated: () => void;
  autoPrint?: boolean;
}

import {
  escapeHtml,
  isOptionSelected,
  isOptionCorrectKey,
  resolveStudentRollNo,
  parseMatchFollowingQuestion,
  compareSubmissionsForPrint,
  renderStudentAnswerPagesHtml,
  buildFullPrintHtmlDocument,
  generatePrintableStudentAnswerHtml,
  generateBatchPrintableStudentAnswersHtml,
  cleanOptionText,
  cleanQuestionPrompt,
  calcGradeLetter,
  calculateQuizScore,
  evaluateSingleQuestion,
  type PrintAnswerSheetOptions,
  type MatchFollowingParsedData
} from '../lib/printEngine';

export {
  escapeHtml,
  isOptionSelected,
  isOptionCorrectKey,
  resolveStudentRollNo,
  parseMatchFollowingQuestion,
  compareSubmissionsForPrint,
  renderStudentAnswerPagesHtml,
  buildFullPrintHtmlDocument,
  generatePrintableStudentAnswerHtml,
  generateBatchPrintableStudentAnswersHtml,
  cleanOptionText,
  cleanQuestionPrompt,
  calcGradeLetter,
  calculateQuizScore,
  evaluateSingleQuestion,
  type PrintAnswerSheetOptions,
  type MatchFollowingParsedData
};

export const TeacherGradeModal: React.FC<TeacherGradeModalProps> = ({
  isOpen,
  onClose,
  submission,
  classes,
  isAdmin,
  onGradeUpdated,
  autoPrint = false,
}) => {
  const rawEval = submission.evaluation || submission.aiEvaluation;
  const initialEval = rawEval || {
    submissionId: submission.id,
    quizId: submission.quizId,
    quizTitle: submission.quizTitle || 'Assessment',
    studentName: submission.studentName,
    studentRoll: resolveStudentRollNo(submission.studentRoll, submission.studentId),
    classId: submission.classId,
    subject: submission.subject || 'General',
    submittedAt: submission.submittedAt,
    totalScore: submission.totalScore || 0,
    maxScore: submission.maxScore || 0,
    percentage: submission.maxScore ? Math.round(((submission.totalScore || 0) / submission.maxScore) * 100) : 0,
    gradeLetter: 'B',
    overallFeedback: 'Assessment completed.',
    questions: [],
  };

  const [evaluation, setEvaluation] = useState<QuizEvaluationReport>(initialEval);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState<boolean>(false);
  const [showPrintPreview, setShowPrintPreview] = useState<boolean>(false);
  const [schoolName, setSchoolName] = useState<string>('ACADEMIC EVALUATION & ASSESSMENT BOARD');
  const [paperStyle, setPaperStyle] = useState<'classic' | 'twocolumn' | 'modern'>('twocolumn');
  const penColor = 'red';
  const [fontSize, setFontSize] = useState<'compact' | 'normal' | 'large'>('normal');
  const [showKeyForWrong, setShowKeyForWrong] = useState<boolean>(false);
  const [pageSize, setPageSize] = useState<number>(0);

  const currentClass = classes.find((c) => c.id === submission.classId);
  const classNameStr = currentClass?.name || submission.classId || 'Class';

  const activeSubIdRef = useRef<string>(submission.id);
  const hasAutoPrintedRef = useRef<boolean>(false);

  useEffect(() => {
    hasAutoPrintedRef.current = false;
  }, [submission.id, isOpen]);

  // Load and populate questions if missing or incomplete, ensuring images/figures are preserved
  const loadQuestionsData = async (targetSubId: string) => {
    setIsLoadingQuestions(true);
    try {
      const targetQuizId = submission.quizId || (submission as any).quiz_id;
      // 1. Fetch quiz structure once to get original questions with images, diagrams, and options
      let quizQuestionsMap: Record<string, any> = {};
      let quizQuestions: any[] = [];
      if (targetQuizId) {
        try {
          const quizData = await fetchQuizById(targetQuizId, !isAdmin);
          quizQuestions = Array.isArray(quizData?.questions) ? quizData.questions : [];
          quizQuestions.forEach((qq: any, qIdx: number) => {
            if (qq.id) quizQuestionsMap[qq.id] = qq;
            quizQuestionsMap[String(qIdx)] = qq;
            if (qq.questionText) {
              quizQuestionsMap[qq.questionText.trim().toLowerCase()] = qq;
            }
          });
        } catch (err) {
          console.warn('Could not fetch quiz questions metadata:', err);
        }
      }

      if (activeSubIdRef.current !== targetSubId) return;

      // 2. Fetch submission evaluation from authenticated /api/submissions/:id
      try {
        const subData = await fetchSubmissionById(targetSubId);
        if (activeSubIdRef.current !== targetSubId) return;
        const evalData = subData.evaluation || subData.aiEvaluation;
        if (evalData && Array.isArray(evalData.questions) && evalData.questions.length > 0) {
          // Enforce canonical teacher question order when quizQuestions is available
          let orderedEvalQuestions: any[] = evalData.questions;
          if (quizQuestions.length > 0) {
            const evalById = new Map<string, any>();
            evalData.questions.forEach((eq: any) => {
              if (eq?.questionId) evalById.set(String(eq.questionId), eq);
            });
            const usedEvalIds = new Set<string>();
            orderedEvalQuestions = [];
            quizQuestions.forEach((qq: any) => {
              const matched = evalById.get(String(qq.id));
              if (matched) {
                usedEvalIds.add(String(qq.id));
                orderedEvalQuestions.push(matched);
              }
            });
            evalData.questions.forEach((eq: any) => {
              if (!eq?.questionId || !usedEvalIds.has(String(eq.questionId))) {
                orderedEvalQuestions.push(eq);
              }
            });
          }

          // Merge images and canonical options metadata from quizQuestionsMap
          const enrichedQuestions = orderedEvalQuestions.map((q: any, idx: number) => {
            const match = quizQuestionsMap[q.questionId] || quizQuestionsMap[String(idx)] || (q.questionText ? quizQuestionsMap[q.questionText.trim().toLowerCase()] : null);
            return {
              ...q,
              imageUrl: q.imageUrl || match?.imageUrl || match?.image || match?.figureUrl || match?.diagramUrl,
              optionImages: q.optionImages || match?.optionImages,
              options: (Array.isArray(match?.options) && match.options.length > 0)
                ? match.options
                : (Array.isArray(q.options) && q.options.length > 0 ? q.options : undefined),
            };
          });

          setEvaluation({
            ...evalData,
            questions: enrichedQuestions,
          });
          setIsLoadingQuestions(false);
          return;
        }
      } catch (err) {
        console.warn('Could not fetch detailed submission:', err);
      }

      // 3. Fallback: If evaluation has no questions, construct them from already-fetched quizQuestions
      if (quizQuestions.length > 0) {
        if (activeSubIdRef.current !== targetSubId) return;
        const studentAnswers = typeof submission.studentAnswers === 'string'
          ? JSON.parse(submission.studentAnswers)
          : submission.studentAnswers || {};

        const constructedQuestions = quizQuestions.map((q: any, idx: number) => {
          const sAns = studentAnswers[q.id];
          return evaluateSingleQuestion(q, sAns, idx);
        });

        const scoreInfo = calculateQuizScore(constructedQuestions);

        setEvaluation((prev) => ({
          ...prev,
          totalScore: prev.totalScore > 0 ? prev.totalScore : scoreInfo.totalScore,
          maxScore: prev.maxScore > 0 ? prev.maxScore : scoreInfo.maxScore,
          percentage: scoreInfo.percentage,
          gradeLetter: scoreInfo.gradeLetter,
          questions: constructedQuestions,
        }));
      }
    } catch (err) {
      console.error('Error fetching questions for submission:', err);
    } finally {
      if (activeSubIdRef.current === targetSubId) {
        setIsLoadingQuestions(false);
      }
    }
  };

  // Sync state whenever modal opens or submission changes
  useEffect(() => {
    if (!isOpen) return;
    activeSubIdRef.current = submission.id;
    const currentEval = submission.evaluation || submission.aiEvaluation || initialEval;
    setEvaluation(currentEval);
    // Always trigger data reload to guarantee figures, images, and options are present
    loadQuestionsData(submission.id);
  }, [isOpen, submission.id]);

  // Direct Print Handler - reliably opens native browser print dialog in top-level tab or via print staging
  const handleDirectPrint = () => {
    if (!isAdmin) return;
    const printUrl = getAuthenticatedPrintUrl(`/api/print/submission/${submission.id}?style=${paperStyle}&fontSize=${fontSize}`);
    let opened = false;
    try {
      const win = window.open(printUrl, '_blank');
      if (win) {
        win.focus();
        opened = true;
      }
    } catch {}

    if (!opened) {
      const printDoc = generatePrintableStudentAnswerHtml(evaluation, submission, classNameStr, {
        schoolName,
        paperStyle,
        penColor,
        fontSize,
        showKeyForWrong,
        pageSize,
      });
      const safeName = (submission.studentName || 'Student').replace(/[^a-zA-Z0-9]/g, '_');
      const safeQuiz = (submission.quizTitle || 'Quiz').replace(/[^a-zA-Z0-9]/g, '_');
      printHtml(printDoc, {
        title: `Answer Sheet - ${submission.studentName}`,
        fallbackFilename: `Answer_Sheet_${safeName}_${safeQuiz}.html`,
      });
    }
  };

  // Open Standalone Printable HTML in New Tab / Print Dialog
  const handleOpenPrintInNewTab = () => {
    if (!isAdmin) return;
    const printUrl = getAuthenticatedPrintUrl(`/api/print/submission/${submission.id}?style=${paperStyle}&fontSize=${fontSize}`);
    window.open(printUrl, '_blank');
  };

  // Open Parent Answer Sheet Preview
  const handleOpenPrintPreview = () => {
    if (!isAdmin) return;
    setShowPrintPreview(true);
  };

  // Download Standalone Printable HTML file
  const handleDownloadHtml = () => {
    if (!isAdmin) return;
    const htmlContent = generatePrintableStudentAnswerHtml(evaluation, submission, classNameStr, {
      schoolName,
      paperStyle,
      penColor,
      fontSize,
      showKeyForWrong,
      pageSize,
    });
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = (submission.studentName || 'Student').replace(/[^a-zA-Z0-9]/g, '_');
    const safeQuiz = (submission.quizTitle || 'Quiz').replace(/[^a-zA-Z0-9]/g, '_');
    a.href = url;
    a.download = `Answer_Sheet_${safeName}_${safeQuiz}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (isAdmin && isOpen && autoPrint && !hasAutoPrintedRef.current && !isLoadingQuestions && evaluation.questions.length > 0) {
      hasAutoPrintedRef.current = true;
      const timer = setTimeout(() => {
        handleDirectPrint();
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [isAdmin, isOpen, autoPrint, isLoadingQuestions, evaluation.questions.length]);

  if (!isOpen) return null;

  // Recalculate totals helper
  const recalculateReport = (updatedQuestions: typeof evaluation.questions, overallFeedback?: string) => {
    const scoreInfo = calculateQuizScore(updatedQuestions);

    return {
      ...evaluation,
      totalScore: scoreInfo.totalScore,
      maxScore: scoreInfo.maxScore,
      percentage: scoreInfo.percentage,
      gradeLetter: scoreInfo.gradeLetter,
      overallFeedback: overallFeedback !== undefined ? overallFeedback : evaluation.overallFeedback,
      questions: updatedQuestions,
    };
  };

  // Adjust score with automatic status assignment
  const handleScoreChange = (qIndex: number, newScore: number) => {
    const updated = [...evaluation.questions];
    const target = { ...updated[qIndex] };
    const max = target.maxPoints || 1;
    const clampedScore = Math.max(0, Math.min(max, Number(newScore)));
    
    target.pointsAwarded = clampedScore;
    if (clampedScore >= max) {
      target.isCorrect = true;
    } else if (clampedScore > 0) {
      target.isCorrect = 'partial';
    } else {
      target.isCorrect = false;
    }

    updated[qIndex] = target;
    setEvaluation(recalculateReport(updated));
  };

  // Quick deduction helper
  const handleQuickDeduct = (qIndex: number, amount: number) => {
    const current = Number(evaluation.questions[qIndex]?.pointsAwarded || 0);
    handleScoreChange(qIndex, current - amount);
  };

  // Quick addition helper
  const handleQuickAdd = (qIndex: number, amount: number) => {
    const current = Number(evaluation.questions[qIndex]?.pointsAwarded || 0);
    handleScoreChange(qIndex, current + amount);
  };

  // Quick full marks helper
  const handleSetFullMarks = (qIndex: number) => {
    const max = Number(evaluation.questions[qIndex]?.maxPoints || 1);
    handleScoreChange(qIndex, max);
  };

  // Quick zero marks helper
  const handleSetZeroMarks = (qIndex: number) => {
    handleScoreChange(qIndex, 0);
  };

  const handleFeedbackChange = (qIndex: number, newFeedback: string) => {
    const updated = [...evaluation.questions];
    updated[qIndex] = { ...updated[qIndex], feedback: newFeedback };
    setEvaluation({ ...evaluation, questions: updated });
  };

  const handleOverallFeedbackChange = (newFeedback: string) => {
    setEvaluation({ ...evaluation, overallFeedback: newFeedback });
  };

  const handleSaveGrade = async () => {
    setIsSaving(true);
    setSaveError(null);
    try {
      await updateSubmissionGrade(submission.id, {
        evaluation,
        totalScore: evaluation.totalScore,
        maxScore: evaluation.maxScore,
        status: 'graded',
      });
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        onGradeUpdated();
      }, 1200);
    } catch (err: any) {
      console.error('Error saving adjusted grade:', err);
      setSaveError(err?.message || 'Failed to save adjusted marks to database. Please retry.');
    } finally {
      setIsSaving(false);
    }
  };

  const getStatusBadge = (isCorrect: boolean | 'partial' | string, pointsAwarded: number, maxPoints: number) => {
    if (isCorrect === true || isCorrect === 'true' || pointsAwarded >= maxPoints) {
      return {
        label: 'Full Marks',
        bg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
        icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
      };
    }
    if (isCorrect === 'partial' || (pointsAwarded > 0 && pointsAwarded < maxPoints)) {
      return {
        label: 'Partial Marks',
        bg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30',
        icon: <AlertTriangle className="w-4 h-4 text-amber-500" />,
      };
    }
    return {
      label: 'Incorrect (0 Marks)',
      bg: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30',
      icon: <AlertCircle className="w-4 h-4 text-rose-500" />,
    };
  };


  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-2 sm:p-4 bg-black/75 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-200 print:p-0 print:static print:bg-white print:overflow-visible">
      <div
        id="teacher-grade-modal"
        className="bg-[var(--surface)] max-w-5xl lg:max-w-6xl xl:max-w-7xl w-full max-h-[92dvh] flex flex-col border border-[var(--border)] rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden my-auto print:max-h-none print:overflow-visible print:border-none print:shadow-none print:w-full print:max-w-none print:rounded-none print:my-0 text-[var(--ink)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* TOP HEADER */}
        <div className="px-3.5 sm:px-5 py-2.5 sm:py-3 border-b border-[var(--border)] flex flex-wrap items-center justify-between gap-2.5 bg-[var(--surface-higher)] text-[var(--ink)] shrink-0 print:hidden">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="p-2 rounded-lg bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30 shrink-0">
              <FileCheck className="w-4 h-4 text-blue-500" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h2 className="text-xs sm:text-sm font-bold tracking-tight truncate text-[var(--ink)]">Student Answer Paper &amp; Grade Review</h2>
                {isAdmin && (
                  <span className="text-[9.5px] font-mono font-bold px-1.5 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 shrink-0">
                    Teacher Mode • Editable
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[var(--ink-muted)] mt-0.5 truncate">
                {submission.quizTitle || 'Assessment'} • {currentClass?.name || submission.classId}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            {/* Live Score Pill in Header */}
            <div className="flex items-center gap-1.5 bg-[var(--surface)] border border-[var(--border)] px-2.5 py-1 rounded-lg shadow-2xs">
              <span className="text-[10.5px] font-bold text-[var(--ink-muted)] uppercase tracking-wider hidden sm:inline">Score:</span>
              <span className="font-mono font-bold text-xs text-[var(--ink)]">
                {evaluation.totalScore} / {evaluation.maxScore}
              </span>
              <span className="text-[10.5px] font-semibold text-[var(--ink-muted)]">
                ({evaluation.percentage}%)
              </span>
              <span className="px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 font-bold text-[11px] border border-amber-500/30">
                {evaluation.gradeLetter}
              </span>
            </div>

            {isAdmin && (
              <button
                type="button"
                onClick={handleDirectPrint}
                className="px-2.5 py-1.5 border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-higher)] text-[var(--ink)] rounded-lg transition cursor-pointer text-xs font-semibold flex items-center gap-1.5 shrink-0 shadow-2xs"
                title="Print official student answer paper"
              >
                <Printer className="w-3.5 h-3.5 text-blue-500" />
                <span className="hidden sm:inline">Print Paper</span>
                <span className="sm:hidden">Print</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="p-1.5 border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-higher)] text-[var(--ink-muted)] hover:text-[var(--ink)] rounded-lg transition cursor-pointer shrink-0 shadow-2xs"
              title="Close Dialog (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* IN-MODAL COMPACT EXAM ANSWER SHEET PREVIEW */}
        <div
          className={
            showPrintPreview
              ? 'flex-1 overflow-y-auto overflow-x-hidden bg-[var(--bg)] p-3 sm:p-5 space-y-3.5 print:p-0 print:m-0 print:overflow-visible print:bg-white print:block'
              : 'hidden print:block'
          }
        >
          {/* Clean Print Toolbar: ONLY School Name + Print Button */}
          <div className="bg-[var(--surface-higher)] p-4 sm:p-5 border border-[var(--border)] rounded-2xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 print:hidden shadow-xs">
            {/* School Name Input */}
            <div className="flex items-center gap-2 bg-[var(--surface)] border border-[var(--border)] rounded-xl px-3 py-2 flex-1 max-w-md shadow-2xs">
              <School className="w-4 h-4 text-blue-500 shrink-0" />
              <input
                type="text"
                value={schoolName}
                onChange={(e) => setSchoolName(e.target.value)}
                placeholder="Enter School / Institution Name"
                className="w-full bg-transparent text-xs sm:text-sm font-semibold text-[var(--ink)] placeholder-[var(--ink-muted)] outline-none"
              />
            </div>

            {/* Print & Back Buttons */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 shrink-0 justify-end">
              <button
                type="button"
                onClick={handleDirectPrint}
                className="btn btn-primary flex-1 xs:flex-none px-4 py-2 text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition cursor-pointer shadow-xs active:scale-95"
                title="Print directly using browser print dialog"
              >
                <Printer className="w-4 h-4 shrink-0" />
                <span>Print Exam Paper</span>
              </button>

              <button
                type="button"
                onClick={() => setShowPrintPreview(false)}
                className="flex-1 xs:flex-none px-3.5 py-2 border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-higher)] text-[var(--ink)] rounded-xl transition cursor-pointer text-xs font-semibold flex items-center justify-center gap-1.5 shadow-2xs"
                title="Return to grading editor"
              >
                <ArrowLeft className="w-4 h-4 text-blue-500 shrink-0" />
                <span>Back to Grading</span>
              </button>
            </div>
          </div>

            {/* AUTHENTIC PHYSICAL SHEET PREVIEW */}
            {(() => {
              const isContinuous = pageSize === 0;
              const questionList = evaluation.questions || [];
              const totalQuestions = questionList.length;

              const getQuestionWeight = (q: any): number => {
                const rawImg = q.imageUrl || (q as any).image || (q as any).figureUrl || (q as any).diagramUrl;
                const hasImg = typeof rawImg === 'string' && rawImg.trim().length > 0;
                if (Array.isArray(q.subEvaluations) && q.subEvaluations.length > 0) {
                  return 1.1 + (q.subEvaluations.length * 0.5) + (hasImg ? 0.5 : 0);
                }
                const md = parseMatchFollowingQuestion(q);
                if (md.isMatch && md.pairs.length > 0) {
                  return 1.2 + (md.pairs.length * 0.35);
                }
                if (Array.isArray(q.options) && q.options.length > 0) {
                  return hasImg ? 1.4 : 1.0;
                }
                return hasImg ? 1.4 : 1.0;
              };

              const previewPages: (typeof questionList)[] = [];
              if (totalQuestions === 0) {
                previewPages.push([]);
              } else if (!isContinuous && pageSize > 0) {
                for (let i = 0; i < totalQuestions; i += pageSize) {
                  previewPages.push(questionList.slice(i, i + pageSize));
                }
              } else {
                // Dynamic page pagination based on real question weights and heights:
                // Page 1 budget: accounts for examination masthead + margins. Holds up to ~14.5 weight units.
                // Page 2+ budget: full page content area (no masthead). Holds up to ~18.0 weight units.
                let currentPage: any[] = [];
                let currentWeight = 0;
                let isFirstPage = true;

                for (let i = 0; i < totalQuestions; i++) {
                  const q = questionList[i];
                  const w = getQuestionWeight(q);
                  const budget = isFirstPage ? (paperStyle === 'classic' ? 7.2 : 14.5) : (paperStyle === 'classic' ? 9.0 : 18.0);

                  if (currentPage.length > 0 && currentWeight + w > budget) {
                    previewPages.push(currentPage);
                    currentPage = [q];
                    currentWeight = w;
                    isFirstPage = false;
                  } else {
                    currentPage.push(q);
                    currentWeight += w;
                  }
                }
                if (currentPage.length > 0) {
                  previewPages.push(currentPage);
                }
              }

              const totalPages = previewPages.length;
              let cumulativeOffset = 0;

              return (
                <div id="printable-exam-paper" className="space-y-6 max-w-4xl mx-auto print:max-w-none print:w-full print:m-0 print:p-0">
                  {previewPages.map((pageQuestions, pageIdx) => {
                    const pageStartIdx = cumulativeOffset;
                    cumulativeOffset += pageQuestions.length;
                    const pageEndIdx = pageStartIdx + pageQuestions.length;

                    return (
                      <div key={pageIdx} className="space-y-2">
                        {/* Page Boundary Header Indicator */}
                        <div className="flex flex-wrap items-center justify-between gap-1.5 text-xs font-bold text-slate-500 px-1 print:hidden">
                          <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                            Sheet Page {pageIdx + 1} of {totalPages} (Questions {pageStartIdx + 1} to {pageEndIdx})
                          </span>
                          <span className="text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-full text-[10.5px]">
                            {pageQuestions.length} Questions on Sheet
                          </span>
                        </div>

                        {/* Physical A4 Sheet Container with strict equal 10mm academic paper margins */}
                        <div className="academic-paper-layout exam-page relative bg-white text-slate-900 font-sans min-h-[550px] p-3.5 pb-10 sm:p-[10mm] max-w-[210mm] w-full mx-auto rounded-xl border border-slate-300 shadow-md block">
                          <div>
                            {/* Academic Header (Page 1 gets full masthead, Page 2+ gets prestigious continuation masthead) */}
                            {pageIdx === 0 ? (
                              <div className="exam-masthead rounded-md overflow-hidden border-1.5 border-[#0b2545] bg-white mb-3 shadow-xs">
                                {/* Top Institutional Bar with Crest & Board Identity */}
                                <div className="p-2.5 sm:p-3.5 bg-white flex flex-col xs:flex-row justify-between items-start xs:items-center gap-2.5 border-b-2 border-[#0b2545]">
                                  <div className="flex items-center gap-3 min-w-0">
                                    {/* Academic Shield Crest */}
                                    <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-lg bg-[#0b2545] border-2 border-amber-600 text-amber-200 flex items-center justify-center shrink-0 shadow-sm">
                                      <BookOpen className="w-5 h-5 sm:w-6 sm:h-6 text-amber-200" />
                                    </div>

                                    {/* Title & Institution Hierarchy */}
                                    <div className="min-w-0">
                                      <div className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-amber-700 leading-tight">
                                        {schoolName || 'ACADEMIC EVALUATION & ASSESSMENT BOARD'}
                                      </div>
                                      <div className="text-base sm:text-lg font-black text-[#0b2545] tracking-tight leading-tight truncate mt-0.5">
                                        {submission.quizTitle || 'ACADEMIC EXAMINATION & ASSESSMENT'}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Right: Official Examiner Score Stamp (No Grade, Prominent Score) */}
                                  <div className="flex items-center shrink-0">
                                    <div className="bg-emerald-50 border-2 border-emerald-500 rounded-lg px-3 py-1 text-center shadow-xs whitespace-nowrap flex items-baseline gap-1.5">
                                      <span className="text-[9.5px] font-black uppercase text-emerald-800 tracking-wide">Score:</span>
                                      <span className="text-base sm:text-lg font-black text-emerald-800 leading-none">
                                        {evaluation.totalScore} <span className="text-xs font-bold text-slate-600">/ {evaluation.maxScore}</span>
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                {/* Classical Academic Double Rule Divider */}
                                <div className="h-[3px] border-t-2 border-b border-[#0b2545] bg-white" />

                                {/* Candidate Particulars Bar & Exam Date (Wraps cleanly on narrow phones, single line on sm+) */}
                                <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 sm:gap-2.5 text-[9.5px] bg-slate-50 px-3 py-1.5 border-b border-dashed border-slate-300">
                                  <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap min-w-0 flex-1">
                                    <div className="flex items-center gap-1 shrink-0">
                                      <span className="text-[8px] font-extrabold uppercase text-slate-500 tracking-wider">Candidate:</span>
                                      <strong className="text-[#0b2545] font-black truncate bg-white px-2 py-0.5 rounded border border-slate-300 text-xs shadow-2xs whitespace-nowrap">{submission.studentName}</strong>
                                    </div>
                                    <div className="hidden sm:block w-px h-3.5 bg-slate-300 shrink-0" />
                                    <div className="flex items-center gap-1 shrink-0">
                                      <span className="text-[8px] font-extrabold uppercase text-slate-500 tracking-wider">Roll No:</span>
                                      <span className="font-mono font-black text-[#0b2545] bg-white px-2 py-0.5 rounded border border-slate-300 text-xs shadow-2xs whitespace-nowrap">
                                        {resolveStudentRollNo(submission.studentRoll, submission.studentId)}
                                      </span>
                                    </div>
                                    <div className="hidden sm:block w-px h-3.5 bg-slate-300 shrink-0" />
                                    <div className="flex items-center gap-1 shrink-0">
                                      <span className="text-[8px] font-extrabold uppercase text-slate-500 tracking-wider">Class:</span>
                                      <strong className="text-slate-800 font-bold whitespace-nowrap">{classNameStr}</strong>
                                    </div>
                                    <div className="hidden sm:block w-px h-3.5 bg-slate-300 shrink-0" />
                                    <div className="flex items-center gap-1 shrink-0 min-w-0 overflow-hidden text-ellipsis">
                                      <span className="text-[8px] font-extrabold uppercase text-slate-500 tracking-wider">Subject:</span>
                                      <strong className="text-slate-800 font-bold truncate whitespace-nowrap">{submission.subject || evaluation.subject || 'General'}</strong>
                                    </div>
                                  </div>

                                  {/* Right: Exam Date */}
                                  <div className="flex items-center gap-1 shrink-0">
                                    <span className="text-[8px] font-extrabold uppercase text-slate-500 tracking-wider">Date:</span>
                                    <strong className="text-[#0b2545] font-black bg-white px-2 py-0.5 rounded border border-slate-300 text-xs shadow-2xs whitespace-nowrap">{new Date(submission.submittedAt).toLocaleDateString()}</strong>
                                  </div>
                                </div>
                              </div>
                            ) : null}

                            {/* Questions Grid/List for this Page */}
                            {(() => {
                              const renderPreviewQuestionCard = (q: any, globalIdx: number) => {
                                const maxPts = Number(q.maxPoints || 1);
                                const awardedPts = Number(q.pointsAwarded || 0);
                                const isCorrect = (q.isCorrect as any) === true || (q.isCorrect as any) === 'true' || awardedPts >= maxPts;
                                const isPartial = (q.isCorrect as any) === 'partial' || (awardedPts > 0 && awardedPts < maxPts);
                                const rawFig = q.imageUrl || (q as any).image || (q as any).figureUrl || (q as any).diagramUrl;
                                const imgUrl = typeof rawFig === 'string' && rawFig.trim().length > 0 ? rawFig.trim() : undefined;

                                const optionsItems = Array.isArray(q.options) && q.options.length > 0 ? q.options.map((opt: any, optIdx: number) => {
                                  const optLetter = String.fromCharCode(65 + optIdx);
                                  const isStudent = isOptionSelected(q.studentAnswer, opt, optIdx, q.selectedOptionId);
                                  const isKey = isOptionCorrectKey(q.correctAnswer, opt, optIdx);
                                  const optImg = (q.optionImages && q.optionImages[optIdx]) || (typeof opt === 'string' && (opt.startsWith('http://') || opt.startsWith('https://') || opt.startsWith('data:image/')) ? opt : null);
                                  const cleanOpt = cleanOptionText(opt);

                                  if (isStudent && isKey) {
                                    return (
                                      <div key={optIdx} className="p-1.5 sm:p-2 rounded border border-emerald-400 bg-emerald-100/80 text-slate-900 flex items-center justify-between gap-2 w-full min-w-0">
                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                          <span className="w-5 h-5 rounded-full bg-emerald-200 text-emerald-950 text-[9.5px] flex items-center justify-center font-black shrink-0">{optLetter}</span>
                                          <span className="font-bold text-slate-900 break-words whitespace-normal leading-snug text-xs sm:text-[12.5px] flex-1">
                                            {cleanOpt}
                                          </span>
                                          {optImg && (
                                            <img src={optImg} alt={`Option ${optLetter}`} className="h-6 max-w-[48px] object-contain border border-slate-300 rounded shrink-0 bg-white" referrerPolicy="no-referrer" />
                                          )}
                                        </div>
                                        <span className="text-xs text-emerald-700 font-black shrink-0">✓</span>
                                      </div>
                                    );
                                  }
                                  if (isStudent && !isKey) {
                                    return (
                                      <div key={optIdx} className="p-1.5 sm:p-2 rounded border border-rose-400 bg-rose-100/80 text-slate-900 flex items-center justify-between gap-2 w-full min-w-0">
                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                          <span className="w-5 h-5 rounded-full bg-rose-200 text-rose-950 text-[9.5px] flex items-center justify-center font-black shrink-0">{optLetter}</span>
                                          <span className="font-bold text-slate-900 break-words whitespace-normal leading-snug text-xs sm:text-[12.5px] flex-1">
                                            {cleanOpt}
                                          </span>
                                          {optImg && (
                                            <img src={optImg} alt={`Option ${optLetter}`} className="h-6 max-w-[48px] object-contain border border-slate-300 rounded shrink-0 bg-white" referrerPolicy="no-referrer" />
                                          )}
                                        </div>
                                        <span className="text-xs text-rose-600 font-black shrink-0">✖</span>
                                      </div>
                                    );
                                  }
                                  return (
                                    <div key={optIdx} className="p-1.5 sm:p-2 rounded border border-slate-200 bg-white flex items-center gap-2 text-slate-700 w-full min-w-0">
                                      <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-800 border border-slate-300 text-[9.5px] flex items-center justify-center font-bold shrink-0">{optLetter}</span>
                                      <span className="break-words whitespace-normal leading-snug text-xs sm:text-[12.5px] text-slate-800 flex-1">
                                        {cleanOpt}
                                      </span>
                                      {optImg && (
                                        <img src={optImg} alt={`Option ${optLetter}`} className="h-6 max-w-[48px] object-contain border border-slate-300 rounded shrink-0 bg-white" referrerPolicy="no-referrer" />
                                      )}
                                    </div>
                                  );
                                }) : null;

                                return (
                                  <div
                                    key={q.questionId || globalIdx}
                                    className="p-2 sm:p-3 rounded-md border border-slate-200 bg-white flex flex-col justify-start gap-1.5 self-start h-auto min-h-0 w-full"
                                  >
                                    {/* Header row: Navy rounded square number + Title + Score */}
                                    <div className="flex justify-between items-start gap-2">
                                      <div className="flex items-start gap-2 flex-1 min-w-0">
                                        <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-[#0b2545] text-white text-[11px] font-black shrink-0">
                                          {globalIdx + 1}
                                        </span>
                                        <div className="font-extrabold text-[#0b2545] leading-snug text-xs sm:text-[13px] break-words whitespace-normal">
                                          {cleanQuestionPrompt(q.questionText || `Question ${globalIdx + 1}`)}
                                        </div>
                                      </div>
                                      <div className="shrink-0">
                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[8.5px] font-extrabold border ${
                                          isCorrect
                                            ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                                            : isPartial
                                            ? 'bg-amber-50 border-amber-300 text-amber-800'
                                            : 'bg-rose-50 border-rose-300 text-rose-800'
                                        }`}>
                                          {isCorrect ? '✓ ' : isPartial ? '◒ ' : '✗ '}[ {awardedPts}/{maxPts} ]
                                        </span>
                                      </div>
                                    </div>

                                    {/* Question Options or Text Response */}
                                    {Array.isArray(q.options) && q.options.length > 0 ? (
                                      imgUrl ? (
                                        // Side-by-side on sm+/print: Stack cleanly on narrow mobile
                                        <div className="flex flex-col sm:flex-row print:flex-row gap-2.5 items-stretch mt-1.5 w-full">
                                          <div className="w-full sm:w-[40%] print:w-[40%] shrink-0 flex items-center justify-center bg-white border border-slate-300 rounded-md p-1.5 min-h-[75px] self-stretch">
                                            <img
                                              src={imgUrl}
                                              alt={`Figure for Q${globalIdx + 1}`}
                                              className="max-h-[75px] max-w-full w-auto h-auto object-contain rounded bg-white mx-auto block"
                                              referrerPolicy="no-referrer"
                                              loading="eager"
                                            />
                                          </div>
                                          <div className="flex-1 min-w-0 flex flex-col justify-between gap-1.5">
                                            {optionsItems}
                                          </div>
                                        </div>
                                      ) : (
                                        // 2x2 grid of options (matching Q1, Q2, Q3, etc. of reference)
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mt-1 text-[10px] w-full">
                                          {optionsItems}
                                        </div>
                                      )
                                    ) : Array.isArray(q.subEvaluations) && q.subEvaluations.length > 0 ? (
                                      <div className="mt-1 space-y-1">
                                        {imgUrl && (
                                          <div className="flex justify-center p-1 bg-white border border-slate-200 rounded my-1">
                                            <img
                                              src={imgUrl}
                                              alt={`Figure for Q${globalIdx + 1}`}
                                              className="max-h-12 max-w-full object-contain rounded bg-white"
                                              referrerPolicy="no-referrer"
                                              loading="eager"
                                            />
                                          </div>
                                        )}
                                        {q.subEvaluations.map((se: any, seIdx: number) => {
                                          const seAwarded = Number(se.pointsAwarded || 0);
                                          const seMax = Number(se.maxPoints || 1);
                                          const seIsCorr = se.isCorrect === true || se.isCorrect === 'true' || (seMax > 0 && seAwarded >= seMax);
                                          const seAnsStr = typeof se.studentAnswer === 'object' && se.studentAnswer !== null ? JSON.stringify(se.studentAnswer) : String(se.studentAnswer || '(No response)');

                                          return (
                                            <div key={seIdx} className={`p-1.5 rounded border text-[10px] ${seIsCorr ? 'border-emerald-300 bg-emerald-50/70 text-slate-900' : 'border-rose-300 bg-rose-50/70 text-slate-900'}`}>
                                              <div className="flex justify-between items-center gap-1 mb-0.5">
                                                <strong className="text-slate-800 text-[10px]">Part ({String.fromCharCode(97 + seIdx)}){se.label ? `: ${se.label}` : ''}</strong>
                                                <span className={`text-[8px] font-black px-1.5 py-0.2 rounded text-white ${seIsCorr ? 'bg-emerald-600' : 'bg-rose-600'}`}>
                                                  {seIsCorr ? '✓ ' : '✕ '}{seAwarded}/{seMax} pts
                                                </span>
                                              </div>
                                              {se.questionText && <div className="text-slate-600 italic text-[9px] mb-0.5">{se.questionText}</div>}
                                              <div className="flex items-center justify-between gap-2 text-[9.5px]">
                                                <div className="min-w-0 flex-1">
                                                  <span className={seIsCorr ? 'font-bold text-emerald-900' : 'font-bold text-rose-900'}>Student: </span>
                                                  <span>"{seAnsStr}"</span>
                                                </div>
                                                <span className={`font-black text-xs shrink-0 ${seIsCorr ? 'text-emerald-700' : 'text-rose-600'}`}>
                                                  {seIsCorr ? '✓' : '✕'}
                                                </span>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    ) : (() => {
                                      const md = parseMatchFollowingQuestion(q);
                                      return md.isMatch && md.pairs.length > 0;
                                    })() ? (() => {
                                      const { pairs, studentMap } = parseMatchFollowingQuestion(q);

                                      return (
                                        <div className="my-2 border border-slate-300 rounded-lg overflow-hidden bg-white shadow-2xs text-[10.5px]">
                                          <div className="px-3 py-1.5 bg-blue-50/80 border-b border-blue-200 flex items-center gap-1.5 text-[8.5px] text-blue-900 font-semibold">
                                            <span>ℹ️</span>
                                            <span><strong>Match Verification:</strong> Evaluated pairings for Column A with student responses and official answer key.</span>
                                          </div>
                                          <div className="grid grid-cols-2 bg-slate-100 border-b border-slate-300 font-extrabold text-slate-800 text-[9px] uppercase tracking-wider px-3 py-1.5">
                                            <div className="border-r border-slate-200">Column A (Premise / Items)</div>
                                            <div className="pl-3">Column B (Student Match & Verification)</div>
                                          </div>
                                          <div className="divide-y divide-slate-100">
                                            {pairs.map((p: any, pIdx: number) => {
                                              const studentChoice = studentMap[p.left] || '(Unanswered)';
                                              const isPairMatch = String(studentChoice).trim().toLowerCase() === String(p.right).trim().toLowerCase();
                                              return (
                                                <div key={pIdx} className={`grid grid-cols-2 items-center text-[9.5px] px-2.5 sm:px-3 py-2 ${isPairMatch ? 'bg-emerald-50/40' : 'bg-rose-50/40'}`}>
                                                  <div className="border-r border-slate-200 flex items-center gap-1.5 sm:gap-2 pr-2 sm:pr-2.5 min-w-0">
                                                    <span className="font-mono font-black text-blue-800 shrink-0 text-[10px]">({pIdx + 1})</span>
                                                    <span className="font-bold text-slate-900 leading-snug break-words min-w-0">{p.left}</span>
                                                    <span className="grow border-b-2 border-dotted border-slate-300 min-w-2 sm:min-w-4 mx-1" />
                                                  </div>
                                                  <div className="pl-2 sm:pl-2.5 flex flex-col justify-center gap-1 min-w-0">
                                                    <div className="flex flex-wrap items-center justify-between gap-1 sm:gap-1.5 min-w-0">
                                                      <span className={`font-semibold leading-snug break-words ${isPairMatch ? 'text-emerald-950 font-bold' : 'text-rose-950'}`}>
                                                        "{studentChoice}"
                                                      </span>
                                                      <span className={`text-[8.5px] font-black px-2 py-0.5 rounded shrink-0 shadow-2xs ${isPairMatch ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`}>
                                                        {isPairMatch ? '✓ Correct' : '✗ Incorrect'}
                                                      </span>
                                                    </div>
                                                  </div>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        </div>
                                      );
                                    })() : (
                                      <div className="mt-1 space-y-1">
                                        <div className={`p-1.5 rounded-lg flex items-center justify-between gap-1.5 text-[10.5px] font-semibold ${
                                          isCorrect ? 'bg-emerald-50 border border-emerald-200 text-emerald-900' : 'bg-rose-50 border border-rose-200 text-rose-900'
                                        }`}>
                                          <div className="truncate">
                                            <span className="text-slate-500 mr-1.5">Student Ans:</span>
                                            <strong>"{String(q.studentAnswer ?? '(unanswered)')}"</strong>
                                          </div>
                                          <span className="font-bold shrink-0">{isCorrect ? '✓ Correct' : '✗ Incorrect'}</span>
                                        </div>
                                      </div>
                                    )}

                                  </div>
                                );
                              };

                              if (paperStyle === 'classic') {
                                return (
                                  <div className="flex flex-col gap-3">
                                    {pageQuestions.map((q, idxInPage) => renderPreviewQuestionCard(q, pageStartIdx + idxInPage))}
                                  </div>
                                );
                              }

                              // Two-column layout: vertical ordering 1, 2, 3... down Left column, continuing 4, 5... down Right column
                              const mid = Math.ceil(pageQuestions.length / 2);
                              const leftQuestions = pageQuestions.slice(0, mid);
                              const rightQuestions = pageQuestions.slice(mid);

                              return (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs items-start">
                                  <div className="flex flex-col gap-3">
                                    {leftQuestions.map((q, idxInCol) => renderPreviewQuestionCard(q, pageStartIdx + idxInCol))}
                                  </div>
                                  {rightQuestions.length > 0 && (
                                    <div className="flex flex-col gap-3">
                                      {rightQuestions.map((q, idxInCol) => renderPreviewQuestionCard(q, pageStartIdx + mid + idxInCol))}
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </div>

                          {/* Subtle Light-Grey Student Name Tag centered inside bottom printable zone (0px layout impact) */}
                          <div className="absolute bottom-[5.5mm] left-0 right-0 px-[10mm] text-[9.5px] font-semibold text-slate-400 text-center pointer-events-none z-20">
                            {submission.studentName || 'Student'}{(() => { const r = resolveStudentRollNo(submission.studentRoll, submission.studentId); return r && r !== '-' ? ` (Roll: ${r})` : ''; })()}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>

        {/* MAIN GRADING & MARKS ADJUSTMENT VIEW */}
        {!showPrintPreview && (
          <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-4 sm:space-y-5 print:hidden">
            {/* STUDENT SUMMARY BANNER */}
            <div className="bg-[var(--surface-higher)] p-3.5 sm:p-5 border border-[var(--border)] rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 shadow-xs">
              <div className="flex items-center gap-3 min-w-0 w-full sm:w-auto">
                <div className="w-10 h-10 rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/25 flex items-center justify-center font-bold text-sm shadow-2xs shrink-0">
                  {submission.studentName ? submission.studentName[0].toUpperCase() : 'S'}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center flex-wrap gap-2">
                    <h3 className="font-bold text-sm sm:text-base text-[var(--ink)] truncate max-w-full">{submission.studentName}</h3>
                    <span className="text-[11px] font-mono px-2 py-0.5 font-bold bg-[var(--surface)] text-[var(--accent)] border border-[var(--border)] rounded-md shrink-0">
                      Roll: {resolveStudentRollNo(submission.studentRoll, submission.studentId)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--ink-muted)] mt-1 font-medium">
                    <span className="flex items-center gap-1">
                      <Layers className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      {classNameStr}
                    </span>
                    <span aria-hidden="true">•</span>
                    <span className="flex items-center gap-1">
                      <BookOpen className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      {submission.subject || evaluation.subject || 'General'}
                    </span>
                    <span aria-hidden="true">•</span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      {new Date(submission.submittedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Score Display on Right */}
              <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-[var(--border)]">
                <div className="text-left sm:text-right">
                  <div className="text-[10.5px] font-bold text-[var(--ink-muted)] uppercase tracking-wider">Score Awarded</div>
                  <div className="text-xl sm:text-2xl font-bold font-mono text-[var(--ink)] leading-none mt-0.5">
                    <span className="text-blue-600 dark:text-blue-400">{evaluation.totalScore}</span> / {evaluation.maxScore}{' '}
                    <span className="text-xs font-semibold text-[var(--ink-muted)]">({evaluation.percentage}%)</span>
                  </div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 font-bold text-base flex items-center justify-center shadow-2xs shrink-0">
                  {evaluation.gradeLetter}
                </div>
              </div>
            </div>

            {/* SECTION HEADER */}
            <div className="flex items-center justify-between pb-1">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <BookOpen className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-sm sm:text-base text-[var(--ink)]">
                  Questions &amp; Student Answers
                </h3>
                <span className="text-xs font-semibold text-[var(--ink-muted)]">
                  ({evaluation.questions.length} questions)
                </span>
              </div>
              {isLoadingQuestions && (
                <span className="text-xs font-semibold text-blue-500 flex items-center gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Loading...
                </span>
              )}
            </div>

            {/* QUESTIONS LIST */}
            {isLoadingQuestions && evaluation.questions.length === 0 ? (
              <div className="bg-[var(--surface-higher)] p-10 border border-[var(--border)] rounded-2xl text-center space-y-3 shadow-xs">
                <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mx-auto" />
                <h4 className="text-sm font-bold text-[var(--ink)]">Loading Assessment Questions &amp; Student Responses...</h4>
                <p className="text-xs text-[var(--ink-muted)]">Retrieving question details, options, and student answer keys.</p>
              </div>
            ) : evaluation.questions.length === 0 ? (
              <div className="bg-[var(--surface-higher)] p-10 border border-dashed border-[var(--border)] rounded-2xl text-center space-y-3 shadow-xs">
                <HelpCircle className="w-10 h-10 text-[var(--ink-muted)] mx-auto" />
                <h4 className="text-sm font-bold text-[var(--ink)]">No Questions Loaded Yet</h4>
                <p className="text-xs text-[var(--ink-muted)] max-w-md mx-auto">
                  Click the button below to fetch questions, student responses, and answer keys for this assessment.
                </p>
                <button
                  type="button"
                  onClick={() => loadQuestionsData(submission.id)}
                  className="btn btn-primary px-4 py-2 text-xs font-bold rounded-xl cursor-pointer inline-flex items-center gap-2 shadow-xs"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Fetch Assessment Questions</span>
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {evaluation.questions.map((q, idx) => {
                  const status = getStatusBadge(q.isCorrect, q.pointsAwarded, q.maxPoints);
                  const studentAnswerStr =
                    typeof q.studentAnswer === 'object' && q.studentAnswer !== null
                      ? JSON.stringify(q.studentAnswer, null, 2)
                      : String(q.studentAnswer ?? '(No response)');
                  const deduction = q.maxPoints - q.pointsAwarded;

                  return (
                    <div
                      key={q.questionId || idx}
                      className="bg-[var(--surface)] p-4 sm:p-5 border border-[var(--border)] rounded-2xl space-y-4 shadow-xs"
                    >
                      {/* Question Header & Marks Toolbar */}
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-[var(--border)]">
                        <div className="flex items-start gap-2.5 flex-1 min-w-0">
                          <span className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold text-xs flex items-center justify-center shrink-0 border border-blue-500/20">
                            Q{idx + 1}
                          </span>
                          <span className="font-semibold text-sm sm:text-base text-[var(--ink)] leading-snug break-words flex-1">
                            {cleanQuestionPrompt(q.questionText || `Question ${idx + 1}`)}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0 justify-start lg:justify-end">
                          <span className={`px-2.5 py-1 text-xs font-bold rounded-lg border flex items-center gap-1.5 ${status.bg}`}>
                            {status.icon}
                            <span>{status.label}</span>
                          </span>

                          {deduction > 0 && (
                            <span className="px-2 py-0.5 bg-rose-500/10 border border-rose-500/30 text-rose-500 rounded-lg text-[11px] font-bold">
                              Deduction: -{deduction.toFixed(1)}
                            </span>
                          )}

                          {/* Marks Input & Quick Actions */}
                          {isAdmin ? (
                            <div className="flex flex-wrap items-center gap-1.5 bg-[var(--surface-higher)] px-2.5 sm:px-3 py-1.5 rounded-xl border border-[var(--border)] shadow-2xs max-w-full">
                              <span className="text-xs font-bold text-[var(--ink-muted)] whitespace-nowrap">Marks:</span>
                              <input
                                type="number"
                                step="0.5"
                                min="0"
                                max={q.maxPoints}
                                value={q.pointsAwarded ?? 0}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  handleScoreChange(idx, val === '' ? 0 : parseFloat(val) || 0);
                                }}
                                className="w-16 px-2 py-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-xs font-bold text-[var(--ink)] text-center focus:outline-none focus:border-blue-500 shadow-2xs"
                              />
                              <span className="text-xs font-bold text-[var(--ink-muted)] whitespace-nowrap">/ {q.maxPoints}</span>

                              <div className="h-4 w-px bg-[var(--border)] mx-1 hidden sm:block" />

                              {/* Quick score modification buttons */}
                              <div className="flex items-center gap-1 shrink-0 flex-wrap">
                                <button
                                  type="button"
                                  onClick={() => handleSetFullMarks(idx)}
                                  className="px-2 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-[11px] font-bold cursor-pointer transition whitespace-nowrap active:scale-95"
                                  title="Give Full Marks"
                                >
                                  Full ({q.maxPoints})
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleQuickAdd(idx, 0.5)}
                                  className="px-1.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[11px] font-bold cursor-pointer transition whitespace-nowrap active:scale-95"
                                  title="Add 0.5 marks"
                                >
                                  +0.5
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleQuickAdd(idx, 1)}
                                  className="px-1.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[11px] font-bold cursor-pointer transition whitespace-nowrap active:scale-95"
                                  title="Add 1.0 mark"
                                >
                                  +1.0
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleQuickDeduct(idx, 0.5)}
                                  className="px-1.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-[11px] font-bold cursor-pointer transition whitespace-nowrap active:scale-95"
                                  title="Deduct 0.5 marks"
                                >
                                  -0.5
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleSetZeroMarks(idx)}
                                  className="px-2 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-600 dark:text-rose-400 border border-rose-500/30 text-[11px] font-bold cursor-pointer transition whitespace-nowrap active:scale-95"
                                  title="Set to 0 marks (Incorrect)"
                                >
                                  0 (Zero)
                                </button>
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs font-bold text-[var(--ink)] bg-[var(--surface-higher)] px-3 py-1.5 rounded-xl border border-[var(--border)]">
                              {q.pointsAwarded} / {q.maxPoints} Marks
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Attached Diagram / Image / Figure for Question */}
                      {(() => {
                        const rawFig = q.imageUrl || (q as any).image || (q as any).figureUrl || (q as any).diagramUrl;
                        const figUrl = typeof rawFig === 'string' && rawFig.trim().length > 0 ? rawFig.trim() : null;
                        if (!figUrl) return null;
                        return (
                          <div className="p-3 bg-[var(--surface-higher)] border border-[var(--border)] rounded-xl space-y-2">
                            <div className="text-[11px] font-bold text-[var(--ink-muted)] uppercase tracking-wider flex items-center gap-1.5">
                              <ImageIcon className="w-3.5 h-3.5 text-blue-500" />
                              <span>Question Figure / Diagram:</span>
                            </div>
                            <div className="max-w-md overflow-hidden border border-[var(--border)] bg-[var(--surface)] rounded-lg p-2">
                              <img
                                src={figUrl}
                                alt={`Figure for Question ${idx + 1}`}
                                className="max-h-60 w-auto max-w-full mx-auto object-contain rounded"
                                referrerPolicy="no-referrer"
                                loading="eager"
                              />
                            </div>
                          </div>
                        );
                      })()}

                      {/* MULTIPLE-CHOICE OPTIONS (IF MCQ) */}
                      {Array.isArray(q.options) && q.options.length > 0 ? (
                        <div className="p-3 bg-[var(--surface-higher)] border border-[var(--border)] rounded-xl space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-[var(--ink-muted)]">
                            <span className="uppercase tracking-wider text-[11px] font-bold">
                              Options &amp; Student's Choice:
                            </span>
                            <span>
                              Student ticked: <strong className="text-blue-600 dark:text-blue-400 font-bold">{studentAnswerStr}</strong>
                            </span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {q.options.map((opt: string, optIdx: number) => {
                              const optLetter = String.fromCharCode(65 + optIdx);
                              const isStudent = isOptionSelected(q.studentAnswer, opt, optIdx, q.selectedOptionId);
                              const isKey = isOptionCorrectKey(q.correctAnswer, opt, optIdx);
                              const optImg = (q.optionImages && q.optionImages[optIdx]) || (typeof opt === 'string' && (opt.startsWith('http://') || opt.startsWith('https://') || opt.startsWith('data:image/')) ? opt : null);
                              const cleanOpt = cleanOptionText(opt);

                              let border = 'border-[var(--border)] bg-[var(--surface)] text-[var(--ink)]';
                              let badge = null;

                              if (isStudent && isKey) {
                                border = 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-semibold';
                                badge = (
                                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-500 text-white font-bold shrink-0 whitespace-nowrap">
                                    Student Choice (Right ✓)
                                  </span>
                                );
                              } else if (isStudent && !isKey) {
                                border = 'border-rose-500/50 bg-rose-500/10 text-rose-700 dark:text-rose-300 font-semibold';
                                badge = (
                                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-rose-500 text-white font-bold shrink-0 whitespace-nowrap">
                                    Student Choice (Wrong ✗)
                                  </span>
                                );
                              } else if (!isStudent && isKey) {
                                border = 'border-emerald-500/30 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400 font-medium';
                                badge = (
                                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30 font-bold shrink-0 whitespace-nowrap">
                                    Correct Key
                                  </span>
                                );
                              }

                              return (
                                <div
                                  key={optIdx}
                                  className={`p-2.5 rounded-xl border flex flex-wrap items-center justify-between gap-2 text-xs transition overflow-hidden ${border}`}
                                >
                                  <div className="flex items-center gap-2 flex-1 min-w-0">
                                    <span className="w-5 h-5 rounded-md bg-[var(--surface-higher)] border border-[var(--border)] text-[var(--ink)] text-[10px] font-bold flex items-center justify-center shrink-0">
                                      {optLetter}
                                    </span>
                                    <span className="text-xs break-words whitespace-normal leading-snug flex-1 min-w-0">{cleanOpt}</span>
                                    {optImg && (
                                      <img src={optImg} alt={`Option ${optLetter}`} className="h-7 max-w-[60px] object-contain border border-[var(--border)] rounded p-0.5 ml-1 inline-block shrink-0" referrerPolicy="no-referrer" />
                                    )}
                                  </div>
                                  {badge}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        /* NON-MCQ ANSWERS COMPARISON BOX */
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="p-3 bg-[var(--surface-higher)] border border-[var(--border)] rounded-xl space-y-1.5">
                            <div className="flex items-center justify-between text-xs font-semibold text-[var(--ink-muted)]">
                              <span className="flex items-center gap-1.5 font-bold">
                                <User className="w-3.5 h-3.5 text-blue-500" />
                                Student's Submitted Answer:
                              </span>
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                                  q.pointsAwarded >= q.maxPoints
                                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                                    : 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                                }`}
                              >
                                {q.pointsAwarded >= q.maxPoints ? 'Right ✓' : 'Wrong ✗'}
                              </span>
                            </div>
                            <div className="p-2.5 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-xs sm:text-sm font-mono text-[var(--ink)] break-words whitespace-pre-wrap">
                              {studentAnswerStr}
                            </div>
                          </div>

                          <div className="p-3 bg-[var(--surface-higher)] border border-blue-500/30 rounded-xl space-y-1.5">
                            <div className="flex items-center justify-between text-xs font-bold text-blue-600 dark:text-blue-400">
                              <span className="flex items-center gap-1.5">
                                <Check className="w-3.5 h-3.5" />
                                Teacher Model Solution:
                              </span>
                            </div>
                            <div className="p-2.5 bg-[var(--surface)] border border-blue-500/20 rounded-lg text-xs sm:text-sm font-mono text-blue-600 dark:text-blue-400 break-words whitespace-pre-wrap">
                              {q.correctAnswer || 'Standard model answer specified in test'}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Multi-item sub evaluations (blanks / match pairs) */}
                      {Array.isArray(q.subEvaluations) && q.subEvaluations.length > 0 && (
                        <div className="bg-[var(--surface-higher)] p-3 border border-[var(--border)] rounded-xl space-y-2">
                          <h5 className="text-[11px] font-bold text-[var(--ink-muted)] uppercase tracking-wider">Sub-Part Item Breakdown:</h5>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {q.subEvaluations.map((se: any, sIdx: number) => (
                              <div
                                key={sIdx}
                                className={`p-2.5 rounded-lg border text-xs space-y-1 ${
                                  se.isCorrect === true || se.isCorrect === 'true'
                                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                                    : 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
                                }`}
                              >
                                <div className="flex items-center justify-between font-bold">
                                  <span>{se.label || `Part #${sIdx + 1}`}</span>
                                  <span>{se.pointsAwarded} / {se.maxPoints} pts</span>
                                </div>
                                <p className="text-[11px] opacity-90 break-words whitespace-normal">
                                  <strong>Ans:</strong> {String(se.studentAnswer || '(empty)')} • <strong>Exp:</strong> {String(se.correctAnswer || '')}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* FOOTER ACTIONS */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-t border-[var(--border)] bg-[var(--surface-higher)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0 print:hidden">
          {saveError ? (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-500 bg-rose-500/10 border border-rose-500/30 px-3 py-1.5 rounded-lg">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{saveError}</span>
            </div>
          ) : (
            <div />
          )}
          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            {showPrintPreview ? (
              <button
                type="button"
                onClick={() => setShowPrintPreview(false)}
                className="flex-1 sm:flex-none px-4 py-2 border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-higher)] text-[var(--ink)] text-xs font-semibold rounded-xl transition cursor-pointer flex items-center justify-center gap-2 shadow-2xs"
              >
                <ArrowLeft className="w-4 h-4 text-blue-500" />
                <span>Back to Grading</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="flex-1 sm:flex-none px-4 py-2 border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-higher)] text-[var(--ink-muted)] hover:text-[var(--ink)] text-xs font-semibold rounded-xl transition cursor-pointer shadow-2xs"
              >
                Close Viewer
              </button>
            )}

            {isAdmin && !showPrintPreview && (
              <button
                type="button"
                onClick={handleSaveGrade}
                disabled={isSaving}
                className="btn btn-primary flex-1 sm:flex-none px-5 py-2 text-xs font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-2 shadow-xs active:scale-95 disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : saveSuccess ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-white" />
                    <span>Marks Saved!</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    <span>Save Adjusted Marks</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
