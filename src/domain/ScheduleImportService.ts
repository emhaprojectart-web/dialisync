import { Nurse, ShiftAssignment, ShiftType, Machine, SHIFT_TYPE_INFO } from '../types';
import { FairSchedulerEngine } from './FairSchedulerEngine';

// Dynamic loader for XLSX to keep initial mobile bundle ultra-lightweight
const getXLSX = async () => {
  return await import('xlsx');
};

export interface ImportPreviewItem {
  date: string;
  nurseId: number;
  nurseName: string;
  nursePhone: string;
  shiftType: ShiftType;
  rawShiftCode: string;
  assignedMachineIds: (number | string)[];
  isLeader: boolean;
  notes: string;
  isMatched: boolean;
  warning?: string;
}

export interface ImportParseResult {
  isSuccess: boolean;
  message: string;
  monthString: string; // e.g. "2026-09"
  totalRows: number;
  detectedNursesCount: number;
  unmatchedNurses: string[];
  newNursesCreated?: Nurse[];
  daysCount: number;
  shiftCounts: {
    pagi: number;
    siang: number;
    libur: number;
    cuti: number;
    sakit: number;
    other: number;
  };
  assignments: ShiftAssignment[];
  previewList: ImportPreviewItem[];
}

export class ScheduleImportService {
  /**
   * Normalizes arbitrary string into recognized ShiftType.
   */
  static normalizeShiftCode(raw: string | number | undefined | null): ShiftType {
    if (raw === undefined || raw === null) return 'LIBUR';
    const str = String(raw).trim().toUpperCase();

    if (!str || str === '-' || str === '0') return 'LIBUR';

    // PAGI
    if (
      str === 'P' ||
      str === 'PAGI' ||
      str === 'P1' ||
      str === 'P2' ||
      str === 'MORNING' ||
      str === 'M' ||
      str.includes('PAGI')
    ) {
      return 'PAGI';
    }

    // SIANG / SORE
    if (
      str === 'S' ||
      str === 'SIANG' ||
      str === 'SORE' ||
      str === 'AFTERNOON' ||
      str === 'A' ||
      str === 'E' || // Evening
      str.includes('SIANG') ||
      str.includes('SORE')
    ) {
      return 'SIANG';
    }

    // CUTI
    if (
      str === 'C' ||
      str === 'CUTI' ||
      str === 'CT' ||
      str === 'LEAVE' ||
      str.includes('CUTI')
    ) {
      return 'CUTI';
    }

    // SAKIT / IZIN
    if (
      str === 'SKT' ||
      str === 'SAKIT' ||
      str === 'IZIN' ||
      str === 'IJIN' ||
      str === 'I' ||
      str === 'SICK' ||
      str.includes('SAKIT') ||
      str.includes('IZIN')
    ) {
      return 'SAKIT';
    }

    // LIBUR / OFF
    if (
      str === 'L' ||
      str === 'LIBUR' ||
      str === 'OFF' ||
      str === 'O' ||
      str === 'F' ||
      str === 'FREE' ||
      str.includes('LIBUR') ||
      str.includes('OFF')
    ) {
      return 'LIBUR';
    }

    return 'LIBUR';
  }

  private static readonly NON_NURSE_NAME_WORDS = new Set([
    'katim', 'pelaksana', 'karu', 'kepala', 'pj', 'pj shift', 'staff', 'staf',
    'perawat', 'nurse', 'ruangan', 'ruang', 'hemodialisa', 'hd', 'unit',
    'd3', 's1', 'ners', 'pns', 'kontrak', 'thl', 'honorer', 'gol', 'golongan',
    'jabatan', 'no', 'no.', 'nomor', 'nik', 'nip', 'total', 'jumlah',
    'libur', 'cuti', 'sakit', 'pagi', 'siang', 'off', 'hari', 'tanggal',
    'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu', 'minggu',
    'mengetahui', 'direktur', 'ttd', 'tanda tangan', 'catatan', 'keterangan'
  ]);

