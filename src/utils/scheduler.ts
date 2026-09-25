import { UserAccount, ShiftSchedule, HDMachine, MachineAssignment, ShiftType, Nurse, Machine } from '../types';
import { FairSchedulerEngine } from '../domain/FairSchedulerEngine';

export function getDaysInMonth(year: number, month: number): { date: Date; dateStr: string; dayOfWeek: number; dayName: string; isSunday: boolean }[] {
  // month is 0-indexed (0 = Jan, 8 = Sep)
  const date = new Date(year, month, 1);
  const days = [];
  const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

  while (date.getMonth() === month) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;
    const dayOfWeek = date.getDay();

    days.push({
      date: new Date(date),
      dateStr,
      dayOfWeek,
      dayName: dayNames[dayOfWeek],
      isSunday: dayOfWeek === 0,
    });

    date.setDate(date.getDate() + 1);
  }

  return days;
}

/**
 * Return current active date formatted as YYYY-MM-DD
 */
export function getTodayDateString(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Generate monthly schedule adhering strictly to operational rules:
 * 1. HARI MINGGU: Selalu LIBUR untuk semua staf (Kepala Ruang, Perawat).
 * 2. KEPALA RUANG: Selalu SHIFT PAGI setiap hari Senin - Sabtu.
 * 3. DOKTER: Diinput secara MANUAL (1 dokter bisa bertugas 2 shif Pagi & Siang).
 * 4. GENERATE HANYA UNTUK PERAWAT:
 *    - Proporsi: Jumlah perawat shift pagi LEBIH SEDIKIT daripada shift siang (Pagi < Siang).
 *    - Keseimbangan Beban Kerja (Fair & Balanced): Jumlah total shif Pagi & Siang dibagi merata.
 *    - Anti-Kelelahan: DILARANG membuat pola selang-seling harian P-S-P-S-P-S.
 *    - Menggunakan sistem blok shift (2-3 hari berturut-turut pada shift yang sama) dan
 *      mencegah transisi langsung Siang -> Pagi (S -> P) tanpa hari libur/Minggu agar durasi istirahat cukup.
 */
/**
 * Valid weekly block patterns for full 6 working days (Senin s/d Sabtu).
 * Setiap pola menjamin:
 * 1. BUKAN P S P S P S L (tidak ada selang-seling 1 harian)
 * 2. BUKAN S P S P S P L (tidak ada selang-seling 1 harian)
 * 3. BUKAN P P P P P P L (memiliki minimal 2 shift siang)
 * 4. BUKAN S S S S S S L (memiliki minimal 2 shift pagi)
 * 5. Menggunakan blok shift (minimal 2 hari berurutan pada shift yang sama)
 */
const VALID_6DAY_PATTERNS: ShiftType[][] = [
  // 3 Pagi, 3 Siang (Keseimbangan 50:50)
  ['pagi', 'pagi', 'pagi', 'siang', 'siang', 'siang'], // Pola 0: Mon-Wed P, Thu-Sat S
  ['siang', 'siang', 'siang', 'pagi', 'pagi', 'pagi'], // Pola 1: Mon-Wed S, Thu-Sat P
  
  // 2 Pagi, 4 Siang (Sesuai rasio perawat Pagi < Siang)
  ['pagi', 'pagi', 'siang', 'siang', 'siang', 'siang'], // Pola 2: Mon-Tue P, Wed-Sat S
  ['siang', 'siang', 'pagi', 'pagi', 'siang', 'siang'], // Pola 3: Mon-Tue S, Wed-Thu P, Fri-Sat S
  ['siang', 'siang', 'siang', 'siang', 'pagi', 'pagi'], // Pola 4: Mon-Thu S, Fri-Sat P

  // 4 Pagi, 2 Siang
  ['pagi', 'pagi', 'pagi', 'pagi', 'siang', 'siang'], // Pola 5: Mon-Thu P, Fri-Sat S
  ['siang', 'siang', 'pagi', 'pagi', 'pagi', 'pagi'], // Pola 6: Mon-Tue S, Wed-Sat P
  ['pagi', 'pagi', 'siang', 'siang', 'pagi', 'pagi'], // Pola 7: Mon-Tue P, Wed-Thu S, Fri-Sat P
];

/**
 * Valid block patterns for partial weeks (1 to 5 working days)
 */
function getValidPartialPatterns(numDays: number): ShiftType[][] {
  switch (numDays) {
    case 5:
      return [
        ['pagi', 'pagi', 'pagi', 'siang', 'siang'],
        ['siang', 'siang', 'pagi', 'pagi', 'pagi'],
        ['pagi', 'pagi', 'siang', 'siang', 'siang'],
        ['siang', 'siang', 'siang', 'pagi', 'pagi'],
        ['siang', 'siang', 'pagi', 'pagi', 'siang'],
      ];
    case 4:
      return [
        ['pagi', 'pagi', 'siang', 'siang'],
        ['siang', 'siang', 'pagi', 'pagi'],
        ['pagi', 'pagi', 'pagi', 'siang'],
        ['siang', 'siang', 'siang', 'pagi'],
      ];
    case 3:
      return [
        ['pagi', 'pagi', 'siang'],
        ['siang', 'siang', 'pagi'],
        ['pagi', 'siang', 'siang'],
        ['siang', 'pagi', 'pagi'],
      ];
    case 2:
      return [
        ['pagi', 'pagi'],
        ['siang', 'siang'],
        ['pagi', 'siang'],
        ['siang', 'pagi'],
      ];
    case 1:
      return [
        ['pagi'],
        ['siang'],
      ];
    default:
      return [];
  }
}

/**
 * Validates whether a weekly sequence of 6 working days (Mon-Sat) matches any of the 4 forbidden patterns.
 */
export function isForbiddenWeeklySequence(shifts: ShiftType[]): { isForbidden: boolean; reason?: string } {
  if (shifts.length < 6) return { isForbidden: false };
  const s = shifts.slice(0, 6);

  // 1. P S P S P S
  if (
    s[0] === 'pagi' && s[1] === 'siang' &&
    s[2] === 'pagi' && s[3] === 'siang' &&
    s[4] === 'pagi' && s[5] === 'siang'
  ) {
    return { isForbidden: true, reason: 'P S P S P S L (Selang-seling harian P-S)' };
  }

  // 2. S P S P S P
  if (
    s[0] === 'siang' && s[1] === 'pagi' &&
    s[2] === 'siang' && s[3] === 'pagi' &&
    s[4] === 'siang' && s[5] === 'pagi'
  ) {
    return { isForbidden: true, reason: 'S P S P S P L (Selang-seling harian S-P)' };
  }

  // 3. P P P P P P
  if (s.every((x) => x === 'pagi')) {
    return { isForbidden: true, reason: 'P P P P P P L (Monoton Pagi penuh tanpa Siang)' };
  }

  // 4. S S S S S S
  if (s.every((x) => x === 'siang')) {
    return { isForbidden: true, reason: 'S S S S S S L (Monoton Siang penuh tanpa Pagi)' };
  }

  return { isForbidden: false };
}

/**
 * Generate monthly schedule adhering strictly to operational rules:
 * 1. HARI MINGGU: Selalu LIBUR ('L') untuk seluruh staf (Kepala Ruang, Perawat).
 * 2. KEPALA RUANG: Selalu SHIFT PAGI ('P') setiap hari Senin s/d Sabtu.
 * 3. DOKTER: Diinput secara MANUAL (1 dokter bisa bertugas 2 shif Pagi & Siang).
 * 4. GENERATE PERAWAT DENGAN POLA BLOK BEBAS KELELAHAN:
 *    - Proporsi: Jumlah perawat shift pagi LEBIH SEDIKIT daripada shift siang (Pagi < Siang).
 *    - Keseimbangan Beban Kerja (Fair & Balanced): Total shif Pagi & Siang terbagi adil merata.
 *    - ATURAN KETAT MINGGUAN:
 *      1. Dalam satu minggu DILARANG: P S P S P S L
 *      2. Dalam satu minggu DILARANG: S P S P S P L
 *      3. Dalam satu minggu DILARANG: P P P P P P L
 *      4. Dalam satu minggu DILARANG: S S S S S S L
 *    - Menggunakan sistem blok shift teratur (kombinasi 2-4 hari berturut-turut pada shift yang sama).
 */
export function generateMonthlySchedule(
  year: number,
  month: number, // 0-indexed (0 = Jan, 8 = Sep)
  employees: UserAccount[],
  preserveCustomOverrides = false,
  existingSchedules: ShiftSchedule[] = [],
  machines?: HDMachine[]
): ShiftSchedule[] {
  const result = generateFairMonthlyScheduleAndMachines(
    year,
    month,
    employees,
    machines || [],
    preserveCustomOverrides,
    existingSchedules,
    []
  );
  return result.schedules;
}

/**
 * Generates both monthly shift schedules AND machine assignments fairly using FairSchedulerEngine from hdhlmc repository:
 * 1. Seluruh staff bekerja Senin - Sabtu (6 hari kerja).
 * 2. Libur HANYA pada hari Minggu (seluruh staff LIBUR).
 * 3. Kepala Ruang (KARU): Setiap hari kerja (Senin - Sabtu) selalu sif PAGI.
 * 4. KATIM: Terdistribusi adil di kedua sif (Pagi & Siang) setiap hari & seimbang ~50:50 sebulan.
 * 5. PELAKSANA: Terdistribusi adil di kedua sif dengan keseimbangan skill level & ~50:50 sebulan.
 * 6. Mesin: Alokasi mesin dilakukan secara adil dan merata, rotasi beban 4-mesin & isolasi.
 * 7. Dokter: Terintegrasi dengan jadwal jaga harian (Pagi & Siang) dan libur Minggu.
 */
export function generateFairMonthlyScheduleAndMachines(
  year: number,
  month: number, // 0-indexed
  employees: UserAccount[],
  machines: HDMachine[],
  preserveCustomOverrides = false,
  existingSchedules: ShiftSchedule[] = [],
  existingAssignments: MachineAssignment[] = []
): {
  schedules: ShiftSchedule[];
  machineAssignments: MachineAssignment[];
} {
  const days = getDaysInMonth(year, month);
  const monthPrefix = `${year}-${String(month + 1).padStart(2, "0")}`;

  const overrideMap = new Map<string, ShiftSchedule>();
  if (preserveCustomOverrides) {
    existingSchedules.forEach((sch) => {
      if (sch.isCustomOverride && sch.date.startsWith(monthPrefix)) {
        overrideMap.set(`${sch.employeeId}_${sch.date}`, sch);
      }
    });
  }

  const activeEmployees = employees.filter((e) => e.status === "aktif");
  const nurseEmployees = activeEmployees.filter((e) => e.role !== "dokter");
  const doctorEmployees = activeEmployees.filter((e) => e.role === "dokter");

  // Convert to domain Nurse[]
  const domainNurses: Nurse[] = nurseEmployees.map((e, idx) => ({
    id: idx + 1,
    name: e.name,
    nip: e.nip,
    phone: e.phone,
    role: e.role === "kepala_ruangan" ? "KARU" : e.role === "pj_shift" ? "KATIM" : "PELAKSANA",
    isActive: true,
    skillLevel: e.skillLevel || "Senior",
    specialDuty: e.specialDuty || null,
  }));

  // Convert to domain Machine[]
  const domainMachines: Machine[] = (machines && machines.length > 0 ? machines : []).map((m, idx) => ({
    id: idx + 1,
    code: m.code,
    name: m.name || `Mesin HD ${m.code}`,
    brandModel: (m as any).brandModel || (m as any).model || 'Nipro / Fresenius',
    category: ((m as any).category || 'REGULER') as any,
    bay: m.bay || m.zone || 'Bay A',
    status: (m.status === 'siap' || m.status === 'dipakai' || m.status === 'AKTIF') ? 'AKTIF' : 'MAINTENANCE',
    isIsolation: Boolean((m as any).isIsolation || m.bay?.toLowerCase().includes('isolasi')),
  }));

  // Execute FairSchedulerEngine (month is 1-indexed in FairSchedulerEngine)
  const domainAssignments = FairSchedulerEngine.generateMonthlySchedule(
    year,
    month + 1,
    domainNurses,
    domainMachines,
    Date.now()
  );

  const nurseMapById = new Map<number, UserAccount>();
  domainNurses.forEach((dn, idx) => {
    nurseMapById.set(dn.id, nurseEmployees[idx]);
  });

  const machineMapById = new Map<number, HDMachine>();
  domainMachines.forEach((dm, idx) => {
    machineMapById.set(dm.id, machines[idx]);
  });

  const newSchedules: ShiftSchedule[] = [];
  const newMachineAssignments: MachineAssignment[] = [];

  // Map generated nurse assignments
  domainAssignments.forEach((asg) => {
    const emp = nurseMapById.get(Number(asg.nurseId));
    if (!emp) return;

    const key = `${emp.id}_${asg.date}`;
    if (preserveCustomOverrides && overrideMap.has(key)) {
      newSchedules.push(overrideMap.get(key)!);
    } else {
      const st: ShiftType = asg.shiftType === 'PAGI' ? 'pagi' : asg.shiftType === 'SIANG' ? 'siang' : 'libur';
      newSchedules.push({
        id: key,
        employeeId: emp.id,
        date: asg.date,
        shift: st,
        note: asg.notes || (asg.specialDuty ? `Tugas: ${asg.specialDuty}` : undefined),
        isCustomOverride: false,
      });
    }

    // Assign machines for this nurse on this date and shift
    if (asg.shiftType === 'PAGI' || asg.shiftType === 'SIANG') {
      const shiftSlot: 'pagi' | 'siang' = asg.shiftType === 'PAGI' ? 'pagi' : 'siang';
      (asg.assignedMachineIds || []).forEach((mId) => {
        const mach = machineMapById.get(Number(mId));
        if (mach) {
          newMachineAssignments.push({
            id: `${asg.date}_${shiftSlot}_${mach.id}`,
            date: asg.date,
            shift: shiftSlot,
            machineId: mach.id,
            nurseId: emp.id,
            targetUF: "2.5 L",
            dialyzerType: "Hi-Flux F7HPS",
          });
        }
      });
    }
  });

  // Doctor assignments: Senin - Sabtu (Pagi: DPJP, Siang: Dokter Jaga), Minggu: Libur
  days.forEach((day) => {
    doctorEmployees.forEach((doc, docIdx) => {
      const key = `${doc.id}_${day.dateStr}`;
      const existing = existingSchedules.find(
        (s) => (s.id === key || (s.employeeId === doc.id && s.date === day.dateStr)) && s.date.startsWith(monthPrefix)
      );

      if (preserveCustomOverrides && existing?.isCustomOverride) {
        newSchedules.push(existing);
        return;
      }

      if (existing) {
        newSchedules.push(existing);
        return;
      }

      if (day.isSunday) {
        newSchedules.push({
          id: key,
          employeeId: doc.id,
          date: day.dateStr,
          shift: "libur",
          note: "Libur Rutin Hari Minggu (Unit HD Tutup)",
        });
      } else {
        const isPagi = docIdx === 0;
        newSchedules.push({
          id: key,
          employeeId: doc.id,
          date: day.dateStr,
          shift: isPagi ? "pagi" : "siang",
          note: isPagi ? "Dokter Penanggung Jawab HD (Pagi)" : "Dokter Jaga HD (Siang)",
        });
      }
    });
  });

  return {
    schedules: newSchedules,
    machineAssignments: newMachineAssignments,
  };
}

/**
 * Urutan Resmi Plotingan Mesin Hemodialisis (Sesuai Denah Fisik & Alur Klinis RS Happy Land):
 * 1. A01 sd A12 (Deretan tunggal sisi A menghadap lorong utama)
 * 2. C01 sd B04 (Lorong tengah sisi dalam: C01-C04 lalu B01-B04)
 * 3. B05 sd C08 (Lorong sisi dinding barat: B05-B09 lalu C05-C08)
 * 4. Area D (D01, D02, D03)
 * 5. Area E (E01, E02)
 * 6. Area F (F01, F02)
 * 7. Ruang Isolasi (ISO 01, ISO 02, ISO 03, ISO 04)
 */
export const CLINICAL_MACHINE_ORDER: string[] = [
  // 1. A01 sd A12
  'A01', 'A02', 'A03', 'A04', 'A05', 'A06', 'A07', 'A08', 'A09', 'A10', 'A11', 'A12',
  // 2. C01 sd B04 (Lorong tengah sisi dalam)
  'C01', 'C02', 'C03', 'C04', 'B01', 'B02', 'B03', 'B04',
  // 3. B05 sd C08 (Lorong sisi dinding barat)
  'B05', 'B06', 'B07', 'B08', 'B09', 'C05', 'C06', 'C07', 'C08',
  // 4. Area D
  'D01', 'D02', 'D03',
  // 5. Area E
  'E01', 'E02',
  // 6. Area F
  'F01', 'F02',
  // 7. Ruang Isolasi
  'ISO 01', 'ISO 02', 'ISO 03', 'ISO 04',
];

export function normalizeMachineCode(code: string): string {
  if (!code) return '';
  const cleaned = code.trim().toUpperCase();
  const isoMatch = cleaned.match(/^ISO\s*(\d+)$/);
  if (isoMatch) {
    return `ISO ${isoMatch[1].padStart(2, '0')}`;
  }
  const letterMatch = cleaned.match(/^([A-F])\s*(\d+)$/);
  if (letterMatch) {
    return `${letterMatch[1]}${letterMatch[2].padStart(2, '0')}`;
  }
  return cleaned;
}

export function getMachineSortOrder(code: string): number {
  const norm = normalizeMachineCode(code);
  const idx = CLINICAL_MACHINE_ORDER.findIndex(
    (c) => c === norm || c.replace(/\s+/g, '') === norm.replace(/\s+/g, '')
  );
  return idx !== -1 ? idx : 999;
}

/**
 * Auto-assign available operational machines to nurses on duty for a specific date and shift.
 * Aturan Plotingan:
 * 1. Plotingan berurutan sesuai urutan mesin:
 *    A01 sd A12 -> C01 sd B04 -> B05 sd C08 -> Area D -> Area E -> Area F -> Isolasi.
 * 2. Mesin non-aktif (isOff / pemeliharaan) dilewati dan dipertahankan statusnya.
 * 3. Jika ada perawat dengan tugas CITO, mesin isolasi (ISO 01 s/d ISO 04) dialokasikan khusus ke perawat CITO.
 *    Mesin reguler sisanya dibagi secara berurutan dalam blok bersambung (contiguous block) kepada perawat lainnya.
 * 4. Jika tidak ada tugas CITO, seluruh mesin aktif dibagi secara berurutan dalam blok bersambung kepada seluruh staf bertugas (termasuk Karu/PJ Shift).
 */
export function autoAssignMachinesForShift(
  date: string,
  shift: 'pagi' | 'siang',
  nursesOnDuty: UserAccount[],
  machines: HDMachine[],
  existingAssignments: MachineAssignment[] = [],
  specialTasksOnDuty: { nurseId: string; category: string }[] = [],
  randomize: boolean = true
): MachineAssignment[] {
  if (machines.length === 0) {
    return [];
  }

  // Create a map of machine isOff status for this shift from existing assignments
  const offMachineMap = new Map<string, { isOff: boolean; offReason?: string }>();
  existingAssignments
    .filter((a) => a.date === date && a.shift === shift)
    .forEach((a) => {
      if (a.isOff) {
        offMachineMap.set(a.machineId, { isOff: true, offReason: a.offReason });
      }
    });

  // Find nurse(s) assigned to CITO task on this shift
  const citoNurseIds = new Set(
    specialTasksOnDuty
      .filter((t) => t.category === 'cito')
      .map((t) => t.nurseId)
  );

  // Find if any of the nurses on duty has CITO
  const citoNurse = nursesOnDuty.find((n) => citoNurseIds.has(n.id));

  // Urutkan semua mesin secara ketat sesuai alur klinis & denah fisik:
  // A01 s/d A12 -> C01 s/d B04 -> B05 s/d C08 -> Area D -> Area E -> Area F -> Isolasi
  const sortedMachines = [...machines].sort(
    (a, b) => getMachineSortOrder(a.code) - getMachineSortOrder(b.code)
  );

  // Pisahkan mesin aktif (bukan maintenance & bukan OFF)
  const activeIsolationMachines: HDMachine[] = [];
  const activeRegularMachines: HDMachine[] = [];

  sortedMachines.forEach((m) => {
    // Lewati mesin yang dalam status maintenance / perbaikan
    if (m.status === 'maintenance' || m.status === 'perbaikan') return;

    // Lewati mesin yang dimatikan (isOff) pada shift ini
    const offInfo = offMachineMap.get(m.id);
    if (offInfo?.isOff) return;

    const isIsolation =
      m.zone.toLowerCase().includes('isolasi') ||
      m.zone.includes('HBsAg') ||
      m.zone.includes('HCV') ||
      normalizeMachineCode(m.code).startsWith('ISO');

    if (isIsolation) {
      activeIsolationMachines.push(m);
    } else {
      activeRegularMachines.push(m);
    }
  });

  // Helper untuk membagi mesin ke dalam blok-blok bersambung (contiguous) secara adil & merata
  const partitionIntoContiguousClusters = (
    machinesList: HDMachine[],
    numClusters: number
  ): HDMachine[][] => {
    if (numClusters <= 0 || machinesList.length === 0) return [];
    const total = machinesList.length;
    const baseCount = Math.floor(total / numClusters);
    const remainder = total % numClusters;

    const clusters: HDMachine[][] = [];
    let currentIndex = 0;
    for (let i = 0; i < numClusters; i++) {
      const clusterSize = baseCount + (i < remainder ? 1 : 0);
      clusters.push(machinesList.slice(currentIndex, currentIndex + clusterSize));
      currentIndex += clusterSize;
    }
    return clusters;
  };

  // Helper untuk mengacak perawat dengan adil (Fisher-Yates) dan menjamin rotasi bila diklik ulang
  const shuffleNurses = (nursesList: UserAccount[], previousFirstId?: string): UserAccount[] => {
    if (nursesList.length <= 1 || !randomize) {
      return [...nursesList];
    }
    const shuffled = [...nursesList];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // Jika diklik ulang dan urutan pertamanya sama persis dengan yang sebelumnya, rotasikan agar hasil acak selalu baru
    if (previousFirstId && shuffled[0].id === previousFirstId && shuffled.length > 1) {
      const swapIdx = 1 + Math.floor(Math.random() * (shuffled.length - 1));
      [shuffled[0], shuffled[swapIdx]] = [shuffled[swapIdx], shuffled[0]];
    }

    return shuffled;
  };

  const assignments: MachineAssignment[] = [];

  if (citoNurse) {
    // 1. HITUNG KUOTA ADIL UNTUK SEMUA PERAWAT
    // Perawat tugas khusus CITO mendapatkan mesin isolasi PLUS mesin di luar area isolasi secara adil
    const totalActiveCount = activeIsolationMachines.length + activeRegularMachines.length;
    const numNurses = nursesOnDuty.length;
    const baseQuota = Math.floor(totalActiveCount / numNurses);
    const remQuota = totalActiveCount % numNurses;

    const citoIdx = nursesOnDuty.findIndex((n) => n.id === citoNurse.id);
    const targetCitoTotal = baseQuota + (citoIdx !== -1 && citoIdx < remQuota ? 1 : 0);
    const isoCount = activeIsolationMachines.length;

    // Perawat CITO juga mendapatkan plot mesin di luar area isolasi:
    let citoRegularCount = 0;
    if (activeRegularMachines.length > 0) {
      if (isoCount === 0) {
        citoRegularCount = targetCitoTotal;
      } else {
        citoRegularCount = Math.max(1, targetCitoTotal - isoCount);
      }
      citoRegularCount = Math.min(citoRegularCount, activeRegularMachines.length);
      const otherNursesCount = nursesOnDuty.filter((n) => n.id !== citoNurse.id).length;
      if (otherNursesCount > 0 && activeRegularMachines.length <= citoRegularCount) {
        citoRegularCount = Math.max(1, activeRegularMachines.length - otherNursesCount);
      }
    }

    // 2. ALOKASIKAN MESIN ISOLASI KE PERAWAT CITO
    activeIsolationMachines.forEach((isoMach) => {
      assignments.push({
        id: `${date}_${shift}_${isoMach.id}`,
        date,
        shift,
        machineId: isoMach.id,
        nurseId: citoNurse.id,
        targetUF: '2.5 L',
        dialyzerType: 'Hi-Flux F7HPS (Isolasi)',
        notes: `Alokasi Khusus CITO & Ruang Isolasi (${citoNurse.name})`,
      });
    });

    // 3. PISAHKAN MESIN REGULER:
    // Mesin reguler paling dekat dengan Ruang Isolasi (Area F, E, D) diberikan ke perawat CITO
    const regularForOthers = activeRegularMachines.slice(
      0,
      activeRegularMachines.length - citoRegularCount
    );
    const regularForCito = activeRegularMachines.slice(
      activeRegularMachines.length - citoRegularCount
    );

    // Alokasikan mesin di luar isolasi untuk perawat CITO
    regularForCito.forEach((mach) => {
      assignments.push({
        id: `${date}_${shift}_${mach.id}`,
        date,
        shift,
        machineId: mach.id,
        nurseId: citoNurse.id,
        targetUF: '2.5 L',
        dialyzerType: 'Hi-Flux F7HPS',
        notes: `Alokasi Perawat CITO di luar Isolasi (${mach.code}) - ${citoNurse.name}`,
      });
    });

    // 4. BAGI MESIN REGULER LAINNYA DALAM BLOK BERSAMBUNG KEPADA PERAWAT BERTUGAS LAINNYA DENGAN ACAK ADIL & MERATA
    const otherNurses = nursesOnDuty.filter((n) => n.id !== citoNurse.id);
    if (otherNurses.length > 0 && regularForOthers.length > 0) {
      const clusters = partitionIntoContiguousClusters(regularForOthers, otherNurses.length);
      
      // Ambil riwayat perawat pertama sebelumnya untuk memastikan pengacakan baru
      const prevFirstOther = existingAssignments.find(
        (a) => a.date === date && a.shift === shift && a.nurseId && a.nurseId !== citoNurse.id
      )?.nurseId;

      const randomizedOtherNurses = shuffleNurses(otherNurses, prevFirstOther);

      clusters.forEach((cluster, clusterIdx) => {
        const assignedNurse = randomizedOtherNurses[clusterIdx] || randomizedOtherNurses[0];
        cluster.forEach((mach) => {
          assignments.push({
            id: `${date}_${shift}_${mach.id}`,
            date,
            shift,
            machineId: mach.id,
            nurseId: assignedNurse.id,
            targetUF: '2.5 L',
            dialyzerType: 'Hi-Flux F7HPS',
            notes: `Plotting Berurutan (${mach.code}) - ${assignedNurse.name}`,
          });
        });
      });
    } else if (otherNurses.length === 0 && regularForOthers.length > 0) {
      regularForOthers.forEach((mach) => {
        assignments.push({
          id: `${date}_${shift}_${mach.id}`,
          date,
          shift,
          machineId: mach.id,
          nurseId: citoNurse.id,
          targetUF: '2.5 L',
          dialyzerType: 'Hi-Flux F7HPS',
          notes: `Plotting Berurutan (${mach.code}) - ${citoNurse.name}`,
        });
      });
    }
  } else {
    // TIDAK ADA PERAWAT CITO:
    // Seluruh mesin aktif (A01-A12 -> C01-B04 -> B05-C08 -> Area D -> Area E -> Area F -> Isolasi)
    // dibagi ke dalam blok-blok bersambung (contiguous) lalu diacak secara adil & merata kepada staf bertugas
    const allActiveOrderedMachines = [...activeRegularMachines, ...activeIsolationMachines].sort(
      (a, b) => getMachineSortOrder(a.code) - getMachineSortOrder(b.code)
    );

    if (nursesOnDuty.length > 0 && allActiveOrderedMachines.length > 0) {
      const clusters = partitionIntoContiguousClusters(allActiveOrderedMachines, nursesOnDuty.length);

      // Ambil perawat pertama sebelumnya untuk memastikan setiap klik ulang menghasilkan variasi baru
      const prevFirstNurse = existingAssignments.find(
        (a) => a.date === date && a.shift === shift && a.nurseId
      )?.nurseId;

      const randomizedNurses = shuffleNurses(nursesOnDuty, prevFirstNurse);

      clusters.forEach((cluster, clusterIdx) => {
        const assignedNurse = randomizedNurses[clusterIdx] || randomizedNurses[0];
        cluster.forEach((mach) => {
          const isIso =
            mach.zone.toLowerCase().includes('isolasi') ||
            normalizeMachineCode(mach.code).startsWith('ISO');

          assignments.push({
            id: `${date}_${shift}_${mach.id}`,
            date,
            shift,
            machineId: mach.id,
            nurseId: assignedNurse.id,
            targetUF: '2.5 L',
            dialyzerType: isIso ? 'Hi-Flux F7HPS (Isolasi)' : 'Hi-Flux F7HPS',
            notes: isIso
              ? `Plotting Berurutan (${mach.code} Isolasi) - ${assignedNurse.name}`
              : `Plotting Berurutan (${mach.code}) - ${assignedNurse.name}`,
          });
        });
      });
    } else {
      allActiveOrderedMachines.forEach((mach) => {
        assignments.push({
          id: `${date}_${shift}_${mach.id}`,
          date,
          shift,
          machineId: mach.id,
          nurseId: undefined,
          targetUF: '2.5 L',
          dialyzerType: 'Hi-Flux F7HPS',
          notes: 'Belum ada staf dialokasikan',
        });
      });
    }
  }

  // Pertahankan mesin yang dimatikan (OFF) pada shift ini
  machines.forEach((m) => {
    const offInfo = offMachineMap.get(m.id);
    if (offInfo?.isOff) {
      assignments.push({
        id: `${date}_${shift}_${m.id}`,
        date,
        shift,
        machineId: m.id,
        isOff: true,
        offReason: offInfo.offReason || 'Dimatikan pada shift ini',
        notes: 'Mesin tidak digunakan pada shift ini (OFF)',
      });
    }
  });

  return assignments;
}

/**
 * Single source of truth to resolve effective shift of any employee for a specific date:
 * 1. Checks Matrik Jadwal (schedules) first for an explicit entry.
 * 2. If no schedule entry exists:
 *    - Sunday: 'libur'
 *    - Kepala Ruang: 'pagi' (Mon-Sat)
 *    - Dokter: 'libur' (manual input only)
 *    - Perawat: deterministic rotation matching generateMonthlySchedule (Pagi < Siang)
 */
export function getEffectiveShiftForEmployee(
  employee: UserAccount,
  dateStr: string,
  schedules: ShiftSchedule[] = [],
  allEmployees: UserAccount[] = []
): ShiftType {
  const sch = schedules.find((s) => s.employeeId === employee.id && s.date === dateStr);
  if (sch) {
    const raw = String(sch.shift || '').trim().toLowerCase();
    if (raw.includes('pagi') && raw.includes('siang')) return 'pagi_siang';
    if (raw === 'pagi' || raw === 'p') return 'pagi';
    if (raw === 'siang' || raw === 's') return 'siang';
    if (raw === 'libur' || raw === 'l' || raw === 'off') return 'libur';
    if (raw === 'cuti' || raw === 'c') return 'cuti';
    if (raw === 'izin' || raw === 'i') return 'izin';
    if (raw === 'sakit' || raw === 'skt') return 'sakit';
    return (raw as ShiftType) || 'libur';
  }

  const d = new Date(dateStr + 'T00:00:00');
  if (d.getDay() === 0) return 'libur';
  if (employee.role === 'dokter') return 'libur';
  if (employee.role === 'kepala_ruangan') return 'pagi';

  // Clinical perawat & PJ Shift fallback calculation
  const regularNurses = (allEmployees.length > 0 ? allEmployees : [employee])
    .filter((e) => (e.role === 'perawat' || e.role === 'pj_shift') && e.status === 'aktif');
  const nurseIdx = regularNurses.findIndex((n) => n.id === employee.id);
  if (nurseIdx === -1) return 'siang';

  const totalNurses = regularNurses.length;
  if (totalNurses === 0) return 'pagi';
  const morningCount = totalNurses <= 2 ? 1 : Math.floor((totalNurses - 1) / 2);
  const dayIndex = d.getDate() - 1;
  const rollingOffset = (dayIndex * morningCount) % totalNurses;
  const morningIndices = new Set<number>();
  for (let i = 0; i < morningCount; i++) {
    morningIndices.add((rollingOffset + i) % totalNurses);
  }

  return morningIndices.has(nurseIdx) ? 'pagi' : 'siang';
}

/**
 * Known hospital staff nicknames mapping (RS Happy Land Unit Hemodialisa)
 */
export const KNOWN_NURSE_NICKNAMES: Record<string, string> = {
  'emp-admin': 'Admin',
  'emp-karu': 'Twis',
  'emp-fransisca': 'Fransisca',
  'emp-rizky': 'Rizky',
  'emp-twis': 'Twis',
  'emp-annisa': 'Annisa',
  'emp-haikal': 'Haikal',
  'emp-nita': 'Nita',
  'emp-dea': 'Dea',
  'emp-siswantini': 'Siswantini',
  'emp-ayu-w': 'Ayu W',
  'emp-hari': 'Hari',
  'emp-brilli': 'Brilli',
  'emp-ayu-p': 'Ayu P',
  'emp-aprillia': 'Aprillia',
  'emp-rini': 'Rini',
  'emp-novialita': 'Novialita',
  'emp-khoirudin': 'Khoirudin',
  'emp-reni': 'Reni',
  // NIP / ID numeric aliases
  '001': 'Twis',
  '002': 'Haikal',
  '003': 'Khoirudin',
  '004': 'Rizky',
  '005': 'Aprillia',
  '006': 'Dea',
  '007': 'Novialita',
  '008': 'Brilli',
  '009': 'Annisa',
  '010': 'Siswantini',
  '011': 'Reni',
  '012': 'Hari',
  '013': 'Ayu W',
  '014': 'Fransisca',
  '015': 'Nita',
  '016': 'Rini',
  '017': 'Ayu P',
};

export const NAME_TO_NICKNAME: Record<string, string> = {
  'ADMINISTRATOR UNIT HD': 'Admin',
  'ADMIN': 'Admin',
  'TWIS FERTILIANTI PW': 'Twis',
  'TWIS FERTILIANTI P W': 'Twis',
  'FRANSISCA RANI L': 'Fransisca',
  'RIZKY WAHYU A': 'Rizky',
  'ANNISA NURFAJRI M': 'Annisa',
  'ANNISA NUR FAJRI M': 'Annisa',
  'M. HAIKAL MALILANG': 'Haikal',
  'M HAIKAL MALILANG': 'Haikal',
  'MUHAMMAD HAIKAL MALILANG': 'Haikal',
  'NITA RESTIANA P': 'Nita',
  'NITA RESTIANA': 'Nita',
  'DEA IKA P': 'Dea',
  'SISWANTINI CATUR P': 'Siswantini',
  'AYU WULANDARI': 'Ayu W',
  'HARI ENDAH C': 'Hari',
  'HARI ENDAH': 'Hari',
  'Y. BRILLISANTO': 'Brilli',
  'Y BRILLISANTO': 'Brilli',
  'AYU PUSPITA': 'Ayu P',
  'AYU PUSPITA R': 'Ayu P',
  'APRILLIA DWI N': 'Aprillia',
  'RINI WULANDARI': 'Rini',
  'NOVIALITA ARYADI': 'Novialita',
  'M NOR KHOIRUDIN': 'Khoirudin',
  'M. NOR KHOIRUDIN': 'Khoirudin',
  'RENI DWI A': 'Reni',
};

/**
 * Return only the short nickname (nama panggilan) of a nurse / staff member.
 * E.g.:
 * - "FRANSISCA RANI L" -> "Fransisca"
 * - "M. HAIKAL MALILANG" -> "Haikal"
 * - "Y. BRILLISANTO" -> "Brilli"
 * - "AYU WULANDARI" -> "Ayu W"
 * - "AYU PUSPITA R" -> "Ayu P"
 * - "KEPALA RUANG HD" -> "Karu"
 */
export function getNurseNickname(
  nurse?: UserAccount | { name: string; nickname?: string; id?: string } | string | null
): string {
  if (!nurse) return '';

  if (typeof nurse === 'string') {
    const trimmed = nurse.trim();
    if (NAME_TO_NICKNAME[trimmed.toUpperCase()]) return NAME_TO_NICKNAME[trimmed.toUpperCase()];
    const clean = trimmed.replace(/^(dr\.|ns\.|m\.|m\s+|y\.|y\s+|s\.kep)\s+/i, '');
    const parts = clean.split(/\s+/);
    return parts[0] ? parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase() : trimmed;
  }

  if (nurse.nickname && nurse.nickname.trim()) {
    return nurse.nickname.trim();
  }

  const nameUpper = (nurse.name || '').trim().toUpperCase();
  if (NAME_TO_NICKNAME[nameUpper]) {
    return NAME_TO_NICKNAME[nameUpper];
  }

  // Derive nickname from the employee's current name
  const cleanName = (nurse.name || '')
    .trim()
    .replace(/^(dr\.|ns\.|m\.|m\s+|y\.|y\s+|s\.kep)\s+/i, '');
  const words = cleanName.split(/\s+/);
  if (words.length > 0 && words[0]) {
    const first = words[0];
    return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
  }

  if (nurse.id && KNOWN_NURSE_NICKNAMES[nurse.id]) {
    return KNOWN_NURSE_NICKNAMES[nurse.id];
  }

  return nurse.name || '';
}

/**
 * Detect or retrieve gender of an employee ('L' for Laki-laki, 'P' for Perempuan).
 */
export function getEmployeeGender(emp: UserAccount | any): 'L' | 'P' {
  if (!emp) return 'P';
  if (emp.gender === 'L' || emp.gender === 'P') {
    return emp.gender;
  }
  // Check NIP (in Indonesian civil service / hospital NIP standard, character 15 is 1 for male, 2 for female)
  const nipStr = String(emp.nip || '').trim();
  if (nipStr.length >= 15) {
    const char15 = nipStr.charAt(14);
    if (char15 === '1') return 'L';
    if (char15 === '2') return 'P';
  }
  // Fallbacks by ID or Name (ensure safe string casting for numeric IDs)
  const idLower = String(emp.id || '').toLowerCase();
  const nameLower = String(emp.name || '').toLowerCase();
  if (
    idLower.includes('haikal') ||
    idLower.includes('rizky') ||
    idLower.includes('brilli') ||
    idLower.includes('khoirudin') ||
    idLower.includes('dr-reza') ||
    idLower.includes('admin') ||
    nameLower.includes('haikal') ||
    nameLower.includes('rizky') ||
    nameLower.includes('brilli') ||
    nameLower.includes('khoirudin') ||
    nameLower.includes('reza') ||
    nameLower.startsWith('m.') ||
    nameLower.startsWith('m ') ||
    nameLower.startsWith('muhammad')
  ) {
    return 'L';
  }
  return 'P';
}

/**
 * Urutan nama perawat pada Jadwal shif:
 * 1. Kepala ruang
 * 2. PJ Shif Laki-laki
 * 3. PJ Shif Perempuan
 * 4. Perawat pelaksana Laki-laki
 * 5. Perawat pelaksana perempuan
 */
export function getNurseScheduleSortPriority(emp: {
  role?: string;
  name?: string;
  gender?: 'L' | 'P' | string;
  nip?: string;
  id?: any;
}): number {
  const gender = getEmployeeGender(emp as any);
  const roleStr = String(emp.role || '').toLowerCase();

  // 1. Kepala ruang
  if (roleStr === 'kepala_ruangan' || roleStr === 'karu') {
    return 1;
  }
  // 2. PJ Shif Laki-laki
  if ((roleStr === 'pj_shift' || roleStr === 'katim') && gender === 'L') {
    return 2;
  }
  // 3. PJ Shif Perempuan
  if ((roleStr === 'pj_shift' || roleStr === 'katim') && gender === 'P') {
    return 3;
  }
  // 4. Perawat pelaksana Laki-laki
  if ((roleStr === 'perawat' || roleStr === 'pelaksana') && gender === 'L') {
    return 4;
  }
  // 5. Perawat pelaksana perempuan
  if ((roleStr === 'perawat' || roleStr === 'pelaksana') && gender === 'P') {
    return 5;
  }
  // Other roles (e.g. dokter, admin)
  if (roleStr === 'dokter') {
    return 6;
  }
  return 7;
}

/**
 * Returns canonical 1-based order index for nurses at RS Happy Land Hemodialysis Unit.
 * 1. Twis Fertilianti PW (Karu)
 * 2. M Haikal Malilang (PJ Shif - L)
 * 3. M Nor Khoirudin (PJ Shif - L)
 * 4. Rizky Wahyu A (PJ Shif - L)
 * 5. Aprillia Dwi N (PJ Shif - P)
 * 6. Dea Ika P (PJ Shif - P)
 * 7. Novialita Aryadi (PJ Shif - P)
 * 8. Y Brillisanto (Pelaksana - L)
 * 9. Annisa Nurfajri M (Pelaksana - P)
 * 10. Siswantini Catur P (Pelaksana - P)
 * 11. Reni Dwi A (Pelaksana - P)
 * 12. Hari Endah C (Pelaksana - P)
 * 13. Ayu Wulandari (Pelaksana - P)
 * 14. Fransisca Rani L (Pelaksana - P)
 * 15. Nita Restiana P (Pelaksana - P)
 * 16. Rini Wulandari (Pelaksana - P)
 * 17. Ayu Puspita (Pelaksana - P)
 */
export function getNurseScheduleSortRank(nurse: {
  id?: string | number;
  name?: string;
  nip?: string;
  role?: string;
  gender?: 'L' | 'P' | string;
}): number {
  if (!nurse) return 999;

  const nameUpper = (nurse.name || '').trim().toUpperCase();
  const idStr = String(nurse.id || '').toLowerCase();
  const nipStr = String(nurse.nip || '').trim();

  // Canonical index mapping for Unit HD RS Happy Land
  if (idStr === 'emp-twis' || nameUpper.includes('TWIS') || nipStr === '001' || nipStr === '1') return 1;
  if (idStr === 'emp-haikal' || nameUpper.includes('HAIKAL') || nipStr === '002' || nipStr === '2') return 2;
  if (idStr === 'emp-khoirudin' || nameUpper.includes('KHOIRUDIN') || nipStr === '003' || nipStr === '3') return 3;
  if (idStr === 'emp-rizky' || nameUpper.includes('RIZKY') || nipStr === '004' || nipStr === '4') return 4;
  if (idStr === 'emp-aprillia' || nameUpper.includes('APRILLIA') || nipStr === '005' || nipStr === '5') return 5;
  if (idStr === 'emp-dea' || nameUpper.includes('DEA IKA') || nipStr === '006' || nipStr === '6') return 6;
  if (idStr === 'emp-novialita' || nameUpper.includes('NOVIALITA') || nipStr === '007' || nipStr === '7') return 7;
  if (idStr === 'emp-brilli' || nameUpper.includes('BRILLI') || nipStr === '008' || nipStr === '8') return 8;
  if (idStr === 'emp-annisa' || nameUpper.includes('ANNISA') || nipStr === '009' || nipStr === '9') return 9;
  if (idStr === 'emp-siswantini' || nameUpper.includes('SISWANTINI') || nipStr === '010' || nipStr === '10') return 10;
  if (idStr === 'emp-reni' || nameUpper.includes('RENI DWI') || nipStr === '011' || nipStr === '11') return 11;
  if (idStr === 'emp-hari' || nameUpper.includes('HARI ENDAH') || nipStr === '012' || nipStr === '12') return 12;
  if (idStr === 'emp-ayu-w' || nameUpper.includes('AYU WULANDARI') || nipStr === '013' || nipStr === '13') return 13;
  if (idStr === 'emp-fransisca' || nameUpper.includes('FRANSISCA') || nipStr === '014' || nipStr === '14') return 14;
  if (idStr === 'emp-nita' || nameUpper.includes('NITA RESTIANA') || nipStr === '015' || nipStr === '15') return 15;
  if (idStr === 'emp-rini' || nameUpper.includes('RINI WULANDARI') || nipStr === '016' || nipStr === '16') return 16;
  if (idStr === 'emp-ayu-p' || nameUpper.includes('AYU PUSPITA') || nipStr === '017' || nipStr === '17') return 17;

  // Numeric NIP (1-99) fallback
  const numNip = parseInt(nipStr, 10);
  if (!isNaN(numNip) && numNip > 0 && numNip < 100) {
    return numNip;
  }

  // Priority group fallback (1: Karu, 2: PJ L, 3: PJ P, 4: Pelaksana L, 5: Pelaksana P)
  const priority = getNurseScheduleSortPriority(nurse);
  return 100 + priority * 10;
}

export function getNurseScheduleGroupInfo(emp: UserAccount): {
  groupNumber: number;
  label: string;
  badgeClass: string;
  genderLabel: string;
} {
  const priority = getNurseScheduleSortPriority(emp);
  const gender = getEmployeeGender(emp);
  const genderLabel = gender === 'L' ? 'Laki-laki' : 'Perempuan';

  switch (priority) {
    case 1:
      return {
        groupNumber: 1,
        label: 'Kepala Ruang HD',
        badgeClass: 'bg-amber-100 text-amber-800 border-amber-300',
        genderLabel,
      };
    case 2:
      return {
        groupNumber: 2,
        label: 'PJ Shif (Laki-laki)',
        badgeClass: 'bg-blue-100 text-blue-800 border-blue-300',
        genderLabel: 'Laki-laki',
      };
    case 3:
      return {
        groupNumber: 3,
        label: 'PJ Shif (Perempuan)',
        badgeClass: 'bg-pink-100 text-pink-800 border-pink-300',
        genderLabel: 'Perempuan',
      };
    case 4:
      return {
        groupNumber: 4,
        label: 'Perawat Pelaksana (L)',
        badgeClass: 'bg-sky-100 text-sky-800 border-sky-300',
        genderLabel: 'Laki-laki',
      };
    case 5:
      return {
        groupNumber: 5,
        label: 'Perawat Pelaksana (P)',
        badgeClass: 'bg-rose-100 text-rose-800 border-rose-300',
        genderLabel: 'Perempuan',
      };
    default:
      return {
        groupNumber: priority,
        label: emp.role === 'dokter' ? 'Dokter HD' : emp.role,
        badgeClass: 'bg-slate-100 text-slate-700 border-slate-300',
        genderLabel,
      };
  }
}

/**
 * Sort nurses according to the mandatory hospital matrix order:
 * 1. Kepala ruang (Twis)
 * 2. PJ Shif Laki-laki (Haikal, Khoirudin, Rizky)
 * 3. PJ Shif Perempuan (Aprillia, Dea, Novialita)
 * 4. Perawat pelaksana Laki-laki (Brilli)
 * 5. Perawat pelaksana perempuan (Annisa, Siswantini, Reni, Hari Endah, Ayu W, Fransisca, Nita, Rini, Ayu P)
 */
export function sortNursesByShiftScheduleOrder<T extends {
  id?: string | number;
  name?: string;
  nip?: string;
  role?: string;
  gender?: 'L' | 'P' | string;
}>(employees: T[]): T[] {
  return [...employees].sort((a, b) => {
    const rankA = getNurseScheduleSortRank(a);
    const rankB = getNurseScheduleSortRank(b);
    if (rankA !== rankB) {
      return rankA - rankB;
    }
    // Secondary sort: Alphabetical by Name
    return (a.name || '').localeCompare(b.name || '', 'id');
  });
}

/**
 * Mengurutkan staf/perawat dinas harian berdasarkan urutan alokasi mesin (denah ruangan fisik).
 * Urutan:
 * 1. Staf yang memiliki alokasi mesin diurutkan berdasarkan kode mesin terendah yang dipegangnya:
 *    A01-A12 -> C01-B04 -> B05-C08 -> Area D -> Area E -> Area F -> Isolasi.
 * 2. Staf tanpa alokasi mesin (atau belum diplot) ditempatkan setelah staf yang memegang mesin,
 *    diurutkan berdasarkan hierarki klinis atau abjad.
 */
export function sortNursesByMachineAllocationOrder<T extends {
  id?: string | number;
  name?: string;
  nip?: string;
  role?: string;
  gender?: 'L' | 'P' | string;
}>(
  nurses: T[],
  machineAssignments: MachineAssignment[],
  machines: HDMachine[],
  date: string,
  shift: 'pagi' | 'siang'
): T[] {
  const getMachineOrdersForNurse = (nurseId: string | number): number[] => {
    const activeAssignments = machineAssignments.filter(
      (a) => a.date === date && a.shift === shift && String(a.nurseId) === String(nurseId) && !a.isOff
    );

    if (activeAssignments.length === 0) {
      return [99999];
    }

    const orders = activeAssignments.map((asgn) => {
      const mach = machines.find((m) => m.id === asgn.machineId || String(m.id) === String(asgn.machineId));
      const code = mach ? mach.code : asgn.machineId;
      return getMachineSortOrder(code);
    });

    orders.sort((a, b) => a - b);
    return orders;
  };

  const nurseOrdersMap = new Map<string | number, number[]>();
  nurses.forEach((nurse) => {
    if (nurse.id !== undefined) {
      nurseOrdersMap.set(nurse.id, getMachineOrdersForNurse(nurse.id));
    }
  });

  return [...nurses].sort((a, b) => {
    const ordersA = a.id !== undefined ? (nurseOrdersMap.get(a.id) || [99999]) : [99999];
    const ordersB = b.id !== undefined ? (nurseOrdersMap.get(b.id) || [99999]) : [99999];

    const len = Math.max(ordersA.length, ordersB.length);
    for (let i = 0; i < len; i++) {
      const oA = ordersA[i] !== undefined ? ordersA[i] : 99999;
      const oB = ordersB[i] !== undefined ? ordersB[i] : 99999;
      if (oA !== oB) {
        return oA - oB;
      }
    }

    // Tie-breaker: if machine orders are identical or both have no machines,
    // fallback to canonical nurse rank
    const rankA = getNurseScheduleSortRank(a);
    const rankB = getNurseScheduleSortRank(b);
    if (rankA !== rankB) {
      return rankA - rankB;
    }

    return (a.name || '').localeCompare(b.name || '', 'id');
  });
}


