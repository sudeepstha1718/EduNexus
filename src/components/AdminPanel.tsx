import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ClassItem, FileItem, FileType, SubjectCategory, StudentUser, QuizItem } from '../types';
import { saveFileBlob } from '../lib/db';
import { formatRollWithSection, detectSectionFromRoll } from './StudentIdPassModal';
import {
  fetchStudents,
  registerStudent,
  updateStudent,
  resetStudentPassword,
  deleteStudent,
  getAuthenticatedPrintUrl,
  fetchAdminCredentials,
  updateAdminCredentials
} from '../lib/api';
import { validateAdminPasswordFormat } from '../lib/deviceFingerprint';
import {
  X,
  Upload,
  Plus,
  FileText,
  Link as LinkIcon,
  StickyNote,
  Pin,
  CheckCircle2,
  Trash2,
  Layers,
  Key,
  ShieldAlert,
  AlertCircle,
  BookOpen,
  Tag,
  Edit2,
  Lock,
  Eye,
  EyeOff,
  Sparkles,
  School,
  GraduationCap,
  Users,
  Search,
  RotateCcw,
  Check,
  Printer,
  Copy,
  KeyRound,
  ChevronDown,
  ChevronUp,
  CreditCard,
  ShieldCheck,
  FileQuestion,
  Play,
  Award,
  Clock,
  User,
} from 'lucide-react';
import { StudentIdPassModal } from './StudentIdPassModal';

