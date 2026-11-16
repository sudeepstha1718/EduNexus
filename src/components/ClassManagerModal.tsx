import React, { useState, useEffect } from 'react';
import {
  X,
  School,
  GraduationCap,
  Users,
  Plus,
  Edit2,
  Trash2,
  Key,
  Eye,
  EyeOff,
  Check,
  AlertCircle,
  Search,
  Copy,
  RotateCcw,
  UserPlus,
  ShieldAlert,
  ChevronRight
} from 'lucide-react';
import { ClassItem, StudentUser, SubjectCategory } from '../types';
import { formatRollWithSection, detectSectionFromRoll } from './StudentIdPassModal';
import {
  Tag,
  KeyRound,
  ShieldCheck,
  Sparkles,
  Lock,
  User
} from 'lucide-react';
import {
  fetchStudents,
  registerStudent,
  updateStudent,
  resetStudentPassword,
  deleteStudent,
  fetchAdminCredentials,
  updateAdminCredentials
} from '../lib/api';
import { validateAdminPasswordFormat } from '../lib/deviceFingerprint';

interface ClassManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  classes: ClassItem[];
  onAddClass: (newClass: ClassItem) => Promise<void>;
  onUpdateClass: (updatedClass: ClassItem) => Promise<void>;
  onDeleteClass: (classId: string) => Promise<void>;
  subjects?: SubjectCategory[];
  onAddSubject?: (newSubject: SubjectCategory) => Promise<void>;
  onDeleteSubject?: (subjectId: string) => Promise<void>;
  onAdminProfileUpdated?: (name: string, username: string) => void;
}

