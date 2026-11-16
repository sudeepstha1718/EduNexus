import { QuestionItem, QuestionEvaluation, SubQuestionEvaluation, QuizEvaluationReport } from '../types';

/**
 * STRICT NORMALIZATION FOR STRINGS & TEXT ANSWERS
 * Handles whitespace, case-insensitivity, quotes, markdown, and punctuation.
 */
export function normalizeText(val: any): string {
  if (val === null || val === undefined) return '';
  let str = String(val).trim();
  // Strip markdown, quotes, and brackets around single answers
  str = str.replace(/^[*_~`"']+|[*_~`"']+$/g, '');
  // Strip trailing punctuation (. , ! ? ; :)
  str = str.replace(/[.,!?:;]+$/g, '');
  // Collapse multiple whitespaces into a single space
  str = str.replace(/\s+/g, ' ');
  return str.trim().toLowerCase();
}

/**
 * UNIFIED GRADING SCALE (SINGLE SOURCE OF TRUTH)
 * Standard academic grading scale used across all views and reports.
 */
export function calcGradeLetter(percentage: number): string {
  const p = Math.round(percentage);
  if (p >= 90) return 'A+';
  if (p >= 80) return 'A';
  if (p >= 75) return 'B+';
  if (p >= 70) return 'B';
  if (p >= 60) return 'C+';
  if (p >= 50) return 'C';
  if (p >= 40) return 'D';
  return 'F';
}

/**
 * CLEAN OPTION PREFIXES (e.g. "A. Sunlight", "(A) Sunlight", "Option A: Sunlight" -> "Sunlight")
 */
export function cleanOptionText(text: any): string {
  if (typeof text !== 'string') return text ? String(text) : '';
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^(option\s+[A-Za-z0-9][:\.\-\)]?\s*)/i, '');
  cleaned = cleaned.replace(/^(\(\s*[A-Za-z0-9]\s*\)|\[\s*[A-Za-z0-9]\s*\]|[A-Za-z0-9]\s*[\.\):\-–—])\s*/, '').trim();
  cleaned = cleaned.replace(/^(\(\s*[A-Za-z0-9]\s*\)|\[\s*[A-Za-z0-9]\s*\]|[A-Za-z0-9]\s*[\.\):\-–—])\s*/, '').trim();
  return cleaned;
}

/**
 * CLEAN QUESTION PROMPT (e.g. "1. What is...", "Q1: What is..." -> "What is...")
 */
export function cleanQuestionPrompt(text: any): string {
  if (typeof text !== 'string') return text ? String(text) : '';
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^(question\s*\d+[:\.\-\)]?\s*|q\d+[:\.\-\)]?\s*|\d+[\.\):\-–—]\s*)/i, '').trim();
  return cleaned || text;
}

/**
 * ROBUST MCQ ANSWER MATCHING
 * Compares student's selection against teacher's answer key with support for:
 * - Option letters ('A', 'B', 'C', 'D', 'E')
 * - Option indices (0, 1, 2, 3 or 1, 2, 3, 4)
 * - Exact text match
 * - Cleaned text match (without 'A.' prefixes)
 * - Cross-comparison between letter and option text if options array provided
 */
