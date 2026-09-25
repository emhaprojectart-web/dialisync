import React, { useState } from 'react';
import {
  UserAccount,
  SpecialTask,
  TaskPriority,
  TaskStatus,
  SpecialTaskCategory,
  SPECIAL_TASK_DEFINITIONS,
  ShiftSchedule,
  ShiftType,
  AppSettings
} from '../types';
import {
  generateMonthlySchedule,
  getEffectiveShiftForEmployee,
  sortNursesByShiftScheduleOrder,
  getTodayDateString
} from '../utils/scheduler';
import {
  Plus,
  CheckCircle2,
  Clock,
  AlertTriangle,
  User,
  Calendar,
  Filter,
  Trash2,
  Edit3,
  X,
  Check,
  ShieldCheck,
  Zap,
  Layers,
  Search,
  Sun,
  Moon,
  ChevronLeft,
  ChevronRight,
  UserPlus,
  RotateCcw,
  Sparkles,
  FileSpreadsheet,
  RefreshCw
} from 'lucide-react';
import { GoogleSheetsService } from '../domain/GoogleSheetsService';
import { storage, isInvalidNurseAccount } from '../utils/storage';
import { cloudSync } from '../services/cloudSync';

interface SpecialTasksViewProps {
  currentUser: UserAccount;
  employees: UserAccount[];
  schedules?: ShiftSchedule[];
  specialTasks: SpecialTask[];
  settings?: AppSettings;
  activeDate?: string;
  onDateChange?: (date: string) => void;
  onUpdateTasks: (tasks: SpecialTask[]) => void;
  onUpdateSchedule?: (schedules: ShiftSchedule[]) => void;
  onNavigate?: (tab: string) => void;
}

