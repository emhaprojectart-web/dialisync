import { Machine, ShiftAssignment, SHIFT_TYPE_INFO, parseSpecialDuties, HeadNurseReportFormat } from '../types';
import { CLINICAL_MACHINE_ORDER } from '../utils/scheduler';

export class WhatsAppDispatcher {
  static formatIndonesianDate(isoDate: string): string {
    try {
      const date = new Date(isoDate + 'T00:00:00');
      const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
      const months = [
        'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
        'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
      ];
      const dayName = days[date.getDay()];
      const monthName = months[date.getMonth()];
      return `${dayName}, ${date.getDate()} ${monthName} ${date.getFullYear()}`;
    } catch {
      return isoDate;
    }
  }

  /**
   * Sanitizes Indonesian phone numbers into international WhatsApp format (e.g., 0812 -> 62812).
   * Returns empty string if phone number is missing, empty, or invalid.
   */
  static cleanPhoneNumberForWhatsApp(rawPhone?: string | null): string {
    if (!rawPhone) return '';
    let cleaned = String(rawPhone).trim().replace(/[^0-9+]/g, '');
    if (!cleaned) return '';

    if (cleaned.startsWith('+62')) {
      cleaned = cleaned.substring(1);
    } else if (cleaned.startsWith('+')) {
      cleaned = cleaned.substring(1);
    } else if (cleaned.startsWith('0')) {
      cleaned = '62' + cleaned.substring(1);
    } else if (!cleaned.startsWith('62')) {
      cleaned = '62' + cleaned;
    }

    // Must have at least 9 digits to be a valid phone number (e.g., 6281234567)
    if (cleaned.length < 9) {
      return '';
    }
    return cleaned;
  }

  /**
   * Checks if a phone number string is valid for WhatsApp dispatch.
   */
  static isValidPhoneNumber(rawPhone?: string | null): boolean {
    const cleaned = this.cleanPhoneNumberForWhatsApp(rawPhone);
    return cleaned.length >= 9;
  }

  /**
   * Identifies default mock/sample numbers (e.g., 081234567801 .. 081234567817) so users can be warned.
   */
  static isSamplePhoneNumber(rawPhone?: string | null): boolean {
    if (!rawPhone) return false;
    const clean = rawPhone.replace(/[^0-9]/g, '');
    return (
      clean.startsWith('0812345678') ||
      clean.startsWith('62812345678') ||
      clean === '081234567890' ||
      clean === '081122334455'
    );
  }