export function matchMcqAnswer(studentAns: any, correctAns: any, options?: any[], selectedOptionId?: string): boolean {
  const parseOptIdIdx = (id: any): number => {
    if (typeof id !== 'string') return -1;
    const m = id.trim().match(/^opt_(\d+)$/i);
    return m ? parseInt(m[1], 10) : -1;
  };
  const explicitSIdx = parseOptIdIdx(selectedOptionId);
  const hasExplicitSIdx = Array.isArray(options) && explicitSIdx >= 0 && explicitSIdx < options.length;

  if (!hasExplicitSIdx && (studentAns === undefined || studentAns === null || studentAns === '')) return false;
  if (correctAns === undefined || correctAns === null || correctAns === '') return false;

  const effectiveStudentAns = hasExplicitSIdx ? options![explicitSIdx] : studentAns;
  const sNorm = normalizeText(effectiveStudentAns);
  const cNorm = normalizeText(correctAns);

  // 1. Direct normalized match
  if (sNorm && cNorm && sNorm === cNorm) return true;

  // 2. Clean option letters like 'A)', 'A.', '(A)', 'Option A:'
  const cleanS = sNorm.replace(/^(option\s*)?([a-e])[\)\.\:\-\s]+/i, '$2').trim();
  const cleanC = cNorm.replace(/^(option\s*)?([a-e])[\)\.\:\-\s]+/i, '$2').trim();
  if (cleanS && cleanC && cleanS === cleanC) return true;

  // 3. Compare with options array if provided
  if (Array.isArray(options) && options.length > 0) {
    let sIdx = hasExplicitSIdx ? explicitSIdx : -1;
    let cIdx = -1;

    options.forEach((opt, idx) => {
      const optNorm = normalizeText(opt);
      const optClean = normalizeText(cleanOptionText(opt));

      if (sIdx === -1 && (sNorm === optNorm || sNorm === optClean || cleanS === optNorm || cleanS === optClean)) {
        sIdx = idx;
      }
      if (cNorm === optNorm || cNorm === optClean || cleanC === optNorm || cleanC === optClean) {
        cIdx = idx;
      }
    });

    // Check letter codes (A=0, B=1, C=2, D=3, E=4)
    if (sIdx === -1 && /^[a-e]$/i.test(cleanS)) {
      sIdx = cleanS.toLowerCase().charCodeAt(0) - 97;
    }
    if (cIdx === -1 && /^[a-e]$/i.test(cleanC)) {
      cIdx = cleanC.toLowerCase().charCodeAt(0) - 97;
    }

    // Check 0-based and 1-based numerical indices
    if (sIdx === -1 && /^\d+$/.test(cleanS)) {
      const num = parseInt(cleanS, 10);
      sIdx = (num >= 0 && num < options.length) ? num : (num >= 1 && num <= options.length ? num - 1 : -1);
    }
    if (cIdx === -1 && /^\d+$/.test(cleanC)) {
      const num = parseInt(cleanC, 10);
      cIdx = (num >= 0 && num < options.length) ? num : (num >= 1 && num <= options.length ? num - 1 : -1);
    }

    if (sIdx !== -1 && cIdx !== -1 && sIdx === cIdx) {
      return true;
    }

    // If student selected letter or index matching cIdx
    if (cIdx !== -1 && sIdx === cIdx) return true;

    // Direct match against option text
    if (cIdx !== -1 && (sNorm === normalizeText(options[cIdx]) || sNorm === normalizeText(cleanOptionText(options[cIdx])))) {
      return true;
    }
    if (sIdx !== -1 && (cNorm === normalizeText(options[sIdx]) || cNorm === normalizeText(cleanOptionText(options[sIdx])))) {
      return true;
    }
  }

  return false;
}

/**
 * ROBUST TRUE / FALSE ANSWER MATCHING
 */
export function matchTrueFalseAnswer(studentAns: any, correctAns: any): boolean {
  if (studentAns === undefined || studentAns === null || studentAns === '') return false;
  if (correctAns === undefined || correctAns === null || correctAns === '') return false;

  const sNorm = normalizeText(studentAns);
  const cNorm = normalizeText(correctAns);

  const isSTrue = ['true', 't', 'yes', 'y', 'a', '1', 'correct'].includes(sNorm);
  const isCTrue = ['true', 't', 'yes', 'y', 'a', '1', 'correct'].includes(cNorm);
  const isSFalse = ['false', 'f', 'no', 'n', 'b', '0', 'incorrect', 'wrong'].includes(sNorm);
  const isCFalse = ['false', 'f', 'no', 'n', 'b', '0', 'incorrect', 'wrong'].includes(cNorm);

  if (isSTrue && isCTrue) return true;
  if (isSFalse && isCFalse) return true;
  return sNorm === cNorm;
}

/**
 * ROBUST FILL-IN-THE-BLANK ANSWER MATCHING
 * Supports alternate answers separated by '/', '|', or 'or' (e.g. "Paris | City of Light")
 */
export function matchFillInBlank(studentAns: any, correctAns: any): boolean {
  if (studentAns === undefined || studentAns === null || studentAns === '') return false;
  if (correctAns === undefined || correctAns === null || correctAns === '') return false;

  const sNorm = normalizeText(studentAns);
  const cNorm = normalizeText(correctAns);

  if (!sNorm || !cNorm) return false;
  if (sNorm === cNorm) return true;

  // Split multiple acceptable answers
  const acceptable = String(correctAns)
    .split(/[/|,]|(?:\s+or\s+)/i)
    .map(p => normalizeText(p))
    .filter(Boolean);

  if (acceptable.includes(sNorm)) return true;

  return false;
}

