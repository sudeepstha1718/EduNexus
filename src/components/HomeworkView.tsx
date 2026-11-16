import React, { useState, useMemo } from 'react';
import {
  CalendarCheck,
  Calendar,
  BookOpen,
  Plus,
  Edit2,
  Trash2,
  Search,
  Copy,
  Check,
  Star,
  Eye,
  X
} from 'lucide-react';
import { ClassItem, HomeworkItem, SubjectCategory } from '../types';
import { getDualDate } from '../lib/nepaliDate';

interface HomeworkViewProps {
  homeworkList: HomeworkItem[];
  classes: ClassItem[];
  subjects: SubjectCategory[];
  currentClass: ClassItem | null;
  isAdmin: boolean;
  onOpenAddHomework: () => void;
  onEditHomework: (item: HomeworkItem) => void;
  onDeleteHomework: (id: string) => Promise<void>;
  studentName?: string;
  studentId?: string;
}

export const HomeworkView: React.FC<HomeworkViewProps> = ({
  homeworkList,
  classes,
  subjects,
  currentClass,
  isAdmin,
  onOpenAddHomework,
  onEditHomework,
  onDeleteHomework,
}) => {
  const [selectedSubject, setSelectedSubject] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<HomeworkItem | null>(null);

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const todayDual = useMemo(() => getDualDate(todayStr), [todayStr]);

  // Filter and sort homework: Latest homework first
  const sortedAndFilteredHomework = useMemo(() => {
    const filtered = homeworkList.filter((item) => {
      // Class filter
      if (currentClass && item.classId !== currentClass.id && item.classId !== 'all') {
        return false;
      }
      // Subject filter
      if (selectedSubject !== 'all' && item.subject.toLowerCase() !== selectedSubject.toLowerCase()) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = item.title.toLowerCase().includes(q);
        const matchesDesc = item.description.toLowerCase().includes(q);
        const matchesSubject = item.subject.toLowerCase().includes(q);
        const matchesRef = item.pageReference?.toLowerCase().includes(q);
        const matchesTeacher = item.teacherName?.toLowerCase().includes(q);
        const matchesBS = item.assignedDateBS?.toLowerCase().includes(q) || item.dueDateBS?.toLowerCase().includes(q);
        return matchesTitle || matchesDesc || matchesSubject || matchesRef || matchesTeacher || !!matchesBS;
      }

      return true;
    });

    return filtered.sort((a, b) => {
      const dateA = a.assignedDate || a.createdAt || '';
      const dateB = b.assignedDate || b.createdAt || '';
      if (dateB !== dateA) {
        return dateB.localeCompare(dateA);
      }
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });
  }, [homeworkList, currentClass, selectedSubject, searchQuery]);

  // Identify the latest homework overall for this class
  const latestHomeworkId = useMemo(() => {
    const classItems = homeworkList.filter(
      (item) => !currentClass || item.classId === currentClass.id || item.classId === 'all'
    );
    if (classItems.length === 0) return null;
    const sorted = [...classItems].sort((a, b) => {
      const dateA = a.assignedDate || a.createdAt || '';
      const dateB = b.assignedDate || b.createdAt || '';
      if (dateB !== dateA) return dateB.localeCompare(dateA);
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });
    return sorted[0]?.id || null;
  }, [homeworkList, currentClass]);

  const totalClassHomework = useMemo(() => {
    return homeworkList.filter(
      (item) => !currentClass || item.classId === currentClass.id || item.classId === 'all'
    ).length;
  }, [homeworkList, currentClass]);

  const copyHomeworkDetails = (item: HomeworkItem) => {
    const assignedDual = getDualDate(item.assignedDate, item.assignedDateBS);
    const dueDual = getDualDate(item.dueDate, item.dueDateBS);
    const text = `📚 Homework: ${item.title}\n📖 Subject: ${item.subject}\n🗓 Due: ${dueDual.adFormatted} (${dueDual.bsFormatted})\n📝 Details: ${item.description}${item.pageReference ? `\n📌 Reference: ${item.pageReference}` : ''}${item.submissionInstructions ? `\n📍 Submission: ${item.submissionInstructions}` : ''}`;
    navigator.clipboard.writeText(text);
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="flex flex-col gap-4 sm:gap-5 animate-fade-in font-sans">
      {/* Page Title Card Header */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-3.5 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-3 shadow-xs relative overflow-hidden">
        <div className="flex items-start gap-3 sm:gap-3.5 min-w-0 flex-1">
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-amber-500/12 border border-amber-500/25 text-amber-500 flex items-center justify-center shrink-0">
            <CalendarCheck className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mb-0.5 text-xs text-[var(--ink-muted)]">
              <span className="font-semibold text-[var(--accent)] break-words">
                {currentClass?.name || 'All Classes'}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums text-[11px]">{todayDual.adFormatted} ({todayDual.bsFormatted})</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums text-[11px]">{totalClassHomework} task{totalClassHomework === 1 ? '' : 's'}</span>
            </div>
            <h1 className="text-lg sm:text-xl lg:text-2xl font-bold tracking-tight text-[var(--ink)] break-words">
              Daily Homework
            </h1>
            <p className="text-xs text-[var(--ink-muted)] mt-0.5 break-words leading-relaxed">
              Browse daily assignments, exercises, and submission deadlines.
            </p>
          </div>
        </div>

        {/* Header Actions */}
        {isAdmin && (
          <div className="flex items-center gap-2 w-full lg:w-auto shrink-0">
            <button
              type="button"
              onClick={onOpenAddHomework}
              className="btn btn-primary w-full xs:w-auto justify-center py-2 px-3.5 text-xs font-semibold flex items-center gap-1.5 shadow-2xs active:scale-95 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 shrink-0" />
              <span>Assign Homework</span>
            </button>
          </div>
        )}
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
            placeholder="Search homework by title, subject, page number, or teacher..."
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
            {subjects.filter((s) => s.id !== 'all').map((s) => (
              <option key={s.id} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>

          {/* Assignment Counter Badge */}
          <span className="text-[11px] sm:text-xs text-[var(--ink-muted)] px-2 sm:px-2.5 py-1.5 rounded-lg bg-[var(--surface-higher)] border border-[var(--border)] shrink-0 font-medium">
            {sortedAndFilteredHomework.length} {sortedAndFilteredHomework.length === 1 ? 'task' : 'tasks'}
          </span>
        </div>
      </div>

      {/* Homework Listed View Only */}
      {sortedAndFilteredHomework.length === 0 ? (
        <div className="p-10 text-center bg-[var(--surface)] border border-dashed border-[var(--border)] rounded-2xl space-y-3">
          <div className="w-11 h-11 rounded-full bg-blue-500/15 text-blue-500 flex items-center justify-center mx-auto">
            <CalendarCheck className="w-5 h-5" />
          </div>
          <h3 className="font-bold text-sm text-[var(--ink)]">No Homework Found</h3>
          <p className="text-xs text-[var(--ink-muted)] max-w-sm mx-auto">
            {searchQuery || selectedSubject !== 'all'
              ? 'No assignments match the selected filters. Try resetting your search or subject filter.'
              : 'There are currently no homework assignments listed for this class.'}
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
                onClick={onOpenAddHomework}
                className="btn btn-primary text-xs px-3.5 py-1.5 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Assign First Homework</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        /* Clean, Compact Horizontal Listed Cards */
        <div className="space-y-2.5">
          {sortedAndFilteredHomework.map((item, index) => {
            const isLatest = item.id === latestHomeworkId || index === 0;
            const dueDual = getDualDate(item.dueDate, item.dueDateBS);
            const assignedDual = getDualDate(item.assignedDate, item.assignedDateBS);

            return (
              <div
                key={item.id}
                className={`group bg-[var(--surface)] border ${
                  isLatest
                    ? 'border-blue-500/40 bg-blue-500/[0.02]'
                    : 'border-[var(--border)] hover:border-[var(--accent)]/50'
                } p-3.5 sm:p-4 rounded-xl transition-all duration-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs hover:shadow-md`}
              >
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border bg-blue-500/10 border-blue-500/20 text-blue-500">
                    <BookOpen className="w-4 h-4" />
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* Metadata kicker */}
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--ink-muted)] mb-1">
                      {isLatest && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-500">
                          <Star className="w-3 h-3 fill-blue-500" /> New
                          <span aria-hidden="true" className="text-[var(--border)]">·</span>
                        </span>
                      )}
                      <span className="font-semibold text-[var(--ink)]">{item.subject}</span>
                      {item.classId && item.classId !== 'all' && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{classes.find(c => c.id === item.classId)?.name || item.classId}</span>
                        </>
                      )}
                      {item.teacherName && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>By {item.teacherName}</span>
                        </>
                      )}
                      {item.pageReference && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono text-[11px] bg-[var(--surface-higher)] px-1.5 py-0.2 rounded border border-[var(--border)] font-medium text-[var(--ink)]">
                            {item.pageReference}
                          </span>
                        </>
                      )}
                    </div>

                    <h3 className="font-bold text-[var(--ink)] text-sm sm:text-base leading-snug line-clamp-2 break-words group-hover:text-[var(--accent)] transition-colors">
                      {item.title}
                    </h3>

                    {item.description && (
                      <p className="text-xs text-[var(--ink-muted)] line-clamp-1 break-words mt-0.5">
                        {item.description}
                      </p>
                    )}

                    <div className="flex items-center gap-2 text-xs text-[var(--ink-muted)] mt-1.5 flex-wrap">
                      <span className="flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400 text-[11px]">
                        <CalendarCheck className="w-3 h-3" />
                        <span>Due: {dueDual.adFormatted} ({dueDual.bsFormatted})</span>
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="flex items-center gap-1 text-[11px]">
                        <Calendar className="w-3 h-3" />
                        <span>Assigned: {assignedDual.adFormatted}</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right Action Buttons */}
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 shrink-0 self-end sm:self-center pt-2 sm:pt-0 border-t sm:border-t-0 border-[var(--border)] w-full sm:w-auto justify-end">
                  <button
                    type="button"
                    onClick={() => setPreviewItem(item)}
                    className="flex items-center gap-1.5 py-1.5 px-2.5 sm:px-3 rounded-lg text-xs font-semibold bg-[var(--surface-higher)] hover:bg-[var(--surface-highest)] border border-[var(--border)] text-[var(--ink)] transition cursor-pointer active:scale-95"
                  >
                    <Eye className="w-3.5 h-3.5 text-[var(--ink-muted)]" />
                    <span>View</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => copyHomeworkDetails(item)}
                    className="flex items-center gap-1.5 py-1.5 px-3 sm:px-3.5 rounded-lg text-xs font-semibold bg-[var(--accent)] hover:opacity-90 text-white transition cursor-pointer shadow-xs active:scale-95"
                  >
                    {copiedId === item.id ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>

                  {isAdmin && (
                    <div className="flex items-center gap-1 pl-1.5 sm:pl-2 border-l border-[var(--border)]">
                      <button
                        type="button"
                        onClick={() => onEditHomework(item)}
                        className="p-1.5 rounded-lg border border-[var(--border)] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-higher)] transition cursor-pointer"
                        title="Edit homework"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteHomework(item.id)}
                        className="p-1.5 rounded-lg border border-rose-500/20 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 transition cursor-pointer"
                        title="Delete homework"
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

      {/* Clean Homework Details Preview Modal */}
      {previewItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-scale-in">
            {/* Modal Header */}
            <div className="p-3.5 sm:p-5 border-b border-[var(--border)] flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-500 flex items-center justify-center shrink-0">
                  <BookOpen className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold text-[var(--ink-muted)] uppercase tracking-wider truncate">
                    {previewItem.subject} · {classes.find(c => c.id === previewItem.classId)?.name || 'Class Assignment'}
                  </div>
                  <h3 className="font-bold text-sm sm:text-base text-[var(--ink)] leading-tight truncate">
                    Assignment Details
                  </h3>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setPreviewItem(null)}
                className="p-1.5 rounded-lg hover:bg-[var(--surface-higher)] text-[var(--ink-muted)] hover:text-[var(--ink)] transition cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-3.5 sm:p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-[var(--ink)] leading-snug break-words">
                  {previewItem.title}
                </h2>
                {previewItem.teacherName && (
                  <p className="text-xs text-[var(--ink-muted)] mt-0.5">
                    Assigned by <strong className="font-medium text-[var(--ink)]">{previewItem.teacherName}</strong>
                  </p>
                )}
              </div>

              {/* Due Date & Assigned Date Grid */}
              <div className="grid grid-cols-1 xs:grid-cols-2 gap-2.5 p-3 rounded-xl bg-[var(--surface-higher)] border border-[var(--border)]">
                <div>
                  <div className="text-[10.5px] uppercase font-semibold text-[var(--ink-muted)] flex items-center gap-1 mb-1">
                    <Calendar className="w-3 h-3" /> Assigned
                  </div>
                  <div className="text-xs font-semibold text-[var(--ink)]">
                    {getDualDate(previewItem.assignedDate, previewItem.assignedDateBS).adFormatted}
                  </div>
                  <div className="text-[11px] text-[var(--ink-muted)]">
                    {getDualDate(previewItem.assignedDate, previewItem.assignedDateBS).bsFormatted}
                  </div>
                </div>

                <div>
                  <div className="text-[10.5px] uppercase font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 mb-1">
                    <CalendarCheck className="w-3 h-3" /> Due Date
                  </div>
                  <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    {getDualDate(previewItem.dueDate, previewItem.dueDateBS).adFormatted}
                  </div>
                  <div className="text-[11px] text-[var(--ink-muted)]">
                    {getDualDate(previewItem.dueDate, previewItem.dueDateBS).bsFormatted}
                  </div>
                </div>
              </div>

              {/* Page Reference if present */}
              {previewItem.pageReference && (
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-[var(--surface-higher)] border border-[var(--border)] text-xs">
                  <BookOpen className="w-4 h-4 text-[var(--accent)] shrink-0" />
                  <div>
                    <span className="text-[var(--ink-muted)]">Textbook Reference: </span>
                    <strong className="font-semibold text-[var(--ink)]">{previewItem.pageReference}</strong>
                  </div>
                </div>
              )}

              {/* Instructions / Description */}
              <div className="space-y-1.5">
                <h4 className="text-xs font-semibold uppercase text-[var(--ink-muted)] tracking-wider">
                  Instructions &amp; Tasks
                </h4>
                <div className="p-3.5 rounded-xl bg-[var(--surface-higher)] border border-[var(--border)] text-xs text-[var(--ink)] leading-relaxed whitespace-pre-line">
                  {previewItem.description || 'No specific instructions provided.'}
                </div>
              </div>

              {/* Submission Guidelines if present */}
              {previewItem.submissionInstructions && (
                <div className="space-y-1.5">
                  <h4 className="text-xs font-semibold uppercase text-[var(--ink-muted)] tracking-wider">
                    How to Submit
                  </h4>
                  <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-[var(--ink)] leading-relaxed">
                    {previewItem.submissionInstructions}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3.5 sm:p-4 border-t border-[var(--border)] bg-[var(--surface-higher)] flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => copyHomeworkDetails(previewItem)}
                className="btn text-xs py-1.5 px-3 flex items-center gap-1.5 cursor-pointer font-medium"
              >
                {copiedId === previewItem.id ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="text-emerald-500">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Details</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setPreviewItem(null)}
                className="btn btn-primary text-xs py-1.5 px-4 cursor-pointer font-medium"
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
