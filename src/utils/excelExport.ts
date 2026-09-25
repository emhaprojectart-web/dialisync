import * as XLSX from 'xlsx';
import { 
  UserAccount, 
  ShiftSchedule, 
  HDMachine, 
  MachineAssignment, 
  AppSettings,
  SHIFT_TYPE_INFO
} from '../types';
import { getDaysInMonth, sortNursesByShiftScheduleOrder } from './scheduler';

const INDONESIAN_MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

const INDONESIAN_DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

/**
 * Builds the calendar matrix worksheet for a given month
 */
export function buildMatrixWorksheet(
  monthPrefix: string, // YYYY-MM
  schedules: ShiftSchedule[],
  employees: UserAccount[]
): XLSX.WorkSheet {
  const [yearStr, monthStr] = monthPrefix.split('-');
  const year = parseInt(yearStr, 10) || new Date().getFullYear();
  const month = parseInt(monthStr, 10) || (new Date().getMonth() + 1);
  const daysInMonth = new Date(year, month, 0).getDate();

  const activeNurses = sortNursesByShiftScheduleOrder(
    employees.filter(
      (e) => e.role === 'perawat' || e.role === 'pj_shift' || e.role === 'kepala_ruangan'
    )
  );

  // Headers row
  const headers: string[] = ['No', 'Nama Perawat', 'NIP', 'Peran', 'Tugas Khusus'];
  for (let d = 1; d <= daysInMonth; d++) {
    headers.push(String(d));
  }
  headers.push('Pagi (P)', 'Siang (S)', 'Libur (L)', 'Cuti (C)', 'Sakit (SK)', 'Total Dinas');

  const rows: (string | number)[][] = [headers];

  activeNurses.forEach((nurse, idx) => {
    let countP = 0;
    let countS = 0;
    let countL = 0;
    let countC = 0;
    let countSk = 0;

    const roleLabel =
      nurse.role === 'kepala_ruangan'
        ? 'Kepala Ruangan'
        : nurse.role === 'pj_shift' || (nurse.role as string) === 'katim'
        ? 'KATIM'
        : 'Perawat Pelaksana';

    const row: (string | number)[] = [
      idx + 1,
      nurse.name,
      nurse.nip || '-',
      roleLabel,
      nurse.specialDuty || '-',
    ];

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const sch = schedules.find((s) => s.employeeId === nurse.id && s.date === dateStr);
      let code = 'L';
      if (sch) {
        if (sch.shift === 'pagi') code = 'P';
        else if (sch.shift === 'siang') code = 'S';
        else if (sch.shift === 'pagi_siang') code = 'P/S';
        else if (sch.shift === 'libur') code = 'L';
        else if (sch.shift === 'cuti') code = 'C';
        else if (sch.shift === 'sakit') code = 'SK';
        else if (sch.shift === 'izin') code = 'I';
      }

      if (code === 'P' || code === 'P/S') countP++;
      if (code === 'S' || code === 'P/S') countS++;
      if (code === 'L') countL++;
      if (code === 'C') countC++;
      if (code === 'SK') countSk++;

      row.push(code);
    }

    row.push(countP, countS, countL, countC, countSk, countP + countS);
    rows.push(row);
  });

  // Daily Summary Row
  const summaryRowP: (string | number)[] = ['Summary', 'Total Shift Pagi (P)', '', '', ''];
  const summaryRowS: (string | number)[] = ['Summary', 'Total Shift Siang (S)', '', '', ''];

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    let pCount = 0;
    let sCount = 0;
    activeNurses.forEach((nurse) => {
      const sch = schedules.find((s) => s.employeeId === nurse.id && s.date === dateStr);
      if (sch?.shift === 'pagi' || sch?.shift === 'pagi_siang') pCount++;
      if (sch?.shift === 'siang' || sch?.shift === 'pagi_siang') sCount++;
    });
    summaryRowP.push(pCount);
    summaryRowS.push(sCount);
  }
  summaryRowP.push('', '', '', '', '', '');
  summaryRowS.push('', '', '', '', '', '');

  rows.push([]);
  rows.push(summaryRowP);
  rows.push(summaryRowS);

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Set column widths
  const colWidths = [
    { wch: 4 },  // No
    { wch: 28 }, // Nama
    { wch: 18 }, // NIP
    { wch: 16 }, // Peran
    { wch: 20 }, // Tugas Khusus
  ];
  for (let d = 1; d <= daysInMonth; d++) {
    colWidths.push({ wch: 4 });
  }
  colWidths.push({ wch: 9 }, { wch: 9 }, { wch: 9 }, { wch: 9 }, { wch: 9 }, { wch: 12 });
  ws['!cols'] = colWidths;

  return ws;
}