  /**
   * Normalizes nurse names for matching:
   * Strips professional medical titles, academic degrees, suffixes, punctuation, and extra whitespace.
   */
  static normalizeNurseNameForMatching(name: string): string {
    if (!name) return '';
    return name
      .toLowerCase()
      // Remove prefixes: Ns., Ners, Dr., Hj., H., Br., Sr., etc.
      .replace(/\b(ns\.|ners|dr\.|dra\.|drs\.|hj\.|h\.|br\.|sr\.|prof\.)\s*/gi, '')
      // Remove post-nominal degrees / suffixes
      .replace(/,\s*(s\.kep|ners|ns|a\.md\.kep|amk|s\.tr\.kep|s\.st|m\.kep|s\.psi|skep|amd|amd\.kep|s\.kom|se|mm|mh).*$/gi, '')
      .replace(/\b(s\.kep|ners|ns|a\.md\.kep|amk|s\.tr\.kep|s\.st|m\.kep|s\.psi|skep|amd|amd\.kep)\b/gi, '')
      // Remove parenthesized content
      .replace(/\([^)]*\)/g, ' ')
      // Clean non-alphanumeric except space
      .replace(/[^a-z0-9\s]/gi, ' ')
      // Collapse whitespace
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Matches a raw nurse name or NIP to existing Nurse record.
   * Employs multi-stage matching: exact, NIP, normalized title-stripped, token-based, and fuzzy scoring.
   */
  static matchNurse(rawName: string, nurses: Nurse[]): Nurse | null {
    if (!rawName) return null;
    const rawTrimmed = rawName.trim();
    if (!rawTrimmed) return null;

    // Reject known non-nurse keywords
    if (this.NON_NURSE_NAME_WORDS.has(rawTrimmed.toLowerCase())) {
      return null;
    }

    // 1. Exact raw match
    const exact = nurses.find(
      (n) => n.name.trim().toLowerCase() === rawTrimmed.toLowerCase()
    );
    if (exact) return exact;

    // 2. NIP match
    const byNip = nurses.find((n) => n.nip && n.nip.trim() === rawTrimmed);
    if (byNip) return byNip;

    // 3. Clean normalized match (strips Ns., S.Kep, etc.)
    const normRaw = this.normalizeNurseNameForMatching(rawTrimmed);
    if (!normRaw) return null;

    const exactNorm = nurses.find(
      (n) => this.normalizeNurseNameForMatching(n.name) === normRaw
    );
    if (exactNorm) return exactNorm;

    // 4. Token-based word matching with priority for distinctive words
    const rawWords = normRaw.split(' ').filter((w) => w.length > 0);
    let bestNurse: Nurse | null = null;
    let bestScore = 0;

    for (const nurse of nurses) {
      const nurseNorm = this.normalizeNurseNameForMatching(nurse.name);
      if (nurseNorm === normRaw) return nurse;

      const nurseWords = nurseNorm.split(' ').filter((w) => w.length > 0);

      // Distinctive words (length >= 4) e.g., "haikal", "malilang", "novialita", "wulandari", "puspita", "khoirudin", "brillisanto"
      const rawDistinctive = rawWords.filter((w) => w.length >= 4);
      const nurseDistinctive = nurseWords.filter((w) => w.length >= 4);

      // If both have distinctive words, do NOT match if there is a conflict (e.g. "Ayu Wulandari" vs "Ayu Puspita")
      if (rawDistinctive.length > 0 && nurseDistinctive.length > 0) {
        const hasCommonDistinctive = rawDistinctive.some((rw) => nurseDistinctive.includes(rw));
        if (!hasCommonDistinctive) continue;
      }

      let matchCount = 0;
      let initialCount = 0;

      for (const rw of rawWords) {
        if (nurseWords.includes(rw)) {
          matchCount += 1;
        } else if (rw.length === 1) {
          // single letter initial e.g. "m" for "muhammad" or "p" for "puspita"
          if (nurseWords.some((nw) => nw === rw || nw.startsWith(rw))) {
            initialCount += 0.5;
          }
        } else {
          // prefix match
          if (nurseWords.some((nw) => nw.startsWith(rw) || rw.startsWith(nw))) {
            matchCount += 0.8;
          }
        }
      }

      const totalWords = Math.max(rawWords.length, nurseWords.length) || 1;
      const score = (matchCount * 2 + initialCount) / totalWords;

      if (score > bestScore && score >= 1.0) {
        bestScore = score;
        bestNurse = nurse;
      }
    }

    if (bestNurse) return bestNurse;

    // 5. Substring / Includes fallback if string is distinctive enough
    for (const nurse of nurses) {
      const nurseNorm = this.normalizeNurseNameForMatching(nurse.name);
      if (
        (nurseNorm.length >= 5 && normRaw.includes(nurseNorm)) ||
        (normRaw.length >= 5 && nurseNorm.includes(normRaw))
      ) {
        return nurse;
      }
    }

    return null;
  }

  /**
   * Parses an ArrayBuffer (from Excel .xlsx, .xls, .csv) into structured Schedule.
   */
  static async parseExcelFile(
    fileBuffer: ArrayBuffer,
    targetMonth: string, // e.g. "2026-09"
    nurses: Nurse[],
    machines: Machine[],
    autoAllocateMachines: boolean = true
  ): Promise<ImportParseResult> {
    try {
      const XLSX = await getXLSX();
      const workbook = XLSX.read(fileBuffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        return {
          isSuccess: false,
          message: 'File Excel tidak memiliki lembar kerja (Sheet) yang valid.',
          monthString: targetMonth,
          totalRows: 0,
          detectedNursesCount: 0,
          unmatchedNurses: [],
          daysCount: 0,
          shiftCounts: { pagi: 0, siang: 0, libur: 0, cuti: 0, sakit: 0, other: 0 },
          assignments: [],
          previewList: [],
        };
      }

      const worksheet = workbook.Sheets[sheetName];
      const rawRows: (string | number | undefined | null)[][] = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: '',
      });

