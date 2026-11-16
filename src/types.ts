export interface ClassItem {
  id: string;
  name: string; // e.g., "Grade 9", "Grade 10", "AP Physics"
  section?: string; // e.g., "Section A", "Morning Batch"
  description?: string;
  icon?: string;
  color?: string; // Tailwind color class or hex
  password?: string; // Class passcode for students (returned only to Admin)
  hasPassword?: boolean; // Public indicator whether class portal requires passcode
}

export type FileType = 'pdf' | 'doc' | 'image' | 'video' | 'audio' | 'link' | 'note' | 'archive' | 'other';

export interface FileItem {
  id: string;
  title: string;
  description: string;
  classId: string; // matches ClassItem.id or "all"
  subject: string; // e.g., "Mathematics", "Science", "English", "Notice/Announcement"
  fileType: FileType;
  fileName: string;
  fileSize?: number; // bytes
  fileBlobId?: string; // key in IndexedDB for binary stored files
  fileDataUrl?: string; // Base64 / data URL or text content for generated notes
  externalUrl?: string; // URL for external links (Google Drive, YouTube, etc.)
  uploadDate: string; // ISO string
  uploaderName?: string; // e.g., "Prof. Smith", "Admin"
  isPinned?: boolean;
  isLocked?: boolean; // Protect file with passcode
  filePassword?: string; // 4-digit file unlock PIN
  downloadsCount: number;
  tags?: string[];
}

export interface SubjectCategory {
  id: string;
  name: string;
  color: string;
}

export type ViewMode = 'grid' | 'list';
export type SortOption = 'newest' | 'oldest' | 'title' | 'downloads';
export type BackgroundStyle =
  | 'aurora'      // Apple Sonoma / Ambient Mesh Glow (Lush, rich daylight lighting)
  | 'blueprint'   // Crisp Architectural Grid / Academic Paper (Notion style)
  | 'silk'        // Smooth 3D Fluid Satin Wave (No dots)
  | 'wallpaper'   // Curated HD Abstract Wallpaper (macOS / Zorin aesthetic)
  | 'matrix'      // Cyber Matrix Constellation (for dark mode tech fans)
  | 'minimal';    // Pure Clean Studio Off-White


// QUESTION & QUIZ SYSTEM TYPES
export type QuestionType =
  | 'mcq'
  | 'true_false'
  | 'fill_blanks'
  | 'match_following'
  | 'picture_question'
  | 'question_answer';

export interface MatchingPair {
  id: string;
  left: string;
  right: string;
}

export interface BlankItem {
  id: string;
  prefix?: string; // e.g. "The capital of France is"
  suffix?: string; // e.g. "and it is famous for the Eiffel Tower."
  correctAnswer: string; // e.g. "Paris"
  points?: number; // Marks for this blank (e.g. 1)
  options?: string[]; // Optional specific choices for this blank
}

export interface SubQuestionItem {
  id: string;
  label?: string; // e.g. "(a)", "(b)", "(c)"
  questionText: string;
  points: number;
  correctAnswer: string;
  gradingRubric?: string;
  type?: 'text' | 'mcq';
  options?: string[]; // for sub MCQ options
  randomizedOptions?: Array<{ optionId: string; origIndex: number; text: string }>; // ephemeral display-only shuffled options during active exam
}

export interface QuestionItem {
  id: string;
  quizId?: string;
  type: QuestionType;
  questionText: string;
  imageUrl?: string; // for picture questions or diagram references
  points: number; // marks for this question
  options?: string[]; // for MCQ choices OR Word Bank / Choices for Fill in the Blanks!
  randomizedOptions?: Array<{ optionId: string; origIndex: number; text: string }>; // ephemeral display-only shuffled options during active exam
  matchingPairs?: MatchingPair[]; // for match the following
  blankTemplate?: string; // optional hint or template for fill in blanks
  blankItems?: BlankItem[]; // for multi-item fill in blanks inside one question
  subQuestions?: SubQuestionItem[]; // for picture/diagram questions with structured sub-questions (a, b, c)
  correctAnswer: string; // Teacher's reference answer (HIDDEN from students during test!)
  gradingRubric?: string; // Optional teacher guidance/rubric for AI evaluator
  orderIndex?: number;
}

export interface QuizItem {
  id: string;
  title: string;
  description: string;
  classId: string; // matches ClassItem.id
  subject: string;
  timeLimitMinutes?: number; // 0 for unlimited
  totalPoints: number;
  isPublished: boolean;
  createdAt: string;
  createdBy?: string;
  questions: QuestionItem[];
}

export interface SubQuestionEvaluation {
  subQuestionId: string;
  label?: string;
  questionText?: string;
  pointsAwarded: number;
  maxPoints: number;
  isCorrect: boolean | 'partial';
  feedback: string;
  explanation: string;
  studentAnswer: any;
  selectedOptionId?: string;
  correctAnswer?: string;
}

