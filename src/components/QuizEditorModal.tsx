import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { QuizItem, QuestionItem, QuestionType, ClassItem, SubjectCategory } from '../types';
import { generateAiSolution } from '../lib/api';
import { ImageUploadField } from './ImageUploadField';
import {
  X,
  Plus,
  Trash2,
  HelpCircle,
  Sparkles,
  Save,
  CheckCircle2,
  ImageIcon,
  ListOrdered,
  ToggleLeft,
  ToggleRight,
  Type,
  FileQuestion,
  Layers,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  Wand2,
  Copy,
  Award
} from 'lucide-react';

interface QuizEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveQuiz: (quiz: QuizItem) => Promise<void>;
  editingQuiz: QuizItem | null;
  classes: ClassItem[];
  subjects: SubjectCategory[];
  defaultClassId?: string;
  defaultSubject?: string;
}

const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  mcq: 'Multiple Choice (MCQ)',
  true_false: 'True / False',
  fill_blanks: 'Fill in the Blanks',
  match_following: 'Match the Following',
  picture_question: 'Picture / Diagram Question',
  question_answer: 'Question & Answer',
};

const QUESTION_BUTTON_CONFIG: { type: QuestionType; label: string }[] = [
  { type: 'mcq', label: 'MCQ' },
  { type: 'true_false', label: 'True/False' },
  { type: 'fill_blanks', label: 'Fill Blank' },
  { type: 'match_following', label: 'Match' },
  { type: 'picture_question', label: 'Picture Q' },
  { type: 'question_answer', label: 'Q&A' },
];

