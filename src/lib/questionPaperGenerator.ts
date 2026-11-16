import { QuizItem } from '../types';
import { generatePrintableQuestionsOnlyHtml } from './printEngine';

export interface QuestionPaperOptions {
  schoolName?: string;
  teacherName?: string;
  examDate?: string;
  instructions?: string;
  tickBoxStyle?: 'square' | 'circle' | 'bracket';
  showTickBoxes?: boolean;
  tickedAnswers?: Record<string, number | boolean>;
  autoPrint?: boolean;
  columnLayout?: 'single' | 'two_column';
  themeColor?: string;
  themeLightBg?: string;
  themeBorder?: string;
  fontStyle?: 'sans' | 'serif';
}

export function generatePrintableQuestionPaperHtml(
  quiz: QuizItem,
  _className = 'Academic Class',
  options: QuestionPaperOptions = {}
): string {
  return generatePrintableQuestionsOnlyHtml(quiz, {
    schoolName: options.schoolName || 'ACADEMIC EVALUATION & ASSESSMENT BOARD',
    paperStyle: options.columnLayout === 'single' ? 'classic' : 'twocolumn',
    columnLayout: options.columnLayout,
    autoPrint: options.autoPrint ?? false,
    showTickBoxes: options.showTickBoxes ?? true,
    tickBoxStyle: options.tickBoxStyle || 'square',
    tickedAnswers: options.tickedAnswers,
    instructions: options.instructions,
  });
}

