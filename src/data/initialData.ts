import { UserAccount, HDMachine, SpecialTask, ShiftSchedule, MachineAssignment, AppSettings, Doctor } from '../types';

export const INITIAL_SETTINGS: AppSettings = {
  id: 1,
  hospitalName: "RS Happy Land Medical Centre",
  roomName: "Ruang Dialisis Gedung Timur Lt.3",
  headNurseName: "TWIS FERTILIANTI PW",
  headNursePhone: "081234567801",
  googleSheetWebhookUrl: "https://script.google.com/macros/s/AKfycbwmcq0PcUzLR6S97JWxC5jDpYEZo8qDNOaI8tzzsyE-MUF2hvmwCUYEpIkDOPmiNGAC2g/exec",
  googleSpreadsheetIdOrUrl: "https://docs.google.com/spreadsheets/d/1WgGJBmpZfwHnM2tfNOxkOu45Ji9mm6lHkoWtqnW4fmg/edit",
  autoSyncGoogleSheets: false,
  minNursesPerShift: 8,
  maxConsecutiveWorkDays: 5,
  lastSyncTimestamp: 0,
  lastSyncStatus: "Belum pernah disinkronkan"
};

export const INITIAL_DOCTORS: Doctor[] = [
  {
    id: 1000,
    name: "dr. Addiniya Nurul Azmi Burhan",
    sip: "-",
    phone: "081911996556",
    role: "DOKTER_RUANGAN",
    specialization: "Dokter Umum",
    isActive: true,
  },
  {
    id: 1001,
    name: "dr. Agnes Treyssia Sandewa",
    sip: "-",
    phone: "082271395557",
    role: "DOKTER_RUANGAN",
    specialization: "Dokter Umum",
    isActive: true,
  },
  {
    id: 1002,
    name: "dr. Krishna Patria Arimurti",
    sip: "-",
    phone: "087779754041",
    role: "DOKTER_RUANGAN",
    specialization: "Dokter Umum",
    isActive: true,
  },
  {
    id: 1003,
    name: "dr. Lilyana Ulfa Wulandari",
    sip: "-",
    phone: "089668666933",
    role: "DOKTER_RUANGAN",
    specialization: "Dokter Umum",
    isActive: true,
  },
  {
    id: 1004,
    name: "dr. Paramitha Kusumadewi",
    sip: "SIP/446.1/045/DU/2024",
    phone: "085250013291",
    role: "DOKTER_RUANGAN",
    specialization: "Dokter Ruangan Bersertifikat Dialisis",
    isActive: true,
  },
  {
    id: 1005,
    name: "dr. Raden Alif Kuncorojati",
    sip: "-",
    phone: "085713865156",
    role: "DOKTER_RUANGAN",
    specialization: "Dokter Umum",
    isActive: true,
  },
  {
    id: 1006,
    name: "dr. Reza Rizki Ramadhan",
    sip: "198811052014021001",
    phone: "082313777694",
    role: "DPJP",
    specialization: "Dokter Umum / Penanggung Jawab HD",
    isActive: true,
  },
  {
    id: 1007,
    name: "dr. Talitha Ambar Islamey",
    sip: "-",
    phone: "087817645983",
    role: "DOKTER_RUANGAN",
    specialization: "Dokter Umum",
    isActive: true,
  },
  {
    id: 1008,
    name: "dr. Tika Heryasari",
    sip: "-",
    phone: "081229566465",
    role: "DOKTER_RUANGAN",
    specialization: "Dokter Ruangan Bersertifikat Dialisis",
    isActive: true,
  },
];

