import React from 'react';
import { FileItem, FileType, ViewMode } from '../types';
import { formatBytes } from '../lib/db';
import {
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
  Video,
  Music,
  ExternalLink,
  StickyNote,
  Archive,
  File,
  Download,
  Eye,
  Pin,
  Trash2,
  Edit2,
  Calendar,
  UserCheck,
  CheckCircle2,
  Lock,
  Sparkles,
} from 'lucide-react';

interface FileCardProps {
  file: FileItem;
  viewMode: ViewMode;
  classNameLabel?: string;
  onPreview: (file: FileItem) => void;
  onDownload: (file: FileItem) => void;
  isAdmin?: boolean;
  isUnlocked?: boolean;
  onRequireUnlock?: (file: FileItem, action: 'open' | 'download') => void;
  onPinToggle?: (file: FileItem) => void;
  onEdit?: (file: FileItem) => void;
  onDelete?: (file: FileItem) => void;
}

export const FileCard: React.FC<FileCardProps> = ({
  file,
  viewMode,
  classNameLabel,
  onPreview,
  onDownload,
  isAdmin = false,
  isUnlocked = false,
  onRequireUnlock,
  onPinToggle,
  onEdit,
  onDelete,
}) => {
  const handleOpenClick = () => {
    if (file.isLocked && file.filePassword && !isAdmin && !isUnlocked) {
      if (onRequireUnlock) {
        onRequireUnlock(file, 'open');
        return;
      }
    }
    onPreview(file);
  };

  const handleDownloadClick = () => {
    if (file.isLocked && file.filePassword && !isAdmin && !isUnlocked) {
      if (onRequireUnlock) {
        onRequireUnlock(file, 'download');
        return;
      }
    }
    onDownload(file);
  };

  // Determine file type icon & style
  const renderFileTypeBadge = (type: FileType) => {
    switch (type) {
      case 'pdf':
        return {
          icon: <FileText className="w-4 h-4 text-rose-500" />,
          bg: 'bg-rose-500/10 border-rose-500/20 text-rose-500',
          label: 'PDF Document',
        };
      case 'doc':
        return {
          icon: <FileSpreadsheet className="w-4 h-4 text-blue-500" />,
          bg: 'bg-blue-500/10 border-blue-500/20 text-blue-500',
          label: 'Doc / Office',
        };
      case 'image':
        return {
          icon: <ImageIcon className="w-4 h-4 text-emerald-500" />,
          bg: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500',
          label: 'Image',
        };
      case 'video':
        return {
          icon: <Video className="w-4 h-4 text-purple-500" />,
          bg: 'bg-purple-500/10 border-purple-500/20 text-purple-500',
          label: 'Video',
        };
      case 'audio':
        return {
          icon: <Music className="w-4 h-4 text-amber-500" />,
          bg: 'bg-amber-500/10 border-amber-500/20 text-amber-500',
          label: 'Audio',
        };
      case 'link':
        return {
          icon: <ExternalLink className="w-4 h-4 text-cyan-500" />,
          bg: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-500',
          label: 'Web Link',
        };
      case 'note':
        return {
          icon: <StickyNote className="w-4 h-4 text-amber-500" />,
          bg: 'bg-amber-500/10 border-amber-500/20 text-amber-500',
          label: 'Notice / Note',
        };
      case 'archive':
        return {
          icon: <Archive className="w-4 h-4 text-indigo-500" />,
          bg: 'bg-indigo-500/10 border-indigo-500/20 text-indigo-500',
          label: 'Archive / Zip',
        };
      default:
        return {
          icon: <File className="w-4 h-4 text-slate-400" />,
          bg: 'bg-slate-500/10 border-slate-500/20 text-slate-400',
          label: 'File',
        };
    }
  };

  const badgeInfo = renderFileTypeBadge(file.fileType);
  const formattedDate = new Date(file.uploadDate).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  if (viewMode === 'list') {
    return (
      <div
        id={`file-card-${file.id}`}
        className={`group bg-[var(--surface)] border ${
          file.isPinned
            ? 'border-amber-500/50 bg-amber-500/[0.02]'
            : 'border-[var(--border)] hover:border-[var(--accent)]/50'
        } p-3.5 sm:p-4 rounded-xl transition-all duration-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3 lg:gap-4 shadow-xs hover:shadow-md overflow-hidden`}
      >
        <div className="flex items-start gap-2.5 sm:gap-3.5 flex-1 min-w-0">
          <div
            className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center shrink-0 border ${badgeInfo.bg}`}
          >
            {badgeInfo.icon}
          </div>

          <div className="flex-1 min-w-0">
            {/* Quiet 1-line metadata kicker: Subject · Class · Pinned · Locked */}
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-[var(--ink-muted)] mb-1">
              {file.isPinned && (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-500">
                  <Pin className="w-3 h-3 fill-amber-500" /> Pinned
                  <span aria-hidden="true" className="text-[var(--border)]">·</span>
                </span>
              )}
              {file.isLocked && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-500">
                  <Lock className="w-3 h-3 text-amber-500" />
                  {isAdmin ? `PIN: ${file.filePassword || '1234'}` : 'Locked'}
                  <span aria-hidden="true" className="text-[var(--border)]">·</span>
                </span>
              )}
              {file.subject && (
                <span className="font-medium text-[var(--ink)] break-words">
                  {file.subject}
                </span>
              )}
              {classNameLabel && classNameLabel !== 'All Classes' && classNameLabel !== 'all' && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="break-words">{classNameLabel}</span>
                </>
              )}
            </div>

            <h3 className="font-bold text-[var(--ink)] text-sm sm:text-base leading-snug line-clamp-2 break-words group-hover:text-[var(--accent)] transition-colors">
              {file.title}
            </h3>

            {file.description && (
              <p className="text-xs text-[var(--ink-muted)] line-clamp-1 break-words mt-0.5">
                {file.description}
              </p>
            )}

            <div className="flex items-center gap-x-2 gap-y-1 text-xs text-[var(--ink-muted)] mt-1.5 flex-wrap">
              <span>{badgeInfo.label}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">{formatBytes(file.fileSize)}</span>
              <span aria-hidden="true">·</span>
              <span>{formattedDate}</span>
              {file.downloadsCount > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">{file.downloadsCount} downloads</span>
                </>
              )}
              {file.uploaderName && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-[var(--accent)] font-medium truncate max-w-full">By {file.uploaderName}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-2 shrink-0 pt-2.5 lg:pt-0 border-t lg:border-t-0 border-[var(--border)] w-full lg:w-auto justify-between xs:justify-end">
          <div className="flex items-center gap-1.5 flex-1 xs:flex-none min-w-0">
            <button
              type="button"
              onClick={handleOpenClick}
              id={`open-btn-${file.id}`}
              className="flex-1 xs:flex-none flex items-center justify-center gap-1.5 py-1.5 px-2.5 sm:px-3 rounded-lg text-xs font-semibold bg-[var(--surface-higher)] hover:bg-[var(--surface-highest)] border border-[var(--border)] text-[var(--ink)] transition cursor-pointer active:scale-95 min-w-0"
            >
              {file.isLocked && !isAdmin && !isUnlocked ? (
                <Lock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              ) : (
                <Eye className="w-3.5 h-3.5 text-[var(--ink-muted)] shrink-0" />
              )}
              <span className="truncate">View</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadClick}
              id={`download-btn-${file.id}`}
              className="flex-1 xs:flex-none flex items-center justify-center gap-1.5 py-1.5 px-3 sm:px-3.5 rounded-lg text-xs font-semibold bg-[var(--accent)] hover:opacity-90 text-white transition cursor-pointer shadow-xs active:scale-95 min-w-0"
            >
              {file.isLocked && !isAdmin && !isUnlocked ? (
                <Lock className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <Download className="w-3.5 h-3.5 shrink-0" />
              )}
              <span className="truncate">Download</span>
            </button>
          </div>

          {/* Admin quick tools */}
          {isAdmin && (
            <div className="flex items-center gap-1 pl-0 xs:pl-1.5 lg:pl-2 border-l-0 xs:border-l border-[var(--border)] shrink-0">
              {onPinToggle && (
                <button
                  type="button"
                  onClick={() => onPinToggle(file)}
                  className={`p-1.5 rounded-lg border transition cursor-pointer ${
                    file.isPinned
                      ? 'text-amber-500 bg-amber-500/10 border-amber-500/30'
                      : 'text-[var(--ink-muted)] hover:text-[var(--ink)] border-[var(--border)] hover:bg-[var(--surface-higher)]'
                  }`}
                  title={file.isPinned ? 'Unpin' : 'Pin to top'}
                  aria-label={file.isPinned ? 'Unpin material' : 'Pin material to top'}
                >
                  <Pin className="w-3.5 h-3.5" />
                </button>
              )}
              {onEdit && (
                <button
                  type="button"
                  onClick={() => onEdit(file)}
                  className="p-1.5 rounded-lg border border-[var(--border)] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-higher)] transition cursor-pointer"
                  title="Edit file details"
                  aria-label="Edit material details"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(file)}
                  className="p-1.5 rounded-lg border border-rose-500/20 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 transition cursor-pointer"
                  title="Delete file"
                  aria-label="Delete material"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Grid View layout
  return (
    <div
      id={`file-card-${file.id}`}
      className={`group bg-[var(--surface)] border ${
        file.isPinned
          ? 'border-amber-500/50 bg-amber-500/[0.02]'
          : 'border-[var(--border)] hover:border-[var(--accent)]/50'
      } p-3.5 sm:p-4 rounded-xl transition-all duration-200 flex flex-col justify-between relative shadow-2xs hover:shadow-md overflow-hidden`}
    >
      <div>
        {/* Top metadata & Icon */}
        <div className="flex items-start justify-between gap-2.5 mb-2.5">
          <div
            className={`w-9 h-9 rounded-lg flex items-center justify-center border shrink-0 ${badgeInfo.bg}`}
          >
            {badgeInfo.icon}
          </div>

          <div className="flex flex-col items-end gap-1 text-right min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap justify-end max-w-full">
              {file.isPinned && (
                <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-amber-500">
                  <Pin className="w-3 h-3 fill-amber-500" /> Pinned
                </span>
              )}
              {file.isLocked && (
                <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-amber-500">
                  <Lock className="w-3 h-3" />
                  {isAdmin ? `PIN: ${file.filePassword || '1234'}` : 'Locked'}
                </span>
              )}
              <div className="text-[10.5px] text-[var(--ink-muted)] font-medium truncate max-w-full">
                {file.subject}
              </div>
            </div>

            {/* Admin quick tools neatly placed at top-right */}
            {isAdmin && (
              <div className="flex items-center gap-1 pt-0.5">
                {onPinToggle && (
                  <button
                    type="button"
                    onClick={() => onPinToggle(file)}
                    className={`w-7 h-7 sm:w-6.5 sm:h-6.5 rounded-md border flex items-center justify-center transition cursor-pointer shrink-0 ${
                      file.isPinned
                        ? 'text-amber-500 bg-amber-500/10 border-amber-500/30'
                        : 'text-[var(--ink-muted)] hover:text-[var(--ink)] border-[var(--border)] hover:bg-[var(--surface-higher)]'
                    }`}
                    title={file.isPinned ? 'Unpin' : 'Pin to top'}
                    aria-label={file.isPinned ? 'Unpin material' : 'Pin material to top'}
                  >
                    <Pin className="w-3 h-3" />
                  </button>
                )}
                {onEdit && (
                  <button
                    type="button"
                    onClick={() => onEdit(file)}
                    className="w-7 h-7 sm:w-6.5 sm:h-6.5 rounded-md border border-[var(--border)] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-higher)] flex items-center justify-center transition cursor-pointer shrink-0"
                    title="Edit details"
                    aria-label="Edit material details"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                )}
                {onDelete && (
                  <button
                    type="button"
                    onClick={() => onDelete(file)}
                    className="w-7 h-7 sm:w-6.5 sm:h-6.5 rounded-md border border-rose-500/20 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 flex items-center justify-center transition cursor-pointer shrink-0"
                    title="Delete file"
                    aria-label="Delete material"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Title & Description */}
        <h3 className="font-semibold text-[var(--ink)] text-sm leading-snug mb-1 line-clamp-2 break-words group-hover:text-[var(--accent)] transition-colors">
          {file.title}
        </h3>

        <p className="text-xs text-[var(--ink-muted)] line-clamp-2 break-words mb-3 leading-relaxed">
          {file.description || 'No description provided.'}
        </p>
      </div>

      <div>
        {/* Metadata row with clean typographic separators */}
        <div className="pt-2.5 border-t border-[var(--border)] flex flex-wrap items-center justify-between gap-1.5 text-xs text-[var(--ink-muted)] mb-2.5">
          <span className="flex items-center gap-1 text-[10.5px]">
            <Calendar className="w-3 h-3 text-[var(--ink-muted)] shrink-0" /> {formattedDate}
          </span>
          <span className="font-mono tabular-nums text-[10.5px] font-medium text-[var(--ink)]">
            {formatBytes(file.fileSize)}
          </span>
        </div>

        {/* Action Buttons: Clean Side-by-Side View and Download */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleOpenClick}
            id={`open-btn-${file.id}`}
            className="flex-1 min-w-0 h-8 flex items-center justify-center gap-1 sm:gap-1.5 py-1 px-2 rounded-lg text-xs font-semibold bg-[var(--surface-higher)] hover:bg-[var(--surface-highest)] border border-[var(--border)] text-[var(--ink)] transition cursor-pointer active:scale-95"
          >
            {file.isLocked && !isAdmin && !isUnlocked ? (
              <Lock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            ) : (
              <Eye className="w-3.5 h-3.5 text-[var(--ink-muted)] shrink-0" />
            )}
            <span className="truncate">View</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadClick}
            id={`download-btn-${file.id}`}
            className="flex-1 min-w-0 h-8 flex items-center justify-center gap-1 sm:gap-1.5 py-1 px-2 rounded-lg text-xs font-semibold bg-[var(--accent)] hover:opacity-90 text-white transition cursor-pointer shadow-2xs active:scale-95"
          >
            {file.isLocked && !isAdmin && !isUnlocked ? (
              <Lock className="w-3.5 h-3.5 shrink-0" />
            ) : (
              <Download className="w-3.5 h-3.5 shrink-0" />
            )}
            <span className="truncate">Download</span>
          </button>
        </div>
      </div>
    </div>
  );
};
