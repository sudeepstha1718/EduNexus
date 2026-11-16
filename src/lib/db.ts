import { FileItem, ClassItem } from '../types';

const DB_NAME = 'SchoolNoticeBoardDB';
const DB_VERSION = 1;
const STORE_FILES_META = 'files_metadata';
const STORE_CLASSES = 'classes';
const STORE_BLOBS = 'file_blobs';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_FILES_META)) {
        db.createObjectStore(STORE_FILES_META, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_CLASSES)) {
        db.createObjectStore(STORE_CLASSES, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_BLOBS)) {
        db.createObjectStore(STORE_BLOBS);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Save or update file binary blob
export async function saveFileBlob(blobId: string, blob: Blob): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BLOBS, 'readwrite');
    const store = tx.objectStore(STORE_BLOBS);
    const request = store.put(blob, blobId);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Retrieve file binary blob
export async function getFileBlob(blobId: string): Promise<Blob | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BLOBS, 'readonly');
    const store = tx.objectStore(STORE_BLOBS);
    const request = store.get(blobId);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

// Save or update file metadata list with dual localStorage fallback
export async function saveAllFilesMeta(files: FileItem[]): Promise<void> {
  try {
    localStorage.setItem('school_board_files_backup', JSON.stringify(files));
  } catch (e) {
    console.warn('localStorage quota reached for files backup');
  }

  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_FILES_META, 'readwrite');
      const store = tx.objectStore(STORE_FILES_META);
      store.clear();
      files.forEach(f => store.put(f));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('IndexedDB failed, relied on localStorage backup:', err);
  }
}

// Get all files metadata with fallback
export async function getAllFilesMeta(): Promise<FileItem[]> {
  try {
    const db = await openDB();
    const dbFiles = await new Promise<FileItem[]>((resolve, reject) => {
      const tx = db.transaction(STORE_FILES_META, 'readonly');
      const store = tx.objectStore(STORE_FILES_META);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });

    if (dbFiles && dbFiles.length > 0) return dbFiles;
  } catch (err) {
    console.warn('IndexedDB read failed, checking localStorage backup:', err);
  }

  // Backup check
  try {
    const backupStr = localStorage.getItem('school_board_files_backup');
    if (backupStr) {
      const parsed = JSON.parse(backupStr);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.warn('localStorage backup parse error:', e);
  }

  return [];
}

// Save classes list with dual localStorage fallback
export async function saveAllClasses(classes: ClassItem[]): Promise<void> {
  try {
    localStorage.setItem('school_board_classes_backup', JSON.stringify(classes));
  } catch (e) {
    console.warn('localStorage backup error for classes');
  }

  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CLASSES, 'readwrite');
      const store = tx.objectStore(STORE_CLASSES);
      store.clear();
      classes.forEach(c => store.put(c));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('IndexedDB classes save failed:', err);
  }
}

// Get all classes with fallback
export async function getAllClasses(): Promise<ClassItem[]> {
  try {
    const db = await openDB();
    const dbClasses = await new Promise<ClassItem[]>((resolve, reject) => {
      const tx = db.transaction(STORE_CLASSES, 'readonly');
      const store = tx.objectStore(STORE_CLASSES);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });

    if (dbClasses && dbClasses.length > 0) return dbClasses;
  } catch (err) {
    console.warn('IndexedDB read classes failed:', err);
  }

  // Backup check
  try {
    const backupStr = localStorage.getItem('school_board_classes_backup');
    if (backupStr) {
      const parsed = JSON.parse(backupStr);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.warn('localStorage classes backup parse error:', e);
  }

  return [];
}

// Delete file blob and metadata
export async function deleteFileFromDB(fileId: string, blobId?: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_FILES_META, STORE_BLOBS], 'readwrite');
    tx.objectStore(STORE_FILES_META).delete(fileId);
    if (blobId) {
      tx.objectStore(STORE_BLOBS).delete(blobId);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Helper to download a file
export async function triggerFileDownload(file: FileItem): Promise<void> {
  if (file.externalUrl) {
    window.open(file.externalUrl, '_blank');
    return;
  }

  let blobToDownload: Blob | null = null;

  if (file.fileBlobId) {
    blobToDownload = await getFileBlob(file.fileBlobId);
  }

  if (!blobToDownload && file.fileDataUrl) {
    if (file.fileDataUrl.startsWith('data:')) {
      const res = await fetch(file.fileDataUrl);
      blobToDownload = await res.blob();
    } else {
      // plain text note content
      blobToDownload = new Blob([file.fileDataUrl], { type: 'text/plain;charset=utf-8' });
    }
  }

  if (!blobToDownload) {
    // Generate fallback text blob
    const fallbackText = `# ${file.title}\n\nClass: ${file.classId}\nSubject: ${file.subject}\nDate: ${new Date(file.uploadDate).toLocaleDateString()}\n\n${file.description}`;
    blobToDownload = new Blob([fallbackText], { type: 'text/plain;charset=utf-8' });
  }

  const url = URL.createObjectURL(blobToDownload);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.fileName || `${file.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// Format bytes helper
export function formatBytes(bytes?: number): string {
  if (!bytes || bytes === 0) return 'KB';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
