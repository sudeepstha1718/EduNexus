import React, { useState, useMemo } from 'react';
import {
  BookOpen,
  GraduationCap,
  CheckCircle2,
  Clock,
  Plus,
  Edit2,
  Trash2,
  Search,
  Printer,
  Eye,
  Check,
  X,
  Layers,
  Calendar
} from 'lucide-react';
import { ClassItem, LessonItem, LessonStatus, SubjectCategory, TermType } from '../types';

interface LessonListViewProps {
  lessonList: LessonItem[];
  classes: ClassItem[];
  subjects: SubjectCategory[];
  currentClass: ClassItem | null;
  isAdmin: boolean;
  onOpenAddLesson: (defaultTerm?: TermType) => void;
  onEditLesson: (item: LessonItem) => void;
  onUpdateLessonStatus: (id: string, status: LessonStatus) => Promise<void>;
  onDeleteLesson: (id: string) => Promise<void>;
}

export const LessonListView: React.FC<LessonListViewProps> = ({
  lessonList,
  classes,
  subjects,
  currentClass,
  isAdmin,
  onOpenAddLesson,
  onEditLesson,
  onUpdateLessonStatus,
  onDeleteLesson,
}) => {
  const [activeTerm, setActiveTerm] = useState<TermType | 'all'>('term1');
  const [selectedSubject, setSelectedSubject] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [previewLesson, setPreviewLesson] = useState<LessonItem | null>(null);

  const termTabs: { id: TermType | 'all'; label: string }[] = [
    { id: 'term1', label: '1st Term' },
    { id: 'term2', label: '2nd Term' },
    { id: 'term3', label: '3rd Term' },
    { id: 'term4', label: '4th Term' },
    { id: 'all', label: 'All Terms' },
  ];

  const getTermName = (term: TermType) => {
    switch (term) {
      case 'term1': return '1st Term';
      case 'term2': return '2nd Term';
      case 'term3': return '3rd Term';
      case 'term4': return '4th Term';
    }
  };

  // Filter lessons
  const filteredLessons = useMemo(() => {
    return lessonList.filter((lesson) => {
      // Class filter
      if (currentClass && lesson.classId !== currentClass.id && lesson.classId !== 'all') {
        return false;
      }
      // Term filter
      if (activeTerm !== 'all' && lesson.term !== activeTerm) {
        return false;
      }
      // Subject filter
      if (selectedSubject !== 'all' && lesson.subject.toLowerCase() !== selectedSubject.toLowerCase()) {
        return false;
      }
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = lesson.title.toLowerCase().includes(q);
        const matchesChapter = lesson.chapterNo?.toLowerCase().includes(q);
        const matchesDesc = lesson.description?.toLowerCase().includes(q);
        const matchesTopics = lesson.topicsCovered?.some((t) => t.toLowerCase().includes(q));
        const matchesUnit = lesson.unit?.toLowerCase().includes(q);
        return matchesTitle || matchesChapter || matchesDesc || matchesTopics || !!matchesUnit;
      }
      return true;
    });
  }, [lessonList, currentClass, activeTerm, selectedSubject, searchQuery]);

  const termMetrics = useMemo(() => {
    const classLessons = lessonList.filter(
      (l) => (!currentClass || l.classId === currentClass.id || l.classId === 'all') &&
             (activeTerm === 'all' || l.term === activeTerm)
    );
    const total = classLessons.length;
    const completed = classLessons.filter((l) => l.status === 'completed').length;
    const remaining = total - completed;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, remaining, percent };
  }, [lessonList, currentClass, activeTerm]);

  const handlePrintSyllabus = () => {
    window.print();
  };

  // Toggle completion with single click (Admin only)
  const handleToggleComplete = async (lesson: LessonItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!isAdmin) return;
    const newStatus: LessonStatus = lesson.status === 'completed' ? 'planned' : 'completed';
    await onUpdateLessonStatus(lesson.id, newStatus);
    if (previewLesson && previewLesson.id === lesson.id) {
      setPreviewLesson({ ...previewLesson, status: newStatus });
    }
  };

  return (
    <div className="flex flex-col gap-4 sm:gap-5 animate-fade-in font-sans">
      {/* Clean Page Title Card Header matching Tests & Materials */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-3.5 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-3 shadow-xs relative overflow-hidden">
        <div className="flex items-start gap-3 sm:gap-3.5 min-w-0 flex-1">
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-emerald-500/12 border border-emerald-500/25 text-emerald-500 flex items-center justify-center shrink-0">
            <BookOpen className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mb-0.5 text-xs text-[var(--ink-muted)]">
              <span className="font-semibold text-[var(--accent)] break-words">
                {currentClass?.name || 'All Classes'}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums text-[11px]">
                {activeTerm === 'all' ? 'All Terms' : getTermName(activeTerm as TermType)}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums text-[11px]">
                {termMetrics.completed}/{termMetrics.total} covered ({termMetrics.percent}%)
              </span>
            </div>
            <h1 className="text-lg sm:text-xl lg:text-2xl font-bold tracking-tight text-[var(--ink)] break-words">
              Syllabus &amp; Lesson Guide
            </h1>
            <p className="text-xs text-[var(--ink-muted)] mt-0.5 break-words leading-relaxed">
              Term-by-term curriculum progression, chapters, and completion status.
            </p>
          </div>
        </div>

        {/* Header Actions */}
        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto shrink-0">
          <button
            type="button"
            onClick={handlePrintSyllabus}
            className="btn btn-secondary flex-1 xs:flex-none justify-center py-2 px-3.5 text-xs font-semibold flex items-center gap-1.5 shadow-2xs active:scale-95 cursor-pointer"
            title="Print Term Syllabus"
          >
            <Printer className="w-3.5 h-3.5 shrink-0" />
            <span>Print</span>
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={() => onOpenAddLesson(activeTerm === 'all' ? 'term1' : activeTerm)}
              className="btn btn-primary flex-1 xs:flex-none justify-center py-2 px-3.5 text-xs font-semibold flex items-center gap-1.5 shadow-2xs active:scale-95 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 shrink-0" />
              <span>Add Lesson</span>
            </button>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-2.5 sm:p-3 shadow-2xs">
        <div className="flex items-center justify-between text-xs text-[var(--ink-muted)] mb-1.5">
          <span className="font-medium text-[var(--ink)]">
            {activeTerm === 'all' ? 'Full Curriculum Progress' : `${getTermName(activeTerm as TermType)} Completion`}
          </span>
          <span className="font-mono font-semibold text-[var(--ink)]">
            {termMetrics.completed} of {termMetrics.total} lessons ({termMetrics.percent}%)
          </span>
        </div>
        <div className="w-full h-2 bg-[var(--surface-highest)] rounded-full overflow-hidden border border-[var(--border)]">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full transition-all duration-500"
            style={{ width: `${termMetrics.percent}%` }}
          />
        </div>
      </div>

      {/* Term Selection Tabs (Clean & Compact) */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {termTabs.map((tab) => {
          const isActive = activeTerm === tab.id;
          const countInTerm = lessonList.filter(
            (l) => (!currentClass || l.classId === currentClass.id || l.classId === 'all') &&
                   (tab.id === 'all' || l.term === tab.id)
          ).length;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTerm(tab.id)}
              className={`py-1.5 px-3 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer shrink-0 border ${
                isActive
                  ? 'bg-[var(--accent)] text-white border-[var(--accent)] shadow-2xs'
                  : 'bg-[var(--surface)] text-[var(--ink-muted)] hover:text-[var(--ink)] border-[var(--border)] hover:bg-[var(--surface-higher)]'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`text-[10px] font-mono px-1.5 py-0.2 rounded-md font-bold ${
                  isActive ? 'bg-white/20 text-white' : 'bg-[var(--surface-higher)] text-[var(--ink-muted)]'
                }`}
              >
                {countInTerm}
              </span>
            </button>
          );
        })}
      </div>

      {/* Filter & Search Toolbar (Listed View Only - No grid toggle) */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-2.5 sm:p-3 flex flex-col sm:flex-row md:flex-col lg:flex-row items-stretch sm:items-center md:items-stretch lg:items-center justify-between gap-2.5 sm:gap-3 shadow-xs">
        {/* Search */}
        <div className="relative flex-1 min-w-0">
          <Search className="w-3.5 h-3.5 text-[var(--ink-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search lessons by chapter, topics, or title..."
            className="input pl-8 py-1.5 text-xs w-full"
          />
        </div>

        {/* Right Filter Section */}
        <div className="flex items-center gap-2 w-full sm:w-auto md:w-full lg:w-auto justify-between sm:justify-end min-w-0">
          {/* Subject Filter */}
          <select
            value={selectedSubject}
            onChange={(e) => setSelectedSubject(e.target.value)}
            className="input py-1.5 px-2.5 sm:px-3 text-xs cursor-pointer font-medium flex-1 sm:flex-none md:flex-1 lg:flex-none min-w-0 max-w-full lg:max-w-[200px]"
          >
            <option value="all">All Subjects</option>
            {subjects.filter(s => s.id !== 'all').map((s) => (
              <option key={s.id} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>

          {/* Lesson Counter Badge */}
          <span className="text-[11px] sm:text-xs text-[var(--ink-muted)] px-2 sm:px-2.5 py-1.5 rounded-lg bg-[var(--surface-higher)] border border-[var(--border)] shrink-0 font-medium">
            {filteredLessons.length} {filteredLessons.length === 1 ? 'lesson' : 'lessons'}
          </span>
        </div>
      </div>

      {/* Syllabus Listed View Only */}
      {filteredLessons.length === 0 ? (
        <div className="p-10 text-center bg-[var(--surface)] border border-dashed border-[var(--border)] rounded-2xl space-y-3">
          <div className="w-11 h-11 rounded-full bg-blue-500/15 text-blue-500 flex items-center justify-center mx-auto">
            <BookOpen className="w-5 h-5" />
          </div>
          <h3 className="font-bold text-sm text-[var(--ink)]">No Lessons Found</h3>
          <p className="text-xs text-[var(--ink-muted)] max-w-sm mx-auto">
            {searchQuery || selectedSubject !== 'all'
              ? 'No curriculum chapters match the chosen filters. Try resetting your search or subject filter.'
              : `No lessons have been scheduled for ${activeTerm === 'all' ? 'this class' : getTermName(activeTerm as TermType)} yet.`}
          </p>
          {(searchQuery || selectedSubject !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedSubject('all');
              }}
              className="btn text-xs px-3 py-1.5 inline-flex items-center gap-1.5 cursor-pointer"
            >
              Reset Filters
            </button>
          )}
          {isAdmin && (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => onOpenAddLesson(activeTerm === 'all' ? 'term1' : activeTerm)}
                className="btn btn-primary text-xs px-3.5 py-1.5 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add First Lesson</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        /* Clean, Compact Horizontal Listed Cards */
        <div className="space-y-2.5">
          {filteredLessons.map((lesson) => {
            const isCompleted = lesson.status === 'completed';
            const displayUnit = lesson.unit || (lesson.chapterNo?.toLowerCase().includes('unit') ? lesson.chapterNo.split('•')[0].trim() : '');
            const displayLessonNo = lesson.lessonNo || (lesson.chapterNo?.toLowerCase().includes('lesson') ? (lesson.chapterNo.split('•')[1] || lesson.chapterNo).trim() : (!displayUnit ? lesson.chapterNo : ''));

            return (
              <div
                key={lesson.id}
                className={`group bg-[var(--surface)] border ${
                  isCompleted
                    ? 'border-emerald-500/30 bg-emerald-500/[0.02]'
                    : 'border-[var(--border)] hover:border-[var(--accent)]/50'
                } p-3.5 sm:p-4 rounded-xl transition-all duration-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs hover:shadow-md`}
              >
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border bg-purple-500/10 border-purple-500/20 text-purple-500">
                    <GraduationCap className="w-4 h-4" />
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* Metadata kicker */}
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--ink-muted)] mb-1">
                      {displayUnit && (
                        <span className="font-bold text-[var(--accent)]">{displayUnit}</span>
                      )}
                      <span className="font-semibold text-[var(--ink)]">{lesson.subject}</span>
                      <span aria-hidden="true">·</span>
                      <span>{getTermName(lesson.term)}</span>
                      {displayLessonNo && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono text-[11px] bg-[var(--surface-higher)] px-1.5 py-0.2 rounded border border-[var(--border)] font-medium text-[var(--ink)]">
                            {displayLessonNo}
                          </span>
                        </>
                      )}
                      {lesson.estimatedWeeks && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-[11px]">{lesson.estimatedWeeks}</span>
                        </>
                      )}
                    </div>

                    <h3 className={`font-bold text-sm sm:text-base leading-snug line-clamp-2 break-words transition-colors ${
                      isCompleted ? 'text-[var(--ink)] line-through decoration-emerald-500/40 opacity-80' : 'text-[var(--ink)] group-hover:text-[var(--accent)]'
                    }`}>
                      {lesson.title}
                    </h3>

                    {lesson.description && (
                      <p className="text-xs text-[var(--ink-muted)] line-clamp-1 break-words mt-0.5">
                        {lesson.description}
                      </p>
                    )}

                    <div className="flex items-center gap-2 text-xs text-[var(--ink-muted)] mt-1.5 flex-wrap">
                      <span className={`flex items-center gap-1 font-semibold text-[11px] ${
                        isCompleted ? 'text-emerald-600 dark:text-emerald-400' : 'text-[var(--ink-muted)]'
                      }`}>
                        <CheckCircle2 className="w-3 h-3" />
                        <span>{isCompleted ? 'Completed' : 'Upcoming'}</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right Action Buttons */}
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 shrink-0 self-end sm:self-center pt-2 sm:pt-0 border-t sm:border-t-0 border-[var(--border)] w-full sm:w-auto justify-end">
                  <button
                    type="button"
                    onClick={() => setPreviewLesson(lesson)}
                    className="flex items-center gap-1.5 py-1.5 px-2.5 sm:px-3 rounded-lg text-xs font-semibold bg-[var(--surface-higher)] hover:bg-[var(--surface-highest)] border border-[var(--border)] text-[var(--ink)] transition cursor-pointer active:scale-95"
                  >
                    <Eye className="w-3.5 h-3.5 text-[var(--ink-muted)]" />
                    <span>View</span>
                  </button>

                  {isAdmin && (
                    <button
                      type="button"
                      onClick={(e) => handleToggleComplete(lesson, e)}
                      className={`flex items-center gap-1.5 py-1.5 px-2.5 sm:px-3 rounded-lg text-xs font-semibold transition cursor-pointer active:scale-95 shadow-xs ${
                        isCompleted
                          ? 'bg-emerald-500 text-white'
                          : 'bg-[var(--accent)] text-white'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{isCompleted ? 'Done' : 'Mark Done'}</span>
                    </button>
                  )}

                  {isAdmin && (
                    <div className="flex items-center gap-1 pl-1.5 sm:pl-2 border-l border-[var(--border)]">
                      <button
                        type="button"
                        onClick={() => onEditLesson(lesson)}
                        className="p-1.5 rounded-lg border border-[var(--border)] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-higher)] transition cursor-pointer"
                        title="Edit lesson"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteLesson(lesson.id)}
                        className="p-1.5 rounded-lg border border-rose-500/20 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 transition cursor-pointer"
                        title="Delete lesson"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Clean Lesson Details Preview Modal */}
      {previewLesson && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-scale-in">
            {/* Modal Header */}
            <div className="p-3.5 sm:p-5 border-b border-[var(--border)] flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-500 flex items-center justify-center shrink-0">
                  <GraduationCap className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold text-[var(--ink-muted)] uppercase tracking-wider truncate">
                    {previewLesson.subject} · {getTermName(previewLesson.term)}
                  </div>
                  <h3 className="font-bold text-sm sm:text-base text-[var(--ink)] leading-tight truncate">
                    Lesson Information
                  </h3>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setPreviewLesson(null)}
                className="p-1.5 rounded-lg hover:bg-[var(--surface-higher)] text-[var(--ink-muted)] hover:text-[var(--ink)] transition cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-3.5 sm:p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-[var(--ink)] leading-snug break-words">
                  {previewLesson.title}
                </h2>
                {previewLesson.unit && (
                  <p className="text-xs text-[var(--accent)] font-semibold mt-0.5">
                    {previewLesson.unit} {previewLesson.lessonNo ? `• ${previewLesson.lessonNo}` : ''}
                  </p>
                )}
              </div>

              {/* Status and Duration Info */}
              <div className="grid grid-cols-1 xs:grid-cols-2 gap-2.5 p-3 rounded-xl bg-[var(--surface-higher)] border border-[var(--border)]">
                <div>
                  <div className="text-[10.5px] uppercase font-semibold text-[var(--ink-muted)] mb-1">
                    Completion Status
                  </div>
                  <div className={`text-xs font-bold flex items-center gap-1 ${
                    previewLesson.status === 'completed' ? 'text-emerald-600 dark:text-emerald-400' : 'text-[var(--ink-muted)]'
                  }`}>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{previewLesson.status === 'completed' ? 'Covered in Class' : 'Upcoming / In Progress'}</span>
                  </div>
                </div>

                <div>
                  <div className="text-[10.5px] uppercase font-semibold text-[var(--ink-muted)] mb-1">
                    Timeline
                  </div>
                  <div className="text-xs font-semibold text-[var(--ink)]">
                    {previewLesson.estimatedWeeks || 'Flexible pace'}
                  </div>
                </div>
              </div>

              {/* Description */}
              {previewLesson.description && (
                <div className="space-y-1.5">
                  <h4 className="text-xs font-semibold uppercase text-[var(--ink-muted)] tracking-wider">
                    Overview
                  </h4>
                  <div className="p-3.5 rounded-xl bg-[var(--surface-higher)] border border-[var(--border)] text-xs text-[var(--ink)] leading-relaxed whitespace-pre-line">
                    {previewLesson.description}
                  </div>
                </div>
              )}

              {/* Topics Covered */}
              {previewLesson.topicsCovered && previewLesson.topicsCovered.length > 0 && (
                <div className="space-y-1.5">
                  <h4 className="text-xs font-semibold uppercase text-[var(--ink-muted)] tracking-wider">
                    Topics &amp; Concepts
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {previewLesson.topicsCovered.map((topic, i) => (
                      <span
                        key={i}
                        className="px-2.5 py-1 rounded-lg text-xs font-medium bg-[var(--surface-higher)] text-[var(--ink)] border border-[var(--border)]"
                      >
                        {topic}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3.5 sm:p-4 border-t border-[var(--border)] bg-[var(--surface-higher)] flex flex-wrap items-center justify-between gap-2">
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => handleToggleComplete(previewLesson)}
                  className={`btn text-xs py-1.5 px-3 flex items-center gap-1.5 cursor-pointer font-medium ${
                    previewLesson.status === 'completed' ? 'btn-secondary' : 'btn-primary'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{previewLesson.status === 'completed' ? 'Mark Incomplete' : 'Mark Completed'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setPreviewLesson(null)}
                className="btn btn-primary text-xs py-1.5 px-4 cursor-pointer font-medium ml-auto"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