/**
 * Builds the doctor schedule worksheet for a given month
 */
export function buildDoctorWorksheet(
  monthPrefix: string,
  schedules: ShiftSchedule[],
  employees: UserAccount[]
): XLSX.WorkSheet {
  const [yearStr, monthStr] = monthPrefix.split('-');
  const year = parseInt(yearStr, 10) || new Date().getFullYear();
  const month = parseInt(monthStr, 10) || (new Date().getMonth() + 1);
  const daysInMonth = new Date(year, month, 0).getDate();

  const doctorEmployees = employees.filter((e) => e.role === 'dokter');

  const headers = ['No', 'Tanggal', 'Hari', 'Dokter Shift Pagi (07:00 - 14:00)', 'Dokter Shift Siang (13:30 - 20:30)', 'Status Dinas', 'Catatan'];
  const rows: (string | number)[][] = [headers];

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayObj = new Date(year, month - 1, d);
    const dayName = INDONESIAN_DAYS[dayObj.getDay()];
    const isSunday = dayObj.getDay() === 0;

    const pagiDoc = doctorEmployees.find((doc) => {
      const sch = schedules.find((s) => s.employeeId === doc.id && s.date === dateStr);
      return sch && (sch.shift === 'pagi' || sch.shift === 'pagi_siang');
    });

    const siangDoc = doctorEmployees.find((doc) => {
      const sch = schedules.find((s) => s.employeeId === doc.id && s.date === dateStr);
      return sch && (sch.shift === 'siang' || sch.shift === 'pagi_siang');
    });

    const docPagiName = isSunday ? '-' : (pagiDoc ? pagiDoc.name : '-');
    const docSiangName = isSunday ? '-' : (siangDoc ? siangDoc.name : '-');

    let status = 'Belum Terisi';
    if (isSunday) {
      status = 'Libur Rutin HD (Minggu)';
    } else if (pagiDoc && siangDoc && pagiDoc.id === siangDoc.id) {
      status = '2 Shif Sekaligus';
    } else if (pagiDoc && siangDoc && pagiDoc.id !== siangDoc.id) {
      status = 'Lengkap (2 Dr)';
    } else if (pagiDoc && !siangDoc) {
      status = 'Pagi Saja';
    } else if (!pagiDoc && siangDoc) {
      status = 'Siang Saja';
    }

    const notes = isSunday ? 'Libur Rutin HD (Hari Minggu)' : '';

    rows.push([
      d,
      dateStr,
      dayName,
      docPagiName,
      docSiangName,
      status,
      notes,
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 6 },
    { wch: 14 },
    { wch: 12 },
    { wch: 34 },
    { wch: 34 },
    { wch: 22 },
    { wch: 28 },
  ];
  return ws;
}

/**
 * Builds the machine assignment worksheet for a given month
 */