/**
 * MATCH THE FOLLOWING EVALUATION
 */
export function evaluateMatchFollowing(
  expectedPairs: any[],
  studentAns: any,
  questionPoints: number
): {
  pointsAwarded: number;
  isCorrect: boolean | 'partial';
  feedback: string;
  explanation: string;
  correctPairs: number;
  totalPairs: number;
} {
  const pairs = Array.isArray(expectedPairs) ? expectedPairs : [];
  const totalPairs = pairs.length || 1;
  const studentMap: Record<string, string> =
    typeof studentAns === 'object' && studentAns !== null ? studentAns : {};

  let correctPairs = 0;
  for (const pair of pairs) {
    const leftKey = pair.left;
    const rightVal = pair.right;
    const sMatch = studentMap[leftKey];
    if (sMatch && normalizeText(sMatch) === normalizeText(rightVal)) {
      correctPairs++;
    }
  }

  const rawPoints = (correctPairs / totalPairs) * questionPoints;
  const pointsAwarded = Number(Math.min(questionPoints, Math.max(0, rawPoints)).toFixed(1));

  let isCorrect: boolean | 'partial' = false;
  let feedback = '';
  let explanation = '';

  if (correctPairs === totalPairs) {
    isCorrect = true;
    feedback = `Perfect! All ${totalPairs} pairs matched correctly.`;
    explanation = `Full marks (${pointsAwarded}/${questionPoints} marks).`;
  } else if (correctPairs > 0) {
    isCorrect = 'partial';
    feedback = `Partially correct (${correctPairs}/${totalPairs} pairs correct).`;
    explanation = `Scored ${pointsAwarded}/${questionPoints} marks for ${correctPairs} accurate matches.`;
  } else {
    isCorrect = false;
    feedback = 'Incorrect matching.';
    explanation = `None of the ${totalPairs} pairs were matched accurately. (0/${questionPoints} marks)`;
  }

  return { pointsAwarded, isCorrect, feedback, explanation, correctPairs, totalPairs };
}

/**
 * MULTI-BLANK ITEMS EVALUATION
 */
export function evaluateMultiBlankItems(
  blankItems: any[],
  studentAns: any,
  questionPoints: number
): {
  pointsAwarded: number;
  isCorrect: boolean | 'partial';
  subEvaluations: SubQuestionEvaluation[];
  feedback: string;
  explanation: string;
} {
  const items = Array.isArray(blankItems) ? blankItems : [];
  const subEvaluations: SubQuestionEvaluation[] = [];
  const studentBlankMap: Record<string, any> =
    typeof studentAns === 'object' && studentAns !== null ? studentAns : { default: studentAns };

  let totalBlankScore = 0;

  for (const bi of items) {
    const biPoints = Number(bi.points || (questionPoints / items.length).toFixed(1));
    const biAns = studentBlankMap[bi.id] || '';
    const isMatch = matchFillInBlank(biAns, bi.correctAnswer);

    const biScore = isMatch ? biPoints : 0;
    totalBlankScore += biScore;

    subEvaluations.push({
      subQuestionId: bi.id,
      label: bi.prefix ? `${bi.prefix} [ ___ ] ${bi.suffix || ''}` : `Blank #${subEvaluations.length + 1}`,
      questionText: `${bi.prefix || ''} [ ___ ] ${bi.suffix || ''}`,
      pointsAwarded: biScore,
      maxPoints: biPoints,
      isCorrect: isMatch,
      feedback: isMatch ? 'Correct word!' : (!biAns ? 'Blank left empty.' : 'Incorrect word.'),
      explanation: isMatch
        ? `Accurately answered "${biAns}".`
        : `Your answer: "${biAns || 'None'}". Expected: "${bi.correctAnswer}".`,
      studentAnswer: biAns,
      correctAnswer: bi.correctAnswer,
    });
  }

  const pointsAwarded = Number(Math.min(questionPoints, Math.max(0, totalBlankScore)).toFixed(1));
  let isCorrect: boolean | 'partial' = false;
  let feedback = '';
  let explanation = '';

  if (pointsAwarded >= questionPoints) {
    isCorrect = true;
    feedback = 'Perfect! All blanks filled accurately.';
    explanation = 'Full marks awarded across all blank sentences.';
  } else if (pointsAwarded > 0) {
    isCorrect = 'partial';
    feedback = `Partially correct (${pointsAwarded}/${questionPoints} marks).`;
    explanation = 'Some blanks were filled correctly while others were incorrect.';
  } else {
    isCorrect = false;
    feedback = 'Incorrect answers.';
    explanation = `None of the blanks matched the expected terms. (0/${questionPoints} marks)`;
  }

  return { pointsAwarded, isCorrect, subEvaluations, feedback, explanation };
}

