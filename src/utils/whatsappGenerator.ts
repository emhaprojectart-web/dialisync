import { 
  UserAccount, 
  ShiftSchedule, 
  HDMachine, 
  MachineAssignment, 
  SpecialTask,
  SpecialTaskCategory
} from '../types';
import { 
  getEffectiveShiftForEmployee, 
  getMachineSortOrder, 
  normalizeMachineCode,
  sortNursesByShiftScheduleOrder,
  sortNursesByMachineAllocationOrder
} from './scheduler';

export interface WhatsAppSummaryOptions {
  dateStr: string;
  employees: UserAccount[];
  schedules: ShiftSchedule[];
  machines: HDMachine[];
  machineAssignments: MachineAssignment[];
  specialTasks: SpecialTask[];
  doctorOverridePagi?: string;
  doctorOverrideSiang?: string;
  kepalaRuangName?: string;
}

/**
 * Format contiguous machine allocations to clean readable strings matching hospital standards:
 * Examples:
 * - ['A01', 'A02', 'A03'] -> "A01 s/d A03 (3 mesin)"
 * - ['A10', 'A11', 'A12'] -> "A10 s/d A12 (3 mesin)"
 * - ['C01', 'C02', 'C03', 'C04'] -> "C01 s/d C04 (4 mesin)"
 * - ['B01', 'B02', 'B03', 'B04'] -> "B01 s/d B04 (4 mesin)"
 * - ['B05', 'B06', 'B07', 'B08'] -> "B05 s/d B08 (4 mesin)"
 * - ['B07', 'B08', 'B09', 'C05'] -> "B07 s/d B09, C05 (4 mesin)"
 * - ['ISO 01', 'ISO 02'] -> "ISO 01, ISO 02 (2 mesin)"
 */
export function formatMachineAllocation(machineCodes: string[]): string {
  if (!machineCodes || machineCodes.length === 0) {
    return 'Belum diplot (0 mesin)';
  }

  // Deduplicate and normalize
  const uniqueNormalized = Array.from(
    new Set(machineCodes.map((c) => normalizeMachineCode(c)))
  );

  // Sort according to clinical layout
  const sortedCodes = uniqueNormalized.sort(
    (a, b) => getMachineSortOrder(a) - getMachineSortOrder(b)
  );

  const totalCount = sortedCodes.length;

  const getPrefix = (code: string) => {
    if (code.startsWith('ISO')) return 'ISO';
    return code.replace(/\d+$/, '');
  };

  // Group into contiguous blocks based on consecutive clinical sort order AND same prefix
  const blocks: string[][] = [];
  let currentBlock: string[] = [];

  for (let i = 0; i < sortedCodes.length; i++) {
    const code = sortedCodes[i];
    const order = getMachineSortOrder(code);

    if (currentBlock.length === 0) {
      currentBlock.push(code);
    } else {
      const prevCode = currentBlock[currentBlock.length - 1];
      const prevOrder = getMachineSortOrder(prevCode);
      const samePrefix = getPrefix(code) === getPrefix(prevCode);

      if (samePrefix && order === prevOrder + 1 && prevOrder !== 999 && order !== 999) {
        currentBlock.push(code);
      } else {
        blocks.push(currentBlock);
        currentBlock = [code];
      }
    }
  }
  if (currentBlock.length > 0) {
    blocks.push(currentBlock);
  }

  // Format single block
  if (blocks.length === 1) {
    const b = blocks[0];
    if (b.length >= 3) {
      return `${b[0]} s/d ${b[b.length - 1]} (${totalCount} mesin)`;
    } else if (b.length === 2) {
      return `${b[0]}, ${b[1]} (${totalCount} mesin)`;
    } else {
      return `${b[0]} (${totalCount} mesin)`;
    }
  }

  // Multiple blocks
  const formattedSegments = blocks.map((b) => {
    if (b.length >= 3) {
      return `${b[0]} s/d ${b[b.length - 1]}`;
    }
    return b.join(', ');
  });

  return `${formattedSegments.join(', ')} (${totalCount} mesin)`;
}

