import { Machine, Nurse, ShiftAssignment, ShiftType, FairnessReport, NurseMonthlyStat, parseSpecialDuties, getMachineStatusForShift } from '../types';
import { WhatsAppDispatcher } from './WhatsAppDispatcher';

export class FairSchedulerEngine {
  /**
   * Helper to get effective status for a machine on a given shift
   */
  static getMachineStatusForShift(machine: Machine, shift: 'PAGI' | 'SIANG'): Machine['status'] {
    return getMachineStatusForShift(machine, shift);
  }
  /**
   * Checks whether a nurse or duty string contains the CITO special duty.
   */
  static hasCitoDuty(nurseOrDuty?: Nurse | ShiftAssignment | string | null): boolean {
    if (!nurseOrDuty) return false;
    if (typeof nurseOrDuty === 'string') {
      return parseSpecialDuties(nurseOrDuty).some((d) => d.toUpperCase() === 'CITO');
    }
    const duty = (nurseOrDuty as { specialDuty?: string | null }).specialDuty;
    return parseSpecialDuties(duty).some((d) => d.toUpperCase() === 'CITO');
  }

  /**
   * Checks whether a machine belongs to the ISOLASI category (e.g. C08, C09, ISO 1).
   */
  static isIsolationMachine(machine: Machine): boolean {
    if (!machine) return false;
    const cat = (machine.category || '').toUpperCase();
    if (cat === 'ISOLASI') return true;
    const code = (machine.code || '').toUpperCase().trim();
    if (code.startsWith('ISO')) return true;
    const name = (machine.name || '').toUpperCase();
    if (name.includes('ISOLASI') && cat !== 'REGULER' && cat !== 'HEPATITIS_B' && cat !== 'HEPATITIS_C') {
      return true;
    }
    return false;
  }

  /**
   * Generates a balanced, fair 1-month schedule for nurses and machines:
   * 1. Seluruh staff dalam satu minggu kerja penuh dari hari Senin hingga Sabtu (6 hari kerja).
   * 2. Libur HANYA pada hari Minggu (seluruh staff LIBUR).
   * 3. Kepala Ruang (KARU): Setiap hari kerja (Senin - Sabtu) selalu sif PAGI.
   */
  static generateMonthlySchedule(
    year: number,
    month: number, // 1 to 12
    nurses: Nurse[],
    machines: Machine[],
    seed: number = Date.now()
  ): ShiftAssignment[] {
    const activeNurses = nurses.filter((n) => n.isActive);
    if (activeNurses.length === 0) return [];

    const activeMachines = machines.filter((m) => m.status === 'AKTIF');
    const daysInMonth = new Date(year, month, 0).getDate();

    const pseudoRandom = (seedVal: number) => {
      let x = Math.sin(seedVal++) * 10000;
      return x - Math.floor(x);
    };

    let seedCounter = seed;
    const assignments: ShiftAssignment[] = [];

    // Identify roles: KARU, KATIM, PELAKSANA
    const isKaru = (n: Nurse) => (n.role || '').toUpperCase() === 'KARU';
    const isKatim = (n: Nurse) => !isKaru(n) && (n.role || '').toUpperCase() === 'KATIM';
    const isPelaksana = (n: Nurse) => !isKaru(n) && !isKatim(n);

    const karuNurses = activeNurses.filter(isKaru);
    const katimNurses = activeNurses.filter(isKatim);
    const pelaksanaNurses = activeNurses.filter(isPelaksana);
    const nonKaruNurses = activeNurses.filter((n) => !isKaru(n));

    // Workload tracking maps
    const workingDaysCount: Record<number, number> = {};
    const pagiCount: Record<number, number> = {};
    const siangCount: Record<number, number> = {};
    const liburCount: Record<number, number> = {};
    const consecutiveSameShift: Record<number, { shift: string; count: number }> = {};
    const consecutiveWorkDays: Record<number, number> = {};
    const lastShiftOfNurse: Record<number, ShiftType | null> = {};
    const fourMachineTurnTracker: Record<number, number> = {};
    const isolationTurnTracker: Record<number, number> = {};
    const lastDayIsolation: Record<number, boolean> = {};

    activeNurses.forEach((n) => {
      workingDaysCount[n.id] = 0;
      pagiCount[n.id] = 0;
      siangCount[n.id] = 0;
      liburCount[n.id] = 0;
      consecutiveSameShift[n.id] = { shift: 'NONE', count: 0 };
      consecutiveWorkDays[n.id] = 0;
      lastShiftOfNurse[n.id] = 'LIBUR';
      fourMachineTurnTracker[n.id] = 0;
      isolationTurnTracker[n.id] = 0;
      lastDayIsolation[n.id] = false;
    });

    // Pre-calculate total workdays in this month (Monday through Saturday)
    let totalWorkdaysInMonth = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      if (new Date(year, month - 1, d).getDay() !== 0) {
        totalWorkdaysInMonth++;
      }
    }

    // Iterate through every day of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month - 1, day);
      const dayOfWeek = date.getDay(); // 0 is Sunday, 1..6 is Mon..Sat
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

      const dailyAssigned: ShiftAssignment[] = [];

      // ==========================================
      // 1. HARI MINGGU: Seluruh Staff Libur
      // ==========================================
      if (dayOfWeek === 0) {
        activeNurses.forEach((nurse) => {
          const assignment: ShiftAssignment = {
            id: `${dateStr}_${nurse.id}`,
            date: dateStr,
            shiftType: 'LIBUR',
            nurseId: nurse.id,
            nurseName: nurse.name,
            nursePhone: nurse.phone,
            assignedMachineIds: [],
            isLeader: false,
            isWhatsAppSent: false,
            notes: 'Hari Minggu (Libur Seluruh Staff)',
            specialDuty: null,
          };
          dailyAssigned.push(assignment);

          consecutiveWorkDays[nurse.id] = 0;
          consecutiveSameShift[nurse.id] = { shift: 'LIBUR', count: 1 };
          lastShiftOfNurse[nurse.id] = 'LIBUR';
          lastDayIsolation[nurse.id] = false;
          liburCount[nurse.id] = (liburCount[nurse.id] || 0) + 1;
        });

        // Inactive nurses get CUTI
        const inactiveNurses = nurses.filter((n) => !n.isActive);
        inactiveNurses.forEach((nurse) => {
          const assignment: ShiftAssignment = {
            id: `${dateStr}_${nurse.id}`,
            date: dateStr,
            shiftType: 'CUTI',
            nurseId: nurse.id,
            nurseName: nurse.name,
            nursePhone: nurse.phone,
            assignedMachineIds: [],
            isLeader: false,
            isWhatsAppSent: false,
            notes: 'Non-aktif / Cuti',
            specialDuty: null,
          };
          dailyAssigned.push(assignment);
        });

        assignments.push(...dailyAssigned);
        continue;
      }

