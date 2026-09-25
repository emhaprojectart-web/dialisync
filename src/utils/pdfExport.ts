import jsPDF from 'jspdf';
import autoTable, { RowInput } from 'jspdf-autotable';
import { UserAccount, ShiftSchedule, SpecialTask, ShiftType } from '../types';
import { getEffectiveShiftForEmployee, getNurseScheduleGroupInfo } from './scheduler';

export interface GeneratePdfOptions {
  year: number;
  month: number; // 0-indexed
  monthName: string;
  days: Array<{
    dateStr: string;
    date: Date;
    dayName: string;
    isSunday: boolean;
  }>;
  nurseStaff: UserAccount[];
  doctorStaff: UserAccount[];
  schedules: ShiftSchedule[];
  allEmployees: UserAccount[];
  specialTasks?: SpecialTask[];
  scope?: 'all' | 'perawat' | 'dokter';
}

/**
 * Helper to get special task flags for an employee on a given date and shift
 */
function getStaffTaskFlags(
  employeeId: string,
  dateStr: string,
  shift: string | undefined,
  specialTasks: SpecialTask[] = []
) {
  const forToday = specialTasks.filter(
    (t) => t.assignedToId === employeeId && t.date === dateStr
  );
  const forShift = forToday.filter((t) => !t.shift || t.shift === shift);

  return {
    hasCito: forShift.some((t) => t.category === 'cito'),
    hasPj: forShift.some((t) => t.category === 'pj_shift'),
    hasBhp: forShift.some((t) => t.category === 'bhp'),
    hasFarmasi: forShift.some((t) => t.category === 'farmasi_logistik'),
    hasNatrium: forShift.some((t) => t.category === 'natrium_ro'),
  };
}

/**
 * Builds a jsPDF document for the monthly hemodialysis shift schedule.
 * Separates Nurse and Doctor pages with complete matrix layout, exact button colors,
 * and embedded color legend.
 */