/**
 * Generates full WhatsApp message summary matching the exact requested format:
 * 
 * 📋 RINGKASAN JADWAL & ALOKASI MESIN HD
 * 🏥 RS Happy Land Medical Centre • Ruang Dialisis Gedung Timur Lt.3
 * 📅 Kamis, 24 September 2026
 * Kepada Yth. TWIS FERTILIANTI P W
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 🌅 SIF PAGI (7 Perawat)
 * 🩺 DOKTER SIF PAGI : Nama dokter shif pagi
 * 1. Nama Perawat : A01 s/d A03 (3 mesin)
 * ...
 * 
 * 🌇 SIF SIANG (7 Perawat)
 * 🩺 DOKTER SIF SIANG : nama dokter shif siang
 * 1. Nama Perawat : A01 s/d A03 (3 mesin)
 * ...
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 🏷️ TUGAS KHUSUS / PIC HARI INI:
 * SHIF PAGI
 * • *PJ Shif :* [nama]
 * • *BHP :* [nama]
 * • *Farmasi & Logistik :* [nama]
 * • *Natrium RO :* [nama]
 * • *CITO :* [nama]
 * 
 * SHIF SIANG
 * • *PJ Shif :* [nama]
 * • *BHP :* [nama]
 * • *Farmasi & Logistik :* [nama]
 * • *Natrium RO :* [nama]
 * • *CITO :* [nama]
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 🌴 Off/Cuti : nama perawat libur/cuti
 * 
 * ⚠️ Mesin Non-Aktif :
 * Pagi : C05, C06, C07, C08, D01, D02, D03, E01, E02, F01, F02, ISO 01, ISO 02, ISO 03, ISO 04
 * 
 * Siang : C05, C06, C07, C08, D01, D02, D03, E01, E02, F01, F02, ISO 01, ISO 02, ISO 03, ISO 04
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * Unit Dialisis - RS HAPPY LAND MEDICAL CENTRE YOGYAKARTA
 */
