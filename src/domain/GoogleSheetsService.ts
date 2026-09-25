import {
  Machine,
  Nurse,
  ShiftAssignment,
  SHIFT_TYPE_INFO,
  MachineCategory,
  MachineStatus,
  NurseRole,
  Doctor,
  DoctorShiftDuty,
  SpecialDutyOption,
  DEFAULT_SPECIAL_DUTY_OPTIONS,
  parseSpecialDuties,
  formatSpecialDuties,
  SpecialTask,
  UserAccount,
  SPECIAL_TASK_DEFINITIONS,
  SpecialTaskCategory,
} from '../types';
import { sortNursesByShiftScheduleOrder } from '../utils/scheduler';

export interface PartialSyncTargets {
  matrixSchedule?: boolean;      // Matriks Jadwal Shif Perawat (Tab "Matriks HD - [Bulan]")
  doctorDuties?: boolean;        // Jadwal Jaga Dokter HD (Tab "Jadwal Dokter - [Bulan]" & "Jadwal Dokter HD")
  machineAssignments?: boolean;  // Detail Alokasi Mesin HD (Tab "Alokasi Mesin")
  specialTasks?: boolean;        // Jadwal Tugas Khusus (Tab "Jadwal Tugas Khusus")
  nursesMaster?: boolean;        // Master Data Perawat (Tab "Data Perawat")
  machinesMaster?: boolean;      // Master Mesin HD & Bay (Tab "Data Mesin" & "Daftar Bay")
  doctorsMaster?: boolean;       // Master Data Dokter (Tab "Data Dokter")
  specialDutiesMaster?: boolean; // Master Opsi Tugas Khusus (Tab "Master Tugas Khusus")
}

export const DEFAULT_PARTIAL_SYNC_TARGETS: Required<PartialSyncTargets> = {
  matrixSchedule: true,
  doctorDuties: true,
  machineAssignments: true,
  specialTasks: true,
  nursesMaster: true,
  machinesMaster: true,
  doctorsMaster: true,
  specialDutiesMaster: true,
};

export interface SyncResult {
  isSuccess: boolean;
  message: string;
  rowsSynced?: number;
}

export interface GoogleSheetsSyncAllResult {
  isSuccess: boolean;
  message: string;
  nursesCount?: number;
  machinesCount?: number;
  assignmentsCount?: number;
  doctorsCount?: number;
  doctorDutiesCount?: number;
  baysCount?: number;
  specialDutiesCount?: number;
}

export interface GoogleSheetsFetchResult {
  isSuccess: boolean;
  message: string;
  nurses: Nurse[];
  machines: Machine[];
  bays?: string[];
  assignments: ShiftAssignment[];
  doctors?: Doctor[];
  doctorDuties?: Record<string, DoctorShiftDuty>;
  specialDutyOptions?: SpecialDutyOption[];
}

export class GoogleSheetsService {
  /**
   * Generates a calendar matrix matching the Excel (.xlsx) format:
   * Columns: No, Nama Perawat, NIP, Peran, 1, 2, ..., 31, Pagi (P), Siang (S), Libur (L), Cuti (C), Sakit (SK), Total Jaga
   */
  static buildScheduleMatrix(
    monthString: string,
    nurses: Nurse[],
    assignments: ShiftAssignment[]
  ) {
    const parts = monthString.split('-');
    const year = parseInt(parts[0], 10) || new Date().getFullYear();
    const month = parseInt(parts[1], 10) || (new Date().getMonth() + 1);
    const daysInMonth = new Date(year, month, 0).getDate();

    const indonesianMonths = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];
    const monthName = indonesianMonths[month - 1] || `Bulan ${month}`;
    const formattedMonthTitle = `${monthName} ${year}`;

    const filteredNurses = nurses.filter(
      (n) => n.isActive && !n.name.toLowerCase().includes('admin') && (n as any).role !== 'ADMIN' && (n as any).role !== 'admin'
    );
    const activeNurses = sortNursesByShiftScheduleOrder(filteredNurses);
    const headers = ['No', 'Nama Perawat', 'NIP', 'Peran'];
    for (let d = 1; d <= daysInMonth; d++) {
      headers.push(String(d));
    }
    headers.push('Pagi (P)', 'Siang (S)', 'Pagi : Siang', 'Libur (L)', 'Cuti (C)', 'Sakit (SK)', 'Total Dinas');