  /**
   * Creates personal notification message for a single nurse.
   */
  static generateNurseMessage(
    assignment: ShiftAssignment,
    machines: Machine[],
    hospitalName: string = 'RS Happy Land Medical Centre',
    roomName: string = 'Ruang Dialisis Gedung Timur Lt.3',
    fallbackSpecialDuty?: string | null
  ): string {
    const formattedDate = this.formatIndonesianDate(assignment.date);
    const shiftIcon = assignment.shiftType === 'PAGI' ? '🌅' : '🌇';
    let shiftBadge = '';
    switch (assignment.shiftType) {
      case 'PAGI':
        shiftBadge = `${shiftIcon} SIF PAGI (07.00 - 14.00 WIB)`;
        break;
      case 'SIANG':
        shiftBadge = `${shiftIcon} SIF SIANG (12.00 - 19.00 WIB)`;
        break;
      case 'LIBUR':
        shiftBadge = '🌴 HARI LIBUR / OFF';
        break;
      case 'CUTI':
        shiftBadge = '🏖️ CUTI TAHUNAN';
        break;
      case 'SAKIT':
        shiftBadge = '🩺 IZIN / SAKIT';
        break;
    }

    const assignedMachines = this.getAssignedMachinesForAssignment(assignment, machines);

    const sb: string[] = [];
    sb.push(`🏥 ${hospitalName}`);
    sb.push(`📍 ${roomName}`);
    sb.push('━━━━━━━━━━━━━━━━━━━━━━');
    sb.push('📋 JADWAL DINAS & ALOKASI MESIN HD');
    sb.push('');
    sb.push(`👤 Nama: ${assignment.nurseName}`);
    sb.push(`📅 Tanggal: ${formattedDate}`);
    sb.push(`⏰ Sif: ${shiftBadge}`);

    const isPjShiftDuty = assignment.specialDuty && (assignment.specialDuty.toUpperCase().includes('PJ') || assignment.specialDuty.toUpperCase().includes('KATIM'));
    const roleText = isPjShiftDuty ? 'PJ Sif / Koordinator Sif' : 'Perawat Pelaksana HD';
    sb.push(`⭐ Peran: ${roleText}`);

    const resolvedDuty =
      assignment.specialDuty && assignment.specialDuty.trim() !== ''
        ? assignment.specialDuty.trim()
        : null;

    const dutyText = resolvedDuty ? resolvedDuty : '-';
    sb.push(`🏷️ Tugas Khusus PIC: ${dutyText}`);
    sb.push(' ');

    const isWorkShift = SHIFT_TYPE_INFO[assignment.shiftType]?.isWorkShift;
    if (isWorkShift) {
      sb.push(`📟 ALOKASI MESIN DIKELOLA (${assignedMachines.length} Mesin):`);
      if (assignedMachines.length === 0) {
        sb.push('*(Belum ada mesin yang ditugaskan)*');
      } else {
        assignedMachines.forEach((m) => {
          sb.push(`▶️ [${m.code}] ${m.name}`);
        });
      }

      sb.push('');
      sb.push('📝 SOP & Petunjuk Pelayanan:');
      sb.push('* Lakukan briefing 15 menit sebelum sif dimulai');
      sb.push('* Priming & pemeriksaan dialyzer sesuai standar keselamatan');
      sb.push('* Monitoring TTV & parameter mesin tiap 30-60 menit');
      sb.push('* Operan pasien & desinfeksi mesin bersama sif berikutnya');
    } else {
      sb.push('');
      sb.push('Selamat beristirahat dan mengisi kembali energi. Terima kasih atas dedikasi Anda! 🙏✨');
    }

    sb.push('');
    sb.push('━━━━━━━━━━━━━━━━━━━━━━');
    sb.push('Sistem Otomasi Jadwal & Alokasi HD HemoShift');

    return sb.join('\n');
  }

  /**
   * Creates a group broadcast summary for the whole shift or day.
   */
  static generateGroupBroadcastMessage(
    dateStr: string,
    shiftType: 'PAGI' | 'SIANG' | null,
    assignments: ShiftAssignment[],
    machines: Machine[],
    hospitalName: string = 'RS Happy Land Medical Centre'
  ): string {
    const formattedDate = this.formatIndonesianDate(dateStr);
    const sb: string[] = [];
    sb.push('📢 *REKAP JADWAL & ALOKASI MESIN HD*');
    sb.push(`🏥 *${hospitalName}*`);
    sb.push(`📅 ${formattedDate}`);
    sb.push('━━━━━━━━━━━━━━━━━━━━━━');

    const shiftsToInclude: ('PAGI' | 'SIANG')[] = shiftType ? [shiftType] : ['PAGI', 'SIANG'];

    for (const st of shiftsToInclude) {
      const shiftIcon = st === 'PAGI' ? '🌅' : '🌇';
      const timeRange = st === 'PAGI' ? '07.00 - 14.00 WIB' : '12.00 - 19.00 WIB';
      sb.push(`\n${shiftIcon} *SIF ${st} (${timeRange})*`);
      const onDuty = this.sortAssignmentsByMachineOrder(
        assignments.filter((a) => a.shiftType === st),
        machines
      );

      if (onDuty.length === 0) {
        sb.push('_Tidak ada jadwal dinas terdata_');
      } else {
        onDuty.forEach((assign, index) => {
          const isLeaderDuty = assign.specialDuty && (assign.specialDuty.toUpperCase().includes('PJ') || assign.specialDuty.toUpperCase().includes('KATIM'));
          const leaderTag = isLeaderDuty ? ' 👑 (PJ Sif)' : '';
          const dutyTag = assign.specialDuty ? ` • [${assign.specialDuty}]` : '';
          const sortedMachines = this.getAssignedMachinesForAssignment(assign, machines);
          const mCodes = sortedMachines.map((m) => m.code).join(', ');
          const mSummary =
            sortedMachines.length > 0
              ? `${mCodes} (${sortedMachines.length} mesin)`
              : 'Belum ada mesin';

          sb.push(`${index + 1}. *${assign.nurseName}*${leaderTag}${dutyTag}`);
          sb.push(`   ↳ Alokasi: ${mSummary}`);
        });
      }
    }

    const dutyMap = new Map<string, { nurseName: string; shiftType: string }[]>();
    assignments.forEach((a) => {
      if (a.specialDuty && (a.shiftType === 'PAGI' || a.shiftType === 'SIANG')) {
        const duties = parseSpecialDuties(a.specialDuty);
        duties.forEach((d) => {
          if (!dutyMap.has(d)) dutyMap.set(d, []);
          const existingList = dutyMap.get(d)!;
          if (!existingList.some((h) => h.nurseName.trim().toLowerCase() === a.nurseName.trim().toLowerCase())) {
            existingList.push({ nurseName: a.nurseName, shiftType: a.shiftType });
          }
        });
      }
    });
    if (dutyMap.size > 0) {
      sb.push('\n🏷️ *PENANGGUNG JAWAB KHUSUS HARI INI:*');
      dutyMap.forEach((holders, duty) => {
        const holderStr = holders.map((h) => `${h.nurseName} (Sif ${h.shiftType})`).join(', ');
        sb.push(`• *${duty}:* ${holderStr}`);
      });
    }

    const offList = assignments.filter((a) => a.shiftType === 'LIBUR');
    if (offList.length > 0) {
      sb.push('\n🌴 *LIBUR / OFF:*');
      sb.push(offList.map((a) => a.nurseName).join(', '));
      sb.push('');
    }

    sb.push('━━━━━━━━━━━━━━━━━━━━━━');
    sb.push('_Mohon hadir 15 menit sebelum operan sif dimulai. Semangat melayani!_ 💉🩺');

    return sb.join('\n');
  }

