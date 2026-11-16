import React, { useState, useMemo } from 'react';
import { QuizItem, ClassItem, SubjectCategory, StudentUser, ViewMode } from '../types';
import { getAuthenticatedPrintUrl } from '../lib/api';
import {
  FileQuestion,
  Sparkles,
  Clock,
  Award,
  Plus,
  Play,
  Edit,
  Trash2,
  CheckCircle2,
  Users,
  Search,
  BookOpen,
  EyeOff,
  Printer,
  LogIn,
  UserPlus,
  ShieldAlert,
  UserCheck,
  Download,
  LayoutGrid,
  List as ListIcon
} from 'lucide-react';

interface QuizListProps {
  quizzes: QuizItem[];
  isAdmin: boolean;
  selectedClassId: string;
  selectedSubject: string;
  activeClassName: string;
  classes: ClassItem[];
  subjects: SubjectCategory[];
  currentStudent?: StudentUser | null;
  onOpenStudentAuth?: (initialMode?: 'login' | 'register') => void;
  onTakeQuiz: (quiz: QuizItem) => void;
  onCreateQuiz: () => void;
  onEditQuiz: (quiz: QuizItem) => void;
  onDeleteQuiz: (quizId: string) => void;
  onViewSubmissions: (quiz?: QuizItem) => void;
  onPrintQuiz: (quiz: QuizItem) => void;
}

