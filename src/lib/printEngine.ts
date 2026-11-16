/**
 * Academic Examination & Assessment Board Print Engine
 * Provides standardized, canonical HTML generation for student evaluated answer sheets.
 * Works symmetrically in both Node.js server endpoints and browser client components.
 */

import {
  cleanOptionText,
  cleanQuestionPrompt,
  calcGradeLetter,
  calculateQuizScore,
  evaluateSingleQuestion,
} from './scoringEngine.js';

export { cleanOptionText, cleanQuestionPrompt, calcGradeLetter, calculateQuizScore, evaluateSingleQuestion };

export interface PrintAnswerSheetOptions {
  schoolName?: string;
  paperStyle?: 'classic' | 'twocolumn' | 'modern';
  penColor?: 'red' | 'green' | 'blue';
  showKeyForWrong?: boolean;
  fontSize?: 'compact' | 'normal' | 'large';
  pageSize?: number;
}

export interface MatchFollowingParsedData {
  isMatch: boolean;
  pairs: Array<{ left: string; right: string }>;
  studentMap: Record<string, string>;
}

// Safely escape HTML characters
export function escapeHtml(str: any): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Check if an option was selected by student
export function isOptionSelected(userAns: any, optionText: string, optIndex: number, selectedOptionId?: string): boolean {
  if (typeof selectedOptionId === 'string' && selectedOptionId.trim()) {
    const m = selectedOptionId.trim().match(/^opt_(\d+)$/i);
    if (m) {
      return parseInt(m[1], 10) === optIndex;
    }
  }
  if (userAns === undefined || userAns === null) return false;
  const u = String(userAns).trim().toLowerCase();
  const o = String(optionText).trim().toLowerCase();
  const oClean = cleanOptionText(optionText).trim().toLowerCase();
  const letter = String.fromCharCode(65 + optIndex).toLowerCase(); // 'a', 'b', 'c', 'd'
  
  if (u === o || (oClean && u === oClean)) return true;
  if (u === letter) return true;
  if (u === `option ${letter}`) return true;
  if (u === `(${letter})`) return true;
  if (u.startsWith(`${letter}.`) || u.startsWith(`${letter})`)) return true;
  if (u === String(optIndex)) return true;
  return false;
}

// Check if an option is the correct answer key
export function isOptionCorrectKey(correctAns: any, optionText: string, optIndex: number): boolean {
  if (correctAns === undefined || correctAns === null) return false;
  const c = String(correctAns).trim().toLowerCase();
  const o = String(optionText).trim().toLowerCase();
  const oClean = cleanOptionText(optionText).trim().toLowerCase();
  const letter = String.fromCharCode(65 + optIndex).toLowerCase(); // 'a', 'b', 'c', 'd'
  
  if (c === o || (oClean && c === oClean)) return true;
  if (c === letter) return true;
  if (c === `option ${letter}`) return true;
  if (c === `(${letter})`) return true;
  if (c.startsWith(`${letter}.`) || c.startsWith(`${letter})`)) return true;
  if (c === String(optIndex)) return true;
  return false;
}

// Bulletproof Roll Number resolution: strictly returns real numeric roll (e.g. "1", "2B", "15") and NEVER internal ID or username
export function resolveStudentRollNo(roll?: string | null, id?: string | null): string {
  const r = (roll || '').trim();
  const rawId = (id || '').trim().toLowerCase();
  if (!r || r === '-' || r.toLowerCase() === 'n/a' || r.toLowerCase() === 'undefined' || r.toLowerCase() === 'null') {
    return '-';
  }
  const lowerR = r.toLowerCase();
  if (lowerR === rawId || lowerR.startsWith('student-') || lowerR.startsWith('admin_') || lowerR.startsWith('sub-')) {
    return '-';
  }
  if (/^[0-9]+[a-zA-Z]?$/.test(r)) {
    return r;
  }
  const match = r.match(/\b([0-9]+[a-zA-Z]?)\b/);
  if (match && !lowerR.includes('student-')) {
    return match[1];
  }
  return '-';
}

