import React from 'react';
import { ClassItem, FileItem } from '../types';
import { GraduationCap, BookOpen, Cpu, Award, Layers, Plus } from 'lucide-react';

interface ClassSelectorProps {
  classes: ClassItem[];
  selectedClassId: string;
  onSelectClass: (classId: string) => void;
  files: FileItem[];
  isAdmin: boolean;
  onManageClasses?: () => void;
}

export const ClassSelector: React.FC<ClassSelectorProps> = ({
  classes,
  selectedClassId,
  onSelectClass,
  files,
  isAdmin,
  onManageClasses,
}) => {
  const renderIcon = (iconName?: string) => {
    switch (iconName) {
      case 'BookOpen':
        return <BookOpen className="w-3.5 h-3.5 shrink-0" />;
      case 'Cpu':
        return <Cpu className="w-3.5 h-3.5 shrink-0" />;
      case 'Award':
        return <Award className="w-3.5 h-3.5 shrink-0" />;
      case 'GraduationCap':
      default:
        return <GraduationCap className="w-3.5 h-3.5 shrink-0" />;
    }
  };

  const getClassFileCount = (classId: string) => {
    if (classId === 'all') return files.length;
    return files.filter((f) => f.classId === classId || f.classId === 'all').length;
  };

  return (
    <div className="bg-[var(--surface)] border-b border-[var(--border)] py-2 px-3 sm:px-5 lg:px-7 transition-colors">
      <div className="w-full max-w-7xl 2xl:max-w-[1540px] mx-auto space-y-1.5">
        {/* Top control bar: Label and Manage button */}
        <div className="flex items-center justify-between gap-2 w-full">
          <span className="text-[10.5px] font-mono uppercase tracking-wider text-[var(--ink-muted)] flex items-center gap-1.5 shrink-0">
            <Layers className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
            <span>Teacher Class Filter:</span>
          </span>

          {isAdmin && onManageClasses && (
            <button
              type="button"
              onClick={onManageClasses}
              id="manage-classes-btn"
              className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[var(--surface-higher)] hover:bg-[var(--surface-highest)] border border-[var(--border)] text-[11px] font-semibold text-[var(--accent)] transition cursor-pointer shrink-0 active:scale-95 shadow-2xs"
              title="Manage Classes and Student Credentials"
            >
              <Plus className="w-3 h-3 shrink-0" />
              <span>Manage Classes</span>
            </button>
          )}
        </div>

        {/* Classes grid container */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1.5 w-full min-w-0">
          {/* All Classes option */}
          {isAdmin && (
            <button
              type="button"
              onClick={() => onSelectClass('all')}
              id="class-tab-all"
              className={`w-full flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer active:scale-[0.98] border ${
                selectedClassId === 'all'
                  ? 'bg-[var(--accent)] text-white border-[var(--accent)] shadow-2xs'
                  : 'bg-[var(--surface-higher)] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-highest)] border-[var(--border)]'
              }`}
            >
              <div className="flex items-center gap-1.5 min-w-0 truncate">
                <Layers className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">All Classes</span>
              </div>
              <span
                className={`text-[9.5px] font-mono tabular-nums px-1.5 py-0.5 rounded-md leading-none shrink-0 ${
                  selectedClassId === 'all'
                    ? 'bg-white/25 text-white font-bold'
                    : 'bg-[var(--surface)] text-[var(--ink-muted)] border border-[var(--border)]'
                }`}
              >
                {getClassFileCount('all')}
              </span>
            </button>
          )}

          {/* Classes list */}
          {classes.map((c) => {
            if (!isAdmin && selectedClassId !== c.id) {
              return null;
            }
            const count = getClassFileCount(c.id);
            const isSelected = selectedClassId === c.id;

            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelectClass(c.id)}
                id={`class-tab-${c.id}`}
                className={`w-full flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer active:scale-[0.98] border text-left ${
                  isSelected
                    ? 'bg-[var(--accent)] text-white border-[var(--accent)] shadow-2xs'
                    : 'bg-[var(--surface-higher)] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-highest)] border-[var(--border)]'
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  {renderIcon(c.icon)}
                  <span className="truncate">{c.name}</span>
                  {c.section && (
                    <span
                      className={`text-[9.5px] shrink-0 font-mono ${
                        isSelected ? 'text-white/80' : 'text-[var(--ink-muted)]'
                      }`}
                    >
                      ({c.section})
                    </span>
                  )}
                </div>
                <span
                  className={`text-[9.5px] font-mono tabular-nums px-1.5 py-0.5 rounded-md leading-none shrink-0 ${
                    isSelected
                      ? 'bg-white/25 text-white font-bold'
                      : 'bg-[var(--surface)] text-[var(--ink-muted)] border border-[var(--border)]'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
