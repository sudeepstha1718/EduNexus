import React from 'react';
import { SubjectCategory, ViewMode, SortOption } from '../types';
import { Search, LayoutGrid, List, ArrowUpDown, X, BookOpen, Layers } from 'lucide-react';

interface FilterBarProps {
  categories: SubjectCategory[];
  selectedSubject: string;
  onSelectSubject: (subject: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  sortOption: SortOption;
  onSortChange: (sort: SortOption) => void;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  categories,
  selectedSubject,
  onSelectSubject,
  searchQuery,
  onSearchChange,
  viewMode,
  onViewModeChange,
  sortOption,
  onSortChange,
}) => {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-3 sm:p-4 shadow-xs space-y-3 overflow-hidden">
      {/* Top row: Search, Sort, View Mode */}
      <div className="flex flex-col sm:flex-row md:flex-col lg:flex-row items-stretch sm:items-center md:items-stretch lg:items-center justify-between gap-2.5 sm:gap-3">
        {/* Search Input */}
        <div className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--ink-muted)] pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search materials by title, topic, or description..."
            id="search-file-input"
            className="w-full pl-10 pr-9 py-2 sm:py-2.5 bg-[var(--surface-higher)] border border-[var(--border)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] text-xs sm:text-sm text-[var(--ink)] rounded-xl outline-hidden transition placeholder-[var(--ink-muted)]"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--ink-muted)] hover:text-[var(--ink)] cursor-pointer p-0.5 rounded-full hover:bg-[var(--surface-highest)]"
              title="Clear search"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Right Controls: Sort & View Toggle */}
        <div className="flex items-center justify-between sm:justify-end md:justify-between lg:justify-end gap-2 min-w-0">
          {/* Sort Selection */}
          <div className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-xl bg-[var(--surface-higher)] border border-[var(--border)] text-xs text-[var(--ink-muted)] flex-1 sm:flex-none md:flex-1 lg:flex-none min-w-0">
            <ArrowUpDown className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
            <select
              value={sortOption}
              onChange={(e) => onSortChange(e.target.value as SortOption)}
              id="sort-option-select"
              className="bg-transparent text-xs text-[var(--ink)] outline-hidden cursor-pointer font-medium pr-1 w-full sm:w-auto min-w-0 truncate"
            >
              <option value="newest" className="bg-[var(--surface)] text-[var(--ink)]">Newest First</option>
              <option value="oldest" className="bg-[var(--surface)] text-[var(--ink)]">Oldest First</option>
              <option value="title" className="bg-[var(--surface)] text-[var(--ink)]">Title (A-Z)</option>
              <option value="downloads" className="bg-[var(--surface)] text-[var(--ink)]">Most Downloaded</option>
            </select>
          </div>

          {/* Grid / List Mode */}
          <div className="flex items-center bg-[var(--surface-higher)] p-1 rounded-xl border border-[var(--border)] shrink-0">
            <button
              type="button"
              onClick={() => onViewModeChange('grid')}
              id="view-mode-grid"
              className={`p-1.5 rounded-lg transition cursor-pointer ${
                viewMode === 'grid'
                  ? 'bg-[var(--accent)] text-white shadow-xs font-semibold'
                  : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
              }`}
              title="Grid View"
              aria-label="Grid View"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange('list')}
              id="view-mode-list"
              className={`p-1.5 rounded-lg transition cursor-pointer ${
                viewMode === 'list'
                  ? 'bg-[var(--accent)] text-white shadow-xs font-semibold'
                  : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
              }`}
              title="List View"
              aria-label="List View"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Bottom row: Interactive Subject Category Filter Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 pt-2.5 border-t border-[var(--border)]/60">
        <span className="text-[11px] font-mono uppercase tracking-wider text-[var(--ink-muted)] flex items-center gap-1.5 shrink-0 pr-1 pl-0.5 py-0.5">
          <Layers className="w-3.5 h-3.5 text-[var(--accent)]" />
          <span>Subject:</span>
        </span>

        {categories.map((cat) => {
          const isSelected = selectedSubject === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => onSelectSubject(cat.id)}
              className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs font-medium transition max-w-full cursor-pointer flex items-center gap-1.5 ${
                isSelected
                  ? 'bg-[var(--accent)] text-white shadow-xs font-bold'
                  : 'bg-[var(--surface-higher)] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-highest)] border border-[var(--border)]'
              }`}
            >
              {isSelected && <BookOpen className="w-3 h-3 text-white/80 shrink-0" />}
              <span className="truncate">{cat.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
