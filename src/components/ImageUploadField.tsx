import React, { useState, useRef } from 'react';
import { compressImageFile } from '../lib/imageUtils';
import {
  UploadCloud,
  Link as LinkIcon,
  Image as ImageIcon,
  X,
  RefreshCw,
  Camera,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

interface ImageUploadFieldProps {
  value?: string;
  onChange: (dataUrlOrUrl: string) => void;
  onRemove?: () => void;
  label?: string;
  placeholder?: string;
  className?: string;
}

export const ImageUploadField: React.FC<ImageUploadFieldProps> = ({
  value,
  onChange,
  onRemove,
  label = 'Question Diagram / Photo',
  placeholder = 'https://... or upload photo from device',
  className = '',
}) => {
  const [mode, setMode] = useState<'upload' | 'url'>(value && value.startsWith('http') ? 'url' : 'upload');
  const [urlInput, setUrlInput] = useState<string>(value && value.startsWith('http') ? value : '');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Synchronize state when value prop changes (e.g. loading existing quiz)
  React.useEffect(() => {
    if (value) {
      if (value.startsWith('http')) {
        setUrlInput(value);
        setMode('url');
      }
    } else {
      setUrlInput('');
    }
  }, [value]);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setErrorMessage('Please select a valid image file (PNG, JPG, JPEG, WebP, SVG).');
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const compressedDataUrl = await compressImageFile(file, 1200, 1200, 0.85);
      onChange(compressedDataUrl);
    } catch (err: any) {
      console.error('Failed to process image:', err);
      setErrorMessage('Failed to read and process image file.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    // If text pasted is an image URL, automatically set it
    const pastedText = e.clipboardData?.getData('text');
    if (pastedText && (pastedText.trim().startsWith('http://') || pastedText.trim().startsWith('https://'))) {
      const cleanUrl = pastedText.trim();
      setUrlInput(cleanUrl);
      setMode('url');
      onChange(cleanUrl);
      setErrorMessage(null);
      return;
    }

    if (e.clipboardData && e.clipboardData.items) {
      for (let i = 0; i < e.clipboardData.items.length; i++) {
        const item = e.clipboardData.items[i];
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            handleFile(file);
            return;
          }
        }
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleUrlSubmit = () => {
    if (urlInput.trim()) {
      onChange(urlInput.trim());
      setErrorMessage(null);
    }
  };

  const handleClear = () => {
    onChange('');
    setUrlInput('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (onRemove) onRemove();
  };

  return (
    <div className={`space-y-2.5 font-mono ${className}`} onPaste={handlePaste}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="text-xs font-bold text-[#f2f2f4]/80 flex items-center gap-1.5">
          <ImageIcon className="w-3.5 h-3.5 text-[#4cc9f0]" />
          <span>{label}</span>
          <span className="text-[11px] font-normal text-[#f2f2f4]/40">(Optional)</span>
        </label>

        {/* Upload vs URL Tabs & Optional Dismiss */}
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex items-center bg-[#111113] p-0.5 border border-[rgba(242,242,244,0.1)] text-[11px] font-bold">
            <button
              type="button"
              onClick={() => setMode('upload')}
              className={`px-2 sm:px-2.5 py-1 transition cursor-pointer flex items-center gap-1 ${
                mode === 'upload' ? 'bg-[#4cc9f0] text-[#111113]' : 'text-[#f2f2f4]/60 hover:text-[#f2f2f4]'
              }`}
            >
              <UploadCloud className="w-3 h-3 shrink-0" /> <span>Upload Photo</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('url')}
              className={`px-2 sm:px-2.5 py-1 transition cursor-pointer flex items-center gap-1 ${
                mode === 'url' ? 'bg-[#4cc9f0] text-[#111113]' : 'text-[#f2f2f4]/60 hover:text-[#f2f2f4]'
              }`}
            >
              <LinkIcon className="w-3 h-3 shrink-0" /> <span>Image Link</span>
            </button>
          </div>

          {!value && onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="p-1 text-[#f2f2f4]/40 hover:text-rose-400 hover:bg-[#1c1c1f] transition cursor-pointer"
              title="Close image attachment"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Mode 1: File Upload / Drag & Drop */}
      {mode === 'upload' && !value && (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed p-4 sm:p-5 text-center transition cursor-pointer flex flex-col items-center justify-center gap-2 ${
            isDragging
              ? 'border-[#4cc9f0] bg-[#4cc9f0]/10'
              : 'border-[rgba(242,242,244,0.15)] hover:border-[#4cc9f0]/50 bg-[#111113] hover:bg-[#1c1c1f]'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileInputChange}
          />

          <div className="w-10 h-10 bg-[#4cc9f0]/15 text-[#4cc9f0] border border-[#4cc9f0]/30 flex items-center justify-center">
            {isProcessing ? (
              <RefreshCw className="w-5 h-5 animate-spin" />
            ) : (
              <Camera className="w-5 h-5" />
            )}
          </div>

          <div className="space-y-0.5">
            <p className="text-xs font-bold text-[#f2f2f4]">
              {isProcessing
                ? 'Processing & Compressing Photo...'
                : 'Click to upload photo or drag and drop here'}
            </p>
            <p className="text-[11px] text-[#f2f2f4]/50 font-sans">
              Supports JPG, PNG, WebP, Diagrams & Screenshots (Auto-optimized for fast printing)
            </p>
          </div>
        </div>
      )}

      {/* Mode 2: Web URL Input */}
      {mode === 'url' && !value && (
        <div className="flex flex-col xs:flex-row items-stretch xs:items-center gap-2">
          <input
            type="url"
            value={urlInput}
            onChange={(e) => {
              const val = e.target.value;
              setUrlInput(val);
              const trimmed = val.trim();
              if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:')) {
                onChange(trimmed);
                setErrorMessage(null);
              }
            }}
            onBlur={() => {
              if (urlInput.trim()) {
                handleUrlSubmit();
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleUrlSubmit();
              }
            }}
            placeholder={placeholder}
            className="flex-1 min-w-0 px-3 py-2 bg-[#111113] border border-[rgba(242,242,244,0.1)] text-xs font-medium text-[#f2f2f4] focus:outline-none focus:border-[#4cc9f0]"
          />
          <button
            type="button"
            onClick={handleUrlSubmit}
            className="btn btn-primary px-3 py-2 text-xs font-bold transition cursor-pointer shrink-0 justify-center"
          >
            Apply Link
          </button>
        </div>
      )}

      {/* Preview Section if Image is set */}
      {value && (
        <div className="bg-[#1c1c1f] border border-[rgba(242,242,244,0.1)] p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#f2f2f4]/80">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Photo Attached</span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  if (fileInputRef.current) fileInputRef.current.click();
                  else setMode('upload');
                }}
                className="text-[11px] font-bold text-[#4cc9f0] hover:text-[#4cc9f0]/80 bg-[#4cc9f0]/15 border border-[#4cc9f0]/30 px-2 py-1 transition cursor-pointer"
              >
                Change Photo
              </button>
              <button
                type="button"
                onClick={handleClear}
                className="text-[11px] font-bold text-rose-400 hover:text-rose-300 bg-rose-500/15 border border-rose-500/30 px-2 py-1 transition cursor-pointer flex items-center gap-1"
              >
                <X className="w-3 h-3" /> Remove
              </button>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileInputChange}
          />

          <div className="border border-[rgba(242,242,244,0.1)] overflow-hidden max-h-56 w-full max-w-md bg-[#111113] flex items-center justify-center p-2">
            <img
              src={value}
              alt="Question diagram preview"
              className="max-h-52 max-w-full w-auto object-contain bg-white"
              referrerPolicy="no-referrer"
            />
          </div>
        </div>
      )}

      {errorMessage && (
        <p className="text-xs font-semibold text-rose-400 flex items-center gap-1">
          <AlertCircle className="w-3.5 h-3.5" />
          {errorMessage}
        </p>
      )}
    </div>
  );
};
