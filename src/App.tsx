import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ClassItem,
  FileItem,
  ViewMode,
  SortOption,
  SubjectCategory,
  QuizItem,
  QuizEvaluationReport,
  StudentUser,
  HomeworkItem,
  LessonItem,
  LessonStatus,
  TermType,
} from './types';
import { INITIAL_CLASSES, INITIAL_FILES } from './lib/sampleData';
import {
  fetchClasses,
  saveClass,
  deleteClass as deleteClassFromApi,
  fetchSubjects,
  saveSubject,
  deleteSubject as deleteSubjectFromApi,
  fetchFiles,
  saveFile as saveFileToApi,
  deleteFile as deleteFileFromApi,
  incrementDownloadCount,
  fetchQuizzes,
  fetchQuizById,
  saveQuiz as saveQuizToApi,
  deleteQuiz as deleteQuizFromApi,
  fetchHomeworkList,
  saveHomeworkItem,
  deleteHomeworkItem,
  fetchLessonList,
  saveLessonItem,
  updateLessonStatus,
  deleteLessonItem,
  fetchStudents,
  getAdminToken,
  setAdminToken,
  setStudentToken,
} from './lib/api';
import { triggerFileDownload } from './lib/db';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { MobileBottomNav } from './components/MobileBottomNav';
import { AnimatedDotMatrix } from './components/AnimatedDotMatrix';
import { ClassPortal } from './components/ClassPortal';
import { ClassSelector } from './components/ClassSelector';
import { FilterBar } from './components/FilterBar';
import { FileCard } from './components/FileCard';
import { FilePreviewModal } from './components/FilePreviewModal';
import { FileUnlockModal } from './components/FileUnlockModal';
import { AdminPanel } from './components/AdminPanel';
import { PinModal } from './components/PinModal';
import { QuizList } from './components/QuizList';
import { QuizTaker } from './components/QuizTaker';
import { QuizReportModal } from './components/QuizReportModal';
import { QuizEditorModal } from './components/QuizEditorModal';
import { SubmissionsListView } from './components/SubmissionsListView';
import { PrintAssessmentModal } from './components/PrintAssessmentModal';
import { StudentAuthModal } from './components/StudentAuthModal';
import { StudentIdPassModal } from './components/StudentIdPassModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { HomeworkView } from './components/HomeworkView';
import { LessonListView } from './components/LessonListView';
import { HomeworkModal } from './components/HomeworkModal';
import { LessonModal } from './components/LessonModal';
import { ClassManagerModal } from './components/ClassManagerModal';
import {
  FolderOpen,
  Folder,
  CheckCircle2,
  Plus,
  FileQuestion,
  FileText,
  Award,
  Sparkles,
  Download,
  Settings,
  ShieldCheck,
  Lock,
  Sun,
  Moon,
  LogOut,
  UserCheck,
  Minus,
  Square,
  X,
  Activity,
  Maximize2,
  BookOpen,
  Layers,
  ArrowRight,
  GraduationCap,
  Users,
  Key,
  RefreshCw,
  Clock,
  ChevronRight,
  Eye,
  Printer,
  Search,
  CalendarCheck,
  ListOrdered,
} from 'lucide-react';