      return this.parseRawMatrixOrList(rawRows, targetMonth, nurses, machines, autoAllocateMachines);
    } catch (e: unknown) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      return {
        isSuccess: false,
        message: `Gagal membaca file Excel: ${errorMsg}`,
        monthString: targetMonth,
        totalRows: 0,
        detectedNursesCount: 0,
        unmatchedNurses: [],
        daysCount: 0,
        shiftCounts: { pagi: 0, siang: 0, libur: 0, cuti: 0, sakit: 0, other: 0 },
        assignments: [],
        previewList: [],
      };
    }
  }

  /**
   * Parses Raw 2D Array Matrix (from Excel, CSV, TSV, or Google Sheets).
   */
  static parseRawMatrixOrList(
    rows: (string | number | undefined | null)[][],
    targetMonth: string,
    nurses: Nurse[],
    machines: Machine[],
    autoAllocateMachines: boolean = true
  ): ImportParseResult {
    if (!rows || rows.length === 0) {
      return {
        isSuccess: false,
        message: 'Data kosong atau tidak dapat dibaca.',
        monthString: targetMonth,
        totalRows: 0,
        detectedNursesCount: 0,
        unmatchedNurses: [],
        newNursesCreated: [],
        daysCount: 0,
        shiftCounts: { pagi: 0, siang: 0, libur: 0, cuti: 0, sakit: 0, other: 0 },
        assignments: [],
        previewList: [],
      };
    }

    // Filter out completely blank rows
    const validRows = rows.filter((r) => r && r.some((cell) => cell !== '' && cell !== null && cell !== undefined));

    // Determine whether this is List Format (columns: Tanggal, Nama, Shift) or Matrix Format (Rows: Nurses, Cols: Days 1..31)
    const isListFormat = this.detectIfListFormat(validRows);

    if (isListFormat) {
      return this.parseListFormat(validRows, targetMonth, nurses, machines, autoAllocateMachines);
    } else {
      return this.parseMatrixFormat(validRows, targetMonth, nurses, machines, autoAllocateMachines);
    }
  }

  /**
   * Helper to detect if tabular data is in flat List format (Tanggal | Nama | Shift).
   */
  private static detectIfListFormat(rows: (string | number | undefined | null)[][]): boolean {
    const firstFew = rows.slice(0, 5);
    for (const row of firstFew) {
      const strRow = row.map((c) => String(c).toLowerCase()).join(' ');
      if (
        (strRow.includes('tanggal') || strRow.includes('date')) &&
        (strRow.includes('nama') || strRow.includes('perawat') || strRow.includes('nurse')) &&
        (strRow.includes('sif') || strRow.includes('shift') || strRow.includes('kode'))
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Parses standard Hospital Schedule Matrix format.
   * Row: [ "Nama Perawat", "Jabatan", "1", "2", "3", ... "31" ]
   */
  private static parseMatrixFormat(
    rows: (string | number | undefined | null)[][],
    targetMonth: string,
    nurses: Nurse[],
    machines: Machine[],
    autoAllocateMachines: boolean
  ): ImportParseResult {
    const [yearStr, monthStr] = targetMonth.split('-');
    const year = parseInt(yearStr, 10) || new Date().getFullYear();
    const month = parseInt(monthStr, 10) || (new Date().getMonth() + 1);
    const daysInMonth = new Date(year, month, 0).getDate();

    // Find header row containing day numbers (1..28/31) or column indicators
    let headerRowIdx = -1;
    let dayColMap: { colIdx: number; day: number }[] = [];

    for (let r = 0; r < Math.min(rows.length, 10); r++) {
      const row = rows[r];
      const cols: { colIdx: number; day: number }[] = [];

      for (let c = 0; c < row.length; c++) {
        const val = row[c];
        if (val !== undefined && val !== null) {
          const num = parseInt(String(val).trim(), 10);
          if (!isNaN(num) && num >= 1 && num <= daysInMonth) {
            cols.push({ colIdx: c, day: num });
          }
        }
      }

      // If we found at least 15 days in this header row, this is the day-header row!
      if (cols.length >= 15) {
        headerRowIdx = r;
        dayColMap = cols.sort((a, b) => a.day - b.day);
        break;
      }
    }

    // Fallback: If no explicit 1..31 header row found, assume columns 2 onwards are days 1..N
    if (headerRowIdx === -1) {
      headerRowIdx = 0;
      dayColMap = [];
      for (let d = 1; d <= daysInMonth; d++) {
        dayColMap.push({ colIdx: d + 1, day: d });
      }
    }

    // Intelligently detect which column holds Nurse Names:
    // 1. First look for an explicit header label (e.g., "NAMA", "NAMA PERAWAT", "NURSE", "NAMA STAF")
    let detectedNameColIdx = -1;
    for (let r = 0; r <= Math.max(headerRowIdx, 4); r++) {
      const row = rows[r];
      if (!row) continue;
      for (let c = 0; c < Math.min(row.length, 6); c++) {
        const cell = String(row[c] || '').trim().toLowerCase();
        if (
          cell === 'nama' ||
          cell === 'nama perawat' ||
          cell === 'nama petugas' ||
          cell === 'nama staf' ||
          cell === 'nama staff' ||
          cell === 'nurse' ||
          cell === 'nama lengkap' ||
          cell === 'nama karyawan'
        ) {
          detectedNameColIdx = c;
          break;
        }
      }
      if (detectedNameColIdx !== -1) break;
    }

    // 2. If no explicit header label, probe columns 0 to 4 to find which column
    // matches the most registered nurses in `nurses`
    if (detectedNameColIdx === -1) {
      let maxMatches = 0;
      let bestCol = 1;
      for (let c = 0; c < Math.min(rows[0]?.length || 4, 5); c++) {
        let matchCount = 0;
        for (let r = headerRowIdx + 1; r < rows.length; r++) {
          const cell = String(rows[r]?.[c] || '').trim();
          if (cell && this.matchNurse(cell, nurses)) {
            matchCount++;
          }
        }
        if (matchCount > maxMatches) {
          maxMatches = matchCount;
          bestCol = c;
        }
      }
      detectedNameColIdx = bestCol;
    }

    const assignments: ShiftAssignment[] = [];
    const previewList: ImportPreviewItem[] = [];
    const unmatchedNurses: Set<string> = new Set();
    const matchedNurseIds: Set<number> = new Set();
    const workingNurses = [...nurses];
    const newNursesCreated: Nurse[] = [];
    let nextNurseId = (workingNurses.length > 0 ? Math.max(...workingNurses.map((n) => n.id)) : 0) + 1;

    const shiftCounts = { pagi: 0, siang: 0, libur: 0, cuti: 0, sakit: 0, other: 0 };

    // Process data rows below header
    for (let r = headerRowIdx + 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.length === 0) continue;

      // Skip summary, footer, or signature rows
      const rowPrefixText = row.slice(0, 6).map((c) => String(c || '').trim().toLowerCase()).join(' ');
      if (
        rowPrefixText.includes('total') ||
        rowPrefixText.includes('jumlah') ||
        rowPrefixText.includes('mengetahui') ||
        rowPrefixText.includes('kepala ruangan') ||
        rowPrefixText.includes('tanda tangan') ||
        rowPrefixText.includes('direktur')
      ) {
        continue;
      }

      // Detect if this row has KATIM / KARU role indicated in any leading cell
      const hasLeaderRole = row.slice(0, 5).some((c) => {
        const val = String(c || '').trim().toUpperCase();
        return val === 'KATIM' || val === 'KARU' || val === 'PJ' || val === 'PJ SHIFT';
      });

      // Find nurse name accurately:
      // Priority A: Check if any cell in cols 0..4 matches an existing registered nurse
      let matchedNurse: Nurse | null = null;
      let rawName = '';

      for (let c = 0; c < Math.min(row.length, 5); c++) {
        const cell = String(row[c] || '').trim();
        if (!cell || this.NON_NURSE_NAME_WORDS.has(cell.toLowerCase()) || !isNaN(Number(cell))) {
          continue;
        }
        const candidateMatch = this.matchNurse(cell, workingNurses);
        if (candidateMatch) {
          matchedNurse = candidateMatch;
          rawName = cell;
          break;
        }
      }

      // Priority B: If no existing nurse was matched, check the detected name column
      if (!matchedNurse) {
        const colCell = String(row[detectedNameColIdx] || '').trim();
        if (
          colCell &&
          !this.NON_NURSE_NAME_WORDS.has(colCell.toLowerCase()) &&
          isNaN(Number(colCell)) &&
          colCell.length >= 2
        ) {
          rawName = colCell;
        } else {
          // Scan cols 0..4 for any plausible person name (not in non-nurse wordlist, not numeric)
          for (let c = 0; c < Math.min(row.length, 5); c++) {
            const cell = String(row[c] || '').trim();
            if (
              cell &&
              !this.NON_NURSE_NAME_WORDS.has(cell.toLowerCase()) &&
              isNaN(Number(cell)) &&
              cell.length >= 3
            ) {
              rawName = cell;
              break;
            }
          }
        }

        if (
          !rawName ||
          rawName === '-' ||
          rawName === '--' ||
          rawName === '---' ||
          rawName.replace(/[^a-zA-Z]/g, '').length < 2
        ) {
          continue;
        }

        // Try matching with the found rawName
        matchedNurse = this.matchNurse(rawName, workingNurses);
      }

      // If still not matched, auto-register legitimate new nurse from file
      if (!matchedNurse) {
        matchedNurse = {
          id: nextNurseId++,
          name: rawName,
          nip: '',
          phone: '',
          role: hasLeaderRole ? 'KATIM' : 'PELAKSANA',
          isActive: true,
          defaultOffDay: null,
          skillLevel: 'Senior',
          specialDuty: null,
        };
        workingNurses.push(matchedNurse);
        newNursesCreated.push(matchedNurse);
      } else if (hasLeaderRole && matchedNurse.role !== 'KATIM' && matchedNurse.role !== 'KARU') {
        // Upgrade role if marked as KATIM in import file
        matchedNurse.role = 'KATIM';
      }

      matchedNurseIds.add(matchedNurse.id);

      // Process each day column
      dayColMap.forEach(({ colIdx, day }) => {
        if (day > daysInMonth) return;
        const cellVal = row[colIdx];
        const rawCode = cellVal !== undefined && cellVal !== null ? String(cellVal).trim() : '';
        const shiftType = this.normalizeShiftCode(rawCode);

        // Update counts
        if (shiftType === 'PAGI') shiftCounts.pagi++;
        else if (shiftType === 'SIANG') shiftCounts.siang++;
        else if (shiftType === 'LIBUR') shiftCounts.libur++;
        else if (shiftType === 'CUTI') shiftCounts.cuti++;
        else if (shiftType === 'SAKIT') shiftCounts.sakit++;
        else shiftCounts.other++;

        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const assignmentId = `asg-${dateStr}-${matchedNurse.id}`;

        const assignment: ShiftAssignment = {
          id: assignmentId,
          date: dateStr,
          shiftType,
          nurseId: matchedNurse.id,
          nurseName: matchedNurse.name,
          nursePhone: matchedNurse.phone || '',
          assignedMachineIds: [], // will be filled if autoAllocateMachines is true
          isLeader: matchedNurse.role === 'KATIM' || matchedNurse.role === 'KARU',
          isWhatsAppSent: false,
          notes: rawCode && rawCode !== SHIFT_TYPE_INFO[shiftType]?.code ? `Import: ${rawCode}` : '',
          specialDuty: matchedNurse.specialDuty || null,
        };

        assignments.push(assignment);

        // Add to preview (sample first 60 items for fast rendering)
        if (previewList.length < 60) {
          previewList.push({
            date: dateStr,
            nurseId: matchedNurse.id,
            nurseName: matchedNurse.name,
            nursePhone: matchedNurse.phone,
            shiftType,
            rawShiftCode: rawCode || '-',
            assignedMachineIds: [],
            isLeader: assignment.isLeader,
            notes: assignment.notes,
            isMatched: true,
          });
        }
      });
    }

    if (assignments.length === 0) {
      return {
        isSuccess: false,
        message: 'Tidak ditemukan data perawat atau jadwal yang cocok. Periksa apakah nama perawat di file sesuai dengan daftar staf HD.',
        monthString: targetMonth,
        totalRows: rows.length,
        detectedNursesCount: matchedNurseIds.size,
        unmatchedNurses: Array.from(unmatchedNurses),
        newNursesCreated: [],
        daysCount: dayColMap.length,
        shiftCounts,
        assignments: [],
        previewList: [],
      };
    }

    // If auto allocation is enabled, allocate fair machines across the month
    let finalAssignments = assignments;
    if (autoAllocateMachines) {
      finalAssignments = FairSchedulerEngine.reallocateMonthlyMachinesPreservingShifts(
        targetMonth,
        assignments,
        workingNurses,
        machines,
        { rotateBays: true, consecutiveIsolationProtection: true }
      );
    }

    return {
      isSuccess: true,
      message: `Berhasil mengimpor jadwal untuk ${matchedNurseIds.size} perawat (${assignments.length} entri shift).${
        newNursesCreated.length > 0 ? ` Termasuk ${newNursesCreated.length} perawat baru didaftarkan.` : ''
      }`,
      monthString: targetMonth,
      totalRows: rows.length,
      detectedNursesCount: matchedNurseIds.size,
      unmatchedNurses: Array.from(unmatchedNurses),
      newNursesCreated,
      daysCount: dayColMap.length,
      shiftCounts,
      assignments: finalAssignments,
      previewList: previewList.map((p) => {
        const full = finalAssignments.find((a) => a.date === p.date && a.nurseId === p.nurseId);
        return {
          ...p,
          assignedMachineIds: full?.assignedMachineIds || [],
        };
      }),
    };
  }

  /**
   * Parses flat List format:
   * Columns: Tanggal, Nama Perawat, Sif, [Alokasi Mesin], [Catatan]
   */
  private static parseListFormat(
    rows: (string | number | undefined | null)[][],
    targetMonth: string,
    nurses: Nurse[],
    machines: Machine[],
    autoAllocateMachines: boolean
  ): ImportParseResult {
    let headerIdx = 0;
    let colDate = -1;
    let colName = -1;
    let colShift = -1;
    let colMachines = -1;
    let colNotes = -1;

    for (let r = 0; r < Math.min(rows.length, 5); r++) {
      const row = rows[r];
      for (let c = 0; c < row.length; c++) {
        const text = String(row[c] || '').toLowerCase().trim();
        if (text.includes('tanggal') || text.includes('date')) colDate = c;
        else if (text.includes('nama') || text.includes('perawat') || text.includes('nurse')) colName = c;
        else if (text.includes('sif') || text.includes('shift') || text.includes('kode')) colShift = c;
        else if (text.includes('mesin') || text.includes('machine')) colMachines = c;
        else if (text.includes('catatan') || text.includes('notes')) colNotes = c;
      }
      if (colDate !== -1 && colName !== -1 && colShift !== -1) {
        headerIdx = r;
        break;
      }
    }

    // Default fallback columns
    if (colDate === -1) colDate = 0;
    if (colName === -1) colName = 1;
    if (colShift === -1) colShift = 2;

    const assignments: ShiftAssignment[] = [];
    const previewList: ImportPreviewItem[] = [];
    const unmatchedNurses: Set<string> = new Set();
    const matchedNurseIds: Set<number> = new Set();
    const workingNurses = [...nurses];
    const newNursesCreated: Nurse[] = [];
    let nextNurseId = (workingNurses.length > 0 ? Math.max(...workingNurses.map((n) => n.id)) : 0) + 1;
    const shiftCounts = { pagi: 0, siang: 0, libur: 0, cuti: 0, sakit: 0, other: 0 };

    for (let r = headerIdx + 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.length <= Math.max(colDate, colName, colShift)) continue;

      const rawDate = String(row[colDate] || '').trim();
      const rawName = String(row[colName] || '').trim();
      const rawShift = String(row[colShift] || '').trim();
      const rawMachines = colMachines !== -1 ? String(row[colMachines] || '').trim() : '';
      const rawNotes = colNotes !== -1 ? String(row[colNotes] || '').trim() : '';

      if (!rawDate || !rawName) continue;

      // Normalize date to YYYY-MM-DD
      const normalizedDate = this.normalizeDateString(rawDate, targetMonth);
      if (!normalizedDate) continue;

      let matchedNurse = this.matchNurse(rawName, workingNurses);
      if (!matchedNurse) {
        matchedNurse = {
          id: nextNurseId++,
          name: rawName,
          nip: '',
          phone: '',
          role: 'PELAKSANA',
          isActive: true,
          defaultOffDay: null,
          skillLevel: 'Senior',
          specialDuty: null,
        };
        workingNurses.push(matchedNurse);
        newNursesCreated.push(matchedNurse);
      }

      matchedNurseIds.add(matchedNurse.id);
      const shiftType = this.normalizeShiftCode(rawShift);

      if (shiftType === 'PAGI') shiftCounts.pagi++;
      else if (shiftType === 'SIANG') shiftCounts.siang++;
      else if (shiftType === 'LIBUR') shiftCounts.libur++;
      else if (shiftType === 'CUTI') shiftCounts.cuti++;
      else if (shiftType === 'SAKIT') shiftCounts.sakit++;
      else shiftCounts.other++;

      // Parse machine IDs if explicitly provided (e.g. "A01, A02", "C01", "B05", "M-01")
      const parsedMachineIds: number[] = [];
      if (rawMachines) {
        const parts = rawMachines.split(/[;,|\t ]+/).map((s) => s.trim()).filter(Boolean);
        parts.forEach((p) => {
          const cleanP = p.toUpperCase().replace(/[^A-Z0-9]/g, '');
          const matchedByCode = machines.find(
            (m) =>
              m.code.toUpperCase().replace(/[^A-Z0-9]/g, '') === cleanP ||
              m.name.toUpperCase().replace(/[^A-Z0-9]/g, '') === cleanP
          );
          if (matchedByCode) {
            if (!parsedMachineIds.includes(matchedByCode.id)) {
              parsedMachineIds.push(matchedByCode.id);
            }
            return;
          }

          const mNum = parseInt(p.replace(/[^0-9]/g, ''), 10);
          if (!isNaN(mNum)) {
            const matchedById = machines.find((m) => m.id === mNum);
            if (matchedById && !parsedMachineIds.includes(matchedById.id)) {
              parsedMachineIds.push(matchedById.id);
            }
          }
        });
      }

      const assignmentId = `asg-${normalizedDate}-${matchedNurse.id}`;
      const assignment: ShiftAssignment = {
        id: assignmentId,
        date: normalizedDate,
        shiftType,
        nurseId: matchedNurse.id,
        nurseName: matchedNurse.name,
        nursePhone: matchedNurse.phone || '',
        assignedMachineIds: parsedMachineIds,
        isLeader: matchedNurse.role === 'KATIM' || matchedNurse.role === 'KARU',
        isWhatsAppSent: false,
        notes: rawNotes,
        specialDuty: matchedNurse.specialDuty || null,
      };

      assignments.push(assignment);

      if (previewList.length < 60) {
        previewList.push({
          date: normalizedDate,
          nurseId: matchedNurse.id,
          nurseName: matchedNurse.name,
          nursePhone: matchedNurse.phone,
          shiftType,
          rawShiftCode: rawShift,
          assignedMachineIds: parsedMachineIds,
          isLeader: assignment.isLeader,
          notes: rawNotes,
          isMatched: true,
        });
      }
    }

    let finalAssignments = assignments;
    if (autoAllocateMachines && assignments.some((a) => a.assignedMachineIds.length === 0)) {
      finalAssignments = FairSchedulerEngine.reallocateMonthlyMachinesPreservingShifts(
        targetMonth,
        assignments,
        workingNurses,
        machines,
        { rotateBays: true, consecutiveIsolationProtection: true }
      );
    }

    return {
      isSuccess: assignments.length > 0,
      message:
        assignments.length > 0
          ? `Berhasil mengimpor ${assignments.length} baris jadwal untuk ${matchedNurseIds.size} perawat.${
              newNursesCreated.length > 0 ? ` Termasuk ${newNursesCreated.length} perawat baru didaftarkan.` : ''
            }`
          : 'Gagal mengimpor daftar jadwal.',
      monthString: targetMonth,
      totalRows: rows.length,
      detectedNursesCount: matchedNurseIds.size,
      unmatchedNurses: Array.from(unmatchedNurses),
      newNursesCreated,
      daysCount: new Set(assignments.map((a) => a.date)).size,
      shiftCounts,
      assignments: finalAssignments,
      previewList,
    };
  }

  /**
   * Normalizes various date inputs into YYYY-MM-DD.
   */
  private static normalizeDateString(rawDate: string, targetMonth: string): string | null {
    if (!rawDate) return null;
    const clean = rawDate.trim();

    // Already YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
      return clean;
    }

    // DD/MM/YYYY or DD-MM-YYYY
    const dmy = clean.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (dmy) {
      const d = dmy[1].padStart(2, '0');
      const m = dmy[2].padStart(2, '0');
      const y = dmy[3];
      return `${y}-${m}-${d}`;
    }

    // Just Day number "1" .. "31"
    const justDay = parseInt(clean, 10);
    if (!isNaN(justDay) && justDay >= 1 && justDay <= 31) {
      const [yearStr, monthStr] = targetMonth.split('-');
      return `${yearStr}-${monthStr}-${String(justDay).padStart(2, '0')}`;
    }

    // Standard JavaScript parseable
    const parsed = new Date(clean);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().split('T')[0];
    }

    return null;
  }

  /**
   * Fetches CSV from a public Google Sheets URL or Spreadsheet ID.
   */
  static async fetchFromGoogleSheetsUrl(
    sheetUrlOrId: string,
    targetMonth: string,
    nurses: Nurse[],
    machines: Machine[],
    autoAllocateMachines: boolean = true
  ): Promise<ImportParseResult> {
    if (!sheetUrlOrId || !sheetUrlOrId.trim()) {
      return {
        isSuccess: false,
        message: 'Tautan atau ID Google Sheets belum dimasukkan.',
        monthString: targetMonth,
        totalRows: 0,
        detectedNursesCount: 0,
        unmatchedNurses: [],
        daysCount: 0,
        shiftCounts: { pagi: 0, siang: 0, libur: 0, cuti: 0, sakit: 0, other: 0 },
        assignments: [],
        previewList: [],
      };
    }

    const cleanInput = sheetUrlOrId.trim();

    // Extract Spreadsheet ID if a full Google Sheets URL was pasted
    let sheetId: string | null = null;
    const idMatch = cleanInput.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (idMatch && idMatch[1]) {
      sheetId = idMatch[1];
    } else if (!cleanInput.startsWith('http') && /^[a-zA-Z0-9-_]{20,}$/.test(cleanInput)) {
      sheetId = cleanInput;
    }

    try {
      // If we have a Spreadsheet ID and targetMonth, try month-specific tabs first
      if (sheetId && targetMonth) {
        const [yearStr, monthStr] = targetMonth.split('-');
        const year = parseInt(yearStr, 10) || new Date().getFullYear();
        const month = parseInt(monthStr, 10) || (new Date().getMonth() + 1);
        const indonesianMonths = [
          'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
          'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
        ];
        const indonesianAbbrs = [
          'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
          'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des'
        ];
        const englishMonths = [
          'January', 'February', 'March', 'April', 'May', 'June',
          'July', 'August', 'September', 'October', 'November', 'December'
        ];
        const englishAbbrs = [
          'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
          'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
        ];

        const mNameIndo = indonesianMonths[month - 1];
        const mAbbrIndo = indonesianAbbrs[month - 1];
        const mNameEng = englishMonths[month - 1];
        const mAbbrEng = englishAbbrs[month - 1];

        const candidateTabNames = [
          `Matriks HD - ${mNameIndo} ${year}`,
          `Jadwal HD ${mAbbrIndo} ${year}`,
          `Jadwal HD ${mNameIndo} ${year}`,
          `${mNameIndo} ${year}`,
          `Jadwal HD ${mNameIndo}`,
          `Jadwal ${mNameIndo}`,
          `Jadwal ${mAbbrIndo} ${year}`,
          `${mAbbrIndo} ${year}`,
          mNameIndo,
          mAbbrIndo,
          `Matriks HD - ${mNameEng} ${year}`,
          `${mNameEng} ${year}`,
          `Jadwal HD ${mAbbrEng} ${year}`,
          `${mAbbrEng} ${year}`,
          `${year}-${String(month).padStart(2, '0')}`,
          `${String(month).padStart(2, '0')}-${year}`,
        ];

        for (const tabName of candidateTabNames) {
          try {
            const tabUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}`;
            const resp = await fetch(tabUrl);
            if (resp.ok) {
              const csvText = await resp.text();
              // Check if returned real CSV (not HTML login/error)
              if (csvText && !csvText.includes('<html') && csvText.length > 30) {
                const parsedResult = await this.parseCsvOrTsvText(csvText, targetMonth, nurses, machines, autoAllocateMachines);
                if (parsedResult.isSuccess && (parsedResult.assignments.length > 0 || parsedResult.detectedNursesCount > 0)) {
                  parsedResult.message = `Berhasil menarik jadwal bulan ${mNameIndo} ${year} dari tab "${tabName}" Google Sheets!`;
                  return parsedResult;
                }
              }
            }
          } catch {
            // Continue to next tab candidate
          }
        }
      }

      // Fallback: fetch default first sheet
      const defaultUrl = sheetId
        ? `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`
        : cleanInput;

      const response = await fetch(defaultUrl);
      if (!response.ok) {
        return {
          isSuccess: false,
          message: `Gagal mengakses Google Sheets (Status ${response.status}). Pastikan Spreadsheet di-share ke 'Anyone with the link can view' (Siapa saja yang memiliki link).`,
          monthString: targetMonth,
          totalRows: 0,
          detectedNursesCount: 0,
          unmatchedNurses: [],
          daysCount: 0,
          shiftCounts: { pagi: 0, siang: 0, libur: 0, cuti: 0, sakit: 0, other: 0 },
          assignments: [],
          previewList: [],
        };
      }

      const csvText = await response.text();
      return await this.parseCsvOrTsvText(csvText, targetMonth, nurses, machines, autoAllocateMachines);
    } catch (e: unknown) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      return {
        isSuccess: false,
        message: `Koneksi Google Sheets gagal: ${errorMsg}. Pastikan Sheet di-setting publik dan koneksi internet stabil.`,
        monthString: targetMonth,
        totalRows: 0,
        detectedNursesCount: 0,
        unmatchedNurses: [],
        daysCount: 0,
        shiftCounts: { pagi: 0, siang: 0, libur: 0, cuti: 0, sakit: 0, other: 0 },
        assignments: [],
        previewList: [],
      };
    }
  }

  /**
   * Parses Raw CSV / TSV text (e.g. pasted directly from clipboard).
   */
  static async parseCsvOrTsvText(
    text: string,
    targetMonth: string,
    nurses: Nurse[],
    machines: Machine[],
    autoAllocateMachines: boolean = true
  ): Promise<ImportParseResult> {
    if (!text || !text.trim()) {
      return {
        isSuccess: false,
        message: 'Teks CSV / TSV kosong.',
        monthString: targetMonth,
        totalRows: 0,
        detectedNursesCount: 0,
        unmatchedNurses: [],
        daysCount: 0,
        shiftCounts: { pagi: 0, siang: 0, libur: 0, cuti: 0, sakit: 0, other: 0 },
        assignments: [],
        previewList: [],
      };
    }

    const XLSX = await getXLSX();

    // Determine delimiter (Tab or Comma or Semicolon)
    const firstLine = text.split('\n')[0] || '';
    let delimiter = ',';
    if (firstLine.includes('\t')) delimiter = '\t';
    else if (firstLine.includes(';') && !firstLine.includes(',')) delimiter = ';';

    const workbook = XLSX.read(text, { type: 'string', raw: true });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rawRows: (string | number | undefined | null)[][] = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: '',
    });

    return this.parseRawMatrixOrList(rawRows, targetMonth, nurses, machines, autoAllocateMachines);
  }

  /**
   * Generates a downloadable Excel (.xlsx) Template for Monthly Schedule.
   */
  static async downloadExcelTemplate(monthStr: string, nurses: Nurse[]): Promise<void> {
    const XLSX = await getXLSX();
    const activeNurses = nurses.filter((n) => n.isActive);
    const parts = monthStr.split('-');
    const year = parseInt(parts[0], 10) || new Date().getFullYear();
    const month = parseInt(parts[1], 10) || (new Date().getMonth() + 1);
    const daysInMonth = new Date(year, month, 0).getDate();

    // 1. Headers
    const headers = ['No', 'Nama Perawat', 'NIP', 'Peran'];
    for (let d = 1; d <= daysInMonth; d++) {
      headers.push(String(d));
    }

    // 2. Rows with prefilled nurse list
    const dataRows: (string | number)[][] = [headers];

    activeNurses.forEach((nurse, idx) => {
      const row: (string | number)[] = [
        idx + 1,
        nurse.name,
        nurse.nip || '-',
        nurse.role === 'KARU' ? 'Karu' : nurse.role === 'KATIM' ? 'Katim' : 'Pelaksana',
      ];

      // Sample mock rotation (P, S, L, P, S, L)
      for (let d = 1; d <= daysInMonth; d++) {
        const sampleCode = d % 3 === 1 ? 'P' : d % 3 === 2 ? 'S' : 'L';
        row.push(sampleCode);
      }
      dataRows.push(row);
    });

    // 3. Create Workbook & Worksheet
    const worksheet = XLSX.utils.aoa_to_sheet(dataRows);
    
    // Set column widths
    const colWidths = [
      { wch: 5 },  // No
      { wch: 25 }, // Nama
      { wch: 18 }, // NIP
      { wch: 14 }, // Peran
    ];
    for (let d = 1; d <= daysInMonth; d++) {
      colWidths.push({ wch: 4 });
    }
    worksheet['!cols'] = colWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, `Jadwal HD ${monthStr}`);

    // 4. Download file
    XLSX.writeFile(workbook, `Template_Jadwal_HD_${monthStr}.xlsx`);
  }
}