export const INITIAL_EMPLOYEES: UserAccount[] = [
  {
    id: 'emp-admin',
    username: 'admin',
    password: 'admin123',
    name: 'Administrator Unit HD',
    nickname: 'Admin',
    gender: 'L',
    role: 'admin',
    nip: '198503152010011002',
    phone: '0812-3456-7890',
    email: 'admin.hemo@happyland.co.id',
    status: 'aktif',
    specialization: 'Sistem Informasi & Manajemen HD',
    createdAt: '2026-01-01',
  },
  // 17 Perawat dari Google Sheet (NIP 001 - 017 & Jabatan Resmi)
  {
    id: 'emp-twis',
    username: 'twis_fertilianti',
    password: 'perawat123',
    name: 'TWIS FERTILIANTI PW',
    nickname: 'Twis',
    gender: 'P',
    role: 'kepala_ruangan',
    nip: '001',
    phone: '0812-1111-0003',
    email: 'twis.fertilianti@happyland.co.id',
    status: 'aktif',
    specialization: 'Kepala Ruang Hemodialisa',
    createdAt: '2026-01-01',
  },
  {
    id: 'emp-haikal',
    username: 'm_haikal',
    password: 'perawat123',
    name: 'M HAIKAL MALILANG',
    nickname: 'Haikal',
    gender: 'L',
    role: 'pj_shift',
    nip: '002',
    phone: '089530066262',
    email: 'haikal.malilang@happyland.co.id',
    status: 'aktif',
    specialization: 'KATIM / Perawat Mahir HD',
    createdAt: '2026-01-01',
  },
  {
    id: 'emp-khoirudin',
    username: 'm_nor_khoirudin',
    password: 'perawat123',
    name: 'M NOR KHOIRUDIN',
    nickname: 'Khoirudin',
    gender: 'L',
    role: 'pj_shift',
    nip: '003',
    phone: '0812-3333-0001',
    email: 'nor.khoirudin@happyland.co.id',
    status: 'aktif',
    specialization: 'KATIM / Perawat Mahir HD',
    createdAt: '2026-01-01',
  },
  {
    id: 'emp-rizky',
    username: 'rizky_wahyu',
    password: 'perawat123',
    name: 'RIZKY WAHYU A',
    nickname: 'Rizky',
    gender: 'L',
    role: 'pj_shift',
    nip: '004',
    phone: '0812-1111-0002',
    email: 'rizky.wahyu@happyland.co.id',
    status: 'aktif',
    specialization: 'KATIM / Perawat Mahir HD',
    createdAt: '2026-01-01',
  },
  {
    id: 'emp-aprillia',
    username: 'aprillia_dwi',
    password: 'perawat123',
    name: 'APRILLIA DWI N',
    nickname: 'Aprillia',
    gender: 'P',
    role: 'pj_shift',
    nip: '005',
    phone: '0812-2222-0006',
    email: 'aprillia.dwi@happyland.co.id',
    status: 'aktif',
    specialization: 'KATIM / Perawat Mahir HD',
    createdAt: '2026-01-01',
  },
  {
    id: 'emp-dea',
    username: 'dea_ika',
    password: 'perawat123',
    name: 'DEA IKA P',
    nickname: 'Dea',
    gender: 'P',
    role: 'pj_shift',
    nip: '006',
    phone: '0812-1111-0007',
    email: 'dea.ika@happyland.co.id',
    status: 'aktif',
    specialization: 'KATIM / Perawat Mahir HD',
    createdAt: '2026-01-01',
  },
  {
    id: 'emp-novialita',
    username: 'novialita_a',
    password: 'perawat123',
    name: 'NOVIALITA ARYADI',
    nickname: 'Novialita',
    gender: 'P',
    role: 'pj_shift',
    nip: '007',
    phone: '0812-2222-0008',
    email: 'novialita.aryadi@happyland.co.id',
    status: 'aktif',
    specialization: 'KATIM / Perawat Mahir HD',
    createdAt: '2026-01-01',
  },
  {
    id: 'emp-brilli',
    username: 'y_brillisanto',
    password: 'perawat123',
    name: 'Y BRILLISANTO',
    nickname: 'Brilli',
    gender: 'L',
    role: 'perawat',
    nip: '008',
    phone: '085122604654',
    email: 'y.brillisanto@happyland.co.id',
    status: 'aktif',
    specialization: 'Perawat Pelaksana HD',
    createdAt: '2026-01-01',
  },
  {
    id: 'emp-annisa',
    username: 'annisa_nur',
    password: 'perawat123',
    name: 'ANNISA NURFAJRI M',
    nickname: 'Annisa',
    gender: 'P',
    role: 'perawat',
    nip: '009',
    phone: '0812-1111-0004',
    email: 'annisa.fajri@happyland.co.id',
    status: 'aktif',
    specialization: 'Perawat Pelaksana HD',
    createdAt: '2026-01-01',
  },
  {
    id: 'emp-siswantini',
    username: 'siswantini',
    password: 'perawat123',
    name: 'SISWANTINI CATUR P',
    nickname: 'Siswantini',
    gender: 'P',
    role: 'perawat',
    nip: '010',
    phone: '0812-2222-0001',
    email: 'siswantini.catur@happyland.co.id',
    status: 'aktif',
    specialization: 'Perawat Pelaksana HD',
    createdAt: '2026-01-01',
  },
  {
    id: 'emp-reni',
    username: 'reni_dwi',
    password: 'perawat123',
    name: 'RENI DWI A',
    nickname: 'Reni',
    gender: 'P',
    role: 'perawat',
    nip: '011',
    phone: '0812-3333-0002',
    email: 'reni.dwi@happyland.co.id',
    status: 'aktif',
    specialization: 'Perawat Pelaksana HD',
    createdAt: '2026-01-01',
  },
  {
    id: 'emp-hari',
    username: 'hari_endah',
    password: 'perawat123',
    name: 'HARI ENDAH C',
    nickname: 'Hari',
    gender: 'P',
    role: 'perawat',
    nip: '012',
    phone: '0812-2222-0003',
    email: 'hari.endah@happyland.co.id',
    status: 'aktif',
    specialization: 'Perawat Pelaksana HD',
    createdAt: '2026-01-01',
  },
  {
    id: 'emp-ayu-w',
    username: 'ayu_wulandari',
    password: 'perawat123',
    name: 'AYU WULANDARI',
    nickname: 'Ayu W',
    gender: 'P',
    role: 'perawat',
    nip: '013',
    phone: '0812-2222-0002',
    email: 'ayu.wulandari@happyland.co.id',
    status: 'aktif',
    specialization: 'Perawat Pelaksana HD',
    createdAt: '2026-01-01',
  },
  {
    id: 'emp-fransisca',
    username: 'fransisca',
    password: 'perawat123',
    name: 'FRANSISCA RANI L',
    nickname: 'Fransisca',
    gender: 'P',
    role: 'perawat',
    nip: '014',
    phone: '0812-1111-0001',
    email: 'fransisca.rani@happyland.co.id',
    status: 'aktif',
    specialization: 'Perawat Pelaksana HD',
    createdAt: '2026-01-01',
  },
  {
    id: 'emp-nita',
    username: 'nita_restiana',
    password: 'perawat123',
    name: 'NITA RESTIANA P',
    nickname: 'Nita',
    gender: 'P',
    role: 'perawat',
    nip: '015',
    phone: '0812-1111-0006',
    email: 'nita.restiana@happyland.co.id',
    status: 'aktif',
    specialization: 'Perawat Pelaksana HD',
    createdAt: '2026-01-01',
  },
  {
    id: 'emp-rini',
    username: 'rini_wulandari',
    password: 'perawat123',
    name: 'RINI WULANDARI',
    nickname: 'Rini',
    gender: 'P',
    role: 'perawat',
    nip: '016',
    phone: '0812-2222-0007',
    email: 'rini.wulandari@happyland.co.id',
    status: 'aktif',
    specialization: 'Perawat Pelaksana HD',
    createdAt: '2026-01-01',
  },
  {
    id: 'emp-ayu-p',
    username: 'ayu_puspita',
    password: 'perawat123',
    name: 'AYU PUSPITA',
    nickname: 'Ayu P',
    gender: 'P',
    role: 'perawat',
    nip: '017',
    phone: '0812-2222-0005',
    email: 'ayu.puspita@happyland.co.id',
    status: 'aktif',
    specialization: 'Perawat Pelaksana HD',
    createdAt: '2026-01-01',
  },
  // 9 Dokter dari Google Sheet
  {
    id: 'emp-dr-1000',
    username: 'dr_addiniya',
    password: 'dokter123',
    name: 'dr. Addiniya Nurul Azmi Burhan',
    nickname: 'dr. Addiniya',
    gender: 'P',
    role: 'dokter',
    nip: '-',
    phone: '081911996556',
    email: 'addiniya@happyland.co.id',
    status: 'aktif',
    specialization: 'Dokter Umum',
    createdAt: '2026-01-01',
  },
  {
    id: 'emp-dr-1001',
    username: 'dr_agnes',
    password: 'dokter123',
    name: 'dr. Agnes Treyssia Sandewa',
    nickname: 'dr. Agnes',
    gender: 'P',
    role: 'dokter',
    nip: '-',
    phone: '082271395557',
    email: 'agnes@happyland.co.id',
    status: 'aktif',
    specialization: 'Dokter Umum',
    createdAt: '2026-01-01',
  },
  {
    id: 'emp-dr-1002',
    username: 'dr_krishna',
    password: 'dokter123',
    name: 'dr. Krishna Patria Arimurti',
    nickname: 'dr. Krishna',
    gender: 'L',
    role: 'dokter',
    nip: '-',
    phone: '087779754041',
    email: 'krishna@happyland.co.id',
    status: 'aktif',
    specialization: 'Dokter Umum',
    createdAt: '2026-01-01',
  },
  {
    id: 'emp-dr-1003',
    username: 'dr_lilyana',
    password: 'dokter123',
    name: 'dr. Lilyana Ulfa Wulandari',
    nickname: 'dr. Lilyana',
    gender: 'P',
    role: 'dokter',
    nip: '-',
    phone: '089668666933',
    email: 'lilyana@happyland.co.id',
    status: 'aktif',
    specialization: 'Dokter Umum',
    createdAt: '2026-01-01',
  },
  {
    id: 'emp-dr-1004',
    username: 'dr_paramitha',
    password: 'dokter123',
    name: 'dr. Paramitha Kusumadewi',
    nickname: 'dr. Paramitha',
    gender: 'P',
    role: 'dokter',
    nip: 'SIP/446.1/045/DU/2024',
    phone: '085250013291',
    email: 'paramitha@happyland.co.id',
    status: 'aktif',
    specialization: 'Dokter Ruangan Bersertifikat Dialisis',
    createdAt: '2026-01-01',
  },
  {
    id: 'emp-dr-1005',
    username: 'dr_raden_alif',
    password: 'dokter123',
    name: 'dr. Raden Alif Kuncorojati',
    nickname: 'dr. Alif',
    gender: 'L',
    role: 'dokter',
    nip: '-',
    phone: '085713865156',
    email: 'alif@happyland.co.id',
    status: 'aktif',
    specialization: 'Dokter Umum',
    createdAt: '2026-01-01',
  },
  {
    id: 'emp-dr-1006',
    username: 'dr_reza',
    password: 'dokter123',
    name: 'dr. Reza Rizki Ramadhan',
    nickname: 'dr. Reza',
    gender: 'L',
    role: 'dokter',
    nip: '198811052014021001',
    phone: '082313777694',
    email: 'reza@happyland.co.id',
    status: 'aktif',
    specialization: 'Dokter DPJP / Penanggung Jawab HD',
    createdAt: '2026-01-01',
  },
  {
    id: 'emp-dr-1007',
    username: 'dr_talitha',
    password: 'dokter123',
    name: 'dr. Talitha Ambar Islamey',
    nickname: 'dr. Talitha',
    gender: 'P',
    role: 'dokter',
    nip: '-',
    phone: '087817645983',
    email: 'talitha@happyland.co.id',
    status: 'aktif',
    specialization: 'Dokter Umum',
    createdAt: '2026-01-01',
  },
  {
    id: 'emp-dr-1008',
    username: 'dr_tika',
    password: 'dokter123',
    name: 'dr. Tika Heryasari',
    nickname: 'dr. Tika',
    gender: 'P',
    role: 'dokter',
    nip: '-',
    phone: '081229566465',
    email: 'tika@happyland.co.id',
    status: 'aktif',
    specialization: 'Dokter Ruangan Bersertifikat Dialisis',
    createdAt: '2026-01-01',
  },
];