export default function App() {
  // Database & state
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [quizzes, setQuizzes] = useState<QuizItem[]>([]);
  const [homeworkList, setHomeworkList] = useState<HomeworkItem[]>([]);
  const [lessonList, setLessonList] = useState<LessonItem[]>([]);
  const [subjects, setSubjects] = useState<SubjectCategory[]>([
    { id: 'all', name: 'All Subjects', color: 'bg-slate-100 text-slate-700' },
  ]);

  // Active top-level Tab: 'files' (Materials) | 'homework' (Homework of the Day) | 'lessons' (Term Lessons) | 'quizzes' (Tests)
  const [activeTab, setActiveTab] = useState<'files' | 'quizzes' | 'homework' | 'lessons'>('files');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);

  // Homework & Lesson Modals state
  const [isHomeworkModalOpen, setIsHomeworkModalOpen] = useState<boolean>(false);
  const [editingHomework, setEditingHomework] = useState<HomeworkItem | null>(null);
  const [isLessonModalOpen, setIsLessonModalOpen] = useState<boolean>(false);
  const [editingLesson, setEditingLesson] = useState<LessonItem | null>(null);
  const [lessonModalDefaultTerm, setLessonModalDefaultTerm] = useState<TermType>('term1');

  // Class & Student sessions live in memory only so refreshing the browser logs users out cleanly
  const [unlockedClassId, setUnlockedClassId] = useState<string | null>(null);

  const [selectedClassId, setSelectedClassId] = useState<string>('all');
  const [selectedSubject, setSelectedSubject] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [sortOption, setSortOption] = useState<SortOption>('newest');

  // Admin & Modals
  const [isAdmin, setIsAdmin] = useState<boolean>(() => Boolean(getAdminToken()));
  const [adminName, setAdminName] = useState<string>('Sudeep Shrestha');
  const [isPinModalOpen, setIsPinModalOpen] = useState<boolean>(false);
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState<boolean>(false);
  const [adminPanelInitialTab, setAdminPanelInitialTab] = useState<'upload' | 'classes' | 'subjects' | 'students' | 'tests' | 'settings'>('upload');
  const [isClassManagerOpen, setIsClassManagerOpen] = useState<boolean>(false);
  const [editingFile, setEditingFile] = useState<FileItem | null>(null);
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null);

  // Light & Dark Theme State
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('scholarboard_theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    if (theme === 'light') {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    }
    localStorage.setItem('scholarboard_theme', theme);
  }, [theme]);

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Student Authentication State (Session-only: logs out on browser refresh)
  const [currentStudent, setCurrentStudent] = useState<StudentUser | null>(null);
  const [isStudentAuthOpen, setIsStudentAuthOpen] = useState<boolean>(false);
  const [studentAuthInitialMode, setStudentAuthInitialMode] = useState<'login' | 'register'>('login');

  const handleOpenStudentAuth = (mode: 'login' | 'register' = 'login') => {
    setStudentAuthInitialMode(mode);
    setIsStudentAuthOpen(true);
  };

  // Quiz / Assessment Interaction States (persisted to prevent sudden test ejection)
  const [activeQuizTaking, setActiveQuizTakingState] = useState<QuizItem | null>(null);

  const setActiveQuizTaking = useCallback((quiz: QuizItem | null) => {
    setActiveQuizTakingState(quiz);
    try {
      if (quiz) {
        sessionStorage.setItem('scholarboard_active_quiz_id', quiz.id);
        localStorage.setItem('scholarboard_active_quiz_id', quiz.id);
      } else {
        sessionStorage.removeItem('scholarboard_active_quiz_id');
        localStorage.removeItem('scholarboard_active_quiz_id');
      }
    } catch {
      // ignore
    }
  }, []);

  const [activeEvaluationReport, setActiveEvaluationReport] = useState<QuizEvaluationReport | null>(null);
  const [isReportModalOpen, setIsReportModalOpen] = useState<boolean>(false);
  const [isQuizEditorOpen, setIsQuizEditorOpen] = useState<boolean>(false);
  const [editingQuiz, setEditingQuiz] = useState<QuizItem | null>(null);
  const [isSubmissionsViewOpen, setIsSubmissionsViewOpen] = useState<boolean>(false);
  const [filterSubmissionQuizId, setFilterSubmissionQuizId] = useState<string | undefined>(undefined);
  const [filterStudentQuery, setFilterStudentQuery] = useState<string>('');
  const [isPrintModalOpen, setIsPrintModalOpen] = useState<boolean>(false);
  const [printingQuiz, setPrintingQuiz] = useState<QuizItem | null>(null);

  // Student ID & Password examination pass modal state (direct access from Header for Admins)
  const [isStudentIdPassModalOpen, setIsStudentIdPassModalOpen] = useState<boolean>(false);
  const [studentsForPasses, setStudentsForPasses] = useState<StudentUser[]>([]);

  const handleOpenStudentIdPassModal = async () => {
    try {
      const data = await fetchStudents();
      setStudentsForPasses(data);
    } catch (err) {
      console.error('Failed to load students for ID passes:', err);
    }
    setIsStudentIdPassModalOpen(true);
  };

  const handleOpenPrintModal = async (quiz: QuizItem) => {
    if (!isAdmin) {
      showToast('Question paper printing is reserved for teachers and administrators.', 'info');
      return;
    }
    try {
      const fresh = await fetchQuizById(quiz.id, false);
      setPrintingQuiz(fresh || quiz);
    } catch {
      setPrintingQuiz(quiz);
    }
    setIsPrintModalOpen(true);
  };

  // File Lock/Unlock states
  const [unlockedFileIds, setUnlockedFileIds] = useState<string[]>([]);
  const [pendingUnlockFile, setPendingUnlockFile] = useState<{ file: FileItem; action: 'open' | 'download' } | null>(null);

  const handleStudentLogin = (student: StudentUser) => {
    // If student is inside an unlocked class portal, verify they belong to this class
    if (unlockedClassId && student.classId && student.classId !== unlockedClassId) {
      showToast('The account does not exist in this class.', 'error');
      return;
    }
    setCurrentStudent(student);
    // Unlock and lock to the student's class (in-memory only for this page session)
    if (student.classId) {
      setUnlockedClassId(student.classId);
      setSelectedClassId(student.classId);
    }
    showToast(`Welcome back, ${student.name}!`, 'success');
  };

  // Notification Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // Explicit logout function when student clicks Log Out
  const handleStudentLogout = useCallback(() => {
    setCurrentStudent(null);
    setStudentToken(null);
    try {
      localStorage.removeItem('scholarboard_student');
      sessionStorage.removeItem('scholarboard_active_quiz_id');
      localStorage.removeItem('scholarboard_active_quiz_id');
    } catch {
      // ignore
    }
    setActiveQuizTaking(null);
    showToast('Signed out from student account.', 'info');
  }, [showToast, setActiveQuizTaking]);

  // Full logout function (used when explicitly exiting portal)
  const handleLogoutEverything = useCallback((noticeMessage?: string) => {
    setCurrentStudent(null);
    setStudentToken(null);
    setAdminToken(null);
    try {
      localStorage.removeItem('scholarboard_student');
      sessionStorage.removeItem('scholarboard_active_quiz_id');
    } catch {
      // ignore
    }

    setUnlockedClassId(null);
    setSelectedClassId('all');
    setActiveQuizTaking(null);
    setActiveEvaluationReport(null);
    setIsReportModalOpen(false);
    setIsSubmissionsViewOpen(false);

    setIsAdmin(false);
    setIsAdminPanelOpen(false);
    setIsPinModalOpen(false);
    setIsStudentAuthOpen(false);
    setIsQuizEditorOpen(false);
    setIsPrintModalOpen(false);
    setPrintingQuiz(null);
    setUnlockedFileIds([]);
    setPendingUnlockFile(null);

    if (noticeMessage) {
      showToast(noticeMessage, 'info');
    }
  }, [showToast]);

  // Safe navigation & test protection:
  // Warn only if an assessment is actively in progress so student doesn't accidentally lose answers
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (activeQuizTaking && !isReportModalOpen) {
        e.preventDefault();
        e.returnValue = 'You have an examination in progress. Are you sure you want to leave?';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [activeQuizTaking, isReportModalOpen]);

  const handleFileUnlockSuccess = (file: FileItem, action: 'open' | 'download') => {
    setUnlockedFileIds((prev) => [...prev, file.id]);
    showToast(`Unlocked "${file.title}" successfully!`, 'success');
    if (action === 'open') {
      setPreviewFile(file);
    } else if (action === 'download') {
      handleDownloadFile(file);
    }
  };

  // Initial Data Loader from PostgreSQL database (Parallelized for fast concurrent classroom loads)
  useEffect(() => {
    let cancelled = false;

    async function loadInitialData() {
      try {
        const hasAdminSession = Boolean(getAdminToken());
        const [
          subjectsRes,
          classesRes,
          filesRes,
          quizzesRes,
          homeworkRes,
          lessonsRes,
        ] = await Promise.allSettled([
          fetchSubjects(),
          fetchClasses(),
          fetchFiles(),
          fetchQuizzes({ isStudent: !hasAdminSession }),
          fetchHomeworkList(),
          fetchLessonList(),
        ]);

        if (cancelled) return;

        if (subjectsRes.status === 'fulfilled' && Array.isArray(subjectsRes.value)) {
          const loaded = subjectsRes.value;
          const allItem = loaded.find((s) => s.id === 'all') || {
            id: 'all',
            name: 'All Subjects',
            color: 'bg-slate-100 text-slate-700',
          };
          setSubjects([allItem, ...loaded.filter((s) => s.id !== 'all')]);
        }
        if (classesRes.status === 'fulfilled') setClasses(classesRes.value);
        if (filesRes.status === 'fulfilled') setFiles(filesRes.value);

        const dbQuizzes = quizzesRes.status === 'fulfilled' ? quizzesRes.value : [];
        if (quizzesRes.status === 'fulfilled') setQuizzes(dbQuizzes);

        if (homeworkRes.status === 'fulfilled') setHomeworkList(homeworkRes.value);
        if (lessonsRes.status === 'fulfilled') setLessonList(lessonsRes.value);
      } catch (err) {
        console.error('Error fetching data from PostgreSQL database:', err);
      }
    }

    loadInitialData();
    return () => {
      cancelled = true;
    };
  }, []);

  // Homework Handlers
  const handleSaveHomework = async (item: Partial<HomeworkItem>) => {
    try {
      await saveHomeworkItem(item);
      const updated = await fetchHomeworkList();
      setHomeworkList(updated);
      showToast(item.id ? 'Homework assignment updated!' : 'Homework assigned successfully!', 'success');
      setIsHomeworkModalOpen(false);
      setEditingHomework(null);
    } catch (err: any) {
      showToast(err.message || 'Failed to save homework assignment', 'error');
    }
  };

  const handleDeleteHomework = async (id: string) => {
    try {
      await deleteHomeworkItem(id);
      setHomeworkList((prev) => prev.filter((hw) => hw.id !== id));
      showToast('Homework deleted successfully from database.', 'info');
    } catch (err: any) {
      showToast(err.message || 'Failed to delete homework', 'error');
    }
  };

  // Lesson Handlers
  const handleSaveLesson = async (item: Partial<LessonItem>) => {
    try {
      await saveLessonItem(item);
      const updated = await fetchLessonList();
      setLessonList(updated);
      showToast(item.id ? 'Curriculum lesson updated!' : 'Curriculum lesson added to syllabus!', 'success');
      setIsLessonModalOpen(false);
      setEditingLesson(null);
    } catch (err: any) {
      showToast(err.message || 'Failed to save curriculum lesson', 'error');
    }
  };

  const handleUpdateLessonStatus = async (id: string, status: LessonStatus) => {
    try {
      await updateLessonStatus(id, status);
      setLessonList((prev) =>
        prev.map((l) => (l.id === id ? { ...l, status } : l))
      );
      showToast(`Lesson status updated to ${status}!`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to update lesson status', 'error');
    }
  };

  const handleDeleteLesson = async (id: string) => {
    try {
      await deleteLessonItem(id);
      setLessonList((prev) => prev.filter((l) => l.id !== id));
      showToast('Lesson deleted from syllabus.', 'info');
    } catch (err: any) {
      showToast(err.message || 'Failed to delete lesson', 'error');
    }
  };

  // Sync selectedClassId with unlockedClassId when student logs in
  useEffect(() => {
    if (unlockedClassId && !isAdmin) {
      setSelectedClassId(unlockedClassId);
    }
  }, [unlockedClassId, isAdmin]);

  // Refresh helpers from database
  const refreshFiles = async () => {
    try {
      const dbFiles = await fetchFiles();
      setFiles(dbFiles);
    } catch (err) {
      console.error('Error refreshing files:', err);
    }
  };

  const refreshQuizzes = async () => {
    try {
      const dbQuizzes = await fetchQuizzes({ isStudent: !isAdmin });
      setQuizzes(dbQuizzes);
    } catch (err) {
      console.error('Error refreshing quizzes:', err);
    }
  };

  const refreshClasses = async () => {
    try {
      const dbClasses = await fetchClasses();
      setClasses(dbClasses);
    } catch (err) {
      console.error('Error refreshing classes:', err);
    }
  };

  const refreshSubjects = async () => {
    try {
      const dbSubjects = await fetchSubjects();
      const allItem = dbSubjects.find((s) => s.id === 'all') || {
        id: 'all',
        name: 'All Subjects',
        color: 'bg-slate-100 text-slate-700',
      };
      setSubjects([allItem, ...dbSubjects.filter((s) => s.id !== 'all')]);
    } catch (err) {
      console.error('Error refreshing subjects:', err);
    }
  };

  // Admin Toggle Handler
  const handleToggleAdmin = () => {
    if (isAdmin) {
      setIsAdmin(false);
      setAdminToken(null);
      setUnlockedClassId(null);
      setSelectedSubject('all');
      fetchQuizzes({ isStudent: true }).then(setQuizzes).catch(() => {});
      fetchClasses().then(setClasses).catch(() => {});
      showToast('Switched to Student Mode', 'info');
    } else {
      setIsPinModalOpen(true);
    }
  };

  // Secure backdoor hotkey for administrators (Ctrl+Shift+A or Alt+A)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in an input or textarea
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }
      if ((e.altKey && (e.key === 'a' || e.key === 'A')) || 
          (e.ctrlKey && e.shiftKey && (e.key === 'a' || e.key === 'A'))) {
        e.preventDefault();
        handleToggleAdmin();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAdmin]);

  const handlePinSuccess = (loggedInName?: string) => {
    setIsPinModalOpen(false);
    setIsAdmin(true);
    const resolvedName = loggedInName || 'Sudeep Shrestha';
    setAdminName(resolvedName);
    refreshFiles();
    refreshSubjects();
    fetchQuizzes({ isStudent: false }).then(setQuizzes).catch(() => {});
    fetchClasses().then(setClasses).catch(() => {});
    showToast(`Welcome, ${resolvedName}! Admin Mode unlocked.`, 'success');
  };

  // Student unlocks specific class (always starts in All Subjects on Materials)
  const handleUnlockClass = (classId: string) => {
    setIsAdmin(false);
    setAdminToken(null);
    setUnlockedClassId(classId);
    setSelectedClassId(classId);
    setActiveTab('files');
    setSelectedSubject('all');
    setSearchQuery('');
    refreshFiles();
    refreshSubjects();
    refreshQuizzes();
    try {
      window.history.pushState({ step: 'class', classId }, '', window.location.href);
    } catch {
      // ignore
    }
    const targetCls = classes.find(c => c.id === classId);
    showToast(`Welcome to ${targetCls ? targetCls.name : 'Class'} Board!`, 'success');
  };

  // Student switches / exits class back to selection screen
  const handleSwitchClass = () => {
    setUnlockedClassId(null);
    setSelectedClassId('all');
    setSelectedSubject('all');
    setActiveQuizTaking(null);
    showToast('Returned to class selection.', 'info');
  };

  // File Actions
  const handleSaveFile = async (savedFile: FileItem) => {
    try {
      await saveFileToApi(savedFile);
      await refreshFiles();
      showToast(`Saved "${savedFile.title}" in database!`);
      setEditingFile(null);
    } catch (err: any) {
      console.error('Error saving file:', err);
      showToast(err?.message || 'Error saving file to database', 'error');
      throw err;
    }
  };

  const handleDeleteFile = async (fileToDelete: FileItem) => {
    try {
      await deleteFileFromApi(fileToDelete.id);
      await refreshFiles();
      showToast(`Deleted "${fileToDelete.title}" from database`, 'info');
    } catch (err) {
      console.error('Error deleting file:', err);
      showToast('Error deleting file from database', 'error');
    }
  };

  const handlePinToggleFile = async (fileToToggle: FileItem) => {
    try {
      const updatedFile = { ...fileToToggle, isPinned: !fileToToggle.isPinned };
      await saveFileToApi(updatedFile);
      await refreshFiles();
      showToast(fileToToggle.isPinned ? 'Unpinned file' : 'Pinned file to top!');
    } catch (err: any) {
      console.error('Error toggling pin:', err);
      showToast(err?.message || 'Error updating file pin status', 'error');
    }
  };

  const handleDownloadFile = async (file: FileItem) => {
    try {
      await incrementDownloadCount(file.id);
      await refreshFiles();
      showToast(`Downloading "${file.fileName || file.title}"...`, 'success');
      await triggerFileDownload(file);
    } catch (err: any) {
      console.error('Error triggering download:', err);
      showToast(err?.message || 'Error downloading file', 'error');
    }
  };

  // Quiz / Assessment Actions
  const handleSaveQuiz = async (quizToSave: QuizItem) => {
    try {
      await saveQuizToApi(quizToSave);
      await refreshQuizzes();
      showToast(`Saved assessment "${quizToSave.title}" to database!`, 'success');
      setIsQuizEditorOpen(false);
      setEditingQuiz(null);
    } catch (err) {
      console.error('Error saving quiz:', err);
      showToast('Error saving assessment to database', 'error');
    }
  };

  const handleDeleteQuiz = async (quizId: string) => {
    try {
      await deleteQuizFromApi(quizId);
      await refreshQuizzes();
      showToast('Assessment removed from database', 'info');
    } catch (err) {
      console.error('Error deleting quiz:', err);
      showToast('Error deleting assessment', 'error');
    }
  };

  const [quizTakingSessionKey, setQuizTakingSessionKey] = useState<number>(1);

  const handleTakeQuiz = async (quiz: QuizItem) => {
    if (!isAdmin && !currentStudent) {
      setIsStudentAuthOpen(true);
      showToast('Please create or log in with your Student ID & Password to take this assessment', 'info');
      return;
    }
    setQuizTakingSessionKey((prev) => prev + 1);
    try {
      const freshQuiz = await fetchQuizById(quiz.id, !isAdmin);
      if (freshQuiz && freshQuiz.questions && freshQuiz.questions.length > 0) {
        setActiveQuizTaking(freshQuiz);
      } else {
        setActiveQuizTaking(quiz);
      }
    } catch {
      setActiveQuizTaking(quiz);
    }
    setIsSubmissionsViewOpen(false);
    try {
      window.history.pushState({ step: 'test', quizId: quiz.id }, '', window.location.href);
    } catch {
      // ignore
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleEvaluationComplete = (report: QuizEvaluationReport) => {
    try {
      sessionStorage.removeItem('scholarboard_active_quiz_id');
      localStorage.removeItem('scholarboard_active_quiz_id');
    } catch {
      // ignore
    }
    setActiveEvaluationReport(report);
    setIsReportModalOpen(true);
    showToast(`Test completed! Grade: ${report.gradeLetter} (${report.percentage}%)`, 'success');
    refreshQuizzes();
  };

  const handleOpenSubmissions = (quiz?: QuizItem, studentQuery?: string) => {
    if (!isAdmin && !currentStudent) {
      setIsStudentAuthOpen(true);
      showToast('Please log in with your Student ID to view your submissions and marks', 'info');
      return;
    }
    setFilterSubmissionQuizId(quiz?.id);
    setFilterStudentQuery(studentQuery || '');
    setIsSubmissionsViewOpen(true);
    setActiveQuizTaking(null);
    try {
      window.history.pushState({ step: 'submissions' }, '', window.location.href);
    } catch {
      // ignore
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Class Actions
  const handleAddClass = async (newClass: ClassItem) => {
    try {
      await saveClass(newClass);
      await refreshClasses();
      showToast(`Created class "${newClass.name}" in database`);
    } catch (err) {
      console.error('Error adding class:', err);
      showToast('Error creating class', 'error');
    }
  };

  const handleUpdateClass = async (updatedClass: ClassItem) => {
    try {
      await saveClass(updatedClass);
      await refreshClasses();
      showToast(`Updated passcode for "${updatedClass.name}" in database`);
    } catch (err) {
      console.error('Error updating class:', err);
      showToast('Error updating class passcode', 'error');
    }
  };

  const handleDeleteClass = async (classId: string) => {
    try {
      await deleteClassFromApi(classId);
      await refreshClasses();
      if (selectedClassId === classId) setSelectedClassId('all');
      if (unlockedClassId === classId) setUnlockedClassId(null);
      showToast('Class removed from database', 'info');
    } catch (err) {
      console.error('Error deleting class:', err);
      showToast('Error removing class from database', 'error');
    }
  };

  // Subject Actions
  const handleAddSubject = async (newSubject: SubjectCategory) => {
    try {
      await saveSubject(newSubject);
      await refreshSubjects();
      showToast(`Added subject "${newSubject.name}" to database`);
    } catch (err) {
      console.error('Error adding subject:', err);
      showToast('Error adding subject', 'error');
    }
  };

  const handleDeleteSubject = async (subjectId: string) => {
    try {
      await deleteSubjectFromApi(subjectId);
      await refreshSubjects();
      showToast('Subject removed from database', 'info');
    } catch (err) {
      console.error('Error deleting subject:', err);
      showToast('Error deleting subject', 'error');
    }
  };

  // Active class name label
  // When logged in as a student, the active class is strictly locked to unlockedClassId
  const effectiveClassId = !isAdmin && unlockedClassId ? unlockedClassId : selectedClassId;
  const activeClass = classes.find((c) => c.id === effectiveClassId);
  const activeClassName = effectiveClassId === 'all' ? 'All Classes' : activeClass ? activeClass.name : 'Selected Class';

  // Helper map for class name label on cards
  const classNameMap = useMemo(() => {
    const map: Record<string, string> = { all: 'All Classes' };
    classes.forEach((c) => {
      map[c.id] = c.name;
    });
    return map;
  }, [classes]);

  // Filtering & Sorting Logic for Files (Strictly locked to student's class when student is logged in)
  const filteredFiles = useMemo(() => {
    const normSel = (selectedSubject || '').trim().toLowerCase();
    const targetCategory =
      normSel && normSel !== 'all' && normSel !== 'all subjects'
        ? subjects.find(
            (s) =>
              s.id.trim().toLowerCase() === normSel ||
              s.name.trim().toLowerCase() === normSel
          )
        : undefined;
    const isAllSubjects =
      !normSel ||
      normSel === 'all' ||
      normSel === 'all subjects' ||
      targetCategory?.id.trim().toLowerCase() === 'all';

    return files.filter((f) => {
      const fileClassId = (f.classId || '').trim();

      // Selected Class filter:
      if (!isAdmin && unlockedClassId) {
        // Student view: show files belonging to their unlocked class (and global 'all' class notices)
        if (fileClassId !== unlockedClassId && fileClassId !== 'all') {
          return false;
        }
      } else if (effectiveClassId !== 'all' && fileClassId !== effectiveClassId && fileClassId !== 'all') {
        return false;
      }

      // Subject filter:
      // - 'All Subjects' displays all available notes for the class
      // - A specific subject displays ONLY notes mapped to that subject category
      if (!isAllSubjects) {
        const normFileSub = (f.subject || '').trim().toLowerCase();
        if (!normFileSub || normFileSub === 'all' || normFileSub === 'all subjects') {
          return false;
        }

        const fileCategory = subjects.find(
          (s) =>
            s.id.trim().toLowerCase() !== 'all' &&
            (s.id.trim().toLowerCase() === normFileSub ||
              s.name.trim().toLowerCase() === normFileSub)
        );

        const matchesDirect = normFileSub === normSel;
        const matchesTargetCategory =
          Boolean(targetCategory) &&
          (normFileSub === targetCategory!.id.trim().toLowerCase() ||
            normFileSub === targetCategory!.name.trim().toLowerCase() ||
            (Boolean(fileCategory) && fileCategory!.id === targetCategory!.id));

        if (!matchesDirect && !matchesTargetCategory) {
          return false;
        }
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesTitle = (f.title || '').toLowerCase().includes(q);
        const matchesDesc = (f.description || '').toLowerCase().includes(q);
        const matchesSubject = (f.subject || '').toLowerCase().includes(q);
        const matchesFileName = (f.fileName || '').toLowerCase().includes(q);
        if (!matchesTitle && !matchesDesc && !matchesSubject && !matchesFileName) {
          return false;
        }
      }

      return true;
    });
  }, [files, isAdmin, unlockedClassId, effectiveClassId, selectedSubject, searchQuery, subjects]);

  // Filtered quizzes count matching active class
  const filteredQuizzes = useMemo(() => {
    return quizzes.filter((q) => {
      if (!isAdmin && q.isPublished === false) return false;
      if (!isAdmin && unlockedClassId) {
        if (q.classId !== unlockedClassId) {
          return false;
        }
      } else if (effectiveClassId !== 'all' && q.classId !== effectiveClassId && q.classId !== 'all') {
        return false;
      }
      return true;
    });
  }, [quizzes, isAdmin, unlockedClassId, effectiveClassId]);

  // Filtered homework matching active class
  const filteredHomework = useMemo(() => {
    return homeworkList.filter((hw) => {
      if (!isAdmin && unlockedClassId) {
        if (hw.classId !== unlockedClassId) return false;
      } else if (effectiveClassId !== 'all' && hw.classId !== effectiveClassId && hw.classId !== 'all') {
        return false;
      }
      return true;
    });
  }, [homeworkList, isAdmin, unlockedClassId, effectiveClassId]);

  // Homework of the day count
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const todayHomeworkCount = useMemo(() => {
    return filteredHomework.filter((hw) => hw.dueDate === todayStr).length;
  }, [filteredHomework, todayStr]);

  // Filtered lessons matching active class
  const filteredLessons = useMemo(() => {
    return lessonList.filter((l) => {
      if (!isAdmin && unlockedClassId) {
        if (l.classId !== unlockedClassId) return false;
      } else if (effectiveClassId !== 'all' && l.classId !== effectiveClassId && l.classId !== 'all') {
        return false;
      }
      return true;
    });
  }, [lessonList, isAdmin, unlockedClassId, effectiveClassId]);

  // Sort logic (Pinned files float to top)
  const sortedFiles = useMemo(() => {
    return [...filteredFiles].sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;

      if (sortOption === 'newest') {
        return new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime();
      }
      if (sortOption === 'oldest') {
        return new Date(a.uploadDate).getTime() - new Date(b.uploadDate).getTime();
      }
      if (sortOption === 'title') {
        return a.title.localeCompare(b.title);
      }
      if (sortOption === 'downloads') {
        return b.downloadsCount - a.downloadsCount;
      }
      return 0;
    });
  }, [filteredFiles, sortOption]);

  // Active Quiz Taker Screen
  if (activeQuizTaking) {
    return (
      <div className="min-h-screen relative bg-[var(--bg)] text-[var(--ink)] flex flex-col font-sans antialiased selection:bg-blue-500 selection:text-white transition-colors duration-200">
        <AnimatedDotMatrix className="opacity-95" />
        <div className="relative z-10 flex flex-col min-h-screen">
          <Header
            isAdmin={isAdmin}
            onToggleAdmin={handleToggleAdmin}
            onOpenUpload={() => {
              setEditingFile(null);
              setIsAdminPanelOpen(true);
            }}
            totalFilesCount={filteredFiles.length}
            totalQuizzesCount={quizzes.length}
            activeClassName={activeClassName}
            onSwitchClass={handleSwitchClass}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            currentStudent={currentStudent}
            onOpenStudentAuth={() => handleOpenStudentAuth('login')}
            onStudentLogout={handleStudentLogout}
            onOpenStudentSubmissions={() => handleOpenSubmissions()}
            theme={theme}
            onToggleTheme={handleToggleTheme}
            isTakingQuiz={true}
            onOpenStudentIdPass={handleOpenStudentIdPassModal}
          />

          <main className="flex-1 w-full max-w-[1780px] mx-auto px-2.5 sm:px-6 lg:px-8 2xl:px-12 py-3 sm:py-6">
            <ErrorBoundary fallbackTitle="Assessment Safe Recovery">
              <QuizTaker
                key={`${activeQuizTaking.id}-${quizTakingSessionKey}`}
                quiz={activeQuizTaking}
                onBack={() => {
                  try {
                    sessionStorage.removeItem(`quiz_started_${activeQuizTaking.id}`);
                    sessionStorage.removeItem(`quiz_start_time_${activeQuizTaking.id}`);
                  } catch {}
                  setActiveQuizTaking(null);
                  showToast('Exited assessment. Returned to tests.', 'info');
                }}
                onEvaluationComplete={handleEvaluationComplete}
                onPrintQuiz={handleOpenPrintModal}
                currentStudent={currentStudent}
                onOpenAuth={() => handleOpenStudentAuth('login')}
                isAdmin={isAdmin}
              />
            </ErrorBoundary>
          </main>

          <QuizReportModal
            report={activeEvaluationReport}
            isOpen={isReportModalOpen}
            isAdmin={isAdmin}
            onClose={() => {
              setIsReportModalOpen(false);
              setActiveQuizTaking(null);
            }}
            onRetake={() => {
              setIsReportModalOpen(false);
              setQuizTakingSessionKey((prev) => prev + 1);
              showToast('Starting a fresh test attempt as Admin...', 'info');
            }}
          />

          <PrintAssessmentModal
            quiz={printingQuiz}
            isOpen={isPrintModalOpen}
            onClose={() => {
              setIsPrintModalOpen(false);
              setPrintingQuiz(null);
            }}
            classes={classes}
            isAdmin={isAdmin}
          />

          <StudentAuthModal
            isOpen={isStudentAuthOpen}
            onClose={() => setIsStudentAuthOpen(false)}
            classes={classes}
            currentStudent={currentStudent}
            onLoginSuccess={handleStudentLogin}
            onRegisterSuccess={handleStudentLogin}
            onLogout={handleStudentLogout}
            initialMode={studentAuthInitialMode}
            defaultClassId={unlockedClassId || (selectedClassId !== 'all' ? selectedClassId : undefined)}
          />
        </div>
      </div>
    );
  }

  const openAdminProfile = () => {
    setEditingFile(null);
    setAdminPanelInitialTab('settings');
    setIsAdminPanelOpen(true);
  };

  const renderGlobalModals = () => (
    <>
      <FilePreviewModal
        file={previewFile}
        onClose={() => setPreviewFile(null)}
        onDownload={handleDownloadFile}
        classNameLabel={previewFile ? classNameMap[previewFile.classId] : undefined}
      />

      <FileUnlockModal
        file={pendingUnlockFile?.file || null}
        isOpen={!!pendingUnlockFile}
        pendingAction={pendingUnlockFile?.action || 'open'}
        onClose={() => setPendingUnlockFile(null)}
        onSuccess={handleFileUnlockSuccess}
      />

      <AdminPanel
        isOpen={isAdminPanelOpen}
        onClose={() => {
          setIsAdminPanelOpen(false);
          setEditingFile(null);
          setAdminPanelInitialTab('upload');
        }}
        classes={classes}
        subjects={subjects}
        quizzes={quizzes}
        onSaveFile={handleSaveFile}
        onAddClass={handleAddClass}
        onUpdateClass={handleUpdateClass}
        onDeleteClass={handleDeleteClass}
        onAddSubject={handleAddSubject}
        onDeleteSubject={handleDeleteSubject}
        onTakeQuiz={handleTakeQuiz}
        onPrintQuiz={handleOpenPrintModal}
        onCreateQuiz={() => {
          setEditingQuiz(null);
          setIsQuizEditorOpen(true);
        }}
        onEditQuiz={(quiz) => {
          setEditingQuiz(quiz);
          setIsQuizEditorOpen(true);
        }}
        onDeleteQuiz={handleDeleteQuiz}
        editingFile={editingFile}
        onOpenSubmissions={(studentQuery, quizId) => {
          setIsAdminPanelOpen(false);
          const targetQuiz = quizzes.find((q) => q.id === quizId);
          handleOpenSubmissions(targetQuiz, studentQuery);
        }}
        initialTab={adminPanelInitialTab}
        defaultClassId={effectiveClassId}
        defaultSubject={selectedSubject}
        adminName={adminName}
        onAdminProfileUpdated={(updatedName) => setAdminName(updatedName)}
      />

      {/* Direct Student ID & Password Examination Pass Printing Modal for Admins */}
      {isStudentIdPassModalOpen && (
        <StudentIdPassModal
          isOpen={isStudentIdPassModalOpen}
          onClose={() => setIsStudentIdPassModalOpen(false)}
          students={studentsForPasses}
          classes={classes}
        />
      )}

      <QuizEditorModal
        isOpen={isQuizEditorOpen}
        onClose={() => {
          setIsQuizEditorOpen(false);
          setEditingQuiz(null);
        }}
        onSaveQuiz={handleSaveQuiz}
        editingQuiz={editingQuiz}
        classes={classes}
        subjects={subjects}
        defaultClassId={selectedClassId}
        defaultSubject={selectedSubject !== 'all' ? selectedSubject : 'Science'}
      />

      <QuizReportModal
        report={activeEvaluationReport}
        isOpen={isReportModalOpen}
        isAdmin={isAdmin}
        onClose={() => setIsReportModalOpen(false)}
      />

      <PinModal
        isOpen={isPinModalOpen}
        onClose={() => setIsPinModalOpen(false)}
        onSuccess={handlePinSuccess}
      />

      <PrintAssessmentModal
        quiz={printingQuiz}
        isOpen={isPrintModalOpen}
        onClose={() => {
          setIsPrintModalOpen(false);
          setPrintingQuiz(null);
        }}
        classes={classes}
        isAdmin={isAdmin}
      />

      <StudentAuthModal
        isOpen={isStudentAuthOpen}
        onClose={() => setIsStudentAuthOpen(false)}
        classes={classes}
        currentStudent={currentStudent}
        onLoginSuccess={handleStudentLogin}
        onRegisterSuccess={handleStudentLogin}
        onLogout={handleStudentLogout}
        initialMode={studentAuthInitialMode}
        defaultClassId={unlockedClassId || (selectedClassId !== 'all' ? selectedClassId : undefined)}
      />

      <HomeworkModal
        isOpen={isHomeworkModalOpen}
        onClose={() => {
          setIsHomeworkModalOpen(false);
          setEditingHomework(null);
        }}
        onSave={handleSaveHomework}
        editingHomework={editingHomework}
        classes={classes}
        subjects={subjects}
        defaultClassId={effectiveClassId !== 'all' ? effectiveClassId : (classes[0]?.id || '')}
        defaultSubject={selectedSubject !== 'all' ? selectedSubject : 'Mathematics'}
        onAddSubject={handleAddSubject}
      />

      <LessonModal
        isOpen={isLessonModalOpen}
        onClose={() => {
          setIsLessonModalOpen(false);
          setEditingLesson(null);
        }}
        onSave={handleSaveLesson}
        editingLesson={editingLesson}
        classes={classes}
        subjects={subjects}
        defaultClassId={effectiveClassId !== 'all' ? effectiveClassId : (classes[0]?.id || '')}
        defaultSubject={selectedSubject !== 'all' ? selectedSubject : 'Mathematics'}
        defaultTerm={lessonModalDefaultTerm}
      />

      <ClassManagerModal
        isOpen={isClassManagerOpen}
        onClose={() => setIsClassManagerOpen(false)}
        classes={classes}
        onAddClass={handleAddClass}
        onUpdateClass={handleUpdateClass}
        onDeleteClass={handleDeleteClass}
        subjects={subjects}
        onAddSubject={handleAddSubject}
        onDeleteSubject={handleDeleteSubject}
        onAdminProfileUpdated={(updatedName) => setAdminName(updatedName)}
      />

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-20 md:bottom-5 left-3 right-3 sm:left-auto sm:right-5 sm:max-w-sm z-50 animate-in slide-in-from-bottom-5 duration-200">
          <div className={`px-4 py-3 rounded-2xl shadow-xl border flex items-center gap-3 text-xs font-bold text-white ${
            toast.type === 'error'
              ? 'bg-rose-600 border-rose-500'
              : toast.type === 'info'
              ? 'bg-slate-900 border-slate-800'
              : 'bg-emerald-600 border-emerald-500'
          }`}>
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{toast.message}</span>
          </div>
        </div>
      )}
    </>
  );

  // Active Submissions History Screen
  if (isSubmissionsViewOpen) {
    return (
      <div className="min-h-screen relative bg-[var(--bg)] text-[var(--ink)] flex flex-row font-sans antialiased selection:bg-blue-500 selection:text-white transition-colors duration-200">
        <AnimatedDotMatrix className="opacity-95" />
        <Sidebar
          isOpen={isMobileSidebarOpen}
          onClose={() => setIsMobileSidebarOpen(false)}
          isAdmin={isAdmin}
          onToggleAdmin={handleToggleAdmin}
          classes={classes}
          activeClass={activeClass}
          activeClassName={activeClassName}
          selectedClassId={selectedClassId}
          onSelectClass={(classId) => {
            setSelectedClassId(classId);
            setSelectedSubject('all');
            setSearchQuery('');
          }}
          onManageClasses={() => setIsClassManagerOpen(true)}
          onSwitchClass={handleSwitchClass}
          activeTab={activeTab}
          onTabChange={(tab) => {
            setActiveTab(tab);
            setIsSubmissionsViewOpen(false);
            setIsMobileSidebarOpen(false);
          }}
          totalFilesCount={filteredFiles.length}
          totalQuizzesCount={filteredQuizzes.length}
          totalHomeworkCount={filteredHomework.length}
          todayHomeworkCount={todayHomeworkCount}
          totalLessonsCount={filteredLessons.length}
          currentStudent={currentStudent}
          onOpenStudentAuth={(mode) => handleOpenStudentAuth(mode || 'login')}
          onStudentLogout={handleStudentLogout}
          onOpenStudentSubmissions={() => handleOpenSubmissions()}
          onOpenUpload={() => {
            setEditingFile(null);
            setAdminPanelInitialTab('upload');
            setIsAdminPanelOpen(true);
          }}
          onOpenCreateQuiz={() => {
            setEditingQuiz(null);
            setIsQuizEditorOpen(true);
          }}
          onOpenAddHomework={() => {
            setEditingHomework(null);
            setIsHomeworkModalOpen(true);
          }}
          onOpenAddLesson={() => {
            setEditingLesson(null);
            setLessonModalDefaultTerm('term1');
            setIsLessonModalOpen(true);
          }}
          theme={theme}
          onToggleTheme={handleToggleTheme}
          isTakingQuiz={false}
          adminName={adminName}
          onOpenAdminProfile={openAdminProfile}
        />
        <div className="relative flex-1 flex flex-col min-w-0 min-h-screen">
          <Header
            isAdmin={isAdmin}
            onToggleAdmin={handleToggleAdmin}
            onOpenUpload={() => {
              setEditingFile(null);
              setAdminPanelInitialTab('upload');
              setIsAdminPanelOpen(true);
            }}
            totalFilesCount={filteredFiles.length}
            totalQuizzesCount={quizzes.length}
            activeClassName={activeClassName}
            onSwitchClass={handleSwitchClass}
            activeTab={activeTab}
            onTabChange={(tab) => {
              setActiveTab(tab);
              setIsSubmissionsViewOpen(false);
            }}
            currentStudent={currentStudent}
            onOpenStudentAuth={() => setIsStudentAuthOpen(true)}
            onStudentLogout={handleStudentLogout}
            onOpenStudentSubmissions={() => handleOpenSubmissions()}
            theme={theme}
            onToggleTheme={handleToggleTheme}
            onOpenStudentIdPass={handleOpenStudentIdPassModal}
            adminName={adminName}
            onOpenAdminProfile={openAdminProfile}
          />

          <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 pb-24 md:pb-8">
            <ErrorBoundary fallbackTitle="Submissions Board Recovery">
              <SubmissionsListView
                isAdmin={isAdmin}
                currentStudent={currentStudent}
                onOpenAuth={() => setIsStudentAuthOpen(true)}
                onBack={() => setIsSubmissionsViewOpen(false)}
                onOpenReport={(rep) => {
                  setActiveEvaluationReport(rep);
                  setIsReportModalOpen(true);
                }}
                classes={classes}
                filterQuizId={filterSubmissionQuizId}
                filterStudentQuery={filterStudentQuery}
              />
            </ErrorBoundary>
          </main>

          <MobileBottomNav
            activeTab={activeTab}
            onTabChange={(tab) => {
              setActiveTab(tab);
              setIsSubmissionsViewOpen(false);
            }}
            onOpenSidebar={() => setIsMobileSidebarOpen(true)}
            totalFilesCount={filteredFiles.length}
            totalQuizzesCount={filteredQuizzes.length}
            totalHomeworkCount={filteredHomework.length}
            todayHomeworkCount={todayHomeworkCount}
            totalLessonsCount={filteredLessons.length}
          />

          {renderGlobalModals()}
        </div>
      </div>
    );
  }

  // Class Access Portal (Password gate for students when reloading / switching class)
  if (!isAdmin && !unlockedClassId) {
    return (
      <div className="min-h-screen w-full bg-[var(--bg)] text-[var(--ink)] flex flex-col relative overflow-x-hidden overflow-y-auto font-sans selection:bg-blue-500 selection:text-white transition-colors duration-200">
        <ClassPortal
          classes={classes}
          onUnlockClass={handleUnlockClass}
          onOpenAdminLogin={() => setIsPinModalOpen(true)}
          theme={theme}
          onToggleTheme={handleToggleTheme}
        />

        <PinModal
          isOpen={isPinModalOpen}
          onClose={() => setIsPinModalOpen(false)}
          onSuccess={handlePinSuccess}
        />

        {/* Toast Notification */}
        {toast && (
          <div className="fixed bottom-5 left-3 right-3 sm:left-auto sm:right-5 sm:max-w-sm z-50 animate-in slide-in-from-bottom-5 duration-200">
            <div className={`px-4 py-3 rounded-2xl shadow-xl border flex items-center gap-3 text-xs font-bold text-white ${
              toast.type === 'error'
                ? 'bg-rose-600 border-rose-500'
                : toast.type === 'info'
                ? 'bg-slate-900 border-slate-800'
                : 'bg-emerald-600 border-emerald-500'
            }`}>
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{toast.message}</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Standard Main Screen (Materials or Quizzes)
  return (
    <div className="min-h-screen relative bg-[var(--bg)] text-[var(--ink)] flex flex-row font-sans antialiased selection:bg-[var(--accent)] selection:text-white">
      {/* Dynamic interactive moving dot constellation background */}
      <AnimatedDotMatrix className="opacity-95" />

      {/* Left Sidebar Navigation UI (All options on left side) */}
      <Sidebar
        isOpen={isMobileSidebarOpen}
        onClose={() => setIsMobileSidebarOpen(false)}
        isAdmin={isAdmin}
        onToggleAdmin={handleToggleAdmin}
        classes={classes}
        activeClass={activeClass}
        activeClassName={activeClassName}
        selectedClassId={selectedClassId}
        onSelectClass={(classId) => {
          setSelectedClassId(classId);
          setSelectedSubject('all');
          setSearchQuery('');
        }}
        onManageClasses={() => setIsClassManagerOpen(true)}
        onSwitchClass={handleSwitchClass}
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          setIsMobileSidebarOpen(false);
        }}
        totalFilesCount={filteredFiles.length}
        totalQuizzesCount={filteredQuizzes.length}
        totalHomeworkCount={filteredHomework.length}
        todayHomeworkCount={todayHomeworkCount}
        totalLessonsCount={filteredLessons.length}
        currentStudent={currentStudent}
        onOpenStudentAuth={(mode) => handleOpenStudentAuth(mode || 'login')}
        onStudentLogout={handleStudentLogout}
        onOpenStudentSubmissions={() => handleOpenSubmissions()}
        onOpenUpload={() => {
          setEditingFile(null);
          setAdminPanelInitialTab('upload');
          setIsAdminPanelOpen(true);
        }}
        onOpenCreateQuiz={() => {
          setEditingQuiz(null);
          setIsQuizEditorOpen(true);
        }}
        onOpenAddHomework={() => {
          setEditingHomework(null);
          setIsHomeworkModalOpen(true);
        }}
        onOpenAddLesson={() => {
          setEditingLesson(null);
          setLessonModalDefaultTerm('term1');
          setIsLessonModalOpen(true);
        }}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        isTakingQuiz={false}
        adminName={adminName}
        onOpenAdminProfile={openAdminProfile}
      />

      {/* Main app content with relative positioning */}
      <div className="relative flex-1 flex flex-col min-w-0 min-h-screen">
        {/* Top Header */}
        <Header
          isAdmin={isAdmin}
          onToggleAdmin={handleToggleAdmin}
          onOpenUpload={() => {
            setEditingFile(null);
            setAdminPanelInitialTab('upload');
            setIsAdminPanelOpen(true);
          }}
          onOpenCreateQuiz={() => {
            setEditingQuiz(null);
            setIsQuizEditorOpen(true);
          }}
          totalFilesCount={filteredFiles.length}
          totalQuizzesCount={filteredQuizzes.length}
          totalHomeworkCount={filteredHomework.length}
          todayHomeworkCount={todayHomeworkCount}
          totalLessonsCount={filteredLessons.length}
          onOpenAddHomework={() => {
            setEditingHomework(null);
            setIsHomeworkModalOpen(true);
          }}
          onOpenAddLesson={() => {
            setEditingLesson(null);
            setLessonModalDefaultTerm('term1');
            setIsLessonModalOpen(true);
          }}
          activeClassName={activeClassName}
          onSwitchClass={handleSwitchClass}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          currentStudent={currentStudent}
          onOpenStudentAuth={() => setIsStudentAuthOpen(true)}
          onStudentLogout={handleStudentLogout}
          onOpenStudentSubmissions={() => handleOpenSubmissions()}
          theme={theme}
          onToggleTheme={handleToggleTheme}
          onOpenStudentIdPass={handleOpenStudentIdPassModal}
          adminName={adminName}
          onOpenAdminProfile={openAdminProfile}
        />

        {/* Main Content Area */}
        <main className="flex-1 min-w-0 w-full max-w-7xl 2xl:max-w-[1540px] mx-auto px-3 sm:px-5 lg:px-7 py-3 sm:py-5 pb-20 md:pb-8 space-y-4 sm:space-y-5">
          {/* Active Tab View */}
          {activeTab === 'quizzes' ? (
            <QuizList
              quizzes={quizzes}
              isAdmin={isAdmin}
              selectedClassId={effectiveClassId}
              selectedSubject={selectedSubject}
              activeClassName={activeClassName}
              classes={classes}
              subjects={subjects}
              currentStudent={currentStudent}
              onOpenStudentAuth={(mode?: 'login' | 'register') => handleOpenStudentAuth(mode || 'register')}
              onTakeQuiz={handleTakeQuiz}
              onCreateQuiz={() => {
                setEditingQuiz(null);
                setIsQuizEditorOpen(true);
              }}
              onEditQuiz={(quiz) => {
                setEditingQuiz(quiz);
                setIsQuizEditorOpen(true);
              }}
              onDeleteQuiz={handleDeleteQuiz}
              onViewSubmissions={handleOpenSubmissions}
              onPrintQuiz={handleOpenPrintModal}
            />
          ) : activeTab === 'homework' ? (
            <HomeworkView
              homeworkList={homeworkList}
              classes={classes}
              subjects={subjects}
              currentClass={activeClass}
              isAdmin={isAdmin}
              onOpenAddHomework={() => {
                setEditingHomework(null);
                setIsHomeworkModalOpen(true);
              }}
              onEditHomework={(hw) => {
                setEditingHomework(hw);
                setIsHomeworkModalOpen(true);
              }}
              onDeleteHomework={handleDeleteHomework}
              studentName={currentStudent?.name}
              studentId={currentStudent?.studentId}
            />
          ) : activeTab === 'lessons' ? (
            <LessonListView
              lessonList={lessonList}
              classes={classes}
              subjects={subjects}
              currentClass={activeClass}
              isAdmin={isAdmin}
              onOpenAddLesson={(defTerm) => {
                setEditingLesson(null);
                setLessonModalDefaultTerm(defTerm || 'term1');
                setIsLessonModalOpen(true);
              }}
              onEditLesson={(lesson) => {
                setEditingLesson(lesson);
                setIsLessonModalOpen(true);
              }}
              onUpdateLessonStatus={handleUpdateLessonStatus}
              onDeleteLesson={handleDeleteLesson}
            />
          ) : (
            <div className="space-y-4">
              {/* Clean Page Title Card Header for Materials */}
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-3.5 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-3 shadow-xs relative overflow-hidden">
                <div className="flex items-start gap-3 sm:gap-3.5 min-w-0 flex-1">
                  <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-blue-500/12 border border-blue-500/25 text-blue-500 flex items-center justify-center shrink-0">
                    <BookOpen className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mb-0.5 text-xs text-[var(--ink-muted)]">
                      <span className="font-semibold text-[var(--accent)] break-words">
                        {activeClassName}
                      </span>
                      {activeClass?.section && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono text-[11px]">Section {activeClass.section}</span>
                        </>
                      )}
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums text-[11px]">{sortedFiles.length} item{sortedFiles.length === 1 ? '' : 's'}</span>
                    </div>
                    <h1 className="text-lg sm:text-xl lg:text-2xl font-bold tracking-tight text-[var(--ink)] break-words">
                      Study Notes & Materials
                    </h1>
                    <p className="text-xs text-[var(--ink-muted)] mt-0.5 break-words leading-relaxed">
                      Browse, preview, and download verified notes, handouts, and slides.
                    </p>
                  </div>
                </div>

                {/* Header Actions */}
                {isAdmin && (
                  <div className="flex items-center gap-2 w-full lg:w-auto shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingFile(null);
                        setAdminPanelInitialTab('upload');
                        setIsAdminPanelOpen(true);
                      }}
                      className="btn btn-primary w-full xs:w-auto justify-center py-2 px-3.5 text-xs font-semibold flex items-center gap-1.5 shadow-2xs active:scale-95 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5 shrink-0" />
                      <span>Upload Material</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Search, Filter & View Mode Toolbar (Shown for Materials tab) */}
              <FilterBar
                categories={subjects}
                selectedSubject={selectedSubject}
                onSelectSubject={setSelectedSubject}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                sortOption={sortOption}
                onSortChange={setSortOption}
              />
                <>
                  {/* Active Filter Indicator Badge */}
                  {(selectedSubject !== 'all' || searchQuery) && (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 px-3.5 sm:px-4 py-2.5 sm:py-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-[var(--ink)] shadow-xs">
                      <div className="flex items-start sm:items-center gap-2 min-w-0">
                        <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse shrink-0 mt-1 sm:mt-0" />
                        <span className="min-w-0 leading-relaxed">
                          Filtered by{' '}
                          <strong className="font-semibold text-blue-400">
                            {selectedSubject !== 'all'
                              ? (subjects.find((s) => s.id === selectedSubject || s.name === selectedSubject)?.name || selectedSubject)
                              : 'All Subjects'}
                            {selectedSubject !== 'all' && searchQuery ? ' • ' : ''}
                            {searchQuery ? `"${searchQuery}"` : ''}
                          </strong>
                          <span className="text-[var(--ink-muted)] ml-1.5 font-mono whitespace-nowrap">
                            ({sortedFiles.length} item{sortedFiles.length === 1 ? '' : 's'})
                          </span>
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedSubject('all');
                          setSearchQuery('');
                        }}
                        className="self-start sm:self-auto shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/30 text-[11px] font-semibold text-blue-400 transition cursor-pointer whitespace-nowrap"
                      >
                        Reset & Show All {activeClassName} Materials
                      </button>
                    </div>
                  )}

                  {/* Materials File Cards Grid / List */}
                  {sortedFiles.length > 0 ? (
                    <div
                      className={
                        viewMode === 'grid'
                          ? 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 sm:gap-5'
                          : 'space-y-3'
                      }
                    >
                      {sortedFiles.map((file) => (
                        <FileCard
                          key={file.id}
                          file={file}
                          viewMode={viewMode}
                          classNameLabel={selectedClassId === 'all' ? classNameMap[file.classId] || 'Class Material' : undefined}
                          onPreview={(f) => setPreviewFile(f)}
                          onDownload={handleDownloadFile}
                          isAdmin={isAdmin}
                          isUnlocked={unlockedFileIds.includes(file.id)}
                          onRequireUnlock={(f, act) => setPendingUnlockFile({ file: f, action: act })}
                          onPinToggle={handlePinToggleFile}
                          onEdit={(f) => {
                            setEditingFile(f);
                            setIsAdminPanelOpen(true);
                          }}
                          onDelete={handleDeleteFile}
                        />
                      ))}
                    </div>
                  ) : (
                    /* Clean Empty State */
                    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 sm:p-10 md:p-12 text-center space-y-4 shadow-sm relative overflow-hidden">
                      <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
                      <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center mx-auto shadow-inner relative z-10">
                        <BookOpen className="w-6 h-6" />
                      </div>
                      <div className="space-y-1 relative z-10">
                        <h3 className="font-bold text-sm sm:text-base text-[var(--ink)] break-words">
                          {selectedSubject !== 'all'
                            ? `No study materials in ${subjects.find((s) => s.id === selectedSubject || s.name === selectedSubject)?.name || selectedSubject} yet`
                            : `No materials uploaded for ${activeClassName} yet`}
                        </h3>
                        <p className="text-xs text-[var(--ink-muted)] max-w-md mx-auto leading-relaxed break-words">
                          {searchQuery || selectedSubject !== 'all'
                            ? 'Your teacher has not published notes for this specific subject yet. You can view all available notes or try active assessments.'
                            : 'Class curriculum guides, lecture slides, and notes will appear here once published by your teacher.'}
                        </p>
                      </div>

                      <div className="pt-2 flex flex-wrap items-center justify-center gap-2.5 sm:gap-3 relative z-10">
                        {(searchQuery || selectedSubject !== 'all') && (
                          <button
                            type="button"
                            onClick={() => {
                              setSearchQuery('');
                              setSelectedSubject('all');
                            }}
                            className="w-full xs:w-auto justify-center px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-sm transition cursor-pointer flex items-center gap-2"
                          >
                            <span>View All Subjects</span>
                            <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                          </button>
                        )}

                        {filteredQuizzes.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setActiveTab('quizzes')}
                            className="w-full xs:w-auto justify-center px-4 py-2 rounded-xl bg-[var(--surface-higher)] hover:bg-[var(--surface-highest)] border border-[var(--border)] text-xs text-[var(--ink)] font-medium transition cursor-pointer flex items-center gap-2"
                          >
                            <Sparkles className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                            <span>Explore Tests ({filteredQuizzes.length})</span>
                          </button>
                        )}

                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingFile(null);
                              setIsAdminPanelOpen(true);
                            }}
                            className="w-full xs:w-auto justify-center px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition cursor-pointer flex items-center gap-1.5 shadow-sm"
                          >
                            <Plus className="w-3.5 h-3.5 shrink-0" /> Upload Material Now
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </>
              </div>
            )}
        </main>
        {/* Clean Web Footer (Desktop only - unnecessary on mobile with bottom nav & drawer) */}
        <footer className="hidden md:block mt-auto border-t border-[var(--border)] bg-[var(--surface)] py-4 text-xs text-[var(--ink-muted)]">
          <div className="w-full max-w-7xl 2xl:max-w-[1680px] mx-auto px-4 sm:px-8 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-[var(--ink)]">EduNexus</span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
              {isAdmin ? (
                <>
                  <span>•</span>
                  <button
                    type="button"
                    onClick={handleToggleAdmin}
                    className="text-amber-500 hover:underline font-semibold text-xs cursor-pointer"
                  >
                    Exit Teacher View
                  </button>
                </>
              ) : (
                <>
                  <span>•</span>
                  <button
                    type="button"
                    onClick={handleSwitchClass}
                    className="text-rose-400 hover:underline font-semibold text-xs cursor-pointer flex items-center gap-1"
                  >
                    <LogOut className="w-3 h-3" />
                    <span>Exit Class</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </footer>

        {/* Mobile Bottom Navigation Bar (Smartphones < md) */}
        <MobileBottomNav
          activeTab={activeTab}
          onTabChange={(tab) => {
            setActiveTab(tab);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          onOpenSidebar={() => setIsMobileSidebarOpen(true)}
          totalFilesCount={filteredFiles.length}
          totalQuizzesCount={filteredQuizzes.length}
          totalHomeworkCount={filteredHomework.length}
          todayHomeworkCount={todayHomeworkCount}
          totalLessonsCount={filteredLessons.length}
        />

      {/* Modals & Toast */}
      {renderGlobalModals()}
      </div>
    </div>
  );
}