export function generateWhatsAppMessage(options: WhatsAppSummaryOptions): string {
  const {
    dateStr,
    employees,
    schedules,
    machines,
    machineAssignments,
    specialTasks,
    doctorOverridePagi,
    doctorOverrideSiang,
    kepalaRuangName,
  } = options;

  const dateObj = new Date(dateStr + 'T00:00:00');
  const formattedDate = new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(dateObj);

  // Active employees and clinical staff
  const activeEmployees = employees.filter((e) => e.status === 'aktif');
  const clinicalStaff = activeEmployees.filter(
    (e) => e.role === 'perawat' || e.role === 'pj_shift' || e.role === 'kepala_ruangan'
  );

  // Kepala Ruang recipient resolution
  const kepalaRuang = activeEmployees.find((e) => e.role === 'kepala_ruangan');
  let targetKaruTitle = kepalaRuangName?.trim() || kepalaRuang?.name?.trim() || 'TWIS FERTILIANTI P W';
  if (targetKaruTitle === 'Kepala Ruang HD' || targetKaruTitle === 'Karu') {
    targetKaruTitle = 'TWIS FERTILIANTI P W';
  }

  // Helper to check if employee has active machine allocations on a shift
  const hasShiftAssignments = (empId: string, shift: 'pagi' | 'siang') => {
    return machineAssignments.some(
      (a) => a.date === dateStr && a.shift === shift && a.nurseId === empId && !a.isOff
    );
  };

  // Filter staff on duty per shift:
  // - Perawat & PJ Shift yang berdinas pada shif tersebut
  // - Kepala Ruang jika memegang alokasi mesin pada shif tersebut
  const rawPagiNurses = clinicalStaff.filter((n) => {
    const eff = getEffectiveShiftForEmployee(n, dateStr, schedules, employees);
    if (eff === 'pagi') {
      if (n.role === 'kepala_ruangan') {
        return hasShiftAssignments(n.id, 'pagi');
      }
      return true;
    }
    return hasShiftAssignments(n.id, 'pagi');
  });

  const rawSiangNurses = clinicalStaff.filter((n) => {
    const eff = getEffectiveShiftForEmployee(n, dateStr, schedules, employees);
    if (eff === 'siang') {
      if (n.role === 'kepala_ruangan') {
        return hasShiftAssignments(n.id, 'siang');
      }
      return true;
    }
    return hasShiftAssignments(n.id, 'siang');
  });

  // Urutan BUKAN berdasarkan hierarki perawat tapi BERDASARKAN URUTAN ALOKASI MESIN (A01-A12 -> C01-B04 -> B05-C08 -> D -> E -> F -> ISO)
  const pagiNurses = sortNursesByMachineAllocationOrder(
    rawPagiNurses,
    machineAssignments,
    machines,
    dateStr,
    'pagi'
  );
  const siangNurses = sortNursesByMachineAllocationOrder(
    rawSiangNurses,
    machineAssignments,
    machines,
    dateStr,
    'siang'
  );

  // Doctors per shift
  const doctors = activeEmployees.filter((e) => e.role === 'dokter');

  const scheduledDoctorPagi = doctors.find((d) => {
    const sch = schedules.find((s) => s.employeeId === d.id && s.date === dateStr);
    return sch?.shift === 'pagi' || sch?.shift === 'pagi_siang';
  });
  const scheduledDoctorSiang = doctors.find((d) => {
    const sch = schedules.find((s) => s.employeeId === d.id && s.date === dateStr);
    return sch?.shift === 'siang' || sch?.shift === 'pagi_siang';
  });

  const finalDoctorPagi = doctorOverridePagi !== undefined && doctorOverridePagi.trim() !== ''
    ? doctorOverridePagi.trim()
    : scheduledDoctorPagi?.name || 'dr. Reza Rizki Ramadhan';

  const finalDoctorSiang = doctorOverrideSiang !== undefined && doctorOverrideSiang.trim() !== ''
    ? doctorOverrideSiang.trim()
    : scheduledDoctorSiang?.name || 'dr. Paramitha Kusumadewi';

  // Helper to get assigned machines for a nurse on a shift
  const getNurseMachines = (nurseId: string, shift: 'pagi' | 'siang'): string[] => {
    return machineAssignments
      .filter(
        (a) => a.date === dateStr && a.shift === shift && a.nurseId === nurseId && !a.isOff
      )
      .map((a) => {
        const m = machines.find((mach) => mach.id === a.machineId);
        return m ? m.code : a.machineId;
      });
  };

  // Build Sif Pagi lines
  const pagiLines: string[] = [];
  pagiNurses.forEach((nurse, index) => {
    const assignedMachines = getNurseMachines(nurse.id, 'pagi');
    const allocationStr = formatMachineAllocation(assignedMachines);
    pagiLines.push(`${index + 1}. ${nurse.name} : ${allocationStr}`);
  });

  // Build Sif Siang lines
  const siangLines: string[] = [];
  siangNurses.forEach((nurse, index) => {
    const assignedMachines = getNurseMachines(nurse.id, 'siang');
    const allocationStr = formatMachineAllocation(assignedMachines);
    siangLines.push(`${index + 1}. ${nurse.name} : ${allocationStr}`);
  });

  // Special Tasks / PIC Resolution
  const resolveDutyHolder = (
    category: SpecialTaskCategory,
    shift: 'pagi' | 'siang',
    shiftNurses: UserAccount[]
  ): string => {
    // 1. Check specialTasks array
    const matchingTasks = specialTasks.filter(
      (t) => t.date === dateStr && t.shift === shift && t.category === category
    );
    const assignedNames = matchingTasks
      .map((t) => {
        const emp = employees.find((e) => e.id === t.assignedToId);
        return emp ? emp.name.toUpperCase() : t.assignedToId;
      })
      .filter(Boolean);

    // 2. Check nurse specialDuty string field
    if (assignedNames.length === 0) {
      shiftNurses.forEach((n) => {
        const duty = (n.specialDuty || '').toUpperCase();
        if (
          (category === 'pj_shift' && duty.includes('PJ SHIFT')) ||
          (category === 'bhp' && duty.includes('BHP')) ||
          (category === 'farmasi_logistik' && (duty.includes('FARMASI') || duty.includes('LOGISTIK'))) ||
          (category === 'natrium_ro' && (duty.includes('NATRIUM') || duty.includes('RO'))) ||
          (category === 'cito' && duty.includes('CITO'))
        ) {
          assignedNames.push(n.name.toUpperCase());
        }
      });
    }

    const uniqueNames = Array.from(new Set(assignedNames));
    return uniqueNames.length > 0 ? ` ${uniqueNames.join(' + ')}` : '';
  };

  const tasksPagi = {
    pj_shift: resolveDutyHolder('pj_shift', 'pagi', pagiNurses),
    bhp: resolveDutyHolder('bhp', 'pagi', pagiNurses),
    farmasi_logistik: resolveDutyHolder('farmasi_logistik', 'pagi', pagiNurses),
    natrium_ro: resolveDutyHolder('natrium_ro', 'pagi', pagiNurses),
    cito: resolveDutyHolder('cito', 'pagi', pagiNurses),
  };

  const tasksSiang = {
    pj_shift: resolveDutyHolder('pj_shift', 'siang', siangNurses),
    bhp: resolveDutyHolder('bhp', 'siang', siangNurses),
    farmasi_logistik: resolveDutyHolder('farmasi_logistik', 'siang', siangNurses),
    natrium_ro: resolveDutyHolder('natrium_ro', 'siang', siangNurses),
    cito: resolveDutyHolder('cito', 'siang', siangNurses),
  };

  // Off / Cuti
  const offEmployees = activeEmployees.filter((e) => {
    if (e.role === 'dokter' || e.role === 'admin') return false;
    const eff = getEffectiveShiftForEmployee(e, dateStr, schedules, employees);
    return eff === 'libur' || eff === 'cuti' || eff === 'izin' || eff === 'sakit';
  });

  const offNames = offEmployees.map((e) => e.name.toUpperCase());
  const offCutiText = offNames.length > 0 ? offNames.join(', ') : '-';

  // Inactive machines (machines not actively assigned to any nurse on duty on that shift)
  const getInactiveMachines = (shift: 'pagi' | 'siang'): string => {
    const activeAssignments = machineAssignments.filter(
      (a) => a.date === dateStr && a.shift === shift && !a.isOff && Boolean(a.nurseId)
    );
    const activeMachineIds = new Set(activeAssignments.map((a) => a.machineId));

    const inactiveList = machines.filter(
      (m) =>
        !activeMachineIds.has(m.id) ||
        m.status === 'maintenance' ||
        m.status === 'perbaikan' ||
        m.status === 'RUSAK' ||
        m.status === 'TIDAK_DIGUNAKAN'
    );

    if (inactiveList.length === 0) {
      return '-';
    }

    const sorted = [...inactiveList].sort(
      (a, b) => getMachineSortOrder(a.code) - getMachineSortOrder(b.code)
    );

    return sorted.map((m) => m.code).join(', ');
  };

  const inactivePagi = getInactiveMachines('pagi');
  const inactiveSiang = getInactiveMachines('siang');

  // Assemble full message exactly matching the requested format
  const parts: string[] = [
    '📋 RINGKASAN JADWAL & ALOKASI MESIN HD',
    '🏥 RS Happy Land Medical Centre • Ruang Dialisis Gedung Timur Lt.3',
    `📅 ${formattedDate}`,
    `Kepada Yth. ${targetKaruTitle}`,
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    `🌅 SIF PAGI (${pagiNurses.length} Perawat)`,
    `🩺 DOKTER SIF PAGI : ${finalDoctorPagi}`,
    ...(pagiLines.length > 0 ? pagiLines : ['(Belum ada perawat dinas pagi)']),
    '',
    `🌇 SIF SIANG (${siangNurses.length} Perawat)`,
    `🩺 DOKTER SIF SIANG : ${finalDoctorSiang}`,
    ...(siangLines.length > 0 ? siangLines : ['(Belum ada perawat dinas siang)']),
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '🏷️ TUGAS KHUSUS / PIC HARI INI:',
    'SHIF PAGI',
    `• *PJ Shif :*${tasksPagi.pj_shift}`,
    `• *BHP :*${tasksPagi.bhp}`,
    `• *Farmasi & Logistik :*${tasksPagi.farmasi_logistik}`,
    `• *Natrium RO :*${tasksPagi.natrium_ro}`,
    `• *CITO :*${tasksPagi.cito}`,
    '',
    'SHIF SIANG',
    `• *PJ Shif :*${tasksSiang.pj_shift}`,
    `• *BHP :*${tasksSiang.bhp}`,
    `• *Farmasi & Logistik :*${tasksSiang.farmasi_logistik}`,
    `• *Natrium RO :*${tasksSiang.natrium_ro}`,
    `• *CITO :*${tasksSiang.cito}`,
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    `🌴 Off/Cuti : ${offCutiText}`,
    '',
    '⚠️ Mesin Non-Aktif :',
    `Pagi : ${inactivePagi}`,
    '',
    `Siang : ${inactiveSiang}`,
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    'Unit Dialisis - RS HAPPY LAND MEDICAL CENTRE YOGYAKARTA',
  ];

  return parts.join('\n');
}

