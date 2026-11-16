import React, { useState, useRef, useEffect } from 'react';
import {
  Folder,
  FileQuestion,
  Upload,
  UserCheck,
  ShieldCheck,
  Lock,
  LogOut,
  Sun,
  Moon,
  Search,
  BookOpen,
  Sparkles,
  Info,
  Layers,
  GraduationCap
} from 'lucide-react';
import { StudentUser } from '../types';
import { ZorinLogo } from './ZorinLogo';

interface ZorinStartMenuProps {
  isOpen: boolean;
  onClose: () => void;
  activeClassName: string;
  isAdmin: boolean;
  activeTab: 'files' | 'quizzes';
  onTabChange: (tab: 'files' | 'quizzes') => void;
  onOpenUpload: () => void;
  onOpenCreateQuiz?: () => void;
  onToggleAdmin: () => void;
  onSwitchClass?: () => void;
  currentStudent?: StudentUser | null;
  onOpenStudentAuth?: () => void;
  onStudentLogout?: () => void;
  onOpenStudentSubmissions?: () => void;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
  filesCount: number;
  quizzesCount: number;
}

export const ZorinStartMenu: React.FC<ZorinStartMenuProps> = ({
  isOpen,
  onClose,
  activeClassName,
  isAdmin,
  activeTab,
  onTabChange,
  onOpenUpload,
  onOpenCreateQuiz,
  onToggleAdmin,
  onSwitchClass,
  currentStudent,
  onOpenStudentAuth,
  onStudentLogout,
  onOpenStudentSubmissions,
  theme = 'dark',
  onToggleTheme,
  filesCount,
  quizzesCount,
}) => {
  const [search, setSearch] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={menuRef}
      className="absolute top-14 left-4 sm:left-8 z-50 w-[340px] sm:w-[380px] bg-[var(--surface)]/95 backdrop-blur-2xl border border-[var(--border)] rounded-2xl shadow-2xl p-4 text-[var(--ink)] animate-in fade-in slide-in-from-top-3 duration-200"
    >
      {/* User / Class Profile Header */}
      <div className="flex items-center gap-3 p-3 bg-[var(--surface-higher)] rounded-xl border border-[var(--border)] mb-3">
        <ZorinLogo size={36} />
        <div className="flex-1 min-w-0">
          <div className="font-geist font-bold text-sm truncate flex items-center gap-1.5">
            <span>{isAdmin ? 'Teacher Admin' : (currentStudent ? currentStudent.name : 'Student Session')}</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block shrink-0" />
          </div>
          <div className="font-mono text-[11px] text-[var(--ink-muted)] truncate flex items-center gap-1">
            <GraduationCap className="w-3 h-3 text-[var(--accent)]" />
            <span>{activeClassName}</span>
          </div>
        </div>
        {isAdmin && (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-500 border border-amber-500/30">
            ROOT
          </span>
        )}
      </div>

      {/* Quick Search */}
      <div className="relative mb-3">
        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-muted)]" />
        <input
          type="text"
          placeholder="Search apps and commands..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-8 pr-3 py-1.5 bg-[var(--bg)] border border-[var(--border)] focus:border-[var(--accent)] text-xs rounded-lg outline-none text-[var(--ink)] placeholder-[var(--ink-muted)]"
        />
      </div>

      {/* Applications List */}
      <div className="space-y-1 max-h-[300px] overflow-y-auto pr-1">
        {/* Materials / File Manager */}
        <button
          type="button"
          onClick={() => {
            onTabChange('files');
            onClose();
          }}
          className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left transition cursor-pointer ${
            activeTab === 'files'
              ? 'bg-[var(--accent)]/15 text-[var(--accent)] font-semibold border border-[var(--accent)]/30'
              : 'hover:bg-[var(--surface-higher)]'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center">
              <Folder className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-semibold">Class Materials</div>
              <div className="text-[10px] text-[var(--ink-muted)]">Documents, notes & downloads</div>
            </div>
          </div>
          <span className="text-[10px] font-mono bg-[var(--bg)] px-2 py-0.5 rounded-md border border-[var(--border)]">
            {filesCount}
          </span>
        </button>

        {/* Assessments / Quizzes */}
        <button
          type="button"
          onClick={() => {
            onTabChange('quizzes');
            onClose();
          }}
          className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left transition cursor-pointer ${
            activeTab === 'quizzes'
              ? 'bg-[var(--accent)]/15 text-[var(--accent)] font-semibold border border-[var(--accent)]/30'
              : 'hover:bg-[var(--surface-higher)]'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
              <FileQuestion className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-semibold">Assessments Hub</div>
              <div className="text-[10px] text-[var(--ink-muted)]">Interactive quizzes & AI evaluation</div>
            </div>
          </div>
          <span className="text-[10px] font-mono bg-[var(--bg)] px-2 py-0.5 rounded-md border border-[var(--border)]">
            {quizzesCount}
          </span>
        </button>

        {/* Upload Action (if Admin) */}
        {isAdmin && (
          <button
            type="button"
            onClick={() => {
              onOpenUpload();
              onClose();
            }}
            className="w-full flex items-center gap-3 p-2.5 rounded-xl text-left hover:bg-[var(--surface-higher)] transition cursor-pointer"
          >
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
              <Upload className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-semibold">Upload Resource</div>
              <div className="text-[10px] text-[var(--ink-muted)]">Upload PDFs, docs, links & notes</div>
            </div>
          </button>
        )}

        {/* Student Marks / Submissions */}
        {currentStudent && onOpenStudentSubmissions && (
          <button
            type="button"
            onClick={() => {
              onOpenStudentSubmissions();
              onClose();
            }}
            className="w-full flex items-center gap-3 p-2.5 rounded-xl text-left hover:bg-[var(--surface-higher)] transition cursor-pointer"
          >
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center">
              <UserCheck className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-semibold">My Marks & Submissions</div>
              <div className="text-[10px] text-[var(--ink-muted)]">Check test scores & teacher feedback</div>
            </div>
          </button>
        )}

        {/* Student Login (if not logged in) */}
        {!isAdmin && !currentStudent && onOpenStudentAuth && (
          <button
            type="button"
            onClick={() => {
              onOpenStudentAuth();
              onClose();
            }}
            className="w-full flex items-center gap-3 p-2.5 rounded-xl text-left hover:bg-[var(--surface-higher)] transition cursor-pointer"
          >
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 text-cyan-500 flex items-center justify-center">
              <UserCheck className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-semibold">Student Login</div>
              <div className="text-[10px] text-[var(--ink-muted)]">Track scores across sessions</div>
            </div>
          </button>
        )}

        {/* Exit Class option for students inside any class */}
        {!isAdmin && onSwitchClass && (
          <button
            type="button"
            onClick={() => {
              onSwitchClass();
              onClose();
            }}
            className="w-full flex items-center gap-3 p-2.5 rounded-xl text-left hover:bg-rose-500/10 transition cursor-pointer text-rose-500 dark:text-rose-400"
          >
            <div className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-500 flex items-center justify-center">
              <LogOut className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-semibold">Exit Class</div>
              <div className="text-[10px] text-[var(--ink-muted)]">Return to class portal</div>
            </div>
          </button>
        )}

        {/* Admin Toggle - ONLY visible when already in Admin mode */}
        {isAdmin && (
          <button
            type="button"
            onClick={() => {
              onToggleAdmin();
              onClose();
            }}
            className="w-full flex items-center gap-3 p-2.5 rounded-xl text-left hover:bg-[var(--surface-higher)] transition cursor-pointer"
          >
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-semibold">Exit Teacher Mode</div>
              <div className="text-[10px] text-[var(--ink-muted)]">Return to student view</div>
            </div>
          </button>
        )}
      </div>

      {/* System Tray Bar at bottom of start menu */}
      <div className="mt-3 pt-3 border-t border-[var(--border)] flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          {onToggleTheme && (
            <button
              type="button"
              onClick={onToggleTheme}
              className="p-2 rounded-lg bg-[var(--surface-higher)] hover:bg-[var(--surface-highest)] text-[var(--ink)] transition cursor-pointer"
              title={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-blue-500" />}
            </button>
          )}

          {onSwitchClass && !isAdmin && (
            <button
              type="button"
              onClick={() => {
                onSwitchClass();
                onClose();
              }}
              className="px-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 dark:text-rose-400 border border-rose-500/20 text-[11px] font-mono transition cursor-pointer flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5 text-rose-500" />
              <span>Exit Class</span>
            </button>
          )}
        </div>

        <span className="font-mono text-[10px] text-[var(--ink-muted)]">
          EduNexus • Digital Portal
        </span>
      </div>
    </div>
  );
};