/**
 * SUB-QUESTIONS (MULTI-PART / PICTURE SUB-QUESTIONS) EVALUATION
 */
export function evaluateSubQuestions(
  subQuestions: any[],
  studentAns: any,
  questionPoints: number,
  selectedSubOptionMap?: Record<string, string>
): {
  pointsAwarded: number;
  isCorrect: boolean | 'partial';
  subEvaluations: SubQuestionEvaluation[];
  feedback: string;
  explanation: string;
} {
  const sqList = Array.isArray(subQuestions) ? subQuestions : [];
  const subEvaluations: SubQuestionEvaluation[] = [];
  const studentSubMap: Record<string, any> =
    typeof studentAns === 'object' && studentAns !== null ? studentAns : { default: studentAns };

  let subScoreSum = 0;

  for (let sqIdx = 0; sqIdx < sqList.length; sqIdx++) {
    const sq = sqList[sqIdx];
    const sqKey = String(sq.id || `sq_${sqIdx}`);
    const sqPoints = Number(sq.points || (questionPoints / sqList.length).toFixed(1));
    let sqAns = studentSubMap[sq.id] || studentSubMap[sqKey] || studentSubMap[sq.label || ''] || '';
    const sqSelectedOptId = selectedSubOptionMap?.[sq.id] || selectedSubOptionMap?.[sqKey];

    if (sq.type === 'mcq' && Array.isArray(sq.options) && typeof sqSelectedOptId === 'string') {
      const m = sqSelectedOptId.trim().match(/^opt_(\d+)$/i);
      if (m) {
        const origIdx = parseInt(m[1], 10);
        if (origIdx >= 0 && origIdx < sq.options.length) {
          sqAns = sq.options[origIdx];
        }
      }
    }

    const sqAnsNorm = normalizeText(sqAns);
    const sqKeyNorm = normalizeText(sq.correctAnswer);

    let isMatch = false;
    if (sq.type === 'mcq' && Array.isArray(sq.options)) {
      isMatch = matchMcqAnswer(sqAns, sq.correctAnswer, sq.options, sqSelectedOptId);
    } else {
      isMatch = !!sqAnsNorm && !!sqKeyNorm && (sqAnsNorm === sqKeyNorm || sqKeyNorm.includes(sqAnsNorm));
    }

    const sqScore = isMatch ? sqPoints : 0;
    subScoreSum += sqScore;

    subEvaluations.push({
      subQuestionId: sq.id,
      label: sq.label,
      questionText: sq.questionText,
      pointsAwarded: sqScore,
      maxPoints: sqPoints,
      isCorrect: isMatch,
      feedback: isMatch ? 'Correct answer!' : (!sqAns ? 'No answer submitted.' : 'Incorrect answer.'),
      explanation: isMatch
        ? `Accurately identified "${sqAns}".`
        : `Your answer: "${sqAns || 'None'}". Expected: "${sq.correctAnswer}".`,
      studentAnswer: sqAns,
      selectedOptionId: sqSelectedOptId,
      correctAnswer: sq.correctAnswer,
    });
  }

  const pointsAwarded = Number(Math.min(questionPoints, Math.max(0, subScoreSum)).toFixed(1));
  let isCorrect: boolean | 'partial' = false;
  let feedback = '';
  let explanation = '';

  if (pointsAwarded >= questionPoints) {
    isCorrect = true;
    feedback = 'Excellent! All sub-questions answered accurately.';
    explanation = 'Full marks awarded across all parts.';
  } else if (pointsAwarded > 0) {
    isCorrect = 'partial';
    feedback = `Partially correct (${pointsAwarded}/${questionPoints} marks).`;
    explanation = 'Review the individual sub-question breakdowns.';
  } else {
    isCorrect = false;
    feedback = 'Incorrect answers.';
    explanation = `0/${questionPoints} marks awarded across parts.`;
  }

  return { pointsAwarded, isCorrect, subEvaluations, feedback, explanation };
}

