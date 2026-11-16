import React, { useState, useEffect } from 'react';
import { QuizItem, ClassItem, QuestionItem } from '../types';
import { generatePrintableQuestionPaperHtml } from '../lib/questionPaperGenerator';
import { generateDynamicPaginationScript } from '../lib/dynamicPrintPaginator';
import { printHtml } from '../lib/printService';
import {
  Printer,
  X,
  FileText,
  CheckSquare,
  Key,
  School,
  Scissors,
  Columns,
  Type,
  PenTool,
  Info,
  Download,
  CheckCircle2,
  Award,
  GraduationCap,
  Circle,
  Palette,
  Clock,
  BookOpen,
  Sparkles,
  RotateCcw,
  ExternalLink,
  User,
  Calendar,
} from 'lucide-react';

interface PrintAssessmentModalProps {
  quiz: QuizItem | null;
  isOpen: boolean;
  onClose: () => void;
  classes?: ClassItem[];
  isAdmin?: boolean;
}

export type PrintMode = 'question_paper' | 'answer_sheet' | 'teacher_key';
export type AnswerSheetTheme = 'indigo' | 'slate' | 'emerald' | 'crimson' | 'amber' | 'navy';
export type BubbleShape = 'circle' | 'pill';

// Clean redundant leading option letters like "(A)", "A.", "[A]", "Option A:" from option text
function cleanOptionText(text: any): string {
  if (typeof text !== 'string') return text ? String(text) : '';
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^(option\s+[A-Za-z0-9][:\.\-\)]?\s*)/i, '');
  cleaned = cleaned.replace(/^(\(\s*[A-Za-z0-9]\s*\)|\[\s*[A-Za-z0-9]\s*\]|[A-Za-z0-9]\s*[\.\):\-–—])\s*/, '').trim();
  cleaned = cleaned.replace(/^(\(\s*[A-Za-z0-9]\s*\)|\[\s*[A-Za-z0-9]\s*\]|[A-Za-z0-9]\s*[\.\):\-–—])\s*/, '').trim();
  return cleaned;
}

// Clean redundant leading numbers or prefixes from question prompt like "1. ", "1) ", "Q1: ", "Question 1: "
function cleanQuestionPrompt(text: any): string {
  if (typeof text !== 'string') return text ? String(text) : '';
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^(question\s*\d+[:\.\-\)]?\s*|q\d+[:\.\-\)]?\s*|\d+[\.\):\-–—]\s*)/i, '').trim();
  return cleaned || text;
}

export interface AnswerThemeStyle {
  id: AnswerSheetTheme;
  name: string;
  primary: string;
  lightBg: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  borderAccent: string;
  swatchBg: string;
}

export const MODERN_THEMES: Record<AnswerSheetTheme, AnswerThemeStyle> = {
  indigo: {
    id: 'indigo',
    name: 'Modern Indigo',
    primary: '#4f46e5',
    lightBg: '#eef2ff',
    badgeBg: 'bg-indigo-50',
    badgeText: 'text-indigo-700',
    badgeBorder: 'border-indigo-200',
    borderAccent: '#c7d2fe',
    swatchBg: 'bg-indigo-600',
  },
  slate: {
    id: 'slate',
    name: 'Minimal Slate',
    primary: '#0f172a',
    lightBg: '#f8fafc',
    badgeBg: 'bg-slate-100',
    badgeText: 'text-slate-800',
    badgeBorder: 'border-slate-300',
    borderAccent: '#cbd5e1',
    swatchBg: 'bg-slate-900',
  },
  emerald: {
    id: 'emerald',
    name: 'Mint Emerald',
    primary: '#059669',
    lightBg: '#ecfdf5',
    badgeBg: 'bg-emerald-50',
    badgeText: 'text-emerald-800',
    badgeBorder: 'border-emerald-200',
    borderAccent: '#a7f3d0',
    swatchBg: 'bg-emerald-600',
  },
  crimson: {
    id: 'crimson',
    name: 'Berry Crimson',
    primary: '#e11d48',
    lightBg: '#fff1f2',
    badgeBg: 'bg-rose-50',
    badgeText: 'text-rose-800',
    badgeBorder: 'border-rose-200',
    borderAccent: '#fecdd3',
    swatchBg: 'bg-rose-600',
  },
  amber: {
    id: 'amber',
    name: 'Warm Bronze',
    primary: '#d97706',
    lightBg: '#fffbeb',
    badgeBg: 'bg-amber-50',
    badgeText: 'text-amber-800',
    badgeBorder: 'border-amber-200',
    borderAccent: '#fde68a',
    swatchBg: 'bg-amber-600',
  },
  navy: {
    id: 'navy',
    name: 'Classic Navy',
    primary: '#1e3a8a',
    lightBg: '#eff6ff',
    badgeBg: 'bg-blue-50',
    badgeText: 'text-blue-900',
    badgeBorder: 'border-blue-200',
    borderAccent: '#bfdbfe',
    swatchBg: 'bg-blue-800',
  },
};