    const rows = activeNurses.map((nurse, idx) => {
      let countP = 0;
      let countS = 0;
      let countL = 0;
      let countC = 0;
      let countSk = 0;

      const roleLabel =
        nurse.role === 'KARU' ? 'Kepala Ruang' : nurse.role === 'KATIM' ? 'PJ Shif' : 'Perawat Pelaksana';

      const row: (string | number)[] = [
        idx + 1,
        nurse.name,
        nurse.nip || '-',
        roleLabel,
      ];

      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const nurseNameLower = (nurse.name || '').trim().toLowerCase();
        const asg = assignments.find((a) => {
          if (a.date !== dateStr) return false;
          if (a.nurseId !== undefined && a.nurseId !== null && nurse.id !== undefined && nurse.id !== null && Number(a.nurseId) === Number(nurse.id)) return true;
          if (a.nurseName && a.nurseName.trim().toLowerCase() === nurseNameLower) return true;
          return false;
        });

        let code = 'L';
        if (asg) {
          const rawSt = String(asg.shiftType || '').toUpperCase();
          if (rawSt === 'PAGI' || rawSt === 'P') code = 'P';
          else if (rawSt === 'SIANG' || rawSt === 'S') code = 'S';
          else if (rawSt === 'PAGI_SIANG' || rawSt === '2S' || rawSt === 'P+S') code = '2S';
          else if (rawSt === 'LIBUR' || rawSt === 'L') code = 'L';
          else if (rawSt === 'CUTI' || rawSt === 'C') code = 'C';
          else if (rawSt === 'IZIN' || rawSt === 'I') code = 'I';
          else if (rawSt === 'SAKIT' || rawSt === 'SK') code = 'SK';
          else code = SHIFT_TYPE_INFO[asg.shiftType]?.code || 'L';
        }

        if (code === 'P') countP++;
        else if (code === 'S') countS++;
        else if (code === '2S') { countP++; countS++; }
        else if (code === 'L') countL++;
        else if (code === 'C') countC++;
        else if (code === 'SK') countSk++;

        row.push(code);
      }

      const ratioStr = `${countP} : ${countS}`;
      row.push(countP, countS, ratioStr, countL, countC, countSk, countP + countS);
      return row;
    });

    // Hitung ringkasan harian (Daily Summary) persis seperti matriks jadwal website
    const dailyPCounts: (number | string)[] = [];
    const dailySCounts: (number | string)[] = [];
    const dailyRatioStrings: string[] = [];
    const dailyTotalWork: (number | string)[] = [];

    let grandTotalP = 0;
    let grandTotalS = 0;

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayOfWeek = new Date(year, month - 1, d).getDay();
      const isSunday = dayOfWeek === 0;

      let pCount = 0;
      let sCount = 0;

      activeNurses.forEach((nurse) => {
        const nurseNameLower = (nurse.name || '').trim().toLowerCase();
        const asg = assignments.find((a) => {
          if (a.date !== dateStr) return false;
          if (a.nurseId !== undefined && a.nurseId !== null && nurse.id !== undefined && nurse.id !== null && Number(a.nurseId) === Number(nurse.id)) return true;
          if (a.nurseName && a.nurseName.trim().toLowerCase() === nurseNameLower) return true;
          return false;
        });

        let code = 'L';
        if (asg) {
          const rawSt = String(asg.shiftType || '').toUpperCase();
          if (rawSt === 'PAGI' || rawSt === 'P') code = 'P';
          else if (rawSt === 'SIANG' || rawSt === 'S') code = 'S';
          else if (rawSt === 'PAGI_SIANG' || rawSt === '2S' || rawSt === 'P+S') code = '2S';
        }

        if (code === 'P') {
          pCount++;
        } else if (code === 'S') {
          sCount++;
        } else if (code === '2S') {
          pCount++;
          sCount++;
        }
      });

      if (isSunday) {
        dailyPCounts.push('-');
        dailySCounts.push('-');
        dailyRatioStrings.push('-');
        dailyTotalWork.push('-');
      } else {
        dailyPCounts.push(pCount);
        dailySCounts.push(sCount);
        dailyRatioStrings.push(`${pCount} : ${sCount}`);
        dailyTotalWork.push(pCount + sCount);
        grandTotalP += pCount;
        grandTotalS += sCount;
      }
    }

    const summaryRows: (string | number)[][] = [
      ['REKAP', '-', '-', 'Total Shift Pagi (P)', ...dailyPCounts, grandTotalP, '-', '-', '-', '-', '-', grandTotalP],
      ['REKAP', '-', '-', 'Total Shift Siang (S)', ...dailySCounts, '-', grandTotalS, '-', '-', '-', '-', grandTotalS],
      ['REKAP', '-', '-', 'Perbandingan Harian (P : S)', ...dailyRatioStrings, grandTotalP, grandTotalS, `${grandTotalP} : ${grandTotalS}`, '-', '-', '-', `${grandTotalP + grandTotalS}`],
      ['REKAP', '-', '-', 'Total Dinas (P+S)', ...dailyTotalWork, grandTotalP, grandTotalS, `${grandTotalP} : ${grandTotalS}`, '-', '-', '-', grandTotalP + grandTotalS],
    ];

    return {
      year,
      month,
      monthName,
      formattedMonthTitle,
      monthString,
      daysInMonth,
      headers,
      rows,
      summaryRows,
    };
  }

  /**
   * Fetches Nurses, Machines, Bays, and Schedules directly from Google Apps Script Web App.
   * Works on any device without Firebase quota limits.
   */
  /**
   * Validates the Google Apps Script Webhook URL format and provides clear error messages.
   */
  static validateWebhookUrl(url: string): { isValid: boolean; errorMessage?: string } {
    if (!url || url.trim() === '') {
      return {
        isValid: false,
        errorMessage: 'URL Webhook Google Apps Script belum diisi. Silakan masukkan Web App URL di tab Laporan & Sinkronisasi.',
      };
    }

    const trimmed = url.trim();

    if (trimmed.includes('docs.google.com/spreadsheets/d/') && !trimmed.includes('/exec')) {
      return {
        isValid: false,
        errorMessage:
          'URL yang dimasukkan adalah tautan file Spreadsheet Google biasa, bukan URL Webhook Apps Script. Silakan pasang script dan gunakan URL Web App dari Google Apps Script (berakhiran /exec). Klik tombol "Panduan Setup Webhook".',
      };
    }

    if (!trimmed.startsWith('https://') && !trimmed.startsWith('http://')) {
      return {
        isValid: false,
        errorMessage: 'URL Webhook tidak valid. URL harus diawali dengan https://script.google.com/macros/s/.../exec',
      };
    }

    if (trimmed.endsWith('/dev')) {
      return {
        isValid: false,
        errorMessage:
          'URL Webhook berakhiran "/dev" (mode pengujian) yang mewajibkan login akun Google dan memblokir sinkronisasi otomatis. Harap gunakan URL Web App Production yang berakhiran "/exec".',
      };
    }

    return { isValid: true };
  }

  /**
   * Tests the connection to Google Apps Script Webhook directly.
   */
  static async testConnection(webhookUrl: string): Promise<{ isSuccess: boolean; message: string; latencyMs?: number }> {
    const trimmed = (webhookUrl || '').trim();
    const validation = this.validateWebhookUrl(trimmed);
    if (!validation.isValid) {
      return {
        isSuccess: false,
        message: validation.errorMessage || 'URL Webhook tidak valid.',
      };
    }

    const startTime = Date.now();
    try {
      const separator = trimmed.includes('?') ? '&' : '?';
      const testUrl = `${trimmed}${separator}action=PING&t=${Date.now()}`;
      const response = await fetch(testUrl, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      const latencyMs = Date.now() - startTime;

      if (!response.ok) {
        return {
          isSuccess: false,
          message: `Server Google Apps Script merespons dengan HTTP ${response.status} ${response.statusText}.`,
          latencyMs,
        };
      }

      const data = await response.json();
      if (data.status === 'error') {
        return {
          isSuccess: false,
          message: `Google Apps Script melaporkan error: ${data.message || 'Error internal script'}`,
          latencyMs,
        };
      }

      return {
        isSuccess: true,
        message: `Koneksi Google Sheets berhasil & responsif (${latencyMs}ms)! Webhook siap digunakan.`,
        latencyMs,
      };
    } catch (e: unknown) {
      const latencyMs = Date.now() - startTime;
      const errorMsg = e instanceof Error ? e.message : String(e);
      let tip = '';
      if (errorMsg.includes('Failed to fetch') || errorMsg.includes('NetworkError') || errorMsg.includes('Load failed')) {
        tip = ' Solusi: Buka Google Apps Script -> Deploy -> Manage Deployments -> klik Edit (ikon pensil) -> pastikan "Who has access" diatur ke "Anyone" (Siapa saja), lalu simpan deployment baru.';
      }
      return {
        isSuccess: false,
        message: `Gagal menghubungi Google Apps Script: ${errorMsg}.${tip}`,
        latencyMs,
      };
    }
  }

  static async fetchDataFromGoogleSheets(
    webhookUrl: string,
    targetMonth?: string
  ): Promise<GoogleSheetsFetchResult> {
    const trimmedUrl = (webhookUrl || '').trim();
    const validation = this.validateWebhookUrl(trimmedUrl);
    if (!validation.isValid) {
      return {
        isSuccess: false,
        message: validation.errorMessage || 'URL Webhook Google Apps Script belum valid.',
        nurses: [],
        machines: [],
        assignments: [],
      };
    }

    try {
      // Append query param action=GET_ALL and target month if available
      const separator = trimmedUrl.includes('?') ? '&' : '?';
      const monthParam = targetMonth ? `&month=${encodeURIComponent(targetMonth)}` : '';
      const fetchUrl = `${trimmedUrl}${separator}action=GET_ALL${monthParam}&t=${Date.now()}`;

      const response = await fetch(fetchUrl, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Server Google Apps Script mengembalikan status: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      if (data.status === 'error') {
        throw new Error(data.message || 'Google Apps Script melaporkan error.');
      }

      // Parse and sanitize helper
      const PURGED_SPECIAL_DUTIES = new Set([
        'REUSE DIALYZER',
        'REUSE',
        'IPCN / PPI HD',
        'IPCN / PPI',
        'IPCN',
        'PPI',
        'KLAIM & DOKUMEN BPJS',
        'KLAIM & BPJS',
        'BPJS',
      ]);

      const cleanDuty = (raw?: string | null): string | null => {
        if (!raw) return null;
        const parsed = parseSpecialDuties(raw);
        const filtered = parsed
          .filter((c) => {
            const up = c.toUpperCase();
            if (PURGED_SPECIAL_DUTIES.has(up)) return false;
            if (up.includes('REUSE') || up.includes('IPCN') || up.includes('PPI') || up.includes('BPJS')) return false;
            return true;
          })
          .map((c) => (c === 'FARMASI & LOGISTIK' ? 'FARMASI LOGISTIK' : c));
        return formatSpecialDuties(filtered);
      };

      // Parse and validate nurses
      const rawNurses = Array.isArray(data.nurses) ? data.nurses : [];
      const parsedNurses: Nurse[] = rawNurses
        .map((rn: any, idx: number) => {
          if (!rn || (!rn.name && !rn.nama)) return null;
          const name = String(rn.name || rn.nama || '').trim();
          const roleRaw = String(rn.role || rn.peran || 'PELAKSANA').toUpperCase();
          if (
            !name ||
            name === '-' ||
            name === '--' ||
            name === '---' ||
            name.replace(/[^a-zA-Z0-9]/g, '').length < 2 ||
            name.toLowerCase().includes('admin') ||
            roleRaw.includes('ADMIN') ||
            name.includes('1790191588620') ||
            name.includes('1790218743659')
          ) {
            return null;
          }
          const role: NurseRole = roleRaw.includes('KARU')
            ? 'KARU'
            : roleRaw.includes('KATIM') || roleRaw.includes('PJ')
            ? 'KATIM'
            : 'PELAKSANA';

          return {
            id: Number(rn.id) || 1000 + idx,
            name,
            nip: String(rn.nip || '').trim(),
            phone: String(rn.phone || rn.noWhatsApp || rn.noWa || '').trim(),
            role,
            isActive: rn.isActive !== undefined ? Boolean(rn.isActive) : true,
            skillLevel: (rn.skillLevel || 'Senior') as 'Senior' | 'Medium' | 'Junior',
            specialDuty: cleanDuty(rn.specialDuty ? String(rn.specialDuty).trim() : null),
            defaultOffDay: rn.defaultOffDay !== undefined && rn.defaultOffDay !== null ? Number(rn.defaultOffDay) : null,
            isPermanent: true,
          };
        })
        .filter((n: unknown): n is Nurse => Boolean(n));

      // Parse and validate machines
      const rawMachines = Array.isArray(data.machines) ? data.machines : [];
      const parsedMachines: Machine[] = rawMachines
        .map((rm: any, idx: number) => {
          if (!rm || (!rm.code && !rm.kode)) return null;
          const code = String(rm.code || rm.kode || '').trim().toUpperCase();
          const name = String(rm.name || rm.nama || `Mesin ${code}`).trim();
          const bay = String(rm.bay || rm.ruangan || 'Bay A (Reguler)').trim();
          const catRaw = String(rm.category || rm.kategori || 'REGULER').toUpperCase();
          const statusRaw = String(rm.status || 'AKTIF').toUpperCase();

          const category: MachineCategory =
            catRaw.includes('HEPATITIS_B') || catRaw.includes('HEPB')
              ? 'HEPATITIS_B'
              : catRaw.includes('HEPATITIS_C') || catRaw.includes('HEPC')
              ? 'HEPATITIS_C'
              : catRaw.includes('ISOLASI')
              ? 'ISOLASI'
              : 'REGULER';

          const status: MachineStatus = statusRaw.includes('RUSAK')
            ? 'RUSAK'
            : statusRaw.includes('MAINTENANCE')
            ? 'MAINTENANCE'
            : 'AKTIF';

          return {
            id: Number(rm.id) || idx + 1,
            code,
            name,
            bay,
            category,
            status,
            brandModel: String(rm.brandModel || rm.brand || '').trim(),
            notes: String(rm.notes || rm.catatan || '').trim(),
          };
        })
        .filter((m: unknown): m is Machine => Boolean(m));

      // Parse and merge bays: only keep bays that have assigned machines
      const parsedBaysSet = new Set<string>();
      parsedMachines.forEach((m) => {
        if (m.bay && m.bay.trim()) {
          parsedBaysSet.add(m.bay.trim());
        }
      });
      const rawBays = Array.isArray(data.bays) ? data.bays : [];
      rawBays.forEach((b: any) => {
        const bName = typeof b === 'string' ? b.trim() : typeof b?.name === 'string' ? b.name.trim() : '';
        if (bName && parsedMachines.some((m) => m.bay?.trim().toLowerCase() === bName.toLowerCase())) {
          parsedBaysSet.add(bName);
        }
      });
      const parsedBays: string[] = Array.from(parsedBaysSet);

      // Parse Special Duty Options (Master Tugas Khusus)
      const rawSpecialDuties = Array.isArray(data.specialDutyOptions)
        ? data.specialDutyOptions
        : Array.isArray(data.specialDuties)
        ? data.specialDuties
        : [];

      let parsedSpecialDuties: SpecialDutyOption[] = [];
      if (rawSpecialDuties.length > 0) {
        parsedSpecialDuties = rawSpecialDuties
          .map((sd: any) => {
            if (!sd || (!sd.code && !sd.kode && !sd.name && !sd.label)) return null;
            let code = String(sd.code || sd.kode || sd.name || sd.label || '').trim().toUpperCase();
            if (code === 'FARMASI & LOGISTIK') code = 'FARMASI LOGISTIK';
            if (PURGED_SPECIAL_DUTIES.has(code)) return null;

            const shortName = String(sd.shortName || sd.singkatan || code).trim();
            const label = String(sd.label || sd.namaLengkap || `Tugas Khusus ${code}`).trim();
            const description = String(sd.description || sd.deskripsi || '').trim();
            const colorName = String(sd.colorName || sd.warna || 'Biru').trim();
            const dotColorHex = String(sd.dotColorHex || sd.hex || '#3b82f6').trim();
            const isCustom = sd.isCustom !== undefined ? Boolean(sd.isCustom) : !['BHP', 'FARMASI LOGISTIK', 'NATRIUM RO', 'PJ SHIF', 'CITO'].includes(code);

            // Default color classes based on color or code
            let bgClass = 'bg-blue-500';
            let badgeClass = 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/70 dark:text-blue-300 dark:border-blue-800';
            let textClass = 'text-blue-700 dark:text-blue-300';
            let borderClass = 'border-blue-200 dark:border-blue-800';

            if (code === 'CITO' || colorName.toLowerCase().includes('merah tua')) {
              bgClass = 'bg-red-600';
              badgeClass = 'bg-red-100 text-red-800 border-red-300 dark:bg-red-950/70 dark:text-red-300 dark:border-red-800';
              textClass = 'text-red-700 dark:text-red-300';
              borderClass = 'border-red-200 dark:border-red-800';
            } else if (code.includes('FARMASI') || colorName.toLowerCase().includes('merah') || colorName.toLowerCase().includes('rose')) {
              bgClass = 'bg-rose-500';
              badgeClass = 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/70 dark:text-rose-300 dark:border-rose-800';
              textClass = 'text-rose-700 dark:text-rose-300';
              borderClass = 'border-rose-200 dark:border-rose-800';
            } else if (code.includes('NATRIUM') || colorName.toLowerCase().includes('kuning') || colorName.toLowerCase().includes('amber')) {
              bgClass = 'bg-amber-400';
              badgeClass = 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-800';
              textClass = 'text-amber-700 dark:text-amber-300';
              borderClass = 'border-amber-200 dark:border-amber-800';
            } else if (code.includes('PJ') || colorName.toLowerCase().includes('hijau') || colorName.toLowerCase().includes('emerald')) {
              bgClass = 'bg-emerald-500';
              badgeClass = 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-800';
              textClass = 'text-emerald-700 dark:text-emerald-300';
              borderClass = 'border-emerald-200 dark:border-emerald-800';
            } else if (colorName.toLowerCase().includes('ungu') || colorName.toLowerCase().includes('purple')) {
              bgClass = 'bg-purple-500';
              badgeClass = 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950/70 dark:text-purple-300 dark:border-purple-800';
              textClass = 'text-purple-700 dark:text-purple-300';
              borderClass = 'border-purple-200 dark:border-purple-800';
            }

            return {
              id: String(sd.id || code),
              code,
              label,
              shortName,
              description,
              colorName,
              dotColorHex,
              bgClass,
              badgeClass,
              textClass,
              borderClass,
              isCustom,
            };
          })
          .filter((opt: unknown): opt is SpecialDutyOption => Boolean(opt));
      }

      // Parse assignments
      const rawAssignments = Array.isArray(data.assignments) ? data.assignments : [];
      const parsedAssignments: ShiftAssignment[] = rawAssignments
        .map((ra: any, idx: number) => {
          if (!ra || !ra.date) return null;
          const nurseNameStr = String(ra.nurseName || '').trim();
          if (
            nurseNameStr === '-' ||
            nurseNameStr === '--' ||
            nurseNameStr === '---' ||
            (nurseNameStr && nurseNameStr.replace(/[^a-zA-Z0-9]/g, '').length < 2 && !ra.nurseId)
          ) {
            return null;
          }
          if (!ra.nurseName && !ra.nurseId) return null;
          let assignedMachineIds: number[] = [];
          const rawCodesFound: string[] = [];
          if (Array.isArray(ra.assignedMachineIds)) {
            assignedMachineIds = ra.assignedMachineIds.map((id: any) => Number(id)).filter((id: number) => !isNaN(id));
          } else if (Array.isArray(ra.machines)) {
            ra.machines.forEach((code: any) => {
              const codeStr = String(code).trim().toUpperCase();
              if (codeStr) rawCodesFound.push(codeStr);
              const cleanCode = codeStr.replace(/^MACH-?/i, '');
              const matched = parsedMachines.find(
                (m) => m.code.toUpperCase() === cleanCode || m.code.toUpperCase() === codeStr || String(m.id) === codeStr
              );
              if (matched && typeof matched.id === 'number') {
                assignedMachineIds.push(matched.id);
              }
            });
          } else if (typeof ra.machines === 'string' && ra.machines.trim()) {
            const codes = ra.machines.split(/[,;\s]+/).map((s: string) => s.trim().toUpperCase()).filter(Boolean);
            codes.forEach((code: string) => {
              rawCodesFound.push(code);
              const cleanCode = code.replace(/^MACH-?/i, '');
              const matched = parsedMachines.find(
                (m) => m.code.toUpperCase() === cleanCode || m.code.toUpperCase() === code || String(m.id) === code
              );
              if (matched && typeof matched.id === 'number') {
                assignedMachineIds.push(matched.id);
              }
            });
          }

          const shiftRaw = String(ra.shiftType || ra.shiftCode || 'LIBUR').toUpperCase();
          const shiftType = shiftRaw.includes('PAGI') || shiftRaw === 'P'
            ? 'PAGI'
            : (shiftRaw.includes('SIANG') || shiftRaw === 'S') && !shiftRaw.includes('SAKIT') && shiftRaw !== 'SK'
            ? 'SIANG'
            : shiftRaw.includes('CUTI') || shiftRaw === 'C'
            ? 'CUTI'
            : shiftRaw.includes('SAKIT') || shiftRaw === 'SK'
            ? 'SAKIT'
            : 'LIBUR';

          // Link with nurse record if nurseId is missing or default
          const matchedNurse = parsedNurses.find(
            (n) => n.name.toLowerCase() === String(ra.nurseName || '').trim().toLowerCase() || n.id === Number(ra.nurseId)
          );

          const rawDuty = ra.specialDuty ? String(ra.specialDuty).trim() : (matchedNurse ? matchedNurse.specialDuty : null);
          const sanitizedDuty = cleanDuty(rawDuty);

          return {
            id: String(ra.id || `${ra.date}-${ra.nurseId || idx}`),
            date: String(ra.date).trim(),
            shiftType,
            nurseId: matchedNurse ? matchedNurse.id : (Number(ra.nurseId) || idx),
            nurseName: matchedNurse ? matchedNurse.name : String(ra.nurseName || '').trim(),
            nursePhone: matchedNurse ? matchedNurse.phone : String(ra.nursePhone || '').trim(),
            assignedMachineIds,
            rawMachineCodes: rawCodesFound,
            isLeader: Boolean(ra.isLeader || (matchedNurse && (matchedNurse.role === 'KATIM' || matchedNurse.role === 'KARU'))),
            isWhatsAppSent: Boolean(ra.isWhatsAppSent),
            notes: String(ra.notes || '').trim(),
            specialDuty: sanitizedDuty,
          };
        })
        .filter((a: unknown): a is ShiftAssignment => Boolean(a));

      // Parse and validate doctors
      const rawDoctors = Array.isArray(data.doctors) ? data.doctors : [];
      const parsedDoctors: Doctor[] = rawDoctors
        .map((rd: any, idx: number) => {
          if (!rd || (!rd.name && !rd.nama)) return null;
          const name = String(rd.name || rd.nama || '').trim();
          if (!name) return null;
          const roleRaw = String(rd.role || rd.peran || 'DOKTER_RUANGAN').toUpperCase();
          const role = roleRaw.includes('DPJP') ? 'DPJP' : 'DOKTER_RUANGAN';

          return {
            id: Number(rd.id) || 1000 + idx,
            name,
            sip: String(rd.sip || '').trim(),
            phone: String(rd.phone || rd.noWhatsApp || rd.noWa || '').trim(),
            role,
            specialization: String(rd.specialization || rd.spesialisasi || '').trim(),
            isActive: rd.isActive !== undefined ? Boolean(rd.isActive) : true,
          };
        })
        .filter((d: unknown): d is Doctor => Boolean(d));

      // Parse and validate doctor duties
      const rawDuties = Array.isArray(data.doctorDuties) ? data.doctorDuties : [];
      const parsedDoctorDuties: Record<string, DoctorShiftDuty> = {};
      rawDuties.forEach((dd: any) => {
        if (dd && dd.date) {
          const dStr = String(dd.date).trim();
          parsedDoctorDuties[dStr] = {
            date: dStr,
            pagiDoctorId: dd.pagiDoctorId ? Number(dd.pagiDoctorId) : null,
            pagiDoctorName: dd.pagiDoctorName && dd.pagiDoctorName !== '-' ? String(dd.pagiDoctorName).trim() : undefined,
            siangDoctorId: dd.siangDoctorId ? Number(dd.siangDoctorId) : null,
            siangDoctorName: dd.siangDoctorName && dd.siangDoctorName !== '-' ? String(dd.siangDoctorName).trim() : undefined,
            notes: String(dd.notes || '').trim(),
          };
        }
      });

      const docSummary = parsedDoctors.length > 0 ? `, ${parsedDoctors.length} dokter jaga` : '';
      const baySummary = parsedBays.length > 0 ? `, ${parsedBays.length} bay` : '';
      const dutySummary = parsedSpecialDuties.length > 0 ? `, ${parsedSpecialDuties.length} tugas khusus` : '';

      return {
        isSuccess: true,
        message: `Berhasil menarik 2-arah: ${parsedNurses.length} perawat, ${parsedMachines.length} mesin, ${parsedAssignments.length} jadwal perawat${docSummary}${baySummary}${dutySummary} dari Google Sheets!`,
        nurses: parsedNurses,
        machines: parsedMachines,
        bays: parsedBays,
        assignments: parsedAssignments,
        doctors: parsedDoctors,
        doctorDuties: parsedDoctorDuties,
        specialDutyOptions: parsedSpecialDuties.length > 0 ? parsedSpecialDuties : undefined,
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        isSuccess: false,
        message: `Gagal memuat data dari Google Sheets: ${errorMsg}`,
        nurses: [],
        machines: [],
        assignments: [],
      };
    }
  }

  /**
   * Helper to build a comprehensive daily list for doctor duties across the whole month.
   */
  static buildDoctorDutiesList(
    monthString: string,
    doctorDuties?: Record<string, DoctorShiftDuty>,
    doctors?: Doctor[]
  ) {
    const [yStr, mStr] = monthString.split('-');
    const year = parseInt(yStr, 10) || new Date().getFullYear();
    const month = parseInt(mStr, 10) || (new Date().getMonth() + 1);
    const daysInMonth = new Date(year, month, 0).getDate();
    const indonesianDays = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const docList = doctors || [];

    const list = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayObj = new Date(year, month - 1, d);
      const isSunday = dayObj.getDay() === 0;
      const dayName = indonesianDays[dayObj.getDay()];
      const duty = doctorDuties ? doctorDuties[dateStr] : undefined;

      const rawPagi =
        duty?.pagiDoctorName ||
        (duty?.pagiDoctorId ? docList.find((doc) => doc.id === duty.pagiDoctorId)?.name : '-') ||
        '-';
      const rawSiang =
        duty?.siangDoctorName ||
        (duty?.siangDoctorId ? docList.find((doc) => doc.id === duty.siangDoctorId)?.name : '-') ||
        '-';

      const pagiDoc = isSunday ? '-' : rawPagi;
      const siangDoc = isSunday ? '-' : rawSiang;

      let status = 'Belum Terisi';
      if (isSunday) {
        status = 'Libur Rutin HD (Minggu)';
      } else if (pagiDoc !== '-' && siangDoc !== '-') {
        status = pagiDoc === siangDoc ? '2 Shif Sekaligus' : 'Lengkap (2 Dr)';
      } else if (pagiDoc !== '-') {
        status = 'Pagi Saja';
      } else if (siangDoc !== '-') {
        status = 'Siang Saja';
      }

      list.push({
        no: d,
        date: dateStr,
        dayName,
        dayNumber: d,
        isSunday,
        pagiDoctorId: duty?.pagiDoctorId || '',
        pagiDoctorName: pagiDoc,
        siangDoctorId: duty?.siangDoctorId || '',
        siangDoctorName: siangDoc,
        status: duty?.status || status,
        notes: duty?.notes || (isSunday ? 'Libur Rutin HD (Hari Minggu)' : ''),
      });
    }
    return list;
  }

  /**
   * Sends master data and/or active monthly schedules directly to Google Sheets.
   * Supports both full synchronization and targeted/partial synchronization (PartialSyncTargets).
   */
  static async syncAllToGoogleSheets(
    webhookUrl: string,
    monthString: string,
    nurses: Nurse[],
    machines: Machine[],
    assignments: ShiftAssignment[],
    bays: string[],
    doctors?: Doctor[],
    doctorDuties?: Record<string, DoctorShiftDuty>,
    specialDutyOptions?: SpecialDutyOption[],
    dailySpecialTasks?: any[],
    syncTargets?: PartialSyncTargets
  ): Promise<GoogleSheetsSyncAllResult> {
    const trimmedUrl = (webhookUrl || '').trim();
    const validation = this.validateWebhookUrl(trimmedUrl);
    if (!validation.isValid) {
      return {
        isSuccess: false,
        message: validation.errorMessage || 'URL Webhook Google Apps Script belum valid.',
      };
    }

    try {
      // Determine which parts to include
      const includeMatrix = !syncTargets || syncTargets.matrixSchedule !== false;
      const includeDoctorDuties = !syncTargets || syncTargets.doctorDuties !== false;
      const includeAssignments = !syncTargets || syncTargets.machineAssignments !== false;
      const includeSpecialTasks = !syncTargets || syncTargets.specialTasks !== false;
      const includeNurses = !syncTargets || syncTargets.nursesMaster !== false;
      const includeMachines = !syncTargets || syncTargets.machinesMaster !== false;
      const includeDoctors = !syncTargets || syncTargets.doctorsMaster !== false;
      const includeSpecialDuties = !syncTargets || syncTargets.specialDutiesMaster !== false;

      const isPartial = Boolean(
        syncTargets &&
        (!includeMatrix || !includeDoctorDuties || !includeAssignments || !includeSpecialTasks ||
         !includeNurses || !includeMachines || !includeDoctors || !includeSpecialDuties)
      );

      const sortedNurses = sortNursesByShiftScheduleOrder(nurses);
      const matrixData = this.buildScheduleMatrix(monthString, sortedNurses, assignments);
      const dutiesList = this.buildDoctorDutiesList(monthString, doctorDuties, doctors);
      const dutyOpts = specialDutyOptions && specialDutyOptions.length > 0 ? specialDutyOptions : DEFAULT_SPECIAL_DUTY_OPTIONS;

      const payload: Record<string, any> = {
        action: isPartial ? 'PARTIAL_SYNC' : 'SYNC_ALL',
        month: monthString,
        monthName: matrixData.monthName,
        formattedMonthTitle: matrixData.formattedMonthTitle,
        syncTimestamp: Date.now(),
        isPartialSync: isPartial,
        syncTargets: syncTargets || null,
        syncScheduleMatrix: includeMatrix,
        syncDoctorDuties: includeDoctorDuties,
        syncAssignments: includeAssignments,
        syncSpecialTasks: includeSpecialTasks,
        syncNurses: includeNurses,
        syncMachines: includeMachines,
        syncDoctors: includeDoctors,
        syncSpecialDutiesMaster: includeSpecialDuties,
      };

      if (includeMatrix) {
        payload.scheduleMatrix = matrixData;
      }
      if (includeMachines) {
        payload.bays = bays || [];
        payload.machines = machines.map((m) => ({
          id: m.id,
          code: m.code,
          name: m.name,
          bay: m.bay,
          category: m.category,
          status: m.status,
          brandModel: m.brandModel || '',
          notes: m.notes || '',
        }));
      }
      if (includeSpecialDuties) {
        payload.specialDutyOptions = dutyOpts.map((opt) => ({
          id: opt.id,
          code: opt.code,
          shortName: opt.shortName,
          label: opt.label,
          description: opt.description || '',
          colorName: opt.colorName || 'Biru',
          dotColorHex: opt.dotColorHex || '#3b82f6',
          isCustom: Boolean(opt.isCustom),
        }));
      }
      if (includeNurses) {
        payload.nurses = sortedNurses.map((n) => ({
          id: n.id,
          name: n.name,
          nip: n.nip || '',
          phone: n.phone || '',
          role: n.role,
          isActive: n.isActive,
          skillLevel: n.skillLevel,
          specialDuty: n.specialDuty || '',
          defaultOffDay: n.defaultOffDay !== undefined ? n.defaultOffDay : '',
        }));
      }
      if (includeAssignments) {
        payload.assignments = assignments.map((a) => {
          const mCodes = (a.assignedMachineIds || [])
            .map((mId) => {
              const rawStr = String(mId).trim();
              const cleanCodeOnly = rawStr.replace(/^MACH-?/i, '').toUpperCase();
              const matched = machines.find((m) => 
                String(m.id).toUpperCase() === rawStr.toUpperCase() || 
                m.code.toUpperCase() === rawStr.toUpperCase() ||
                m.code.toUpperCase() === cleanCodeOnly ||
                String(m.id).toUpperCase() === cleanCodeOnly
              );
              return matched?.code || (cleanCodeOnly || rawStr);
            })
            .filter(Boolean);
          return {
            id: a.id,
            date: a.date,
            shiftType: SHIFT_TYPE_INFO[a.shiftType]?.label || a.shiftType,
            shiftCode: SHIFT_TYPE_INFO[a.shiftType]?.code || a.shiftType,
            nurseId: a.nurseId,
            nurseName: a.nurseName,
            isLeader: a.isLeader,
            machines: mCodes,
            machineCount: mCodes.length,
            notes: a.notes || '',
            specialDuty: a.specialDuty || '',
          };
        });
      }
      if (includeSpecialTasks) {
        payload.dailySpecialTasks = dailySpecialTasks || [];
      }
      if (includeDoctors) {
        payload.doctors = (doctors || []).map((doc) => ({
          id: doc.id,
          name: doc.name,
          sip: doc.sip || '',
          phone: doc.phone || '',
          role: doc.role,
          specialization: doc.specialization || '',
          isActive: doc.isActive !== false,
        }));
      }
      if (includeDoctorDuties) {
        payload.doctorDuties = dutiesList;
      }

      let response: Response;
      try {
        response = await fetch(trimmedUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain;charset=utf-8',
          },
          body: JSON.stringify(payload),
        });
      } catch (corsErr) {
        console.warn('Standard POST to Google Apps Script failed, retrying with mode: no-cors...', corsErr);
        response = await fetch(trimmedUrl, {
          method: 'POST',
          mode: 'no-cors',
          headers: {
            'Content-Type': 'text/plain;charset=utf-8',
          },
          body: JSON.stringify(payload),
        });
      }

      if (response.ok || response.type === 'opaque') {
        if (isPartial) {
          const syncedParts: string[] = [];
          if (includeMatrix) syncedParts.push(`Matriks HD (${matrixData.formattedMonthTitle})`);
          if (includeDoctorDuties) syncedParts.push(`Jadwal Dokter (${dutiesList.length} hari)`);
          if (includeAssignments) syncedParts.push(`Alokasi Mesin (${assignments.length} baris)`);
          if (includeSpecialTasks) syncedParts.push(`Tugas Khusus (${(dailySpecialTasks || []).length} tugas)`);
          if (includeNurses) syncedParts.push(`Data Perawat (${sortedNurses.length})`);
          if (includeMachines) syncedParts.push(`Data Mesin HD (${machines.length})`);
          if (includeDoctors) syncedParts.push(`Data Dokter (${doctors?.length || 0})`);
          if (includeSpecialDuties) syncedParts.push(`Master Tugas Khusus (${dutyOpts.length})`);

          return {
            isSuccess: true,
            message: `Berhasil sinkronisasi terarah (${syncedParts.length} modul): ${syncedParts.join(', ')} ke Google Sheets!`,
            nursesCount: includeNurses ? sortedNurses.length : undefined,
            machinesCount: includeMachines ? machines.length : undefined,
            assignmentsCount: includeAssignments ? assignments.length : undefined,
            doctorsCount: includeDoctors ? (doctors?.length || 0) : undefined,
            doctorDutiesCount: includeDoctorDuties ? dutiesList.length : undefined,
            baysCount: includeMachines ? (bays?.length || 0) : undefined,
            specialDutiesCount: includeSpecialDuties ? dutyOpts.length : undefined,
          };
        } else {
          const docMsg = doctors && doctors.length > 0 ? ` & ${doctors.length} dokter jaga` : '';
          const bayMsg = bays && bays.length > 0 ? `, ${bays.length} bay` : '';
          return {
            isSuccess: true,
            message: `Berhasil mengekspor 2-arah ke Google Sheets: tab "Matriks HD - ${matrixData.formattedMonthTitle}" (${assignments.length} jadwal perawat${docMsg}${bayMsg}, ${dutyOpts.length} tugas khusus).`,
            nursesCount: nurses.length,
            machinesCount: machines.length,
            assignmentsCount: assignments.length,
            doctorsCount: doctors?.length || 0,
            doctorDutiesCount: dutiesList.length,
            baysCount: bays?.length || 0,
            specialDutiesCount: dutyOpts.length,
          };
        }
      } else {
        return {
          isSuccess: false,
          message: `Google Sheets mengembalikan status: ${response.status} ${response.statusText}`,
        };
      }
    } catch (e: unknown) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      let tip = '';
      if (errorMsg.includes('Failed to fetch') || errorMsg.includes('NetworkError') || errorMsg.includes('Load failed')) {
        tip = ' (Solusi: Pastikan Web App Apps Script di-deploy dengan akses: "Who has access: Anyone" dan URL berakhiran /exec).';
      }
      return {
        isSuccess: false,
        message: `Gagal menghubungi Google Sheet: ${errorMsg}${tip}`,
      };
    }
  }

  /**
   * Menghapus seluruh riwayat jadwal tugas khusus di Google Sheets (Tab 'Jadwal Tugas Khusus').
   */
  static async clearSpecialTasksHistory(gasUrl?: string): Promise<{ isSuccess: boolean; message: string }> {
    const trimmedUrl = (gasUrl || '').trim();
    if (!trimmedUrl) {
      return {
        isSuccess: true,
        message: 'Riwayat tugas khusus di sistem lokal & cloud berhasil dibersihkan (URL Google Apps Script belum disetel).',
      };
    }

    try {
      const payload = {
        action: 'CLEAR_SPECIAL_TASKS',
        timestamp: new Date().toISOString(),
      };

      let response: Response;
      try {
        response = await fetch(trimmedUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain;charset=utf-8',
          },
          body: JSON.stringify(payload),
        });
      } catch (corsErr) {
        console.warn('Standard POST clear to GAS failed, retrying with no-cors...', corsErr);
        response = await fetch(trimmedUrl, {
          method: 'POST',
          mode: 'no-cors',
          headers: {
            'Content-Type': 'text/plain;charset=utf-8',
          },
          body: JSON.stringify(payload),
        });
      }

      if (response.ok || response.type === 'opaque') {
        return {
          isSuccess: true,
          message: 'Berhasil membersihkan seluruh riwayat tugas khusus di sistem dan Google Sheet!',
        };
      } else {
        return {
          isSuccess: false,
          message: `Google Sheets mengembalikan kode status: HTTP ${response.status}`,
        };
      }
    } catch (err: any) {
      console.error('Failed to clear special tasks on Google Sheets:', err);
      return {
        isSuccess: false,
        message: `Terjadi kendala saat menghubungi Google Sheets: ${err?.message || 'Koneksi gagal'}`,
      };
    }
  }

  /**
   * Mengirim seluruh daftar tugas khusus yang di-inputkan langsung ke tab 'Jadwal Tugas Khusus' Google Sheets.
   */
  static async syncSpecialTasksToGoogleSheets(
    webhookUrl: string,
    specialTasks: SpecialTask[],
    employees: UserAccount[],
    monthString?: string
  ): Promise<{ isSuccess: boolean; message: string; tasksCount?: number }> {
    const trimmedUrl = (webhookUrl || '').trim();
    const validation = this.validateWebhookUrl(trimmedUrl);
    if (!validation.isValid) {
      return {
        isSuccess: false,
        message: validation.errorMessage || 'URL Webhook Google Apps Script belum disetel.',
      };
    }

    try {
      const dailySpecialTasks = (specialTasks || []).map((t) => {
        const nurse = (employees || []).find(
          (e) =>
            String(e.id) === String(t.assignedToId) ||
            String(e.nip) === String(t.assignedToId) ||
            e.name.toLowerCase() === (t as any).nurseName?.toLowerCase()
        );
        const def = SPECIAL_TASK_DEFINITIONS[t.category as SpecialTaskCategory];
        const categoryName = def?.name || t.title || t.category;
        const nurseRole = nurse
          ? nurse.role === 'kepala_ruangan'
            ? 'Kepala Ruangan'
            : (nurse.role === 'pj_shift' || (nurse.role as string) === 'katim')
            ? 'PJ Sif / Katim'
            : 'Perawat Pelaksana'
          : (t.category === 'pj_shift' ? 'PJ Sif / Katim' : 'Perawat Pelaksana');

        return {
          id: t.id,
          date: t.date,
          shift: t.shift,
          shiftLabel: String(t.shift).toLowerCase() === 'siang' ? 'Siang' : 'Pagi',
          nurseId: t.assignedToId,
          nurseName: nurse ? nurse.name : (t as any).nurseName || t.assignedToId,
          nurseRole,
          category: t.category,
          categoryName,
          shortCode: def?.shortCode || '',
          title: t.title,
          description: t.description || '',
          priority: t.priority,
          status: t.status,
          createdAt: t.createdAt,
          completedAt: t.completedAt || '',
          completionNotes: t.completionNotes || '',
        };
      });

      const payload = {
        action: 'SYNC_SPECIAL_TASKS',
        month: monthString || '',
        dailySpecialTasks,
        timestamp: new Date().toISOString(),
      };

      let response: Response;
      try {
        response = await fetch(trimmedUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain;charset=utf-8',
          },
          body: JSON.stringify(payload),
        });
      } catch (corsErr) {
        response = await fetch(trimmedUrl, {
          method: 'POST',
          mode: 'no-cors',
          headers: {
            'Content-Type': 'text/plain;charset=utf-8',
          },
          body: JSON.stringify(payload),
        });
      }

      if (response.ok || response.type === 'opaque') {
        return {
          isSuccess: true,
          message: `Berhasil mengirim ${dailySpecialTasks.length} tugas khusus ke tab "Jadwal Tugas Khusus" di Google Sheets!`,
          tasksCount: dailySpecialTasks.length,
        };
      } else {
        return {
          isSuccess: false,
          message: `Google Sheets mengembalikan kode status: HTTP ${response.status}`,
        };
      }
    } catch (err: any) {
      return {
        isSuccess: false,
        message: 'Gagal sinkronisasi tugas khusus: ' + (err?.message || err),
      };
    }
  }

  /**
   * Sends the monthly schedule payload directly to Google Apps Script Webhook.
   * Generates both the calendar matrix (template .xlsx format) and machine detail logs.
   */
  static async syncToGoogleSheets(
    webhookUrl: string,
    monthString: string,
    nurses: Nurse[],
    machines: Machine[],
    assignments: ShiftAssignment[],
    doctors?: Doctor[],
    doctorDuties?: Record<string, DoctorShiftDuty>,
    bays?: string[],
    specialDutyOptions?: SpecialDutyOption[]
  ): Promise<SyncResult> {
    const trimmedUrl = (webhookUrl || '').trim();
    const validation = this.validateWebhookUrl(trimmedUrl);
    if (!validation.isValid) {
      return {
        isSuccess: false,
        message: validation.errorMessage || 'URL Webhook Google Apps Script belum diisi.',
      };
    }

    try {
      const sortedNurses = sortNursesByShiftScheduleOrder(nurses);
      const matrixData = this.buildScheduleMatrix(monthString, sortedNurses, assignments);
      const dutiesList = this.buildDoctorDutiesList(monthString, doctorDuties, doctors);
      const dutyOpts = specialDutyOptions && specialDutyOptions.length > 0 ? specialDutyOptions : DEFAULT_SPECIAL_DUTY_OPTIONS;

      const payload = {
        action: 'SYNC_SCHEDULE',
        month: monthString,
        monthName: matrixData.monthName,
        formattedMonthTitle: matrixData.formattedMonthTitle,
        syncTimestamp: Date.now(),
        bays: bays || [],
        specialDutyOptions: dutyOpts.map((opt) => ({
          id: opt.id,
          code: opt.code,
          shortName: opt.shortName,
          label: opt.label,
          description: opt.description || '',
          colorName: opt.colorName || 'Biru',
          dotColorHex: opt.dotColorHex || '#3b82f6',
          isCustom: Boolean(opt.isCustom),
        })),
        scheduleMatrix: matrixData,
        nurses: sortedNurses.map((n) => ({
          id: n.id,
          name: n.name,
          nip: n.nip,
          phone: n.phone,
          role: n.role,
        })),
        machines: machines.map((m) => ({
          id: m.id,
          code: m.code,
          name: m.name,
          bay: m.bay,
          category: m.category,
        })),
        assignments: assignments.map((a) => {
          const mCodes = (a.assignedMachineIds || [])
            .map((mId) => {
              const rawStr = String(mId).trim();
              const cleanCodeOnly = rawStr.replace(/^MACH-?/i, '').toUpperCase();
              const matched = machines.find((m) => 
                String(m.id).toUpperCase() === rawStr.toUpperCase() || 
                m.code.toUpperCase() === rawStr.toUpperCase() ||
                m.code.toUpperCase() === cleanCodeOnly ||
                String(m.id).toUpperCase() === cleanCodeOnly
              );
              return matched?.code || (cleanCodeOnly || rawStr);
            })
            .filter(Boolean);
          return {
            id: a.id,
            date: a.date,
            shiftType: SHIFT_TYPE_INFO[a.shiftType]?.label || a.shiftType,
            shiftCode: SHIFT_TYPE_INFO[a.shiftType]?.code || a.shiftType,
            nurseId: a.nurseId,
            nurseName: a.nurseName,
            isLeader: a.isLeader,
            machines: mCodes,
            machineCount: mCodes.length,
            notes: a.notes,
            specialDuty: a.specialDuty || '',
          };
        }),
        doctors: (doctors || []).map((doc) => ({
          id: doc.id,
          name: doc.name,
          sip: doc.sip || '',
          phone: doc.phone || '',
          role: doc.role,
          specialization: doc.specialization || '',
          isActive: doc.isActive !== false,
        })),
        doctorDuties: dutiesList,
      };

      // Try standard POST fetch then fallback to mode no-cors
      let response: Response;
      try {
        response = await fetch(trimmedUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain;charset=utf-8',
          },
          body: JSON.stringify(payload),
        });
      } catch (corsErr) {
        console.warn('Standard POST to Google Apps Script failed, retrying with mode: no-cors...', corsErr);
        response = await fetch(trimmedUrl, {
          method: 'POST',
          mode: 'no-cors',
          headers: {
            'Content-Type': 'text/plain;charset=utf-8',
          },
          body: JSON.stringify(payload),
        });
      }

      if (response.ok || response.type === 'opaque') {
        return {
          isSuccess: true,
          message: `Berhasil menyinkronkan matriks ke tab "Matriks HD - ${matrixData.formattedMonthTitle}" di Google Sheets! (${assignments.length} jadwal perawat). Tab bulan sebelumnya tetap tersimpan utuh.`,
          rowsSynced: assignments.length,
        };
      } else {
        return {
          isSuccess: false,
          message: `Google Sheets mengembalikan status: ${response.status} ${response.statusText}`,
        };
      }
    } catch (e: unknown) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      let tip = '';
      if (errorMsg.includes('Failed to fetch') || errorMsg.includes('NetworkError') || errorMsg.includes('Load failed')) {
        tip = ' (Solusi: Pastikan Web App Apps Script di-deploy dengan akses: "Who has access: Anyone" dan URL berakhiran /exec).';
      }
      return {
        isSuccess: false,
        message: `Gagal menghubungi Google Sheet: ${errorMsg}${tip}`,
      };
    }
  }

  /**
   * Generates CSV format representing the monthly schedule & machine allocations.
   */
  static generateCsv(assignments: ShiftAssignment[], machines: Machine[]): string {
    const rows: string[] = [];
    rows.push('Tanggal,Sif,Kode Sif,Nama Perawat,Peran,No WhatsApp,Alokasi Mesin HD,Jumlah Mesin,Status Notifikasi,Catatan');

    assignments.forEach((a) => {
      const machineCodes = (a.assignedMachineIds || [])
        .map((id) => machines.find((m) => m.id === id)?.code)
        .filter(Boolean)
        .join(';');

      const leaderStr = a.isLeader ? 'PJ Sif' : 'Pelaksana';
      const waStatus = a.isWhatsAppSent ? 'Terkirim' : 'Belum';
      const shiftLabel = SHIFT_TYPE_INFO[a.shiftType]?.label || a.shiftType;
      const shiftCode = SHIFT_TYPE_INFO[a.shiftType]?.code || a.shiftType;

      rows.push(
        `"${a.date}","${shiftLabel}","${shiftCode}","${a.nurseName}","${leaderStr}","${a.nursePhone}","${machineCodes}",${a.assignedMachineIds?.length || 0},"${waStatus}","${a.notes || ''}"`
      );
    });

    return rows.join('\n');
  }

  /**
   * Triggers browser download of CSV file.
   */
  static downloadCsvFile(monthStr: string, assignments: ShiftAssignment[], machines: Machine[]): void {
    const csvContent = this.generateCsv(assignments, machines);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Jadwal_HD_${monthStr.replace(/\s+/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Exports monthly schedule matrix to CSV.
   */
  static exportMonthlyScheduleToCSV(monthStr: string, nurses: Nurse[], assignments: ShiftAssignment[]): void {
    const activeNurses = nurses.filter((n) => n.isActive);
    const parts = monthStr.split('-');
    const year = parseInt(parts[0], 10) || new Date().getFullYear();
    const month = parseInt(parts[1], 10) || (new Date().getMonth() + 1);
    const daysInMonth = new Date(year, month, 0).getDate();

    const headers = ['Nama Perawat', 'Jabatan'];
    for (let d = 1; d <= daysInMonth; d++) {
      headers.push(String(d));
    }
    headers.push('Total Sif');

    const rows = [headers.join(',')];

    activeNurses.forEach((nurse) => {
      let totalWork = 0;
      const row = [`"${nurse.name}"`, `"${nurse.role}"`];

      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const assignment = assignments.find((a) => a.date === dateStr && a.nurseId === nurse.id);
        const code = assignment ? SHIFT_TYPE_INFO[assignment.shiftType]?.code || assignment.shiftType : 'L';
        if (assignment && (assignment.shiftType === 'PAGI' || assignment.shiftType === 'SIANG')) {
          totalWork++;
        }
        row.push(`"${code}"`);
      }
      row.push(String(totalWork));
      rows.push(row.join(','));
    });

    const csvContent = rows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Jadwal_Matriks_HD_${monthStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Copies TSV table to Clipboard for pasting directly into Google Sheets / Excel.
   */
  static async copyTableToClipboard(assignments: ShiftAssignment[], machines: Machine[]): Promise<boolean> {
    const rows: string[] = [];
    rows.push('Tanggal\tSif\tNama Perawat\tPeran\tAlokasi Mesin HD\tJumlah Mesin\tNo WhatsApp\tCatatan');

    assignments.forEach((a) => {
      const machineCodes = (a.assignedMachineIds || [])
        .map((id) => machines.find((m) => m.id === id)?.code)
        .filter(Boolean)
        .join(', ');
      const leaderStr = a.isLeader ? 'PJ Sif' : 'Pelaksana';
      const shiftLabel = SHIFT_TYPE_INFO[a.shiftType]?.label || a.shiftType;

      rows.push(`${a.date}\t${shiftLabel}\t${a.nurseName}\t${leaderStr}\t${machineCodes}\t${a.assignedMachineIds?.length || 0}\t${a.nursePhone}\t${a.notes || ''}`);
    });

    try {
      await navigator.clipboard.writeText(rows.join('\n'));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Ready-to-use Google Apps Script code for 2-Way Sync (GET & POST).
   * Generates calendar matrix format matching .xlsx template with automatic conditional colors.
   */
  static getGoogleAppsScriptTemplate(): string {
    return `// =============================================================================
// GOOGLE APPS SCRIPT WEBHOOK 2-ARAH UNTUK HEMOSHIFT HD
// Format Matriks Jadwal .xlsx (Kalender Bulanan) & Sinkronisasi Master HD
// =============================================================================
// CARA PEMASANGAN:
// 1. Buat Spreadsheet baru di Google Sheets (buka https://sheets.new)
// 2. Di menu atas, klik 'Extensions' (Ekstensi) > 'Apps Script'
// 3. Hapus semua kode bawaan, lalu tempel (paste) seluruh kode ini
// 4. Klik ikon Disket (Save / Simpan)
// 5. Di kanan atas, klik 'Deploy' (Terapkan) > 'New deployment' (Penerapan baru)
// 6. Pilih jenis: 'Web app'
// 7. Konfigurasi:
//    - Description: "HemoShift 2-Way Sync Matrix XLSX"
//    - Execute as: "Me" (Email Google Anda)
//    - Who has access: "Anyone" (Siapa saja)  <-- PENTING AGAR APLIKASI BISA AKSES
// 8. Klik 'Deploy', izinkan otorisasi akun Google Anda
// 9. Salin 'Web app URL' (akhiran /exec) dan tempelkan ke aplikasi HemoShift HD
// =============================================================================

function doPost(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var data = JSON.parse(e.postData.contents);
    var timestamp = new Date().toISOString();

    // Helper normalisasi tanggal untuk mencegah data tumpang tindih / terduplikasi
    function parseDateToYMD(val) {
      if (!val) return "";
      if (val instanceof Date) {
        var y = val.getFullYear();
        var m = ("0" + (val.getMonth() + 1)).slice(-2);
        var d = ("0" + val.getDate()).slice(-2);
        return y + "-" + m + "-" + d;
      }
      var str = String(val).trim();
      var isoMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
      if (isoMatch) {
        return isoMatch[1] + "-" + ("0" + isoMatch[2]).slice(-2) + "-" + ("0" + isoMatch[3]).slice(-2);
      }
      var dmyMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
      if (dmyMatch) {
        return dmyMatch[3] + "-" + ("0" + dmyMatch[2]).slice(-2) + "-" + ("0" + dmyMatch[1]).slice(-2);
      }
      return str.length >= 7 ? str.substring(0, 10) : str;
    }

    // Helper urutan shift: Shif Pagi didahulukan (rank 1), lalu Shif Siang (rank 2)
    function getShiftSortRank(shiftStr, codeStr) {
      var s = (String(shiftStr || '') + ' ' + String(codeStr || '')).toLowerCase();
      if (s.indexOf('pagi') > -1 || s.indexOf(' p') > -1 || s === 'p') return 1;
      if (s.indexOf('siang') > -1 || s.indexOf(' s') > -1 || s === 's') return 2;
      if (s.indexOf('malam') > -1 || s.indexOf(' m') > -1 || s === 'm') return 3;
      return 4;
    }

    // -------------------------------------------------------------
    // 0. Aksi Khusus: Hapus Semua Riwayat Tugas Khusus
    // -------------------------------------------------------------
    if (data.action === 'CLEAR_SPECIAL_TASKS') {
      var dutySchedSheetToClear = ss.getSheetByName("Jadwal Tugas Khusus");
      if (dutySchedSheetToClear) {
        dutySchedSheetToClear.clear();
        var dHeadersClean = [["Tanggal", "Hari", "Sif", "Kode Sif", "Nama Perawat", "Peran", "Tugas Khusus", "Catatan"]];
        dutySchedSheetToClear.getRange(1, 1, 1, 8).setValues(dHeadersClean);
        dutySchedSheetToClear.getRange(1, 1, 1, 8).setFontWeight("bold").setBackground("#0F766E").setFontColor("#FFFFFF");
      }
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        message: "Berhasil menghapus seluruh riwayat tugas khusus di tab Jadwal Tugas Khusus Google Sheets!"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // -------------------------------------------------------------
    // 0b. Aksi Khusus: Sinkronisasi Langsung Tugas Khusus
    // -------------------------------------------------------------
    if (data.action === 'SYNC_SPECIAL_TASKS') {
      var dutySchedSheetSync = ss.getSheetByName("Jadwal Tugas Khusus") || ss.insertSheet("Jadwal Tugas Khusus");
      var dHeadersSync = [["Tanggal", "Hari", "Sif", "Kode Sif", "Nama Perawat", "Peran", "Tugas Khusus", "Catatan"]];
      var targetMonthSync = data.month || "";
      var dayNamesListSync = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

      var existingDutyRowsSync = [];
      if (dutySchedSheetSync.getLastRow() > 1) {
        var numOldColsSync = dutySchedSheetSync.getLastColumn();
        var oldDutyValsSync = dutySchedSheetSync.getRange(2, 1, dutySchedSheetSync.getLastRow() - 1, numOldColsSync).getValues();
        for (var os = 0; os < oldDutyValsSync.length; os++) {
          var oRow = oldDutyValsSync[os];
          var dRowDate = parseDateToYMD(oRow[0]);
          if (!targetMonthSync || dRowDate.indexOf(targetMonthSync) !== 0) {
            existingDutyRowsSync.push([
              oRow[0] || "",
              oRow[1] || "",
              oRow[2] || "",
              oRow[3] || "",
              oRow[4] || "",
              oRow[5] || "",
              oRow[6] || "",
              numOldColsSync >= 9 ? (oRow[8] || oRow[7] || "") : (oRow[7] || "")
            ]);
          }
        }
      }

      var tasksToAddSync = data.dailySpecialTasks || data.specialTasks || [];
      var newDutySchedRowsSync = [];
      for (var tsi = 0; tsi < tasksToAddSync.length; tsi++) {
        var tsItem = tasksToAddSync[tsi];
        var tsDate = tsItem.date || "";
        var tsNurse = tsItem.nurseName || "";
        var tsCategory = tsItem.categoryName || tsItem.category || tsItem.title || "";
        if (tsDate && tsNurse && tsCategory) {
          var tsDay = "";
          var dtObjSync = new Date(tsDate);
          tsDay = isNaN(dtObjSync.getDay()) ? "" : dayNamesListSync[dtObjSync.getDay()];
          var sLabelSync = tsItem.shiftLabel || (String(tsItem.shift).toLowerCase() === "siang" ? "Siang" : "Pagi");
          var sCodeSync = (String(tsItem.shift).toLowerCase() === "siang" || sLabelSync === "Siang") ? "S" : "P";
          var tsRole = tsItem.nurseRole || tsItem.role || (String(tsCategory).toLowerCase().indexOf("pj") > -1 ? "PJ Sif / Katim" : "Perawat Pelaksana");
          var tsNotes = tsItem.description || tsItem.title || tsItem.notes || "";
          
          newDutySchedRowsSync.push([
            tsDate,
            tsDay,
            sLabelSync,
            sCodeSync,
            tsNurse,
            tsRole,
            tsCategory,
            tsNotes
          ]);
        }
      }

      var combinedDutyRowsSync = existingDutyRowsSync.concat(newDutySchedRowsSync);
      combinedDutyRowsSync.sort(function(a, b) {
        var dateA = String(a[0] || "");
        var dateB = String(b[0] || "");
        if (dateA !== dateB) {
          return dateA.localeCompare(dateB);
        }
        var rankA = getShiftSortRank(a[2], a[3]);
        var rankB = getShiftSortRank(b[2], b[3]);
        if (rankA !== rankB) {
          return rankA - rankB;
        }
        var nurseA = String(a[4] || "").toLowerCase();
        var nurseB = String(b[4] || "").toLowerCase();
        return nurseA.localeCompare(nurseB);
      });

      dutySchedSheetSync.clear();
      dutySchedSheetSync.getRange(1, 1, 1, 8)
        .setValues(dHeadersSync)
        .setBackground("#0F766E")
        .setFontColor("#FFFFFF")
        .setFontWeight("bold");

      dutySchedSheetSync.setFrozenRows(1);

      if (combinedDutyRowsSync.length > 0) {
        dutySchedSheetSync.getRange(2, 1, combinedDutyRowsSync.length, 8).setValues(combinedDutyRowsSync);
        dutySchedSheetSync.getRange(2, 1, combinedDutyRowsSync.length, 4).setHorizontalAlignment("center");
        dutySchedSheetSync.autoResizeColumns(1, 8);
      }

      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        message: "Berhasil menyinkronkan " + newDutySchedRowsSync.length + " tugas khusus ke tab Jadwal Tugas Khusus di Google Sheets!",
        tasksCount: newDutySchedRowsSync.length,
        timestamp: timestamp
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // -------------------------------------------------------------
    // 1. Matriks Jadwal HD (Persis Template .xlsx Kalender)
    // TAB BARU PER BULAN OTOMATIS: Tab bulan sebelumnya TIDAK DIHAPUS
    // -------------------------------------------------------------
    var matrixData = data.scheduleMatrix;
    var monthTitle = (matrixData && matrixData.formattedMonthTitle) ? matrixData.formattedMonthTitle : "";
    if (!monthTitle && data.month) {
      var mParts = String(data.month).split("-");
      if (mParts.length === 2) {
        var mNum = parseInt(mParts[1], 10);
        var yNum = mParts[0];
        var mNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
        monthTitle = (mNames[mNum - 1] || mParts[1]) + " " + yNum;
      } else {
        monthTitle = String(data.month);
      }
    }

    if (matrixData && matrixData.headers && matrixData.rows) {
      var sheetName = monthTitle ? ("Matriks HD - " + monthTitle) : "Matriks Jadwal HD";

      // CARI ATAU BUAT TAB BARU (Tab bulan lalu tetap aman dan tidak terhapus!)
      var matrixSheet = ss.getSheetByName(sheetName);
      if (!matrixSheet) {
        // Buat tab baru di urutan paling depan (indeks 0)
        matrixSheet = ss.insertSheet(sheetName, 0);
        try { matrixSheet.setTabColor("#0061A4"); } catch(err) {}
      } else {
        // Jika tab untuk bulan yang sama sudah pernah dikirim, bersihkan HANYA tab bulan ini untuk diperbarui
        matrixSheet.clear();
      }

      var mHeaders = [matrixData.headers];
      var mRows = matrixData.rows;
      var totalCols = matrixData.headers.length;
      var totalRows = mRows.length;
      var daysInMonth = matrixData.daysInMonth || 31;

      // Header Kolom (Warna Biru Medis Modern)
      matrixSheet.getRange(1, 1, 1, totalCols)
        .setValues(mHeaders)
        .setBackground("#0061A4")
        .setFontColor("#FFFFFF")
        .setFontWeight("bold")
        .setHorizontalAlignment("center")
        .setVerticalAlignment("middle");

      matrixSheet.setRowHeight(1, 32);

      // Isi Data Jadwal Perawat
      if (totalRows > 0) {
        matrixSheet.getRange(2, 1, totalRows, totalCols).setValues(mRows);

        // Perataan teks
        matrixSheet.getRange(2, 1, totalRows, 1).setHorizontalAlignment("center"); // No
        matrixSheet.getRange(2, 2, totalRows, 1).setHorizontalAlignment("left");   // Nama Perawat
        matrixSheet.getRange(2, 3, totalRows, 2).setHorizontalAlignment("center"); // NIP & Peran
        matrixSheet.getRange(2, 5, totalRows, totalCols - 4).setHorizontalAlignment("center"); // Hari 1..31 & Totals

        // Lebar kolom rapi
        matrixSheet.setColumnWidth(1, 38);  // No
        matrixSheet.setColumnWidth(2, 220); // Nama Perawat
        matrixSheet.setColumnWidth(3, 145); // NIP
        matrixSheet.setColumnWidth(4, 130); // Peran (Kepala Ruang / PJ Shif / Perawat Pelaksana)
        for (var c = 5; c <= 4 + daysInMonth; c++) {
          matrixSheet.setColumnWidth(c, 34); // Tanggal 1..31
        }
        for (var sc = 5 + daysInMonth; sc <= totalCols; sc++) {
          matrixSheet.setColumnWidth(sc, 72); // Kolom Total
        }

        // Kunci baris 1 dan kolom 1-4 (agar nama perawat tetap terlihat saat scroll ke tanggal akhir)
        matrixSheet.setFrozenRows(1);
        matrixSheet.setFrozenColumns(4);

        // Pewarnaan Otomatis (Conditional Formatting)
        var dayRange = matrixSheet.getRange(2, 5, totalRows, daysInMonth);
        var rules = [];

        // Pagi (P) - Biru Muda Sky
        rules.push(SpreadsheetApp.newConditionalFormatRule()
          .whenTextEqualTo("P")
          .setBackground("#E0F2FE")
          .setFontColor("#0369A1")
          .setBold(true)
          .setRanges([dayRange])
          .build());

        // Siang (S) - Oranye/Kuning Amber
        rules.push(SpreadsheetApp.newConditionalFormatRule()
          .whenTextEqualTo("S")
          .setBackground("#FEF3C7")
          .setFontColor("#B45309")
          .setBold(true)
          .setRanges([dayRange])
          .build());

        // 2 Shif (2S) - Indigo
        rules.push(SpreadsheetApp.newConditionalFormatRule()
          .whenTextEqualTo("2S")
          .setBackground("#EEF2FF")
          .setFontColor("#4338CA")
          .setBold(true)
          .setRanges([dayRange])
          .build());

        // Libur (L) - Abu-abu Elegan
        rules.push(SpreadsheetApp.newConditionalFormatRule()
          .whenTextEqualTo("L")
          .setBackground("#F1F5F9")
          .setFontColor("#64748B")
          .setRanges([dayRange])
          .build());

        // Cuti (C) - Ungu
        rules.push(SpreadsheetApp.newConditionalFormatRule()
          .whenTextEqualTo("C")
          .setBackground("#F3E8FF")
          .setFontColor("#7E22CE")
          .setBold(true)
          .setRanges([dayRange])
          .build());

        // Izin (I) - Ungu Muda
        rules.push(SpreadsheetApp.newConditionalFormatRule()
          .whenTextEqualTo("I")
          .setBackground("#EDE9FE")
          .setFontColor("#6D28D9")
          .setBold(true)
          .setRanges([dayRange])
          .build());

        // Sakit (SK) - Merah
        rules.push(SpreadsheetApp.newConditionalFormatRule()
          .whenTextEqualTo("SK")
          .setBackground("#FEE2E2")
          .setFontColor("#B91C1C")
          .setBold(true)
          .setRanges([dayRange])
          .build());

        matrixSheet.setConditionalFormatRules(rules);
      }

      // -------------------------------------------------------------
      // Baris Ringkasan Rekap Harian di Bawah Matriks (Persis Web)
      // -------------------------------------------------------------
      if (matrixData.summaryRows && matrixData.summaryRows.length > 0) {
        var sRows = matrixData.summaryRows;
        var startSummaryRow = totalRows + 3; // Beri 1 baris jarak pemisah
        var divRow = startSummaryRow - 1;
        matrixSheet.getRange(divRow, 1, 1, totalCols).setBackground("#F8FAFC");
        matrixSheet.setRowHeight(divRow, 12);

        matrixSheet.getRange(startSummaryRow, 1, sRows.length, totalCols).setValues(sRows);
        matrixSheet.getRange(startSummaryRow, 1, sRows.length, totalCols).setHorizontalAlignment("center");
        matrixSheet.getRange(startSummaryRow, 2, sRows.length, 1).setHorizontalAlignment("left");

        // Styling baris Sif Pagi
        matrixSheet.getRange(startSummaryRow, 1, 1, totalCols)
          .setBackground("#E0F2FE")
          .setFontWeight("bold")
          .setFontColor("#0369A1");

        // Styling baris Sif Siang
        matrixSheet.getRange(startSummaryRow + 1, 1, 1, totalCols)
          .setBackground("#FEF3C7")
          .setFontWeight("bold")
          .setFontColor("#B45309");

        // Styling baris Perbandingan Harian (P : S)
        matrixSheet.getRange(startSummaryRow + 2, 1, 1, totalCols)
          .setBackground("#CCFBF1")
          .setFontWeight("bold")
          .setFontColor("#115E59");

        // Styling baris Total Dinas
        matrixSheet.getRange(startSummaryRow + 3, 1, 1, totalCols)
          .setBackground("#E2E8F0")
          .setFontWeight("bold")
          .setFontColor("#0F172A");
      }
    }

    // -------------------------------------------------------------
    // 2. Simpan Data Perawat (Sheet: 'Data Perawat')
    // -------------------------------------------------------------
    if (data.nurses && Array.isArray(data.nurses)) {
      var nurseSheet = ss.getSheetByName("Data Perawat") || ss.insertSheet("Data Perawat");
      nurseSheet.clear();
      
      var nurseHeaders = [["ID", "Nama Perawat", "NIP", "No WhatsApp", "Peran", "Status Aktif", "Tugas Khusus", "Hari Libur Tetap"]];
      nurseSheet.getRange(1, 1, 1, 8)
        .setValues(nurseHeaders)
        .setBackground("#0D9488")
        .setFontColor("#FFFFFF")
        .setFontWeight("bold");

      var nurseRows = [];
      for (var n = 0; n < data.nurses.length; n++) {
        var itemN = data.nurses[n];
        var nName = (itemN.name || "").toUpperCase();
        var nRole = (itemN.role || "").toUpperCase();
        if (nName.indexOf("ADMIN") !== -1 || nRole === "ADMIN") continue;
        var roleLabel = itemN.role === "KARU" ? "Kepala Ruang" : itemN.role === "KATIM" ? "PJ Shif" : "Perawat Pelaksana";
        nurseRows.push([
          itemN.id || (n + 1),
          itemN.name || "",
          itemN.nip || "-",
          itemN.phone ? "'" + itemN.phone : "",
          roleLabel,
          itemN.isActive !== false ? "AKTIF" : "NONAKTIF",
          itemN.specialDuty || "",
          itemN.defaultOffDay !== undefined && itemN.defaultOffDay !== null ? itemN.defaultOffDay : ""
        ]);
      }

      if (nurseRows.length > 0) {
        nurseSheet.getRange(2, 1, nurseRows.length, 8).setValues(nurseRows);
        nurseSheet.autoResizeColumns(1, 8);
      }
    }

    // -------------------------------------------------------------
    // 3. Simpan Data Mesin (Sheet: 'Data Mesin')
    // -------------------------------------------------------------
    if (data.machines && Array.isArray(data.machines)) {
      var machineSheet = ss.getSheetByName("Data Mesin") || ss.insertSheet("Data Mesin");
      machineSheet.clear();

      var machineHeaders = [["ID", "Kode Mesin", "Nama Mesin", "Bay / Ruangan", "Kategori", "Status", "Brand Model", "Catatan"]];
      machineSheet.getRange(1, 1, 1, 8)
        .setValues(machineHeaders)
        .setBackground("#0284C7")
        .setFontColor("#FFFFFF")
        .setFontWeight("bold");

      var machineRows = [];
      for (var m = 0; m < data.machines.length; m++) {
        var itemM = data.machines[m];
        machineRows.push([
          itemM.id || (m + 1),
          itemM.code || "",
          itemM.name || "",
          itemM.bay || "Bay A (Reguler)",
          itemM.category || "REGULER",
          itemM.status || "AKTIF",
          itemM.brandModel || "",
          itemM.notes || ""
        ]);
      }

      if (machineRows.length > 0) {
        machineSheet.getRange(2, 1, machineRows.length, 8).setValues(machineRows);
        machineSheet.autoResizeColumns(1, 8);
      }
    }

    // -------------------------------------------------------------
    // 4. Simpan Daftar Bay (Sheet: 'Daftar Bay')
    // -------------------------------------------------------------
    if (data.bays && Array.isArray(data.bays)) {
      var baySheet = ss.getSheetByName("Daftar Bay") || ss.insertSheet("Daftar Bay");
      baySheet.clear();
      baySheet.getRange(1, 1, 1, 1).setValues([["Nama Bay / Ruangan"]]).setBackground("#475569").setFontColor("#FFFFFF").setFontWeight("bold");
      var bayRows = [];
      for (var b = 0; b < data.bays.length; b++) {
        if (data.bays[b]) bayRows.push([data.bays[b]]);
      }
      if (bayRows.length > 0) {
        baySheet.getRange(2, 1, bayRows.length, 1).setValues(bayRows);
        baySheet.autoResizeColumns(1, 1);
      }
    }

    // -------------------------------------------------------------
    // 5. Simpan Detail Alokasi Mesin (Sheet: 'Alokasi Mesin' / 'Jadwal HD (Detail Mesin)')
    // Menyimpan arsip data multi-bulan tanpa menimpa bulan lain
    // -------------------------------------------------------------
    if (data.assignments && Array.isArray(data.assignments)) {
      var schedSheet = ss.getSheetByName("Alokasi Mesin") || ss.getSheetByName("Jadwal Alokasi Mesin") || ss.getSheetByName("Jadwal HD (Detail Mesin)") || ss.getSheetByName("Jadwal HD") || ss.insertSheet("Alokasi Mesin");
      var targetMonthPrefix = data.month || "";
      var schedHeaders = [["ID", "Tanggal", "Sif", "Kode Sif", "ID Perawat", "Nama Perawat", "Peran", "Alokasi Mesin HD", "Jumlah Mesin", "Tugas Khusus", "Catatan"]];

      var existingRows = [];
      if (schedSheet.getLastRow() > 1) {
        var oldVals = schedSheet.getRange(2, 1, schedSheet.getLastRow() - 1, 11).getValues();
        for (var ex = 0; ex < oldVals.length; ex++) {
          var rowDate = parseDateToYMD(oldVals[ex][1]);
          if (!targetMonthPrefix || rowDate.indexOf(targetMonthPrefix) !== 0) {
            existingRows.push(oldVals[ex]);
          }
        }
      }

      var newSchedRows = [];
      for (var i = 0; i < data.assignments.length; i++) {
        var itemA = data.assignments[i];
        var mList = Array.isArray(itemA.machines) ? itemA.machines.join(", ") : (itemA.machines || "");
        var roleStr = itemA.isLeader ? "PJ Sif / Katim" : "Perawat Pelaksana";
        newSchedRows.push([
          itemA.id || (itemA.date + "-" + (itemA.nurseId || i)),
          itemA.date || "",
          itemA.shiftType || "",
          itemA.shiftCode || "",
          itemA.nurseId || "",
          itemA.nurseName || "",
          roleStr,
          mList,
          itemA.machineCount || 0,
          itemA.specialDuty || "",
          itemA.notes || ""
        ]);
      }

      var combinedRows = existingRows.concat(newSchedRows);
      // Urutkan data berdasarkan Tanggal (kronologis), didahului Shif Pagi lalu Shif Siang
      combinedRows.sort(function(a, b) {
        var dateA = String(a[1] || "");
        var dateB = String(b[1] || "");
        if (dateA !== dateB) {
          return dateA.localeCompare(dateB);
        }
        var rankA = getShiftSortRank(a[2], a[3]);
        var rankB = getShiftSortRank(b[2], b[3]);
        if (rankA !== rankB) {
          return rankA - rankB;
        }
        return String(a[5] || "").localeCompare(String(b[5] || ""));
      });

      schedSheet.clear();
      schedSheet.getRange(1, 1, 1, 11)
        .setValues(schedHeaders)
        .setBackground("#0061A4")
        .setFontColor("#FFFFFF")
        .setFontWeight("bold");

      schedSheet.setFrozenRows(1);

      if (combinedRows.length > 0) {
        schedSheet.getRange(2, 1, combinedRows.length, 11).setValues(combinedRows);
        schedSheet.getRange(2, 2, combinedRows.length, 3).setHorizontalAlignment("center");
        schedSheet.autoResizeColumns(1, 11);
      }
    }

    // -------------------------------------------------------------
    // 6. Simpan Data Dokter Jaga HD (Sheet: 'Data Dokter')
    // -------------------------------------------------------------
    if (data.doctors !== undefined) {
      var docSheet = ss.getSheetByName("Data Dokter") || ss.insertSheet("Data Dokter");
      docSheet.clear();

      var docHeaders = [["ID", "Nama Dokter", "SIP", "No WhatsApp", "Peran (DPJP / DOKTER_RUANGAN)", "Spesialisasi", "Status (AKTIF / NONAKTIF)"]];
      docSheet.getRange(1, 1, 1, 7)
        .setValues(docHeaders)
        .setBackground("#0F766E")
        .setFontColor("#FFFFFF")
        .setFontWeight("bold");

      docSheet.setFrozenRows(1);

      var docRows = [];
      if (Array.isArray(data.doctors)) {
        for (var d = 0; d < data.doctors.length; d++) {
          var docItem = data.doctors[d];
          docRows.push([
            docItem.id || (d + 1),
            docItem.name || "",
            docItem.sip || "",
            "'" + (docItem.phone || ""),
            docItem.role || "DOKTER_RUANGAN",
            docItem.specialization || "",
            docItem.isActive !== false ? "AKTIF" : "NONAKTIF"
          ]);
        }
      }

      if (docRows.length === 0) {
        // Berikan 1 baris kosong siap isi agar user dapat langsung mengetik nama dokter di Google Sheets
        docRows.push([1, "", "", "", "DOKTER_RUANGAN", "", "AKTIF"]);
      }

      docSheet.getRange(2, 1, docRows.length, 7).setValues(docRows);
      docSheet.autoResizeColumns(1, 7);
    }

    // -------------------------------------------------------------
    // 7. Simpan Jadwal Dokter Jaga HD (Tampilan Persis Seperti Sistem)
    // Urutan kronologis tanggal (1..31) & Tampilan Visual Lengkap
    // -------------------------------------------------------------
    if (data.doctorDuties && Array.isArray(data.doctorDuties)) {
      var indonesianDays = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

      // Helper status dinas
      function getDoctorDutyStatus(pName, sName, isSun) {
        if (isSun) return "Libur Rutin HD (Minggu)";
        var hasP = pName && pName !== "-" && pName.indexOf("Libur") === -1;
        var hasS = sName && sName !== "-" && sName.indexOf("Libur") === -1;
        if (hasP && hasS) {
          return pName === sName ? "2 Shif Sekaligus" : "Lengkap (2 Dr)";
        }
        if (hasP) return "Pagi Saja";
        if (hasS) return "Siang Saja";
        return "Belum Terisi";
      }

      // Normalisasi dan urutkan data tugas dokter berdasarkan tanggal ascending (1..31)
      var sortedDuties = data.doctorDuties.slice().sort(function(a, b) {
        var dA = parseDateToYMD(a.date);
        var dB = parseDateToYMD(b.date);
        return dA.localeCompare(dB);
      });

      // 7A. Buat Tab Khusus Bulanan: 'Jadwal Dokter - [Bulan Tahun]'
      if (monthTitle) {
        var docMonthSheetName = "Jadwal Dokter - " + monthTitle;
        var docMonthSheet = ss.getSheetByName(docMonthSheetName) || ss.insertSheet(docMonthSheetName);
        docMonthSheet.clear();

        try {
          ss.setActiveSheet(docMonthSheet);
          ss.moveActiveSheet(2); // Diletakkan di urutan ke-2 tepat setelah Matriks HD
        } catch (e) {}

        // 1. Judul Banner Atas
        docMonthSheet.getRange("A1:G1").merge()
          .setValue("JADWAL SHIFT DOKTER HEMODIALISA - " + monthTitle.toUpperCase())
          .setBackground("#0061A4")
          .setFontColor("#FFFFFF")
          .setFontWeight("bold")
          .setFontSize(13)
          .setHorizontalAlignment("center")
          .setVerticalAlignment("middle");
        docMonthSheet.setRowHeight(1, 36);

        // 2. Sub-judul Banner
        docMonthSheet.getRange("A2:G2").merge()
          .setValue("RS HAPPY LAND MEDICAL CENTRE | Shif Pagi (07:00 - 14:00) & Shif Siang (13:30 - 20:30) | 1 Dokter per Shif")
          .setBackground("#0284C7")
          .setFontColor("#FFFFFF")
          .setFontStyle("italic")
          .setFontSize(9)
          .setHorizontalAlignment("center")
          .setVerticalAlignment("middle");
        docMonthSheet.setRowHeight(2, 22);

        // 3. Header Tabel
        var docTableHeaders = [["No", "Tanggal", "Hari", "Dokter Shif Pagi (07:00 - 14:00)", "Dokter Shif Siang (13:30 - 20:30)", "Status Dinas", "Catatan"]];
        docMonthSheet.getRange(3, 1, 1, 7)
          .setValues(docTableHeaders)
          .setBackground("#1E40AF")
          .setFontColor("#FFFFFF")
          .setFontWeight("bold")
          .setFontSize(10)
          .setHorizontalAlignment("center")
          .setVerticalAlignment("middle");
        docMonthSheet.setRowHeight(3, 26);

        // 4. Data Baris Jadwal Dokter (Urut Tanggal 1..31)
        var monthDocRows = [];
        var monthRowBgs = [];
        var monthRowFontColors = [];
        var monthRowFontWeights = [];

        for (var mi = 0; mi < sortedDuties.length; mi++) {
          var item = sortedDuties[mi];
          var dObj = item.date ? new Date(item.date) : null;
          var isSun = item.isSunday !== undefined ? Boolean(item.isSunday) : (dObj ? dObj.getDay() === 0 : false);
          var dayName = item.dayName || (dObj && !isNaN(dObj.getDay()) ? indonesianDays[dObj.getDay()] : "");

          var pagiName = isSun ? "Libur Rutin HD (Hari Minggu)" : (item.pagiDoctorName || "-");
          var siangName = isSun ? "Libur Rutin HD (Hari Minggu)" : (item.siangDoctorName || "-");
          var dutyStatus = item.status || getDoctorDutyStatus(pagiName, siangName, isSun);
          var noteText = item.notes || (isSun ? "Libur Rutin HD (Hari Minggu)" : "");

          monthDocRows.push([
            mi + 1,
            item.date || "",
            dayName,
            pagiName,
            siangName,
            dutyStatus,
            noteText
          ]);

          if (isSun) {
            monthRowBgs.push(["#FFE4E6", "#FFE4E6", "#FFE4E6", "#FFE4E6", "#FFE4E6", "#FEE2E2", "#FFE4E6"]);
            monthRowFontColors.push(["#9F1239", "#9F1239", "#9F1239", "#BE123C", "#BE123C", "#B91C1C", "#9F1239"]);
            monthRowFontWeights.push(["bold", "normal", "bold", "normal", "normal", "bold", "normal"]);
          } else {
            var bgRow = mi % 2 === 1 ? "#F8FAFC" : "#FFFFFF";
            var statusBg = "#F1F5F9";
            var statusFont = "#334155";

            if (dutyStatus === "Lengkap (2 Dr)") {
              statusBg = "#D1FAE5"; statusFont = "#065F46";
            } else if (dutyStatus === "2 Shif Sekaligus") {
              statusBg = "#EDE9FE"; statusFont = "#5B21B6";
            } else if (dutyStatus === "Pagi Saja" || dutyStatus === "Siang Saja") {
              statusBg = "#FEF3C7"; statusFont = "#92400E";
            } else if (dutyStatus === "Belum Terisi") {
              statusBg = "#FFE4E6"; statusFont = "#9F1239";
            }

            monthRowBgs.push([bgRow, bgRow, bgRow, bgRow, bgRow, statusBg, bgRow]);
            monthRowFontColors.push(["#64748B", "#1E293B", "#1E293B", "#0F172A", "#0F172A", statusFont, "#64748B"]);
            monthRowFontWeights.push(["normal", "normal", "bold", "normal", "normal", "bold", "normal"]);
          }
        }

        if (monthDocRows.length > 0) {
          var dataRange = docMonthSheet.getRange(4, 1, monthDocRows.length, 7);
          dataRange.setValues(monthDocRows);
          dataRange.setBackgrounds(monthRowBgs);
          dataRange.setFontColors(monthRowFontColors);
          dataRange.setFontWeights(monthRowFontWeights);
          dataRange.setVerticalAlignment("middle");

          docMonthSheet.getRange(4, 1, monthDocRows.length, 3).setHorizontalAlignment("center");
          docMonthSheet.getRange(4, 4, monthDocRows.length, 2).setHorizontalAlignment("left");
          docMonthSheet.getRange(4, 6, monthDocRows.length, 1).setHorizontalAlignment("center");
          docMonthSheet.getRange(4, 7, monthDocRows.length, 1).setHorizontalAlignment("left");

          for (var rIdx = 0; rIdx < monthDocRows.length; rIdx++) {
            docMonthSheet.setRowHeight(4 + rIdx, 24);
          }

          dataRange.setBorder(true, true, true, true, true, true, "#CBD5E1", SpreadsheetApp.BorderStyle.SOLID);
        }

        docMonthSheet.setFrozenRows(3);
        docMonthSheet.autoResizeColumns(1, 7);

        // 5. Rekapitulasi Beban Jaga Dokter Bulan Ini (Summary Table)
        var startSummaryRow = 4 + monthDocRows.length + 2;
        docMonthSheet.getRange(startSummaryRow, 1, 1, 6).merge()
          .setValue("RINGKASAN BEBAN JAGA DOKTER - " + monthTitle.toUpperCase())
          .setBackground("#334155")
          .setFontColor("#FFFFFF")
          .setFontWeight("bold")
          .setFontSize(10)
          .setHorizontalAlignment("center")
          .setVerticalAlignment("middle");
        docMonthSheet.setRowHeight(startSummaryRow, 24);

        var summaryHeaders = [["No", "Nama Dokter", "Spesialisasi / Peran", "Total Dinas", "Shif Pagi", "Shif Siang"]];
        docMonthSheet.getRange(startSummaryRow + 1, 1, 1, 6)
          .setValues(summaryHeaders)
          .setBackground("#475569")
          .setFontColor("#FFFFFF")
          .setFontWeight("bold")
          .setFontSize(9)
          .setHorizontalAlignment("center")
          .setVerticalAlignment("middle");
        docMonthSheet.setRowHeight(startSummaryRow + 1, 22);

        var docStatsMap = {};
        if (data.doctors && Array.isArray(data.doctors)) {
          for (var docI = 0; docI < data.doctors.length; docI++) {
            var docObj = data.doctors[docI];
            docStatsMap[docObj.name] = {
              name: docObj.name,
              spec: docObj.specialization || "Dokter Ruangan HD",
              total: 0,
              pagi: 0,
              siang: 0
            };
          }
        }

        for (var sk = 0; sk < sortedDuties.length; sk++) {
          var sItem = sortedDuties[sk];
          var sSun = sItem.isSunday !== undefined ? Boolean(sItem.isSunday) : false;
          if (sSun) continue;

          var pDoc = sItem.pagiDoctorName;
          var sDoc = sItem.siangDoctorName;

          if (pDoc && pDoc !== "-" && pDoc.indexOf("Libur") === -1) {
            if (!docStatsMap[pDoc]) docStatsMap[pDoc] = { name: pDoc, spec: "Dokter HD", total: 0, pagi: 0, siang: 0 };
            docStatsMap[pDoc].pagi++;
            docStatsMap[pDoc].total++;
          }
          if (sDoc && sDoc !== "-" && sDoc.indexOf("Libur") === -1) {
            if (!docStatsMap[sDoc]) docStatsMap[sDoc] = { name: sDoc, spec: "Dokter HD", total: 0, pagi: 0, siang: 0 };
            docStatsMap[sDoc].siang++;
            docStatsMap[sDoc].total++;
          }
        }

        var docStatRows = [];
        var docStatKeys = Object.keys(docStatsMap);
        for (var dsk = 0; dsk < docStatKeys.length; dsk++) {
          var stat = docStatsMap[docStatKeys[dsk]];
          docStatRows.push([
            dsk + 1,
            stat.name,
            stat.spec,
            stat.total,
            stat.pagi,
            stat.siang
          ]);
        }

        if (docStatRows.length > 0) {
          var statRange = docMonthSheet.getRange(startSummaryRow + 2, 1, docStatRows.length, 6);
          statRange.setValues(docStatRows);
          statRange.setBackground("#F8FAFC");
          statRange.setFontSize(9);
          statRange.setBorder(true, true, true, true, true, true, "#E2E8F0", SpreadsheetApp.BorderStyle.SOLID);

          docMonthSheet.getRange(startSummaryRow + 2, 1, docStatRows.length, 1).setHorizontalAlignment("center");
          docMonthSheet.getRange(startSummaryRow + 2, 2, docStatRows.length, 2).setHorizontalAlignment("left");
          docMonthSheet.getRange(startSummaryRow + 2, 4, docStatRows.length, 3).setHorizontalAlignment("center").setFontWeight("bold");
        }
      }

      // 7B. Simpan Tab Master 'Jadwal Dokter HD' (Arsip Gabungan Semua Tanggal Berurutan)
      var dutySheet = ss.getSheetByName("Jadwal Dokter HD") || ss.insertSheet("Jadwal Dokter HD");
      var dutyHeaders = [["No", "Tanggal", "Hari", "Dokter Shif Pagi (07:00 - 14:00)", "Dokter Shif Siang (13:30 - 20:30)", "Status Dinas", "Catatan", "ID Dokter Pagi", "ID Dokter Siang"]];

      var existingDocRows = [];
      if (dutySheet.getLastRow() > 1) {
        var lastColNum = Math.max(dutySheet.getLastColumn(), 9);
        var oldDocVals = dutySheet.getRange(2, 1, dutySheet.getLastRow() - 1, lastColNum).getValues();
        var hasNo = String(dutySheet.getRange(1, 1).getValue() || "").trim().toLowerCase() === "no";
        var dateCol = hasNo ? 1 : 0;

        for (var ed = 0; ed < oldDocVals.length; ed++) {
          var docRowDate = parseDateToYMD(oldDocVals[ed][dateCol]);
          if (!targetMonthPrefix || docRowDate.indexOf(targetMonthPrefix) !== 0) {
            var oldRow = oldDocVals[ed];
            if (!hasNo) {
              existingDocRows.push([
                0,
                formatCellDate(oldRow[0]),
                String(oldRow[1] || ""),
                String(oldRow[2] || "-"),
                String(oldRow[3] || "-"),
                "-",
                String(oldRow[6] || ""),
                String(oldRow[4] || ""),
                String(oldRow[5] || "")
              ]);
            } else {
              existingDocRows.push(oldRow.slice(0, 9));
            }
          }
        }
      }

      var newDocRows = [];
      for (var k = 0; k < sortedDuties.length; k++) {
        var dutyItem = sortedDuties[k];
        var dDateObj = dutyItem.date ? new Date(dutyItem.date) : null;
        var isSunDay = dutyItem.isSunday !== undefined ? Boolean(dutyItem.isSunday) : (dDateObj ? dDateObj.getDay() === 0 : false);
        var dayStr = dutyItem.dayName || (dDateObj && !isNaN(dDateObj.getDay()) ? indonesianDays[dDateObj.getDay()] : "");

        var pDocName = isSunDay ? "Libur Rutin HD (Hari Minggu)" : (dutyItem.pagiDoctorName || "-");
        var sDocName = isSunDay ? "Libur Rutin HD (Hari Minggu)" : (dutyItem.siangDoctorName || "-");
        var st = dutyItem.status || getDoctorDutyStatus(pDocName, sDocName, isSunDay);

        newDocRows.push([
          0,
          dutyItem.date || "",
          dayStr,
          pDocName,
          sDocName,
          st,
          dutyItem.notes || (isSunDay ? "Libur Rutin HD (Hari Minggu)" : ""),
          dutyItem.pagiDoctorId || "",
          dutyItem.siangDoctorId || ""
        ]);
      }

      var combinedDocRows = existingDocRows.concat(newDocRows);
      combinedDocRows.sort(function(a, b) {
        var dateA = parseDateToYMD(a[1]);
        var dateB = parseDateToYMD(b[1]);
        return dateA.localeCompare(dateB);
      });

      for (var cn = 0; cn < combinedDocRows.length; cn++) {
        combinedDocRows[cn][0] = cn + 1;
      }

      dutySheet.clear();
      dutySheet.getRange(1, 1, 1, 9)
        .setValues(dutyHeaders)
        .setBackground("#0061A4")
        .setFontColor("#FFFFFF")
        .setFontWeight("bold")
        .setFontSize(10)
        .setHorizontalAlignment("center")
        .setVerticalAlignment("middle");

      dutySheet.setFrozenRows(1);

      if (combinedDocRows.length > 0) {
        var masterRange = dutySheet.getRange(2, 1, combinedDocRows.length, 9);
        masterRange.setValues(combinedDocRows);

        dutySheet.getRange(2, 1, combinedDocRows.length, 3).setHorizontalAlignment("center");
        dutySheet.getRange(2, 4, combinedDocRows.length, 2).setHorizontalAlignment("left");
        dutySheet.getRange(2, 6, combinedDocRows.length, 1).setHorizontalAlignment("center");
        dutySheet.getRange(2, 7, combinedDocRows.length, 3).setHorizontalAlignment("left");

        for (var ar = 0; ar < combinedDocRows.length; ar++) {
          var arDate = combinedDocRows[ar][1];
          var arDay = combinedDocRows[ar][2];
          if (arDay === "Minggu" || (arDate && new Date(arDate).getDay() === 0)) {
            dutySheet.getRange(2 + ar, 1, 1, 9).setBackground("#FFF1F2");
          }
        }

        dutySheet.autoResizeColumns(1, 9);
      }
    }

    // -------------------------------------------------------------
    // 8. Simpan Master Tugas Khusus (Sheet: 'Master Tugas Khusus')
    // -------------------------------------------------------------
    if (data.specialDutyOptions && Array.isArray(data.specialDutyOptions)) {
      var sdSheet = ss.getSheetByName("Master Tugas Khusus") || ss.getSheetByName("Tugas Khusus") || ss.insertSheet("Master Tugas Khusus");
      sdSheet.clear();

      var sdHeaders = [["Kode Tugas", "Singkatan", "Nama Lengkap / Label", "Deskripsi / Tugas Pokok", "Warna Tema", "Kode Hex Dot", "Kategori"]];
      sdSheet.getRange(1, 1, 1, 7)
        .setValues(sdHeaders)
        .setBackground("#6366F1")
        .setFontColor("#FFFFFF")
        .setFontWeight("bold");

      sdSheet.setFrozenRows(1);

      var sdRows = [];
      for (var s = 0; s < data.specialDutyOptions.length; s++) {
        var itemSD = data.specialDutyOptions[s];
        sdRows.push([
          itemSD.code || "",
          itemSD.shortName || itemSD.code || "",
          itemSD.label || "",
          itemSD.description || "",
          itemSD.colorName || "Biru",
          itemSD.dotColorHex || "#3b82f6",
          itemSD.isCustom ? "Kustom" : "Standar"
        ]);
      }

      if (sdRows.length > 0) {
        sdSheet.getRange(2, 1, sdRows.length, 7).setValues(sdRows);
        sdSheet.autoResizeColumns(1, 7);
      }
    }

    // -------------------------------------------------------------
    // 9. Simpan Jadwal Rekap Tugas Khusus (Sheet: 'Jadwal Tugas Khusus')
    // Menyimpan rekap tugas khusus multi-bulan: Urut tanggal & Shif Pagi lalu Siang.
    // Catatan: Data Alokasi Mesin terdapat pada sheet terpisah ('Alokasi Mesin')
    // -------------------------------------------------------------
    var shouldSyncDutySheet = (!data.isPartialSync && (data.assignments || data.dailySpecialTasks || data.specialTasks)) ||
                             (data.syncSpecialTasks === true) ||
                             ((data.dailySpecialTasks || data.specialTasks) && data.syncSpecialTasks !== false);

    if (shouldSyncDutySheet && ((data.assignments && Array.isArray(data.assignments)) || (data.dailySpecialTasks && Array.isArray(data.dailySpecialTasks)) || (data.specialTasks && Array.isArray(data.specialTasks)))) {
      var dutySchedSheet = ss.getSheetByName("Jadwal Tugas Khusus") || ss.insertSheet("Jadwal Tugas Khusus");
      var dHeaders = [["Tanggal", "Hari", "Sif", "Kode Sif", "Nama Perawat", "Peran", "Tugas Khusus", "Catatan"]];
      var targetMonthPrefix = data.month || "";
      var dayNamesList = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

      var existingDutyRows = [];
      if (dutySchedSheet.getLastRow() > 1) {
        var numOldCols = dutySchedSheet.getLastColumn();
        var oldDutyVals = dutySchedSheet.getRange(2, 1, dutySchedSheet.getLastRow() - 1, numOldCols).getValues();
        for (var od = 0; od < oldDutyVals.length; od++) {
          var oldRow = oldDutyVals[od];
          var dutyRowDate = parseDateToYMD(oldRow[0]);
          if (!targetMonthPrefix || dutyRowDate.indexOf(targetMonthPrefix) !== 0) {
            // Kompatibilitas jika format lama memiliki kolom 'Alokasi Mesin' di index 7 (9 kolom)
            if (numOldCols >= 9) {
              existingDutyRows.push([
                oldRow[0] || "",
                oldRow[1] || "",
                oldRow[2] || "",
                oldRow[3] || "",
                oldRow[4] || "",
                oldRow[5] || "",
                oldRow[6] || "",
                oldRow[8] || oldRow[7] || ""
              ]);
            } else {
              existingDutyRows.push([
                oldRow[0] || "",
                oldRow[1] || "",
                oldRow[2] || "",
                oldRow[3] || "",
                oldRow[4] || "",
                oldRow[5] || "",
                oldRow[6] || "",
                oldRow[7] || ""
              ]);
            }
          }
        }
      }

      var newDutySchedRows = [];
      // 1. Prioritaskan data penugasan tugas khusus harian yang di-inputkan di tab Tugas Khusus
      var primaryTasks = (data.dailySpecialTasks && Array.isArray(data.dailySpecialTasks) && data.dailySpecialTasks.length > 0)
        ? data.dailySpecialTasks
        : (data.specialTasks && Array.isArray(data.specialTasks))
        ? data.specialTasks
        : [];

      for (var pt = 0; pt < primaryTasks.length; pt++) {
        var pItem = primaryTasks[pt];
        var pDate = pItem.date || "";
        var pNurse = pItem.nurseName || "";
        var pCategory = pItem.categoryName || pItem.category || pItem.title || "";
        if (pDate && pNurse && pCategory) {
          var pDay = "";
          var pDtObj = new Date(pDate);
          pDay = isNaN(pDtObj.getDay()) ? "" : dayNamesList[pDtObj.getDay()];
          var pShiftLabel = pItem.shiftLabel || (String(pItem.shift).toLowerCase() === "siang" ? "Siang" : "Pagi");
          var pShiftCode = (String(pItem.shift).toLowerCase() === "siang" || pShiftLabel === "Siang") ? "S" : "P";
          var pRole = pItem.nurseRole || pItem.role || (String(pCategory).toLowerCase().indexOf("pj") > -1 ? "PJ Sif / Katim" : "Perawat Pelaksana");
          var pNotes = pItem.description || pItem.title || pItem.notes || "";

          newDutySchedRows.push([
            pDate,
            pDay,
            pShiftLabel,
            pShiftCode,
            pNurse,
            pRole,
            pCategory,
            pNotes
          ]);
        }
      }

      // 2. Tambahkan penugasan dari matriks assignments (jika ada specialDuty spesifik dan belum tercatat)
      if (data.assignments && Array.isArray(data.assignments)) {
        for (var ai = 0; ai < data.assignments.length; ai++) {
          var aRow = data.assignments[ai];
          if (aRow.specialDuty && String(aRow.specialDuty).trim()) {
            var aDate = aRow.date || "";
            var aNurse = aRow.nurseName || "";
            var aDuty = aRow.specialDuty;
            var isAlreadyIncluded = false;
            for (var c = 0; c < newDutySchedRows.length; c++) {
              if (newDutySchedRows[c][0] === aDate && String(newDutySchedRows[c][4]).toLowerCase() === String(aNurse).toLowerCase()) {
                isAlreadyIncluded = true;
                break;
              }
            }
            if (!isAlreadyIncluded) {
              var aDay = "";
              if (aDate) {
                var aDt = new Date(aDate);
                aDay = isNaN(aDt.getDay()) ? "" : dayNamesList[aDt.getDay()];
              }
              newDutySchedRows.push([
                aDate,
                aDay,
                aRow.shiftType || "Pagi",
                aRow.shiftCode || "P",
                aNurse,
                aRow.isLeader ? "PJ Sif / Katim" : "Perawat Pelaksana",
                aDuty,
                aRow.notes || ""
              ]);
            }
          }
        }
      }

      var combinedDutyRows = existingDutyRows.concat(newDutySchedRows);

      // Urutkan data berdasarkan Tanggal (kronologis), didahului Shif Pagi lalu Shif Siang
      combinedDutyRows.sort(function(a, b) {
        var dateA = String(a[0] || "");
        var dateB = String(b[0] || "");
        if (dateA !== dateB) {
          return dateA.localeCompare(dateB);
        }
        // Pada tanggal yang sama, urutkan Shif Pagi dahulu lalu Shif Siang
        var rankA = getShiftSortRank(a[2], a[3]);
        var rankB = getShiftSortRank(b[2], b[3]);
        if (rankA !== rankB) {
          return rankA - rankB;
        }
        // Jika sif sama, urutkan berdasarkan nama perawat
        var nurseA = String(a[4] || "").toLowerCase();
        var nurseB = String(b[4] || "").toLowerCase();
        return nurseA.localeCompare(nurseB);
      });

      dutySchedSheet.clear();
      dutySchedSheet.getRange(1, 1, 1, 8)
        .setValues(dHeaders)
        .setBackground("#0F766E")
        .setFontColor("#FFFFFF")
        .setFontWeight("bold");

      dutySchedSheet.setFrozenRows(1);

      if (combinedDutyRows.length > 0) {
        dutySchedSheet.getRange(2, 1, combinedDutyRows.length, 8).setValues(combinedDutyRows);
        dutySchedSheet.getRange(2, 1, combinedDutyRows.length, 4).setHorizontalAlignment("center");
        dutySchedSheet.autoResizeColumns(1, 8);
      }
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      message: "Berhasil menyinkronkan data perawat, mesin, bay, dokter, tugas khusus & jadwal HD ke Google Sheets!",
      timestamp: timestamp
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// -------------------------------------------------------------
// GET Endpoint: Membaca Seluruh Data Master & Matriks Jadwal untuk Aplikasi (Sinkronisasi 2-Arah)
// -------------------------------------------------------------
function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var paramMonth = (e && e.parameter && e.parameter.month) ? String(e.parameter.month).trim() : "";
    var now = new Date();
    var defaultYear = now.getFullYear();
    var defaultMonth = now.getMonth() + 1;

    // Helper untuk konversi objek Tanggal atau string tanggal ke format ISO YYYY-MM-DD
    function formatCellDate(val) {
      if (!val) return "";
      if (val instanceof Date) {
        var y = val.getFullYear();
        var m = ("0" + (val.getMonth() + 1)).slice(-2);
        var d = ("0" + val.getDate()).slice(-2);
        return y + "-" + m + "-" + d;
      }
      var str = String(val).trim();
      if (/^\\d{1,2}[\\/\\-]\\d{1,2}[\\/\\-]\\d{4}$/.test(str)) {
        var parts = str.split(/[\\/\\-]/);
        var p0 = ("0" + parts[0]).slice(-2);
        var p1 = ("0" + parts[1]).slice(-2);
        var p2 = parts[2];
        return p2 + "-" + p1 + "-" + p0;
      }
      if (/^\\d{4}-\\d{2}-\\d{2}/.test(str)) {
        return str.substring(0, 10);
      }
      return str;
    }

    if (paramMonth && paramMonth.indexOf("-") > -1) {
      var mParts = paramMonth.split("-");
      defaultYear = parseInt(mParts[0], 10) || defaultYear;
      defaultMonth = parseInt(mParts[1], 10) || defaultMonth;
    }

    // 1. Baca Data Perawat
    var nurses = [];
    var nurseSheet = ss.getSheetByName("Data Perawat");
    if (nurseSheet && nurseSheet.getLastRow() > 1) {
      var nurseValues = nurseSheet.getRange(2, 1, nurseSheet.getLastRow() - 1, 8).getValues();
      for (var i = 0; i < nurseValues.length; i++) {
        var r = nurseValues[i];
        var name = String(r[1] || "").trim();
        if (name) {
          nurses.push({
            id: Number(r[0]) || (i + 1),
            name: name,
            nip: String(r[2] || "").trim(),
            phone: String(r[3] || "").replace(/^'/, "").trim(),
            role: String(r[4] || "PELAKSANA").trim(),
            isActive: String(r[5]).toUpperCase() !== "NONAKTIF",
            specialDuty: r[6] ? String(r[6]).trim() : null,
            defaultOffDay: r[7] !== "" && r[7] !== null ? Number(r[7]) : null,
            skillLevel: "Senior",
            isPermanent: true
          });
        }
      }
    }

    // 2. Baca Data Mesin
    var machines = [];
    var machineSheet = ss.getSheetByName("Data Mesin");
    if (machineSheet && machineSheet.getLastRow() > 1) {
      var machineValues = machineSheet.getRange(2, 1, machineSheet.getLastRow() - 1, 8).getValues();
      for (var j = 0; j < machineValues.length; j++) {
        var rm = machineValues[j];
        var code = String(rm[1] || "").trim();
        if (code) {
          machines.push({
            id: Number(rm[0]) || (j + 1),
            code: code,
            name: String(rm[2] || ("Mesin " + code)).trim(),
            bay: String(rm[3] || "Bay A (Reguler)").trim(),
            category: String(rm[4] || "REGULER").trim(),
            status: String(rm[5] || "AKTIF").trim(),
            brandModel: String(rm[6] || "").trim(),
            notes: String(rm[7] || "").trim()
          });
        }
      }
    }

    // 3. Baca Data Bay: Hanya bay/area yang memiliki mesin terpasang
    var bays = [];
    var baySet = {};
    for (var mb = 0; mb < machines.length; mb++) {
      var mBay = machines[mb].bay || machines[mb].zone;
      if (mBay && !baySet[mBay]) {
        baySet[mBay] = true;
        bays.push(mBay);
      }
    }

    // 4. Baca Master Tugas Khusus
    var specialDuties = [];
    var sdSheetRead = ss.getSheetByName("Master Tugas Khusus") || ss.getSheetByName("Tugas Khusus");
    if (sdSheetRead && sdSheetRead.getLastRow() > 1) {
      var sdVals = sdSheetRead.getRange(2, 1, sdSheetRead.getLastRow() - 1, 7).getValues();
      for (var sdi = 0; sdi < sdVals.length; sdi++) {
        var sRow = sdVals[sdi];
        var sCode = String(sRow[0] || "").trim().toUpperCase();
        if (sCode) {
          specialDuties.push({
            code: sCode,
            shortName: String(sRow[1] || sCode).trim(),
            label: String(sRow[2] || ("Tugas Khusus " + sCode)).trim(),
            description: String(sRow[3] || "").trim(),
            colorName: String(sRow[4] || "Biru").trim(),
            dotColorHex: String(sRow[5] || "#3b82f6").trim(),
            isCustom: String(sRow[6] || "").toLowerCase() === "kustom"
          });
        }
      }
    }

    // 5. Peta Alokasi Mesin dan Tugas Khusus dari Sheet Detail & Rekap Tugas Khusus
    var machineMap = {};
    var dutyMap = {};
    var detailSheet = ss.getSheetByName("Alokasi Mesin") || ss.getSheetByName("Jadwal Alokasi Mesin") || ss.getSheetByName("Jadwal HD (Detail Mesin)") || ss.getSheetByName("Jadwal HD");
    if (detailSheet && detailSheet.getLastRow() > 1) {
      var detailVals = detailSheet.getRange(2, 1, detailSheet.getLastRow() - 1, 11).getValues();
      for (var d = 0; d < detailVals.length; d++) {
        var dr = detailVals[d];
        var dDate = formatCellDate(dr[1]);
        var dNurse = String(dr[5] || "").trim().toLowerCase();
        var dMachines = String(dr[7] || "").split(/[,;\s]+/).filter(Boolean);
        var dDuty = dr[9] ? String(dr[9]).trim() : "";
        if (dDate && dNurse) {
          var key = dDate + "_" + dNurse;
          machineMap[key] = dMachines;
          if (dDuty) {
            dutyMap[key] = dDuty;
          }
        }
      }
    }

    // Lengkapi dutyMap dari sheet 'Jadwal Tugas Khusus' jika ada (alokasi mesin berada di sheet terpisah)
    var dutySchedSheetRead = ss.getSheetByName("Jadwal Tugas Khusus");
    if (dutySchedSheetRead && dutySchedSheetRead.getLastRow() > 1) {
      var numReadCols = Math.min(dutySchedSheetRead.getLastColumn(), 8);
      var dutySchedVals = dutySchedSheetRead.getRange(2, 1, dutySchedSheetRead.getLastRow() - 1, numReadCols).getValues();
      for (var dsi = 0; dsi < dutySchedVals.length; dsi++) {
        var dsr = dutySchedVals[dsi];
        var dsDate = formatCellDate(dsr[0]);
        var dsNurse = String(dsr[4] || "").trim().toLowerCase();
        var dsDuty = String(dsr[6] || "").trim();
        if (dsDate && dsNurse && dsDuty) {
          var dsKey = dsDate + "_" + dsNurse;
          dutyMap[dsKey] = dutyMap[dsKey] ? (dutyMap[dsKey] + ", " + dsDuty) : dsDuty;
        }
      }
    }

    // 6. Baca Jadwal Perawat: Prioritas baca tab khusus bulan (misal 'Matriks HD - September 2026') atau 'Matriks Jadwal HD'
    var assignments = [];
    var matrixSheet = null;

    if (paramMonth) {
      var mNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
      var expectedTitle = "";
      if (paramMonth.indexOf("-") > -1) {
        var pParts = paramMonth.split("-");
        var pYear = pParts[0];
        var pMonthNum = parseInt(pParts[1], 10);
        if (pMonthNum >= 1 && pMonthNum <= 12) {
          expectedTitle = mNames[pMonthNum - 1] + " " + pYear;
        }
      }

      if (expectedTitle) {
        matrixSheet = ss.getSheetByName("Matriks HD - " + expectedTitle) ||
                      ss.getSheetByName("Matriks Jadwal - " + expectedTitle) ||
                      ss.getSheetByName("Matriks HD " + expectedTitle);
      }
      if (!matrixSheet) {
        matrixSheet = ss.getSheetByName("Matriks HD - " + paramMonth) ||
                      ss.getSheetByName("Matriks Jadwal " + paramMonth) ||
                      ss.getSheetByName("Jadwal " + paramMonth);
      }
    }

    if (!matrixSheet) {
      matrixSheet = ss.getSheetByName("Matriks Jadwal HD");
    }

    // Jika belum ketemu, cari tab pertama yang namanya berawalan 'Matriks HD'
    if (!matrixSheet) {
      var allSheets = ss.getSheets();
      for (var s = 0; s < allSheets.length; s++) {
        var sName = allSheets[s].getName();
        if (sName.indexOf("Matriks HD") === 0) {
          matrixSheet = allSheets[s];
          break;
        }
      }
    }

    if (matrixSheet && matrixSheet.getLastRow() > 1) {
      var mHeaders = matrixSheet.getRange(1, 1, 1, matrixSheet.getLastColumn()).getValues()[0];
      var mData = matrixSheet.getRange(2, 1, matrixSheet.getLastRow() - 1, matrixSheet.getLastColumn()).getValues();

      // Cari kolom hari (1..31)
      var dayCols = [];
      for (var col = 0; col < mHeaders.length; col++) {
        var hVal = String(mHeaders[col] || "").trim();
        var num = parseInt(hVal, 10);
        if (!isNaN(num) && num >= 1 && num <= 31) {
          dayCols.push({ colIndex: col, day: num });
        }
      }

      // Cari kolom nama perawat (biasanya kolom 2, index 1)
      var nameCol = 1;
      for (var hc = 0; hc < Math.min(mHeaders.length, 4); hc++) {
        var colNameStr = String(mHeaders[hc] || "").toLowerCase();
        if (colNameStr.indexOf("nama") > -1) {
          nameCol = hc;
          break;
        }
      }

      for (var rIdx = 0; rIdx < mData.length; rIdx++) {
        var row = mData[rIdx];
        var nurseName = String(row[nameCol] || "").trim();
        if (!nurseName) continue;

        // Lewati baris ringkasan rekapitulasi harian / footer di bawah tabel
        var lowerName = nurseName.toLowerCase();
        if (lowerName.indexOf("sif pagi") > -1 ||
            lowerName.indexOf("sif siang") > -1 ||
            lowerName.indexOf("katim") > -1 ||
            lowerName.indexOf("total dinas") > -1 ||
            lowerName.indexOf("rekap") > -1) {
          continue;
        }

        // Cari ID perawat yang cocok jika ada
        var matchedNurse = null;
        for (var nIdx = 0; nIdx < nurses.length; nIdx++) {
          if (nurses[nIdx].name.toLowerCase() === nurseName.toLowerCase() ||
              nurseName.toLowerCase().indexOf(nurses[nIdx].name.toLowerCase()) > -1) {
            matchedNurse = nurses[nIdx];
            break;
          }
        }
        var nurseId = matchedNurse ? matchedNurse.id : (1000 + rIdx);
        var isLeader = matchedNurse ? (matchedNurse.role === "KATIM" || matchedNurse.role === "KARU") : false;

        for (var dayIdx = 0; dayIdx < dayCols.length; dayIdx++) {
          var dInfo = dayCols[dayIdx];
          var cellCode = String(row[dInfo.colIndex] || "").trim().toUpperCase();
          if (!cellCode) cellCode = "L";

          var shiftType = "LIBUR";
          var shiftCode = "L";

          if (cellCode.indexOf("P") === 0 || cellCode.indexOf("PAGI") > -1) {
            shiftType = "PAGI";
            shiftCode = "P";
          } else if (cellCode.indexOf("S") === 0 && cellCode.indexOf("SK") !== 0 && cellCode.indexOf("SAKIT") === -1) {
            shiftType = "SIANG";
            shiftCode = "S";
          } else if (cellCode.indexOf("C") === 0 || cellCode.indexOf("CUTI") > -1) {
            shiftType = "CUTI";
            shiftCode = "C";
          } else if (cellCode.indexOf("SK") === 0 || cellCode.indexOf("SAKIT") > -1) {
            shiftType = "SAKIT";
            shiftCode = "SK";
          }

          var dateStr = defaultYear + "-" + ("0" + defaultMonth).slice(-2) + "-" + ("0" + dInfo.day).slice(-2);
          var key = dateStr + "_" + nurseName.toLowerCase();
          var mList = machineMap[key] || [];
          var sDuty = dutyMap[key] || (matchedNurse ? matchedNurse.specialDuty : null);

          assignments.push({
            id: "asg-" + dateStr + "-" + nurseId,
            date: dateStr,
            shiftType: shiftType,
            shiftCode: shiftCode,
            nurseId: nurseId,
            nurseName: nurseName,
            isLeader: isLeader,
            machines: mList,
            machineCount: mList.length,
            specialDuty: sDuty,
            notes: (cellCode !== "P" && cellCode !== "S" && cellCode !== "L" && cellCode !== "C" && cellCode !== "SK") ? cellCode : ""
          });
        }
      }
    } else if (detailSheet && detailSheet.getLastRow() > 1) {
      // Fallback baca format baris jika Matriks belum dibuat
      var schedValues = detailSheet.getRange(2, 1, detailSheet.getLastRow() - 1, 11).getValues();
      for (var k = 0; k < schedValues.length; k++) {
        var sa = schedValues[k];
        var aDate = formatCellDate(sa[1]);
        var aNurse = String(sa[5] || "").trim();
        if (aDate && aNurse) {
          assignments.push({
            id: String(sa[0] || (aDate + "-" + k)),
            date: aDate,
            shiftType: String(sa[2] || "LIBUR").trim(),
            shiftCode: String(sa[3] || "L").trim(),
            nurseId: Number(sa[4]) || 0,
            nurseName: aNurse,
            isLeader: String(sa[6]).indexOf("PJ") > -1 || String(sa[6]).indexOf("Katim") > -1,
            machines: String(sa[7] || "").split(/[,;\\s]+/).filter(Boolean),
            specialDuty: sa[9] ? String(sa[9]).trim() : null,
            notes: String(sa[10] || "").trim()
          });
        }
      }
    }

    // 7. Baca Data Dokter
    var doctors = [];
    var docSheet = ss.getSheetByName("Data Dokter");
    if (docSheet && docSheet.getLastRow() > 1) {
      var docVals = docSheet.getRange(2, 1, docSheet.getLastRow() - 1, 7).getValues();
      for (var di = 0; di < docVals.length; di++) {
        var dr = docVals[di];
        var dName = String(dr[1] || "").trim();
        if (dName) {
          doctors.push({
            id: Number(dr[0]) || (di + 1),
            name: dName,
            sip: String(dr[2] || "").trim(),
            phone: String(dr[3] || "").replace(/^'/, "").trim(),
            role: String(dr[4] || "DOKTER_RUANGAN").trim(),
            specialization: String(dr[5] || "").trim(),
            isActive: String(dr[6]).toUpperCase() !== "NONAKTIF"
          });
        }
      }
    }

    // 8. Baca Jadwal Dokter HD
    var doctorDuties = [];
    var dutySheet = ss.getSheetByName("Jadwal Dokter HD");
    if (dutySheet && dutySheet.getLastRow() > 1) {
      var lastDutyCol = Math.max(dutySheet.getLastColumn(), 7);
      var dutyVals = dutySheet.getRange(2, 1, dutySheet.getLastRow() - 1, lastDutyCol).getValues();
      var firstHdr = String(dutySheet.getRange(1, 1).getValue() || "").trim().toLowerCase();
      var hasNoCol = firstHdr === "no";
      var dateIdx = hasNoCol ? 1 : 0;
      var pagiIdx = hasNoCol ? 3 : 2;
      var siangIdx = hasNoCol ? 4 : 3;
      var notesIdx = hasNoCol ? 6 : 6;
      var idPagiIdx = hasNoCol ? 7 : 4;
      var idSiangIdx = hasNoCol ? 8 : 5;

      for (var dy = 0; dy < dutyVals.length; dy++) {
        var dRow = dutyVals[dy];
        var dyDate = formatCellDate(dRow[dateIdx]);

        if (dyDate) {
          doctorDuties.push({
            date: dyDate,
            pagiDoctorName: String(dRow[pagiIdx] || "-").trim(),
            siangDoctorName: String(dRow[siangIdx] || "-").trim(),
            pagiDoctorId: Number(dRow[idPagiIdx]) || null,
            siangDoctorId: Number(dRow[idSiangIdx]) || null,
            notes: String(dRow[notesIdx] || "").trim()
          });
        }
      }
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      nurses: nurses,
      machines: machines,
      bays: bays,
      specialDutyOptions: specialDuties,
      assignments: assignments,
      doctors: doctors,
      doctorDuties: doctorDuties,
      timestamp: new Date().toISOString()
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}`;
  }

  /**
   * Ekspor Daftar Dokter Jaga HD ke format file CSV
   */
  static exportDoctorsToCSV(doctors: Doctor[]) {
    const headers = ['ID', 'Nama Dokter', 'SIP', 'No WhatsApp', 'Peran', 'Spesialisasi', 'Status'];
    const rows = [headers.join(',')];
    doctors.forEach((d) => {
      rows.push([
        d.id,
        `"${(d.name || '').replace(/"/g, '""')}"`,
        `"${(d.sip || '').replace(/"/g, '""')}"`,
        `"'${d.phone || ''}"`,
        `"${d.role}"`,
        `"${(d.specialization || '').replace(/"/g, '""')}"`,
        d.isActive !== false ? 'AKTIF' : 'NONAKTIF',
      ].join(','));
    });

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + rows.join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Master_Dokter_HD_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  /**
   * Ekspor Jadwal Dokter Jaga HD ke format file CSV
   */
  static exportDoctorScheduleToCSV(
    monthString: string,
    doctorDuties: Record<string, DoctorShiftDuty>,
    doctors: Doctor[]
  ) {
    const parts = monthString.split('-');
    const year = parseInt(parts[0], 10) || new Date().getFullYear();
    const month = parseInt(parts[1], 10) || new Date().getMonth() + 1;
    const daysInMonth = new Date(year, month, 0).getDate();

    const headers = ['No', 'Tanggal', 'Hari', 'Dokter Shift Pagi (07:00 - 14:00)', 'Dokter Shift Siang (13:30 - 20:30)', 'Status Dinas', 'Catatan'];
    const rows = [headers.join(',')];

    const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayOfWeek = new Date(year, month - 1, d).getDay();
      const isSunday = dayOfWeek === 0;
      const duty = doctorDuties[dateStr];

      const rawPagi = duty?.pagiDoctorName || (duty?.pagiDoctorId ? doctors.find((doc) => doc.id === duty.pagiDoctorId)?.name : '-') || '-';
      const rawSiang = duty?.siangDoctorName || (duty?.siangDoctorId ? doctors.find((doc) => doc.id === duty.siangDoctorId)?.name : '-') || '-';
      const pagiDoc = isSunday ? '-' : rawPagi;
      const siangDoc = isSunday ? '-' : rawSiang;

      let status = 'Belum Terisi';
      if (isSunday) {
        status = 'Libur Rutin HD (Minggu)';
      } else if (pagiDoc !== '-' && siangDoc !== '-') {
        status = pagiDoc === siangDoc ? '2 Shif Sekaligus' : 'Lengkap (2 Dr)';
      } else if (pagiDoc !== '-') {
        status = 'Pagi Saja';
      } else if (siangDoc !== '-') {
        status = 'Siang Saja';
      }

      const notes = (isSunday ? 'Libur Rutin HD (Hari Minggu)' : (duty?.notes || '')).replace(/"/g, '""');

      rows.push([d, dateStr, dayNames[dayOfWeek], `"${pagiDoc}"`, `"${siangDoc}"`, `"${status}"`, `"${notes}"`].join(','));
    }

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + rows.join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Jadwal_Dokter_HD_${monthString}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

