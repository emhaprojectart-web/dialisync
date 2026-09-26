import React, { useState, useMemo, useEffect } from 'react';
import { 
  UserAccount, 
  ShiftSchedule, 
  ShiftType, 
  SHIFT_DEFINITIONS,
  SpecialTask,
  SpecialTaskCategory,
  SPECIAL_TASK_DEFINITIONS,
  HDMachine,
  MachineAssignment,
  AppSettings,
  Machine,
  Nurse,
  ShiftAssignment
} from '../types';
import { 
  getDaysInMonth, 
  generateMonthlySchedule,
  sortNursesByShiftScheduleOrder,
  getEffectiveShiftForEmployee,
  getTodayDateString
} from '../utils/scheduler';
import { 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  Sparkles, 
  Printer, 
  Filter, 
  Edit3, 
  Check, 
  X, 
  RotateCcw,
  AlertCircle,
  Clock,
  Info,
  UserCheck,
  Users,
  Stethoscope,
  HeartPulse,
  AlertTriangle,
  Sun,
  Moon,
  Zap,
  CheckCircle2,
  Phone,
  ArrowRight,
  ListFilter,
  FileDown,
  Download,
  Loader2,
  Share2,
  ExternalLink,
  RefreshCw,
  Search,
  ArrowLeftRight,
  Trash2,
  BarChart3,
  MessageCircle
} from 'lucide-react';
import { exportScheduleToPdf, printScheduleDirectly } from '../utils/pdfExport';
import { storage } from '../utils/storage';
import { ImportScheduleModal } from './ImportScheduleModal';
import { GoogleScriptGuideModal } from './GoogleScriptGuideModal';
import { RegenerateMachineAllocationModal } from './RegenerateMachineAllocationModal';
import { HeadNurseReportModal } from './HeadNurseReportModal';
import { EmployeeWhatsAppModal } from './EmployeeWhatsAppModal';
import { SpecialDutyBadge } from './SpecialDutyBadge';
import { GoogleSheetsService } from '../domain/GoogleSheetsService';
import { FairSchedulerEngine } from '../domain/FairSchedulerEngine';
import { prepareSyncPayload, pushToGoogleSheets } from '../utils/googleSheetsSyncHelper';
import { exportMonthToExcel } from '../utils/excelExport';

interface ScheduleViewProps {
  currentUser: UserAccount;
  employees: UserAccount[];
  schedules: ShiftSchedule[];
  specialTasks: SpecialTask[];
  onUpdateSchedule: (newSchedules: ShiftSchedule[]) => void;
  machines?: HDMachine[];
  machineAssignments?: MachineAssignment[];
  onUpdateMachineAssignments?: (newAssignments: MachineAssignment[]) => void;
  onUpdateSpecialTasks?: (newTasks: SpecialTask[]) => void;
  settings?: AppSettings;
  onUpdateSettings?: (newSettings: AppSettings) => void;
}

