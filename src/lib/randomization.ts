import type { QuizItem, QuestionItem, SubQuestionItem } from '../types';

export interface RandomizedOptionItem {
  optionId: string; // e.g. 'opt_0', 'opt_1' referencing teacher's canonical q.options[origIndex]
  origIndex: number;
  text: string;
}

export interface QuizRandomizationMap {
  version: 1;
  questionOrder: string[]; // Canonical question.id[] in student display order
  optionOrders: Record<string, string[]>; // questionId -> ['opt_2', 'opt_0', ...]
  subOptionOrders?: Record<string, Record<string, string[]>>; // questionId -> subQuestionKey -> ['opt_1', 'opt_0', ...]
  createdAt?: string;
}

export interface RandomizationValidationResult {
  valid: boolean;
  errors: string[];
}

export type RandomIntFn = (maxExclusive: number) => number;

function defaultCryptoRandomInt(maxExclusive: number): number {
  if (maxExclusive <= 1) return 0;
  try {
    const g: any = typeof globalThis !== 'undefined' ? globalThis : undefined;
    if (g?.crypto?.getRandomValues) {
      const arr = new Uint32Array(1);
      const limit = Math.floor(0x100000000 / maxExclusive) * maxExclusive;
      let val = 0;
      do {
        g.crypto.getRandomValues(arr);
        val = arr[0];
      } while (val >= limit);
      return val % maxExclusive;
    }
  } catch {
    // Fallback to Math.random if crypto is unavailable
  }
  return Math.floor(Math.random() * maxExclusive);
}

/**
 * Fisher-Yates unbiased shuffle returning a new array (never mutates input).
 * Guarantees an exact permutation with every element preserved exactly once.
 */
export function shuffleArray<T>(items: readonly T[], randomIntFn: RandomIntFn = defaultCryptoRandomInt): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomIntFn(i + 1);
    if (!Number.isInteger(j) || j < 0 || j > i) {
      throw new Error(`Invalid random index ${j} generated for upper bound ${i}`);
    }
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

export function parseOptionIndex(optionId: any): number | null {
  if (typeof optionId !== 'string') return null;
  const match = optionId.trim().match(/^opt_(\d+)$/i);
  if (!match) return null;
  const idx = parseInt(match[1], 10);
  return Number.isInteger(idx) && idx >= 0 ? idx : null;
}