  /**
   * Calculates priority rank based on the hospital dialysis room's physical layout order:
   * 1. A01 - A12
   * 2. C01 - C04
   * 3. B01 - B09
   * 4. C05 - C09
   */
  static getRoomMachineRank(target: Machine | string | number): number {
    let str = '';
    if (typeof target === 'object' && target !== null) {
      str = target.code || target.name || String(target.id);
    } else {
      str = String(target ?? '');
    }

    str = str.trim().toUpperCase();

    // Match letter (A, B, or C) and digits (e.g. A01, A1, B-05, C04)
    const match =
      str.match(/\b([ABC])\s*[-_]?\s*0*(\d+)\b/) ||
      str.match(/([ABC])\s*[-_]?\s*0*(\d+)/);

    if (match) {
      const letter = match[1];
      const num = parseInt(match[2], 10);

      if (letter === 'A') {
        if (num >= 1 && num <= 12) {
          return num; // A01..A12 -> Ranks 1 .. 12
        }
        return 100 + num; // Any other A
      } else if (letter === 'C') {
        if (num >= 1 && num <= 4) {
          return 12 + num; // C01..C04 -> Ranks 13 .. 16
        } else if (num >= 5 && num <= 9) {
          return 25 + (num - 4); // C05..C09 -> Ranks 26 .. 30 (after B01..B09 which ends at 25)
        }
        return 300 + num; // Any other C
      } else if (letter === 'B') {
        if (num >= 1 && num <= 9) {
          return 16 + num; // B01..B09 -> Ranks 17 .. 25 (after C01..C04 which ends at 16)
        }
        return 200 + num; // Any other B
      }
    }

    // Fallback for M-01 .. M-25 or other numeric patterns
    const numOnly = parseInt(str.replace(/\D/g, ''), 10);
    if (!isNaN(numOnly)) {
      return 1000 + numOnly;
    }

    return 9999;
  }

  /**
   * Helper to retrieve sorted assigned machines for an assignment,
   * safely resolving machine IDs (numeric or string) or machine codes.
   */
  static getAssignedMachinesForAssignment(
    assign: ShiftAssignment,
    machines: Machine[]
  ): Machine[] {
    const ids = assign.assignedMachineIds || [];
    const list: Machine[] = [];
    ids.forEach((mId) => {
      const found = machines.find(
        (m) =>
          m.id === mId ||
          String(m.id) === String(mId) ||
          (m.code && m.code.toLowerCase() === String(mId).toLowerCase()) ||
          (m.code &&
            m.code.replace(/[^A-Za-z0-9]/g, '').toLowerCase() ===
              String(mId).replace(/[^A-Za-z0-9]/g, '').toLowerCase())
      );
      if (found && !list.some((existing) => existing.id === found.id)) {
        list.push(found);
      }
    });
    return this.getSortedMachines(list);
  }