export const HOSPITAL_LAYOUT_40_MACHINES: HDMachine[] = [
  // 1. Area A (A01 - A12) - Deretan 12 Bed Sisi Timur
  ...Array.from({ length: 12 }, (_, i) => {
    const num = String(i + 1).padStart(2, '0');
    return {
      id: `mach-a${num}`,
      code: `A${num}`,
      name: `Mesin HD A${num}`,
      brand: 'Fresenius Medical Care',
      model: '4008S Classic',
      brandModel: 'Fresenius 4008S Classic',
      zone: 'Area A (Reguler)',
      bay: 'Area A (Reguler)',
      category: 'REGULER' as const,
      status: 'siap' as const,
      serialNumber: `FMC-4008S-A${num}`,
      lastMaintenance: '2026-09-01',
      notes: `Bed No. A${num} (Area A Reguler Sisi Timur)`,
    };
  }),

  // 2. Area B (B01 - B09) - Blok Tengah Sisi B
  ...Array.from({ length: 9 }, (_, i) => {
    const num = String(i + 1).padStart(2, '0');
    const isInner = i < 4; // B01-B04 Sisi Lorong Tengah
    return {
      id: `mach-b${num}`,
      code: `B${num}`,
      name: `Mesin HD B${num}`,
      brand: 'Gambro',
      model: 'AK98',
      brandModel: 'Gambro AK98',
      zone: 'Area B (Reguler)',
      bay: 'Area B (Reguler)',
      category: 'REGULER' as const,
      status: 'siap' as const,
      serialNumber: `GAMBRO-AK98-B${num}`,
      lastMaintenance: '2026-09-01',
      notes: isInner ? `Bed No. B${num} (Sisi Lorong Tengah)` : `Bed No. B${num} (Sisi Dinding Barat)`,
    };
  }),

  // 3. Area C (C01 - C08) - Blok Tengah Sisi C
  {
    id: 'mach-c01',
    code: 'C01',
    name: 'Mesin HD C01',
    brand: 'Nipro',
    model: 'Surdial 55Plus',
    brandModel: 'Nipro Surdial 55Plus',
    zone: 'Area C (Reguler)',
    bay: 'Area C (Reguler)',
    category: 'REGULER' as const,
    status: 'siap' as const,
    serialNumber: 'NIPRO-55P-C01',
    lastMaintenance: '2026-09-01',
    notes: 'Bed No. C01 (Sisi Lorong Tengah)',
  },
  {
    id: 'mach-c02',
    code: 'C02',
    name: 'Mesin HD C02',
    brand: 'Nipro',
    model: 'Surdial 55Plus',
    brandModel: 'Nipro Surdial 55Plus',
    zone: 'Area C (Reguler)',
    bay: 'Area C (Reguler)',
    category: 'REGULER' as const,
    status: 'siap' as const,
    serialNumber: 'NIPRO-55P-C02',
    lastMaintenance: '2026-09-01',
    notes: 'Bed No. C02 (Sisi Lorong Tengah)',
  },
  {
    id: 'mach-c03',
    code: 'C03',
    name: 'Mesin HD C03',
    brand: 'Nipro',
    model: 'Surdial 55Plus',
    brandModel: 'Nipro Surdial 55Plus',
    zone: 'Area C (Reguler)',
    bay: 'Area C (Reguler)',
    category: 'REGULER' as const,
    status: 'siap' as const,
    serialNumber: 'NIPRO-55P-C03',
    lastMaintenance: '2026-09-01',
    notes: 'Bed No. C03 (Sisi Lorong Tengah)',
  },
  {
    id: 'mach-c04',
    code: 'C04',
    name: 'Mesin HD C04',
    brand: 'Nipro',
    model: 'Surdial 55Plus',
    brandModel: 'Nipro Surdial 55Plus',
    zone: 'Area C (Reguler)',
    bay: 'Area C (Reguler)',
    category: 'REGULER' as const,
    status: 'siap' as const,
    serialNumber: 'NIPRO-55P-C04',
    lastMaintenance: '2026-09-01',
    notes: 'Bed No. C04 (Sisi Lorong Tengah)',
  },
  {
    id: 'mach-c05',
    code: 'C05',
    name: 'Mesin HD C05',
    brand: 'Nipro',
    model: 'Surdial 55Plus',
    brandModel: 'Nipro Surdial 55Plus',
    zone: 'Area C (Reguler)',
    bay: 'Area C (Reguler)',
    category: 'REGULER' as const,
    status: 'siap' as const,
    serialNumber: 'NIPRO-55P-C05',
    lastMaintenance: '2026-09-01',
    notes: 'Bed No. C05 (Sisi Dinding Barat)',
  },
  {
    id: 'mach-c06',
    code: 'C06',
    name: 'Mesin HD C06 (Hep B)',
    brand: 'Fresenius Medical Care',
    model: '4008S Dedicated',
    brandModel: 'Fresenius 4008S Dedicated',
    zone: 'Area C (Reguler)',
    bay: 'Area C (Reguler)',
    category: 'HEPATITIS_B' as const,
    status: 'siap' as const,
    serialNumber: 'FMC-4008S-C06',
    lastMaintenance: '2026-09-01',
    notes: 'Bed No. C06 - Khusus Hepatitis B (Sisi Dinding Barat)',
  },
  {
    id: 'mach-c07',
    code: 'C07',
    name: 'Mesin HD C07 (Hep C)',
    brand: 'Gambro',
    model: 'AK98 Dedicated',
    brandModel: 'Gambro AK98 Dedicated',
    zone: 'Area C (Reguler)',
    bay: 'Area C (Reguler)',
    category: 'HEPATITIS_C' as const,
    status: 'siap' as const,
    serialNumber: 'GAMBRO-AK98-C07',
    lastMaintenance: '2026-09-01',
    notes: 'Bed No. C07 - Khusus Hepatitis C (Sisi Dinding Barat)',
  },
  {
    id: 'mach-c08',
    code: 'C08',
    name: 'Mesin HD C08',
    brand: 'Fresenius Medical Care',
    model: '5008S Multi-filter',
    brandModel: 'Fresenius 5008S Multi-filter',
    zone: 'Area C (Reguler)',
    bay: 'Area C (Reguler)',
    category: 'REGULER' as const,
    status: 'siap' as const,
    serialNumber: 'FMC-5008S-C08',
    lastMaintenance: '2026-09-01',
    notes: 'Bed No. C08 (Sisi Dinding Barat)',
  },

  // 4. Area D (D01 - D03) - Sayap Barat Area D
  ...Array.from({ length: 3 }, (_, i) => {
    const num = String(i + 1).padStart(2, '0');
    return {
      id: `mach-d${num}`,
      code: `D${num}`,
      name: `Mesin HD D${num}`,
      brand: 'Fresenius Medical Care',
      model: '4008S Classic',
      brandModel: 'Fresenius 4008S Classic',
      zone: 'Area D',
      bay: 'Area D',
      category: 'REGULER' as const,
      status: 'siap' as const,
      serialNumber: `FMC-4008S-D${num}`,
      lastMaintenance: '2026-09-01',
      notes: `Bed No. D${num} (Sayap Barat Area D)`,
    };
  }),

  // 5. Area E (E01 - E02) - Sayap Barat Area E
  ...Array.from({ length: 2 }, (_, i) => {
    const num = String(i + 1).padStart(2, '0');
    return {
      id: `mach-e${num}`,
      code: `E${num}`,
      name: `Mesin HD E${num}`,
      brand: 'Fresenius Medical Care',
      model: '4008S Classic',
      brandModel: 'Fresenius 4008S Classic',
      zone: 'Area E',
      bay: 'Area E',
      category: 'REGULER' as const,
      status: 'siap' as const,
      serialNumber: `FMC-4008S-E${num}`,
      lastMaintenance: '2026-09-01',
      notes: `Bed No. E${num} (Sayap Barat Area E)`,
    };
  }),

  // 6. Area F (F01 - F02) - Sayap Barat Area F
  ...Array.from({ length: 2 }, (_, i) => {
    const num = String(i + 1).padStart(2, '0');
    return {
      id: `mach-f${num}`,
      code: `F${num}`,
      name: `Mesin HD F${num}`,
      brand: 'Nipro',
      model: 'Surdial 55Plus',
      brandModel: 'Nipro Surdial 55Plus',
      zone: 'Area F',
      bay: 'Area F',
      category: 'REGULER' as const,
      status: 'siap' as const,
      serialNumber: `NIPRO-55P-F${num}`,
      lastMaintenance: '2026-09-01',
      notes: `Bed No. F${num} (Sayap Barat Area F)`,
    };
  }),

  // 7. Ruang Isolasi (ISO 01 - ISO 04) - 4 Bed Tekanan Negatif / CITO
  ...Array.from({ length: 4 }, (_, i) => {
    const num = String(i + 1).padStart(2, '0');
    return {
      id: `mach-iso${num}`,
      code: `ISO ${num}`,
      name: `Mesin HD ISO ${num}`,
      brand: 'Fresenius Medical Care',
      model: '5008S Multi-filter',
      brandModel: 'Fresenius 5008S Multi-filter',
      zone: 'Ruang Isolasi',
      bay: 'Ruang Isolasi',
      category: 'ISOLASI' as const,
      status: 'siap' as const,
      serialNumber: `FMC-5008S-ISO${num}`,
      lastMaintenance: '2026-09-01',
      notes: `Bed Ruang Isolasi ISO ${num} (Tekanan Negatif / CITO)`,
    };
  }),
];

