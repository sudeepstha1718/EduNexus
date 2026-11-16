import React from 'react';
import {
  ShieldCheck,
  Lock,
  Plus,
  LogOut,
  FileText,
  FileQuestion,
  UserCheck,
  Sun,
  Moon,
  CalendarCheck,
  BookOpen,
  CreditCard,
  Layers,
  Sparkles,
  User,
} from 'lucide-react';
import { StudentUser } from '../types';
import { BackgroundPicker } from './BackgroundPicker';
import { AppLogo } from './AppLogo';

interface HeaderProps {
  isAdmin: boolean;
  onToggleAdmin: () => void;
  onOpenUpload?: () => void;
  onOpenCreateQuiz?: () => void;
  onOpenAddHomework?: () => void;
  onOpenAddLesson?: () => void;
  totalFilesCount: number;
  totalQuizzesCount?: number;
  totalHomeworkCount?: number;
  todayHomeworkCount?: number;
  totalLessonsCount?: number;
  activeClassName: string;
  onSwitchClass?: () => void;
  activeTab?: 'files' | 'quizzes' | 'homework' | 'lessons';
  onTabChange?: (tab: 'files' | 'quizzes' | 'homework' | 'lessons') => void;
  currentStudent?: StudentUser | null;
  onOpenStudentAuth?: () => void;
  onStudentLogout?: () => void;
  onOpenStudentSubmissions?: () => void;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
  isTakingQuiz?: boolean;
  onOpenStudentIdPass?: () => void;
  adminName?: string;
  onOpenAdminProfile?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  isAdmin,
  onToggleAdmin,
  onOpenUpload,
  onOpenCreateQuiz,
  onOpenAddHomework,
  onOpenAddLesson,
  totalFilesCount,
  totalQuizzesCount = 0,
  totalHomeworkCount = 0,
  todayHomeworkCount = 0,
  totalLessonsCount = 0,
  activeClassName,
  onSwitchClass,
  activeTab = 'files',
  onTabChange,
  currentStudent,
  onOpenStudentAuth,
  onStudentLogout,
  onOpenStudentSubmissions,
  theme = 'dark',
  onToggleTheme,
  isTakingQuiz = false,
  onOpenStudentIdPass,
  adminName = 'Sudeep Shrestha',
  onOpenAdminProfile,
}) => {
  const getTabLabel = (tab?: string) => {
    switch (tab) {
      case 'files':
        return 'Study Materials';
      case 'homework':
        return 'Homework Assignments';
      case 'lessons':
        return 'Syllabus & Curriculum';
      case 'quizzes':
        return 'Examinations & Tests';
      default:
        return 'Study Materials';
    }
  };

  return (
    <header className="sticky top-0 z-20 bg-[var(--surface)]/90 backdrop-blur-md border-b border-[var(--border)] px-2.5 xs:px-3 sm:px-5 lg:px-8 py-2 font-sans relative shadow-2xs transition-colors">
      <div className="flex items-center justify-between gap-1.5 xs:gap-2.5">
        {/* Left: Brand mark & active mobile tab */}
        <div className="flex items-center gap-1.5 xs:gap-2 sm:gap-2.5 flex-1 min-w-0 overflow-hidden">
          {/* Mobile brand mark (visible on small screens where sidebar is hidden, or when taking quiz) */}
          <div className={`${isTakingQuiz ? 'flex' : 'flex md:hidden'} items-center gap-2 shrink-0`}>
            <AppLogo size={30} />
            <span className="font-extrabold text-base sm:text-lg tracking-tight text-[var(--ink)]">
              Edu<span className="text-amber-500">Nexus</span>
            </span>
          </div>

          {/* Mobile View Active Tab Tag */}
          <div className="hidden xs:flex md:hidden items-center gap-1 text-[11px] font-semibold text-[var(--ink)] truncate min-w-0">
            <span className="text-[var(--ink-muted)] shrink-0">·</span>
            <span className="truncate max-w-[130px] text-[var(--accent)] font-bold">{getTabLabel(activeTab)}</span>
          </div>
        </div>

        {/* Right side: Quick stats, session controls, theme switcher */}
        <div className="flex items-center gap-1 xs:gap-1.5 sm:gap-2 shrink-0">
          {/* Admin Profile Quick Button */}
          {isAdmin && onOpenAdminProfile && (
            <button
              type="button"
              onClick={onOpenAdminProfile}
              id="header-admin-profile-btn"
              className="h-[34px] sm:h-[36px] flex items-center justify-center gap-1.5 py-1 px-2 xs:px-2.5 sm:px-3 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/30 text-xs font-semibold transition cursor-pointer shrink-0 shadow-2xs active:scale-[0.98]"
              title="My Admin Profile — Change Name, Username & Password"
            >
              <User className="w-3.5 h-3.5 text-blue-500 shrink-0" />
              <span className="hidden sm:inline">My Profile</span>
            </button>
          )}

          {/* Admin Fast ID Directory Pass */}
          {isAdmin && onOpenStudentIdPass && (
            <button
              type="button"
              onClick={onOpenStudentIdPass}
              id="admin-id-btn"
              className="h-[34px] sm:h-[36px] flex items-center justify-center gap-1.5 py-1 px-2 xs:px-2.5 sm:px-3 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 border border-purple-500/30 text-xs font-semibold transition cursor-pointer shrink-0 shadow-2xs active:scale-[0.98]"
              title="Student IDs & Passwords Directory"
            >
              <CreditCard className="w-3.5 h-3.5 text-purple-500 shrink-0" />
              <span className="hidden xs:inline">Student IDs</span>
            </button>
          )}

          {/* Student Status Profile Button */}
          {!isAdmin && currentStudent && onOpenStudentSubmissions && (
            <button
              type="button"
              onClick={onOpenStudentSubmissions}
              className="h-[34px] sm:h-[36px] flex items-center justify-center gap-1.5 py-1 px-2 xs:px-2.5 sm:px-3 rounded-lg bg-[var(--surface-higher)] hover:bg-[var(--surface-highest)] border border-[var(--border)] text-xs font-semibold text-[var(--accent)] transition cursor-pointer active:scale-[0.98] shrink-0"
              title="View My Marks & Submissions"
            >
              <div className="w-4 h-4 rounded-full bg-[var(--accent)]/20 text-[var(--accent)] font-bold text-[10px] flex items-center justify-center shrink-0">
                {currentStudent.name.charAt(0).toUpperCase()}
              </div>
              <span className="max-w-[56px] xs:max-w-[75px] sm:max-w-[120px] truncate">
                {currentStudent.name.split(' ')[0]}
              </span>
            </button>
          )}

          {/* Student Login trigger (if guest student) */}
          {!isAdmin && !currentStudent && !isTakingQuiz && onOpenStudentAuth && (
            <button
              type="button"
              onClick={onOpenStudentAuth}
              className="flex h-[34px] sm:h-[36px] items-center justify-center gap-1.5 py-1 px-2 xs:px-3 rounded-lg bg-[var(--surface-higher)] hover:bg-[var(--surface-highest)] border border-[var(--border)] text-xs font-semibold text-[var(--ink)] transition cursor-pointer shrink-0"
              title="Student Login"
            >
              <UserCheck className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
              <span className="hidden xs:inline">Login</span>
            </button>
          )}

          {/* Background Wallpaper Switcher - desktop only */}
          <div className="hidden lg:flex items-center shrink-0">
            <BackgroundPicker theme={theme} />
          </div>

          {/* Theme Switcher */}
          {onToggleTheme && (
            <button
              type="button"
              onClick={onToggleTheme}
              id="theme-toggle-btn"
              className="w-[34px] h-[34px] sm:w-[36px] sm:h-[36px] flex items-center justify-center rounded-lg bg-[var(--surface-higher)] hover:bg-[var(--surface-highest)] border border-[var(--border)] transition cursor-pointer text-xs text-[var(--ink)] active:scale-[0.98] shrink-0"
              title={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
              aria-label="Toggle Theme"
            >
              {theme === 'dark' ? (
                <Sun className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400" />
              ) : (
                <Moon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-500" />
              )}
            </button>
          )}

          {/* Exit Class Button: For students inside any class (suppressed during active test) */}
          {!isAdmin && !isTakingQuiz && onSwitchClass && (
            <button
              type="button"
              onClick={onSwitchClass}
              id="exit-class-btn"
              className="h-[34px] sm:h-[36px] flex items-center justify-center gap-1.5 py-1 px-2 xs:px-2.5 sm:px-3 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 dark:text-rose-400 border border-rose-500/20 text-xs font-semibold transition cursor-pointer shadow-2xs active:scale-[0.98] shrink-0"
              title="Exit Class to class selection"
            >
              <LogOut className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Exit</span>
            </button>
          )}

          {/* Admin Mode Status Badge / Quick Switch */}
          {isAdmin && (
            <button
              type="button"
              onClick={onToggleAdmin}
              id="admin-toggle-btn"
              className="h-[34px] sm:h-[36px] flex items-center justify-center gap-1.5 py-1 px-2 xs:px-2.5 sm:px-3 rounded-lg border border-amber-500/40 text-amber-500 bg-amber-500/10 hover:bg-amber-500/20 text-xs font-bold transition cursor-pointer active:scale-[0.98] shrink-0"
              title={`${adminName || 'Admin'} — Click to Switch to Student View`}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span className="hidden sm:inline max-w-[140px] truncate">{adminName || 'Admin Mode'}</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