export function buildSchedulePdf(options: GeneratePdfOptions): jsPDF {
  const {
    year,
    monthName,
    days,
    nurseStaff,
    doctorStaff,
    schedules,
    allEmployees,
    specialTasks = [],
    scope = 'all',
  } = options;

  // A4 Landscape: 297mm x 210mm
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const karu =
    nurseStaff.find((n) => n.role === 'kepala_ruangan') ||
    allEmployees.find((n) => n.role === 'kepala_ruangan') || {
      name: 'Ns. Haikal, S.Kep',
      nip: '198503152010011005',
    };

  const dpjp =
    doctorStaff.find((d) => d.id === 'emp-dr-reza') ||
    doctorStaff[0] || {
      name: 'dr. Reza Sp.PD-KGH',
      nip: '197908122005011003',
    };

  let isFirstPage = true;

  // ==========================================
  // 1. HALAMAN JADWAL PERAWAT (NURSE MATRIX)
  // ==========================================
  if (scope === 'all' || scope === 'perawat') {
    isFirstPage = false;

    // KOP SURAT RESMI PERAWAT
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42); // slate-900
    doc.text('RUMAH SAKIT UMUM DAERAH - INSTALASI HEMODIALISA', pageWidth / 2, 11, {
      align: 'center',
    });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(13, 148, 136); // teal-600
    doc.text(
      `JADWAL DINAS SHIFT OPERASIONAL PERAWAT HEMODIALISA - PERIODE ${monthName.toUpperCase()} ${year}`,
      pageWidth / 2,
      16,
      { align: 'center' }
    );

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139); // slate-500
    const printedDateStr = new Date().toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    doc.text(`Dicetak: ${printedDateStr} | Sistem Penjadwalan Unit Hemodialisa`, pageWidth - 12, 21, {
      align: 'right',
    });
    doc.text(
      'Format Matriks Shift Perawat & Penanggung Jawab Tugas Khusus Unit Hemodialisa',
      12,
      21
    );

    // TABLE HEADERS
    const headDays = days.map((d) => `${d.date.getDate()}`);
    const headers = [['No', 'Nama Perawat (#Kel)', ...headDays, 'P', 'S', 'Tot']];

    // DAILY TOTAL COUNTERS
    const dailyPagiCount: number[] = new Array(days.length).fill(0);
    const dailySiangCount: number[] = new Array(days.length).fill(0);

    // MATRIX ROWS
    const nurseCellMeta: Record<string, {
      hasCito: boolean;
      hasPj: boolean;
      hasBhp: boolean;
      hasFarmasi: boolean;
      hasNatrium: boolean;
      shift: string;
      isSunday: boolean;
    }> = {};

    const tableRows: RowInput[] = nurseStaff.map((nurse, index) => {
      const groupInfo = getNurseScheduleGroupInfo(nurse);
      let totalP = 0;
      let totalS = 0;

      const dayShifts = days.map((d, dIdx) => {
        const shift = getEffectiveShiftForEmployee(nurse, d.dateStr, schedules, allEmployees);
        const flags = getStaffTaskFlags(nurse.id, d.dateStr, shift, specialTasks);

        const key = `${index}_${dIdx}`;
        nurseCellMeta[key] = {
          ...flags,
          shift: d.isSunday ? 'libur' : shift || 'libur',
          isSunday: d.isSunday,
        };

        if (d.isSunday) {
          return 'L';
        }
        if (shift === 'pagi') {
          totalP++;
          dailyPagiCount[dIdx]++;
          return 'P';
        }
        if (shift === 'siang') {
          totalS++;
          dailySiangCount[dIdx]++;
          return 'S';
        }
        if (shift === 'pagi_siang') {
          totalP++;
          totalS++;
          dailyPagiCount[dIdx]++;
          dailySiangCount[dIdx]++;
          return '2S';
        }
        if (shift === 'cuti') return 'C';
        if (shift === 'izin') return 'I';
        if (shift === 'sakit') return 'SK';
        return 'L';
      });

      const shortName = nurse.nickname || nurse.name.split(' ')[0];
      const displayName = `${shortName} (#${groupInfo.groupNumber})`;

      return [
        String(index + 1),
        displayName,
        ...dayShifts,
        String(totalP),
        String(totalS),
        String(totalP + totalS),
      ];
    });

    // FOOTER ROWS
    const totalPagiRow: RowInput = [
      '',
      'Total Perawat Pagi',
      ...dailyPagiCount.map((cnt, idx) => (days[idx].isSunday ? '-' : String(cnt))),
      String(dailyPagiCount.reduce((a, b) => a + b, 0)),
      '-',
      String(dailyPagiCount.reduce((a, b) => a + b, 0)),
    ];

    const totalSiangRow: RowInput = [
      '',
      'Total Perawat Siang',
      ...dailySiangCount.map((cnt, idx) => (days[idx].isSunday ? '-' : String(cnt))),
      '-',
      String(dailySiangCount.reduce((a, b) => a + b, 0)),
      String(dailySiangCount.reduce((a, b) => a + b, 0)),
    ];

    tableRows.push(totalPagiRow);
    tableRows.push(totalSiangRow);

    // RENDER NURSE TABLE
    autoTable(doc, {
      startY: 23,
      margin: { left: 10, right: 10 },
      head: headers,
      body: tableRows,
      theme: 'grid',
      styles: {
        fontSize: 6,
        cellPadding: 0.8,
        halign: 'center',
        valign: 'middle',
        textColor: [30, 41, 59],
        lineColor: [203, 213, 225],
        lineWidth: 0.12,
      },
      headStyles: {
        fillColor: [15, 118, 110], // teal-700
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 6,
        halign: 'center',
      },
      columnStyles: {
        0: { cellWidth: 6, halign: 'center' }, // No
        1: { cellWidth: 32, halign: 'left', fontStyle: 'bold' }, // Name
      },
      didParseCell: (data) => {
        const colIndex = data.column.index;
        const rowIndex = data.row.index;
        const isHeader = data.section === 'head';

        // DAY COLUMNS (Dates 1..N)
        if (colIndex >= 2 && colIndex < 2 + days.length) {
          const dayIdx = colIndex - 2;
          const day = days[dayIdx];

          if (isHeader) {
            if (day?.isSunday) {
              data.cell.styles.fillColor = [225, 29, 72]; // rose-600
              data.cell.styles.textColor = [255, 255, 255];
            }
          } else if (rowIndex < nurseStaff.length) {
            const key = `${rowIndex}_${dayIdx}`;
            const meta = nurseCellMeta[key];
            const val = String(data.cell.raw);

            if (day?.isSunday || val === 'L') {
              data.cell.styles.fillColor = [255, 228, 230]; // rose-100
              data.cell.styles.textColor = [190, 18, 60]; // rose-700
              data.cell.styles.fontStyle = 'bold';
            } else if (meta?.hasCito) {
              // CITO Isolasi: Hitam
              data.cell.styles.fillColor = [15, 23, 42]; // slate-900 (Hitam)
              data.cell.styles.textColor = [255, 255, 255];
              data.cell.styles.fontStyle = 'bold';
            } else if (meta?.hasPj) {
              // PJ Shift: Orange
              data.cell.styles.fillColor = [249, 115, 22]; // orange-500
              data.cell.styles.textColor = [255, 255, 255];
              data.cell.styles.fontStyle = 'bold';
            } else if (meta?.hasBhp) {
              // BHP: Biru
              data.cell.styles.fillColor = [37, 99, 235]; // blue-600
              data.cell.styles.textColor = [255, 255, 255];
              data.cell.styles.fontStyle = 'bold';
            } else if (meta?.hasFarmasi) {
              // Farmasi: Ungu
              data.cell.styles.fillColor = [147, 51, 234]; // purple-600
              data.cell.styles.textColor = [255, 255, 255];
              data.cell.styles.fontStyle = 'bold';
            } else if (meta?.hasNatrium) {
              // Natrium RO: Kuning
              data.cell.styles.fillColor = [250, 204, 21]; // yellow-400
              data.cell.styles.textColor = [15, 23, 42]; // dark text for contrast
              data.cell.styles.fontStyle = 'bold';
            } else if (val === 'P') {
              // Pagi Reguler: Hijau
              data.cell.styles.fillColor = [209, 250, 229]; // emerald-100
              data.cell.styles.textColor = [6, 95, 70]; // emerald-800
              data.cell.styles.fontStyle = 'bold';
            } else if (val === 'S') {
              // Siang Reguler: Pink
              data.cell.styles.fillColor = [252, 231, 243]; // pink-100
              data.cell.styles.textColor = [157, 23, 77]; // pink-800
              data.cell.styles.fontStyle = 'bold';
            } else if (val === '2S') {
              // 2 Shif
              data.cell.styles.fillColor = [224, 231, 255]; // indigo-100
              data.cell.styles.textColor = [67, 56, 202]; // indigo-700
              data.cell.styles.fontStyle = 'bold';
            } else if (val === 'C') {
              // Cuti
              data.cell.styles.fillColor = [254, 243, 199]; // amber-100
              data.cell.styles.textColor = [146, 64, 14];
              data.cell.styles.fontStyle = 'bold';
            } else if (val === 'I') {
              // Izin
              data.cell.styles.fillColor = [224, 231, 255];
              data.cell.styles.textColor = [55, 48, 163];
              data.cell.styles.fontStyle = 'bold';
            } else if (val === 'SK') {
              // Sakit
              data.cell.styles.fillColor = [226, 232, 240];
              data.cell.styles.textColor = [30, 41, 59];
              data.cell.styles.fontStyle = 'bold';
            }
          }
        }

        // SUMMARY COLUMNS (P, S, Tot)
        if (colIndex >= 2 + days.length && !isHeader) {
          data.cell.styles.fontStyle = 'bold';
          if (colIndex === 2 + days.length) {
            data.cell.styles.fillColor = [240, 253, 244]; // emerald-50
            data.cell.styles.textColor = [6, 95, 70];
          } else if (colIndex === 2 + days.length + 1) {
            data.cell.styles.fillColor = [253, 242, 248]; // pink-50
            data.cell.styles.textColor = [157, 23, 77];
          } else {
            data.cell.styles.fillColor = [241, 245, 249]; // slate-100
            data.cell.styles.textColor = [15, 23, 42];
          }
        }

        // FOOTER ROWS (Total Pagi, Total Siang)
        if (!isHeader && rowIndex >= nurseStaff.length) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [248, 250, 252];
          if (colIndex === 1) {
            data.cell.styles.halign = 'right';
            data.cell.styles.textColor =
              rowIndex === nurseStaff.length ? [6, 95, 70] : [157, 23, 77];
          }
        }
      },
    });

    // PANDUAN WARNA TOMBOL MATRIKS (DISEMATKAN DI BAWAH MATRIKS PERAWAT)
    const afterTableY = (doc as any).lastAutoTable?.finalY || 135;

    autoTable(doc, {
      startY: afterTableY + 2.5,
      margin: { left: 10, right: 10 },
      head: [
        [
          {
            content:
              'PANDUAN WARNA TOMBOL SHIFT & TUGAS KHUSUS PADA MATRIKS JADWAL PERAWAT (Mudah Dipahami Saat Dicetak)',
            colSpan: 1,
            styles: {
              fillColor: [15, 118, 110], // teal-700
              textColor: [255, 255, 255],
              fontStyle: 'bold',
              fontSize: 6.5,
              halign: 'left',
            },
          },
        ],
      ],
      body: [
        [
          '• Shift Pagi (Tombol P):  [P Hijau] Pagi Reguler  |  [P Orange] PJ Shift  |  [P Biru] BHP  |  [P Ungu] Farmasi & Logistik  |  [P Kuning] Natrium RO  |  [P Hitam] CITO Isolasi',
        ],
        [
          '• Shift Siang (Tombol S): [S Pink] Siang Reguler  |  [S Orange] PJ Shift  |  [S Biru] BHP  |  [S Ungu] Farmasi & Logistik  |  [S Kuning] Natrium RO  |  [S Hitam] CITO Isolasi',
        ],
        [
          '• Status Lainnya:         [L Merah] Libur Rutin / Hari Minggu  |  [C Kuning] Cuti  |  [I Biru] Izin  |  [SK Abu] Sakit  |  [2S Ungu] Dinas Rangkap 2 Shif',
        ],
      ],
      theme: 'grid',
      styles: {
        fontSize: 5.8,
        cellPadding: 0.9,
        halign: 'left',
        textColor: [30, 41, 59],
        lineColor: [204, 251, 241], // teal-100
        lineWidth: 0.1,
        fillColor: [240, 253, 250], // teal-50/50
      },
    });

    const legendFinalY = (doc as any).lastAutoTable?.finalY || afterTableY + 18;

    // LEMBAR PENGESAHAN PERAWAT
    let signY = legendFinalY + 4;
    if (signY > pageHeight - 32) {
      signY = pageHeight - 32;
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85); // slate-700

    // TTD Kiri: Kepala Ruangan Hemodialisa
    doc.text('Mengetahui,', 25, signY);
    doc.text('Kepala Ruangan Hemodialisa', 25, signY + 3.5);
    doc.setFont('helvetica', 'bold');
    doc.text(karu.name, 25, signY + 16);
    doc.setFont('helvetica', 'normal');
    doc.text(`NIP. ${karu.nip}`, 25, signY + 19.5);

    // TTD Kanan: Dokter Penanggung Jawab Pelayanan HD
    const rightX = pageWidth - 90;
    doc.text(`${monthName} ${year}`, rightX, signY);
    doc.text('Dokter Penanggung Jawab Hemodialisa (DPJP)', rightX, signY + 3.5);
    doc.setFont('helvetica', 'bold');
    doc.text(dpjp.name, rightX, signY + 16);
    doc.setFont('helvetica', 'normal');
    doc.text(`NIP. ${dpjp.nip}`, rightX, signY + 19.5);
  }

  // ==========================================
  // 2. HALAMAN JADWAL DOKTER (DOKTER JAGA HD)
  // ==========================================
  if (scope === 'all' || scope === 'dokter') {
    if (!isFirstPage) {
      doc.addPage();
    }

    // KOP SURAT RESMI DOKTER
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42); // slate-900
    doc.text('RUMAH SAKIT UMUM DAERAH - INSTALASI HEMODIALISA', pageWidth / 2, 11, {
      align: 'center',
    });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(37, 99, 235); // blue-600
    doc.text(
      `JADWAL PENUGASAN DOKTER JAGA UNIT HEMODIALISA - PERIODE ${monthName.toUpperCase()} ${year}`,
      pageWidth / 2,
      16,
      { align: 'center' }
    );

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139); // slate-500
    const printedDateStr = new Date().toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    doc.text(`Dicetak: ${printedDateStr} | Sistem Penjadwalan Unit Hemodialisa`, pageWidth - 12, 21, {
      align: 'right',
    });
    doc.text(
      'Jadwal Dinas Dokter Shif Pagi (07:00 - 14:00) & Shif Siang (13:30 - 20:30)',
      12,
      21
    );

    // DOKTER TABLE: 2 Kolom Sejajar (Hari 1-16 di kiri, Hari 17-akhir di kanan)
    const midPoint = Math.ceil(days.length / 2);
    const daysCol1 = days.slice(0, midPoint);
    const daysCol2 = days.slice(midPoint);

    const buildDocRows = (dayList: typeof days): RowInput[] => {
      return dayList.map((day, idx) => {
        if (day.isSunday) {
          return [
            `${day.date.getDate()} ${monthName.slice(0, 3)} (${day.dayName.slice(0, 3)})`,
            'Libur Rutin HD (Minggu)',
            'Libur Rutin HD (Minggu)',
            'Libur Layanan',
          ];
        }

        const pSch = schedules.find(
          (s) => s.date === day.dateStr && (s.shift === 'pagi' || s.shift === 'pagi_siang')
        );
        const sSch = schedules.find(
          (s) => s.date === day.dateStr && (s.shift === 'siang' || s.shift === 'pagi_siang')
        );

        const docPagi = pSch ? doctorStaff.find((d) => d.id === pSch.employeeId) : null;
        const docSiang = sSch ? doctorStaff.find((d) => d.id === sSch.employeeId) : null;

        const pName = docPagi ? docPagi.name : '-';
        const sName = docSiang ? docSiang.name : '-';

        const isDouble = docPagi && docSiang && docPagi.id === docSiang.id;
        const statusStr = isDouble 
          ? 'Rangkap 2 Shif' 
          : (docPagi && docSiang) 
          ? 'Terisi Lengkap' 
          : (docPagi || docSiang) 
          ? 'Terisi Sebagian' 
          : 'Belum Terisi';

        return [
          `${day.date.getDate()} ${monthName.slice(0, 3)} (${day.dayName.slice(0, 3)})`,
          pName,
          sName,
          statusStr,
        ];
      });
    };

    const docHeaders = [['Tanggal & Hari', 'Dokter Shif Pagi (07-14)', 'Dokter Shif Siang (13-20)', 'Status']];
    const halfWidth = (pageWidth - 26) / 2;

    // Col 1 Table (Left)
    autoTable(doc, {
      startY: 24,
      margin: { left: 10, right: pageWidth / 2 + 3 },
      head: docHeaders,
      body: buildDocRows(daysCol1),
      theme: 'grid',
      styles: {
        fontSize: 6,
        cellPadding: 1,
        halign: 'left',
        valign: 'middle',
        lineColor: [226, 232, 240],
        lineWidth: 0.12,
      },
      headStyles: {
        fillColor: [37, 99, 235], // blue-600
        textColor: [255, 255, 255],
        fontSize: 6.2,
        fontStyle: 'bold',
        halign: 'center',
      },
      columnStyles: {
        0: { cellWidth: 28, halign: 'center', fontStyle: 'bold' },
        1: { cellWidth: 46 },
        2: { cellWidth: 46 },
        3: { cellWidth: 16, halign: 'center' },
      },
      didParseCell: (data) => {
        if (data.section === 'body') {
          const rawRow = data.row.raw as any;
          const rowText = String(rawRow?.[1] || '');
          if (rowText.includes('Libur Rutin')) {
            data.cell.styles.fillColor = [255, 241, 242]; // rose-50
            data.cell.styles.textColor = [190, 18, 60];
          }
        }
      },
    });

    const finalY1 = (doc as any).lastAutoTable?.finalY || 135;

    // Col 2 Table (Right)
    autoTable(doc, {
      startY: 24,
      margin: { left: pageWidth / 2 + 3, right: 10 },
      head: docHeaders,
      body: buildDocRows(daysCol2),
      theme: 'grid',
      styles: {
        fontSize: 6,
        cellPadding: 1,
        halign: 'left',
        valign: 'middle',
        lineColor: [226, 232, 240],
        lineWidth: 0.12,
      },
      headStyles: {
        fillColor: [37, 99, 235], // blue-600
        textColor: [255, 255, 255],
        fontSize: 6.2,
        fontStyle: 'bold',
        halign: 'center',
      },
      columnStyles: {
        0: { cellWidth: 28, halign: 'center', fontStyle: 'bold' },
        1: { cellWidth: 46 },
        2: { cellWidth: 46 },
        3: { cellWidth: 16, halign: 'center' },
      },
      didParseCell: (data) => {
        if (data.section === 'body') {
          const rawRow = data.row.raw as any;
          const rowText = String(rawRow?.[1] || '');
          if (rowText.includes('Libur Rutin')) {
            data.cell.styles.fillColor = [255, 241, 242]; // rose-50
            data.cell.styles.textColor = [190, 18, 60];
          }
        }
      },
    });

    const finalY2 = (doc as any).lastAutoTable?.finalY || 135;
    const docTableBottomY = Math.max(finalY1, finalY2);

    // TABEL RINGKASAN BEBAN JAGA DOKTER BULAN INI
    const docStats = doctorStaff.map((docItem) => {
      let pagi = 0;
      let siang = 0;
      days.forEach((d) => {
        if (d.isSunday) return;
        const pDoc = schedules.find(
          (s) => s.date === d.dateStr && s.employeeId === docItem.id && (s.shift === 'pagi' || s.shift === 'pagi_siang')
        );
        const sDoc = schedules.find(
          (s) => s.date === d.dateStr && s.employeeId === docItem.id && (s.shift === 'siang' || s.shift === 'pagi_siang')
        );
        if (pDoc) pagi++;
        if (sDoc) siang++;
      });
      return [
        docItem.name,
        docItem.specialization || 'Dokter Penanggung Jawab / Jaga HD',
        String(pagi),
        String(siang),
        String(pagi + siang),
      ];
    });

    autoTable(doc, {
      startY: docTableBottomY + 3.5,
      margin: { left: 10, right: 10 },
      head: [
        [
          {
            content: 'RINGKASAN TOTAL BEBAN JAGA DOKTER BULAN INI',
            colSpan: 5,
            styles: {
              fillColor: [30, 58, 138], // blue-900
              textColor: [255, 255, 255],
              fontStyle: 'bold',
              fontSize: 6.5,
              halign: 'center',
            },
          },
        ],
        ['Nama Dokter', 'Peran / Spesialisasi', 'Total Pagi', 'Total Siang', 'Total Shif Dinas'],
      ],
      body: docStats,
      theme: 'grid',
      styles: {
        fontSize: 6.2,
        cellPadding: 1,
        valign: 'middle',
        lineColor: [226, 232, 240],
        lineWidth: 0.12,
      },
      headStyles: {
        fillColor: [59, 130, 246], // blue-500
        textColor: [255, 255, 255],
        fontSize: 6.2,
        fontStyle: 'bold',
        halign: 'center',
      },
      columnStyles: {
        0: { cellWidth: 70, fontStyle: 'bold' },
        1: { cellWidth: 100 },
        2: { cellWidth: 35, halign: 'center' },
        3: { cellWidth: 35, halign: 'center' },
        4: { cellWidth: 37, halign: 'center', fontStyle: 'bold' },
      },
    });

    const docSummaryFinalY = (doc as any).lastAutoTable?.finalY || docTableBottomY + 22;

    // LEMBAR PENGESAHAN DOKTER
    let docSignY = docSummaryFinalY + 4;
    if (docSignY > pageHeight - 32) {
      docSignY = pageHeight - 32;
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85); // slate-700

    // TTD Kiri: Kepala Ruangan Hemodialisa
    doc.text('Mengetahui,', 25, docSignY);
    doc.text('Kepala Ruangan Hemodialisa', 25, docSignY + 3.5);
    doc.setFont('helvetica', 'bold');
    doc.text(karu.name, 25, docSignY + 16);
    doc.setFont('helvetica', 'normal');
    doc.text(`NIP. ${karu.nip}`, 25, docSignY + 19.5);

    // TTD Kanan: Dokter Penanggung Jawab Pelayanan HD
    const rightX = pageWidth - 90;
    doc.text(`${monthName} ${year}`, rightX, docSignY);
    doc.text('Dokter Penanggung Jawab Hemodialisa (DPJP)', rightX, docSignY + 3.5);
    doc.setFont('helvetica', 'bold');
    doc.text(dpjp.name, rightX, docSignY + 16);
    doc.setFont('helvetica', 'normal');
    doc.text(`NIP. ${dpjp.nip}`, rightX, docSignY + 19.5);
  }

  return doc;
}

/**
 * Downloads the PDF directly to the user's computer.
 */
export function exportScheduleToPdf(options: GeneratePdfOptions): void {
  const doc = buildSchedulePdf(options);
  const scopeSuffix =
    options.scope === 'perawat'
      ? '_Perawat'
      : options.scope === 'dokter'
      ? '_Dokter'
      : '_Lengkap';
  const fileName = `Jadwal_Shift_HD_${options.monthName}_${options.year}${scopeSuffix}.pdf`;
  doc.save(fileName);
}

/**
 * Opens the PDF in a new tab or triggers direct browser printing.
 */
export function printScheduleDirectly(options: GeneratePdfOptions): void {
  const doc = buildSchedulePdf(options);
  const blobUrl = doc.output('bloburl');
  const printWindow = window.open(blobUrl, '_blank');
  if (printWindow) {
    printWindow.focus();
  } else {
    window.print();
  }
}