export function buildMachineWorksheet(
  monthPrefix: string,
  machines: HDMachine[],
  machineAssignments: MachineAssignment[],
  employees: UserAccount[]
): XLSX.WorkSheet {
  const headers = ['No', 'Tanggal', 'Shift', 'Kode Mesin', 'Bay / Area', 'Nama Perawat', 'Peran'];
  const rows: (string | number)[][] = [headers];

  const monthAssignments = (machineAssignments || []).filter(
    (ma) => ma.date && ma.date.startsWith(monthPrefix)
  );

  monthAssignments.sort((a, b) => a.date.localeCompare(b.date) || a.shift.localeCompare(b.shift));

  monthAssignments.forEach((ma, idx) => {
    const emp = employees.find((e) => e.id === ma.nurseId);
    const mach = machines.find((m) => String(m.id) === String(ma.machineId) || m.code === ma.machineId);

    rows.push([
      idx + 1,
      ma.date,
      ma.shift === 'pagi' ? 'Pagi' : 'Siang',
      mach ? mach.code : (ma.machineId || '-'),
      mach?.bay || mach?.zone || '-',
      emp?.name || ma.nurseId || '-',
      emp?.role ? (emp.role === 'pj_shift' || (emp.role as string) === 'katim' ? 'KATIM' : 'Perawat') : '-',
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 6 },
    { wch: 14 },
    { wch: 10 },
    { wch: 14 },
    { wch: 18 },
    { wch: 28 },
    { wch: 14 },
  ];
  return ws;
}

/**
 * Exports a single month to Excel (.xlsx) file download
 */
export function exportMonthToExcel(
  monthPrefix: string,
  schedules: ShiftSchedule[],
  employees: UserAccount[],
  machines: HDMachine[],
  machineAssignments: MachineAssignment[],
  hospitalName: string = 'RS Happy Land Medical Centre'
): void {
  const [yearStr, monthStr] = monthPrefix.split('-');
  const year = parseInt(yearStr, 10) || new Date().getFullYear();
  const month = parseInt(monthStr, 10) || (new Date().getMonth() + 1);
  const monthName = INDONESIAN_MONTH_NAMES[month - 1] || `Bulan-${month}`;

  const wb = XLSX.utils.book_new();

  // 1. Matrix Worksheet
  const wsMatrix = buildMatrixWorksheet(monthPrefix, schedules, employees);
  XLSX.utils.book_append_sheet(wb, wsMatrix, `Matriks ${monthName}`);

  // 2. Doctor Worksheet
  const wsDoctor = buildDoctorWorksheet(monthPrefix, schedules, employees);
  XLSX.utils.book_append_sheet(wb, wsDoctor, 'Jadwal Dokter');

  // 3. Machine Assignments Worksheet
  const wsMachine = buildMachineWorksheet(monthPrefix, machines, machineAssignments, employees);
  XLSX.utils.book_append_sheet(wb, wsMachine, 'Alokasi Mesin');

  const fileName = `Jadwal_HD_${monthName}_${year}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

/**
 * Exports multiple selected months or entire year to Excel (.xlsx) file download
 */
export function exportMultipleMonthsToExcel(
  monthPrefixes: string[],
  schedules: ShiftSchedule[],
  employees: UserAccount[],
  machines: HDMachine[],
  machineAssignments: MachineAssignment[],
  customFileName?: string
): void {
  const wb = XLSX.utils.book_new();

  monthPrefixes.forEach((mPfx) => {
    const [yearStr, monthStr] = mPfx.split('-');
    const year = parseInt(yearStr, 10) || new Date().getFullYear();
    const month = parseInt(monthStr, 10) || (new Date().getMonth() + 1);
    const monthName = INDONESIAN_MONTH_NAMES[month - 1] || `Bulan-${month}`;

    const sheetName = `${monthName.substring(0, 3)} ${year}`;
    const wsMatrix = buildMatrixWorksheet(mPfx, schedules, employees);
    XLSX.utils.book_append_sheet(wb, wsMatrix, sheetName);
  });

  const firstPrefix = monthPrefixes[0] || '2026';
  const year = firstPrefix.split('-')[0];
  const fileName = customFileName || `Jadwal_HD_Tahunan_${year}_(${monthPrefixes.length}_Bulan).xlsx`;
  XLSX.writeFile(wb, fileName);
}