/**
 * CANONICAL EVALUATION FOR A SINGLE QUESTION
 * Evaluates any QuestionItem against a student's answer deterministically.
 */
export function evaluateSingleQuestion(
  q: QuestionItem | any,
  studentAns: any,
  fallbackIndex?: number,
  selectedOptionId?: string,
  selectedSubOptionMap?: Record<string, string>
): QuestionEvaluation {
  const qPoints = Number(q.points || 1);
  const qType = q.type || 'question_answer';

  // Parse JSON properties if passed as raw DB strings
  let rawOptions: any[] = [];
  try {
    rawOptions = typeof q.options === 'string' ? JSON.parse(q.options) : (q.options || []);
  } catch {}

  let rawMatchingPairs: any[] = [];
  try {
    rawMatchingPairs = typeof q.matchingPairs === 'string'
      ? JSON.parse(q.matchingPairs)
      : typeof (q as any).matching_pairs === 'string'
      ? JSON.parse((q as any).matching_pairs)
      : (q.matchingPairs || (q as any).matching_pairs || []);
  } catch {}

  let rawBlankItems: any[] = [];
  try {
    rawBlankItems = typeof q.blankItems === 'string'
      ? JSON.parse(q.blankItems)
      : typeof (q as any).blank_items === 'string'
      ? JSON.parse((q as any).blank_items)
      : (q.blankItems || (q as any).blank_items || []);
  } catch {}

  let rawSubQuestions: any[] = [];
  try {
    rawSubQuestions = typeof q.subQuestions === 'string'
      ? JSON.parse(q.subQuestions)
      : typeof (q as any).sub_questions === 'string'
      ? JSON.parse((q as any).sub_questions)
      : (q.subQuestions || (q as any).sub_questions || []);
  } catch {}

  // If an explicit permanent optionId ('opt_0', 'opt_1', ...) was submitted for an MCQ, resolve canonical text cleanly
  let resolvedStudentAns = studentAns;
  let resolvedSelectedOptionId = selectedOptionId;
  if (
    (qType === 'mcq' || (qType === 'picture_question' && rawSubQuestions.length === 0 && rawOptions.length > 0)) &&
    typeof selectedOptionId === 'string'
  ) {
    const m = selectedOptionId.trim().match(/^opt_(\d+)$/i);
    if (m) {
      const origIdx = parseInt(m[1], 10);
      if (origIdx >= 0 && origIdx < rawOptions.length) {
        resolvedStudentAns = rawOptions[origIdx];
        resolvedSelectedOptionId = `opt_${origIdx}`;
      }
    }
  }

  const isEmpty =
    resolvedStudentAns === undefined ||
    resolvedStudentAns === null ||
    resolvedStudentAns === '' ||
    (typeof resolvedStudentAns === 'object' && Object.keys(resolvedStudentAns).length === 0);

  let pointsAwarded = 0;
  let isCorrect: boolean | 'partial' = false;
  let feedback = '';
  let explanation = '';
  let subEvaluations: SubQuestionEvaluation[] | undefined = undefined;

  if (isEmpty) {
    pointsAwarded = 0;
    isCorrect = false;
    feedback = 'No answer was submitted for this question.';
    explanation = q.correctAnswer || (q as any).correct_answer
      ? `Expected correct answer: "${q.correctAnswer || (q as any).correct_answer}". (0/${qPoints} marks)`
      : 'No response submitted.';
    if (qType === 'fill_blanks' && rawBlankItems.length > 0) {
      const res = evaluateMultiBlankItems(rawBlankItems, {}, qPoints);
      subEvaluations = res.subEvaluations;
    } else if (rawSubQuestions.length > 0) {
      const res = evaluateSubQuestions(rawSubQuestions, {}, qPoints, selectedSubOptionMap);
      subEvaluations = res.subEvaluations;
    }
  } else if (qType === 'mcq' || (qType === 'picture_question' && rawSubQuestions.length === 0 && rawOptions.length > 0)) {
    const isMatch = matchMcqAnswer(
      resolvedStudentAns,
      q.correctAnswer || (q as any).correct_answer,
      rawOptions,
      resolvedSelectedOptionId
    );
    if (isMatch) {
      pointsAwarded = qPoints;
      isCorrect = true;
      feedback = 'Correct! Full marks awarded.';
      explanation = `Accurately identified "${resolvedStudentAns}". (${qPoints}/${qPoints} marks)`;
    } else {
      pointsAwarded = 0;
      isCorrect = false;
      feedback = 'Incorrect option selected.';
      explanation = `You selected "${resolvedStudentAns}". Correct answer is "${q.correctAnswer || (q as any).correct_answer}". (0/${qPoints} marks)`;
    }
  } else if (qType === 'true_false') {
    const isMatch = matchTrueFalseAnswer(studentAns, q.correctAnswer || (q as any).correct_answer);
    if (isMatch) {
      pointsAwarded = qPoints;
      isCorrect = true;
      feedback = 'Correct statement evaluation.';
      explanation = `Accurately answered "${studentAns}". (${qPoints}/${qPoints} marks)`;
    } else {
      pointsAwarded = 0;
      isCorrect = false;
      feedback = 'Incorrect statement evaluation.';
      explanation = `You marked "${studentAns}". Correct answer is "${q.correctAnswer || (q as any).correct_answer}". (0/${qPoints} marks)`;
    }
  } else if (qType === 'match_following' || qType === 'match_the_following') {
    const res = evaluateMatchFollowing(rawMatchingPairs, studentAns, qPoints);
    pointsAwarded = res.pointsAwarded;
    isCorrect = res.isCorrect;
    feedback = res.feedback;
    explanation = res.explanation;
  } else if (qType === 'fill_blanks' || qType === 'fill_in_the_blank') {
    if (rawBlankItems.length > 0) {
      const res = evaluateMultiBlankItems(rawBlankItems, studentAns, qPoints);
      pointsAwarded = res.pointsAwarded;
      isCorrect = res.isCorrect;
      subEvaluations = res.subEvaluations;
      feedback = res.feedback;
      explanation = res.explanation;
    } else {
      const isMatch = matchFillInBlank(studentAns, q.correctAnswer || (q as any).correct_answer);
      if (isMatch) {
        pointsAwarded = qPoints;
        isCorrect = true;
        feedback = 'Correct blank completion!';
        explanation = `Accurately filled with "${studentAns}". (${qPoints}/${qPoints} marks)`;
      } else {
        pointsAwarded = 0;
        isCorrect = false;
        feedback = 'Incorrect word entered.';
        explanation = `Your answer: "${studentAns}". Expected: "${q.correctAnswer || (q as any).correct_answer}". (0/${qPoints} marks)`;
      }
    }
  } else if (rawSubQuestions.length > 0) {
    const res = evaluateSubQuestions(rawSubQuestions, resolvedStudentAns, qPoints, selectedSubOptionMap);
    pointsAwarded = res.pointsAwarded;
    isCorrect = res.isCorrect;
    subEvaluations = res.subEvaluations;
    feedback = res.feedback;
    explanation = res.explanation;
  } else {
    // Descriptive / Question Answer / Picture Question (text answer)
    const sNorm = normalizeText(resolvedStudentAns);
    const cNorm = normalizeText(q.correctAnswer || (q as any).correct_answer);

    if (sNorm === cNorm) {
      pointsAwarded = qPoints;
      isCorrect = true;
      feedback = 'Correct answer!';
      explanation = `Exact match with teacher solution. (${qPoints}/${qPoints} marks)`;
    } else {
      // Keyword matching check
      const keywords = cNorm.split(/\W+/).filter(w => w.length > 3);
      let matchedCount = 0;
      for (const kw of keywords) {
        if (sNorm.includes(kw)) matchedCount++;
      }
      const matchRatio = keywords.length > 0 ? (matchedCount / keywords.length) : 0;

      if (matchRatio >= 0.7) {
        pointsAwarded = qPoints;
        isCorrect = true;
        feedback = 'Very good! Clear explanation covering the key concepts.';
        explanation = `Covered core requirements (${qPoints}/${qPoints} marks).`;
      } else if (matchRatio >= 0.35) {
        pointsAwarded = Number((qPoints * 0.5).toFixed(1));
        isCorrect = 'partial';
        feedback = 'Partially correct explanation.';
        explanation = `Covered some key points. Model answer: "${q.correctAnswer || (q as any).correct_answer}".`;
      } else {
        pointsAwarded = 0;
        isCorrect = false;
        feedback = 'Incorrect or insufficient explanation.';
        explanation = `Did not cover the required concepts. Expected: "${q.correctAnswer || (q as any).correct_answer}". (0/${qPoints} marks)`;
      }
    }
  }

  return {
    questionId: q.id || (fallbackIndex !== undefined ? `q_${fallbackIndex}` : 'unknown'),
    questionText: q.questionText || (q as any).question_text || '',
    type: qType,
    imageUrl: q.imageUrl || (q as any).image_url,
    options: rawOptions,
    matchingPairs: rawMatchingPairs.length > 0 ? rawMatchingPairs : undefined,
    blankItems: rawBlankItems.length > 0 ? rawBlankItems : undefined,
    blankTemplate: q.blankTemplate || (q as any).blank_template || undefined,
    pointsAwarded: Number(pointsAwarded.toFixed(1)),
    maxPoints: qPoints,
    isCorrect,
    feedback,
    explanation,
    studentAnswer: resolvedStudentAns,
    selectedOptionId: resolvedSelectedOptionId,
    correctAnswer: q.correctAnswer || (q as any).correct_answer || '',
    gradingRubric: q.gradingRubric || (q as any).grading_rubric,
    subEvaluations,
  };
}