function safeParseArray(val: any): any[] {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function getCanonicalQuestionId(q: any, idx: number): string {
  const raw = q?.id !== undefined && q?.id !== null ? String(q.id).trim() : '';
  return raw || `q_${idx}`;
}

function getCanonicalSubQuestions(q: any): any[] {
  return safeParseArray(q?.subQuestions ?? q?.sub_questions);
}

function getCanonicalOptions(q: any): string[] {
  return safeParseArray(q?.options).map((o: any) => (typeof o === 'string' ? o : String(o ?? '')));
}

export function isMcqOptionRandomizable(q: any): boolean {
  const qType = String(q?.type || '').trim().toLowerCase();
  const opts = getCanonicalOptions(q);
  if (opts.length <= 1) return false;
  if (qType === 'mcq') return true;
  if (qType === 'picture_question') {
    const subQs = getCanonicalSubQuestions(q);
    return subQs.length === 0;
  }
  return false;
}

/**
 * Validates that a QuizRandomizationMap represents an exact, duplicate-free permutation
 * of all canonical questions and an exact, duplicate-free permutation of each MCQ's own options.
 */
export function validateQuizRandomizationMap(
  canonicalQuestions: readonly any[],
  map: QuizRandomizationMap | null | undefined
): RandomizationValidationResult {
  const errors: string[] = [];
  const questions = Array.isArray(canonicalQuestions) ? canonicalQuestions : [];

  if (questions.length === 0) {
    return { valid: false, errors: ['Quiz contains no canonical questions.'] };
  }

  // Verify canonical questions themselves have unique IDs
  const canonicalIds: string[] = [];
  const canonicalIdSet = new Set<string>();
  const canonicalById = new Map<string, any>();

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const qId = getCanonicalQuestionId(q, i);
    if (canonicalIdSet.has(qId)) {
      errors.push(`Duplicate canonical question ID "${qId}" found in quiz.`);
    } else {
      canonicalIdSet.add(qId);
      canonicalIds.push(qId);
      canonicalById.set(qId, q);
    }
  }

  if (!map || typeof map !== 'object' || !Array.isArray(map.questionOrder)) {
    errors.push('Randomization map is missing or has invalid questionOrder.');
    return { valid: false, errors };
  }

  if (map.questionOrder.length !== questions.length) {
    errors.push(
      `Question count mismatch: original has ${questions.length}, randomized sequence has ${map.questionOrder.length}.`
    );
  }

  const seenOrderIds = new Set<string>();
  for (const rawId of map.questionOrder) {
    const qId = String(rawId || '').trim();
    if (!qId) {
      errors.push('Empty question ID found in randomized sequence.');
      continue;
    }
    if (seenOrderIds.has(qId)) {
      errors.push(`Duplicate question ID "${qId}" detected in randomized sequence.`);
      continue;
    }
    if (!canonicalIdSet.has(qId)) {
      errors.push(`Unknown question ID "${qId}" in randomized sequence does not belong to original quiz.`);
      continue;
    }
    seenOrderIds.add(qId);
  }

  for (const qId of canonicalIds) {
    if (!seenOrderIds.has(qId)) {
      errors.push(`Original question ID "${qId}" is missing from randomized sequence.`);
    }
  }

  // Validate option permutations strictly within each individual question
  for (const qId of canonicalIds) {
    const q = canonicalById.get(qId);
    if (!q) continue;

    if (isMcqOptionRandomizable(q)) {
      const canonicalOpts = getCanonicalOptions(q);
      const optOrder = map.optionOrders?.[qId];
      if (!Array.isArray(optOrder)) {
        errors.push(`Missing randomized option order for MCQ question "${qId}".`);
      } else {
        if (optOrder.length !== canonicalOpts.length) {
          errors.push(
            `Option count mismatch for question "${qId}": expected ${canonicalOpts.length}, got ${optOrder.length}.`
          );
        }
        const seenOptIndices = new Set<number>();
        for (const rawOptId of optOrder) {
          const origIdx = parseOptionIndex(rawOptId);
          if (origIdx === null || origIdx < 0 || origIdx >= canonicalOpts.length) {
            errors.push(`Invalid option ID "${String(rawOptId)}" for question "${qId}".`);
            continue;
          }
          if (seenOptIndices.has(origIdx)) {
            errors.push(`Duplicate option ID "${String(rawOptId)}" in question "${qId}".`);
            continue;
          }
          seenOptIndices.add(origIdx);
        }
        for (let i = 0; i < canonicalOpts.length; i++) {
          if (!seenOptIndices.has(i)) {
            errors.push(`Missing original option "opt_${i}" in question "${qId}".`);
          }
        }
      }
    }

    const subQs = getCanonicalSubQuestions(q);
    if (subQs.length > 0) {
      const subMapForQ = map.subOptionOrders?.[qId];
      for (let sqIdx = 0; sqIdx < subQs.length; sqIdx++) {
        const sq = subQs[sqIdx];
        if (sq?.type === 'mcq') {
          const sqOpts = safeParseArray(sq.options);
          if (sqOpts.length > 1) {
            const sqKey = String(sq.id || `sq_${sqIdx}`);
            const sqOptOrder = subMapForQ?.[sqKey];
            if (!Array.isArray(sqOptOrder)) {
              errors.push(`Missing randomized option order for sub-question "${sqKey}" in question "${qId}".`);
            } else {
              if (sqOptOrder.length !== sqOpts.length) {
                errors.push(
                  `Sub-question option count mismatch for "${sqKey}" in "${qId}": expected ${sqOpts.length}, got ${sqOptOrder.length}.`
                );
              }
              const seenSqIndices = new Set<number>();
              for (const rawOptId of sqOptOrder) {
                const origIdx = parseOptionIndex(rawOptId);
                if (origIdx === null || origIdx < 0 || origIdx >= sqOpts.length) {
                  errors.push(`Invalid sub-option ID "${String(rawOptId)}" for "${sqKey}" in "${qId}".`);
                  continue;
                }
                if (seenSqIndices.has(origIdx)) {
                  errors.push(`Duplicate sub-option ID "${String(rawOptId)}" for "${sqKey}" in "${qId}".`);
                  continue;
                }
                seenSqIndices.add(origIdx);
              }
              for (let i = 0; i < sqOpts.length; i++) {
                if (!seenSqIndices.has(i)) {
                  errors.push(`Missing sub-option "opt_${i}" for "${sqKey}" in "${qId}".`);
                }
              }
            }
          }
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Generates an independent per-attempt randomization map from canonical questions.
 * - Shuffles questionOrder among the exam's questions (exact permutation, zero duplicates/omissions).
 * - Shuffles options strictly within each individual MCQ (and MCQ sub-questions).
 * - NEVER mixes options across different questions or mutates the canonical input array.
 */
export function buildQuizRandomizationMap(
  canonicalQuestions: readonly any[],
  randomIntFn: RandomIntFn = defaultCryptoRandomInt
): QuizRandomizationMap {
  const questions = Array.isArray(canonicalQuestions) ? canonicalQuestions : [];
  if (questions.length === 0) {
    throw new Error('Cannot randomize an empty question list.');
  }

  const seenInputIds = new Set<string>();
  const questionIds: string[] = [];
  for (let idx = 0; idx < questions.length; idx++) {
    const qId = getCanonicalQuestionId(questions[idx], idx);
    if (seenInputIds.has(qId)) {
      throw new Error(`Duplicate canonical question ID "${qId}" detected while building randomization map.`);
    }
    seenInputIds.add(qId);
    questionIds.push(qId);
  }

  const questionOrder = shuffleArray(questionIds, randomIntFn);
  const optionOrders: Record<string, string[]> = {};
  const subOptionOrders: Record<string, Record<string, string[]>> = {};

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const qId = questionIds[i];

    if (isMcqOptionRandomizable(q)) {
      const opts = getCanonicalOptions(q);
      const optIds = opts.map((_, optIdx) => `opt_${optIdx}`);
      optionOrders[qId] = shuffleArray(optIds, randomIntFn);
    }

    const subQs = getCanonicalSubQuestions(q);
    if (subQs.length > 0) {
      const subMap: Record<string, string[]> = {};
      for (let sqIdx = 0; sqIdx < subQs.length; sqIdx++) {
        const sq = subQs[sqIdx];
        if (sq?.type === 'mcq') {
          const sqOpts = safeParseArray(sq.options);
          if (sqOpts.length > 1) {
            const sqKey = String(sq.id || `sq_${sqIdx}`);
            const sqOptIds = sqOpts.map((_, optIdx) => `opt_${optIdx}`);
            subMap[sqKey] = shuffleArray(sqOptIds, randomIntFn);
          }
        }
      }
      if (Object.keys(subMap).length > 0) {
        subOptionOrders[qId] = subMap;
      }
    }
  }

  const map: QuizRandomizationMap = {
    version: 1,
    questionOrder,
    optionOrders,
    subOptionOrders,
    createdAt: new Date().toISOString(),
  };

  const check = validateQuizRandomizationMap(questions, map);
  if (!check.valid) {
    throw new Error(`Randomization self-check failed: ${check.errors.join('; ')}`);
  }

  return map;
}

/**
 * Safely parses a randomization map returned from API or local storage.
 */
export function parseRandomizationMap(raw: any): QuizRandomizationMap | null {
  if (!raw) return null;
  let obj = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.questionOrder)) {
    return null;
  }
  return {
    version: 1,
    questionOrder: obj.questionOrder.map((id: any) => String(id ?? '')),
    optionOrders: obj.optionOrders && typeof obj.optionOrders === 'object' ? obj.optionOrders : {},
    subOptionOrders: obj.subOptionOrders && typeof obj.subOptionOrders === 'object' ? obj.subOptionOrders : {},
    createdAt: obj.createdAt,
  };
}

function buildRandomizedOptionsForList(
  canonicalOptions: string[],
  orderedOptionIds?: string[]
): RandomizedOptionItem[] {
  const seenIndices = new Set<number>();
  const result: RandomizedOptionItem[] = [];

  if (Array.isArray(orderedOptionIds)) {
    for (const rawId of orderedOptionIds) {
      const origIdx = parseOptionIndex(rawId);
      if (origIdx !== null && origIdx >= 0 && origIdx < canonicalOptions.length && !seenIndices.has(origIdx)) {
        seenIndices.add(origIdx);
        result.push({
          optionId: `opt_${origIdx}`,
          origIndex: origIdx,
          text: canonicalOptions[origIdx],
        });
      }
    }
  }

  // Deterministic fallback for any option missing from a partial order
  for (let i = 0; i < canonicalOptions.length; i++) {
    if (!seenIndices.has(i)) {
      seenIndices.add(i);
      result.push({
        optionId: `opt_${i}`,
        origIndex: i,
        text: canonicalOptions[i],
      });
    }
  }

  return result;
}

/**
 * Applies a validated QuizRandomizationMap to a quiz without mutating original canonical data.
 * Creates fresh copies of question objects and attaches `randomizedOptions` to MCQs and MCQ sub-questions.
 * Throws or returns null? Never silently fixes an invalid map — returns a fresh randomized copy,
 * and callers must verify via `validateRandomizedQuiz` before displaying the exam.
 */
export function applyQuizRandomization(
  quiz: QuizItem,
  map: QuizRandomizationMap | null | undefined
): QuizItem {
  if (!quiz || !Array.isArray(quiz.questions) || quiz.questions.length === 0) {
    return quiz;
  }
  if (!map || !Array.isArray(map.questionOrder)) {
    return quiz;
  }

  const byId = new Map<string, QuestionItem>();
  quiz.questions.forEach((q, idx) => {
    const qId = getCanonicalQuestionId(q, idx);
    if (!byId.has(qId)) {
      byId.set(qId, q);
    }
  });

  const orderedQuestions: Array<{ q: QuestionItem; qId: string }> = [];
  const usedIds = new Set<string>();

  for (const rawId of map.questionOrder) {
    const qId = String(rawId || '').trim();
    const match = byId.get(qId);
    if (match && !usedIds.has(qId)) {
      usedIds.add(qId);
      orderedQuestions.push({ q: match, qId });
    }
  }

  const mappedQuestions: QuestionItem[] = orderedQuestions.map(({ q, qId }) => {
    const clone: QuestionItem = {
      ...q,
      id: qId,
      options: Array.isArray(q.options) ? [...q.options] : q.options,
    };

    if (isMcqOptionRandomizable(q)) {
      const canonicalOpts = getCanonicalOptions(q);
      clone.randomizedOptions = buildRandomizedOptionsForList(
        canonicalOpts,
        map.optionOrders?.[qId]
      );
    }

    const subQs = getCanonicalSubQuestions(q);
    if (subQs.length > 0) {
      const subMapForQ = map.subOptionOrders?.[qId];
      const mappedSubs: SubQuestionItem[] = subQs.map((sq: SubQuestionItem, sqIdx: number) => {
        const sqKey = String(sq.id || `sq_${sqIdx}`);
        if (sq.type === 'mcq' && Array.isArray(sq.options) && sq.options.length > 0) {
          const sqOpts = sq.options.map((o: any) => (typeof o === 'string' ? o : String(o ?? '')));
          return {
            ...sq,
            options: [...sqOpts],
            randomizedOptions: buildRandomizedOptionsForList(
              sqOpts,
              subMapForQ?.[sqKey]
            ),
          };
        }
        return { ...sq };
      });
      clone.subQuestions = mappedSubs;
    }

    return clone;
  });

  return {
    ...quiz,
    questions: mappedQuestions,
  };
}

/**
 * Mandatory pre-display integrity check comparing the original canonical quiz
 * against the randomization map and final randomized quiz shown to the student.
 */
export function validateRandomizedQuiz(
  originalQuiz: QuizItem,
  map: QuizRandomizationMap | null | undefined,
  randomizedQuiz: QuizItem | null | undefined
): RandomizationValidationResult {
  const errors: string[] = [];

  if (!originalQuiz || !Array.isArray(originalQuiz.questions) || originalQuiz.questions.length === 0) {
    return { valid: false, errors: ['Original quiz has no questions.'] };
  }

  const mapCheck = validateQuizRandomizationMap(originalQuiz.questions, map);
  if (!mapCheck.valid) {
    errors.push(...mapCheck.errors);
  }

  if (!randomizedQuiz || !Array.isArray(randomizedQuiz.questions)) {
    errors.push('Randomized quiz questions array is missing.');
    return { valid: false, errors };
  }

  if (randomizedQuiz.questions.length !== originalQuiz.questions.length) {
    errors.push(
      `Displayed question count (${randomizedQuiz.questions.length}) does not match original (${originalQuiz.questions.length}).`
    );
  }

  const originalById = new Map<string, QuestionItem>();
  for (let i = 0; i < originalQuiz.questions.length; i++) {
    const oq = originalQuiz.questions[i];
    const qId = getCanonicalQuestionId(oq, i);
    if (originalById.has(qId)) {
      errors.push(`Duplicate original question ID "${qId}".`);
    } else {
      originalById.set(qId, oq);
    }
  }

  const seenDisplayedIds = new Set<string>();
  for (let i = 0; i < randomizedQuiz.questions.length; i++) {
    const rq = randomizedQuiz.questions[i];
    const qId = getCanonicalQuestionId(rq, i);

    if (seenDisplayedIds.has(qId)) {
      errors.push(`Duplicate displayed question ID "${qId}" at position ${i + 1}.`);
      continue;
    }
    seenDisplayedIds.add(qId);

    const oq = originalById.get(qId);
    if (!oq) {
      errors.push(`Displayed question "${qId}" does not exist in original quiz.`);
      continue;
    }

    // Verify canonical prompt/type/options remained untouched
    if ((rq.questionText || '') !== (oq.questionText || '') || rq.type !== oq.type) {
      errors.push(`Question "${qId}" prompt or type does not match canonical record.`);
    }

    const origOpts = getCanonicalOptions(oq);
    const randCanonicalOpts = getCanonicalOptions(rq);
    if (
      origOpts.length !== randCanonicalOpts.length ||
      origOpts.some((opt, idx) => opt !== randCanonicalOpts[idx])
    ) {
      errors.push(`Canonical options mismatch on question "${qId}".`);
    }

    // Verify MCQ randomizedOptions belong strictly to THIS question with zero duplicates/omissions
    if (isMcqOptionRandomizable(oq)) {
      const rOpts = rq.randomizedOptions;
      if (!Array.isArray(rOpts) || rOpts.length !== origOpts.length) {
        errors.push(`Randomized options count mismatch on question "${qId}".`);
      } else {
        const seenOptIdx = new Set<number>();
        for (const item of rOpts) {
          if (
            !item ||
            typeof item.origIndex !== 'number' ||
            item.origIndex < 0 ||
            item.origIndex >= origOpts.length
          ) {
            errors.push(`Invalid option origIndex on question "${qId}".`);
            continue;
          }
          if (seenOptIdx.has(item.origIndex)) {
            errors.push(`Duplicate option index ${item.origIndex} on question "${qId}".`);
            continue;
          }
          seenOptIdx.add(item.origIndex);
          if (item.text !== origOpts[item.origIndex]) {
            errors.push(`Option text mismatch at ${item.optionId} on question "${qId}".`);
          }
        }
        for (let idx = 0; idx < origOpts.length; idx++) {
          if (!seenOptIdx.has(idx)) {
            errors.push(`Missing original option ${idx} on question "${qId}".`);
          }
        }
      }
    }

    // Verify sub-question MCQ randomizedOptions belong strictly to each sub-question
    const origSubs = getCanonicalSubQuestions(oq);
    const randSubs = getCanonicalSubQuestions(rq);
    if (origSubs.length !== randSubs.length) {
      errors.push(`Sub-question count mismatch on question "${qId}".`);
    } else {
      for (let sqIdx = 0; sqIdx < origSubs.length; sqIdx++) {
        const osq = origSubs[sqIdx];
        const rsq = randSubs[sqIdx];
        if (osq?.type === 'mcq') {
          const origSqOpts = safeParseArray(osq.options).map((o: any) => (typeof o === 'string' ? o : String(o ?? '')));
          if (origSqOpts.length > 1) {
            const rSqOpts = rsq?.randomizedOptions;
            if (!Array.isArray(rSqOpts) || rSqOpts.length !== origSqOpts.length) {
              errors.push(`Sub-question randomized options count mismatch on "${qId}" part ${sqIdx + 1}.`);
            } else {
              const seenSqOptIdx = new Set<number>();
              for (const item of rSqOpts) {
                if (
                  !item ||
                  typeof item.origIndex !== 'number' ||
                  item.origIndex < 0 ||
                  item.origIndex >= origSqOpts.length
                ) {
                  errors.push(`Invalid sub-option origIndex on "${qId}" part ${sqIdx + 1}.`);
                  continue;
                }
                if (seenSqOptIdx.has(item.origIndex)) {
                  errors.push(`Duplicate sub-option index ${item.origIndex} on "${qId}" part ${sqIdx + 1}.`);
                  continue;
                }
                seenSqOptIdx.add(item.origIndex);
                if (item.text !== origSqOpts[item.origIndex]) {
                  errors.push(`Sub-option text mismatch on "${qId}" part ${sqIdx + 1}.`);
                }
              }
              for (let idx = 0; idx < origSqOpts.length; idx++) {
                if (!seenSqOptIdx.has(idx)) {
                  errors.push(`Missing original sub-option ${idx} on "${qId}" part ${sqIdx + 1}.`);
                }
              }
            }
          }
        }
      }
    }
  }

  for (const origId of originalById.keys()) {
    if (!seenDisplayedIds.has(origId)) {
      errors.push(`Original question "${origId}" is missing from displayed examination.`);
    }
  }

  return { valid: errors.length === 0, errors };
}
