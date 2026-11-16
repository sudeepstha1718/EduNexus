/**
 * Unified Print Service for Exam & Assessment System
 * 
 * Provides reliable, cross-browser, iframe-compatible printing.
 * In sandboxed iframe environments (like AI Studio preview), native window.print()
 * is restricted by browser security policies; this service intelligently delegates
 * to top-level printable tabs or direct Blob downloads without hanging UI spinners.
 */

export interface PrintOptions {
  title?: string;
  fallbackFilename?: string;
  onStart?: () => void;
  onSuccess?: () => void;
  onError?: (err: Error) => void;
}

/**
 * Direct print of an HTML document via in-DOM staging or top-level window.
 * Avoids any hanging states, handles iframe sandboxes, and guarantees prompt execution.
 */
export function printHtml(htmlContent: string, options: PrintOptions = {}): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      options.onStart?.();

      const isInsideIframe = typeof window !== 'undefined' && window.self !== window.top;

      // 1. If inside an iframe, window.print() inside the iframe document is blocked by the sandbox.
      // Opening a new tab with Blob URL allows window.print() to fire in an unrestricted top-level tab!
      if (isInsideIframe) {
        let openedInNewTab = false;
        try {
          const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
          const blobUrl = URL.createObjectURL(blob);
          const newTab = window.open(blobUrl, '_blank');
          if (newTab) {
            newTab.focus();
            openedInNewTab = true;
            setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
          }
        } catch (e) {
          console.warn('Iframe new tab open encountered:', e);
        }

        if (openedInNewTab) {
          options.onSuccess?.();
          resolve(true);
          return;
        }
      }

      // 2. Parse incoming standalone or partial HTML content
      const parser = new DOMParser();
      const parsedDoc = parser.parseFromString(htmlContent, 'text/html');

      // Strip out interactive preview toolbars (.no-print) and inline auto-print scripts
      parsedDoc.querySelectorAll('.no-print').forEach((el) => el.remove());
      parsedDoc.querySelectorAll('script').forEach((el) => el.remove());

      // Extract all inline stylesheets
      const styles = Array.from(parsedDoc.querySelectorAll('style'))
        .map((s) => s.textContent || '')
        .join('\n');

      const bodyHtml = parsedDoc.body ? parsedDoc.body.innerHTML : htmlContent;
      const targetTitle = options.title || parsedDoc.title || 'Print Examination Paper';
      const originalTitle = document.title;

      // 3. Prepare staging container in document.body
      const stageId = '__exam_print_active_stage__';
      let stage = document.getElementById(stageId);
      if (!stage) {
        stage = document.createElement('div');
        stage.id = stageId;
        stage.setAttribute('aria-hidden', 'true');
        document.body.appendChild(stage);
      }
      stage.innerHTML = bodyHtml;

      // 4. Prepare dynamic print styles in document.head
      const styleId = '__exam_print_active_styles__';
      let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = styleId;
        document.head.appendChild(styleEl);
      }

      styleEl.textContent = `
        ${styles}

        @media screen {
          #${stageId} {
            display: none !important;
            visibility: hidden !important;
            position: absolute !important;
            left: -99999px !important;
            top: -99999px !important;
          }
        }

        @media print {
          @page {
            size: A4 portrait;
            margin: 0 !important;
          }
          
          body.exam-printing-active > *:not(#${stageId}) {
            display: none !important;
          }

          html, body.exam-printing-active {
            background: #ffffff !important;
            background-image: none !important;
            color: #000000 !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 210mm !important;
            height: auto !important;
            overflow: visible !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          #${stageId} {
            display: block !important;
            visibility: visible !important;
            position: static !important;
            width: 210mm !important;
            max-width: 210mm !important;
            margin: 0 auto !important;
            padding: 0 !important;
            background: #ffffff !important;
            color: #000000 !important;
          }
        }
      `;

      document.body.classList.add('exam-printing-active');
      document.title = targetTitle;

      let cleanupRan = false;
      const cleanup = () => {
        if (cleanupRan) return;
        cleanupRan = true;
        window.removeEventListener('afterprint', cleanup);
        document.body.classList.remove('exam-printing-active');
        document.title = originalTitle;
        try {
          if (stage) stage.innerHTML = '';
          if (styleEl) styleEl.textContent = '';
        } catch {}
        options.onSuccess?.();
        resolve(true);
      };

      window.addEventListener('afterprint', cleanup, { once: true });

      // Immediate safety release (max 1000ms) so button NEVER gets stuck on "Printing..."
      setTimeout(() => {
        if (!cleanupRan) {
          cleanup();
        }
      }, 1000);

      try {
        window.focus();
        window.print();
      } catch (printErr: any) {
        console.warn('Direct window.print encountered error, opening fallback window:', printErr);
        cleanup();
        fallbackToWindowPrint(htmlContent, options);
        resolve(true);
      }
    } catch (err: any) {
      console.error('printHtml failed:', err);
      document.body.classList.remove('exam-printing-active');
      options.onError?.(err);
      fallbackToWindowPrint(htmlContent, options);
      resolve(false);
    }
  });
}

/**
 * Fallback mechanism: tries window.open in new tab, or anchor download
 */
export function fallbackToWindowPrint(htmlContent: string, options: PrintOptions = {}) {
  try {
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    let opened = false;
    try {
      const win = window.open(url, '_blank');
      if (win) {
        win.focus();
        opened = true;
      }
    } catch {}

    if (!opened) {
      const a = document.createElement('a');
      a.href = url;
      a.download = options.fallbackFilename || `${options.title || 'document'}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
    
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (err) {
    console.warn('Fallback failed:', err);
  }
}

/**
 * Download HTML document as standalone file
 */
export function downloadHtmlFile(htmlContent: string, filename: string): void {
  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