/**
 * CALCULATE TOTAL QUIZ SCORE & PERCENTAGE & GRADE
 * Single reliable source of truth for computing aggregate scores.
 */
export function calculateQuizScore(questions: QuestionEvaluation[]): {
  totalScore: number;
  maxScore: number;
  percentage: number;
  gradeLetter: string;
} {
  let totalScore = 0;
  let maxScore = 0;

  for (const q of questions) {
    const maxPts = Number(q.maxPoints || 1);
    const awardedPts = Number(q.pointsAwarded || 0);
    // Guarantee awarded points never exceed max points and never fall below 0
    const clampedAwarded = Math.min(maxPts, Math.max(0, awardedPts));
    totalScore += clampedAwarded;
    maxScore += maxPts;
  }

  const roundedTotal = Number(totalScore.toFixed(1));
  const roundedMax = Number(maxScore.toFixed(1));
  const percentage = roundedMax > 0 ? Math.round((roundedTotal / roundedMax) * 100) : 0;
  const gradeLetter = calcGradeLetter(percentage);

  return {
    totalScore: roundedTotal,
    maxScore: roundedMax,
    percentage,
    gradeLetter,
  };
}

/**
 * COMPLETE DETERMINISTIC QUIZ EVALUATION (OFFLINE & FALLBACK & SERVER VERIFIER)
 */
