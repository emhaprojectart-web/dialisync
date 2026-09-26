import React, { useState } from 'react';
import { 
  UserAccount, 
  ShiftSchedule, 
  HDMachine, 
  MachineAssignment, 
  SpecialTask,
  SPECIAL_TASK_DEFINITIONS,
  ShiftType,
  AppSettings
} from '../types';
import { 
  getEffectiveShiftForEmployee, 
  getMachineSortOrder, 
  getNurseNickname,
  sortNursesByShiftScheduleOrder,
  sortNursesByMachineAllocationOrder,
  getTodayDateString
} from '../utils/scheduler';
import { WhatsAppShareModal } from './WhatsAppShareModal';
import { EmployeeWhatsAppModal } from './EmployeeWhatsAppModal';
import { isInvalidNurseAccount } from '../utils/storage';
import { 
  Calendar, 
  Layers,
  Sun,
  Moon,
  ChevronLeft,
  ChevronRight,
  Activity,
  AlertTriangle,
  ArrowRight,
  MessageCircle,
  Stethoscope,
  Phone,
  Clock,
  UserCheck,
  Palmtree
} from 'lucide-react';

interface DashboardViewProps {
  currentUser: UserAccount;
  employees: UserAccount[];
  schedules: ShiftSchedule[];
  machines: HDMachine[];
  machineAssignments: MachineAssignment[];
  specialTasks: SpecialTask[];
  activeDate?: string;
  onDateChange?: (date: string) => void;
  onNavigate: (tab: 'jadwal' | 'mesin' | 'tugas' | 'karyawan') => void;
  onUpdateTaskStatus: (taskId: string, status: 'pending' | 'in_progress' | 'completed') => void;
  onUpdateSchedule?: (updatedSchedules: ShiftSchedule[]) => void;
  onUpdateEmployees?: (updatedEmployees: UserAccount[]) => void;
  settings?: AppSettings;
  onUpdateSettings?: (s: AppSettings) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  currentUser,
  employees,
  schedules,
  machines,
  machineAssignments,
  specialTasks,
  activeDate,
  onDateChange,
  onNavigate,
  onUpdateSchedule,
  onUpdateEmployees,
  settings,
  onUpdateSettings,
}) => {
  // Operational Date Selector (defaults to today's active date)
  const [selectedDate, setSelectedDate] = useState<string>(() => activeDate || getTodayDateString());
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);
  const [selectedEmployeeForWA, setSelectedEmployeeForWA] = useState<{
    employee: UserAccount;
    shift?: ShiftType;
  } | null>(null);

  React.useEffect(() => {
    if (activeDate && activeDate !== selectedDate) {
      setSelectedDate(activeDate);
    }
  }, [activeDate]);

  const updateDate = (newDate: string) => {
    setSelectedDate(newDate);
    onDateChange?.(newDate);
  };

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

  const dateObj = new Date(selectedDate + 'T00:00:00');
  const isSunday = dateObj.getDay() === 0;
  const formattedDateLong = new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(dateObj);

  // Active perawat, PJ Shift, and kepala ruang
  const activeNurses = employees.filter(
    (e) => (e.role === 'perawat' || e.role === 'pj_shift') && e.status === 'aktif'
  );
  const kepalaRuang = employees.find((e) => e.role === 'kepala_ruangan' && e.status === 'aktif');

  // Active doctors & on-duty doctor calculations for the selected date
  const activeDoctors = employees.filter((e) => e.role === 'dokter' && e.status === 'aktif');

  const getDoctorDuty = (doc: UserAccount) => {
    if (isSunday) {
      return {
        shift: 'libur' as ShiftType,
        shiftLabel: 'Libur Rutin HD',
        dutyTitle: 'Libur Operasional Unit',
        clinicalRole: 'Unit Hemodialisa Tutup Rutin Hari Minggu',
        isOnDuty: false,
      };
    }

    const sch = schedules.find((s) => s.employeeId === doc.id && s.date === selectedDate);
    if (sch) {
      const shift = sch.shift;
      const isDual = shift === 'pagi_siang';
      const isOnDuty = shift === 'pagi' || shift === 'siang' || isDual;
      const shiftLabel =
        isDual
          ? '2 Shif (Pagi & Siang: 07:00 - 20:30 WIB)'
          : shift === 'pagi'
          ? 'Shif Pagi (07:00 - 14:00 WIB)'
          : shift === 'siang'
          ? 'Shif Siang (13:00 - 20:00 WIB)'
          : 'Libur / Lepas Jaga';
      const dutyTitle =
        sch.note ||
        (isDual
          ? 'Dokter Jaga Penuh 2 Shif (Pagi & Siang)'
          : shift === 'pagi'
          ? 'Dokter Penanggung Jawab Pelayanan HD (DPJP)'
          : shift === 'siang'
          ? 'Dokter Jaga Hemodialisa'
          : 'Lepas Dinas');
      const clinicalRole =
        doc.specialization ||
        (isDual
          ? 'Visite dan pengawasan klinis 2 sesi penuh (Pagi & Siang)'
          : shift === 'pagi'
          ? 'Visite pasien HD pagi, evaluasi resep dialisis & instruksi klinis'
          : 'Visite pasien HD siang, observasi intradialitik & tatalaksana komplikasi');
      return { shift, shiftLabel, dutyTitle, clinicalRole, isOnDuty, isDual };
    }

    // Default fallback by doctor ID or specialization if not explicitly scheduled yet
    if (doc.id === 'emp-dr-reza' || doc.specialization?.toLowerCase().includes('pagi')) {
      return {
        shift: 'pagi' as ShiftType,
        shiftLabel: 'Shif Pagi (07:00 - 14:00 WIB)',
        dutyTitle: 'Dokter Penanggung Jawab Pelayanan HD (DPJP)',
        clinicalRole: doc.specialization || 'Visite pasien HD pagi, evaluasi resep dialisis & instruksi klinis',
        isOnDuty: true,
      };
    } else if (doc.id === 'emp-dr-paramitha' || doc.specialization?.toLowerCase().includes('siang')) {
      return {
        shift: 'siang' as ShiftType,
        shiftLabel: 'Shif Siang (13:00 - 20:00 WIB)',
        dutyTitle: 'Dokter Jaga Hemodialisa (Siang)',
        clinicalRole: doc.specialization || 'Visite pasien HD siang, observasi intradialitik & tatalaksana komplikasi',
        isOnDuty: true,
      };
    }

    return {
      shift: 'libur' as ShiftType,
      shiftLabel: 'Libur / Lepas Jaga',
      dutyTitle: 'Lepas Dinas',
      clinicalRole: doc.specialization || 'Tidak bertugas pada tanggal ini',
      isOnDuty: false,
    };
  };

  const doctorDutyList = activeDoctors
    .map((doc) => ({
      doctor: doc,
      ...getDoctorDuty(doc),
    }))
    .sort((a, b) => {
      const order: Record<string, number> = { pagi: 1, siang: 2, malam: 3, middle: 4, libur: 5, cuti: 6, izin: 7, sakit: 8 };
      return (order[a.shift] || 99) - (order[b.shift] || 99);
    });

  const onDutyDoctors = doctorDutyList.filter((d) => d.isOnDuty);
  const doctorPagi = doctorDutyList.find((d) => d.shift === 'pagi' || d.shift === 'pagi_siang')?.doctor;
  const doctorSiang = doctorDutyList.find((d) => d.shift === 'siang' || d.shift === 'pagi_siang')?.doctor;

  const canManage =
    currentUser.role === 'admin' ||
    currentUser.role === 'kepala_ruangan' ||
    currentUser.role === 'pj_shift';

  const handleAssignDoctor = (shift: 'pagi' | 'siang', doctorId: string) => {
    if (!onUpdateSchedule) return;
    let newSchedules = [...schedules];
    const otherShift: 'pagi' | 'siang' = shift === 'pagi' ? 'siang' : 'pagi';

    activeDoctors.forEach((doc) => {
      const existingIdx = newSchedules.findIndex(
        (s) => s.employeeId === doc.id && s.date === selectedDate
      );
      const currentSch = existingIdx >= 0 ? newSchedules[existingIdx] : null;

      if (doc.id === doctorId) {
        let targetShift: ShiftType = shift;
        let note = shift === 'pagi' ? 'Dokter Penanggung Jawab HD (Pagi)' : 'Dokter Jaga HD (Siang)';

        if (currentSch?.shift === otherShift || currentSch?.shift === 'pagi_siang') {
          targetShift = 'pagi_siang';
          note = 'Dokter Jaga 2 Shif (Pagi & Siang)';
        }

        const item: ShiftSchedule = {
          id: `${doc.id}_${selectedDate}`,
          employeeId: doc.id,
          date: selectedDate,
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

    if (!doctorId) {
      activeDoctors.forEach((doc) => {
        const existingIdx = newSchedules.findIndex(
          (s) => s.employeeId === doc.id && s.date === selectedDate
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

  // Cek apakah Kepala Ruang memiliki alokasi mesin aktif pada Shif Pagi
  const karuHasPagiMachines = kepalaRuang ? machineAssignments.some(
    (a) => a.date === selectedDate && a.shift === 'pagi' && a.nurseId === kepalaRuang.id && !a.isOff
  ) : false;

  // Staf klinis per shif (Perawat, PJ Shift, dan Karu jika memegang alokasi mesin)
  const clinicalStaff = employees.filter(
    (e) => (e.role === 'perawat' || e.role === 'pj_shift' || e.role === 'kepala_ruangan') && e.status === 'aktif' && !isInvalidNurseAccount(e)
  );

  const rawPagiNurses = clinicalStaff.filter((n) => {
    const eff = getEffectiveShiftForEmployee(n, selectedDate, schedules, employees);
    if (eff === 'pagi') {
      if (n.role === 'kepala_ruangan') {
        return karuHasPagiMachines;
      }
      return true;
    }
    return machineAssignments.some(
      (a) => a.date === selectedDate && a.shift === 'pagi' && a.nurseId === n.id && !a.isOff
    );
  });

  const rawSiangNurses = clinicalStaff.filter((n) => {
    const eff = getEffectiveShiftForEmployee(n, selectedDate, schedules, employees);
    if (eff === 'siang') {
      if (n.role === 'kepala_ruangan') {
        return machineAssignments.some(
          (a) => a.date === selectedDate && a.shift === 'siang' && a.nurseId === n.id && !a.isOff
        );
      }
      return true;
    }
    return machineAssignments.some(
      (a) => a.date === selectedDate && a.shift === 'siang' && a.nurseId === n.id && !a.isOff
    );
  });

  // Urutan BUKAN berdasarkan hierarki perawat tapi BERDASARKAN URUTAN ALOKASI MESIN:
  const pagiNurses = sortNursesByMachineAllocationOrder(
    rawPagiNurses,
    machineAssignments,
    machines,
    selectedDate,
    'pagi'
  );
  const siangNurses = sortNursesByMachineAllocationOrder(
    rawSiangNurses,
    machineAssignments,
    machines,
    selectedDate,
    'siang'
  );

  // Perawat / Staf yang libur/off pada tanggal yang dipilih
  const offNurses = clinicalStaff.filter((n) => {
    if (isSunday) return true;
    const isWorkingPagi = rawPagiNurses.some((p) => p.id === n.id);
    const isWorkingSiang = rawSiangNurses.some((s) => s.id === n.id);
    if (isWorkingPagi || isWorkingSiang) return false;
    const eff = getEffectiveShiftForEmployee(n, selectedDate, schedules, employees);
    return eff === 'libur' || eff === 'cuti' || eff === 'izin' || eff === 'sakit' || !eff;
  });

  // Machine calculations per shift:
  // Status mesin aktif pada dashboard HD mengikuti mesin yang aktif pada pembagian mesin (terplot ke perawat & tidak berstatus OFF)
  const totalRegisteredMachines = machines.length;

  // Shift Pagi machines (aktif dari pembagian mesin)
  const activeAssignmentsPagi = machineAssignments.filter(
    (a) => a.date === selectedDate && a.shift === 'pagi' && !a.isOff && Boolean(a.nurseId)
  );
  const activeMachineIdsPagi = new Set(activeAssignmentsPagi.map((a) => a.machineId));
  const activeCountPagi = activeMachineIdsPagi.size;
  const offCountPagi = totalRegisteredMachines - activeCountPagi;

  // Shift Siang machines (aktif dari pembagian mesin)
  const activeAssignmentsSiang = machineAssignments.filter(
    (a) => a.date === selectedDate && a.shift === 'siang' && !a.isOff && Boolean(a.nurseId)
  );
  const activeMachineIdsSiang = new Set(activeAssignmentsSiang.map((a) => a.machineId));
  const activeCountSiang = activeMachineIdsSiang.size;
  const offCountSiang = totalRegisteredMachines - activeCountSiang;

  // Helper to render special tasks for a specific nurse on a shift
  const renderSpecialTasks = (nurseId: string, shift: 'pagi' | 'siang') => {
    const tasks = specialTasks.filter(
      (t) => t.assignedToId === nurseId && t.date === selectedDate && t.shift === shift
    );

    if (tasks.length === 0) {
      return (
        <span className="text-slate-400 text-xs italic">
          Pelaksana HD
        </span>
      );
    }

    return (
      <div className="flex flex-wrap gap-1.5 items-center">
        {tasks.map((task) => {
          const def = SPECIAL_TASK_DEFINITIONS[task.category];
          if (!def) {
            return (
              <span
                key={task.id}
                className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-slate-800 border border-slate-200"
              >
                {task.title}
              </span>
            );
          }
          return (
            <span
              key={task.id}
              className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${def.badgeBg} text-white shadow-2xs inline-flex items-center space-x-1`}
              title={`${def.name}: ${def.description}`}
            >
              <span>{def.shortCode}</span>
              <span>•</span>
              <span>{def.name}</span>
            </span>
          );
        })}
      </div>
    );
  };

  // Helper to render machine assignments for a specific nurse on a shift
  const renderMachineAllocation = (nurseId: string, shift: 'pagi' | 'siang') => {
    const assignments = machineAssignments
      .filter((a) => a.date === selectedDate && a.shift === shift && a.nurseId === nurseId && !a.isOff)
      .sort((a, b) => {
        const machA = machines.find((m) => m.id === a.machineId);
        const machB = machines.find((m) => m.id === b.machineId);
        return getMachineSortOrder(machA?.code || '') - getMachineSortOrder(machB?.code || '');
      });

    if (assignments.length === 0) {
      return (
        <span className="text-slate-400 text-xs italic">
          Belum diplot
        </span>
      );
    }

    return (
      <div className="flex flex-wrap gap-1.5 items-center">
        {assignments.map((asgn) => {
          const mach = machines.find((m) => m.id === asgn.machineId);
          const isIso = mach?.zone.toLowerCase().includes('isolasi');
          return (
            <span
              key={asgn.id}
              className={`px-2 py-0.5 rounded-md text-[11px] font-bold border inline-flex items-center space-x-1 ${
                isIso
                  ? 'bg-rose-50 text-rose-800 border-rose-200'
                  : 'bg-teal-50 text-teal-800 border-teal-200'
              }`}
              title={mach ? `${mach.code} (${mach.zone}) - Model: ${mach.model}` : asgn.machineId}
            >
              <span>{mach ? mach.code : asgn.machineId}</span>
              {isIso && <span className="text-[10px] text-rose-600 font-extrabold">(Iso)</span>}
              {asgn.patientName && (
                <span className="text-[10px] text-slate-500 font-normal">
                  ({asgn.patientName})
                </span>
              )}
            </span>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Banner with Operational Status */}
      <div className="bg-gradient-to-r from-teal-900 via-slate-900 to-cyan-950 rounded-2xl p-4 sm:p-6 text-white shadow-lg border border-teal-800/40 relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 text-teal-400 text-[10px] sm:text-xs font-bold uppercase tracking-wider mb-1">
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-500"></span>
              </span>
              <span>Unit Dialisis RS Happy Land • {formattedDateLong}</span>
            </div>
            <h2 className="text-lg sm:text-2xl font-extrabold tracking-tight">
              Selamat Bertugas, {currentUser.name}
            </h2>
            <p className="text-slate-300 text-xs sm:text-sm mt-1 max-w-2xl leading-relaxed">
              Pantau daftar perawat dinas per shif, rangkuman tugas khusus, alokasi mesin pasien, dan ketersediaan mesin HD aktif secara real-time.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-stretch sm:items-center gap-2 self-stretch md:self-center shrink-0 w-full sm:w-auto">
            <button
              onClick={() => setIsWhatsAppModalOpen(true)}
              className="px-3.5 sm:px-4 py-2 sm:py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold rounded-xl text-xs sm:text-sm flex items-center justify-center space-x-1.5 transition shadow-sm cursor-pointer border border-emerald-400/30 min-h-[40px] active:scale-95"
              title="Kirim Ringkasan Jadwal & Mesin ke WhatsApp Kepala Ruang"
            >
              <MessageCircle className="w-4 h-4" />
              <span>Kirim WA Kepala Ruang</span>
            </button>
            <button
              onClick={() => onNavigate('jadwal')}
              className="px-3.5 sm:px-4 py-2 sm:py-2.5 bg-teal-500 hover:bg-teal-600 text-slate-950 font-bold rounded-xl text-xs sm:text-sm flex items-center justify-center space-x-1.5 transition shadow-sm cursor-pointer min-h-[40px] active:scale-95"
            >
              <Calendar className="w-4 h-4" />
              <span>Matrik Jadwal</span>
            </button>
            <button
              onClick={() => onNavigate('mesin')}
              className="px-3.5 sm:px-4 py-2 sm:py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold rounded-xl text-xs sm:text-sm border border-slate-700 flex items-center justify-center space-x-1.5 transition cursor-pointer min-h-[40px] active:scale-95"
            >
              <Layers className="w-4 h-4" />
              <span>Plot Mesin</span>
            </button>
          </div>
        </div>
      </div>

      {/* Operational Date Selector & Quick Shift Metrics Strip */}
      <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-slate-200 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4">
        {/* Date Selector */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex items-center space-x-1 sm:space-x-1.5 bg-slate-100 p-1 sm:p-1.5 rounded-xl border border-slate-200">
            <button
              onClick={handlePrevDate}
              className="p-1.5 hover:bg-white rounded-lg text-slate-600 transition cursor-pointer min-w-[32px] min-h-[32px] flex items-center justify-center"
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
              className="p-1.5 hover:bg-white rounded-lg text-slate-600 transition cursor-pointer min-w-[32px] min-h-[32px] flex items-center justify-center"
              title="Hari Berikutnya"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={() => {
              updateDate(getTodayDateString());
            }}
            className="px-3 py-1.5 sm:py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer min-h-[34px]"
          >
            Hari Ini
          </button>

          <button
            onClick={() => setIsWhatsAppModalOpen(true)}
            className="px-3 py-1.5 sm:py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer shadow-xs min-h-[34px] active:scale-95"
            title="Kirim Ringkasan Jadwal & Alokasi Mesin HD via WhatsApp"
          >
            <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
            <span>Kirim WA</span>
          </button>

          <div className="flex flex-col ml-1">
            <span className="text-xs sm:text-sm font-bold text-slate-900">{formattedDateLong}</span>
            {isSunday ? (
              <span className="text-[10px] sm:text-[11px] font-bold text-rose-600 flex items-center space-x-1">
                <AlertTriangle className="w-3 h-3 text-rose-500" />
                <span>Hari Minggu - Libur Rutin Seluruh Staf HD</span>
              </span>
            ) : (
              <span className="text-[10px] sm:text-[11px] text-slate-500">
                Operasional Unit Hemodialisa (Shif Pagi &amp; Siang)
              </span>
            )}
          </div>
        </div>

        {/* Machine Status Summary Strip */}
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 sm:gap-2.5 w-full lg:w-auto">
          {/* Shift Pagi Active Counter */}
          <div className="px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center space-x-2 text-xs">
            <div className="p-1.5 rounded-lg bg-emerald-600 text-white shrink-0">
              <Sun className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className="text-[9px] sm:text-[10px] text-emerald-800 font-semibold uppercase tracking-wider block">
                Mesin Shif Pagi
              </span>
              <span className="font-extrabold text-emerald-950 text-xs sm:text-sm">
                {activeCountPagi} <span className="text-[10px] sm:text-xs font-semibold text-emerald-700">/ {totalRegisteredMachines} Unit</span>
              </span>
            </div>
          </div>

          {/* Shift Siang Active Counter */}
          <div className="px-3 py-2 rounded-xl bg-pink-50 border border-pink-200 flex items-center space-x-2 text-xs">
            <div className="p-1.5 rounded-lg bg-pink-600 text-white shrink-0">
              <Moon className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className="text-[9px] sm:text-[10px] text-pink-800 font-semibold uppercase tracking-wider block">
                Mesin Shif Siang
              </span>
              <span className="font-extrabold text-pink-950 text-xs sm:text-sm">
                {activeCountSiang} <span className="text-[10px] sm:text-xs font-semibold text-pink-700">/ {totalRegisteredMachines} Unit</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* DOKTER JAGA HEMODIALISA (1 DOKTER PER SHIF - MUDAH DIINPUT & DIGANTI) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Header Card Dokter Jaga */}
        <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-sky-800 p-3.5 sm:p-4 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-white/15 text-white backdrop-blur-xs shrink-0">
              <Stethoscope className="w-5 h-5 text-sky-200" />
            </div>
            <div>
              <div className="flex items-center space-x-2 flex-wrap">
                <h3 className="font-extrabold text-base tracking-tight">Dokter Jaga Hemodialisa</h3>
                <span className="text-[11px] px-2 py-0.5 rounded-md bg-white/20 font-bold text-sky-100">
                  Dokter Jaga HD
                </span>
                <span className="text-xs px-2 py-0.5 rounded-md bg-sky-950/40 font-semibold text-sky-200">
                  {isSunday ? 'Hari Minggu' : formattedDateLong}
                </span>
              </div>
              <p className="text-xs text-sky-100/90 mt-0.5">
                {isSunday
                  ? 'Unit Hemodialisa Tutup Rutin Hari Minggu'
                  : 'Dapat ditugaskan 1 dokter per shif, atau 1 dokter melaksanakan 2 shif (Pagi & Siang) sekaligus.'}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 self-start sm:self-auto">
            <button
              onClick={() => onNavigate('jadwal')}
              className="px-3 py-1.5 bg-white/15 hover:bg-white/25 text-white rounded-xl text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer backdrop-blur-xs min-h-[32px]"
              title="Buka Manajemen Jadwal Dokter & Perawat"
            >
              <Calendar className="w-3.5 h-3.5 text-sky-200" />
              <span>Kelola di Jadwal</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Konten Dokter Jaga per Shif */}
        <div className="p-4">
          {isSunday ? (
            <div className="py-6 px-4 text-center rounded-xl bg-amber-50/70 border border-amber-200">
              <div className="flex flex-col items-center justify-center space-y-1">
                <AlertTriangle className="w-6 h-6 text-amber-600 mb-1" />
                <span className="font-bold text-slate-800 text-sm">Unit Hemodialisa Tutup Rutin Hari Minggu</span>
                <span className="text-xs text-slate-500">
                  Pelayanan hemodialisa rutin libur pada hari Minggu dan seluruh dokter lepas dinas.
                </span>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {doctorPagi && doctorSiang && doctorPagi.id === doctorSiang.id && (
                <div className="md:col-span-2 p-3 bg-indigo-50 border border-indigo-200 rounded-xl flex items-center justify-between text-xs text-indigo-900 shadow-2xs">
                  <div className="flex items-center space-x-2">
                    <span className="px-2 py-0.5 rounded-md bg-indigo-600 text-white font-extrabold text-[10px]">
                      2 SHIF SEKALIGUS
                    </span>
                    <span className="font-bold">
                      {doctorPagi.name} bertugas 2 shif penuh hari ini (Shif Pagi dan Siang).
                    </span>
                  </div>
                  <span className="text-[11px] font-semibold text-indigo-700">07:00 - 20:30 WIB</span>
                </div>
              )}
              {/* Shif Pagi (07:00 - 14:00) */}
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 flex flex-col justify-between space-y-3 transition hover:border-emerald-300">
                <div>
                  <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-emerald-200/70">
                    <div className="flex items-center space-x-2">
                      <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-xs shadow-2xs">
                        <Sun className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-extrabold text-emerald-950 uppercase tracking-wide">
                          Dokter Jaga Shif Pagi
                        </h4>
                        <span className="text-[11px] text-emerald-700 font-medium">07:00 - 14:00 WIB</span>
                      </div>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold border border-emerald-300">
                      1 Dokter
                    </span>
                  </div>

                  {/* Info Dokter Pagi */}
                  <div className="mt-3 flex items-start space-x-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white font-black text-sm flex items-center justify-center shrink-0 shadow-xs">
                      dr
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-extrabold text-slate-900 text-sm sm:text-base leading-tight">
                        {doctorPagi ? doctorPagi.name : (
                          <span className="text-slate-400 italic">Belum ditentukan</span>
                        )}
                      </div>
                      <div className="text-xs text-emerald-800 font-semibold mt-0.5">
                        {doctorPagi?.specialization || 'Dokter Penanggung Jawab Pelayanan HD (DPJP)'}
                      </div>
                      {doctorPagi && (
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          {doctorPagi.nip && (
                            <span className="text-[10px] text-slate-500 font-mono">
                              NIP: {doctorPagi.nip}
                            </span>
                          )}
                          {doctorPagi.phone && (
                            <a
                              href={`https://wa.me/${doctorPagi.phone.replace(/[^0-9]/g, '').replace(/^0/, '62')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center space-x-1 text-[11px] text-emerald-700 hover:text-emerald-800 font-bold hover:underline"
                            >
                              <Phone className="w-3 h-3 text-emerald-600" />
                              <span>{doctorPagi.phone}</span>
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => setSelectedEmployeeForWA({ employee: doctorPagi, shift: 'pagi' })}
                            className="inline-flex items-center space-x-1.5 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold rounded-lg text-[11px] transition shadow-2xs cursor-pointer active:scale-95"
                            title={`Kirim WA jadwal tugas jaga HD ke ${doctorPagi.name}`}
                          >
                            <MessageCircle className="w-3 h-3" />
                            <span>Kirim WA Jadwal</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Quick Dropdown Selector for Morning Doctor */}
                {canManage && (
                  <div className="pt-2 border-t border-emerald-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <label className="text-[11px] font-bold text-slate-600 shrink-0">
                      Ubah Dokter Pagi:
                    </label>
                    <select
                      value={doctorPagi?.id || ''}
                      onChange={(e) => handleAssignDoctor('pagi', e.target.value)}
                      className="w-full sm:w-auto flex-1 max-w-xs text-xs font-bold px-2.5 py-1.5 rounded-lg border border-emerald-300 bg-white text-slate-800 shadow-2xs focus:ring-2 focus:ring-emerald-500 focus:outline-hidden cursor-pointer"
                    >
                      <option value="">-- Kosongkan / Lepas Jaga --</option>
                      {activeDoctors.map((doc) => (
                        <option key={doc.id} value={doc.id}>
                          {doc.name} {doc.nickname ? `(${doc.nickname})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Shif Siang (13:00 - 20:00) */}
              <div className="rounded-xl border border-sky-200 bg-sky-50/40 p-4 flex flex-col justify-between space-y-3 transition hover:border-sky-300">
                <div>
                  <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-sky-200/70">
                    <div className="flex items-center space-x-2">
                      <div className="w-7 h-7 rounded-lg bg-sky-600 text-white flex items-center justify-center font-bold text-xs shadow-2xs">
                        <Moon className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-extrabold text-sky-950 uppercase tracking-wide">
                          Dokter Jaga Shif Siang
                        </h4>
                        <span className="text-[11px] text-sky-700 font-medium">13:00 - 20:00 WIB</span>
                      </div>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 font-bold border border-sky-300">
                      1 Dokter
                    </span>
                  </div>

                  {/* Info Dokter Siang */}
                  <div className="mt-3 flex items-start space-x-3">
                    <div className="w-10 h-10 rounded-xl bg-sky-600 text-white font-black text-sm flex items-center justify-center shrink-0 shadow-xs">
                      dr
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-extrabold text-slate-900 text-sm sm:text-base leading-tight">
                        {doctorSiang ? doctorSiang.name : (
                          <span className="text-slate-400 italic">Belum ditentukan</span>
                        )}
                      </div>
                      <div className="text-xs text-sky-800 font-semibold mt-0.5">
                        {doctorSiang?.specialization || 'Dokter Jaga Hemodialisa (Siang)'}
                      </div>
                      {doctorSiang && (
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          {doctorSiang.nip && (
                            <span className="text-[10px] text-slate-500 font-mono">
                              NIP: {doctorSiang.nip}
                            </span>
                          )}
                          {doctorSiang.phone && (
                            <a
                              href={`https://wa.me/${doctorSiang.phone.replace(/[^0-9]/g, '').replace(/^0/, '62')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center space-x-1 text-[11px] text-sky-700 hover:text-sky-800 font-bold hover:underline"
                            >
                              <Phone className="w-3 h-3 text-sky-600" />
                              <span>{doctorSiang.phone}</span>
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => setSelectedEmployeeForWA({ employee: doctorSiang, shift: 'siang' })}
                            className="inline-flex items-center space-x-1.5 px-2.5 py-1 bg-sky-600 hover:bg-sky-500 text-white font-extrabold rounded-lg text-[11px] transition shadow-2xs cursor-pointer active:scale-95"
                            title={`Kirim WA jadwal tugas jaga HD ke ${doctorSiang.name}`}
                          >
                            <MessageCircle className="w-3 h-3" />
                            <span>Kirim WA Jadwal</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Quick Dropdown Selector for Afternoon Doctor */}
                {canManage && (
                  <div className="pt-2 border-t border-sky-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <label className="text-[11px] font-bold text-slate-600 shrink-0">
                      Ubah Dokter Siang:
                    </label>
                    <select
                      value={doctorSiang?.id || ''}
                      onChange={(e) => handleAssignDoctor('siang', e.target.value)}
                      className="w-full sm:w-auto flex-1 max-w-xs text-xs font-bold px-2.5 py-1.5 rounded-lg border border-sky-300 bg-white text-slate-800 shadow-2xs focus:ring-2 focus:ring-sky-500 focus:outline-hidden cursor-pointer"
                    >
                      <option value="">-- Kosongkan / Lepas Jaga --</option>
                      {activeDoctors.map((doc) => (
                        <option key={doc.id} value={doc.id}>
                          {doc.name} {doc.nickname ? `(${doc.nickname})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* SEPARATE TABLES (KIRI & KANAN) FOR SHIFT PAGI & SHIFT SIANG */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* KOLOM KIRI: SHIFT PAGI */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
          {/* Header Card Shift Pagi */}
          <div className="bg-gradient-to-r from-emerald-700 to-teal-800 p-4 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-xl bg-white/15 text-white backdrop-blur-xs">
                <Sun className="w-5 h-5 text-amber-300" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="font-extrabold text-base tracking-tight">Shif Pagi</h3>
                  <span className="text-xs px-2 py-0.5 rounded-md bg-white/20 font-semibold text-emerald-100">
                    07:00 - 14:00 WIB
                  </span>
                </div>
                <p className="text-xs text-emerald-100/90 mt-0.5">
                  Dokter Jaga: <span className="font-bold text-white">{doctorPagi ? (doctorPagi.nickname || doctorPagi.name) : '-'}</span> • {pagiNurses.length + (kepalaRuang && !isSunday && !karuHasPagiMachines ? 1 : 0)} Perawat Bertugas
                </p>
              </div>
            </div>

            {/* Badge Kesiapan Mesin Shif Pagi */}
            <div className="bg-emerald-950/40 border border-emerald-400/30 px-3 py-1.5 rounded-xl flex items-center space-x-2 self-start sm:self-auto">
              <Activity className="w-4 h-4 text-emerald-300" />
              <div className="text-right sm:text-left">
                <div className="text-[10px] font-bold text-emerald-300 uppercase tracking-wider">
                  Mesin Aktif Shif Pagi
                </div>
                <div className="text-xs font-extrabold text-white">
                  {activeCountPagi} Mesin Aktif {offCountPagi > 0 && <span className="text-[11px] text-emerald-300 font-normal">({offCountPagi} OFF)</span>}
                </div>
              </div>
            </div>
          </div>

          {/* Table of Shift Pagi Nurses */}
          <div className="p-4 flex-1 flex flex-col">
            <div className="overflow-x-auto rounded-xl border border-slate-200 flex-1">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold text-[11px] uppercase tracking-wider">
                    <th className="py-2.5 px-3 w-10 text-center">No</th>
                    <th className="py-2.5 px-3 min-w-[130px]">Nama Perawat</th>
                    <th className="py-2.5 px-3 min-w-[150px]">Rangkuman Tugas Khusus</th>
                    <th className="py-2.5 px-3 min-w-[130px]">Alokasi Mesin</th>
                    <th className="py-2.5 px-3 w-28 text-center">Kirim WA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {/* Kepala Ruang (Supervisi Shif Pagi - Ditampilkan tersendiri jika murni supervisi tanpa alokasi mesin) */}
                  {kepalaRuang && !isSunday && !karuHasPagiMachines && (
                    <tr className="bg-teal-50/40 hover:bg-teal-50/70 transition">
                      <td className="py-2.5 px-3 text-center text-teal-800 font-bold">
                        ★
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-teal-950 text-sm" title={kepalaRuang.name}>
                            {getNurseNickname(kepalaRuang)}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-500 block">Supervisi Unit HD</span>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex flex-col gap-1">
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-teal-800 text-white inline-block w-max">
                            Supervisi Operasional HD
                          </span>
                          {renderSpecialTasks(kepalaRuang.id, 'pagi')}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        {renderMachineAllocation(kepalaRuang.id, 'pagi')}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => setSelectedEmployeeForWA({ employee: kepalaRuang, shift: 'pagi' })}
                          className="inline-flex items-center space-x-1 px-2.5 py-1 bg-teal-100 hover:bg-teal-200 text-teal-900 border border-teal-300 rounded-lg text-[11px] font-bold transition shadow-2xs hover:scale-105 active:scale-95 cursor-pointer"
                          title={`Kirim WA pengingat supervisi ke ${kepalaRuang.name}`}
                        >
                          <MessageCircle className="w-3 h-3 text-teal-700" />
                          <span>Kirim WA</span>
                        </button>
                      </td>
                    </tr>
                  )}

                  {/* Regular Shift Pagi Nurses */}
                  {pagiNurses.length > 0 ? (
                    pagiNurses.map((nurse, idx) => (
                      <tr key={nurse.id} className="hover:bg-slate-50/80 transition">
                        <td className="py-2.5 px-3 text-center text-slate-500 font-medium">
                          {idx + 1}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center space-x-2">
                            <span className="font-bold text-slate-900 text-sm" title={nurse.name}>
                              {getNurseNickname(nurse)}
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          {renderSpecialTasks(nurse.id, 'pagi')}
                        </td>
                        <td className="py-2.5 px-3">
                          {renderMachineAllocation(nurse.id, 'pagi')}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => setSelectedEmployeeForWA({ employee: nurse, shift: 'pagi' })}
                            className="inline-flex items-center space-x-1 px-2.5 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-900 border border-emerald-300 rounded-lg text-[11px] font-bold transition shadow-2xs hover:scale-105 active:scale-95 cursor-pointer"
                            title={`Kirim WA pengingat shif & mesin ke ${nurse.name}`}
                          >
                            <MessageCircle className="w-3 h-3 text-emerald-700" />
                            <span>Kirim WA</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400">
                        <p className="text-xs font-semibold text-slate-600">
                          Tidak ada perawat pelaksana yang bertugas di Shif Pagi.
                        </p>
                        <button
                          onClick={() => onNavigate('jadwal')}
                          className="mt-2 text-xs font-bold text-teal-700 hover:text-teal-800 inline-flex items-center space-x-1 cursor-pointer"
                        >
                          <span>Atur pada Matrik Jadwal</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Shift Pagi Footer Actions */}
            <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>Total: <strong>{pagiNurses.length + (kepalaRuang && !isSunday && !karuHasPagiMachines ? 1 : 0)}</strong> Perawat Bertugas Pagi</span>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => onNavigate('tugas')}
                  className="text-teal-700 hover:text-teal-800 font-bold hover:underline cursor-pointer"
                >
                  Edit Tugas Khusus
                </button>
                <span>•</span>
                <button
                  onClick={() => onNavigate('mesin')}
                  className="text-teal-700 hover:text-teal-800 font-bold hover:underline cursor-pointer"
                >
                  Plotting Mesin
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* KOLOM KANAN: SHIFT SIANG */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
          {/* Header Card Shift Siang */}
          <div className="bg-gradient-to-r from-pink-700 to-rose-800 p-4 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-xl bg-white/15 text-white backdrop-blur-xs">
                <Moon className="w-5 h-5 text-pink-200" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="font-extrabold text-base tracking-tight">Shif Siang</h3>
                  <span className="text-xs px-2 py-0.5 rounded-md bg-white/20 font-semibold text-pink-100">
                    13:00 - 20:00 WIB
                  </span>
                </div>
                <p className="text-xs text-pink-100/90 mt-0.5">
                  Dokter Jaga: <span className="font-bold text-white">{doctorSiang ? (doctorSiang.nickname || doctorSiang.name) : '-'}</span> • {siangNurses.length} Perawat Bertugas
                </p>
              </div>
            </div>

            {/* Badge Kesiapan Mesin Shif Siang */}
            <div className="bg-rose-950/40 border border-rose-400/30 px-3 py-1.5 rounded-xl flex items-center space-x-2 self-start sm:self-auto">
              <Activity className="w-4 h-4 text-pink-300" />
              <div className="text-right sm:text-left">
                <div className="text-[10px] font-bold text-pink-300 uppercase tracking-wider">
                  Mesin Aktif Shif Siang
                </div>
                <div className="text-xs font-extrabold text-white">
                  {activeCountSiang} Mesin Aktif {offCountSiang > 0 && <span className="text-[11px] text-pink-300 font-normal">({offCountSiang} OFF)</span>}
                </div>
              </div>
            </div>
          </div>

          {/* Table of Shift Siang Nurses */}
          <div className="p-4 flex-1 flex flex-col">
            <div className="overflow-x-auto rounded-xl border border-slate-200 flex-1">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold text-[11px] uppercase tracking-wider">
                    <th className="py-2.5 px-3 w-10 text-center">No</th>
                    <th className="py-2.5 px-3 min-w-[130px]">Nama Perawat</th>
                    <th className="py-2.5 px-3 min-w-[150px]">Rangkuman Tugas Khusus</th>
                    <th className="py-2.5 px-3 min-w-[130px]">Alokasi Mesin</th>
                    <th className="py-2.5 px-3 w-28 text-center">Kirim WA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {siangNurses.length > 0 ? (
                    siangNurses.map((nurse, idx) => (
                      <tr key={nurse.id} className="hover:bg-slate-50/80 transition">
                        <td className="py-2.5 px-3 text-center text-slate-500 font-medium">
                          {idx + 1}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center space-x-2">
                            <span className="font-bold text-slate-900 text-sm block" title={nurse.name}>
                              {getNurseNickname(nurse)}
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          {renderSpecialTasks(nurse.id, 'siang')}
                        </td>
                        <td className="py-2.5 px-3">
                          {renderMachineAllocation(nurse.id, 'siang')}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => setSelectedEmployeeForWA({ employee: nurse, shift: 'siang' })}
                            className="inline-flex items-center space-x-1 px-2.5 py-1 bg-pink-100 hover:bg-pink-200 text-pink-900 border border-pink-300 rounded-lg text-[11px] font-bold transition shadow-2xs hover:scale-105 active:scale-95 cursor-pointer"
                            title={`Kirim WA pengingat shif & mesin ke ${nurse.name}`}
                          >
                            <MessageCircle className="w-3 h-3 text-pink-700" />
                            <span>Kirim WA</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400">
                        <p className="text-xs font-semibold text-slate-600">
                          Tidak ada perawat pelaksana yang bertugas di Shif Siang.
                        </p>
                        <button
                          onClick={() => onNavigate('jadwal')}
                          className="mt-2 text-xs font-bold text-teal-700 hover:text-teal-800 inline-flex items-center space-x-1 cursor-pointer"
                        >
                          <span>Atur pada Matrik Jadwal</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Shift Siang Footer Actions */}
            <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>Total: <strong>{siangNurses.length}</strong> Perawat Bertugas Siang</span>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => onNavigate('tugas')}
                  className="text-teal-700 hover:text-teal-800 font-bold hover:underline cursor-pointer"
                >
                  Edit Tugas Khusus
                </button>
                <span>•</span>
                <button
                  onClick={() => onNavigate('mesin')}
                  className="text-teal-700 hover:text-teal-800 font-bold hover:underline cursor-pointer"
                >
                  Plotting Mesin
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION PERAWAT / STAF LIBUR HARI INI */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="bg-gradient-to-r from-amber-700 via-amber-800 to-slate-800 p-3.5 sm:p-4 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-white/15 text-white backdrop-blur-xs">
              <Palmtree className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-extrabold text-base tracking-tight">
                  Staf Libur / Lepas Jaga ({offNurses.length} Karyawan)
                </h3>
                <span className="text-[11px] px-2 py-0.5 rounded-md bg-white/20 font-bold text-amber-200">
                  {isSunday ? 'Libur Rutin Minggu' : 'Lepas Jaga'}
                </span>
              </div>
              <p className="text-xs text-amber-100/90 mt-0.5">
                {isSunday 
                  ? 'Unit Hemodialisa tutup rutin setiap hari Minggu. Seluruh staf libur dinas rutin (Kecuali perawat on-call / CITO).' 
                  : 'Daftar perawat pelaksana yang sedang lepas dinas, libur, atau cuti pada tanggal ini.'}
              </p>
            </div>
          </div>
          <span className="text-xs px-2.5 py-1 rounded-lg bg-amber-950/40 text-amber-200 font-semibold border border-amber-500/30 self-start sm:self-auto">
            {formattedDateLong}
          </span>
        </div>

        <div className="p-4">
          {offNurses.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {offNurses.map((staff) => {
                const eff = getEffectiveShiftForEmployee(staff, selectedDate, schedules, employees);
                const tasks = specialTasks.filter((t) => t.date === selectedDate && (t.employeeId === staff.id || t.assignedToId === staff.id));
                const taskNames = tasks.map((t) => SPECIAL_TASK_DEFINITIONS[t.category]?.name || t.category);
                const isCito = tasks.some((t) => t.category === 'cito') || taskNames.some((t) => t.toLowerCase().includes('cito'));

                return (
                  <div 
                    key={staff.id} 
                    className={`p-3 rounded-xl border flex flex-col justify-between space-y-2.5 transition ${
                      isCito 
                        ? 'bg-rose-50/70 border-rose-300 hover:border-rose-400 shadow-2xs' 
                        : 'bg-slate-50/80 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="font-extrabold text-slate-900 text-sm">
                          {getNurseNickname(staff)}
                        </h4>
                        <span className="text-[10px] text-slate-500 font-semibold block">
                          {staff.role === 'kepala_ruangan' ? 'Kepala Ruangan' : staff.role === 'pj_shift' ? 'PJ Shif' : 'Perawat Pelaksana'}
                        </span>
                      </div>
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                        eff === 'cuti' 
                          ? 'bg-purple-100 text-purple-800 border border-purple-300' 
                          : 'bg-amber-100 text-amber-800 border border-amber-300'
                      }`}>
                        {eff === 'cuti' ? 'CUTI' : 'LIBUR'}
                      </span>
                    </div>

                    {/* Special task badge if any */}
                    {taskNames.length > 0 && (
                      <div className="flex items-center space-x-1 flex-wrap gap-1">
                        <span className="text-[10px] font-bold text-slate-600">Tugas:</span>
                        {taskNames.map((tn, i) => (
                          <span 
                            key={i} 
                            className={`text-[10px] font-black px-2 py-0.5 rounded-md ${
                              isCito 
                                ? 'bg-rose-600 text-white shadow-2xs animate-pulse' 
                                : 'bg-indigo-100 text-indigo-900 border border-indigo-200'
                            }`}
                          >
                            🏷️ {tn}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Send WA Button */}
                    <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between">
                      <span className="text-[10px] text-slate-500 font-mono">
                        {staff.phone ? staff.phone : 'Tanpa nomor WA'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedEmployeeForWA({ employee: staff, shift: (eff as ShiftType) || 'libur' })}
                        className="inline-flex items-center space-x-1 px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-300 rounded-lg text-[11px] font-bold transition shadow-2xs hover:scale-105 active:scale-95 cursor-pointer"
                        title={`Kirim pengingat libur / tugas khusus via WA ke ${staff.name}`}
                      >
                        <MessageCircle className="w-3 h-3 text-amber-700" />
                        <span>Kirim WA Libur</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic text-center py-4">
              Seluruh staf aktif bertugas dinas pada tanggal ini.
            </p>
          )}
        </div>
      </div>

      {/* WhatsApp Share Modal */}
      {isWhatsAppModalOpen && (
        <WhatsAppShareModal
          isOpen={isWhatsAppModalOpen}
          onClose={() => setIsWhatsAppModalOpen(false)}
          selectedDate={selectedDate}
          employees={employees}
          schedules={schedules}
          machines={machines}
          machineAssignments={machineAssignments}
          specialTasks={specialTasks}
          onUpdateEmployees={onUpdateEmployees}
          settings={settings}
          onUpdateSettings={onUpdateSettings}
        />
      )}

      {/* Individual Employee WhatsApp Modal */}
      {selectedEmployeeForWA && (
        <EmployeeWhatsAppModal
          isOpen={Boolean(selectedEmployeeForWA)}
          onClose={() => setSelectedEmployeeForWA(null)}
          employee={selectedEmployeeForWA.employee}
          selectedDate={selectedDate}
          initialShift={selectedEmployeeForWA.shift}
          employees={employees}
          schedules={schedules}
          machines={machines}
          machineAssignments={machineAssignments}
          specialTasks={specialTasks}
          onUpdateEmployees={onUpdateEmployees}
        />
      )}
    </div>
  );
};

