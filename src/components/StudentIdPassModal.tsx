import React, { useState, useEffect } from 'react';
import {
  X,
  Search,
  Plus,
  Edit2,
  Trash2,
  KeyRound,
  Eye,
  EyeOff,
  Copy,
  Check,
  RotateCcw,
  Printer,
  School,
  Users,
  ShieldCheck,
  AlertCircle,
  GraduationCap,
  ChevronDown,
  Sparkles
} from 'lucide-react';
import { ClassItem, StudentUser } from '../types';
import {
  fetchStudents,
  registerStudent,
  updateStudent,
  resetStudentPassword,
  deleteStudent
} from '../lib/api';
import { printHtml } from '../lib/printService';

export interface StudentCredentialsItem {
  id: string;
  studentId: string;
  rollNo?: string;
  name: string;
  classId: string;
  password?: string;
  createdAt?: string;
}

// Format roll number with section (e.g. roll 1 with Section A -> 1A, Section B -> 1B)
export function formatRollWithSection(rawRoll: string, section: 'A' | 'B' | string): string {
  if (!rawRoll) return '';
  const trimmed = rawRoll.trim();
  if (!trimmed) return '';
  const cleanSec = (section || 'A').toUpperCase();
  // If the user already typed ending letter (e.g. 1a or 1A or 1B)
  if (/[a-zA-Z]$/.test(trimmed)) {
    const numPart = trimmed.replace(/[a-zA-Z]+$/, '');
    return `${numPart}${cleanSec}`;
  }
  return `${trimmed}${cleanSec}`;
}

export function detectSectionFromRoll(rollNo?: string): 'A' | 'B' | null {
  if (!rollNo) return null;
  const upper = rollNo.trim().toUpperCase();
  if (upper.endsWith('A')) return 'A';
  if (upper.endsWith('B')) return 'B';
  return null;
}

interface StudentIdPassModalProps {
  isOpen: boolean;
  onClose: () => void;
  students?: StudentCredentialsItem[];
  classes: ClassItem[];
  initialStudent?: StudentCredentialsItem | null;
  initialClassId?: string;
  onRefreshStudents?: () => void;
}