export function evaluateEntireQuiz(
  quiz: any,
  questions: any[],
  studentAnswers: Record<string, any>,
  studentMeta: {
    submissionId?: string;
    studentId: string;
    studentName: string;
    studentRoll?: string;
    classId?: string;
    quizTitle?: string;
    subject?: string;
  }
): QuizEvaluationReport {
  const evaluatedQuestions: QuestionEvaluation[] = [];

  for (const q of questions) {
    const sAns = studentAnswers ? studentAnswers[q.id] : undefined;
    evaluatedQuestions.push(evaluateSingleQuestion(q, sAns));
  }

  const { totalScore, maxScore, percentage, gradeLetter } = calculateQuizScore(evaluatedQuestions);

  return {
    submissionId: studentMeta.submissionId || `sub-${Date.now()}`,
    quizId: quiz.id,
    quizTitle: studentMeta.quizTitle || quiz.title || 'Assessment',
    studentName: studentMeta.studentName,
    studentRoll: studentMeta.studentRoll || '-',
    studentId: studentMeta.studentId,
    classId: studentMeta.classId || quiz.classId || quiz.class_id || '',
    subject: studentMeta.subject || quiz.subject || 'General',
    submittedAt: new Date().toISOString(),
    totalScore,
    maxScore,
    percentage,
    gradeLetter,
    overallFeedback: `Assessment score: ${totalScore}/${maxScore} (${percentage}%). Grade: ${gradeLetter}.`,
    strengths: [
      'Active participation and completion of assessment questions',
      'Solid command of fundamental subject terms and concepts',
      'Clear attempt across multiple question formats',
    ],
    improvements: [
      'Review detailed explanations for partial or incorrect items',
      'Ensure exact answers for objective and sub-question formats',
    ],
    questions: evaluatedQuestions,
  };
}

