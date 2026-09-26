export type UserRole = 'admin' | 'kepala_ruangan' | 'pj_shift' | 'katim' | 'dokter' | 'perawat' | 'karu' | 'nurse';

export type ShiftType = 
  | 'pagi' 
  | 'siang' 
  | 'libur' 
  | 'cuti' 
  | 'izin' 
  | 'sakit' 
  | 'pagi_siang'
  | 'PAGI'
  | 'SIANG'
  | 'LIBUR'
  | 'CUTI'
  | 'SAKIT';

export type NurseRole = 'KARU' | 'KATIM' | 'PELAKSANA';

export type HeadNurseReportFormat = 'RINGKAS' | 'NAMA_PERAWAT';

export interface NurseRoleInfo {
  title: string;
  badgeClass: string;
}

export const NURSE_ROLE_INFO: Record<NurseRole, NurseRoleInfo> = {
  KARU: { title: 'Kepala Ruangan', badgeClass: 'bg-amber-100 text-amber-800 border-amber-300' },
  KATIM: { title: 'PJ Sif / Katim', badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-300' },
  PELAKSANA: { title: 'Perawat Pelaksana', badgeClass: 'bg-blue-50 text-blue-700 border-blue-200' },
};

export interface UserAccount {
  id: string;
  username: string;
  password: string; // Plaintext for demo/management by administrator
  name: string;
  nickname?: string; // Nama panggilan (e.g. "Fransisca", "Haikal", "Karu")
  gender?: 'L' | 'P'; // Jenis kelamin: 'L' = Laki-laki, 'P' = Perempuan
  role: UserRole;
  nip: string;
  phone: string;
  email: string;
  status: 'aktif' | 'nonaktif';
  specialization?: string; // e.g. "Sp.PD-KGH", "Perawat Mahir HD"
  createdAt: string;
  skillLevel?: 'Senior' | 'Medium' | 'Junior';
  specialDuty?: string | null;
  isActive?: boolean;
}

export interface Nurse {
  id: number;
  name: string;
  nip: string;
  phone: string; // e.g. "081234567801"
  role: NurseRole;
  isActive: boolean;
  defaultOffDay?: number | null; // 1 for Mon, 7 for Sun
  skillLevel: 'Senior' | 'Medium' | 'Junior';
  specialDuty?: string | null; // e.g. "BHP", "NATRIUM RO", "FARMASI & LOGISTIK", etc.
  isPermanent?: boolean; // Locked & permanently persisted
  nickname?: string;
  gender?: 'L' | 'P';
  email?: string;
}

export interface ShiftSchedule {
  id: string; // `${employeeId}_${date}`
  employeeId: string;
  date: string; // YYYY-MM-DD
  shift: ShiftType;
  note?: string;
  isCustomOverride?: boolean;
}

export interface ShiftAssignment {
  id: string; // unique ID
  date: string; // "YYYY-MM-DD" e.g. "2026-09-01"
  shiftType: ShiftType;
  nurseId: number | string;
  nurseName: string;
  nursePhone: string;
  assignedMachineIds: (number | string)[];
  isLeader: boolean;
  isWhatsAppSent: boolean;
  notes: string;
  specialDuty?: string | null; // e.g. "BHP", "NATRIUM RO", "FARMASI & LOGISTIK", etc.
  machines?: string[];
  rawMachineCodes?: string[];
}

export type MachineStatus = 
  | 'siap' 
  | 'dipakai' 
  | 'maintenance' 
  | 'perbaikan' 
  | 'AKTIF' 
  | 'TIDAK_DIGUNAKAN' 
  | 'MAINTENANCE' 
  | 'RUSAK';

export const MACHINE_STATUS_INFO: Record<string, { label: string; colorClass: string; dotClass: string }> = {
  AKTIF: { label: 'Aktif Normal', colorClass: 'bg-emerald-100 text-emerald-900 border-emerald-300', dotClass: 'bg-emerald-600' },
  siap: { label: 'Siap Pakai', colorClass: 'bg-emerald-100 text-emerald-900 border-emerald-300', dotClass: 'bg-emerald-600' },
  dipakai: { label: 'Sedang Beroperasi', colorClass: 'bg-sky-100 text-sky-900 border-sky-300', dotClass: 'bg-sky-600' },
  TIDAK_DIGUNAKAN: { label: 'Tidak Digunakan', colorClass: 'bg-slate-200 text-slate-800 border-slate-400', dotClass: 'bg-slate-500' },
  MAINTENANCE: { label: 'Dalam Perawatan', colorClass: 'bg-amber-100 text-amber-900 border-amber-300', dotClass: 'bg-amber-600' },
  maintenance: { label: 'Maintenance', colorClass: 'bg-amber-100 text-amber-900 border-amber-300', dotClass: 'bg-amber-600' },
  RUSAK: { label: 'Rusak / Off', colorClass: 'bg-rose-100 text-rose-900 border-rose-300', dotClass: 'bg-rose-600' },
  perbaikan: { label: 'Perbaikan', colorClass: 'bg-rose-100 text-rose-900 border-rose-300', dotClass: 'bg-rose-600' },
};

export type MachineCategory = 'REGULER' | 'HEPATITIS_B' | 'HEPATITIS_C' | 'ISOLASI';

export const MACHINE_CATEGORY_INFO: Record<MachineCategory, { label: string; isSpecial: boolean; badgeClass: string }> = {
  REGULER: { label: 'Reguler', isSpecial: false, badgeClass: 'bg-slate-200 text-slate-800 font-bold' },
  HEPATITIS_B: { label: 'Hepatitis B', isSpecial: true, badgeClass: 'bg-purple-100 text-purple-900 font-black border border-purple-300' },
  HEPATITIS_C: { label: 'Hepatitis C', isSpecial: true, badgeClass: 'bg-pink-100 text-pink-900 font-black border border-pink-300' },
  ISOLASI: { label: 'Isolasi Khusus', isSpecial: true, badgeClass: 'bg-red-100 text-red-900 font-black border border-red-300' },
};

export type MachineOperationalShift = 'ALL' | 'PAGI' | 'SIANG';

export const MACHINE_OPERATIONAL_SHIFT_INFO: Record<MachineOperationalShift, { label: string; shortLabel: string; badgeClass: string }> = {
  ALL: { label: 'Semua Sif (Pagi & Siang)', shortLabel: 'Pagi & Siang', badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  PAGI: { label: 'Khusus Sif Pagi', shortLabel: 'Hanya Pagi', badgeClass: 'bg-sky-100 text-sky-800 border-sky-300' },
  SIANG: { label: 'Khusus Sif Siang', shortLabel: 'Hanya Siang', badgeClass: 'bg-amber-100 text-amber-800 border-amber-300' },
};

export type MachineZone = string;

export interface MachineZoneConfig {
  id: string;
  name: string;
  type: 'reguler' | 'isolasi';
  order: number;
  description?: string;
}

export const DEFAULT_ZONES: MachineZoneConfig[] = [
  { id: 'zone-a', name: 'Area A (Reguler)', type: 'reguler', order: 1, description: 'Deretan 12 Bed Sisi Timur (A01 s/d A12)' },
  { id: 'zone-b', name: 'Area B (Reguler)', type: 'reguler', order: 2, description: 'Blok Tengah Sisi B (B01 s/d B09)' },
  { id: 'zone-c', name: 'Area C (Reguler)', type: 'reguler', order: 3, description: 'Blok Tengah Sisi C (C01 s/d C08)' },
  { id: 'zone-d', name: 'Area D', type: 'reguler', order: 4, description: 'Sayap Barat Area D (D01 s/d D03)' },
  { id: 'zone-e', name: 'Area E', type: 'reguler', order: 5, description: 'Sayap Barat Area E (E01 s/d E02)' },
  { id: 'zone-f', name: 'Area F', type: 'reguler', order: 6, description: 'Sayap Barat Area F (F01 s/d F02)' },
  { id: 'zone-isolasi', name: 'Ruang Isolasi', type: 'isolasi', order: 7, description: 'Ruang Isolasi Tekanan Negatif (ISO 01 s/d ISO 04)' },
];

export interface HDMachine {
  id: string;
  code: string; // e.g. "A01"
  name?: string;
  brand: string; // e.g. "Fresenius Medical Care"
  model: string;
  zone: MachineZone;
  status: MachineStatus;
  serialNumber?: string;
  lastMaintenance?: string; // YYYY-MM-DD
  notes?: string;
  bay?: string;
  category?: MachineCategory;
  brandModel?: string;
  operationalShift?: MachineOperationalShift;
  statusPagi?: MachineStatus;
  statusSiang?: MachineStatus;
}

export interface Machine {
  id: number; // 1 to 30
  code: string; // "A01", "B01", etc.
  name: string; // "Mesin HD A01"
  bay: string; // "Bay A (Reguler)", etc.
  category: MachineCategory;
  status: MachineStatus; // Global default fallback status
  brandModel: string;
  notes?: string;
  operationalShift?: MachineOperationalShift;
  statusPagi?: MachineStatus; // Status khusus Sif Pagi
  statusSiang?: MachineStatus; // Status khusus Sif Siang
}

export const getMachineStatusForShift = (
  machine: Machine | HDMachine,
  shift: 'PAGI' | 'SIANG'
): MachineStatus => {
  if (shift === 'PAGI') {
    if (machine.statusPagi) return machine.statusPagi;
    if (machine.operationalShift === 'SIANG') return 'TIDAK_DIGUNAKAN';
    return machine.status || 'AKTIF';
  } else {
    if (machine.statusSiang) return machine.statusSiang;
    if (machine.operationalShift === 'PAGI') return 'TIDAK_DIGUNAKAN';
    return machine.status || 'AKTIF';
  }
};

export interface MachineAssignment {
  id: string; // `${date}_${shift}_${machineId}`
  date: string; // YYYY-MM-DD
  shift: 'pagi' | 'siang';
  machineId: string;
  nurseId?: string;
  isOff?: boolean; // Fitur matikan mesin untuk shift ini
  offReason?: string; // Alasan mesin dimatikan
  patientName?: string;
  medicalRecordNo?: string;
  targetUF?: string; // e.g. "2.5 L"
  dialyzerType?: string; // e.g. "Hi-Flux F7HPS"
  notes?: string;
}

export type TaskPriority = 'rendah' | 'normal' | 'penting' | 'mendesak';
export type TaskStatus = 'pending' | 'in_progress' | 'completed';

export type SpecialTaskCategory = 'pj_shift' | 'bhp' | 'farmasi_logistik' | 'natrium_ro' | 'cito';

export interface SpecialTaskDefinition {
  category: SpecialTaskCategory;
  name: string;
  shortCode: string;
  badgeBg: string;
  badgeBorder: string;
  textColor: string;
  lightBg: string;
  lightText: string;
  lightBorder: string;
  description: string;
}

export const SPECIAL_TASK_DEFINITIONS: Record<SpecialTaskCategory, SpecialTaskDefinition> = {
  pj_shift: {
    category: 'pj_shift',
    name: 'PJ Shift',
    shortCode: 'PJ',
    badgeBg: 'bg-orange-500',
    badgeBorder: 'border-orange-600',
    textColor: 'text-white',
    lightBg: 'bg-orange-100',
    lightText: 'text-orange-900',
    lightBorder: 'border-orange-300',
    description: 'Penanggung Jawab Shift (Koordinasi alur pasien, supervisi, laporan)',
  },
  bhp: {
    category: 'bhp',
    name: 'BHP',
    shortCode: 'BHP',
    badgeBg: 'bg-blue-600',
    badgeBorder: 'border-blue-700',
    textColor: 'text-white',
    lightBg: 'bg-blue-100',
    lightText: 'text-blue-900',
    lightBorder: 'border-blue-300',
    description: 'Barang Habis Pakai (Bloodline, AV Fistula Needle, Dialyzer, Spuit)',
  },
  farmasi_logistik: {
    category: 'farmasi_logistik',
    name: 'Farmasi & Logistik',
    shortCode: 'FARM',
    badgeBg: 'bg-purple-600',
    badgeBorder: 'border-purple-700',
    textColor: 'text-white',
    lightBg: 'bg-purple-100',
    lightText: 'text-purple-900',
    lightBorder: 'border-purple-300',
    description: 'Farmasi & Logistik (Konsentrat Asid, Bikarbonat, Heparin, Obat Emergensi)',
  },
  natrium_ro: {
    category: 'natrium_ro',
    name: 'Natrium RO',
    shortCode: 'RO',
    badgeBg: 'bg-yellow-400',
    badgeBorder: 'border-yellow-500',
    textColor: 'text-slate-900',
    lightBg: 'bg-yellow-100',
    lightText: 'text-yellow-900',
    lightBorder: 'border-yellow-300',
    description: 'Pengawasan Water Treatment RO & Uji Profil Natrium / Klorin',
  },
  cito: {
    category: 'cito',
    name: 'CITO',
    shortCode: 'CITO',
    badgeBg: 'bg-slate-900',
    badgeBorder: 'border-slate-950',
    textColor: 'text-white',
    lightBg: 'bg-slate-100',
    lightText: 'text-slate-900',
    lightBorder: 'border-slate-300',
    description: 'Tindakan HD CITO / Emergency HD (Otomatis Mendapatkan Alokasi Mesin ISOLASI)',
  },
};

export interface SpecialTask {
  id: string;
  title: string;
  description: string;
  assignedToId: string;
  employeeId?: string; // Alias for assignedToId
  assignedByName: string;
  date: string; // YYYY-MM-DD
  shift: 'pagi' | 'siang';
  priority: TaskPriority;
  status: TaskStatus;
  category: SpecialTaskCategory;
  createdAt: string;
  completedAt?: string;
  completionNotes?: string;
}

export interface ShiftDefinition {
  type: ShiftType;
  name: string;
  startTime: string;
  endTime: string;
  badgeBg: string;
  badgeText: string;
  description: string;
}

export const SHIFT_DEFINITIONS: Record<string, ShiftDefinition> = {
  pagi: {
    type: 'pagi',
    name: 'Shift Pagi',
    startTime: '07:00',
    endTime: '14:00',
    badgeBg: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    badgeText: 'Pagi (07:00-14:00)',
    description: 'Sesi Hemodialisa 1 (Priming, Kanulasi, Monitoring HD Pagi)',
  },
  siang: {
    type: 'siang',
    name: 'Shift Siang',
    startTime: '13:30',
    endTime: '20:30',
    badgeBg: 'bg-blue-100 text-blue-800 border-blue-300',
    badgeText: 'Siang (13:30-20:30)',
    description: 'Sesi Hemodialisa 2 (Disinfeksi antar sesi, Monitoring HD Siang, Desinfeksi Akhir)',
  },
  libur: {
    type: 'libur',
    name: 'Libur Rutin',
    startTime: '-',
    endTime: '-',
    badgeBg: 'bg-rose-100 text-rose-800 border-rose-300',
    badgeText: 'Libur',
    description: 'Hari Libur Kerja (Wajib Minggu untuk semua staf)',
  },
  cuti: {
    type: 'cuti',
    name: 'Cuti Tahunan',
    startTime: '-',
    endTime: '-',
    badgeBg: 'bg-amber-100 text-amber-800 border-amber-300',
    badgeText: 'Cuti',
    description: 'Cuti Tahunan / Alasan Resmi',
  },
  izin: {
    type: 'izin',
    name: 'Izin',
    startTime: '-',
    endTime: '-',
    badgeBg: 'bg-purple-100 text-purple-800 border-purple-300',
    badgeText: 'Izin',
    description: 'Izin resmi kepentingan mendesak',
  },
  sakit: {
    type: 'sakit',
    name: 'Sakit',
    startTime: '-',
    endTime: '-',
    badgeBg: 'bg-slate-200 text-slate-700 border-slate-300',
    badgeText: 'Sakit',
    description: 'Istirahat sakit dengan surat dokter',
  },
  pagi_siang: {
    type: 'pagi_siang',
    name: '2 Shif (Pagi & Siang)',
    startTime: '07:00',
    endTime: '20:30',
    badgeBg: 'bg-indigo-100 text-indigo-900 border-indigo-300',
    badgeText: 'Pagi & Siang (2 Shif)',
    description: 'Dinas Jaga 2 Sesi Penuh (1 Dokter melaksanakan Shif Pagi dan Siang)',
  },
};

export const SHIFT_TYPE_INFO: Record<string, { code: string; label: string; timeRange: string; isWorkShift: boolean; badgeClass: string; textClass: string; bgClass: string }> = {
  PAGI: { code: 'P', label: 'Sif Pagi', timeRange: '07.00 - 14.00 WIB', isWorkShift: true, badgeClass: 'bg-sky-500 text-white', textClass: 'text-sky-700', bgClass: 'bg-sky-50 border-sky-200' },
  SIANG: { code: 'S', label: 'Sif Siang', timeRange: '12.00 - 19.00 WIB', isWorkShift: true, badgeClass: 'bg-amber-500 text-white', textClass: 'text-amber-700', bgClass: 'bg-amber-50 border-amber-200' },
  LIBUR: { code: 'L', label: 'Libur / Off', timeRange: '-', isWorkShift: false, badgeClass: 'bg-slate-400 text-white', textClass: 'text-slate-600', bgClass: 'bg-slate-100 border-slate-200' },
  CUTI: { code: 'C', label: 'Cuti Tahunan', timeRange: '-', isWorkShift: false, badgeClass: 'bg-teal-500 text-white', textClass: 'text-teal-700', bgClass: 'bg-teal-50 border-teal-200' },
  SAKIT: { code: 'Skt', label: 'Sakit / Izin', timeRange: '-', isWorkShift: false, badgeClass: 'bg-rose-500 text-white', textClass: 'text-rose-700', bgClass: 'bg-rose-50 border-rose-200' },
  pagi: { code: 'P', label: 'Sif Pagi', timeRange: '07.00 - 14.00 WIB', isWorkShift: true, badgeClass: 'bg-sky-500 text-white', textClass: 'text-sky-700', bgClass: 'bg-sky-50 border-sky-200' },
  siang: { code: 'S', label: 'Sif Siang', timeRange: '12.00 - 19.00 WIB', isWorkShift: true, badgeClass: 'bg-amber-500 text-white', textClass: 'text-amber-700', bgClass: 'bg-amber-50 border-amber-200' },
  libur: { code: 'L', label: 'Libur / Off', timeRange: '-', isWorkShift: false, badgeClass: 'bg-slate-400 text-white', textClass: 'text-slate-600', bgClass: 'bg-slate-100 border-slate-200' },
  cuti: { code: 'C', label: 'Cuti Tahunan', timeRange: '-', isWorkShift: false, badgeClass: 'bg-teal-500 text-white', textClass: 'text-teal-700', bgClass: 'bg-teal-50 border-teal-200' },
  sakit: { code: 'Skt', label: 'Sakit / Izin', timeRange: '-', isWorkShift: false, badgeClass: 'bg-rose-500 text-white', textClass: 'text-rose-700', bgClass: 'bg-rose-50 border-rose-200' },
  izin: { code: 'I', label: 'Izin Resmi', timeRange: '-', isWorkShift: false, badgeClass: 'bg-purple-500 text-white', textClass: 'text-purple-700', bgClass: 'bg-purple-50 border-purple-200' },
  pagi_siang: { code: 'P+S', label: 'Pagi & Siang (2 Shif)', timeRange: '07.00 - 20.30 WIB', isWorkShift: true, badgeClass: 'bg-indigo-600 text-white', textClass: 'text-indigo-800', bgClass: 'bg-indigo-50 border-indigo-200' },
};

export interface AppSettings {
  id: number;
  hospitalName: string;
  roomName: string;
  headNurseName: string;
  headNursePhone: string;
  googleSheetWebhookUrl: string;
  googleSpreadsheetIdOrUrl: string;
  autoSyncGoogleSheets: boolean;
  minNursesPerShift: number;
  maxConsecutiveWorkDays: number;
  lastSyncTimestamp?: number;
  lastSyncStatus?: string;
}

export interface SpecialDutyOption {
  id: string; // Unique identifier or code
  code: string; // Identifier used in assignments & profile
  label: string; // Full readable name (e.g. "Tugas Khusus BHP (Bahan Habis Pakai)")
  shortName: string; // Short badge label (e.g. "BHP")
  description: string;
  colorName: string;
  dotColorHex: string; // Hex code for indicator dot
  bgClass: string; // Tailwind background class for dot (e.g. "bg-blue-500")
  badgeClass?: string;
  textClass?: string;
  borderClass?: string;
  isCustom?: boolean;
}

export interface DutyColorPreset {
  name: string;
  dotColorHex: string;
  bgClass: string;
  borderClass: string;
  badgeClass: string;
  textClass: string;
}

export const DUTY_COLOR_PRESETS: DutyColorPreset[] = [
  {
    name: 'Biru',
    dotColorHex: '#3b82f6',
    bgClass: 'bg-blue-500',
    borderClass: 'border-blue-300 dark:border-blue-700',
    badgeClass: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/70 dark:text-blue-300 dark:border-blue-800',
    textClass: 'text-blue-700 dark:text-blue-300',
  },
  {
    name: 'Merah',
    dotColorHex: '#f43f5e',
    bgClass: 'bg-rose-500',
    borderClass: 'border-rose-300 dark:border-rose-700',
    badgeClass: 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/70 dark:text-rose-300 dark:border-rose-800',
    textClass: 'text-rose-700 dark:text-rose-300',
  },
  {
    name: 'Kuning',
    dotColorHex: '#fbbf24',
    bgClass: 'bg-amber-400',
    borderClass: 'border-amber-300 dark:border-amber-700',
    badgeClass: 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-800',
    textClass: 'text-amber-700 dark:text-amber-300',
  },
  {
    name: 'Hijau',
    dotColorHex: '#10b981',
    bgClass: 'bg-emerald-500',
    borderClass: 'border-emerald-300 dark:border-emerald-700',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-800',
    textClass: 'text-emerald-700 dark:text-emerald-300',
  },
  {
    name: 'Oranye',
    dotColorHex: '#f97316',
    bgClass: 'bg-orange-500',
    borderClass: 'border-orange-300 dark:border-orange-700',
    badgeClass: 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950/70 dark:text-orange-300 dark:border-orange-800',
    textClass: 'text-orange-700 dark:text-orange-300',
  },
  {
    name: 'Merah Tua',
    dotColorHex: '#dc2626',
    bgClass: 'bg-red-600',
    borderClass: 'border-red-300 dark:border-red-700',
    badgeClass: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-950/70 dark:text-red-300 dark:border-red-800',
    textClass: 'text-red-700 dark:text-red-300',
  },
  {
    name: 'Ungu',
    dotColorHex: '#9333ea',
    bgClass: 'bg-purple-600',
    borderClass: 'border-purple-300 dark:border-purple-700',
    badgeClass: 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950/70 dark:text-purple-300 dark:border-purple-800',
    textClass: 'text-purple-700 dark:text-purple-300',
  },
  {
    name: 'Indigo',
    dotColorHex: '#6366f1',
    bgClass: 'bg-indigo-500',
    borderClass: 'border-indigo-300 dark:border-indigo-700',
    badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-indigo-950/70 dark:text-indigo-300 dark:border-indigo-800',
    textClass: 'text-indigo-700 dark:text-indigo-300',
  },
  {
    name: 'Teal',
    dotColorHex: '#14b8a6',
    bgClass: 'bg-teal-500',
    borderClass: 'border-teal-300 dark:border-teal-700',
    badgeClass: 'bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-950/70 dark:text-teal-300 dark:border-teal-800',
    textClass: 'text-teal-700 dark:text-teal-300',
  },
  {
    name: 'Sky',
    dotColorHex: '#0284c7',
    bgClass: 'bg-sky-500',
    borderClass: 'border-sky-300 dark:border-sky-700',
    badgeClass: 'bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-950/70 dark:text-sky-300 dark:border-sky-800',
    textClass: 'text-sky-700 dark:text-sky-300',
  },
  {
    name: 'Pink',
    dotColorHex: '#ec4899',
    bgClass: 'bg-pink-500',
    borderClass: 'border-pink-300 dark:border-pink-700',
    badgeClass: 'bg-pink-100 text-pink-800 border-pink-300 dark:bg-pink-950/70 dark:text-pink-300 dark:border-pink-800',
    textClass: 'text-pink-700 dark:text-pink-300',
  },
  {
    name: 'Lime',
    dotColorHex: '#84cc16',
    bgClass: 'bg-lime-500',
    borderClass: 'border-lime-300 dark:border-lime-700',
    badgeClass: 'bg-lime-100 text-lime-800 border-lime-300 dark:bg-lime-950/70 dark:text-lime-300 dark:border-lime-800',
    textClass: 'text-lime-700 dark:text-lime-300',
  },
];

export const DEFAULT_SPECIAL_DUTY_OPTIONS: SpecialDutyOption[] = [
  {
    id: 'BHP',
    code: 'BHP',
    label: 'Tugas Khusus BHP (Bahan Habis Pakai)',
    shortName: 'BHP',
    description: 'Pengelolaan spuit, bloodline, AV fistula, dialyzer, heparin, kassa, & desinfektan mesin HD',
    colorName: 'Biru',
    dotColorHex: '#3b82f6',
    bgClass: 'bg-blue-500',
    badgeClass: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/70 dark:text-blue-300 dark:border-blue-800',
    textClass: 'text-blue-700 dark:text-blue-300',
    borderClass: 'border-blue-200 dark:border-blue-800',
    isCustom: false,
  },
  {
    id: 'FARMASI_LOGISTIK',
    code: 'FARMASI LOGISTIK',
    label: 'Tugas Khusus Farmasi Logistik',
    shortName: 'FARMASI LOGISTIK',
    description: 'Pengelolaan obat emergensi, EPO / Eritropoietin, zat besi IV, amprah farmasi & logistik umum ruangan',
    colorName: 'Merah',
    dotColorHex: '#f43f5e',
    bgClass: 'bg-rose-500',
    badgeClass: 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/70 dark:text-rose-300 dark:border-rose-800',
    textClass: 'text-rose-700 dark:text-rose-300',
    borderClass: 'border-rose-200 dark:border-rose-800',
    isCustom: false,
  },
  {
    id: 'NATRIUM_RO',
    code: 'NATRIUM RO',
    label: 'Tugas Khusus Natrium RO & Water Treatment',
    shortName: 'NATRIUM RO',
    description: 'Pemantauan Water Treatment RO, uji TDS & klorin, mixing konsentrat natrium bikarbonat harian',
    colorName: 'Kuning',
    dotColorHex: '#fbbf24',
    bgClass: 'bg-amber-400',
    badgeClass: 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-800',
    textClass: 'text-amber-700 dark:text-amber-300',
    borderClass: 'border-amber-200 dark:border-amber-800',
    isCustom: false,
  },
  {
    id: 'PJ_SHIF',
    code: 'PJ SHIF',
    label: 'Tugas Khusus PJ Shif (Katim / Leader)',
    shortName: 'PJ SHIF',
    description: 'Koordinator pelayanan perawat, memimpin operan dan koordinasi pelayanan sif HD',
    colorName: 'Oranye',
    dotColorHex: '#f97316',
    bgClass: 'bg-orange-500',
    badgeClass: 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950/70 dark:text-orange-300 dark:border-orange-800',
    textClass: 'text-orange-700 dark:text-orange-300',
    borderClass: 'border-orange-200 dark:border-orange-800',
    isCustom: false,
  },
  {
    id: 'CITO',
    code: 'CITO',
    label: 'CITO & Penanggung Jawab Isolasi',
    shortName: 'CITO',
    description: 'Penanganan tindakan HD darurat/cito serta penanggung jawab mutlak Alokasi Mesin Isolasi (C08 & C09)',
    colorName: 'Merah Tua',
    dotColorHex: '#dc2626',
    bgClass: 'bg-red-600',
    badgeClass: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-950/70 dark:text-red-300 dark:border-red-800',
    textClass: 'text-red-700 dark:text-red-300',
    borderClass: 'border-red-200 dark:border-red-800',
    isCustom: false,
  },
];

export interface SpecialDutyInfo {
  code: string;
  label: string;
  shortName: string;
  description: string;
  badgeClass: string;
  textClass: string;
  bgClass: string;
  borderClass: string;
  iconName: 'Package' | 'Droplets' | 'Pill' | 'RefreshCw' | 'ShieldAlert' | 'FileCheck2' | 'Tag' | 'Zap' | 'AlertTriangle';
}

export const SPECIAL_DUTY_OPTIONS: Record<string, SpecialDutyInfo> = {
  'CITO': {
    code: 'CITO',
    label: 'CITO (HD Darurat & Mesin Isolasi)',
    shortName: 'CITO',
    description: 'Penanganan tindakan HD darurat/cito serta penanggung jawab mutlak Alokasi Mesin Isolasi (C08 & C09)',
    badgeClass: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-950/70 dark:text-red-300 dark:border-red-800',
    textClass: 'text-red-700 dark:text-red-300',
    bgClass: 'bg-red-50 dark:bg-red-950/40',
    borderClass: 'border-red-200 dark:border-red-800',
    iconName: 'Zap',
  },
  'BHP': {
    code: 'BHP',
    label: 'BHP (Bahan Habis Pakai)',
    shortName: 'BHP',
    description: 'Pengelolaan spuit, bloodline, AV fistula, dialyzer, heparin, kassa, & desinfektan mesin HD',
    badgeClass: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/70 dark:text-blue-300 dark:border-blue-800',
    textClass: 'text-blue-700 dark:text-blue-300',
    bgClass: 'bg-blue-50 dark:bg-blue-950/40',
    borderClass: 'border-blue-200 dark:border-blue-800',
    iconName: 'Package',
  },
  'NATRIUM RO': {
    code: 'NATRIUM RO',
    label: 'NATRIUM RO (Water Treatment & Bikarbonat)',
    shortName: 'NATRIUM RO',
    description: 'Pemantauan Water Treatment RO, uji TDS & klorin, mixing konsentrat natrium bikarbonat harian',
    badgeClass: 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-800',
    textClass: 'text-amber-700 dark:text-amber-300',
    bgClass: 'bg-amber-50 dark:bg-amber-950/40',
    borderClass: 'border-amber-200 dark:border-amber-800',
    iconName: 'Droplets',
  },
  'FARMASI LOGISTIK': {
    code: 'FARMASI LOGISTIK',
    label: 'FARMASI LOGISTIK (Obat & Amprah)',
    shortName: 'FARMASI LOGISTIK',
    description: 'Pengelolaan obat emergensi, EPO / Eritropoietin, zat besi IV, amprah farmasi & logistik umum ruangan',
    badgeClass: 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/70 dark:text-rose-300 dark:border-rose-800',
    textClass: 'text-rose-700 dark:text-rose-300',
    bgClass: 'bg-rose-50 dark:bg-rose-950/40',
    borderClass: 'border-rose-200 dark:border-rose-800',
    iconName: 'Pill',
  },
  'FARMASI & LOGISTIK': {
    code: 'FARMASI LOGISTIK',
    label: 'FARMASI LOGISTIK (Obat & Amprah)',
    shortName: 'FARMASI LOGISTIK',
    description: 'Pengelolaan obat emergensi, EPO / Eritropoietin, zat besi IV, amprah farmasi & logistik umum ruangan',
    badgeClass: 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/70 dark:text-rose-300 dark:border-rose-800',
    textClass: 'text-rose-700 dark:text-rose-300',
    bgClass: 'bg-rose-50 dark:bg-rose-950/40',
    borderClass: 'border-rose-200 dark:border-rose-800',
    iconName: 'Pill',
  },
  'PJ SHIF': {
    code: 'PJ SHIF',
    label: 'PJ SHIF (Katim / Leader)',
    shortName: 'PJ SHIF',
    description: 'Koordinator pelayanan perawat, memimpin operan dan koordinasi pelayanan sif HD',
    badgeClass: 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950/70 dark:text-orange-300 dark:border-orange-800',
    textClass: 'text-orange-700 dark:text-orange-300',
    bgClass: 'bg-orange-50 dark:bg-orange-950/40',
    borderClass: 'border-orange-200 dark:border-orange-800',
    iconName: 'Tag',
  },
};

/**
 * Parses multiple special duties from a string (comma, semicolon, or slash separated)
 */
export const parseSpecialDuties = (dutyStr?: string | null): string[] => {
  if (!dutyStr || typeof dutyStr !== 'string') return [];
  const parsed = dutyStr
    .split(/[,;/]+/)
    .map((s) => s.trim())
    .filter((s) => {
      if (!s) return false;
      const lower = s.toLowerCase();
      return (
        lower !== '-' &&
        lower !== 'null' &&
        lower !== 'undefined' &&
        lower !== 'none' &&
        lower !== 'tidak ada' &&
        lower !== 'tidak' &&
        lower !== 'belum ada'
      );
    });
  return Array.from(new Set(parsed));
};

/**
 * Formats multiple special duty codes into a standardized comma-separated string
 */
export const formatSpecialDuties = (duties: string[]): string | null => {
  if (!Array.isArray(duties)) return null;
  const unique = Array.from(
    new Set(
      duties
        .map((s) => (typeof s === 'string' ? s.trim() : ''))
        .filter((s) => {
          if (!s) return false;
          const lower = s.toLowerCase();
          return (
            lower !== '-' &&
            lower !== 'null' &&
            lower !== 'undefined' &&
            lower !== 'none' &&
            lower !== 'tidak ada' &&
            lower !== 'tidak' &&
            lower !== 'belum ada'
          );
        })
    )
  );
  return unique.length > 0 ? unique.join(', ') : null;
};

export interface NurseMonthlyStat {
  nurseId: number | string;
  nurseName: string;
  role: NurseRole | UserRole;
  pagiCount: number;
  siangCount: number;
  liburCount: number;
  cutiCount: number;
  sakitCount: number;
  totalWorkingShifts: number;
  totalMachinesAssigned: number;
  avgMachinesPerShift: number;
  isolationMachinesHandled: number;
}

export interface FairnessReport {
  monthString: string;
  totalNurses: number;
  totalDays: number;
  totalPagiShifts: number;
  totalSiangShifts: number;
  totalOffDays: number;
  avgShiftsPerNurse: number;
  minShifts: number;
  maxShifts: number;
  avgMachinesPerNurse: number;
  fairnessScorePercent: number; // 0 - 100%
  nurseStats: NurseMonthlyStat[];
}

export type DoctorRole = 'DPJP' | 'DOKTER_RUANGAN';

export interface Doctor {
  id: number | string;
  name: string; // e.g. "dr. Reza Rizki Ramadhan"
  sip: string; // SIP / NIP
  phone: string; // e.g. "081298765432"
  role: DoctorRole;
  specialization?: string;
  isActive: boolean;
}

export interface DoctorShiftDuty {
  date: string; // YYYY-MM-DD
  pagiDoctorId?: number | string | null;
  pagiDoctorName?: string;
  siangDoctorId?: number | string | null;
  siangDoctorName?: string;
  dayName?: string;
  dayNumber?: number;
  status?: string;
  isSunday?: boolean;
  notes?: string;
}

export type SheetsSyncStatus = 'idle' | 'fetching' | 'saving' | 'saved' | 'error' | 'offline';