  /**
   * Helper to sort machines in the hospital room's physical order:
   * 1. A01 - A12
   * 2. C01 - C04
   * 3. B01 - B09
   * 4. C05 - C09
   */
  static getSortedMachines(machines: Machine[]): Machine[] {
    return [...machines].sort((a, b) => {
      const rankA = this.getRoomMachineRank(a);
      const rankB = this.getRoomMachineRank(b);
      if (rankA !== rankB) return rankA - rankB;

      if (a.code && b.code) {
        const cmp = a.code.localeCompare(b.code, undefined, {
          numeric: true,
          sensitivity: 'base',
        });
        if (cmp !== 0) return cmp;
      }
      return a.id - b.id;
    });
  }

  /**
   * Sorts shift assignments based on the physical room layout sequence of their allocated machines:
   * Nurses allocated lower priority machines (A01-A12 -> C01-C04 -> B01-B09 -> C05-C09) appear first.
   * Nurses without machine allocations are placed at the end.
   */
  static sortAssignmentsByMachineOrder(
    assignments: ShiftAssignment[],
    machines: Machine[]
  ): ShiftAssignment[] {
    const sortedAllMachines = this.getSortedMachines(machines);
    const machineRankMap = new Map<string, number>();
    sortedAllMachines.forEach((m, idx) => {
      machineRankMap.set(String(m.id), idx);
      if (m.code) {
        machineRankMap.set(m.code.toLowerCase(), idx);
        machineRankMap.set(m.code.replace(/[^A-Za-z0-9]/g, '').toLowerCase(), idx);
      }
    });

    const getMachineRanks = (assign: ShiftAssignment): number[] => {
      const assignedMachines = this.getAssignedMachinesForAssignment(assign, machines);
      if (assignedMachines.length === 0) return [Number.MAX_SAFE_INTEGER];

      const ranks = assignedMachines.map((m) => this.getRoomMachineRank(m));
      ranks.sort((a, b) => a - b);
      return ranks.length > 0 ? ranks : [Number.MAX_SAFE_INTEGER];
    };

    return [...assignments].sort((a, b) => {
      const ranksA = getMachineRanks(a);
      const ranksB = getMachineRanks(b);
      const len = Math.max(ranksA.length, ranksB.length);
      for (let i = 0; i < len; i++) {
        const rA = ranksA[i] !== undefined ? ranksA[i] : Number.MAX_SAFE_INTEGER;
        const rB = ranksB[i] !== undefined ? ranksB[i] : Number.MAX_SAFE_INTEGER;
        if (rA !== rB) return rA - rB;
      }
      return a.nurseName.localeCompare(b.nurseName);
    });
  }

  /**
   * Helper to format clean room/bay names.
   */
  static cleanBayName(bay: string): string {
    if (!bay) return 'Reguler';
    return bay
      .replace(' (Reguler)', '')
      .replace('Ruang Khusus ', '')
      .replace('Ruang Isolasi Tekanan Negatif', 'Isolasi')
      .replace('Ruang ', '')
      .trim();
  }