/**
 * Formats clean international phone number for WhatsApp link:
 * - "0812-3456-7890" -> "6281234567890"
 * - "+6281234567890" -> "6281234567890"
 * - "81234567890" -> "6281234567890"
 */
export function formatPhoneNumberForWhatsApp(phone?: string | null): string {
  if (!phone) return '';
  let cleaned = String(phone).trim().replace(/[^0-9+]/g, '');
  if (!cleaned) return '';

  if (cleaned.startsWith('+62')) {
    cleaned = cleaned.substring(1);
  } else if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1);
  } else if (cleaned.startsWith('0')) {
    cleaned = '62' + cleaned.substring(1);
  } else if (cleaned.startsWith('8')) {
    cleaned = '62' + cleaned;
  } else if (!cleaned.startsWith('62')) {
    cleaned = '62' + cleaned;
  }

  // Indonesian phone numbers must have at least 9 digits (6281...)
  if (cleaned.length < 9) {
    return '';
  }
  return cleaned;
}

/**
 * Builds standard WhatsApp direct launch URL (api.whatsapp.com/send)
 * Works universally on Android, iOS, and PC.
 */
export function buildWhatsAppUrl(phone?: string | null, message: string = ''): string {
  const cleanPhone = formatPhoneNumberForWhatsApp(phone);
  const encodedText = encodeURIComponent(message);
  if (cleanPhone) {
    return `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedText}`;
  }
  return `https://api.whatsapp.com/send?text=${encodedText}`;
}