export const QuizList: React.FC<QuizListProps> = ({
  quizzes,
  isAdmin,
  selectedClassId,
  selectedSubject,
  activeClassName,
  classes,
  subjects,
  currentStudent,
  onOpenStudentAuth,
  onTakeQuiz,
  onCreateQuiz,
  onEditQuiz,
  onDeleteQuiz,
  onViewSubmissions,
  onPrintQuiz,
}) => {
  const [search, setSearch] = useState<string>('');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [quizToDelete, setQuizToDelete] = useState<QuizItem | null>(null);

  const filteredQuizzes = useMemo(() => {
    return quizzes.filter((q) => {
      // Admin sees unpublished too; students only see published
      if (!isAdmin && q.isPublished === false) return false;

      // Class filter
      if (!isAdmin) {
        // For students: strictly only show tests for their current unlocked class!
        if (q.classId !== selectedClassId) {
          return false;
        }
      } else {
        // For teachers/admin: filter based on selected class tab
        if (selectedClassId !== 'all' && q.classId !== selectedClassId && q.classId !== 'all') {
          return false;
        }
      }

      // Subject filter
      if (selectedSubject !== 'all' && selectedSubject !== '') {
        const match =
          q.subject === selectedSubject ||
          q.subject.toLowerCase() === selectedSubject.toLowerCase();
        if (!match) return false;
      }

      // Search query
      if (search.trim()) {
        const query = search.toLowerCase().trim();
        const matchesTitle = q.title.toLowerCase().includes(query);
        const matchesDesc = q.description?.toLowerCase().includes(query);
        const matchesSubject = q.subject.toLowerCase().includes(query);
        if (!matchesTitle && !matchesDesc && !matchesSubject) return false;
      }

      return true;
    });
  }, [quizzes, isAdmin, selectedClassId, selectedSubject, search]);

  const classNameMap = useMemo(() => {
    const map: Record<string, string> = { all: 'All Classes' };
    classes.forEach((c) => {
      map[c.id] = c.name;
    });
    return map;
  }, [classes]);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Top Controls Header */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-3.5 sm:p-5 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 shadow-xs relative overflow-hidden">
        <div className="flex items-start gap-3 sm:gap-3.5 min-w-0 flex-1">
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-purple-500/12 border border-purple-500/25 text-purple-500 flex items-center justify-center shrink-0">
            <FileQuestion className="w-5 h-5" />
          </div>
          <div className="space-y-0.5 min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap text-xs text-[var(--ink-muted)]">
              <span className="font-semibold text-[var(--accent)]">
                Online Assessments
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">{filteredQuizzes.length} test{filteredQuizzes.length === 1 ? '' : 's'} available</span>
            </div>
            <h1 className="font-bold text-lg sm:text-xl lg:text-2xl tracking-tight text-[var(--ink)] break-words">
              Interactive Tests & Automated Grading
            </h1>
            <p className="text-xs text-[var(--ink-muted)] leading-relaxed break-words">
              Practice questions, MCQ tests, and subjective problems with instant AI evaluation.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto shrink-0">
          {isAdmin && (
            <>
              <button
                type="button"
                onClick={() => onViewSubmissions()}
                className="btn py-2 px-3 text-xs flex-1 sm:flex-initial lg:flex-none justify-center whitespace-nowrap active:scale-95 cursor-pointer"
              >
                <Users className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                <span>All Submissions</span>
              </button>

              <button
                type="button"
                onClick={onCreateQuiz}
                className="btn btn-primary py-2 px-3 text-xs flex-1 sm:flex-initial lg:flex-none justify-center whitespace-nowrap shadow-2xs active:scale-95 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 shrink-0" />
                <span>Create Test</span>
              </button>
            </>
          )}

          {!isAdmin && (
            <button
              type="button"
              onClick={() => onViewSubmissions()}
              className="btn py-2 px-3.5 text-xs w-full xs:w-auto justify-center whitespace-nowrap active:scale-95 cursor-pointer"
            >
              <Award className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
              <span>My Past Results</span>
            </button>
          )}
        </div>
      </div>

      {/* Student Authentication Gate Banner (When visiting Test section without login) */}
      {!isAdmin && !currentStudent && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-3.5 sm:p-5 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3.5 lg:gap-5 shadow-xs">
          <div className="flex items-start gap-3 sm:gap-4 min-w-0 flex-1">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[var(--accent)]/10 text-[var(--accent)] flex items-center justify-center shrink-0 font-bold border border-[var(--accent)]/20">
              <UserPlus className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="space-y-1 min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-sm sm:text-base text-[var(--ink)] break-words">Student Login Required for Tests</h3>
                <span className="text-[11px] font-semibold text-amber-500 whitespace-nowrap">
                  · Authentication Required
                </span>
              </div>
              <p className="text-xs text-[var(--ink-muted)] max-w-xl leading-relaxed break-words">
                Notes & study materials are freely accessible. To take timed assessments, prevent duplicate retakes, and store AI-evaluated marks, please create your student ID or log in.
              </p>
            </div>
          </div>

          <div className="flex flex-col xs:flex-row items-stretch xs:items-center gap-2 w-full lg:w-auto shrink-0">
            <button
              type="button"
              onClick={() => onOpenStudentAuth?.('register')}
              className="btn btn-primary flex-1 lg:flex-none py-2 px-3.5 text-xs font-semibold justify-center whitespace-nowrap shadow-xs cursor-pointer active:scale-95"
            >
              <UserPlus className="w-3.5 h-3.5 shrink-0" />
              <span>Create Student ID</span>
            </button>

            <button
              type="button"
              onClick={() => onOpenStudentAuth?.('login')}
              className="btn flex-1 lg:flex-none py-2 px-3.5 text-xs font-semibold justify-center whitespace-nowrap bg-[var(--surface-higher)] hover:bg-[var(--surface-highest)] border border-[var(--border)] cursor-pointer active:scale-95"
            >
              <LogIn className="w-3.5 h-3.5 shrink-0 text-[var(--accent)]" />
              <span>Sign In</span>
            </button>
          </div>
        </div>
      )}

      {/* Logged in student badge banner */}
      {!isAdmin && currentStudent && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-3.5 sm:px-4 sm:py-3 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 text-xs text-[var(--ink)] shadow-xs">
          <div className="flex items-start lg:items-center gap-2.5 min-w-0 flex-1">
            <UserCheck className="w-4 h-4 text-[var(--accent)] shrink-0 mt-0.5 lg:mt-0" />
            <span className="leading-relaxed text-[var(--ink-muted)] break-words min-w-0">
              Logged in as <strong className="text-[var(--ink)] font-semibold">{currentStudent.name}</strong> (Student ID: <span className="font-mono text-[var(--accent)] font-semibold break-all">{currentStudent.studentId}</span>). Test timers and AI-evaluated marks are saved.
            </span>
          </div>

          <button
            type="button"
            onClick={() => onViewSubmissions()}
            className="btn py-2 px-3 text-xs w-full lg:w-auto justify-center shrink-0 whitespace-nowrap active:scale-95 cursor-pointer"
          >
            <Award className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
            <span>View My Submitted Papers</span>
          </button>
        </div>
      )}

      {/* Search & View Mode Toolbar */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-2.5 sm:p-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-3 shadow-xs">
        {/* Search */}
        <div className="relative flex-1 min-w-0">
          <Search className="w-3.5 h-3.5 text-[var(--ink-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search assessments by topic, chapter, or question keywords..."
            className="input pl-8 py-1.5 text-xs w-full"
          />
        </div>

        {/* Right Section: View Mode Toggle & Counter */}
        <div className="flex items-center gap-2 justify-between sm:justify-end shrink-0">
          <div className="flex items-center p-0.5 bg-[var(--surface-higher)] border border-[var(--border)] rounded-lg shrink-0">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-md transition cursor-pointer ${
                viewMode === 'list'
                  ? 'bg-[var(--accent)] text-white shadow-2xs'
                  : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
              }`}
              title="List View"
              aria-label="List View"
            >
              <ListIcon className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md transition cursor-pointer ${
                viewMode === 'grid'
                  ? 'bg-[var(--accent)] text-white shadow-2xs'
                  : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
              }`}
              title="Grid View"
              aria-label="Grid View"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
          </div>

          <span className="text-[11px] sm:text-xs text-[var(--ink-muted)] px-2.5 py-1.5 rounded-lg bg-[var(--surface-higher)] border border-[var(--border)] shrink-0 font-medium font-mono">
            {filteredQuizzes.length} {filteredQuizzes.length === 1 ? 'test' : 'tests'}
          </span>
        </div>
      </div>

      {/* Assessment Cards List / Grid */}
      {filteredQuizzes.length > 0 ? (
        viewMode === 'list' ? (
          /* List Mode: Clean, compact horizontal rows matching FileCard and Homework */
          <div className="space-y-2.5">
            {filteredQuizzes.map((quiz) => {
              const questionCount = quiz.questions?.length || 0;
              const targetClassLabel = classNameMap[quiz.classId] || 'Class Assessment';

              return (
                <div
                  key={quiz.id}
                  className="group bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--accent)]/50 p-3.5 sm:p-4 rounded-xl transition-all duration-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3 shadow-xs hover:shadow-md overflow-hidden"
                >
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border bg-blue-500/10 border-blue-500/20 text-blue-500">
                      <FileQuestion className="w-4 h-4" />
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Metadata kicker */}
                      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-[var(--ink-muted)] mb-1">
                        <span className="font-semibold text-[var(--ink)]">{quiz.subject}</span>
                        {selectedClassId === 'all' && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{targetClassLabel}</span>
                          </>
                        )}
                        <span aria-hidden="true">·</span>
                        <span className="font-mono text-[11px]">{questionCount} Qs</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono text-[11px] font-semibold text-amber-500">{quiz.totalPoints} Marks</span>
                        {quiz.timeLimitMinutes && quiz.timeLimitMinutes > 0 ? (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono text-[11px]">{quiz.timeLimitMinutes}m</span>
                          </>
                        ) : null}
                        {isAdmin && !quiz.isPublished && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-semibold text-amber-500 flex items-center gap-1 text-[10.5px]">
                              <EyeOff className="w-3 h-3" /> Draft
                            </span>
                          </>
                        )}
                      </div>

                      <h3 className="font-bold text-[var(--ink)] text-sm leading-snug line-clamp-2 break-words group-hover:text-[var(--accent)] transition-colors">
                        {quiz.title}
                      </h3>

                      {quiz.description && (
                        <p className="text-xs text-[var(--ink-muted)] line-clamp-1 mt-0.5 break-words">
                          {quiz.description}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Right Action Buttons */}
                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 shrink-0 pt-2.5 lg:pt-0 border-t lg:border-t-0 border-[var(--border)] w-full lg:w-auto justify-between sm:justify-end">
                    <button
                      type="button"
                      onClick={() => onTakeQuiz(quiz)}
                      className={`h-8.5 px-3 sm:px-3.5 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center gap-1.5 shadow-2xs transition cursor-pointer active:scale-95 whitespace-nowrap ${
                        isAdmin ? 'flex-1 xs:flex-none' : 'w-full xs:w-auto'
                      }`}
                    >
                      <Play className="w-3.5 h-3.5 fill-current shrink-0" />
                      <span>Take Test</span>
                    </button>

                    {isAdmin && (
                      <div className="flex flex-wrap items-center gap-1.5 justify-end">
                        <a
                          href={getAuthenticatedPrintUrl(`/api/print/quiz/${quiz.id}`)}
                          target="_blank"
                          rel="noopener noreferrer"
                          id={`print-quiz-btn-${quiz.id}`}
                          className="h-8.5 px-2.5 rounded-lg text-xs font-semibold bg-[var(--surface-higher)] hover:bg-[var(--surface-highest)] text-[var(--ink)] border border-[var(--border)] flex items-center justify-center gap-1.5 transition cursor-pointer shadow-2xs whitespace-nowrap"
                          title="Print Question Paper (Questions Only)"
                        >
                          <Printer className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                          <span className="hidden xs:inline">Print</span>
                        </a>

                        <button
                          type="button"
                          onClick={() => onViewSubmissions(quiz)}
                          id={`view-submissions-btn-${quiz.id}`}
                          className="h-8.5 px-2.5 rounded-lg text-xs font-semibold bg-[var(--surface-higher)] hover:bg-[var(--surface-highest)] text-[var(--ink)] border border-[var(--border)] flex items-center justify-center gap-1.5 transition cursor-pointer shadow-2xs whitespace-nowrap"
                          title="View Student Submissions"
                        >
                          <Users className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                          <span>Submissions</span>
                        </button>

                        <div className="flex items-center gap-1 pl-1 sm:pl-1.5 border-l border-[var(--border)]">
                          <button
                            type="button"
                            onClick={() => onEditQuiz(quiz)}
                            className="h-8.5 w-8.5 rounded-lg border border-[var(--border)] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-higher)] flex items-center justify-center transition cursor-pointer shrink-0"
                            title="Edit Assessment"
                            aria-label="Edit Assessment"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setQuizToDelete(quiz)}
                            className="h-8.5 w-8.5 rounded-lg border border-rose-500/20 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 flex items-center justify-center transition cursor-pointer shrink-0"
                            title="Delete Assessment"
                            aria-label="Delete Assessment"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Grid Mode: Responsive columns accounting for md: 256px sidebar */
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3.5 sm:gap-5">
          {filteredQuizzes.map((quiz) => {
            const questionCount = quiz.questions?.length || 0;
            const targetClassLabel = classNameMap[quiz.classId] || 'Class Assessment';

            return (
              <div
                key={quiz.id}
                className="bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--accent)]/50 rounded-xl p-3.5 sm:p-4 transition-all duration-200 flex flex-col justify-between space-y-3 group relative shadow-2xs hover:shadow-md overflow-hidden"
              >
                {/* Status & Subject Kicker + Admin Quick Actions */}
                <div className="space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--ink-muted)]">
                      <span className="font-semibold text-[var(--accent)] text-xs">
                        {quiz.subject}
                      </span>
                      {selectedClassId === 'all' && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-[11px]">{targetClassLabel}</span>
                        </>
                      )}
                      {isAdmin && !quiz.isPublished && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-semibold text-amber-500 flex items-center gap-1 text-[11px]">
                            <EyeOff className="w-3 h-3" /> Draft
                          </span>
                        </>
                      )}
                    </div>

                    {/* Teacher / Admin Top Quick Actions */}
                    {isAdmin && (
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => onEditQuiz(quiz)}
                          className="p-1 rounded-md text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-higher)] transition cursor-pointer"
                          title="Edit Assessment & Questions"
                          aria-label="Edit Assessment"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setQuizToDelete(quiz)}
                          className="p-1 rounded-md text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 transition cursor-pointer"
                          title="Delete Assessment"
                          aria-label="Delete Assessment"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  <h3 className="font-semibold text-sm text-[var(--ink)] group-hover:text-[var(--accent)] transition leading-snug line-clamp-2 break-words">
                    {quiz.title}
                  </h3>

                  {quiz.description && (
                    <p className="text-xs text-[var(--ink-muted)] line-clamp-2 leading-relaxed font-sans break-words">
                      {quiz.description}
                    </p>
                  )}
                </div>

                {/* Question Info Metrics */}
                <div className="pt-2.5 border-t border-[var(--border)] space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-1.5 font-mono text-xs text-[var(--ink-muted)]">
                    <span className="flex items-center gap-1.5 text-[var(--ink)] whitespace-nowrap">
                      <FileQuestion className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                      {questionCount} {questionCount === 1 ? 'Question' : 'Questions'}
                    </span>
                    <span className="flex items-center gap-1.5 text-[var(--warning-amber)] font-semibold whitespace-nowrap">
                      <Award className="w-3.5 h-3.5 text-[var(--warning-amber)] shrink-0" />
                      {quiz.totalPoints} Marks
                    </span>
                  </div>

                  {quiz.timeLimitMinutes && quiz.timeLimitMinutes > 0 ? (
                    <div className="font-mono text-[11px] text-[var(--ink)]/40 flex items-center gap-1">
                      <Clock className="w-3 h-3 text-[var(--ink)]/40" />
                      <span>Limit: {quiz.timeLimitMinutes} min</span>
                    </div>
                  ) : null}

                  {/* Action Buttons: Clean full-width hierarchy */}
                  <div className="space-y-2 pt-2 border-t border-[var(--border)]">
                    {/* Primary Take Test Button */}
                    <button
                      type="button"
                      onClick={() => onTakeQuiz(quiz)}
                      className="w-full py-2 px-3 rounded-xl font-bold text-xs bg-blue-600 hover:bg-blue-500 text-white flex flex-wrap items-center justify-center gap-1.5 shadow-xs transition cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5 fill-current shrink-0" />
                      <span>{isAdmin ? 'Take Test (Admin Mode)' : 'Take Test'}</span>
                      {isAdmin && (
                        <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded font-mono font-normal">
                          No ID • Unlimited
                        </span>
                      )}
                    </button>

                    {/* Teacher Secondary Actions: Paper & Submissions */}
                    {isAdmin && (
                      <div className="grid grid-cols-1 xs:grid-cols-2 gap-2 w-full pt-0.5">
                        <a
                          href={getAuthenticatedPrintUrl(`/api/print/quiz/${quiz.id}`)}
                          target="_blank"
                          rel="noopener noreferrer"
                          id={`print-quiz-btn-${quiz.id}`}
                          className="w-full py-2 px-2 rounded-xl text-xs font-semibold bg-[var(--surface-higher)] hover:bg-[var(--surface-highest)] text-[var(--ink)] border border-[var(--border)] flex items-center justify-center gap-1.5 transition cursor-pointer shadow-2xs"
                          title="Print Question Paper (Questions Only)"
                        >
                          <Printer className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                          <span className="font-semibold text-xs whitespace-nowrap">Print Paper</span>
                        </a>

                        <button
                          type="button"
                          onClick={() => onViewSubmissions(quiz)}
                          id={`view-submissions-btn-${quiz.id}`}
                          className="w-full py-2 px-2 rounded-xl text-xs font-semibold bg-[var(--surface-higher)] hover:bg-[var(--surface-highest)] text-[var(--ink)] border border-[var(--border)] flex items-center justify-center gap-1.5 transition cursor-pointer shadow-2xs"
                          title="Inspect Student Submissions & Evaluated Sheets"
                        >
                          <Users className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                          <span className="font-semibold text-xs whitespace-nowrap">Submissions</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        )
      ) : (
        /* Empty State */
        <div className="bg-[var(--surface)] border border-dashed border-[var(--border)] rounded-2xl p-6 sm:p-12 text-center max-w-md mx-auto my-4 sm:my-8 space-y-4 shadow-sm">
          <div className="w-12 h-12 rounded-xl bg-[var(--surface-higher)] text-[var(--accent)] border border-[var(--border)] flex items-center justify-center mx-auto">
            <FileQuestion className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="font-geist font-bold text-base text-[var(--ink)]">No assessments found</h3>
            <p className="text-xs text-[var(--ink-muted)] font-sans">
              {search
                ? 'No quizzes match your search term. Try a different search.'
                : `No tests created for ${activeClassName} yet.`}
            </p>
          </div>

          {isAdmin && (
            <button
              type="button"
              onClick={onCreateQuiz}
              className="btn btn-primary inline-flex items-center gap-1.5 py-2 text-xs"
            >
              <Plus className="w-3.5 h-3.5" /> Create First Test
            </button>
          )}
        </div>
      )}

      {/* CONFIRM DELETE QUIZ MODAL */}
      {quizToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-md">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 sm:p-6 max-w-md w-full max-h-[90vh] overflow-y-auto space-y-4 sm:space-y-5 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-500 border border-rose-500/20 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="font-geist font-bold text-base text-[var(--ink)]">Delete Assessment?</h3>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-500">Permanent action</p>
              </div>
            </div>

            <p className="text-xs text-[var(--ink-muted)] leading-relaxed bg-[var(--surface-higher)] p-3.5 rounded-xl border border-[var(--border)] font-sans break-words">
              Are you sure you want to delete <strong className="text-[var(--ink)]">"{quizToDelete.title}"</strong> ({quizToDelete.questions.length} questions, {quizToDelete.totalPoints} marks)? All student attempts for this test will also be deleted.
            </p>

            <div className="flex flex-col-reverse xs:flex-row items-stretch xs:items-center justify-end gap-2 sm:gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setQuizToDelete(null)}
                className="btn py-2 text-xs justify-center"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const id = quizToDelete.id;
                  setQuizToDelete(null);
                  onDeleteQuiz(id);
                }}
                className="btn bg-rose-600 text-white hover:bg-rose-500 py-2 text-xs font-semibold justify-center"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Yes, Delete Assessment</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