  /**
   * Helper to format machine codes summary cleanly matching hospital standards:
   * Examples:
   * - A01 s/d A03 (3 mesin)
   * - C01 s/d C04 (4 mesin)
   * - B01 s/d B04 (4 mesin)
   * - B05 s/d B08 (4 mesin)
   */
  static formatMachineSummary(machineCodes: string[], allSortedMachines?: Machine[]): string {
    if (!machineCodes || machineCodes.length === 0) return 'Belum diplot (0 mesin)';

    // Deduplicate and normalize
    const uniqueCodes = Array.from(new Set(machineCodes.map((c) => c.trim().toUpperCase())));

    // Sort by clinical order
    const sorted = uniqueCodes.sort((a: string, b: string) => {
      const idxA = CLINICAL_MACHINE_ORDER.findIndex((code: string) => code === a);
      const idxB = CLINICAL_MACHINE_ORDER.findIndex((code: string) => code === b);
      return (idxA !== -1 ? idxA : 999) - (idxB !== -1 ? idxB : 999);
    });

    const totalCount = sorted.length;

    const getPrefix = (c: string) => (c.startsWith('ISO') ? 'ISO' : c.replace(/\d+$/, ''));

    // Group into contiguous blocks based on same prefix and consecutive clinical order
    const blocks: string[][] = [];
    let currentBlock: string[] = [];

    for (let i = 0; i < sorted.length; i++) {
      const code = sorted[i];
      const idx = CLINICAL_MACHINE_ORDER.findIndex((c: string) => c === code);

      if (currentBlock.length === 0) {
        currentBlock.push(code);
      } else {
        const prevCode = currentBlock[currentBlock.length - 1];
        const prevIdx = CLINICAL_MACHINE_ORDER.findIndex((c: string) => c === prevCode);
        const samePrefix = getPrefix(code) === getPrefix(prevCode);

        if (samePrefix && idx === prevIdx + 1 && prevIdx !== -1 && idx !== -1) {
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

    const formattedSegments = blocks.map((b) => {
      if (b.length >= 3) {
        return `${b[0]} s/d ${b[b.length - 1]}`;
      }
      return b.join(', ');
    });

    return `${formattedSegments.join(', ')} (${totalCount} mesin)`;
  }

  /**
   * Creates daily machine allocation report specifically for Head Nurse (Kepala Ruangan).
   * Default format is 'RINGKAS' (Ringkasan Jadwal & Alokasi Mesin HD).
   */
  static generateHeadNurseDailyAllocationMessage(
    dateStr: string,
    assignments: ShiftAssignment[],
    machines: Machine[],
    hospitalName: string = 'RS Happy Land Medical Centre',
    roomName: string = 'Ruang Dialisis Gedung Timur Lt.3',
    headNurseName: string = 'Kepala Ruang HD',
    formatMode: HeadNurseReportFormat = 'RINGKAS',
    doctorDuty?: { pagiDoctorName?: string; siangDoctorName?: string; notes?: string }
  ): string {
    if (formatMode === 'NAMA_PERAWAT') {
      return this.generateHeadNurseNurseOrderReport(
        dateStr,
        assignments,
        machines,
        hospitalName,
        roomName,
        headNurseName,
        doctorDuty
      );
    }
    return this.generateHeadNurseCompactReport(
      dateStr,
      assignments,
      machines,
      hospitalName,
      roomName,
      headNurseName,
      false,
      doctorDuty
    );
  }

  /**
   * Alias untuk kompatibilitas ke format laporan Karu
   */
  static generateHeadNurseMachineOrderReport(
    dateStr: string,
    assignments: ShiftAssignment[],
    machines: Machine[],
    hospitalName: string = 'RS Happy Land Medical Centre',
    roomName: string = 'Ruang Dialisis Gedung Timur Lt.3',
    headNurseName: string = 'Kepala Ruang HD',
    doctorDuty?: { pagiDoctorName?: string; siangDoctorName?: string; notes?: string }
  ): string {
    return this.generateHeadNurseCompactReport(
      dateStr,
      assignments,
      machines,
      hospitalName,
      roomName,
      headNurseName,
      false,
      doctorDuty
    );
  }

  /**
   * Format Ringkasan Jadwal & Alokasi Mesin HD untuk Kepala Ruangan (Karu).
   * Format pelaporan terpadu sesuai standar RS Happy Land Medical Centre.
   */
  static generateHeadNurseCompactReport(
    dateStr: string,
    assignments: ShiftAssignment[],
    machines: Machine[],
    hospitalName: string = 'RS Happy Land Medical Centre',
    roomName: string = 'Ruang Dialisis Gedung Timur Lt.3',
    headNurseName: string = 'TWIS FERTILIANTI P W',
    sortByName: boolean = false,
    doctorDuty?: { pagiDoctorName?: string; siangDoctorName?: string; notes?: string }
  ): string {
    const formattedDate = this.formatIndonesianDate(dateStr);
    const sortedAllMachines = this.getSortedMachines(machines);

    let cleanKaru = (headNurseName || 'TWIS FERTILIANTI P W').trim();
    if (cleanKaru === 'Kepala Ruang HD' || cleanKaru === 'Karu') {
      cleanKaru = 'TWIS FERTILIANTI P W';
    }

    // 1. SIF PAGI
    let pagiAssignments = assignments.filter((a) => a.shiftType === 'PAGI');
    if (sortByName) {
      pagiAssignments = [...pagiAssignments].sort((a, b) =>
        a.nurseName.localeCompare(b.nurseName, undefined, { sensitivity: 'base' })
      );
    } else {
      pagiAssignments = this.sortAssignmentsByMachineOrder(pagiAssignments, machines);
    }

    const pagiDoc = doctorDuty?.pagiDoctorName?.trim() || 'dr. Reza Rizki Ramadhan';
    const pagiLines: string[] = [];
    if (pagiAssignments.length === 0) {
      pagiLines.push('(Belum ada perawat dinas pagi)');
    } else {
      pagiAssignments.forEach((assign, idx) => {
        const sortedList = this.getAssignedMachinesForAssignment(assign, machines);
        const codes = sortedList.map((m) => m.code);
        const summary = this.formatMachineSummary(codes, sortedAllMachines);
        pagiLines.push(`${idx + 1}. ${assign.nurseName} : ${summary}`);
      });
    }

    // 2. SIF SIANG
    let siangAssignments = assignments.filter((a) => a.shiftType === 'SIANG');
    if (sortByName) {
      siangAssignments = [...siangAssignments].sort((a, b) =>
        a.nurseName.localeCompare(b.nurseName, undefined, { sensitivity: 'base' })
      );
    } else {
      siangAssignments = this.sortAssignmentsByMachineOrder(siangAssignments, machines);
    }

    const siangDoc = doctorDuty?.siangDoctorName?.trim() || 'dr. Paramitha Kusumadewi';
    const siangLines: string[] = [];
    if (siangAssignments.length === 0) {
      siangLines.push('(Belum ada perawat dinas siang)');
    } else {
      siangAssignments.forEach((assign, idx) => {
        const sortedList = this.getAssignedMachinesForAssignment(assign, machines);
        const codes = sortedList.map((m) => m.code);
        const summary = this.formatMachineSummary(codes, sortedAllMachines);
        siangLines.push(`${idx + 1}. ${assign.nurseName} : ${summary}`);
      });
    }

    // 3. TUGAS KHUSUS / PIC HARI INI
    const resolveDutyHolders = (shiftAssigns: ShiftAssignment[]) => {
      const getHolders = (keywords: string[], checkLeader: boolean = false): string => {
        const names: string[] = [];
        shiftAssigns.forEach((a) => {
          if (checkLeader && a.isLeader) {
            names.push(a.nurseName.toUpperCase());
          }
          if (a.specialDuty) {
            const dutyUpper = a.specialDuty.toUpperCase();
            if (keywords.some((k) => dutyUpper.includes(k))) {
              names.push(a.nurseName.toUpperCase());
            }
          }
        });
        const unique = Array.from(new Set(names));
        return unique.length > 0 ? ` ${unique.join(' + ')}` : '';
      };

      return {
        pj_shift: getHolders(['PJ SHIF', 'PJ SHIFT', 'PJ'], false),
        bhp: getHolders(['BHP']),
        farmasi_logistik: getHolders(['FARMASI', 'LOGISTIK']),
        natrium_ro: getHolders(['NATRIUM', 'RO']),
        cito: getHolders(['CITO']),
      };
    };

    const dutyPagi = resolveDutyHolders(pagiAssignments);
    const dutySiang = resolveDutyHolders(siangAssignments);

    // 4. Off / Cuti
    const offList = assignments.filter((a) => a.shiftType === 'LIBUR');
    const cutiList = assignments.filter(
      (a) => a.shiftType === 'CUTI' || a.shiftType === 'SAKIT'
    );
    const allOffNames = Array.from(
      new Set([...offList, ...cutiList].map((a) => a.nurseName.toUpperCase()))
    );
    const offCutiText = allOffNames.length > 0 ? allOffNames.join(', ') : '-';

    // 5. Mesin Non-Aktif (mesin yang tidak aktif dialokasikan pada shift bersangkutan)
    const getInactiveMachinesForShift = (shiftAssigns: ShiftAssignment[]): string => {
      const activeMachineIdSet = new Set<string | number>();
      shiftAssigns.forEach((a) => {
        a.assignedMachineIds.forEach((id) => activeMachineIdSet.add(id));
      });

      const inactiveList = machines.filter(
        (m) => !activeMachineIdSet.has(m.id) || m.status !== 'AKTIF'
      );

      if (inactiveList.length === 0) return '-';

      const sorted = this.getSortedMachines(inactiveList);
      return sorted.map((m) => m.code).join(', ');
    };

    const inactivePagi = getInactiveMachinesForShift(pagiAssignments);
    const inactiveSiang = getInactiveMachinesForShift(siangAssignments);

    // Assemble final report matching the exact requested format
    const parts: string[] = [
      '📋 RINGKASAN JADWAL & ALOKASI MESIN HD',
      `🏥 RS Happy Land Medical Centre • Ruang Dialisis Gedung Timur Lt.3`,
      `📅 ${formattedDate}`,
      `Kepada Yth. ${cleanKaru}`,
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      `🌅 SIF PAGI (${pagiAssignments.length} Perawat)`,
      `🩺 DOKTER SIF PAGI : ${pagiDoc}`,
      ...pagiLines,
      '',
      `🌇 SIF SIANG (${siangAssignments.length} Perawat)`,
      `🩺 DOKTER SIF SIANG : ${siangDoc}`,
      ...siangLines,
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '🏷️ TUGAS KHUSUS / PIC HARI INI:',
      'SHIF PAGI',
      `• *PJ Shif :*${dutyPagi.pj_shift}`,
      `• *BHP :*${dutyPagi.bhp}`,
      `• *Farmasi & Logistik :*${dutyPagi.farmasi_logistik}`,
      `• *Natrium RO :*${dutyPagi.natrium_ro}`,
      `• *CITO :*${dutyPagi.cito}`,
      '',
      'SHIF SIANG',
      `• *PJ Shif :*${dutySiang.pj_shift}`,
      `• *BHP :*${dutySiang.bhp}`,
      `• *Farmasi & Logistik :*${dutySiang.farmasi_logistik}`,
      `• *Natrium RO :*${dutySiang.natrium_ro}`,
      `• *CITO :*${dutySiang.cito}`,
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
   * Format Urut Nama Perawat (A-Z) per Sif.
   */
  static generateHeadNurseNurseOrderReport(
    dateStr: string,
    assignments: ShiftAssignment[],
    machines: Machine[],
    hospitalName: string = 'RS Happy Land Medical Centre',
    roomName: string = 'Ruang Dialisis Gedung Timur Lt.3',
    headNurseName: string = 'TWIS FERTILIANTI P W',
    doctorDuty?: { pagiDoctorName?: string; siangDoctorName?: string; notes?: string }
  ): string {
    return this.generateHeadNurseCompactReport(
      dateStr,
      assignments,
      machines,
      hospitalName,
      roomName,
      headNurseName,
      true,
      doctorDuty
    );
  }

  /**
   * Detects whether the current client is a mobile device (Android, iOS, iPad).
   */
  static isMobileDevice(): boolean {
    if (typeof navigator === 'undefined') return false;
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(
      navigator.userAgent || ''
    );
  }

  /**
   * Generates the native WhatsApp protocol URL or direct API URL.
   * Direct api.whatsapp.com/send avoids HTTP 302 redirection issues (such as emoji UTF-8 corruption on wa.me).
   */
  static getNativeWhatsAppUrl(phoneNumber?: string | null, message: string = ''): string {
    const cleaned = this.cleanPhoneNumberForWhatsApp(phoneNumber);
    const encoded = encodeURIComponent(message);
    if (cleaned) {
      return `https://api.whatsapp.com/send/?phone=${cleaned}&text=${encoded}`;
    }
    return `https://api.whatsapp.com/send/?text=${encoded}`;
  }

  /**
   * Generates a valid web WhatsApp URL (direct api.whatsapp.com or web.whatsapp.com).
   * Uses direct api.whatsapp.com/send instead of wa.me to prevent HTTP 302 header re-encoding bugs
   * that corrupt multibyte emoji characters like 🏥.
   */
  static getWhatsAppUrl(
    phoneNumber?: string | null,
    message: string = '',
    options?: { preferWebWhatsApp?: boolean }
  ): string {
    const cleaned = this.cleanPhoneNumberForWhatsApp(phoneNumber);
    const encoded = encodeURIComponent(message);

    if (options?.preferWebWhatsApp) {
      if (cleaned) {
        return `https://web.whatsapp.com/send?phone=${cleaned}&text=${encoded}`;
      }
      return `https://web.whatsapp.com/send?text=${encoded}`;
    }

    if (cleaned) {
      return `https://api.whatsapp.com/send/?phone=${cleaned}&text=${encoded}`;
    }
    return `https://api.whatsapp.com/send/?text=${encoded}`;
  }

  /**
   * Opens WhatsApp directly with target phone number and prefilled message.
   * On mobile devices (Android / iPhone), automatically triggers direct WhatsApp API URL (api.whatsapp.com/send)
   * which is registered as an Android App Link / iOS Universal Link to open the native WhatsApp application
   * without losing or corrupting multibyte UTF-8 emojis (e.g. 🏥).
   * On desktop, opens WhatsApp Web or API page in a new tab.
   * Also copies text to clipboard as an automatic backup.
   */
  static openWhatsApp(
    phoneNumber: string | undefined | null,
    message: string,
    preferDesktopWeb: boolean = false
  ): boolean {
    // 1. Always copy text to clipboard as safety net
    try {
      if (navigator?.clipboard?.writeText) {
        navigator.clipboard.writeText(message).catch(() => {});
      }
    } catch {
      // ignore clipboard write errors
    }

    const isMobile = this.isMobileDevice();
    const webUrl = this.getWhatsAppUrl(phoneNumber, message, { preferWebWhatsApp: preferDesktopWeb });

    // 2. Mobile Strategy: Launch native WhatsApp app via direct Universal Link
    if (isMobile && !preferDesktopWeb) {
      try {
        // Direct location change triggers native app intent on Android/iOS via Universal / App Links
        window.location.href = webUrl;
        return true;
      } catch {
        window.location.href = webUrl;
        return true;
      }
    }

    // 3. Desktop Strategy: Open web or desktop link in a new tab
    try {
      const win = window.open(webUrl, '_blank', 'noopener,noreferrer');
      if (!win || win.closed || typeof win.closed === 'undefined') {
        // Fallback if browser blocked popup: use link click
        const a = document.createElement('a');
        a.href = webUrl;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          try {
            if (document.body.contains(a)) document.body.removeChild(a);
          } catch {}
        }, 500);
      }
      return true;
    } catch {
      window.location.href = webUrl;
      return true;
    }
  }

  /**
   * Generates official and polite notification message for the on-duty doctor.
   */
  static generateDoctorNotificationMessage(
    doctorName: string,
    dateStr: string,
    shiftType: 'PAGI' | 'SIANG',
    katimName?: string,
    hospitalName: string = 'RS Happy Land Medical Centre',
    roomName: string = 'Ruang Dialisis Gedung Timur Lt.3',
    notes?: string
  ): string {
    const formattedDate = this.formatIndonesianDate(dateStr);
    const timeRange = shiftType === 'PAGI' ? '07.00 - 14.00 WIB' : '12.00 - 19.00 WIB';
    const sb: string[] = [];
    sb.push(`Yth. *${doctorName}*,`);
    sb.push(`Salam hormat Dokter. Menginformasikan jadwal tugas jaga di Unit Hemodialisis:`);
    sb.push('');
    sb.push(`🏥 *${hospitalName}* - ${roomName}`);
    sb.push(`📅 *Hari/Tanggal:* ${formattedDate}`);
    sb.push(`⏰ *Sif Jaga:* SIF ${shiftType} (${timeRange})`);
    if (katimName) {
      sb.push(`👑 *PJ Sif / Katim:* ${katimName}`);
    }
    if (notes) {
      sb.push(`📝 *Catatan Tambahan:* ${notes}`);
    }
    sb.push('');
    sb.push('Terima kasih atas kesediaan dan bimbingan Dokter kepada tim perawat dialisis. Semangat bertugas! 🙏🩺');
    sb.push('━━━━━━━━━━━━━━━━━━━━━━');
    sb.push('Sistem Otomasi Jadwal & Alokasi HD HemoShift');
    return sb.join('\n');
  }

  /**
   * Shares message via navigator.share or copies to clipboard.
   */
  static async shareOrCopy(message: string, title: string = 'Jadwal & Alokasi Mesin HD'): Promise<boolean> {
    // Try copying to clipboard first
    try {
      await navigator.clipboard.writeText(message);
    } catch {
      // ignore
    }

    if (navigator.share) {
      try {
        await navigator.share({
          title,
          text: message,
        });
        return true;
      } catch (err) {
        // Fallback to clipboard which was already executed
        return true;
      }
    }

    return true;
  }
}