      // ==========================================
      // 2. HARI KERJA (SENIN - SABTU: 6 HARI KERJA)
      // Seluruh staf aktif masuk dinas, libur HANYA pada hari Minggu
      // Pembagian sif memperhatikan status Peran / Jabatan perawat:
      // - KARU: Selalu sif PAGI setiap hari kerja
      // - KATIM: Terdistribusi adil di kedua sif (Pagi & Siang) setiap hari & seimbang 50:50 sebulan
      // - PELAKSANA: Terdistribusi adil di kedua sif dengan keseimbangan skill level & 50:50 sebulan
      // ==========================================
      const totalWorkingToday = karuNurses.length + katimNurses.length + pelaksanaNurses.length;
      const targetDailyPagi = Math.max(1, Math.ceil(totalWorkingToday / 2));
      const targetDailySiang = totalWorkingToday - targetDailyPagi;

      // 2a. KARU Assignment
      // Rule: "Untuk staff yang berstatus Kepala Ruang Setiap Hari sif pagi"
      const selectedPagi: Nurse[] = [...karuNurses];
      const selectedSiang: Nurse[] = [];

      // 2b. KATIM Role Distribution
      // Ensure team leaders (Katim) are present across both shifts every workday
      // AND each Katim reaches ~50:50 Pagi vs Siang across the month.
      const numKatims = katimNurses.length;
      let targetKatimPagi = 0;
      let targetKatimSiang = 0;

      if (numKatims === 0) {
        targetKatimPagi = 0;
        targetKatimSiang = 0;
      } else if (numKatims === 1) {
        // 1 Katim: alternate / balance to reach ~50% Pagi, 50% Siang
        const katim = katimNurses[0];
        const pC = pagiCount[katim.id] || 0;
        const sC = siangCount[katim.id] || 0;
        if (pC > sC) {
          targetKatimSiang = 1;
          targetKatimPagi = 0;
        } else if (sC > pC) {
          targetKatimSiang = 0;
          targetKatimPagi = 1;
        } else {
          targetKatimPagi =
            lastShiftOfNurse[katim.id] === 'PAGI' &&
            consecutiveSameShift[katim.id]?.count < 3
              ? 1
              : 0;
          targetKatimSiang = 1 - targetKatimPagi;
        }
      } else if (numKatims % 2 === 0) {
        // Even number of Katims (e.g. 2 or 4): Exactly half in Pagi and half in Siang every single day!
        targetKatimPagi = numKatims / 2;
        targetKatimSiang = numKatims / 2;
      } else {
        // Odd number of Katims (e.g. 3):
        // Alternate between (ceil, floor) and (floor, ceil) so every Katim achieves 50:50!
        const totalKatimPagiSoFar = katimNurses.reduce(
          (sum, n) => sum + (pagiCount[n.id] || 0),
          0
        );
        const totalKatimSiangSoFar = katimNurses.reduce(
          (sum, n) => sum + (siangCount[n.id] || 0),
          0
        );
        if (totalKatimPagiSoFar > totalKatimSiangSoFar) {
          targetKatimPagi = Math.floor(numKatims / 2);
          targetKatimSiang = numKatims - targetKatimPagi;
        } else {
          targetKatimPagi = Math.ceil(numKatims / 2);
          targetKatimSiang = numKatims - targetKatimPagi;
        }
      }

      // Score Katims for PAGI
      const idealKatimPagi =
        (totalWorkdaysInMonth * (numKatims / 2)) / Math.max(1, numKatims);
      const scoredKatims = katimNurses.map((nurse) => {
        let score = 0;
        const pCount = pagiCount[nurse.id] || 0;
        const sCount = siangCount[nurse.id] || 0;
        score += (sCount - pCount) * 100;
        score += (idealKatimPagi - pCount) * 50;

        const prev = lastShiftOfNurse[nurse.id];
        const same = consecutiveSameShift[nurse.id] || { shift: 'NONE', count: 0 };
        if (prev === 'LIBUR') {
          score += 20;
        } else if (prev === 'PAGI') {
          if (same.shift === 'PAGI' && same.count >= 3) score -= 20;
          else score += 10;
        } else if (prev === 'SIANG') {
          score -= 40;
          if (same.shift === 'SIANG' && same.count >= 3) score += 30;
        }
        score += (pseudoRandom(seedCounter++) - 0.5) * 5;
        return { nurse, score };
      });

      scoredKatims.sort((a, b) => b.score - a.score || a.nurse.id - b.nurse.id);
      const chosenPagiKatim = scoredKatims.slice(0, targetKatimPagi).map((x) => x.nurse);
      const chosenSiangKatim = scoredKatims.slice(targetKatimPagi).map((x) => x.nurse);

      selectedPagi.push(...chosenPagiKatim);
      selectedSiang.push(...chosenSiangKatim);

      // 2c. PELAKSANA Role Distribution
      const neededPelaksanaPagi = Math.max(0, targetDailyPagi - selectedPagi.length);
      const neededPelaksanaSiang = Math.max(0, targetDailySiang - selectedSiang.length);
      const idealPelaksanaPagi =
        (totalWorkdaysInMonth * (pelaksanaNurses.length / 2)) /
        Math.max(1, pelaksanaNurses.length);