/**
 * Builds WhatsApp Web direct URL (web.whatsapp.com/send)
 * Specifically optimized for Desktop / Laptop browsers.
 */
export function buildWhatsAppWebUrl(phone?: string | null, message: string = ''): string {
  const cleanPhone = formatPhoneNumberForWhatsApp(phone);
  const encodedText = encodeURIComponent(message);
  if (cleanPhone) {
    return `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodedText}`;
  }
  return `https://web.whatsapp.com/send?text=${encodedText}`;
}

/**
 * Safely copies text to clipboard with multi-tier browser compatibility.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // continue to fallback
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '-9999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textarea);
    return successful;
  } catch {
    return false;
  }
}

/**
 * Safely opens WhatsApp ensuring popup blockers do not silently drop the action.
 * Also copies the message text to clipboard as a safety net.
 */
export function safeOpenWhatsApp(
  url: string,
  message: string
): { opened: boolean; url: string } {
  // Always copy message to clipboard first
  copyTextToClipboard(message).catch(() => {});

  let opened = false;
  try {
    const win = window.open(url, '_blank', 'noopener,noreferrer');
    if (win && !win.closed && typeof win.closed !== 'undefined') {
      opened = true;
    }
  } catch {
    opened = false;
  }

  // If window.open was blocked or rejected in iframe/browser, fallback to anchor tag click
  if (!opened) {
    try {
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        try {
          if (document.body.contains(a)) document.body.removeChild(a);
        } catch {}
      }, 500);
      opened = true;
    } catch {
      opened = false;
    }
  }

  return { opened, url };
}

