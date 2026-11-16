import React, { useState, useEffect } from 'react';
import {
  X,
  Check,
  AlertCircle,
  BookOpen,
  School,
  Hash,
  FileText
} from 'lucide-react';
import { ClassItem, LessonItem, SubjectCategory, TermType } from '../types';

interface LessonModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (lesson: Partial<LessonItem>) => Promise<void>;
  editingLesson?: LessonItem | null;
  classes: ClassItem[];
  subjects: SubjectCategory[];
  activeClassId?: string;
  defaultTerm?: TermType;
}

export const LessonModal: React.FC<LessonModalProps> = ({
  isOpen,
  onClose,
  onSave,
  editingLesson,
  classes,
  subjects,
  activeClassId,
  defaultTerm = 'term1',
}) => {
  const [classId, setClassId] = useState<string>('');
  const [subject, setSubject] = useState<string>('');
  const [term, setTerm] = useState<TermType>(defaultTerm);
  const [unit, setUnit] = useState<string>('');
  const [lessonNo, setLessonNo] = useState<string>('');
  const [title, setTitle] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editingLesson) {
      setClassId(editingLesson.classId);
      setSubject(editingLesson.subject);
      setTerm(editingLesson.term || defaultTerm);
      setUnit(editingLesson.unit || '');
      setLessonNo(editingLesson.lessonNo || '');
      setTitle(editingLesson.title);
      setDescription(editingLesson.description || '');
    } else {
      setClassId(activeClassId && activeClassId !== 'all' ? activeClassId : (classes[0]?.id || ''));
      const firstSub = subjects.find((s) => s.id !== 'all');
      setSubject(firstSub ? firstSub.name : 'Mathematics');
      setTerm(defaultTerm);
      setUnit('');
      setLessonNo('');
      setTitle('');
      setDescription('');
    }
    setError(null);
  }, [editingLesson, isOpen, activeClassId, classes, subjects, defaultTerm]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Please provide a lesson title.');
      return;
    }
    if (!classId) {
      setError('Please select a target class.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await onSave({
        ...(editingLesson ? { id: editingLesson.id } : {}),
        classId,
        subject,
        term,
        unit: unit.trim() || undefined,
        lessonNo: lessonNo.trim() || undefined,
        title: title.trim(),
        description: description.trim() || undefined,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save syllabus lesson');
    } finally {
      setIsSubmitting(false);
    }
  };

  const validSubjects = subjects.filter((s) => s.id !== 'all');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in font-sans">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-[var(--border)] flex items-center justify-between gap-2 bg-[var(--surface-higher)] shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center shadow-xs shrink-0">
              <BookOpen className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-sm sm:text-base text-[var(--ink)] truncate">
                {editingLesson ? 'Edit Syllabus Lesson' : 'Add Syllabus Lesson'}
              </h2>
              <p className="text-[11px] sm:text-xs text-[var(--ink-muted)] truncate">
                Organize curriculum topics and key concepts by academic term
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
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 overflow-y-auto space-y-5 sm:space-y-6 flex-1">
          {error && (
            <div className="p-3 bg-rose-500/15 border border-rose-500/30 rounded-xl text-xs text-rose-600 dark:text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Section 1: Academic Scope (Class, Subject, Term) */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-bold text-[var(--ink)] pb-1 border-b border-[var(--border)]">
              <School className="w-4 h-4 text-blue-500" />
              <span>Academic Details</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-1">
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
                <label className="block text-xs font-semibold text-[var(--ink)] mb-1.5">
                  Subject *
                </label>
                <select
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full bg-[var(--surface-higher)] text-[var(--ink)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition cursor-pointer shadow-xs [&>option]:bg-[#191c24] [&>option]:text-slate-100"
                  required
                >
                  {validSubjects.map((s) => (
                    <option key={s.id} value={s.name} className="bg-[#191c24] text-slate-100 py-1">
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Term Selection */}
              <div>
                <label className="block text-xs font-semibold text-[var(--ink)] mb-1.5">
                  Academic Term *
                </label>
                <select
                  value={term}
                  onChange={(e) => setTerm(e.target.value as TermType)}
                  className="w-full bg-[var(--surface-higher)] text-blue-600 dark:text-blue-400 font-bold border border-[var(--border)] rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition cursor-pointer shadow-xs [&>option]:bg-[#191c24] [&>option]:text-slate-100"
                  required
                >
                  <option value="term1" className="bg-[#191c24] text-slate-100 py-1">1st Term</option>
                  <option value="term2" className="bg-[#191c24] text-slate-100 py-1">2nd Term</option>
                  <option value="term3" className="bg-[#191c24] text-slate-100 py-1">3rd Term</option>
                  <option value="term4" className="bg-[#191c24] text-slate-100 py-1">4th Term</option>
                </select>
              </div>
            </div>
          </div>

          {/* Section 2: Unit & Lesson Identification */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-bold text-[var(--ink)] pb-1 border-b border-[var(--border)]">
              <Hash className="w-4 h-4 text-blue-500" />
              <span>Unit &amp; Lesson Structure</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
              <div>
                <label className="block text-xs font-semibold text-[var(--ink)] mb-1.5">
                  Unit / Chapter Name
                </label>
                <input
                  type="text"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="e.g. Unit 1: Algebra or Chapter 3"
                  className="w-full bg-[var(--surface-higher)] text-[var(--ink)] border border-[var(--border)] rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition placeholder:text-[var(--ink-muted)] shadow-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--ink)] mb-1.5">
                  Lesson Number
                </label>
                <input
                  type="text"
                  value={lessonNo}
                  onChange={(e) => setLessonNo(e.target.value)}
                  placeholder="e.g. Lesson 2 or 2"
                  className="w-full bg-[var(--surface-higher)] text-[var(--ink)] border border-[var(--border)] rounded-xl px-3.5 py-2.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition placeholder:text-[var(--ink-muted)] shadow-xs"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Lesson Title & Content */}
          <div className="space-y-3.5">
            <div className="flex items-center gap-2 text-xs font-bold text-[var(--ink)] pb-1 border-b border-[var(--border)]">
              <FileText className="w-4 h-4 text-blue-500" />
              <span>Lesson Content &amp; Key Concepts</span>
            </div>

            <div className="space-y-3 pt-1">
              <div>
                <label className="block text-xs font-semibold text-[var(--ink)] mb-1.5">
                  Lesson Title *
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Solving Quadratic Equations with Factoring"
                  className="w-full bg-[var(--surface-higher)] text-[var(--ink)] border border-[var(--border)] rounded-xl px-3.5 py-2.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition placeholder:text-[var(--ink-muted)] shadow-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--ink)] mb-1.5">
                  Brief Description &amp; Learning Outcomes
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="Brief summary of concepts, formulas, or competencies covered in this lesson..."
                  className="w-full bg-[var(--surface-higher)] text-[var(--ink)] border border-[var(--border)] rounded-xl px-3.5 py-2.5 text-xs resize-none leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition placeholder:text-[var(--ink-muted)] shadow-xs"
                />
              </div>
            </div>
          </div>

          {/* Modal Actions */}
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
              <span>{isSubmitting ? 'Saving...' : editingLesson ? 'Update Lesson' : 'Add to Syllabus'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