export const PrintAssessmentModal: React.FC<PrintAssessmentModalProps> = ({
  quiz,
  isOpen,
  onClose,
  classes = [],
  isAdmin,
}) => {
  if (!isOpen || !quiz) return null;

  // Print Mode State - Default to standard official Question Paper
  const [printMode, setPrintMode] = useState<PrintMode>('question_paper');

  // Customization & Formatting Options
  const [schoolName, setSchoolName] = useState<string>('ACADEMIC ASSESSMENT BOARD');
  const [examSubtitle, setExamSubtitle] = useState<string>('Official Periodic Evaluation & Assessment');
  const [teacherName, setTeacherName] = useState<string>('Mr. S. Shrestha');
  const [examDate, setExamDate] = useState<string>(() =>
    new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  );
  const [instructions, setInstructions] = useState<string>(
    () =>
      quiz.description?.trim() ||
      'All questions are compulsory. Tick [ ✓ ] correct option or write clearly in the spaces provided. No negative marking.'
  );
  const [fontStyle, setFontStyle] = useState<'sans' | 'serif'>('sans'); // Modern sans by default!
  const [columnLayout, setColumnLayout] = useState<'single' | 'two_column'>('two_column');
  const [fontSize, setFontSize] = useState<'normal' | 'compact'>('normal');
  const [includeInstructions, setIncludeInstructions] = useState<boolean>(true);
  const [includeRuledLines, setIncludeRuledLines] = useState<boolean>(true);
  const [twoUpMode, setTwoUpMode] = useState<boolean>(false);
  const [figureScale, setFigureScale] = useState<'standard' | 'compact'>('standard');
  const [showShadingGuide, setShowShadingGuide] = useState<boolean>(true);
  const [themeId, setThemeId] = useState<AnswerSheetTheme>('indigo');
  const [bubbleShape, setBubbleShape] = useState<BubbleShape>('circle');

  // Tick Box Configuration for Question Paper
  const [showTickBoxes, setShowTickBoxes] = useState<boolean>(true);
  const [tickBoxStyle, setTickBoxStyle] = useState<'square' | 'circle' | 'bracket'>('square');
  const [tickedAnswers, setTickedAnswers] = useState<Record<string, number | boolean>>({});

  const handleToggleTick = (qKey: string, choiceVal: number | boolean) => {
    setTickedAnswers((prev) => {
      if (prev[qKey] === choiceVal) {
        const next = { ...prev };
        delete next[qKey];
        return next;
      }
      return { ...prev, [qKey]: choiceVal };
    });
  };

  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((curr) => (curr === msg ? null : curr));
    }, 2500);
  };

  const handleClearTicks = () => {
    setTickedAnswers({});
    showToast('Cleared all interactive ticks');
  };

  const theme = MODERN_THEMES[themeId] || MODERN_THEMES.indigo;

  const classNameLabel =
    classes.find((c) => c.id === quiz.classId)?.name || (quiz.classId === 'all' ? 'All Classes' : quiz.classId);

  // Categorize questions
  const mcqQuestions = quiz.questions.filter((q) => q.type === 'mcq');
  const tfQuestions = quiz.questions.filter((q) => q.type === 'true_false');
  const blankQuestions = quiz.questions.filter((q) => q.type === 'fill_blanks');
  const matchQuestions = quiz.questions.filter((q) => q.type === 'match_following');
  const descriptiveQuestions = quiz.questions.filter(
    (q) => q.type === 'question_answer' || q.type === 'picture_question'
  );

  const isSans = fontStyle === 'sans';
  const fontFamilyCss = isSans
    ? '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
    : '"Georgia", "Cambria", "Times New Roman", Times, serif';

  const getQuestionImageUrl = (q: QuestionItem): string | undefined => {
    return q.imageUrl || (q as any).image || (q as any).figureUrl || (q as any).diagramUrl;
  };

  // Generate full standalone printable HTML
  const generateFullPrintableHtml = (): string => {
    const el = document.getElementById('printable-assessment-document');
    const contentHtml = el ? el.innerHTML : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${schoolName} - ${quiz.title}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 16mm 18mm 16mm 18mm;
    }
    *, *::before, *::after {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      background: #ffffff !important;
      color: #0f172a !important;
      font-family: ${fontFamilyCss} !important;
      font-size: ${fontSize === 'compact' ? '9pt' : '10pt'} !important;
      line-height: 1.3 !important;
    }
    .no-print {
      display: none !important;
    }

    /* Print Paper Styles */
    .question-block,
    .print-card {
      border: 1.2px solid #cbd5e1 !important;
      border-radius: 5px !important;
      background: #ffffff !important;
      padding: 4px 7px;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
      -webkit-column-break-inside: avoid !important;
      display: block !important;
      width: 100% !important;
      vertical-align: top !important;
      box-sizing: border-box !important;
    }
    .exam-print-page {
      width: 100% !important;
      box-sizing: border-box !important;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }
    .exam-print-page:not(:last-child) {
      page-break-after: always !important;
      break-after: page !important;
    }
    .masthead-container, .masthead-block {
      break-after: avoid !important;
      page-break-after: avoid !important;
      -webkit-column-break-after: avoid !important;
      margin-bottom: 5px !important;
    }
    .end-sign-off {
      break-inside: avoid !important;
      page-break-inside: avoid !important;
      margin-top: 6px !important;
    }
    .question-header {
      display: flex !important;
      align-items: flex-start !important;
      justify-content: space-between !important;
      gap: 6px !important;
      margin-bottom: 3px !important;
      padding-bottom: 0 !important;
    }
    .question-number {
      font-weight: 800 !important;
      font-size: 10.5pt !important;
      color: #0f172a !important;
      min-width: 22px !important;
      flex-shrink: 0 !important;
      display: inline-block !important;
      line-height: 1.25 !important;
    }
    .question-text {
      font-weight: 700 !important;
      color: #0f172a !important;
      font-size: 11pt !important;
      line-height: 1.35 !important;
      flex: 1 !important;
    }
    .question-marks {
      font-weight: 700 !important;
      font-size: 9pt !important;
      color: #475569 !important;
      white-space: nowrap !important;
      margin-left: 6px !important;
      flex-shrink: 0 !important;
    }
    .question-options,
    .question-choices {
      margin-top: 3px !important;
      padding: 0 !important;
      gap: 3px 6px !important;
    }
    .print-pill {
      display: inline-flex !important;
      align-items: center !important;
      gap: 5px !important;
      padding: 2px 8px !important;
      border-radius: 9999px !important;
      font-size: 8pt !important;
      font-weight: 700 !important;
      border: 1px solid #e2e8f0 !important;
      background: #f8fafc !important;
      color: #334155 !important;
    }
    .print-choice-tile {
      display: flex !important;
      align-items: center !important;
      gap: 6px !important;
      padding: 4px 8px !important;
      border: 1px solid #e2e8f0 !important;
      border-radius: 8px !important;
      background: #f8fafc !important;
      font-size: 9pt !important;
    }
    .print-choice-badge {
      width: 20px !important;
      height: 20px !important;
      border-radius: 50% !important;
      border: 1px solid #cbd5e1 !important;
      background: #ffffff !important;
      color: #0f172a !important;
      font-weight: 800 !important;
      font-size: 8pt !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      flex-shrink: 0 !important;
    }

    /* Ruled lines */
    .ruled-line {
      border-bottom: 1px dashed #cbd5e1 !important;
      height: 20px !important;
      margin-bottom: 2px !important;
    }

    /* Answer sheet cards and question blocks */
    .answer-card {
      border: 1.5px solid #cbd5e1 !important;
      border-radius: 8px !important;
      background: #ffffff !important;
      overflow: hidden !important;
      margin-bottom: 12px !important;
      break-inside: avoid !important;
      page-break-inside: avoid !important;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03) !important;
    }
    .answer-row {
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      padding: 2.5px 8px !important;
      border-bottom: 1px solid #f1f5f9 !important;
    }

    /* Answer bubbles */
    .answer-bubble {
      width: 22px !important;
      height: 22px !important;
      border-radius: 50% !important;
      border: 1.5px solid #94a3b8 !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      font-size: 8.5pt !important;
      font-weight: 800 !important;
      color: #1e293b !important;
      background: #ffffff !important;
    }
    .answer-bubble-pill {
      width: 26px !important;
      height: 19px !important;
      border-radius: 9999px !important;
    }
    .answer-bubble-filled {
      background: ${theme.primary} !important;
      color: #ffffff !important;
      border-color: ${theme.primary} !important;
    }

    /* Tick Boxes for Question Paper */
    .print-tick-box {
      width: 24px !important;
      height: 24px !important;
      border: 2px solid #64748b !important;
      border-radius: 6px !important;
      background: #ffffff !important;
      color: #0f172a !important;
      font-weight: 900 !important;
      font-size: 12pt !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      flex-shrink: 0 !important;
      cursor: pointer !important;
      user-select: none !important;
      line-height: 1 !important;
      transition: all 0.15s ease !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .print-tick-box.circle {
      border-radius: 9999px !important;
    }
    .print-tick-box.bracket {
      border: none !important;
      border-left: 2.5px solid #64748b !important;
      border-right: 2.5px solid #64748b !important;
      border-radius: 0 !important;
      width: 26px !important;
    }
    .print-tick-box.is-ticked {
      background: ${theme.primary} !important;
      color: #ffffff !important;
      border-color: ${theme.primary} !important;
    }
    @media print {
      .print-tick-box.is-ticked {
        background: #ffffff !important;
        color: #000000 !important;
        border-color: #000000 !important;
      }
      .print-tick-box {
        border-color: #000000 !important;
      }
    }

    .two-col-layout {
      column-count: 2 !important;
      column-gap: 7mm !important;
      column-rule: 1px solid #e2e8f0 !important;
    }

    /* Figures & Diagrams */
    .figure-frame {
      display: block !important;
      text-align: center !important;
      margin: 5px auto 7px auto !important;
      padding: 3px 6px !important;
      border: 1px solid #cbd5e1 !important;
      border-radius: 8px !important;
      background: #f8fafc !important;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
      max-width: 96% !important;
      clear: both !important;
    }
    .figure-frame img {
      display: block !important;
      margin: 0 auto !important;
      max-height: ${columnLayout === 'two_column' || figureScale === 'compact' ? '150px' : '230px'} !important;
      max-width: 100% !important;
      width: auto !important;
      height: auto !important;
      object-fit: contain !important;
      border: 1.5px solid #94a3b8 !important;
      border-radius: 8px !important;
      padding: 4px !important;
      background: #ffffff !important;
      box-shadow: 0 1px 3px rgba(0,0,0,0.06) !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }
    .figure-caption {
      display: block !important;
      font-size: 8.5pt !important;
      font-weight: 700 !important;
      color: #64748b !important;
      font-style: italic !important;
      margin-top: 6px !important;
      text-align: center !important;
    }
    img {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }
  </style>
</head>
<body>
  ${contentHtml}
  <script>
    // Interactive ticking for downloaded question paper
    document.addEventListener('click', function(e) {
      var tile = e.target.closest('.print-choice-tile');
      if (!tile) return;
      var box = tile.querySelector('.print-tick-box');
      if (!box) return;
      var card = tile.closest('.print-card');
      if (card) {
        card.querySelectorAll('.print-choice-tile').forEach(function(t) {
          if (t !== tile) {
            var b = t.querySelector('.print-tick-box');
            if (b) {
              b.classList.remove('is-ticked');
              b.textContent = '';
              b.style.backgroundColor = '#ffffff';
              b.style.borderColor = '#64748b';
              b.style.color = '#0f172a';
            }
          }
        });
      }
      var isTicked = box.classList.toggle('is-ticked');
      box.textContent = isTicked ? '✓' : '';
      box.style.backgroundColor = isTicked ? '${theme.primary}' : '#ffffff';
      box.style.borderColor = isTicked ? '${theme.primary}' : '#64748b';
      box.style.color = isTicked ? '#ffffff' : '#0f172a';
    });

    ${generateDynamicPaginationScript({
      schoolName,
      examTitle: quiz.title,
      className: classNameLabel,
      subject: quiz.subject,
      columnLayout,
      autoPrint: true,
    })}
  </script>
</body>
</html>`;
  };

  const handleTriggerPrint = () => {
    showToast('Opening print dialog...');
    const fullHtml =
      printMode === 'question_paper'
        ? generatePrintableQuestionPaperHtml(quiz, classNameLabel, {
            schoolName,
            tickBoxStyle,
            showTickBoxes,
            tickedAnswers,
            autoPrint: false,
            columnLayout,
            themeColor: theme.primary,
            themeLightBg: theme.lightBg,
            themeBorder: theme.borderAccent,
            fontStyle,
            teacherName,
            examDate,
            instructions,
          })
        : generateFullPrintableHtml();

    const safeTitle = (quiz.title || 'Assessment').toLowerCase().replace(/[^a-z0-9]/g, '_');
    const filename = `${safeTitle}_${printMode}.html`;

    printHtml(fullHtml, {
      title: `${quiz.title} - ${printMode.replace('_', ' ')}`,
      fallbackFilename: filename,
      onSuccess: () => {
        showToast('Print preview active');
      },
      onError: (err) => {
        console.warn('Print error:', err);
        showToast('Print failed, downloaded HTML file');
        handleDownloadDoc(printMode);
      },
    });
  };

  // Keyboard shortcut listener (Ctrl+P / Cmd+P & Esc)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        handleTriggerPrint();
      } else if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [printMode, schoolName, teacherName, examDate, instructions, tickBoxStyle, showTickBoxes, tickedAnswers, columnLayout, themeId, fontStyle]);

  const triggerDownloadForMode = (mode: PrintMode) => {
    const modeName =
      mode === 'question_paper'
        ? 'Question Paper'
        : mode === 'answer_sheet'
        ? 'Student Answer Sheet'
        : 'Teacher Key';
    showToast(`Downloading ${modeName} (.html)...`);

    let fullHtml = '';
    if (mode === 'question_paper') {
      fullHtml = generatePrintableQuestionPaperHtml(quiz, classNameLabel, {
        schoolName,
        tickBoxStyle,
        showTickBoxes,
        tickedAnswers,
        autoPrint: false,
        columnLayout,
        themeColor: theme.primary,
        themeLightBg: theme.lightBg,
        themeBorder: theme.borderAccent,
        fontStyle,
        teacherName,
        examDate,
        instructions,
      });
    } else {
      fullHtml = generateFullPrintableHtml();
    }

    const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeTitle = quiz.title.toLowerCase().replace(/[^a-z0-9]/g, '_');
    a.download =
      mode === 'question_paper'
        ? `${safeTitle}_question_paper_${columnLayout}.html`
        : mode === 'answer_sheet'
        ? `${safeTitle}_student_answer_sheet.html`
        : `${safeTitle}_teacher_key.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    showToast(`Downloaded: ${a.download}`);
  };

  const handleOpenInNewTab = () => {
    showToast('Opening document in new tab...');
    const fullHtml =
      printMode === 'question_paper'
        ? generatePrintableQuestionPaperHtml(quiz, classNameLabel, {
            schoolName,
            tickBoxStyle,
            showTickBoxes,
            tickedAnswers,
            autoPrint: false,
            columnLayout,
            themeColor: theme.primary,
            themeLightBg: theme.lightBg,
            themeBorder: theme.borderAccent,
            fontStyle,
            teacherName,
            examDate,
            instructions,
          })
        : generateFullPrintableHtml();

    const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    // Fallback: anchor click prevents popup blocker in iframe
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    try {
      const win = window.open(url, '_blank');
      if (win) win.focus();
    } catch {
      // already triggered via anchor
    }

    setTimeout(() => URL.revokeObjectURL(url), 60000);
    showToast('Opened in new tab');
  };

  const handleDownloadDoc = (mode: PrintMode) => {
    if (mode !== printMode) {
      setPrintMode(mode);
      setTimeout(() => {
        triggerDownloadForMode(mode);
      }, 100);
    } else {
      triggerDownloadForMode(mode);
    }
  };

  const handleDownloadHtml = () => {
    triggerDownloadForMode(printMode);
  };

  // -------------------------------------------------------------
  // MODERN ACADEMIC HEADER COMPONENT
  // Clean, contemporary, generous typography, pill chips
  // -------------------------------------------------------------
  const renderModernHeader = (modeTitle: string) => {
    return (
      <div className="exam-masthead rounded-md overflow-hidden border-1.5 border-[#0b2545] bg-white mb-3 shadow-xs text-slate-900">
        {/* Top Institutional Bar with Crest & Board Identity */}
        <div className="p-2.5 sm:p-3.5 bg-white flex flex-wrap justify-between items-center gap-2.5 border-b-2 border-[#0b2545]">
          <div className="flex items-center gap-3 min-w-0">
            {/* Academic Shield Crest */}
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-lg bg-[#0b2545] border-2 border-amber-600 text-amber-200 flex items-center justify-center shrink-0 shadow-sm">
              <BookOpen className="w-5 h-5 sm:w-6 sm:h-6 text-amber-200" />
            </div>

            {/* Title & Institution Hierarchy */}
            <div className="min-w-0">
              <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-amber-700 block leading-tight">
                {schoolName || 'Academic Assessment Board'}
              </span>
              <h1 className="text-base sm:text-lg font-black tracking-tight text-[#0b2545] leading-tight truncate mt-0.5">
                {quiz.title}
              </h1>
            </div>
          </div>

          {/* Right: Max Marks Badge & Time (Swapped with Date) */}
          <div className="flex items-center gap-2 shrink-0">
            {quiz.timeLimitMinutes && quiz.timeLimitMinutes > 0 ? (
              <div className="text-[8.5px] font-bold text-slate-500 bg-slate-50 border border-slate-200 rounded px-2 py-0.5 whitespace-nowrap">
                Time: <strong className="text-[#0b2545]">{quiz.timeLimitMinutes} Mins</strong>
              </div>
            ) : null}
            <div className="shrink-0 bg-white border-1.5 border-[#0b2545] rounded-md px-2 py-0.5 shadow-2xs whitespace-nowrap">
              <span className="text-[7.5px] font-black uppercase text-slate-500 tracking-wide">Max Marks: </span>
              <strong className="text-xs font-black text-[#0b2545]">____ / {quiz.totalPoints || quiz.questions.length}</strong>
            </div>
          </div>
        </div>

        {/* Classical Academic Double Rule Divider */}
        <div className="h-[3px] border-t-2 border-b border-[#0b2545] bg-white" />

        {/* Candidate Particulars Bar (Single Clean Line with Date) */}
        <div className="flex items-center justify-between gap-2.5 text-[9.5px] bg-slate-50 px-3 py-1.5 border-b border-dashed border-slate-300 flex-nowrap overflow-hidden">
          <div className="flex items-center gap-2 flex-nowrap min-w-0 flex-1 overflow-hidden">
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-[8px] font-extrabold uppercase text-slate-500 tracking-wider">Candidate:</span>
              <span className="border-b-2 border-[#0b2545] w-28 sm:w-36 h-4 bg-white rounded-xs inline-block border-1.2 border-slate-300">&nbsp;</span>
            </div>
            <div className="w-px h-3.5 bg-slate-300 shrink-0" />
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-[8px] font-extrabold uppercase text-slate-500 tracking-wider">Roll No:</span>
              <span className="border-b-2 border-[#0b2545] w-14 sm:w-16 h-4 bg-white rounded-xs inline-block border-1.2 border-slate-300">&nbsp;</span>
            </div>
            <div className="w-px h-3.5 bg-slate-300 shrink-0" />
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-[8px] font-extrabold uppercase text-slate-500 tracking-wider">Class:</span>
              <strong className="text-slate-800 font-bold whitespace-nowrap">{classNameLabel}</strong>
            </div>
            <div className="w-px h-3.5 bg-slate-300 shrink-0" />
            <div className="flex items-center gap-1 shrink-0 min-w-0 overflow-hidden text-ellipsis">
              <span className="text-[8px] font-extrabold uppercase text-slate-500 tracking-wider">Subject:</span>
              <strong className="text-slate-800 font-bold truncate whitespace-nowrap">{quiz.subject || 'General'}</strong>
            </div>
          </div>

          {/* Right: Exam Date */}
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-[8px] font-extrabold uppercase text-slate-500 tracking-wider">Date:</span>
            <strong className="text-[#0b2545] font-black bg-white px-2 py-0.5 rounded border border-slate-300 text-xs shadow-2xs whitespace-nowrap">{examDate}</strong>
          </div>
        </div>

        {/* General Instructions Banner */}
        {includeInstructions && (
          <div className="bg-white px-3 py-1 flex items-center justify-between text-[8px] text-slate-600">
            <span><strong className="text-[#0b2545]">Instructions:</strong> Answer all questions clearly. Shade or mark the single best option. No negative marking.</span>
            <span className="font-bold text-[#0b2545]">Total Questions: {quiz.questions.length} &bull; Max Marks: {quiz.totalPoints || quiz.questions.length}</span>
          </div>
        )}
      </div>
    );
  };

  // -------------------------------------------------------------
  // RENDER QUESTION FIGURE
  // -------------------------------------------------------------
  const renderQuestionFigure = (q: QuestionItem, qIndex: number) => {
    const imgUrl = getQuestionImageUrl(q);
    if (!imgUrl) return null;

    const maxImgHeight =
      columnLayout === 'two_column' || figureScale === 'compact' ? 'max-h-36' : 'max-h-56';

    return (
      <div className="figure-frame my-3 p-2.5 rounded-xl border border-slate-200 bg-slate-50/70 text-center break-inside-avoid shadow-2xs">
        <img
          src={imgUrl}
          alt={`Diagram for Question ${qIndex + 1}`}
          className={`${maxImgHeight} w-auto max-w-full object-contain mx-auto rounded-lg border border-slate-300 bg-white p-1 shadow-2xs`}
          referrerPolicy="no-referrer"
          loading="eager"
          style={{ pageBreakInside: 'avoid', breakInside: 'avoid', display: 'block', margin: '0 auto' }}
        />
        <div className="figure-caption text-[10px] font-semibold text-slate-500 italic mt-1.5">
          Figure {qIndex + 1}: Reference Diagram
        </div>
      </div>
    );
  };

  // -------------------------------------------------------------
  // MODE 1: MODERN QUESTION PAPER (10 Questions Per Page, 2-Column Flex Layout)
  // Clean academic masthead, designated tick boxes, zero wasted space
  // -------------------------------------------------------------
  const renderQuestionPaperCard = (q: QuestionItem, globalIdx: number) => {
    const qNum = globalIdx + 1;
    const pts = q.points || 1;
    const imgUrl = getQuestionImageUrl(q);
    const qKey = q.id || String(globalIdx);

    const optionsElements = q.type === 'mcq' && q.options ? q.options.map((opt, oIdx) => {
      const letter = String.fromCharCode(65 + oIdx);
      const isTicked = tickedAnswers[qKey] === oIdx;

      return (
        <div
          key={oIdx}
          onClick={() => handleToggleTick(qKey, oIdx)}
          className={`rounded border p-1 sm:p-1.5 flex items-center justify-between gap-1.5 cursor-pointer select-none transition min-w-0 overflow-hidden ${
            isTicked
              ? 'shadow-2xs'
              : 'border-slate-200 bg-white hover:bg-slate-50'
          }`}
          style={
            isTicked
              ? { borderColor: theme.primary, backgroundColor: theme.lightBg }
              : undefined
          }
          title="Click to tick / select option"
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span
              className="w-5 h-5 rounded-full border text-[9.5px] font-black flex items-center justify-center shrink-0"
              style={
                isTicked
                  ? { backgroundColor: theme.primary, borderColor: theme.primary, color: '#ffffff' }
                  : { backgroundColor: '#f1f5f9', borderColor: '#cbd5e1', color: '#1e293b' }
              }
            >
              {letter}
            </span>
            <span className="text-[12px] font-semibold text-slate-800 leading-snug break-words whitespace-normal flex-1 min-w-0">
              {cleanOptionText(opt)}
            </span>
          </div>

          {showTickBoxes && (
            <div
              className={`flex items-center justify-center font-bold shrink-0 transition ${
                tickBoxStyle === 'circle'
                  ? 'w-4 h-4 rounded-full border-[1.5px]'
                  : tickBoxStyle === 'bracket'
                  ? 'font-mono text-[10px]'
                  : 'w-4 h-4 rounded border-[1.5px]'
              } ${
                isTicked
                  ? 'text-[9.5px]'
                  : 'border-slate-400 bg-white text-transparent'
              }`}
              style={
                isTicked
                  ? { backgroundColor: theme.primary, borderColor: theme.primary, color: '#ffffff' }
                  : undefined
              }
            >
              {tickBoxStyle === 'bracket' ? `[ ${isTicked ? '✓' : ' '} ]` : (isTicked ? '✓' : '')}
            </div>
          )}
        </div>
      );
    }) : null;

    return (
      <div
        key={q.id || globalIdx}
        className="question-block print-card rounded-md border border-slate-200 bg-white p-2.5 sm:p-3 space-y-2 inline-block w-full break-inside-avoid mb-2.5 align-top"
      >
        {/* Top Prompt Row */}
        <div className="question-header flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 flex-1 min-w-0">
            <span
              className="question-number w-6 h-6 rounded text-white font-black text-[11px] flex items-center justify-center shrink-0"
              style={{ backgroundColor: '#0b2545' }}
            >
              {qNum}
            </span>
            <span className="question-text font-extrabold text-[13px] text-[#0b2545] leading-snug break-words">
              {cleanQuestionPrompt(q.questionText)}
            </span>
          </div>
          <span className="question-marks text-[8.5px] font-extrabold px-2 py-0.5 rounded bg-slate-50 text-slate-700 border border-slate-300 shrink-0">
            [ {pts} {pts === 1 ? 'Mark' : 'Marks'} ]
          </span>
        </div>

        {/* MCQ Options with Dedicated Tick Boxes */}
        {q.type === 'mcq' && q.options && (
          imgUrl ? (
            // Side-by-side diagram layout for questions with figures
            <div className="flex gap-2 items-center mt-1 w-full">
              <div className="w-[38%] shrink-0 flex items-center justify-center bg-white border border-slate-200 rounded p-1">
                <img
                  src={imgUrl}
                  alt={`Diagram for Q${qNum}`}
                  className="max-h-20 max-w-full object-contain rounded bg-white"
                  referrerPolicy="no-referrer"
                  loading="eager"
                />
              </div>
              <div className="flex-1 min-w-0 flex flex-col gap-1">
                {optionsElements}
              </div>
            </div>
          ) : (
            // 2x2 grid of options
            <div className="question-options grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-0.5">
              {optionsElements}
            </div>
          )
        )}

        {/* Diagram for non-MCQ questions */}
        {q.type !== 'mcq' && imgUrl && (
          <div className="text-center my-1 p-1.5 rounded-md bg-slate-50 border border-slate-200">
            <img
              src={imgUrl}
              alt={`Diagram for Q${qNum}`}
              className="max-h-24 w-auto max-w-full object-contain mx-auto rounded border border-slate-300 bg-white p-0.5"
              referrerPolicy="no-referrer"
              loading="eager"
            />
            <div className="text-[8px] font-bold text-slate-500 italic mt-0.5">
              Figure Q{qNum}: Reference Diagram
            </div>
          </div>
        )}

        {/* True / False with Dedicated Tick Boxes */}
        {q.type === 'true_false' && (
          <div className="question-options grid grid-cols-2 gap-1.5 pt-0.5">
            {[
              { label: 'True', val: true, letter: 'A' },
              { label: 'False', val: false, letter: 'B' },
            ].map((item) => {
              const isTicked = tickedAnswers[qKey] === item.val;

              return (
                <div
                  key={item.label}
                  onClick={() => handleToggleTick(qKey, item.val)}
                  className={`rounded-md border p-1.5 flex items-center justify-between gap-1.5 cursor-pointer select-none transition ${
                    isTicked
                      ? 'shadow-2xs'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                  style={
                    isTicked
                      ? { borderColor: theme.primary, backgroundColor: theme.lightBg }
                      : undefined
                  }
                  title="Click to tick / select option"
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-4 h-4 rounded-full border text-[8.5px] font-bold flex items-center justify-center shrink-0"
                      style={
                        isTicked
                          ? { backgroundColor: theme.primary, borderColor: theme.primary, color: '#ffffff' }
                          : { backgroundColor: '#f1f5f9', borderColor: '#cbd5e1', color: '#334155' }
                      }
                    >
                      {item.letter}
                    </span>
                    <span className="text-[10.5px] font-bold text-slate-800">{item.label}</span>
                  </div>

                  {showTickBoxes && (
                    <div
                      className={`flex items-center justify-center font-bold shrink-0 transition ${
                        tickBoxStyle === 'circle'
                          ? 'w-4 h-4 rounded-full border-[1.5px]'
                          : tickBoxStyle === 'bracket'
                          ? 'font-mono text-[10px]'
                          : 'w-3.5 h-3.5 rounded border-[1.5px]'
                      } ${
                        isTicked
                          ? 'text-[9px]'
                          : 'border-slate-400 bg-white text-transparent'
                      }`}
                      style={
                        isTicked
                          ? { backgroundColor: theme.primary, borderColor: theme.primary, color: '#ffffff' }
                          : undefined
                      }
                    >
                      {tickBoxStyle === 'bracket' ? `[ ${isTicked ? '✓' : ' '} ]` : (isTicked ? '✓' : '')}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Sub-Questions (e.g. for Picture questions or multi-part questions) */}
        {(() => {
          const effectiveSubQuestions = (Array.isArray(q.subQuestions) && q.subQuestions.length > 0)
            ? q.subQuestions
            : (Array.isArray((q as any).sub_questions) && (q as any).sub_questions.length > 0)
            ? (q as any).sub_questions
            : null;
          const effectiveBlankItems = (Array.isArray(q.blankItems) && q.blankItems.length > 0)
            ? q.blankItems
            : (Array.isArray((q as any).blank_items) && (q as any).blank_items.length > 0)
            ? (q as any).blank_items
            : null;
          let rawPairs: Array<{ left: string; right: string }> = (Array.isArray(q.matchingPairs) && q.matchingPairs.length > 0)
            ? q.matchingPairs
            : (Array.isArray((q as any).matching_pairs) && (q as any).matching_pairs.length > 0)
            ? (q as any).matching_pairs
            : [];

          if (rawPairs.length === 0 && typeof q.correctAnswer === 'string' && (q.correctAnswer.includes('->') || q.correctAnswer.includes(':'))) {
            const rawSegments = q.correctAnswer.split(/[,;\n]+/).map((s: string) => s.trim()).filter(Boolean);
            const extracted: Array<{ left: string; right: string }> = [];
            for (const seg of rawSegments) {
              const parts = seg.split(/\s*(?:->|:)\s*/);
              if (parts.length >= 2) {
                const leftKey = parts[0].replace(/^["']|["']$/g, '').trim();
                const rightVal = parts.slice(1).join(' -> ').replace(/^["']|["']$/g, '').trim();
                if (leftKey && rightVal) extracted.push({ left: leftKey, right: rightVal });
              }
            }
            if (extracted.length > 0) rawPairs = extracted;
          } else if (rawPairs.length === 0 && typeof q.correctAnswer === 'object' && q.correctAnswer !== null && !Array.isArray(q.correctAnswer)) {
            rawPairs = Object.entries(q.correctAnswer).map(([k, v]) => ({ left: k, right: String(v) }));
          }

          const effectiveMatchingPairs = rawPairs.length > 0 ? rawPairs : null;

          return (
            <>
              {effectiveSubQuestions && effectiveSubQuestions.length > 0 && (
                <div className="pt-1 space-y-2">
                  {effectiveSubQuestions.map((sq: any, sqIdx: number) => {
                    const sqLabel = sq.label || `(${String.fromCharCode(97 + sqIdx)})`;
                    const sqPts = Number(sq.points) || 1;
                    const isSqMcq = sq.type === 'mcq' && Array.isArray(sq.options) && sq.options.length > 0;

                    return (
                      <div key={sq.id || sqIdx} className="p-2 rounded-lg bg-slate-50 border border-slate-200/90 space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-[10px] font-bold text-slate-800 leading-snug">
                            <span className="text-blue-600 font-extrabold mr-1">{sqLabel}</span>
                            {cleanQuestionPrompt(sq.questionText)}
                          </div>
                          <span className="text-[8px] font-mono font-bold px-1.5 py-0.5 rounded bg-white text-slate-600 border border-slate-200 shrink-0">
                            {sqPts} {sqPts === 1 ? 'pt' : 'pts'}
                          </span>
                        </div>

                        {isSqMcq ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-0.5">
                            {sq.options!.map((opt: string, optI: number) => {
                              const letter = String.fromCharCode(65 + optI);
                              return (
                                <div key={optI} className="flex items-center justify-between gap-1 p-1.5 rounded bg-white border border-slate-200 text-[9.5px]">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <span className="w-3.5 h-3.5 rounded-full bg-slate-100 text-slate-700 font-bold text-[8px] flex items-center justify-center shrink-0">
                                      {letter}
                                    </span>
                                    <span className="text-slate-800 truncate font-medium">{cleanOptionText(opt)}</span>
                                  </div>
                                  <span className="w-3 h-3 rounded border border-slate-400 shrink-0"></span>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="border-b border-dashed border-slate-300 h-4 text-[9px] text-slate-400 pl-1">
                            Ans: ___________________________________________________________
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Fill in the blanks */}
              {q.type === 'fill_blanks' && (!effectiveSubQuestions || effectiveSubQuestions.length === 0) && (
                <div className="pt-0.5 space-y-1.5 text-[10px]">
                  {/* Word Bank if options exist */}
                  {Array.isArray(q.options) && q.options.length > 0 && (
                    <div className="p-1.5 rounded-md bg-blue-50/70 border border-blue-200/80 text-[9px] text-blue-900">
                      <strong>[ Word Bank / Choices ]:</strong>{' '}
                      {q.options.map((w) => cleanOptionText(w)).join(' • ')}
                    </div>
                  )}

                  {effectiveBlankItems && effectiveBlankItems.length > 0 ? (
                    <div className="space-y-1">
                      {effectiveBlankItems.map((bi: any, bIdx: number) => (
                        <div key={bi.id || bIdx} className="p-1.5 rounded bg-slate-50 border border-slate-200 flex items-center justify-between text-[9.5px]">
                          <div>
                            <span className="font-bold text-blue-600 mr-1">({bIdx + 1})</span>
                            {bi.prefix && <span>{bi.prefix} </span>}
                            <span className="inline-block border-b border-slate-700 min-w-[70px] text-center text-slate-400">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
                            {bi.suffix && <span> {bi.suffix}</span>}
                          </div>
                          {bi.points && (
                            <span className="text-[8px] font-mono text-slate-500">[{bi.points}pt]</span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <>
                      <div className="p-1.5 rounded bg-slate-50 border border-slate-200 text-slate-800 text-[10px]">
                        {q.blankTemplate || 'Statement: ________________________________________________'}
                      </div>
                      <div className="border-b border-dashed border-slate-300 h-4" />
                    </>
                  )}
                </div>
              )}

              {/* Match the following */}
              {(q.type === 'match_following' || (typeof q.questionText === 'string' && /match\s+(the\s+)?following/i.test(q.questionText))) && effectiveMatchingPairs && (!effectiveSubQuestions || effectiveSubQuestions.length === 0) && (() => {
                const validPairs = effectiveMatchingPairs.filter((p: any) => p && (p.left || p.right));
                const n = validPairs.length;
                const shift = n > 1 ? Math.max(1, Math.floor(n / 2)) : 0;
                const rightItems = validPairs.map((p: any, i: number) => ({
                  text: p.right || '',
                  origIndex: i,
                }));
                const scrambledRight: typeof rightItems = [];
                for (let i = 0; i < n; i++) {
                  scrambledRight.push(rightItems[(i + shift) % n]);
                }

                return (
                  <div className="my-2 border border-slate-300 rounded-lg overflow-hidden bg-white text-[9.5px] shadow-2xs">
                    {/* Guidance / Directions Banner */}
                    <div className="px-2.5 py-1.5 bg-blue-50/80 border-b border-blue-200 flex items-center gap-1.5 text-[8.5px] text-blue-900 font-semibold">
                      <span className="text-[11px]">ℹ️</span>
                      <span><strong>Directions:</strong> Match each item in Column A with its counterpart in Column B. Write the correct letter in the bracket <strong>[ &nbsp; ]</strong> or in the Answer Strip below.</span>
                    </div>

                    {/* Table Header */}
                    <div className="grid grid-cols-2 bg-slate-100 border-b border-slate-300 font-extrabold text-slate-800 text-[9px] uppercase tracking-wider">
                      <div className="p-2 border-r border-slate-300">Column A (Premises / Items)</div>
                      <div className="p-2">Column B (Options / Matches)</div>
                    </div>

                    {/* Rows */}
                    <div className="divide-y divide-slate-200">
                      {validPairs.map((p: any, pIdx: number) => {
                        const rItem = scrambledRight[pIdx];
                        const rightLabel = String.fromCharCode(65 + pIdx);
                        const bg = pIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60';
                        return (
                          <div key={pIdx} className={`grid grid-cols-2 items-center text-[9px] ${bg}`}>
                            {/* Column A Item with Dotted Connector Line to Answer Box */}
                            <div className="p-2 border-r border-slate-300 flex items-center gap-2 min-w-0">
                              <span className="font-black text-blue-800 font-mono text-[9px] shrink-0">({pIdx + 1})</span>
                              <span className="font-bold text-slate-900 break-words leading-snug">{p.left}</span>
                              <span className="grow border-b-2 border-dotted border-slate-300 min-w-4 mx-1.5" />
                              <span className="font-mono font-black text-[8.5px] text-slate-600 border border-slate-400 rounded px-1.5 py-0.5 bg-white shadow-2xs shrink-0 whitespace-nowrap">
                                [&nbsp;&nbsp;&nbsp;]
                              </span>
                            </div>
                            {/* Column B Option */}
                            <div className="p-2 flex items-center gap-2 min-w-0">
                              <span className="font-black text-emerald-800 font-mono text-[9px] shrink-0">({rightLabel})</span>
                              <span className="font-semibold text-slate-800 break-words leading-snug">{rItem.text}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Final Answer Strip */}
                    <div className="bg-slate-50 border-t border-slate-300 p-2 flex items-center justify-between flex-wrap gap-2 text-[8.5px]">
                      <span className="font-extrabold text-slate-700 uppercase tracking-wide">Final Match Answer Strip:</span>
                      <div className="flex items-center gap-2 flex-wrap font-mono">
                        {validPairs.map((_: any, pIdx: number) => (
                          <span key={pIdx} className="inline-flex items-center gap-1.5 bg-white border border-slate-300 rounded px-2 py-0.5 text-slate-800 font-bold shadow-2xs">
                            <span className="text-blue-800">({pIdx + 1})</span>
                            <span className="text-slate-400 font-normal">&rarr;</span>
                            <span className="inline-block border-b-2 border-slate-900 min-w-[20px] text-center font-black">&nbsp;</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Short answer / descriptive / picture question without sub-questions */}
              {(q.type === 'question_answer' || (q.type === 'picture_question' && (!effectiveSubQuestions || effectiveSubQuestions.length === 0))) && (
                <div className="pt-0.5 space-y-1">
                  <div className="border-b border-dashed border-slate-300 h-4" />
                  <div className="border-b border-dashed border-slate-300 h-4" />
                  {pts >= 3 && <div className="border-b border-dashed border-slate-300 h-4" />}
                </div>
              )}
            </>
          );
        })()}
      </div>
    );
  };

  const renderModernQuestionPaper = () => {
    const isSingleCol = columnLayout === 'single';
    const questions = quiz.questions || [];

    return (
      <div className="w-full text-slate-900" style={{ fontFamily: fontFamilyCss }}>
        {/* Physical Exam Document Sheet */}
        <div className="academic-paper-layout bg-white text-slate-900">
          {/* Royal Academic Institutional Masthead */}
          <div className="rounded-md overflow-hidden border-1.5 border-[#0b2545] bg-white mb-3 box-border shadow-xs">
            {/* Royal Navy Gradient Upper Header */}
            <div className="bg-gradient-to-r from-[#07192f] via-[#0b2545] to-[#134074] text-white p-2.5 sm:px-3 flex flex-wrap justify-between items-center gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-7 h-7 rounded bg-white/15 border border-white/25 text-blue-200 flex items-center justify-center shrink-0">
                  <BookOpen className="w-4 h-4 text-blue-200" />
                </div>
                <div className="min-w-0">
                  <div className="text-[7.5px] font-black uppercase tracking-widest text-blue-200 truncate">
                    {schoolName || 'ACADEMIC ASSESSMENT BOARD'}
                  </div>
                  <div className="text-sm sm:text-base font-black text-white tracking-tight leading-snug truncate">
                    {quiz.title || 'Official Question Paper'}
                  </div>
                </div>
              </div>

              {/* Right: Max Marks Badge & Time */}
              <div className="flex items-center gap-2 shrink-0">
                {quiz.timeLimitMinutes && quiz.timeLimitMinutes > 0 && (
                  <div className="text-[8px] text-blue-100 font-bold bg-white/10 border border-white/20 rounded px-2 py-0.5 whitespace-nowrap">
                    Time: <strong className="text-white">{quiz.timeLimitMinutes} Mins</strong>
                  </div>
                )}
                <div className="shrink-0 border-1.5 border-white/40 rounded bg-white px-2.5 py-0.5 text-center shadow-2xs whitespace-nowrap">
                  <span className="text-[7px] font-black uppercase text-slate-500 tracking-wider">Total Marks: </span>
                  <strong className="font-black text-xs text-[#0b2545]">{quiz.totalPoints || questions.length}</strong>
                </div>
              </div>
            </div>

            {/* Blank Student Particulars Fill-In Row */}
            <div className="bg-white border-t border-slate-200 px-3 py-1.5 flex flex-wrap sm:flex-nowrap print:flex-nowrap items-end justify-between gap-2.5 sm:gap-3 text-[9px]">
              <div className="flex items-end gap-1.5 w-full sm:w-auto sm:flex-[2.2] print:flex-[2.2] sm:min-w-[140px] print:min-w-[140px]">
                <span className="text-[7.5px] font-extrabold uppercase text-slate-600 tracking-wider whitespace-nowrap">Student Name:</span>
                <span className="flex-1 border-b border-slate-700 h-3.5 inline-block min-w-[60px]" />
              </div>
              <div className="flex items-end gap-1.5 flex-1 min-w-[80px]">
                <span className="text-[7.5px] font-extrabold uppercase text-slate-600 tracking-wider whitespace-nowrap">Class:</span>
                <span className="flex-1 border-b border-slate-700 h-3.5 inline-block min-w-[40px]" />
              </div>
              <div className="flex items-end gap-1.5 flex-[0.9] min-w-[75px]">
                <span className="text-[7.5px] font-extrabold uppercase text-slate-600 tracking-wider whitespace-nowrap">Roll No:</span>
                <span className="flex-1 border-b border-slate-700 h-3.5 inline-block min-w-[35px]" />
              </div>
            </div>

            {/* Subject & Questions Summary Strip */}
            <div className="flex flex-wrap sm:flex-nowrap print:flex-nowrap items-center justify-between gap-2 text-[9px] bg-slate-50 border-t border-dashed border-slate-300 px-3 py-1.5 overflow-hidden">
              <div className="flex flex-wrap sm:flex-nowrap print:flex-nowrap items-center gap-2 sm:gap-3 shrink-0 min-w-0 overflow-hidden">
                <div className="shrink-0">
                  <span className="text-[7.5px] font-extrabold uppercase text-slate-500 tracking-wider">Subject:</span>{' '}
                  <strong className="text-slate-800 font-bold whitespace-nowrap">{quiz.subject || 'General'}</strong>
                </div>
                <div className="w-px h-3 bg-slate-300 shrink-0" />
                <div className="shrink-0">
                  <span className="text-[7.5px] font-extrabold uppercase text-slate-500 tracking-wider">Questions:</span>{' '}
                  <strong className="text-slate-800 font-bold whitespace-nowrap">{questions.length}</strong>
                </div>
              </div>
              <div className="text-[8px] text-slate-500 font-medium truncate max-w-full">
                {instructions || 'Answer all questions clearly.'}
              </div>
            </div>
          </div>

          {/* Continuous Multi-Column Questions Flow */}
          <div
            className={`w-full gap-3 text-xs items-start ${
              isSingleCol ? 'flex flex-col single-col-layout' : 'two-col-layout columns-1 sm:columns-2 [column-gap:16px]'
            }`}
          >
            {questions.map((q, idx) => renderQuestionPaperCard(q, idx))}
          </div>
        </div>
      </div>
    );
  };

  // -------------------------------------------------------------
  // MODE 2: MODERN STUDENT ANSWER SHEET
  // Modern bubble cards, scannable micro-clusters, sleek metrics
  // -------------------------------------------------------------
  const renderModernAnswerSheet = () => {
    const objQuestions = quiz.questions.filter((q) => q.type === 'mcq' || q.type === 'true_false');
    const objMarks = objQuestions.reduce((sum, q) => sum + (q.points || 1), 0);
    const blankMarks = blankQuestions.reduce((sum, q) => sum + (q.points || 1), 0);
    const matchMarks = matchQuestions.reduce((sum, q) => sum + (q.points || 1), 0);
    const descMarks = descriptiveQuestions.reduce((sum, q) => sum + (q.points || 1), 0);

    // Group into clusters of 5
    const clusters: QuestionItem[][] = [];
    for (let i = 0; i < objQuestions.length; i += 5) {
      clusters.push(objQuestions.slice(i, i + 5));
    }

    return (
      <div
        className="text-slate-900 space-y-4 select-none"
        style={{
          fontFamily: fontFamilyCss,
          fontSize: fontSize === 'compact' ? '10pt' : '11pt',
        }}
      >
        {renderModernHeader('Student Answer Sheet')}

        {/* Shading Guide Banner */}
        {showShadingGuide && (
          <div className="rounded-2xl border border-slate-200 bg-white p-3 flex flex-wrap items-center justify-between gap-2 shadow-2xs text-xs">
            <div className="flex items-center gap-2">
              <span
                className="w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                style={{ backgroundColor: theme.primary }}
              >
                ✓
              </span>
              <span className="font-bold text-slate-800 text-[11px] uppercase tracking-wider">
                Marking Guide: Fill circle completely.
              </span>
            </div>

            <div className="flex items-center gap-2 sm:gap-3 text-[11px]">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold">
                <span
                  className={
                    bubbleShape === 'pill'
                      ? 'answer-bubble answer-bubble-pill answer-bubble-filled'
                      : 'answer-bubble answer-bubble-filled'
                  }
                  style={{ backgroundColor: theme.primary, borderColor: theme.primary }}
                >
                  A
                </span>
                <span>Correct</span>
              </div>

              <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-slate-50 text-slate-600 border border-slate-200">
                <span className="answer-bubble text-rose-600 font-bold border-rose-300">✕</span>
                <span>No Cross</span>
              </div>

              <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-slate-50 text-slate-600 border border-slate-200">
                <span className="answer-bubble text-rose-600 font-bold border-rose-300">✓</span>
                <span>No Tick</span>
              </div>
            </div>

            <span className="text-[10px] text-slate-400 font-medium italic hidden md:block">
              Use dark ballpoint pen or 2B pencil.
            </span>
          </div>
        )}

        {/* Objective Questions Clustered Grid */}
        {objQuestions.length > 0 && (
          <div className="space-y-2.5 break-inside-avoid">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" style={{ color: theme.primary }} />
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                  Multiple Choice & Objective Responses
                </h4>
              </div>
              <span className="text-[10px] font-bold font-mono text-slate-500">
                {objQuestions.length} Questions &bull; {objMarks} Marks
              </span>
            </div>

            <div
              className={`grid gap-3 ${
                clusters.length <= 2
                  ? 'grid-cols-1 sm:grid-cols-2'
                  : clusters.length <= 4
                  ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4'
                  : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5'
              }`}
            >
              {clusters.map((cluster, cIdx) => (
                <div
                  key={cIdx}
                  className="question-block answer-card rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-2xs break-inside-avoid"
                  style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}
                >
                  {/* Cluster Header */}
                  <div
                    className="px-3 py-1.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider"
                    style={{
                      backgroundColor: theme.lightBg,
                      color: theme.primary,
                      borderBottom: `1px solid ${theme.borderAccent}`,
                    }}
                  >
                    <span>
                      Q.{String(quiz.questions.findIndex((item) => item.id === cluster[0]?.id) + 1).padStart(2, '0')} &ndash;{' '}
                      Q.{String(quiz.questions.findIndex((item) => item.id === cluster[cluster.length - 1]?.id) + 1).padStart(2, '0')}
                    </span>
                    <span className="text-[9px] opacity-70 font-mono">Options</span>
                  </div>

                  {/* 5-Question Rows */}
                  <div className="divide-y divide-slate-100">
                    {cluster.map((q) => {
                      const absoluteIndex = quiz.questions.findIndex((item) => item.id === q.id) + 1;
                      const optionsCount = q.type === 'mcq' ? (q.options?.length || 4) : 2;

                      return (
                        <div
                          key={q.id || absoluteIndex}
                          className="flex items-center justify-between px-2.5 py-1.5 hover:bg-slate-50/80 transition"
                        >
                          {/* Question Number Badge */}
                          <span className="w-5 h-5 rounded-md bg-slate-100 text-slate-800 font-mono font-bold text-[10px] flex items-center justify-center shrink-0">
                            {String(absoluteIndex).padStart(2, '0')}
                          </span>

                          {/* Optical Bubbles */}
                          <div className="flex items-center gap-1.5">
                            {q.type === 'mcq' ? (
                              Array.from({ length: Math.min(optionsCount, 5) }).map((_, oIdx) => {
                                const letter = String.fromCharCode(65 + oIdx);
                                return (
                                  <span
                                    key={oIdx}
                                    className={
                                      bubbleShape === 'pill'
                                        ? 'answer-bubble answer-bubble-pill cursor-pointer hover:border-indigo-500 hover:bg-indigo-50'
                                        : 'answer-bubble cursor-pointer hover:border-indigo-500 hover:bg-indigo-50'
                                    }
                                  >
                                    {letter}
                                  </span>
                                );
                              })
                            ) : (
                              <>
                                <span
                                  className={
                                    bubbleShape === 'pill'
                                      ? 'answer-bubble answer-bubble-pill cursor-pointer hover:border-indigo-500 hover:bg-indigo-50'
                                      : 'answer-bubble cursor-pointer hover:border-indigo-500 hover:bg-indigo-50'
                                  }
                                >
                                  T
                                </span>
                                <span
                                  className={
                                    bubbleShape === 'pill'
                                      ? 'answer-bubble answer-bubble-pill cursor-pointer hover:border-indigo-500 hover:bg-indigo-50'
                                      : 'answer-bubble cursor-pointer hover:border-indigo-500 hover:bg-indigo-50'
                                  }
                                >
                                  F
                                </span>
                              </>
                            )}
                          </div>

                          {/* Evaluator Check Ring */}
                          <div className="w-4 h-4 rounded-full border border-dashed border-slate-300 text-[8px] text-slate-300 flex items-center justify-center shrink-0">
                            &nbsp;
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Fill in the blanks responses */}
        {blankQuestions.length > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3 break-inside-avoid shadow-2xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="flex items-center gap-2">
                <PenTool className="w-4 h-4" style={{ color: theme.primary }} />
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                  Fill in the Blanks Responses
                </h4>
              </div>
              <span className="text-[10px] font-mono text-slate-500 font-bold">
                {blankQuestions.length} Items &bull; {blankMarks} Marks
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {blankQuestions.map((q) => {
                const qNum = quiz.questions.findIndex((item) => item.id === q.id) + 1;
                return (
                  <div
                    key={q.id}
                    className="question-block p-2.5 sm:p-3 rounded-xl border border-slate-200/80 bg-slate-50/50 space-y-1.5"
                  >
                    <div className="flex items-center justify-between font-bold text-slate-800">
                      <span>Q{qNum}. Blank Response:</span>
                      <span className="text-[10px] text-slate-500 font-mono">[{q.points || 1}pt]</span>
                    </div>
                    <div className="border-b-2 border-slate-300 h-6 bg-white rounded-t-lg px-2" />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Match the Following Responses */}
        {matchQuestions.length > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3 break-inside-avoid shadow-2xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4" style={{ color: theme.primary }} />
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                  Match the Following Responses
                </h4>
              </div>
              <span className="text-[10px] font-mono text-slate-500 font-bold">
                {matchQuestions.length} Questions &bull; {matchMarks} Marks
              </span>
            </div>

            <div className="space-y-3 text-xs">
              {matchQuestions.map((q) => {
                const qNum = quiz.questions.findIndex((item) => item.id === q.id) + 1;
                const pairs = Array.isArray(q.matchingPairs) ? q.matchingPairs : (Array.isArray(q.matching_pairs) ? q.matching_pairs : []);
                return (
                  <div key={q.id} className="question-block p-2.5 sm:p-3 rounded-xl border border-slate-200/80 bg-slate-50/50 space-y-1.5">
                    <div className="flex items-center justify-between font-bold text-slate-800">
                      <span>Q{qNum}. {cleanQuestionPrompt(q.questionText || 'Matching Items:')}</span>
                      <span className="text-[10px] text-slate-500 font-mono">[{q.points || 1}pt]</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 pt-1">
                      {pairs.map((p: any, pIdx: number) => (
                        <div key={pIdx} className="flex items-center justify-between gap-1.5 p-2 bg-white rounded-lg border border-slate-200">
                          <span className="font-semibold text-slate-700 text-[11px] truncate">{p.left}</span>
                          <span className="text-slate-400 font-bold">➔</span>
                          <span className="w-10 h-6 border-b-2 border-slate-400 bg-slate-50 rounded-xs flex items-center justify-center font-bold text-slate-800 text-xs"></span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Written & Descriptive Responses */}
        {descriptiveQuestions.length > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3 break-inside-avoid shadow-2xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="flex items-center gap-2">
                <PenTool className="w-4 h-4" style={{ color: theme.primary }} />
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                  Descriptive & Written Responses
                </h4>
              </div>
              <span className="text-[10px] font-mono text-slate-500 font-bold">
                {descriptiveQuestions.length} Questions &bull; {descMarks} Marks
              </span>
            </div>

            <div className="space-y-3">
              {descriptiveQuestions.map((q) => {
                const qNum = quiz.questions.findIndex((item) => item.id === q.id) + 1;
                return (
                  <div
                    key={q.id}
                    className="question-block p-2.5 sm:p-3 rounded-xl border border-slate-200/80 bg-slate-50/50 space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-800">
                      <span>
                        <strong className="text-slate-900 mr-1 font-mono">Q{qNum}.</strong>
                        {cleanQuestionPrompt(q.questionText)}
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-600 shrink-0">
                        Score: [ &nbsp;&nbsp;&nbsp; ] / {q.points}
                      </span>
                    </div>

                    <div className="pt-1 space-y-1">
                      <div className="ruled-line" />
                      <div className="ruled-line" />
                      <div className="ruled-line" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Modern Evaluation Record Summary */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3 break-inside-avoid shadow-2xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <div className="flex items-center gap-2">
              <Award className="w-4 h-4" style={{ color: theme.primary }} />
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                Official Evaluation & Grade Certification
              </h4>
            </div>
            <span className="text-[10px] font-bold text-slate-400 uppercase font-mono">
              CONFIDENTIAL GRADING RECORD
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="p-2.5 rounded-xl border border-slate-200 bg-slate-50">
              <span className="text-[10px] font-bold uppercase text-slate-500 block">Total Questions</span>
              <span className="text-lg font-mono font-black text-slate-800">{quiz.questions.length}</span>
            </div>
            <div className="p-2.5 rounded-xl border border-slate-200 bg-slate-50">
              <span className="text-[10px] font-bold uppercase text-slate-500 block">Max Points</span>
              <span className="text-lg font-mono font-black text-slate-800">{quiz.totalPoints}</span>
            </div>
            <div className="p-2.5 rounded-xl border border-indigo-200 bg-indigo-50/50">
              <span className="text-[10px] font-bold uppercase text-indigo-700 block">Marks Secured</span>
              <span className="text-lg font-mono font-black text-indigo-900">[ &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ]</span>
            </div>
            <div className="p-2.5 rounded-xl border border-slate-200 bg-slate-50">
              <span className="text-[10px] font-bold uppercase text-slate-500 block">Grade / %</span>
              <span className="text-lg font-mono font-black text-slate-800">[ &nbsp;&nbsp; ]</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-100 text-xs text-slate-600">
            <div>
              <span className="text-[9px] font-bold uppercase text-slate-400 block">Examiner Signature & Date:</span>
              <div className="border-b border-slate-300 h-5 mt-1" />
            </div>
            <div>
              <span className="text-[9px] font-bold uppercase text-slate-400 block">Invigilator Verification Seal:</span>
              <div className="border-b border-slate-300 h-5 mt-1" />
            </div>
          </div>
        </div>
      </div>
    );
  };

  // -------------------------------------------------------------
  // MODE 3: TEACHER CONFIDENTIAL ANSWER KEY & RUBRIC
  // -------------------------------------------------------------
  const renderTeacherAnswerKey = () => {
    return (
      <div
        className="text-slate-900 space-y-4"
        style={{
          fontFamily: fontFamilyCss,
          fontSize: fontSize === 'compact' ? '10pt' : '11pt',
        }}
      >
        {renderModernHeader('Confidential Teacher Answer Key')}

        <div className="rounded-2xl border border-slate-200 overflow-x-auto shadow-2xs print:overflow-visible">
          <table className="w-full text-left border-collapse text-xs min-w-[560px] print:min-w-0">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-200 font-extrabold uppercase text-[10px] text-slate-600">
                <th className="p-3 text-center w-12">#</th>
                <th className="p-3 w-28">Type</th>
                <th className="p-3">Model Solution / Correct Answer</th>
                <th className="p-3 text-center w-16">Marks</th>
                <th className="p-3">Evaluation Rubric</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {quiz.questions.map((q, idx) => (
                <tr key={q.id || idx} className="hover:bg-slate-50/80 transition">
                  <td className="p-3 text-center font-mono font-bold text-slate-700">{idx + 1}</td>
                  <td className="p-3">
                    <span className="px-2 py-0.5 rounded-full text-[9.5px] font-bold uppercase bg-slate-100 text-slate-600 border border-slate-200">
                      {q.type.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="p-3 font-semibold text-emerald-800">
                    {q.subQuestions && q.subQuestions.length > 0 ? (
                      <div className="space-y-1 font-normal text-xs">
                        {q.subQuestions.map((sq, sqI) => (
                          <div key={sqI}>
                            <strong>{sq.label}:</strong>{' '}
                            <span className="font-bold text-emerald-700">{sq.correctAnswer}</span> ({sq.points}m)
                          </div>
                        ))}
                      </div>
                    ) : q.blankItems && q.blankItems.length > 0 ? (
                      <div className="space-y-0.5 font-normal text-xs">
                        {q.blankItems.map((bi, bI) => (
                          <div key={bI}>
                            <strong>({bI + 1})</strong>{' '}
                            <span className="font-bold text-emerald-700">{bi.correctAnswer}</span> ({bi.points || 1}m)
                          </div>
                        ))}
                      </div>
                    ) : q.type === 'match_following' && q.matchingPairs ? (
                      <div className="text-xs font-normal">
                        {q.matchingPairs.map((p, pI) => (
                          <span key={pI} className="inline-block mr-2">
                            {p.left} &rarr; <strong>{p.right}</strong>;
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span>{q.correctAnswer}</span>
                    )}
                  </td>
                  <td className="p-3 text-center font-mono font-bold text-slate-800">{q.points}</td>
                  <td className="p-3 text-xs text-slate-500">{q.gradingRubric || 'Exact accuracy required'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-150 print:p-0 print:static print:bg-white print:overflow-visible print:z-auto">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[100] bg-[var(--surface-higher)] text-blue-600 dark:text-blue-400 border border-blue-500/40 px-4 py-2 rounded-xl shadow-2xl text-xs font-bold flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-200 print:hidden">
          <CheckCircle2 className="w-4 h-4 text-blue-500 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-6xl overflow-hidden flex flex-col max-h-[96vh] text-[var(--ink)] transition-all print:border-0 print:shadow-none print:max-h-none print:w-full print:bg-white print:text-black">
        {/* Clean, Streamlined Header: ONLY School Name + Print Button */}
        <div className="relative bg-[var(--surface-higher)] text-[var(--ink)] px-3.5 sm:px-6 py-3 sm:py-4 flex flex-col md:flex-row items-stretch md:items-center justify-between shrink-0 border-b border-[var(--border)] gap-2.5 sm:gap-3 print:hidden">
          {/* Title Info */}
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 pr-11 md:pr-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <Printer className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-bold text-sm sm:text-base text-[var(--ink)] truncate">
                Print Assessment Paper
              </h2>
              <p className="text-[11px] sm:text-xs text-[var(--ink-muted)] truncate">
                {quiz.title} &bull; {quiz.questions.length} Questions &bull; {quiz.totalPoints} Marks
              </p>
            </div>
          </div>

          {/* Top Actions: Print Button & Close */}
          <div className="flex flex-wrap items-center gap-2 justify-end shrink-0">
            {/* Print Button */}
            <button
              type="button"
              onClick={handleTriggerPrint}
              className="btn btn-primary flex-1 xs:flex-none justify-center flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-bold rounded-xl transition cursor-pointer shadow-xs active:scale-95 shrink-0"
            >
              <Printer className="w-4 h-4 shrink-0" />
              <span>Print Paper</span>
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="absolute top-3 right-3.5 md:static p-2 border border-[var(--border)] rounded-xl bg-[var(--surface)] hover:bg-[var(--surface-higher)] text-[var(--ink-muted)] hover:text-[var(--ink)] transition cursor-pointer shadow-xs shrink-0"
              title="Close modal (Esc)"
            >
              <X className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>

        {/* Document Header Particulars Strip (Editable School Name, Teacher Name, Date, Instructions) */}
        <div className="bg-[var(--surface-higher)] border-b border-[var(--border)] px-3 sm:px-6 py-2 shrink-0 grid grid-cols-1 xs:grid-cols-2 lg:flex lg:flex-wrap items-center gap-2 text-xs print:hidden">
          {/* School Name */}
          <div className="flex items-center gap-1.5 bg-[var(--surface)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 lg:flex-1 min-w-0">
            <School className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            <input
              type="text"
              value={schoolName}
              onChange={(e) => setSchoolName(e.target.value)}
              placeholder="School / Board Name"
              title="School / Institution Name (Appears on print header)"
              className="w-full min-w-0 bg-transparent text-xs font-semibold text-[var(--ink)] placeholder-[var(--ink-muted)] outline-none"
            />
          </div>

          {/* Teacher Name */}
          <div className="flex items-center gap-1.5 bg-[var(--surface)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 lg:flex-1 min-w-0">
            <User className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <input
              type="text"
              value={teacherName}
              onChange={(e) => setTeacherName(e.target.value)}
              placeholder="Teacher / Examiner"
              title="Teacher / Examiner Name (Printed on Exam Paper)"
              className="w-full min-w-0 bg-transparent text-xs font-semibold text-[var(--ink)] placeholder-[var(--ink-muted)] outline-none"
            />
          </div>

          {/* Exam Date */}
          <div className="flex items-center gap-1.5 bg-[var(--surface)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 min-w-0 lg:w-36">
            <Calendar className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <input
              type="text"
              value={examDate}
              onChange={(e) => setExamDate(e.target.value)}
              placeholder="Exam Date"
              title="Exam Date (Printed on Exam Paper)"
              className="w-full min-w-0 bg-transparent text-xs font-semibold text-[var(--ink)] placeholder-[var(--ink-muted)] outline-none"
            />
          </div>

          {/* Instructions */}
          <div className="flex items-center gap-1.5 bg-[var(--surface)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 xs:col-span-2 lg:col-span-1 lg:flex-1 min-w-0">
            <FileText className="w-3.5 h-3.5 text-purple-500 shrink-0" />
            <input
              type="text"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Instructions (e.g. All questions compulsory...)"
              title="General Exam Instructions (Printed on Exam Paper)"
              className="w-full min-w-0 bg-transparent text-xs font-semibold text-[var(--ink)] placeholder-[var(--ink-muted)] outline-none"
            />
          </div>
        </div>

        {/* Paper Preview Canvas */}
        <div className="flex-1 overflow-y-auto p-2.5 sm:p-8 bg-[#09090b] flex justify-center print:p-0 print:m-0 print:bg-white print:overflow-visible print:block print:h-auto print:max-h-none">
          <div
            id="printable-assessment-document"
            className={`w-full max-w-[840px] transition-all print:max-w-none print:w-full print:p-0 print:m-0 print:shadow-none ${
              printMode === 'question_paper'
                ? 'space-y-4 sm:space-y-6'
                : 'bg-white p-3.5 sm:p-8 md:p-12 min-h-[600px] sm:min-h-[1056px] shadow-2xl'
            }`}
            style={
              printMode === 'question_paper'
                ? undefined
                : {
                    boxShadow: '0 20px 40px -15px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05)',
                  }
            }
          >
            {printMode === 'question_paper' ? (
              renderModernQuestionPaper()
            ) : printMode === 'answer_sheet' ? (
              twoUpMode ? (
                <div className="space-y-6">
                  {renderModernAnswerSheet()}
                  <div className="border-b-2 border-dashed border-slate-300 my-6 relative text-center">
                    <span className="bg-white px-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest relative -top-2.5">
                      ✂️ CUT HERE FOR TWO SEPARATE COPIES
                    </span>
                  </div>
                  {renderModernAnswerSheet()}
                </div>
              ) : (
                renderModernAnswerSheet()
              )
            ) : (
              renderTeacherAnswerKey()
            )}
          </div>
        </div>

        {/* Bottom Action Footer */}
        <div className="bg-[var(--surface-higher)] border-t border-[var(--border)] px-3 sm:px-5 py-2.5 sm:py-3 shrink-0 flex flex-wrap items-center justify-between gap-2.5 text-xs text-[var(--ink-muted)] font-mono print:hidden">
          <div className="flex items-center gap-2 min-w-0">
            <Info className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
            <span className="font-sans text-[11px] sm:text-xs">
              {printMode === 'question_paper'
                ? 'Question paper includes designated tick boxes [✓] for marking answers directly.'
                : 'Standardized optical bubble answer sheet for recorded responses.'}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
            {/* Direct Question Paper Download Button */}
            <button
              type="button"
              onClick={() => handleDownloadDoc('question_paper')}
              className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                printMode === 'question_paper'
                  ? 'bg-[var(--accent)]/15 border-[var(--accent)]/30 text-[var(--accent)]'
                  : 'bg-[var(--surface)] border-[var(--border)] text-[var(--ink-muted)] hover:text-[var(--ink)]'
              }`}
              title="Download standalone Question Paper with tick boxes (.html)"
            >
              <FileText className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
              <span>Download Paper</span>
            </button>

            {/* Direct Answer Sheet Download Button */}
            <button
              type="button"
              onClick={() => handleDownloadDoc('answer_sheet')}
              className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                printMode === 'answer_sheet'
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-500'
                  : 'bg-[var(--surface)] border-[var(--border)] text-[var(--ink-muted)] hover:text-[var(--ink)]'
              }`}
              title="Download standalone Student Answer Sheet (.html)"
            >
              <CheckSquare className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span>Answer Sheet</span>
            </button>

            {isAdmin && (
              <button
                type="button"
                onClick={() => handleDownloadDoc('teacher_key')}
                className="px-3 py-1.5 rounded-lg border border-amber-500/30 bg-amber-500/15 text-amber-500 text-xs font-semibold hover:bg-amber-500/25 transition cursor-pointer flex items-center gap-1.5"
                title="Download Teacher Key (.html)"
              >
                <Key className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span>Download Key</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleTriggerPrint}
              className="btn btn-primary px-3.5 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1.5"
              title="Print directly or save as PDF"
            >
              <Printer className="w-3.5 h-3.5 shrink-0" />
              <span>Print / Save PDF</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="btn px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