export function parseMatchFollowingQuestion(q: any): MatchFollowingParsedData {
  const isTypeMatch = q.type === 'match_following' || q.type === 'match' || q.type === 'matching' || q.type === 'match_the_following';
  const isTitleMatch = typeof q.questionText === 'string' && /match\s+(the\s+)?following/i.test(q.questionText);

  // 1. Extract student answer map
  let studentMap: Record<string, string> = {};
  if (typeof q.studentAnswer === 'object' && q.studentAnswer !== null && !Array.isArray(q.studentAnswer)) {
    studentMap = q.studentAnswer;
  } else if (typeof q.studentAnswer === 'string' && q.studentAnswer.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(q.studentAnswer);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        studentMap = parsed;
      }
    } catch {}
  }

  // 2. Extract existing matchingPairs if any
  let pairs: Array<{ left: string; right: string }> = [];
  if (Array.isArray(q.matchingPairs) && q.matchingPairs.length > 0) {
    pairs = q.matchingPairs.map((p: any) => ({ left: String(p.left || ''), right: String(p.right || '') }));
  } else if (Array.isArray(q.matching_pairs) && q.matching_pairs.length > 0) {
    pairs = q.matching_pairs.map((p: any) => ({ left: String(p.left || ''), right: String(p.right || '') }));
  }

  // 3. Extract correct answer key map (e.g. "Hardware -> Physical..., Software -> ...")
  const keyMap: Record<string, string> = {};
  if (typeof q.correctAnswer === 'string' && (q.correctAnswer.includes('->') || q.correctAnswer.includes(':'))) {
    const rawSegments = q.correctAnswer.split(/[,;\n]+/).map((s: string) => s.trim()).filter(Boolean);
    for (const seg of rawSegments) {
      const parts = seg.split(/\s*(?:->|:)\s*/);
      if (parts.length >= 2) {
        const leftKey = parts[0].replace(/^["']|["']$/g, '').trim();
        const rightVal = parts.slice(1).join(' -> ').replace(/^["']|["']$/g, '').trim();
        if (leftKey && rightVal) {
          keyMap[leftKey.toLowerCase()] = rightVal;
          keyMap[leftKey] = rightVal;
        }
      }
    }
  } else if (typeof q.correctAnswer === 'object' && q.correctAnswer !== null && !Array.isArray(q.correctAnswer)) {
    Object.entries(q.correctAnswer).forEach(([k, v]) => {
      keyMap[k.toLowerCase()] = String(v);
      keyMap[k] = String(v);
    });
  }

  // 4. If pairs is empty, construct pairs from studentMap & keyMap
  const studentKeys = Object.keys(studentMap);
  if (pairs.length === 0 && studentKeys.length > 0) {
    pairs = studentKeys.map(k => ({
      left: k,
      right: keyMap[k] || keyMap[k.toLowerCase()] || '(Expected Match)'
    }));
  } else if (pairs.length === 0 && Object.keys(keyMap).length > 0) {
    pairs = Object.entries(keyMap).filter(([k]) => k.length > 0).map(([k, v]) => ({ left: k, right: v }));
  }

  // Deduplicate and filter empty pairs
  const cleanPairs = pairs.filter(p => p && (p.left || p.right));
  const isMatch = isTypeMatch || isTitleMatch || (cleanPairs.length > 0 && studentKeys.length > 0) || (studentKeys.length > 1);

  return { isMatch, pairs: cleanPairs, studentMap };
}

// Natural, deterministic student sorting comparator for printing (supports both camelCase and SQL snake_case rows)
export function compareSubmissionsForPrint(a: any, b: any): number {
  const rawRollA = a?.studentRoll ?? a?.student_roll ?? '';
  const rawIdA = a?.studentId ?? a?.student_id ?? '';
  const rawRollB = b?.studentRoll ?? b?.student_roll ?? '';
  const rawIdB = b?.studentId ?? b?.student_id ?? '';

  const rollA = resolveStudentRollNo(rawRollA, rawIdA);
  const rollB = resolveStudentRollNo(rawRollB, rawIdB);

  const numMatchA = rollA.match(/^(\d+)([a-zA-Z]*)/);
  const numMatchB = rollB.match(/^(\d+)([a-zA-Z]*)/);

  if (numMatchA && numMatchB) {
    const numA = parseInt(numMatchA[1], 10);
    const numB = parseInt(numMatchB[1], 10);
    if (numA !== numB) {
      return numA - numB;
    }
    const suffixA = (numMatchA[2] || '').toLowerCase();
    const suffixB = (numMatchB[2] || '').toLowerCase();
    if (suffixA !== suffixB) {
      return suffixA.localeCompare(suffixB);
    }
  } else if (numMatchA && !numMatchB) {
    return -1;
  } else if (!numMatchA && numMatchB) {
    return 1;
  } else if (rollA !== '-' && rollB !== '-') {
    const cmp = rollA.localeCompare(rollB, undefined, { numeric: true, sensitivity: 'base' });
    if (cmp !== 0) return cmp;
  }

  const nameA = String(a?.studentName ?? a?.student_name ?? '').toLowerCase().trim();
  const nameB = String(b?.studentName ?? b?.student_name ?? '').toLowerCase().trim();
  const nameCmp = nameA.localeCompare(nameB);
  if (nameCmp !== 0) return nameCmp;

  const timeA = new Date(a?.submittedAt ?? a?.submitted_at ?? 0).getTime() || 0;
  const timeB = new Date(b?.submittedAt ?? b?.submitted_at ?? 0).getTime() || 0;
  return timeA - timeB;
}

/**
 * CORE CANONICAL STUDENT ANSWER PAPER RENDERER
 * Generates the complete HTML pages bundle for a single student.
 * Used identically for both single-student printing and batch printing.
 */
export function renderStudentAnswerPagesHtml(
  evaluation: any,
  submission: any,
  className: string,
  options: PrintAnswerSheetOptions = {},
  studentIndex: number = 0,
  totalStudentsInBatch: number = 1
): string {
  const {
    schoolName = 'ACADEMIC EVALUATION & ASSESSMENT BOARD',
    paperStyle = 'twocolumn',
    penColor = 'red',
    showKeyForWrong = false,
    fontSize = 'normal',
    pageSize: customPageSize = 0,
  } = options;

  const percentage = evaluation.maxScore > 0 ? Math.round((evaluation.totalScore / evaluation.maxScore) * 100) : 0;
  
  const correctCount = (evaluation.questions || []).filter((q: any) => {
    const maxPts = Number(q.maxPoints || 1);
    const awardedPts = Number(q.pointsAwarded || 0);
    return (q.isCorrect as any) === true || (q.isCorrect as any) === 'true' || awardedPts >= maxPts;
  }).length;

  const totalQuestions = (evaluation.questions || []).length;
  const wrongCount = totalQuestions - correctCount;

  // Resolve authentic student roll number
  const rawRoll = (submission.studentRoll || submission.rollNo || evaluation.studentRoll || '').trim();
  const rawId = (submission.studentId || evaluation.studentId || '').trim();
  const cleanStudentRoll = resolveStudentRollNo(rawRoll, rawId);

  // Teacher pen color palette
  const primaryPenColor = '#e11d48';

  // Base typography sizing
  const baseFontSize = fontSize === 'compact' ? '9.5px' : fontSize === 'large' ? '11.5px' : '10.5px';

  // Intelligent question weight calculator for smart auto-fit and pagination
  const getQuestionWeight = (q: any): number => {
    const rawImg = q.imageUrl || q.image || q.figureUrl || q.diagramUrl;
    const hasImg = typeof rawImg === 'string' && rawImg.trim().length > 0;
    if (Array.isArray(q.subEvaluations) && q.subEvaluations.length > 0) {
      return 1.1 + (q.subEvaluations.length * 0.5) + (hasImg ? 0.5 : 0);
    }
    const md = parseMatchFollowingQuestion(q);
    if (md.isMatch && md.pairs.length > 0) {
      return 1.2 + (md.pairs.length * 0.35);
    }
    if (Array.isArray(q.options) && q.options.length > 0) {
      return hasImg ? 1.4 : 1.0;
    }
    return hasImg ? 1.4 : 1.0;
  };

  const questionList = evaluation.questions || [];
  const isTwoCol = paperStyle !== 'classic';

  const renderQuestionCard = (q: any, globalIdx: number) => {
    const studentAns = typeof q.studentAnswer === 'object' && q.studentAnswer !== null
      ? JSON.stringify(q.studentAnswer)
      : String(q.studentAnswer ?? '(No response)');

    const maxPts = Number(q.maxPoints || 1);
    const awardedPts = Number(q.pointsAwarded || 0);
    const isCorrect = (q.isCorrect as any) === true || (q.isCorrect as any) === 'true' || awardedPts >= maxPts;
    const isPartial = (q.isCorrect as any) === 'partial' || (awardedPts > 0 && awardedPts < maxPts);

    const markBadge = `
      <span style="display: inline-flex; align-items: center; gap: 3px; padding: 2px 7px; border-radius: 4px; font-size: 10px; font-weight: 800; white-space: nowrap; border: 1.5px solid ${
        isCorrect
          ? '#86efac; background: #f0fdf4; color: #166534;'
          : isPartial
          ? '#fde68a; background: #fefce8; color: #92400e;'
          : '#fca5a5; background: #fff1f2; color: #991b1b;'
      }">
        ${isCorrect ? '✓ ' : isPartial ? '◒ ' : '✗ '}[ ${awardedPts}/${maxPts} ]
      </span>
    `;

    const rawImg = q.imageUrl || q.image || q.figureUrl || q.diagramUrl;
    const imgUrl = typeof rawImg === 'string' && rawImg.trim().length > 0 ? rawImg.trim() : undefined;

    let bodyHtml = '';

    if (Array.isArray(q.options) && q.options.length > 0) {
      const optionsItems = q.options.map((opt: any, optIdx: number) => {
        const optLetter = String.fromCharCode(65 + optIdx);
        const cleanOpt = cleanOptionText(opt);
        const isStudent = isOptionSelected(q.studentAnswer, opt, optIdx, q.selectedOptionId);
        const isKey = isOptionCorrectKey(q.correctAnswer, opt, optIdx);
        const optImg = (q.optionImages && q.optionImages[optIdx]) || (typeof opt === 'string' && (opt.startsWith('http://') || opt.startsWith('https://') || opt.startsWith('data:image/')) ? opt : null);
        const optImgHtml = optImg ? `<img src="${escapeHtml(optImg)}" alt="Opt ${optLetter}" style="max-height: 22px; max-width: 45px; object-fit: contain; border: 1px solid #cbd5e1; border-radius: 3px; vertical-align: middle; margin-left: 3px; display: inline-block;" referrerpolicy="no-referrer" />` : '';

        if (isStudent && isKey) {
          return `
            <div style="border: 1.5px solid #86efac; background: #dcfce7; border-radius: 6px; padding: 4px 7px; min-height: 28px; display: flex; align-items: center; justify-content: space-between; gap: 5px; min-width: 0;">
              <div style="display: flex; align-items: center; gap: 6px; min-width: 0; flex: 1;">
                <span style="width: 20px; height: 20px; border-radius: 50%; background: #bbf7d0; color: #14532d; display: inline-flex; align-items: center; justify-content: center; font-size: 10.5px; font-weight: 900; flex-shrink: 0;">${optLetter}</span>
                <span style="font-weight: 700; font-size: 11px; color: #0f172a; word-break: break-word; overflow-wrap: break-word; white-space: normal; line-height: 1.3;">
                  ${escapeHtml(cleanOpt)}
                </span>
                ${optImgHtml}
              </div>
              <span style="color: #15803d; font-size: 13.5px; font-weight: 900; margin-left: 3px; flex-shrink: 0;">✓</span>
            </div>
          `;
        } else if (isStudent && !isKey) {
          return `
            <div style="border: 1.5px solid #fca5a5; background: #fee2e2; border-radius: 6px; padding: 4px 7px; min-height: 28px; display: flex; align-items: center; justify-content: space-between; gap: 5px; min-width: 0;">
              <div style="display: flex; align-items: center; gap: 6px; min-width: 0; flex: 1;">
                <span style="width: 20px; height: 20px; border-radius: 50%; background: #fecdd3; color: #881337; display: inline-flex; align-items: center; justify-content: center; font-size: 10.5px; font-weight: 900; flex-shrink: 0;">${optLetter}</span>
                <span style="font-weight: 700; font-size: 11px; color: #0f172a; word-break: break-word; overflow-wrap: break-word; white-space: normal; line-height: 1.3;">
                  ${escapeHtml(cleanOpt)}
                </span>
                ${optImgHtml}
              </div>
              <span style="color: #dc2626; font-size: 13.5px; font-weight: 900; margin-left: 3px; flex-shrink: 0;">✕</span>
            </div>
          `;
        } else {
          return `
            <div style="border: 1.2px solid #cbd5e1; background: #ffffff; border-radius: 6px; padding: 4px 7px; min-height: 28px; display: flex; align-items: center; gap: 6px; min-width: 0;">
              <span style="width: 20px; height: 20px; border-radius: 50%; background: #e0e7ff; color: #1e3a8a; display: inline-flex; align-items: center; justify-content: center; font-size: 10.5px; font-weight: 900; flex-shrink: 0;">${optLetter}</span>
              <span style="font-size: 11px; font-weight: 600; color: #1e293b; word-break: break-word; overflow-wrap: break-word; white-space: normal; line-height: 1.3;">
                ${escapeHtml(cleanOpt)}
              </span>
              ${optImgHtml}
            </div>
          `;
        }
      }).join('');

      const maxOptLen = Math.max(...q.options.map((o: any) => String(o || '').length));
      const optGridCols = (paperStyle === 'twocolumn' && maxOptLen > 24) || maxOptLen > 35 ? '1fr' : 'repeat(2, minmax(0, 1fr))';

      if (imgUrl) {
        bodyHtml = `
          <div style="display: flex; gap: 8px; align-items: stretch; margin-top: 4px; width: 100%;">
            <div style="width: 38%; flex-shrink: 0; min-height: 60px; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #ffffff; border: 1.2px solid #cbd5e1; border-radius: 5px; padding: 4px; box-sizing: border-box;">
              <img src="${escapeHtml(imgUrl)}" alt="Figure Q${globalIdx + 1}" style="max-height: 75px; max-width: 100%; object-fit: contain; border-radius: 4px; background: #ffffff; display: block; margin: 0 auto; -webkit-print-color-adjust: exact; print-color-adjust: exact;" referrerpolicy="no-referrer" loading="eager" />
            </div>
            <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: space-between; gap: 3px;">
              ${optionsItems}
            </div>
          </div>
        `;
      } else {
        bodyHtml = `
          <div style="display: grid; grid-template-columns: ${optGridCols}; gap: 3px 6px; margin-top: 3px; width: 100%;">
            ${optionsItems}
          </div>
        `;
      }
    } else if (Array.isArray(q.subEvaluations) && q.subEvaluations.length > 0) {
      const subItemsHtml = q.subEvaluations.map((se: any, seIdx: number) => {
        const seAwarded = Number(se.pointsAwarded || 0);
        const seMax = Number(se.maxPoints || 1);
        const seIsCorr = se.isCorrect === true || se.isCorrect === 'true' || (seMax > 0 && seAwarded >= seMax);
        const seAnsStr = typeof se.studentAnswer === 'object' && se.studentAnswer !== null ? JSON.stringify(se.studentAnswer) : String(se.studentAnswer || '(No response)');

        return `
          <div style="padding: 4px 7px; border-radius: 4px; border: 1px solid ${seIsCorr ? '#a7f3d0' : '#fecdd3'}; background: ${seIsCorr ? '#f0fdf4' : '#fff1f2'}; font-size: 11px; margin-top: 2px;">
            <div style="display: flex; justify-content: space-between; align-items: center; gap: 3px; margin-bottom: 2px;">
              <strong style="color: #0f172a; font-size: 8.5px;">Part (${String.fromCharCode(97 + seIdx)})${se.label ? `: ${escapeHtml(se.label)}` : ''}</strong>
              <span style="font-weight: 800; font-size: 7.5px; padding: 1px 4px; border-radius: 3px; ${seIsCorr ? 'background: #10b981; color: #ffffff;' : 'background: #f43f5e; color: #ffffff;'}">
                ${seIsCorr ? '✓ ' : '✕ '}${seAwarded}/${seMax} pts
              </span>
            </div>
            ${se.questionText ? `<div style="color: #475569; font-size: 8.5px; font-style: italic; margin-bottom: 2px; word-break: break-word;">${escapeHtml(se.questionText)}</div>` : ''}
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px;">
              <div style="min-width: 0; flex: 1;"><span style="font-weight: 700; color: ${seIsCorr ? '#065f46' : '#9f1239'};">Student:</span> <span style="word-break: break-word;">"${escapeHtml(seAnsStr)}"</span></div>
              <span style="font-weight: 900; font-size: 12px; line-height: 1; flex-shrink: 0; color: ${seIsCorr ? '#15803d' : '#dc2626'};">${seIsCorr ? '✓' : '✕'}</span>
            </div>
          </div>
        `;
      }).join('');

      const subFig = imgUrl ? `
        <div style="margin: 2px 0; text-align: center;">
          <img src="${escapeHtml(imgUrl)}" alt="Figure Q${globalIdx + 1}" style="max-height: 65px; max-width: 100%; object-fit: contain; border-radius: 3px;" referrerpolicy="no-referrer" loading="eager" />
        </div>
      ` : '';

      bodyHtml = `
        ${subFig}
        <div style="margin-top: 3px; display: flex; flex-direction: column; gap: 4px;">
          ${subItemsHtml}
        </div>
      `;
    } else if (parseMatchFollowingQuestion(q).isMatch && parseMatchFollowingQuestion(q).pairs.length > 0) {
      const { pairs, studentMap } = parseMatchFollowingQuestion(q);

      const rowsHtml = pairs.map((p: any, pIdx: number) => {
        const studentChoice = studentMap[p.left] || '(Unanswered)';
        const isPairMatch = String(studentChoice).trim().toLowerCase() === String(p.right).trim().toLowerCase();
        const bg = isPairMatch ? '#f0fdf4' : '#fff1f2';
        const rowBorder = pIdx < pairs.length - 1 ? 'border-bottom: 1px solid #e2e8f0;' : '';
        return `
          <div style="display: grid; grid-template-columns: 1fr 1fr; ${rowBorder} background: ${bg}; align-items: stretch; font-size: 8.5px;">
            <div style="padding: 4px 6px; border-right: 1.2px solid #cbd5e1; display: flex; align-items: center; gap: 4px; min-width: 0;">
              <span style="font-weight: 900; color: #1e3a8a; min-width: 14px; flex-shrink: 0; font-family: monospace; font-size: 8px;">(${pIdx + 1})</span>
              <span style="font-weight: 700; color: #0f172a; word-break: break-word; line-height: 1.25; font-size: 8.5px;">${escapeHtml(p.left)}</span>
              <span style="flex-grow: 1; border-bottom: 1.5px dotted #94a3b8; min-width: 8px; margin: 0 4px;"></span>
            </div>
            <div style="padding: 4px 6px; display: flex; flex-direction: column; justify-content: center; gap: 2px; min-width: 0;">
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 3px; width: 100%;">
                <span style="font-weight: 700; color: ${isPairMatch ? '#065f46' : '#9f1239'}; word-break: break-word; line-height: 1.25; font-size: 8.5px;">
                  "${escapeHtml(studentChoice)}"
                </span>
                <span style="font-weight: 800; font-size: 7px; padding: 1px 4px; border-radius: 2px; white-space: nowrap; flex-shrink: 0; ${isPairMatch ? 'background: #10b981; color: #ffffff;' : 'background: #f43f5e; color: #ffffff;'}">
                  ${isPairMatch ? '✓' : '✗'}
                </span>
              </div>
            </div>
          </div>
        `;
      }).join('');

      bodyHtml = `
        <div style="margin: 4px 0 2px 0; border: 1px solid #cbd5e1; border-radius: 4px; overflow: hidden; background: #ffffff;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; background: #f8fafc; border-bottom: 1.2px solid #cbd5e1; font-size: 7.5px; font-weight: 800; color: #475569; text-transform: uppercase;">
            <div style="padding: 3px 6px; border-right: 1px solid #cbd5e1;">Column A (Items)</div>
            <div style="padding: 3px 6px;">Student Match</div>
          </div>
          ${rowsHtml}
        </div>
      `;
    } else {
      const nonMcqFig = imgUrl ? `
        <div style="margin: 2px 0; text-align: center;">
          <img src="${escapeHtml(imgUrl)}" alt="Figure Q${globalIdx + 1}" style="max-height: 65px; max-width: 100%; object-fit: contain; border-radius: 3px;" referrerpolicy="no-referrer" loading="eager" />
        </div>
      ` : '';

      bodyHtml = `
        ${nonMcqFig}
        <div style="margin-top: 3px; display: flex; flex-direction: column; gap: 4px; font-size: 11px;">
          <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 4px; padding: 4px 7px; border-radius: 3px; ${isCorrect ? 'background: #f0fdf4; border: 1px solid #bbf7d0;' : 'background: #fff1f2; border: 1px solid #fecdd3;'}">
            <span style="font-weight: 700; ${isCorrect ? 'color: #166534;' : 'color: #991b1b;'}; word-break: break-word; overflow-wrap: break-word; flex: 1;">Student: "${escapeHtml(studentAns)}"</span>
            <span style="font-weight: 800; font-size: 8px; ${isCorrect ? 'color: #15803d;' : 'color: #dc2626;'}; white-space: nowrap; flex-shrink: 0;">${isCorrect ? '✓ Correct' : isPartial ? '◒ Partial' : '✗ Incorrect'}</span>
          </div>
        </div>
      `;
    }

    return `
      <div class="q-card question-block" style="border: 1px solid #e2e8f0; border-radius: 6px; background: #ffffff; padding: 6.5px 10px; display: block; width: 100%; height: auto; min-height: 0; page-break-inside: avoid; break-inside: avoid; box-sizing: border-box; margin-bottom: 7px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 5px; margin-bottom: 3px;">
          <div style="display: flex; align-items: flex-start; gap: 6px; flex: 1; min-width: 0;">
            <span style="display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 5px; background: #0b2545; color: #ffffff; font-size: 11.5px; font-weight: 900; flex-shrink: 0; font-family: system-ui, -apple-system, sans-serif;">
              ${globalIdx + 1}
            </span>
            <div style="font-size: 12px; font-weight: 800; color: #0b2545; line-height: 1.35; overflow-wrap: break-word;">
              ${escapeHtml(cleanQuestionPrompt(q.questionText || `Question ${globalIdx + 1}`))}
            </div>
          </div>
          <div style="flex-shrink: 0;">
            ${markBadge}
          </div>
        </div>
        ${bodyHtml}
      </div>
    `;
  };

  const allCardsHtml = questionList.map((q: any, idx: number) => renderQuestionCard(q, idx)).join('');
  const questionsContentHtml = isTwoCol
    ? `<div class="exam-content-flow" style="column-count: 2; column-gap: 7mm; column-fill: auto; width: 100%;">${allCardsHtml}</div>`
    : `<div class="exam-content-classic" style="display: flex; flex-direction: column; width: 100%;">${allCardsHtml}</div>`;

  const headerHtml = `
      <!-- HIGH-PRESTIGE ACADEMIC EXAMINATION MASTHEAD -->
      <div class="exam-masthead" style="border: 1.5px solid #0b2545; border-radius: 6px; background: #ffffff; margin-bottom: 9px; box-sizing: border-box; overflow: hidden; box-shadow: 0 1px 3px rgba(11, 37, 69, 0.06);">
        <!-- Top Institutional Bar with Crest & Board Identity -->
        <div style="padding: 8px 14px; background: #ffffff; display: flex; align-items: center; justify-content: space-between; gap: 12px; border-bottom: 2px solid #0b2545;">
          <!-- Left: Gold & Navy Institutional Crest & Title Details -->
          <div style="display: flex; align-items: center; gap: 12px; min-width: 0;">
            <!-- Academic Shield Crest -->
            <div style="width: 44px; height: 44px; border-radius: 8px; background: #0b2545; border: 2px solid #d97706; display: flex; align-items: center; justify-content: center; flex-shrink: 0; box-shadow: 0 2px 4px rgba(11,37,69,0.15);">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fef08a" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/>
                <path d="M6 6h10"/>
                <path d="M6 10h10"/>
                <path d="M6 14h6"/>
              </svg>
            </div>

            <!-- Title & Institution Hierarchy -->
            <div style="min-width: 0;">
              <div style="font-size: 9.5px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.5px; color: #b45309; line-height: 1.2;">
                ${escapeHtml(schoolName || 'ACADEMIC EVALUATION & ASSESSMENT BOARD')}
              </div>
              <div style="font-size: 16px; font-weight: 900; color: #0b2545; letter-spacing: -0.3px; line-height: 1.2; margin-top: 2px; word-break: break-word;">
                ${escapeHtml(submission.quizTitle || 'Continuous Assessment')}
              </div>
            </div>
          </div>

          <!-- Right: Official Score Stamp Badge (No Grade, Prominent Score) -->
          <div style="display: flex; align-items: center; flex-shrink: 0;">
            <div style="background: #f0fdf4; border: 2px solid #10b981; border-radius: 7px; padding: 5px 14px; text-align: center; box-shadow: 0 1px 3px rgba(16, 185, 129, 0.14); white-space: nowrap; display: flex; align-items: baseline; gap: 6px;">
              <span style="font-size: 9.5px; font-weight: 900; text-transform: uppercase; color: #047857; letter-spacing: 0.6px;">SCORE:</span>
              <span style="font-size: 18px; font-weight: 900; color: #065f46; line-height: 1;">${evaluation.totalScore} <span style="font-size: 13px; font-weight: 800; color: #475569;">/ ${evaluation.maxScore}</span></span>
            </div>
          </div>
        </div>

        <!-- Classical Academic Double Rule Divider -->
        <div style="height: 3px; border-top: 2px solid #0b2545; border-bottom: 1px solid #0b2545; background: #ffffff;"></div>

        <!-- Structured Particulars & Exam Metadata (Single Clean Line with Date) -->
        <div style="background: #f8fafc; padding: 6px 14px; display: flex; justify-content: space-between; align-items: center; gap: 10px; font-size: 9px; flex-wrap: nowrap; overflow: hidden;">
          <!-- Candidate Details Row -->
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: nowrap; min-width: 0; flex: 1; overflow: hidden;">
            <div style="display: flex; align-items: center; gap: 4px; flex-shrink: 0;">
              <span style="font-size: 8.5px; font-weight: 800; text-transform: uppercase; color: #64748b; letter-spacing: 0.4px;">CANDIDATE:</span>
              <strong style="color: #0b2545; font-size: 11.5px; font-weight: 900; background: #ffffff; padding: 2px 7px; border-radius: 4px; border: 1.2px solid #cbd5e1; box-shadow: 0 1px 2px rgba(0,0,0,0.04); white-space: nowrap;">${escapeHtml(submission.studentName)}</strong>
            </div>
            <div style="width: 1px; height: 16px; background: #cbd5e1; flex-shrink: 0;"></div>
            <div style="display: flex; align-items: center; gap: 4px; flex-shrink: 0;">
              <span style="font-size: 8.5px; font-weight: 800; text-transform: uppercase; color: #64748b; letter-spacing: 0.4px;">ROLL NO:</span>
              <strong style="font-family: monospace; color: #0b2545; font-size: 11.5px; font-weight: 900; background: #ffffff; padding: 2px 7px; border-radius: 4px; border: 1.2px solid #cbd5e1; box-shadow: 0 1px 2px rgba(0,0,0,0.04); white-space: nowrap;">${escapeHtml(cleanStudentRoll)}</strong>
            </div>
            <div style="width: 1px; height: 16px; background: #cbd5e1; flex-shrink: 0;"></div>
            <div style="display: flex; align-items: center; gap: 4px; flex-shrink: 0;">
              <span style="font-size: 8.5px; font-weight: 800; text-transform: uppercase; color: #64748b; letter-spacing: 0.4px;">CLASS:</span>
              <strong style="color: #0f172a; font-size: 11px; font-weight: 800; white-space: nowrap;">${escapeHtml(className || submission.classId || 'Class')}</strong>
            </div>
            <div style="width: 1px; height: 16px; background: #cbd5e1; flex-shrink: 0;"></div>
            <div style="display: flex; align-items: center; gap: 4px; flex-shrink: 0; min-width: 0; overflow: hidden; text-overflow: ellipsis;">
              <span style="font-size: 8.5px; font-weight: 800; text-transform: uppercase; color: #64748b; letter-spacing: 0.4px;">SUBJECT:</span>
              <strong style="color: #0f172a; font-size: 11px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(submission.subject || evaluation.subject || 'General')}</strong>
            </div>
          </div>

          <!-- Right: Exam Date -->
          <div style="display: flex; align-items: center; gap: 4px; flex-shrink: 0;">
            <span style="font-size: 8.5px; font-weight: 800; text-transform: uppercase; color: #64748b; letter-spacing: 0.4px;">DATE:</span>
            <strong style="color: #0b2545; font-size: 11px; font-weight: 800; background: #ffffff; padding: 2px 7px; border-radius: 4px; border: 1.2px solid #cbd5e1; white-space: nowrap;">${new Date(submission.submittedAt).toLocaleDateString()}</strong>
          </div>
        </div>
      </div>
  `;

  const studentPageLabel = `${escapeHtml(submission.studentName || 'Student')}${cleanStudentRoll && cleanStudentRoll !== '-' ? ` (Roll: ${escapeHtml(cleanStudentRoll)})` : ''}`;

  return `
    <div class="student-paper-bundle" data-student-index="${studentIndex}" data-student-name="${escapeHtml(submission.studentName)}" data-student-roll="${escapeHtml(cleanStudentRoll)}" data-paper-style="${paperStyle}" style="${studentIndex > 0 ? 'break-before: page !important; page-break-before: always !important;' : 'break-before: avoid !important; page-break-before: avoid !important;'}">
      <div class="exam-page">
        <div class="page-main-flow" style="display: flex; flex-direction: column; width: 100%;">
          ${headerHtml}
          ${questionsContentHtml}
        </div>
        <div class="page-student-name" style="position: absolute; bottom: 6.5mm; left: 0; right: 0; margin: 0 auto; padding: 0 16mm; font-size: 9px; font-weight: 600; color: #94a3b8; text-align: center; letter-spacing: 0.2px; line-height: 1.2; pointer-events: none; z-index: 20;">
          ${studentPageLabel}
        </div>
      </div>
    </div>
  `;
}

export interface QuestionOnlyPrintOptions extends PrintAnswerSheetOptions {
  autoPrint?: boolean;
  columnLayout?: 'single' | 'two_column';
  showTickBoxes?: boolean;
  tickBoxStyle?: 'square' | 'circle' | 'bracket';
  tickedAnswers?: Record<string, number | boolean>;
  instructions?: string;
}

const TRANSPARENT_PLACEHOLDER_GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

export function buildFullPrintHtmlDocument(
  bundlesHtml: string,
  options: PrintAnswerSheetOptions = {},
  docTitle: string = 'Answer Sheet',
  subtitle: string = 'Official Evaluated Answer Script',
  totalStudents: number = 1,
  docMode: 'answer_sheet' | 'question_paper' = 'answer_sheet',
  autoPrint: boolean = true
): string {
  const {
    fontSize = 'normal',
    schoolName = 'ACADEMIC EVALUATION & ASSESSMENT BOARD',
  } = options;

  const baseFontSize = fontSize === 'compact' ? '9.5px' : fontSize === 'large' ? '11.5px' : '10.5px';

  // Deduplicate repeated data:image/... URIs in multi-student batch documents to prevent 20MB+ HTML payloads
  let processedBundlesHtml = bundlesHtml;
  const batchImgPool: string[] = [];
  if (totalStudents > 1) {
    const imgIndexMap = new Map<string, number>();
    const imgCounts = new Map<string, number>();
    processedBundlesHtml.replace(/src="(data:image\/[^"]+)"/g, (_m, uri) => {
      imgCounts.set(uri, (imgCounts.get(uri) || 0) + 1);
      return '';
    });
    processedBundlesHtml = processedBundlesHtml.replace(/src="(data:image\/[^"]+)"/g, (fullMatch, uri) => {
      if ((imgCounts.get(uri) || 0) >= 2 && uri.length > 512) {
        let idx = imgIndexMap.get(uri);
        if (idx === undefined) {
          idx = batchImgPool.length;
          batchImgPool.push(uri);
          imgIndexMap.set(uri, idx);
        }
        return `data-bimg="${idx}" src="${TRANSPARENT_PLACEHOLDER_GIF}"`;
      }
      return fullMatch;
    });
  }

  const batchImgPoolJson = batchImgPool.length > 0 ? JSON.stringify(batchImgPool).replace(/<\//g, '<\\/') : 'null';

  const toolbarHeading = docMode === 'question_paper'
    ? 'Printable Question Paper'
    : totalStudents > 1
    ? `Official Batch Evaluated Answer Sheets (${totalStudents} Students)`
    : 'Official Evaluated Student Answer Sheet';

  const printBtnLabel = docMode === 'question_paper'
    ? 'Print Dialogue (Question Paper)'
    : `Print Dialogue (${totalStudents > 1 ? `All ${totalStudents} Papers` : 'Paper'})`;

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(docTitle)}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
      @page {
        size: A4 portrait;
        margin: 0 !important;
      }
      * {
        box-sizing: border-box;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      html, body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        color: #0f172a;
        margin: 0;
        padding: 0;
        font-size: ${baseFontSize};
        line-height: 1.35;
        background: #f1f5f9;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .student-paper-bundle {
        display: block;
        width: 100%;
        box-sizing: border-box;
        break-inside: auto !important;
        page-break-inside: auto !important;
      }
      .student-paper-bundle:first-child {
        break-before: avoid !important;
        page-break-before: avoid !important;
        margin-top: 0 !important;
      }
      .student-paper-bundle + .student-paper-bundle {
        break-before: page !important;
        page-break-before: always !important;
        margin-top: 0 !important;
      }
      .exam-page, .academic-paper-layout {
        position: relative !important;
        box-sizing: border-box !important;
        width: 210mm !important;
        max-width: 100% !important;
        margin: 0 auto 20px auto !important;
        background: #ffffff !important;
        padding: 13mm 16mm !important;
        border-radius: 6px;
        border: 1px solid #cbd5e1;
        box-shadow: 0 4px 14px rgba(0,0,0,0.06);
        height: 296mm;
        min-height: 296mm;
        display: block !important;
        overflow: hidden;
      }
      .exam-content-flow {
        column-count: 2 !important;
        column-gap: 6mm !important;
        column-rule: 1.2px solid #e2e8f0 !important;
        column-fill: auto !important;
        width: 100% !important;
      }
      .exam-content-classic {
        display: flex;
        flex-direction: column;
        width: 100%;
      }
      .q-card {
        border: 1px solid #e2e8f0;
        border-radius: 6px;
        background: #ffffff;
        box-shadow: none !important;
        break-inside: avoid !important;
        page-break-inside: avoid !important;
        -webkit-column-break-inside: avoid !important;
        display: block !important;
        width: 100%;
        box-sizing: border-box;
      }
      .exam-content-flow > .q-card:last-child,
      .exam-content-classic > .q-card:last-child {
        margin-bottom: 0 !important;
      }
      img {
        max-width: 100%;
        break-inside: avoid;
      }
      @media print {
        @page {
          size: A4 portrait;
          margin: 0 !important;
        }
        html, body {
          padding: 0 !important;
          margin: 0 !important;
          background: #ffffff !important;
          width: 210mm !important;
        }
        .no-print {
          display: none !important;
        }
        .print-doc-wrapper {
          padding: 0 !important;
          margin: 0 !important;
        }
        .page-footer {
          display: none !important;
        }
        .exam-page, .academic-paper-layout {
          position: relative !important;
          box-shadow: none !important;
          border: none !important;
          border-radius: 0 !important;
          padding: 13mm 16mm !important;
          margin: 0 auto !important;
          width: 210mm !important;
          max-width: 100% !important;
          min-height: ${totalStudents === 1 ? '0' : '296mm'} !important;
          ${totalStudents === 1 ? 'height: auto !important; overflow: visible !important;' : 'height: 296mm !important; max-height: 296mm !important; overflow: hidden !important;'}
          display: block !important;
          box-sizing: border-box !important;
        }
        ${totalStudents === 1 ? `
        .student-paper-bundle > .exam-page:first-child .page-student-name {
          position: fixed !important;
          bottom: 6.5mm !important;
          left: 0 !important;
          right: 0 !important;
          z-index: 9999 !important;
        }
        .student-paper-bundle > .exam-page + .exam-page .page-student-name {
          display: none !important;
        }
        ` : `
        .page-student-name {
          position: absolute !important;
          bottom: 6.5mm !important;
          left: 0 !important;
          right: 0 !important;
          width: 100% !important;
          margin: 0 auto !important;
          padding: 0 16mm !important;
          text-align: center !important;
          z-index: 9999 !important;
        }
        `}
        .exam-page + .exam-page {
          break-before: page !important;
          page-break-before: always !important;
        }
        .exam-content-flow {
          column-count: 2 !important;
          column-gap: 6mm !important;
          column-rule: 1.2px solid #e2e8f0 !important;
          column-fill: auto !important;
          width: 100% !important;
        }
        .exam-content-classic {
          display: flex !important;
          flex-direction: column !important;
          width: 100% !important;
        }
        .q-card {
          border: 1px solid #e2e8f0 !important;
          border-radius: 6px !important;
          box-shadow: none !important;
          break-inside: avoid !important;
          page-break-inside: avoid !important;
          -webkit-column-break-inside: avoid !important;
          display: block !important;
          width: 100% !important;
          box-sizing: border-box !important;
        }
      }
    </style>
  </head>
  <body>
    <!-- QUICK PRINT / SAVE TOOLBAR (HIDDEN AUTOMATICALLY WHEN PRINTING) -->
    <div class="no-print" style="position: sticky; top: 0; left: 0; right: 0; background: #0f172a; color: #ffffff; padding: 10px 20px; display: flex; justify-content: space-between; align-items: center; z-index: 99999; border-bottom: 2px solid #2563eb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; box-shadow: 0 4px 16px rgba(0,0,0,0.2);">
      <div style="display: flex; align-items: center; gap: 10px;">
        <div style="width: 32px; height: 32px; border-radius: 6px; background: #2563eb; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 6 2 18 2 18 9"></polyline>
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
            <rect x="6" y="14" width="12" height="8"></rect>
          </svg>
        </div>
        <div>
          <div style="font-weight: 800; font-size: 13px; letter-spacing: 0.2px;">${toolbarHeading}</div>
          <div style="font-size: 11px; color: #94a3b8;">${escapeHtml(subtitle)} &bull; ${escapeHtml(schoolName)}</div>
        </div>
      </div>
      <div style="display: flex; gap: 8px;">
        <button id="main-print-btn" onclick="if (window.__paginateFlowIntoPages) window.__paginateFlowIntoPages(); window.print();" style="background: #2563eb; hover:background: #1d4ed8; color: #ffffff; border: none; padding: 8px 20px; border-radius: 6px; font-weight: 700; font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 7px; box-shadow: 0 2px 8px rgba(37,99,235,0.4);">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
          ${printBtnLabel}
        </button>
        <button onclick="window.close()" style="background: #334155; color: #ffffff; border: none; padding: 8px 14px; border-radius: 6px; font-weight: 600; font-size: 12px; cursor: pointer;">
          Close
        </button>
      </div>
    </div>

    <div class="print-doc-wrapper" style="padding: 16px 10px;">
      ${processedBundlesHtml}
    </div>

    <!-- REAL COLUMN-FLOW PAGINATOR, ASSET VERIFIER & AUTO-PRINT TRIGGER -->
    <script>
      (function() {
        var __batchImgPool = ${batchImgPoolJson};
        if (__batchImgPool && __batchImgPool.length) {
          var pooledImgs = document.querySelectorAll('img[data-bimg]');
          for (var pi = 0; pi < pooledImgs.length; pi++) {
            var pImg = pooledImgs[pi];
            var pIdx = parseInt(pImg.getAttribute('data-bimg') || '', 10);
            if (!isNaN(pIdx) && __batchImgPool[pIdx]) {
              pImg.src = __batchImgPool[pIdx];
            }
          }
        }
        var didPaginate = false;
        function paginateFlowIntoPages() {
          if (didPaginate) return;
          didPaginate = true;
          try {
            // Full A4 height (295mm under 297mm A4) and 26mm vertical padding (13mm top + 13mm bottom)
            var probe = document.createElement('div');
            probe.style.cssText = 'position:absolute;left:-9999px;top:0;width:210mm;height:295mm;visibility:hidden;padding:0;margin:0;';
            document.body.appendChild(probe);
            var safePageH = probe.getBoundingClientRect().height || 1115;

            probe.style.height = '26mm'; // 13mm top + 13mm bottom
            var padV = probe.getBoundingClientRect().height || 98;
            document.body.removeChild(probe);

            var bundles = Array.from(document.querySelectorAll('.student-paper-bundle'));
            bundles.forEach(function(bundle) {
              var firstPage = bundle.querySelector('.exam-page');
              if (!firstPage) return;

              var masthead = firstPage.querySelector('.exam-masthead');
              var studentTag = firstPage.querySelector('.page-student-name');
              var flow = firstPage.querySelector('.exam-content-flow') || firstPage.querySelector('.exam-content-classic');
              if (!flow) return;

              var isTwoCol = flow.classList.contains('exam-content-flow');
              var mastheadH = masthead ? (masthead.getBoundingClientRect().height + 9) : 0;

              // Student name tag sits inside the 13mm bottom margin, reserving 0px from questions
              var availH1 = Math.max(200, Math.floor(safePageH - padV - mastheadH));
              var availHNext = Math.max(250, Math.floor(safePageH - padV));

              var allCards = Array.from(flow.querySelectorAll(':scope > .q-card'));
              if (!allCards.length) return;

              // Helper to fit as many cards as possible from 'cardsPool' into 'targetFlow' of height 'maxH'
              function fillContainer(targetFlow, cardsPool, maxH, isTwoColumn) {
                targetFlow.innerHTML = '';
                // Add 7px trailing margin-bottom allowance so the last card's empty bottom margin never triggers false column overflow
                var colBoxH = maxH + 7;
                if (isTwoColumn) {
                  targetFlow.style.height = colBoxH + 'px';
                  targetFlow.style.columnCount = '2';
                  targetFlow.style.columnGap = '6mm';
                  targetFlow.style.columnRule = '1.2px solid #e2e8f0';
                  targetFlow.style.columnFill = 'auto';
                } else {
                  targetFlow.style.height = 'auto';
                }

                cardsPool.forEach(function(c) { targetFlow.appendChild(c); });

                var overflow = [];
                if (isTwoColumn) {
                  while (cardsPool.length > 1 && (targetFlow.scrollWidth > targetFlow.clientWidth + 2 || targetFlow.scrollHeight > colBoxH + 2)) {
                    var removed = cardsPool.pop();
                    overflow.unshift(removed);
                    targetFlow.removeChild(removed);
                  }
                  // If nothing overflowed (last page), let CSS flow naturally without fixed height clipping
                  if (overflow.length === 0) {
                    targetFlow.style.height = 'auto';
                  }
                } else {
                  while (cardsPool.length > 1 && targetFlow.scrollHeight > colBoxH + 2) {
                    var removedClassic = cardsPool.pop();
                    overflow.unshift(removedClassic);
                    targetFlow.removeChild(removedClassic);
                  }
                }
                return overflow;
              }

              var remaining = fillContainer(flow, allCards.slice(), availH1, isTwoCol);

              while (remaining.length > 0) {
                var nextPage = document.createElement('div');
                nextPage.className = 'exam-page';

                var nextMain = document.createElement('div');
                nextMain.className = 'page-main-flow';
                nextMain.style.cssText = 'display: flex; flex-direction: column; width: 100%;';

                var nextFlow = document.createElement('div');
                nextFlow.className = isTwoCol ? 'exam-content-flow' : 'exam-content-classic';
                nextFlow.style.cssText = isTwoCol
                  ? 'column-count: 2; column-gap: 6mm; column-fill: auto; width: 100%;'
                  : 'display: flex; flex-direction: column; width: 100%;';

                nextMain.appendChild(nextFlow);
                nextPage.appendChild(nextMain);

                if (studentTag) {
                  nextPage.appendChild(studentTag.cloneNode(true));
                }

                bundle.appendChild(nextPage);
                remaining = fillContainer(nextFlow, remaining, availHNext, isTwoCol);
              }
            });
          } catch (err) {
            console.warn('paginateFlowIntoPages notice:', err);
          }
        }

        window.__paginateFlowIntoPages = paginateFlowIntoPages;
        window.addEventListener('beforeprint', paginateFlowIntoPages);

        var images = Array.from(document.querySelectorAll('img'));
        var pending = images.length;
        var executed = false;
        var shouldAutoPrint = ${autoPrint ? 'true' : 'false'};
        function triggerPrint() {
          if (!executed) {
            executed = true;
            paginateFlowIntoPages();
            if (!shouldAutoPrint) return;
            setTimeout(function() {
              window.focus();
              try {
                window.print();
              } catch (e) {
                console.warn('Auto print failed:', e);
              }
            }, 350);
          }
        }

        if (!images.length) {
          triggerPrint();
          return;
        }
        images.forEach(function(img) {
          if (img.complete && img.naturalWidth > 0) {
            pending--;
            if (pending <= 0) triggerPrint();
          } else {
            img.addEventListener('load', function() {
              pending--;
              if (pending <= 0) triggerPrint();
            });
            img.addEventListener('error', function() {
              pending--;
              if (pending <= 0) triggerPrint();
            });
          }
        });
        setTimeout(triggerPrint, ${totalStudents > 1 ? 2500 : 900});
      })();
    </script>
  </body>
