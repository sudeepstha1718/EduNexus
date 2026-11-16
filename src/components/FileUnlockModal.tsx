import React, { useState, useEffect } from 'react';
import { FileItem } from '../types';
import { Lock, KeyRound, ArrowRight, X, AlertCircle, FileText, CheckCircle2 } from 'lucide-react';

interface FileUnlockModalProps {
  file: FileItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (file: FileItem, action: 'open' | 'download') => void;
  pendingAction: 'open' | 'download';
}

export const FileUnlockModal: React.FC<FileUnlockModalProps> = ({
  file,
  isOpen,
  onClose,
  onSuccess,
  pendingAction,
}) => {
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState('');
  const [showPass, setShowPass] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPasscode('');
      setError('');
    }
  }, [isOpen, file]);

  if (!isOpen || !file) return null;

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    const expected = file.filePassword || '1234';
    if (passcode.trim() === expected) {
      setError('');
      onSuccess(file, pendingAction);
      onClose();
    } else {
      setError('Incorrect 4-digit passcode for this file. Please ask your teacher for the code.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] overflow-y-auto text-[var(--ink)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-[var(--surface-higher)] p-4 sm:p-6 pr-12 text-[var(--ink)] border-b border-[var(--border)] relative">
          <button
            onClick={onClose}
            className="absolute right-3.5 top-3.5 sm:right-4 sm:top-4 text-[var(--ink-muted)] hover:text-[var(--ink)] p-1.5 rounded-lg hover:bg-[var(--surface)] transition cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center mb-3">
            <Lock className="w-5 h-5" />
          </div>
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-md">
            Protected Material
          </span>
          <h3 className="text-base sm:text-lg font-geist font-bold mt-2 leading-tight break-words">
            Unlock {pendingAction === 'open' ? 'Viewing' : 'Download'}
          </h3>
          <p className="text-xs text-[var(--ink-muted)] mt-1 line-clamp-2 break-words">
            "{file.title}"
          </p>
        </div>

        {/* Body */}
        <form onSubmit={handleUnlock} className="p-4 sm:p-6 space-y-4 sm:space-y-5">
          <div className="bg-[var(--surface-higher)] p-3.5 rounded-xl border border-[var(--border)] flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-amber-500/10 text-amber-500 shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1 text-xs">
              <p className="font-semibold text-[var(--ink)] truncate">{file.title}</p>
              <p className="text-[var(--ink-muted)] text-[11px] truncate">{file.subject} • {file.fileName || 'Document'}</p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--ink-muted)] mb-2">
              Enter 4-Digit File Passcode
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--ink-muted)] pointer-events-none z-10" />
              <input
                type={showPass ? 'text' : 'password'}
                value={passcode}
                onChange={(e) => {
                  setPasscode(e.target.value);
                  setError('');
                }}
                placeholder="Enter 4-digit code..."
                autoFocus
                maxLength={8}
                id="file-unlock-input"
                className="w-full input-with-left-icon !pl-11 pr-20 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface-higher)] text-[var(--ink)] tracking-wider text-sm focus:outline-none focus:border-[var(--accent)] font-mono transition"
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-[var(--accent)] hover:underline px-1.5 py-1 cursor-pointer"
              >
                {showPass ? 'Hide' : 'Show'}
              </button>
            </div>

            {error ? (
              <div className="flex items-center gap-2 text-xs text-rose-400 mt-2.5 bg-rose-500/10 p-2.5 rounded-xl border border-rose-500/20">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            ) : (
              <p className="text-[11px] text-[var(--ink-muted)] mt-2">
                This material requires teacher passcode to unlock. Default is 1234.
              </p>
            )}
          </div>

          <div className="flex flex-col-reverse xs:flex-row gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="btn flex-1 py-2.5 px-4 rounded-xl text-xs font-semibold justify-center"
            >
              Cancel
            </button>
            <button
              type="submit"
              id="submit-unlock-file-btn"
              className="btn btn-primary flex-1 py-2.5 px-4 text-xs font-semibold rounded-xl flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Unlock File</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