export const HOSPITAL_LAYOUT_30_MACHINES = HOSPITAL_LAYOUT_40_MACHINES;
export const HOSPITAL_LAYOUT_41_MACHINES = HOSPITAL_LAYOUT_40_MACHINES;
export const INITIAL_MACHINES: HDMachine[] = HOSPITAL_LAYOUT_40_MACHINES;

export const INITIAL_SPECIAL_TASKS: SpecialTask[] = [
  // Shift Pagi (2026-09-19)
  {
    id: 'task-pagi-farmasi-1',
    title: 'Pengelolaan Farmasi & Logistik Pagi',
    description: 'Penyiapan konsentrat asid, bikarbonat, heparin, dan obat-obatan emergensi',
    assignedToId: 'emp-fransisca',
    assignedByName: 'TWIS FERTILIANTI P W',
    date: '2026-09-19',
    shift: 'pagi',
    priority: 'penting',
    status: 'in_progress',
    category: 'farmasi_logistik',
    createdAt: '2026-09-19T06:30:00Z',
  },
  {
    id: 'task-pagi-bhp-1',
    title: 'Distribusi & Verifikasi BHP Pagi (Y Brillisanto)',
    description: 'Stok bloodline, AV fistula needle, dialyzer, dan spuit HD',
    assignedToId: 'emp-brilli',
    assignedByName: 'TWIS FERTILIANTI P W',
    date: '2026-09-19',
    shift: 'pagi',
    priority: 'normal',
    status: 'in_progress',
    category: 'bhp',
    createdAt: '2026-09-19T06:30:00Z',
  },
  {
    id: 'task-pagi-bhp-2',
    title: 'Distribusi & Verifikasi BHP Pagi (Dea Ika P)',
    description: 'Stok bloodline, AV fistula needle, dialyzer, dan spuit HD',
    assignedToId: 'emp-dea',
    assignedByName: 'TWIS FERTILIANTI P W',
    date: '2026-09-19',
    shift: 'pagi',
    priority: 'normal',
    status: 'in_progress',
    category: 'bhp',
    createdAt: '2026-09-19T06:30:00Z',
  },
  {
    id: 'task-pagi-cito-1',
    title: 'Penanggung Jawab Emergency HD / CITO',
    description: 'Siap sedia tindakan HD CITO pasien ICU/IGD & alokasi mesin isolasi',
    assignedToId: 'emp-haikal',
    assignedByName: 'TWIS FERTILIANTI P W',
    date: '2026-09-19',
    shift: 'pagi',
    priority: 'mendesak',
    status: 'in_progress',
    category: 'cito',
    createdAt: '2026-09-19T06:30:00Z',
  },

  // Shift Siang (2026-09-19)
  {
    id: 'task-siang-bhp-1',
    title: 'Distribusi & Verifikasi BHP Siang (Ayu Puspita R)',
    description: 'Stok bloodline, AV fistula, dialyzer shift 2',
    assignedToId: 'emp-ayu-p',
    assignedByName: 'TWIS FERTILIANTI P W',
    date: '2026-09-19',
    shift: 'siang',
    priority: 'normal',
    status: 'pending',
    category: 'bhp',
    createdAt: '2026-09-19T06:30:00Z',
  },
  {
    id: 'task-siang-bhp-2',
    title: 'Distribusi & Verifikasi BHP Siang (Rini Wulandari)',
    description: 'Stok bloodline, AV fistula, dialyzer shift 2',
    assignedToId: 'emp-rini',
    assignedByName: 'TWIS FERTILIANTI P W',
    date: '2026-09-19',
    shift: 'siang',
    priority: 'normal',
    status: 'pending',
    category: 'bhp',
    createdAt: '2026-09-19T06:30:00Z',
  },
  {
    id: 'task-siang-cito-1',
    title: 'Penanggung Jawab Emergency HD / CITO Siang (Aprillia Dwi N)',
    description: 'Kesiapsiagaan CITO IGD & Ruang Isolasi Siang',
    assignedToId: 'emp-aprillia',
    assignedByName: 'TWIS FERTILIANTI P W',
    date: '2026-09-19',
    shift: 'siang',
    priority: 'mendesak',
    status: 'pending',
    category: 'cito',
    createdAt: '2026-09-19T06:30:00Z',
  },
  {
    id: 'task-siang-cito-2',
    title: 'Penanggung Jawab Emergency HD / CITO Siang (Rini Wulandari)',
    description: 'Kesiapsiagaan CITO IGD & Ruang Isolasi Siang',
    assignedToId: 'emp-rini',
    assignedByName: 'TWIS FERTILIANTI P W',
    date: '2026-09-19',
    shift: 'siang',
    priority: 'mendesak',
    status: 'pending',
    category: 'cito',
    createdAt: '2026-09-19T06:30:00Z',
  },
  {
    id: 'task-siang-farmasi-1',
    title: 'Pengelolaan Farmasi & Logistik Siang',
    description: 'Penyiapan konsentrat dialisat & stok resep pasien sore/malam',
    assignedToId: 'emp-brilli',
    assignedByName: 'TWIS FERTILIANTI P W',
    date: '2026-09-19',
    shift: 'siang',
    priority: 'penting',
    status: 'pending',
    category: 'farmasi_logistik',
    createdAt: '2026-09-19T06:30:00Z',
  },
];