</html>`;
}

// Single student printable answer sheet
export function generatePrintableStudentAnswerHtml(
  evaluation: any,
  submission: any,
  className: string,
  options: PrintAnswerSheetOptions = {}
): string {
  const bundleHtml = renderStudentAnswerPagesHtml(evaluation, submission, className, options, 0, 1);
  const docTitle = `Answer Sheet - ${submission.studentName || 'Student'} - ${submission.quizTitle || 'Assessment'}`;
  const subtitle = `${submission.studentName} • ${submission.quizTitle || 'Assessment'} • Score: ${evaluation.totalScore}/${evaluation.maxScore}`;
  return buildFullPrintHtmlDocument(bundleHtml, options, docTitle, subtitle, 1, 'answer_sheet', true);
}

// Batch printable answer sheets for all submitted students
export function generateBatchPrintableStudentAnswersHtml(
  submissionsWithEval: Array<{
    evaluation: any;
    submission: any;
    className: string;
  }>,
  options: PrintAnswerSheetOptions = {}
): string {
  const bundlesHtml = submissionsWithEval
    .map((item, idx) =>
      renderStudentAnswerPagesHtml(item.evaluation, item.submission, item.className, options, idx, submissionsWithEval.length)
    )
    .join('');

  const docTitle = `Batch Evaluated Answer Sheets (${submissionsWithEval.length} Students)`;
  const subtitle = `${submissionsWithEval.length} Student Submissions • Batch Academic Print`;
  return buildFullPrintHtmlDocument(bundlesHtml, options, docTitle, subtitle, submissionsWithEval.length, 'answer_sheet', true);
}

// Printable Blank Question Paper Only (NO student name, NO class, NO roll no, NO bottom name, NO answers/keys)
export function generatePrintableQuestionsOnlyHtml(
  quiz: any,
  options: QuestionOnlyPrintOptions = {}
): string {
  const {
    schoolName = 'ACADEMIC EVALUATION & ASSESSMENT BOARD',
    paperStyle = 'twocolumn',
    columnLayout,
    fontSize = 'normal',
    autoPrint = true,
    showTickBoxes = true,
    tickBoxStyle = 'square',
    instructions = '',
  } = options;

  const isTwoCol = columnLayout ? columnLayout !== 'single' : paperStyle !== 'classic';
  const questions: any[] = Array.isArray(quiz?.questions) ? quiz.questions : [];
  const totalMarks = Number(quiz?.totalPoints || questions.reduce((sum: number, q: any) => sum + (Number(q?.points) || 1), 0));

  const renderTickBox = () => {
    if (!showTickBoxes) return '';
    if (tickBoxStyle === 'bracket') {
      return `<span style="font-family: monospace; font-size: 9.5px; font-weight: 800; color: #64748b; flex-shrink: 0;">[&nbsp;&nbsp;]</span>`;
    }
    const radius = tickBoxStyle === 'circle' ? '50%' : '3px';
    return `<span style="width: 13px; height: 13px; border: 1.5px solid #94a3b8; border-radius: ${radius}; background: #ffffff; display: inline-block; flex-shrink: 0;"></span>`;
  };

  const renderQuestionOnlyCard = (q: any, globalIdx: number): string => {
    const qNum = globalIdx + 1;
    const maxPts = Number(q?.points || 1);
    const qType = String(q?.type || 'mcq').toLowerCase();

    const markBadge = `
      <span style="display: inline-flex; align-items: center; padding: 2px 7px; border-radius: 4px; font-size: 9.5px; font-weight: 800; white-space: nowrap; border: 1.2px solid #cbd5e1; background: #f8fafc; color: #334155;">
        [ ${maxPts} ${maxPts === 1 ? 'Pt' : 'Pts'} ]
      </span>
    `;

    const rawImg = q.imageUrl || q.image || q.figureUrl || q.diagramUrl;
    const imgUrl = typeof rawImg === 'string' && rawImg.trim().length > 0 ? rawImg.trim() : undefined;

    let rawOptions: any[] = [];
    try {
      rawOptions = typeof q.options === 'string' ? JSON.parse(q.options) : (Array.isArray(q.options) ? q.options : []);
    } catch {}

    let rawSubQuestions: any[] = [];
    try {
      rawSubQuestions = typeof q.subQuestions === 'string'
        ? JSON.parse(q.subQuestions)
        : typeof q.sub_questions === 'string'
        ? JSON.parse(q.sub_questions)
        : (Array.isArray(q.subQuestions) ? q.subQuestions : Array.isArray(q.sub_questions) ? q.sub_questions : []);
    } catch {}

    let rawBlankItems: any[] = [];
    try {
      rawBlankItems = typeof q.blankItems === 'string'
        ? JSON.parse(q.blankItems)
        : typeof q.blank_items === 'string'
        ? JSON.parse(q.blank_items)
        : (Array.isArray(q.blankItems) ? q.blankItems : Array.isArray(q.blank_items) ? q.blank_items : []);
    } catch {}

    let rawMatchingPairs: any[] = [];
    try {
      rawMatchingPairs = typeof q.matchingPairs === 'string'
        ? JSON.parse(q.matchingPairs)
        : typeof q.matching_pairs === 'string'
        ? JSON.parse(q.matching_pairs)
        : (Array.isArray(q.matchingPairs) ? q.matchingPairs : Array.isArray(q.matching_pairs) ? q.matching_pairs : []);
    } catch {}

    const parsedMatch = parseMatchFollowingQuestion({
      ...q,
      matchingPairs: rawMatchingPairs,
    });

    let bodyHtml = '';

    if (rawSubQuestions.length > 0) {
      const subItemsHtml = rawSubQuestions.map((sq: any, sqIdx: number) => {
        const sqLabel = sq.label || `Part (${String.fromCharCode(97 + sqIdx)})`;
        const sqText = sq.questionText || sq.text || '';
        const sqPts = Number(sq.points || 1);
        const sqOpts = Array.isArray(sq.options) ? sq.options : [];
        const isSqMcq = (sq.type === 'mcq' || sqOpts.length > 0) && sqOpts.length > 0;

        const sqWorkspace = isSqMcq
          ? `
            <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 3px 5px; margin-top: 3px;">
              ${sqOpts.map((opt: any, oIdx: number) => {
                const letter = String.fromCharCode(65 + oIdx);
                return `
                  <div style="border: 1.1px solid #cbd5e1; background: #ffffff; border-radius: 5px; padding: 3px 6px; min-height: 24px; display: flex; align-items: center; justify-content: space-between; gap: 4px; min-width: 0;">
                    <div style="display: flex; align-items: center; gap: 5px; min-width: 0; flex: 1;">
                      <span style="width: 17px; height: 17px; border-radius: 50%; background: #e0e7ff; color: #1e3a8a; display: inline-flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 900; flex-shrink: 0;">${letter}</span>
                      <span style="font-size: 10px; font-weight: 600; color: #1e293b; word-break: break-word; overflow-wrap: break-word; line-height: 1.25;">${escapeHtml(cleanOptionText(opt))}</span>
                    </div>
                    ${renderTickBox()}
                  </div>
                `;
              }).join('')}
            </div>
          `
          : `
            <div style="margin-top: 4px; border-bottom: 1.2px dashed #94a3b8; height: 16px; font-size: 8.5px; color: #64748b;">
              Ans:
            </div>
          `;

        return `
          <div style="padding: 4px 7px; border-radius: 4px; border: 1px solid #cbd5e1; background: #f8fafc; font-size: 10.5px; margin-top: 2px;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 4px;">
              <div style="color: #0f172a; font-size: 9.5px; line-height: 1.3; flex: 1; word-break: break-word;">
                <strong style="color: #0b2545;">${escapeHtml(sqLabel.startsWith('Part') ? sqLabel : `Part ${sqLabel}`)}${sqText ? ':' : ''}</strong>
                ${sqText ? ` <span style="font-weight: 600;">${escapeHtml(cleanQuestionPrompt(sqText))}</span>` : ''}
              </div>
              <span style="font-weight: 800; font-size: 8px; padding: 1px 4px; border-radius: 3px; background: #ffffff; border: 1px solid #cbd5e1; color: #475569; white-space: nowrap; flex-shrink: 0;">
                ${sqPts} ${sqPts === 1 ? 'pt' : 'pts'}
              </span>
            </div>
            ${sqWorkspace}
          </div>
        `;
      }).join('');

      const subFig = imgUrl ? `
        <div style="margin: 3px 0; text-align: center; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 5px; padding: 4px;">
          <img src="${escapeHtml(imgUrl)}" alt="Figure Q${qNum}" style="max-height: 80px; max-width: 100%; object-fit: contain; border-radius: 3px; display: block; margin: 0 auto;" referrerpolicy="no-referrer" loading="eager" />
        </div>
      ` : '';

      bodyHtml = `
        ${subFig}
        <div style="margin-top: 3px; display: flex; flex-direction: column; gap: 4px;">
          ${subItemsHtml}
        </div>
      `;
    } else if (parsedMatch.isMatch && parsedMatch.pairs.length > 0) {
      const validPairs = parsedMatch.pairs;
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

      const rowsHtml = validPairs.map((p: any, pIdx: number) => {
        const rItem = scrambledRight[pIdx];
        const rightLabel = String.fromCharCode(65 + pIdx);
        const bg = pIdx % 2 === 0 ? '#ffffff' : '#f8fafc';
        return `
          <div style="display: grid; grid-template-columns: 1fr 1fr; border-bottom: 1px solid #e2e8f0; background: ${bg}; align-items: stretch; font-size: 8.5px;">
            <div style="padding: 4px 6px; border-right: 1.2px solid #cbd5e1; display: flex; align-items: center; gap: 4px; min-width: 0;">
              <span style="font-weight: 900; color: #1e3a8a; min-width: 14px; flex-shrink: 0; font-family: monospace; font-size: 8px;">(${pIdx + 1})</span>
              <span style="font-weight: 700; color: #0f172a; word-break: break-word; line-height: 1.25; font-size: 8.5px;">${escapeHtml(p.left)}</span>
              <span style="flex-grow: 1; border-bottom: 1.5px dotted #94a3b8; min-width: 8px; margin: 0 4px;"></span>
              <span style="font-family: monospace; font-weight: 800; font-size: 7.5px; border: 1px solid #94a3b8; border-radius: 3px; padding: 1px 5px; background: #ffffff; color: #64748b; flex-shrink: 0;">[&nbsp;&nbsp;]</span>
            </div>
            <div style="padding: 4px 6px; display: flex; align-items: center; gap: 4px; min-width: 0;">
              <span style="font-weight: 900; color: #047857; min-width: 14px; flex-shrink: 0; font-family: monospace; font-size: 8px;">(${rightLabel})</span>
              <span style="font-weight: 600; color: #1e293b; word-break: break-word; line-height: 1.25; font-size: 8.5px;">${escapeHtml(rItem.text)}</span>
            </div>
          </div>
        `;
      }).join('');

      const answerBoxesHtml = validPairs.map((_, i) => `
        <span style="display: inline-flex; align-items: center; gap: 2px; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 3px; padding: 1px 5px; font-size: 7.5px; font-family: monospace;">
          <strong style="color: #1e3a8a;">(${i + 1})</strong>
          <span style="color: #64748b;">➔</span>
          <span style="display: inline-block; min-width: 16px; border-bottom: 1.2px solid #0f172a;">&nbsp;</span>
        </span>
      `).join('');

      bodyHtml = `
        <div style="margin: 4px 0 2px 0; border: 1px solid #cbd5e1; border-radius: 4px; overflow: hidden; background: #ffffff;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; background: #f8fafc; border-bottom: 1.2px solid #cbd5e1; font-size: 7.5px; font-weight: 800; color: #475569; text-transform: uppercase;">
            <div style="padding: 3px 6px; border-right: 1px solid #cbd5e1;">Column A (Items)</div>
            <div style="padding: 3px 6px;">Column B (Matches)</div>
          </div>
          ${rowsHtml}
          <div style="background: #f8fafc; border-top: 1px solid #cbd5e1; padding: 3px 6px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 3px;">
            <span style="font-size: 7px; font-weight: 800; text-transform: uppercase; color: #64748b;">Match:</span>
            <div style="display: flex; align-items: center; gap: 3px; flex-wrap: wrap;">
              ${answerBoxesHtml}
            </div>
          </div>
        </div>
      `;
    } else if (qType === 'true_false' || rawOptions.length > 0) {
      const effectiveOptions = qType === 'true_false' && rawOptions.length === 0 ? ['True', 'False'] : rawOptions;
      const optionsItems = effectiveOptions.map((opt: any, optIdx: number) => {
        const optLetter = String.fromCharCode(65 + optIdx);
        const cleanOpt = cleanOptionText(opt);
        const optImg = (q.optionImages && q.optionImages[optIdx]) || (typeof opt === 'string' && (opt.startsWith('http://') || opt.startsWith('https://') || opt.startsWith('data:image/')) ? opt : null);
        const optImgHtml = optImg ? `<img src="${escapeHtml(optImg)}" alt="Opt ${optLetter}" style="max-height: 22px; max-width: 45px; object-fit: contain; border: 1px solid #cbd5e1; border-radius: 3px; vertical-align: middle; margin-left: 3px; display: inline-block;" referrerpolicy="no-referrer" />` : '';

        return `
          <div style="border: 1.2px solid #cbd5e1; background: #ffffff; border-radius: 6px; padding: 4px 7px; min-height: 28px; display: flex; align-items: center; justify-content: space-between; gap: 5px; min-width: 0;">
            <div style="display: flex; align-items: center; gap: 6px; min-width: 0; flex: 1;">
              <span style="width: 20px; height: 20px; border-radius: 50%; background: #e0e7ff; color: #1e3a8a; display: inline-flex; align-items: center; justify-content: center; font-size: 10.5px; font-weight: 900; flex-shrink: 0;">${optLetter}</span>
              <span style="font-size: 11px; font-weight: 600; color: #1e293b; word-break: break-word; overflow-wrap: break-word; white-space: normal; line-height: 1.3;">
                ${escapeHtml(cleanOpt)}
              </span>
              ${optImgHtml}
            </div>
            ${renderTickBox()}
          </div>
        `;
      }).join('');

      const maxOptLen = effectiveOptions.length > 0 ? Math.max(...effectiveOptions.map((o: any) => String(o || '').length)) : 0;
      const optGridCols = (isTwoCol && maxOptLen > 24) || maxOptLen > 35 ? '1fr' : 'repeat(2, minmax(0, 1fr))';

      if (imgUrl) {
        bodyHtml = `
          <div style="display: flex; gap: 8px; align-items: stretch; margin-top: 4px; width: 100%;">
            <div style="width: 38%; flex-shrink: 0; min-height: 60px; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #ffffff; border: 1.2px solid #cbd5e1; border-radius: 5px; padding: 4px; box-sizing: border-box;">
              <img src="${escapeHtml(imgUrl)}" alt="Figure Q${qNum}" style="max-height: 75px; max-width: 100%; object-fit: contain; border-radius: 4px; background: #ffffff; display: block; margin: 0 auto;" referrerpolicy="no-referrer" loading="eager" />
            </div>
            <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: space-between; gap: 3px;">
              ${optionsItems}
            </div>
          </div>
        `;
      } else {
        bodyHtml = `
          <div style="display: grid; grid-template-columns: ${optGridCols}; gap: 3px 6px; margin-top: 3px; width: 100%;">
            ${optionsItems}
          </div>
        `;
      }
    } else if (qType === 'fill_blanks' || qType === 'fill_in_the_blank') {
      const figHtml = imgUrl ? `
        <div style="margin: 2px 0; text-align: center;">
          <img src="${escapeHtml(imgUrl)}" alt="Figure Q${qNum}" style="max-height: 65px; max-width: 100%; object-fit: contain; border-radius: 3px;" referrerpolicy="no-referrer" loading="eager" />
        </div>
      ` : '';

      const wordBankHtml = rawOptions.length > 0 ? `
        <div style="margin-top: 3px; padding: 3px 6px; background: #f8fafc; border: 1px dashed #94a3b8; border-radius: 4px; font-size: 8.5px; color: #334155;">
          <strong>Word Bank:</strong> ${rawOptions.map(w => escapeHtml(cleanOptionText(w))).join(' &bull; ')}
        </div>
      ` : '';

      let blanksHtml = '';
      if (rawBlankItems.length > 0) {
        blanksHtml = rawBlankItems.map((bi: any, bIdx: number) => `
          <div style="padding: 3px 6px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 4px; margin-top: 3px; font-size: 9.5px; color: #0f172a; display: flex; align-items: center; justify-content: space-between;">
            <div>
              <strong style="color: #0b2545;">(${bIdx + 1})</strong>
              ${bi.prefix ? ` <span>${escapeHtml(bi.prefix)}</span>` : ''}
              <span style="display: inline-block; border-bottom: 1.3px solid #334155; min-width: 65px; margin: 0 4px;">&nbsp;</span>
              ${bi.suffix ? `<span>${escapeHtml(bi.suffix)}</span>` : ''}
            </div>
            ${bi.points ? `<span style="font-size: 8px; font-weight: 700; color: #64748b;">[${bi.points}pt]</span>` : ''}
          </div>
        `).join('');
      } else if (q.blankTemplate) {
        blanksHtml = `
          <div style="margin-top: 3px; padding: 4px 7px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 10px; color: #0f172a; line-height: 1.4;">
            ${escapeHtml(q.blankTemplate)}
          </div>
        `;
      } else {
        blanksHtml = `
          <div style="margin-top: 4px; border-bottom: 1.2px dashed #94a3b8; height: 18px; font-size: 8.5px; color: #64748b;">
            Answer:
          </div>
        `;
      }

      bodyHtml = `${figHtml}${wordBankHtml}${blanksHtml}`;
    } else {
      // Short Answer / Descriptive / Picture Question without subQuestions
      const nonMcqFig = imgUrl ? `
        <div style="margin: 3px 0; text-align: center;">
          <img src="${escapeHtml(imgUrl)}" alt="Figure Q${qNum}" style="max-height: 75px; max-width: 100%; object-fit: contain; border-radius: 3px;" referrerpolicy="no-referrer" loading="eager" />
        </div>
      ` : '';

      const lineCount = maxPts >= 5 ? 4 : maxPts >= 3 ? 3 : 2;
      const linesHtml = Array.from({ length: lineCount })
        .map(() => `<div style="border-bottom: 1.2px dashed #94a3b8; height: 16px;"></div>`)
        .join('');

      bodyHtml = `
        ${nonMcqFig}
        <div style="margin-top: 3px; display: flex; flex-direction: column; gap: 3px;">
          ${linesHtml}
        </div>
      `;
    }

    return `
      <div class="q-card question-block" style="border: 1px solid #e2e8f0; border-radius: 6px; background: #ffffff; padding: 6.5px 10px; display: block; width: 100%; height: auto; min-height: 0; page-break-inside: avoid; break-inside: avoid; box-sizing: border-box; margin-bottom: 7px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 5px; margin-bottom: 3px;">
          <div style="display: flex; align-items: flex-start; gap: 6px; flex: 1; min-width: 0;">
            <span style="display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 5px; background: #0b2545; color: #ffffff; font-size: 11.5px; font-weight: 900; flex-shrink: 0; font-family: system-ui, -apple-system, sans-serif;">
              ${qNum}
            </span>
            <div style="font-size: 12px; font-weight: 800; color: #0b2545; line-height: 1.35; overflow-wrap: break-word;">
              ${escapeHtml(cleanQuestionPrompt(q.questionText || q.question || `Question ${qNum}`))}
            </div>
          </div>
          <div style="flex-shrink: 0;">
            ${markBadge}
          </div>
        </div>
        ${bodyHtml}
      </div>
    `;
  };

  const allCardsHtml = questions.map((q: any, idx: number) => renderQuestionOnlyCard(q, idx)).join('');
  const questionsContentHtml = isTwoCol
    ? `<div class="exam-content-flow" style="column-count: 2; column-gap: 7mm; column-fill: auto; width: 100%;">${allCardsHtml}</div>`
    : `<div class="exam-content-classic" style="display: flex; flex-direction: column; width: 100%;">${allCardsHtml}</div>`;

  // Questions-Only Masthead: Blank Student Name, Class, Roll No fill-in fields + Paper metadata (NO answers, NO bottom student name)
  const mastheadHtml = `
      <div class="exam-masthead" style="border: 1.5px solid #0b2545; border-radius: 6px; background: #ffffff; margin-bottom: 9px; box-sizing: border-box; overflow: hidden; box-shadow: 0 1px 3px rgba(11, 37, 69, 0.06);">
        <div style="padding: 8px 14px; background: #ffffff; display: flex; align-items: center; justify-content: space-between; gap: 12px; border-bottom: 2px solid #0b2545;">
          <div style="display: flex; align-items: center; gap: 12px; min-width: 0;">
            <div style="width: 44px; height: 44px; border-radius: 8px; background: #0b2545; border: 2px solid #d97706; display: flex; align-items: center; justify-content: center; flex-shrink: 0; box-shadow: 0 2px 4px rgba(11,37,69,0.15);">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fef08a" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/>
                <path d="M6 6h10"/>
                <path d="M6 10h10"/>
                <path d="M6 14h6"/>
              </svg>
            </div>
            <div style="min-width: 0;">
              <div style="font-size: 9.5px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.5px; color: #b45309; line-height: 1.2;">
                ${escapeHtml(schoolName || 'ACADEMIC EVALUATION & ASSESSMENT BOARD')}
              </div>
              <div style="font-size: 16px; font-weight: 900; color: #0b2545; letter-spacing: -0.3px; line-height: 1.2; margin-top: 2px; word-break: break-word;">
                ${escapeHtml(quiz?.title || 'Question Paper')}
              </div>
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
            ${quiz?.timeLimitMinutes && Number(quiz.timeLimitMinutes) > 0 ? `
              <div style="background: #f8fafc; border: 1.2px solid #cbd5e1; border-radius: 5px; padding: 3px 8px; text-align: center; white-space: nowrap;">
                <span style="font-size: 7.5px; font-weight: 900; text-transform: uppercase; color: #64748b; letter-spacing: 0.4px;">TIME: </span>
                <span style="font-size: 11px; font-weight: 900; color: #0b2545;">${Number(quiz.timeLimitMinutes)} Mins</span>
              </div>
            ` : ''}
            <div style="background: #ffffff; border: 1.5px solid #0b2545; border-radius: 5px; padding: 4px 10px; text-align: center; white-space: nowrap;">
              <span style="font-size: 8px; font-weight: 900; text-transform: uppercase; color: #64748b; letter-spacing: 0.4px;">TOTAL MARKS: </span>
              <span style="font-size: 13px; font-weight: 900; color: #0b2545;">${totalMarks}</span>
            </div>
          </div>
        </div>

        <div style="height: 3px; border-top: 2px solid #0b2545; border-bottom: 1px solid #0b2545; background: #ffffff;"></div>

        <!-- Blank Student Particulars Fill-In Row -->
        <div style="background: #ffffff; padding: 6px 14px; display: flex; justify-content: space-between; align-items: flex-end; gap: 14px; border-bottom: 1px dashed #cbd5e1; font-size: 9px;">
          <div style="display: flex; align-items: flex-end; gap: 6px; flex: 2.2; min-width: 0;">
            <span style="font-size: 8.5px; font-weight: 800; text-transform: uppercase; color: #334155; letter-spacing: 0.4px; white-space: nowrap;">STUDENT NAME:</span>
            <span style="flex: 1; border-bottom: 1.4px solid #334155; min-width: 90px; height: 14px; display: inline-block;"></span>
          </div>
          <div style="display: flex; align-items: flex-end; gap: 6px; flex: 1; min-width: 0;">
            <span style="font-size: 8.5px; font-weight: 800; text-transform: uppercase; color: #334155; letter-spacing: 0.4px; white-space: nowrap;">CLASS:</span>
            <span style="flex: 1; border-bottom: 1.4px solid #334155; min-width: 55px; height: 14px; display: inline-block;"></span>
          </div>
          <div style="display: flex; align-items: flex-end; gap: 6px; flex: 0.9; min-width: 0;">
            <span style="font-size: 8.5px; font-weight: 800; text-transform: uppercase; color: #334155; letter-spacing: 0.4px; white-space: nowrap;">ROLL NO:</span>
            <span style="flex: 1; border-bottom: 1.4px solid #334155; min-width: 45px; height: 14px; display: inline-block;"></span>
          </div>
        </div>

        <!-- Subject, Questions Count & Instructions Strip -->
        <div style="background: #f8fafc; padding: 5px 14px; display: flex; justify-content: space-between; align-items: center; gap: 10px; font-size: 9.5px; flex-wrap: nowrap; overflow: hidden;">
          <div style="display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1; overflow: hidden;">
            <div style="display: flex; align-items: center; gap: 4px; flex-shrink: 0;">
              <span style="font-size: 8.5px; font-weight: 800; text-transform: uppercase; color: #64748b; letter-spacing: 0.4px;">SUBJECT:</span>
              <strong style="color: #0b2545; font-size: 11px; font-weight: 800; white-space: nowrap;">${escapeHtml(quiz?.subject || 'General')}</strong>
            </div>
            <div style="width: 1px; height: 14px; background: #cbd5e1; flex-shrink: 0;"></div>
            <div style="display: flex; align-items: center; gap: 4px; flex-shrink: 0;">
              <span style="font-size: 8.5px; font-weight: 800; text-transform: uppercase; color: #64748b; letter-spacing: 0.4px;">QUESTIONS:</span>
              <strong style="color: #0b2545; font-size: 11px; font-weight: 800; white-space: nowrap;">${questions.length}</strong>
            </div>
          </div>
          <div style="font-size: 8.5px; color: #475569; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            ${escapeHtml(instructions || 'Answer all questions clearly.')}
          </div>
        </div>
      </div>
  `;

  const bundleHtml = `
    <div class="student-paper-bundle" data-paper-style="${isTwoCol ? 'twocolumn' : 'classic'}" style="break-before: avoid !important; page-break-before: avoid !important;">
      <div class="exam-page">
        <div class="page-main-flow" style="display: flex; flex-direction: column; width: 100%;">
          ${mastheadHtml}
          ${questionsContentHtml}
        </div>
      </div>
    </div>
  `;

  const docTitle = `Question Paper - ${quiz?.title || 'Assessment'}`;
  const subtitle = `${quiz?.title || 'Assessment'} • ${questions.length} Questions • ${totalMarks} Marks`;
  return buildFullPrintHtmlDocument(
    bundleHtml,
    { schoolName, fontSize, paperStyle: isTwoCol ? 'twocolumn' : 'classic' },
    docTitle,
    subtitle,
    1,
    'question_paper',
    autoPrint
  );
}