/**
 * Checks whether a single answer value counts as answered/non-empty.
 */
export function isQuestionAnswerProvided(val: any, selectedOptionId?: string, selectedSubOptionMap?: Record<string, string>): boolean {
  if (typeof selectedOptionId === 'string' && selectedOptionId.trim() !== '') {
    return true;
  }
  if (selectedSubOptionMap && typeof selectedSubOptionMap === 'object') {
    if (Object.values(selectedSubOptionMap).some((v) => typeof v === 'string' && v.trim() !== '')) {
      return true;
    }
  }
  if (val === undefined || val === null || val === '') return false;
  if (typeof val === 'object') {
    return Object.values(val).some((v) => v !== undefined && v !== null && String(v).trim() !== '');
  }
  return String(val).trim() !== '';
}

/**
 * Counts how many questions currently have an answer in a draft/submission answer map.
 */
export function countAnsweredQuestions(
  questions: readonly any[],
  rawAnswers: Record<string, any> | null | undefined
): number {
  const qList = Array.isArray(questions) ? questions : [];
  if (qList.length === 0 || !rawAnswers || typeof rawAnswers !== 'object') return 0;

  const optSelections: Record<string, string> =
    rawAnswers.__optionSelections && typeof rawAnswers.__optionSelections === 'object'
      ? rawAnswers.__optionSelections
      : {};
  const subOptSelections: Record<string, Record<string, string>> =
    rawAnswers.__subOptionSelections && typeof rawAnswers.__subOptionSelections === 'object'
      ? rawAnswers.__subOptionSelections
      : {};

  let count = 0;
  for (let i = 0; i < qList.length; i++) {
    const q = qList[i];
    const qId = String(q?.id || q?.questionId || `q_${i}`);
    if (isQuestionAnswerProvided(rawAnswers[qId], optSelections[qId], subOptSelections[qId])) {
      count++;
    }
  }
  return count;
}

/**
 * LIVE ATTEMPT SCORE & PROGRESS RECALCULATION
 * Deterministically evaluates all questions from the student's current answers snapshot
 * so changing or removing answers immediately recalculates without double-counting.
 */
export function evaluateLiveAttemptProgress(
  questions: readonly any[],
  rawDraftAnswers: Record<string, any> | null | undefined
): {
  liveScore: number;
  maxScore: number;
  answeredCount: number;
  totalQuestions: number;
  progressPercentage: number;
} {
  const qList = Array.isArray(questions) ? questions : [];
  const totalQuestions = qList.length;
  if (totalQuestions === 0) {
    return {
      liveScore: 0,
      maxScore: 0,
      answeredCount: 0,
      totalQuestions: 0,
      progressPercentage: 0,
    };
  }

  const draft = rawDraftAnswers && typeof rawDraftAnswers === 'object' ? rawDraftAnswers : {};
  const optSelections: Record<string, string> =
    draft.__optionSelections && typeof draft.__optionSelections === 'object'
      ? draft.__optionSelections
      : {};
  const subOptSelections: Record<string, Record<string, string>> =
    draft.__subOptionSelections && typeof draft.__subOptionSelections === 'object'
      ? draft.__subOptionSelections
      : {};

  const evaluatedQuestions: QuestionEvaluation[] = [];
  let answeredCount = 0;

  for (let i = 0; i < qList.length; i++) {
    const q = qList[i];
    const qId = String(q?.id || `q_${i}`);
    const ans = draft[qId];
    const optId = optSelections[qId];
    const subOptMap = subOptSelections[qId];

    if (isQuestionAnswerProvided(ans, optId, subOptMap)) {
      answeredCount++;
    }

    evaluatedQuestions.push(evaluateSingleQuestion(q, ans, i, optId, subOptMap));
  }

  const { totalScore, maxScore } = calculateQuizScore(evaluatedQuestions);
  const progressPercentage = totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0;

  return {
    liveScore: totalScore,
    maxScore,
    answeredCount,
    totalQuestions,
    progressPercentage,
  };
}