export function getInitialSchedules(): ShiftSchedule[] {
  const date = '2026-09-19';
  const schedules: ShiftSchedule[] = [
    // Pagi (7 perawat + Ka. Ruang)
    { id: `emp-twis_${date}`, employeeId: 'emp-twis', date, shift: 'pagi', note: 'Supervisi Operasional Unit HD (Ka. Ruang)' },
    { id: `emp-fransisca_${date}`, employeeId: 'emp-fransisca', date, shift: 'pagi', note: 'Dinas Pagi' },
    { id: `emp-rizky_${date}`, employeeId: 'emp-rizky', date, shift: 'pagi', note: 'Dinas Pagi (PJ Shift)' },
    { id: `emp-annisa_${date}`, employeeId: 'emp-annisa', date, shift: 'pagi', note: 'Dinas Pagi' },
    { id: `emp-haikal_${date}`, employeeId: 'emp-haikal', date, shift: 'pagi', note: 'Dinas Pagi (CITO)' },
    { id: `emp-nita_${date}`, employeeId: 'emp-nita', date, shift: 'pagi', note: 'Dinas Pagi' },
    { id: `emp-dea_${date}`, employeeId: 'emp-dea', date, shift: 'pagi', note: 'Dinas Pagi' },
    // Siang (8 perawat)
    { id: `emp-siswantini_${date}`, employeeId: 'emp-siswantini', date, shift: 'siang', note: 'Dinas Siang' },
    { id: `emp-ayu-w_${date}`, employeeId: 'emp-ayu-w', date, shift: 'siang', note: 'Dinas Siang' },
    { id: `emp-hari_${date}`, employeeId: 'emp-hari', date, shift: 'siang', note: 'Dinas Siang' },
    { id: `emp-brilli_${date}`, employeeId: 'emp-brilli', date, shift: 'siang', note: 'Dinas Siang' },
    { id: `emp-ayu-p_${date}`, employeeId: 'emp-ayu-p', date, shift: 'siang', note: 'Dinas Siang' },
    { id: `emp-aprillia_${date}`, employeeId: 'emp-aprillia', date, shift: 'siang', note: 'Dinas Siang' },
    { id: `emp-rini_${date}`, employeeId: 'emp-rini', date, shift: 'siang', note: 'Dinas Siang' },
    { id: `emp-novialita_${date}`, employeeId: 'emp-novialita', date, shift: 'siang', note: 'Dinas Siang (PJ Shift)' },
    // Libur / Off
    { id: `emp-khoirudin_${date}`, employeeId: 'emp-khoirudin', date, shift: 'libur', note: 'Libur Rutin Bergilir' },
    { id: `emp-reni_${date}`, employeeId: 'emp-reni', date, shift: 'libur', note: 'Libur Rutin Bergilir' },
  ];

  // Tambahkan jadwal Dokter Sebulan Penuh (September 2026 & Oktober 2026) sesuai data Google Sheets
  // dr. Reza (Pagi) & dr. Paramitha (Siang) setiap Senin-Sabtu, Minggu libur.
  const monthsToSeed = [
    { year: 2026, monthIdx: 8, days: 30, prefix: '2026-09' }, // September 2026
    { year: 2026, monthIdx: 9, days: 31, prefix: '2026-10' }, // Oktober 2026
  ];

  monthsToSeed.forEach(({ year, monthIdx, days, prefix }) => {
    for (let d = 1; d <= days; d++) {
      const dayStr = String(d).padStart(2, '0');
      const curDate = `${prefix}-${dayStr}`;
      const dayOfWeek = new Date(year, monthIdx, d).getDay(); // 0 is Sunday
      const isSunday = dayOfWeek === 0;

      if (isSunday) {
        schedules.push({
          id: `emp-dr-reza_${curDate}`,
          employeeId: 'emp-dr-reza',
          date: curDate,
          shift: 'libur',
          note: 'Pelayanan Tutup (Hari Minggu)',
        });
        schedules.push({
          id: `emp-dr-paramitha_${curDate}`,
          employeeId: 'emp-dr-paramitha',
          date: curDate,
          shift: 'libur',
          note: 'Pelayanan Tutup (Hari Minggu)',
        });
      } else {
        schedules.push({
          id: `emp-dr-reza_${curDate}`,
          employeeId: 'emp-dr-reza',
          date: curDate,
          shift: 'pagi',
          note: 'Dokter Penanggung Jawab Pelayanan HD (DPJP)',
        });
        schedules.push({
          id: `emp-dr-paramitha_${curDate}`,
          employeeId: 'emp-dr-paramitha',
          date: curDate,
          shift: 'siang',
          note: 'Dokter Jaga Ruangan Hemodialisa',
        });
      }
    }
  });

  return schedules;
}

