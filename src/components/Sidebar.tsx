import React from 'react';
import {
  FileText,
  CalendarCheck,
  BookOpen,
  FileQuestion,
  Plus,
  UserCheck,
  LogOut,
  Sun,
  Moon,
  ShieldCheck,
  Lock,
  Layers,
  ChevronRight,
  ChevronDown,
  X,
  Settings,
  GraduationCap,
  Sparkles,
  Award,
  CheckCircle2,
  FolderOpen,
  User,
} from 'lucide-react';
import { ClassItem, StudentUser } from '../types';
import { AppLogo } from './AppLogo';
import { BackgroundPicker } from './BackgroundPicker';

export interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
  isAdmin: boolean;
  onToggleAdmin: () => void;
  classes: ClassItem[];
  activeClass?: ClassItem;
  activeClassName: string;
  selectedClassId: string;
  onSelectClass?: (classId: string) => void;
  onManageClasses?: () => void;
  onSwitchClass?: () => void;
  activeTab: 'files' | 'quizzes' | 'homework' | 'lessons';
  onTabChange: (tab: 'files' | 'quizzes' | 'homework' | 'lessons') => void;
  totalFilesCount: number;
  totalQuizzesCount: number;
  totalHomeworkCount: number;
  todayHomeworkCount: number;
  totalLessonsCount: number;
  currentStudent?: StudentUser | null;
  onOpenStudentAuth?: (mode?: 'login' | 'register') => void;
  onStudentLogout?: () => void;
  onOpenStudentSubmissions?: () => void;
  onOpenUpload?: () => void;
  onOpenCreateQuiz?: () => void;
  onOpenAddHomework?: () => void;
  onOpenAddLesson?: () => void;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
  isTakingQuiz?: boolean;
  adminName?: string;
  onOpenAdminProfile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen = false,
  onClose,
  isAdmin,
  onToggleAdmin,
  classes,
  activeClass,
  activeClassName,
  selectedClassId,
  onSelectClass,
  onManageClasses,
  onSwitchClass,
  activeTab,
  onTabChange,
  totalFilesCount,
  totalQuizzesCount,
  totalHomeworkCount,
  todayHomeworkCount,
  totalLessonsCount,
  currentStudent,
  onOpenStudentAuth,
  onStudentLogout,
  onOpenStudentSubmissions,
  onOpenUpload,
  onOpenCreateQuiz,
  onOpenAddHomework,
  onOpenAddLesson,
  theme = 'dark',
  onToggleTheme,
  isTakingQuiz = false,
  adminName = 'Sudeep Shrestha',
  onOpenAdminProfile,
}) => {
  const handleTabClick = (tab: 'files' | 'quizzes' | 'homework' | 'lessons') => {
    onTabChange(tab);
    if (onClose) {
      onClose();
    }
  };

  const navItems = [
    {
      id: 'files' as const,
      label: 'Materials',
      subtitle: 'Notes, PDFs & Handouts',
      icon: FileText,
      count: totalFilesCount,
      iconColor: 'text-blue-500 dark:text-blue-400',
      iconBg: 'bg-blue-500/10 border-blue-500/20',
      activeBorder: 'border-blue-500',
    },
    {
      id: 'homework' as const,
      label: 'Homework',
      subtitle: todayHomeworkCount > 0 ? `${todayHomeworkCount} due today` : 'Daily assignments',
      icon: CalendarCheck,
      count: totalHomeworkCount,
      iconColor: 'text-amber-500 dark:text-amber-400',
      iconBg: 'bg-amber-500/10 border-amber-500/20',
      activeBorder: 'border-amber-500',
      badge: todayHomeworkCount > 0 ? `${todayHomeworkCount} today` : undefined,
    },
    {
      id: 'lessons' as const,
      label: 'Syllabus',
      subtitle: 'Term progression',
      icon: BookOpen,
      count: totalLessonsCount > 0 ? totalLessonsCount : 4,
      iconColor: 'text-emerald-500 dark:text-emerald-400',
      iconBg: 'bg-emerald-500/10 border-emerald-500/20',
      activeBorder: 'border-emerald-500',
    },
    {
      id: 'quizzes' as const,
      label: 'Tests',
      subtitle: 'Online tests & past marks',
      icon: FileQuestion,
      count: totalQuizzesCount,
      iconColor: 'text-purple-500 dark:text-purple-400',
      iconBg: 'bg-purple-500/10 border-purple-500/20',
      activeBorder: 'border-purple-500',
    },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 md:hidden transition-opacity duration-300"
          aria-hidden="true"
        />
      )}

      {/* Sidebar Panel */}
      <aside
        id="app-left-sidebar"
        className={`fixed inset-y-0 md:sticky md:top-0 left-0 h-dvh md:h-screen w-[85vw] max-w-xs sm:w-72 md:w-64 lg:w-72 bg-[var(--surface)] border-r border-[var(--border)] z-50 md:z-20 flex flex-col transition-transform duration-200 ease-in-out shrink-0 select-none overflow-hidden ${
          isOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Top Branding Section */}
        <div className="px-3.5 py-3 sm:px-4 sm:py-3.5 border-b border-[var(--border)] flex items-center justify-between gap-2.5 shrink-0 bg-[var(--surface)]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="relative shrink-0">
              <AppLogo size={28} className="shrink-0" />
              <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-[var(--surface)]" />
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-base tracking-tight text-[var(--ink)] leading-none truncate">
                  Edu<span className="text-amber-500 font-extrabold">Nexus</span>
                </span>
                <span className="text-[9px] font-mono px-1 py-0.5 rounded-md bg-[var(--surface-higher)] text-[var(--accent)] border border-[var(--border)] leading-none font-bold">
                  v2
                </span>
              </div>
              <span className="text-[9.5px] font-semibold tracking-wider uppercase text-amber-600 dark:text-amber-400 mt-0.5 truncate">
                Learning Portal
              </span>
            </div>
          </div>

          {/* Mobile close button with 40px touch hitbox */}
          <button
            type="button"
            onClick={onClose}
            className="md:hidden min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-higher)] transition cursor-pointer"
            aria-label="Close menu"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Middle Container */}
        <div className="flex-1 overflow-y-auto px-3 py-3.5 space-y-4 no-scrollbar">
          {/* Active Class Switcher / Info Card */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-higher)]/70 p-2.5 space-y-2 transition-colors">
            <div className="flex items-center justify-between text-xs font-semibold text-[var(--ink-muted)]">
              <span className="flex items-center gap-1.5">
                <GraduationCap className="w-3.5 h-3.5 text-[var(--accent)]" />
                <span>Classroom</span>
              </span>
              {!isAdmin && onSwitchClass && !isTakingQuiz && (
                <button
                  type="button"
                  onClick={() => {
                    onSwitchClass();
                    if (onClose) onClose();
                  }}
                  className="text-[11px] text-[var(--accent)] hover:underline font-semibold cursor-pointer"
                >
                  Change
                </button>
              )}
            </div>

            {isAdmin ? (
              /* Teacher / Admin Class Selector */
              <div className="space-y-2">
                <div className="relative">
                  <select
                    value={selectedClassId}
                    onChange={(e) => onSelectClass && onSelectClass(e.target.value)}
                    className="w-full text-xs font-semibold bg-[var(--surface)] text-[var(--ink)] border border-[var(--border)] rounded-lg px-2.5 py-2.5 pr-8 appearance-none focus:outline-hidden focus:ring-1 focus:ring-[var(--accent)] cursor-pointer"
                  >
                    <option value="all">🌐 All Classes (Combined View)</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        🎓 {c.name} {c.section ? `· Section ${c.section}` : ''}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-[var(--ink-muted)] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>

                {onManageClasses && (
                  <button
                    type="button"
                    onClick={() => {
                      onManageClasses();
                      if (onClose) onClose();
                    }}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg text-xs font-semibold bg-[var(--surface)] hover:bg-[var(--surface-highest)] border border-[var(--border)] text-[var(--accent)] transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Manage Classes</span>
                  </button>
                )}
              </div>
            ) : (
              /* Student Active Class Display */
              <div className="flex items-center justify-between gap-2 pt-0.5">
                <div className="min-w-0">
                  <div className="font-bold text-sm text-[var(--ink)] truncate">
                    {activeClassName}
                  </div>
                  {activeClass?.section && (
                    <div className="text-[11px] text-[var(--ink-muted)] font-mono">
                      Section {activeClass.section}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Enrolled</span>
                </div>
              </div>
            )}
          </div>

          {/* Primary Navigation Menu (Materials, Homework, Syllabus, Tests) */}
          <div className="space-y-1.5">
            <div className="px-2 text-[10px] font-bold uppercase tracking-wider text-[var(--ink-muted)]">
              Main Options
            </div>

            <nav className="space-y-1" aria-label="Portal Navigation">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleTabClick(item.id)}
                    id={`sidebar-nav-${item.id}`}
                    className={`w-full flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-lg text-left transition-all cursor-pointer group relative ${
                      isActive
                        ? 'bg-[var(--surface-higher)] text-[var(--ink)] shadow-2xs border border-[var(--border)] font-semibold'
                        : 'text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-higher)]/60'
                    }`}
                  >
                    {/* Active Accent Bar on left */}
                    {isActive && (
                      <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-md bg-[var(--accent)]" />
                    )}

                    <div className="flex items-center gap-2.5 min-w-0 pl-0.5">
                      <div
                        className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 border transition-all ${
                          isActive
                            ? 'bg-[var(--accent)] text-white border-[var(--accent)] shadow-2xs'
                            : `${item.iconBg} ${item.iconColor} group-hover:scale-105`
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                      </div>

                      <div className="flex flex-col min-w-0">
                        <span
                          className={`text-xs leading-snug truncate ${
                            isActive ? 'font-bold text-[var(--ink)]' : 'font-medium'
                          }`}
                        >
                          {item.label}
                        </span>
                        <span className="text-[10px] text-[var(--ink-muted)] truncate leading-none mt-0.5">
                          {item.subtitle}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {item.badge && !isActive && (
                        <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-500 border border-amber-500/30">
                          {item.badge}
                        </span>
                      )}
                      <span
                        className={`text-[11px] font-mono tabular-nums px-1.5 py-0.5 rounded-md leading-none ${
                          isActive
                            ? 'bg-[var(--accent)]/15 text-[var(--accent)] font-bold border border-[var(--accent)]/20'
                            : 'bg-[var(--surface-higher)] text-[var(--ink-muted)] border border-[var(--border)]'
                        }`}
                      >
                        {item.count}
                      </span>
                    </div>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Quick Actions & Tools Section */}
          <div className="space-y-2 pt-2 border-t border-[var(--border)]/60">
            <div className="px-2 text-[10px] font-bold uppercase tracking-wider text-[var(--ink-muted)]">
              {isAdmin ? 'Teacher Actions' : 'Student Center'}
            </div>

            {isAdmin ? (
              /* Teacher Quick Action Buttons */
              <div className="space-y-1">
                {onOpenUpload && (
                  <button
                    type="button"
                    onClick={() => {
                      onOpenUpload();
                      if (onClose) onClose();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-[var(--ink)] hover:bg-[var(--surface-higher)] hover:text-[var(--accent)] transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    <span>Upload Material</span>
                  </button>
                )}

                {onOpenCreateQuiz && (
                  <button
                    type="button"
                    onClick={() => {
                      onOpenCreateQuiz();
                      if (onClose) onClose();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-[var(--ink)] hover:bg-[var(--surface-higher)] hover:text-[var(--accent)] transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                    <span>Create Test / Exam</span>
                  </button>
                )}

                {onOpenAddHomework && (
                  <button
                    type="button"
                    onClick={() => {
                      onOpenAddHomework();
                      if (onClose) onClose();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-[var(--ink)] hover:bg-[var(--surface-higher)] hover:text-[var(--accent)] transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <span>Assign Homework</span>
                  </button>
                )}

                {onOpenAddLesson && (
                  <button
                    type="button"
                    onClick={() => {
                      onOpenAddLesson();
                      if (onClose) onClose();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-[var(--ink)] hover:bg-[var(--surface-higher)] hover:text-[var(--accent)] transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <span>Add Syllabus Topic</span>
                  </button>
                )}

                {onOpenAdminProfile && (
                  <button
                    type="button"
                    id="sidebar-admin-profile-btn"
                    onClick={() => {
                      onOpenAdminProfile();
                      if (onClose) onClose();
                    }}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 mt-1 rounded-lg text-xs font-semibold text-[var(--ink)] bg-[var(--surface-higher)]/60 border border-[var(--border)]/70 hover:border-amber-500/40 hover:text-amber-500 transition cursor-pointer"
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <User className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <span className="truncate">My Profile</span>
                    </span>
                    <span className="text-[10px] font-medium text-[var(--ink-muted)] truncate max-w-[95px]">
                      {adminName || 'Sudeep Shrestha'}
                    </span>
                  </button>
                )}

              </div>
            ) : (
              /* Student Center */
              <div className="space-y-2">
                {currentStudent ? (
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-higher)]/60 p-3 space-y-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-[var(--accent)]/15 border border-[var(--accent)]/30 text-[var(--accent)] font-bold text-sm flex items-center justify-center shrink-0">
                        {currentStudent.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-[var(--ink)] truncate">
                          {currentStudent.name}
                        </div>
                        <div className="text-[10px] text-[var(--ink-muted)] font-mono truncate">
                          ID: {currentStudent.studentId}
                          {currentStudent.rollNumber && ` · Roll ${currentStudent.rollNumber}`}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      {onOpenStudentSubmissions && (
                        <button
                          type="button"
                          onClick={() => {
                            onOpenStudentSubmissions();
                            if (onClose) onClose();
                          }}
                          className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg text-xs font-semibold bg-[var(--accent)] text-white hover:opacity-95 transition cursor-pointer shadow-xs active:scale-[0.98]"
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                          <span>My Marks & Submissions</span>
                        </button>
                      )}

                      {!isTakingQuiz && onStudentLogout && (
                        <button
                          type="button"
                          onClick={() => {
                            onStudentLogout();
                            if (onClose) onClose();
                          }}
                          className="w-full flex items-center justify-center gap-1.5 py-1 px-2.5 rounded-lg text-[11px] font-semibold text-[var(--ink-muted)] hover:text-rose-500 hover:bg-rose-500/10 transition cursor-pointer"
                        >
                          <LogOut className="w-3 h-3" />
                          <span>Sign Out</span>
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  !isTakingQuiz && onOpenStudentAuth && (
                    <button
                      type="button"
                      onClick={() => {
                        onOpenStudentAuth('login');
                        if (onClose) onClose();
                      }}
                      className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-[var(--accent)] hover:opacity-95 text-white text-xs font-bold transition cursor-pointer shadow-sm active:scale-[0.98]"
                    >
                      <UserCheck className="w-4 h-4" />
                      <span>Student Login / Sign Up</span>
                    </button>
                  )
                )}
              </div>
            )}
          </div>
        </div>

        {/* Mobile-Only Bottom Utility Controls (Only shown on small screens when drawer is open and header controls might be hidden) */}
        <div className="p-3 pb-[max(0.85rem,env(safe-area-inset-bottom))] border-t border-[var(--border)] bg-[var(--surface)] space-y-2 shrink-0 md:hidden">
          <div className="flex items-center justify-between gap-2">
            {/* Theme Toggle Button */}
            {onToggleTheme && (
              <button
                type="button"
                onClick={onToggleTheme}
                id="sidebar-theme-toggle"
                className="flex-1 flex items-center justify-center gap-2 py-1.5 px-3 rounded-lg bg-[var(--surface-higher)] hover:bg-[var(--surface-highest)] border border-[var(--border)] text-xs font-semibold text-[var(--ink)] transition cursor-pointer"
                title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              >
                {theme === 'dark' ? (
                  <>
                    <Sun className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>Light Mode</span>
                  </>
                ) : (
                  <>
                    <Moon className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    <span>Dark Mode</span>
                  </>
                )}
              </button>
            )}

            {/* Background Style Switcher */}
            <div className="shrink-0">
              <BackgroundPicker theme={theme} />
            </div>
          </div>

          {/* Mode Switcher / Class Exit Button for Mobile Drawer */}
          {isAdmin ? (
            <button
              type="button"
              onClick={() => {
                onToggleAdmin();
                if (onClose) onClose();
              }}
              id="sidebar-admin-toggle"
              className="w-full flex items-center justify-center gap-2 py-1.5 px-3 rounded-lg border border-amber-500/40 text-amber-500 bg-amber-500/10 hover:bg-amber-500/20 text-xs font-bold transition cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4 text-amber-500 shrink-0" />
              <span>Admin Mode Active (Switch)</span>
            </button>
          ) : (
            !isTakingQuiz && onSwitchClass && (
              <button
                type="button"
                onClick={() => {
                  onSwitchClass();
                  if (onClose) onClose();
                }}
                id="sidebar-exit-class-btn"
                className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 dark:text-rose-400 border border-rose-500/20 text-xs font-semibold transition cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5 shrink-0" />
                <span>Exit Class</span>
              </button>
            )
          )}
        </div>
      </aside>
    </>
  );
};
