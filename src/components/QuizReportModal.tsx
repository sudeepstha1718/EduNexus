import React from 'react';
import { QuizEvaluationReport } from '../types';
import {
  X,
  Award,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  HelpCircle,
  Printer,
  BookOpen,
  ArrowRight,
  Image as ImageIcon
} from 'lucide-react';
import { printHtml } from '../lib/printService';
import { fetchQuizById } from '../lib/api';
import {
  generatePrintableStudentAnswerHtml,
  isOptionSelected,
  isOptionCorrectKey,
  cleanOptionText,
  cleanQuestionPrompt,
} from './TeacherGradeModal';

interface QuizReportModalProps {
  report: QuizEvaluationReport | null;
  isOpen: boolean;
  onClose: () => void;
  onRetake?: () => void;
  isAdmin?: boolean;
}

export const QuizReportModal: React.FC<QuizReportModalProps> = ({
  report,
  isOpen,
  onClose,
  onRetake,
  isAdmin = false,
}) => {
  const [quizQuestionsMap, setQuizQuestionsMap] = React.useState<Record<string, any>>({});

  React.useEffect(() => {
    if (!isOpen || !report?.quizId) return;
    const needsEnrichment = Array.isArray(report.questions) && report.questions.some(
      (q) => !q.imageUrl && (!Array.isArray(q.options) || q.options.length === 0)
    );
    if (!needsEnrichment) return;

    let cancelled = false;
    fetchQuizById(report.quizId, !isAdmin)
      .then((data) => {
        if (cancelled) return;
        if (data && Array.isArray(data.questions)) {
          const map: Record<string, any> = {};
          data.questions.forEach((qq: any, idx: number) => {
            if (qq.id) map[qq.id] = qq;
            map[String(idx)] = qq;
            if (qq.questionText) {
              map[qq.questionText.trim().toLowerCase()] = qq;
            }
          });
          setQuizQuestionsMap(map);
        }
      })
      .catch((err) => console.warn('Failed to fetch quiz questions for images:', err));

    return () => {
      cancelled = true;
    };
  }, [isOpen, report?.quizId, isAdmin]);

  if (!isOpen || !report) return null;

  const getGradeBadge = (grade: string) => {
    switch (grade) {
      case 'A+':
      case 'A':
        return 'bg-emerald-500 text-white ring-4 ring-emerald-100';
      case 'B+':
      case 'B':
        return 'bg-blue-500 text-white ring-4 ring-blue-100';
      case 'C+':
      case 'C':
        return 'bg-amber-500 text-white ring-4 ring-amber-100';
      case 'D':
        return 'bg-orange-500 text-white ring-4 ring-orange-100';
      default:
        return 'bg-rose-500 text-white ring-4 ring-rose-100';
    }
  };

  const handlePrint = () => {
    try {
      const subObj = {
        id: report.submissionId,
        quizId: report.quizId,
        quizTitle: report.quizTitle,
        studentName: report.studentName,
        studentRoll: report.studentRoll || '-',
        studentId: report.studentId,
        classId: report.classId,
        submittedAt: report.submittedAt,
        totalScore: report.totalScore,
        maxScore: report.maxScore,
        status: 'graded',
        studentAnswers: {},
        evaluation: report,
      } as any;

      const printHtmlContent = generatePrintableStudentAnswerHtml(
        report,
        subObj,
        report.classId || 'Class',
        {
          schoolName: 'ACADEMIC EVALUATION & ASSESSMENT BOARD',
          paperStyle: 'twocolumn',
          fontSize: 'normal',
        }
      );

      printHtml(printHtmlContent, {
        title: `Assessment Result - ${report.studentName}`,
        fallbackFilename: `Assessment_Result_${(report.studentName || 'Student').replace(/[^a-zA-Z0-9]/g, '_')}.html`,
      });
    } catch (err) {
      console.warn('Print report failed, trying window.print:', err);
      window.print();
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-md flex items-center justify-center p-2 xs:p-2.5 sm:p-4 md:p-6 animate-in fade-in duration-200 print:p-0 print:static print:bg-white print:overflow-visible">
      <div
        id="quiz-report-modal"
        className="bg-[var(--surface)] border border-[var(--border)] text-[var(--ink)] w-full max-w-4xl overflow-hidden flex flex-col max-h-[92vh] rounded-xl sm:rounded-2xl shadow-2xl print:border-none print:shadow-none print:max-h-none print:overflow-visible print:w-full print:bg-white print:text-black"
      >
        {/* Modal Header */}
        <div className="bg-[var(--surface-higher)] text-[var(--ink)] px-3.5 sm:px-5 py-2.5 sm:py-3 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] shrink-0 print:hidden">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-lg bg-[var(--accent)]/15 border border-[var(--accent)]/30 text-[var(--accent)] flex items-center justify-center shrink-0">
              <Award className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-geist font-bold text-xs xs:text-sm sm:text-base text-[var(--ink)] truncate">Assessment Result &amp; Report</h2>
                <span className="hidden sm:inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-md bg-[var(--surface)] text-[var(--accent)] border border-[var(--accent)]/30 shrink-0">
                  <Sparkles className="w-3 h-3 text-[var(--accent)]" /> Automated Evaluation
                </span>
              </div>
              <p className="font-mono text-[10px] sm:text-[11px] text-[var(--ink-muted)] mt-0.5 truncate">
                {report.quizTitle} • {report.subject}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              onClick={handlePrint}
              className="btn py-1 px-2.5 sm:px-3 text-xs rounded-lg flex items-center gap-1.5"
              title="Print / Save PDF Report"
            >
              <Printer className="w-3.5 h-3.5" />
              <span className="hidden xs:inline">Print</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-[var(--ink-muted)] hover:text-[var(--ink)] rounded-lg hover:bg-[var(--surface)] transition cursor-pointer"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-4 sm:space-y-5 bg-[var(--bg)]">
          {/* Summary Score Card */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3.5 sm:p-5 relative overflow-hidden shadow-xs">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 sm:gap-6">
              {/* Student info */}
              <div className="space-y-1.5 text-center md:text-left flex-1 min-w-0">
                <div className="flex flex-wrap items-center justify-center md:justify-start gap-1.5">
                  <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--accent)] bg-[var(--surface-higher)] px-2 py-0.5 rounded border border-[var(--accent)]/20">
                    Student Evaluation
                  </span>
                  {report.educationalProfile && (
                    <span className="font-mono text-[9px] text-[var(--ink)] bg-[var(--surface-higher)] border border-[var(--border)] px-2 py-0.5 rounded flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-[var(--accent)]" />
                      {report.educationalProfile.personaSummary}
                    </span>
                  )}
                  <span className="font-mono text-[9px] text-[var(--ink-muted)]">
                    Submitted: {new Date(report.submittedAt).toLocaleString()}
                  </span>
                </div>
                {(() => {
                  const rawRoll = (report.studentRoll || '').trim();
                  const rawId = ((report as any).studentId || '').trim();
                  const isInvalidRoll = !rawRoll || rawRoll === '-' || !/^[0-9]+[a-zA-Z]?$/.test(rawRoll) || rawRoll.toLowerCase() === rawId.toLowerCase() || rawRoll.toLowerCase().startsWith('admin_') || rawRoll.toLowerCase().startsWith('sub-');
                  return (
                    <div className="flex items-center gap-2 flex-wrap justify-center md:justify-start">
                      <h3 className="font-geist text-lg sm:text-xl font-bold text-[var(--ink)] tracking-tight">
                        {report.studentName}
                      </h3>
                      {!isInvalidRoll && (
                        <span className="font-mono text-[11px] font-bold text-[var(--accent)] bg-[var(--surface-higher)] px-2 py-0.5 border border-[var(--accent)]/30 rounded">
                          Roll No: {rawRoll}
                        </span>
                      )}
                      {rawId && rawId.toLowerCase() !== rawRoll.toLowerCase() && !rawId.toLowerCase().startsWith('admin_') && (
                        <span className="font-mono text-[11px] text-[var(--ink-muted)] bg-[var(--surface-higher)] px-2 py-0.5 border border-[var(--border)] rounded">
                          ID: {rawId}
                        </span>
                      )}
                    </div>
                  );
                })()}
                <p className="text-xs text-[var(--ink-muted)] max-w-xl leading-relaxed">
                  {report.overallFeedback}
                </p>
              </div>

              {/* Score & Grade Display */}
              <div className="flex items-center justify-between md:justify-end gap-4 w-full md:w-auto shrink-0 bg-[var(--surface-higher)] px-4 py-3 rounded-xl border border-[var(--border)]">
                <div className="text-left md:text-right">
                  <div className="font-mono text-[9px] text-[var(--ink-muted)] uppercase tracking-wider">
                    Total Marks
                  </div>
                  <div className="font-geist text-2xl font-bold text-[var(--ink)]">
                    {report.totalScore}{' '}
                    <span className="font-mono text-xs text-[var(--ink-muted)] font-normal">
                      / {report.maxScore}
                    </span>
                  </div>
                  <div className="font-mono text-[10px] font-bold text-[var(--accent)] mt-0.5">
                    {report.percentage}% Score
                  </div>
                </div>

                <div
                  className={`w-11 h-11 rounded-lg flex flex-col items-center justify-center font-geist font-bold text-xl border ${
                    report.percentage >= 80
                      ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/40'
                      : report.percentage >= 60
                      ? 'bg-amber-500/15 text-amber-500 border-amber-500/40'
                      : 'bg-rose-500/15 text-rose-500 border-rose-500/40'
                  }`}
                >
                  <span>{report.gradeLetter}</span>
                </div>
              </div>
            </div>

            {/* Strengths & Improvements */}
            {(report.strengths?.length || report.improvements?.length) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4 pt-4 border-t border-[var(--border)]">
                {report.strengths && report.strengths.length > 0 && (
                  <div className="bg-[var(--surface-higher)] rounded-lg border border-[var(--accent)]/20 p-3 space-y-1.5">
                    <h4 className="font-mono font-bold text-[10px] uppercase tracking-wider text-[var(--accent)] flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[var(--accent)]" /> Key Strengths
                    </h4>
                    <ul className="space-y-1 text-xs text-[var(--ink)]">
                      {report.strengths.map((str, idx) => (
                        <li key={idx} className="flex items-start gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] mt-1.5 shrink-0" />
                          <span>{str}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {report.improvements && report.improvements.length > 0 && (
                  <div className="bg-[var(--surface-higher)] rounded-lg border border-amber-500/20 p-3 space-y-1.5">
                    <h4 className="font-mono font-bold text-[10px] uppercase tracking-wider text-amber-500 flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-500" /> Recommendations for Growth
                    </h4>
                    <ul className="space-y-1 text-xs text-[var(--ink)]">
                      {report.improvements.map((imp, idx) => (
                        <li key={idx} className="flex items-start gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                          <span>{imp}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Detailed Question Review */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-geist font-bold text-xs sm:text-sm text-[var(--ink)] flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-[var(--accent)]" /> Detailed Question Analysis & Feedback
              </h3>
              <span className="font-mono text-[9px] text-[var(--ink-muted)] uppercase tracking-wider">
                {report.questions.length} Questions Evaluated
              </span>
            </div>

            <div className="space-y-3">
              {report.questions.map((q, idx) => {
                const isFullMarks = q.pointsAwarded >= q.maxPoints;
                const isPartial = q.pointsAwarded > 0 && q.pointsAwarded < q.maxPoints;
                const matchQuizQ = quizQuestionsMap[q.questionId] || quizQuestionsMap[String(idx)] || (q.questionText ? quizQuestionsMap[q.questionText.trim().toLowerCase()] : null);
                const rawImg = q.imageUrl || (q as any).image || (q as any).figureUrl || (q as any).diagramUrl || matchQuizQ?.imageUrl || matchQuizQ?.image_url || matchQuizQ?.figureUrl;
                const imgUrl = typeof rawImg === 'string' && rawImg.trim().length > 0 ? rawImg.trim() : undefined;
                const questionOptions = (Array.isArray(q.options) && q.options.length > 0) ? q.options : (Array.isArray(matchQuizQ?.options) ? matchQuizQ.options : []);

                return (
                  <div
                    key={q.questionId || idx}
                    className={`border p-3 sm:p-4 rounded-xl transition space-y-2.5 bg-[var(--surface)] ${
                      isFullMarks
                        ? 'border-emerald-500/30'
                        : isPartial
                        ? 'border-amber-500/30'
                        : 'border-rose-500/30'
                    }`}
                  >
                    {/* Question Header */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded bg-[var(--surface-higher)] border border-[var(--border)] font-mono font-bold text-[10px] text-[var(--accent)] flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--ink-muted)]">
                          Question {idx + 1}
                        </span>
                      </div>

                      {/* Marks Badge */}
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-mono text-[9px] uppercase tracking-wider px-2 py-0.5 rounded border flex items-center gap-1 ${
                            isFullMarks
                              ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
                              : isPartial
                              ? 'bg-amber-500/10 text-amber-500 border-amber-500/30'
                              : 'bg-rose-500/10 text-rose-500 border-rose-500/30'
                          }`}
                        >
                          {isFullMarks ? (
                            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                          ) : isPartial ? (
                            <AlertCircle className="w-3 h-3 text-amber-500" />
                          ) : (
                            <X className="w-3 h-3 text-rose-500" />
                          )}
                          <span>
                            {q.pointsAwarded} / {q.maxPoints} Points
                          </span>
                        </span>
                      </div>
                    </div>

                    {/* Question Prompt if available */}
                    {q.questionText && (
                      <p className="text-xs sm:text-sm font-sans font-medium text-[var(--ink)] leading-relaxed">
                        {cleanQuestionPrompt(q.questionText)}
                      </p>
                    )}

                    {/* Attached Diagram / Question Figure */}
                    {imgUrl && (
                      <div className="my-2 p-2.5 rounded-lg bg-[var(--surface-higher)] border border-[var(--border)]">
                        <div className="font-mono text-[9px] text-[var(--ink-muted)] uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                          <ImageIcon className="w-3.5 h-3.5 text-[var(--accent)]" />
                          <span>Question Figure / Diagram:</span>
                        </div>
                        <div className="flex justify-center bg-[var(--surface)] p-2 rounded border border-[var(--border)]">
                          <img
                            src={imgUrl}
                            alt={`Figure for Question ${idx + 1}`}
                            className="max-h-56 max-w-full object-contain rounded"
                            referrerPolicy="no-referrer"
                            loading="eager"
                          />
                        </div>
                      </div>
                    )}

                    {/* MCQ Options List if available */}
                    {Array.isArray(questionOptions) && questionOptions.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-0.5">
                        {questionOptions.map((opt: any, optIdx: number) => {
                          const letter = String.fromCharCode(65 + optIdx);
                          const optText = typeof opt === 'string' ? opt : (opt?.text || String(opt));
                          const displayOptText = cleanOptionText(optText);
                          const isStudentSelected = isOptionSelected(q.studentAnswer, optText, optIdx, q.selectedOptionId);
                          const isKey = isOptionCorrectKey(q.correctAnswer, optText, optIdx);

                          return (
                            <div
                              key={optIdx}
                              className={`p-2 rounded-lg border text-xs flex flex-wrap items-center justify-between gap-2 transition ${
                                isStudentSelected && isKey
                                  ? 'bg-[var(--surface-higher)] border-emerald-500/50 text-emerald-600 dark:text-emerald-400 font-semibold'
                                  : isStudentSelected && !isKey
                                  ? 'bg-[var(--surface-higher)] border-rose-500/40 text-rose-500 font-semibold'
                                  : isKey
                                  ? 'bg-[var(--surface-higher)] border-[var(--accent)]/30 text-[var(--accent)]'
                                  : 'bg-[var(--surface-higher)] border-[var(--border)] text-[var(--ink-muted)]'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0 flex-1 font-sans">
                                <span className={`w-4 h-4 rounded-full flex items-center justify-center font-bold text-[9px] shrink-0 border ${
                                  isStudentSelected && isKey
                                    ? 'bg-emerald-500 text-white border-emerald-500'
                                    : isStudentSelected && !isKey
                                    ? 'bg-rose-500 text-white border-rose-500'
                                    : isKey
                                    ? 'bg-[var(--surface)] text-[var(--accent)] border-[var(--accent)]/40'
                                    : 'bg-[var(--surface)] text-[var(--ink-muted)] border-[var(--border)]'
                                }`}>
                                  {letter}
                                </span>
                                <span className="break-words whitespace-normal flex-1 min-w-0">{displayOptText}</span>
                              </div>
                              <div className="shrink-0 flex items-center gap-1 font-mono text-[8.5px] uppercase tracking-wider">
                                {isStudentSelected && isKey && (
                                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">Your Answer ✓</span>
                                )}
                                {isStudentSelected && !isKey && (
                                  <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-500 border border-rose-500/30">Your Answer ✕</span>
                                )}
                                {!isStudentSelected && isKey && (
                                  <span className="px-1.5 py-0.5 rounded bg-[var(--surface)] text-[var(--accent)] border border-[var(--accent)]/30">Correct Key</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Standard Answers Comparison Box */}
                    {(!q.subEvaluations || q.subEvaluations.length === 0) && (
                      <div className="bg-[var(--surface-higher)] p-3 rounded-lg border border-[var(--border)] space-y-2 text-xs">
                        <div>
                          <span className="font-mono text-[9px] text-[var(--ink-muted)] uppercase tracking-wider block mb-0.5">
                            Your Answer:
                          </span>
                          <div className="font-mono text-xs text-[var(--ink)] bg-[var(--surface)] p-2 rounded border border-[var(--border)] overflow-x-auto break-words">
                            {typeof q.studentAnswer === 'object' && q.studentAnswer !== null ? (
                              <div className="space-y-1">
                                {Object.entries(q.studentAnswer).map(([key, val]) => (
                                  <div key={key} className="flex flex-wrap items-center gap-1.5 sm:gap-2 break-words">
                                    <span className="text-[var(--ink-muted)]">{key}:</span>
                                    <ArrowRight className="w-3 h-3 text-[var(--accent)] shrink-0" />
                                    <span className="font-bold text-[var(--accent)] break-words">{String(val)}</span>
                                  </div>
                                ))}
                              </div>
                            ) : q.studentAnswer ? (
                              String(q.studentAnswer)
                            ) : (
                              <span className="italic text-[var(--ink-muted)]/50">No answer provided</span>
                            )}
                          </div>
                        </div>

                        {q.correctAnswer && (
                          <div>
                            <span className="font-mono text-[9px] text-[var(--accent)] uppercase tracking-wider block mb-0.5">
                              Teacher Reference / Expected Answer:
                            </span>
                            <div className="font-mono text-xs text-[var(--accent)] bg-[var(--surface)] p-2 rounded border border-[var(--accent)]/30 break-words">
                              {q.correctAnswer}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Evaluation Explanation & Feedback */}
                    <div className="bg-[var(--surface-higher)] border border-[var(--accent)]/20 p-3 rounded-lg space-y-1">
                      <div className="flex items-center gap-1.5 text-[var(--accent)] font-mono text-[9px] uppercase tracking-wider">
                        <Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" /> Evaluation Feedback:
                      </div>
                      <p className="text-xs text-[var(--ink)] leading-relaxed">
                        {q.feedback}
                      </p>
                      {q.explanation && (
                        <p className="text-xs text-[var(--ink-muted)] pt-1 border-t border-[var(--border)]">
                          <strong className="font-mono text-[9px] uppercase tracking-wider text-amber-500">Concept Explanation:</strong>{' '}
                          {q.explanation}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="bg-[var(--surface-higher)] px-4 sm:px-6 py-2.5 sm:py-3 border-t border-[var(--border)] flex flex-col sm:flex-row items-center justify-between gap-2.5 shrink-0">
          <div className="font-mono text-[9px] uppercase tracking-wider text-[var(--ink-muted)] text-center sm:text-left">
            Assessment completed on <span className="text-[var(--ink)] font-semibold">EduNexus</span>
          </div>

          <div className="flex flex-col-reverse xs:flex-row items-stretch xs:items-center gap-2 w-full sm:w-auto">
            {onRetake && (
              <button
                onClick={onRetake}
                className="btn py-1.5 px-3 text-xs rounded-lg flex-1 sm:flex-initial justify-center"
              >
                Retake Assessment
              </button>
            )}
            <button
              onClick={onClose}
              className="btn btn-primary py-1.5 px-3.5 text-xs rounded-lg flex-1 sm:flex-initial justify-center"
            >
              Done / Return to Board
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
