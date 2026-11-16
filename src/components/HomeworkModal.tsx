import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Check,
  CalendarCheck,
  Calendar,
  AlertCircle,
  Plus,
  School,
  FileText,
  Clock
} from 'lucide-react';
import { ClassItem, HomeworkItem, SubjectCategory } from '../types';
import { getDualDate } from '../lib/nepaliDate';

interface HomeworkModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (homework: Partial<HomeworkItem>) => Promise<void>;
  editingHomework?: HomeworkItem | null;
  classes: ClassItem[];
  subjects: SubjectCategory[];
  activeClassId?: string;
  onAddSubject?: (newSubject: SubjectCategory) => Promise<void>;
}

export const HomeworkModal: React.FC<HomeworkModalProps> = ({
  isOpen,
  onClose,
  onSave,
  editingHomework,
  classes,
  subjects,
  activeClassId,
  onAddSubject,
}) => {
  const [classId, setClassId] = useState<string>('');
  const [subject, setSubject] = useState<string>('');
  const [title, setTitle] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [assignedDate, setAssignedDate] = useState<string>('');
  const [dueDate, setDueDate] = useState<string>('');
  const [assignedDateBS, setAssignedDateBS] = useState<string>('');
  const [dueDateBS, setDueDateBS] = useState<string>('');
  const [isCreatingSubject, setIsCreatingSubject] = useState<boolean>(false);
  const [customSubjectName, setCustomSubjectName] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const assignedDual = useMemo(() => getDualDate(assignedDate || todayStr, assignedDateBS), [assignedDate, assignedDateBS, todayStr]);
  const dueDual = useMemo(() => getDualDate(dueDate || todayStr, dueDateBS), [dueDate, dueDateBS, todayStr]);

  useEffect(() => {
    if (editingHomework) {
      setClassId(editingHomework.classId);
      setSubject(editingHomework.subject);
      setTitle(editingHomework.title);
      setDescription(editingHomework.description);
      setAssignedDate(editingHomework.assignedDate || todayStr);
      setDueDate(editingHomework.dueDate || todayStr);
      setAssignedDateBS(editingHomework.assignedDateBS || '');
      setDueDateBS(editingHomework.dueDateBS || '');
    } else {
      setClassId(activeClassId && activeClassId !== 'all' ? activeClassId : (classes[0]?.id || ''));
      const firstSub = subjects.find((s) => s.id !== 'all');
      setSubject(firstSub ? firstSub.name : 'Mathematics');
      setTitle('');
      setDescription('');
      setAssignedDate(todayStr);

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().slice(0, 10);
      setDueDate(tomorrowStr);
      setAssignedDateBS('');
      setDueDateBS('');
    }
    setIsCreatingSubject(false);
    setCustomSubjectName('');
    setError(null);
  }, [editingHomework, isOpen, activeClassId, classes, subjects, todayStr]);

  if (!isOpen) return null;

  const handleQuickDueDate = (daysAhead: number) => {
    const base = assignedDate ? new Date(assignedDate) : new Date();
    base.setDate(base.getDate() + daysAhead);
    const dateStr = base.toISOString().slice(0, 10);
    setDueDate(dateStr);
    setDueDateBS('');
  };

  const handleCreateCustomSubject = async () => {
    if (!customSubjectName.trim()) return;
    const name = customSubjectName.trim();
    if (onAddSubject) {
      try {
        await onAddSubject({
          id: `custom-${Date.now()}`,
          name,
          color: 'from-blue-600 to-indigo-600',
        });
      } catch (e) {
        console.error('Error saving subject:', e);
      }
    }
    setSubject(name);
    setIsCreatingSubject(false);
    setCustomSubjectName('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      setError('Please provide homework task description.');
      return;
    }

    const effectiveTitle = title.trim() || description.trim().split('\n')[0].slice(0, 60) || `${subject} Homework`;

    try {
      setIsSubmitting(true);
      setError(null);
      await onSave({
        ...(editingHomework ? { id: editingHomework.id } : {}),
        classId,
        subject,
        title: effectiveTitle,
        description: description.trim(),
        assignedDate,
        dueDate,
        assignedDateBS: assignedDateBS || assignedDual.bsFormatted,
        dueDateBS: dueDateBS || dueDual.bsFormatted,
        priority: 'normal',
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save homework assignment');
    } finally {
      setIsSubmitting(false);
    }
  };

  const validSubjects = subjects.filter((s) => s.id !== 'all');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in font-sans">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl w-full max-w-3xl flex flex-col shadow-2xl overflow-hidden max-h-[92vh]">
        {/* Modal Header */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-[var(--border)] flex items-center justify-between gap-2 bg-[var(--surface-higher)] shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center shadow-xs shrink-0">
              <CalendarCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-sm sm:text-base text-[var(--ink)] truncate">
                {editingHomework ? 'Edit Homework Assignment' : 'Assign New Homework'}
              </h2>
              <p className="text-[11px] sm:text-xs text-[var(--ink-muted)] truncate">
                Organized curriculum task with dual English (AD) &amp; Nepali (BS) schedule
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--surface)] rounded-xl transition cursor-pointer shrink-0"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-5 sm:space-y-6 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 bg-rose-500/15 border border-rose-500/30 rounded-xl text-xs text-rose-600 dark:text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Section 1: Target Class & Subject */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-bold text-[var(--ink)] pb-1 border-b border-[var(--border)]">
              <School className="w-4 h-4 text-blue-500" />
              <span>Class &amp; Subject</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
              {/* Class Selection */}
              <div>
                <label className="block text-xs font-semibold text-[var(--ink)] mb-1.5">
                  Class Grade *
                </label>
                <select
                  value={classId}
                  onChange={(e) => setClassId(e.target.value)}
                  className="w-full bg-[var(--surface-higher)] text-[var(--ink)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition cursor-pointer shadow-xs [&>option]:bg-[#191c24] [&>option]:text-slate-100"
                  required
                >
                  {classes.map((c) => (
                    <option key={c.id} value={c.id} className="bg-[#191c24] text-slate-100 py-1">
                      {c.name} {c.section ? `(${c.section})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Subject Selection */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-[var(--ink)]">
                    Subject *
                  </label>
                  {!isCreatingSubject && onAddSubject && (
                    <button
                      type="button"
                      onClick={() => setIsCreatingSubject(true)}
                      className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold hover:underline flex items-center gap-0.5 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>New Subject</span>
                    </button>
                  )}
                </div>

                {isCreatingSubject ? (
                  <div className="flex items-center gap-1.5 min-w-0">
                    <input
                      type="text"
                      autoFocus
                      placeholder="Subject name..."
                      value={customSubjectName}
                      onChange={(e) => setCustomSubjectName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleCreateCustomSubject();
                        }
                      }}
                      className="flex-1 min-w-0 bg-[var(--surface-higher)] text-[var(--ink)] border border-[var(--border)] rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 shadow-xs"
                    />
                    <button
                      type="button"
                      onClick={handleCreateCustomSubject}
                      className="btn btn-primary text-xs px-3 py-2 shrink-0 shadow-xs"
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsCreatingSubject(false)}
                      className="btn btn-secondary text-xs px-2.5 py-2 shrink-0 text-[var(--ink-muted)]"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <select
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full bg-[var(--surface-higher)] text-[var(--ink)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition cursor-pointer shadow-xs [&>option]:bg-[#191c24] [&>option]:text-slate-100"
                    required
                  >
                    {validSubjects.length > 0 ? (
                      validSubjects.map((s) => (
                        <option key={s.id} value={s.name} className="bg-[#191c24] text-slate-100 py-1">
                          {s.name}
                        </option>
                      ))
                    ) : (
                      <>
                        <option value="Mathematics" className="bg-[#191c24] text-slate-100 py-1">Mathematics</option>
                        <option value="Science" className="bg-[#191c24] text-slate-100 py-1">Science</option>
                        <option value="English" className="bg-[#191c24] text-slate-100 py-1">English</option>
                        <option value="Nepali" className="bg-[#191c24] text-slate-100 py-1">Nepali</option>
                        <option value="Social Studies" className="bg-[#191c24] text-slate-100 py-1">Social Studies</option>
                        <option value="Computer" className="bg-[#191c24] text-slate-100 py-1">Computer</option>
                      </>
                    )}
                  </select>
                )}
              </div>
            </div>
          </div>

          {/* Section 2: Task & Instructions */}
          <div className="space-y-3.5">
            <div className="flex items-center gap-2 text-xs font-bold text-[var(--ink)] pb-1 border-b border-[var(--border)]">
              <FileText className="w-4 h-4 text-blue-500" />
              <span>Homework Task &amp; Instructions</span>
            </div>

            <div className="space-y-3 pt-1">
              <div>
                <label className="block text-xs font-semibold text-[var(--ink)] mb-1.5">
                  Topic / Title <span className="text-[10px] font-normal text-[var(--ink-muted)]">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Chapter 4 Exercise 4.2 or Reading Comprehension"
                  className="w-full bg-[var(--surface-higher)] text-[var(--ink)] border border-[var(--border)] rounded-xl px-3.5 py-2.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition placeholder:text-[var(--ink-muted)] shadow-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--ink)] mb-1.5">
                  Homework Description &amp; Questions *
                </label>
                <textarea
                  required
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Write specific instructions, question numbers (e.g. Q 1 to 5 from Page 45), or guidelines for students..."
                  className="w-full bg-[var(--surface-higher)] text-[var(--ink)] border border-[var(--border)] rounded-xl px-3.5 py-2.5 text-xs resize-none leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition placeholder:text-[var(--ink-muted)] shadow-xs"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Schedule & Submission Dates */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-bold text-[var(--ink)] pb-1 border-b border-[var(--border)]">
              <Clock className="w-4 h-4 text-blue-500" />
              <span>Timeline &amp; Dates (AD &amp; Nepali BS)</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
              {/* Assigned Date Box */}
              <div className="p-3.5 rounded-xl bg-[var(--surface-higher)] border border-[var(--border)] space-y-2 shadow-xs">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-[var(--ink)] flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-blue-500" />
                    <span>Assigned Date</span>
                  </label>
                  <span className="text-[10px] text-[var(--ink-muted)]">English (AD)</span>
                </div>
                <input
                  type="date"
                  required
                  value={assignedDate}
                  onChange={(e) => setAssignedDate(e.target.value)}
                  className="w-full bg-[var(--surface)] text-[var(--ink)] border border-[var(--border)] rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                />
                <div className="pt-2 border-t border-[var(--border)] flex items-center justify-between text-xs">
                  <span className="text-[var(--ink-muted)] text-[10px]">Nepali (वि.सं.):</span>
                  <span className="font-bold text-amber-500 font-mono text-xs">
                    {assignedDual.bsFormatted}
                  </span>
                </div>
              </div>

              {/* Submission Date Box */}
              <div className="p-3.5 rounded-xl bg-[var(--surface-higher)] border border-[var(--border)] space-y-2 shadow-xs">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-[var(--ink)] flex items-center gap-1.5">
                    <CalendarCheck className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Submission Date *</span>
                  </label>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">Target Date</span>
                </div>
                <input
                  type="date"
                  required
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full bg-[var(--surface)] text-emerald-600 dark:text-emerald-400 border border-[var(--border)] rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                />
                <div className="pt-2 border-t border-[var(--border)] flex items-center justify-between text-xs">
                  <span className="text-[var(--ink-muted)] text-[10px]">Nepali (वि.सं.):</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono text-xs">
                    {dueDual.bsFormatted}
                  </span>
                </div>

                {/* Quick Date Presets */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[10px] text-[var(--ink-muted)] mr-0.5">Quick:</span>
                  <button
                    type="button"
                    onClick={() => handleQuickDueDate(1)}
                    className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-[var(--surface)] hover:bg-emerald-500/15 text-[var(--ink)] hover:text-emerald-500 border border-[var(--border)] transition cursor-pointer"
                  >
                    Tomorrow
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickDueDate(2)}
                    className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-[var(--surface)] hover:bg-emerald-500/15 text-[var(--ink)] hover:text-emerald-500 border border-[var(--border)] transition cursor-pointer"
                  >
                    +2 Days
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickDueDate(7)}
                    className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-[var(--surface)] hover:bg-emerald-500/15 text-[var(--ink)] hover:text-emerald-500 border border-[var(--border)] transition cursor-pointer"
                  >
                    +1 Week
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex flex-col-reverse xs:flex-row items-stretch xs:items-center justify-end gap-2 sm:gap-2.5 pt-3 border-t border-[var(--border)]">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary text-xs px-4 py-2 cursor-pointer font-semibold justify-center"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn btn-primary text-xs px-5 py-2 flex items-center justify-center gap-1.5 font-bold cursor-pointer shadow-xs"
            >
              <Check className="w-4 h-4 shrink-0" />
              <span>{isSubmitting ? 'Saving...' : editingHomework ? 'Update Assignment' : 'Save & Assign Homework'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