export interface QuestionEvaluation {
  questionId: string;
  questionText?: string;
  type?: string;
  imageUrl?: string;
  options?: string[];
  optionImages?: string[];
  matchingPairs?: MatchingPair[];
  blankItems?: BlankItem[];
  blankTemplate?: string;
  pointsAwarded: number;
  maxPoints: number;
  isCorrect: boolean | 'partial';
  feedback: string;
  explanation: string;
  studentAnswer: any;
  selectedOptionId?: string;
  correctAnswer?: string;
  gradingRubric?: string;
  subEvaluations?: SubQuestionEvaluation[];
}

export interface QuizEvaluationReport {
  submissionId: string;
  quizId: string;
  quizTitle: string;
  studentName: string;
  studentRoll?: string;
  studentId?: string;
  attemptId?: string;
  classId: string;
  subject: string;
  submittedAt: string;
  totalScore: number;
  maxScore: number;
  percentage: number;
  gradeLetter: string; // 'A+', 'A', 'B', 'C', 'D', 'F'
  overallFeedback: string;
  strengths?: string[];
  improvements?: string[];
  questions: QuestionEvaluation[];
  educationalProfile?: {
    gradeLevel: string;
    schoolStage: string;
    ageRange: string;
    personaSummary: string;
  };
}

export interface QuizSubmission {
  id: string; // unique submissionId
  quizId: string; // testId
  quizTitle?: string;
  studentName: string;
  studentRoll?: string;
  studentId?: string; // Links to StudentUser.studentId
  attemptId?: string; // Unique attempt identifier
  classId: string;
  subject?: string;
  submittedAt: string;
  studentAnswers: Record<string, any>;
  evaluation?: QuizEvaluationReport;
  aiEvaluation?: QuizEvaluationReport;
  totalScore?: number;
  maxScore?: number;
  status: 'graded' | 'pending';
}

export interface StudentUser {
  id: string;
  studentId: string; // Unique student identifier / username (e.g. STU101)
  rollNo?: string; // Roll number in class (e.g. 15, 07, 1A, 2B)
  section?: 'A' | 'B' | string;
  name: string;
  classId: string;
  password?: string; // Hidden on client except admin view
  createdAt?: string;
  lastLogin?: string;
}

export interface QuizAttempt {
  id: string;
  quizId: string;
  studentId: string;
  studentName: string;
  startedAt: string;
  status: 'in_progress' | 'submitted';
}

export interface LiveExamAttempt {
  attemptId: string;
  quizId: string;
  quizTitle: string;
  quizSubject?: string;
  classId: string;
  studentId: string;
  studentName: string;
  studentRoll?: string;
  status: 'in_progress' | 'submitted';
  answeredCount: number;
  totalQuestions: number;
  liveScore: number;
  maxScore: number;
  progressPercentage: number;
  startedAt?: string;
  updatedAt?: string;
  submissionId?: string;
  gradeLetter?: string;
}

// HOMEWORK & TERM LESSON CURRICULUM TYPES
export type TermType = 'term1' | 'term2' | 'term3' | 'term4';

export interface HomeworkItem {
  id: string;
  classId: string; // matches ClassItem.id or "all"
  subject: string;
  title: string;
  description: string;
  assignedDate: string; // YYYY-MM-DD (English AD)
  dueDate: string; // YYYY-MM-DD (English AD)
  assignedDateBS?: string; // Nepali Bikram Sambat Date (e.g. "२०८३-०५-३०" or "2083 Bhadra 30")
  dueDateBS?: string; // Nepali Bikram Sambat Date (e.g. "२०८३-०५-३१" or "2083 Bhadra 31")
  term?: TermType; // Optional legacy property
  priority?: 'normal' | 'high' | 'urgent';
  submissionInstructions?: string; // e.g. "Submit in class exercise copy"
  pageReference?: string; // e.g. "Textbook Pg 54, Exercise 4.2"
  teacherName?: string;
  createdAt?: string;
}

export type LessonStatus = 'planned' | 'in_progress' | 'completed';

export interface LessonItem {
  id: string;
  classId: string; // matches ClassItem.id
  subject: string;
  term: TermType; // 'term1' | 'term2' | 'term3' | 'term4'
  unit?: string; // e.g. "Unit 1", "Unit 2", "Algebra"
  lessonNo?: string; // e.g. "Lesson 1", "Lesson 2", "1", "2"
  chapterNo?: string; // e.g. "Chapter 1", "Unit 2"
  title: string;
  description?: string;
  topicsCovered?: string[];
  status: LessonStatus;
  estimatedWeeks?: string; // e.g. "Weeks 1-3"
  orderIndex: number;
  resourceFileId?: string;
  createdAt?: string;
}