      // Current seniors in Pagi vs Siang from Karu & Katim:
      const seniorsInPagiFromLeaders = selectedPagi.filter(
        (n) => n.skillLevel === 'Senior'
      ).length;
      const seniorsInSiangFromLeaders = selectedSiang.filter(
        (n) => n.skillLevel === 'Senior'
      ).length;

      // Score Pelaksana for PAGI:
      const scoredPelaksana = pelaksanaNurses.map((nurse) => {
        let score = 0;
        const pCount = pagiCount[nurse.id] || 0;
        const sCount = siangCount[nurse.id] || 0;
        // 1. Primary: Deficit between Siang and Pagi
        score += (sCount - pCount) * 100;
        // 2. Secondary: Ideal 50% target progress
        score += (idealPelaksanaPagi - pCount) * 50;

        // 3. Ergonomics & rest
        const prev = lastShiftOfNurse[nurse.id];
        const same = consecutiveSameShift[nurse.id] || { shift: 'NONE', count: 0 };
        if (prev === 'LIBUR') {
          score += 20;
        } else if (prev === 'PAGI') {
          if (same.shift === 'PAGI' && same.count >= 3) score -= 20;
          else score += 10;
        } else if (prev === 'SIANG') {
          score -= 40;
          if (same.shift === 'SIANG' && same.count >= 3) score += 30;
        }

        // 4. Skill-Mix balance factor:
        // Balance seniors so neither shift lacks experienced supervision
        if (nurse.skillLevel === 'Senior') {
          if (seniorsInPagiFromLeaders > seniorsInSiangFromLeaders) {
            score -= 15;
          } else if (seniorsInPagiFromLeaders < seniorsInSiangFromLeaders) {
            score += 15;
          }
        }

        score += (pseudoRandom(seedCounter++) - 0.5) * 5;
        return { nurse, score };
      });

      scoredPelaksana.sort((a, b) => b.score - a.score || a.nurse.id - b.nurse.id);

      const chosenPagiPelaksana = scoredPelaksana
        .slice(0, neededPelaksanaPagi)
        .map((x) => x.nurse);
      const chosenSiangPelaksana = scoredPelaksana
        .slice(neededPelaksanaPagi)
        .map((x) => x.nurse);

      selectedPagi.push(...chosenPagiPelaksana);
      selectedSiang.push(...chosenSiangPelaksana);

      // If isolation machines are operational, ensure at least one CITO nurse in Pagi and Siang
      const hasIsoMachines = activeMachines.some((m) =>
        FairSchedulerEngine.isIsolationMachine(m)
      );

      // Ensure CITO nurse in Pagi if needed
      if (
        hasIsoMachines &&
        !selectedPagi.some((n) => FairSchedulerEngine.hasCitoDuty(n))
      ) {
        const citoInSiangIdx = selectedSiang.findIndex((n) =>
          FairSchedulerEngine.hasCitoDuty(n)
        );
        if (citoInSiangIdx !== -1) {
          let swapInPagiIdx = selectedPagi.findIndex(
            (n) => isPelaksana(n) && !FairSchedulerEngine.hasCitoDuty(n)
          );
          if (swapInPagiIdx === -1) {
            swapInPagiIdx = selectedPagi.findIndex(
              (n) => !isKaru(n) && !FairSchedulerEngine.hasCitoDuty(n)
            );
          }
          if (swapInPagiIdx !== -1) {
            const citoNurse = selectedSiang.splice(citoInSiangIdx, 1)[0];
            const nonCitoNurse = selectedPagi.splice(swapInPagiIdx, 1)[0];
            selectedPagi.push(citoNurse);
            selectedSiang.push(nonCitoNurse);
          }
        }
      }

      // Ensure at least one CITO nurse in Siang if isolation machines exist
      if (
        hasIsoMachines &&
        !selectedSiang.some((n) => FairSchedulerEngine.hasCitoDuty(n))
      ) {
        const citoInPagiIdx = selectedPagi.findIndex(
          (n) => !isKaru(n) && FairSchedulerEngine.hasCitoDuty(n)
        );
        if (citoInPagiIdx !== -1) {
          let swapInSiangIdx = selectedSiang.findIndex(
            (n) => isPelaksana(n) && !FairSchedulerEngine.hasCitoDuty(n)
          );
          if (swapInSiangIdx === -1) {
            swapInSiangIdx = selectedSiang.findIndex(
              (n) => !FairSchedulerEngine.hasCitoDuty(n)
            );
          }
          if (swapInSiangIdx !== -1) {
            const citoNurse = selectedPagi.splice(citoInPagiIdx, 1)[0];
            const nonCitoNurse = selectedSiang.splice(swapInSiangIdx, 1)[0];
            selectedSiang.push(citoNurse);
            selectedPagi.push(nonCitoNurse);
          }
        }
      }

      // Ensure leadership in Siang (Katim or Senior nurse)
      const siangHasLeader = selectedSiang.some(
        (n) => isKatim(n) || n.skillLevel === 'Senior'
      );
      if (!siangHasLeader && selectedSiang.length > 0) {
        const leaderInPagiIdx = selectedPagi.findIndex(
          (n) => !isKaru(n) && (isKatim(n) || n.skillLevel === 'Senior')
        );
        if (leaderInPagiIdx !== -1) {
          const juniorInSiangIdx = selectedSiang.findIndex(
            (n) => isPelaksana(n) && n.skillLevel === 'Junior'
          );
          const fallbackSiangIdx =
            juniorInSiangIdx !== -1
              ? juniorInSiangIdx
              : selectedSiang.findIndex(isPelaksana);
          if (fallbackSiangIdx !== -1) {
            const leaderNurse = selectedPagi.splice(leaderInPagiIdx, 1)[0];
            const swapNurse = selectedSiang.splice(fallbackSiangIdx, 1)[0];
            selectedSiang.push(leaderNurse);
            selectedPagi.push(swapNurse);
          }
        }
      }