export const QuizEditorModal: React.FC<QuizEditorModalProps> = ({
  isOpen,
  onClose,
  onSaveQuiz,
  editingQuiz,
  classes,
  subjects,
  defaultClassId = 'all',
  defaultSubject = 'Science',
}) => {
  const [title, setTitle] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [classId, setClassId] = useState<string>('all');
  const [subject, setSubject] = useState<string>('Science');
  const [timeLimitMinutes, setTimeLimitMinutes] = useState<number>(0);
  const [isPublished, setIsPublished] = useState<boolean>(true);
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [typeDefaultMarks, setTypeDefaultMarks] = useState<Record<QuestionType, number>>({
    mcq: 1,
    true_false: 1,
    fill_blanks: 2,
    match_following: 4,
    picture_question: 5,
    question_answer: 5,
  });
  const [marksPopoverType, setMarksPopoverType] = useState<QuestionType | null>(null);
  const [tempPopoverMarks, setTempPopoverMarks] = useState<number>(1);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [aiGeneratingIndex, setAiGeneratingIndex] = useState<number | null>(null);
  const [showImageUploadMap, setShowImageUploadMap] = useState<Record<string, boolean>>({});

  const prevIsOpenRef = useRef<boolean>(false);
  const prevEditingQuizIdRef = useRef<string | null>(null);
  const holdTimerRef = useRef<any>(null);
  const isHoldTriggeredRef = useRef<boolean>(false);

  // Long-press / Hold detection on question type buttons
  const startHold = (type: QuestionType) => {
    isHoldTriggeredRef.current = false;
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    holdTimerRef.current = setTimeout(() => {
      isHoldTriggeredRef.current = true;
      setMarksPopoverType(type);
      setTempPopoverMarks(typeDefaultMarks[type] || 1);
      try {
        if ('vibrate' in navigator) navigator.vibrate(35);
      } catch (e) {}
    }, 450);
  };

  const cancelHold = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  const handleButtonClick = (type: QuestionType) => {
    if (isHoldTriggeredRef.current) {
      isHoldTriggeredRef.current = false;
      return;
    }
    handleAddQuestion(type);
  };

  // Only initialize form fields when the modal opens or when switching editingQuiz
  useEffect(() => {
    const isOpening = !prevIsOpenRef.current && isOpen;
    const isQuizChanged = editingQuiz?.id !== prevEditingQuizIdRef.current;

    if (isOpen && (isOpening || isQuizChanged)) {
      if (editingQuiz) {
        setTitle(editingQuiz.title || '');
        setDescription(editingQuiz.description || '');
        setClassId(editingQuiz.classId || 'all');
        setSubject(editingQuiz.subject || defaultSubject || 'Science');
        setTimeLimitMinutes(editingQuiz.timeLimitMinutes || 0);
        setIsPublished(editingQuiz.isPublished !== false);
        setQuestions(
          editingQuiz.questions && editingQuiz.questions.length > 0
            ? JSON.parse(JSON.stringify(editingQuiz.questions))
            : []
        );
      } else {
        setTitle('');
        setDescription('');
        setClassId(defaultClassId || 'all');
        setSubject(defaultSubject !== 'all' ? defaultSubject : (subjects[0]?.name || 'Science'));
        setTimeLimitMinutes(0);
        setIsPublished(true);
        setQuestions([
          {
            id: `q-${Date.now()}-1-${Math.random().toString(36).slice(2, 7)}`,
            type: 'mcq',
            questionText: '',
            points: typeDefaultMarks.mcq || 1,
            options: ['', '', '', ''],
            correctAnswer: '',
            gradingRubric: 'Select the choice matching the teacher reference solution.'
          }
        ]);
      }
      setValidationError(null);
      setShowImageUploadMap({});
    }

    prevIsOpenRef.current = isOpen;
    prevEditingQuizIdRef.current = editingQuiz?.id || null;
  }, [isOpen, editingQuiz, defaultClassId, defaultSubject, subjects]);

  if (!isOpen) return null;

  // Add new question with clean defaults
  const handleAddQuestion = (type: QuestionType) => {
    const newId = `q-${Date.now()}-${questions.length + 1}-${Math.random().toString(36).slice(2, 7)}`;
    const assignedPoints = typeDefaultMarks[type] || 1;
    let newQ: QuestionItem;

    switch (type) {
      case 'mcq':
        newQ = {
          id: newId,
          type: 'mcq',
          questionText: '',
          points: assignedPoints,
          options: ['', '', '', ''],
          correctAnswer: '',
          gradingRubric: 'Check that student selects the correct option choice.'
        };
        break;
      case 'true_false':
        newQ = {
          id: newId,
          type: 'true_false',
          questionText: '',
          points: assignedPoints,
          correctAnswer: 'True',
          gradingRubric: 'Verify whether the statement is True or False.'
        };
        break;
      case 'fill_blanks':
        newQ = {
          id: newId,
          type: 'fill_blanks',
          questionText: '',
          blankTemplate: '',
          points: assignedPoints,
          correctAnswer: '',
          gradingRubric: 'Accept exact word or closely matching synonymous concept.'
        };
        break;
      case 'match_following':
        newQ = {
          id: newId,
          type: 'match_following',
          questionText: 'Match each item on the left with its correct counterpart on the right:',
          points: assignedPoints,
          matchingPairs: [
            { id: '1', left: '', right: '' },
            { id: '2', left: '', right: '' }
          ],
          correctAnswer: '',
          gradingRubric: 'Award marks proportionally for each valid pairing.'
        };
        break;
      case 'picture_question':
        newQ = {
          id: newId,
          type: 'picture_question',
          questionText: '',
          imageUrl: '',
          points: assignedPoints,
          correctAnswer: '',
          gradingRubric: 'Student must identify the diagram and describe its primary function.'
        };
        break;
      case 'question_answer':
      default:
        newQ = {
          id: newId,
          type: 'question_answer',
          questionText: '',
          points: assignedPoints,
          correctAnswer: '',
          gradingRubric: 'Award full marks for core concepts, partial marks for partial explanations.'
        };
        break;
    }

    setQuestions((prev) => [...prev, newQ]);
  };

  // Duplicate an existing question
  const handleDuplicateQuestion = (index: number) => {
    const sourceQ = questions[index];
    if (!sourceQ) return;
    const duplicatedQ: QuestionItem = JSON.parse(JSON.stringify(sourceQ));
    duplicatedQ.id = `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    if (duplicatedQ.subQuestions && duplicatedQ.subQuestions.length > 0) {
      duplicatedQ.subQuestions = duplicatedQ.subQuestions.map((sq, sqIdx) => ({
        ...sq,
        id: `sq-${Date.now()}-${sqIdx + 1}-${Math.random().toString(36).slice(2, 7)}`,
      }));
    }
    if (duplicatedQ.blankItems && duplicatedQ.blankItems.length > 0) {
      duplicatedQ.blankItems = duplicatedQ.blankItems.map((bi, biIdx) => ({
        ...bi,
        id: `b-${Date.now()}-${biIdx + 1}-${Math.random().toString(36).slice(2, 7)}`,
      }));
    }
    setQuestions((prev) => {
      const copy = [...prev];
      copy.splice(index + 1, 0, duplicatedQ);
      return copy;
    });
  };

  // Save marks: updates all questions of this type in this test AND sets the default for any new ones
  const handleSavePopoverMarks = () => {
    if (!marksPopoverType) return;
    const finalMarks = Math.max(0.5, Math.min(100, Number(tempPopoverMarks) || 1));
    setTypeDefaultMarks((prev) => ({
      ...prev,
      [marksPopoverType]: finalMarks,
    }));

    // Directly update all questions of this type in this test so user never has to change them one by one
    setQuestions((prev) =>
      prev.map((q) => (q.type === marksPopoverType ? { ...q, points: finalMarks } : q))
    );
    setMarksPopoverType(null);
  };

  // Update specific question field
  const handleUpdateQuestion = (index: number, field: keyof QuestionItem, value: any) => {
    setQuestions((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  // Auto-generate Reference Solution and Rubric
  const handleGenerateAiSolution = async (index: number) => {
    const q = questions[index];
    if (!q.questionText.trim()) {
      setValidationError(`Please write the Question Prompt for #${index + 1} first before generating a solution.`);
      return;
    }

    setAiGeneratingIndex(index);
    setValidationError(null);
    try {
      const res = await generateAiSolution({
        questionText: q.questionText,
        type: q.type,
        classId: classId,
        subject: subject,
      });

      if (res) {
        setQuestions((prev) => {
          const copy = [...prev];
          const curr = { ...copy[index] };
          if (res.correctAnswer) curr.correctAnswer = res.correctAnswer;
          if (res.gradingRubric) curr.gradingRubric = res.gradingRubric;
          if (curr.type === 'mcq' && Array.isArray(res.options) && res.options.length >= 2) {
            curr.options = res.options;
            curr.correctAnswer = res.correctAnswer || res.options[0];
          }
          if (curr.type === 'fill_blanks' && res.blankAnswer) {
            curr.correctAnswer = res.blankAnswer;
          }
          copy[index] = curr;
          return copy;
        });
      }
    } catch (err: any) {
      console.error('Failed to generate AI solution:', err);
      setValidationError('Could not auto-generate solution. You can manually enter the reference answer below.');
    } finally {
      setAiGeneratingIndex(null);
    }
  };

  // Delete question
  const handleDeleteQuestion = (index: number) => {
    setQuestions((prev) => prev.filter((_, i) => i !== index));
  };

  // Move Question Up/Down
  const handleMoveQuestion = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === questions.length - 1) return;

    setQuestions((prev) => {
      const copy = [...prev];
      const targetIdx = direction === 'up' ? index - 1 : index + 1;
      const temp = copy[index];
      copy[index] = copy[targetIdx];
      copy[targetIdx] = temp;
      return copy;
    });
  };

  // Calculate total marks
  const totalPoints = questions.reduce((sum, q) => sum + (Number(q.points) || 1), 0);

  // Submit and save quiz
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setValidationError('Please enter a Quiz / Assessment Title');
      return;
    }
    if (questions.length === 0) {
      setValidationError('Please add at least one question to the assessment.');
      return;
    }

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.questionText.trim()) {
        setValidationError(`Question #${i + 1} prompt cannot be empty.`);
        return;
      }
      if (!q.correctAnswer || !q.correctAnswer.trim()) {
        if (q.subQuestions && q.subQuestions.length > 0) {
          const autoRef = q.subQuestions
            .map((sq, sIdx) => `${sq.label || `(${String.fromCharCode(97 + sIdx)})`}: ${sq.correctAnswer || (sq.type === 'mcq' && sq.options?.[0]) || 'Valid answer'}`)
            .join('; ');
          q.correctAnswer = autoRef || 'See sub-questions';
        } else if (q.type === 'mcq') {
          const firstOpt = (q.options && q.options.find((o) => o.trim())) || 'Option A';
          q.correctAnswer = firstOpt;
        } else if (q.type === 'true_false') {
          q.correctAnswer = 'True';
        } else if (q.type === 'fill_blanks' && q.blankItems && q.blankItems.length > 0) {
          const refStr = q.blankItems
            .filter((b) => b.correctAnswer)
            .map((b, i) => `${i + 1}. ${b.correctAnswer}`)
            .join('; ');
          q.correctAnswer = refStr || 'Blank answers';
        } else if (q.type === 'match_following' && q.matchingPairs && q.matchingPairs.length > 0) {
          const refStr = q.matchingPairs
            .filter((p) => p.left && p.right)
            .map((p) => `${p.left} -> ${p.right}`)
            .join(', ');
          q.correctAnswer = refStr || 'Matching pairs';
        } else {
          setValidationError(`Please provide a model answer for Question #${i + 1}.`);
          return;
        }
      }
    }

    setIsSaving(true);
    setValidationError(null);

    const quizData: QuizItem = {
      id: editingQuiz ? editingQuiz.id : `quiz-${Date.now()}`,
      title: title.trim(),
      description: description.trim(),
      classId: classId,
      subject: subject,
      timeLimitMinutes: Number(timeLimitMinutes) || 0,
      totalPoints: totalPoints,
      isPublished: isPublished,
      createdAt: editingQuiz ? editingQuiz.createdAt : new Date().toISOString(),
      questions: questions.map((q, idx) => {
        const sanitizedSubQs = q.subQuestions && q.subQuestions.length > 0
          ? q.subQuestions.map((sq, sqIdx) => ({
              ...sq,
              id: sq.id || `sq-${Date.now()}-${sqIdx + 1}`,
              label: sq.label || `(${String.fromCharCode(97 + sqIdx)})`,
              points: Number(sq.points) || 1,
              type: sq.type || 'text',
              options: sq.type === 'mcq' ? (sq.options && sq.options.length > 0 ? sq.options : ['Option A', 'Option B', 'Option C', 'Option D']) : undefined,
              correctAnswer: sq.correctAnswer || (sq.type === 'mcq' && sq.options?.[0]) || 'Reference answer',
            }))
          : undefined;

        const calculatedPoints = sanitizedSubQs
          ? sanitizedSubQs.reduce((sum, s) => sum + (Number(s.points) || 1), 0)
          : Number(q.points) || 1;

        return {
          ...q,
          orderIndex: idx,
          points: calculatedPoints,
          subQuestions: sanitizedSubQs,
          imageUrl: q.imageUrl && q.imageUrl.trim() ? q.imageUrl.trim() : undefined,
        };
      }),
    };

    try {
      await onSaveQuiz(quizData);
      onClose();
    } catch (err: any) {
      console.error('Failed to save quiz:', err);
      setValidationError(err.message || 'Error saving assessment to database.');
    } finally {
      setIsSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] overflow-y-auto bg-black/75 backdrop-blur-sm flex items-center justify-center p-1.5 xs:p-2 sm:p-5 animate-in fade-in duration-200">
      <div
        id="quiz-editor-modal"
        className="bg-[var(--surface)] text-[var(--ink)] border border-[var(--border)] rounded-xl sm:rounded-3xl w-full max-w-4xl xl:max-w-5xl 2xl:max-w-6xl overflow-hidden flex flex-col max-h-[95vh] shadow-2xl transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-[var(--surface-higher)] text-[var(--ink)] px-3.5 sm:px-6 py-3 sm:py-4 flex items-center justify-between border-b border-[var(--border)] shrink-0 gap-2">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
              <FileQuestion className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-sm sm:text-base text-[var(--ink)] truncate">
                {editingQuiz ? 'Edit Assessment' : 'Create New Assessment'}
              </h2>
              <p className="text-[11px] text-[var(--ink-muted)] truncate max-w-[180px] xs:max-w-xs sm:max-w-md">
                Set up test questions, answer keys, and grading points
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 sm:p-2 bg-[var(--surface)] hover:bg-[var(--surface-higher)] text-[var(--ink-muted)] hover:text-[var(--ink)] border border-[var(--border)] rounded-xl transition cursor-pointer shrink-0 shadow-xs"
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-3 xs:p-4 sm:p-6 space-y-4 sm:space-y-6 bg-[var(--bg)]">
          {validationError && (
            <div className="bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 px-4 py-3 rounded-xl text-xs font-semibold">
              {validationError}
            </div>
          )}

          {/* Basic Assessment Metadata */}
          <div className="bg-[var(--surface)] p-4 sm:p-5 rounded-2xl border border-[var(--border)] space-y-4 shadow-xs">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ink-muted)]">
              General Assessment Information
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="sm:col-span-2 space-y-1">
                <label className="text-xs font-semibold text-[var(--ink)] block">
                  Assessment Title <span className="text-amber-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Chapter 4: Cell Structure & Cellular Respiration Quiz"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--surface-higher)] border border-[var(--border)] focus:border-blue-500 text-xs sm:text-sm text-[var(--ink)] outline-none transition shadow-2xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--ink)] block">Target Class</label>
                <select
                  value={classId}
                  onChange={(e) => setClassId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--surface-higher)] border border-[var(--border)] focus:border-blue-500 text-xs sm:text-sm text-[var(--ink)] outline-none cursor-pointer transition shadow-2xs"
                >
                  <option value="all">All Classes / Universal Test</option>
                  {classes.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.name} {cls.section ? `(${cls.section})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--ink)] block">Subject</label>
                <select
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--surface-higher)] border border-[var(--border)] focus:border-blue-500 text-xs sm:text-sm text-[var(--ink)] outline-none cursor-pointer transition shadow-2xs"
                >
                  {subjects.map((sub) => (
                    <option key={sub.id} value={sub.name}>
                      {sub.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--ink)] block">
                  Time Limit (Minutes){' '}
                  <span className="text-[var(--ink-muted)] font-normal">(0 = Untimed)</span>
                </label>
                <input
                  type="number"
                  min="0"
                  max="360"
                  value={timeLimitMinutes}
                  onChange={(e) => setTimeLimitMinutes(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--surface-higher)] border border-[var(--border)] focus:border-blue-500 text-xs sm:text-sm text-[var(--ink)] outline-none transition shadow-2xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--ink)] block">Publish Status</label>
                <button
                  type="button"
                  onClick={() => setIsPublished(!isPublished)}
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-xs sm:text-sm font-bold flex items-center justify-between transition cursor-pointer shadow-2xs ${
                    isPublished
                      ? 'bg-blue-500/10 border-blue-500/40 text-blue-600 dark:text-blue-400'
                      : 'bg-[var(--surface-higher)] border-[var(--border)] text-[var(--ink-muted)]'
                  }`}
                >
                  <span>{isPublished ? 'Published (Live for Students)' : 'Draft (Hidden)'}</span>
                  {isPublished ? (
                    <ToggleRight className="w-5 h-5 text-blue-500" />
                  ) : (
                    <ToggleLeft className="w-5 h-5 text-[var(--ink-muted)]" />
                  )}
                </button>
              </div>

              <div className="sm:col-span-2 space-y-1">
                <label className="text-xs font-semibold text-[var(--ink)] block">
                  Instructions / Description
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Read each question carefully. You may answer in full sentences where requested."
                  className="w-full px-3.5 py-2 rounded-xl bg-[var(--surface-higher)] border border-[var(--border)] focus:border-blue-500 text-xs sm:text-sm text-[var(--ink)] outline-none transition shadow-2xs"
                />
              </div>
            </div>
          </div>

          {/* Question Builder Bar */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-sm text-[var(--ink)] flex items-center gap-2">
                  <Layers className="w-4 h-4 text-blue-500" /> Assessment Questions ({questions.length})
                </h3>
                <p className="text-xs text-[var(--ink-muted)]">
                  Total Marks: <strong className="text-blue-600 dark:text-blue-400 font-bold">{totalPoints} pts</strong>
                </p>
              </div>

              {/* Add Question Buttons with Hold / Long-press for Default Marks */}
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                {QUESTION_BUTTON_CONFIG.map(({ type, label }) => {
                  const currentDefault = typeDefaultMarks[type] || 1;
                  return (
                    <button
                      key={type}
                      type="button"
                      onMouseDown={() => startHold(type)}
                      onMouseUp={cancelHold}
                      onMouseLeave={cancelHold}
                      onTouchStart={() => startHold(type)}
                      onTouchEnd={cancelHold}
                      onTouchCancel={cancelHold}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        cancelHold();
                        setMarksPopoverType(type);
                        setTempPopoverMarks(typeDefaultMarks[type] || 1);
                      }}
                      onClick={() => handleButtonClick(type)}
                      title={`Click: Add ${label} • Hold / Right-click: Set marks (${currentDefault} pts)`}
                      className="group select-none relative px-2 xs:px-2.5 sm:px-3 py-1.5 rounded-xl bg-[var(--surface)] hover:bg-[var(--surface-higher)] text-[var(--ink)] border border-[var(--border)] hover:border-blue-500/50 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs active:scale-95"
                    >
                      <Plus className="w-3.5 h-3.5 text-blue-500 group-hover:rotate-90 transition-transform duration-200" />
                      <span>{label}</span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-[var(--surface-higher)] text-[var(--ink-muted)] group-hover:text-blue-600 dark:group-hover:text-blue-400 border border-[var(--border)]">
                        {currentDefault}m
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Questions List */}
          <div className="space-y-5">
            {questions.map((q, idx) => {
              const qKey = q.id || `q-${idx}`;
              const hasImage = Boolean(q.imageUrl && q.imageUrl.trim());
              const isImageVisible = q.type === 'picture_question' || hasImage || Boolean(showImageUploadMap[qKey]);

              return (
                <div
                  key={qKey}
                  className="bg-[var(--surface)] p-3 xs:p-4 sm:p-5 border border-[var(--border)] rounded-xl sm:rounded-3xl space-y-4 relative shadow-xs"
                >
                  {/* Top Bar of Card */}
                  <div className="flex flex-wrap items-center justify-between gap-2.5 pb-3 border-b border-[var(--border)]">
                    <div className="flex items-center gap-2">
                      <span className="w-7 h-7 rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30 font-mono font-bold text-xs flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <span className="text-xs font-bold uppercase tracking-wider text-[var(--ink)] bg-[var(--surface-higher)] border border-[var(--border)] px-2.5 py-1 rounded-lg">
                        {q.type.replace('_', ' ')}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 sm:gap-3 justify-end">
                      <div className="flex items-center gap-1.5">
                        <label className="text-xs font-semibold text-[var(--ink-muted)]">Marks:</label>
                        <input
                          type="number"
                          min="0.5"
                          step="0.5"
                          max="100"
                          value={q.points}
                          onChange={(e) =>
                            handleUpdateQuestion(idx, 'points', Number(e.target.value) || 1)
                          }
                          className="w-16 px-2.5 py-1 bg-[var(--surface-higher)] border border-[var(--border)] focus:border-blue-500 text-xs font-bold text-[var(--ink)] text-center outline-none rounded-xl"
                        />
                      </div>

                      <div className="flex items-center gap-1 border-l border-[var(--border)] pl-2">
                        {/* Duplicate Question Button */}
                        <button
                          type="button"
                          onClick={() => handleDuplicateQuestion(idx)}
                          className="p-1.5 rounded-lg text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 transition cursor-pointer flex items-center gap-1 shadow-2xs"
                          title="Duplicate this question"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span className="text-[11px] font-semibold hidden sm:inline">Duplicate</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveQuestion(idx, 'up')}
                          disabled={idx === 0}
                          className="p-1.5 rounded-lg text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-higher)] transition disabled:opacity-30 cursor-pointer"
                          title="Move Question Up"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveQuestion(idx, 'down')}
                          disabled={idx === questions.length - 1}
                          className="p-1.5 rounded-lg text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-higher)] transition disabled:opacity-30 cursor-pointer"
                          title="Move Question Down"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteQuestion(idx)}
                          className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10 transition cursor-pointer ml-1"
                          title="Delete Question"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>

                    {/* Question Prompt Field */}
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label className="text-xs font-semibold text-[var(--ink)] block">
                          Question Prompt / Statement <span className="text-amber-500">*</span>
                        </label>
                        <div className="flex items-center gap-2 flex-wrap">
                          {!isImageVisible && (
                            <button
                              type="button"
                              onClick={() => {
                                setShowImageUploadMap((prev) => ({ ...prev, [qKey]: true }));
                              }}
                              className="text-xs text-[var(--ink)] hover:text-blue-600 bg-[var(--surface-higher)] hover:bg-[var(--surface-highest)] px-2.5 py-1 rounded-xl flex items-center gap-1.5 transition cursor-pointer border border-[var(--border)] shadow-2xs"
                              title="Attach a photo, diagram, geometry figure, or science illustration to this question"
                            >
                              <ImageIcon className="w-3.5 h-3.5 text-blue-500" />
                              <span>+ Attach Photo</span>
                            </button>
                          )}
                          {isImageVisible && !hasImage && q.type !== 'picture_question' && (
                            <button
                              type="button"
                              onClick={() => {
                                setShowImageUploadMap((prev) => ({ ...prev, [qKey]: false }));
                                handleUpdateQuestion(idx, 'imageUrl', undefined);
                              }}
                              className="text-xs text-amber-500 bg-[var(--surface-higher)] border border-amber-500/30 px-2.5 py-1 rounded-xl flex items-center gap-1 transition cursor-pointer"
                              title="Cancel photo attachment"
                            >
                              <X className="w-3 h-3" />
                              <span>Cancel Photo</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleGenerateAiSolution(idx)}
                            disabled={aiGeneratingIndex === idx || !q.questionText.trim()}
                            className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:opacity-80 bg-blue-500/10 border border-blue-500/30 px-3 py-1 rounded-xl flex items-center gap-1.5 transition cursor-pointer disabled:opacity-40"
                            title="Auto-draft the teacher solution and rubric for this prompt"
                          >
                            {aiGeneratingIndex === idx ? (
                              <>
                                <RefreshCw className="w-3 h-3 animate-spin text-blue-500" />
                                <span>Drafting with AI...</span>
                              </>
                            ) : (
                              <>
                                <Wand2 className="w-3 h-3 text-blue-500" />
                                <span>Auto-Generate Solution with AI</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                      <textarea
                        rows={2}
                        required
                        value={q.questionText}
                        onChange={(e) => handleUpdateQuestion(idx, 'questionText', e.target.value)}
                        placeholder="Type the question statement or problem here..."
                        className="w-full px-3.5 py-2.5 bg-[var(--surface-higher)] focus:border-blue-500 border border-[var(--border)] text-xs sm:text-sm text-[var(--ink)] outline-none rounded-xl transition shadow-2xs"
                      />
                    </div>

                    {/* Question Image / Photo Upload */}
                    {isImageVisible && (
                      <div className="bg-[var(--surface-higher)] p-3.5 sm:p-4 border border-[var(--border)] rounded-2xl space-y-2">
                        <ImageUploadField
                          value={q.imageUrl || ''}
                          onChange={(val) => {
                            handleUpdateQuestion(idx, 'imageUrl', val || undefined);
                            if (!val && q.type !== 'picture_question') {
                              setShowImageUploadMap((prev) => ({ ...prev, [qKey]: false }));
                            }
                          }}
                          onRemove={
                            q.type !== 'picture_question'
                              ? () => {
                                  setShowImageUploadMap((prev) => ({ ...prev, [qKey]: false }));
                                  handleUpdateQuestion(idx, 'imageUrl', undefined);
                                }
                              : undefined
                          }
                          label="Question Figure / Diagram / Photo"
                          placeholder="https://... or upload photo from device"
                        />
                      </div>
                    )}

                    {/* Sub-Questions (a, b, c) Builder - for picture questions, questions with images, or questions with subquestions */}
                    {(Boolean(q.imageUrl && q.imageUrl.trim()) || q.type === 'picture_question' || (q.subQuestions && q.subQuestions.length > 0)) && (
                      <div className="space-y-4 bg-[var(--surface-higher)] p-4 border border-[var(--border)] rounded-2xl">
                        {/* Sub-Questions Builder Header */}
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <label className="text-xs font-bold text-[var(--ink)] flex items-center gap-1.5">
                                <ListOrdered className="w-4 h-4 text-blue-500" />
                                Sub-Questions / Multi-Part Tasks (e.g. (a), (b), (c)) & Sub-MCQs
                              </label>
                              <p className="text-[11px] text-[var(--ink-muted)]">
                                Add structured sub-questions or sub-MCQs based on the picture or diagram. Each sub-question has its own points and teacher reference solution.
                              </p>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                              {/* Add Text Sub-Question */}
                              <button
                                type="button"
                                onClick={() => {
                                  const currentSubQs = q.subQuestions || [];
                                  const labelIndex = currentSubQs.length;
                                  const charCode = 97 + labelIndex; // 97 is 'a'
                                  const label = String.fromCharCode(charCode <= 122 ? charCode : 97);
                                  const newSubQ = {
                                    id: `sq-${Date.now()}-${labelIndex + 1}`,
                                    label: `(${label})`,
                                    questionText: '',
                                    type: 'text' as const,
                                    points: 2,
                                    correctAnswer: '',
                                    gradingRubric: 'Check accurate identification and explanation.'
                                  };
                                  const updatedSubQs = [...currentSubQs, newSubQ];
                                  handleUpdateQuestion(idx, 'subQuestions', updatedSubQs);
                                  
                                  const subPointsSum = updatedSubQs.reduce((sum, sq) => sum + (Number(sq.points) || 1), 0);
                                  handleUpdateQuestion(idx, 'points', subPointsSum);

                                  const combinedRef = updatedSubQs.map(sq => `${sq.label} ${sq.correctAnswer}`).filter(Boolean).join('; ');
                                  if (combinedRef) handleUpdateQuestion(idx, 'correctAnswer', combinedRef);
                                }}
                                className="px-3 py-1.5 bg-[var(--surface)] hover:bg-[var(--surface-highest)] text-blue-600 dark:text-blue-400 border border-[var(--border)] text-xs font-bold flex items-center gap-1 rounded-xl transition cursor-pointer shadow-2xs"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>+ Text Sub-Question</span>
                              </button>

                              {/* Add Sub-MCQ */}
                              <button
                                type="button"
                                onClick={() => {
                                  const currentSubQs = q.subQuestions || [];
                                  const labelIndex = currentSubQs.length;
                                  const charCode = 97 + labelIndex;
                                  const label = String.fromCharCode(charCode <= 122 ? charCode : 97);
                                  const defaultOpts = ['Option A', 'Option B', 'Option C', 'Option D'];
                                  const newSubQ = {
                                    id: `sq-${Date.now()}-${labelIndex + 1}`,
                                    label: `(${label})`,
                                    questionText: '',
                                    type: 'mcq' as const,
                                    options: defaultOpts,
                                    points: 1,
                                    correctAnswer: defaultOpts[0],
                                    gradingRubric: 'Multiple choice accuracy.'
                                  };
                                  const updatedSubQs = [...currentSubQs, newSubQ];
                                  handleUpdateQuestion(idx, 'subQuestions', updatedSubQs);
                                  
                                  const subPointsSum = updatedSubQs.reduce((sum, sq) => sum + (Number(sq.points) || 1), 0);
                                  handleUpdateQuestion(idx, 'points', subPointsSum);

                                  const combinedRef = updatedSubQs.map(sq => `${sq.label} ${sq.correctAnswer}`).filter(Boolean).join('; ');
                                  if (combinedRef) handleUpdateQuestion(idx, 'correctAnswer', combinedRef);
                                }}
                                className="px-3 py-1.5 bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 border border-purple-500/30 text-xs font-bold flex items-center gap-1 rounded-xl transition cursor-pointer shadow-2xs"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>+ Sub-MCQ</span>
                              </button>
                            </div>
                          </div>

                          {/* List of Sub-Questions */}
                          {q.subQuestions && q.subQuestions.length > 0 && (
                            <div className="space-y-3.5 pt-1">
                              {q.subQuestions.map((sq, sqIdx) => {
                                const isSubMcq = sq.type === 'mcq';
                                return (
                                  <div
                                    key={sq.id || sqIdx}
                                    className="bg-[var(--surface)] p-4 border border-[var(--border)] rounded-2xl space-y-3 relative shadow-2xs"
                                  >
                                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-2.5">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <input
                                          type="text"
                                          value={sq.label || `(${String.fromCharCode(97 + sqIdx)})`}
                                          onChange={(e) => {
                                            const newSubQs = [...(q.subQuestions || [])];
                                            newSubQs[sqIdx] = { ...sq, label: e.target.value };
                                            handleUpdateQuestion(idx, 'subQuestions', newSubQs);
                                          }}
                                          className="w-12 px-2 py-1 bg-[var(--surface-higher)] border border-[var(--border)] font-mono font-bold text-xs text-center text-blue-600 dark:text-blue-400 rounded-lg outline-none"
                                          placeholder="(a)"
                                        />
                                        <span className="text-xs font-bold text-[var(--ink)]">
                                          Sub-Question #{sqIdx + 1}
                                        </span>

                                        {/* Type Selector: Text vs Sub-MCQ */}
                                        <div className="flex items-center gap-1 bg-[var(--surface-higher)] p-0.5 rounded-lg border border-[var(--border)]">
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const newSubQs = [...(q.subQuestions || [])];
                                              newSubQs[sqIdx] = { ...sq, type: 'text' };
                                              handleUpdateQuestion(idx, 'subQuestions', newSubQs);
                                            }}
                                            className={`px-2 py-0.5 rounded text-[10px] font-bold transition cursor-pointer ${
                                              !isSubMcq
                                                ? 'bg-blue-600 text-white shadow-2xs'
                                                : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
                                            }`}
                                          >
                                            Short Answer
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const defaultOpts = sq.options && sq.options.length > 0 ? sq.options : ['Option A', 'Option B', 'Option C', 'Option D'];
                                              const newSubQs = [...(q.subQuestions || [])];
                                              newSubQs[sqIdx] = {
                                                ...sq,
                                                type: 'mcq',
                                                options: defaultOpts,
                                                correctAnswer: sq.correctAnswer || defaultOpts[0]
                                              };
                                              handleUpdateQuestion(idx, 'subQuestions', newSubQs);
                                            }}
                                            className={`px-2 py-0.5 rounded text-[10px] font-bold transition cursor-pointer ${
                                              isSubMcq
                                                ? 'bg-purple-600 text-white shadow-2xs'
                                                : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
                                            }`}
                                          >
                                            Sub-MCQ
                                          </button>
                                        </div>
                                      </div>

                                      <div className="flex items-center gap-2">
                                        <div className="flex items-center gap-1">
                                          <label className="text-[11px] text-[var(--ink-muted)] font-mono">Marks:</label>
                                          <input
                                            type="number"
                                            min="1"
                                            max="50"
                                            value={sq.points}
                                            onChange={(e) => {
                                              const newSubQs = [...(q.subQuestions || [])];
                                              newSubQs[sqIdx] = { ...sq, points: Number(e.target.value) || 1 };
                                              handleUpdateQuestion(idx, 'subQuestions', newSubQs);
                                              const subPointsSum = newSubQs.reduce((sum, s) => sum + (Number(s.points) || 1), 0);
                                              handleUpdateQuestion(idx, 'points', subPointsSum);
                                            }}
                                            className="w-14 px-2 py-1 bg-[var(--surface-higher)] border border-[var(--border)] text-xs font-bold text-[var(--ink)] text-center rounded-lg outline-none"
                                          />
                                        </div>

                                        <button
                                          type="button"
                                          onClick={() => {
                                            const newSubQs = (q.subQuestions || []).filter((_, i) => i !== sqIdx);
                                            handleUpdateQuestion(idx, 'subQuestions', newSubQs.length > 0 ? newSubQs : undefined);
                                            if (newSubQs.length > 0) {
                                              const subPointsSum = newSubQs.reduce((sum, s) => sum + (Number(s.points) || 1), 0);
                                              handleUpdateQuestion(idx, 'points', subPointsSum);
                                            }
                                          }}
                                          className="p-1.5 text-rose-500 hover:bg-rose-500/10 rounded-lg transition cursor-pointer"
                                          title="Delete Sub-Question"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    </div>

                                    {/* Sub-Question Prompt */}
                                    <div className="space-y-1">
                                      <label className="text-[11px] font-semibold text-[var(--ink-muted)] block">
                                        Sub-Question Prompt:
                                      </label>
                                      <input
                                        type="text"
                                        required
                                        value={sq.questionText}
                                        onChange={(e) => {
                                          const newSubQs = [...(q.subQuestions || [])];
                                          newSubQs[sqIdx] = { ...sq, questionText: e.target.value };
                                          handleUpdateQuestion(idx, 'subQuestions', newSubQs);
                                        }}
                                        placeholder="e.g. Identify organelle labelled (A) and describe its function"
                                        className="w-full px-3 py-2 bg-[var(--surface-higher)] border border-[var(--border)] focus:border-blue-500 text-xs text-[var(--ink)] rounded-xl outline-none"
                                      />
                                    </div>

                                    {/* Sub-MCQ Options Builder */}
                                    {isSubMcq ? (
                                      <div className="space-y-2 bg-[var(--surface-higher)] p-3 rounded-xl border border-[var(--border)]">
                                        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold text-[var(--ink)]">
                                          <span>Sub-MCQ Choices (Click radio icon to select correct answer):</span>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const currentOpts = sq.options || ['Option A', 'Option B', 'Option C', 'Option D'];
                                              const newOpts = [...currentOpts, `Option ${String.fromCharCode(65 + currentOpts.length)}`];
                                              const newSubQs = [...(q.subQuestions || [])];
                                              newSubQs[sqIdx] = { ...sq, options: newOpts };
                                              handleUpdateQuestion(idx, 'subQuestions', newSubQs);
                                            }}
                                            className="text-[10px] text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-0.5 cursor-pointer shrink-0"
                                          >
                                            <Plus className="w-3 h-3" /> Add Choice
                                          </button>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                          {(sq.options || ['Option A', 'Option B', 'Option C', 'Option D']).map((opt, optI) => {
                                            const isSelected = sq.correctAnswer === opt;
                                            const optLetter = String.fromCharCode(65 + optI);
                                            return (
                                              <div key={optI} className="flex items-center gap-2">
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    const newSubQs = [...(q.subQuestions || [])];
                                                    newSubQs[sqIdx] = { ...sq, correctAnswer: opt };
                                                    handleUpdateQuestion(idx, 'subQuestions', newSubQs);
                                                  }}
                                                  className={`w-6 h-6 rounded-full border flex items-center justify-center font-bold text-[10px] shrink-0 transition cursor-pointer ${
                                                    isSelected
                                                      ? 'bg-purple-600 text-white border-purple-600 shadow-2xs'
                                                      : 'bg-[var(--surface)] border-[var(--border)] text-[var(--ink-muted)] hover:border-purple-400'
                                                  }`}
                                                  title="Mark as correct answer"
                                                >
                                                  {optLetter}
                                                </button>
                                                <input
                                                  type="text"
                                                  value={opt}
                                                  onChange={(e) => {
                                                    const newOpts = [...(sq.options || [])];
                                                    const oldVal = newOpts[optI];
                                                    newOpts[optI] = e.target.value;
                                                    const newSubQs = [...(q.subQuestions || [])];
                                                    newSubQs[sqIdx] = {
                                                      ...sq,
                                                      options: newOpts,
                                                      correctAnswer: sq.correctAnswer === oldVal ? e.target.value : sq.correctAnswer
                                                    };
                                                    handleUpdateQuestion(idx, 'subQuestions', newSubQs);
                                                  }}
                                                  className="flex-1 min-w-0 px-2.5 py-1.5 bg-[var(--surface)] border border-[var(--border)] focus:border-purple-500 text-xs text-[var(--ink)] rounded-lg outline-none"
                                                  placeholder={`Option ${optLetter}`}
                                                />
                                                {(sq.options?.length || 0) > 2 && (
                                                  <button
                                                    type="button"
                                                    onClick={() => {
                                                      const newOpts = (sq.options || []).filter((_, i) => i !== optI);
                                                      const newSubQs = [...(q.subQuestions || [])];
                                                      newSubQs[sqIdx] = {
                                                        ...sq,
                                                        options: newOpts,
                                                        correctAnswer: sq.correctAnswer === opt ? (newOpts[0] || '') : sq.correctAnswer
                                                      };
                                                      handleUpdateQuestion(idx, 'subQuestions', newSubQs);
                                                    }}
                                                    className="p-1 text-rose-500 hover:bg-rose-500/10 rounded transition cursor-pointer"
                                                  >
                                                    <Trash2 className="w-3 h-3" />
                                                  </button>
                                                )}
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    ) : (
                                      /* Short Answer Reference Answer */
                                      <div className="space-y-1 bg-blue-500/5 p-2.5 border border-blue-500/25 rounded-xl">
                                        <label className="text-[11px] font-bold text-blue-600 dark:text-blue-400 block">
                                          Teacher Reference Answer for {sq.label || `Part ${sqIdx + 1}`} (Hidden from Students):
                                        </label>
                                        <input
                                          type="text"
                                          required
                                          value={sq.correctAnswer}
                                          onChange={(e) => {
                                            const newSubQs = [...(q.subQuestions || [])];
                                            newSubQs[sqIdx] = { ...sq, correctAnswer: e.target.value };
                                            handleUpdateQuestion(idx, 'subQuestions', newSubQs);
                                            const combinedRef = newSubQs.map(s => `${s.label} ${s.correctAnswer}`).filter(Boolean).join('; ');
                                            if (combinedRef) handleUpdateQuestion(idx, 'correctAnswer', combinedRef);
                                          }}
                                          placeholder="e.g. Chloroplast - conducts photosynthesis to produce glucose"
                                          className="w-full px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] focus:border-blue-500 text-xs text-[var(--ink)] rounded-lg outline-none"
                                        />
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                  {/* Specific Question Type Controls */}
                  {/* 1. MCQ Options */}
                  {q.type === 'mcq' && (
                    <div className="space-y-2 bg-[var(--surface-higher)] p-3.5 sm:p-4 border border-[var(--border)] rounded-2xl">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label className="text-xs font-semibold text-[var(--ink)]">
                          Option Choices (Select Radio for Correct Answer):
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            const currentOpts = q.options || [];
                            handleUpdateQuestion(idx, 'options', [
                              ...currentOpts,
                              '',
                            ]);
                          }}
                          className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer shrink-0"
                        >
                          + Add Option
                        </button>
                      </div>

                      <div className="space-y-2">
                        {(q.options && q.options.length > 0 ? q.options : ['', '', '', '']).map((opt, optIdx) => {
                          const optionLetter = String.fromCharCode(65 + optIdx);
                          const isCorrect = Boolean(q.correctAnswer) && (
                            (opt.trim() !== '' && q.correctAnswer === opt) ||
                            q.correctAnswer === optionLetter ||
                            q.correctAnswer === `Option ${optionLetter}` ||
                            q.correctAnswer === `(${optionLetter})` ||
                            q.correctAnswer === String(optIdx)
                          );
                          return (
                            <div key={optIdx} className="flex items-center gap-2">
                              <input
                                type="radio"
                                name={`correct-opt-${q.id || idx}`}
                                checked={isCorrect}
                                onChange={() => {
                                  const selectedAns = opt.trim() || optionLetter;
                                  handleUpdateQuestion(idx, 'correctAnswer', selectedAns);
                                }}
                                title={`Click to select Option ${optionLetter} as the correct answer`}
                                className="w-4 h-4 accent-blue-600 cursor-pointer"
                              />
                              <input
                                type="text"
                                value={opt}
                                onChange={(e) => {
                                  const newVal = e.target.value;
                                  setQuestions((prev) => {
                                    const copy = [...prev];
                                    const currQ = { ...copy[idx] };
                                    const newOpts = [...(currQ.options && currQ.options.length > 0 ? currQ.options : ['', '', '', ''])];
                                    const wasSelected = isCorrect || currQ.correctAnswer === opt || currQ.correctAnswer === optionLetter;
                                    newOpts[optIdx] = newVal;
                                    currQ.options = newOpts;
                                    if (wasSelected) {
                                      currQ.correctAnswer = newVal.trim() || optionLetter;
                                    }
                                    copy[idx] = currQ;
                                    return copy;
                                  });
                                }}
                                placeholder={`Option ${optionLetter} (type answer option)`}
                                className={`flex-1 min-w-0 px-3 py-2 bg-[var(--surface)] border text-xs text-[var(--ink)] outline-none rounded-xl transition ${
                                  isCorrect ? 'border-blue-500 ring-1 ring-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold' : 'border-[var(--border)]'
                                }`}
                              />
                              {(q.options || []).length > 2 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const newOpts = (q.options || []).filter((_, i) => i !== optIdx);
                                    handleUpdateQuestion(idx, 'options', newOpts);
                                    if (isCorrect && newOpts.length > 0) {
                                      handleUpdateQuestion(idx, 'correctAnswer', newOpts[0] || 'A');
                                    }
                                  }}
                                  className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10 transition cursor-pointer"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* 2. True / False */}
                  {q.type === 'true_false' && (
                    <div className="space-y-2 bg-[var(--surface-higher)] p-3.5 sm:p-4 border border-[var(--border)] rounded-2xl">
                      <label className="text-xs font-semibold text-[var(--ink)] block">
                        Correct Answer:
                      </label>
                      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                        {['True', 'False'].map((tf) => (
                          <label
                            key={tf}
                            className={`flex items-center gap-2 px-4 py-2 border rounded-xl text-xs font-bold cursor-pointer transition ${
                              q.correctAnswer === tf
                                ? 'bg-blue-500/10 border-blue-500 text-blue-600 dark:text-blue-400'
                                : 'bg-[var(--surface)] border-[var(--border)] text-[var(--ink)] hover:bg-[var(--surface-highest)]'
                            }`}
                          >
                            <input
                              type="radio"
                              name={`tf-${q.id || idx}`}
                              checked={q.correctAnswer === tf}
                              onChange={() => handleUpdateQuestion(idx, 'correctAnswer', tf)}
                              className="w-4 h-4 accent-blue-600"
                            />
                            <span>{tf}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 3. Fill in Blanks with Multi-Item and Word Bank Options */}
                  {q.type === 'fill_blanks' && (
                    <div className="space-y-4 bg-[var(--surface-higher)] p-4 border border-[var(--border)] rounded-2xl">
                      {/* Mode / Structure Header */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-2.5">
                        <div>
                          <h4 className="text-xs font-bold text-[var(--ink)] flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                            Fill in the Blanks (Multi-Sentence or Single Blank)
                          </h4>
                          <p className="text-[11px] text-[var(--ink-muted)]">
                            Add multiple blank sentences inside this single question with optional word bank choices.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const currentBlanks = q.blankItems || [];
                            const nextNum = currentBlanks.length + 1;
                            const newBlankItem = {
                              id: `b-${q.id || idx}-${nextNum}-${Date.now()}`,
                              prefix: `${nextNum}. `,
                              correctAnswer: '',
                              suffix: '',
                              points: 1,
                            };
                            const updated = [...currentBlanks, newBlankItem];
                            handleUpdateQuestion(idx, 'blankItems', updated);
                            
                            // Auto-sum points
                            const totalPoints = updated.reduce((sum, b) => sum + (Number(b.points) || 1), 0);
                            handleUpdateQuestion(idx, 'points', totalPoints);

                            // Auto-update combined reference
                            const refStr = updated
                              .filter(b => b.correctAnswer)
                              .map((b, i) => `${i + 1}. ${b.correctAnswer}`)
                              .join('; ');
                            if (refStr) handleUpdateQuestion(idx, 'correctAnswer', refStr);
                          }}
                          className="px-3 py-1.5 bg-[var(--surface)] hover:bg-[var(--surface-highest)] text-blue-600 dark:text-blue-400 border border-[var(--border)] text-xs font-bold flex items-center gap-1 rounded-xl transition cursor-pointer shadow-2xs"
                        >
                          <Plus className="w-3.5 h-3.5" /> Add Blank Sentence
                        </button>
                      </div>

                      {/* If Multi-Blanks exist */}
                      {q.blankItems && q.blankItems.length > 0 ? (
                        <div className="space-y-3">
                          {q.blankItems.map((bi, biIdx) => (
                            <div
                              key={bi.id || biIdx}
                              className="bg-[var(--surface)] p-3.5 border border-[var(--border)] rounded-xl space-y-2.5 shadow-2xs"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2.5 py-0.5 rounded-lg">
                                  Sentence / Blank #{biIdx + 1}
                                </span>
                                <div className="flex items-center gap-2">
                                  <div className="flex items-center gap-1">
                                    <label className="text-[11px] text-[var(--ink-muted)]">Marks:</label>
                                    <input
                                      type="number"
                                      min="1"
                                      max="50"
                                      value={bi.points || 1}
                                      onChange={(e) => {
                                        const newBlanks = [...(q.blankItems || [])];
                                        newBlanks[biIdx] = { ...bi, points: Number(e.target.value) || 1 };
                                        handleUpdateQuestion(idx, 'blankItems', newBlanks);
                                        const totalPoints = newBlanks.reduce((sum, b) => sum + (Number(b.points) || 1), 0);
                                        handleUpdateQuestion(idx, 'points', totalPoints);
                                      }}
                                      className="w-14 px-2 py-1 bg-[var(--surface-higher)] border border-[var(--border)] text-xs font-bold text-[var(--ink)] text-center rounded-lg outline-none"
                                    />
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const newBlanks = (q.blankItems || []).filter((_, i) => i !== biIdx);
                                      handleUpdateQuestion(idx, 'blankItems', newBlanks.length > 0 ? newBlanks : undefined);
                                      if (newBlanks.length > 0) {
                                        const totalPoints = newBlanks.reduce((sum, b) => sum + (Number(b.points) || 1), 0);
                                        handleUpdateQuestion(idx, 'points', totalPoints);
                                        const refStr = newBlanks.filter(b => b.correctAnswer).map((b, i) => `${i + 1}. ${b.correctAnswer}`).join('; ');
                                        handleUpdateQuestion(idx, 'correctAnswer', refStr);
                                      }
                                    }}
                                    className="p-1 text-rose-500 hover:bg-rose-500/10 rounded-lg transition cursor-pointer"
                                    title="Delete Blank Sentence"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>

                              {/* Prefix, Expected Answer, Suffix Grid */}
                              <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
                                <div className="md:col-span-4 space-y-1">
                                  <label className="text-[11px] text-[var(--ink-muted)] block">
                                    Text before blank:
                                  </label>
                                  <input
                                    type="text"
                                    value={bi.prefix || ''}
                                    onChange={(e) => {
                                      const newBlanks = [...(q.blankItems || [])];
                                      newBlanks[biIdx] = { ...bi, prefix: e.target.value };
                                      handleUpdateQuestion(idx, 'blankItems', newBlanks);
                                    }}
                                    placeholder="e.g. 1. The powerhouse of cell is"
                                    className="w-full px-3 py-1.5 bg-[var(--surface-higher)] border border-[var(--border)] text-xs text-[var(--ink)] rounded-lg outline-none"
                                  />
                                </div>

                                <div className="md:col-span-4 space-y-1">
                                  <label className="text-[11px] font-bold text-blue-600 dark:text-blue-400 block">
                                    Expected Word in [ Blank ] <span className="text-amber-500">*</span>:
                                  </label>
                                  <input
                                    type="text"
                                    required
                                    value={bi.correctAnswer || ''}
                                    onChange={(e) => {
                                      const newBlanks = [...(q.blankItems || [])];
                                      newBlanks[biIdx] = { ...bi, correctAnswer: e.target.value };
                                      handleUpdateQuestion(idx, 'blankItems', newBlanks);
                                      const refStr = newBlanks.filter(b => b.correctAnswer).map((b, i) => `${i + 1}. ${b.correctAnswer}`).join('; ');
                                      handleUpdateQuestion(idx, 'correctAnswer', refStr);
                                    }}
                                    placeholder="e.g. mitochondria"
                                    className="w-full px-3 py-1.5 bg-[var(--surface-higher)] border border-blue-500/40 text-xs font-bold text-blue-600 dark:text-blue-400 rounded-lg outline-none focus:border-blue-500"
                                  />
                                </div>

                                <div className="md:col-span-4 space-y-1">
                                  <label className="text-[11px] text-[var(--ink-muted)] block">
                                    Text after blank (optional):
                                  </label>
                                  <input
                                    type="text"
                                    value={bi.suffix || ''}
                                    onChange={(e) => {
                                      const newBlanks = [...(q.blankItems || [])];
                                      newBlanks[biIdx] = { ...bi, suffix: e.target.value };
                                      handleUpdateQuestion(idx, 'blankItems', newBlanks);
                                    }}
                                    placeholder="e.g. producing cellular energy."
                                    className="w-full px-3 py-1.5 bg-[var(--surface-higher)] border border-[var(--border)] text-xs text-[var(--ink)] rounded-lg outline-none"
                                  />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        /* Single Sentence Blank */
                        <div className="space-y-3 bg-[var(--surface)] p-3.5 border border-[var(--border)] rounded-xl shadow-2xs">
                          <div className="space-y-1">
                            <label className="text-xs font-semibold text-[var(--ink)] block">
                              Blank Sentence Template <span className="text-[var(--ink-muted)] font-normal">(Use _______ for blank)</span>:
                            </label>
                            <input
                              type="text"
                              value={q.blankTemplate || ''}
                              onChange={(e) => handleUpdateQuestion(idx, 'blankTemplate', e.target.value)}
                              placeholder="e.g. The powerhouse of the cell is called the _______."
                              className="w-full px-3 py-2 bg-[var(--surface-higher)] border border-[var(--border)] text-xs text-[var(--ink)] rounded-lg outline-none"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-xs font-bold text-blue-600 dark:text-blue-400 block">
                              Expected Word / Phrase for Blank <span className="text-amber-500">*</span>:
                            </label>
                            <input
                              type="text"
                              required
                              value={q.correctAnswer || ''}
                              onChange={(e) => handleUpdateQuestion(idx, 'correctAnswer', e.target.value)}
                              placeholder="e.g. mitochondria"
                              className="w-full px-3 py-2 bg-[var(--surface-higher)] border border-blue-500/40 text-xs font-bold text-blue-600 dark:text-blue-400 rounded-lg outline-none focus:border-blue-500"
                            />
                          </div>
                        </div>
                      )}

                      {/* Options / Word Bank for Fill in the Blanks */}
                      <div className="bg-[var(--surface)] p-3.5 border border-[var(--border)] rounded-xl space-y-2.5 shadow-2xs">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <label className="text-xs font-bold text-blue-600 dark:text-blue-400 block">
                              Word Bank / Options Pool (Optional):
                            </label>
                            <p className="text-[11px] text-[var(--ink-muted)]">
                              Provide clickable word choices for students to choose from or use as hints.
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {/* Auto-generate from answers button */}
                            <button
                              type="button"
                              onClick={() => {
                                const words: string[] = [];
                                if (q.blankItems && q.blankItems.length > 0) {
                                  q.blankItems.forEach(b => {
                                    if (b.correctAnswer?.trim()) words.push(b.correctAnswer.trim());
                                  });
                                } else if (q.correctAnswer?.trim()) {
                                  words.push(q.correctAnswer.trim());
                                }
                                const currentOpts = q.options || [];
                                const combined = Array.from(new Set([...currentOpts, ...words]));
                                handleUpdateQuestion(idx, 'options', combined);
                              }}
                              className="px-2.5 py-1 bg-[var(--surface-higher)] hover:bg-[var(--surface-highest)] text-blue-600 dark:text-blue-400 border border-[var(--border)] text-[11px] font-bold rounded-lg transition cursor-pointer"
                              title="Add all correct blank answers to word bank"
                            >
                              ⚡ Auto-Populate from Answers
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const currentOpts = q.options || [];
                                handleUpdateQuestion(idx, 'options', [...currentOpts, '']);
                              }}
                              className="px-2.5 py-1 bg-[var(--surface-higher)] hover:bg-[var(--surface-highest)] text-[var(--ink)] border border-[var(--border)] text-[11px] font-bold rounded-lg transition cursor-pointer flex items-center gap-1"
                            >
                              <Plus className="w-3 h-3 text-blue-500" /> Add Choice
                            </button>
                          </div>
                        </div>

                        {/* List of Word Bank Chips / Inputs */}
                        {(q.options || []).length > 0 ? (
                          <div className="flex flex-wrap gap-2 pt-1">
                            {(q.options || []).map((opt, optI) => (
                              <div key={optI} className="flex items-center gap-1 bg-[var(--surface-higher)] border border-blue-500/30 px-2.5 py-1 rounded-lg">
                                <input
                                  type="text"
                                  value={opt}
                                  onChange={(e) => {
                                    const newOpts = [...(q.options || [])];
                                    newOpts[optI] = e.target.value;
                                    handleUpdateQuestion(idx, 'options', newOpts);
                                  }}
                                  placeholder="Word choice..."
                                  className="text-xs font-semibold text-[var(--ink)] w-24 xs:w-28 min-w-0 bg-transparent outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    const newOpts = (q.options || []).filter((_, i) => i !== optI);
                                    handleUpdateQuestion(idx, 'options', newOpts);
                                  }}
                                  className="text-rose-500 hover:text-rose-600 transition cursor-pointer"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[11px] text-[var(--ink-muted)] italic">
                            No options added. Students will freely type their answers in the blank, or you can add word options above.
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 4. Match the Following Pairs */}
                  {q.type === 'match_following' && (
                    <div className="space-y-2 bg-[var(--surface-higher)] p-3.5 sm:p-4 border border-[var(--border)] rounded-2xl">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label className="text-xs font-semibold text-[var(--ink)]">
                          Matching Pairs (Left Item ➔ Right Match):
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            const currentPairs = q.matchingPairs || [];
                            const updatedPairs = [
                              ...currentPairs,
                              {
                                id: String(currentPairs.length + 1),
                                left: '',
                                right: '',
                              },
                            ];
                            handleUpdateQuestion(idx, 'matchingPairs', updatedPairs);
                            // Auto-sync reference string
                            const refStr = updatedPairs
                              .filter((p) => p.left && p.right)
                              .map((p) => `${p.left} -> ${p.right}`)
                              .join(', ');
                            if (refStr) handleUpdateQuestion(idx, 'correctAnswer', refStr);
                          }}
                          className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer shrink-0"
                        >
                          + Add Pair
                        </button>
                      </div>

                      <div className="space-y-2">
                        {(q.matchingPairs || []).map((pair, pIdx) => (
                          <div key={pIdx} className="flex flex-col xs:flex-row items-stretch xs:items-center gap-1.5 xs:gap-2 p-2 xs:p-0 rounded-xl xs:rounded-none bg-[var(--surface)]/40 xs:bg-transparent border xs:border-0 border-[var(--border)]">
                            <input
                              type="text"
                              value={pair.left}
                              onChange={(e) => {
                                const newPairs = [...(q.matchingPairs || [])];
                                newPairs[pIdx] = { ...pair, left: e.target.value };
                                handleUpdateQuestion(idx, 'matchingPairs', newPairs);
                                const refStr = newPairs
                                  .filter((p) => p.left && p.right)
                                  .map((p) => `${p.left} -> ${p.right}`)
                                  .join(', ');
                                if (refStr) handleUpdateQuestion(idx, 'correctAnswer', refStr);
                              }}
                              placeholder={`Left item ${pIdx + 1}`}
                              className="flex-1 min-w-0 px-3 py-2 bg-[var(--surface)] border border-[var(--border)] text-xs text-[var(--ink)] rounded-xl outline-none"
                            />
                            <span className="hidden xs:inline text-blue-500 font-bold shrink-0">➔</span>
                            <div className="flex items-center gap-1.5 flex-1 min-w-0">
                              <input
                                type="text"
                                value={pair.right}
                                onChange={(e) => {
                                  const newPairs = [...(q.matchingPairs || [])];
                                  newPairs[pIdx] = { ...pair, right: e.target.value };
                                  handleUpdateQuestion(idx, 'matchingPairs', newPairs);
                                  const refStr = newPairs
                                    .filter((p) => p.left && p.right)
                                    .map((p) => `${p.left} -> ${p.right}`)
                                    .join(', ');
                                  if (refStr) handleUpdateQuestion(idx, 'correctAnswer', refStr);
                                }}
                                placeholder={`Right match ${pIdx + 1}`}
                                className="flex-1 min-w-0 px-3 py-2 bg-[var(--surface)] border border-[var(--border)] text-xs text-[var(--ink)] rounded-xl outline-none"
                              />
                              {(q.matchingPairs || []).length > 2 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const newPairs = (q.matchingPairs || []).filter(
                                      (_, i) => i !== pIdx
                                    );
                                    handleUpdateQuestion(idx, 'matchingPairs', newPairs);
                                    const refStr = newPairs
                                      .filter((p) => p.left && p.right)
                                      .map((p) => `${p.left} -> ${p.right}`)
                                      .join(', ');
                                    handleUpdateQuestion(idx, 'correctAnswer', refStr);
                                  }}
                                  className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10 transition cursor-pointer shrink-0"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Model Solution for Q&A and standalone Picture questions */}
                  {(q.type === 'question_answer' || (q.type === 'picture_question' && (!q.subQuestions || q.subQuestions.length === 0))) && (
                    <div className="bg-[var(--surface-higher)] border border-[var(--border)] p-3.5 sm:p-4 rounded-2xl space-y-2 shadow-2xs">
                      <label className="text-xs font-bold text-[var(--ink)] flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-blue-500" />
                        Teacher Model Solution / Reference Answer:
                      </label>
                      <textarea
                        rows={2}
                        required
                        value={q.correctAnswer}
                        onChange={(e) => handleUpdateQuestion(idx, 'correctAnswer', e.target.value)}
                        placeholder="Type the model answer or key concepts required for marks..."
                        className="w-full px-3.5 py-2.5 bg-[var(--surface)] border border-[var(--border)] focus:border-blue-500 text-xs sm:text-sm text-[var(--ink)] outline-none rounded-xl transition shadow-2xs"
                      />
                    </div>
                  )}
                </div>
              );
              })}
            </div>
        </form>

        {/* Footer Actions */}
        <div className="bg-[var(--surface-higher)] px-4 sm:px-6 py-3 sm:py-4 border-t border-[var(--border)] flex items-center justify-end gap-3 shrink-0">
          <div className="flex flex-col-reverse xs:flex-row items-stretch xs:items-center gap-2 sm:gap-3 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="flex-1 sm:flex-none px-4 py-2 border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-higher)] rounded-xl text-xs font-semibold text-[var(--ink)] transition cursor-pointer shadow-xs text-center"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSaving}
              className="btn btn-primary flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 sm:px-5 py-2 text-xs font-bold rounded-xl cursor-pointer disabled:opacity-50 shadow-xs"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Saving...' : 'Save Assessment'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Default Marks Configuration Popover Dialog (Opened via Hold / Long-press or Right-click) */}
      {marksPopoverType && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center p-2.5 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setMarksPopoverType(null)}
        >
          <div
            className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl sm:rounded-3xl shadow-2xl p-4 sm:p-6 w-full max-w-sm max-h-[90vh] overflow-y-auto space-y-4 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 flex items-center justify-center shrink-0">
                  <Award className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-sm sm:text-base text-[var(--ink)]">
                    Default Marks
                  </h4>
                  <p className="text-xs text-[var(--ink-muted)]">
                    {QUESTION_TYPE_LABELS[marksPopoverType]}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMarksPopoverType(null)}
                className="p-1.5 rounded-xl text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-higher)] transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Marks input and test-wide update explanation */}
            <div className="space-y-3 pt-1">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[var(--ink)] block">
                  Marks Per Question:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0.5"
                    step="0.5"
                    max="100"
                    autoFocus
                    value={tempPopoverMarks}
                    onChange={(e) => setTempPopoverMarks(parseFloat(e.target.value) || 1)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSavePopoverMarks();
                      }
                    }}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--surface-higher)] border border-[var(--border)] focus:border-blue-500 text-sm font-bold text-[var(--ink)] outline-none transition shadow-2xs"
                  />
                  <span className="text-xs font-bold text-[var(--ink-muted)] px-1">pts</span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-[var(--surface-higher)] border border-[var(--border)] text-xs text-[var(--ink-muted)] leading-relaxed">
                {questions.some((q) => q.type === marksPopoverType) ? (
                  <span>
                    Will update all{' '}
                    <strong className="text-blue-600 dark:text-blue-400 font-bold">
                      {questions.filter((q) => q.type === marksPopoverType).length}
                    </strong>{' '}
                    existing {QUESTION_TYPE_LABELS[marksPopoverType]} question{questions.filter((q) => q.type === marksPopoverType).length > 1 ? 's' : ''} in this test to{' '}
                    <strong className="text-[var(--ink)] font-bold">{tempPopoverMarks} pts</strong>, and apply to any new ones you add.
                  </span>
                ) : (
                  <span>
                    New {QUESTION_TYPE_LABELS[marksPopoverType]} questions added to this test will have{' '}
                    <strong className="text-[var(--ink)] font-bold">{tempPopoverMarks} pts</strong>.
                  </span>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col-reverse xs:flex-row items-stretch xs:items-center justify-end gap-2 pt-2 border-t border-[var(--border)]">
              <button
                type="button"
                onClick={() => setMarksPopoverType(null)}
                className="px-3.5 py-2 rounded-xl border border-[var(--border)] text-xs font-semibold text-[var(--ink)] hover:bg-[var(--surface-higher)] transition cursor-pointer text-center"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSavePopoverMarks}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition cursor-pointer shadow-sm active:scale-95 text-center"
              >
                Update Marks
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
};