export const ScheduleView: React.FC<ScheduleViewProps> = ({
  currentUser,
  employees,
  schedules,
  specialTasks,
  onUpdateSchedule,
  machines = [],
  machineAssignments = [],
  onUpdateMachineAssignments,
  onUpdateSpecialTasks,
  settings,
  onUpdateSettings,
}) => {
  // Current active month (0-indexed: 8 = September 2026)
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [selectedMonth, setSelectedMonth] = useState<number>(8); // September

  // Active Schedule Tab: 'perawat' for full page nurse schedule, 'dokter' for separate dedicated doctor tab
  const [activeScheduleTab, setActiveScheduleTab] = useState<'perawat' | 'dokter'>('perawat');

  // Filter state
  const [roleFilter, setRoleFilter] = useState<'all' | 'mine' | 'kepala_ruangan' | 'pj_shift' | 'dokter' | 'perawat'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals state
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetScope, setResetScope] = useState<'month' | 'all'>('month');
  const [preserveOverrides, setPreserveOverrides] = useState(true);
  const [editingCell, setEditingCell] = useState<{ 
    employeeId: string; 
    dateStr: string; 
    currentShift: ShiftType; 
    note?: string;
    specialDutyCategories?: SpecialTaskCategory[];
  } | null>(null);

  // New Modals state from reference repo
  const [showImportModal, setShowImportModal] = useState(false);
  const [showGoogleScriptModal, setShowGoogleScriptModal] = useState(false);
  const [showRegenerateAllocationModal, setShowRegenerateAllocationModal] = useState(false);
  const [showHeadNurseReportModal, setShowHeadNurseReportModal] = useState(false);
  const [selectedEmployeeForWA, setSelectedEmployeeForWA] = useState<{
    employee: UserAccount;
    dateStr: string;
    shift?: ShiftType;
  } | null>(null);
  const [isSyncingSheets, setIsSyncingSheets] = useState(false);
  const [activeDateForReport, setActiveDateForReport] = useState<string>(() => getTodayDateString());

  // Doctor Scheduling state (Dedicated Full Month Overview)
  const [doctorMonthFilter, setDoctorMonthFilter] = useState<'all' | 'workdays' | 'sundays' | 'incomplete'>('all');
  const [doctorSearchQuery, setDoctorSearchQuery] = useState<string>('');
  const [showDoctorPatternModal, setShowDoctorPatternModal] = useState<boolean>(false);
  const [doctorPagiPattern, setDoctorPagiPattern] = useState<string>('emp-dr-reza');
  const [doctorSiangPattern, setDoctorSiangPattern] = useState<string>('emp-dr-paramitha');
  const [doctorPatternMode, setDoctorPatternMode] = useState<'fixed' | 'alternating'>('fixed');

  // Print and PDF Export state
  const [showPrintModal, setShowPrintModal] = useState<boolean>(false);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const [printScope, setPrintScope] = useState<'all' | 'perawat' | 'dokter'>('all');

  // In-app Notification Toast State
  const [scheduleToast, setScheduleToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showScheduleToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setScheduleToast({ message, type });
    setTimeout(() => {
      setScheduleToast(null);
    }, 4500);
  };

  // Days in selected month
  const days = getDaysInMonth(selectedYear, selectedMonth);

  // Month prefix string: e.g. "2026-09"
  const monthPrefix = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;

  // Listen for month selection changes from HeaderGoogleSheetSync or other parts
  useEffect(() => {
    const handleMonthEvent = (e: any) => {
      const pfx = e.detail?.monthPrefix;
      if (pfx && typeof pfx === 'string' && pfx.includes('-')) {
        const [y, m] = pfx.split('-');
        const yNum = parseInt(y, 10);
        const mNum = parseInt(m, 10) - 1;
        if (!isNaN(yNum) && !isNaN(mNum) && mNum >= 0 && mNum <= 11) {
          setSelectedYear(yNum);
          setSelectedMonth(mNum);
        }
      }
    };
    window.addEventListener('hd_month_changed', handleMonthEvent);
    return () => {
      window.removeEventListener('hd_month_changed', handleMonthEvent);
    };
  }, []);

  const effectiveSettings = useMemo(() => {
    return settings || storage.getSettings();
  }, [settings]);

  // Domain adapted machines & nurses
  const domainMachines: Machine[] = useMemo(() => {
    return (machines || []).map((m, idx) => ({
      id: isNaN(Number(m.id)) ? idx + 1 : Number(m.id),
      code: m.code,
      name: `Mesin HD ${m.code}`,
      brandModel: (m as any).brandModel || m.model || 'Nipro / Fresenius',
      category: ((m as any).category || 'REGULER') as any,
      status: (m.status === 'siap' || m.status === 'dipakai' || m.status === 'AKTIF') ? 'AKTIF' : (m.status === 'maintenance' || m.status === 'MAINTENANCE') ? 'MAINTENANCE' : 'RUSAK',
      bay: m.bay || m.zone || 'Bay A',
      operationalShift: (m as any).operationalShift || 'ALL',
      notes: m.notes,
    }));
  }, [machines]);

  const domainNurses: Nurse[] = useMemo(() => {
    return employees
      .filter((e) => e.role !== 'dokter')
      .map((e, idx) => ({
        id: isNaN(Number(e.id)) ? idx + 1 : Number(e.id),
        name: e.name,
        nip: e.nip,
        phone: e.phone,
        role: e.role === 'kepala_ruangan' ? 'KARU' : e.role === 'pj_shift' ? 'KATIM' : 'PELAKSANA',
        isActive: e.status === 'aktif',
        skillLevel: e.skillLevel || 'Senior',
        specialDuty: e.specialDuty,
      }));
  }, [employees]);

  // Domain monthly assignments
  const domainMonthlyAssignments: ShiftAssignment[] = useMemo(() => {
    return schedules
      .filter((s) => s.date.startsWith(monthPrefix))
      .map((s, idx) => {
        const emp = employees.find((e) => e.id === s.employeeId);
        const st = s.shift === 'pagi' ? 'PAGI' : s.shift === 'siang' ? 'SIANG' : 'LIBUR';
        const assignedIds = (machineAssignments || [])
          .filter((ma) => (ma.nurseId === s.employeeId || (ma as any).employeeId === s.employeeId) && ma.date === s.date)
          .map((ma) => ma.machineId);

        const hasPjTask = (specialTasks || []).some(
          (t) =>
            t.assignedToId === s.employeeId &&
            t.date === s.date &&
            (!t.shift || t.shift === s.shift) &&
            t.category === 'pj_shift'
        );
        const isLeader = hasPjTask || (emp?.specialDuty?.toUpperCase().includes('PJ') ?? false);
        const resolvedDuty = hasPjTask
          ? emp?.specialDuty ? `${emp.specialDuty}, PJ SHIF` : 'PJ SHIF'
          : emp?.specialDuty || null;

        return {
          id: s.id,
          date: s.date,
          nurseId: isNaN(Number(s.employeeId)) ? idx + 1 : Number(s.employeeId),
          nurseName: emp?.name || s.employeeId,
          nursePhone: emp?.phone || '',
          shiftType: st as any,
          assignedMachineIds: assignedIds,
          isLeader,
          isWhatsAppSent: false,
          notes: s.note || '',
          specialDuty: resolvedDuty,
        };
      });
  }, [schedules, employees, machineAssignments, monthPrefix, specialTasks]);

  // Daily assignments for HeadNurseReportModal
  const currentDailyAssignments: ShiftAssignment[] = useMemo(() => {
    const effectiveDate = days.find((d) => d.dateStr === activeDateForReport)?.dateStr || days[0]?.dateStr || getTodayDateString();

    return schedules
      .filter((s) => s.date === effectiveDate)
      .map((s, idx) => {
        const emp = employees.find((e) => e.id === s.employeeId);
        const st = s.shift === 'pagi' ? 'PAGI' : s.shift === 'siang' ? 'SIANG' : 'LIBUR';
        const assignedIds = (machineAssignments || [])
          .filter((ma) => (ma.nurseId === s.employeeId || (ma as any).employeeId === s.employeeId) && ma.date === effectiveDate)
          .map((ma) => ma.machineId);

        const hasPjTask = (specialTasks || []).some(
          (t) =>
            t.assignedToId === s.employeeId &&
            t.date === effectiveDate &&
            (!t.shift || t.shift === s.shift) &&
            t.category === 'pj_shift'
        );
        const isLeader = hasPjTask || (emp?.specialDuty?.toUpperCase().includes('PJ') ?? false);
        const resolvedDuty = hasPjTask
          ? emp?.specialDuty ? `${emp.specialDuty}, PJ SHIF` : 'PJ SHIF'
          : emp?.specialDuty || null;

        return {
          id: s.id,
          date: s.date,
          nurseId: isNaN(Number(s.employeeId)) ? idx + 1 : Number(s.employeeId),
          nurseName: emp?.name || s.employeeId,
          nursePhone: emp?.phone || '',
          shiftType: st as any,
          assignedMachineIds: assignedIds,
          isLeader,
          isWhatsAppSent: false,
          notes: s.note || '',
          specialDuty: resolvedDuty,
        };
      });
  }, [schedules, employees, machineAssignments, activeDateForReport, days, specialTasks]);

  const handleImportCompleted = (
    importedAssignments: ShiftAssignment[],
    targetMonth: string,
    replaceExisting: boolean = true
  ) => {
    const newShiftSchedules: ShiftSchedule[] = importedAssignments.map((a) => {
      const emp = employees.find(
        (e) => String(e.id) === String(a.nurseId) || e.name.toLowerCase() === a.nurseName.toLowerCase()
      );
      const employeeId = emp ? emp.id : String(a.nurseId);
      let shiftLower: ShiftType = 'pagi';
      const st = (a.shiftType || '').toLowerCase();
      if (st.includes('pagi') && st.includes('siang')) shiftLower = 'pagi_siang';
      else if (st === 'siang') shiftLower = 'siang';
      else if (st === 'pagi') shiftLower = 'pagi';
      else if (st === 'libur') shiftLower = 'libur';
      else if (st === 'cuti') shiftLower = 'cuti';
      else if (st === 'izin') shiftLower = 'izin';
      else if (st === 'sakit') shiftLower = 'sakit';

      return {
        id: `${employeeId}_${a.date}`,
        employeeId,
        date: a.date,
        shift: shiftLower,
        isCustomOverride: true,
      };
    });

    let updatedSchedules = [...schedules];
    if (replaceExisting) {
      updatedSchedules = updatedSchedules.filter((s) => !s.date.startsWith(targetMonth));
    }
    onUpdateSchedule([...updatedSchedules, ...newShiftSchedules]);

    if (onUpdateMachineAssignments) {
      const newMachineAssignments: MachineAssignment[] = [];
      importedAssignments.forEach((a) => {
        if (a.assignedMachineIds && a.assignedMachineIds.length > 0) {
          const emp = employees.find(
            (e) => String(e.id) === String(a.nurseId) || e.name.toLowerCase() === a.nurseName.toLowerCase()
          );
          const employeeId = emp ? emp.id : String(a.nurseId);
          const shiftStr: 'pagi' | 'siang' = (a.shiftType || '').toLowerCase() === 'siang' ? 'siang' : 'pagi';

          a.assignedMachineIds.forEach((mId) => {
            const rawIdStr = String(mId).trim();
            const cleanDigits = rawIdStr.replace(/^MACH-/i, '').replace(/^M/i, '').trim();
            const matchedMachine = machines.find((mach) =>
              mach.id === rawIdStr ||
              mach.id === `MACH-${rawIdStr}` ||
              mach.id === `MACH-${cleanDigits}` ||
              mach.code.toLowerCase() === rawIdStr.toLowerCase() ||
              mach.id.replace(/^MACH-/i, '') === cleanDigits
            );
            const actualMachineId = matchedMachine ? matchedMachine.id : (rawIdStr.startsWith('MACH-') ? rawIdStr : `MACH-${rawIdStr}`);

            newMachineAssignments.push({
              id: `${employeeId}_${a.date}_${shiftStr}_${actualMachineId}`,
              machineId: actualMachineId,
              nurseId: employeeId,
              date: a.date,
              shift: shiftStr,
            });
          });
        }
      });

      let updatedMA = [...(machineAssignments || [])];
      if (replaceExisting) {
        updatedMA = updatedMA.filter((m) => !m.date.startsWith(targetMonth));
      }
      onUpdateMachineAssignments([...updatedMA, ...newMachineAssignments]);
    }

    if (onUpdateSpecialTasks) {
      const newTasks: SpecialTask[] = [];
      importedAssignments.forEach((a) => {
        if (a.specialDuty && a.specialDuty.trim()) {
          const emp = employees.find(
            (e) => String(e.id) === String(a.nurseId) || e.name.toLowerCase() === a.nurseName.toLowerCase()
          );
          const employeeId = emp ? emp.id : String(a.nurseId);
          const shiftVal: 'pagi' | 'siang' = (a.shiftType || '').toLowerCase().includes('siang') ? 'siang' : 'pagi';
          const dutyStr = a.specialDuty.trim().toLowerCase();
          // Tugas Khusus PJ Shift diinput secara manual oleh user, tidak diimpor otomatis
          if (dutyStr.includes('pj') || dutyStr.includes('katim') || dutyStr.includes('karu') || dutyStr.includes('supervisi')) {
            return;
          }
          let category: SpecialTaskCategory = 'bhp';
          if (dutyStr.includes('bhp') || dutyStr.includes('sterilisasi') || dutyStr.includes('instrumen')) {
            category = 'bhp';
          } else if (dutyStr.includes('farm') || dutyStr.includes('logistik') || dutyStr.includes('obat') || dutyStr.includes('cairan')) {
            category = 'farmasi_logistik';
          } else if (dutyStr.includes('ro') || dutyStr.includes('water') || dutyStr.includes('natrium')) {
            category = 'natrium_ro';
          } else if (dutyStr.includes('cito') || dutyStr.includes('isolasi') || dutyStr.includes('darurat') || dutyStr.includes('emergency')) {
            category = 'cito';
          }

          newTasks.push({
            id: `task_${employeeId}_${a.date}_${Math.random().toString(36).substring(2, 7)}`,
            title: `Tugas: ${a.specialDuty.trim()}`,
            description: `Tugas khusus ${a.specialDuty} dari impor jadwal`,
            assignedToId: employeeId,
            assignedByName: currentUser?.name || 'Sistem Impor',
            date: a.date,
            shift: shiftVal,
            priority: category === 'cito' ? 'mendesak' : 'normal',
            status: 'pending',
            category,
            createdAt: new Date().toISOString().replace('T', ' ').substring(0, 16),
          });
        }
      });
      if (newTasks.length > 0) {
        let updatedTasks = [...(specialTasks || [])];
        if (replaceExisting) {
          updatedTasks = updatedTasks.filter((t) => !t.date.startsWith(targetMonth));
        }
        onUpdateSpecialTasks([...updatedTasks, ...newTasks]);
      }
    }
  };

  const handleReallocationCompleted = (
    updatedAssignments: ShiftAssignment[],
    summaryMessage: string
  ) => {
    if (onUpdateMachineAssignments) {
      const newMachineAssignments: MachineAssignment[] = [];
      updatedAssignments.forEach((a) => {
        if (a.assignedMachineIds && a.assignedMachineIds.length > 0) {
          const emp = employees.find(
            (e) => String(e.id) === String(a.nurseId) || e.name.toLowerCase() === a.nurseName.toLowerCase()
          );
          const employeeId = emp ? emp.id : String(a.nurseId);
          const shiftStr: 'pagi' | 'siang' = (a.shiftType || '').toLowerCase() === 'siang' ? 'siang' : 'pagi';

          a.assignedMachineIds.forEach((mId) => {
            newMachineAssignments.push({
              id: `${employeeId}_${a.date}_${shiftStr}_${mId}`,
              machineId: String(mId),
              nurseId: employeeId,
              date: a.date,
              shift: shiftStr,
            });
          });
        }
      });

      const datesToReplace = new Set(updatedAssignments.map((a) => a.date));
      const remainingMA = (machineAssignments || []).filter((ma) => !datesToReplace.has(ma.date));
      onUpdateMachineAssignments([...remainingMA, ...newMachineAssignments]);
    }
    showScheduleToast(summaryMessage, 'success');
  };

  const handleExportCurrentMonthExcel = () => {
    try {
      exportMonthToExcel(
        monthPrefix,
        schedules,
        employees,
        machines,
        machineAssignments,
        effectiveSettings?.hospitalName || 'RS Happy Land Medical Centre'
      );
      showScheduleToast(`File Excel (.xlsx) bulan ${monthNames[selectedMonth]} ${selectedYear} berhasil diunduh!`, 'success');
    } catch (e: any) {
      showScheduleToast('Gagal unduh Excel: ' + (e?.message || e), 'error');
    }
  };

  const handleSyncToGoogleSheets = async () => {
    if (!effectiveSettings?.googleSheetWebhookUrl) {
      setShowGoogleScriptModal(true);
      return;
    }
    setIsSyncingSheets(true);
    try {
      const payloadData = prepareSyncPayload(
        schedules,
        employees,
        machines,
        machineAssignments,
        monthPrefix,
        specialTasks
      );

      const result = await pushToGoogleSheets(effectiveSettings, payloadData);
      if (result.isSuccess) {
        if (payloadData.autoGeneratedSchedules && payloadData.autoGeneratedSchedules.length > 0) {
          const merged = [
            ...schedules.filter((s) => !s.date.startsWith(monthPrefix)),
            ...payloadData.autoGeneratedSchedules,
          ];
          onUpdateSchedule(merged);
          if (payloadData.autoGeneratedMachineAssignments && onUpdateMachineAssignments) {
            const mergedMA = [
              ...machineAssignments.filter((m) => !m.date.startsWith(monthPrefix)),
              ...payloadData.autoGeneratedMachineAssignments,
            ];
            onUpdateMachineAssignments(mergedMA);
          }
        }

        if (onUpdateSettings) {
          const updatedSettings: AppSettings = {
            ...effectiveSettings,
            lastSyncTimestamp: Date.now(),
            lastSyncStatus: `Terkirim: ${monthNames[selectedMonth]} ${selectedYear} (${payloadData.domainMonthlyAssignments.length} jadwal)`,
          };
          onUpdateSettings(updatedSettings);
        }

        showScheduleToast(`Sinkronisasi Google Sheets berhasil! Seluruh data jadwal shift dan alokasi mesin bulan ${monthNames[selectedMonth]} ${selectedYear} (${payloadData.domainMonthlyAssignments.length} jadwal) telah dikirim ke Google Sheets.`, 'success');
      } else {
        showScheduleToast('Gagal sinkron: ' + result.message, 'error');
      }
    } catch (e: any) {
      showScheduleToast('Terjadi kesalahan saat menghubungi Webhook: ' + (e?.message || e), 'error');
    } finally {
      setIsSyncingSheets(false);
    }
  };

  const monthNames = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];

  const handlePrevMonth = () => {
    let nextY = selectedYear;
    let nextM = selectedMonth - 1;
    if (nextM < 0) {
      nextM = 11;
      nextY -= 1;
    }
    setSelectedMonth(nextM);
    setSelectedYear(nextY);
    const newPrefix = `${nextY}-${String(nextM + 1).padStart(2, '0')}`;
    window.dispatchEvent(new CustomEvent('hd_month_changed', { detail: { monthPrefix: newPrefix } }));
  };

  const handleNextMonth = () => {
    let nextY = selectedYear;
    let nextM = selectedMonth + 1;
    if (nextM > 11) {
      nextM = 0;
      nextY += 1;
    }
    setSelectedMonth(nextM);
    setSelectedYear(nextY);
    const newPrefix = `${nextY}-${String(nextM + 1).padStart(2, '0')}`;
    window.dispatchEvent(new CustomEvent('hd_month_changed', { detail: { monthPrefix: newPrefix } }));
  };

  // Filter employees
  const filteredEmployees = employees.filter((emp) => {
    if (emp.status !== 'aktif') return false;
    if (searchQuery && !emp.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (roleFilter === 'mine') return emp.id === currentUser.id;
    if (roleFilter !== 'all') return emp.role === roleFilter;
    return true;
  });

  // Handle Admin Generate Month (Algoritma Adil FairSchedulerEngine + Alokasi Mesin HD)
  const handleGenerateMonth = () => {
    const nurseEmployees = employees.filter((e) => e.role !== 'dokter');
    const domainNurses: Nurse[] = nurseEmployees.map((e, idx) => ({
      id: isNaN(Number(e.id)) ? idx + 1 : Number(e.id),
      name: e.name,
      nip: e.nip || '',
      phone: e.phone || '',
      role: e.role === 'kepala_ruangan' ? 'KARU' : e.role === 'pj_shift' ? 'KATIM' : 'PELAKSANA',
      isActive: e.status === 'aktif' || !e.status,
      skillLevel: e.skillLevel || 'Senior',
      specialDuty: e.specialDuty || null,
    }));

    const domainMachines: Machine[] = (machines || []).map((m, idx) => ({
      id: isNaN(Number(m.id)) ? idx + 1 : Number(m.id),
      code: m.code,
      name: m.name || `Mesin ${m.code}`,
      bay: m.bay || m.zone || 'Bay Reguler',
      category: m.category === 'ISOLASI' ? 'ISOLASI' : 'REGULER',
      status: m.status === 'maintenance' ? 'MAINTENANCE' : 'AKTIF',
      brandModel: (m as any).brandModel || m.brand || '',
      notes: m.notes || '',
    }));

    // Eksekusi generator jadwal adil dari engine referensi HDHLMC
    const assignments = FairSchedulerEngine.generateMonthlySchedule(
      selectedYear,
      selectedMonth + 1,
      domainNurses,
      domainMachines,
      Date.now()
    );

    const monthPrefix = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
    const overrideMap = new Map<string, ShiftSchedule>();
    schedules.forEach((sch) => {
      if (preserveOverrides && sch.isCustomOverride && sch.date.startsWith(monthPrefix)) {
        overrideMap.set(`${sch.employeeId}_${sch.date}`, sch);
      }
    });

    const generatedSchedules: ShiftSchedule[] = [];
    const generatedMachineAssignments: MachineAssignment[] = [];

    // Pertahankan jadwal dokter yang sudah ada pada bulan ini
    const existingDoctorSchedulesThisMonth = schedules.filter((s) => {
      if (!s.date.startsWith(monthPrefix)) return false;
      const emp = employees.find((e) => e.id === s.employeeId);
      return emp?.role === 'dokter';
    });
    generatedSchedules.push(...existingDoctorSchedulesThisMonth);

    // Jika dokter belum memiliki jadwal pada bulan ini, bentuk jadwal sesuai Google Sheet (dr. Reza Pagi, dr. Paramitha Siang, Minggu Libur)
    const doctorEmployees = employees.filter((e) => e.role === 'dokter');
    if (doctorEmployees.length > 0 && existingDoctorSchedulesThisMonth.length === 0) {
      const daysInMonth = getDaysInMonth(selectedYear, selectedMonth);
      daysInMonth.forEach((day) => {
        if (day.isSunday) {
          doctorEmployees.forEach((doc) => {
            generatedSchedules.push({
              id: `${doc.id}_${day.dateStr}`,
              employeeId: doc.id,
              date: day.dateStr,
              shift: 'libur',
              note: 'Pelayanan Tutup (Hari Minggu)',
            });
          });
        } else {
          const pagiDoc = doctorEmployees.find((d) => d.name.toLowerCase().includes('reza')) || doctorEmployees[0];
          const siangDoc = doctorEmployees.find((d) => d.name.toLowerCase().includes('paramitha')) || doctorEmployees[1] || doctorEmployees[0];
          if (pagiDoc) {
            generatedSchedules.push({
              id: `${pagiDoc.id}_${day.dateStr}`,
              employeeId: pagiDoc.id,
              date: day.dateStr,
              shift: 'pagi',
              note: 'Dokter Penanggung Jawab Pelayanan HD (DPJP)',
            });
          }
          if (siangDoc && siangDoc.id !== pagiDoc?.id) {
            generatedSchedules.push({
              id: `${siangDoc.id}_${day.dateStr}`,
              employeeId: siangDoc.id,
              date: day.dateStr,
              shift: 'siang',
              note: 'Dokter Jaga Ruangan Hemodialisa',
            });
          }
        }
      });
    }

    // Konversi hasil assignments FairSchedulerEngine ke ShiftSchedule dan MachineAssignment
    assignments.forEach((a) => {
      const matchedEmp = nurseEmployees.find(
        (e, idx) =>
          (isNaN(Number(e.id)) ? idx + 1 : Number(e.id)) === a.nurseId ||
          e.name.toLowerCase() === a.nurseName.toLowerCase()
      );
      if (!matchedEmp) return;

      const key = `${matchedEmp.id}_${a.date}`;
      if (preserveOverrides && overrideMap.has(key)) {
        generatedSchedules.push(overrideMap.get(key)!);
        return;
      }

      const shiftLower = a.shiftType.toLowerCase() as ShiftType;
      generatedSchedules.push({
        id: key,
        employeeId: matchedEmp.id,
        date: a.date,
        shift: shiftLower,
        note: a.notes || (a.specialDuty ? `Tugas: ${a.specialDuty}` : undefined),
        isCustomOverride: false,
      });

      // Alokasi mesin
      if (a.assignedMachineIds && a.assignedMachineIds.length > 0 && shiftLower !== 'libur') {
        const shiftSlot: 'pagi' | 'siang' = shiftLower === 'siang' ? 'siang' : 'pagi';
        a.assignedMachineIds.forEach((mId) => {
          const matchingMachine = (machines || []).find(
            (m, idx) =>
              (isNaN(Number(m.id)) ? idx + 1 : Number(m.id)) === Number(mId) ||
              m.code.toUpperCase() === String(mId).toUpperCase()
          );
          const machineKey = matchingMachine ? matchingMachine.id : String(mId);

          generatedMachineAssignments.push({
            id: `${matchedEmp.id}_${a.date}_${shiftSlot}_${machineKey}`,
            machineId: machineKey,
            nurseId: matchedEmp.id,
            date: a.date,
            shift: shiftSlot,
          });
        });
      }
    });

    // Gabungkan jadwal bulan lain
    const otherMonthSchedules = schedules.filter((s) => !s.date.startsWith(monthPrefix));
    onUpdateSchedule([...otherMonthSchedules, ...generatedSchedules]);

    if (onUpdateMachineAssignments) {
      const otherMonthMA = (machineAssignments || []).filter((ma) => !ma.date.startsWith(monthPrefix));
      onUpdateMachineAssignments([...otherMonthMA, ...generatedMachineAssignments]);
    }

    setShowGenerateModal(false);
  };

  // Handle Reset Schedule (Feature: Reset Jadwal -> Mengubah seluruh jadwal perawat menjadi Libur)
  const handleExecuteReset = () => {
    const daysInCurrentMonth = getDaysInMonth(selectedYear, selectedMonth);
    const monthPrefix = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
    const nurseEmployees = employees.filter((e) => e.role !== 'dokter');

    if (resetScope === 'month') {
      // Pertahankan jadwal dokter pada bulan ini dan seluruh jadwal di bulan lain
      const otherMonthSchedules = schedules.filter((s) => !s.date.startsWith(monthPrefix));
      const doctorSchedulesThisMonth = schedules.filter(
        (s) => s.date.startsWith(monthPrefix) && employees.find((e) => e.id === s.employeeId)?.role === 'dokter'
      );

      // Ubah SEMUA jadwal perawat bulan ini menjadi 'libur'
      const resetLiburSchedules: ShiftSchedule[] = [];
      daysInCurrentMonth.forEach((day) => {
        nurseEmployees.forEach((nurse) => {
          resetLiburSchedules.push({
            id: `${nurse.id}_${day.dateStr}`,
            employeeId: nurse.id,
            date: day.dateStr,
            shift: 'libur',
            note: 'Libur (Reset Jadwal)',
            isCustomOverride: true,
          });
        });
      });

      const updated = [...otherMonthSchedules, ...doctorSchedulesThisMonth, ...resetLiburSchedules];
      onUpdateSchedule(updated);
      showScheduleToast(`Semua jadwal perawat bulan ${monthNames[selectedMonth]} ${selectedYear} berhasil diubah menjadi Libur (L).`, 'success');
    } else {
      // Pertahankan jadwal dokter di semua bulan
      const doctorSchedules = schedules.filter(
        (s) => employees.find((e) => e.id === s.employeeId)?.role === 'dokter'
      );

      // Ubah seluruh jadwal perawat bulan aktif menjadi 'libur'
      const resetLiburSchedules: ShiftSchedule[] = [];
      daysInCurrentMonth.forEach((day) => {
        nurseEmployees.forEach((nurse) => {
          resetLiburSchedules.push({
            id: `${nurse.id}_${day.dateStr}`,
            employeeId: nurse.id,
            date: day.dateStr,
            shift: 'libur',
            note: 'Libur (Reset Jadwal)',
            isCustomOverride: true,
          });
        });
      });

      const updated = [...doctorSchedules, ...resetLiburSchedules];
      onUpdateSchedule(updated);
      showScheduleToast('Seluruh jadwal perawat berhasil diubah menjadi Libur (L).', 'success');
    }
    setShowResetModal(false);
  };

  // 1-CLICK SHIFT CHANGE (Merubah jadwal setiap perawat & dokter hanya dengan 1 kali klik pada matriks)
  const handleCellSingleClick = (
    employeeId: string, 
    dateStr: string, 
    currentEffectiveShift?: ShiftType
  ) => {
    if (!canEdit) return;

    const targetEmp = employees.find((e) => e.id === employeeId);
    const isDoc = targetEmp?.role === 'dokter';

    // Cycle order:
    // Dokter: Pagi -> Siang -> 2 Shif (Pagi & Siang) -> Libur -> Pagi
    // Perawat: Pagi -> Siang -> Libur -> Pagi
    let nextShift: ShiftType = 'pagi';
    if (currentEffectiveShift === 'pagi') {
      nextShift = 'siang';
    } else if (currentEffectiveShift === 'siang') {
      nextShift = isDoc ? 'pagi_siang' : 'libur';
    } else if (currentEffectiveShift === 'pagi_siang') {
      nextShift = 'libur';
    } else if (currentEffectiveShift === 'libur') {
      nextShift = 'pagi';
    } else {
      nextShift = 'pagi';
    }

    const existingIndex = schedules.findIndex(
      (s) => s.employeeId === employeeId && s.date === dateStr
    );

    const updatedItem: ShiftSchedule = {
      id: `${employeeId}_${dateStr}`,
      employeeId,
      date: dateStr,
      shift: nextShift,
      isCustomOverride: true,
    };

    let updatedList: ShiftSchedule[];
    if (existingIndex >= 0) {
      updatedList = [...schedules];
      updatedList[existingIndex] = updatedItem;
    } else {
      updatedList = [...schedules, updatedItem];
    }

    onUpdateSchedule(updatedList);
  };

  // Handle Edit Single Cell (via Right-click or Detail button)
  const handleSaveCellEdit = (
    newShift: ShiftType,
    note: string,
    selectedTaskCategories?: SpecialTaskCategory[]
  ) => {
    if (!editingCell) return;

    const existingIndex = schedules.findIndex(
      (s) => s.employeeId === editingCell.employeeId && s.date === editingCell.dateStr
    );

    const updatedItem: ShiftSchedule = {
      id: `${editingCell.employeeId}_${editingCell.dateStr}`,
      employeeId: editingCell.employeeId,
      date: editingCell.dateStr,
      shift: newShift,
      note: note || undefined,
      isCustomOverride: true,
    };

    let updatedList: ShiftSchedule[];
    if (existingIndex >= 0) {
      updatedList = [...schedules];
      updatedList[existingIndex] = updatedItem;
    } else {
      updatedList = [...schedules, updatedItem];
    }

    onUpdateSchedule(updatedList);

    // Save special task updates if handler is provided
    if (onUpdateSpecialTasks && selectedTaskCategories !== undefined) {
      const taskShift: 'pagi' | 'siang' =
        newShift === 'siang' || String(newShift).includes('siang') ? 'siang' : 'pagi';

      // 1. Remove this employee's previous tasks on this date
      let baseTasks = specialTasks.filter(
        (t) => !(t.assignedToId === editingCell.employeeId && t.date === editingCell.dateStr)
      );

      // 2. If PJ Shift was selected, ensure only 1 PJ Shift per shift by transferring from others
      if (
        selectedTaskCategories.includes('pj_shift') &&
        (newShift === 'pagi' || newShift === 'siang' || newShift === 'pagi_siang')
      ) {
        baseTasks = baseTasks.filter(
          (t) =>
            !(
              t.date === editingCell.dateStr &&
              (t.shift === taskShift || !t.shift) &&
              t.category === 'pj_shift'
            )
        );
      }

      // 3. Add newly selected tasks if nurse is on duty
      if (newShift === 'pagi' || newShift === 'siang' || newShift === 'pagi_siang') {
        const newTasks: SpecialTask[] = selectedTaskCategories.map((cat, idx) => {
          const def = SPECIAL_TASK_DEFINITIONS[cat];
          return {
            id: `task_${editingCell.employeeId}_${editingCell.dateStr}_${cat}_${Date.now()}_${idx}`,
            title: `Tugas Khusus: ${def.name}`,
            description: def.description,
            assignedToId: editingCell.employeeId,
            assignedByName: `${currentUser.name} (${currentUser.role === 'admin' ? 'Admin' : (currentUser.role === 'pj_shift' || (currentUser.role as string) === 'katim') ? 'KATIM' : 'Karu'})`,
            date: editingCell.dateStr,
            shift: taskShift,
            priority: cat === 'cito' ? 'mendesak' : 'penting',
            status: 'pending',
            category: cat,
            createdAt: new Date().toISOString().replace('T', ' ').substring(0, 16),
          };
        });
        onUpdateSpecialTasks([...baseTasks, ...newTasks]);
      } else {
        // If nurse is libur/cuti/izin, they don't have tasks
        onUpdateSpecialTasks(baseTasks);
      }
    }

    setEditingCell(null);
  };

  const isAdmin = currentUser.role === 'admin';
  const isKaru = currentUser.role === 'kepala_ruangan';
  const isPjShift = currentUser.role === 'pj_shift';
  const canEdit = isAdmin || isKaru || isPjShift;

  const currentMonthSchedules = schedules.filter((s) => s.date.startsWith(monthPrefix));

  // Separate Perawat (including Karu & PJ Shift) and Dokter, sorted strictly:
  // 1. Kepala ruang, 2. PJ Shif (L), 3. PJ Shif (P), 4. Pelaksana (L), 5. Pelaksana (P)
  const nurseEmployees = sortNursesByShiftScheduleOrder(
    filteredEmployees.filter(
      (emp) => emp.role === 'perawat' || emp.role === 'pj_shift' || emp.role === 'kepala_ruangan'
    )
  );
  const allDoctorEmployees = useMemo(() => {
    const seen = new Set<string>();
    return (employees || []).filter((emp) => {
      if (emp.role !== 'dokter' || (emp.status && emp.status !== 'aktif') || seen.has(emp.id)) {
        return false;
      }
      seen.add(emp.id);
      return true;
    });
  }, [employees]);

  const showNurseTable =
    activeScheduleTab === 'perawat' && (
      roleFilter === 'all' ||
      roleFilter === 'perawat' ||
      roleFilter === 'pj_shift' ||
      roleFilter === 'kepala_ruangan' ||
      (roleFilter === 'mine' && currentUser.role !== 'dokter')
    );

  const showDoctorSection = activeScheduleTab === 'dokter';

  const currentDoctorDate = days[0]?.dateStr || `${monthPrefix}-01`;

  const handleAssignDoctor = (dateStr: string, shift: 'pagi' | 'siang', doctorId: string) => {
    let newSchedules = [...schedules];
    const otherShift: 'pagi' | 'siang' = shift === 'pagi' ? 'siang' : 'pagi';

    allDoctorEmployees.forEach((doc) => {
      const existingIdx = newSchedules.findIndex(
        (s) => s.employeeId === doc.id && s.date === dateStr
      );
      const currentSch = existingIdx >= 0 ? newSchedules[existingIdx] : null;

      if (doc.id === doctorId) {
        // Jika dokter ini sebelumnya sudah bertugas di shift satunya (atau sudah 2 shif):
        let targetShift: ShiftType = shift;
        let note = shift === 'pagi' ? 'Dokter Penanggung Jawab HD (Pagi)' : 'Dokter Jaga HD (Siang)';

        if (currentSch?.shift === otherShift || currentSch?.shift === 'pagi_siang') {
          targetShift = 'pagi_siang';
          note = 'Dokter Jaga 2 Shif (Pagi & Siang)';
        }

        const item: ShiftSchedule = {
          id: `${doc.id}_${dateStr}`,
          employeeId: doc.id,
          date: dateStr,
          shift: targetShift,
          note,
          isCustomOverride: true,
        };
        if (existingIdx >= 0) {
          newSchedules[existingIdx] = item;
        } else {
          newSchedules.push(item);
        }
      } else {
        // Jika dokter lain sebelumnya ada di shift ini:
        if (currentSch) {
          if (currentSch.shift === 'pagi_siang') {
            // Turunkan ke shift satunya saja
            newSchedules[existingIdx] = {
              ...currentSch,
              shift: otherShift,
              note: otherShift === 'pagi' ? 'Dokter Penanggung Jawab HD (Pagi)' : 'Dokter Jaga HD (Siang)',
              isCustomOverride: true,
            };
          } else if (currentSch.shift === shift) {
            newSchedules[existingIdx] = {
              ...currentSch,
              shift: 'libur',
              note: 'Lepas Jaga / Libur Dinas',
              isCustomOverride: true,
            };
          }
        }
      }
    });

    // Jika doctorId dikosongkan ("-- Kosongkan / Lepas Jaga --")
    if (!doctorId) {
      allDoctorEmployees.forEach((doc) => {
        const existingIdx = newSchedules.findIndex(
          (s) => s.employeeId === doc.id && s.date === dateStr
        );
        if (existingIdx >= 0) {
          const current = newSchedules[existingIdx];
          if (current.shift === 'pagi_siang') {
            newSchedules[existingIdx] = {
              ...current,
              shift: otherShift,
              note: otherShift === 'pagi' ? 'Dokter Penanggung Jawab HD (Pagi)' : 'Dokter Jaga HD (Siang)',
              isCustomOverride: true,
            };
          } else if (current.shift === shift) {
            newSchedules[existingIdx] = {
              ...current,
              shift: 'libur',
              note: 'Lepas Jaga / Libur Dinas',
              isCustomOverride: true,
            };
          }
        }
      });
    }

    onUpdateSchedule(newSchedules);
  };

  const getDoctorForShiftAndDate = (dateStr: string, shift: 'pagi' | 'siang') => {
    const scheduled = allDoctorEmployees.find((d) => {
      const sch = schedules.find((s) => s.employeeId === d.id && s.date === dateStr);
      return sch && (sch.shift === shift || sch.shift === 'pagi_siang');
    });
    return scheduled;
  };

  const handleApplyMonthlyDoctorPattern = () => {
    let newSchedules = [...schedules];
    days.forEach((day) => {
      if (day.isSunday) {
        allDoctorEmployees.forEach((doc) => {
          const existingIdx = newSchedules.findIndex(
            (s) => s.employeeId === doc.id && s.date === day.dateStr
          );
          const item: ShiftSchedule = {
            id: `${doc.id}_${day.dateStr}`,
            employeeId: doc.id,
            date: day.dateStr,
            shift: 'libur',
            note: 'Libur Rutin Hari Minggu (Unit HD Tutup)',
            isCustomOverride: true,
          };
          if (existingIdx >= 0) {
            newSchedules[existingIdx] = item;
          } else {
            newSchedules.push(item);
          }
        });
        return;
      }

      let pagiDocId = doctorPagiPattern;
      let siangDocId = doctorSiangPattern;

      if (doctorPatternMode === 'alternating' && day.date.getDate() % 2 === 0) {
        pagiDocId = doctorSiangPattern;
        siangDocId = doctorPagiPattern;
      }

      allDoctorEmployees.forEach((doc) => {
        const existingIdx = newSchedules.findIndex(
          (s) => s.employeeId === doc.id && s.date === day.dateStr
        );
        let shift: ShiftType = 'libur';
        let note = 'Lepas Jaga / Libur Dinas';

        if (doc.id === pagiDocId && doc.id === siangDocId) {
          shift = 'pagi_siang';
          note = 'Dokter Jaga 2 Shif (Pagi & Siang)';
        } else if (doc.id === pagiDocId) {
          shift = 'pagi';
          note = 'Dokter Penanggung Jawab HD (Pagi)';
        } else if (doc.id === siangDocId) {
          shift = 'siang';
          note = 'Dokter Jaga HD (Siang)';
        }

        const item: ShiftSchedule = {
          id: `${doc.id}_${day.dateStr}`,
          employeeId: doc.id,
          date: day.dateStr,
          shift,
          note,
          isCustomOverride: true,
        };

        if (existingIdx >= 0) {
          newSchedules[existingIdx] = item;
        } else {
          newSchedules.push(item);
        }
      });
    });

    onUpdateSchedule(newSchedules);
    setShowDoctorPatternModal(false);
    showScheduleToast('Pola jadwal dokter satu bulan berhasil diterapkan.', 'success');
  };

  const handleResetMonthDoctors = () => {
    let newSchedules = [...schedules];
    days.forEach((day) => {
      allDoctorEmployees.forEach((doc) => {
        const existingIdx = newSchedules.findIndex(
          (s) => s.employeeId === doc.id && s.date === day.dateStr
        );
        const item: ShiftSchedule = {
          id: `${doc.id}_${day.dateStr}`,
          employeeId: doc.id,
          date: day.dateStr,
          shift: 'libur',
          note: day.isSunday ? 'Libur Rutin HD (Hari Minggu)' : 'Lepas Jaga / Libur Dinas',
          isCustomOverride: true,
        };
        if (existingIdx >= 0) {
          newSchedules[existingIdx] = item;
        } else {
          newSchedules.push(item);
        }
      });
    });
    onUpdateSchedule(newSchedules);
    setShowDoctorPatternModal(false);
    showScheduleToast('Seluruh jadwal dokter bulan ini berhasil dikosongkan.', 'info');
  };

  const handleExportPdf = (targetScope: 'all' | 'perawat' | 'dokter' = printScope) => {
    try {
      setIsExportingPdf(true);
      const allActiveNurses = sortNursesByShiftScheduleOrder(
        employees.filter(
          (emp) =>
            (emp.role === 'perawat' || emp.role === 'pj_shift' || emp.role === 'kepala_ruangan') &&
            (emp.status === 'aktif' || !emp.status)
        )
      );
      exportScheduleToPdf({
        year: selectedYear,
        month: selectedMonth,
        monthName: monthNames[selectedMonth],
        days,
        nurseStaff: allActiveNurses,
        doctorStaff: allDoctorEmployees,
        schedules,
        allEmployees: employees,
        specialTasks,
        scope: targetScope,
      });
      setShowPrintModal(false);
      showScheduleToast(
        `Jadwal ${
          targetScope === 'perawat'
            ? 'Perawat'
            : targetScope === 'dokter'
            ? 'Dokter'
            : 'Lengkap (Perawat & Dokter)'
        } berhasil diunduh ke PDF`,
        'success'
      );
    } catch (err) {
      console.error('Failed to export schedule to PDF:', err);
      showScheduleToast('Gagal membuat file PDF', 'error');
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleDirectPrint = (targetScope: 'all' | 'perawat' | 'dokter' = printScope) => {
    setPrintScope(targetScope);
    setShowPrintModal(false);
    setTimeout(() => {
      window.print();
    }, 250);
  };

  /**
   * Helper to determine Shift Button styling on Monthly Schedule Matrix
   * STRICT ATURAN:
   * 1. HANYA TUGAS KHUSUS yang dapat merubah warna tombol shift pada matrik jadwal bulanan.
   * 2. PERAN / JABATAN (Kepala Ruangan, PJ Shift, Perawat Pelaksana, Dokter) TIDAK merubah warna tombol shift.
   * 3. Jika tidak memegang tugas khusus: Shift Pagi = Reguler Hijau, Shift Siang = Reguler Pink.
   */
  const getShiftButtonMatrixStyle = (
    shift: ShiftType | undefined,
    day: { dateStr: string; isSunday: boolean },
    emp: UserAccount,
    currentSpecialTasks: SpecialTask[],
    isDoc: boolean,
    hasSch: boolean
  ): {
    letter: string;
    badgeClass: string;
    printBadgeClass: string;
    taskDescription: string;
    hasSpecialDuty: boolean;
    specialDutyName?: string;
    badgesToRender: {
      category: SpecialTaskCategory | 'other';
      name: string;
      shortCode: string;
      badgeBg: string;
      badgeBorder: string;
      textColor: string;
    }[];
    totalSpecialTasksCount: number;
  } => {
    if (isDoc && !hasSch) {
      return {
        letter: '+',
        badgeClass: 'bg-slate-50 text-slate-400 border-dashed border-slate-300 font-bold hover:bg-slate-100',
        printBadgeClass: 'bg-white text-slate-400 border-dashed border-slate-300 font-bold',
        taskDescription: 'Klik untuk isi shift Dokter',
        hasSpecialDuty: false,
        badgesToRender: [],
        totalSpecialTasksCount: 0,
      };
    }

    if (!shift) {
      return {
        letter: '-',
        badgeClass: 'bg-slate-100 text-slate-400 border-slate-200',
        printBadgeClass: 'bg-white text-slate-400 border-slate-200',
        taskDescription: 'Belum Terjadwal',
        hasSpecialDuty: false,
        badgesToRender: [],
        totalSpecialTasksCount: 0,
      };
    }

    if (shift === 'pagi_siang') {
      return {
        letter: '2S',
        badgeClass: 'bg-indigo-600 text-white border-indigo-700 font-black shadow-xs ring-1 ring-indigo-300',
        printBadgeClass: 'bg-indigo-600 text-white border-indigo-700 font-black',
        taskDescription: 'Dinas Pagi & Siang (2 Sesi: 07:00 - 20:30)',
        hasSpecialDuty: false,
        badgesToRender: [],
        totalSpecialTasksCount: 0,
      };
    }

    if (shift === 'libur') {
      return {
        letter: 'L',
        badgeClass: day.isSunday
          ? 'bg-rose-100 text-rose-800 border-rose-300 font-extrabold shadow-2xs hover:bg-rose-200'
          : 'bg-slate-100 text-slate-600 border-slate-300 font-bold hover:bg-slate-200',
        printBadgeClass: day.isSunday
          ? 'bg-rose-100 text-rose-800 border-rose-300 font-extrabold'
          : 'bg-slate-100 text-slate-600 border-slate-300 font-bold',
        taskDescription: day.isSunday ? 'Libur Rutin Operasional (Hari Minggu)' : 'Libur Dinas',
        hasSpecialDuty: false,
        badgesToRender: [],
        totalSpecialTasksCount: 0,
      };
    }

    if (shift === 'cuti') {
      return {
        letter: 'C',
        badgeClass: 'bg-amber-100 text-amber-900 border-amber-300 font-bold shadow-2xs hover:bg-amber-200',
        printBadgeClass: 'bg-amber-100 text-amber-900 border-amber-300 font-bold',
        taskDescription: 'Cuti Resmi',
        hasSpecialDuty: false,
        badgesToRender: [],
        totalSpecialTasksCount: 0,
      };
    }

    if (shift === 'izin') {
      return {
        letter: 'I',
        badgeClass: 'bg-indigo-100 text-indigo-900 border-indigo-300 font-bold shadow-2xs hover:bg-indigo-200',
        printBadgeClass: 'bg-indigo-100 text-indigo-900 border-indigo-300 font-bold',
        taskDescription: 'Izin Resmi',
        hasSpecialDuty: false,
        badgesToRender: [],
        totalSpecialTasksCount: 0,
      };
    }

    if (shift === 'sakit') {
      return {
        letter: 'SK',
        badgeClass: 'bg-slate-200 text-slate-800 border-slate-300 font-bold shadow-2xs hover:bg-slate-300',
        printBadgeClass: 'bg-slate-200 text-slate-800 border-slate-300 font-bold',
        taskDescription: 'Sakit (Surat Keterangan Dokter)',
        hasSpecialDuty: false,
        badgesToRender: [],
        totalSpecialTasksCount: 0,
      };
    }

    // Active shifts: 'pagi' or 'siang'
    const isPagi = shift === 'pagi';
    const letter = isPagi ? 'P' : 'S';
    const shiftLabel = isPagi ? 'Pagi' : 'Siang';

    // Daily tasks for this active shift
    const specialTasksForEmpToday = (currentSpecialTasks || []).filter(
      (t) => t.assignedToId === emp.id && t.date === day.dateStr
    );
    const staffTasksToday = specialTasksForEmpToday.filter((t) => !t.shift || t.shift === shift);

    interface ActiveDuty {
      category: SpecialTaskCategory | 'other';
      name: string;
      shortCode: string;
      badgeBg: string;
      badgeBorder: string;
      textColor: string;
    }

    const activeDuties: ActiveDuty[] = [];
    const seenCategories = new Set<string>();

    const addDuty = (
      cat: SpecialTaskCategory | 'other',
      name: string,
      shortCode: string,
      badgeBg: string,
      badgeBorder: string,
      textColor: string
    ) => {
      if (!seenCategories.has(cat)) {
        seenCategories.add(cat);
        activeDuties.push({ category: cat, name, shortCode, badgeBg, badgeBorder, textColor });
      }
    };

    // 1. Cek Tugas Khusus dari tugas harian (staffTasksToday)
    staffTasksToday.forEach((t) => {
      const titleLower = (t.title || '').toLowerCase();
      if (t.category === 'cito' || titleLower.includes('cito') || titleLower.includes('isolasi')) {
        addDuty('cito', SPECIAL_TASK_DEFINITIONS.cito.name, SPECIAL_TASK_DEFINITIONS.cito.shortCode, SPECIAL_TASK_DEFINITIONS.cito.badgeBg, SPECIAL_TASK_DEFINITIONS.cito.badgeBorder, SPECIAL_TASK_DEFINITIONS.cito.textColor);
      } else if (t.category === 'pj_shift' || titleLower.includes('pj shif') || titleLower.includes('pj shift') || titleLower.includes('katim')) {
        addDuty('pj_shift', SPECIAL_TASK_DEFINITIONS.pj_shift.name, SPECIAL_TASK_DEFINITIONS.pj_shift.shortCode, SPECIAL_TASK_DEFINITIONS.pj_shift.badgeBg, SPECIAL_TASK_DEFINITIONS.pj_shift.badgeBorder, SPECIAL_TASK_DEFINITIONS.pj_shift.textColor);
      } else if (t.category === 'bhp' || titleLower.includes('bhp')) {
        addDuty('bhp', SPECIAL_TASK_DEFINITIONS.bhp.name, SPECIAL_TASK_DEFINITIONS.bhp.shortCode, SPECIAL_TASK_DEFINITIONS.bhp.badgeBg, SPECIAL_TASK_DEFINITIONS.bhp.badgeBorder, SPECIAL_TASK_DEFINITIONS.bhp.textColor);
      } else if (t.category === 'farmasi_logistik' || titleLower.includes('farmasi') || titleLower.includes('logistik') || titleLower.includes('obat')) {
        addDuty('farmasi_logistik', SPECIAL_TASK_DEFINITIONS.farmasi_logistik.name, SPECIAL_TASK_DEFINITIONS.farmasi_logistik.shortCode, SPECIAL_TASK_DEFINITIONS.farmasi_logistik.badgeBg, SPECIAL_TASK_DEFINITIONS.farmasi_logistik.badgeBorder, SPECIAL_TASK_DEFINITIONS.farmasi_logistik.textColor);
      } else if (t.category === 'natrium_ro' || titleLower.includes('ro') || titleLower.includes('natrium')) {
        addDuty('natrium_ro', SPECIAL_TASK_DEFINITIONS.natrium_ro.name, SPECIAL_TASK_DEFINITIONS.natrium_ro.shortCode, SPECIAL_TASK_DEFINITIONS.natrium_ro.badgeBg, SPECIAL_TASK_DEFINITIONS.natrium_ro.badgeBorder, SPECIAL_TASK_DEFINITIONS.natrium_ro.textColor);
      } else {
        addDuty('other', t.title || 'Tugas Khusus', 'TK', 'bg-teal-600', 'border-teal-700', 'text-white');
      }
    });

    // 2. Cek Tugas Khusus Pokok (emp.specialDuty) yang ditetapkan di Manajemen Karyawan / Google Sheet
    const normDuty = (emp.specialDuty || '').trim().toUpperCase();
    if (normDuty && !normDuty.includes('KARU') && !normDuty.includes('PELAKSANA')) {
      if (normDuty.includes('CITO') || normDuty.includes('ISOLASI')) {
        addDuty('cito', SPECIAL_TASK_DEFINITIONS.cito.name, SPECIAL_TASK_DEFINITIONS.cito.shortCode, SPECIAL_TASK_DEFINITIONS.cito.badgeBg, SPECIAL_TASK_DEFINITIONS.cito.badgeBorder, SPECIAL_TASK_DEFINITIONS.cito.textColor);
      }
      if (normDuty.includes('PJ SHIF') || normDuty.includes('PJ SIF') || normDuty.includes('KATIM')) {
        addDuty('pj_shift', SPECIAL_TASK_DEFINITIONS.pj_shift.name, SPECIAL_TASK_DEFINITIONS.pj_shift.shortCode, SPECIAL_TASK_DEFINITIONS.pj_shift.badgeBg, SPECIAL_TASK_DEFINITIONS.pj_shift.badgeBorder, SPECIAL_TASK_DEFINITIONS.pj_shift.textColor);
      }
      if (normDuty.includes('BHP')) {
        addDuty('bhp', SPECIAL_TASK_DEFINITIONS.bhp.name, SPECIAL_TASK_DEFINITIONS.bhp.shortCode, SPECIAL_TASK_DEFINITIONS.bhp.badgeBg, SPECIAL_TASK_DEFINITIONS.bhp.badgeBorder, SPECIAL_TASK_DEFINITIONS.bhp.textColor);
      }
      if (normDuty.includes('FARMASI') || normDuty.includes('LOGISTIK') || normDuty.includes('OBAT')) {
        addDuty('farmasi_logistik', SPECIAL_TASK_DEFINITIONS.farmasi_logistik.name, SPECIAL_TASK_DEFINITIONS.farmasi_logistik.shortCode, SPECIAL_TASK_DEFINITIONS.farmasi_logistik.badgeBg, SPECIAL_TASK_DEFINITIONS.farmasi_logistik.badgeBorder, SPECIAL_TASK_DEFINITIONS.farmasi_logistik.textColor);
      }
      if (normDuty.includes('NATRIUM') || normDuty.includes('RO')) {
        addDuty('natrium_ro', SPECIAL_TASK_DEFINITIONS.natrium_ro.name, SPECIAL_TASK_DEFINITIONS.natrium_ro.shortCode, SPECIAL_TASK_DEFINITIONS.natrium_ro.badgeBg, SPECIAL_TASK_DEFINITIONS.natrium_ro.badgeBorder, SPECIAL_TASK_DEFINITIONS.natrium_ro.textColor);
      }
      const matchedKnown =
        normDuty.includes('CITO') ||
        normDuty.includes('ISOLASI') ||
        normDuty.includes('PJ SHIF') ||
        normDuty.includes('PJ SIF') ||
        normDuty.includes('KATIM') ||
        normDuty.includes('BHP') ||
        normDuty.includes('FARMASI') ||
        normDuty.includes('LOGISTIK') ||
        normDuty.includes('OBAT') ||
        normDuty.includes('NATRIUM') ||
        normDuty.includes('RO');
      if (!matchedKnown && normDuty.length > 0) {
        addDuty('other', emp.specialDuty || 'Tugas Khusus', 'TK', 'bg-teal-600', 'border-teal-700', 'text-white');
      }
    }

    // Urutan prioritas pewarnaan tombol shift utama:
    // 1. CITO (Emergensi isolasi)
    // 2. PJ Shift (Ketua Tim / Penanggung Jawab operasional shift HD)
    // 3. BHP
    // 4. Farmasi & Logistik
    // 5. Natrium RO
    // 6. Tugas Khusus lainnya
    const priorityOrder: (SpecialTaskCategory | 'other')[] = [
      'cito',
      'pj_shift',
      'bhp',
      'farmasi_logistik',
      'natrium_ro',
      'other',
    ];

    let primaryDuty: ActiveDuty | undefined;
    for (const cat of priorityOrder) {
      const d = activeDuties.find((item) => item.category === cat);
      if (d) {
        primaryDuty = d;
        break;
      }
    }

    const secondaryDuties = primaryDuty
      ? activeDuties.filter((item) => item.category !== primaryDuty.category)
      : [];

    // ATURAN USER:
    // Badge tugas khusus HANYA MUNCUL jika perawat memiliki 2 tugas khusus (atau lebih).
    // Jika hanya ada 1 tugas khusus: tidak perlu ada badge (hanya warna tugas khusus pada tombol).
    const badgesToRender = activeDuties.length >= 2 ? secondaryDuties : [];

    let taskDescription = `${shiftLabel} Reguler`;
    if (activeDuties.length >= 2) {
      taskDescription = `${shiftLabel} - Tugas Khusus Ganda: ${activeDuties.map((d) => d.name).join(' & ')}`;
    } else if (primaryDuty) {
      taskDescription = `${shiftLabel} - Tugas Khusus: ${primaryDuty.name}`;
    }

    if (primaryDuty) {
      if (primaryDuty.category === 'cito') {
        return {
          letter,
          badgeClass: 'bg-slate-900 text-white border-slate-950 ring-2 ring-slate-400 font-black shadow-xs',
          printBadgeClass: 'bg-slate-900 text-white border-slate-950 font-black',
          taskDescription,
          hasSpecialDuty: true,
          specialDutyName: 'CITO Isolasi',
          badgesToRender,
          totalSpecialTasksCount: activeDuties.length,
        };
      }
      if (primaryDuty.category === 'pj_shift') {
        return {
          letter,
          badgeClass: 'bg-orange-500 text-white border-orange-600 font-black shadow-xs ring-1 ring-orange-300',
          printBadgeClass: 'bg-orange-500 text-white border-orange-600 font-black',
          taskDescription,
          hasSpecialDuty: true,
          specialDutyName: 'PJ Shif',
          badgesToRender,
          totalSpecialTasksCount: activeDuties.length,
        };
      }
      if (primaryDuty.category === 'bhp') {
        return {
          letter,
          badgeClass: 'bg-blue-600 text-white border-blue-700 font-black shadow-xs ring-1 ring-blue-300',
          printBadgeClass: 'bg-blue-600 text-white border-blue-700 font-black',
          taskDescription,
          hasSpecialDuty: true,
          specialDutyName: 'BHP',
          badgesToRender,
          totalSpecialTasksCount: activeDuties.length,
        };
      }
      if (primaryDuty.category === 'farmasi_logistik') {
        return {
          letter,
          badgeClass: 'bg-purple-600 text-white border-purple-700 font-black shadow-xs ring-1 ring-purple-300',
          printBadgeClass: 'bg-purple-600 text-white border-purple-700 font-black',
          taskDescription,
          hasSpecialDuty: true,
          specialDutyName: 'Farmasi & Logistik',
          badgesToRender,
          totalSpecialTasksCount: activeDuties.length,
        };
      }
      if (primaryDuty.category === 'natrium_ro') {
        return {
          letter,
          badgeClass: 'bg-yellow-400 text-slate-900 border-yellow-500 font-black shadow-xs ring-1 ring-yellow-300',
          printBadgeClass: 'bg-yellow-400 text-slate-900 border-yellow-500 font-black',
          taskDescription,
          hasSpecialDuty: true,
          specialDutyName: 'Natrium RO',
          badgesToRender,
          totalSpecialTasksCount: activeDuties.length,
        };
      }
      return {
        letter,
        badgeClass: 'bg-teal-600 text-white border-teal-700 font-black shadow-xs ring-1 ring-teal-300',
        printBadgeClass: 'bg-teal-600 text-white border-teal-700 font-black',
        taskDescription,
        hasSpecialDuty: true,
        specialDutyName: primaryDuty.name,
        badgesToRender,
        totalSpecialTasksCount: activeDuties.length,
      };
    }

    // TANPA TUGAS KHUSUS: Menggunakan warna standar shift reguler
    // PERAN/JABATAN (Kepala Ruangan, PJ Shift, Perawat Pelaksana) TIDAK merubah warna tombol
    if (isPagi) {
      return {
        letter: 'P',
        badgeClass: 'bg-emerald-600 text-white border-emerald-700 font-black shadow-xs hover:bg-emerald-700',
        printBadgeClass: 'bg-emerald-600 text-white border-emerald-700 font-black',
        taskDescription: 'Pagi Reguler (Hijau)',
        hasSpecialDuty: false,
        badgesToRender: [],
        totalSpecialTasksCount: 0,
      };
    }

    return {
      letter: 'S',
      badgeClass: 'bg-pink-500 text-white border-pink-600 font-black shadow-xs hover:bg-pink-600',
      printBadgeClass: 'bg-pink-500 text-white border-pink-600 font-black',
      taskDescription: 'Siang Reguler (Pink)',
      hasSpecialDuty: false,
      badgesToRender: [],
      totalSpecialTasksCount: 0,
    };
  };

  // Reusable Color Guide (Panduan Warna Tombol Matriks)
  const renderColorGuide = (isPrint: boolean = false) => (
    <div
      className={`rounded-2xl border border-teal-200/90 shadow-2xs ${
        isPrint
          ? 'p-2.5 my-3 bg-teal-50/20 text-[9.5px] border-teal-300 print-avoid-break'
          : 'bg-gradient-to-r from-teal-50/80 via-white to-teal-50/60 p-4 space-y-3 text-xs shadow-xs'
      }`}
    >
      <div className="font-bold text-slate-800 flex flex-col md:flex-row md:items-center md:justify-between gap-2 pb-2 border-b border-teal-100">
        <div className="flex items-center space-x-2">
          <Sparkles className="w-4 h-4 text-teal-600" />
          <span className="font-extrabold uppercase tracking-wide">
            Panduan Warna Tombol Shift &amp; Tugas Khusus pada Matrik
          </span>
        </div>
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100/90 border border-emerald-300 text-emerald-900 text-[11px] font-bold">
          <span>✨ ATURAN: HANYA TUGAS KHUSUS yang merubah warna tombol. PERAN/JABATAN TIDAK merubah warna tombol.</span>
        </div>
      </div>

      {/* Baris 1: Shift Reguler Standar (Semua Staf Tanpa Tugas Khusus Termasuk Karu & PJ Shift) */}
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="font-extrabold text-slate-700 min-w-[140px]">Shift Reguler Standar:</span>

        <div className="flex items-center space-x-1.5" title="Shift Pagi Reguler">
          <span className="w-5 h-5 rounded-md bg-emerald-600 text-white font-black text-[11px] flex items-center justify-center shadow-2xs">
            P
          </span>
          <span className="text-slate-700 font-semibold">Pagi Reguler (Hijau)</span>
        </div>

        <div className="flex items-center space-x-1.5" title="Shift Siang Reguler">
          <span className="w-5 h-5 rounded-md bg-pink-500 text-white font-black text-[11px] flex items-center justify-center shadow-2xs">
            S
          </span>
          <span className="text-slate-700 font-semibold">Siang Reguler (Pink)</span>
        </div>

        <div className="flex items-center space-x-1.5" title="Dinas Rangkap 2 Shif">
          <span className="w-5 h-5 rounded-md bg-indigo-600 text-white font-black text-[11px] flex items-center justify-center shadow-2xs">
            2S
          </span>
          <span className="text-slate-700">Pagi &amp; Siang (2 Sesi)</span>
        </div>

        <div className="flex items-center space-x-1.5" title="Libur Rutin Hari Minggu">
          <span className="w-5 h-5 rounded-md bg-rose-100 text-rose-800 border border-rose-300 font-extrabold text-[11px] flex items-center justify-center">
            L
          </span>
          <span className="text-slate-700">Minggu Libur</span>
        </div>

        <div className="flex items-center space-x-1.5" title="Libur Lepas Dinas">
          <span className="w-5 h-5 rounded-md bg-slate-100 text-slate-600 border border-slate-300 font-bold text-[11px] flex items-center justify-center">
            L
          </span>
          <span className="text-slate-700">Libur Rutin</span>
        </div>

        <div className="flex items-center space-x-1.5" title="Cuti Tahunan">
          <span className="w-5 h-5 rounded-md bg-amber-100 text-amber-900 border border-amber-300 font-bold text-[11px] flex items-center justify-center">
            C
          </span>
          <span className="text-slate-700">Cuti</span>
        </div>

        <div className="flex items-center space-x-1.5" title="Izin Resmi">
          <span className="w-5 h-5 rounded-md bg-indigo-100 text-indigo-900 border border-indigo-300 font-bold text-[11px] flex items-center justify-center">
            I
          </span>
          <span className="text-slate-700">Izin</span>
        </div>

        <div className="flex items-center space-x-1.5" title="Sakit Keterangan Dokter">
          <span className="w-5 h-5 rounded-md bg-slate-200 text-slate-800 border border-slate-300 font-bold text-[11px] flex items-center justify-center">
            SK
          </span>
          <span className="text-slate-700">Sakit</span>
        </div>
      </div>

      {/* Baris 2: Warna Tombol Berdasarkan TUGAS KHUSUS (Hanya Berubah Jika Ada Tugas Khusus) */}
      <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-teal-100/70">
        <span className="font-extrabold text-teal-900 min-w-[140px]">Warna Tugas Khusus:</span>

        <div className="flex items-center space-x-1.5" title="Tugas Khusus CITO Isolasi HD (Hitam)">
          <span className="w-5 h-5 rounded-md bg-slate-900 text-white font-black text-[11px] flex items-center justify-center shadow-2xs ring-1 ring-slate-700">
            P/S
          </span>
          <span className="text-slate-900 font-bold">CITO Isolasi (Hitam)</span>
        </div>

        <div className="flex items-center space-x-1.5" title="Tugas Khusus BHP (Bahan Habis Pakai) (Biru)">
          <span className="w-5 h-5 rounded-md bg-blue-600 text-white font-black text-[11px] flex items-center justify-center shadow-2xs">
            P/S
          </span>
          <span className="text-slate-700 font-bold">BHP (Biru)</span>
        </div>

        <div className="flex items-center space-x-1.5" title="Tugas Khusus Farmasi & Logistik (Ungu)">
          <span className="w-5 h-5 rounded-md bg-purple-600 text-white font-black text-[11px] flex items-center justify-center shadow-2xs">
            P/S
          </span>
          <span className="text-slate-700 font-bold">Farmasi &amp; Logistik (Ungu)</span>
        </div>

        <div className="flex items-center space-x-1.5" title="Tugas Khusus Natrium RO (Kuning)">
          <span className="w-5 h-5 rounded-md bg-yellow-400 text-slate-900 font-black text-[11px] flex items-center justify-center shadow-2xs">
            P/S
          </span>
          <span className="text-slate-700 font-bold">Natrium RO (Kuning)</span>
        </div>

        <div className="flex items-center space-x-1.5" title="Tugas Khusus PJ Shif (Oranye)">
          <span className="w-5 h-5 rounded-md bg-orange-500 text-white font-black text-[11px] flex items-center justify-center shadow-2xs">
            P/S
          </span>
          <span className="text-slate-700 font-bold">PJ Shif (Oranye)</span>
        </div>

        <p className="w-full text-[10.5px] text-teal-800/90 italic pt-1">
          * Catatan: Jika perawat memiliki 1 tugas khusus, ditandai dengan warna tombol di atas (tanpa badge). Jika memiliki 2 tugas khusus, tugas kedua ditandai dengan badge di bawah tombol.
        </p>
      </div>
    </div>
  );

  // Dedicated Print Nurse Matrix Table (Format Persis Matrik Layar)
  const renderPrintNurseMatrixTable = () => {
    const staffList = sortNursesByShiftScheduleOrder(
      employees.filter(
        (emp) =>
          (emp.role === 'perawat' || emp.role === 'pj_shift' || emp.role === 'kepala_ruangan') &&
          (emp.status === 'aktif' || !emp.status)
      )
    );

    const staffStats = new Map<string, { pagi: number; siang: number }>();
    staffList.forEach((emp) => {
      let pagi = 0;
      let siang = 0;
      days.forEach((day) => {
        const sch = schedules.find((s) => s.employeeId === emp.id && s.date === day.dateStr);
        const shift = sch
          ? sch.shift
          : day.isSunday
          ? 'libur'
          : getEffectiveShiftForEmployee(emp, day.dateStr, schedules, employees);
        if (shift === 'pagi') pagi++;
        else if (shift === 'siang') siang++;
        else if (shift === 'pagi_siang') {
          pagi++;
          siang++;
        }
      });
      staffStats.set(emp.id, { pagi, siang });
    });

    const dailyStats = days.map((day) => {
      let pagi = 0;
      let siang = 0;
      staffList.forEach((emp) => {
        const sch = schedules.find((s) => s.employeeId === emp.id && s.date === day.dateStr);
        const shift = sch
          ? sch.shift
          : day.isSunday
          ? 'libur'
          : getEffectiveShiftForEmployee(emp, day.dateStr, schedules, employees);
        if (shift === 'pagi') pagi++;
        else if (shift === 'siang') siang++;
        else if (shift === 'pagi_siang') {
          pagi++;
          siang++;
        }
      });
      return { dateStr: day.dateStr, isSunday: day.isSunday, pagi, siang };
    });

    let grandTotalPagi = 0;
    let grandTotalSiang = 0;
    dailyStats.forEach((s) => {
      grandTotalPagi += s.pagi;
      grandTotalSiang += s.siang;
    });

    return (
      <div className="w-full overflow-visible">
        <table className="w-full text-left border-collapse border border-slate-300 text-[8.5px]">
          <thead>
            <tr className="bg-teal-700 text-white font-bold">
              <th className="p-1 border border-slate-300 text-center w-5">No</th>
              <th className="p-1 border border-slate-300 min-w-[110px] text-left">Nama Perawat (#Kel)</th>
              {days.map((day) => (
                <th
                  key={day.dateStr}
                  className={`p-0.5 border border-slate-300 text-center min-w-[19px] ${
                    day.isSunday ? 'bg-rose-600 text-white font-black' : ''
                  }`}
                >
                  <div className="text-[7px] uppercase opacity-90">{day.dayName.substring(0, 2)}</div>
                  <div className="font-extrabold text-[8.5px]">{day.date.getDate()}</div>
                </th>
              ))}
              <th className="p-1 border border-slate-300 text-center bg-teal-800 text-white font-extrabold min-w-[22px]">
                P
              </th>
              <th className="p-1 border border-slate-300 text-center bg-teal-800 text-white font-extrabold min-w-[22px]">
                S
              </th>
              <th className="p-1 border border-slate-300 text-center bg-teal-900 text-white font-extrabold min-w-[25px]">
                Tot
              </th>
            </tr>
          </thead>
          <tbody>
            {staffList.map((emp, idx) => {
              const stats = staffStats.get(emp.id) || { pagi: 0, siang: 0 };

              return (
                <tr key={emp.id} className={idx % 2 === 1 ? 'bg-slate-50/60' : 'bg-white'}>
                  <td className="p-0.5 border border-slate-300 text-center font-bold text-slate-600">
                    {idx + 1}
                  </td>
                  <td className="p-1 border border-slate-300 font-bold text-slate-900 truncate">
                    <span>{emp.name}</span>
                  </td>
                  {days.map((day) => {
                    const sch = schedules.find((s) => s.employeeId === emp.id && s.date === day.dateStr);
                    const shift = sch
                      ? sch.shift
                      : day.isSunday
                      ? 'libur'
                      : getEffectiveShiftForEmployee(emp, day.dateStr, schedules, employees);

                    const matrixStyle = getShiftButtonMatrixStyle(
                      shift,
                      day,
                      emp,
                      specialTasks,
                      false,
                      !!sch
                    );

                    return (
                      <td
                        key={day.dateStr}
                        className={`p-0.5 border border-slate-300 text-center align-middle ${
                          day.isSunday ? 'bg-rose-50/40' : ''
                        }`}
                        title={`${emp.name}: ${matrixStyle.taskDescription}`}
                      >
                        <div
                          className={`w-4.5 h-4.5 rounded text-[8px] border mx-auto flex items-center justify-center ${matrixStyle.printBadgeClass}`}
                        >
                          <span className="leading-none">{matrixStyle.letter}</span>
                        </div>
                      </td>
                    );
                  })}
                  <td className="p-0.5 border border-slate-300 text-center font-bold text-emerald-800 bg-emerald-50/50">
                    {stats.pagi}
                  </td>
                  <td className="p-0.5 border border-slate-300 text-center font-bold text-pink-800 bg-pink-50/50">
                    {stats.siang}
                  </td>
                  <td className="p-0.5 border border-slate-300 text-center font-black text-slate-900 bg-slate-100/70">
                    {stats.pagi + stats.siang}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="font-bold bg-slate-100 border-t-2 border-slate-400">
            <tr>
              <td colSpan={2} className="p-1 border border-slate-300 text-right text-emerald-800 font-extrabold">
                Total Perawat Pagi
              </td>
              {dailyStats.map((s) => (
                <td key={s.dateStr} className="p-0.5 border border-slate-300 text-center text-emerald-800">
                  {s.isSunday ? '-' : s.pagi}
                </td>
              ))}
              <td className="p-0.5 border border-slate-300 text-center text-emerald-800 bg-emerald-100/60 font-black">
                {grandTotalPagi}
              </td>
              <td className="p-0.5 border border-slate-300 text-center text-slate-400">-</td>
              <td className="p-0.5 border border-slate-300 text-center text-slate-900 bg-slate-200 font-black">
                {grandTotalPagi}
              </td>
            </tr>
            <tr>
              <td colSpan={2} className="p-1 border border-slate-300 text-right text-pink-800 font-extrabold">
                Total Perawat Siang
              </td>
              {dailyStats.map((s) => (
                <td key={s.dateStr} className="p-0.5 border border-slate-300 text-center text-pink-800">
                  {s.isSunday ? '-' : s.siang}
                </td>
              ))}
              <td className="p-0.5 border border-slate-300 text-center text-slate-400">-</td>
              <td className="p-0.5 border border-slate-300 text-center text-pink-800 bg-pink-100/60 font-black">
                {grandTotalSiang}
              </td>
              <td className="p-0.5 border border-slate-300 text-center text-slate-900 bg-slate-200 font-black">
                {grandTotalSiang}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    );
  };

  // Dedicated Print Doctor Schedule Table (Side-by-side sebulan penuh)
  const renderPrintDoctorTable = () => {
    const midPoint = Math.ceil(days.length / 2);
    const col1Days = days.slice(0, midPoint);
    const col2Days = days.slice(midPoint);

    const renderDocCol = (list: typeof days) => (
      <table className="w-full text-left border-collapse border border-slate-300 text-[9.5px]">
        <thead>
          <tr className="bg-blue-700 text-white font-bold">
            <th className="p-1.5 border border-slate-300 text-center w-24">Tanggal &amp; Hari</th>
            <th className="p-1.5 border border-slate-300">Dokter Shif Pagi (07:00 - 14:00)</th>
            <th className="p-1.5 border border-slate-300">Dokter Shif Siang (13:30 - 20:30)</th>
            <th className="p-1.5 border border-slate-300 text-center w-20">Status</th>
          </tr>
        </thead>
        <tbody>
          {list.map((day, idx) => {
            if (day.isSunday) {
              return (
                <tr key={day.dateStr} className="bg-rose-50/50 text-rose-800">
                  <td className="p-1.5 border border-slate-300 text-center font-bold">
                    {day.date.getDate()} {monthNames[selectedMonth].substring(0, 3)} ({day.dayName.substring(0, 3)})
                  </td>
                  <td
                    colSpan={2}
                    className="p-1.5 border border-slate-300 italic text-center text-rose-600 font-semibold"
                  >
                    Libur Rutin HD (Hari Minggu)
                  </td>
                  <td className="p-1.5 border border-slate-300 text-center font-bold text-rose-700">
                    Libur Layanan
                  </td>
                </tr>
              );
            }

            const docP = getDoctorForShiftAndDate(day.dateStr, 'pagi');
            const docS = getDoctorForShiftAndDate(day.dateStr, 'siang');
            const pName = docP ? docP.name : '(Belum Ditentukan / Kosong)';
            const sName = docS ? docS.name : '(Belum Ditentukan / Kosong)';
            const isDouble = docP && docS && docP.id === docS.id;
            const isComplete = Boolean(docP && docS);
            const isPartial = Boolean(docP || docS);

            return (
              <tr key={day.dateStr} className={idx % 2 === 1 ? 'bg-slate-50/60' : 'bg-white'}>
                <td className="p-1.5 border border-slate-300 text-center font-bold text-slate-800">
                  {day.date.getDate()} {monthNames[selectedMonth].substring(0, 3)} ({day.dayName.substring(0, 3)})
                </td>
                <td className={`p-1.5 border border-slate-300 font-bold ${docP ? 'text-slate-900' : 'text-slate-400 italic'}`}>
                  <span className="text-emerald-700 mr-1 font-black">🌅</span>
                  {pName}
                </td>
                <td className={`p-1.5 border border-slate-300 font-bold ${docS ? 'text-slate-900' : 'text-slate-400 italic'}`}>
                  <span className="text-sky-700 mr-1 font-black">🌙</span>
                  {sName}
                </td>
                <td className="p-1.5 border border-slate-300 text-center font-bold">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[8.5px] ${
                      isDouble 
                        ? 'bg-purple-100 text-purple-800' 
                        : isComplete 
                        ? 'bg-blue-100 text-blue-800' 
                        : isPartial 
                        ? 'bg-amber-100 text-amber-800' 
                        : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {isDouble ? '2 Shif' : isComplete ? 'Terisi' : isPartial ? 'Sebagian' : 'Kosong'}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );

    return (
      <div className="grid grid-cols-2 gap-3 w-full">
        <div>{renderDocCol(col1Days)}</div>
        <div>{renderDocCol(col2Days)}</div>
      </div>
    );
  };

  // Dedicated Print Doctor Summary Table
  const renderPrintDoctorSummary = () => {
    const docMonthlyStats = allDoctorEmployees.map((doc) => {
      let pagiCount = 0;
      let siangCount = 0;
      days.forEach((d) => {
        if (d.isSunday) return;
        const pDoc = getDoctorForShiftAndDate(d.dateStr, 'pagi');
        const sDoc = getDoctorForShiftAndDate(d.dateStr, 'siang');
        if (pDoc?.id === doc.id) pagiCount++;
        if (sDoc?.id === doc.id) siangCount++;
      });
      return {
        doc,
        pagiCount,
        siangCount,
        total: pagiCount + siangCount,
      };
    });

    return (
      <div className="mt-3.5 print-avoid-break">
        <h4 className="text-[10.5px] font-black text-slate-900 uppercase tracking-wide mb-1.5 text-center">
          Ringkasan Total Beban Jaga Dokter Bulan Ini
        </h4>
        <table className="w-full text-left border-collapse border border-slate-300 text-[9.5px]">
          <thead>
            <tr className="bg-slate-800 text-white font-bold">
              <th className="p-1.5 border border-slate-300 text-center w-7">No</th>
              <th className="p-1.5 border border-slate-300">Nama Dokter</th>
              <th className="p-1.5 border border-slate-300">Jabatan &amp; Spesialisasi</th>
              <th className="p-1.5 border border-slate-300 text-center w-28 bg-emerald-800">
                Total Shif Pagi (07-14)
              </th>
              <th className="p-1.5 border border-slate-300 text-center w-28 bg-sky-800">
                Total Shif Siang (13-20)
              </th>
              <th className="p-1.5 border border-slate-300 text-center w-28 bg-blue-900 font-extrabold">
                Total Shif Dinas
              </th>
            </tr>
          </thead>
          <tbody>
            {docMonthlyStats.map((item, idx) => (
              <tr key={item.doc.id} className={idx % 2 === 1 ? 'bg-slate-50' : 'bg-white'}>
                <td className="p-1.5 border border-slate-300 text-center font-bold text-slate-500">
                  {idx + 1}
                </td>
                <td className="p-1.5 border border-slate-300 font-extrabold text-slate-900">
                  {item.doc.name}
                </td>
                <td className="p-1.5 border border-slate-300 text-slate-600">
                  {item.doc.specialization || 'Dokter Penanggung Jawab Pelayanan HD'}
                </td>
                <td className="p-1.5 border border-slate-300 text-center font-extrabold text-emerald-800 bg-emerald-50/50">
                  {item.pagiCount} Shif
                </td>
                <td className="p-1.5 border border-slate-300 text-center font-extrabold text-sky-800 bg-sky-50/50">
                  {item.siangCount} Shif
                </td>
                <td className="p-1.5 border border-slate-300 text-center font-black text-blue-950 bg-blue-50/70">
                  {item.total} Shif
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderNurseMatrixTable = (staffList: UserAccount[]) => {
    const isNurse = true;
    const title = 'Jadwal Shift Perawat, PJ Shift & Kepala Ruangan';
    const subtitle = 'Jadwal dinas operasional perawat pelaksana & supervisi Kepala Ruangan unit hemodialisa';
    const countBadge = `${staffList.length} Perawat`;
    const todayStr = getTodayDateString();

    // Precalculate per-staff shift counts (Pagi & Siang)
    const staffStats = new Map<string, { pagi: number; siang: number }>();
    staffList.forEach((emp) => {
      let pagi = 0;
      let siang = 0;
      const isDoc = emp.role === 'dokter';
      days.forEach((day) => {
        const sch = schedules.find((s) => s.employeeId === emp.id && s.date === day.dateStr);
        const isSun = day.isSunday;
        const shift = sch
          ? sch.shift
          : isSun
          ? 'libur'
          : isDoc
          ? undefined
          : getEffectiveShiftForEmployee(emp, day.dateStr, schedules, employees);
        if (shift === 'pagi') pagi++;
        else if (shift === 'siang') siang++;
        else if (shift === 'pagi_siang') {
          pagi++;
          siang++;
        }
      });
      staffStats.set(emp.id, { pagi, siang });
    });

    // Precalculate daily shift counts across all staff in this table
    const dailyStats = days.map((day) => {
      let pagi = 0;
      let siang = 0;
      staffList.forEach((emp) => {
        const isDoc = emp.role === 'dokter';
        const sch = schedules.find((s) => s.employeeId === emp.id && s.date === day.dateStr);
        const isSun = day.isSunday;
        const shift = sch
          ? sch.shift
          : isSun
          ? 'libur'
          : isDoc
          ? undefined
          : getEffectiveShiftForEmployee(emp, day.dateStr, schedules, employees);
        if (shift === 'pagi') pagi++;
        else if (shift === 'siang') siang++;
        else if (shift === 'pagi_siang') {
          pagi++;
          siang++;
        }
      });
      return {
        dateStr: day.dateStr,
        date: day.date,
        isSunday: day.isSunday,
        pagi,
        siang,
      };
    });

    let grandTotalPagi = 0;
    let grandTotalSiang = 0;
    dailyStats.forEach((s) => {
      grandTotalPagi += s.pagi;
      grandTotalSiang += s.siang;
    });

    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Table Section Header */}
        <div className={`p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
          isNurse ? 'bg-gradient-to-r from-teal-50/80 via-white to-teal-50/30' : 'bg-gradient-to-r from-blue-50/80 via-white to-blue-50/30'
        }`}>
          <div className="flex items-center space-x-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-2xs shrink-0 ${
              isNurse ? 'bg-teal-600 text-white' : 'bg-blue-600 text-white'
            }`}>
              {isNurse ? <HeartPulse className="w-5 h-5" /> : <Stethoscope className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-sm font-bold text-slate-900">{title}</h3>
                <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                  isNurse ? 'bg-teal-100 text-teal-800 border-teal-200' : 'bg-blue-100 text-blue-800 border-blue-200'
                }`}>
                  {countBadge}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>
            </div>
          </div>

          <div className="flex items-center space-x-2 self-end sm:self-auto">
            {isNurse && canEdit && (
              <button
                onClick={() => setShowGenerateModal(true)}
                className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold shadow-2xs flex items-center space-x-1.5 transition"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Auto-Generate Perawat</span>
              </button>
            )}
            {!isNurse && (
              <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200 flex items-center gap-1">
                <Edit3 className="w-3.5 h-3.5" />
                <span>Input Manual 1-Klik</span>
              </span>
            )}
          </div>
        </div>

        {/* Matrix Grid */}
        {staffList.length === 0 ? (
          <div className="p-10 text-center">
            <UserCheck className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <h4 className="text-sm font-bold text-slate-700">
              {isNurse ? 'Belum ada data perawat untuk ditampilkan' : 'Belum ada data dokter untuk ditampilkan'}
            </h4>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              {isNurse
                ? 'Tambahkan data perawat melalui menu Manajemen Karyawan untuk mulai menyusun jadwal shift.'
                : 'Tambahkan data dokter spesialis atau dokter jaga melalui menu Manajemen Karyawan untuk mengatur dinas jaga.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[540px]">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 z-20">
                <tr>
                  <th className="p-3 font-bold text-slate-700 bg-slate-100/95 border-r border-slate-200 min-w-[210px] sticky left-0 z-30">
                    <div className="flex items-center space-x-2">
                      <span className="w-6 text-center text-slate-500 font-bold text-[11px]">No</span>
                      <span>Nama {isNurse ? 'Perawat' : 'Dokter'} &amp; Jabatan</span>
                    </div>
                  </th>
                  {days.map((day) => {
                    const isSun = day.isSunday;
                    const isToday = day.dateStr === todayStr;
                    return (
                      <th
                        key={day.dateStr}
                        className={`p-1.5 text-center min-w-[54px] relative transition-colors ${
                          isToday
                            ? 'bg-amber-50 text-amber-950 font-black border-x-2 border-x-amber-500 border-t-2 border-t-amber-500 shadow-xs z-20'
                            : isSun
                            ? 'bg-rose-50/90 text-rose-900 font-extrabold border-r border-slate-200'
                            : 'text-slate-700 font-semibold border-r border-slate-200'
                        }`}
                      >
                        {isToday && (
                          <div className="flex justify-center -mt-1 mb-0.5">
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[8px] font-black bg-amber-600 text-white uppercase tracking-wider shadow-2xs whitespace-nowrap">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-200 animate-ping"></span>
                              Hari Ini
                            </span>
                          </div>
                        )}
                        <div className={`text-[9px] uppercase ${isToday ? 'text-amber-800 font-black' : 'text-slate-400'}`}>
                          {day.dayName.substring(0, 3)}
                        </div>
                        <div className={`text-xs ${
                          isToday
                            ? 'text-amber-950 font-black flex items-center justify-center gap-0.5'
                            : isSun
                            ? 'text-rose-600 font-extrabold'
                            : 'text-slate-800'
                        }`}>
                          {day.date.getDate()}
                        </div>
                      </th>
                    );
                  })}
                  {/* Kolom Rekap Perawat: Pagi, Siang, dan Perbandingan */}
                  <th className="p-2 text-center bg-emerald-50 text-emerald-950 border-r border-slate-200 min-w-[55px] font-extrabold text-[11px] sticky top-0 z-20" title="Total Shift Pagi Bulan Ini">
                    Pagi (P)
                  </th>
                  <th className="p-2 text-center bg-pink-50 text-pink-950 border-r border-slate-200 min-w-[55px] font-extrabold text-[11px] sticky top-0 z-20" title="Total Shift Siang Bulan Ini">
                    Siang (S)
                  </th>
                  <th className="p-2 text-center bg-teal-50 text-teal-950 border-r border-slate-200 min-w-[85px] font-extrabold text-[11px] sticky top-0 z-20" title="Perbandingan Shift Pagi dan Siang">
                    Pagi : Siang
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {staffList.map((emp, idx) => {
                  const isCurrent = emp.id === currentUser.id;
                  const isKaruRole = emp.role === 'kepala_ruangan';
                  const isPjRole = emp.role === 'pj_shift';
                  const isDoc = emp.role === 'dokter';
                  const stats = staffStats.get(emp.id) || { pagi: 0, siang: 0 };

                  return (
                    <tr
                      key={emp.id}
                      className={`hover:bg-teal-50/20 transition ${
                        isCurrent ? 'bg-teal-50/40' : ''
                      }`}
                    >
                      {/* Fixed Staff Column */}
                      <td className="p-2.5 border-r border-slate-200 bg-white sticky left-0 z-10 font-medium">
                        <div className="flex items-center space-x-2.5">
                          <div
                            className="w-6 h-6 rounded-md font-extrabold flex items-center justify-center text-[10px] text-white shrink-0 shadow-2xs bg-teal-600"
                            title={`No. Urut ${idx + 1}`}
                          >
                            {idx + 1}
                          </div>
                          <div className="truncate max-w-[170px]">
                            <div className="font-bold text-slate-800 text-xs truncate flex items-center gap-1">
                              <span>{emp.name}</span>
                              {isCurrent && (
                                <span className="text-[9px] px-1 bg-teal-100 text-teal-800 rounded font-semibold">
                                  Anda
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-400 capitalize truncate flex items-center gap-1 mt-0.5">
                              <span>
                                {emp.role === 'kepala_ruangan'
                                  ? 'Kepala Ruang HD'
                                  : emp.role === 'pj_shift' || (emp.role as string) === 'katim'
                                  ? 'KATIM HD'
                                  : emp.role === 'perawat'
                                  ? 'Perawat Pelaksana'
                                  : emp.role === 'dokter'
                                  ? 'Dokter HD'
                                  : emp.role.replace('_', ' ')}
                              </span>
                              {isDoc && emp.specialization && (
                                <span className="text-[9px] font-semibold text-blue-600">({emp.specialization})</span>
                              )}
                              {isDoc && !emp.specialization && (
                                <span className="text-[9px] font-bold text-blue-600">(Manual)</span>
                              )}
                            </div>
                            {emp.specialDuty && (
                              <div className="mt-0.5">
                                <SpecialDutyBadge duty={emp.specialDuty} size="xs" />
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Date Cells */}
                      {days.map((day) => {
                        const sch = schedules.find(
                          (s) => s.employeeId === emp.id && s.date === day.dateStr
                        );
                        const isSun = day.isSunday;
                        const isToday = day.dateStr === todayStr;
                        let shift = sch ? sch.shift : isSun ? 'libur' : isDoc ? undefined : getEffectiveShiftForEmployee(emp, day.dateStr, schedules, employees);

                        // Check Special Tasks on this date for this employee
                        const specialTasksForEmpToday = specialTasks.filter(
                          (t) => t.assignedToId === emp.id && t.date === day.dateStr
                        );

                        // Filter tasks that belong to this active shift
                        const staffTasksToday = specialTasksForEmpToday.filter((t) => {
                          if (shift === 'pagi' || shift === 'siang') {
                            return !t.shift || t.shift === shift;
                          }
                          return true;
                        });

                        const matrixStyle = getShiftButtonMatrixStyle(
                          shift,
                          day,
                          emp,
                          specialTasks,
                          isDoc,
                          !!sch
                        );

                        return (
                          <td
                            key={day.dateStr}
                            onClick={() => {
                              if (canEdit) {
                                handleCellSingleClick(emp.id, day.dateStr, shift as ShiftType);
                              }
                            }}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              if (canEdit) {
                                const initialEmpTasks = specialTasks
                                  .filter(
                                    (t) =>
                                      t.assignedToId === emp.id &&
                                      t.date === day.dateStr &&
                                      (!t.shift || t.shift === shift || shift === 'pagi_siang')
                                  )
                                  .map((t) => t.category);

                                setEditingCell({
                                  employeeId: emp.id,
                                  dateStr: day.dateStr,
                                  currentShift: (shift as ShiftType) || 'pagi',
                                  note: sch?.note,
                                  specialDutyCategories: initialEmpTasks,
                                });
                              }
                            }}
                            className={`p-1 text-center align-middle select-none transition relative ${
                              isToday
                                ? 'bg-amber-50/50 border-x-2 border-x-amber-500 font-bold'
                                : isSun
                                ? 'bg-rose-50/20 border-r border-slate-100'
                                : 'border-r border-slate-100'
                            } ${canEdit ? 'cursor-pointer hover:bg-amber-100/30' : ''}`}
                            title={`${emp.name} (${day.date.getDate()} ${monthNames[selectedMonth]}): ${matrixStyle.taskDescription}${isToday ? ' [HARI INI]' : ''} | ${canEdit ? 'Klik 1x untuk ganti: Pagi ➜ Siang ➜ Libur (Klik kanan untuk opsi Cuti/Izin)' : ''}`}
                          >
                            <div className="flex flex-col items-center justify-center space-y-1 min-h-[38px] py-0.5">
                              <div
                                className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs border ${matrixStyle.badgeClass} transition-all shadow-2xs relative hover:scale-105 active:scale-95 ${
                                  isToday ? 'ring-2 ring-amber-500 ring-offset-1 font-black shadow-xs' : ''
                                }`}
                              >
                                <span className="font-black leading-none">{matrixStyle.letter}</span>
                                {sch?.isCustomOverride && (
                                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-amber-400 rounded-full border border-white" title="Jadwal manual"></span>
                                )}
                              </div>

                              {matrixStyle.badgesToRender && matrixStyle.badgesToRender.length > 0 && (
                                <div className="flex flex-wrap items-center justify-center gap-0.5 max-w-[48px]">
                                  {matrixStyle.badgesToRender.map((b, bIdx) => (
                                    <span
                                      key={`${b.category}-${bIdx}`}
                                      className={`px-1 py-0.2 rounded text-[7px] font-black text-white leading-tight ${b.badgeBg}`}
                                      title={b.name}
                                    >
                                      {b.shortCode}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>
                        );
                      })}

                      {/* Right summary cells for this staff: Pagi, Siang, Ratio */}
                      <td className="p-2 text-center border-r border-slate-200 font-extrabold text-xs text-emerald-800 bg-emerald-50/30">
                        {stats.pagi}
                      </td>
                      <td className="p-2 text-center border-r border-slate-200 font-extrabold text-xs text-pink-800 bg-pink-50/30">
                        {stats.siang}
                      </td>
                      <td className="p-2 text-center border-r border-slate-200 bg-slate-50/40">
                        <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-md bg-white font-black text-slate-900 text-[11px] border border-slate-300 shadow-2xs">
                          {stats.pagi} : {stats.siang}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Ringkasan Distribusi Shift Harian Terpisah (Di luar deretan nama perawat) */}
        {staffList.length > 0 && isNurse && (
          <div className="border-t border-slate-200 bg-slate-50/50 p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 mb-3 border-b border-slate-200/80 gap-3">
              <div className="flex items-center space-x-2.5">
                <div className="w-7 h-7 rounded-lg bg-teal-100 border border-teal-200 text-teal-700 flex items-center justify-center font-bold">
                  <BarChart3 className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-800">
                    Ringkasan Distribusi Shift Harian
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Rekapitulasi total shift operasional HD (terpisah dari daftar staf perawat)
                  </p>
                </div>
              </div>
              <div className="flex items-center flex-wrap gap-2">
                <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                  Total Pagi: <span className="font-black text-emerald-950">{grandTotalPagi}</span>
                </span>
                <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-pink-50 text-pink-800 border border-pink-200">
                  Total Siang: <span className="font-black text-pink-950">{grandTotalSiang}</span>
                </span>
                <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-teal-50 text-teal-900 border border-teal-200">
                  Perbandingan (P : S): <span className="font-black text-teal-950">{grandTotalPagi} : {grandTotalSiang}</span>
                </span>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 font-bold">
                    <th className="p-2.5 font-bold min-w-[210px] border-r border-slate-200 sticky left-0 bg-slate-100 z-10">
                      Indikator Shift Harian
                    </th>
                    {days.map((day) => {
                      const isToday = day.dateStr === todayStr;
                      return (
                        <th
                          key={`sum-hdr-${day.dateStr}`}
                          className={`p-1 text-center min-w-[34px] font-bold ${
                            isToday
                              ? 'bg-amber-100/90 text-amber-950 font-black border-x-2 border-x-amber-500'
                              : day.isSunday
                              ? 'text-rose-500 bg-rose-50/60 border-r border-slate-200'
                              : 'text-slate-600 border-r border-slate-200'
                          }`}
                        >
                          {day.date.getDate()}
                        </th>
                      );
                    })}
                    <th className="p-2 text-center bg-slate-200/70 font-bold text-slate-800 min-w-[70px]">
                      Total Bulan
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr className="bg-emerald-50/30">
                    <td className="p-2 font-bold text-emerald-950 sticky left-0 bg-emerald-100/90 z-10 border-r border-slate-200">
                      <div className="flex items-center justify-between">
                        <span>Total Shift Pagi (P)</span>
                        <span className="w-2 h-2 rounded-full bg-emerald-600 ml-1"></span>
                      </div>
                    </td>
                    {dailyStats.map((stat) => {
                      const isToday = stat.dateStr === todayStr;
                      return (
                        <td
                          key={`sum-p-${stat.dateStr}`}
                          className={`p-1 text-center font-extrabold text-xs ${
                            isToday
                              ? 'bg-amber-50/90 text-emerald-950 border-x-2 border-x-amber-500 font-black'
                              : stat.isSunday
                              ? 'text-slate-400 bg-rose-50/30 border-r border-slate-200'
                              : 'text-emerald-800 border-r border-slate-200'
                          }`}
                        >
                          {stat.isSunday ? '-' : stat.pagi}
                        </td>
                      );
                    })}
                    <td className="p-2 text-center font-black text-xs text-emerald-900 bg-emerald-100/70">
                      {grandTotalPagi}
                    </td>
                  </tr>
                  <tr className="bg-pink-50/30">
                    <td className="p-2 font-bold text-pink-950 sticky left-0 bg-pink-100/90 z-10 border-r border-slate-200">
                      <div className="flex items-center justify-between">
                        <span>Total Shift Siang (S)</span>
                        <span className="w-2 h-2 rounded-full bg-pink-500 ml-1"></span>
                      </div>
                    </td>
                    {dailyStats.map((stat) => {
                      const isToday = stat.dateStr === todayStr;
                      return (
                        <td
                          key={`sum-s-${stat.dateStr}`}
                          className={`p-1 text-center font-extrabold text-xs ${
                            isToday
                              ? 'bg-amber-50/90 text-pink-950 border-x-2 border-x-amber-500 font-black'
                              : stat.isSunday
                              ? 'text-slate-400 bg-rose-50/30 border-r border-slate-200'
                              : 'text-pink-800 border-r border-slate-200'
                          }`}
                        >
                          {stat.isSunday ? '-' : stat.siang}
                        </td>
                      );
                    })}
                    <td className="p-2 text-center font-black text-xs text-pink-900 bg-pink-100/70">
                      {grandTotalSiang}
                    </td>
                  </tr>
                  <tr className="bg-teal-50/40">
                    <td className="p-2 font-black text-teal-950 sticky left-0 bg-teal-100/90 z-10 border-r border-slate-200">
                      <div className="flex items-center justify-between">
                        <span>Perbandingan Harian (P : S)</span>
                        <span className="text-[9px] px-1 py-0.5 rounded bg-teal-800 text-white font-bold ml-1">Rasio</span>
                      </div>
                    </td>
                    {dailyStats.map((stat) => {
                      const isToday = stat.dateStr === todayStr;
                      return (
                        <td
                          key={`sum-r-${stat.dateStr}`}
                          className={`p-1 text-center font-bold text-[10px] ${
                            isToday
                              ? 'bg-amber-50/90 text-teal-950 border-x-2 border-x-amber-500 font-black'
                              : stat.isSunday
                              ? 'text-slate-400 bg-rose-50/30 border-r border-slate-200'
                              : 'text-teal-900 border-r border-slate-200'
                          }`}
                        >
                          {stat.isSunday ? '-' : `${stat.pagi} : ${stat.siang}`}
                        </td>
                      );
                    })}
                    <td className="p-2 text-center font-black text-teal-950 bg-teal-200/70 text-[11px] whitespace-nowrap">
                      {grandTotalPagi} : {grandTotalSiang}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderDoctorScheduleManager = () => {
    // 1. Doctor stats for this month
    const docMonthlyStats = allDoctorEmployees.map((doc) => {
      let pagiCount = 0;
      let siangCount = 0;
      days.forEach((d) => {
        if (d.isSunday) return;
        const pDoc = getDoctorForShiftAndDate(d.dateStr, 'pagi');
        const sDoc = getDoctorForShiftAndDate(d.dateStr, 'siang');
        if (pDoc?.id === doc.id) pagiCount++;
        if (sDoc?.id === doc.id) siangCount++;
      });
      const workingDaysCount = days.filter((d) => !d.isSunday).length;
      return {
        doc,
        pagiCount,
        siangCount,
        total: pagiCount + siangCount,
        offDays: Math.max(0, workingDaysCount - (pagiCount + siangCount)),
      };
    });

    const workingDaysCount = days.filter((d) => !d.isSunday).length;
    const sundayDaysCount = days.filter((d) => d.isSunday).length;
    const totalWorkingShiftsNeeded = workingDaysCount * 2;

    let totalAssignedShifts = 0;
    days.forEach((d) => {
      if (d.isSunday) return;
      if (getDoctorForShiftAndDate(d.dateStr, 'pagi')) totalAssignedShifts++;
      if (getDoctorForShiftAndDate(d.dateStr, 'siang')) totalAssignedShifts++;
    });

    const isMonthComplete = totalWorkingShiftsNeeded > 0 && totalAssignedShifts >= totalWorkingShiftsNeeded;

    // Quick bulk pattern application
    const handleQuickPattern = (pagiDocId: string, siangDocId: string, mode: 'fixed' | 'alternating' = 'fixed') => {
      let newSchedules = schedules.filter((s) => {
        const isCurrentMonth = s.date.startsWith(monthPrefix);
        const isDoctor = allDoctorEmployees.some((d) => d.id === s.employeeId);
        return !(isCurrentMonth && isDoctor);
      });

      days.forEach((day) => {
        if (day.isSunday) {
          allDoctorEmployees.forEach((doc) => {
            newSchedules.push({
              id: `${doc.id}_${day.dateStr}`,
              employeeId: doc.id,
              date: day.dateStr,
              shift: 'libur',
              note: 'Lepas Jaga (Libur Rutin HD Hari Minggu)',
              isCustomOverride: true,
            });
          });
          return;
        }

        let pId = pagiDocId;
        let sId = siangDocId;
        if (mode === 'alternating' && day.date.getDate() % 2 === 0) {
          pId = siangDocId;
          sId = pagiDocId;
        }

        allDoctorEmployees.forEach((doc) => {
          let assignedShift: ShiftType = 'libur';
          let note = 'Lepas Jaga / Libur Dinas';

          if (pId === sId && doc.id === pId) {
            assignedShift = 'pagi_siang';
            note = 'Dokter Jaga 2 Shif (Pagi & Siang)';
          } else if (doc.id === pId) {
            assignedShift = 'pagi';
            note = 'Dokter Penanggung Jawab HD (Pagi)';
          } else if (doc.id === sId) {
            assignedShift = 'siang';
            note = 'Dokter Jaga HD (Siang)';
          }

          newSchedules.push({
            id: `${doc.id}_${day.dateStr}`,
            employeeId: doc.id,
            date: day.dateStr,
            shift: assignedShift,
            note,
            isCustomOverride: true,
          });
        });
      });

      onUpdateSchedule(newSchedules);
    };

    // Swap doctor pagi and siang for a specific date
    const handleSwapDateDoctor = (dateStr: string) => {
      const curP = getDoctorForShiftAndDate(dateStr, 'pagi');
      const curS = getDoctorForShiftAndDate(dateStr, 'siang');
      if (!curP && !curS) {
        showScheduleToast('Tidak ada dokter yang bertugas untuk ditukar pada tanggal ini.', 'error');
        return;
      }
      let newSchedules = [...schedules];
      allDoctorEmployees.forEach((doc) => {
        const existingIdx = newSchedules.findIndex(
          (s) => s.employeeId === doc.id && s.date === dateStr
        );
        let shift: ShiftType = 'libur';
        let note = 'Lepas Jaga / Libur Dinas';

        if (curP?.id === curS?.id && doc.id === curP?.id) {
          shift = 'pagi_siang';
          note = 'Dokter Jaga 2 Shif (Pagi & Siang)';
        } else if (doc.id === curP?.id) {
          shift = 'siang';
          note = 'Dokter Jaga HD (Siang)';
        } else if (doc.id === curS?.id) {
          shift = 'pagi';
          note = 'Dokter Penanggung Jawab HD (Pagi)';
        }

        const item: ShiftSchedule = {
          id: `${doc.id}_${dateStr}`,
          employeeId: doc.id,
          date: dateStr,
          shift,
          note,
          isCustomOverride: true,
        };
        if (existingIdx >= 0) {
          newSchedules[existingIdx] = item;
        } else {
          newSchedules.push(item);
        }
      });
      onUpdateSchedule(newSchedules);
      showScheduleToast(`Posisi dokter Pagi & Siang pada ${dateStr} berhasil ditukar.`, 'success');
    };

    // Clear doctor shifts for a specific date
    const handleClearDateDoctor = (dateStr: string) => {
      let newSchedules = [...schedules];
      allDoctorEmployees.forEach((doc) => {
        const existingIdx = newSchedules.findIndex(
          (s) => s.employeeId === doc.id && s.date === dateStr
        );
        const item: ShiftSchedule = {
          id: `${doc.id}_${dateStr}`,
          employeeId: doc.id,
          date: dateStr,
          shift: 'libur',
          note: 'Lepas Jaga / Libur Dinas',
          isCustomOverride: true,
        };
        if (existingIdx >= 0) {
          newSchedules[existingIdx] = item;
        } else {
          newSchedules.push(item);
        }
      });
      onUpdateSchedule(newSchedules);
      showScheduleToast(`Jadwal dokter pada ${dateStr} berhasil dikosongkan.`, 'info');
    };

    // Assign same doctor to both shifts on a date
    const handleAssignBothShifts = (dateStr: string, docId: string) => {
      let newSchedules = [...schedules];
      allDoctorEmployees.forEach((doc) => {
        const existingIdx = newSchedules.findIndex(
          (s) => s.employeeId === doc.id && s.date === dateStr
        );
        const isTarget = doc.id === docId;
        const item: ShiftSchedule = {
          id: `${doc.id}_${dateStr}`,
          employeeId: doc.id,
          date: dateStr,
          shift: isTarget ? 'pagi_siang' : 'libur',
          note: isTarget ? 'Dokter Jaga 2 Shif (Pagi & Siang)' : 'Lepas Jaga / Libur Dinas',
          isCustomOverride: true,
        };
        if (existingIdx >= 0) {
          newSchedules[existingIdx] = item;
        } else {
          newSchedules.push(item);
        }
      });
      onUpdateSchedule(newSchedules);
      const docName = allDoctorEmployees.find((d) => d.id === docId)?.name || 'Dokter';
      showScheduleToast(`${docName} ditugaskan 2 shif (Pagi & Siang) pada ${dateStr}.`, 'success');
    };

    // Bulk assign one doctor to all pagi or siang shifts this month
    const handleAssignMonthShift = (shift: 'pagi' | 'siang', docId: string) => {
      let newSchedules = [...schedules];
      const otherShift: 'pagi' | 'siang' = shift === 'pagi' ? 'siang' : 'pagi';

      days.forEach((day) => {
        if (day.isSunday) return;

        allDoctorEmployees.forEach((doc) => {
          const existingIdx = newSchedules.findIndex(
            (s) => s.employeeId === doc.id && s.date === day.dateStr
          );
          const currentSch = existingIdx >= 0 ? newSchedules[existingIdx] : null;

          if (doc.id === docId) {
            let targetShift: ShiftType = shift;
            let note = shift === 'pagi' ? 'Dokter Penanggung Jawab HD (Pagi)' : 'Dokter Jaga HD (Siang)';

            if (currentSch?.shift === otherShift || currentSch?.shift === 'pagi_siang') {
              targetShift = 'pagi_siang';
              note = 'Dokter Jaga 2 Shif (Pagi & Siang)';
            }

            const item: ShiftSchedule = {
              id: `${doc.id}_${day.dateStr}`,
              employeeId: doc.id,
              date: day.dateStr,
              shift: targetShift,
              note,
              isCustomOverride: true,
            };
            if (existingIdx >= 0) {
              newSchedules[existingIdx] = item;
            } else {
              newSchedules.push(item);
            }
          } else {
            if (currentSch) {
              if (currentSch.shift === 'pagi_siang') {
                newSchedules[existingIdx] = {
                  ...currentSch,
                  shift: otherShift,
                  note: otherShift === 'pagi' ? 'Dokter Penanggung Jawab HD (Pagi)' : 'Dokter Jaga HD (Siang)',
                  isCustomOverride: true,
                };
              } else if (currentSch.shift === shift) {
                newSchedules[existingIdx] = {
                  ...currentSch,
                  shift: 'libur',
                  note: 'Lepas Jaga / Libur Dinas',
                  isCustomOverride: true,
                };
              }
            }
          }
        });
      });

      onUpdateSchedule(newSchedules);
      const docName = allDoctorEmployees.find((d) => d.id === docId)?.name || 'Dokter';
      showScheduleToast(`Seluruh Shif ${shift === 'pagi' ? 'Pagi' : 'Siang'} bulan ini ditugaskan ke ${docName}.`, 'success');
    };

    // Filter days for the table
    const filteredDays = days.filter((day) => {
      const isSun = day.isSunday;
      const docP = getDoctorForShiftAndDate(day.dateStr, 'pagi');
      const docS = getDoctorForShiftAndDate(day.dateStr, 'siang');
      const isIncomplete = !isSun && (!docP || !docS);

      if (doctorMonthFilter === 'workdays' && isSun) return false;
      if (doctorMonthFilter === 'sundays' && !isSun) return false;
      if (doctorMonthFilter === 'incomplete' && !isIncomplete) return false;

      if (doctorSearchQuery.trim()) {
        const q = doctorSearchQuery.toLowerCase();
        const matchDay = day.dayName.toLowerCase().includes(q);
        const matchDate = day.dateStr.includes(q) || String(day.date.getDate()) === q;
        const matchDocP = docP?.name.toLowerCase().includes(q) || false;
        const matchDocS = docS?.name.toLowerCase().includes(q) || false;
        if (!matchDay && !matchDate && !matchDocP && !matchDocS) return false;
      }

      return true;
    });

    const todayStr = getTodayDateString();

    return (
      <div className="space-y-4">
        {/* Header Bar Jadwal Shift Dokter Sebulan */}
        <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-sky-800 p-4 sm:p-5 rounded-2xl text-white shadow-xs">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center space-x-3.5">
              <div className="p-3 rounded-2xl bg-white/15 text-white backdrop-blur-xs shrink-0 shadow-inner">
                <Stethoscope className="w-6 h-6 text-sky-200" />
              </div>
              <div>
                <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                  <h3 className="font-extrabold text-base sm:text-lg tracking-tight">
                    Jadwal Shift Dokter Hemodialisa (Satu Bulan Penuh)
                  </h3>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-white/20 font-bold text-sky-100 border border-white/20">
                    1 Dokter per Shif
                  </span>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-sky-950/40 font-bold text-sky-200 border border-sky-400/30">
                    {monthNames[selectedMonth]} {selectedYear}
                  </span>
                </div>
                <p className="text-xs text-sky-100/90 mt-1 max-w-2xl leading-relaxed">
                  Tampilan satu bulan penuh untuk penginputan dan edit jadwal dokter jaga HD secara langsung tanpa navigasi per hari. Shif Pagi (07:00 - 14:00) dan Shif Siang (13:30 - 20:30).
                </p>
              </div>
            </div>

            {/* Kontrol Bulan & Tombol Tindakan */}
            <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
              {/* Navigasi Bulan */}
              <div className="flex items-center bg-white/15 backdrop-blur-xs rounded-xl p-1 border border-white/20 shadow-2xs">
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  className="p-1.5 hover:bg-white/20 rounded-lg text-white transition min-w-[30px] min-h-[30px] flex items-center justify-center cursor-pointer"
                  title="Bulan Sebelumnya"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="px-2.5 text-xs font-black text-white min-w-[120px] text-center">
                  {monthNames[selectedMonth]} {selectedYear}
                </div>
                <button
                  type="button"
                  onClick={handleNextMonth}
                  className="p-1.5 hover:bg-white/20 rounded-lg text-white transition min-w-[30px] min-h-[30px] flex items-center justify-center cursor-pointer"
                  title="Bulan Berikutnya"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {canEdit && (
                <button
                  type="button"
                  onClick={() => setShowDoctorPatternModal(true)}
                  className="px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold rounded-xl text-xs transition flex items-center space-x-1.5 cursor-pointer shadow-xs active:scale-95"
                  title="Buka dialog pengaturan pola jadwal dokter sebulan"
                >
                  <Zap className="w-3.5 h-3.5 text-slate-950 fill-current" />
                  <span>Pola Cepat 1 Bulan</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Ringkasan Beban Jaga Dokter Bulan Ini (Doctor Summary Cards) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {docMonthlyStats.map((item, idx) => {
            const isReza = item.doc.name.toLowerCase().includes('reza');
            const cardBg = isReza ? 'border-blue-200 bg-gradient-to-br from-blue-50/70 via-white to-sky-50/40' : 'border-emerald-200 bg-gradient-to-br from-emerald-50/70 via-white to-teal-50/40';
            const badgeBg = isReza ? 'bg-blue-600' : 'bg-emerald-600';

            return (
              <div
                key={item.doc.id}
                className={`p-4 rounded-2xl border shadow-2xs hover:shadow-xs transition flex flex-col justify-between ${cardBg}`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center space-x-3">
                      <div className={`w-10 h-10 rounded-xl ${badgeBg} text-white font-extrabold text-sm flex items-center justify-center shadow-2xs shrink-0`}>
                        dr
                      </div>
                      <div>
                        <div className="font-extrabold text-slate-900 text-sm leading-snug">
                          {item.doc.name}
                        </div>
                        <div className="text-[11px] text-slate-500 font-medium">
                          {item.doc.specialization || 'Dokter Penanggung Jawab Pelayanan HD'}
                        </div>
                      </div>
                    </div>
                    <span className="text-[11px] px-2 py-0.5 rounded-full font-bold bg-white border border-slate-200 text-slate-700 shadow-2xs">
                      #{idx + 1}
                    </span>
                  </div>

                  {/* Statistik Shif Bulan Ini */}
                  <div className="grid grid-cols-3 gap-2 mt-3.5 pt-3 border-t border-slate-200/80 text-center">
                    <div className="p-2 rounded-xl bg-white/90 border border-slate-200/70 shadow-2xs">
                      <span className="text-[10px] text-slate-500 block uppercase font-bold tracking-tight">Total Dinas</span>
                      <span className="text-base font-black text-slate-900">{item.total}</span>
                      <span className="text-[10px] text-slate-400 block">Shif</span>
                    </div>
                    <div className="p-2 rounded-xl bg-emerald-50/80 border border-emerald-200/70 shadow-2xs">
                      <span className="text-[10px] text-emerald-700 block uppercase font-bold tracking-tight">Pagi (07-14)</span>
                      <span className="text-base font-black text-emerald-800">{item.pagiCount}</span>
                      <span className="text-[10px] text-emerald-600 block">Shif</span>
                    </div>
                    <div className="p-2 rounded-xl bg-sky-50/80 border border-sky-200/70 shadow-2xs">
                      <span className="text-[10px] text-sky-700 block uppercase font-bold tracking-tight">Siang (13-20)</span>
                      <span className="text-base font-black text-sky-800">{item.siangCount}</span>
                      <span className="text-[10px] text-sky-600 block">Shif</span>
                    </div>
                  </div>
                </div>

                {/* Quick 1-Click Assignment Buttons */}
                {canEdit && (
                  <div className="mt-3 pt-2.5 border-t border-slate-200/60 flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Tugaskan Penuh:</span>
                    <button
                      type="button"
                      onClick={() => handleAssignMonthShift('pagi', item.doc.id)}
                      className="px-2 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-900 text-[10px] font-bold rounded-lg transition cursor-pointer"
                      title={`Tugaskan ${item.doc.name} di seluruh Shif Pagi bulan ini`}
                    >
                      Semua Pagi
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAssignMonthShift('siang', item.doc.id)}
                      className="px-2 py-1 bg-sky-100 hover:bg-sky-200 text-sky-900 text-[10px] font-bold rounded-lg transition cursor-pointer"
                      title={`Tugaskan ${item.doc.name} di seluruh Shif Siang bulan ini`}
                    >
                      Semua Siang
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const todayStr = getTodayDateString();
                        const targetMonthPrefix = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
                        const targetDate = todayStr.startsWith(targetMonthPrefix)
                          ? todayStr
                          : `${targetMonthPrefix}-01`;
                        setSelectedEmployeeForWA({
                          employee: item.doc,
                          dateStr: targetDate,
                          shift: item.pagiCount >= item.siangCount ? 'pagi' : 'siang'
                        });
                      }}
                      className="ml-auto inline-flex items-center space-x-1 px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-[10px] font-bold transition shadow-2xs cursor-pointer active:scale-95"
                      title="Kirim pengingat jadwal tugas jaga dokter via WhatsApp"
                    >
                      <MessageCircle className="w-3 h-3 text-emerald-600" />
                      <span>Kirim WA</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {/* Card Overview Status Kelengkapan Jadwal Bulan Ini */}
          <div className="p-4 rounded-2xl border border-slate-200 bg-white shadow-2xs flex flex-col justify-between">
            <div>
              <div className="flex items-center space-x-2 text-slate-900 font-extrabold text-sm mb-1">
                <CheckCircle2 className={`w-4 h-4 ${isMonthComplete ? 'text-emerald-600' : 'text-amber-500'}`} />
                <span>Status Kelengkapan Jadwal</span>
              </div>
              <p className="text-xs text-slate-500">
                Kebutuhan penugasan dokter jaga unit HD periode <strong>{monthNames[selectedMonth]} {selectedYear}</strong>:
              </p>

              <div className="mt-3 space-y-1.5 text-xs">
                <div className="flex items-center justify-between text-slate-600">
                  <span>Hari Pelayanan (Senin - Sabtu):</span>
                  <span className="font-bold text-slate-900">{workingDaysCount} Hari</span>
                </div>
                <div className="flex items-center justify-between text-slate-600">
                  <span>Hari Minggu (Libur Pelayanan HD):</span>
                  <span className="font-bold text-rose-600">{sundayDaysCount} Hari</span>
                </div>
                <div className="flex items-center justify-between text-slate-600">
                  <span>Total Kebutuhan Shif Dokter:</span>
                  <span className="font-bold text-slate-900">{totalWorkingShiftsNeeded} Shif ({workingDaysCount} × 2)</span>
                </div>
                <div className="flex items-center justify-between text-slate-600 pt-1 border-t border-slate-100">
                  <span>Shif yang Telah Terisi:</span>
                  <span className={`font-black ${isMonthComplete ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {totalAssignedShifts} / {totalWorkingShiftsNeeded} Shif
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-3 pt-2.5 border-t border-slate-100">
              <span className={`inline-block text-[11px] px-2.5 py-1 rounded-full font-bold ${
                isMonthComplete ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
              }`}>
                {isMonthComplete ? 'Jadwal Dokter Sebulan Lengkap' : `Belum Lengkap (${totalWorkingShiftsNeeded - totalAssignedShifts} shif kosong)`}
              </span>
            </div>
          </div>
        </div>

        {/* Bilah Pola Cepat 1-Klik & Filter Tanggal Sebulan */}
        <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Tombol Pola 1-Klik */}
          {canEdit && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-extrabold text-slate-700">Terapkan Pola Cepat:</span>
              <button
                type="button"
                onClick={() => handleQuickPattern('emp-dr-reza', 'emp-dr-paramitha', 'fixed')}
                className="px-2.5 py-1.5 bg-white hover:bg-blue-50 text-blue-900 border border-blue-200 rounded-xl text-xs font-bold transition shadow-2xs cursor-pointer flex items-center space-x-1"
                title="Terapkan dr. Reza di Shif Pagi dan dr. Paramitha di Shif Siang setiap Senin-Sabtu"
              >
                <span>dr. Reza (P) / dr. Paramitha (S)</span>
              </button>
              <button
                type="button"
                onClick={() => handleQuickPattern('emp-dr-paramitha', 'emp-dr-reza', 'fixed')}
                className="px-2.5 py-1.5 bg-white hover:bg-emerald-50 text-emerald-900 border border-emerald-200 rounded-xl text-xs font-bold transition shadow-2xs cursor-pointer flex items-center space-x-1"
                title="Terapkan dr. Paramitha di Shif Pagi dan dr. Reza di Shif Siang setiap Senin-Sabtu"
              >
                <span>dr. Paramitha (P) / dr. Reza (S)</span>
              </button>
              <button
                type="button"
                onClick={() => handleQuickPattern('emp-dr-reza', 'emp-dr-paramitha', 'alternating')}
                className="px-2.5 py-1.5 bg-white hover:bg-indigo-50 text-indigo-900 border border-indigo-200 rounded-xl text-xs font-bold transition shadow-2xs cursor-pointer flex items-center space-x-1"
                title="Terapkan pola bergantian Pagi dan Siang setiap hari kerja ganjil / genap"
              >
                <ArrowLeftRight className="w-3 h-3 text-indigo-600" />
                <span>Pola Selang-Seling</span>
              </button>
              <button
                type="button"
                onClick={handleResetMonthDoctors}
                className="px-2.5 py-1.5 bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition shadow-2xs cursor-pointer flex items-center space-x-1"
                title="Kosongkan jadwal dokter seluruh tanggal di bulan ini"
              >
                <Trash2 className="w-3 h-3 text-rose-500" />
                <span>Kosongkan Bulan Ini</span>
              </button>
            </div>
          )}

          {/* Filter Tanggal & Pencarian */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center bg-white rounded-xl p-0.5 border border-slate-200 shadow-2xs">
              <button
                type="button"
                onClick={() => setDoctorMonthFilter('all')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  doctorMonthFilter === 'all'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Semua ({days.length})
              </button>
              <button
                type="button"
                onClick={() => setDoctorMonthFilter('workdays')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  doctorMonthFilter === 'workdays'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Hari Kerja ({workingDaysCount})
              </button>
              <button
                type="button"
                onClick={() => setDoctorMonthFilter('sundays')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  doctorMonthFilter === 'sundays'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Minggu Libur ({sundayDaysCount})
              </button>
            </div>

            {/* Input Pencarian Cepat */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={doctorSearchQuery}
                onChange={(e) => setDoctorSearchQuery(e.target.value)}
                placeholder="Cari hari / tgl / dokter..."
                className="pl-8 pr-2.5 py-1 text-xs bg-white border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500 shadow-2xs w-44"
              />
              {doctorSearchQuery && (
                <button
                  type="button"
                  onClick={() => setDoctorSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* TABEL JADWAL DOKTER SEBULAN PENUH (FULL MONTH TABLE) */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-100/90 border-b border-slate-200 text-slate-700 font-bold uppercase text-[11px] sticky top-0 z-10">
                <tr>
                  <th className="py-3 px-3 w-12 text-center">No</th>
                  <th className="py-3 px-4 min-w-[160px]">Tanggal &amp; Hari</th>
                  <th className="py-3 px-4 min-w-[260px]">🌅 Dokter Shif Pagi (07:00 - 14:00)</th>
                  <th className="py-3 px-4 min-w-[260px]">🌙 Dokter Shif Siang (13:30 - 20:30)</th>
                  <th className="py-3 px-3 min-w-[140px] text-center">Status Dinas</th>
                  {canEdit && <th className="py-3 px-3 w-36 text-center">Aksi Cepat</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredDays.length === 0 ? (
                  <tr>
                    <td colSpan={canEdit ? 6 : 5} className="py-8 text-center text-slate-400">
                      Tidak ada data tanggal yang cocok dengan filter pencarian.
                    </td>
                  </tr>
                ) : (
                  filteredDays.map((day, idx) => {
                    const isSunDay = day.isSunday;
                    const isToday = day.dateStr === todayStr;
                    const docP = getDoctorForShiftAndDate(day.dateStr, 'pagi');
                    const docS = getDoctorForShiftAndDate(day.dateStr, 'siang');
                    const isDoubleShift = !isSunDay && docP && docS && docP.id === docS.id;
                    const isBothAssigned = !isSunDay && docP && docS && docP.id !== docS.id;
                    const isOnlyPagi = !isSunDay && docP && !docS;
                    const isOnlySiang = !isSunDay && !docP && docS;
                    const isEmptyDay = !isSunDay && !docP && !docS;

                    return (
                      <tr
                        key={day.dateStr}
                        className={`transition hover:bg-slate-50/80 ${
                          isToday
                            ? 'bg-blue-50/60 font-medium'
                            : isSunDay
                            ? 'bg-rose-50/30'
                            : idx % 2 === 1
                            ? 'bg-slate-50/30'
                            : ''
                        }`}
                      >
                        {/* Kolom No */}
                        <td className="py-3 px-3 text-center text-slate-400 font-mono">
                          {idx + 1}
                        </td>

                        {/* Kolom Tanggal & Hari */}
                        <td className="py-3 px-4">
                          <div className="flex items-center space-x-2.5">
                            <span
                              className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black shrink-0 shadow-2xs ${
                                isSunDay
                                  ? 'bg-rose-100 text-rose-700 border border-rose-200'
                                  : isToday
                                  ? 'bg-blue-600 text-white shadow-xs'
                                  : 'bg-slate-100 text-slate-700 border border-slate-200'
                              }`}
                            >
                              {day.date.getDate()}
                            </span>
                            <div>
                              <div className="flex items-center space-x-1.5 flex-wrap">
                                <span className={`font-extrabold text-xs ${isSunDay ? 'text-rose-700' : 'text-slate-900'}`}>
                                  {day.dayName}
                                </span>
                                {isToday && (
                                  <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-blue-600 text-white font-black uppercase">
                                    Hari Ini
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-slate-400 font-mono block">
                                {day.dateStr}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Kolom Shif Pagi */}
                        <td className="py-3 px-4">
                          {isSunDay ? (
                            <div className="flex items-center space-x-1.5 text-rose-600 text-[11px] font-semibold bg-rose-100/60 px-2.5 py-1.5 rounded-xl border border-rose-200">
                              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                              <span>Libur Rutin HD (Minggu)</span>
                            </div>
                          ) : canEdit ? (
                            <div className="space-y-1.5">
                              <select
                                value={docP?.id || ''}
                                onChange={(e) => handleAssignDoctor(day.dateStr, 'pagi', e.target.value)}
                                className="w-full text-xs font-bold px-2.5 py-1.5 rounded-xl border border-emerald-300 bg-emerald-50/50 text-emerald-950 shadow-2xs focus:ring-2 focus:ring-emerald-500 focus:outline-hidden cursor-pointer"
                              >
                                <option value="">-- Kosongkan / Lepas Jaga --</option>
                                {allDoctorEmployees.map((d) => (
                                  <option key={d.id} value={d.id}>
                                    {d.name} {d.nickname ? `(${d.nickname})` : ''} - {d.specialization || 'Dokter'}
                                  </option>
                                ))}
                              </select>
                              {docP && (
                                <div className="flex items-center justify-between text-[11px] px-2 py-0.5 rounded-lg bg-emerald-100/60 border border-emerald-200 text-emerald-900 font-medium">
                                  <span className="truncate">{docP.name}</span>
                                  <button
                                    type="button"
                                    onClick={() => handleAssignDoctor(day.dateStr, 'pagi', '')}
                                    className="text-emerald-700 hover:text-rose-700 ml-1 font-bold cursor-pointer"
                                    title="Lepas jaga shift pagi"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="font-bold text-slate-800 text-xs">
                              {docP ? docP.name : <span className="text-slate-400 italic">Belum ditentukan</span>}
                            </div>
                          )}
                        </td>

                        {/* Kolom Shif Siang */}
                        <td className="py-3 px-4">
                          {isSunDay ? (
                            <div className="flex items-center space-x-1.5 text-rose-600 text-[11px] font-semibold bg-rose-100/60 px-2.5 py-1.5 rounded-xl border border-rose-200">
                              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                              <span>Libur Rutin HD (Minggu)</span>
                            </div>
                          ) : canEdit ? (
                            <div className="space-y-1.5">
                              <select
                                value={docS?.id || ''}
                                onChange={(e) => handleAssignDoctor(day.dateStr, 'siang', e.target.value)}
                                className="w-full text-xs font-bold px-2.5 py-1.5 rounded-xl border border-sky-300 bg-sky-50/50 text-sky-950 shadow-2xs focus:ring-2 focus:ring-sky-500 focus:outline-hidden cursor-pointer"
                              >
                                <option value="">-- Kosongkan / Lepas Jaga --</option>
                                {allDoctorEmployees.map((d) => (
                                  <option key={d.id} value={d.id}>
                                    {d.name} {d.nickname ? `(${d.nickname})` : ''} - {d.specialization || 'Dokter'}
                                  </option>
                                ))}
                              </select>
                              {docS && (
                                <div className="flex items-center justify-between text-[11px] px-2 py-0.5 rounded-lg bg-sky-100/60 border border-sky-200 text-sky-900 font-medium">
                                  <span className="truncate">{docS.name}</span>
                                  <button
                                    type="button"
                                    onClick={() => handleAssignDoctor(day.dateStr, 'siang', '')}
                                    className="text-sky-700 hover:text-rose-700 ml-1 font-bold cursor-pointer"
                                    title="Lepas jaga shift siang"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="font-bold text-slate-800 text-xs">
                              {docS ? docS.name : <span className="text-slate-400 italic">Belum ditentukan</span>}
                            </div>
                          )}
                        </td>

                        {/* Status Dinas Hari Ini */}
                        <td className="py-3 px-3 text-center">
                          {isSunDay ? (
                            <span className="text-[10px] px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 font-bold border border-rose-200 inline-block">
                              Libur HD
                            </span>
                          ) : isDoubleShift ? (
                            <span className="text-[10px] px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-900 font-black border border-indigo-300 inline-block shadow-2xs">
                              2 Shif Sekaligus
                            </span>
                          ) : isBothAssigned ? (
                            <span className="text-[10px] px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-bold border border-emerald-200 inline-block">
                              Lengkap (2 Dr)
                            </span>
                          ) : isOnlyPagi ? (
                            <span className="text-[10px] px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 font-bold border border-amber-200 inline-block">
                              Pagi Saja
                            </span>
                          ) : isOnlySiang ? (
                            <span className="text-[10px] px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 font-bold border border-amber-200 inline-block">
                              Siang Saja
                            </span>
                          ) : (
                            <span className="text-[10px] px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 font-bold border border-rose-200 inline-block">
                              Belum Terisi
                            </span>
                          )}
                        </td>

                        {/* Aksi Cepat per Tanggal */}
                        {canEdit && (
                          <td className="py-3 px-3 text-center">
                            {isSunDay ? (
                              <span className="text-slate-300 text-[10px]">-</span>
                            ) : (
                              <div className="flex items-center justify-center space-x-1">
                                <button
                                  type="button"
                                  onClick={() => handleSwapDateDoctor(day.dateStr)}
                                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-indigo-50 text-slate-600 hover:text-indigo-700 transition cursor-pointer"
                                  title="Tukar dokter Pagi dan Siang hari ini"
                                >
                                  <ArrowLeftRight className="w-3.5 h-3.5" />
                                </button>
                                {allDoctorEmployees.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      // Toggle 2 shif: use doctor pagi or first doctor
                                      const targetDoc = docP || docS || allDoctorEmployees[0];
                                      handleAssignBothShifts(day.dateStr, targetDoc.id);
                                    }}
                                    className="px-1.5 py-1 text-[10px] font-bold rounded-lg bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 transition cursor-pointer"
                                    title="Tugaskan 1 dokter untuk 2 shif sekaligus hari ini"
                                  >
                                    2 Shif
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleClearDateDoctor(day.dateStr)}
                                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-rose-100 text-slate-500 hover:text-rose-600 transition cursor-pointer"
                                  title="Kosongkan Dokter Pada Jadwal Ini"
                                  aria-label={`Kosongkan Dokter Pada Jadwal Ini (${day.dateStr})`}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* ========================================================================= */}
      {/* TAMPILAN KHUSUS PRINT / CETAK PRINTER & PDF BROWSER                      */}
      {/* Dipisahkan halamannya: Halaman 1 (Perawat) & Halaman 2 (Dokter)          */}
      {/* ========================================================================= */}
      <div className="hidden print:block text-slate-900">
        {/* HALAMAN 1: JADWAL PERAWAT (PERSIS MATRIK LAYAR + PANDUAN WARNA TOMBOL) */}
        {(printScope === 'all' || printScope === 'perawat') && (
          <div className="print-nurse-page">
            {/* KOP SURAT PERAWAT */}
            <div className="mb-3 text-center border-b-2 border-slate-900 pb-2">
              <h1 className="text-base font-black tracking-wide text-slate-950 uppercase">
                RUMAH SAKIT UMUM DAERAH - INSTALASI HEMODIALISA
              </h1>
              <h2 className="text-xs font-bold text-teal-800 uppercase tracking-wide mt-0.5">
                JADWAL DINAS SHIFT OPERASIONAL PERAWAT HEMODIALISA
              </h2>
              <p className="text-[10px] font-semibold text-slate-600 mt-0.5">
                Periode: {monthNames[selectedMonth]} {selectedYear} | Unit Hemodialisa
              </p>
            </div>

            {/* TABEL MATRIKS PERAWAT KHUSUS CETAK */}
            {renderPrintNurseMatrixTable()}

            {/* PANDUAN WARNA TOMBOL MATRIKS DISEMATKAN DI BAWAHNYA */}
            {renderColorGuide(true)}

            {/* LEMBAR PENGESAHAN PERAWAT */}
            <div className="flex justify-between mt-5 pt-2 px-10 text-[10px] text-slate-900 print-avoid-break">
              <div className="text-center">
                <p>Mengetahui,</p>
                <p className="font-bold">Kepala Ruangan Hemodialisa</p>
                <div className="h-14"></div>
                <p className="font-bold underline">
                  {nurseEmployees.find((n) => n.role === 'kepala_ruangan')?.name || 'Ns. Haikal, S.Kep'}
                </p>
                <p className="text-[9px] text-slate-600">
                  NIP. {nurseEmployees.find((n) => n.role === 'kepala_ruangan')?.nip || '198503152010011005'}
                </p>
              </div>

              <div className="text-center">
                <p>{monthNames[selectedMonth]} {selectedYear}</p>
                <p className="font-bold">Dokter Penanggung Jawab Pelayanan HD (DPJP)</p>
                <div className="h-14"></div>
                <p className="font-bold underline">
                  {allDoctorEmployees[0]?.name || 'dr. Reza Sp.PD-KGH'}
                </p>
                <p className="text-[9px] text-slate-600">
                  NIP. {allDoctorEmployees[0]?.nip || '197908122005011003'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* HALAMAN 2: JADWAL DOKTER JAGA HD (HALAMAN TERPISAH) */}
        {(printScope === 'all' || printScope === 'dokter') && (
          <div className={`print-doctor-page ${printScope === 'all' ? 'print-page-break' : ''}`}>
            {/* KOP SURAT DOKTER */}
            <div className="mb-3 text-center border-b-2 border-slate-900 pb-2">
              <h1 className="text-base font-black tracking-wide text-slate-950 uppercase">
                RUMAH SAKIT UMUM DAERAH - INSTALASI HEMODIALISA
              </h1>
              <h2 className="text-xs font-bold text-blue-800 uppercase tracking-wide mt-0.5">
                JADWAL PENUGASAN DOKTER JAGA UNIT HEMODIALISA
              </h2>
              <p className="text-[10px] font-semibold text-slate-600 mt-0.5">
                Periode: {monthNames[selectedMonth]} {selectedYear} | Unit Hemodialisa
              </p>
            </div>

            {/* TABEL PENUGASAN DOKTER SEBULAN PENUH */}
            {renderPrintDoctorTable()}

            {/* TABEL RINGKASAN TOTAL BEBAN JAGA DOKTER BULAN INI */}
            {renderPrintDoctorSummary()}

            {/* LEMBAR PENGESAHAN DOKTER */}
            <div className="flex justify-between mt-5 pt-2 px-10 text-[10px] text-slate-900 print-avoid-break">
              <div className="text-center">
                <p>Mengetahui,</p>
                <p className="font-bold">Kepala Ruangan Hemodialisa</p>
                <div className="h-14"></div>
                <p className="font-bold underline">
                  {nurseEmployees.find((n) => n.role === 'kepala_ruangan')?.name || 'Ns. Haikal, S.Kep'}
                </p>
                <p className="text-[9px] text-slate-600">
                  NIP. {nurseEmployees.find((n) => n.role === 'kepala_ruangan')?.nip || '198503152010011005'}
                </p>
              </div>

              <div className="text-center">
                <p>{monthNames[selectedMonth]} {selectedYear}</p>
                <p className="font-bold">Dokter Penanggung Jawab Pelayanan HD (DPJP)</p>
                <div className="h-14"></div>
                <p className="font-bold underline">
                  {allDoctorEmployees[0]?.name || 'dr. Reza Sp.PD-KGH'}
                </p>
                <p className="text-[9px] text-slate-600">
                  NIP. {allDoctorEmployees[0]?.nip || '197908122005011003'}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* TAMPILAN INTERAKTIF DI LAYAR (SCREEN ONLY - HIDDEN IN PRINT)             */}
      {/* ========================================================================= */}
      <div className="print:hidden space-y-5">

      {/* Top Header & Actions */}
      <div className="bg-gradient-to-r from-teal-50/90 via-teal-50/40 to-teal-100/50 rounded-2xl p-4 sm:p-5 border border-teal-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4">
        <div>
          <div className="flex items-center space-x-2 flex-wrap gap-y-1">
            <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
              Jadwal Shift Bulanan Unit Hemodialisa
            </h2>
            <span className="text-[11px] sm:text-xs px-2.5 py-0.5 rounded-full bg-teal-100 text-teal-800 font-semibold border border-teal-200">
              Shift Pagi &amp; Siang
            </span>
          </div>
          <p className="text-xs text-slate-600 mt-1 leading-relaxed">
            Dilengkapi <strong>Mode 1-Klik Langsung</strong> ubah shift dan <strong>Warna Khusus Tombol Shift</strong> sesuai penugasan tugas khusus perawat.
          </p>
        </div>

        {/* Month Selector & Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Month Navigator */}
          <div className="flex items-center bg-white/90 rounded-xl p-1 border border-teal-200/80 shadow-2xs">
            <button
              onClick={handlePrevMonth}
              className="p-1.5 hover:bg-teal-50 rounded-lg text-teal-800 transition min-w-[32px] min-h-[32px] flex items-center justify-center cursor-pointer"
              title="Bulan Sebelumnya"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="px-2 sm:px-3 text-xs font-bold text-slate-800 min-w-[120px] sm:min-w-[140px] text-center flex items-center justify-center gap-1">
              <CalendarIcon className="w-3.5 h-3.5 text-teal-600 shrink-0" />
              <span className="truncate">
                {monthNames[selectedMonth]} {selectedYear}
              </span>
            </div>
            <button
              onClick={handleNextMonth}
              className="p-1.5 hover:bg-teal-50 rounded-lg text-teal-800 transition min-w-[32px] min-h-[32px] flex items-center justify-center cursor-pointer"
              title="Bulan Berikutnya"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Feature: Reset Jadwal Button */}
          {canEdit && (
            <button
              onClick={() => setShowResetModal(true)}
              className="px-3 py-2 bg-white/90 border border-rose-200 hover:bg-rose-50 text-rose-700 rounded-xl text-xs font-bold shadow-2xs flex items-center space-x-1.5 transition min-h-[36px] active:scale-95 cursor-pointer"
              title="Reset Jadwal Shift"
            >
              <RotateCcw className="w-3.5 h-3.5 text-rose-600 shrink-0" />
              <span>Reset</span>
            </button>
          )}

          {/* Admin Generate Button (Khusus Perawat) */}
          {canEdit && (
            <button
              onClick={() => setShowGenerateModal(true)}
              className="px-3.5 py-2 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center space-x-1.5 transition min-h-[36px] active:scale-95 cursor-pointer"
            >
              <Sparkles className="w-4 h-4 shrink-0" />
              <span>Generate Jadwal</span>
            </button>
          )}

          {/* Google Sheets Sync Button */}
          {canEdit && (
            <button
              onClick={handleSyncToGoogleSheets}
              disabled={isSyncingSheets}
              className="px-3 py-2 bg-white/95 border border-teal-300 hover:bg-teal-50 text-teal-800 rounded-xl text-xs font-bold shadow-2xs flex items-center space-x-1.5 transition min-h-[36px] active:scale-95 cursor-pointer disabled:opacity-50"
              title="Sinkronisasi Jadwal ke Google Sheets Real-time"
            >
              {isSyncingSheets ? (
                <Loader2 className="w-3.5 h-3.5 text-teal-600 animate-spin shrink-0" />
              ) : (
                <Share2 className="w-3.5 h-3.5 text-teal-600 shrink-0" />
              )}
              <span>Sync Sheets</span>
            </button>
          )}

          {/* Unduh Excel .xlsx Button */}
          <button
            onClick={handleExportCurrentMonthExcel}
            className="px-3 py-2 bg-white/95 border border-emerald-300 hover:bg-emerald-50 text-emerald-800 rounded-xl text-xs font-bold shadow-2xs flex items-center space-x-1.5 transition min-h-[36px] active:scale-95 cursor-pointer"
            title={`Unduh Jadwal Resmi Bulan ${monthNames[selectedMonth]} ${selectedYear} ke Excel (.xlsx)`}
          >
            <Download className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span className="hidden sm:inline">Unduh Excel</span>
            <span className="sm:hidden">Excel</span>
          </button>

          {/* Kirim WA Karu Button */}
          <button
            onClick={() => {
              const todayStr = getTodayDateString();
              const matchedDate = days.find((d) => d.dateStr === todayStr)?.dateStr || days[0]?.dateStr || todayStr;
              setActiveDateForReport(matchedDate);
              setShowHeadNurseReportModal(true);
            }}
            className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-2xs flex items-center space-x-1.5 transition min-h-[36px] active:scale-95 cursor-pointer"
            title="Kirim Laporan Resmi Rekap Jadwal & Alokasi Mesin HD ke WhatsApp Kepala Ruang"
          >
            <MessageCircle className="w-3.5 h-3.5 text-white shrink-0" />
            <span className="hidden sm:inline">Kirim WA Karu</span>
            <span className="sm:hidden">WA Karu</span>
          </button>

          {/* Cetak & PDF Button */}
          <button
            onClick={() => setShowPrintModal(true)}
            className="px-3 py-2 bg-white/95 border border-teal-300 hover:bg-teal-50 text-teal-900 rounded-xl text-xs font-bold shadow-2xs flex items-center space-x-1.5 transition min-h-[36px] active:scale-95 cursor-pointer"
            title="Cetak Jadwal Langsung atau Simpan ke PDF"
          >
            <Printer className="w-4 h-4 text-teal-700 shrink-0" />
            <span>Cetak / PDF</span>
          </button>
        </div>
      </div>

      {/* PRIMARY TAB NAVIGATION: JADWAL PERAWAT (FULL PAGE) VS JADWAL DOKTER (HALAMAN KHUSUS) */}
      <div className="w-fit inline-flex items-center p-1 bg-white rounded-xl border border-teal-200/90 shadow-2xs">
        <div className="flex items-center gap-1 p-0.5 bg-slate-100/90 rounded-lg">
          <button
            type="button"
            onClick={() => {
              setActiveScheduleTab('perawat');
              if (roleFilter === 'dokter') setRoleFilter('all');
            }}
            className={`flex items-center space-x-1.5 px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-md text-xs font-bold transition-all cursor-pointer ${
              activeScheduleTab === 'perawat'
                ? 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
            }`}
          >
            <Users className="w-3.5 h-3.5 shrink-0" />
            <span>👩‍⚕️ Jadwal Perawat HD</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveScheduleTab('dokter');
              if (roleFilter !== 'all' && roleFilter !== 'mine' && roleFilter !== 'dokter') {
                setRoleFilter('dokter');
              }
            }}
            className={`flex items-center space-x-1.5 px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-md text-xs font-bold transition-all cursor-pointer ${
              activeScheduleTab === 'dokter'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
            }`}
          >
            <Stethoscope className="w-3.5 h-3.5 shrink-0" />
            <span>👨‍⚕️ Jadwal Dokter HD</span>
          </button>
        </div>
      </div>

      {/* Filters and Search Bar */}
      <div className="bg-gradient-to-r from-teal-50/80 via-teal-50/40 to-teal-50/70 rounded-2xl p-3.5 sm:p-4 border border-teal-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-bold text-teal-800 mr-1 flex items-center">
            <Filter className="w-3.5 h-3.5 mr-1 text-teal-600" />
            Filter:
          </span>

          {activeScheduleTab === 'perawat' ? (
            <>
              <button
                onClick={() => setRoleFilter('all')}
                className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold transition min-h-[32px] cursor-pointer ${
                  roleFilter === 'all'
                    ? 'bg-teal-600 text-white shadow-2xs'
                    : 'bg-white/90 text-teal-900 border border-teal-200/60 hover:bg-teal-100/70'
                }`}
              >
                Semua Perawat ({nurseEmployees.length})
              </button>
              <button
                onClick={() => setRoleFilter('kepala_ruangan')}
                className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold transition min-h-[32px] cursor-pointer ${
                  roleFilter === 'kepala_ruangan'
                    ? 'bg-amber-600 text-white shadow-2xs'
                    : 'bg-white/90 text-teal-900 border border-teal-200/60 hover:bg-teal-100/70'
                }`}
              >
                Karu
              </button>
              <button
                onClick={() => setRoleFilter('pj_shift')}
                className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold transition min-h-[32px] cursor-pointer ${
                  roleFilter === 'pj_shift'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'bg-white/90 text-teal-900 border border-teal-200/60 hover:bg-teal-100/70'
                }`}
              >
                KATIM
              </button>
              <button
                onClick={() => setRoleFilter('perawat')}
                className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold transition min-h-[32px] cursor-pointer ${
                  roleFilter === 'perawat'
                    ? 'bg-teal-600 text-white shadow-2xs'
                    : 'bg-white/90 text-teal-900 border border-teal-200/60 hover:bg-teal-100/70'
                }`}
              >
                Perawat Pelaksana
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setRoleFilter('dokter')}
                className="px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold transition min-h-[32px] cursor-pointer bg-blue-600 text-white shadow-2xs"
              >
                Semua Dokter HD ({allDoctorEmployees.length})
              </button>
            </>
          )}
        </div>

        <div className="flex items-center space-x-2 w-full md:w-auto">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={activeScheduleTab === 'perawat' ? "Cari nama perawat..." : "Cari nama dokter..."}
            className="px-3 py-1.5 text-xs bg-white border border-teal-200/80 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500 w-full md:w-56 text-slate-800 placeholder:text-slate-400 shadow-2xs min-h-[34px]"
          />
        </div>
      </div>

      {/* COMPREHENSIVE COLOR LEGENDS AS SPECIFIED BY USER (Khusus Tab Perawat) */}
      {activeScheduleTab === 'perawat' && renderColorGuide(false)}

      {/* Schedule Tables - Separated for Nurses and Doctors (Full Page Perawat vs Tab Dokter) */}
      <div className="w-full">
        {/* Tab 1: Perawat & Kepala Ruangan (Halaman Penuh) */}
        {activeScheduleTab === 'perawat' && showNurseTable && (
          <div className="w-full">
            {renderNurseMatrixTable(nurseEmployees)}
          </div>
        )}

        {/* Tab 2: Penugasan Dokter Jaga HD (Halaman Khusus / Tab Selanjutnya) */}
        {activeScheduleTab === 'dokter' && showDoctorSection && (
          <div className="w-full">
            {renderDoctorScheduleManager()}
          </div>
        )}

        {/* If neither matches (e.g. search query not found) */}
        {((activeScheduleTab === 'perawat' && !showNurseTable) || (activeScheduleTab === 'dokter' && !showDoctorSection)) && (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <UserCheck className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <h4 className="text-sm font-bold text-slate-700">Tidak ada staf yang sesuai dengan filter</h4>
            <p className="text-xs text-slate-400 mt-1">Coba sesuaikan kata kunci pencarian atau ganti pilihan filter.</p>
          </div>
        )}
      </div>

      {/* MODAL: RESET JADWAL (Requirement 2) */}
      {showResetModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2 text-rose-600">
                <RotateCcw className="w-5 h-5" />
                <h3 className="text-base font-bold text-slate-900">
                  Reset Jadwal Shift
                </h3>
              </div>
              <button
                onClick={() => setShowResetModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 flex items-start space-x-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <p>
                  Tindakan ini akan mengosongkan data jadwal shift pada periode yang dipilih. Jadwal yang telah direset dapat di-generate ulang kapan saja.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">
                  Pilih Lingkup Reset:
                </label>
                <div className="space-y-2">
                  <label
                    onClick={() => setResetScope('month')}
                    className={`p-3 rounded-xl border flex items-center space-x-3 cursor-pointer transition ${
                      resetScope === 'month'
                        ? 'bg-rose-50/50 border-rose-400 ring-2 ring-rose-500/20'
                        : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <input
                      type="radio"
                      name="resetScope"
                      checked={resetScope === 'month'}
                      onChange={() => setResetScope('month')}
                      className="text-rose-600 focus:ring-rose-500"
                    />
                    <div>
                      <div className="text-xs font-bold text-slate-800">
                        Hanya Bulan Ini: {monthNames[selectedMonth]} {selectedYear}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Mereset jadwal pada bulan yang sedang aktif ({currentMonthSchedules.length} entri).
                      </div>
                    </div>
                  </label>

                  <label
                    onClick={() => setResetScope('all')}
                    className={`p-3 rounded-xl border flex items-center space-x-3 cursor-pointer transition ${
                      resetScope === 'all'
                        ? 'bg-rose-50/50 border-rose-400 ring-2 ring-rose-500/20'
                        : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <input
                      type="radio"
                      name="resetScope"
                      checked={resetScope === 'all'}
                      onChange={() => setResetScope('all')}
                      className="text-rose-600 focus:ring-rose-500"
                    />
                    <div>
                      <div className="text-xs font-bold text-slate-800">
                        Seluruh Jadwal di Sistem
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Menghapus seluruh jadwal shift semua bulan ({schedules.length} total entri).
                      </div>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleExecuteReset}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition shadow-xs flex items-center space-x-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Konfirmasi Reset</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: SINGLE CELL DETAIL EDIT (Accessible via right click or double click) */}
      {editingCell && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <Edit3 className="w-4 h-4 text-teal-600" />
                <span>Pengaturan Rinci Shift Karyawan</span>
              </h3>
              <button
                onClick={() => setEditingCell(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-3 text-xs text-slate-600">
              <p>
                <strong>Nama Staf:</strong>{' '}
                {employees.find((e) => e.id === editingCell.employeeId)?.name}
              </p>
              <p className="mt-1">
                <strong>Jabatan:</strong>{' '}
                <span className="capitalize">{employees.find((e) => e.id === editingCell.employeeId)?.role.replace('_', ' ')}</span>
              </p>
              <p className="mt-1">
                <strong>Tanggal:</strong> {editingCell.dateStr}
              </p>
            </div>

            <div className="mt-4">
              <label className="block text-xs font-bold text-slate-700 mb-2">
                Pilih Shift / Status:
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(['pagi', 'siang', 'pagi_siang', 'libur', 'cuti', 'izin', 'sakit'] as ShiftType[]).map((st) => {
                  const def = SHIFT_DEFINITIONS[st];
                  const isSelected = editingCell.currentShift === st;
                  return (
                    <button
                      key={st}
                      type="button"
                      onClick={() =>
                        setEditingCell({ ...editingCell, currentShift: st })
                      }
                      className={`p-2 rounded-xl text-xs font-bold text-left border flex items-center justify-between transition ${
                        isSelected
                          ? 'border-teal-600 bg-teal-50 text-teal-900 ring-2 ring-teal-500/20'
                          : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <span>{def.name}</span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-teal-600" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Opsi Tugas Khusus Harian (khusus staf keperawatan & shift aktif) */}
            {(() => {
              const editingEmp = employees.find((e) => e.id === editingCell.employeeId);
              const isNurseOrLeader = editingEmp && editingEmp.role !== 'dokter';
              const isActiveShift =
                editingCell.currentShift === 'pagi' ||
                editingCell.currentShift === 'siang' ||
                editingCell.currentShift === 'pagi_siang';
              if (!isNurseOrLeader || !isActiveShift) return null;

              return (
                <div className="mt-4 pt-3 border-t border-slate-100">
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-bold text-slate-700">
                      Tugas Khusus Harian:
                    </label>
                    <span className="text-[10px] text-slate-500 font-medium">
                      (Klik untuk aktifkan / matikan)
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {(['pj_shift', 'bhp', 'farmasi_logistik', 'natrium_ro', 'cito'] as SpecialTaskCategory[]).map((cat) => {
                      const def = SPECIAL_TASK_DEFINITIONS[cat];
                      const isChecked = editingCell.specialDutyCategories?.includes(cat) || false;
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => {
                            const curr = editingCell.specialDutyCategories || [];
                            const next = isChecked ? curr.filter((c) => c !== cat) : [...curr, cat];
                            setEditingCell({ ...editingCell, specialDutyCategories: next });
                          }}
                          className={`p-2 rounded-xl text-left border text-xs font-bold transition flex items-center justify-between shadow-2xs ${
                            isChecked
                              ? `${def.badgeBg} text-white ring-2 ring-offset-1 ring-slate-400 scale-[1.02]`
                              : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                          }`}
                          title={`Tugaskan sebagai ${def.name}`}
                        >
                          <span className="truncate">{def.shortCode} - {def.name}</span>
                          {isChecked && <Check className="w-3.5 h-3.5 text-white stroke-[3] shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1.5 leading-tight">
                    * Menetapkan <strong>PJ Shif</strong> akan mengubah warna tombol shift menjadi <strong className="text-orange-600">Oranye</strong>. Penugasan PJ Shift baru akan menggantikan PJ Shift sebelumnya pada shift & tanggal yang sama.
                  </p>
                </div>
              );
            })()}

            <div className="mt-4">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Catatan Penyesuaian (Opsional):
              </label>
              <input
                type="text"
                value={editingCell.note || ''}
                onChange={(e) =>
                  setEditingCell({ ...editingCell, note: e.target.value })
                }
                placeholder="Misal: Dokter jaga pagi, tukar dinas"
                className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div className="mt-5 flex items-center justify-between pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  const emp = employees.find((e) => e.id === editingCell.employeeId);
                  if (emp) {
                    setSelectedEmployeeForWA({
                      employee: emp,
                      dateStr: editingCell.dateStr,
                      shift: editingCell.currentShift
                    });
                  }
                }}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold transition cursor-pointer active:scale-95 shadow-2xs"
                title="Kirim pengingat shift & alokasi ke WhatsApp karyawan ini"
              >
                <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                <span>Kirim WA</span>
              </button>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setEditingCell(null)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleSaveCellEdit(
                      editingCell.currentShift,
                      editingCell.note || '',
                      editingCell.specialDutyCategories
                    )
                  }
                  className="px-4 py-1.5 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition shadow-xs cursor-pointer active:scale-95"
                >
                  Simpan Perubahan
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: GENERATE JADWAL BULANAN (Khusus Perawat) */}
      {showGenerateModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <div className="p-2 rounded-xl bg-teal-100 text-teal-700 font-bold">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Generate Jadwal Bulanan Perawat
                  </h3>
                  <p className="text-xs text-slate-500">
                    Otomasi penyusunan shift perawat sesuai aturan Pagi &lt; Siang
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowGenerateModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3.5">
              <div className="p-3.5 rounded-xl bg-teal-50 border border-teal-200 text-xs text-teal-950">
                <div className="font-bold mb-1 flex items-center gap-1.5">
                  <Info className="w-4 h-4 text-teal-700" />
                  <span>Periode Target Pembuatan Jadwal:</span>
                </div>
                <p className="font-bold text-base text-teal-800">
                  {monthNames[selectedMonth]} {selectedYear} ({days.length} Hari)
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-bold text-slate-700">
                  Aturan Operasional yang Diterapkan:
                </p>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-2.5 text-slate-700">
                  <div className="flex items-start space-x-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>
                      <strong>Khusus Perawat:</strong> Generate otomatis hanya memproses Perawat HD dan Kepala Ruangan.
                    </span>
                  </div>
                  <div className="flex items-start space-x-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>
                      <strong>Pagi Lebih Sedikit:</strong> Jumlah perawat shift pagi selalu lebih sedikit daripada shift siang (Pagi &lt; Siang).
                    </span>
                  </div>
                  <div className="flex items-start space-x-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>
                      <strong>Anti-Kelelahan &amp; Pola Blok Teratur:</strong> Dilarang keras pola selang-seling 1-harian (<em>P S P S P S L</em> &amp; <em>S P S P S P L</em>) serta pola monoton tanpa variasi (<em>P P P P P P L</em> &amp; <em>S S S S S S L</em>).
                    </span>
                  </div>
                  <div className="flex items-start space-x-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>
                      <strong>Dokter HD Manual:</strong> Jadwal dokter TIDAK digenerate otomatis; dokter diatur secara manual oleh admin/karu.
                    </span>
                  </div>
                  <div className="flex items-start space-x-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>
                      <strong>Kepala Ruangan:</strong> Shift Pagi setiap hari Senin s/d Sabtu.
                    </span>
                  </div>
                  <div className="flex items-start space-x-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>
                      <strong>Hari Minggu:</strong> Wajib LIBUR untuk seluruh staf unit hemodialisa.
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <label className="flex items-center space-x-2.5 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={preserveOverrides}
                    onChange={(e) => setPreserveOverrides(e.target.checked)}
                    className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500 border-slate-300"
                  />
                  <span>
                    Pertahankan jadwal yang sebelumnya telah diedit secara manual
                  </span>
                </label>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end space-x-2.5 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowGenerateModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleGenerateMonth}
                className="px-5 py-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl transition shadow-md shadow-teal-600/20 flex items-center space-x-1.5"
              >
                <Sparkles className="w-4 h-4" />
                <span>Generate &amp; Terapkan Jadwal</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ATUR POLA DOKTER 1 BULAN */}
      {showDoctorPatternModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2.5 text-blue-700">
                <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Zap className="w-4 h-4 text-blue-700" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Atur Pola Cepat Dokter 1 Bulan
                  </h3>
                  <p className="text-xs text-slate-500">
                    Bulan: {monthNames[selectedMonth]} {selectedYear}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowDoctorPatternModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div className="bg-blue-50/70 p-3 rounded-xl border border-blue-200 text-xs text-blue-900">
                <span className="font-bold">Ketentuan 1 Dokter / Shif:</span> Setiap hari operasional (Senin - Sabtu), tepat 1 dokter bertugas di Shif Pagi (07:00-14:00) dan 1 dokter bertugas di Shif Siang (13:30-20:30). Hari Minggu unit HD libur otomatis.
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  Pilih Dokter Utama Shif Pagi:
                </label>
                <select
                  value={doctorPagiPattern}
                  onChange={(e) => setDoctorPagiPattern(e.target.value)}
                  className="w-full text-xs font-semibold px-3 py-2 rounded-xl border border-slate-300 bg-white shadow-2xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden cursor-pointer"
                >
                  {allDoctorEmployees.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} {d.nickname ? `(${d.nickname})` : ''} - {d.specialization || 'Dokter'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  Pilih Dokter Utama Shif Siang:
                </label>
                <select
                  value={doctorSiangPattern}
                  onChange={(e) => setDoctorSiangPattern(e.target.value)}
                  className="w-full text-xs font-semibold px-3 py-2 rounded-xl border border-slate-300 bg-white shadow-2xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden cursor-pointer"
                >
                  {allDoctorEmployees.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} {d.nickname ? `(${d.nickname})` : ''} - {d.specialization || 'Dokter'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  Pilihan Pola Jadwal:
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setDoctorPatternMode('fixed')}
                    className={`p-3 rounded-xl border text-left text-xs transition cursor-pointer ${
                      doctorPatternMode === 'fixed'
                        ? 'border-blue-600 bg-blue-50/80 text-blue-900 font-bold ring-2 ring-blue-500/20 shadow-2xs'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="font-extrabold mb-0.5">Pola Tetap Rutin</div>
                    <div className="text-[11px] font-normal text-slate-500">
                      Pagi &amp; Siang konsisten setiap hari kerja
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDoctorPatternMode('alternating')}
                    className={`p-3 rounded-xl border text-left text-xs transition cursor-pointer ${
                      doctorPatternMode === 'alternating'
                        ? 'border-blue-600 bg-blue-50/80 text-blue-900 font-bold ring-2 ring-blue-500/20 shadow-2xs'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="font-extrabold mb-0.5">Selang-Seling (Ganjil-Genap)</div>
                    <div className="text-[11px] font-normal text-slate-500">
                      Tukar shif pagi/siang setiap pergantian tanggal
                    </div>
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleResetMonthDoctors}
                className="w-full sm:w-auto px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-xl transition cursor-pointer"
              >
                Kosongkan Jadwal Dokter Bulan Ini
              </button>
              <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={() => setShowDoctorPatternModal(false)}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleApplyMonthlyDoctorPattern}
                  className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition shadow-md shadow-blue-600/20 flex items-center space-x-1.5 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>Terapkan ke Seluruh Bulan</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Closing print:hidden screen container */}
      </div>

      {/* MODAL CETAK & SIMPAN JADWAL DALAM BENTUK PDF */}
      {showPrintModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-xl w-full p-5 sm:p-6 shadow-2xl border border-slate-100">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center shadow-2xs">
                  <Printer className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Cetak &amp; Simpan Jadwal Bulanan
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Periode: <strong className="text-teal-700">{monthNames[selectedMonth]} {selectedYear}</strong> | Unit Hemodialisa
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowPrintModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Pilihan Target Halaman / Dokumen */}
            <div className="my-4 space-y-2">
              <label className="text-xs font-extrabold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                <span>1. Pilih Dokumen yang Ingin Dicetak / Disimpan:</span>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {/* Opsi 1: Semua Halaman Terpisah */}
                <button
                  type="button"
                  onClick={() => setPrintScope('all')}
                  className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                    printScope === 'all'
                      ? 'border-teal-500 bg-teal-50/70 ring-2 ring-teal-500/20 shadow-xs'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <span className="font-extrabold text-xs text-slate-900">📑 Semua Halaman</span>
                    <input
                      type="radio"
                      checked={printScope === 'all'}
                      onChange={() => setPrintScope('all')}
                      className="accent-teal-600 pointer-events-none"
                    />
                  </div>
                  <p className="text-[10px] text-slate-600 leading-tight">
                    Halaman 1: Perawat &amp; Panduan Warna. Halaman 2: Dokter Jaga.
                  </p>
                </button>

                {/* Opsi 2: Khusus Perawat */}
                <button
                  type="button"
                  onClick={() => setPrintScope('perawat')}
                  className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                    printScope === 'perawat'
                      ? 'border-teal-500 bg-teal-50/70 ring-2 ring-teal-500/20 shadow-xs'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <span className="font-extrabold text-xs text-slate-900">👩‍⚕️ Khusus Perawat</span>
                    <input
                      type="radio"
                      checked={printScope === 'perawat'}
                      onChange={() => setPrintScope('perawat')}
                      className="accent-teal-600 pointer-events-none"
                    />
                  </div>
                  <p className="text-[10px] text-slate-600 leading-tight">
                    Format matrik perawat + Panduan Warna Tombol lengkap.
                  </p>
                </button>

                {/* Opsi 3: Khusus Dokter */}
                <button
                  type="button"
                  onClick={() => setPrintScope('dokter')}
                  className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                    printScope === 'dokter'
                      ? 'border-teal-500 bg-teal-50/70 ring-2 ring-teal-500/20 shadow-xs'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <span className="font-extrabold text-xs text-slate-900">👨‍⚕️ Khusus Dokter</span>
                    <input
                      type="radio"
                      checked={printScope === 'dokter'}
                      onChange={() => setPrintScope('dokter')}
                      className="accent-teal-600 pointer-events-none"
                    />
                  </div>
                  <p className="text-[10px] text-slate-600 leading-tight">
                    Jadwal dokter jaga HD sebulan penuh &amp; rekapitulasi dinas.
                  </p>
                </button>
              </div>
            </div>

            {/* Modal Options */}
            <div className="space-y-3 my-4">
              <label className="text-xs font-extrabold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                <span>2. Pilih Format Output:</span>
              </label>

              {/* Option 1: Simpan PDF */}
              <div className="p-3.5 rounded-xl border-2 border-teal-200 bg-gradient-to-r from-teal-50/70 to-emerald-50/40 hover:border-teal-400 transition">
                <div className="flex items-start space-x-3">
                  <div className="p-2.5 rounded-xl bg-teal-600 text-white shrink-0 mt-0.5 shadow-2xs">
                    <FileDown className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-bold text-teal-950">
                        Simpan ke File PDF (.pdf)
                      </h4>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 border border-teal-300">
                        Rekomendasi
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                      Download file PDF resmi berorientasi Landscape A4 dengan halaman terpisah, warna tombol matrik akurat, dan Panduan Warna Tombol yang mudah dipahami saat dicetak.
                    </p>
                    <button
                      onClick={() => handleExportPdf(printScope)}
                      disabled={isExportingPdf}
                      className="mt-2.5 w-full sm:w-auto px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center space-x-2 shadow-xs active:scale-95 cursor-pointer disabled:opacity-50"
                    >
                      {isExportingPdf ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Menyiapkan Dokumen PDF...</span>
                        </>
                      ) : (
                        <>
                          <Download className="w-4 h-4" />
                          <span>
                            Download PDF ({printScope === 'perawat' ? 'Jadwal Perawat' : printScope === 'dokter' ? 'Jadwal Dokter' : 'Semua Halaman Terpisah'})
                          </span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Option 2: Print Langsung */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/80 hover:bg-white hover:border-slate-300 transition">
                <div className="flex items-start space-x-3">
                  <div className="p-2.5 rounded-xl bg-slate-700 text-white shrink-0 mt-0.5 shadow-2xs">
                    <Printer className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-sm font-bold text-slate-900">
                      Cetak Langsung ke Mesin Printer (Browser Print)
                    </h4>
                    <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                      Buka dialog cetak browser (Ctrl+P) dalam layout Landscape. Halaman perawat dan dokter akan otomatis dipisahkan.
                    </p>
                    <button
                      onClick={() => handleDirectPrint(printScope)}
                      className="mt-2.5 w-full sm:w-auto px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition flex items-center justify-center space-x-2 shadow-xs active:scale-95 cursor-pointer"
                    >
                      <Printer className="w-4 h-4" />
                      <span>
                        Buka Dialog Cetak ({printScope === 'perawat' ? 'Jadwal Perawat' : printScope === 'dokter' ? 'Jadwal Dokter' : 'Semua Halaman Terpisah'})
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setShowPrintModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL IMPORT JADWAL (Excel / CSV / Google Sheets) */}
      {showImportModal && (
        <ImportScheduleModal
          isOpen={showImportModal}
          onClose={() => setShowImportModal(false)}
          defaultMonth={monthPrefix}
          nurses={domainNurses}
          machines={domainMachines}
          settings={settings}
          onImportCompleted={handleImportCompleted}
        />
      )}

      {/* MODAL REGENERASI ALOKASI MESIN (Pagi / Siang / Sebulan) */}
      {showRegenerateAllocationModal && (
        <RegenerateMachineAllocationModal
          isOpen={showRegenerateAllocationModal}
          onClose={() => setShowRegenerateAllocationModal(false)}
          selectedDate={activeDateForReport}
          currentMonth={monthPrefix}
          nurses={domainNurses}
          machines={domainMachines}
          assignments={domainMonthlyAssignments}
          onReallocationCompleted={handleReallocationCompleted}
        />
      )}

      {/* MODAL LAPORAN KEPALA RUANGAN (WhatsApp) */}
      {showHeadNurseReportModal && (
        <HeadNurseReportModal
          isOpen={showHeadNurseReportModal}
          onClose={() => setShowHeadNurseReportModal(false)}
          dailyAssignments={currentDailyAssignments}
          machines={domainMachines}
          selectedDate={activeDateForReport}
          onDateChange={setActiveDateForReport}
          settings={effectiveSettings}
          onUpdateSettings={onUpdateSettings}
          doctorDuties={{
            [activeDateForReport]: {
              date: activeDateForReport,
              pagiDoctorName: getDoctorForShiftAndDate(activeDateForReport, 'pagi')?.name,
              siangDoctorName: getDoctorForShiftAndDate(activeDateForReport, 'siang')?.name,
            },
          }}
        />
      )}

      {/* MODAL PANDUAN GOOGLE APPS SCRIPT WEBHOOK */}
      {showGoogleScriptModal && (
        <GoogleScriptGuideModal
          isOpen={showGoogleScriptModal}
          onClose={() => setShowGoogleScriptModal(false)}
        />
      )}

      {/* MODAL PENGINGAT WHATSAPP KARYAWAN (Dokter & Perawat) */}
      {selectedEmployeeForWA && (
        <EmployeeWhatsAppModal
          isOpen={Boolean(selectedEmployeeForWA)}
          onClose={() => setSelectedEmployeeForWA(null)}
          employee={selectedEmployeeForWA.employee}
          selectedDate={selectedEmployeeForWA.dateStr}
          initialShift={selectedEmployeeForWA.shift}
          employees={employees}
          schedules={schedules}
          machines={machines}
          machineAssignments={machineAssignments}
          specialTasks={specialTasks}
        />
      )}

      {/* IN-APP TOAST NOTIFICATION */}
      {scheduleToast && (
        <div className="fixed bottom-6 right-6 z-50 max-w-md animate-in fade-in slide-in-from-bottom-5 duration-300">
          <div
            className={`p-4 rounded-2xl shadow-2xl border flex items-start space-x-3 backdrop-blur-md ${
              scheduleToast.type === 'success'
                ? 'bg-emerald-950/90 text-white border-emerald-500/50'
                : scheduleToast.type === 'error'
                ? 'bg-rose-950/90 text-white border-rose-500/50'
                : 'bg-slate-900/90 text-white border-slate-700'
            }`}
          >
            <div className="mt-0.5 shrink-0">
              {scheduleToast.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
              {scheduleToast.type === 'error' && <AlertCircle className="w-5 h-5 text-rose-400" />}
              {scheduleToast.type === 'info' && <Info className="w-5 h-5 text-teal-400" />}
            </div>
            <div className="flex-1 text-xs leading-relaxed font-medium">
              {scheduleToast.message}
            </div>
            <button
              onClick={() => setScheduleToast(null)}
              className="p-1 hover:bg-white/10 rounded-lg text-slate-300 hover:text-white cursor-pointer transition shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