export const ClassManagerModal: React.FC<ClassManagerModalProps> = ({
  isOpen,
  onClose,
  classes,
  onAddClass,
  onUpdateClass,
  onDeleteClass,
  subjects = [],
  onAddSubject,
  onDeleteSubject,
  onAdminProfileUpdated,
}) => {
  // Main view tab: 'classes' | 'subjects' | 'passcode' | 'students'
  const [activeTab, setActiveTab] = useState<'classes' | 'subjects' | 'passcode' | 'students'>('classes');

  // ==========================================
  // CLASSES MANAGEMENT STATE
  // ==========================================
  const [newClassName, setNewClassName] = useState('');
  const [newClassSection, setNewClassSection] = useState('');
  const [newClassPassword, setNewClassPassword] = useState('1234');
  const [newClassDesc, setNewClassDesc] = useState('');
  const [classSearch, setClassSearch] = useState('');

  // Editing existing class
  const [editingClassId, setEditingClassId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editSection, setEditSection] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [confirmDeleteClassId, setConfirmDeleteClassId] = useState<string | null>(null);

  // ==========================================
  // STUDENTS & PASSWORDS STATE
  // ==========================================
  const [students, setStudents] = useState<StudentUser[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  const [studentFilterClass, setStudentFilterClass] = useState<string>('all');
  const [isAddingStudent, setIsAddingStudent] = useState(false);

  // Add new student form
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentRoll, setNewStudentRoll] = useState('');
  const [newStudentSection, setNewStudentSection] = useState<'A' | 'B'>('A');
  const [newStudentId, setNewStudentId] = useState('');
  const [newStudentClassId, setNewStudentClassId] = useState('');
  const [newStudentPassword, setNewStudentPassword] = useState('');

  // Edit student modal/inline
  const [editingStudent, setEditingStudent] = useState<StudentUser | null>(null);
  const [editStudentName, setEditStudentName] = useState('');
  const [editStudentRoll, setEditStudentRoll] = useState('');
  const [editStudentSection, setEditStudentSection] = useState<'A' | 'B'>('A');
  const [editStudentIdVal, setEditStudentIdVal] = useState('');
  const [editStudentClassId, setEditStudentClassId] = useState('');

  // Reset student password modal/inline
  const [resetPwdStudent, setResetPwdStudent] = useState<StudentUser | null>(null);
  const [resetPwdValue, setResetPwdValue] = useState('');

  // Delete student confirm
  const [confirmDeleteStudentId, setConfirmDeleteStudentId] = useState<string | null>(null);

  // Visibility of passwords map (for both class PINs and student passwords)
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // General feedback
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // ==========================================
  // SUBJECTS MANAGEMENT STATE & HELPERS
  // ==========================================
  const [newSubjectName, setNewSubjectName] = useState('');
  const [newSubjectColor, setNewSubjectColor] = useState('bg-blue-100 text-blue-700');
  const [isAddingSubjectLoading, setIsAddingSubjectLoading] = useState(false);
  const [confirmDeleteSubId, setConfirmDeleteSubId] = useState<string | null>(null);

  // ==========================================
  // ADMIN PROFILE & CREDENTIALS MANAGEMENT
  // ==========================================
  const [adminDisplayName, setAdminDisplayName] = useState('Sudeep Shrestha');
  const [newAdminDisplayNameInput, setNewAdminDisplayNameInput] = useState('Sudeep Shrestha');
  const [adminUsername, setAdminUsername] = useState('');
  const [newAdminUsernameInput, setNewAdminUsernameInput] = useState('');
  const [currentAdminPinInput, setCurrentAdminPinInput] = useState('');
  const [newAdminPinInput, setNewAdminPinInput] = useState('');
  const [confirmAdminPinInput, setConfirmAdminPinInput] = useState('');
  const [showNewAdminPin, setShowNewAdminPin] = useState(false);
  const [isPasscodeSaving, setIsPasscodeSaving] = useState(false);

  const STANDARD_CURRICULUM_SUBJECTS = [
    { name: 'Mathematics', color: 'bg-blue-100 text-blue-700' },
    { name: 'Science & Technology', color: 'bg-emerald-100 text-emerald-700' },
    { name: 'English', color: 'bg-indigo-100 text-indigo-700' },
    { name: 'Nepali (नेपाली)', color: 'bg-amber-100 text-amber-700' },
    { name: 'Social Studies (सामाजिक अध्ययन)', color: 'bg-orange-100 text-orange-700' },
    { name: 'Computer Science', color: 'bg-cyan-100 text-cyan-700' },
    { name: 'Accountancy', color: 'bg-purple-100 text-purple-700' },
    { name: 'Economics', color: 'bg-teal-100 text-teal-700' },
    { name: 'Health & Physical Education', color: 'bg-rose-100 text-rose-700' },
    { name: 'Optional Mathematics', color: 'bg-sky-100 text-sky-700' },
  ];

  const handleCreateSubjectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubjectName.trim()) {
      setError('Please provide a subject name');
      return;
    }
    if (!onAddSubject) return;

    try {
      setIsAddingSubjectLoading(true);
      setError(null);
      await onAddSubject({
        id: newSubjectName.trim(),
        name: newSubjectName.trim(),
        color: newSubjectColor,
      });
      setNewSubjectName('');
      setSuccessNotice(`Subject "${newSubjectName.trim()}" added to database!`);
      setTimeout(() => setSuccessNotice(null), 3500);
    } catch (err: any) {
      setError(err.message || 'Failed to add subject');
    } finally {
      setIsAddingSubjectLoading(false);
    }
  };

  const handleLoadStandardSubjects = async () => {
    if (!onAddSubject) return;
    try {
      setIsAddingSubjectLoading(true);
      setError(null);
      let count = 0;
      for (const std of STANDARD_CURRICULUM_SUBJECTS) {
        const exists = subjects.some(s => s.name.toLowerCase() === std.name.toLowerCase() || s.id.toLowerCase() === std.name.toLowerCase());
        if (!exists) {
          await onAddSubject({
            id: std.name,
            name: std.name,
            color: std.color,
          });
          count++;
        }
      }
      setSuccessNotice(`Added ${count} curriculum subjects to database!`);
      setTimeout(() => setSuccessNotice(null), 4000);
    } catch (err: any) {
      setError(err.message || 'Failed to load standard subjects');
    } finally {
      setIsAddingSubjectLoading(false);
    }
  };

  const handleDeleteSubjectClick = async (subId: string) => {
    if (!onDeleteSubject) return;
    try {
      setError(null);
      await onDeleteSubject(subId);
      setConfirmDeleteSubId(null);
      setSuccessNotice('Subject deleted from database.');
      setTimeout(() => setSuccessNotice(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to delete subject');
    }
  };

  const handleUpdateAdminPasscodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!currentAdminPinInput) {
      setError('Please enter your current admin password.');
      return;
    }
    const cleanName = newAdminDisplayNameInput.trim();
    if (cleanName.length < 2 || cleanName.length > 80) {
      setError('Admin name must be between 2 and 80 characters.');
      return;
    }
    const cleanUser = newAdminUsernameInput.trim();
    if (cleanUser.length < 3 || cleanUser.length > 50) {
      setError('Admin username must be between 3 and 50 characters.');
      return;
    }
    if (newAdminPinInput) {
      const policy = validateAdminPasswordFormat(newAdminPinInput);
      if (!policy.valid) {
        setError(policy.error || 'New password does not meet policy requirements.');
        return;
      }
      if (newAdminPinInput !== confirmAdminPinInput) {
        setError('New password and confirmation password do not match.');
        return;
      }
    }

    try {
      setIsPasscodeSaving(true);
      const updated = await updateAdminCredentials({
        currentPassword: currentAdminPinInput,
        newName: cleanName,
        newUsername: cleanUser,
        newPassword: newAdminPinInput || undefined,
      });
      const resolvedName = updated.name || cleanName;
      setAdminDisplayName(resolvedName);
      setNewAdminDisplayNameInput(resolvedName);
      setAdminUsername(updated.username);
      setNewAdminUsernameInput(updated.username);
      setCurrentAdminPinInput('');
      setNewAdminPinInput('');
      setConfirmAdminPinInput('');
      if (onAdminProfileUpdated) {
        onAdminProfileUpdated(resolvedName, updated.username);
      }
      setSuccessNotice('My Profile updated successfully!');
      setTimeout(() => setSuccessNotice(null), 4000);
    } catch (err: any) {
      setError(err.message || 'Failed to update admin profile');
    } finally {
      setIsPasscodeSaving(false);
    }
  };

  // Load students when modal opens or when switching to students tab
  const loadStudents = async () => {
    try {
      setStudentsLoading(true);
      const data = await fetchStudents();
      setStudents(data);
    } catch (err: any) {
      console.error('Failed to load students:', err);
    } finally {
      setStudentsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadStudents();
      fetchAdminCredentials()
        .then((d) => {
          const resolvedName = d.name || 'Sudeep Shrestha';
          setAdminDisplayName(resolvedName);
          setNewAdminDisplayNameInput(resolvedName);
          setAdminUsername(d.username || '');
          setNewAdminUsernameInput(d.username || '');
        })
        .catch(() => {});
      setError(null);
      setSuccessNotice(null);
      if (classes.length > 0 && !newStudentClassId) {
        setNewStudentClassId(classes[0].id);
      }
    }
  }, [isOpen, classes]);

  if (!isOpen) return null;

  const togglePasswordVisibility = (id: string) => {
    setVisiblePasswords((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // ==========================================
  // CLASS HANDLERS
  // ==========================================
  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClassName.trim()) {
      setError('Please provide a class name');
      return;
    }
    if (!newClassPassword.trim()) {
      setError('Please provide a student passcode');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      const newId = `class-${Date.now()}`;
      await onAddClass({
        id: newId,
        name: newClassName.trim(),
        section: newClassSection.trim() || undefined,
        password: newClassPassword.trim(),
        description: newClassDesc.trim() || undefined,
      });
      setNewClassName('');
      setNewClassSection('');
      setNewClassPassword('1234');
      setNewClassDesc('');
      setSuccessNotice(`Created class "${newClassName.trim()}" successfully.`);
      setTimeout(() => setSuccessNotice(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to create class');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartEditClass = (cls: ClassItem) => {
    setEditingClassId(cls.id);
    setEditName(cls.name);
    setEditSection(cls.section || '');
    setEditPassword(cls.password || '1234');
    setEditDescription(cls.description || '');
  };

  const handleSaveClassEdit = async (cls: ClassItem) => {
    if (!editName.trim()) {
      setError('Class name cannot be empty');
      return;
    }
    try {
      setIsSubmitting(true);
      setError(null);
      await onUpdateClass({
        ...cls,
        name: editName.trim(),
        section: editSection.trim() || undefined,
        password: editPassword.trim() || '1234',
        description: editDescription.trim() || undefined,
      });
      setEditingClassId(null);
      setSuccessNotice(`Updated class "${editName.trim()}".`);
      setTimeout(() => setSuccessNotice(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to update class');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteClass = async (classId: string) => {
    try {
      setIsSubmitting(true);
      setError(null);
      await onDeleteClass(classId);
      setConfirmDeleteClassId(null);
      setSuccessNotice('Class removed successfully.');
      setTimeout(() => setSuccessNotice(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to delete class');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Switch to student tab filtered to that class
  const handleViewClassStudents = (classId: string) => {
    setStudentFilterClass(classId);
    setActiveTab('students');
  };

  // ==========================================
  // STUDENT HANDLERS
  // ==========================================
  const handleCreateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudentName.trim()) {
      setError('Please provide student name');
      return;
    }
    if (!newStudentId.trim()) {
      setError('Please provide student ID');
      return;
    }
    if (!newStudentPassword.trim()) {
      setError('Please provide student password');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      const effectiveRoll = formatRollWithSection(newStudentRoll.trim() || '1', newStudentSection);
      await registerStudent({
        name: newStudentName.trim(),
        rollNo: effectiveRoll,
        studentId: newStudentId.trim(),
        classId: newStudentClassId || (classes[0]?.id || 'grade-10'),
        password: newStudentPassword.trim(),
      });
      await loadStudents();
      setNewStudentName('');
      setNewStudentRoll('');
      setNewStudentId('');
      setNewStudentPassword('');
      setIsAddingStudent(false);
      setSuccessNotice(`Added student "${newStudentName.trim()}" (Roll #${effectiveRoll}) with login credentials.`);
      setTimeout(() => setSuccessNotice(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to add student');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveStudentEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;
    if (!editStudentName.trim()) {
      setError('Student name is required');
      return;
    }

    const formattedRoll = formatRollWithSection(editStudentRoll.trim() || '1', editStudentSection);
    let finalStudentId = editStudentIdVal.trim();
    if (!finalStudentId || finalStudentId.startsWith('STD-') || finalStudentId.startsWith('STU-')) {
      finalStudentId = `STD-${formattedRoll}`;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await updateStudent(editingStudent.id, {
        name: editStudentName.trim(),
        studentId: finalStudentId,
        rollNo: formattedRoll,
        section: editStudentSection,
        classId: editStudentClassId,
      });
      await loadStudents();
      setEditingStudent(null);
      setSuccessNotice(`Student account updated (Roll #${formattedRoll}).`);
      setTimeout(() => setSuccessNotice(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to update student');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickSwitchSection = async (stu: StudentUser, newSec: 'A' | 'B') => {
    const curSec = detectSectionFromRoll(stu.rollNo) || stu.section || 'A';
    if (curSec === newSec) return;
    const numPart = (stu.rollNo || '1').replace(/[a-zA-Z]+$/, '').trim() || '1';
    const formattedRoll = `${numPart}${newSec}`;
    let newStudentId = stu.studentId;
    if (newStudentId.startsWith('STD-')) {
      newStudentId = `STD-${formattedRoll}`;
    }

    // Optimistic update
    setStudents((prev) =>
      prev.map((s) =>
        s.id === stu.id
          ? { ...s, rollNo: formattedRoll, section: newSec, studentId: newStudentId }
          : s
      )
    );
    setSuccessNotice(`Moved ${stu.name} to Section ${newSec} (Roll #${formattedRoll}).`);
    setTimeout(() => setSuccessNotice(null), 3000);

    try {
      await updateStudent(stu.id, {
        section: newSec,
        rollNo: formattedRoll,
        studentId: newStudentId,
        name: stu.name,
        classId: stu.classId,
      });
      loadStudents();
    } catch (err: any) {
      console.error('Error switching section:', err);
      loadStudents();
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPwdStudent) return;
    if (!resetPwdValue.trim()) {
      setError('Please enter a new password');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await resetStudentPassword(resetPwdStudent.id, resetPwdValue.trim());
      await loadStudents();
      setSuccessNotice(`Password for ${resetPwdStudent.name} updated to: ${resetPwdValue.trim()}`);
      setResetPwdStudent(null);
      setResetPwdValue('');
      setTimeout(() => setSuccessNotice(null), 4000);
    } catch (err: any) {
      setError(err.message || 'Failed to reset password');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteStudent = async (studentId: string) => {
    try {
      setIsSubmitting(true);
      setError(null);
      await deleteStudent(studentId);
      await loadStudents();
      setConfirmDeleteStudentId(null);
      setSuccessNotice('Student account deleted from database.');
      setTimeout(() => setSuccessNotice(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to delete student');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtering
  const filteredClasses = classes.filter((c) => {
    if (!classSearch.trim()) return true;
    const q = classSearch.toLowerCase().trim();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.section && c.section.toLowerCase().includes(q)) ||
      (c.description && c.description.toLowerCase().includes(q))
    );
  });

  const filteredStudents = students.filter((s) => {
    if (studentFilterClass !== 'all' && s.classId !== studentFilterClass) return false;
    if (studentSearch.trim()) {
      const q = studentSearch.toLowerCase().trim();
      return (
        s.name.toLowerCase().includes(q) ||
        s.studentId.toLowerCase().includes(q) ||
        (s.password && s.password.toLowerCase().includes(q)) ||
        (s.rollNo && s.rollNo.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const getClassName = (cid: string) => {
    const found = classes.find((c) => c.id === cid);
    return found ? `${found.name}${found.section ? ` (${found.section})` : ''}` : cid;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/75 backdrop-blur-sm animate-fade-in font-sans">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* ========================================================= */}
        {/* MODAL HEADER WITH DIFFERENTIATED TABS                    */}
        {/* ========================================================= */}
        <div className="px-3.5 sm:px-5 py-3 sm:py-4 border-b border-[var(--border)] bg-[var(--surface-higher)] shrink-0">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
              <div className="w-9 h-9 rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                <GraduationCap className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h2 className="font-bold text-sm sm:text-base text-[var(--ink)] truncate">
                  Manage Classes &amp; Student Credentials
                </h2>
                <p className="text-[11px] text-[var(--ink-muted)] truncate">
                  Configure class grades and access every student's registered ID &amp; password
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--surface)] rounded-xl transition cursor-pointer shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Differentiated Segmented Tab Bar */}
          <div className="flex flex-wrap items-center gap-1 sm:gap-1.5 p-1 rounded-xl bg-[var(--surface)] border border-[var(--border)] w-full sm:w-fit">
            <button
              type="button"
              onClick={() => setActiveTab('classes')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'classes'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
              }`}
            >
              <School className="w-3.5 h-3.5" />
              <span>Classes</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                activeTab === 'classes' ? 'bg-white/20 text-white' : 'bg-[var(--surface-higher)] text-[var(--ink-muted)]'
              }`}>
                {classes.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('subjects')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'subjects'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
              }`}
            >
              <Tag className="w-3.5 h-3.5" />
              <span>Subjects</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                activeTab === 'subjects' ? 'bg-white/20 text-white' : 'bg-[var(--surface-higher)] text-[var(--ink-muted)]'
              }`}>
                {subjects.filter(s => s.id !== 'all').length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('passcode')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'passcode'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              <span>My Profile</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('students')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'students'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Student Passwords</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                activeTab === 'students' ? 'bg-white/20 text-white' : 'bg-[var(--surface-higher)] text-[var(--ink-muted)]'
              }`}>
                {students.length}
              </span>
            </button>
          </div>
        </div>

        {/* Global Notices */}
        {error && (
          <div className="mx-5 mt-3 p-3 bg-rose-500/15 border border-rose-500/30 rounded-xl text-xs text-rose-600 dark:text-rose-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {successNotice && (
          <div className="mx-5 mt-3 p-3 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>{successNotice}</span>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 1: CLASSES & SECTIONS                                 */}
        {/* ========================================================= */}
        {activeTab === 'classes' && (
          <div className="p-3.5 sm:p-5 overflow-y-auto space-y-4 sm:space-y-5 flex-1">
            {/* SECTION 1: CREATE NEW CLASS (Distinct bordered card) */}
            <div className="p-4 rounded-xl bg-[var(--surface-higher)] border border-[var(--border)] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[var(--ink)] flex items-center gap-2">
                  <Plus className="w-4 h-4 text-blue-500" />
                  <span>1. Add New Class Grade</span>
                </span>
                <span className="text-[10px] font-semibold text-[var(--ink-muted)] uppercase tracking-wider">
                  Configuration
                </span>
              </div>

              <form onSubmit={handleCreateClass} className="space-y-3">
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
                      placeholder="e.g. 1234"
                      value={newClassPassword}
                      onChange={(e) => setNewClassPassword(e.target.value)}
                      className="input text-xs w-full py-1.5 font-mono font-bold text-blue-600 dark:text-blue-400"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[var(--ink-muted)] mb-1">
                    Room / Stream Description (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Room 204 • Physics, Higher Math & Chemistry"
                    value={newClassDesc}
                    onChange={(e) => setNewClassDesc(e.target.value)}
                    className="input text-xs w-full py-1.5"
                  />
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="btn btn-primary text-xs px-4 py-1.5 flex items-center gap-1.5 font-bold cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Create Class</span>
                  </button>
                </div>
              </form>
            </div>

            {/* SECTION 2: EXISTING CLASSES DIRECTORY (Distinct card list) */}
            <div className="space-y-3">
              <div className="flex flex-col xs:flex-row xs:items-center justify-between gap-2.5">
                <span className="text-xs font-bold text-[var(--ink)] flex items-center gap-2">
                  <School className="w-4 h-4 text-blue-500 shrink-0" />
                  <span>2. Active Classes Directory ({classes.length})</span>
                </span>

                {classes.length > 3 && (
                  <div className="relative w-full xs:w-48">
                    <Search className="w-3 h-3 text-[var(--ink-muted)] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={classSearch}
                      onChange={(e) => setClassSearch(e.target.value)}
                      placeholder="Filter classes..."
                      className="input text-[11px] pl-7 pr-2 py-1 w-full"
                    />
                  </div>
                )}
              </div>

              {filteredClasses.length === 0 ? (
                <div className="p-8 text-center bg-[var(--surface-higher)] border border-dashed border-[var(--border)] rounded-xl text-xs text-[var(--ink-muted)]">
                  No classes found.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {filteredClasses.map((cls) => {
                    const isEditing = editingClassId === cls.id;
                    const isPwVisible = !!visiblePasswords[`class-${cls.id}`];
                    const isConfirmingDelete = confirmDeleteClassId === cls.id;
                    const studentCount = students.filter((s) => s.classId === cls.id).length;

                    if (isEditing) {
                      return (
                        <div
                          key={cls.id}
                          className="p-3.5 rounded-xl border border-blue-500/40 bg-blue-500/5 space-y-3"
                        >
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                            <div>
                              <label className="block text-[10px] font-bold text-[var(--ink-muted)] mb-1">
                                Class Name *
                              </label>
                              <input
                                type="text"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className="input text-xs w-full py-1 font-semibold"
                                required
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-[var(--ink-muted)] mb-1">
                                Section
                              </label>
                              <input
                                type="text"
                                value={editSection}
                                onChange={(e) => setEditSection(e.target.value)}
                                className="input text-xs w-full py-1"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-[var(--ink-muted)] mb-1">
                                Passcode *
                              </label>
                              <input
                                type="text"
                                value={editPassword}
                                onChange={(e) => setEditPassword(e.target.value)}
                                className="input text-xs w-full py-1 font-mono font-bold"
                                required
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold text-[var(--ink-muted)] mb-1">
                              Description
                            </label>
                            <input
                              type="text"
                              value={editDescription}
                              onChange={(e) => setEditDescription(e.target.value)}
                              className="input text-xs w-full py-1"
                            />
                          </div>

                          <div className="flex items-center justify-end gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => setEditingClassId(null)}
                              className="btn btn-secondary text-xs px-3 py-1 cursor-pointer"
                              disabled={isSubmitting}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSaveClassEdit(cls)}
                              className="btn btn-primary text-xs px-4 py-1 flex items-center gap-1 font-bold cursor-pointer"
                              disabled={isSubmitting}
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Save Changes</span>
                            </button>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={cls.id}
                        className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--surface-higher)] hover:border-blue-500/30 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 flex items-center justify-center font-bold text-xs shrink-0">
                            {cls.name.replace(/[^0-9a-zA-Z]/g, '').slice(0, 3) || 'CLS'}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                              <span className="font-bold text-xs sm:text-sm text-[var(--ink)]">
                                {cls.name}
                              </span>
                              {cls.section && (
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[var(--surface)] text-[var(--ink-muted)] border border-[var(--border)]">
                                  {cls.section}
                                </span>
                              )}
                              {/* Direct button to view students of this class */}
                              <button
                                type="button"
                                onClick={() => handleViewClassStudents(cls.id)}
                                className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/20 transition flex items-center gap-1 cursor-pointer"
                                title="View student IDs & passwords for this class"
                              >
                                <Users className="w-2.5 h-2.5" />
                                <span>{studentCount} {studentCount === 1 ? 'Student' : 'Students'}</span>
                                <ChevronRight className="w-2.5 h-2.5" />
                              </button>
                            </div>
                            {cls.description && (
                              <p className="text-[11px] text-[var(--ink-muted)] mt-0.5 line-clamp-1">
                                {cls.description}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Right side controls: Passcode pill & action buttons */}
                        <div className="flex flex-wrap items-center gap-2 self-stretch sm:self-center justify-end shrink-0">
                          {/* Passcode Pill with Eye & Copy */}
                          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-xs">
                            <Key className="w-3 h-3 text-amber-500" />
                            <span className="text-[10px] text-[var(--ink-muted)] font-medium">PIN:</span>
                            <span className="font-mono font-bold text-[var(--ink)]">
                              {isPwVisible ? cls.password || '1234' : '••••'}
                            </span>
                            <button
                              type="button"
                              onClick={() => togglePasswordVisibility(`class-${cls.id}`)}
                              className="text-[var(--ink-muted)] hover:text-[var(--ink)] ml-0.5 transition cursor-pointer"
                              title={isPwVisible ? 'Hide passcode' : 'Show passcode'}
                            >
                              {isPwVisible ? (
                                <EyeOff className="w-3 h-3" />
                              ) : (
                                <Eye className="w-3 h-3" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(cls.password || '1234', `class-pin-${cls.id}`)}
                              className="text-[var(--ink-muted)] hover:text-[var(--ink)] ml-0.5 transition cursor-pointer"
                              title="Copy Passcode"
                            >
                              {copiedKey === `class-pin-${cls.id}` ? (
                                <Check className="w-3 h-3 text-emerald-500" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>

                          {/* Edit Class Button */}
                          <button
                            type="button"
                            onClick={() => handleStartEditClass(cls)}
                            title="Edit Class Details"
                            className="p-1.5 rounded-lg text-[var(--ink-muted)] hover:text-blue-600 hover:bg-blue-500/10 transition cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete Class Button */}
                          {isConfirmingDelete ? (
                            <div className="flex items-center gap-1 animate-fade-in">
                              <button
                                type="button"
                                onClick={() => handleDeleteClass(cls.id)}
                                className="px-2 py-1 bg-rose-500 text-white rounded-lg text-[10px] font-bold hover:bg-rose-600 transition cursor-pointer"
                              >
                                Confirm
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteClassId(null)}
                                className="px-2 py-1 bg-[var(--surface)] text-[var(--ink-muted)] rounded-lg text-[10px] hover:text-[var(--ink)] transition cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteClassId(cls.id)}
                              title="Delete Class"
                              className="p-1.5 rounded-lg text-[var(--ink-muted)] hover:text-rose-500 hover:bg-rose-500/10 transition cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 2: SUBJECTS & CURRICULUM MANAGEMENT                  */}
        {/* ========================================================= */}
        {activeTab === 'subjects' && (
          <div className="p-3.5 sm:p-5 overflow-y-auto space-y-4 sm:space-y-5 flex-1">
            {/* SECTION 1: ADD NEW SUBJECT */}
            <div className="p-4 rounded-xl bg-[var(--surface-higher)] border border-[var(--border)] space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--border)] pb-2.5">
                <div>
                  <span className="text-xs font-bold text-[var(--ink)] flex items-center gap-1.5">
                    <Tag className="w-4 h-4 text-blue-500" />
                    <span>1. Add New Subject</span>
                  </span>
                  <p className="text-[11px] text-[var(--ink-muted)]">
                    Create custom subjects for lessons, homework, and syllabus
                  </p>
                </div>

                {/* Quick 1-Click Load Standard Nepali Curriculum Subjects */}
                <button
                  type="button"
                  onClick={handleLoadStandardSubjects}
                  disabled={isAddingSubjectLoading}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 transition flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>+ Load Standard Subjects</span>
                </button>
              </div>

              <form onSubmit={handleCreateSubjectSubmit} className="space-y-3 pt-1">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-bold text-[var(--ink-muted)] mb-1">
                      Subject Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Mathematics, Science, Social Studies, English..."
                      value={newSubjectName}
                      onChange={(e) => setNewSubjectName(e.target.value)}
                      className="input text-xs w-full py-2 font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[var(--ink-muted)] mb-1">
                      Color Theme
                    </label>
                    <select
                      value={newSubjectColor}
                      onChange={(e) => setNewSubjectColor(e.target.value)}
                      className="input text-xs w-full py-2 cursor-pointer font-medium"
                    >
                      <option value="bg-blue-100 text-blue-700">Blue</option>
                      <option value="bg-emerald-100 text-emerald-700">Emerald</option>
                      <option value="bg-purple-100 text-purple-700">Purple</option>
                      <option value="bg-amber-100 text-amber-700">Amber</option>
                      <option value="bg-rose-100 text-rose-700">Rose</option>
                      <option value="bg-indigo-100 text-indigo-700">Indigo</option>
                      <option value="bg-cyan-100 text-cyan-700">Cyan</option>
                      <option value="bg-teal-100 text-teal-700">Teal</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-end pt-1">
                  <button
                    type="submit"
                    disabled={isAddingSubjectLoading}
                    className="btn btn-primary text-xs px-4 py-2 flex items-center gap-1.5 font-bold cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{isAddingSubjectLoading ? 'Adding...' : 'Add Subject to Database'}</span>
                  </button>
                </div>
              </form>
            </div>

            {/* SECTION 2: SUBJECTS LIST */}
            <div className="p-4 rounded-xl bg-[var(--surface-higher)] border border-[var(--border)] space-y-3">
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
                <span className="text-xs font-bold text-[var(--ink)] flex items-center gap-1.5">
                  <Tag className="w-4 h-4 text-emerald-500" />
                  <span>2. Registered School Subjects</span>
                </span>
                <span className="text-[11px] font-semibold text-[var(--ink-muted)]">
                  {subjects.filter(s => s.id !== 'all').length} Active Subjects
                </span>
              </div>

              {subjects.filter(s => s.id !== 'all').length === 0 ? (
                <div className="text-center py-8 text-[var(--ink-muted)] text-xs">
                  No custom subjects added yet. Click "+ Load Standard Subjects" or create your first subject above.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-1">
                  {subjects
                    .filter(s => s.id !== 'all')
                    .map((sub) => {
                      const isConfirming = confirmDeleteSubId === sub.id;
                      return (
                        <div
                          key={sub.id}
                          className="p-3 rounded-xl bg-[var(--surface)] border border-[var(--border)] flex items-center justify-between gap-2 shadow-2xs"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />
                            <span className="text-xs font-bold text-[var(--ink)] truncate">
                              {sub.name}
                            </span>
                          </div>

                          {isConfirming ? (
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleDeleteSubjectClick(sub.id)}
                                className="px-2 py-0.5 bg-rose-500 text-white rounded text-[10px] font-bold hover:bg-rose-600 transition cursor-pointer"
                              >
                                Delete
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteSubId(null)}
                                className="px-1.5 py-0.5 bg-[var(--surface-higher)] text-[var(--ink-muted)] rounded text-[10px] hover:text-[var(--ink)] transition cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteSubId(sub.id)}
                              title="Delete Subject"
                              className="p-1 text-[var(--ink-muted)] hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition cursor-pointer shrink-0"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 3: ADMIN MY PROFILE & CREDENTIALS MANAGEMENT          */}
        {/* ========================================================= */}
        {activeTab === 'passcode' && (() => {
          const pwdCheck = validateAdminPasswordFormat(newAdminPinInput);
          return (
            <div className="p-4 sm:p-5 overflow-y-auto space-y-5 flex-1 max-w-2xl mx-auto w-full">
              {/* CARD 1: PROFILE STATUS */}
              <div className="p-4 rounded-xl bg-[var(--surface-higher)] border border-[var(--border)] space-y-3">
                <div className="flex items-center justify-between border-b border-[var(--border)] pb-2.5">
                  <span className="text-xs font-bold text-[var(--ink)] flex items-center gap-1.5">
                    <User className="w-4 h-4 text-blue-500" />
                    <span>My Administrator Profile</span>
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                    Protected Account
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1 min-w-0">
                    <span className="text-[10px] font-bold text-[var(--ink-muted)] uppercase tracking-wider block">
                      Admin Name
                    </span>
                    <span className="text-sm sm:text-base font-bold text-[var(--ink)] truncate block">
                      {adminDisplayName || 'Sudeep Shrestha'}
                    </span>
                  </div>

                  <div className="space-y-1 min-w-0">
                    <span className="text-[10px] font-bold text-[var(--ink-muted)] uppercase tracking-wider block">
                      Active Admin Username
                    </span>
                    <span className="font-mono text-sm sm:text-base font-bold text-[var(--ink)] truncate block">
                      {adminUsername || 'Loading...'}
                    </span>
                  </div>
                </div>
              </div>

              {/* CARD 2: UPDATE ADMIN NAME, USERNAME & PASSWORD FORM */}
              <div className="p-4 rounded-xl bg-[var(--surface-higher)] border border-[var(--border)] space-y-3">
                <div className="border-b border-[var(--border)] pb-2.5">
                  <span className="text-xs font-bold text-[var(--ink)] flex items-center gap-1.5">
                    <KeyRound className="w-4 h-4 text-emerald-500" />
                    <span>Edit Profile, Username &amp; Password</span>
                  </span>
                  <p className="text-[11px] text-[var(--ink-muted)] mt-0.5">
                    Confirm your current password to update your name, administrator username, or password.
                  </p>
                </div>

                <form onSubmit={handleUpdateAdminPasscodeSubmit} className="space-y-3 pt-1">
                  <div>
                    <label className="block text-[11px] font-bold text-[var(--ink-muted)] mb-1">
                      Current Admin Password *
                    </label>
                    <input
                      type="password"
                      required
                      placeholder="Enter current admin password"
                      autoComplete="current-password"
                      value={currentAdminPinInput}
                      onChange={(e) => setCurrentAdminPinInput(e.target.value)}
                      className="input text-xs w-full py-2 font-mono"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-[var(--ink-muted)] mb-1">
                        Full Name *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Sudeep Shrestha"
                        autoComplete="name"
                        value={newAdminDisplayNameInput}
                        onChange={(e) => setNewAdminDisplayNameInput(e.target.value)}
                        className="input text-xs w-full py-2"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-[var(--ink-muted)] mb-1">
                        Admin Username *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Enter admin username (3-50 chars)"
                        autoComplete="username"
                        value={newAdminUsernameInput}
                        onChange={(e) => setNewAdminUsernameInput(e.target.value)}
                        className="input text-xs w-full py-2 font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-[var(--ink-muted)] mb-1">
                        New Password (Optional)
                      </label>
                      <div className="relative">
                        <input
                          type={showNewAdminPin ? 'text' : 'password'}
                          placeholder="Leave blank to keep current"
                          autoComplete="new-password"
                          value={newAdminPinInput}
                          onChange={(e) => setNewAdminPinInput(e.target.value)}
                          className="input text-xs w-full py-2 pr-8 font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewAdminPin(!showNewAdminPin)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--ink-muted)] hover:text-[var(--ink)] p-0.5 cursor-pointer"
                        >
                          {showNewAdminPin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-[var(--ink-muted)] mb-1">
                        Confirm New Password
                      </label>
                      <input
                        type="password"
                        placeholder="Re-type new password"
                        autoComplete="new-password"
                        disabled={!newAdminPinInput}
                        value={confirmAdminPinInput}
                        onChange={(e) => setConfirmAdminPinInput(e.target.value)}
                        className="input text-xs w-full py-2 font-mono disabled:opacity-50"
                      />
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-[var(--surface)] border border-[var(--border)] space-y-1 text-[11px]">
                    <span className="font-bold text-[var(--ink)] block">Password Format Rule:</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[var(--ink-muted)]">
                      <span className={newAdminPinInput && pwdCheck.checks.startsUppercase ? 'text-emerald-500 font-semibold' : ''}>
                        • First letter UPPERCASE (A-Z)
                      </span>
                      <span className={newAdminPinInput && pwdCheck.checks.restLowercaseOnly ? 'text-emerald-500 font-semibold' : ''}>
                        • Other letters lowercase (a-z)
                      </span>
                      <span className={newAdminPinInput && pwdCheck.checks.hasNumber ? 'text-emerald-500 font-semibold' : ''}>
                        • Includes at least 1 number
                      </span>
                      <span className={newAdminPinInput && pwdCheck.checks.hasSymbol ? 'text-emerald-500 font-semibold' : ''}>
                        • Includes at least 1 symbol
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-end pt-2">
                    <button
                      type="submit"
                      disabled={isPasscodeSaving}
                      className="btn btn-primary text-xs px-5 py-2 flex items-center gap-1.5 font-bold cursor-pointer shadow-sm"
                    >
                      <Check className="w-4 h-4" />
                      <span>{isPasscodeSaving ? 'Updating...' : 'Save My Profile'}</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          );
        })()}

        {/* ========================================================= */}
        {/* TAB 4: STUDENT IDs & PASSWORDS DIRECTORY                  */}
        {/* ========================================================= */}
        {activeTab === 'students' && (
          <div className="p-3.5 sm:p-5 overflow-y-auto space-y-4 flex-1">
            {/* Top filter and add student toolbar */}
            <div className="p-3.5 rounded-xl bg-[var(--surface-higher)] border border-[var(--border)] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-3">
              <div className="flex flex-col xs:flex-row flex-wrap items-stretch xs:items-center gap-2.5 w-full sm:w-auto flex-1 min-w-0">
                {/* Search by Name, Student ID, or Password */}
                <div className="relative flex-1 min-w-0 sm:min-w-[180px]">
                  <Search className="w-3.5 h-3.5 text-[var(--ink-muted)] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    placeholder="Search by student name, ID, or password..."
                    className="input text-xs pl-8 pr-3 py-1.5 w-full"
                  />
                </div>

                {/* Class Filter Dropdown */}
                <select
                  value={studentFilterClass}
                  onChange={(e) => setStudentFilterClass(e.target.value)}
                  className="input text-xs py-1.5 cursor-pointer w-full xs:w-auto min-w-0"
                >
                  <option value="all">All Classes ({students.length})</option>
                  {classes.map((cls) => {
                    const countInClass = students.filter((s) => s.classId === cls.id).length;
                    return (
                      <option key={cls.id} value={cls.id}>
                        {cls.name} {cls.section ? `(${cls.section})` : ''} ({countInClass})
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Add Student Button */}
              <button
                type="button"
                onClick={() => setIsAddingStudent(!isAddingStudent)}
                className="btn btn-primary text-xs px-3.5 py-1.5 flex items-center justify-center gap-1.5 font-bold cursor-pointer shrink-0"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>{isAddingStudent ? 'Close Form' : '+ Add Student'}</span>
              </button>
            </div>

            {/* Collapsible Add Student Account Card */}
            {isAddingStudent && (
              <form
                onSubmit={handleCreateStudent}
                className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/30 space-y-3 animate-fade-in"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[var(--ink)] flex items-center gap-1.5">
                    <UserPlus className="w-4 h-4 text-blue-500" />
                    <span>Register New Student Login Account</span>
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-[10px] font-bold text-[var(--ink-muted)] mb-1">
                      Student Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Aarav Sharma"
                      value={newStudentName}
                      onChange={(e) => setNewStudentName(e.target.value)}
                      className="input text-xs w-full py-1.5 font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-[var(--ink-muted)] mb-1">
                      Assigned Class Grade *
                    </label>
                    <select
                      value={newStudentClassId}
                      onChange={(e) => setNewStudentClassId(e.target.value)}
                      className="input text-xs w-full py-1.5 cursor-pointer"
                      required
                    >
                      {classes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} {c.section ? `(${c.section})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-[var(--ink-muted)] mb-1">
                      Section (under Class)
                    </label>
                    <div className="grid grid-cols-2 gap-1 bg-[var(--surface)] border border-[var(--border)] p-0.5 rounded-lg">
                      <button
                        type="button"
                        onClick={() => setNewStudentSection('A')}
                        className={`py-1 text-xs font-bold rounded transition cursor-pointer ${
                          newStudentSection === 'A'
                            ? 'bg-blue-600 text-white shadow-2xs'
                            : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
                        }`}
                      >
                        Sec A
                      </button>
                      <button
                        type="button"
                        onClick={() => setNewStudentSection('B')}
                        className={`py-1 text-xs font-bold rounded transition cursor-pointer ${
                          newStudentSection === 'B'
                            ? 'bg-blue-600 text-white shadow-2xs'
                            : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
                        }`}
                      >
                        Sec B
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[10px] font-bold text-[var(--ink-muted)]">
                        Roll Number
                      </label>
                      <span className="text-[10px] text-blue-500 font-mono font-bold">
                        Saved: {formatRollWithSection(newStudentRoll || '1', newStudentSection)}
                      </span>
                    </div>
                    <input
                      type="text"
                      placeholder="e.g. 1 or 15"
                      value={newStudentRoll}
                      onChange={(e) => {
                        const val = e.target.value;
                        setNewStudentRoll(val);
                        const base = val.replace(/[a-zA-Z]+$/, '');
                        if (!newStudentId || newStudentId.startsWith('STU-')) {
                          setNewStudentId(base ? `STU-${base}${newStudentSection}` : '');
                        }
                      }}
                      className="input text-xs w-full py-1.5"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[10px] font-bold text-[var(--ink-muted)] mb-1">
                      Student ID (Unique Login ID) *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. STU-1001"
                      value={newStudentId}
                      onChange={(e) => setNewStudentId(e.target.value)}
                      className="input text-xs w-full py-1.5 font-mono font-bold text-blue-600 dark:text-blue-400"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-[var(--ink-muted)] mb-1">
                      Student Login Password *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. pass123"
                      value={newStudentPassword}
                      onChange={(e) => setNewStudentPassword(e.target.value)}
                      className="input text-xs w-full py-1.5 font-mono font-bold text-amber-600 dark:text-amber-400"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsAddingStudent(false)}
                    className="btn btn-secondary text-xs px-3 py-1 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="btn btn-primary text-xs px-4 py-1 font-bold cursor-pointer"
                  >
                    Save Student Account
                  </button>
                </div>
              </form>
            )}

            {/* Inline Reset Password Sub-modal */}
            {resetPwdStudent && (
              <form
                onSubmit={handleResetPassword}
                className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2.5 animate-fade-in"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[var(--ink)] flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-amber-500" />
                    <span>Reset Password for: {resetPwdStudent.name} ({resetPwdStudent.studentId})</span>
                  </span>
                </div>
                <div className="flex flex-col xs:flex-row items-stretch xs:items-center gap-2">
                  <input
                    type="text"
                    required
                    placeholder="Enter new password..."
                    value={resetPwdValue}
                    onChange={(e) => setResetPwdValue(e.target.value)}
                    className="input text-xs flex-1 min-w-0 py-1.5 font-mono font-bold"
                  />
                  <div className="flex items-center gap-2 justify-end shrink-0">
                    <button
                      type="button"
                      onClick={() => setResetPwdStudent(null)}
                      className="btn btn-secondary text-xs px-3 py-1.5 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="btn btn-primary text-xs px-4 py-1.5 font-bold cursor-pointer"
                    >
                      Save Password
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* Inline Edit Student Sub-modal */}
            {editingStudent && (
              <form
                onSubmit={handleSaveStudentEdit}
                className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/30 space-y-2.5 animate-fade-in"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[var(--ink)] flex items-center gap-1.5">
                    <Edit2 className="w-3.5 h-3.5 text-blue-500" />
                    <span>Edit Profile: {editingStudent.name}</span>
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-[var(--ink-muted)] mb-1">Name</label>
                    <input
                      type="text"
                      value={editStudentName}
                      onChange={(e) => setEditStudentName(e.target.value)}
                      className="input text-xs w-full py-1 font-semibold"
                      required
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[10px] font-bold text-[var(--ink-muted)]">Roll No</label>
                      <span className="text-[10px] text-blue-500 font-mono font-bold">
                        {formatRollWithSection(editStudentRoll || '1', editStudentSection)}
                      </span>
                    </div>
                    <input
                      type="text"
                      value={editStudentRoll}
                      onChange={(e) => {
                        const val = e.target.value;
                        setEditStudentRoll(val);
                        const base = val.replace(/[a-zA-Z]+$/, '');
                        if (!editStudentIdVal || editStudentIdVal.startsWith('STD-')) {
                          setEditStudentIdVal(base ? `STD-${base}${editStudentSection}` : '');
                        }
                      }}
                      className="input text-xs w-full py-1 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-[var(--ink-muted)] mb-1">Section</label>
                    <div className="grid grid-cols-2 gap-1 bg-[var(--surface)] border border-[var(--border)] p-0.5 rounded-lg">
                      <button
                        type="button"
                        onClick={() => {
                          setEditStudentSection('A');
                          const base = (editStudentRoll || '1').replace(/[a-zA-Z]+$/, '');
                          if (!editStudentIdVal || editStudentIdVal.startsWith('STD-')) {
                            setEditStudentIdVal(`STD-${base}A`);
                          }
                        }}
                        className={`py-1 text-[11px] font-bold rounded-md transition cursor-pointer ${
                          editStudentSection === 'A'
                            ? 'bg-blue-600 text-white shadow-2xs'
                            : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
                        }`}
                      >
                        Sec A
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditStudentSection('B');
                          const base = (editStudentRoll || '1').replace(/[a-zA-Z]+$/, '');
                          if (!editStudentIdVal || editStudentIdVal.startsWith('STD-')) {
                            setEditStudentIdVal(`STD-${base}B`);
                          }
                        }}
                        className={`py-1 text-[11px] font-bold rounded-md transition cursor-pointer ${
                          editStudentSection === 'B'
                            ? 'bg-blue-600 text-white shadow-2xs'
                            : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
                        }`}
                      >
                        Sec B
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-[var(--ink-muted)] mb-1">Class</label>
                    <select
                      value={editStudentClassId}
                      onChange={(e) => setEditStudentClassId(e.target.value)}
                      className="input text-xs w-full py-1 cursor-pointer"
                    >
                      {classes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} {c.section ? `(${c.section})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setEditingStudent(null)}
                    className="btn btn-secondary text-xs px-3 py-1 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="btn btn-primary text-xs px-4 py-1 font-bold cursor-pointer"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            )}

            {/* Students List Display */}
            {studentsLoading ? (
              <div className="p-8 text-center text-xs text-[var(--ink-muted)]">
                Loading student directory...
              </div>
            ) : filteredStudents.length === 0 ? (
              <div className="p-8 text-center bg-[var(--surface-higher)] border border-dashed border-[var(--border)] rounded-xl text-xs text-[var(--ink-muted)] space-y-1">
                <p className="font-semibold text-[var(--ink)]">No student accounts found.</p>
                <p>Click "+ Add Student" above to register a student login ID and password.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredStudents.map((stu) => {
                  const isPwVisible = !!visiblePasswords[`stu-${stu.id}`];
                  const isConfirmingDelete = confirmDeleteStudentId === stu.id;

                  return (
                    <div
                      key={stu.id}
                      className="p-3 rounded-xl border border-[var(--border)] bg-[var(--surface-higher)] hover:border-blue-500/30 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      {/* Left side: Student Avatar, Name, and Class */}
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-8 h-8 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 flex items-center justify-center font-bold text-xs shrink-0">
                          {stu.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                            <span className="font-bold text-xs sm:text-sm text-[var(--ink)] truncate max-w-full">
                              {stu.name}
                            </span>
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[var(--surface)] text-[var(--ink-muted)] border border-[var(--border)]">
                              {getClassName(stu.classId)}
                            </span>
                            {stu.rollNo && (
                              <span className="text-[10px] font-mono font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded border border-blue-500/20">
                                Roll: {stu.rollNo}
                              </span>
                            )}
                            {/* Section Quick Switcher (A / B) */}
                            <div className="inline-flex items-center p-0.5 rounded-md bg-[var(--surface)] border border-[var(--border)] shadow-2xs">
                              <button
                                type="button"
                                onClick={() => handleQuickSwitchSection(stu, 'A')}
                                className={`px-1.5 py-0.5 text-[9px] font-bold rounded transition cursor-pointer ${
                                  (detectSectionFromRoll(stu.rollNo) || stu.section || 'A') === 'A'
                                    ? 'bg-blue-600 text-white shadow-2xs'
                                    : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
                                }`}
                                title="Switch to Section A"
                              >
                                Sec A
                              </button>
                              <button
                                type="button"
                                onClick={() => handleQuickSwitchSection(stu, 'B')}
                                className={`px-1.5 py-0.5 text-[9px] font-bold rounded transition cursor-pointer ${
                                  (detectSectionFromRoll(stu.rollNo) || stu.section || 'A') === 'B'
                                    ? 'bg-blue-600 text-white shadow-2xs'
                                    : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
                                }`}
                                title="Switch to Section B"
                              >
                                Sec B
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Right side: Student ID pill, Password pill with Eye/Copy, and actions */}
                      <div className="flex flex-wrap items-center gap-2 self-stretch sm:self-center justify-end shrink-0">
                        {/* Student ID Monospace Pill */}
                        <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-xs">
                          <span className="text-[10px] text-[var(--ink-muted)] font-semibold uppercase">ID:</span>
                          <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                            {stu.studentId}
                          </span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(stu.studentId, `stu-id-${stu.id}`)}
                            className="text-[var(--ink-muted)] hover:text-[var(--ink)] ml-1 transition cursor-pointer"
                            title="Copy Student ID"
                          >
                            {copiedKey === `stu-id-${stu.id}` ? (
                              <Check className="w-3 h-3 text-emerald-500" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>

                        {/* Password Monospace Pill with Eye & Copy */}
                        <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-xs">
                          <span className="text-[10px] text-[var(--ink-muted)] font-semibold uppercase">PWD:</span>
                          <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                            {isPwVisible ? (stu.password || '••••') : '••••••'}
                          </span>
                          <button
                            type="button"
                            onClick={() => togglePasswordVisibility(`stu-${stu.id}`)}
                            className="text-[var(--ink-muted)] hover:text-[var(--ink)] ml-1 transition cursor-pointer"
                            title={isPwVisible ? 'Hide Password' : 'Show Password'}
                          >
                            {isPwVisible ? (
                              <EyeOff className="w-3 h-3" />
                            ) : (
                              <Eye className="w-3 h-3" />
                            )}
                          </button>
                          {stu.password && (
                            <button
                              type="button"
                              onClick={() => copyToClipboard(stu.password || '', `stu-pwd-${stu.id}`)}
                              className="text-[var(--ink-muted)] hover:text-[var(--ink)] ml-0.5 transition cursor-pointer"
                              title="Copy Password"
                            >
                              {copiedKey === `stu-pwd-${stu.id}` ? (
                                <Check className="w-3 h-3 text-emerald-500" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          )}
                        </div>

                        {/* Reset Password Button */}
                        <button
                          type="button"
                          onClick={() => {
                            setResetPwdStudent(stu);
                            setResetPwdValue('');
                          }}
                          className="p-1.5 rounded-lg text-[var(--ink-muted)] hover:text-amber-500 hover:bg-amber-500/10 transition cursor-pointer"
                          title="Reset Student Password"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>

                        {/* Edit Profile Button */}
                        <button
                          type="button"
                          onClick={() => {
                            setEditingStudent(stu);
                            setEditStudentName(stu.name);
                            setEditStudentIdVal(stu.studentId);
                            setEditStudentClassId(stu.classId);
                            const sec = detectSectionFromRoll(stu.rollNo) || 'A';
                            setEditStudentSection(sec);
                            setEditStudentRoll(stu.rollNo ? stu.rollNo.replace(/[a-zA-Z]+$/, '') : '');
                          }}
                          className="p-1.5 rounded-lg text-[var(--ink-muted)] hover:text-blue-500 hover:bg-blue-500/10 transition cursor-pointer"
                          title="Edit Student Profile"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        {/* Delete Student Button */}
                        {isConfirmingDelete ? (
                          <div className="flex items-center gap-1 animate-fade-in">
                            <button
                              type="button"
                              onClick={() => handleDeleteStudent(stu.id)}
                              className="px-2 py-1 bg-rose-500 text-white rounded-lg text-[10px] font-bold hover:bg-rose-600 transition cursor-pointer"
                            >
                              Confirm
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteStudentId(null)}
                              className="px-2 py-1 bg-[var(--surface)] text-[var(--ink-muted)] rounded-lg text-[10px] hover:text-[var(--ink)] transition cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteStudentId(stu.id)}
                            className="p-1.5 rounded-lg text-[var(--ink-muted)] hover:text-rose-500 hover:bg-rose-500/10 transition cursor-pointer"
                            title="Delete Student"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* MODAL FOOTER                                              */}
        {/* ========================================================= */}
        <div className="px-3.5 sm:px-5 py-3 border-t border-[var(--border)] flex flex-wrap items-center justify-between gap-2 bg-[var(--surface-higher)] shrink-0">
          <span className="text-[11px] text-[var(--ink-muted)]">
            {activeTab === 'classes'
              ? `${classes.length} academic classes configured`
              : `${students.length} registered student credentials`}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-secondary text-xs px-4 py-1.5 cursor-pointer font-semibold"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