export const StudentIdPassModal: React.FC<StudentIdPassModalProps> = ({
  isOpen,
  onClose,
  classes,
  initialClassId = 'all',
  onRefreshStudents,
}) => {
  const [studentList, setStudentList] = useState<StudentUser[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedClassId, setSelectedClassId] = useState<string>(initialClassId || 'all');
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Editable School Name
  const [schoolName, setSchoolName] = useState<string>(() => {
    return localStorage.getItem('academic_institution_name') || 'ACADEMIC ASSESSMENT & EXAMINATION BOARD';
  });
  const [academicSession, setAcademicSession] = useState<string>('Academic Session 2026–2027');

  // Notices & Errors
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Add Student State
  const [isAddOpen, setIsAddOpen] = useState<boolean>(false);
  const [newName, setNewName] = useState<string>('');
  const [newRollNo, setNewRollNo] = useState<string>('');
  const [newSection, setNewSection] = useState<'A' | 'B'>('A');
  const [newClassId, setNewClassId] = useState<string>(classes[0]?.id || 'grade-9');
  const [newStudentId, setNewStudentId] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('password');

  // Section Filter
  const [selectedSectionFilter, setSelectedSectionFilter] = useState<'all' | 'A' | 'B'>('all');

  // Batch Generation State
  const [isBatchOpen, setIsBatchOpen] = useState<boolean>(false);
  const [batchClassId, setBatchClassId] = useState<string>(classes[0]?.id || 'grade-9');
  const [batchSection, setBatchSection] = useState<'A' | 'B'>('A');
  const [batchStartRoll, setBatchStartRoll] = useState<number>(1);
  const [batchEndRoll, setBatchEndRoll] = useState<number>(25);
  const [batchDefaultPassword, setBatchDefaultPassword] = useState<string>('password');
  const [isGeneratingBatch, setIsGeneratingBatch] = useState<boolean>(false);

  // Edit Student State
  const [editingStudent, setEditingStudent] = useState<StudentUser | null>(null);
  const [editName, setEditName] = useState<string>('');
  const [editRollNo, setEditRollNo] = useState<string>('');
  const [editSection, setEditSection] = useState<'A' | 'B'>('A');
  const [editClassId, setEditClassId] = useState<string>('');
  const [editStudentId, setEditStudentId] = useState<string>('');
  const [editPassword, setEditPassword] = useState<string>('');

  // Reset Password State
  const [resetModalStudent, setResetModalStudent] = useState<StudentUser | null>(null);
  const [customResetPassword, setCustomResetPassword] = useState<string>('');

  // Delete Confirm State
  const [deleteModalStudent, setDeleteModalStudent] = useState<StudentUser | null>(null);

  // Load students from database
  const loadStudents = async () => {
    setIsLoading(true);
    try {
      const data = await fetchStudents();
      setStudentList(data);
    } catch (err: any) {
      console.error('Failed to load student directory:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadStudents();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSchoolNameChange = (val: string) => {
    setSchoolName(val);
    try {
      localStorage.setItem('academic_institution_name', val);
    } catch {}
  };

  const getClassName = (clsId: string) => {
    if (!clsId) return 'Grade 9';
    const found = classes.find(
      (c) =>
        c.id === clsId ||
        c.id.toLowerCase() === clsId.toLowerCase() ||
        c.name.toLowerCase() === clsId.toLowerCase()
    );
    if (found) return found.name;
    // Format slugs like "grade-9" -> "Grade 9", "class-10" -> "Class 10"
    return clsId
      .split(/[-_]/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  };

  const togglePasswordVisibility = (id: string) => {
    setVisiblePasswords((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleCopyCredentials = (stu: StudentUser) => {
    const text = `Student: ${stu.name}\nRoll No: ${stu.rollNo || 'N/A'}\nRegistration ID: ${stu.studentId}\nClass: ${getClassName(stu.classId)}\nPassword: ${stu.password || 'password'}`;
    navigator.clipboard.writeText(text);
    setCopiedId(stu.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Add Student Handler
  const handleAddStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) {
      setActionError('Student full name is required.');
      return;
    }

    const effectiveRoll = formatRollWithSection(newRollNo.trim() || '1', newSection);
    const effectiveId = newStudentId.trim() || (effectiveRoll ? `STD-${effectiveRoll}` : `STU-${Date.now().toString().slice(-4)}`);

    try {
      await registerStudent({
        studentId: effectiveId,
        rollNo: effectiveRoll,
        name: newName.trim(),
        classId: newClassId,
        password: newPassword.trim() || 'password',
      });
      setNewName('');
      setNewRollNo('');
      setNewStudentId('');
      setNewPassword('password');
      setIsAddOpen(false);
      setActionError(null);
      setActionNotice(`Student account "${newName.trim()}" (Roll #${effectiveRoll}) created successfully.`);
      setTimeout(() => setActionNotice(null), 3500);
      loadStudents();
      onRefreshStudents && onRefreshStudents();
    } catch (err: any) {
      setActionError(err.message || 'Failed to create student account');
    }
  };

  // Quick Section Change Handler directly from table
  const handleQuickChangeSection = async (stu: StudentUser, targetSection: 'A' | 'B') => {
    const currentSec = detectSectionFromRoll(stu.rollNo) || 'A';
    if (currentSec === targetSection) return;

    const numPart = (stu.rollNo || '1').replace(/[a-zA-Z]+$/, '').trim() || '1';
    const newRoll = `${numPart}${targetSection}`;
    let newStudentId = stu.studentId;
    if (newStudentId.startsWith('STD-')) {
      newStudentId = `STD-${newRoll}`;
    }

    // Optimistic local update
    setStudentList((prev) =>
      prev.map((s) =>
        s.id === stu.id
          ? { ...s, rollNo: newRoll, studentId: newStudentId }
          : s
      )
    );
    setActionNotice(`Switched ${stu.name} to Section ${targetSection} (Roll #${newRoll}).`);
    setTimeout(() => setActionNotice(null), 3000);

    try {
      await updateStudent(stu.id, {
        section: targetSection,
        rollNo: newRoll,
        studentId: newStudentId,
        name: stu.name,
        classId: stu.classId,
      });
      onRefreshStudents && onRefreshStudents();
    } catch (err: any) {
      setActionError(`Failed to update section: ${err.message || 'Error'}`);
      loadStudents();
    }
  };

  // Edit Student Handler
  const handleStartEdit = (stu: StudentUser) => {
    setEditingStudent(stu);
    setEditName(stu.name);
    const detected = (stu.section as 'A' | 'B') || detectSectionFromRoll(stu.rollNo) || 'A';
    setEditSection(detected);
    setEditRollNo(stu.rollNo ? stu.rollNo.replace(/[a-zA-Z]+$/, '') : '');
    setEditClassId(stu.classId);
    setEditStudentId(stu.studentId);
    setEditPassword(stu.password || '');
  };

  const handleUpdateStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;

    const formattedRoll = formatRollWithSection(editRollNo.trim() || '1', editSection);
    let finalStudentId = editStudentId.trim();
    if (!finalStudentId || finalStudentId.startsWith('STD-')) {
      finalStudentId = `STD-${formattedRoll}`;
    }

    try {
      await updateStudent(editingStudent.id, {
        name: editName.trim(),
        rollNo: formattedRoll,
        section: editSection,
        classId: editClassId,
        studentId: finalStudentId,
        password: editPassword.trim() || undefined,
      });
      setEditingStudent(null);
      setActionError(null);
      setActionNotice(`Student account updated successfully (Roll #${formattedRoll}).`);
      setTimeout(() => setActionNotice(null), 3500);
      loadStudents();
      onRefreshStudents && onRefreshStudents();
    } catch (err: any) {
      setActionError(err.message || 'Failed to update student');
    }
  };

  // Reset Password Handler
  const handleConfirmResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetModalStudent) return;
    try {
      const targetPwd = customResetPassword.trim() || 'password';
      await resetStudentPassword(resetModalStudent.id, targetPwd);
      setActionError(null);
      setActionNotice(`Password for ${resetModalStudent.name} updated to: ${targetPwd}`);
      setResetModalStudent(null);
      setCustomResetPassword('');
      setTimeout(() => setActionNotice(null), 4000);
      loadStudents();
      onRefreshStudents && onRefreshStudents();
    } catch (err: any) {
      setActionError(err.message || 'Failed to reset password');
    }
  };

  // Delete Student Handler
  const handleConfirmDelete = async () => {
    if (!deleteModalStudent) return;
    try {
      await deleteStudent(deleteModalStudent.id);
      setActionError(null);
      setActionNotice(`Student "${deleteModalStudent.name}" removed successfully.`);
      setDeleteModalStudent(null);
      setTimeout(() => setActionNotice(null), 4000);
      loadStudents();
      onRefreshStudents && onRefreshStudents();
    } catch (err: any) {
      setActionError(err.message || 'Failed to delete student');
    }
  };

  // Batch Generate Students Handler
  const handleBatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const start = Math.max(1, batchStartRoll);
    const end = Math.max(start, batchEndRoll);
    const count = end - start + 1;
    if (count > 100) {
      setActionError('Cannot generate more than 100 accounts in one batch.');
      return;
    }

    setIsGeneratingBatch(true);
    setActionError(null);
    let createdCount = 0;

    try {
      for (let r = start; r <= end; r++) {
        const rollWithSec = `${r}${batchSection}`;
        const studentId = `STD-${rollWithSec}`;
        try {
          await registerStudent({
            studentId,
            rollNo: rollWithSec,
            name: `Student ${rollWithSec}`,
            classId: batchClassId,
            password: batchDefaultPassword.trim() || 'password',
          });
          createdCount++;
        } catch (err: any) {
          console.warn(`Student ${rollWithSec} could not be created or already exists:`, err?.message);
        }
      }

      setIsBatchOpen(false);
      setActionNotice(
        `Generated ${createdCount} accounts for Class ${getClassName(batchClassId)} (Section ${batchSection}, Rolls ${start}${batchSection} to ${end}${batchSection}).`
      );
      setTimeout(() => setActionNotice(null), 5000);
      loadStudents();
      onRefreshStudents && onRefreshStudents();
    } catch (err: any) {
      setActionError(err.message || 'Batch generation encountered an error');
    } finally {
      setIsGeneratingBatch(false);
    }
  };

  // Filter students
  const filteredStudents = studentList.filter((s) => {
    if (selectedClassId !== 'all' && s.classId !== selectedClassId) return false;
    if (selectedSectionFilter !== 'all') {
      const sec = detectSectionFromRoll(s.rollNo);
      if (sec !== selectedSectionFilter) return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      return (
        s.name.toLowerCase().includes(q) ||
        s.studentId.toLowerCase().includes(q) ||
        (s.rollNo && s.rollNo.toLowerCase().includes(q)) ||
        (s.password && s.password.toLowerCase().includes(q))
      );
    }
    return true;
  });

  // Clean Tabular Print Handler (No bloated design, proper information table)
  const handlePrintTable = () => {
    const classLabel = selectedClassId === 'all' ? 'All Classes' : getClassName(selectedClassId);

    const rowsHtml = filteredStudents
      .map(
        (stu, idx) => `
        <tr>
          <td style="text-align: center; font-weight: bold; width: 55px;">${stu.rollNo || idx + 1}</td>
          <td style="text-align: center; font-weight: bold; width: 65px;">${detectSectionFromRoll(stu.rollNo) ? `Sec ${detectSectionFromRoll(stu.rollNo)}` : '-'}</td>
          <td style="font-weight: 600;">${stu.name}</td>
          <td style="text-align: center;">${getClassName(stu.classId)}</td>
          <td style="text-align: center; font-family: monospace; font-weight: bold;">${stu.studentId}</td>
          <td style="text-align: center; font-family: monospace; font-weight: bold; letter-spacing: 1px;">${stu.password || 'password'}</td>
        </tr>
      `
      )
      .join('');

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Student ID & Passwords Sheet - ${schoolName}</title>
        <meta charset="utf-8" />
        <style>
          @page {
            size: A4 portrait;
            margin: 15mm 12mm 15mm 12mm;
          }
          body {
            font-family: Arial, Helvetica, sans-serif;
            color: #000;
            background: #fff;
            margin: 0;
            padding: 10px;
          }
          .header-box {
            text-align: center;
            border-bottom: 2px solid #000;
            padding-bottom: 12px;
            margin-bottom: 15px;
          }
          .school-title {
            font-size: 20px;
            font-weight: 900;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin: 0 0 4px 0;
          }
          .sub-title {
            font-size: 13px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin: 0 0 6px 0;
            color: #333;
          }
          .meta-info {
            display: flex;
            justify-content: space-between;
            font-size: 11px;
            font-weight: 600;
            margin-top: 8px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 11px;
            margin-top: 10px;
          }
          th {
            background-color: #f0f0f0;
            color: #000;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            border: 1px solid #000;
            padding: 8px 6px;
            font-size: 10px;
          }
          td {
            border: 1px solid #333;
            padding: 6px 8px;
          }
          tr:nth-child(even) {
            background-color: #fafafa;
          }
          .footer-signs {
            display: flex;
            justify-content: space-between;
            margin-top: 40px;
            font-size: 11px;
            font-weight: bold;
          }
          .sign-line {
            width: 160px;
            border-top: 1px solid #000;
            text-align: center;
            padding-top: 4px;
          }
          @media print {
            body { padding: 0; }
            th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
        </style>
      </head>
      <body>
        <div class="header-box">
          <div class="school-title">${schoolName}</div>
          <div class="sub-title">Student Credentials & Examination Passes Register</div>
          <div class="meta-info">
            <div>Target Class: <strong>${classLabel}</strong></div>
            <div>Academic Session: <strong>${academicSession}</strong></div>
            <div>Total Students: <strong>${filteredStudents.length}</strong></div>
            <div>Date: <strong>${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</strong></div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 55px;">Roll No</th>
              <th style="width: 65px;">Section</th>
              <th style="text-align: left;">Student Full Name</th>
              <th style="width: 110px;">Class Grade</th>
              <th style="width: 130px;">Registration ID</th>
              <th style="width: 120px;">Password</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || '<tr><td colspan="6" style="text-align: center; padding: 20px;">No students found for this class.</td></tr>'}
          </tbody>
        </table>

        <div class="footer-signs">
          <div class="sign-line">Class Teacher Signature</div>
          <div class="sign-line">Exam Coordinator</div>
          <div class="sign-line">Principal / Headmaster</div>
        </div>

        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </body>
      </html>
    `;

    printHtml(htmlContent, {
      title: `Student Credentials - ${schoolName}`,
      fallbackFilename: `Student_Credentials_${(schoolName || 'School').replace(/[^a-zA-Z0-9]/g, '_')}.html`,
    });
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-sm flex items-center justify-center p-2.5 sm:p-5 animate-in fade-in duration-200">
      <div
        id="student-id-directory-modal"
        className="bg-[var(--surface)] text-[var(--ink)] border border-[var(--border)] rounded-2xl sm:rounded-3xl w-full max-w-5xl xl:max-w-6xl 2xl:max-w-7xl overflow-hidden flex flex-col max-h-[92vh] shadow-2xl transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative bg-[var(--surface-higher)] text-[var(--ink)] px-3.5 sm:px-6 py-3 sm:py-4 flex flex-col md:flex-row md:items-center justify-between border-b border-[var(--border)] shrink-0 gap-3">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 pr-12 md:pr-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-600 dark:text-purple-400 shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-bold text-xs sm:text-base text-[var(--ink)] truncate">
                  Student ID &amp; Credentials Directory
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/20 font-bold shrink-0">
                  {filteredStudents.length} Students
                </span>
              </div>
              <p className="text-[10px] sm:text-[11px] text-[var(--ink-muted)] truncate">
                View Roll No, Name, Registration, Password, and manage student accounts
              </p>
            </div>
          </div>

          {/* School Name Editable Header & Actions */}
          <div className="flex items-center gap-2 flex-wrap w-full md:w-auto">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] shadow-2xs flex-1 min-w-0 xs:min-w-[160px] sm:flex-none">
              <School className="w-3.5 h-3.5 text-purple-500 shrink-0" />
              <input
                type="text"
                value={schoolName}
                onChange={(e) => handleSchoolNameChange(e.target.value)}
                placeholder="Institution / School Name"
                className="bg-transparent text-xs font-semibold text-[var(--ink)] outline-none w-full sm:w-56 truncate focus:w-full sm:focus:w-72 transition-all"
                title="Click to edit school name. Changes are saved automatically."
              />
            </div>

            <button
              type="button"
              onClick={handlePrintTable}
              className="btn btn-primary px-3 sm:px-4 py-2 min-h-[38px] text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs shrink-0"
              title="Print clean table with School Name, Roll No, Name, Registration, and Password"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Table</span>
            </button>

            <button
              onClick={onClose}
              className="absolute top-3 right-3.5 md:static p-2 min-h-[38px] min-w-[38px] flex items-center justify-center bg-[var(--surface)] hover:bg-[var(--surface-higher)] text-[var(--ink-muted)] hover:text-[var(--ink)] border border-[var(--border)] rounded-xl transition cursor-pointer shrink-0 shadow-xs"
              title="Close Dialog"
            >
              <X className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>

        {/* Notices */}
        {actionNotice && (
          <div className="mx-3.5 sm:mx-6 mt-3 sm:mt-4 p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 rounded-xl text-xs font-semibold flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>{actionNotice}</span>
          </div>
        )}

        {actionError && (
          <div className="mx-3.5 sm:mx-6 mt-3 sm:mt-4 p-3 bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 rounded-xl text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{actionError}</span>
          </div>
        )}

        {/* Search, Filter & Add Student Bar */}
        <div className="p-3.5 sm:p-6 pb-2 space-y-3">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2.5">
            {/* Search */}
            <div className="relative flex-1 min-w-0">
              <Search className="w-4 h-4 text-[var(--ink-muted)] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by Roll No, Student Name, Registration ID, or Password..."
                className="w-full pl-10 pr-3 py-2 bg-[var(--surface-higher)] border border-[var(--border)] focus:border-purple-500 text-xs sm:text-sm text-[var(--ink)] outline-none rounded-xl transition shadow-2xs"
              />
            </div>

            {/* Filter & Action Controls - Responsive wrapping */}
            <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
              {/* Class Filter */}
              <div className="relative flex items-center flex-1 sm:flex-none min-w-0 xs:min-w-[140px]">
                <GraduationCap className="w-3.5 h-3.5 text-purple-500 absolute left-3 pointer-events-none" />
                <select
                  value={selectedClassId}
                  onChange={(e) => setSelectedClassId(e.target.value)}
                  className="w-full pl-8.5 pr-8 py-2 rounded-xl bg-[var(--surface-higher)] border border-[var(--border)] focus:border-purple-500 text-xs font-semibold text-[var(--ink)] outline-none cursor-pointer transition shadow-2xs appearance-none"
                  aria-label="Filter by Class Grade"
                >
                  <option value="all">All Classes ({studentList.length})</option>
                  {classes.map((cls) => {
                    const count = studentList.filter((s) => s.classId === cls.id).length;
                    return (
                      <option key={cls.id} value={cls.id}>
                        {cls.name} ({count})
                      </option>
                    );
                  })}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-[var(--ink-muted)] absolute right-2.5 pointer-events-none" />
              </div>

              {/* Section Filter */}
              <div className="flex items-center bg-[var(--surface-higher)] p-1 rounded-xl border border-[var(--border)] gap-0.5 text-xs">
                {(['all', 'A', 'B'] as const).map((sec) => (
                  <button
                    key={sec}
                    type="button"
                    onClick={() => setSelectedSectionFilter(sec)}
                    className={`px-2.5 py-1 min-h-[30px] rounded-lg font-bold text-[11px] transition cursor-pointer ${
                      selectedSectionFilter === sec
                        ? 'bg-purple-600 text-white shadow-2xs'
                        : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
                    }`}
                  >
                    {sec === 'all' ? 'All Sec' : `Sec ${sec}`}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={loadStudents}
                className="p-2 min-h-[36px] min-w-[36px] flex items-center justify-center border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-higher)] text-[var(--ink)] rounded-xl transition cursor-pointer shadow-2xs"
                title="Reload Directory"
              >
                <RotateCcw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              </button>

              <button
                type="button"
                onClick={() => setIsBatchOpen(true)}
                className="flex-1 sm:flex-none px-3 py-2 min-h-[36px] border border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 cursor-pointer shadow-xs whitespace-nowrap transition"
                title="Batch generate student accounts for Section A or Section B"
              >
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                <span>Batch (Sec A/B)</span>
              </button>

              <button
                type="button"
                onClick={() => setIsAddOpen(!isAddOpen)}
                className="flex-1 sm:flex-none btn btn-primary px-3 sm:px-4 py-2 min-h-[36px] text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 cursor-pointer shadow-xs whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5 shrink-0" />
                <span>{isAddOpen ? 'Close' : 'Add Student'}</span>
              </button>
            </div>
          </div>

          {/* Add Student Form (Collapsible) */}
          {isAddOpen && (
            <form
              onSubmit={handleAddStudentSubmit}
              className="p-4 bg-[var(--surface-higher)] border border-purple-500/30 rounded-2xl space-y-3.5 animate-in fade-in"
            >
              <div className="flex items-center justify-between pb-2 border-b border-[var(--border)]">
                <h4 className="font-bold text-xs uppercase tracking-wider text-purple-600 dark:text-purple-400 flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5" /> Create New Student Account
                </h4>
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="text-xs text-[var(--ink-muted)] hover:text-[var(--ink)]"
                >
                  Cancel
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-[var(--ink)] block">
                    Roll Number
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 1 or 15"
                    value={newRollNo}
                    onChange={(e) => {
                      const val = e.target.value;
                      setNewRollNo(val);
                      const base = val.replace(/[a-zA-Z]+$/, '');
                      if (!newStudentId || newStudentId.startsWith('STD-')) {
                        setNewStudentId(base ? `STD-${base}${newSection}` : '');
                      }
                    }}
                    className="w-full px-3 py-2 bg-[var(--surface)] border border-[var(--border)] focus:border-purple-500 text-xs text-[var(--ink)] rounded-xl outline-none font-mono"
                  />
                  <span className="text-[10px] text-purple-600 dark:text-purple-400 font-mono block">
                    Saved as: <strong>{formatRollWithSection(newRollNo || '1', newSection)}</strong>
                  </span>
                </div>

                <div className="space-y-1 lg:col-span-2">
                  <label className="text-[11px] font-semibold text-[var(--ink)] block">Full Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Aarav Sharma"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full px-3 py-2 bg-[var(--surface)] border border-[var(--border)] focus:border-purple-500 text-xs text-[var(--ink)] rounded-xl outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-[var(--ink)] flex items-center gap-1">
                    <GraduationCap className="w-3 h-3 text-purple-500" />
                    <span>Class Grade</span>
                  </label>
                  <select
                    value={newClassId}
                    onChange={(e) => setNewClassId(e.target.value)}
                    className="w-full px-3 py-2 bg-[var(--surface)] border border-[var(--border)] focus:border-purple-500 text-xs text-[var(--ink)] rounded-xl outline-none cursor-pointer"
                  >
                    {classes.map((cls) => (
                      <option key={cls.id} value={cls.id}>
                        {cls.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-[var(--ink)] block">
                    Section (under Class)
                  </label>
                  <div className="grid grid-cols-2 gap-1 bg-[var(--surface)] border border-[var(--border)] p-1 rounded-xl">
                    <button
                      type="button"
                      onClick={() => {
                        setNewSection('A');
                        const base = (newRollNo || '1').replace(/[a-zA-Z]+$/, '');
                        if (!newStudentId || newStudentId.startsWith('STD-')) {
                          setNewStudentId(`STD-${base}A`);
                        }
                      }}
                      className={`py-1 text-xs font-bold rounded-lg transition cursor-pointer ${
                        newSection === 'A'
                          ? 'bg-purple-600 text-white shadow-2xs'
                          : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
                      }`}
                    >
                      Sec A
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setNewSection('B');
                        const base = (newRollNo || '1').replace(/[a-zA-Z]+$/, '');
                        if (!newStudentId || newStudentId.startsWith('STD-')) {
                          setNewStudentId(`STD-${base}B`);
                        }
                      }}
                      className={`py-1 text-xs font-bold rounded-lg transition cursor-pointer ${
                        newSection === 'B'
                          ? 'bg-purple-600 text-white shadow-2xs'
                          : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
                      }`}
                    >
                      Sec B
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-[var(--ink)] block">Password</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3 py-2 bg-[var(--surface)] border border-[var(--border)] focus:border-purple-500 text-xs text-[var(--ink)] rounded-xl outline-none font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="submit"
                  className="btn btn-primary px-5 py-2 text-xs font-bold rounded-xl cursor-pointer"
                >
                  Create Student
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Students Table */}
        <div className="flex-1 overflow-y-auto px-3 sm:px-6 pb-4 sm:pb-6">
          <div className="border border-[var(--border)] rounded-2xl overflow-hidden bg-[var(--surface)] shadow-xs">
            {isLoading ? (
              <div className="p-12 text-center text-xs text-[var(--ink-muted)] space-y-2 font-mono">
                <RotateCcw className="w-5 h-5 animate-spin mx-auto text-purple-500" />
                <p>Loading student directory...</p>
              </div>
            ) : filteredStudents.length === 0 ? (
              <div className="p-12 text-center text-xs text-[var(--ink-muted)] space-y-2">
                <Users className="w-6 h-6 mx-auto text-[var(--ink-muted)]" />
                <p>No student accounts found matching your query.</p>
              </div>
            ) : (
              <>
                {/* Mobile & Portrait Tablet View: High-clarity touch-friendly student cards */}
                <div className="block lg:hidden space-y-3 p-3">
                  {filteredStudents.map((stu) => {
                    const isPwdVisible = visiblePasswords[stu.id] || false;
                    const pwd = stu.password || 'password';
                    const isCopied = copiedId === stu.id;
                    const currentSec = detectSectionFromRoll(stu.rollNo) || 'A';

                    return (
                      <div
                        key={stu.id}
                        className="p-3.5 rounded-2xl border border-[var(--border)] bg-[var(--surface-higher)] shadow-2xs space-y-3"
                      >
                        {/* Top: Avatar, Name, Roll No & Section Switcher */}
                        <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-[var(--border)]">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold text-xs shrink-0 border border-purple-500/20">
                              {stu.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <h4 className="font-bold text-xs text-[var(--ink)] truncate">
                                {stu.name}
                              </h4>
                              <div className="flex items-center gap-1.5 text-[10px] text-[var(--ink-muted)] mt-0.5">
                                <span className="font-mono font-bold text-purple-600 dark:text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded-md border border-purple-500/20">
                                  Roll {stu.rollNo || '-'}
                                </span>
                                <span>·</span>
                                <span className="truncate">{getClassName(stu.classId)}</span>
                              </div>
                            </div>
                          </div>

                          {/* Quick Section Switcher */}
                          <div className="inline-flex items-center p-0.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] shadow-2xs shrink-0">
                            <button
                              type="button"
                              onClick={() => handleQuickChangeSection(stu, 'A')}
                              className={`px-2 py-1 text-[10px] font-bold rounded-md transition cursor-pointer min-h-[28px] ${
                                currentSec === 'A'
                                  ? 'bg-purple-600 text-white shadow-2xs'
                                  : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
                              }`}
                            >
                              Sec A
                            </button>
                            <button
                              type="button"
                              onClick={() => handleQuickChangeSection(stu, 'B')}
                              className={`px-2 py-1 text-[10px] font-bold rounded-md transition cursor-pointer min-h-[28px] ${
                                currentSec === 'B'
                                  ? 'bg-purple-600 text-white shadow-2xs'
                                  : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
                              }`}
                            >
                              Sec B
                            </button>
                          </div>
                        </div>

                        {/* Middle: Monospace Credentials (ID & Password) */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                          {/* Student ID */}
                          <div className="flex items-center justify-between p-2 rounded-xl bg-[var(--surface)] border border-[var(--border)]">
                            <div className="min-w-0">
                              <span className="text-[9px] uppercase font-bold text-[var(--ink-muted)] block">
                                Student ID
                              </span>
                              <span className="font-mono font-bold text-xs text-[var(--ink)] truncate block">
                                {stu.studentId}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleCopyCredentials(stu)}
                              className="p-2 min-h-[36px] min-w-[36px] flex items-center justify-center text-[var(--ink-muted)] hover:text-purple-500 transition cursor-pointer shrink-0"
                              title="Copy ID"
                            >
                              {isCopied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                            </button>
                          </div>

                          {/* Password */}
                          <div className="flex items-center justify-between p-2 rounded-xl bg-[var(--surface)] border border-[var(--border)]">
                            <div className="min-w-0">
                              <span className="text-[9px] uppercase font-bold text-[var(--ink-muted)] block">
                                Password
                              </span>
                              <span className="font-mono font-bold text-xs text-[var(--ink)] truncate block">
                                {isPwdVisible ? pwd : '••••••••'}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => togglePasswordVisibility(stu.id)}
                                className="p-2 min-h-[36px] min-w-[36px] flex items-center justify-center text-[var(--ink-muted)] hover:text-[var(--ink)] transition cursor-pointer"
                                title={isPwdVisible ? 'Hide password' : 'Show password'}
                              >
                                {isPwdVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(pwd);
                                  setCopiedId(stu.id);
                                  setTimeout(() => setCopiedId(null), 2000);
                                }}
                                className="p-2 min-h-[36px] min-w-[36px] flex items-center justify-center text-[var(--ink-muted)] hover:text-purple-500 transition cursor-pointer"
                                title="Copy password"
                              >
                                {isCopied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Actions Footer */}
                        <div className="flex flex-wrap items-center justify-end gap-1.5 pt-1">
                          <button
                            type="button"
                            onClick={() => handleStartEdit(stu)}
                            className="flex-1 min-h-[36px] py-1.5 px-2.5 rounded-xl bg-[var(--surface)] hover:bg-[var(--surface-highest)] text-[var(--ink)] border border-[var(--border)] text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5 shrink-0" />
                            <span>Edit</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setResetModalStudent(stu);
                              setCustomResetPassword('');
                            }}
                            className="flex-1 min-h-[36px] py-1.5 px-2.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 border border-purple-500/20 text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap"
                          >
                            <KeyRound className="w-3.5 h-3.5 shrink-0" />
                            <span>Reset Pass</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setDeleteModalStudent(stu)}
                            className="min-h-[36px] min-w-[36px] p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border border-rose-500/20 flex items-center justify-center transition cursor-pointer shrink-0"
                            title="Delete Student"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop View: Full Table */}
                <div className="hidden lg:block overflow-x-auto">
                  <table className="w-full text-left text-xs min-w-[700px]">
                    <thead className="bg-[var(--surface-higher)] border-b border-[var(--border)] text-[var(--ink-muted)] font-mono font-bold uppercase text-[10px] tracking-wider">
                      <tr>
                        <th className="py-3.5 px-4 w-20 text-center">Roll No</th>
                        <th className="py-3.5 px-3 w-28 text-center">Section</th>
                        <th className="py-3.5 px-4 min-w-[150px]">Student Name</th>
                        <th className="py-3.5 px-4 min-w-[140px] whitespace-nowrap">Class Grade</th>
                        <th className="py-3.5 px-4 min-w-[140px]">Registration ID</th>
                        <th className="py-3.5 px-4 min-w-[170px]">Password</th>
                        <th className="py-3.5 px-4 text-right min-w-[150px]">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)] font-sans">
                      {filteredStudents.map((stu) => {
                        const isPwdVisible = visiblePasswords[stu.id] || false;
                        const pwd = stu.password || 'password';
                        const isCopied = copiedId === stu.id;
                        const currentSec = detectSectionFromRoll(stu.rollNo) || 'A';

                        return (
                          <tr
                            key={stu.id}
                            className="hover:bg-[var(--surface-higher)] transition-colors duration-150"
                          >
                            {/* Roll No */}
                            <td className="py-3.5 px-4 text-center font-mono font-bold text-xs text-purple-600 dark:text-purple-400 whitespace-nowrap">
                              <span className="inline-block px-2 py-0.5 rounded-md bg-purple-500/10 border border-purple-500/20">
                                {stu.rollNo || '-'}
                              </span>
                            </td>

                            {/* Section Quick Switcher */}
                            <td className="py-3.5 px-3 text-center whitespace-nowrap">
                              <div className="inline-flex items-center p-0.5 rounded-lg bg-[var(--surface-higher)] border border-[var(--border)] shadow-2xs">
                                <button
                                  type="button"
                                  onClick={() => handleQuickChangeSection(stu, 'A')}
                                  className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition cursor-pointer ${
                                    currentSec === 'A'
                                      ? 'bg-purple-600 text-white shadow-2xs'
                                      : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
                                  }`}
                                  title="Switch to Section A"
                                >
                                  Sec A
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleQuickChangeSection(stu, 'B')}
                                  className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition cursor-pointer ${
                                    currentSec === 'B'
                                      ? 'bg-purple-600 text-white shadow-2xs'
                                      : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
                                  }`}
                                  title="Switch to Section B"
                                >
                                  Sec B
                                </button>
                              </div>
                            </td>

                            {/* Name */}
                            <td className="py-3.5 px-4 font-bold text-[var(--ink)] text-xs">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-purple-500/20 to-blue-500/20 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold text-[11px] shrink-0 border border-purple-500/20">
                                  {stu.name.charAt(0).toUpperCase()}
                                </div>
                                <span className="truncate max-w-[180px]">{stu.name}</span>
                              </div>
                            </td>

                            {/* Class Grade */}
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/25 text-xs font-semibold shadow-2xs">
                                <GraduationCap className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                                <span>{getClassName(stu.classId)}</span>
                              </span>
                            </td>

                            {/* Registration ID */}
                            <td className="py-3 px-4 font-mono font-semibold text-[var(--ink)]">
                              {stu.studentId}
                            </td>

                            {/* Password with Eye & Copy */}
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-1.5 font-mono">
                                <span className="bg-[var(--surface-higher)] border border-[var(--border)] px-2.5 py-1 rounded-lg text-xs font-semibold text-[var(--ink)] tracking-wider">
                                  {isPwdVisible ? pwd : '••••••••'}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => togglePasswordVisibility(stu.id)}
                                  className="p-1 text-[var(--ink-muted)] hover:text-[var(--ink)] transition cursor-pointer"
                                  title={isPwdVisible ? 'Hide password' : 'Show password'}
                                >
                                  {isPwdVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleCopyCredentials(stu)}
                                  className="p-1 text-[var(--ink-muted)] hover:text-purple-500 transition cursor-pointer"
                                  title="Copy login credentials"
                                >
                                  {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                                </button>
                              </div>
                            </td>

                            {/* Actions */}
                            <td className="py-3 px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleStartEdit(stu)}
                                  className="p-1.5 rounded-lg hover:bg-[var(--surface-higher)] text-[var(--ink-muted)] hover:text-[var(--ink)] border border-transparent hover:border-[var(--border)] transition cursor-pointer"
                                  title="Edit student details"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setResetModalStudent(stu);
                                    setCustomResetPassword('');
                                  }}
                                  className="p-1.5 rounded-lg hover:bg-purple-500/10 text-[var(--ink-muted)] hover:text-purple-500 border border-transparent hover:border-purple-500/20 transition cursor-pointer"
                                  title="Reset student password"
                                >
                                  <KeyRound className="w-3.5 h-3.5" />
                                </button>

                                <button
                                  type="button"
                                  onClick={() => setDeleteModalStudent(stu)}
                                  className="p-1.5 rounded-lg hover:bg-rose-500/10 text-[var(--ink-muted)] hover:text-rose-500 border border-transparent hover:border-rose-500/20 transition cursor-pointer"
                                  title="Delete student"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-[var(--surface-higher)] px-4 sm:px-6 py-3 border-t border-[var(--border)] flex items-center justify-between text-xs text-[var(--ink-muted)] shrink-0">
          <div>
            Showing <strong className="text-[var(--ink)]">{filteredStudents.length}</strong> of {studentList.length} students
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-higher)] rounded-xl text-xs font-semibold text-[var(--ink)] transition cursor-pointer shadow-xs"
          >
            Close
          </button>
        </div>
      </div>

      {/* EDIT STUDENT MODAL */}
      {editingStudent && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-2.5 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl sm:rounded-3xl max-w-md w-full max-h-[92vh] overflow-y-auto p-4 sm:p-6 space-y-4 shadow-2xl text-[var(--ink)]">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--border)]">
              <h3 className="font-bold text-sm text-[var(--ink)] flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-purple-500" /> Edit Student Account
              </h3>
              <button
                type="button"
                onClick={() => setEditingStudent(null)}
                className="text-[var(--ink-muted)] hover:text-[var(--ink)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateStudentSubmit} className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--ink)] block">Roll Number</label>
                <input
                  type="text"
                  value={editRollNo}
                  onChange={(e) => {
                    const val = e.target.value;
                    setEditRollNo(val);
                    const base = val.replace(/[a-zA-Z]+$/, '');
                    if (!editStudentId || editStudentId.startsWith('STD-')) {
                      setEditStudentId(base ? `STD-${base}${editSection}` : '');
                    }
                  }}
                  className="w-full px-3 py-2 bg-[var(--surface-higher)] border border-[var(--border)] rounded-xl text-xs text-[var(--ink)] outline-none font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--ink)] block">Full Name</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--surface-higher)] border border-[var(--border)] rounded-xl text-xs text-[var(--ink)] outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--ink)] flex items-center gap-1.5">
                  <GraduationCap className="w-3.5 h-3.5 text-purple-500" />
                  <span>Class Grade</span>
                </label>
                <select
                  value={editClassId}
                  onChange={(e) => setEditClassId(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--surface-higher)] border border-[var(--border)] rounded-xl text-xs text-[var(--ink)] outline-none cursor-pointer"
                >
                  {classes.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.name}
                    </option>
                  ))}
                  {editClassId && !classes.some((c) => c.id === editClassId) && (
                    <option value={editClassId}>{getClassName(editClassId)}</option>
                  )}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--ink)] block">
                  Section (under Class)
                </label>
                <div className="grid grid-cols-2 gap-2 bg-[var(--surface-higher)] border border-[var(--border)] p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => {
                      setEditSection('A');
                      const base = (editRollNo || '1').replace(/[a-zA-Z]+$/, '');
                      if (!editStudentId || editStudentId.startsWith('STD-')) {
                        setEditStudentId(`STD-${base}A`);
                      }
                    }}
                    className={`py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                      editSection === 'A'
                        ? 'bg-purple-600 text-white shadow-2xs'
                        : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
                    }`}
                  >
                    Section A
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditSection('B');
                      const base = (editRollNo || '1').replace(/[a-zA-Z]+$/, '');
                      if (!editStudentId || editStudentId.startsWith('STD-')) {
                        setEditStudentId(`STD-${base}B`);
                      }
                    }}
                    className={`py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                      editSection === 'B'
                        ? 'bg-purple-600 text-white shadow-2xs'
                        : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
                    }`}
                  >
                    Section B
                  </button>
                </div>
                <span className="text-[11px] text-purple-600 dark:text-purple-400 font-mono block">
                  Will save as: <strong>{formatRollWithSection(editRollNo || '1', editSection)}</strong>
                </span>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--ink)] block">Registration ID</label>
                <input
                  type="text"
                  required
                  value={editStudentId}
                  onChange={(e) => setEditStudentId(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--surface-higher)] border border-[var(--border)] rounded-xl text-xs text-[var(--ink)] outline-none font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--ink)] block">Password</label>
                <input
                  type="text"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  placeholder="Leave as is or type new password"
                  className="w-full px-3 py-2 bg-[var(--surface-higher)] border border-[var(--border)] rounded-xl text-xs text-[var(--ink)] outline-none font-mono"
                />
              </div>

              <div className="flex flex-col-reverse xs:flex-row items-stretch xs:items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingStudent(null)}
                  className="px-4 py-2 border border-[var(--border)] rounded-xl text-xs text-[var(--ink-muted)] hover:text-[var(--ink)] text-center"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary px-5 py-2 rounded-xl text-xs font-bold justify-center"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* BATCH GENERATE MODAL */}
      {isBatchOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-2.5 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl sm:rounded-3xl max-w-md w-full max-h-[92vh] overflow-y-auto p-4 sm:p-6 space-y-4 shadow-2xl text-[var(--ink)]">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--border)]">
              <h3 className="font-bold text-sm text-[var(--ink)] flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-500" /> Batch Generate Accounts (Sec A / B)
              </h3>
              <button
                type="button"
                onClick={() => setIsBatchOpen(false)}
                className="text-[var(--ink-muted)] hover:text-[var(--ink)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[var(--ink-muted)] leading-relaxed">
              Create roll numbers and credentials for a section (A or B) under a class without separating classes. Rolls will be formatted as e.g. <strong className="text-[var(--ink)]">1A, 2A, 3A...</strong> or <strong className="text-[var(--ink)]">1B, 2B, 3B...</strong>
            </p>

            <form onSubmit={handleBatchSubmit} className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--ink)] flex items-center gap-1.5">
                  <GraduationCap className="w-3.5 h-3.5 text-purple-500" />
                  <span>Class Grade</span>
                </label>
                <select
                  value={batchClassId}
                  onChange={(e) => setBatchClassId(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--surface-higher)] border border-[var(--border)] rounded-xl text-xs text-[var(--ink)] outline-none cursor-pointer"
                >
                  {classes.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--ink)] block">
                  Choose Section (under Class)
                </label>
                <div className="grid grid-cols-2 gap-2 bg-[var(--surface-higher)] border border-[var(--border)] p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setBatchSection('A')}
                    className={`py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                      batchSection === 'A'
                        ? 'bg-purple-600 text-white shadow-2xs'
                        : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
                    }`}
                  >
                    Section A
                  </button>
                  <button
                    type="button"
                    onClick={() => setBatchSection('B')}
                    className={`py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                      batchSection === 'B'
                        ? 'bg-purple-600 text-white shadow-2xs'
                        : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
                    }`}
                  >
                    Section B
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 xs:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[var(--ink)] block">Start Roll No</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={batchStartRoll}
                    onChange={(e) => setBatchStartRoll(parseInt(e.target.value) || 1)}
                    className="w-full px-3 py-2 bg-[var(--surface-higher)] border border-[var(--border)] rounded-xl text-xs font-mono text-[var(--ink)] outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[var(--ink)] block">End Roll No</label>
                  <input
                    type="number"
                    min={batchStartRoll}
                    max={batchStartRoll + 99}
                    required
                    value={batchEndRoll}
                    onChange={(e) => setBatchEndRoll(parseInt(e.target.value) || batchStartRoll)}
                    className="w-full px-3 py-2 bg-[var(--surface-higher)] border border-[var(--border)] rounded-xl text-xs font-mono text-[var(--ink)] outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--ink)] block">Default Password</label>
                <input
                  type="text"
                  required
                  value={batchDefaultPassword}
                  onChange={(e) => setBatchDefaultPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--surface-higher)] border border-[var(--border)] rounded-xl text-xs font-mono text-[var(--ink)] outline-none"
                />
              </div>

              {/* Live Preview Info */}
              <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 text-[11px] text-purple-600 dark:text-purple-400 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5" />
                  <span>
                    Will create {Math.max(0, batchEndRoll - batchStartRoll + 1)} accounts:
                  </span>
                </div>
                <div className="font-mono text-[10px] pl-5 text-[var(--ink)]">
                  Rolls: <strong>{batchStartRoll}{batchSection}</strong> to <strong>{batchEndRoll}{batchSection}</strong> (IDs: STD-{batchStartRoll}{batchSection} to STD-{batchEndRoll}{batchSection})
                </div>
              </div>

              <div className="flex flex-col-reverse xs:flex-row items-stretch xs:items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsBatchOpen(false)}
                  className="px-4 py-2 border border-[var(--border)] rounded-xl text-xs text-[var(--ink-muted)] hover:text-[var(--ink)] cursor-pointer text-center"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isGeneratingBatch}
                  className="btn btn-primary px-5 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isGeneratingBatch ? (
                    <>
                      <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                      <span>Generating...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Generate Accounts</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RESET PASSWORD MODAL */}
      {resetModalStudent && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-2.5 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl sm:rounded-3xl max-w-sm w-full max-h-[92vh] overflow-y-auto p-4 sm:p-6 space-y-4 shadow-2xl text-[var(--ink)]">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--border)]">
              <h3 className="font-bold text-sm text-[var(--ink)] flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-purple-500" /> Reset Password
              </h3>
              <button
                type="button"
                onClick={() => setResetModalStudent(null)}
                className="text-[var(--ink-muted)] hover:text-[var(--ink)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[var(--ink-muted)]">
              Set a new login password for <strong className="text-[var(--ink)]">{resetModalStudent.name}</strong> (Roll: {resetModalStudent.rollNo || '-'}):
            </p>

            <form onSubmit={handleConfirmResetPassword} className="space-y-3.5">
              <input
                type="text"
                required
                value={customResetPassword}
                onChange={(e) => setCustomResetPassword(e.target.value)}
                placeholder="Enter new password (e.g. 123456)"
                className="w-full px-3.5 py-2.5 bg-[var(--surface-higher)] border border-[var(--border)] rounded-xl text-xs font-mono text-[var(--ink)] outline-none focus:border-purple-500"
              />

              <div className="flex flex-col-reverse xs:flex-row items-stretch xs:items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setResetModalStudent(null)}
                  className="px-4 py-2 border border-[var(--border)] rounded-xl text-xs text-[var(--ink-muted)] hover:text-[var(--ink)] text-center"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary px-5 py-2 rounded-xl text-xs font-bold justify-center"
                >
                  Update Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRM MODAL */}
      {deleteModalStudent && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-2.5 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl sm:rounded-3xl max-w-sm w-full max-h-[92vh] overflow-y-auto p-4 sm:p-6 space-y-4 shadow-2xl text-[var(--ink)]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-500 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-sm text-[var(--ink)]">Delete Student?</h3>
                <p className="text-[11px] text-[var(--ink-muted)]">This action cannot be undone.</p>
              </div>
            </div>

            <p className="text-xs text-[var(--ink-muted)] leading-relaxed bg-[var(--surface-higher)] p-3 rounded-xl border border-[var(--border)] break-words">
              Are you sure you want to delete <strong className="text-[var(--ink)]">"{deleteModalStudent.name}"</strong> (ID: {deleteModalStudent.studentId})? All test attempts and scores will be removed.
            </p>

            <div className="flex flex-col-reverse xs:flex-row items-stretch xs:items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setDeleteModalStudent(null)}
                className="px-4 py-2 border border-[var(--border)] rounded-xl text-xs text-[var(--ink-muted)] hover:text-[var(--ink)] text-center"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition cursor-pointer text-center"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