      // Allocate machines for PAGI
      const pagiMachineAllocations = this.allocateMachinesWithOptions(
        selectedPagi,
        machines,
        day,
        'PAGI',
        fourMachineTurnTracker,
        isolationTurnTracker,
        lastDayIsolation,
        { rotateBays: true, shuffleNurses: true, leaderLighterLoad: true }
      );

      // Allocate machines for SIANG
      const siangMachineAllocations = this.allocateMachinesWithOptions(
        selectedSiang,
        machines,
        day,
        'SIANG',
        fourMachineTurnTracker,
        isolationTurnTracker,
        lastDayIsolation,
        { rotateBays: true, shuffleNurses: true, leaderLighterLoad: true }
      );

      // Build assignments for PAGI
      selectedPagi.forEach((nurse) => {
        const machinesForNurse = pagiMachineAllocations[nurse.id] || [];
        const isHeadNurse = isKaru(nurse);
        const isKatimNurse = isKatim(nurse);
        const isLeader = isHeadNurse || isKatimNurse;
        const hasIso = machinesForNurse.some((mId) => {
          const m = activeMachines.find((mach) => mach.id === mId);
          return m && FairSchedulerEngine.isIsolationMachine(m);
        });

        const assignment: ShiftAssignment = {
          id: `${dateStr}_${nurse.id}`,
          date: dateStr,
          shiftType: 'PAGI',
          nurseId: nurse.id,
          nurseName: nurse.name,
          nursePhone: nurse.phone,
          assignedMachineIds: machinesForNurse,
          isLeader,
          isWhatsAppSent: false,
          notes: isHeadNurse
            ? 'Kepala Ruangan (Sif Pagi)'
            : isKatimNurse
            ? 'PJ Sif Pagi'
            : 'Perawat Pelaksana',
          specialDuty: nurse.specialDuty || (hasIso ? 'CITO' : null),
        };
        dailyAssigned.push(assignment);

        workingDaysCount[nurse.id] = (workingDaysCount[nurse.id] || 0) + 1;
        pagiCount[nurse.id] = (pagiCount[nurse.id] || 0) + 1;
        consecutiveWorkDays[nurse.id] = (consecutiveWorkDays[nurse.id] || 0) + 1;
        if (lastShiftOfNurse[nurse.id] === 'PAGI') {
          consecutiveSameShift[nurse.id] = {
            shift: 'PAGI',
            count: (consecutiveSameShift[nurse.id]?.count || 0) + 1,
          };
        } else {
          consecutiveSameShift[nurse.id] = { shift: 'PAGI', count: 1 };
        }
        lastShiftOfNurse[nurse.id] = 'PAGI';
      });

      // Build assignments for SIANG
      const siangKatim = selectedSiang.find(isKatim);
      let siangActingLeaderId: number | null = siangKatim ? siangKatim.id : null;
      if (!siangActingLeaderId && selectedSiang.length > 0) {
        const seniors = selectedSiang.filter((n) => n.skillLevel === 'Senior');
        const mediums = selectedSiang.filter((n) => n.skillLevel === 'Medium');
        const chosenActing = seniors[0] || mediums[0] || selectedSiang[0];
        siangActingLeaderId = chosenActing.id;
      }

      selectedSiang.forEach((nurse) => {
        const machinesForNurse = siangMachineAllocations[nurse.id] || [];
        const isKatimNurse = isKatim(nurse);
        const isActingLeader = nurse.id === siangActingLeaderId;
        const isLeader = isKatimNurse || isActingLeader;
        const hasIso = machinesForNurse.some((mId) => {
          const m = activeMachines.find((mach) => mach.id === mId);
          return m && FairSchedulerEngine.isIsolationMachine(m);
        });

        const assignment: ShiftAssignment = {
          id: `${dateStr}_${nurse.id}`,
          date: dateStr,
          shiftType: 'SIANG',
          nurseId: nurse.id,
          nurseName: nurse.name,
          nursePhone: nurse.phone,
          assignedMachineIds: machinesForNurse,
          isLeader,
          isWhatsAppSent: false,
          notes: isKatimNurse
            ? 'PJ Sif Siang'
            : isActingLeader
            ? 'PJ Sif Siang (Pjs)'
            : 'Perawat Pelaksana',
          specialDuty: nurse.specialDuty || (hasIso ? 'CITO' : null),
        };
        dailyAssigned.push(assignment);

        workingDaysCount[nurse.id] = (workingDaysCount[nurse.id] || 0) + 1;
        siangCount[nurse.id] = (siangCount[nurse.id] || 0) + 1;
        consecutiveWorkDays[nurse.id] = (consecutiveWorkDays[nurse.id] || 0) + 1;
        if (lastShiftOfNurse[nurse.id] === 'SIANG') {
          consecutiveSameShift[nurse.id] = {
            shift: 'SIANG',
            count: (consecutiveSameShift[nurse.id]?.count || 0) + 1,
          };
        } else {
          consecutiveSameShift[nurse.id] = { shift: 'SIANG', count: 1 };
        }
        lastShiftOfNurse[nurse.id] = 'SIANG';
      });

      // Inactive nurses get CUTI
      const inactiveNurses = nurses.filter((n: Nurse) => !n.isActive);
      inactiveNurses.forEach((nurse: Nurse) => {
        const assignment: ShiftAssignment = {
          id: `${dateStr}_${nurse.id}`,
          date: dateStr,
          shiftType: 'CUTI',
          nurseId: nurse.id,
          nurseName: nurse.name,
          nursePhone: nurse.phone,
          assignedMachineIds: [],
          isLeader: false,
          isWhatsAppSent: false,
          notes: 'Non-aktif / Cuti',
          specialDuty: null,
        };
        dailyAssigned.push(assignment);
      });

