import { UserAccount, ShiftSchedule, HDMachine, MachineAssignment, SpecialTask, MachineZoneConfig, DEFAULT_ZONES, AppSettings } from '../types';
import { INITIAL_SETTINGS, INITIAL_EMPLOYEES, INITIAL_MACHINES, INITIAL_SPECIAL_TASKS, getInitialSchedules, getInitialMachineAssignments, HOSPITAL_LAYOUT_40_MACHINES } from '../data/initialData';
import { autoAssignMachinesForShift, KNOWN_NURSE_NICKNAMES, NAME_TO_NICKNAME, getMachineSortOrder } from './scheduler';

const KEYS = {
  CURRENT_USER: 'hd_shift_current_user',
  EMPLOYEES: 'hd_shift_employees',
  SCHEDULES: 'hd_shift_schedules',
  MACHINES: 'hd_shift_machines',
  MACHINE_ASSIGNMENTS: 'hd_shift_machine_assignments',
  SPECIAL_TASKS: 'hd_shift_special_tasks',
  ZONES: 'hd_shift_machine_zones',
  DATA_VERSION: 'hd_system_data_version_v9_official_nips_roles',
};

// Ensure migration to RS Happy Land team and WhatsApp summary ready dataset
if (typeof window !== 'undefined') {
  try {
    const version = localStorage.getItem(KEYS.DATA_VERSION);
    if (!version || version !== 'v9_official_nips_roles') {
      localStorage.setItem(KEYS.EMPLOYEES, JSON.stringify(INITIAL_EMPLOYEES));
      localStorage.setItem(KEYS.MACHINES, JSON.stringify(INITIAL_MACHINES));
      localStorage.setItem(KEYS.ZONES, JSON.stringify(DEFAULT_ZONES));
      localStorage.setItem(KEYS.SCHEDULES, JSON.stringify(getInitialSchedules()));
      localStorage.setItem(KEYS.MACHINE_ASSIGNMENTS, JSON.stringify(getInitialMachineAssignments()));
      localStorage.setItem(KEYS.SPECIAL_TASKS, JSON.stringify(INITIAL_SPECIAL_TASKS));
      localStorage.setItem('hd_shift_settings', JSON.stringify(INITIAL_SETTINGS));
      
      const adminUser = INITIAL_EMPLOYEES.find((e) => e.role === 'admin') || INITIAL_EMPLOYEES[0];
      if (adminUser && !localStorage.getItem(KEYS.CURRENT_USER)) {
        localStorage.setItem(KEYS.CURRENT_USER, JSON.stringify(adminUser));
      }

      localStorage.setItem(KEYS.DATA_VERSION, 'v9_official_nips_roles');
    }
  } catch (e) {
    console.error(e);
  }
}

export function isInvalidNurseAccount(emp: any): boolean {
  if (!emp) return true;
  const name = String(emp.name || '').trim();
  // Name is empty or only dashes or symbols or length < 2
  if (!name || name === '-' || name === '--' || name === '---' || name.replace(/[^a-zA-Z0-9]/g, '').length < 2) {
    return true;
  }
  const idStr = String(emp.id || '');
  let usernameStr = String(emp.username || '').trim();
  if (usernameStr.startsWith('@')) {
    usernameStr = usernameStr.substring(1);
  }
  const nipStr = String(emp.nip || '');

  // Known blacklisted legacy test dummy ID
  if (idStr === 'emp-karu') return true;

  // Specific timestamps mentioned in sync issues
  if (idStr.includes('1790191588620') || idStr.includes('1790218743659')) return true;
  if (usernameStr.includes('1790191588620') || usernameStr.includes('1790218743659')) return true;
  if (nipStr.includes('1790191588620') || nipStr.includes('1790218743659')) return true;

  // Generalized pattern: dummy nurse account with timestamp username or ID (e.g. nurse1790218743659)
  if (/^nurse\d{10,}$/i.test(usernameStr) || /^nurse\d{10,}$/i.test(idStr)) {
    if (name === '-' || name === '--' || name.toLowerCase().startsWith('nurse') || name.replace(/[^a-zA-Z0-9]/g, '').length < 3) {
      return true;
    }
  }

  return false;
}

