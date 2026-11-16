import React, { useState, useEffect } from 'react';
import { FileItem } from '../types';
import { getFileBlob, formatBytes } from '../lib/db';
import {
  X,
  Download,
  ExternalLink,
  Copy,
  Check,
  FileText,
  Calendar,
  UserCheck,
  Share2,
  Film,
  Music,
  Eye,
  BookOpen,
  Maximize2,
  Minimize2
} from 'lucide-react';

interface FilePreviewModalProps {
  file: FileItem | null;
  onClose: () => void;
  onDownload: (file: FileItem) => void;
  classNameLabel?: string;
}

export const FilePreviewModal: React.FC<FilePreviewModalProps> = ({
  file,
  onClose,
  onDownload,
  classNameLabel,
}) => {
  const [copied, setCopied] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);

  useEffect(() => {
    let active = true;
    if (!file) {
      setBlobUrl(null);
      setTextContent(null);
      setIsFullScreen(false);
      return;
    }

    setIsLoading(true);

    async function loadContent() {
      try {
        if (file?.fileBlobId) {
          const blob = await getFileBlob(file.fileBlobId);
          if (blob && active) {
            const url = URL.createObjectURL(blob);
            setBlobUrl(url);

            // If text, json, html, or code
            if (blob.type.includes('text') || blob.type.includes('json') || file?.fileName.endsWith('.txt') || file?.fileName.endsWith('.md')) {
              const text = await blob.text();
              setTextContent(text);
            }
          }
        } else if (file?.fileDataUrl) {
          if (file.fileDataUrl.startsWith('data:image/') || file.fileDataUrl.startsWith('data:application/pdf') || file.fileDataUrl.startsWith('http')) {
            setBlobUrl(file.fileDataUrl);
          } else if (file.fileDataUrl.startsWith('data:text/')) {
            try {
              if (file.fileDataUrl.includes(';base64,')) {
                const base64Str = file.fileDataUrl.split(';base64,')[1];
                const decoded = decodeURIComponent(escape(atob(base64Str)));
                setTextContent(decoded);
              } else {
                const textPart = file.fileDataUrl.split(',')[1];
                setTextContent(decodeURIComponent(textPart));
              }
            } catch {
              setTextContent(file.fileDataUrl);
            }
          } else if (file.fileDataUrl.startsWith('data:')) {
            // Binary data URL (docx, archive, etc.) - don't dump raw base64 into textContent
            setTextContent(null);
            setBlobUrl(file.fileDataUrl);
          } else {
            // Plain text note content
            setTextContent(file.fileDataUrl);
          }
        }
      } catch (err) {
        console.error('Failed to load file content:', err);
      } finally {
        if (active) setIsLoading(false);
      }
    }

    loadContent();

    return () => {
      active = false;
      if (blobUrl && blobUrl.startsWith('blob:')) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [file]);

  if (!file) return null;

  const handleCopyText = () => {
    const textToCopy = textContent || file.fileDataUrl;
    if (textToCopy) {
      navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleOpenPDFInNewTab = async () => {
    if (!file) return;
    try {
      let targetBlob: Blob | null = null;
      if (file.fileBlobId) {
        targetBlob = await getFileBlob(file.fileBlobId);
      }
      if (!targetBlob && file.fileDataUrl && file.fileDataUrl.startsWith('data:')) {
        const res = await fetch(file.fileDataUrl);
        targetBlob = await res.blob();
      }

      if (targetBlob) {
        const url = URL.createObjectURL(targetBlob);
        const win = window.open(url, '_blank');
        if (!win) {
          alert('Please allow popups for this site to view PDF in full screen tab.');
        }
      } else if (previewSource) {
        const win = window.open(previewSource, '_blank');
        if (!win) {
          alert('Please allow popups for this site to view PDF in full screen tab.');
        }
      }
    } catch (err) {
      console.error('Error opening PDF in new tab:', err);
      if (previewSource) {
        window.open(previewSource, '_blank');
      }
    }
  };

  const toggleFullScreenMode = () => {
    setIsFullScreen(!isFullScreen);
  };

  const formattedDate = new Date(file.uploadDate).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const previewSource = blobUrl || file.fileDataUrl || file.externalUrl;

  return (
    <div
      className={
        isFullScreen
          ? "fixed inset-0 z-[100] bg-[var(--bg)] flex flex-col w-full h-full overflow-hidden"
          : "fixed inset-0 z-50 flex items-center justify-center p-1.5 xs:p-3 sm:p-6 bg-black/60 backdrop-blur-md animate-in fade-in duration-200"
      }
    >
      <div
        className={
          isFullScreen
            ? "bg-[var(--bg)] w-full h-full flex flex-col overflow-hidden text-[var(--ink)]"
            : "bg-[var(--surface)] border border-[var(--border)] shadow-2xl w-full max-w-4xl max-h-[95vh] sm:max-h-[90vh] flex flex-col overflow-hidden text-[var(--ink)] rounded-xl sm:rounded-2xl"
        }
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-3 xs:px-4 sm:px-6 py-2.5 sm:py-3.5 border-b border-[var(--border)] flex items-center justify-between gap-2 sm:gap-4 bg-[var(--surface-higher)] shrink-0">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-[var(--accent)]/15 text-[var(--accent)] flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                {classNameLabel && (
                  <span className="text-[9px] xs:text-[10px] font-mono font-bold px-1.5 py-0.5 bg-[var(--accent)]/15 text-[var(--accent)] rounded-md truncate max-w-[110px] xs:max-w-[160px]">
                    {classNameLabel}
                  </span>
                )}
                <span className="text-[9px] xs:text-[10px] font-semibold px-1.5 py-0.5 bg-[var(--surface)] text-[var(--ink-muted)] rounded-md border border-[var(--border)] truncate max-w-[110px] xs:max-w-none">
                  {file.subject}
                </span>
              </div>
              <h2 className="font-geist font-bold text-xs xs:text-sm sm:text-base md:text-lg truncate text-[var(--ink)]">
                {file.title}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-1 xs:gap-1.5 sm:gap-2 shrink-0">
            <button
              onClick={toggleFullScreenMode}
              id="modal-fullscreen-toggle-btn"
              className="p-1.5 xs:p-2 sm:px-3 sm:py-2 rounded-lg sm:rounded-xl bg-[var(--surface)] hover:bg-[var(--surface-highest)] border border-[var(--border)] text-xs font-semibold text-[var(--ink)] transition cursor-pointer flex items-center gap-1.5"
              title={isFullScreen ? "Exit Fullscreen" : "Fullscreen Viewer"}
            >
              {isFullScreen ? (
                <>
                  <Minimize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[var(--accent)]" />
                  <span className="hidden sm:inline">Exit Fullscreen</span>
                </>
              ) : (
                <>
                  <Maximize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[var(--accent)]" />
                  <span className="hidden sm:inline">Fullscreen</span>
                </>
              )}
            </button>

            <button
              onClick={() => onDownload(file)}
              id="modal-download-btn"
              className="btn btn-primary p-1.5 xs:p-2 sm:px-3.5 sm:py-2 text-xs font-semibold rounded-lg sm:rounded-xl flex items-center gap-1.5"
              title="Download file"
            >
              <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Download</span>
            </button>

            <button
              onClick={onClose}
              id="modal-close-btn"
              className="p-1.5 xs:p-2 text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--surface)] rounded-lg sm:rounded-xl transition cursor-pointer"
              aria-label="Close"
            >
              <X className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>

        {/* Content Preview Body */}
        <div className="flex-1 overflow-y-auto p-3 xs:p-4 sm:p-6 space-y-3 sm:space-y-4 bg-[var(--bg)]">
          {/* File description & details (Compact when in fullscreen) */}
          {!isFullScreen && (
            <div className="bg-[var(--surface)] p-3 xs:p-4 border border-[var(--border)] rounded-xl">
              <p className="text-xs xs:text-sm text-[var(--ink)] font-sans leading-relaxed whitespace-pre-wrap break-words">
                {file.description || 'No detailed instructions provided.'}
              </p>

              <div className="flex flex-wrap items-center gap-2.5 xs:gap-4 text-[11px] xs:text-xs text-[var(--ink-muted)] mt-2.5 pt-2.5 border-t border-[var(--border)]">
                <span className="flex items-center gap-1.5 font-medium">
                  <Calendar className="w-3.5 h-3.5 text-[var(--accent)]" /> Uploaded {formattedDate}
                </span>
                {file.uploaderName && (
                  <span className="flex items-center gap-1.5 font-medium">
                    <UserCheck className="w-3.5 h-3.5 text-[var(--accent)]" /> By {file.uploaderName}
                  </span>
                )}
                <span className="font-medium">Size: {formatBytes(file.fileSize)}</span>
                <span>&bull; {file.downloadsCount} downloads</span>
              </div>
            </div>
          )}

          {/* Render content based on type */}
          {isLoading ? (
            <div className="p-8 sm:p-12 text-center text-[var(--ink)]/40 font-mono text-xs sm:text-sm">
              Loading file preview...
            </div>
          ) : (
            <>
              {/* PDF Preview */}
              {file.fileType === 'pdf' && previewSource && (
                <div className="bg-[var(--surface)] border border-[var(--border)] overflow-hidden p-1 flex flex-col h-full rounded-xl">
                  <div className="px-3 xs:px-4 py-2 bg-[var(--surface-higher)] flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-[var(--ink)] border-b border-[var(--border)]">
                    <span className="flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" /> PDF Reader
                    </span>
                    <div className="flex items-center gap-1.5 xs:gap-2">
                      <button
                        type="button"
                        onClick={toggleFullScreenMode}
                        className="btn px-2 py-1 text-xs rounded-lg flex items-center gap-1"
                        aria-label={isFullScreen ? 'Exit Full Screen' : 'Full Screen'}
                      >
                        {isFullScreen ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3 text-[var(--accent)] text-xs" />}
                        <span className="hidden xs:inline">{isFullScreen ? 'Exit Full Screen' : 'Full Screen'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleOpenPDFInNewTab}
                        className="btn btn-outline px-2 py-1 text-xs text-[var(--accent)] border-[var(--accent)]/30 rounded-lg flex items-center gap-1"
                        aria-label="Open PDF in new tab"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span className="hidden xs:inline">Open in Tab</span>
                      </button>
                    </div>
                  </div>
                  <iframe
                    src={previewSource}
                    className={`w-full border-none bg-white ${
                      isFullScreen ? 'flex-1 min-h-[65vh]' : 'h-[52vh] sm:h-[65vh]'
                    }`}
                    title={file.title}
                  />
                </div>
              )}

              {/* Image preview */}
              {file.fileType === 'image' && previewSource && (
                <div className="bg-[var(--surface)] p-2 flex items-center justify-center overflow-hidden border border-[var(--border)] rounded-xl">
                  <img
                    src={previewSource}
                    alt={file.title}
                    className={`${isFullScreen ? 'max-h-[calc(100vh-120px)]' : 'max-h-[55vh] sm:max-h-[60vh]'} object-contain rounded-lg`}
                  />
                </div>
              )}

              {/* Video preview */}
              {file.fileType === 'video' && previewSource && (
                <div className="bg-black overflow-hidden p-1 flex items-center justify-center border border-[var(--border)] rounded-xl">
                  <video
                    src={previewSource}
                    controls
                    className={`${isFullScreen ? 'max-h-[calc(100vh-120px)]' : 'max-h-[55vh] sm:max-h-[60vh]'} w-full rounded-lg`}
                  />
                </div>
              )}

              {/* Audio preview */}
              {file.fileType === 'audio' && previewSource && (
                <div className="bg-[var(--surface)] p-4 sm:p-6 border border-[var(--border)] space-y-2 rounded-xl">
                  <div className="flex items-center gap-2 text-xs sm:text-sm font-geist font-bold text-[var(--ink)]">
                    <Music className="w-4 h-4 text-[var(--accent)]" /> Audio Player
                  </div>
                  <audio src={previewSource} controls className="w-full" />
                </div>
              )}

              {/* Text / Note preview */}
              {(textContent || (file.fileType === 'note' && file.fileDataUrl && !file.fileDataUrl.startsWith('data:application/') && !file.fileDataUrl.startsWith('data:image/'))) && (
                <div className="bg-[var(--surface)] border border-[var(--border)] overflow-hidden rounded-xl">
                  <div className="px-3 xs:px-4 py-2 bg-[var(--surface-higher)] border-b border-[var(--border)] flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-[var(--ink-muted)] font-medium">
                      Note Content
                    </span>
                    <button
                      onClick={handleCopyText}
                      className="flex items-center gap-1 text-xs font-semibold text-[var(--accent)] hover:underline cursor-pointer"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copied ? 'Copied!' : 'Copy text'}</span>
                    </button>
                  </div>
                  <pre className="p-3 xs:p-4 sm:p-6 text-xs sm:text-sm font-mono text-[var(--ink)] whitespace-pre-wrap break-words max-h-[50vh] sm:max-h-[60vh] overflow-y-auto leading-relaxed">
                    {textContent || file.fileDataUrl}
                  </pre>
                </div>
              )}

              {/* External Link option */}
              {file.externalUrl && (
                <div className="bg-[var(--surface)] p-3 xs:p-5 border border-[var(--border)] flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4 rounded-xl">
                  <div className="space-y-1 text-center sm:text-left min-w-0 w-full">
                    <h4 className="font-geist font-bold text-xs xs:text-sm text-[var(--ink)]">
                      External Resource / Online Link
                    </h4>
                    <p className="text-xs text-[var(--accent)] break-all font-mono">
                      {file.externalUrl}
                    </p>
                  </div>
                  <a
                    href={file.externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-primary w-full sm:w-auto justify-center flex items-center gap-2 px-3 xs:px-4 py-2 text-xs font-semibold transition shrink-0 rounded-xl"
                  >
                    <span>Open Resource</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}

              {/* Fallback download card for Word / Doc / Archives / Other */}
              {!textContent && !file.externalUrl && file.fileType !== 'pdf' && file.fileType !== 'image' && file.fileType !== 'video' && file.fileType !== 'audio' && (
                <div className="bg-[var(--surface)] p-5 sm:p-8 text-center space-y-3 border border-[var(--border)] rounded-xl">
                  <FileText className="w-10 h-10 sm:w-12 sm:h-12 text-[var(--accent)] mx-auto" />
                  <h4 className="font-geist font-bold text-xs sm:text-sm text-[var(--ink)]">
                    Document Ready for Download
                  </h4>
                  <p className="text-xs text-[var(--ink-muted)] max-w-md mx-auto">
                    You can download this file directly to your device to view with your native application.
                  </p>
                  <button
                    onClick={() => onDownload(file)}
                    className="btn btn-primary inline-flex items-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 text-xs font-semibold rounded-xl cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Download File ({formatBytes(file.fileSize)})
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-3 xs:px-4 sm:px-6 py-2.5 sm:py-3 border-t border-[var(--border)] flex items-center justify-between gap-2 text-xs text-[var(--ink-muted)] bg-[var(--surface-higher)] shrink-0">
          <span className="font-mono text-[10px] xs:text-[11px] truncate min-w-0 flex-1">
            Material ID: {file.id}
          </span>
          <button
            onClick={onClose}
            className="btn px-3 xs:px-4 py-1.5 text-xs font-semibold rounded-lg sm:rounded-xl cursor-pointer shrink-0"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