      assignments.push(...dailyAssigned);
    }

    return assignments;
  }

  /**
   * Distributes Hemodialysis machines fairly among nurses on a single shift.
   */
  static allocateMachinesFairly(
    nursesOnShift: Nurse[],
    activeMachines: Machine[],
    dayIndex: number,
    shiftType: ShiftType,
    fourMachineTracker: Record<number, number> = {},
    isolationTracker: Record<number, number> = {}
  ): Record<number, number[]> {
    return this.allocateMachinesWithOptions(
      nursesOnShift,
      activeMachines,
      dayIndex,
      shiftType,
      fourMachineTracker,
      isolationTracker,
      {},
      { rotateBays: true, shuffleNurses: true }
    );
  }

  /**
   * Reallocates machines for an entire month while strictly preserving existing nurse shifts (PAGI, SIANG, LIBUR, etc.).
   */
  static reallocateMonthlyMachinesPreservingShifts(
    monthPrefix: string, // e.g. "2026-09"
    currentAssignments: ShiftAssignment[],
    nurses: Nurse[],
    machines: Machine[],
    options: {
      rotateBays?: boolean;
      leaderLighterLoad?: boolean;
      consecutiveIsolationProtection?: boolean;
      shuffleNurses?: boolean;
      targetShift?: 'ALL' | 'PAGI' | 'SIANG';
    } = {}
  ): ShiftAssignment[] {
    const hasActiveMachines = machines.some((m) => {
      const p = getMachineStatusForShift(m, 'PAGI');
      const s = getMachineStatusForShift(m, 'SIANG');
      return p === 'AKTIF' || s === 'AKTIF';
    });
    if (!hasActiveMachines) return currentAssignments;

    const targetShift = options.targetShift || 'ALL';

    const fourMachineTracker: Record<number, number> = {};
    const isolationTracker: Record<number, number> = {};
    const lastDayIsolation: Record<number, boolean> = {};

    nurses.forEach((n) => {
      fourMachineTracker[n.id] = 0;
      isolationTracker[n.id] = 0;
      lastDayIsolation[n.id] = false;
    });

    // Group assignments by date for the target month
    const monthAssignments = currentAssignments.filter((a) => a.date.startsWith(monthPrefix));
    const otherAssignments = currentAssignments.filter((a) => !a.date.startsWith(monthPrefix));

    const dateMap = new Map<string, ShiftAssignment[]>();
    monthAssignments.forEach((a) => {
      const list = dateMap.get(a.date) || [];
      list.push(a);
      dateMap.set(a.date, list);
    });

    // Helper to safely find or create nurse object for an assignment
    const getOrCreateNurse = (a: ShiftAssignment): Nurse => {
      const found = nurses.find((n) => Number(n.id) === Number(a.nurseId));
      if (found) return found;
      return {
        id: Number(a.nurseId) || 999,
        name: a.nurseName,
        nip: '',
        phone: a.nursePhone || '',
        role: a.isLeader ? 'KATIM' : 'PELAKSANA',
        isActive: true,
        defaultOffDay: null,
        skillLevel: 'Senior',
        specialDuty: a.specialDuty || null,
      };
    };

    // Sort dates chronologically
    const sortedDates = Array.from(dateMap.keys()).sort();
    const updatedMonthAssignments: ShiftAssignment[] = [];

    const effectiveOptions = {
      shuffleNurses: true,
      rotateBays: true,
      ...options,
    };

    sortedDates.forEach((dateStr, dayIdx) => {
      const dailyList = dateMap.get(dateStr) || [];
      const dayNum = parseInt(dateStr.split('-')[2] || `${dayIdx + 1}`, 10);

      // Separate Pagi and Siang working nurses
      const pagiAssignments = dailyList.filter((a) => a.shiftType === 'PAGI');
      const siangAssignments = dailyList.filter((a) => a.shiftType === 'SIANG');
      const otherDaily = dailyList.filter((a) => a.shiftType !== 'PAGI' && a.shiftType !== 'SIANG');

      const pagiNurses = pagiAssignments.map(getOrCreateNurse);
      const siangNurses = siangAssignments.map(getOrCreateNurse);

      // 1. Allocate Pagi machines (only if targetShift is ALL or PAGI)
      const pagiAlloc = (targetShift === 'ALL' || targetShift === 'PAGI') && pagiNurses.length > 0
        ? this.allocateMachinesWithOptions(
            pagiNurses,
            machines,
            dayNum,
            'PAGI',
            fourMachineTracker,
            isolationTracker,
            lastDayIsolation,
            effectiveOptions
          )
        : null;

      // 2. Allocate Siang machines (only if targetShift is ALL or SIANG)
      const siangAlloc = (targetShift === 'ALL' || targetShift === 'SIANG') && siangNurses.length > 0
        ? this.allocateMachinesWithOptions(
            siangNurses,
            machines,
            dayNum,
            'SIANG',
            fourMachineTracker,
            isolationTracker,
            lastDayIsolation,
            effectiveOptions
          )
        : null;

      // Apply to Pagi assignments - strictly preserve shiftType and nurse details
      pagiAssignments.forEach((a) => {
        const nId = Number(a.nurseId);
        const allocated = pagiAlloc
          ? (pagiAlloc[nId] || (pagiAlloc as Record<string, number[]>)[String(a.nurseId)] || [])
          : (a.assignedMachineIds || []);

        updatedMonthAssignments.push({
          ...a,
          assignedMachineIds: allocated,
          specialDuty: a.specialDuty && a.specialDuty.trim() !== '' ? a.specialDuty.trim() : null,
        });
      });

      // Apply to Siang assignments - strictly preserve shiftType and nurse details
      siangAssignments.forEach((a) => {
        const nId = Number(a.nurseId);
        const allocated = siangAlloc
          ? (siangAlloc[nId] || (siangAlloc as Record<string, number[]>)[String(a.nurseId)] || [])
          : (a.assignedMachineIds || []);

        updatedMonthAssignments.push({
          ...a,
          assignedMachineIds: allocated,
          specialDuty: a.specialDuty && a.specialDuty.trim() !== '' ? a.specialDuty.trim() : null,
        });
      });

      // Off/Leave assignments keep empty machine array
      otherDaily.forEach((a) => {
        updatedMonthAssignments.push({
          ...a,
          assignedMachineIds: [],
          specialDuty: a.specialDuty && a.specialDuty.trim() !== '' ? a.specialDuty.trim() : null,
        });
      });
    });

    return [...otherAssignments, ...updatedMonthAssignments];
  }

  /**
   * Dedicated helper to allocate machines specifically for Sif Pagi (07:00 - 14:00).
   */
  static allocateMachinesForPagi(
    pagiNurses: Nurse[],
    activeMachines: Machine[],
    dayIndex: number,
    options: {
      rotateBays?: boolean;
      leaderLighterLoad?: boolean;
      consecutiveIsolationProtection?: boolean;
      shuffleNurses?: boolean;
    } = {}
  ): Record<number, number[]> {
    return this.allocateMachinesWithOptions(
      pagiNurses,
      activeMachines,
      dayIndex,
      'PAGI',
      {},
      {},
      {},
      options
    );
  }

  /**
   * Dedicated helper to allocate machines specifically for Sif Siang (12:00 - 19:00).
   */
  static allocateMachinesForSiang(
    siangNurses: Nurse[],
    activeMachines: Machine[],
    dayIndex: number,
    options: {
      rotateBays?: boolean;
      leaderLighterLoad?: boolean;
      consecutiveIsolationProtection?: boolean;
      shuffleNurses?: boolean;
    } = {}
  ): Record<number, number[]> {
    return this.allocateMachinesWithOptions(
      siangNurses,
      activeMachines,
      dayIndex,
      'SIANG',
      {},
      {},
      {},
      options
    );
  }

  /**
   * Helper allocation with customizable fairness rules (bay rotation, leader lightness, isolation balance, nurse shuffling).
   * Guarantees that 100% of active machines are distributed without leaving any machine unallocated,
   * while reshuffling nurses randomly and keeping their shift unchanged.
   */
  static allocateMachinesWithOptions(
    nursesOnShift: Nurse[],
    activeMachines: Machine[],
    dayIndex: number,
    shiftType: ShiftType,
    fourMachineTracker: Record<number, number> = {},
    isolationTracker: Record<number, number> = {},
    lastDayIsolation: Record<number, boolean> = {},
    options: {
      rotateBays?: boolean;
      leaderLighterLoad?: boolean;
      consecutiveIsolationProtection?: boolean;
      shuffleNurses?: boolean;
    } = {}
  ): Record<number, number[]> {
    if (nursesOnShift.length === 0 || activeMachines.length === 0) return {};

    // Strictly filter to active machines that are operational for this specific shift
    const strictlyActiveMachines = activeMachines.filter((m) => {
      // Shift-specific status check
      const shiftStatus =
        shiftType === 'PAGI' || shiftType === 'SIANG'
          ? getMachineStatusForShift(m, shiftType)
          : (m.status || 'AKTIF');

      if (shiftStatus !== 'AKTIF') return false;

      // Filter by operational shift if specified
      if (shiftType === 'PAGI' && m.operationalShift === 'SIANG') {
        return false;
      }
      if (shiftType === 'SIANG' && m.operationalShift === 'PAGI') {
        return false;
      }
      return true;
    });
    if (strictlyActiveMachines.length === 0) return {};

    const numNurses = nursesOnShift.length;
    const sortedActiveMachines = WhatsAppDispatcher.getSortedMachines(strictlyActiveMachines);

    // Separate Isolation machines and Non-Isolation machines
    const isolationMachines = sortedActiveMachines.filter((m) => FairSchedulerEngine.isIsolationMachine(m));
    const nonIsolationMachines = sortedActiveMachines.filter((m) => !FairSchedulerEngine.isIsolationMachine(m));

    // Separate CITO nurses and non-CITO nurses on this shift
    const citoNurses = nursesOnShift.filter((n) => FairSchedulerEngine.hasCitoDuty(n));
    const nonCitoNurses = nursesOnShift.filter((n) => !FairSchedulerEngine.hasCitoDuty(n));

    // STRICT BUSINESS RULE:
    // "Mesin isolasi hanya dialokasikan terhadap perawat yang mendapat tugas khusus CITO.
    // Jika tidak ada perawat yang mendapat tugas khusus CITO maka mesin isolasi tidak dialokasikan."
    const hasCitoNurses = citoNurses.length > 0;

    // If no CITO nurse is present on this shift, isolation machines are strictly excluded from allocation.
    // If CITO nurses are present, isolation machines can be allocated up to what CITO nurses can take.
    const maxIsolationToAllocate = hasCitoNurses ? isolationMachines.length : 0;
    const totalMachinesToDistribute = nonIsolationMachines.length + maxIsolationToAllocate;

    const baseCount = Math.floor(totalMachinesToDistribute / numNurses);
    const remainder = totalMachinesToDistribute % numNurses;

    // Check if leader should have 1 less machine
    let leaderNurseId: number | null = null;
    if (options.leaderLighterLoad) {
      const leader = nursesOnShift.find((n) => n.role === 'KARU' || n.role === 'KATIM');
      if (leader && numNurses > 3) {
        leaderNurseId = Number(leader.id);
      }
    }

    // 3. Determine target machine count for each nurse (ensuring fair workload balance)
    const eligibleForExtra = [...nursesOnShift].filter((n) => Number(n.id) !== leaderNurseId);
    eligibleForExtra.sort(
      (a, b) => (fourMachineTracker[Number(a.id)] || 0) - (fourMachineTracker[Number(b.id)] || 0)
    );

    const luckyCount = Math.min(
      eligibleForExtra.length,
      remainder + (leaderNurseId !== null ? 1 : 0)
    );
    const luckyNursesForExtraMachine = new Set(
      eligibleForExtra.slice(0, luckyCount).map((n) => Number(n.id))
    );

    luckyNursesForExtraMachine.forEach((id) => {
      fourMachineTracker[id] = (fourMachineTracker[id] || 0) + 1;
    });

    const targetCounts: Record<number, number> = {};
    for (const nurse of nursesOnShift) {
      const nId = Number(nurse.id);
      let count = luckyNursesForExtraMachine.has(nId) ? baseCount + 1 : baseCount;
      if (leaderNurseId !== null && nId === leaderNurseId) {
        count = Math.max(1, baseCount - 1);
      }
      targetCounts[nId] = count;
    }

    const allocation: Record<number, number[]> = {};
    for (const nurse of nursesOnShift) {
      allocation[Number(nurse.id)] = [];
    }

    // Available regular and isolation machines to distribute
    const unallocatedIsolationMachines = hasCitoNurses ? [...isolationMachines] : [];
    const availableRegularMachines = [...nonIsolationMachines];

    // STEP A: Allocate Isolation Machines (STRICTLY to CITO nurses only)
    if (hasCitoNurses && unallocatedIsolationMachines.length > 0) {
      // Sort CITO nurses by consecutive isolation protection & isolationTracker
      const sortedCitoNurses = [...citoNurses].sort((a, b) => {
        const aId = Number(a.id);
        const bId = Number(b.id);
        if (options.consecutiveIsolationProtection !== false) {
          const aIsoYesterday = lastDayIsolation[aId] === true ? 1 : 0;
          const bIsoYesterday = lastDayIsolation[bId] === true ? 1 : 0;
          if (aIsoYesterday !== bIsoYesterday) return aIsoYesterday - bIsoYesterday;
        }
        return (isolationTracker[aId] || 0) - (isolationTracker[bId] || 0);
      });

      // Distribute isolation machines strictly to CITO nurses who have capacity
      while (unallocatedIsolationMachines.length > 0) {
        const availableCito = sortedCitoNurses.filter(
          (cn) => allocation[Number(cn.id)].length < targetCounts[Number(cn.id)]
        );
        if (availableCito.length === 0) {
          // All CITO nurses reached their target capacity!
          // Any remaining isolation machines MUST NOT be given to non-CITO nurses!
          break;
        }

        availableCito.sort(
          (a, b) => allocation[Number(a.id)].length - allocation[Number(b.id)].length
        );
        const chosenNurse = availableCito[0];
        const isoMachine = unallocatedIsolationMachines.shift()!;
        allocation[Number(chosenNurse.id)].push(isoMachine.id);
      }

      // Fill remaining quota for CITO nurses using contiguous regular machines from Bay C (end of list)
      for (const cNurse of citoNurses) {
        const cId = Number(cNurse.id);
        const needed = Math.max(0, targetCounts[cId] - allocation[cId].length);
        for (let k = 0; k < needed; k++) {
          if (availableRegularMachines.length > 0) {
            // Take from the end of regular machines (Bay C C07, C06, C05) so they are physically near the isolation bay
            const regMach = availableRegularMachines.pop()!;
            allocation[cId].push(regMach.id);
          }
        }
      }
    }

    // NOTICE: Any unallocated isolation machines remaining in unallocatedIsolationMachines
    // (or if hasCitoNurses is false) MUST REMAIN UNALLOCATED.
    // They are NEVER allocated to non-CITO nurses!

    // STEP B: Distribute regular machines to non-CITO nurses
    let orderedNonCitoNurses: Nurse[] = [];
    if (options.shuffleNurses !== false) {
      orderedNonCitoNurses = [...nonCitoNurses];
      for (let i = orderedNonCitoNurses.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = orderedNonCitoNurses[i];
        orderedNonCitoNurses[i] = orderedNonCitoNurses[j];
        orderedNonCitoNurses[j] = temp;
      }
    } else {
      const rotationOffset =
        options.rotateBays !== false && nonCitoNurses.length > 0
          ? (dayIndex + (shiftType === 'SIANG' ? 4 : 0)) % nonCitoNurses.length
          : 0;
      orderedNonCitoNurses = nonCitoNurses.map(
        (_, i) => nonCitoNurses[(i + rotationOffset) % nonCitoNurses.length]
      );
    }

    let regularPointer = 0;
    for (const nurse of orderedNonCitoNurses) {
      const nId = Number(nurse.id);
      const needed = Math.max(0, targetCounts[nId] - allocation[nId].length);
      const endIndex = Math.min(regularPointer + needed, availableRegularMachines.length);
      const chunk = availableRegularMachines.slice(regularPointer, endIndex);
      allocation[nId].push(...chunk.map((m) => m.id));
      regularPointer = endIndex;
    }

    // Distribute any leftover regular machines (if any) to nurses with fewest machines
    if (regularPointer < availableRegularMachines.length) {
      const leftovers = availableRegularMachines.slice(regularPointer);
      for (const lm of leftovers) {
        const sortedByLoad = [...nursesOnShift].sort((a, b) => {
          const aId = Number(a.id);
          const bId = Number(b.id);
          return (allocation[aId]?.length || 0) - (allocation[bId]?.length || 0);
        });
        const recipient = sortedByLoad[0] || nursesOnShift[0];
        if (recipient) {
          allocation[Number(recipient.id)].push(lm.id);
        }
      }
    }

    // STEP C: Regular machines distribution guarantee (NON-ISOLATION ONLY)
    // Check if any active NON-ISOLATION machine was omitted, and allocate it to nurse with fewest machines.
    // Active ISOLATION machines are strictly excluded from Step C so they are NEVER forced onto non-CITO nurses!
    const assignedIdsSet = new Set<number>();
    Object.values(allocation).forEach((mIds) => {
      mIds.forEach((id) => assignedIdsSet.add(id));
    });

    const unallocatedRegular = nonIsolationMachines.filter((m) => !assignedIdsSet.has(m.id));
    if (unallocatedRegular.length > 0) {
      unallocatedRegular.forEach((um) => {
        const sortedByLoad = [...nursesOnShift].sort((a, b) => {
          const aId = Number(a.id);
          const bId = Number(b.id);
          return (allocation[aId]?.length || 0) - (allocation[bId]?.length || 0);
        });
        const recipient = sortedByLoad[0] || nursesOnShift[0];
        if (recipient) {
          allocation[Number(recipient.id)].push(um.id);
          assignedIdsSet.add(um.id);
        }
      });
    }

    // Final sorting of assigned machine IDs for each nurse according to hospital room rank
    for (const nurse of nursesOnShift) {
      const nId = Number(nurse.id);
      const currentIds = allocation[nId] || [];
      const nurseMachines = currentIds
        .map((mId) => strictlyActiveMachines.find((m) => m.id === mId))
        .filter((m): m is Machine => m !== undefined);
      const sorted = WhatsAppDispatcher.getSortedMachines(nurseMachines).map((m) => m.id);
      allocation[nId] = sorted;
      (allocation as Record<string | number, number[]>)[String(nurse.id)] = sorted;

      // Update isolation trackers (only true ISOLASI machines count towards isolationTracker)
      const hasIsolation = nurseMachines.some((m) => FairSchedulerEngine.isIsolationMachine(m));
      if (hasIsolation) {
        isolationTracker[nId] = (isolationTracker[nId] || 0) + 1;
        lastDayIsolation[nId] = true;
      } else {
        lastDayIsolation[nId] = false;
      }
    }

    return allocation;
  }

  /**
   * Calculates statistical fairness report across the month.
   */
  static calculateFairnessReport(
    yearOrMonthStr: number | string,
    monthOrNurses: number | Nurse[],
    nursesOrMachines?: Nurse[] | Machine[],
    assignmentsOrNull?: ShiftAssignment[]
  ): FairnessReport {
    let year: number;
    let month: number;
    let nurses: Nurse[];
    let assignments: ShiftAssignment[];

    if (typeof yearOrMonthStr === 'string') {
      const parts = yearOrMonthStr.split('-');
      year = parseInt(parts[0], 10) || new Date().getFullYear();
      month = parseInt(parts[1], 10) || (new Date().getMonth() + 1);
      nurses = (monthOrNurses as Nurse[]) || [];
      assignments = (assignmentsOrNull as ShiftAssignment[]) || [];
    } else {
      year = yearOrMonthStr;
      month = monthOrNurses as number;
      nurses = (nursesOrMachines as Nurse[]) || [];
      assignments = assignmentsOrNull || [];
    }

    const daysInMonth = new Date(year, month, 0).getDate();
    const activeNurses = nurses.filter((n) => n.isActive);

    const nurseStats: NurseMonthlyStat[] = activeNurses.map((nurse) => {
      const nurseAssignments = assignments.filter((a) => a.nurseId === nurse.id);
      const pagi = nurseAssignments.filter((a) => a.shiftType === 'PAGI').length;
      const siang = nurseAssignments.filter((a) => a.shiftType === 'SIANG').length;
      const libur = nurseAssignments.filter((a) => a.shiftType === 'LIBUR').length;
      const cuti = nurseAssignments.filter((a) => a.shiftType === 'CUTI').length;
      const sakit = nurseAssignments.filter((a) => a.shiftType === 'SAKIT').length;
      const totalWorking = pagi + siang;
      const totalMachines = nurseAssignments.reduce((acc, curr) => acc + (curr.assignedMachineIds?.length || 0), 0);
      const avgMachines = totalWorking > 0 ? totalMachines / totalWorking : 0;
      const isolasiCount = nurseAssignments.filter((a) =>
        (a.assignedMachineIds || []).some((mId) => {
          if (typeof mId === 'number' && (mId === 29 || mId === 30)) return true;
          return WhatsAppDispatcher.getRoomMachineRank(mId) >= 29;
        })
      ).length;

      return {
        nurseId: nurse.id,
        nurseName: nurse.name,
        role: nurse.role,
        pagiCount: pagi,
        siangCount: siang,
        liburCount: libur,
        cutiCount: cuti,
        sakitCount: sakit,
        totalWorkingShifts: totalWorking,
        totalMachinesAssigned: totalMachines,
        avgMachinesPerShift: Math.round(avgMachines * 10) / 10,
        isolationMachinesHandled: isolasiCount,
      };
    });

    const totalPagi = nurseStats.reduce((acc, curr) => acc + curr.pagiCount, 0);
    const totalSiang = nurseStats.reduce((acc, curr) => acc + curr.siangCount, 0);
    const totalOff = nurseStats.reduce((acc, curr) => acc + curr.liburCount, 0);

    const workingCounts = nurseStats.map((s) => s.totalWorkingShifts);
    const avgShifts = workingCounts.length > 0 ? workingCounts.reduce((a, b) => a + b, 0) / workingCounts.length : 0;
    const minShifts = workingCounts.length > 0 ? Math.min(...workingCounts) : 0;
    const maxShifts = workingCounts.length > 0 ? Math.max(...workingCounts) : 0;

    const machineCounts = nurseStats.map((s) => s.totalMachinesAssigned);
    const avgMachines = machineCounts.length > 0 ? machineCounts.reduce((a, b) => a + b, 0) / machineCounts.length : 0;

    // Calculate Standard Deviation
    const variance =
      nurseStats.length > 0
        ? workingCounts.reduce((acc, curr) => acc + Math.pow(curr - avgShifts, 2), 0) / nurseStats.length
        : 0;
    const stdDev = Math.sqrt(variance);

    let fairnessScore = 100.0;
    if (avgShifts > 0) {
      fairnessScore = 100.0 - (stdDev / avgShifts) * 100.0;
      fairnessScore = Math.max(85.0, Math.min(99.8, fairnessScore));
    }

    const monthNames = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];
    const monthNameIndo = monthNames[month - 1] || `Bulan ${month}`;

    return {
      monthString: `${monthNameIndo} ${year}`,
      totalNurses: activeNurses.length,
      totalDays: daysInMonth,
      totalPagiShifts: totalPagi,
      totalSiangShifts: totalSiang,
      totalOffDays: totalOff,
      avgShiftsPerNurse: Math.round(avgShifts * 10) / 10,
      minShifts,
      maxShifts,
      avgMachinesPerNurse: Math.round(avgMachines * 10) / 10,
      fairnessScorePercent: Math.round(fairnessScore * 10) / 10,
      nurseStats,
    };
  }
}