export const storage = {
  getCurrentUser(): UserAccount | null {
    try {
      const data = localStorage.getItem(KEYS.CURRENT_USER);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  },

  setCurrentUser(user: UserAccount | null) {
    if (user) {
      localStorage.setItem(KEYS.CURRENT_USER, JSON.stringify(user));
    } else {
      localStorage.removeItem(KEYS.CURRENT_USER);
    }
    window.dispatchEvent(new Event('hd_auth_changed'));
  },

  getEmployees(): UserAccount[] {
    try {
      const data = localStorage.getItem(KEYS.EMPLOYEES);
      if (data) {
        const parsed: UserAccount[] = JSON.parse(data);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const seenIds = new Set<string>();
          let uniqueParsed: UserAccount[] = [];
          for (const item of parsed) {
            if (item && item.id && !isInvalidNurseAccount(item) && !seenIds.has(item.id)) {
              seenIds.add(item.id);
              uniqueParsed.push(item);
            }
          }

          // Ensure baseline admin is present
          const hasAdmin = uniqueParsed.some((e) => e.role === 'admin');
          if (!hasAdmin) {
            const admin = INITIAL_EMPLOYEES.find((e) => e.role === 'admin');
            if (admin) uniqueParsed.unshift(admin);
          }

          // Deduplicate and retain user customizations without overwriting role or specialization
          const finalSeen = new Set<string>();
          const dedupedList: UserAccount[] = [];
          for (const item of uniqueParsed) {
            if (item && item.id && !finalSeen.has(item.id)) {
              finalSeen.add(item.id);
              // Backfill only missing fields if missing; NEVER overwrite role, specialization, or name
              const matchInit = INITIAL_EMPLOYEES.find(
                (ie) => ie.id === item.id || ie.name.toUpperCase() === item.name.toUpperCase()
              );
              if (matchInit) {
                if (!item.gender && matchInit.gender) item.gender = matchInit.gender;
                if (!item.nip && matchInit.nip) item.nip = matchInit.nip;
                if (!item.phone && matchInit.phone) item.phone = matchInit.phone;
              }
              dedupedList.push(item);
            }
          }
          uniqueParsed = dedupedList;

          if (uniqueParsed.length !== parsed.length) {
            localStorage.setItem(KEYS.EMPLOYEES, JSON.stringify(uniqueParsed));
          }

          return uniqueParsed.map((emp) => {
            const nick = emp.nickname || (emp.name ? NAME_TO_NICKNAME[emp.name.toUpperCase()] : undefined);
            const result: UserAccount = { ...emp };
            if (nick) {
              result.nickname = nick;
            } else {
              delete result.nickname;
            }
            return result;
          });
        }
      }
    } catch (e) {
      console.error(e);
    }
    // initialize
    this.saveEmployees(INITIAL_EMPLOYEES);
    return INITIAL_EMPLOYEES;
  },

  saveEmployees(employees: UserAccount[]) {
    const seenIds = new Set<string>();
    const uniqueEmployees: UserAccount[] = [];
    for (const emp of employees) {
      if (emp && emp.id && !isInvalidNurseAccount(emp) && !seenIds.has(emp.id)) {
        seenIds.add(emp.id);
        uniqueEmployees.push(emp);
      }
    }
    localStorage.setItem(KEYS.EMPLOYEES, JSON.stringify(uniqueEmployees));
    window.dispatchEvent(new Event('hd_data_updated'));
  },

  deleteEmployee(employeeId: string) {
    const currentEmployees = this.getEmployees();
    const updatedEmployees = currentEmployees.filter((e) => e.id !== employeeId);

    const currentSchedules = this.getSchedules();
    const updatedSchedules = currentSchedules.filter((s) => s.employeeId !== employeeId);

    const currentAssignments = this.getMachineAssignments();
    const updatedAssignments = currentAssignments.map((a) => {
      if (a.nurseId === employeeId) {
        const copy = { ...a };
        delete copy.nurseId;
        return copy;
      }
      return a;
    });

    const currentTasks = this.getSpecialTasks();
    const updatedTasks = currentTasks.filter((t) => t.assignedToId !== employeeId);

    const currentUser = this.getCurrentUser();
    let updatedUser = currentUser;
    if (currentUser && currentUser.id === employeeId) {
      const fallbackUser = updatedEmployees.find((e) => e.role === 'admin') || updatedEmployees[0];
      if (fallbackUser) {
        this.setCurrentUser(fallbackUser);
        updatedUser = fallbackUser;
      }
    }

    localStorage.setItem(KEYS.EMPLOYEES, JSON.stringify(updatedEmployees));
    localStorage.setItem(KEYS.SCHEDULES, JSON.stringify(updatedSchedules));
    localStorage.setItem(KEYS.MACHINE_ASSIGNMENTS, JSON.stringify(updatedAssignments));
    localStorage.setItem(KEYS.SPECIAL_TASKS, JSON.stringify(updatedTasks));

    window.dispatchEvent(new Event('hd_data_updated'));

    return {
      employees: updatedEmployees,
      schedules: updatedSchedules,
      assignments: updatedAssignments,
      tasks: updatedTasks,
      currentUser: updatedUser,
    };
  },

  getZones(): MachineZoneConfig[] {
    try {
      const data = localStorage.getItem(KEYS.ZONES);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const legacyZoneNameMap: Record<string, string> = {
            'Reguler A': 'Zona A (Reguler)',
            'Reguler B': 'Zona B (Reguler)',
            'Zona B Depan (Reguler)': 'Zona B (Reguler)',
            'Zona B Belakang (Reguler)': 'Zona B (Reguler)',
            'Zona C Depan (Reguler)': 'Zona C (Reguler)',
            'Zona C Belakang (Reguler)': 'Zona C (Reguler)',
            'Isolasi HBsAg(+)': 'Zona Isolasi',
            'Isolasi HCV(+)': 'Zona Isolasi',
            'VIP / Khusus': 'Zona A (Reguler)',
          };

          // Deduplicate by normalized name and track used IDs
          const seenNames = new Set<string>();
          const deduped: MachineZoneConfig[] = [];

          for (const z of parsed) {
            const normalizedName = legacyZoneNameMap[z.name] || z.name;
            if (!seenNames.has(normalizedName)) {
              seenNames.add(normalizedName);
              deduped.push({
                ...z,
                name: normalizedName,
              });
            }
          }

          // Add any missing default zones (checked by name)
          for (const dz of DEFAULT_ZONES) {
            if (!seenNames.has(dz.name)) {
              seenNames.add(dz.name);
              deduped.push(dz);
            }
          }

          // Ensure all IDs are unique and orders are clean
          const seenIds = new Set<string>();
          const finalized: MachineZoneConfig[] = deduped
            .sort((a, b) => a.order - b.order)
            .map((z, idx) => {
              let uniqueId = z.id;
              if (seenIds.has(uniqueId) || !uniqueId) {
                uniqueId = `zone-${z.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${idx + 1}`;
              }
              seenIds.add(uniqueId);
              return {
                ...z,
                id: uniqueId,
                order: idx + 1,
              };
            });

          // Hapus Bay/Area yang tidak ada mesinnya
          const currentMachines = this.getMachines();
          const activeOnly = finalized.filter((z) => {
            const zn = z.name.trim().toLowerCase();
            return currentMachines.some((m) => {
              const mz = (m.zone || '').trim().toLowerCase();
              const mb = (m.bay || '').trim().toLowerCase();
              return mz === zn || mb === zn || mz.includes(zn) || zn.includes(mz);
            });
          });
          const result = activeOnly.length > 0 ? activeOnly : DEFAULT_ZONES;

          this.saveZones(result);
          return result;
        }
      }
    } catch (e) {
      console.error(e);
    }
    this.saveZones(DEFAULT_ZONES);
    return DEFAULT_ZONES;
  },

  saveZones(zones: MachineZoneConfig[]) {
    const sorted = [...zones].sort((a, b) => a.order - b.order);
    localStorage.setItem(KEYS.ZONES, JSON.stringify(sorted));
    window.dispatchEvent(new Event('hd_data_updated'));
  },

  getSchedules(): ShiftSchedule[] {
    try {
      const data = localStorage.getItem(KEYS.SCHEDULES);
      if (data) {
        let parsed: ShiftSchedule[] = JSON.parse(data);
        if (Array.isArray(parsed)) {
          // Filter out purged nurse1790191588620
          parsed = parsed.filter(
            (s) => !s.employeeId?.includes('1790191588620') && !s.id?.includes('1790191588620')
          );
          // Pastikan jadwal dokter sebulan penuh (September & Oktober 2026) selalu lengkap terisi
          const initialDoctorSchedules = getInitialSchedules().filter(
            (s) => s.employeeId === 'emp-dr-reza' || s.employeeId === 'emp-dr-paramitha'
          );
          let addedDoctorSch = false;
          initialDoctorSchedules.forEach((initDocSch) => {
            const exists = parsed.some(
              (s) => s.employeeId === initDocSch.employeeId && s.date === initDocSch.date
            );
            if (!exists) {
              parsed.push(initDocSch);
              addedDoctorSch = true;
            }
          });
          if (addedDoctorSch) {
            localStorage.setItem(KEYS.SCHEDULES, JSON.stringify(parsed));
          }
          return parsed;
        }
      }
    } catch (e) {
      console.error(e);
    }
    const initial = getInitialSchedules();
    this.saveSchedules(initial);
    return initial;
  },

  saveSchedules(schedules: ShiftSchedule[]) {
    localStorage.setItem(KEYS.SCHEDULES, JSON.stringify(schedules));
    window.dispatchEvent(new Event('hd_data_updated'));
  },

  getMachines(): HDMachine[] {
    try {
      const data = localStorage.getItem(KEYS.MACHINES);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
          // Normalize any legacy zone names
          const legacyMap: Record<string, string> = {
            'Reguler A': 'Zona A (Reguler)',
            'Reguler B': 'Zona B (Reguler)',
            'Zona B Depan (Reguler)': 'Zona B (Reguler)',
            'Zona B Belakang (Reguler)': 'Zona B (Reguler)',
            'Zona C Depan (Reguler)': 'Zona C (Reguler)',
            'Zona C Belakang (Reguler)': 'Zona C (Reguler)',
            'Isolasi HBsAg(+)': 'Zona Isolasi',
            'Isolasi HCV(+)': 'Zona Isolasi',
            'VIP / Khusus': 'Zona A (Reguler)',
          };

          const seenIds = new Set<string>();
          const seenCodes = new Set<string>();
          const normalized: HDMachine[] = [];
          let hadC09 = false;

          for (const m of parsed) {
            if (!m || !m.id || !m.code) continue;
            const cleanCode = m.code.trim().toUpperCase().replace(/[\s-_]+/g, '');
            if (cleanCode === 'C09' || cleanCode === 'HDC09' || m.id === 'mach-c09') {
              hadC09 = true;
              continue;
            }
            if (seenIds.has(m.id) || seenCodes.has(cleanCode)) continue;
            seenIds.add(m.id);
            seenCodes.add(cleanCode);
            normalized.push({
              ...m,
              code: m.code.trim(),
              zone: legacyMap[m.zone] || m.zone,
            });
          }

          // Pastikan seluruh 40 mesin sesuai sketsa denah RS selalu ada
          let addedMissing = false;
          for (const sketchMach of HOSPITAL_LAYOUT_40_MACHINES) {
            const cleanCode = sketchMach.code.trim().toUpperCase().replace(/[\s-_]+/g, '');
            if (!seenCodes.has(cleanCode)) {
              seenCodes.add(cleanCode);
              seenIds.add(sketchMach.id);
              normalized.push(sketchMach);
              addedMissing = true;
            }
          }

          // Urutkan mesin sesuai urutan denah RS & alur klinis
          normalized.sort((a, b) => getMachineSortOrder(a.code) - getMachineSortOrder(b.code));

          if (hadC09 || addedMissing) {
            localStorage.setItem(KEYS.MACHINES, JSON.stringify(normalized));
            if (hadC09) {
              try {
                const assignsData = localStorage.getItem(KEYS.MACHINE_ASSIGNMENTS);
                if (assignsData) {
                  const parsedAssigns: MachineAssignment[] = JSON.parse(assignsData);
                  const filteredAssigns = parsedAssigns.filter((a) => a.machineId !== 'mach-c09');
                  localStorage.setItem(KEYS.MACHINE_ASSIGNMENTS, JSON.stringify(filteredAssigns));
                }
              } catch (err) {
                console.error(err);
              }
            }
          }

          return normalized;
        }
      }
    } catch (e) {
      console.error(e);
    }
    this.saveMachines(INITIAL_MACHINES);
    return INITIAL_MACHINES;
  },

  saveMachines(machines: HDMachine[]) {
    localStorage.setItem(KEYS.MACHINES, JSON.stringify(machines));
    window.dispatchEvent(new Event('hd_data_updated'));
  },

  getMachineAssignments(): MachineAssignment[] {
    try {
      const data = localStorage.getItem(KEYS.MACHINE_ASSIGNMENTS);
      if (data) {
        const parsed: MachineAssignment[] = JSON.parse(data);
        if (Array.isArray(parsed)) {
          return parsed.filter((a) => !a.nurseId?.includes('1790191588620') && !a.id?.includes('1790191588620'));
        }
      }
    } catch (e) {
      console.error(e);
    }
    // Generate initial today assignment for morning and afternoon
    const today = '2026-09-18';
    const employees = this.getEmployees();
    const machines = this.getMachines();
    const schedules = this.getSchedules();

    const pagiNurses = employees.filter((e) => {
      const sch = schedules.find((s) => s.employeeId === e.id && s.date === today);
      return e.role === 'perawat' && sch?.shift === 'pagi';
    });

    const siangNurses = employees.filter((e) => {
      const sch = schedules.find((s) => s.employeeId === e.id && s.date === today);
      return e.role === 'perawat' && sch?.shift === 'siang';
    });

    const morningAssign = autoAssignMachinesForShift(today, 'pagi', pagiNurses, machines);
    const afternoonAssign = autoAssignMachinesForShift(today, 'siang', siangNurses, machines);
    const initial = [...morningAssign, ...afternoonAssign];
    this.saveMachineAssignments(initial);
    return initial;
  },

  saveMachineAssignments(assignments: MachineAssignment[]) {
    localStorage.setItem(KEYS.MACHINE_ASSIGNMENTS, JSON.stringify(assignments));
    window.dispatchEvent(new Event('hd_data_updated'));
  },

  getSpecialTasks(): SpecialTask[] {
    try {
      const data = localStorage.getItem(KEYS.SPECIAL_TASKS);
      if (data !== null) {
        const parsed: SpecialTask[] = JSON.parse(data);
        if (Array.isArray(parsed)) {
          return parsed.filter((t) => !t.assignedToId?.includes('1790191588620') && !t.id?.includes('1790191588620'));
        }
      }
    } catch (e) {
      console.error(e);
    }
    const isExplicitlyCleared = localStorage.getItem('hd_shift_special_tasks_cleared');
    if (isExplicitlyCleared === 'true') {
      return [];
    }
    this.saveSpecialTasks(INITIAL_SPECIAL_TASKS);
    return INITIAL_SPECIAL_TASKS;
  },

  saveSpecialTasks(tasks: SpecialTask[]) {
    localStorage.setItem(KEYS.SPECIAL_TASKS, JSON.stringify(tasks));
    if (tasks.length === 0) {
      localStorage.setItem('hd_shift_special_tasks_cleared', 'true');
    } else {
      localStorage.removeItem('hd_shift_special_tasks_cleared');
    }
    window.dispatchEvent(new Event('hd_data_updated'));
  },

  getSettings(): AppSettings {
    try {
      const data = localStorage.getItem('hd_shift_settings');
      if (data) {
        const parsed = JSON.parse(data);
        const oldWebhooks = [
          'AKfycbzvsIRYkK_4dGOlCGbGWu1nYNaZ35GNyhWUxSrUXsJGuibyCGuSFtqalr34VhAyTFns',
          'AKfycbx5WVgIhXxBC06F5GRqjSq3DDIdDMCRfPkny_TAOH7bhh3Wvm1p0pniJcr3tG2mzuua'
        ];
        const oldSheets = [
          '1TDlfWi43WAPDojvRw00NsWaxT9sptTetZh64XL8U4Qg',
          '1CQW_hVZ3pTgqs6N6dolyntYZ8SaVM_SLmH56vu9Nljo'
        ];
        let modified = false;
        if (!parsed.googleSheetWebhookUrl || oldWebhooks.some(w => parsed.googleSheetWebhookUrl.includes(w))) {
          parsed.googleSheetWebhookUrl = INITIAL_SETTINGS.googleSheetWebhookUrl;
          modified = true;
        }
        if (!parsed.googleSpreadsheetIdOrUrl || oldSheets.some(s => parsed.googleSpreadsheetIdOrUrl.includes(s))) {
          parsed.googleSpreadsheetIdOrUrl = INITIAL_SETTINGS.googleSpreadsheetIdOrUrl;
          modified = true;
        }
        if (parsed.headNurseName === 'Kepala Ruang HD' || !parsed.headNurseName) {
          parsed.headNurseName = INITIAL_SETTINGS.headNurseName;
          modified = true;
        }
        if (modified) {
          localStorage.setItem('hd_shift_settings', JSON.stringify(parsed));
        }
        return parsed;
      }
    } catch (e) {
      console.error(e);
    }
    return INITIAL_SETTINGS;
  },

  saveSettings(settings: AppSettings) {
    localStorage.setItem('hd_shift_settings', JSON.stringify(settings));
    window.dispatchEvent(new Event('hd_data_updated'));
  },

  resetSchedules(monthPrefix?: string) {
    if (monthPrefix) {
      const current = this.getSchedules();
      const remaining = current.filter((s) => !s.date.startsWith(monthPrefix));
      this.saveSchedules(remaining);
    } else {
      this.saveSchedules([]);
    }
  },

  resetAllData() {
    localStorage.setItem(KEYS.EMPLOYEES, JSON.stringify(INITIAL_EMPLOYEES));
    localStorage.setItem(KEYS.SCHEDULES, JSON.stringify(getInitialSchedules()));
    localStorage.setItem(KEYS.MACHINES, JSON.stringify(INITIAL_MACHINES));
    localStorage.setItem(KEYS.ZONES, JSON.stringify(DEFAULT_ZONES));
    localStorage.setItem(KEYS.MACHINE_ASSIGNMENTS, JSON.stringify(getInitialMachineAssignments()));
    localStorage.setItem(KEYS.SPECIAL_TASKS, JSON.stringify(INITIAL_SPECIAL_TASKS));
    this.saveSettings(INITIAL_SETTINGS);
    const adminUser = INITIAL_EMPLOYEES.find((e) => e.role === 'admin') || INITIAL_EMPLOYEES[0];
    if (adminUser) {
      this.setCurrentUser(adminUser);
    }
    window.dispatchEvent(new Event('hd_data_updated'));
  },
};
