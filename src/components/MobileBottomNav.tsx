import React from 'react';
import {
  FileText,
  CalendarCheck,
  BookOpen,
  FileQuestion,
  Menu,
} from 'lucide-react';

interface MobileBottomNavProps {
  activeTab: 'files' | 'quizzes' | 'homework' | 'lessons';
  onTabChange: (tab: 'files' | 'quizzes' | 'homework' | 'lessons') => void;
  onOpenSidebar: () => void;
  totalFilesCount: number;
  totalQuizzesCount: number;
  totalHomeworkCount: number;
  todayHomeworkCount: number;
  totalLessonsCount: number;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  onTabChange,
  onOpenSidebar,
  totalFilesCount,
  totalQuizzesCount,
  totalHomeworkCount,
  todayHomeworkCount,
  totalLessonsCount,
}) => {
  const tabs = [
    {
      id: 'files' as const,
      label: 'Materials',
      icon: FileText,
      count: totalFilesCount,
      activeColor: 'text-blue-500',
      activeBg: 'bg-blue-500/10',
    },
    {
      id: 'homework' as const,
      label: 'Homework',
      icon: CalendarCheck,
      count: totalHomeworkCount,
      badge: todayHomeworkCount > 0 ? todayHomeworkCount : undefined,
      activeColor: 'text-amber-500',
      activeBg: 'bg-amber-500/10',
    },
    {
      id: 'lessons' as const,
      label: 'Syllabus',
      icon: BookOpen,
      count: totalLessonsCount > 0 ? totalLessonsCount : 4,
      activeColor: 'text-emerald-500',
      activeBg: 'bg-emerald-500/10',
    },
    {
      id: 'quizzes' as const,
      label: 'Tests',
      icon: FileQuestion,
      count: totalQuizzesCount,
      activeColor: 'text-purple-500',
      activeBg: 'bg-purple-500/10',
    },
  ];

  return (
    <nav
      id="mobile-bottom-navigation"
      aria-label="Mobile Bottom Navigation"
      className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-[var(--surface)]/95 backdrop-blur-lg border-t border-[var(--border)] px-1 sm:px-3 h-16 flex items-center justify-around shadow-lg transition-colors pb-safe select-none"
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            id={`mobile-bottom-${tab.id}`}
            className={`flex-1 min-h-[44px] flex flex-col items-center justify-center relative py-1 px-1 rounded-xl transition-all cursor-pointer active:scale-95 ${
              isActive
                ? `${tab.activeColor} font-bold`
                : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
            }`}
          >
            {/* Top active indicator line */}
            {isActive && (
              <span className="absolute top-0 inset-x-3 h-0.5 rounded-full bg-[var(--accent)]" />
            )}

            <div className="relative">
              <Icon className={`w-5 h-5 transition-transform ${isActive ? 'scale-110' : ''}`} />
              {tab.badge && (
                <span className="absolute -top-1 -right-2 w-3.5 h-3.5 bg-amber-500 text-white rounded-full text-[9px] font-bold font-mono flex items-center justify-center ring-2 ring-[var(--surface)]">
                  {tab.badge}
                </span>
              )}
            </div>

            <span className="text-[10px] tracking-tight truncate max-w-full mt-0.5">
              {tab.label}
            </span>
          </button>
        );
      })}

      {/* Menu / Drawer Trigger */}
      <button
        type="button"
        onClick={onOpenSidebar}
        id="mobile-bottom-more-btn"
        className="flex-1 min-h-[44px] flex flex-col items-center justify-center py-1 px-1 rounded-xl text-[var(--ink-muted)] hover:text-[var(--ink)] transition cursor-pointer active:scale-95"
      >
        <Menu className="w-5 h-5" />
        <span className="text-[10px] tracking-tight truncate max-w-full mt-0.5">
          Menu
        </span>
      </button>
    </nav>
  );
};