export function getInitialMachineAssignments(): MachineAssignment[] {
  const date = '2026-09-19';
  const assignments: MachineAssignment[] = [];

  const add = (shift: 'pagi' | 'siang', nurseId: string, machineIds: string[]) => {
    machineIds.forEach((mId) => {
      assignments.push({
        id: `${date}_${shift}_${mId}`,
        date,
        shift,
        machineId: mId,
        nurseId,
        targetUF: '2.5 L',
        dialyzerType: 'Hi-Flux F7HPS',
      });
    });
  };

  // PAGI:
  // 1. FRANSISCA RANI L : A01 s/d A03 (3 mesin)
  add('pagi', 'emp-fransisca', ['mach-a01', 'mach-a02', 'mach-a03']);
  // 2. RIZKY WAHYU A : A04 s/d A06 (3 mesin)
  add('pagi', 'emp-rizky', ['mach-a04', 'mach-a05', 'mach-a06']);
  // 3. TWIS FERTILIANTI P W : A08 s/d A11 (4 mesin)
  add('pagi', 'emp-twis', ['mach-a08', 'mach-a09', 'mach-a10', 'mach-a11']);
  // 4. ANNISA NUR FAJRI M : A12 s/d C02 (3 mesin: A12, C01, C02)
  add('pagi', 'emp-annisa', ['mach-a12', 'mach-c01', 'mach-c02']);
  // 5. M. HAIKAL MALILANG : C03 s/d B02 (4 mesin: C03, C04, B01, B02)
  add('pagi', 'emp-haikal', ['mach-c03', 'mach-c04', 'mach-b01', 'mach-b02']);
  // 6. NITA RESTIANA : B04 s/d B06 (3 mesin: B04, B05, B06)
  add('pagi', 'emp-nita', ['mach-b04', 'mach-b05', 'mach-b06']);
  // 7. DEA IKA P : B07 s/d B09 +C5 (4 mesin: B07, B08, B09, C05)
  add('pagi', 'emp-dea', ['mach-b07', 'mach-b08', 'mach-b09', 'mach-c05']);

  // SIANG:
  // 1. SISWANTINI CATUR P : A01 s/d A03 (3 mesin)
  add('siang', 'emp-siswantini', ['mach-a01', 'mach-a02', 'mach-a03']);
  // 2. AYU WULANDARI : A04 s/d A06 (3 mesin)
  add('siang', 'emp-ayu-w', ['mach-a04', 'mach-a05', 'mach-a06']);
  // 3. HARI ENDAH : A07 s/d A09 (3 mesin)
  add('siang', 'emp-hari', ['mach-a07', 'mach-a08', 'mach-a09']);
  // 4. Y. BRILLISANTO : A10 s/d A12 (3 mesin)
  add('siang', 'emp-brilli', ['mach-a10', 'mach-a11', 'mach-a12']);
  // 5. AYU PUSPITA R : C01 s/d C03 (3 mesin)
  add('siang', 'emp-ayu-p', ['mach-c01', 'mach-c02', 'mach-c03']);
  // 6. APRILLIA DWI N : C04 s/d B02 (3 mesin: C04, B01, B02)
  add('siang', 'emp-aprillia', ['mach-c04', 'mach-b01', 'mach-b02']);
  // 7. RINI WULANDARI : B03, B04, B07 (3 mesin)
  add('siang', 'emp-rini', ['mach-b03', 'mach-b04', 'mach-b07']);
  // 8. NOVIALITA A : B08, B09 (2 mesin)
  add('siang', 'emp-novialita', ['mach-b08', 'mach-b09']);

  return assignments;
}