export const SpecialTasksView: React.FC<SpecialTasksViewProps> = ({
  currentUser,
  employees,
  schedules = [],
  specialTasks,
  settings,
  activeDate,
  onDateChange,
  onUpdateTasks,
  onUpdateSchedule,
  onNavigate,
}) => {
  // Primary view: 'shifts' (separate tables for Pagi & Siang) or 'history' (audit list)
  const [activeView, setActiveView] = useState<'shifts' | 'history'>('shifts');

  // Operational Date Selector (defaults to today's active date)
  const [selectedDate, setSelectedDate] = useState<string>(() => activeDate || getTodayDateString());

  React.useEffect(() => {
    if (activeDate && activeDate !== selectedDate) {
      setSelectedDate(activeDate);
    }
  }, [activeDate]);

  const updateDate = (newDate: string) => {
    setSelectedDate(newDate);
    onDateChange?.(newDate);
  };

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [completeModal, setCompleteModal] = useState<SpecialTask | null>(null);
  const [completionNote, setCompletionNote] = useState('');
  const [deleteModalTask, setDeleteModalTask] = useState<SpecialTask | null>(null);
  const [showClearAllModal, setShowClearAllModal] = useState(false);
  const [clearScope, setClearScope] = useState<'all' | 'filtered'>('all');
  const [isClearingAll, setIsClearingAll] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const handleClearHistory = async (scope: 'all' | 'filtered') => {
    setIsClearingAll(true);
    try {
      if (scope === 'all') {
        const totalCount = specialTasks.length;
        // 1. Clear in system state
        onUpdateTasks([]);

        // 2. Clear in LocalStorage
        storage.saveSpecialTasks([]);

        // 3. Clear in Firebase Firestore completely
        await cloudSync.clearAllSpecialTasks();

        // 4. Clear in Google Sheets
        const settings = storage.getSettings();
        const gasUrl = settings?.googleSheetWebhookUrl;
        let sheetMsg = '';
        if (gasUrl) {
          try {
            const sheetRes = await GoogleSheetsService.clearSpecialTasksHistory(gasUrl);
            sheetMsg = sheetRes.isSuccess ? ' Google Sheet berhasil dikosongkan.' : ` (${sheetRes.message})`;
          } catch (gasErr: any) {
            console.warn('GAS Clear notice:', gasErr);
            sheetMsg = ' (Sinkron Google Sheet dapat diulang nanti).';
          }
        }

        setToastMessage(`Seluruh riwayat tugas khusus (${totalCount} tugas) berhasil dihapus.${sheetMsg}`);
      } else {
        // Delete filtered tasks only
        const filteredIds = new Set(filteredHistoryTasks.map((t) => t.id));
        const remaining = specialTasks.filter((t) => !filteredIds.has(t.id));

        // 1. Update system state
        onUpdateTasks(remaining);

        // 2. LocalStorage
        storage.saveSpecialTasks(remaining);

        // 3. Firebase Firestore
        await cloudSync.saveSpecialTasks(remaining);

        setToastMessage(`Sebanyak ${filteredHistoryTasks.length} tugas khusus hasil filter berhasil dihapus.`);
      }
      setShowClearAllModal(false);
    } catch (err: any) {
      console.error('Error clearing special tasks:', err);
      setToastMessage('Terjadi kendala saat menghapus riwayat tugas khusus.');
    } finally {
      setIsClearingAll(false);
    }
  };

  // State sinkronisasi Google Sheets
  const [isSyncingSheets, setIsSyncingSheets] = useState(false);

  const handleSyncToGoogleSheets = async (customTasks?: SpecialTask[]) => {
    const effectiveSettings = settings || storage.getSettings();
    const gasUrl = effectiveSettings?.googleSheetWebhookUrl;
    if (!gasUrl) {
      setToastMessage('URL Webhook Google Apps Script belum dikonfigurasi. Atur di menu Sinkronisasi.');
      return;
    }
    setIsSyncingSheets(true);
    try {
      const tasksToSend = customTasks || specialTasks;
      const res = await GoogleSheetsService.syncSpecialTasksToGoogleSheets(
        gasUrl,
        tasksToSend,
        employees,
        selectedDate.substring(0, 7)
      );
      if (res.isSuccess) {
        setToastMessage(res.message);
      } else {
        setToastMessage(res.message);
      }
    } catch (err: any) {
      setToastMessage('Gagal sinkronisasi Google Sheets: ' + (err?.message || err));
    } finally {
      setIsSyncingSheets(false);
    }
  };

  // Helper auto-sync di background setelah user mengubah penugasan
  const triggerBackgroundSync = (updatedTasks: SpecialTask[]) => {
    const effectiveSettings = settings || storage.getSettings();
    if (effectiveSettings?.googleSheetWebhookUrl) {
      GoogleSheetsService.syncSpecialTasksToGoogleSheets(
        effectiveSettings.googleSheetWebhookUrl,
        updatedTasks,
        employees,
        selectedDate.substring(0, 7)
      ).catch((e) => console.warn('[GoogleSheetsSync] Background task sync notice:', e));
    }
  };

  // Form State for individual custom task creation
  const [taskForm, setTaskForm] = useState<{
    categories: SpecialTaskCategory[];
    assignedToId: string;
    title: string;
    description: string;
    date: string;
    shift: 'pagi' | 'siang';
    priority: TaskPriority;
  }>({
    categories: ['pj_shift'],
    assignedToId: employees[0]?.id || '',
    title: '',
    description: '',
    date: selectedDate,
    shift: 'pagi',
    priority: 'penting',
  });

  // Filter state for history tab
  const [historyCategoryFilter, setHistoryCategoryFilter] = useState<string>('all');
  const [historyStaffFilter, setHistoryStaffFilter] = useState<string>('all');
  const [historyShiftFilter, setHistoryShiftFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const isAdmin = currentUser.role === 'admin';
  const isKaru = currentUser.role === 'kepala_ruangan' || (currentUser.role as string) === 'karu';
  const isPjShift = currentUser.role === 'pj_shift' || (currentUser.role as string) === 'katim';
  const canManage = !currentUser || isAdmin || isKaru || isPjShift || currentUser.role === 'perawat';

  // Auto-dismiss toast message
  React.useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  // Date manipulation helpers
  const handlePrevDate = () => {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    updateDate(`${yyyy}-${mm}-${dd}`);
  };

  const handleNextDate = () => {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    updateDate(`${yyyy}-${mm}-${dd}`);
  };

  // Indonesian date formatting
  const dateObj = new Date(selectedDate + 'T00:00:00');
  const isSunday = dateObj.getDay() === 0;
  const formattedDateLong = new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(dateObj);

  // Staf yang berhak mendapatkan tugas khusus: Perawat HD, PJ Shift HD, dan Kepala Ruangan HD, terurut sesuai hirarki
  const clinicalNurses = sortNursesByShiftScheduleOrder(
    employees.filter(
      (e) =>
        (e.role === 'perawat' ||
          e.role === 'pj_shift' ||
          e.role === 'kepala_ruangan' ||
          (e.role as string) === 'katim' ||
          (e.role as string) === 'karu') &&
        e.status === 'aktif' &&
        !isInvalidNurseAccount(e)
    )
  );

  // Kepala Ruangan HD (Supervisi & Penanggung Jawab Unit HD)
  const kepalaRuang = employees.find(
    (e) => (e.role === 'kepala_ruangan' || (e.role as string) === 'karu') && e.status === 'aktif' && !isInvalidNurseAccount(e)
  );

  // Single source of truth for shift assignment (Matrik Jadwal Bulanan)
  const getEffectiveShift = (emp: UserAccount, dateString: string): ShiftType => {
    return getEffectiveShiftForEmployee(emp, dateString, schedules, employees);
  };

  // Determine clinical nurses scheduled for Shift Pagi on selectedDate:
  const pagiNurses = sortNursesByShiftScheduleOrder(
    clinicalNurses.filter((nurse) => {
      const s = String(getEffectiveShift(nurse, selectedDate) || '').toLowerCase();
      return s === 'pagi' || s.startsWith('pagi');
    })
  );

  // Determine clinical nurses scheduled for Shift Siang on selectedDate:
  const siangNurses = sortNursesByShiftScheduleOrder(
    clinicalNurses.filter((nurse) => {
      const s = String(getEffectiveShift(nurse, selectedDate) || '').toLowerCase();
      return s === 'siang' || s.startsWith('siang');
    })
  );

  // Determine clinical nurses who are Libur / Cuti / Izin on selectedDate:
  const offNurses = employees.filter((nurse) => {
    if (nurse.role !== 'perawat' && nurse.role !== 'pj_shift') return false;
    const s = String(getEffectiveShift(nurse, selectedDate) || '').toLowerCase();
    return s !== 'pagi' && s !== 'siang' && !s.startsWith('pagi') && !s.startsWith('siang');
  });

  // Current active PJ Shift for Shift Pagi & Shift Siang on selectedDate
  const currentPjPagi = pagiNurses.find((n) =>
    specialTasks.some(
      (t) =>
        t.assignedToId === n.id &&
        t.date === selectedDate &&
        (t.shift === 'pagi' || !t.shift) &&
        t.category === 'pj_shift'
    )
  );

  const currentPjSiang = siangNurses.find((n) =>
    specialTasks.some(
      (t) =>
        t.assignedToId === n.id &&
        t.date === selectedDate &&
        t.shift === 'siang' &&
        t.category === 'pj_shift'
    )
  );

  // All active nurses eligible for tasks, sorted strictly by requested hierarchy
  const activeNurses = clinicalNurses;

  // Auto-align task shift with nurse's schedule on selectedDate so tasks are never orphaned when shifts change
  React.useEffect(() => {
    let hasChanges = false;
    const updated = specialTasks.map((task) => {
      if (task.date !== selectedDate) return task;
      const nurse = employees.find((e) => e.id === task.assignedToId);
      if (!nurse) return task;
      const effectiveShift = getEffectiveShift(nurse, selectedDate);
      if ((effectiveShift === 'pagi' || effectiveShift === 'siang') && task.shift !== effectiveShift) {
        hasChanges = true;
        return { ...task, shift: effectiveShift };
      }
      return task;
    });

    if (hasChanges) {
      onUpdateTasks(updated);
    }
  }, [selectedDate, schedules, employees]);

  // Auto-sync monthly schedule in the background if selected month doesn't have schedule entries
  React.useEffect(() => {
    if (!onUpdateSchedule || employees.length === 0) return;
    const [yearStr, monthStr] = selectedDate.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10) - 1;
    const prefix = `${yearStr}-${monthStr}`;
    const hasMonthData = schedules.some((s) => s.date.startsWith(prefix));

    if (!hasMonthData) {
      const generated = generateMonthlySchedule(year, month, employees, true, schedules);
      const otherSchedules = schedules.filter((s) => !s.date.startsWith(prefix));
      onUpdateSchedule([...otherSchedules, ...generated]);
    }
  }, [selectedDate, employees, schedules, onUpdateSchedule]);

  // Toggle a special task for a specific nurse on a specific shift
  // Toggle a special task for a specific nurse on a specific shift
  const handleToggleTaskForNurse = (
    nurseId: string,
    shift: 'pagi' | 'siang',
    category: SpecialTaskCategory
  ) => {
    if (!canManage) return;

    // Find any existing task for this nurse on this date, shift, and category
    const existingTask = specialTasks.find(
      (t) =>
        t.assignedToId === nurseId &&
        t.date === selectedDate &&
        (t.shift === shift || (!t.shift && shift === 'pagi')) &&
        t.category === category
    );

    const nurse = employees.find((e) => e.id === nurseId);
    const def = SPECIAL_TASK_DEFINITIONS[category];

    if (existingTask) {
      // Remove this task
      const updated = specialTasks.filter((t) => t.id !== existingTask.id);
      onUpdateTasks(updated);
      triggerBackgroundSync(updated);
      setToastMessage(
        `Tugas ${def.name} dihapus dari ${nurse?.name || 'perawat'} (Shift ${shift.toUpperCase()}).`
      );
    } else {
      // If assigning PJ Shift, ensure only 1 PJ Shift per shift by transferring from previous PJ
      let baseTasks = specialTasks;
      let prevPjName = '';
      if (category === 'pj_shift') {
        const prevPj = specialTasks.find(
          (t) =>
            t.date === selectedDate &&
            (t.shift === shift || (!t.shift && shift === 'pagi')) &&
            t.category === 'pj_shift'
        );
        if (prevPj) {
          const prevEmp = employees.find((e) => e.id === prevPj.assignedToId);
          prevPjName = prevEmp?.name || '';
          baseTasks = specialTasks.filter((t) => t.id !== prevPj.id);
        }
      }

      // Add new task
      const newTask: SpecialTask = {
        id: `task_${selectedDate}_${shift}_${category}_${nurseId}_${Date.now()}`,
        title: `Tugas Khusus: ${def.name}`,
        description: def.description,
        assignedToId: nurseId,
        assignedByName: `${currentUser.name} (${currentUser.role === 'admin' ? 'Admin' : (currentUser.role === 'pj_shift' || (currentUser.role as string) === 'katim') ? 'KATIM' : 'Karu'})`,
        date: selectedDate,
        shift: shift,
        priority: category === 'cito' ? 'mendesak' : 'penting',
        status: 'pending',
        category: category,
        createdAt: new Date().toISOString().replace('T', ' ').substring(0, 16),
      };
      const nextTasks = [...baseTasks, newTask];
      onUpdateTasks(nextTasks);
      triggerBackgroundSync(nextTasks);

      if (category === 'pj_shift' && prevPjName) {
        setToastMessage(
          `PJ Shift ${shift.toUpperCase()} dialihkan dari ${prevPjName} ke ${nurse?.name || 'perawat'}.`
        );
      } else {
        setToastMessage(
          `Tugas ${def.name} berhasil ditugaskan ke ${nurse?.name || 'perawat'} (Shift ${shift.toUpperCase()}).`
        );
      }
    }
  };

  // Dedicated single-click PJ Shift assignment for a shift
  const handleSetPjShiftForShift = (shift: 'pagi' | 'siang', nurseId: string) => {
    if (!canManage) return;
    const def = SPECIAL_TASK_DEFINITIONS.pj_shift;

    // Filter out existing PJ Shift on this date & shift
    const baseTasks = specialTasks.filter(
      (t) =>
        !(
          t.date === selectedDate &&
          (t.shift === shift || (!t.shift && shift === 'pagi')) &&
          t.category === 'pj_shift'
        )
    );

    if (!nurseId) {
      onUpdateTasks(baseTasks);
      triggerBackgroundSync(baseTasks);
      setToastMessage(`PJ Shift ${shift.toUpperCase()} dikosongkan.`);
      return;
    }

    const nurse = employees.find((e) => e.id === nurseId);
    const newTask: SpecialTask = {
      id: `task_${selectedDate}_${shift}_pj_shift_${nurseId}_${Date.now()}`,
      title: `Tugas Khusus: ${def.name}`,
      description: def.description,
      assignedToId: nurseId,
      assignedByName: `${currentUser.name} (${currentUser.role === 'admin' ? 'Admin' : (currentUser.role === 'pj_shift' || (currentUser.role as string) === 'katim') ? 'KATIM' : 'Karu'})`,
      date: selectedDate,
      shift: shift,
      priority: 'penting',
      status: 'pending',
      category: 'pj_shift',
      createdAt: new Date().toISOString().replace('T', ' ').substring(0, 16),
    };

    const nextTasks = [...baseTasks, newTask];
    onUpdateTasks(nextTasks);
    triggerBackgroundSync(nextTasks);
    setToastMessage(`PJ Shift ${shift.toUpperCase()} berhasil ditugaskan ke ${nurse?.name || 'perawat'}.`);
  };

  // Auto-distribute standard tasks for a shift (PJ, BHP, FARMASI, RO)
  const handleAutoAssignStandardTemplate = (shift: 'pagi' | 'siang') => {
    if (!canManage) return;
    const shiftNurses = shift === 'pagi' ? pagiNurses : siangNurses;
    if (shiftNurses.length === 0) {
      setToastMessage(`Tidak ada perawat aktif pada Shift ${shift.toUpperCase()} untuk alokasi tugas.`);
      return;
    }

    const standardCategories: SpecialTaskCategory[] = ['pj_shift', 'bhp', 'farmasi_logistik', 'natrium_ro'];
    let updatedTasks = specialTasks.filter((t) => !(t.date === selectedDate && (t.shift === shift || (!t.shift && shift === 'pagi'))));
    const newTasks: SpecialTask[] = [];
    const usedNurses = new Set<string>();

    standardCategories.forEach((cat, catIdx) => {
      // 1. Try to find nurse whose permanent specialDuty or role matches this category
      let assignedNurse = shiftNurses.find((n) => {
        if (usedNurses.has(n.id)) return false;
        const duty = String(n.specialDuty || '').toLowerCase();
        if (cat === 'pj_shift' && (n.role === 'pj_shift' || (n.role as string) === 'katim' || duty.includes('pj') || duty.includes('katim'))) return true;
        if (cat === 'bhp' && duty.includes('bhp')) return true;
        if (cat === 'farmasi_logistik' && (duty.includes('farmasi') || duty.includes('obat') || duty.includes('logistik'))) return true;
        if (cat === 'natrium_ro' && (duty.includes('ro') || duty.includes('water') || duty.includes('natrium'))) return true;
        return false;
      });

      // 2. If no specific match, pick first available unused nurse
      if (!assignedNurse) {
        assignedNurse = shiftNurses.find((n) => !usedNurses.has(n.id));
      }

      // 3. Fallback wrap-around
      if (!assignedNurse) {
        assignedNurse = shiftNurses[catIdx % shiftNurses.length];
      }

      if (assignedNurse) {
        usedNurses.add(assignedNurse.id);
        const def = SPECIAL_TASK_DEFINITIONS[cat];
        newTasks.push({
          id: `task_${selectedDate}_${shift}_${cat}_${assignedNurse.id}_${Date.now()}_${catIdx}`,
          title: `Tugas Khusus: ${def.name}`,
          description: def.description,
          assignedToId: assignedNurse.id,
          assignedByName: `${currentUser.name} (${currentUser.role === 'admin' ? 'Admin' : (currentUser.role === 'pj_shift' || (currentUser.role as string) === 'katim') ? 'KATIM' : 'Karu'})`,
          date: selectedDate,
          shift: shift,
          priority: 'penting',
          status: 'pending',
          category: cat,
          createdAt: new Date().toISOString().replace('T', ' ').substring(0, 16),
        });
      }
    });

    const allTemplateTasks = [...updatedTasks, ...newTasks];
    onUpdateTasks(allTemplateTasks);
    triggerBackgroundSync(allTemplateTasks);
    setToastMessage(`Template tugas Shift ${shift.toUpperCase()} berhasil diterapkan (${newTasks.length} pos tugas).`);
  };

  // Clear all special tasks for a nurse on this shift & date
  const handleClearAllTasksForNurse = async (nurseId: string, shift: 'pagi' | 'siang') => {
    if (!canManage) return;
    const nurse = employees.find((e) => e.id === nurseId);
    const updated = specialTasks.filter(
      (t) =>
        !(
          t.assignedToId === nurseId &&
          t.date === selectedDate &&
          (t.shift === shift || (!t.shift && shift === 'pagi'))
        )
    );
    onUpdateTasks(updated);
    storage.saveSpecialTasks(updated);
    cloudSync.saveSpecialTasks(updated).catch((e) => console.warn('[CloudSync] saveSpecialTasks notice:', e));
    triggerBackgroundSync(updated);
    setToastMessage(`Semua tugas khusus untuk ${nurse?.name || 'perawat'} pada Shift ${shift.toUpperCase()} telah dihapus.`);
  };

  // Handle Confirmed Task Deletion from Modal
  const handleConfirmDelete = async () => {
    if (!deleteModalTask) return;

    const updated = specialTasks.filter(
      (t) =>
        t.id !== deleteModalTask.id &&
        !(
          t.assignedToId === deleteModalTask.assignedToId &&
          t.date === deleteModalTask.date &&
          t.shift === deleteModalTask.shift &&
          t.category === deleteModalTask.category
        )
    );

    onUpdateTasks(updated);
    storage.saveSpecialTasks(updated);
    triggerBackgroundSync(updated);
    try {
      await cloudSync.deleteSpecialTask(deleteModalTask.id);
    } catch (e) {
      console.warn('[CloudSync] deleteSpecialTask notice:', e);
    }

    const catName = SPECIAL_TASK_DEFINITIONS[deleteModalTask.category]?.name || 'Tugas Khusus';
    const empName = employees.find((e) => e.id === deleteModalTask.assignedToId)?.name || 'Staf';
    setToastMessage(`Tugas ${catName} untuk ${empName} berhasil dihapus.`);
    setDeleteModalTask(null);
  };

  // Handle Mark Done for verification
  const handleCompleteTask = () => {
    if (!completeModal) return;

    const updated = specialTasks.map((t) => {
      if (t.id === completeModal.id) {
        return {
          ...t,
          status: 'completed' as TaskStatus,
          completedAt: new Date().toISOString().replace('T', ' ').substring(0, 16),
          completionNotes: completionNote || 'Tugas selesai diverifikasi sesuai standar operasional HD.',
        };
      }
      return t;
    });

    onUpdateTasks(updated);
    triggerBackgroundSync(updated);
    setCompleteModal(null);
    setCompletionNote('');
    setToastMessage(`Tugas "${completeModal.title}" telah ditandai selesai.`);
  };

  // Handle Manual Task Form Save
  const handleSaveIndividualTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskForm.assignedToId || taskForm.categories.length === 0) return;

    const emp = employees.find((e) => e.id === taskForm.assignedToId);
    if (!emp) return;

    let baseTasks = [...specialTasks];

    // If assigning PJ Shift, remove any existing PJ Shift on this date & shift to guarantee 1 PJ Shift
    if (taskForm.categories.includes('pj_shift')) {
      baseTasks = baseTasks.filter(
        (t) =>
          !(
            t.date === taskForm.date &&
            (t.shift === taskForm.shift || (!t.shift && taskForm.shift === 'pagi')) &&
            t.category === 'pj_shift'
          )
      );
    }

    // Also remove any matching category task for this specific nurse on this date & shift to avoid duplicates
    baseTasks = baseTasks.filter(
      (t) =>
        !(
          t.assignedToId === taskForm.assignedToId &&
          t.date === taskForm.date &&
          (t.shift === taskForm.shift || (!t.shift && taskForm.shift === 'pagi')) &&
          taskForm.categories.includes(t.category)
        )
    );

    const createdTasks: SpecialTask[] = taskForm.categories.map((cat, idx) => {
      const def = SPECIAL_TASK_DEFINITIONS[cat];
      return {
        id: `task_${Date.now()}_${cat}_${taskForm.assignedToId}_${idx}`,
        title: taskForm.title || `Tugas Khusus: ${def.name}`,
        description: taskForm.description || def.description,
        assignedToId: taskForm.assignedToId,
        assignedByName: `${currentUser.name} (${currentUser.role === 'admin' ? 'Admin' : (currentUser.role === 'pj_shift' || (currentUser.role as string) === 'katim') ? 'KATIM' : 'Karu'})`,
        date: taskForm.date,
        shift: taskForm.shift,
        priority: taskForm.priority,
        status: 'pending',
        category: cat,
        createdAt: new Date().toISOString().replace('T', ' ').substring(0, 16),
      };
    });

    const allCreatedTasks = [...createdTasks, ...baseTasks];
    onUpdateTasks(allCreatedTasks);
    triggerBackgroundSync(allCreatedTasks);
    setShowCreateModal(false);
    setToastMessage(`${createdTasks.length} tugas khusus berhasil ditambahkan untuk ${emp.name}.`);
    setTaskForm({
      categories: ['pj_shift'],
      assignedToId: employees[0]?.id || '',
      title: '',
      description: '',
      date: selectedDate,
      shift: 'pagi',
      priority: 'penting',
    });
  };

  // Tasks today count
  const tasksToday = specialTasks.filter((t) => t.date === selectedDate);
  const tasksTodayCount = tasksToday.length;

  // Filtered tasks for History Tab
  const filteredHistoryTasks = specialTasks.filter((t) => {
    if (historyCategoryFilter !== 'all' && t.category !== historyCategoryFilter) return false;
    if (historyStaffFilter !== 'all' && t.assignedToId !== historyStaffFilter) return false;
    if (historyShiftFilter !== 'all' && t.shift !== historyShiftFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const staffName = employees.find((e) => e.id === t.assignedToId)?.name?.toLowerCase() || '';
      return (
        t.title.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        staffName.includes(q) ||
        t.date.includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-700 shrink-0">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">
                Penugasan Tugas Khusus Perawat HD
              </h1>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Pengelolaan tugas khusus per shif (Shif Pagi &amp; Siang terpisah): <strong>PJ Shift, BHP, Farmasi &amp; Logistik, Natrium RO,</strong> dan <strong>CITO (Alokasi Isolasi)</strong>. Staf dapat memegang 2 atau lebih tugas khusus.
              </p>
            </div>
          </div>
        </div>

        {/* View Switchers & Action */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 self-stretch sm:self-auto">
          <div className="bg-slate-100 p-1 rounded-xl flex items-center space-x-1">
            <button
              onClick={() => setActiveView('shifts')}
              className={`flex-1 sm:flex-initial px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center space-x-1.5 min-h-[32px] cursor-pointer ${
                activeView === 'shifts'
                  ? 'bg-white text-teal-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5 shrink-0" />
              <span>Input per Shif</span>
            </button>
            <button
              onClick={() => setActiveView('history')}
              className={`flex-1 sm:flex-initial px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center space-x-1.5 min-h-[32px] cursor-pointer ${
                activeView === 'history'
                  ? 'bg-white text-teal-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Filter className="w-3.5 h-3.5 shrink-0" />
              <span>Semua Riwayat ({specialTasks.length})</span>
            </button>
          </div>

          {/* Tombol Kirim ke Google Sheet */}
          <button
            type="button"
            onClick={() => handleSyncToGoogleSheets()}
            disabled={isSyncingSheets}
            className={`w-full sm:w-auto px-3.5 py-2 rounded-xl font-bold text-xs shadow-xs transition flex items-center justify-center space-x-1.5 cursor-pointer active:scale-95 min-h-[36px] ${
              isSyncingSheets
                ? 'bg-emerald-700 text-white opacity-80 cursor-wait'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white'
            }`}
            title="Kirim dan sinkronkan data tugas khusus ke Google Sheets (Tab 'Jadwal Tugas Khusus')"
          >
            {isSyncingSheets ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
            ) : (
              <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
            )}
            <span>{isSyncingSheets ? 'Mengirim ke Sheets...' : `Kirim ke Google Sheet (${specialTasks.length})`}</span>
          </button>

          {canManage && (
            <button
              onClick={() => {
                const initialNurse = pagiNurses[0]?.id || siangNurses[0]?.id || '';
                setTaskForm({
                  title: '',
                  description: '',
                  assignedToId: initialNurse,
                  date: selectedDate,
                  shift: pagiNurses.length > 0 ? 'pagi' : 'siang',
                  priority: 'normal',
                  categories: ['pj_shift'],
                });
                setShowCreateModal(true);
              }}
              className="w-full sm:w-auto px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-xs transition flex items-center justify-center space-x-1.5 cursor-pointer active:scale-95 min-h-[36px]"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span>Tambah Tugas Custom</span>
            </button>
          )}
        </div>
      </div>

      {/* Tanggal Operasional Card */}
      <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex items-center space-x-1 sm:space-x-1.5 bg-slate-100 p-1 sm:p-1.5 rounded-xl border border-slate-200">
            <button
              onClick={handlePrevDate}
              className="p-1.5 hover:bg-white rounded-lg text-slate-600 transition min-w-[32px] min-h-[32px] flex items-center justify-center cursor-pointer"
              title="Hari Sebelumnya"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center space-x-1 px-1">
              <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-teal-600 shrink-0" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => updateDate(e.target.value)}
                className="px-1.5 py-1 text-xs font-bold text-slate-800 bg-transparent focus:outline-hidden cursor-pointer"
              />
            </div>
            <button
              onClick={handleNextDate}
              className="p-1.5 hover:bg-white rounded-lg text-slate-600 transition min-w-[32px] min-h-[32px] flex items-center justify-center cursor-pointer"
              title="Hari Berikutnya"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={() => {
              updateDate(getTodayDateString());
            }}
            className="px-3 py-1.5 sm:py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition min-h-[32px] cursor-pointer"
          >
            Hari Ini
          </button>

          <div className="flex flex-col ml-1">
            <span className="text-xs sm:text-sm font-bold text-slate-900">{formattedDateLong}</span>
            {isSunday ? (
              <span className="text-[10px] sm:text-[11px] font-bold text-rose-600 flex items-center space-x-1">
                <AlertTriangle className="w-3 h-3 text-rose-500" />
                <span>Hari Minggu - Libur Rutin Seluruh Staf</span>
              </span>
            ) : (
              <span className="text-[10px] sm:text-[11px] text-slate-500">
                Operasional Unit Hemodialisa (Shif Pagi &amp; Siang)
              </span>
            )}
          </div>
        </div>

        {/* Shift Summary Badges */}
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 w-full sm:w-auto">
          <span className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold flex items-center justify-center space-x-1.5 shadow-2xs">
            <Sun className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>Pagi: {pagiNurses.length} Staf</span>
          </span>
          <span className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-pink-50 text-pink-800 border border-pink-200 text-xs font-bold flex items-center justify-center space-x-1.5 shadow-2xs">
            <Moon className="w-3.5 h-3.5 text-pink-600 shrink-0" />
            <span>Siang: {siangNurses.length} Staf</span>
          </span>
          <span className="col-span-2 sm:col-span-1 px-3 py-1.5 rounded-xl bg-purple-50 text-purple-800 border border-purple-200 text-xs font-bold shadow-2xs text-center">
            {tasksTodayCount} Tugas Khusus Aktif
          </span>
        </div>
      </div>

      {/* VIEW 1: SHIFTS VIEW (SHIF PAGI & SHIF SIANG SEPARATE) */}
      {activeView === 'shifts' && (
        <div className="space-y-6">
          {/* Sunday Notice if applicable */}
          {isSunday && (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-start space-x-3 text-xs text-rose-900">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Perhatian: Hari Minggu adalah Hari Libur Rutin HD.</span>
                <p className="mt-0.5 text-rose-800">
                  Secara standar tidak ada jadwal shift reguler pada hari Minggu. Namun jika ada tindakan <strong>CITO darurat</strong> atau dinas khusus, Anda tetap dapat menambahkan perawat dan memberikan tugas khusus di bawah.
                </p>
              </div>
            </div>
          )}

          {/* Quick Category Legend Banner */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center space-x-2">
              <ShieldCheck className="w-4 h-4 text-teal-600 shrink-0" />
              <span className="font-bold text-slate-800">5 Kategori Tugas Khusus:</span>
              <span className="text-slate-500 text-[11px] hidden sm:inline">
                (Klik tombol di kolom tugas untuk menugaskan atau membatalkan)
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              {(['pj_shift', 'bhp', 'farmasi_logistik', 'natrium_ro', 'cito'] as SpecialTaskCategory[]).map((cat) => {
                const def = SPECIAL_TASK_DEFINITIONS[cat];
                return (
                  <span
                    key={cat}
                    className={`px-2.5 py-1 rounded-lg font-bold text-[11px] ${def.badgeBg} text-white shadow-2xs flex items-center space-x-1`}
                  >
                    <span>{def.shortCode}</span>
                    <span>:</span>
                    <span>{def.name}</span>
                  </span>
                );
              })}
            </div>
          </div>

          {/* PERAWAT LIBUR / OFF HARI INI */}
          {offNurses.length > 0 && (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 px-4 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center space-x-2 flex-wrap">
                <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                <span className="font-bold text-slate-700">Perawat Libur / Off Hari Ini ({offNurses.length}):</span>
                <div className="flex flex-wrap gap-1.5">
                  {offNurses.map((n) => (
                    <span key={n.id} className="px-2 py-0.5 bg-white border border-slate-200 rounded-md text-slate-600 font-semibold text-[11px]">
                      {n.name}
                    </span>
                  ))}
                </div>
              </div>
              <span className="text-[10px] text-slate-500 italic">Sesuai Matrik Jadwal Bulanan</span>
            </div>
          )}

          {/* SIDE-BY-SIDE 2-COLUMN LAYOUT: SHIF PAGI (KIRI) & SHIF SIANG (KANAN) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
            {/* ======================================================== */}
            {/* SECTION 1: SHIF PAGI (07:00 - 14:00 WIB) - KOLOM KIRI    */}
            {/* ======================================================== */}
            <div className="bg-white rounded-2xl border border-emerald-200 shadow-xs overflow-hidden flex flex-col">
              {/* Shift Header */}
              <div className="bg-gradient-to-r from-emerald-600 to-teal-700 p-3.5 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="flex items-center space-x-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center backdrop-blur-xs shrink-0">
                    <Sun className="w-4 h-4 text-amber-300" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center space-x-1.5 flex-wrap">
                      <h2 className="text-sm font-bold tracking-tight">
                        Shif Pagi
                      </h2>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-900/40 text-emerald-100 text-[10px] font-bold border border-white/20">
                        07:00 - 14:00 WIB
                      </span>
                    </div>
                    <p className="text-[11px] text-emerald-100 mt-0.5 truncate">
                      {pagiNurses.length} Perawat Aktif (Sesuai Matrik Jadwal)
                    </p>
                  </div>
                </div>
                {canManage && pagiNurses.length > 0 && (
                  <button
                    type="button"
                    onClick={() => handleAutoAssignStandardTemplate('pagi')}
                    className="inline-flex items-center space-x-1.5 px-2.5 py-1.5 bg-white/20 hover:bg-white/30 active:scale-95 text-white rounded-xl text-[11px] font-bold transition border border-white/25 cursor-pointer shrink-0 shadow-xs"
                    title="Alokasikan otomatis 1 PJ Shift, 1 BHP, 1 Farmasi, 1 Natrium RO"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                    <span>Template Standar</span>
                  </button>
                )}
              </div>

              {/* Dedicated Bar: Penanggung Jawab Shif (PJ Shif) Pagi */}
              <div className="bg-emerald-50 border-b border-emerald-200/80 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center space-x-2 min-w-0">
                  <span className="px-2 py-0.5 rounded-md bg-orange-500 text-white font-black text-[10px] tracking-wide uppercase shadow-2xs">
                    PJ Shif Pagi
                  </span>
                  <span className="text-xs font-bold text-slate-800 truncate">
                    {currentPjPagi ? (
                      <span className="text-emerald-900 font-extrabold">{currentPjPagi.name}</span>
                    ) : (
                      <span className="text-amber-700 italic font-medium">Belum Ditugaskan</span>
                    )}
                  </span>
                </div>
                {canManage && pagiNurses.length > 0 && (
                  <div className="flex items-center space-x-1.5">
                    <span className="text-[10px] font-bold text-emerald-900">Tetapkan:</span>
                    <select
                      value={currentPjPagi?.id || ''}
                      onChange={(e) => handleSetPjShiftForShift('pagi', e.target.value)}
                      className="text-xs font-bold bg-white border border-emerald-300 rounded-lg px-2 py-1 text-slate-800 focus:ring-2 focus:ring-emerald-500 cursor-pointer shadow-2xs"
                      title="Pilih langsung perawat yang bertugas sebagai PJ Shif Pagi"
                    >
                      <option value="">-- Pilih PJ Shif Pagi --</option>
                      {pagiNurses.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.name} {n.role === 'pj_shift' || (n.role as string) === 'katim' ? '(KATIM HD)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Table of Shift Pagi Nurses */}
              <div className="p-0 overflow-x-auto">
                {pagiNurses.length === 0 ? (
                  <div className="text-center py-8 px-4">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-2">
                      <Sun className="w-5 h-5" />
                    </div>
                    <h3 className="text-xs font-bold text-slate-800">
                      Tidak Ada Perawat di Shif Pagi
                    </h3>
                    <p className="text-[11px] text-slate-500 max-w-xs mx-auto mt-1 mb-3">
                      Tidak ada perawat yang aktif bertugas di Shif Pagi pada tanggal ini. Ganti dinas hanya bisa dilakukan pada matrik jadwal bulanan.
                    </p>
                    {onNavigate && (
                      <button
                        onClick={() => onNavigate('jadwal')}
                        className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition inline-flex items-center space-x-1.5 cursor-pointer active:scale-95"
                      >
                        <Calendar className="w-3.5 h-3.5" />
                        <span>Buka Matrik Jadwal Bulanan</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-emerald-50/60 border-b border-emerald-100 text-emerald-950 font-bold text-[11px]">
                        <th className="py-2.5 px-2.5 w-8 text-center">No</th>
                        <th className="py-2.5 px-2.5 min-w-[125px]">Perawat</th>
                        <th className="py-2.5 px-2.5">Input Tugas Khusus</th>
                        <th className="py-2.5 px-2.5 text-right min-w-[100px]">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {pagiNurses.map((nurse, idx) => {
                        // Get all tasks assigned to this nurse on this date and shift pagi
                        const nurseTasks = specialTasks.filter(
                          (t) =>
                            t.assignedToId === nurse.id &&
                            t.date === selectedDate &&
                            (!t.shift || t.shift === 'pagi')
                        );

                        const hasCito = nurseTasks.some((t) => t.category === 'cito');
                        const hasTasks = nurseTasks.length > 0;

                        return (
                          <tr
                            key={nurse.id}
                            className={`hover:bg-emerald-50/30 transition ${
                              hasTasks ? 'bg-emerald-50/15' : ''
                            }`}
                          >
                            {/* No */}
                            <td className="py-2.5 px-2 text-center font-bold text-slate-400 text-xs">
                              {idx + 1}
                            </td>

                            {/* Nama Perawat */}
                            <td className="py-2.5 px-2.5">
                              <div className="flex items-center space-x-2">
                                <div className="w-7 h-7 rounded-full bg-emerald-100 border border-emerald-200 text-emerald-800 font-bold text-[10px] flex items-center justify-center shrink-0">
                                  {nurse.name
                                    .split(' ')
                                    .filter((w) => !w.includes('.'))
                                    .map((n) => n[0])
                                    .slice(0, 2)
                                    .join('')}
                                </div>
                                <div className="min-w-0">
                                  <div className="font-bold text-slate-900 text-xs truncate flex items-center space-x-1">
                                    <span className="truncate">{nurse.name}</span>
                                    {nurse.id === currentUser.id && (
                                      <span className="text-[9px] bg-teal-100 text-teal-800 font-bold px-1 rounded shrink-0">
                                        Anda
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-emerald-700 font-medium truncate">
                                    {nurse.role === 'kepala_ruangan' ? 'Kepala Ruangan' : (nurse.role === 'pj_shift' || (nurse.role as string) === 'katim') ? 'KATIM HD' : 'Perawat HD'}
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* Kolom Tugas Khusus yang di-inputkan */}
                            <td className="py-2.5 px-2.5">
                              <div className="flex flex-wrap items-center gap-1">
                                {(['pj_shift', 'bhp', 'farmasi_logistik', 'natrium_ro', 'cito'] as SpecialTaskCategory[]).map(
                                  (cat) => {
                                    const def = SPECIAL_TASK_DEFINITIONS[cat];
                                    const isAssigned = nurseTasks.some((t) => t.category === cat);

                                    return (
                                      <button
                                        key={cat}
                                        type="button"
                                        disabled={!canManage}
                                        onClick={() => handleToggleTaskForNurse(nurse.id, 'pagi', cat)}
                                        className={`px-2 py-1 rounded-lg text-xs font-bold transition flex items-center space-x-1 shadow-2xs cursor-pointer ${
                                          isAssigned
                                            ? `${def.badgeBg} text-white ring-2 ring-offset-1 ring-slate-400 scale-[1.02]`
                                            : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                                        } ${!canManage ? 'cursor-default opacity-85' : 'active:scale-95'}`}
                                        title={`${isAssigned ? 'Klik untuk membatalkan' : 'Klik untuk menugaskan'} ${def.name}`}
                                      >
                                        {isAssigned ? (
                                          <Check className="w-3 h-3 text-white stroke-[3] shrink-0" />
                                        ) : (
                                          <Plus className="w-3 h-3 text-slate-400 shrink-0" />
                                        )}
                                        <span>{def.shortCode}</span>
                                      </button>
                                    );
                                  }
                                )}
                              </div>
                            </td>

                            {/* Rangkuman / Status & Aksi */}
                            <td className="py-2.5 px-2.5 text-right">
                              <div className="flex items-center justify-end space-x-1.5">
                                {hasTasks ? (
                                  <div className="flex flex-col items-end gap-0.5">
                                    <span
                                      className={`px-1.5 py-0.5 rounded font-bold text-[10px] ${
                                        nurseTasks.length >= 2
                                          ? 'bg-purple-100 text-purple-800 border border-purple-200'
                                          : 'bg-teal-100 text-teal-800 border border-teal-200'
                                      }`}
                                    >
                                      {nurseTasks.length} Tugas {nurseTasks.length >= 2 ? '(Rangkap)' : ''}
                                    </span>
                                    {hasCito && (
                                      <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-slate-900 text-white border border-slate-950">
                                        CITO Isolasi
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-slate-400 italic text-[10px] px-1.5 py-0.5 bg-slate-50 rounded">
                                    Pelaksana
                                  </span>
                                )}

                                {canManage && hasTasks && (
                                  <button
                                    onClick={() => handleClearAllTasksForNurse(nurse.id, 'pagi')}
                                    className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition shrink-0"
                                    title="Hapus semua tugas perawat ini di Shif Pagi"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* ======================================================== */}
            {/* SECTION 2: SHIF SIANG (13:30 - 20:30 WIB) - KOLOM KANAN   */}
            {/* ======================================================== */}
            <div className="bg-white rounded-2xl border border-pink-200 shadow-xs overflow-hidden flex flex-col">
              {/* Shift Header */}
              <div className="bg-gradient-to-r from-pink-600 to-rose-700 p-3.5 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="flex items-center space-x-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center backdrop-blur-xs shrink-0">
                    <Moon className="w-4 h-4 text-pink-200" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center space-x-1.5 flex-wrap">
                      <h2 className="text-sm font-bold tracking-tight">
                        Shif Siang
                      </h2>
                      <span className="px-2 py-0.5 rounded-full bg-pink-900/40 text-pink-100 text-[10px] font-bold border border-white/20">
                        13:30 - 20:30 WIB
                      </span>
                    </div>
                    <p className="text-[11px] text-pink-100 mt-0.5 truncate">
                      {siangNurses.length} Perawat Aktif (Sesuai Matrik Jadwal)
                    </p>
                  </div>
                </div>
                {canManage && siangNurses.length > 0 && (
                  <button
                    type="button"
                    onClick={() => handleAutoAssignStandardTemplate('siang')}
                    className="inline-flex items-center space-x-1.5 px-2.5 py-1.5 bg-white/20 hover:bg-white/30 active:scale-95 text-white rounded-xl text-[11px] font-bold transition border border-white/25 cursor-pointer shrink-0 shadow-xs"
                    title="Alokasikan otomatis 1 PJ Shift, 1 BHP, 1 Farmasi, 1 Natrium RO"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-pink-200" />
                    <span>Template Standar</span>
                  </button>
                )}
              </div>

              {/* Dedicated Bar: Penanggung Jawab Shif (PJ Shif) Siang */}
              <div className="bg-pink-50 border-b border-pink-200/80 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center space-x-2 min-w-0">
                  <span className="px-2 py-0.5 rounded-md bg-orange-500 text-white font-black text-[10px] tracking-wide uppercase shadow-2xs">
                    PJ Shif Siang
                  </span>
                  <span className="text-xs font-bold text-slate-800 truncate">
                    {currentPjSiang ? (
                      <span className="text-pink-950 font-extrabold">{currentPjSiang.name}</span>
                    ) : (
                      <span className="text-rose-700 italic font-medium">Belum Ditugaskan</span>
                    )}
                  </span>
                </div>
                {canManage && siangNurses.length > 0 && (
                  <div className="flex items-center space-x-1.5">
                    <span className="text-[10px] font-bold text-pink-950">Tetapkan:</span>
                    <select
                      value={currentPjSiang?.id || ''}
                      onChange={(e) => handleSetPjShiftForShift('siang', e.target.value)}
                      className="text-xs font-bold bg-white border border-pink-300 rounded-lg px-2 py-1 text-slate-800 focus:ring-2 focus:ring-pink-500 cursor-pointer shadow-2xs"
                      title="Pilih langsung perawat yang bertugas sebagai PJ Shif Siang"
                    >
                      <option value="">-- Pilih PJ Shif Siang --</option>
                      {siangNurses.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.name} {n.role === 'pj_shift' || (n.role as string) === 'katim' ? '(KATIM HD)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Table of Shift Siang Nurses */}
              <div className="p-0 overflow-x-auto">
                {siangNurses.length === 0 ? (
                  <div className="text-center py-8 px-4">
                    <div className="w-10 h-10 rounded-xl bg-pink-50 text-pink-600 flex items-center justify-center mx-auto mb-2">
                      <Moon className="w-5 h-5" />
                    </div>
                    <h3 className="text-xs font-bold text-slate-800">
                      Tidak Ada Perawat di Shif Siang
                    </h3>
                    <p className="text-[11px] text-slate-500 max-w-xs mx-auto mt-1 mb-3">
                      Tidak ada perawat yang aktif bertugas di Shif Siang pada tanggal ini. Ganti dinas hanya bisa dilakukan pada matrik jadwal bulanan.
                    </p>
                    {onNavigate && (
                      <button
                        onClick={() => onNavigate('jadwal')}
                        className="px-3.5 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-xl text-xs font-bold shadow-xs transition inline-flex items-center space-x-1.5 cursor-pointer active:scale-95"
                      >
                        <Calendar className="w-3.5 h-3.5" />
                        <span>Buka Matrik Jadwal Bulanan</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-pink-50/60 border-b border-pink-100 text-pink-950 font-bold text-[11px]">
                        <th className="py-2.5 px-2.5 w-8 text-center">No</th>
                        <th className="py-2.5 px-2.5 min-w-[125px]">Perawat</th>
                        <th className="py-2.5 px-2.5">Input Tugas Khusus</th>
                        <th className="py-2.5 px-2.5 text-right min-w-[100px]">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {siangNurses.map((nurse, idx) => {
                        // Get all tasks assigned to this nurse on this date and shift siang
                        const nurseTasks = specialTasks.filter(
                          (t) =>
                            t.assignedToId === nurse.id &&
                            t.date === selectedDate &&
                            (!t.shift || t.shift === 'siang')
                        );

                        const hasCito = nurseTasks.some((t) => t.category === 'cito');
                        const hasTasks = nurseTasks.length > 0;

                        return (
                          <tr
                            key={nurse.id}
                            className={`hover:bg-pink-50/30 transition ${
                              hasTasks ? 'bg-pink-50/15' : ''
                            }`}
                          >
                            {/* No */}
                            <td className="py-2.5 px-2 text-center font-bold text-slate-400 text-xs">
                              {idx + 1}
                            </td>

                            {/* Nama Perawat */}
                            <td className="py-2.5 px-2.5">
                              <div className="flex items-center space-x-2">
                                <div className="w-7 h-7 rounded-full bg-pink-100 border border-pink-200 text-pink-800 font-bold text-[10px] flex items-center justify-center shrink-0">
                                  {nurse.name
                                    .split(' ')
                                    .filter((w) => !w.includes('.'))
                                    .map((n) => n[0])
                                    .slice(0, 2)
                                    .join('')}
                                </div>
                                <div className="min-w-0">
                                  <div className="font-bold text-slate-900 text-xs truncate flex items-center space-x-1">
                                    <span className="truncate">{nurse.name}</span>
                                    {nurse.id === currentUser.id && (
                                      <span className="text-[9px] bg-teal-100 text-teal-800 font-bold px-1 rounded shrink-0">
                                        Anda
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-pink-700 font-medium truncate">
                                    {nurse.role === 'kepala_ruangan' ? 'Kepala Ruangan' : (nurse.role === 'pj_shift' || (nurse.role as string) === 'katim') ? 'KATIM HD' : 'Perawat HD'}
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* Kolom Tugas Khusus yang di-inputkan */}
                            <td className="py-2.5 px-2.5">
                              <div className="flex flex-wrap items-center gap-1">
                                {(['pj_shift', 'bhp', 'farmasi_logistik', 'natrium_ro', 'cito'] as SpecialTaskCategory[]).map(
                                  (cat) => {
                                    const def = SPECIAL_TASK_DEFINITIONS[cat];
                                    const isAssigned = nurseTasks.some((t) => t.category === cat);

                                    return (
                                      <button
                                        key={cat}
                                        type="button"
                                        disabled={!canManage}
                                        onClick={() => handleToggleTaskForNurse(nurse.id, 'siang', cat)}
                                        className={`px-2 py-1 rounded-lg text-xs font-bold transition flex items-center space-x-1 shadow-2xs cursor-pointer ${
                                          isAssigned
                                            ? `${def.badgeBg} text-white ring-2 ring-offset-1 ring-slate-400 scale-[1.02]`
                                            : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                                        } ${!canManage ? 'cursor-default opacity-85' : 'active:scale-95'}`}
                                        title={`${isAssigned ? 'Klik untuk membatalkan' : 'Klik untuk menugaskan'} ${def.name}`}
                                      >
                                        {isAssigned ? (
                                          <Check className="w-3 h-3 text-white stroke-[3] shrink-0" />
                                        ) : (
                                          <Plus className="w-3 h-3 text-slate-400 shrink-0" />
                                        )}
                                        <span>{def.shortCode}</span>
                                      </button>
                                    );
                                  }
                                )}
                              </div>
                            </td>

                            {/* Rangkuman / Status & Aksi */}
                            <td className="py-2.5 px-2.5 text-right">
                              <div className="flex items-center justify-end space-x-1.5">
                                {hasTasks ? (
                                  <div className="flex flex-col items-end gap-0.5">
                                    <span
                                      className={`px-1.5 py-0.5 rounded font-bold text-[10px] ${
                                        nurseTasks.length >= 2
                                          ? 'bg-purple-100 text-purple-800 border border-purple-200'
                                          : 'bg-pink-100 text-pink-800 border border-pink-200'
                                      }`}
                                    >
                                      {nurseTasks.length} Tugas {nurseTasks.length >= 2 ? '(Rangkap)' : ''}
                                    </span>
                                    {hasCito && (
                                      <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-slate-900 text-white border border-slate-950">
                                        CITO Isolasi
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-slate-400 italic text-[10px] px-1.5 py-0.5 bg-slate-50 rounded">
                                    Pelaksana
                                  </span>
                                )}

                                {canManage && hasTasks && (
                                  <button
                                    onClick={() => handleClearAllTasksForNurse(nurse.id, 'siang')}
                                    className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition shrink-0"
                                    title="Hapus semua tugas perawat ini di Shif Siang"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: RIWAYAT & DAFTAR SEMUA TUGAS (HISTORY / AUDIT) */}
      {activeView === 'history' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cari tugas atau nama..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-xl w-48 focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <select
                value={historyCategoryFilter}
                onChange={(e) => setHistoryCategoryFilter(e.target.value)}
                className="text-xs font-semibold px-2.5 py-1.5 border border-slate-200 rounded-xl bg-slate-50"
              >
                <option value="all">Semua Kategori Pos</option>
                {(['pj_shift', 'bhp', 'farmasi_logistik', 'natrium_ro', 'cito'] as SpecialTaskCategory[]).map(
                  (cat) => {
                    const def = SPECIAL_TASK_DEFINITIONS[cat];
                    return (
                      <option key={cat} value={cat}>
                        {def.shortCode} - {def.name}
                      </option>
                    );
                  }
                )}
              </select>

              <select
                value={historyShiftFilter}
                onChange={(e) => setHistoryShiftFilter(e.target.value)}
                className="text-xs font-semibold px-2.5 py-1.5 border border-slate-200 rounded-xl bg-slate-50"
              >
                <option value="all">Semua Shift</option>
                <option value="pagi">Shift Pagi</option>
                <option value="siang">Shift Siang</option>
              </select>

              <select
                value={historyStaffFilter}
                onChange={(e) => setHistoryStaffFilter(e.target.value)}
                className="text-xs font-semibold px-2.5 py-1.5 border border-slate-200 rounded-xl bg-slate-50"
              >
                <option value="all">Semua Staf Perawat</option>
                {activeNurses.map((staff) => (
                  <option key={staff.id} value={staff.id}>
                    {staff.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-500">
                Total {filteredHistoryTasks.length} Tugas Tercatat
              </span>
              {canManage && specialTasks.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setClearScope(filteredHistoryTasks.length < specialTasks.length ? 'filtered' : 'all');
                    setShowClearAllModal(true);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition flex items-center space-x-1.5 shadow-2xs cursor-pointer active:scale-95"
                  title="Hapus riwayat tugas khusus di sistem dan Google Sheet"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                  <span>Hapus Semua Riwayat</span>
                </button>
              )}
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            {filteredHistoryTasks.length === 0 ? (
              <div className="text-center py-12 text-xs text-slate-400">
                Tidak ada data tugas khusus yang sesuai filter.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                      <th className="p-3">Pos Tugas</th>
                      <th className="p-3">Perawat Ditugaskan</th>
                      <th className="p-3">Tanggal &amp; Shif</th>
                      <th className="p-3">Deskripsi / Instruksi</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Pemberi Tugas</th>
                      <th className="p-3 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredHistoryTasks.map((task) => {
                      const emp = employees.find((e) => e.id === task.assignedToId);
                      const def = SPECIAL_TASK_DEFINITIONS[task.category];
                      const isAssignedToMe = task.assignedToId === currentUser.id;

                      return (
                        <tr key={task.id} className="hover:bg-slate-50 transition">
                          <td className="p-3">
                            <span
                              className={`px-2 py-0.5 rounded font-bold text-[10px] text-white shadow-2xs ${
                                def?.badgeBg || 'bg-slate-600'
                              }`}
                            >
                              {def?.shortCode} - {def?.name}
                            </span>
                          </td>
                          <td className="p-3 font-bold text-slate-800">
                            {emp?.name || 'Staf HD'}
                          </td>
                          <td className="p-3 text-slate-700">
                            <div>{task.date}</div>
                            <span
                              className={`inline-block mt-0.5 px-1.5 py-0.2 rounded text-[9px] font-bold ${
                                task.shift === 'pagi'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-pink-100 text-pink-800'
                              }`}
                            >
                              Shift {task.shift?.toUpperCase()}
                            </span>
                          </td>
                          <td className="p-3 text-slate-600 max-w-xs">
                            <div className="line-clamp-2">{task.description}</div>
                            {task.completionNotes && (
                              <div className="mt-1 text-[11px] text-emerald-700 italic bg-emerald-50 p-1.5 rounded-md border border-emerald-200">
                                Catatan Selesai: {task.completionNotes}
                              </div>
                            )}
                          </td>
                          <td className="p-3">
                            {task.status === 'completed' ? (
                              <span className="inline-flex items-center space-x-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full text-[10px] font-bold border border-emerald-200">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Selesai</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center space-x-1 text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full text-[10px] font-bold border border-amber-200">
                                <Clock className="w-3 h-3" />
                                <span>Berlangsung</span>
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-slate-500 text-[11px]">
                            {task.assignedByName}
                          </td>
                          <td className="p-3 text-right space-x-1.5">
                            {task.status !== 'completed' && (isAssignedToMe || canManage) && (
                              <button
                                onClick={() => setCompleteModal(task)}
                                className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] shadow-2xs transition"
                              >
                                Verifikasi Selesai
                              </button>
                            )}
                            {canManage && (
                              <button
                                id={`btn-delete-task-${task.id}`}
                                onClick={() => setDeleteModalTask(task)}
                                className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                                title="Hapus tugas khusus ini"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 1: TAMBAH TUGAS CUSTOM                             */}
      {/* ======================================================== */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-lg bg-teal-100 text-teal-700 flex items-center justify-center">
                  <Plus className="w-4 h-4" />
                </div>
                <h2 className="text-base font-bold text-slate-900">
                  Input Manual Tugas Khusus
                </h2>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveIndividualTask} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Tanggal Tugas:</label>
                  <input
                    type="date"
                    value={taskForm.date}
                    onChange={(e) => setTaskForm({ ...taskForm, date: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 font-semibold"
                    required
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Shift:</label>
                  <select
                    value={taskForm.shift}
                    onChange={(e) => setTaskForm({ ...taskForm, shift: e.target.value as any })}
                    className="w-full p-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 font-semibold"
                  >
                    <option value="pagi">Shift Pagi (07:00 - 14:00)</option>
                    <option value="siang">Shift Siang (13:30 - 20:30)</option>
                  </select>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-bold text-slate-700">
                    Pilih Perawat Aktif:
                  </label>
                  <span className="text-[10px] text-slate-400">
                    (Perawat aktif pada {taskForm.shift === 'pagi' ? 'Shif Pagi' : 'Shif Siang'})
                  </span>
                </div>
                {(() => {
                  const normalizedShift = taskForm.shift.toLowerCase();
                  const onShiftNurses = activeNurses.filter((n) => {
                    const s = String(getEffectiveShift(n, taskForm.date) || '').toLowerCase();
                    return s === normalizedShift || s.startsWith(normalizedShift);
                  });
                  const otherNurses = activeNurses.filter((n) => !onShiftNurses.some((sn) => sn.id === n.id));

                  return (
                    <select
                      value={taskForm.assignedToId}
                      onChange={(e) => setTaskForm({ ...taskForm, assignedToId: e.target.value })}
                      className="w-full p-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 font-semibold bg-white"
                      required
                    >
                      <option value="">-- Pilih Perawat ({activeNurses.length} Staf) --</option>
                      {onShiftNurses.length > 0 && (
                        <optgroup label={`Bertugas di Shift ${taskForm.shift.toUpperCase()} (${onShiftNurses.length} Staf)`}>
                          {onShiftNurses.map((emp) => (
                            <option key={emp.id} value={emp.id}>
                              {emp.name} {emp.role === 'kepala_ruangan' ? '(Karu)' : emp.role === 'pj_shift' ? '(KATIM)' : ''}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {otherNurses.length > 0 && (
                        <optgroup label={`Perawat Lainnya / Staf Cadangan (${otherNurses.length} Staf)`}>
                          {otherNurses.map((emp) => {
                            const curShift = getEffectiveShift(emp, taskForm.date);
                            return (
                              <option key={emp.id} value={emp.id}>
                                {emp.name} ({curShift.toUpperCase()})
                              </option>
                            );
                          })}
                        </optgroup>
                      )}
                    </select>
                  );
                })()}
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1.5">
                  Pilih Kategori Pos Tugas (Bisa pilih lebih dari 1):
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {(['pj_shift', 'bhp', 'farmasi_logistik', 'natrium_ro', 'cito'] as SpecialTaskCategory[]).map((cat) => {
                    const def = SPECIAL_TASK_DEFINITIONS[cat];
                    const isChecked = taskForm.categories.includes(cat);
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => {
                          const exists = taskForm.categories.includes(cat);
                          if (exists) {
                            if (taskForm.categories.length > 1) {
                              setTaskForm({
                                ...taskForm,
                                categories: taskForm.categories.filter((c) => c !== cat),
                              });
                            }
                          } else {
                            setTaskForm({
                              ...taskForm,
                              categories: [...taskForm.categories, cat],
                            });
                          }
                        }}
                        className={`p-2 rounded-xl text-left border text-xs font-bold transition flex items-center justify-between ${
                          isChecked
                            ? `${def.lightBg} ${def.lightText} ${def.lightBorder} ring-2 ring-teal-500`
                            : 'bg-slate-50 border-slate-200 text-slate-600'
                        }`}
                      >
                        <span>{def.shortCode} - {def.name}</span>
                        {isChecked && <Check className="w-3.5 h-3.5 text-teal-600" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Deskripsi / Instruksi Tambahan (Opsional):
                </label>
                <textarea
                  value={taskForm.description}
                  onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                  placeholder="Misal: Siapkan dialyzer high-flux dan cek TDS mesin..."
                  rows={2}
                  className="w-full p-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-600 border border-slate-300 rounded-xl hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl shadow-xs transition"
                >
                  Simpan Tugas
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 2: VERIFIKASI SELESAI                              */}
      {/* ======================================================== */}
      {completeModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <h3 className="text-sm font-bold text-slate-900 mb-2 flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Verifikasi Penyelesaian Tugas</span>
            </h3>
            <p className="text-xs text-slate-600 mb-4">
              Konfirmasi penyelesaian tugas <strong>"{completeModal.title}"</strong> untuk{' '}
              {employees.find((e) => e.id === completeModal.assignedToId)?.name}.
            </p>

            <div className="mb-4">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Catatan Hasil / Temuan (Opsional):
              </label>
              <textarea
                value={completionNote}
                onChange={(e) => setCompletionNote(e.target.value)}
                placeholder="Misal: TDS normal 4 ppm, klorin 0 ppm, BHP terpenuhi..."
                rows={2}
                className="w-full text-xs p-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div className="flex items-center justify-end space-x-2">
              <button
                onClick={() => setCompleteModal(null)}
                className="px-3 py-1.5 text-xs text-slate-600 font-semibold border rounded-xl"
              >
                Batal
              </button>
              <button
                onClick={handleCompleteTask}
                className="px-4 py-1.5 text-xs text-white font-bold bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs"
              >
                Tandai Selesai
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 3: KONFIRMASI HAPUS TUGAS                          */}
      {/* ======================================================== */}
      {deleteModalTask && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start space-x-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-slate-900">
                  Hapus Tugas Khusus?
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tugas ini akan dihapus dan warna lencana pada matriks jadwal/shift akan segera dihilangkan.
                </p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 text-xs space-y-2 mb-5">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Kategori Tugas:</span>
                {(() => {
                  const def = SPECIAL_TASK_DEFINITIONS[deleteModalTask.category];
                  return (
                    <span className={`px-2 py-0.5 rounded text-[11px] font-bold text-white ${def?.badgeBg || 'bg-teal-600'}`}>
                      {def?.shortCode} - {def?.name}
                    </span>
                  );
                })()}
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Staf Ditugaskan:</span>
                <span className="font-bold text-slate-800">
                  {employees.find((e) => e.id === deleteModalTask.assignedToId)?.name || 'Staf HD'}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Tanggal &amp; Shift:</span>
                <span className="font-bold text-slate-700">
                  {deleteModalTask.date} (Shift {deleteModalTask.shift.toUpperCase()})
                </span>
              </div>

              {deleteModalTask.description && (
                <div className="pt-2 border-t border-slate-200/80">
                  <span className="text-slate-500 font-medium block mb-0.5">Catatan Instruksi:</span>
                  <p className="text-slate-700 italic bg-white p-2 rounded-lg border border-slate-200">
                    "{deleteModalTask.description}"
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end space-x-2.5">
              <button
                type="button"
                onClick={() => setDeleteModalTask(null)}
                className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-xs flex items-center space-x-1.5 transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Ya, Hapus Tugas</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL KONFIRMASI HAPUS RIWAYAT TUGAS KHUSUS */}
      {showClearAllModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-rose-200 animate-in fade-in zoom-in duration-150">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-4 border border-rose-200 shadow-2xs">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-extrabold text-slate-900 text-center">
              Hapus Riwayat Tugas Khusus
            </h3>

            {filteredHistoryTasks.length < specialTasks.length ? (
              <div className="mt-3 space-y-2.5">
                <p className="text-xs text-slate-600 text-center leading-relaxed">
                  Filter sedang aktif. Tentukan cakupan riwayat tugas yang ingin dihapus:
                </p>
                <div className="space-y-2 pt-1">
                  <label
                    onClick={() => setClearScope('filtered')}
                    className={`flex items-start p-3 rounded-xl border text-xs cursor-pointer transition ${
                      clearScope === 'filtered'
                        ? 'border-rose-500 bg-rose-50/80 text-rose-900 font-bold'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="clearScope"
                      checked={clearScope === 'filtered'}
                      onChange={() => setClearScope('filtered')}
                      className="mt-0.5 mr-2.5 text-rose-600 focus:ring-rose-500 cursor-pointer"
                    />
                    <div>
                      <div>Hapus Hasil Filter Saja ({filteredHistoryTasks.length} tugas)</div>
                      <div className="text-[11px] font-normal text-slate-500 mt-0.5">
                        Hanya menghapus {filteredHistoryTasks.length} tugas yang saat ini tampil pada tabel filter.
                      </div>
                    </div>
                  </label>
                  <label
                    onClick={() => setClearScope('all')}
                    className={`flex items-start p-3 rounded-xl border text-xs cursor-pointer transition ${
                      clearScope === 'all'
                        ? 'border-rose-500 bg-rose-50/80 text-rose-900 font-bold'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="clearScope"
                      checked={clearScope === 'all'}
                      onChange={() => setClearScope('all')}
                      className="mt-0.5 mr-2.5 text-rose-600 focus:ring-rose-500 cursor-pointer"
                    />
                    <div>
                      <div>Hapus Seluruh Riwayat Sistem ({specialTasks.length} tugas)</div>
                      <div className="text-[11px] font-normal text-slate-500 mt-0.5">
                        Mengosongkan semua data riwayat tugas khusus di database &amp; Google Sheet.
                      </div>
                    </div>
                  </label>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-600 text-center mt-2 leading-relaxed">
                Apakah Anda yakin ingin menghapus <strong>seluruh riwayat penugasan tugas khusus ({specialTasks.length} catatan)</strong>?
              </p>
            )}

            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 my-4 text-xs text-rose-800 space-y-1">
              <div className="font-bold flex items-center space-x-1.5 text-rose-900">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-600" />
                <span>Pembersihan Database &amp; Cloud:</span>
              </div>
              <ul className="list-disc list-inside space-y-0.5 text-[11px] text-rose-700 pl-1 leading-relaxed">
                <li>Data yang dihapus akan langsung dibersihkan dari penyimpanan lokal dan database cloud Firestore.</li>
                {clearScope === 'all' && (
                  <li>Tab <strong>"Jadwal Tugas Khusus"</strong> di Google Sheet yang terhubung akan dikosongkan.</li>
                )}
              </ul>
            </div>
            <div className="flex items-center space-x-2 pt-2">
              <button
                type="button"
                disabled={isClearingAll}
                onClick={() => setShowClearAllModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 font-bold text-xs transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isClearingAll}
                onClick={() => handleClearHistory(clearScope)}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-xs transition cursor-pointer flex items-center justify-center space-x-1.5 active:scale-95 disabled:opacity-50"
              >
                {isClearingAll ? (
                  <>
                    <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                    <span>Menghapus...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>
                      {clearScope === 'filtered' && filteredHistoryTasks.length < specialTasks.length
                        ? `Hapus ${filteredHistoryTasks.length} Tugas`
                        : 'Ya, Hapus Semua'}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TOAST NOTIFICATION                                       */}
      {/* ======================================================== */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-xl flex items-center space-x-3 text-xs border border-slate-700 animate-in slide-in-from-bottom-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="font-medium">{toastMessage}</span>
          <button
            onClick={() => setToastMessage(null)}
            className="text-slate-400 hover:text-white p-0.5 rounded transition"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