interface AdminPanelProps {
  isOpen: boolean;
  onClose: () => void;
  classes: ClassItem[];
  subjects: SubjectCategory[];
  quizzes?: QuizItem[];
  onSaveFile: (file: FileItem) => void;
  onAddClass: (newClass: ClassItem) => void;
  onUpdateClass: (updatedClass: ClassItem) => void;
  onDeleteClass: (classId: string) => void;
  onAddSubject: (newSubject: SubjectCategory) => void;
  onDeleteSubject: (subjectId: string) => void;
  onTakeQuiz?: (quiz: QuizItem) => void;
  onPrintQuiz?: (quiz: QuizItem) => void;
  onCreateQuiz?: () => void;
  onEditQuiz?: (quiz: QuizItem) => void;
  onDeleteQuiz?: (quizId: string) => void;
  editingFile?: FileItem | null;
  onOpenSubmissions?: (studentNameOrId?: string, quizId?: string) => void;
  initialTab?: 'upload' | 'classes' | 'subjects' | 'students' | 'tests' | 'settings';
  adminName?: string;
  onAdminProfileUpdated?: (name: string, username: string) => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({
  isOpen,
  onClose,
  classes,
  subjects,
  quizzes = [],
  onSaveFile,
  onAddClass,
  onUpdateClass,
  onDeleteClass,
  onAddSubject,
  onDeleteSubject,
  onTakeQuiz,
  onPrintQuiz,
  onCreateQuiz,
  onEditQuiz,
  onDeleteQuiz,
  editingFile,
  onOpenSubmissions,
  initialTab = 'upload',
  adminName = 'Sudeep Shrestha',
  onAdminProfileUpdated,
}) => {
  const [tab, setTab] = useState<'upload' | 'classes' | 'subjects' | 'students' | 'tests' | 'settings'>(initialTab || 'upload');

  // Tests / Assessment Management state
  const [testSearch, setTestSearch] = useState<string>('');
  const [testFilterClass, setTestFilterClass] = useState<string>('all');

  const filteredTests = useMemo(() => {
    return quizzes.filter((q) => {
      const matchSearch =
        !testSearch.trim() ||
        q.title.toLowerCase().includes(testSearch.toLowerCase()) ||
        q.subject.toLowerCase().includes(testSearch.toLowerCase()) ||
        (q.description && q.description.toLowerCase().includes(testSearch.toLowerCase()));
      const matchClass =
        testFilterClass === 'all' || q.classId === testFilterClass;
      return matchSearch && matchClass;
    });
  }, [quizzes, testSearch, testFilterClass]);

  const settingsTabBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (initialTab && isOpen) {
      setTab(initialTab);
    }
  }, [initialTab, isOpen]);

  useEffect(() => {
    if (isOpen && tab === 'settings' && settingsTabBtnRef.current) {
      settingsTabBtnRef.current.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [isOpen, tab]);

  // Student Accounts state
  const [students, setStudents] = useState<StudentUser[]>([]);
  const [studentsLoading, setStudentsLoading] = useState<boolean>(false);
  const [studentSearch, setStudentSearch] = useState<string>('');
  const [studentFilterClass, setStudentFilterClass] = useState<string>('all');
  const [studentActionNotice, setStudentActionNotice] = useState<string | null>(null);
  const [studentActionError, setStudentActionError] = useState<string | null>(null);
  const [isManualAddOpen, setIsManualAddOpen] = useState<boolean>(false);
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // New Student creation state
  const [newStudentRollNo, setNewStudentRollNo] = useState<string>('');
  const [newStudentSection, setNewStudentSection] = useState<'A' | 'B'>('A');
  const [newStudentId, setNewStudentId] = useState<string>('');
  const [newStudentName, setNewStudentName] = useState<string>('');
  const [newStudentClass, setNewStudentClass] = useState<string>(classes[0]?.id || 'grade-9');
  const [newStudentPassword, setNewStudentPassword] = useState<string>('password');

  // Edit Student state
  const [editingStudent, setEditingStudent] = useState<StudentUser | null>(null);
  const [editStudentRollNo, setEditStudentRollNo] = useState<string>('');
  const [editStudentSection, setEditStudentSection] = useState<'A' | 'B'>('A');
  const [editStudentName, setEditStudentName] = useState<string>('');
  const [editStudentId, setEditStudentId] = useState<string>('');
  const [editStudentClass, setEditStudentClass] = useState<string>('');
  const [editStudentPassword, setEditStudentPassword] = useState<string>('');

  // Password Reset Modal State
  const [resetModalStudent, setResetModalStudent] = useState<StudentUser | null>(null);
  const [customResetPassword, setCustomResetPassword] = useState<string>('password');

  // Delete Student Modal State
  const [deleteModalStudent, setDeleteModalStudent] = useState<StudentUser | null>(null);

  // Print Student ID Pass Modal State
  const [isIdPassModalOpen, setIsIdPassModalOpen] = useState<boolean>(false);
  const [idPassModalStudent, setIdPassModalStudent] = useState<StudentUser | null>(null);

  const loadStudents = async () => {
    setStudentsLoading(true);
    try {
      const data = await fetchStudents();
      setStudents(data);
    } catch (err) {
      console.error('Error fetching students:', err);
    } finally {
      setStudentsLoading(false);
    }
  };

  useEffect(() => {
    if (tab === 'students') {
      loadStudents();
    }
  }, [tab]);

  const togglePasswordVisibility = (id: string) => {
    setVisiblePasswords((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const copyToClipboard = (text: string, fieldKey: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldKey);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    const effectiveRoll = formatRollWithSection(newStudentRollNo.trim() || '1', newStudentSection);
    const effectiveId = newStudentId.trim() || (effectiveRoll ? `STD-${effectiveRoll}` : '');
    if (!effectiveId || !newStudentName.trim() || !newStudentPassword.trim()) {
      setStudentActionError('Please fill in Roll No / Student ID, Name, and Password.');
      return;
    }

    if (effectiveId.toLowerCase() === newStudentName.trim().toLowerCase()) {
      setStudentActionError('Student ID and Full Name must be different.');
      return;
    }

    try {
      await registerStudent({
        studentId: effectiveId,
        rollNo: effectiveRoll,
        name: newStudentName.trim(),
        classId: newStudentClass,
        password: newStudentPassword.trim(),
      });
      setNewStudentRollNo('');
      setNewStudentId('');
      setNewStudentName('');
      setNewStudentPassword('password');
      setIsManualAddOpen(false);
      setStudentActionError(null);
      setStudentActionNotice(`Student account "${newStudentName.trim()}" (Roll #${effectiveRoll}) created successfully.`);
      setTimeout(() => setStudentActionNotice(null), 3500);
      loadStudents();
    } catch (err: any) {
      setStudentActionError(err.message || 'Failed to create student account');
    }
  };

  const handleConfirmResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetModalStudent) return;
    try {
      const targetPwd = customResetPassword.trim() || 'password';
      await resetStudentPassword(resetModalStudent.id, targetPwd);
      setStudentActionError(null);
      setStudentActionNotice(`Password for ${resetModalStudent.name} (${resetModalStudent.studentId}) updated to: ${targetPwd}`);
      setResetModalStudent(null);
      setTimeout(() => setStudentActionNotice(null), 4500);
      loadStudents();
    } catch (err: any) {
      setStudentActionError(err.message || 'Failed to reset password');
    }
  };

  const handleUpdateStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;

    if (editStudentId.trim().toLowerCase() === editStudentName.trim().toLowerCase()) {
      setStudentActionError('Student ID and Full Name must be different.');
      return;
    }

    const effectiveRoll = formatRollWithSection(editStudentRollNo.trim() || '1', editStudentSection);

    try {
      await updateStudent(editingStudent.id, {
        studentId: editStudentId.trim(),
        rollNo: effectiveRoll,
        name: editStudentName.trim(),
        classId: editStudentClass,
        password: editStudentPassword.trim() || undefined,
      });
      setEditingStudent(null);
      setEditStudentPassword('');
      setEditStudentRollNo('');
      setStudentActionError(null);
      setStudentActionNotice(`Student account updated successfully (Roll #${effectiveRoll}).`);
      setTimeout(() => setStudentActionNotice(null), 3500);
      loadStudents();
    } catch (err: any) {
      setStudentActionError(err.message || 'Failed to update student');
    }
  };

  const handleConfirmDeleteStudent = async () => {
    if (!deleteModalStudent) return;
    try {
      await deleteStudent(deleteModalStudent.id);
      setStudentActionError(null);
      setStudentActionNotice(`Student "${deleteModalStudent.name}" (${deleteModalStudent.studentId}), login credentials, attempts, and answers wiped completely.`);
      setDeleteModalStudent(null);
      setTimeout(() => setStudentActionNotice(null), 4500);
      loadStudents();
    } catch (err: any) {
      setStudentActionError(err.message || 'Failed to delete student');
    }
  };

  // Upload Form states
  const [title, setTitle] = useState(editingFile?.title || '');
  const [description, setDescription] = useState(editingFile?.description || '');
  const [classId, setClassId] = useState(editingFile?.classId || 'grade-9');
  const [subject, setSubject] = useState(editingFile?.subject || 'Mathematics');
  const [uploadType, setUploadType] = useState<'file' | 'note' | 'link'>('file');
  const [uploaderName, setUploaderName] = useState(editingFile?.uploaderName || adminName || 'Sudeep Shrestha');
  const [isPinned, setIsPinned] = useState(editingFile?.isPinned || false);
  const [isLocked, setIsLocked] = useState(editingFile?.isLocked || false);
  const [filePassword, setFilePassword] = useState(editingFile?.filePassword || '');
  const [externalUrl, setExternalUrl] = useState(editingFile?.externalUrl || '');
  const [noteText, setNoteText] = useState(editingFile?.fileDataUrl || '');

  // Auto-generate 4-digit PIN for file
  const generateRandomPin = () => {
    const pin = Math.floor(1000 + Math.random() * 9000).toString();
    setFilePassword(pin);
    setIsLocked(true);
  };

  useEffect(() => {
    if (editingFile) {
      setTitle(editingFile.title);
      setDescription(editingFile.description);
      setClassId(editingFile.classId);
      setSubject(editingFile.subject);
      setUploaderName(editingFile.uploaderName || adminName || 'Sudeep Shrestha');
      setIsPinned(editingFile.isPinned || false);
      setIsLocked(editingFile.isLocked || false);
      setFilePassword(editingFile.filePassword || '');
      setExternalUrl(editingFile.externalUrl || '');
      setNoteText(editingFile.fileDataUrl || '');
      if (editingFile.fileType === 'note') setUploadType('note');
      else if (editingFile.fileType === 'link') setUploadType('link');
      else setUploadType('file');
    } else {
      setTitle('');
      setDescription('');
      setClassId(classes[0]?.id || 'all');
      setSubject(subjects[0]?.name || 'Mathematics');
      setUploadType('file');
      setUploaderName(adminName || 'Sudeep Shrestha');
      setIsPinned(false);
      setIsLocked(false);
      setFilePassword('');
      setExternalUrl('');
      setNoteText('');
      setSelectedFile(null);
    }
  }, [editingFile, isOpen, adminName]);

  // Selected binary file state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Class creation state
  const [newClassName, setNewClassName] = useState('');
  const [newClassSection, setNewClassSection] = useState('');
  const [newClassDesc, setNewClassDesc] = useState('');
  const [newClassPassword, setNewClassPassword] = useState('1234');

  // Editing Class Password inline
  const [editingClassId, setEditingClassId] = useState<string | null>(null);
  const [editClassPasswordInput, setEditClassPasswordInput] = useState('');

  // Subject creation state
  const [newSubjectName, setNewSubjectName] = useState('');

  // Admin Profile & Credentials update state
  const [adminDisplayName, setAdminDisplayName] = useState(adminName || 'Sudeep Shrestha');
  const [newAdminDisplayName, setNewAdminDisplayName] = useState(adminName || 'Sudeep Shrestha');
  const [adminUsername, setAdminUsername] = useState('');
  const [newAdminUsername, setNewAdminUsername] = useState('');
  const [currentPasswordInput, setCurrentPasswordInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [showNewAdminPassword, setShowNewAdminPassword] = useState(false);
  const [credMessage, setCredMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [isUpdatingCreds, setIsUpdatingCreds] = useState(false);

  useEffect(() => {
    if (isOpen && tab === 'settings') {
      fetchAdminCredentials()
        .then((data) => {
          const resolvedName = data.name || 'Sudeep Shrestha';
          setAdminDisplayName(resolvedName);
          setNewAdminDisplayName(resolvedName);
          setAdminUsername(data.username || '');
          setNewAdminUsername(data.username || '');
        })
        .catch(() => {});
      setCredMessage(null);
    }
  }, [isOpen, tab]);

  if (!isOpen) return null;

  // Infer fileType from standard file extension
  const getFileTypeFromExtension = (filename: string): FileType => {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    if (['pdf'].includes(ext)) return 'pdf';
    if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext)) return 'doc';
    if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(ext)) return 'image';
    if (['mp4', 'webm', 'mkv', 'avi', 'mov'].includes(ext)) return 'video';
    if (['mp3', 'wav', 'ogg'].includes(ext)) return 'audio';
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'archive';
    return 'other';
  };

  const readFileAsDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string || '');
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
  };

  const readFileAsText = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string || '');
      reader.onerror = () => resolve('');
      reader.readAsText(file);
    });
  };

  const handleFileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      alert('Please enter a file/notice title.');
      return;
    }

    let fileType: FileType = 'other';
    let fileName = '';
    let fileSize = 0;
    let fileBlobId: string | undefined = editingFile?.fileBlobId;
    let fileDataUrl: string | undefined = editingFile?.fileDataUrl;

    if (uploadType === 'file') {
      if (selectedFile) {
        fileName = selectedFile.name;
        fileSize = selectedFile.size;
        fileType = getFileTypeFromExtension(selectedFile.name);
        fileBlobId = `blob_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        
        // Save to IndexedDB
        await saveFileBlob(fileBlobId, selectedFile);

        // Also convert text/image/pdf to dataURL or text so preview works seamlessly
        if (selectedFile.type.startsWith('image/') || selectedFile.type.includes('pdf') || selectedFile.size < 5000000) {
          try {
            if (selectedFile.type.startsWith('text/') || selectedFile.name.endsWith('.txt') || selectedFile.name.endsWith('.md')) {
              fileDataUrl = await readFileAsText(selectedFile);
            } else {
              fileDataUrl = await readFileAsDataUrl(selectedFile);
            }
          } catch (err) {
            console.warn('Could not generate dataURL:', err);
          }
        }
      } else if (editingFile) {
        fileName = editingFile.fileName;
        fileSize = editingFile.fileSize || 0;
        fileType = editingFile.fileType;
      } else {
        alert('Please select a file to upload.');
        return;
      }
    } else if (uploadType === 'note') {
      fileType = 'note';
      fileName = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.txt`;
      fileDataUrl = noteText || description;
      fileSize = new Blob([fileDataUrl]).size;
    } else if (uploadType === 'link') {
      fileType = 'link';
      fileName = title;
      fileSize = 0;
    }

    const newFileItem: FileItem = {
      id: editingFile?.id || `file_${Date.now()}`,
      title: title.trim(),
      description: description.trim(),
      classId,
      subject,
      fileType,
      fileName,
      fileSize,
      fileBlobId,
      fileDataUrl,
      externalUrl: uploadType === 'link' ? externalUrl : undefined,
      uploadDate: editingFile?.uploadDate || new Date().toISOString(),
      uploaderName: uploaderName.trim() || adminName || 'Sudeep Shrestha',
      isPinned,
      isLocked,
      filePassword: isLocked ? filePassword.trim() : undefined,
      downloadsCount: editingFile?.downloadsCount || 0,
    };

    onSaveFile(newFileItem);
    onClose();
  };

  const handleCreateClass = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClassName.trim()) return;

    const newClass: ClassItem = {
      id: `class_${Date.now()}`,
      name: newClassName.trim(),
      section: newClassSection.trim() || undefined,
      description: newClassDesc.trim() || undefined,
      password: newClassPassword.trim() || '1234',
      icon: 'GraduationCap',
      color: 'bg-blue-500/10 text-blue-700 border-blue-200',
    };

    onAddClass(newClass);
    setNewClassName('');
    setNewClassSection('');
    setNewClassDesc('');
    setNewClassPassword('1234');
  };

  const handleSaveClassPassword = (cls: ClassItem) => {
    if (!editClassPasswordInput.trim()) return;
    onUpdateClass({
      ...cls,
      password: editClassPasswordInput.trim(),
    });
    setEditingClassId(null);
    setEditClassPasswordInput('');
  };

  const handleCreateSubject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubjectName.trim()) return;

    const newSub: SubjectCategory = {
      id: newSubjectName.trim(),
      name: newSubjectName.trim(),
      color: 'bg-indigo-100 text-indigo-700',
    };

    onAddSubject(newSub);
    setNewSubjectName('');
  };

  const handleChangeCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCredMessage(null);

    if (!currentPasswordInput) {
      setCredMessage({ text: 'Please enter your current admin password.', ok: false });
      return;
    }

    const cleanNewName = newAdminDisplayName.trim();
    if (cleanNewName.length < 2 || cleanNewName.length > 80) {
      setCredMessage({ text: 'Admin name must be between 2 and 80 characters.', ok: false });
      return;
    }

    const cleanNewUser = newAdminUsername.trim();
    if (cleanNewUser.length < 3 || cleanNewUser.length > 50) {
      setCredMessage({ text: 'Admin username must be between 3 and 50 characters.', ok: false });
      return;
    }

    if (newPasswordInput) {
      const policy = validateAdminPasswordFormat(newPasswordInput);
      if (!policy.valid) {
        setCredMessage({ text: policy.error || 'Password does not meet security rules.', ok: false });
        return;
      }
      if (newPasswordInput !== confirmPasswordInput) {
        setCredMessage({ text: 'New password and confirmation do not match.', ok: false });
        return;
      }
    }

    setIsUpdatingCreds(true);
    try {
      const updated = await updateAdminCredentials({
        currentPassword: currentPasswordInput,
        newName: cleanNewName,
        newUsername: cleanNewUser,
        newPassword: newPasswordInput || undefined,
      });
      const resolvedName = updated.name || cleanNewName;
      setAdminDisplayName(resolvedName);
      setNewAdminDisplayName(resolvedName);
      setAdminUsername(updated.username);
      setNewAdminUsername(updated.username);
      setCurrentPasswordInput('');
      setNewPasswordInput('');
      setConfirmPasswordInput('');
      if (onAdminProfileUpdated) {
        onAdminProfileUpdated(resolvedName, updated.username);
      }
      setCredMessage({ text: 'My Profile updated successfully!', ok: true });
    } catch (err: any) {
      setCredMessage({ text: err?.message || 'Failed to update profile.', ok: false });
    } finally {
      setIsUpdatingCreds(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-1.5 xs:p-2 sm:p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl w-full max-w-4xl max-h-[94vh] sm:max-h-[90vh] flex flex-col overflow-hidden text-[var(--ink)] transition-all duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-3.5 sm:px-5 py-2.5 sm:py-3 border-b border-[var(--border)] flex items-center justify-between gap-2.5 bg-[var(--surface-higher)] shrink-0">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-lg bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <Upload className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-xs sm:text-sm text-[var(--ink)] leading-tight truncate">
                {editingFile ? 'Edit Class Material' : 'Teacher Admin Portal'}
              </h2>
              <p className="text-[10.5px] text-[var(--ink-muted)] truncate">
                Upload files, manage class materials, and organize content
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--surface)] rounded-lg border border-transparent hover:border-[var(--border)] transition cursor-pointer shrink-0"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center border-b border-[var(--border)] bg-[var(--surface-higher)]/70 px-3 sm:px-5 gap-1 sm:gap-1.5 overflow-x-auto text-xs font-semibold no-scrollbar shrink-0">
          <button
            onClick={() => setTab('upload')}
            id="tab-upload"
            className={`py-2 px-2.5 sm:px-3 border-b-2 flex items-center gap-1.5 transition shrink-0 cursor-pointer ${
              tab === 'upload'
                ? 'border-[var(--accent)] text-[var(--accent)] font-bold'
                : 'border-transparent text-[var(--ink-muted)] hover:text-[var(--ink)]'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload Material</span>
          </button>

          <button
            onClick={() => setTab('classes')}
            id="tab-classes"
            className={`py-2.5 sm:py-3 px-3 sm:px-3.5 border-b-2 flex items-center gap-1.5 sm:gap-2 transition shrink-0 cursor-pointer ${
              tab === 'classes'
                ? 'border-[var(--accent)] text-[var(--accent)] font-bold'
                : 'border-transparent text-[var(--ink-muted)] hover:text-[var(--ink)]'
            }`}
          >
            <School className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>Classes ({classes.length})</span>
          </button>

          <button
            onClick={() => setTab('subjects')}
            id="tab-subjects"
            className={`py-2.5 sm:py-3 px-3 sm:px-3.5 border-b-2 flex items-center gap-1.5 sm:gap-2 transition shrink-0 cursor-pointer ${
              tab === 'subjects'
                ? 'border-[var(--accent)] text-[var(--accent)] font-bold'
                : 'border-transparent text-[var(--ink-muted)] hover:text-[var(--ink)]'
            }`}
          >
            <Tag className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>Subjects ({subjects.filter(s => s.id !== 'all').length})</span>
          </button>

          <button
            onClick={() => setTab('students')}
            id="tab-students"
            className={`py-2.5 sm:py-3 px-3 sm:px-3.5 border-b-2 flex items-center gap-1.5 sm:gap-2 transition shrink-0 cursor-pointer ${
              tab === 'students'
                ? 'border-[var(--accent)] text-[var(--accent)] font-bold'
                : 'border-transparent text-[var(--ink-muted)] hover:text-[var(--ink)]'
            }`}
          >
            <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>Students ({students.length})</span>
          </button>

          <button
            onClick={() => setTab('tests')}
            id="tab-tests"
            className={`py-2.5 sm:py-3 px-3 sm:px-3.5 border-b-2 flex items-center gap-1.5 sm:gap-2 transition shrink-0 cursor-pointer ${
              tab === 'tests'
                ? 'border-[var(--accent)] text-[var(--accent)] font-bold'
                : 'border-transparent text-[var(--ink-muted)] hover:text-[var(--ink)]'
            }`}
          >
            <FileQuestion className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>Tests & Quizzes ({quizzes.length})</span>
          </button>

          <button
            ref={settingsTabBtnRef}
            onClick={() => setTab('settings')}
            id="tab-settings"
            className={`py-2.5 sm:py-3 px-3 sm:px-3.5 border-b-2 flex items-center gap-1.5 sm:gap-2 transition shrink-0 cursor-pointer ${
              tab === 'settings'
                ? 'border-[var(--accent)] text-[var(--accent)] font-bold'
                : 'border-transparent text-[var(--ink-muted)] hover:text-[var(--ink)]'
            }`}
          >
            <User className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>My Profile</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-3 xs:p-4 sm:p-6 space-y-4 sm:space-y-5 bg-[var(--bg)]">
          {tab === 'upload' && (
            <form onSubmit={handleFileSubmit} className="space-y-4">
              {/* Material Format Selector */}
              <div>
                <label className="block text-xs font-semibold text-[var(--ink-muted)] mb-2">
                  Material Format
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setUploadType('file')}
                    id="type-file-btn"
                    className={`p-3 rounded-xl border flex items-center justify-center gap-2 text-xs font-semibold transition cursor-pointer ${
                      uploadType === 'file'
                        ? 'bg-blue-500/15 border-blue-500 text-blue-600 dark:text-blue-400 font-bold shadow-xs'
                        : 'border-[var(--border)] bg-[var(--surface)] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-higher)]'
                    }`}
                  >
                    <FileText className="w-4 h-4" />
                    <span>Upload File</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setUploadType('note')}
                    id="type-note-btn"
                    className={`p-3 rounded-xl border flex items-center justify-center gap-2 text-xs font-semibold transition cursor-pointer ${
                      uploadType === 'note'
                        ? 'bg-blue-500/15 border-blue-500 text-blue-600 dark:text-blue-400 font-bold shadow-xs'
                        : 'border-[var(--border)] bg-[var(--surface)] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-higher)]'
                    }`}
                  >
                    <StickyNote className="w-4 h-4" />
                    <span>Write Note / Notice</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setUploadType('link')}
                    id="type-link-btn"
                    className={`p-3 rounded-xl border flex items-center justify-center gap-2 text-xs font-semibold transition cursor-pointer ${
                      uploadType === 'link'
                        ? 'bg-blue-500/15 border-blue-500 text-blue-600 dark:text-blue-400 font-bold shadow-xs'
                        : 'border-[var(--border)] bg-[var(--surface)] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-higher)]'
                    }`}
                  >
                    <LinkIcon className="w-4 h-4" />
                    <span>Web / Drive Link</span>
                  </button>
                </div>
              </div>

              {/* Title & Description */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-[var(--ink)] mb-1">
                    Title / Subject Headline <span className="text-amber-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Chapter 4 Practice Exam & Homework Solutions"
                    id="upload-title-input"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-xs sm:text-sm text-[var(--ink)] focus:outline-none focus:border-blue-500 shadow-2xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--ink)] mb-1">
                    Target Class <span className="text-amber-500">*</span>
                  </label>
                  <select
                    value={classId}
                    onChange={(e) => setClassId(e.target.value)}
                    id="upload-class-select"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-xs sm:text-sm font-semibold text-[var(--ink)] focus:outline-none focus:border-blue-500 shadow-2xs [&>option]:bg-[#191c24] [&>option]:text-slate-100"
                  >
                    <option value="all">📢 All Classes (Global Notice)</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.section ? `(${c.section})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--ink)] mb-1">
                    Subject / Category <span className="text-amber-500">*</span>
                  </label>
                  <select
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    id="upload-subject-select"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-xs sm:text-sm font-semibold text-[var(--ink)] focus:outline-none focus:border-blue-500 shadow-2xs [&>option]:bg-[#191c24] [&>option]:text-slate-100"
                  >
                    {subjects
                      .filter((s) => s.id !== 'all')
                      .map((s) => (
                        <option key={s.id} value={s.name}>
                          {s.name}
                        </option>
                      ))}
                    <option value="Announcements">Announcements / Notices</option>
                    <option value="Exam Papers">Exam &amp; Practice Papers</option>
                    <option value="Other">Other / General</option>
                  </select>
                </div>
              </div>

              {/* Specific Input for Format */}
              {uploadType === 'file' && (
                <div>
                  <label className="block text-xs font-semibold text-[var(--ink)] mb-1">
                    Choose File to Upload
                  </label>
                  <div className="border-2 border-dashed border-[var(--border)] rounded-2xl p-4 sm:p-5 text-center bg-[var(--surface)] hover:border-blue-500/50 hover:bg-[var(--surface-higher)] transition shadow-2xs overflow-hidden">
                    <input
                      type="file"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          setSelectedFile(e.target.files[0]);
                        }
                      }}
                      id="binary-file-input"
                      className="hidden"
                    />
                    <label
                      htmlFor="binary-file-input"
                      className="cursor-pointer flex flex-col items-center justify-center gap-2 min-w-0 max-w-full"
                    >
                      <div className="w-10 h-10 rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                        <Upload className="w-5 h-5" />
                      </div>
                      <span className="text-xs sm:text-sm font-semibold text-[var(--ink)] break-all max-w-full">
                        {selectedFile
                          ? `Selected: ${selectedFile.name} (${(selectedFile.size / 1024 / 1024).toFixed(2)} MB)`
                          : 'Click here or drag file to attach'}
                      </span>
                      <span className="text-[11px] text-[var(--ink-muted)] break-words">
                        Supports PDF, DOCX, XLSX, PPTX, PNG, JPG, MP4, ZIP, TXT
                      </span>
                    </label>
                  </div>
                </div>
              )}

              {uploadType === 'note' && (
                <div>
                  <label className="block text-xs font-semibold text-[var(--ink)] mb-1">
                    Note / Announcement Content
                  </label>
                  <textarea
                    rows={4}
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="Type the full homework, notice, or study guide text here..."
                    id="note-text-textarea"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-xs sm:text-sm text-[var(--ink)] focus:outline-none focus:border-blue-500 shadow-2xs"
                  />
                </div>
              )}

              {uploadType === 'link' && (
                <div>
                  <label className="block text-xs font-semibold text-[var(--ink)] mb-1">
                    Resource Link URL (Google Drive, YouTube, School Portal) <span className="text-amber-500">*</span>
                  </label>
                  <input
                    type="url"
                    required
                    value={externalUrl}
                    onChange={(e) => setExternalUrl(e.target.value)}
                    placeholder="https://drive.google.com/file/d/..."
                    id="external-link-input"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-xs sm:text-sm text-[var(--ink)] focus:outline-none focus:border-blue-500 shadow-2xs"
                  />
                </div>
              )}

              {/* Additional description */}
              <div>
                <label className="block text-xs font-semibold text-[var(--ink)] mb-1">
                  Brief Description / Instructions
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Instructions for students regarding this download..."
                  id="upload-desc-textarea"
                  className="w-full px-3.5 py-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-xs sm:text-sm text-[var(--ink)] focus:outline-none focus:border-blue-500 shadow-2xs"
                />
              </div>

              {/* Uploader & Pin toggle */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-[var(--ink)] mb-1">
                    Uploaded By
                  </label>
                  <input
                    type="text"
                    value={uploaderName}
                    onChange={(e) => setUploaderName(e.target.value)}
                    placeholder="e.g. Prof. Smith"
                    className="w-full sm:w-64 px-3 py-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-xs font-semibold text-[var(--ink)] shadow-2xs"
                  />
                </div>

                <label className="flex items-center gap-2 cursor-pointer bg-[var(--surface)] p-2.5 rounded-xl border border-[var(--border)] self-start sm:self-auto shadow-2xs">
                  <input
                    type="checkbox"
                    checked={isPinned}
                    onChange={(e) => setIsPinned(e.target.checked)}
                    id="pin-checkbox"
                    className="w-4 h-4 text-amber-500 border-[var(--border)] rounded focus:ring-amber-500"
                  />
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--ink)]">
                    <Pin className="w-3.5 h-3.5 text-amber-500" />
                    <span>Pin to top of class board</span>
                  </div>
                </label>
              </div>

              {/* File Passcode Lock Protection Option */}
              <div className="p-3.5 sm:p-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isLocked}
                      onChange={(e) => {
                        setIsLocked(e.target.checked);
                        if (e.target.checked && !filePassword) {
                          generateRandomPin();
                        }
                      }}
                      id="file-lock-checkbox"
                      className="w-4 h-4 text-amber-500 border-amber-500/30 rounded focus:ring-amber-500"
                    />
                    <div className="flex items-center gap-1.5 text-xs font-bold text-amber-600 dark:text-amber-400">
                      <Lock className="w-4 h-4" />
                      <span>Lock file with 4-Digit Passcode</span>
                    </div>
                  </label>

                  {isLocked && (
                    <button
                      type="button"
                      onClick={generateRandomPin}
                      id="generate-pin-btn"
                      className="flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/20 hover:bg-amber-500/30 px-3 py-1.5 rounded-xl border border-amber-500/30 transition cursor-pointer self-start sm:self-auto"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Auto-Generate 4-Digit PIN</span>
                    </button>
                  )}
                </div>

                {isLocked && (
                  <div className="pt-2 border-t border-amber-500/25 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                    <div className="w-full sm:w-64">
                      <label className="block text-[11px] font-bold text-amber-600 dark:text-amber-400 mb-1">
                        4-Digit Passcode to Unlock File *
                      </label>
                      <input
                        type="text"
                        maxLength={8}
                        required={isLocked}
                        value={filePassword}
                        onChange={(e) => setFilePassword(e.target.value)}
                        placeholder="e.g. 8421"
                        id="file-password-input"
                        className="w-full px-3 py-2 rounded-xl border border-amber-500/40 bg-[var(--surface)] text-sm font-mono font-bold text-[var(--ink)] tracking-wider focus:outline-none focus:border-amber-500"
                      />
                    </div>
                    <p className="text-[11px] text-amber-600/80 dark:text-amber-400/80 italic shrink-1 pt-1 sm:pt-4">
                      Students will need to enter this exact 4-digit PIN to open or download this file.
                    </p>
                  </div>
                )}
              </div>

              {/* Submit Button */}
              <div className="pt-3 border-t border-[var(--border)] flex flex-col-reverse xs:flex-row justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full xs:w-auto px-4 py-2 rounded-xl border border-[var(--border)] text-xs font-semibold text-[var(--ink-muted)] hover:text-[var(--ink)] bg-[var(--surface)] hover:bg-[var(--surface-higher)] transition cursor-pointer shadow-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  id="submit-material-btn"
                  className="btn btn-primary w-full xs:w-auto justify-center px-5 sm:px-6 py-2 rounded-xl text-xs font-bold transition cursor-pointer shadow-xs"
                >
                  {editingFile ? 'Save Changes' : 'Publish to Board'}
                </button>
              </div>
            </form>
          )}

          {/* Manage Classes Tab */}
          {tab === 'classes' && (
            <div className="space-y-6 font-sans">
              {/* Add New Class Form */}
              <form onSubmit={handleCreateClass} className="bg-[var(--surface-higher)] p-4 rounded-xl border border-[var(--border)] space-y-3">
                <h3 className="font-bold text-xs text-[var(--ink)] flex items-center gap-2">
                  <Plus className="w-4 h-4 text-blue-500" /> Add New Class Grade
                </h3>
                
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--ink-muted)] mb-1">
                      Class Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Grade 10"
                      value={newClassName}
                      onChange={(e) => setNewClassName(e.target.value)}
                      className="input text-xs w-full py-1.5 font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--ink-muted)] mb-1">
                      Section / Division
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Section A"
                      value={newClassSection}
                      onChange={(e) => setNewClassSection(e.target.value)}
                      className="input text-xs w-full py-1.5"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--ink-muted)] mb-1">
                      Student Class Passcode *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Passcode for students..."
                      value={newClassPassword}
                      onChange={(e) => setNewClassPassword(e.target.value)}
                      className="input text-xs w-full py-1.5 font-mono font-bold text-blue-600 dark:text-blue-400"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[var(--ink-muted)] mb-1">
                    Description / Room Notes
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Room 204 • Physics & Higher Math Class"
                    value={newClassDesc}
                    onChange={(e) => setNewClassDesc(e.target.value)}
                    className="input text-xs w-full py-1.5"
                  />
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    className="btn btn-primary px-4 py-1.5 text-xs font-bold transition cursor-pointer"
                  >
                    Create Class
                  </button>
                </div>
              </form>

              {/* Existing Classes List */}
              <div className="space-y-3">
                <h3 className="font-bold text-xs text-[var(--ink)] flex items-center gap-2">
                  <School className="w-4 h-4 text-blue-500" /> Current Active Classes ({classes.length})
                </h3>

                <div className="space-y-2.5">
                  {classes.map((cls) => (
                    <div
                      key={cls.id}
                      className="p-3.5 border border-[var(--border)] bg-[var(--surface-higher)] rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 hover:border-blue-500/30 transition"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 flex items-center justify-center font-bold text-xs shrink-0">
                          <GraduationCap className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-bold text-xs sm:text-sm text-[var(--ink)] flex items-center gap-2">
                            <span>{cls.name}</span>
                            {cls.section && (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[var(--surface)] text-[var(--ink-muted)] border border-[var(--border)]">
                                {cls.section}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-[var(--ink-muted)] mt-0.5">
                            {cls.description || 'Class board resource section'}
                          </p>
                        </div>
                      </div>

                      {/* Class Passcode & Delete controls */}
                      <div className="flex items-center gap-2 self-end sm:self-auto w-full sm:w-auto justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-[var(--border)]">
                        {editingClassId === cls.id ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={editClassPasswordInput}
                              onChange={(e) => setEditClassPasswordInput(e.target.value)}
                              placeholder="New password..."
                              className="input text-xs w-28 py-1 font-mono font-bold"
                            />
                            <button
                              onClick={() => handleSaveClassPassword(cls)}
                              className="btn btn-primary px-3 py-1 text-xs font-bold transition cursor-pointer"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingClassId(null)}
                              className="btn btn-secondary px-2.5 py-1 text-xs transition cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-xs">
                              <Lock className="w-3 h-3 text-amber-500" />
                              <span className="font-mono font-bold text-[var(--ink)]">
                                {visiblePasswords[cls.id] ? (cls.password || '1234') : '••••'}
                              </span>
                              <button
                                type="button"
                                onClick={() => togglePasswordVisibility(cls.id)}
                                className="text-[var(--ink-muted)] hover:text-[var(--ink)] ml-1 transition cursor-pointer"
                                title="Show/Hide Passcode"
                              >
                                {visiblePasswords[cls.id] ? (
                                  <EyeOff className="w-3 h-3" />
                                ) : (
                                  <Eye className="w-3 h-3" />
                                )}
                              </button>
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                setEditingClassId(cls.id);
                                setEditClassPasswordInput(cls.password || '');
                              }}
                              className="p-1.5 text-[var(--ink-muted)] hover:text-blue-500 hover:bg-blue-500/10 rounded-lg transition cursor-pointer text-xs"
                              title="Change Class Passcode"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                onDeleteClass(cls.id);
                              }}
                              className="p-1.5 text-[var(--ink-muted)] hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition cursor-pointer text-xs"
                              title="Delete Class"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Manage Subjects Tab */}
          {tab === 'subjects' && (
            <div className="space-y-6">
              {/* Add Subject Form */}
              <div className="bg-[var(--surface-higher)] p-5 border border-[var(--border)] rounded-xl space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--border)] pb-3">
                  <div>
                    <h3 className="font-bold text-sm text-[var(--ink)] flex items-center gap-2">
                      <Plus className="w-4 h-4 text-blue-500" /> Add New Subject Category
                    </h3>
                    <p className="text-xs text-[var(--ink-muted)]">
                      Create subjects for assignments, syllabus topics, and class quizzes
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      const standards = [
                        'Mathematics', 'Science & Technology', 'English', 'Nepali',
                        'Social Studies', 'Computer Science', 'Accountancy', 'Economics',
                        'Health & Physical Education', 'Optional Mathematics'
                      ];
                      for (const sName of standards) {
                        if (!subjects.some(s => s.name.toLowerCase() === sName.toLowerCase())) {
                          await onAddSubject({
                            id: sName,
                            name: sName,
                            color: 'bg-blue-100 text-blue-700',
                          });
                        }
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 transition flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Load Standard Nepali Subjects</span>
                  </button>
                </div>

                <form onSubmit={handleCreateSubject} className="flex flex-col sm:flex-row items-center gap-2.5">
                  <input
                    type="text"
                    required
                    placeholder="Subject Name (e.g. Mathematics, Science, Social Studies)"
                    value={newSubjectName}
                    onChange={(e) => setNewSubjectName(e.target.value)}
                    className="flex-1 input text-xs font-medium py-2.5 w-full bg-[var(--surface)]"
                  />
                  <button
                    type="submit"
                    className="btn btn-primary px-5 py-2.5 text-xs font-bold transition cursor-pointer shrink-0 w-full sm:w-auto"
                  >
                    Add Subject
                  </button>
                </form>
              </div>

              {/* Subjects List */}
              <div className="bg-[var(--surface-higher)] p-5 border border-[var(--border)] rounded-xl space-y-3">
                <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
                  <h3 className="font-bold text-sm text-[var(--ink)]">
                    Current Subject Categories ({subjects.filter(s => s.id !== 'all').length})
                  </h3>
                  <span className="text-xs text-[var(--ink-muted)]">Saved in Database</span>
                </div>

                {subjects.filter(s => s.id !== 'all').length === 0 ? (
                  <p className="text-xs text-[var(--ink-muted)] py-4 text-center">
                    No subjects registered yet. Add one above or click "+ Load Standard Nepali Subjects".
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-1">
                    {subjects
                      .filter((s) => s.id !== 'all')
                      .map((sub) => (
                        <div
                          key={sub.id}
                          className="flex items-center justify-between p-3 border border-[var(--border)] bg-[var(--surface)] rounded-xl shadow-2xs hover:border-blue-500/40 transition"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                            <span className="font-bold text-xs text-[var(--ink)] truncate">
                              {sub.name}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => onDeleteSubject(sub.id)}
                            className="p-1.5 text-[var(--ink-muted)] hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition cursor-pointer shrink-0"
                            title="Delete Subject"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Manage Students & Accounts Tab */}
          {tab === 'students' && (
            <div className="space-y-6">
              {/* Informational Banner */}
              <div className="bg-[#1c1c1f] border border-[rgba(242,242,244,0.1)] p-3.5 sm:p-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="w-8 h-8 bg-[#4cc9f0]/15 border border-[#4cc9f0]/30 text-[#4cc9f0] flex items-center justify-center font-bold text-sm shrink-0">
                        <Users className="w-4 h-4" />
                      </div>
                      <h3 className="font-syne font-bold text-sm sm:text-base text-[#f2f2f4]">Student Directory & Credentials</h3>
                      <span className="px-2.5 py-0.5 bg-[#4cc9f0]/15 text-[#4cc9f0] text-[11px] font-mono font-bold border border-[#4cc9f0]/30 shrink-0">
                        {students.length} Registered
                      </span>
                    </div>
                    <p className="text-xs text-[#f2f2f4]/60 max-w-2xl leading-relaxed font-sans">
                      Students self-register their own Student ID & Password when taking tests. As an administrator, you have complete visibility over all credentials, can reset passwords, edit student profiles, permanently delete accounts, and inspect or print student answer sheets.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 flex-wrap font-mono">
                    <button
                      type="button"
                      onClick={() => {
                        setIdPassModalStudent(null);
                        setIsIdPassModalOpen(true);
                      }}
                      className="btn btn-primary px-3.5 py-2 text-xs flex items-center gap-1.5 transition cursor-pointer"
                      title="Print Official Student ID & Password Examination Passes"
                    >
                      <CreditCard className="w-3.5 h-3.5" />
                      <span>Print Student ID Passes</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsManualAddOpen(!isManualAddOpen)}
                      className="px-3.5 py-2 border border-[rgba(242,242,244,0.1)] bg-[#111113] hover:bg-[#1c1c1f] text-[#4cc9f0] font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{isManualAddOpen ? 'Hide Manual Form' : 'Register Student Manually'}</span>
                      {isManualAddOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Action Notification Alert */}
              {studentActionNotice && (
                <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2.5 text-xs text-emerald-400 font-mono font-bold animate-in fade-in">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{studentActionNotice}</span>
                </div>
              )}

              {/* Action Error Alert */}
              {studentActionError && (
                <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 flex items-center gap-2.5 text-xs text-rose-400 font-mono font-bold animate-in fade-in">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{studentActionError}</span>
                </div>
              )}

              {/* Collapsible Manual Registration Form */}
              {isManualAddOpen && (
                <form onSubmit={handleAddStudent} className="bg-[#1c1c1f] p-3.5 sm:p-5 border border-[rgba(242,242,244,0.1)] space-y-4 animate-in fade-in duration-150 font-mono">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[rgba(242,242,244,0.1)]">
                    <h4 className="font-syne font-bold text-sm text-[#f2f2f4] flex items-center gap-2">
                      <Plus className="w-4 h-4 text-[#4cc9f0] shrink-0" /> Manual Student Registration (Teacher Override)
                    </h4>
                    <span className="text-[11px] text-[#f2f2f4]/50">
                      Note: Students normally create their own account at test start
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3.5">
                    <div>
                      <label className="block text-[11px] font-bold text-[#f2f2f4]/80 mb-1">
                        Roll No. *
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 1 or 15"
                        value={newStudentRollNo}
                        onChange={(e) => {
                          const val = e.target.value;
                          setNewStudentRollNo(val);
                          const base = val.replace(/[a-zA-Z]+$/, '');
                          if (!newStudentId || newStudentId.startsWith('STD-')) {
                            setNewStudentId(base.trim() ? `STD-${base.trim()}${newStudentSection}` : '');
                          }
                        }}
                        className="w-full px-3 py-2 border border-[rgba(242,242,244,0.1)] bg-[#111113] text-xs font-bold text-[#f2f2f4] focus:outline-none focus:border-[#4cc9f0]"
                      />
                      <span className="text-[10px] text-[#4cc9f0] font-mono mt-1 block">
                        Saved: {formatRollWithSection(newStudentRollNo || '1', newStudentSection)}
                      </span>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-[#f2f2f4]/80 mb-1">
                        Student ID / Code *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. STD-1A or STU101"
                        value={newStudentId}
                        onChange={(e) => setNewStudentId(e.target.value)}
                        className="w-full px-3 py-2 border border-[rgba(242,242,244,0.1)] bg-[#111113] text-xs font-semibold text-[#f2f2f4] focus:outline-none focus:border-[#4cc9f0]"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-[#f2f2f4]/80 mb-1">
                        Student Full Name *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Maya Johnson"
                        value={newStudentName}
                        onChange={(e) => setNewStudentName(e.target.value)}
                        className="w-full px-3 py-2 border border-[rgba(242,242,244,0.1)] bg-[#111113] text-xs font-semibold text-[#f2f2f4] focus:outline-none focus:border-[#4cc9f0]"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-[#f2f2f4]/80 mb-1">
                        Class Grade *
                      </label>
                      <select
                        value={newStudentClass}
                        onChange={(e) => setNewStudentClass(e.target.value)}
                        className="w-full px-3 py-2 border border-[rgba(242,242,244,0.1)] bg-[#111113] text-xs font-semibold text-[#f2f2f4] focus:outline-none focus:border-[#4cc9f0]"
                      >
                        {classes.map((cls) => (
                          <option key={cls.id} value={cls.id}>
                            {cls.name} {cls.section ? `(${cls.section})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-[#f2f2f4]/80 mb-1">
                        Section (under Class)
                      </label>
                      <div className="grid grid-cols-2 gap-1 bg-[#111113] border border-[rgba(242,242,244,0.1)] p-1">
                        <button
                          type="button"
                          onClick={() => {
                            setNewStudentSection('A');
                            const base = (newStudentRollNo || '1').replace(/[a-zA-Z]+$/, '');
                            if (!newStudentId || newStudentId.startsWith('STD-')) {
                              setNewStudentId(`STD-${base}A`);
                            }
                          }}
                          className={`py-1 text-xs font-bold transition cursor-pointer ${
                            newStudentSection === 'A'
                              ? 'bg-[#4cc9f0] text-[#111113]'
                              : 'text-[#f2f2f4]/60 hover:text-[#f2f2f4]'
                          }`}
                        >
                          Sec A
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setNewStudentSection('B');
                            const base = (newStudentRollNo || '1').replace(/[a-zA-Z]+$/, '');
                            if (!newStudentId || newStudentId.startsWith('STD-')) {
                              setNewStudentId(`STD-${base}B`);
                            }
                          }}
                          className={`py-1 text-xs font-bold transition cursor-pointer ${
                            newStudentSection === 'B'
                              ? 'bg-[#4cc9f0] text-[#111113]'
                              : 'text-[#f2f2f4]/60 hover:text-[#f2f2f4]'
                          }`}
                        >
                          Sec B
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-[#f2f2f4]/80 mb-1">
                        Initial Password *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. password"
                        value={newStudentPassword}
                        onChange={(e) => setNewStudentPassword(e.target.value)}
                        className="w-full px-3 py-2 border border-[rgba(242,242,244,0.1)] bg-[#111113] text-xs font-semibold text-[#f2f2f4] font-mono focus:outline-none focus:border-[#4cc9f0]"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col-reverse xs:flex-row items-stretch xs:items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsManualAddOpen(false)}
                      className="px-4 py-2 border border-[rgba(242,242,244,0.1)] bg-[#111113] hover:bg-[#1c1c1f] text-[#f2f2f4]/70 text-xs font-semibold cursor-pointer text-center"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary px-5 py-2 text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Create Student Account</span>
                    </button>
                  </div>
                </form>
              )}

              {/* Student Search & Filters */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-3 font-mono">
                <div className="relative w-full sm:w-80 min-w-0">
                  <Search className="w-3.5 h-3.5 text-[#f2f2f4]/40 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    placeholder="Search by student name, ID, or password..."
                    className="w-full pl-9 pr-3 py-2 border border-[rgba(242,242,244,0.1)] bg-[#1c1c1f] text-xs text-[#f2f2f4] focus:outline-none focus:border-[#4cc9f0]"
                  />
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <select
                    value={studentFilterClass}
                    onChange={(e) => setStudentFilterClass(e.target.value)}
                    className="flex-1 sm:flex-none min-w-0 px-3 py-2 border border-[rgba(242,242,244,0.1)] bg-[#1c1c1f] text-xs font-semibold text-[#f2f2f4] focus:outline-none focus:border-[#4cc9f0]"
                  >
                    <option value="all">All Classes ({students.length})</option>
                    {classes.map((cls) => {
                      const countInClass = students.filter((s) => s.classId === cls.id).length;
                      return (
                        <option key={cls.id} value={cls.id}>
                          {cls.name} ({countInClass})
                        </option>
                      );
                    })}
                  </select>
                  <button
                    type="button"
                    onClick={loadStudents}
                    className="p-2 border border-[rgba(242,242,244,0.1)] bg-[#1c1c1f] hover:bg-[#111113] text-[#f2f2f4]/80 text-xs transition cursor-pointer shrink-0"
                    title="Reload Student Directory"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Student Accounts Table & Mobile/Tablet Card View */}
              <div className="border border-[rgba(242,242,244,0.1)] overflow-hidden bg-[#1c1c1f]">
                {studentsLoading ? (
                  <div className="p-12 text-center text-xs text-[#f2f2f4]/50 space-y-2 font-mono">
                    <RotateCcw className="w-5 h-5 animate-spin mx-auto text-[#4cc9f0]" />
                    <p>Loading student directory...</p>
                  </div>
                ) : (
                  <>
                  {/* Mobile / Portrait Tablet Card View */}
                  <div className="lg:hidden divide-y divide-[rgba(242,242,244,0.08)] font-mono">
                    {students
                      .filter((s) => {
                        if (studentFilterClass !== 'all' && s.classId !== studentFilterClass) return false;
                        if (studentSearch.trim()) {
                          const q = studentSearch.toLowerCase();
                          return (
                            s.name.toLowerCase().includes(q) ||
                            s.studentId.toLowerCase().includes(q) ||
                            (s.rollNo && s.rollNo.toLowerCase().includes(q)) ||
                            (s.password && s.password.toLowerCase().includes(q))
                          );
                        }
                        return true;
                      })
                      .map((stu) => {
                        const cls = classes.find((c) => c.id === stu.classId);
                        const isEditingThis = editingStudent?.id === stu.id;
                        const isPwdVisible = visiblePasswords[stu.id] || false;
                        const currentPassword = stu.password || 'password';

                        if (isEditingThis) {
                          return (
                            <div key={stu.id} className="p-3.5 bg-[#4cc9f0]/10 space-y-3">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-bold text-[#4cc9f0]">Editing Student</span>
                              </div>
                              <div className="grid grid-cols-1 xs:grid-cols-2 gap-2.5">
                                <div>
                                  <label className="block text-[10px] text-[#f2f2f4]/70 mb-1">Full Name</label>
                                  <input
                                    type="text"
                                    value={editStudentName}
                                    onChange={(e) => setEditStudentName(e.target.value)}
                                    placeholder="Full Name"
                                    className="w-full px-2.5 py-1.5 bg-[#111113] border border-[#4cc9f0] text-xs font-semibold text-[#f2f2f4]"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] text-[#f2f2f4]/70 mb-1">Student ID</label>
                                  <input
                                    type="text"
                                    value={editStudentId}
                                    onChange={(e) => setEditStudentId(e.target.value)}
                                    placeholder="Student ID"
                                    className="w-full px-2.5 py-1.5 bg-[#111113] border border-[#4cc9f0] text-xs font-mono font-bold text-[#f2f2f4]"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] text-[#f2f2f4]/70 mb-1">Roll No &amp; Section</label>
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="text"
                                      value={editStudentRollNo}
                                      onChange={(e) => setEditStudentRollNo(e.target.value)}
                                      placeholder="Roll"
                                      className="flex-1 min-w-0 px-2 py-1.5 bg-[#111113] border border-[#4cc9f0] text-xs font-bold text-[#f2f2f4]"
                                    />
                                    <div className="flex bg-[#111113] border border-[#4cc9f0] shrink-0">
                                      <button
                                        type="button"
                                        onClick={() => setEditStudentSection('A')}
                                        className={`px-2 py-1.5 text-[10px] font-bold ${editStudentSection === 'A' ? 'bg-[#4cc9f0] text-[#111113]' : 'text-[#f2f2f4]/60'}`}
                                      >
                                        A
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setEditStudentSection('B')}
                                        className={`px-2 py-1.5 text-[10px] font-bold ${editStudentSection === 'B' ? 'bg-[#4cc9f0] text-[#111113]' : 'text-[#f2f2f4]/60'}`}
                                      >
                                        B
                                      </button>
                                    </div>
                                  </div>
                                </div>
                                <div>
                                  <label className="block text-[10px] text-[#f2f2f4]/70 mb-1">Class</label>
                                  <select
                                    value={editStudentClass}
                                    onChange={(e) => setEditStudentClass(e.target.value)}
                                    className="w-full px-2.5 py-1.5 bg-[#111113] border border-[#4cc9f0] text-xs font-semibold text-[#f2f2f4]"
                                  >
                                    {classes.map((c) => (
                                      <option key={c.id} value={c.id}>
                                        {c.name}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div className="xs:col-span-2">
                                  <label className="block text-[10px] text-[#f2f2f4]/70 mb-1">Password</label>
                                  <input
                                    type="text"
                                    value={editStudentPassword}
                                    onChange={(e) => setEditStudentPassword(e.target.value)}
                                    placeholder="New Password (optional)"
                                    className="w-full px-2.5 py-1.5 bg-[#111113] border border-[#4cc9f0] text-xs font-mono font-semibold text-[#f2f2f4]"
                                  />
                                </div>
                              </div>
                              <div className="flex flex-col-reverse xs:flex-row justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingStudent(null);
                                    setEditStudentPassword('');
                                    setEditStudentRollNo('');
                                  }}
                                  className="px-3 py-1.5 bg-[#111113] border border-[rgba(242,242,244,0.1)] text-[#f2f2f4]/70 text-xs font-semibold cursor-pointer"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  onClick={handleUpdateStudentSubmit}
                                  className="btn btn-primary px-3 py-1.5 text-xs font-bold cursor-pointer justify-center"
                                >
                                  Save Changes
                                </button>
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div key={stu.id} className="p-3.5 space-y-2.5">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="font-sans font-bold text-sm text-[#f2f2f4] truncate">{stu.name}</div>
                                <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[11px]">
                                  {stu.rollNo && (
                                    <span className="px-1.5 py-0.5 bg-[#ff9f1c]/15 text-[#ff9f1c] border border-[#ff9f1c]/30 text-[10px] font-bold">
                                      Roll #{stu.rollNo}
                                    </span>
                                  )}
                                  <span className="text-[#f2f2f4]/80 font-bold">{stu.studentId}</span>
                                  <button
                                    type="button"
                                    onClick={() => copyToClipboard(stu.studentId, `id-m-${stu.id}`)}
                                    className="p-0.5 text-[#f2f2f4]/40 hover:text-[#f2f2f4] cursor-pointer"
                                    title="Copy Student ID"
                                  >
                                    {copiedField === `id-m-${stu.id}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                  </button>
                                </div>
                              </div>
                              <span className="px-2 py-0.5 bg-[#4cc9f0]/15 font-bold text-[#4cc9f0] border border-[#4cc9f0]/30 text-[10px] shrink-0">
                                {cls ? cls.name : stu.classId}
                              </span>
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                              <div className="inline-flex items-center gap-1.5 bg-[#111113] px-2.5 py-1 border border-[rgba(242,242,244,0.1)]">
                                <Key className="w-3 h-3 text-[#f2f2f4]/40 shrink-0" />
                                <span className="font-mono text-xs font-bold text-[#f2f2f4]">
                                  {isPwdVisible ? currentPassword : '••••••••'}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => togglePasswordVisibility(stu.id)}
                                  className="p-0.5 text-[#f2f2f4]/40 hover:text-[#f2f2f4] cursor-pointer"
                                >
                                  {isPwdVisible ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => copyToClipboard(currentPassword, `pwd-m-${stu.id}`)}
                                  className="p-0.5 text-[#f2f2f4]/40 hover:text-[#f2f2f4] cursor-pointer"
                                >
                                  {copiedField === `pwd-m-${stu.id}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                </button>
                              </div>
                              <span className="text-[#f2f2f4]/40 text-[10px]">
                                {stu.createdAt ? new Date(stu.createdAt).toLocaleDateString() : 'Active'}
                              </span>
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5 pt-1">
                              {onOpenSubmissions && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    onClose();
                                    onOpenSubmissions(stu.studentId);
                                  }}
                                  className="px-2.5 py-1.5 border border-[#4cc9f0]/30 bg-[#4cc9f0]/15 text-[#4cc9f0] text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                                >
                                  <Printer className="w-3 h-3" />
                                  <span>Sheets</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setIdPassModalStudent(stu);
                                  setIsIdPassModalOpen(true);
                                }}
                                className="px-2.5 py-1.5 border border-[rgba(242,242,244,0.15)] bg-[#111113] text-[#f2f2f4] text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                              >
                                <CreditCard className="w-3 h-3 text-[#4cc9f0]" />
                                <span>ID Pass</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setResetModalStudent(stu);
                                  setCustomResetPassword('password');
                                }}
                                className="px-2.5 py-1.5 border border-[#ff9f1c]/30 bg-[#ff9f1c]/15 text-[#ff9f1c] text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>Reset</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingStudent(stu);
                                  const sec = detectSectionFromRoll(stu.rollNo) || 'A';
                                  setEditStudentSection(sec);
                                  setEditStudentRollNo(stu.rollNo ? stu.rollNo.replace(/[a-zA-Z]+$/, '') : '');
                                  setEditStudentId(stu.studentId);
                                  setEditStudentName(stu.name);
                                  setEditStudentClass(stu.classId);
                                  setEditStudentPassword(stu.password || '');
                                }}
                                className="p-1.5 text-[#f2f2f4]/70 hover:text-[#4cc9f0] border border-[rgba(242,242,244,0.1)] bg-[#111113] cursor-pointer ml-auto"
                                title="Edit Student"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteModalStudent(stu)}
                                className="p-1.5 text-rose-400 border border-rose-500/20 bg-rose-500/10 cursor-pointer"
                                title="Delete Student"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    {students.length === 0 && (
                      <div className="py-12 px-4 text-center text-[#f2f2f4]/40 space-y-2">
                        <Users className="w-8 h-8 mx-auto text-[#f2f2f4]/30" />
                        <p className="font-semibold text-[#f2f2f4]">No student accounts registered yet.</p>
                      </div>
                    )}
                  </div>

                  {/* Desktop Table View */}
                  <div className="hidden lg:block overflow-x-auto">
                    <table className="w-full text-left text-xs min-w-[780px]">
                      <thead className="bg-[#111113] border-b border-[rgba(242,242,244,0.1)] text-[#f2f2f4]/60 font-mono font-bold uppercase text-[10px] tracking-wider">
                        <tr>
                          <th className="py-3.5 px-4 w-44">Student ID / Roll</th>
                          <th className="py-3.5 px-4 min-w-[140px]">Full Name</th>
                          <th className="py-3.5 px-4 w-44">Password</th>
                          <th className="py-3.5 px-4 w-32">Class Grade</th>
                          <th className="py-3.5 px-4 w-28">Registration</th>
                          <th className="py-3.5 px-4 text-right min-w-[200px]">Actions & Answer Sheets</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[rgba(242,242,244,0.06)] font-mono">
                        {students
                          .filter((s) => {
                            if (studentFilterClass !== 'all' && s.classId !== studentFilterClass) return false;
                            if (studentSearch.trim()) {
                              const q = studentSearch.toLowerCase();
                              return (
                                s.name.toLowerCase().includes(q) ||
                                s.studentId.toLowerCase().includes(q) ||
                                (s.rollNo && s.rollNo.toLowerCase().includes(q)) ||
                                (s.password && s.password.toLowerCase().includes(q))
                              );
                            }
                            return true;
                          })
                          .map((stu) => {
                            const cls = classes.find((c) => c.id === stu.classId);
                            const isEditingThis = editingStudent?.id === stu.id;
                            const isPwdVisible = visiblePasswords[stu.id] || false;
                            const currentPassword = stu.password || 'password';

                            if (isEditingThis) {
                              return (
                                <tr key={stu.id} className="bg-[#4cc9f0]/10">
                                  <td className="py-3 px-4">
                                    <div className="flex items-center gap-1">
                                      <input
                                        type="text"
                                        value={editStudentRollNo}
                                        onChange={(e) => setEditStudentRollNo(e.target.value)}
                                        placeholder="Roll"
                                        className="w-14 px-2 py-1.5 bg-[#111113] border border-[#4cc9f0] text-xs font-bold text-[#f2f2f4]"
                                        title="Roll number (e.g. 1)"
                                      />
                                      <div className="flex bg-[#111113] border border-[#4cc9f0]">
                                        <button
                                          type="button"
                                          onClick={() => setEditStudentSection('A')}
                                          className={`px-1.5 py-1 text-[10px] font-bold ${
                                            editStudentSection === 'A' ? 'bg-[#4cc9f0] text-[#111113]' : 'text-[#f2f2f4]/60'
                                          }`}
                                          title="Section A"
                                        >
                                          A
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setEditStudentSection('B')}
                                          className={`px-1.5 py-1 text-[10px] font-bold ${
                                            editStudentSection === 'B' ? 'bg-[#4cc9f0] text-[#111113]' : 'text-[#f2f2f4]/60'
                                          }`}
                                          title="Section B"
                                        >
                                          B
                                        </button>
                                      </div>
                                      <input
                                        type="text"
                                        value={editStudentId}
                                        onChange={(e) => setEditStudentId(e.target.value)}
                                        placeholder="Student ID"
                                        className="w-full px-2.5 py-1.5 bg-[#111113] border border-[#4cc9f0] text-xs font-mono font-bold text-[#f2f2f4]"
                                      />
                                    </div>
                                  </td>
                                  <td className="py-3 px-4">
                                    <input
                                      type="text"
                                      value={editStudentName}
                                      onChange={(e) => setEditStudentName(e.target.value)}
                                      placeholder="Full Name"
                                      className="w-full px-2.5 py-1.5 bg-[#111113] border border-[#4cc9f0] text-xs font-semibold text-[#f2f2f4]"
                                    />
                                  </td>
                                  <td className="py-3 px-4">
                                    <input
                                      type="text"
                                      value={editStudentPassword}
                                      onChange={(e) => setEditStudentPassword(e.target.value)}
                                      placeholder="New Password (optional)"
                                      className="w-full px-2.5 py-1.5 bg-[#111113] border border-[#4cc9f0] text-xs font-mono font-semibold text-[#f2f2f4]"
                                    />
                                  </td>
                                  <td className="py-3 px-4">
                                    <select
                                      value={editStudentClass}
                                      onChange={(e) => setEditStudentClass(e.target.value)}
                                      className="px-2.5 py-1.5 bg-[#111113] border border-[#4cc9f0] text-xs font-semibold text-[#f2f2f4]"
                                    >
                                      {classes.map((c) => (
                                        <option key={c.id} value={c.id}>
                                          {c.name}
                                        </option>
                                      ))}
                                    </select>
                                  </td>
                                  <td className="py-3 px-4 text-[#f2f2f4]/40 text-[11px]">Editing...</td>
                                  <td className="py-3 px-4 text-right space-x-2">
                                    <button
                                      type="button"
                                      onClick={handleUpdateStudentSubmit}
                                      className="btn btn-primary px-3 py-1.5 text-[11px] font-bold transition cursor-pointer"
                                    >
                                      Save Changes
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingStudent(null);
                                        setEditStudentPassword('');
                                        setEditStudentRollNo('');
                                      }}
                                      className="px-3 py-1.5 bg-[#111113] hover:bg-[#252529] border border-[rgba(242,242,244,0.1)] text-[#f2f2f4]/70 text-[11px] font-semibold transition cursor-pointer"
                                    >
                                      Cancel
                                    </button>
                                  </td>
                                </tr>
                              );
                            }

                            return (
                              <tr key={stu.id} className="hover:bg-[#111113]/50 transition">
                                {/* Student ID & Roll No */}
                                <td className="py-3.5 px-4 font-mono font-bold text-[#f2f2f4]">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    {stu.rollNo && (
                                      <span className="px-1.5 py-0.5 bg-[#ff9f1c]/15 text-[#ff9f1c] border border-[#ff9f1c]/30 text-[10px] font-bold tracking-tight" title="Roll Number">
                                        Roll #{stu.rollNo}
                                      </span>
                                    )}
                                    <span>{stu.studentId}</span>
                                    <button
                                      type="button"
                                      onClick={() => copyToClipboard(stu.studentId, `id-${stu.id}`)}
                                      className="p-1 text-[#f2f2f4]/40 hover:text-[#f2f2f4] transition cursor-pointer"
                                      title="Copy Student ID"
                                    >
                                      {copiedField === `id-${stu.id}` ? (
                                        <Check className="w-3 h-3 text-emerald-400" />
                                      ) : (
                                        <Copy className="w-3 h-3" />
                                      )}
                                    </button>
                                  </div>
                                </td>

                                {/* Student Name */}
                                <td className="py-3.5 px-4 font-bold text-[#f2f2f4] font-sans">
                                  {stu.name}
                                </td>

                                {/* Password with View / Copy */}
                                <td className="py-3.5 px-4">
                                  <div className="inline-flex items-center gap-1.5 bg-[#111113] px-2.5 py-1 border border-[rgba(242,242,244,0.1)]">
                                    <Key className="w-3 h-3 text-[#f2f2f4]/40 shrink-0" />
                                    <span className="font-mono text-xs font-bold text-[#f2f2f4] tracking-wider">
                                      {isPwdVisible ? currentPassword : '••••••••'}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => togglePasswordVisibility(stu.id)}
                                      className="p-0.5 text-[#f2f2f4]/40 hover:text-[#f2f2f4] transition cursor-pointer"
                                      title={isPwdVisible ? 'Hide Password' : 'Show Password'}
                                    >
                                      {isPwdVisible ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => copyToClipboard(currentPassword, `pwd-${stu.id}`)}
                                      className="p-0.5 text-[#f2f2f4]/40 hover:text-[#f2f2f4] transition cursor-pointer"
                                      title="Copy Password"
                                    >
                                      {copiedField === `pwd-${stu.id}` ? (
                                        <Check className="w-3 h-3 text-emerald-400" />
                                      ) : (
                                        <Copy className="w-3 h-3" />
                                      )}
                                    </button>
                                  </div>
                                </td>

                                {/* Class Grade */}
                                <td className="py-3.5 px-4">
                                  <span className="px-2.5 py-1 bg-[#4cc9f0]/15 font-bold text-[#4cc9f0] border border-[#4cc9f0]/30 text-[11px]">
                                    {cls ? cls.name : stu.classId}
                                  </span>
                                </td>

                                {/* Registration Date */}
                                <td className="py-3.5 px-4 text-[#f2f2f4]/50 text-[11px]">
                                  {stu.createdAt ? new Date(stu.createdAt).toLocaleDateString() : 'Active'}
                                </td>

                                {/* Actions & Printing */}
                                <td className="py-3.5 px-4 text-right">
                                  <div className="flex items-center justify-end gap-1.5 flex-wrap">
                                    {/* View / Print Student Answer Sheets */}
                                    {onOpenSubmissions && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          onClose();
                                          onOpenSubmissions(stu.studentId);
                                        }}
                                        className="px-2.5 py-1.5 border border-[#4cc9f0]/30 bg-[#4cc9f0]/15 hover:bg-[#4cc9f0]/25 text-[#4cc9f0] text-[11px] font-bold transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
                                        title="Inspect & Print Answer Sheets for this student"
                                      >
                                        <Printer className="w-3.5 h-3.5 text-[#4cc9f0]" />
                                        <span>Print Sheets</span>
                                      </button>
                                    )}

                                    {/* Print Student ID & Password Pass */}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setIdPassModalStudent(stu);
                                        setIsIdPassModalOpen(true);
                                      }}
                                      className="px-2.5 py-1.5 border border-[rgba(242,242,244,0.15)] bg-[#111113] hover:bg-[#1c1c1f] text-[#f2f2f4] text-[11px] font-bold transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
                                      title="Print Official Student ID & Password Admit Pass for this student"
                                    >
                                      <CreditCard className="w-3.5 h-3.5 text-[#4cc9f0]" />
                                      <span>Print ID Pass</span>
                                    </button>

                                    {/* Reset Password Button */}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setResetModalStudent(stu);
                                        setCustomResetPassword('password');
                                      }}
                                      className="px-2.5 py-1.5 border border-[#ff9f1c]/30 bg-[#ff9f1c]/15 hover:bg-[#ff9f1c]/25 text-[#ff9f1c] text-[11px] font-bold transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
                                      title="Reset this student's password"
                                    >
                                      <RotateCcw className="w-3.5 h-3.5 text-[#ff9f1c]" />
                                      <span>Reset Pass</span>
                                    </button>

                                    {/* Edit Student Info */}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingStudent(stu);
                                        const sec = detectSectionFromRoll(stu.rollNo) || 'A';
                                        setEditStudentSection(sec);
                                        setEditStudentRollNo(stu.rollNo ? stu.rollNo.replace(/[a-zA-Z]+$/, '') : '');
                                        setEditStudentId(stu.studentId);
                                        setEditStudentName(stu.name);
                                        setEditStudentClass(stu.classId);
                                        setEditStudentPassword(stu.password || '');
                                      }}
                                      className="p-1.5 text-[#f2f2f4]/60 hover:text-[#4cc9f0] hover:bg-[#4cc9f0]/10 border border-transparent hover:border-[#4cc9f0]/30 transition cursor-pointer"
                                      title="Edit Student Profile & Credentials"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>

                                    {/* Delete Student */}
                                    <button
                                      type="button"
                                      onClick={() => setDeleteModalStudent(stu)}
                                      className="p-1.5 text-[#f2f2f4]/60 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/30 transition cursor-pointer"
                                      title="Permanently Delete Student Account"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        {students.length === 0 && (
                          <tr>
                            <td colSpan={6} className="py-12 text-center text-[#f2f2f4]/40 space-y-2">
                              <Users className="w-8 h-8 mx-auto text-[#f2f2f4]/30" />
                              <p className="font-semibold text-[#f2f2f4]">No student accounts registered yet.</p>
                              <p className="text-xs text-[#f2f2f4]/40 max-w-sm mx-auto">
                                Students will automatically create their Student ID & Password upon taking tests, and they will appear here in real time.
                              </p>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  </>
                )}
              </div>

              {/* MODAL: Reset Password Dialog */}
              {resetModalStudent && (
                <div className="fixed inset-0 z-60 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2.5 sm:p-4 animate-in fade-in">
                  <div className="bg-[#1c1c1f] p-4 sm:p-6 border border-[rgba(242,242,244,0.1)] shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto space-y-4 font-mono">
                    <div className="flex items-center justify-between gap-2 pb-3 border-b border-[rgba(242,242,244,0.1)]">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-9 h-9 bg-[#ff9f1c]/15 text-[#ff9f1c] border border-[#ff9f1c]/30 flex items-center justify-center shrink-0">
                          <KeyRound className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-syne font-bold text-sm text-[#f2f2f4] truncate">Reset Student Password</h3>
                          <p className="text-[11px] text-[#f2f2f4]/60 truncate">{resetModalStudent.name} ({resetModalStudent.studentId})</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setResetModalStudent(null)}
                        className="p-1.5 text-[#f2f2f4]/60 hover:text-[#f2f2f4] shrink-0"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <form onSubmit={handleConfirmResetPassword} className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-[#f2f2f4]/80 mb-1.5">
                          Set New Password *
                        </label>
                        <input
                          type="text"
                          required
                          value={customResetPassword}
                          onChange={(e) => setCustomResetPassword(e.target.value)}
                          placeholder="e.g. password"
                          className="w-full px-3.5 py-2.5 border border-[rgba(242,242,244,0.1)] font-mono text-sm font-bold text-[#f2f2f4] bg-[#111113] focus:outline-none focus:border-[#4cc9f0]"
                        />
                        <div className="flex items-center gap-2 mt-2">
                          <button
                            type="button"
                            onClick={() => setCustomResetPassword('password')}
                            className="px-2.5 py-1 bg-[#111113] hover:bg-[#252529] border border-[rgba(242,242,244,0.1)] text-[#f2f2f4]/70 text-[11px] font-semibold transition cursor-pointer"
                          >
                            Use default: "password"
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-col-reverse xs:flex-row items-stretch xs:items-center justify-end gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => setResetModalStudent(null)}
                          className="px-4 py-2 border border-[rgba(242,242,244,0.1)] bg-[#111113] hover:bg-[#1c1c1f] text-[#f2f2f4]/70 text-xs font-semibold cursor-pointer text-center"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="btn btn-primary px-5 py-2 text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Update Password</span>
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* MODAL: Delete Student Safety Dialog */}
              {deleteModalStudent && (
                <div className="fixed inset-0 z-60 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2.5 sm:p-4 animate-in fade-in">
                  <div className="bg-[#1c1c1f] p-4 sm:p-6 border border-rose-500/30 shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto space-y-4 font-mono">
                    <div className="flex items-center gap-3 pb-2 border-b border-rose-500/20">
                      <div className="w-10 h-10 bg-rose-500/15 text-rose-400 border border-rose-500/30 flex items-center justify-center shrink-0">
                        <Trash2 className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-syne font-bold text-sm text-[#f2f2f4]">Delete Student Account</h3>
                        <p className="text-xs text-rose-400 font-semibold">Irreversible action</p>
                      </div>
                    </div>

                    <div className="p-3.5 sm:p-4 bg-rose-500/10 border border-rose-500/30 space-y-2 text-xs text-rose-300">
                      <p className="font-bold break-words">
                        Are you sure you want to permanently delete "{deleteModalStudent.name}" (ID: {deleteModalStudent.studentId})?
                      </p>
                      <p className="text-[11px] text-rose-300/80 leading-relaxed font-sans">
                        This student's login ID, password, test attempts, and all evaluated answer sheet records will be completely removed from the database.
                      </p>
                    </div>

                    <div className="flex flex-col-reverse xs:flex-row items-stretch xs:items-center justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setDeleteModalStudent(null)}
                        className="px-4 py-2 border border-[rgba(242,242,244,0.1)] bg-[#111113] hover:bg-[#1c1c1f] text-[#f2f2f4]/70 text-xs font-semibold cursor-pointer text-center"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleConfirmDeleteStudent}
                        className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete Student & Wipe Data</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tests & Assessments Management Tab */}
          {tab === 'tests' && (
            <div className="space-y-5">
              {/* Header and Controls */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[var(--surface-higher)] p-4 sm:p-5 rounded-2xl border border-[var(--border)]">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <FileQuestion className="w-5 h-5 text-blue-500" />
                    <h3 className="font-bold text-sm sm:text-base text-[var(--ink)]">
                      Tests & Question Paper Management
                    </h3>
                    <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30">
                      Teacher Admin Access
                    </span>
                  </div>
                  <p className="text-xs text-[var(--ink-muted)] mt-1 max-w-2xl leading-relaxed">
                    As Administrator, you can take any test directly with <strong>zero ID or password restrictions</strong> and <strong>unlimited retakes</strong>. You can also print official question papers or review student submissions.
                  </p>
                </div>

                {onCreateQuiz && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onCreateQuiz();
                    }}
                    className="btn btn-primary px-4 py-2.5 text-xs rounded-xl flex items-center justify-center gap-2 shrink-0 cursor-pointer shadow-xs font-bold"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Create New Test</span>
                  </button>
                )}
              </div>

              {/* Filters */}
              <div className="flex flex-col sm:flex-row items-center gap-2.5">
                <div className="relative flex-1 w-full">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-muted)]" />
                  <input
                    type="text"
                    value={testSearch}
                    onChange={(e) => setTestSearch(e.target.value)}
                    placeholder="Search tests by title, subject, or description..."
                    className="w-full pl-9 pr-3.5 py-2.5 bg-[var(--surface)] border border-[var(--border)] text-xs text-[var(--ink)] rounded-xl outline-none focus:border-blue-500 transition"
                  />
                </div>

                <div className="w-full sm:w-56">
                  <select
                    value={testFilterClass}
                    onChange={(e) => setTestFilterClass(e.target.value)}
                    className="w-full py-2.5 px-3 bg-[var(--surface)] border border-[var(--border)] text-xs text-[var(--ink)] rounded-xl outline-none focus:border-blue-500 transition"
                  >
                    <option value="all">All Classes ({quizzes.length})</option>
                    {classes.map((cls) => {
                      const count = quizzes.filter(q => q.classId === cls.id).length;
                      return (
                        <option key={cls.id} value={cls.id}>
                          {cls.name} ({count})
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>

              {/* Tests Grid / List */}
              {filteredTests.length === 0 ? (
                <div className="text-center py-12 px-4 bg-[var(--surface-higher)]/50 border border-[var(--border)] rounded-2xl space-y-3">
                  <FileQuestion className="w-10 h-10 text-[var(--ink-muted)] mx-auto opacity-50" />
                  <h4 className="font-bold text-sm text-[var(--ink)]">No tests found</h4>
                  <p className="text-xs text-[var(--ink-muted)] max-w-sm mx-auto">
                    {testSearch || testFilterClass !== 'all'
                      ? 'No tests matched your search or class filter.'
                      : 'No assessments have been created yet. Click "+ Create New Test" to get started.'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredTests.map((quiz) => {
                    const cls = classes.find((c) => c.id === quiz.classId);
                    return (
                      <div
                        key={quiz.id}
                        className="bg-[var(--surface-higher)] border border-[var(--border)] rounded-2xl p-4 sm:p-5 flex flex-col justify-between space-y-4 shadow-2xs hover:border-blue-500/40 transition"
                      >
                        <div className="space-y-2.5">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30">
                              {cls ? cls.name : 'All Classes'}
                            </span>
                            <span className="text-[10px] font-semibold text-[var(--ink-muted)] bg-[var(--surface)] px-2 py-0.5 rounded border border-[var(--border)]">
                              {quiz.subject}
                            </span>
                          </div>

                          <h4 className="font-bold text-sm sm:text-base text-[var(--ink)] leading-snug">
                            {quiz.title}
                          </h4>

                          {quiz.description && (
                            <p className="text-xs text-[var(--ink-muted)] line-clamp-2 leading-relaxed">
                              {quiz.description}
                            </p>
                          )}

                          <div className="flex items-center gap-3.5 text-xs text-[var(--ink-muted)] pt-1 flex-wrap">
                            <span className="flex items-center gap-1.5 font-mono">
                              <BookOpen className="w-3.5 h-3.5 text-blue-500" />
                              {quiz.questions?.length || 0} Questions
                            </span>
                            <span className="flex items-center gap-1.5 font-mono text-amber-500">
                              <Award className="w-3.5 h-3.5" />
                              {quiz.totalPoints} Marks
                            </span>
                            {quiz.timeLimitMinutes && quiz.timeLimitMinutes > 0 && (
                              <span className="flex items-center gap-1.5 font-mono">
                                <Clock className="w-3.5 h-3.5" />
                                {quiz.timeLimitMinutes} min limit
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="pt-3 border-t border-[var(--border)] space-y-2">
                          {/* Take Test as Admin */}
                          {onTakeQuiz && (
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                onTakeQuiz(quiz);
                              }}
                              className="w-full min-h-[38px] h-auto py-2 px-3 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 transition cursor-pointer shadow-xs text-center"
                              title="Take this test immediately as Admin (No password, unlimited retakes)"
                            >
                              <Play className="w-3.5 h-3.5 fill-current shrink-0" />
                              <span>Take Test (Admin Mode)</span>
                              <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded font-mono font-normal">
                                No ID • Unlimited
                              </span>
                            </button>
                          )}

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-0.5">
                            {/* Print Paper */}
                            {onPrintQuiz && (
                              <a
                                href={getAuthenticatedPrintUrl(`/api/print/quiz/${quiz.id}`)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="min-w-0 py-2 px-2 rounded-xl text-[11px] font-semibold bg-[var(--surface)] hover:bg-[var(--surface-highest)] text-[var(--ink)] border border-[var(--border)] flex items-center justify-center gap-1.5 transition cursor-pointer shadow-2xs"
                                title="Print Question Paper (Questions Only)"
                              >
                                <Printer className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                <span className="truncate">Print Paper</span>
                              </a>
                            )}

                            {/* Submissions */}
                            {onOpenSubmissions && (
                              <button
                                type="button"
                                onClick={() => {
                                  onClose();
                                  onOpenSubmissions(undefined, quiz.id);
                                }}
                                className="min-w-0 py-2 px-2 rounded-xl text-[11px] font-semibold bg-[var(--surface)] hover:bg-[var(--surface-highest)] text-[var(--ink)] border border-[var(--border)] flex items-center justify-center gap-1.5 transition cursor-pointer shadow-2xs"
                                title="View Student Submissions"
                              >
                                <Users className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                <span className="truncate">Submissions</span>
                              </button>
                            )}

                            {/* Edit */}
                            {onEditQuiz && (
                              <button
                                type="button"
                                onClick={() => {
                                  onClose();
                                  onEditQuiz(quiz);
                                }}
                                className="min-w-0 py-2 px-2 rounded-xl text-[11px] font-semibold bg-[var(--surface)] hover:bg-[var(--surface-highest)] text-[var(--ink)] border border-[var(--border)] flex items-center justify-center gap-1.5 transition cursor-pointer shadow-2xs"
                                title="Edit Test Details & Questions"
                              >
                                <Edit2 className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                <span className="truncate">Edit</span>
                              </button>
                            )}

                            {/* Delete */}
                            {onDeleteQuiz && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (window.confirm(`Delete assessment "${quiz.title}"?`)) {
                                    onDeleteQuiz(quiz.id);
                                  }
                                }}
                                className="min-w-0 py-2 px-2 rounded-xl text-[11px] font-semibold bg-[var(--surface)] hover:bg-rose-500/10 text-rose-500 border border-[var(--border)] hover:border-rose-500/30 flex items-center justify-center gap-1.5 transition cursor-pointer shadow-2xs"
                                title="Delete Test"
                              >
                                <Trash2 className="w-3.5 h-3.5 shrink-0" />
                                <span className="truncate">Delete</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          {tab === 'settings' && (() => {
            const pwdCheck = validateAdminPasswordFormat(newPasswordInput);
            return (
              <div className="max-w-xl space-y-5">
                {/* Profile Overview Card (Name & Username only — password is never exposed) */}
                <div className="bg-[var(--surface-higher)] p-5 border border-[var(--border)] rounded-xl space-y-3">
                  <div className="flex items-center justify-between border-b border-[var(--border)] pb-2.5">
                    <div className="flex items-center gap-2">
                      <User className="w-5 h-5 text-blue-500" />
                      <h3 className="font-bold text-sm text-[var(--ink)]">
                        My Administrator Profile
                      </h3>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                      Protected Account
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-0.5 min-w-0">
                      <span className="text-[10px] font-bold text-[var(--ink-muted)] uppercase tracking-wider block">
                        Admin Name
                      </span>
                      <span className="text-sm sm:text-base font-bold text-[var(--ink)] truncate block">
                        {adminDisplayName || 'Sudeep Shrestha'}
                      </span>
                    </div>
                    <div className="space-y-0.5 min-w-0">
                      <span className="text-[10px] font-bold text-[var(--ink-muted)] uppercase tracking-wider block">
                        Current Username
                      </span>
                      <span className="font-mono text-sm sm:text-base font-bold text-[var(--ink)] truncate block">
                        {adminUsername || 'Loading...'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Update Admin Name, Username & Password Form */}
                <form onSubmit={handleChangeCredentialsSubmit} className="bg-[var(--surface-higher)] p-5 border border-[var(--border)] rounded-xl space-y-4">
                  <div className="border-b border-[var(--border)] pb-2.5">
                    <h3 className="font-bold text-sm text-[var(--ink)] flex items-center gap-2">
                      <Key className="w-4 h-4 text-emerald-500" />
                      <span>Edit Profile, Username &amp; Password</span>
                    </h3>
                    <p className="text-xs text-[var(--ink-muted)] mt-0.5">
                      Verify your current password to update your name, administrator username, or password.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[var(--ink)] mb-1">
                      Current Admin Password *
                    </label>
                    <input
                      type="password"
                      required
                      value={currentPasswordInput}
                      onChange={(e) => setCurrentPasswordInput(e.target.value)}
                      placeholder="Enter current admin password"
                      autoComplete="current-password"
                      className="input text-xs w-full py-2 font-mono bg-[var(--surface)]"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-[var(--ink)] mb-1">
                        Full Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={newAdminDisplayName}
                        onChange={(e) => setNewAdminDisplayName(e.target.value)}
                        placeholder="e.g. Sudeep Shrestha"
                        autoComplete="name"
                        className="input text-xs w-full py-2 bg-[var(--surface)]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[var(--ink)] mb-1">
                        Admin Username *
                      </label>
                      <input
                        type="text"
                        required
                        value={newAdminUsername}
                        onChange={(e) => setNewAdminUsername(e.target.value)}
                        placeholder="Enter admin username (3-50 chars)"
                        autoComplete="username"
                        className="input text-xs w-full py-2 font-mono bg-[var(--surface)]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-[var(--ink)] mb-1">
                        New Password (Optional)
                      </label>
                      <div className="relative">
                        <input
                          type={showNewAdminPassword ? 'text' : 'password'}
                          value={newPasswordInput}
                          onChange={(e) => setNewPasswordInput(e.target.value)}
                          placeholder="Leave blank to keep current"
                          autoComplete="new-password"
                          className="input text-xs w-full py-2 pr-8 font-mono bg-[var(--surface)]"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewAdminPassword(!showNewAdminPassword)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--ink-muted)] hover:text-[var(--ink)] cursor-pointer p-0.5"
                          title={showNewAdminPassword ? 'Hide password' : 'Show password'}
                        >
                          {showNewAdminPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[var(--ink)] mb-1">
                        Confirm New Password
                      </label>
                      <input
                        type="password"
                        value={confirmPasswordInput}
                        onChange={(e) => setConfirmPasswordInput(e.target.value)}
                        placeholder="Re-type new password"
                        autoComplete="new-password"
                        disabled={!newPasswordInput}
                        className="input text-xs w-full py-2 font-mono bg-[var(--surface)] disabled:opacity-50"
                      />
                    </div>
                  </div>

                  {/* Password Rule Checklist */}
                  <div className="p-3 rounded-xl bg-[var(--surface)] border border-[var(--border)] space-y-1.5 text-[11px]">
                    <span className="font-bold text-[var(--ink)] block">Password Format Requirements:</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[var(--ink-muted)]">
                      <span className={newPasswordInput && pwdCheck.checks.startsUppercase ? 'text-emerald-500 font-semibold' : ''}>
                        • First letter UPPERCASE (A-Z)
                      </span>
                      <span className={newPasswordInput && pwdCheck.checks.restLowercaseOnly ? 'text-emerald-500 font-semibold' : ''}>
                        • Remaining letters lowercase (a-z)
                      </span>
                      <span className={newPasswordInput && pwdCheck.checks.hasNumber ? 'text-emerald-500 font-semibold' : ''}>
                        • At least 1 number (0-9)
                      </span>
                      <span className={newPasswordInput && pwdCheck.checks.hasSymbol ? 'text-emerald-500 font-semibold' : ''}>
                        • At least 1 symbol (@, #, $, !, etc.)
                      </span>
                    </div>
                  </div>

                  {credMessage && (
                    <p className={`text-xs font-bold p-2.5 rounded-lg border ${credMessage.ok ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/15 border-rose-500/30 text-rose-600 dark:text-rose-400'}`}>
                      {credMessage.text}
                    </p>
                  )}

                  <div className="pt-1 flex justify-end">
                    <button
                      type="submit"
                      disabled={isUpdatingCreds}
                      className="btn btn-primary px-5 py-2 text-xs font-bold transition cursor-pointer disabled:opacity-50"
                    >
                      {isUpdatingCreds ? 'Updating...' : 'Save My Profile'}
                    </button>
                  </div>
                </form>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Official Student ID & Password Examination Pass Printing Modal */}
      {isIdPassModalOpen && (
        <StudentIdPassModal
          isOpen={isIdPassModalOpen}
          onClose={() => {
            setIsIdPassModalOpen(false);
            setIdPassModalStudent(null);
          }}
          students={students}
          classes={classes}
          initialStudent={idPassModalStudent}
          initialClassId={studentFilterClass}
        />
      )}
    </div>
  );
};
