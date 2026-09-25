import React, { useState, useEffect } from 'react';
import { 
  UserAccount, 
  HDMachine, 
  MachineAssignment, 
  ShiftSchedule, 
  MachineStatus, 
  MachineZone,
  MachineZoneConfig,
  DEFAULT_ZONES,
  SpecialTask,
  SPECIAL_TASK_DEFINITIONS
} from '../types';
import { 
  autoAssignMachinesForShift, 
  getEffectiveShiftForEmployee, 
  getMachineSortOrder,
  sortNursesByShiftScheduleOrder,
  getTodayDateString
} from '../utils/scheduler';
import { storage } from '../utils/storage';
import { 
  Layers, 
  Plus, 
  Edit3, 
  Trash2, 
  Check, 
  X, 
  Wrench, 
  AlertTriangle, 
  User, 
  Calendar, 
  Clock, 
  RefreshCw, 
  ShieldCheck, 
  Sparkles,
  HeartPulse,
  Activity,
  Power,
  PowerOff,
  ShieldAlert,
  CheckCircle2,
  ArrowUp,
  ArrowDown,
  Settings,
  Sliders,
  Map,
  LayoutGrid,
  Shuffle,
  ChevronLeft,
  ChevronRight,
  Search,
} from 'lucide-react';
import { RoomFloorPlan } from './RoomFloorPlan';
import { HOSPITAL_LAYOUT_40_MACHINES } from '../data/initialData';

interface MachineViewProps {
  currentUser: UserAccount;
  employees: UserAccount[];
  machines: HDMachine[];
  zones?: MachineZoneConfig[];
  machineAssignments: MachineAssignment[];
  schedules: ShiftSchedule[];
  specialTasks: SpecialTask[];
  activeDate?: string;
  onDateChange?: (date: string) => void;
  onUpdateMachines: (machines: HDMachine[]) => void;
  onUpdateZones?: (zones: MachineZoneConfig[]) => void;
  onUpdateAssignments: (assignments: MachineAssignment[]) => void;
}

export const MachineView: React.FC<MachineViewProps> = ({
  currentUser,
  employees,
  machines,
  zones: propZones,
  machineAssignments,
  schedules,
  specialTasks,
  activeDate,
  onDateChange,
  onUpdateMachines,
  onUpdateZones,
  onUpdateAssignments,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'plotting' | 'inventory'>('plotting');

  // Zones setup - deduplicate by name, remove empty bays/areas without machines, and sort by order
  const rawZones: MachineZoneConfig[] = propZones && propZones.length > 0 ? propZones : storage.getZones();
  const seenZoneNames = new Set<string>();
  const sortedZones: MachineZoneConfig[] = rawZones
    .filter((z) => {
      if (!z || !z.name || seenZoneNames.has(z.name)) return false;
      seenZoneNames.add(z.name);
      // Hapus Bay/Area yang tidak ada mesinnya
      const zn = z.name.trim().toLowerCase();
      const count = machines.filter((m) => {
        const mz = (m.zone || '').trim().toLowerCase();
        const mb = (m.bay || '').trim().toLowerCase();
        return mz === zn || mb === zn || mz.includes(zn) || zn.includes(mz);
      }).length;
      return count > 0;
    })
    .sort((a, b) => a.order - b.order);

  // Otomatis sinkronkan penghapusan zona/bay tanpa mesin
  useEffect(() => {
    if (machines.length > 0 && rawZones.length > sortedZones.length) {
      storage.saveZones(sortedZones);
      if (onUpdateZones) onUpdateZones(sortedZones);
    }
  }, [machines.length, rawZones.length, sortedZones.length]);

  // Plotting filters (defaults to today's active date)
  const [selectedDate, setSelectedDate] = useState<string>(() => activeDate || getTodayDateString());
  const [selectedShift, setSelectedShift] = useState<'pagi' | 'siang'>(() => {
    const hour = new Date().getHours();
    return hour >= 13 ? 'siang' : 'pagi';
  });
  const [plottingViewMode, setPlottingViewMode] = useState<'floorplan' | 'list'>('floorplan');
  
  // Master Data inventory filtering and search
  const [inventoryZoneFilter, setInventoryZoneFilter] = useState<string>('all');
  const [inventorySearch, setInventorySearch] = useState<string>('');

  const sortedMasterMachines = React.useMemo(() => {
    return [...machines].sort((a, b) => getMachineSortOrder(a.code) - getMachineSortOrder(b.code));
  }, [machines]);

  const filteredMasterMachines = React.useMemo(() => {
    return sortedMasterMachines.filter((mach) => {
      if (inventoryZoneFilter !== 'all') {
        const filter = inventoryZoneFilter.toUpperCase();
        if (filter === 'ISOLASI') {
          if (!mach.zone?.toLowerCase().includes('isolasi') && !mach.code.startsWith('ISO')) {
            return false;
          }
        } else {
          const letter = filter.replace('AREA', '').trim();
          if (!mach.zone?.toUpperCase().includes(letter) && !mach.code.toUpperCase().startsWith(letter)) {
            return false;
          }
        }
      }
      if (inventorySearch.trim()) {
        const q = inventorySearch.toLowerCase();
        const codeMatch = mach.code.toLowerCase().includes(q);
        const brandMatch = mach.brand.toLowerCase().includes(q);
        const modelMatch = mach.model.toLowerCase().includes(q);
        const snMatch = (mach.serialNumber || '').toLowerCase().includes(q);
        const zoneMatch = (mach.zone || '').toLowerCase().includes(q);
        if (!codeMatch && !brandMatch && !modelMatch && !snMatch && !zoneMatch) {
          return false;
        }
      }
      return true;
    });
  }, [sortedMasterMachines, inventoryZoneFilter, inventorySearch]);

  const areaBreakdown = React.useMemo(() => {
    const counts: Record<string, number> = {
      'Area A': 0,
      'Area B': 0,
      'Area C': 0,
      'Area D': 0,
      'Area E': 0,
      'Area F': 0,
      'Ruang Isolasi': 0,
    };
    machines.forEach((m) => {
      const c = m.code.toUpperCase();
      const z = (m.zone || '').toUpperCase();
      if (c.startsWith('ISO') || z.includes('ISOLASI')) counts['Ruang Isolasi']++;
      else if (c.startsWith('A') || z.includes('AREA A')) counts['Area A']++;
      else if (c.startsWith('B') || z.includes('AREA B')) counts['Area B']++;
      else if (c.startsWith('C') || z.includes('AREA C')) counts['Area C']++;
      else if (c.startsWith('D') || z.includes('AREA D')) counts['Area D']++;
      else if (c.startsWith('E') || z.includes('AREA E')) counts['Area E']++;
      else if (c.startsWith('F') || z.includes('AREA F')) counts['Area F']++;
    });
    return counts;
  }, [machines]);

  React.useEffect(() => {
    if (activeDate && activeDate !== selectedDate) {
      setSelectedDate(activeDate);
    }
  }, [activeDate]);

  const updateDate = (newDate: string) => {
    setSelectedDate(newDate);
    onDateChange?.(newDate);
  };

  const handleSelectMachineFromPlan = (machine: HDMachine, assignment?: MachineAssignment) => {
    setEditingAssignment({
      machineId: machine.id,
      nurseId: assignment?.nurseId || '',
      isOff: assignment?.isOff || false,
      offReason: assignment?.offReason || '',
      patientName: assignment?.patientName || '',
      targetUF: assignment?.targetUF || '',
      dialyzerType: assignment?.dialyzerType || '',
      notes: assignment?.notes || '',
    });
  };

  const handleRegisterMachineFromPlan = (code: string) => {
    const isIso = code.startsWith('ISO');
    const isD = code.startsWith('D');
    const isE = code.startsWith('E');
    const isF = code.startsWith('F');
    const zoneName = isIso
      ? 'Zona Isolasi'
      : isD
      ? 'Area D'
      : isE
      ? 'Area E'
      : isF
      ? 'Area F'
      : `Zona ${code[0]} (Reguler)`;

    setEditingMachine(null);
    setMachineForm({
      code: code,
      brand: 'Fresenius Medical Care',
      model: '4008S Classic',
      zone: zoneName,
      status: 'siap',
      serialNumber: `FMC-${code.replace(/\s+/g, '')}`,
      lastMaintenance: '2026-09-18',
      notes: '',
    });
    setShowAddMachineModal(true);
  };

  const handleApplySketchLayout = () => {
    onUpdateMachines(HOSPITAL_LAYOUT_40_MACHINES);
    storage.saveMachines(HOSPITAL_LAYOUT_40_MACHINES);
    if (onUpdateZones) {
      onUpdateZones(DEFAULT_ZONES);
    }
    storage.saveZones(DEFAULT_ZONES);
    showToast('Berhasil memuat 40 mesin hemodialisa sesuai denah ruangan rumah sakit (Area A s/d F & Ruang Isolasi)!', 'success');
  };

  // Zone Management modal state
  const [showZoneConfigModal, setShowZoneConfigModal] = useState(false);
  const [editingZone, setEditingZone] = useState<MachineZoneConfig | null>(null);
  const [zoneFormData, setZoneFormData] = useState<{
    name: string;
    type: 'reguler' | 'isolasi';
    description: string;
  }>({
    name: '',
    type: 'reguler',
    description: '',
  });
  const [zoneFormError, setZoneFormError] = useState('');
  const [deleteZoneTarget, setDeleteZoneTarget] = useState<MachineZoneConfig | null>(null);
  const [deleteMachineTarget, setDeleteMachineTarget] = useState<HDMachine | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [randomPlotCount, setRandomPlotCount] = useState<number>(0);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Machine assignment edit modal
  const [editingAssignment, setEditingAssignment] = useState<{
    machineId: string;
    nurseId: string;
    isOff?: boolean;
    offReason?: string;
    patientName?: string;
    targetUF?: string;
    dialyzerType?: string;
    notes?: string;
  } | null>(null);

  // Machine inventory modal
  const [showAddMachineModal, setShowAddMachineModal] = useState(false);
  const [editingMachine, setEditingMachine] = useState<HDMachine | null>(null);
  const [turnOffModalData, setTurnOffModalData] = useState<{
    machine: HDMachine;
    reason: string;
  } | null>(null);
  const [machineForm, setMachineForm] = useState<Partial<HDMachine>>({
    code: '',
    brand: 'Fresenius Medical Care',
    model: '4008S Classic',
    zone: sortedZones[0]?.name || 'Zona A (Reguler)',
    status: 'siap',
    serialNumber: '',
    lastMaintenance: '2026-09-18',
    notes: '',
  });

  const isAdmin = currentUser.role === 'admin';
  const isKaru = currentUser.role === 'kepala_ruangan';
  const isPjShift = currentUser.role === 'pj_shift';
  const canManage = isAdmin || isKaru || isPjShift;

  // Active clinical nurses, PJ Shift & Kepala Ruangan (staf pelaksana tindakan HD & Karu)
  const activeClinicalNurses = employees.filter(
    (emp) =>
      (emp.role === 'perawat' ||
        emp.role === 'pj_shift' ||
        emp.role === 'kepala_ruangan') &&
      emp.status === 'aktif'
  );

  // Find nurses on duty for the selected date & shift from the schedule, sorted strictly:
  // 1. Kepala ruang, 2. PJ Shif (L), 3. PJ Shif (P), 4. Pelaksana (L), 5. Pelaksana (P)
  const nursesOnDuty = sortNursesByShiftScheduleOrder(
    activeClinicalNurses.filter((emp) => {
      const effectiveShift = getEffectiveShiftForEmployee(emp, selectedDate, schedules, employees);
      return effectiveShift === selectedShift;
    })
  );

  // Get machine assignments for the selected date & shift
  const currentShiftAssignments = machineAssignments.filter(
    (a) => a.date === selectedDate && a.shift === selectedShift
  );

  // Special tasks on this date and shift (to verify CITO / isolation priority)
  const specialTasksThisShift = specialTasks.filter(
    (t) => t.date === selectedDate && t.shift === selectedShift
  );

  // Find if any nurse on duty has CITO task
  const citoStaff = specialTasksThisShift.filter((t) => t.category === 'cito');
  const citoNurseIds = new Set(citoStaff.map((t) => t.assignedToId));

  // Toggle machine power status for this shift (Requirement 3)
  const handleToggleMachineShiftPower = (
    machineId: string, 
    turnOff: boolean, 
    reason: string = 'Tidak digunakan pada shift ini'
  ) => {
    const assignmentId = `${selectedDate}_${selectedShift}_${machineId}`;
    const existing = machineAssignments.find((a) => a.id === assignmentId);

    const updatedRecord: MachineAssignment = {
      id: assignmentId,
      date: selectedDate,
      shift: selectedShift,
      machineId,
      nurseId: turnOff ? undefined : existing?.nurseId,
      isOff: turnOff,
      offReason: turnOff ? reason : undefined,
      patientName: turnOff ? undefined : existing?.patientName,
      targetUF: turnOff ? undefined : existing?.targetUF,
      dialyzerType: turnOff ? undefined : existing?.dialyzerType,
      notes: turnOff ? `Mesin dinonaktifkan pada shift ${selectedShift}` : existing?.notes,
    };

    const others = machineAssignments.filter((a) => a.id !== assignmentId);
    onUpdateAssignments([...others, updatedRecord]);
  };

  // Toggle power for all machines in a specific area
  const handleToggleAreaShiftPower = (
    machineIds: string[],
    turnOff: boolean,
    areaName: string
  ) => {
    const updated = [...machineAssignments];
    const targetIdsSet = new Set(machineIds);

    const remaining = updated.filter(
      (a) => !(a.date === selectedDate && a.shift === selectedShift && targetIdsSet.has(a.machineId))
    );

    const newRecords: MachineAssignment[] = machineIds.map((machineId) => {
      const assignmentId = `${selectedDate}_${selectedShift}_${machineId}`;
      const existing = machineAssignments.find((a) => a.id === assignmentId);

      return {
        id: assignmentId,
        date: selectedDate,
        shift: selectedShift,
        machineId,
        nurseId: turnOff ? undefined : existing?.nurseId,
        isOff: turnOff,
        offReason: turnOff ? `Area ${areaName} dinonaktifkan pada shift ${selectedShift}` : undefined,
        patientName: turnOff ? undefined : existing?.patientName,
        targetUF: turnOff ? undefined : existing?.targetUF,
        dialyzerType: turnOff ? undefined : existing?.dialyzerType,
        notes: turnOff ? `Area ${areaName} dinonaktifkan pada shift ${selectedShift}` : existing?.notes,
      };
    });

    onUpdateAssignments([...remaining, ...newRecords]);
  };

  // Handle auto-balance machines among nurses on duty with fair random contiguous plotting
  const handleAutoBalanceMachines = () => {
    const specialTasksOnDuty = specialTasksThisShift.map((t) => ({
      nurseId: t.assignedToId,
      category: t.category,
    }));

    const newAssignments = autoAssignMachinesForShift(
      selectedDate,
      selectedShift,
      nursesOnDuty,
      machines,
      machineAssignments,
      specialTasksOnDuty,
      true // randomize = true
    );

    // Merge with other date/shift assignments
    const others = machineAssignments.filter(
      (a) => !(a.date === selectedDate && a.shift === selectedShift)
    );

    onUpdateAssignments([...others, ...newAssignments]);
    const nextCount = randomPlotCount + 1;
    setRandomPlotCount(nextCount);

    if (nextCount === 1) {
      showToast('Plotingan acak berhasil dibuat berurutan sesuai denah secara adil & merata!');
    } else {
      showToast(`Plotingan berhasil diacak kembali (#${nextCount}) secara adil & seimbang!`);
    }
  };

  // Handle save single machine assignment
  const handleSaveAssignment = () => {
    if (!editingAssignment) return;

    const assignmentId = `${selectedDate}_${selectedShift}_${editingAssignment.machineId}`;
    const newRecord: MachineAssignment = {
      id: assignmentId,
      date: selectedDate,
      shift: selectedShift,
      machineId: editingAssignment.machineId,
      nurseId: editingAssignment.isOff ? undefined : editingAssignment.nurseId || undefined,
      isOff: editingAssignment.isOff,
      offReason: editingAssignment.isOff ? editingAssignment.offReason || 'Tidak digunakan di shift ini' : undefined,
      patientName: editingAssignment.isOff ? undefined : editingAssignment.patientName || undefined,
      targetUF: editingAssignment.isOff ? undefined : editingAssignment.targetUF || '2.5 L',
      dialyzerType: editingAssignment.isOff ? undefined : editingAssignment.dialyzerType || 'Hi-Flux F7HPS',
      notes: editingAssignment.notes || undefined,
    };

    const others = machineAssignments.filter((a) => a.id !== assignmentId);
    onUpdateAssignments([...others, newRecord]);
    setEditingAssignment(null);
  };

  // Inventory Save
  const handleSaveMachineInventory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!machineForm.code || !machineForm.model) return;

    if (editingMachine) {
      // Update
      const updated = machines.map((m) =>
        m.id === editingMachine.id ? ({ ...m, ...machineForm } as HDMachine) : m
      );
      onUpdateMachines(updated);
      setEditingMachine(null);
      setShowAddMachineModal(false);
      showToast(`Mesin ${machineForm.code} berhasil diperbarui.`);
    } else {
      // Create
      const newMach: HDMachine = {
        id: `mach-${Date.now()}`,
        code: machineForm.code || `HD-${String(machines.length + 1).padStart(2, '0')}`,
        brand: machineForm.brand || 'Fresenius Medical Care',
        model: machineForm.model || '4008S',
        zone: (machineForm.zone as MachineZone) || 'Reguler A',
        status: (machineForm.status as MachineStatus) || 'siap',
        serialNumber: machineForm.serialNumber || `SN-${Date.now()}`,
        lastMaintenance: machineForm.lastMaintenance || '2026-09-18',
        notes: machineForm.notes || '',
      };
      onUpdateMachines([...machines, newMach]);
      setShowAddMachineModal(false);
      showToast(`Mesin ${newMach.code} berhasil ditambahkan.`);
    }

    setMachineForm({
      code: '',
      brand: 'Fresenius Medical Care',
      model: '4008S Classic',
      zone: sortedZones[0]?.name || 'Zona A (Reguler)',
      status: 'siap',
      serialNumber: '',
      lastMaintenance: '2026-09-18',
      notes: '',
    });
  };

  // Inventory Delete (Trigger custom modal)
  const handleDeleteMachine = (mach: HDMachine) => {
    setDeleteMachineTarget(mach);
  };

  const handleConfirmDeleteMachine = () => {
    if (!deleteMachineTarget) return;
    const targetId = deleteMachineTarget.id;
    const targetCode = deleteMachineTarget.code;

    // Remove from machines
    const updated = machines.filter((m) => m.id !== targetId);
    onUpdateMachines(updated);

    // Also remove associated assignments so they don't linger
    const updatedAssignments = machineAssignments.filter(
      (a) => a.machineId !== targetId
    );
    onUpdateAssignments(updatedAssignments);

    // Close any open modals targeting this machine
    if (editingAssignment && editingAssignment.machineId === targetId) {
      setEditingAssignment(null);
    }
    if (editingMachine && editingMachine.id === targetId) {
      setShowAddMachineModal(false);
      setEditingMachine(null);
    }

    showToast(`Mesin ${targetCode} (${deleteMachineTarget.brand}) berhasil dihapus dari master data.`);
    setDeleteMachineTarget(null);
  };

  // Toggle machine maintenance
  const handleToggleMaintenance = (machine: HDMachine) => {
    const nextStatus: MachineStatus =
      machine.status === 'siap' ? 'maintenance' : 'siap';
    const updated = machines.map((m) =>
      m.id === machine.id ? { ...m, status: nextStatus } : m
    );
    onUpdateMachines(updated);
  };

  // Zone Management Functions
  const handleSaveZone = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = zoneFormData.name.trim();
    if (!trimmedName) {
      setZoneFormError('Nama zona/ruangan tidak boleh kosong.');
      return;
    }

    // Check duplicate name
    const isDuplicate = sortedZones.some(
      (z) => z.name.toLowerCase() === trimmedName.toLowerCase() && z.id !== editingZone?.id
    );
    if (isDuplicate) {
      setZoneFormError('Nama zona/ruangan sudah ada. Silakan gunakan nama lain.');
      return;
    }

    let updatedZones: MachineZoneConfig[];
    if (editingZone) {
      const oldName = editingZone.name;
      updatedZones = sortedZones.map((z) => {
        if (z.id === editingZone.id) {
          return {
            ...z,
            name: trimmedName,
            type: zoneFormData.type,
            description: zoneFormData.description.trim() || undefined,
          };
        }
        return z;
      });

      // If zone name changed, also update machines assigned to old name
      if (oldName !== trimmedName) {
        const updatedMachines = machines.map((m) =>
          m.zone === oldName ? { ...m, zone: trimmedName } : m
        );
        onUpdateMachines(updatedMachines);
      }
      showToast(`Zona "${trimmedName}" berhasil diperbarui.`);
    } else {
      const newZone: MachineZoneConfig = {
        id: `zone-${Date.now()}`,
        name: trimmedName,
        order: sortedZones.length + 1,
        type: zoneFormData.type,
        description: zoneFormData.description.trim() || undefined,
      };
      updatedZones = [...sortedZones, newZone];
      showToast(`Zona baru "${trimmedName}" berhasil ditambahkan.`);
    }

    storage.saveZones(updatedZones);
    if (onUpdateZones) onUpdateZones(updatedZones);

    setShowZoneConfigModal(false);
    setEditingZone(null);
    setZoneFormData({ name: '', type: 'reguler', description: '' });
    setZoneFormError('');
  };

  const handleDeleteZoneConfirm = (zoneToDelete: MachineZoneConfig) => {
    const remainingZones = sortedZones
      .filter((z) => z.id !== zoneToDelete.id)
      .map((z, idx) => ({ ...z, order: idx + 1 }));

    // If machines are in this zone, reassign them to the first remaining zone or default
    const fallbackZone = remainingZones[0]?.name || 'Zona A (Reguler)';
    const updatedMachines = machines.map((m) =>
      m.zone === zoneToDelete.name ? { ...m, zone: fallbackZone } : m
    );

    storage.saveZones(remainingZones);
    if (onUpdateZones) onUpdateZones(remainingZones);
    onUpdateMachines(updatedMachines);

    showToast(`Zona "${zoneToDelete.name}" dihapus. Mesin otomatis dialihkan ke "${fallbackZone}".`);
    setDeleteZoneTarget(null);
  };

  const handleMoveZone = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === sortedZones.length - 1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const reordered = [...sortedZones];
    const temp = reordered[index];
    reordered[index] = reordered[targetIndex];
    reordered[targetIndex] = temp;

    const updated = reordered.map((z, idx) => ({ ...z, order: idx + 1 }));
    storage.saveZones(updated);
    if (onUpdateZones) onUpdateZones(updated);
    showToast(`Urutan "${temp.name}" berhasil diubah.`);
  };

  const handleResetDefaultZones = () => {
    storage.saveZones(DEFAULT_ZONES);
    if (onUpdateZones) onUpdateZones(DEFAULT_ZONES);
    showToast('Zona berhasil dikembalikan ke 7 zona standar rumah sakit.');
  };

  return (
    <div className="space-y-5">
      {/* Top Header */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-lg font-bold text-slate-900">
              Pengelolaan &amp; Pembagian Mesin Hemodialisa
            </h2>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-teal-50 text-teal-700 font-semibold border border-teal-200">
              {machines.length} Total Mesin HD
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Plotting perawat per shift, fitur <strong>Matikan Mesin per Shift</strong>, dan <strong>Alokasi Mesin Isolasi untuk Tugas CITO</strong>.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl self-start sm:self-auto border border-slate-200">
          <button
            onClick={() => setActiveSubTab('plotting')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 ${
              activeSubTab === 'plotting'
                ? 'bg-white text-teal-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Plotting &amp; Kontrol Shift</span>
          </button>
          <button
            onClick={() => setActiveSubTab('inventory')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 ${
              activeSubTab === 'inventory'
                ? 'bg-white text-teal-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Wrench className="w-3.5 h-3.5" />
            <span>Master Data Mesin HD</span>
          </button>
        </div>
      </div>

      {activeSubTab === 'plotting' ? (
        <div className="space-y-4">
          {/* Date & Shift Filter Bar */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-col lg:flex-row lg:items-end justify-between gap-4">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Pilih Tanggal:
                </label>
                <div className="flex items-center space-x-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 text-xs font-semibold h-[38px]">
                  <button
                    onClick={() => {
                      const d = new Date(selectedDate + 'T00:00:00');
                      d.setDate(d.getDate() - 1);
                      const yyyy = d.getFullYear();
                      const mm = String(d.getMonth() + 1).padStart(2, '0');
                      const dd = String(d.getDate()).padStart(2, '0');
                      updateDate(`${yyyy}-${mm}-${dd}`);
                    }}
                    className="p-1 hover:bg-slate-200 rounded-lg text-slate-600 transition cursor-pointer"
                    title="Hari Sebelumnya"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <Calendar className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => updateDate(e.target.value)}
                    className="bg-transparent border-none text-slate-800 focus:outline-hidden text-xs font-bold cursor-pointer"
                  />
                  <button
                    onClick={() => {
                      const d = new Date(selectedDate + 'T00:00:00');
                      d.setDate(d.getDate() + 1);
                      const yyyy = d.getFullYear();
                      const mm = String(d.getMonth() + 1).padStart(2, '0');
                      const dd = String(d.getDate()).padStart(2, '0');
                      updateDate(`${yyyy}-${mm}-${dd}`);
                    }}
                    className="p-1 hover:bg-slate-200 rounded-lg text-slate-600 transition cursor-pointer"
                    title="Hari Berikutnya"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div>
                <button
                  onClick={() => updateDate(getTodayDateString())}
                  className="px-3 h-[38px] bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition flex items-center justify-center cursor-pointer active:scale-95"
                  title="Tampilkan Hari Ini"
                >
                  Hari Ini
                </button>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Pilih Shift Kerja:
                </label>
                <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 h-[38px]">
                  <button
                    onClick={() => setSelectedShift('pagi')}
                    className={`px-3 h-full rounded-lg text-xs font-bold transition flex items-center justify-center cursor-pointer ${
                      selectedShift === 'pagi'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Shift Pagi (07:00 - 14:00)
                  </button>
                  <button
                    onClick={() => setSelectedShift('siang')}
                    className={`px-3 h-full rounded-lg text-xs font-bold transition flex items-center justify-center cursor-pointer ${
                      selectedShift === 'siang'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Shift Siang (13:30 - 20:30)
                  </button>
                </div>
              </div>
            </div>

            {/* Nurses On-Duty & Auto Balance */}
            <div className="flex items-center justify-end w-full lg:w-auto">
              {canManage && (
                <button
                  onClick={handleAutoBalanceMachines}
                  className="w-full lg:w-auto px-4 h-[38px] bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center justify-center space-x-1.5 transition active:scale-95 cursor-pointer"
                  title="Klik 1 kali untuk melakukan ploting acak berurutan sesuai denah secara adil & merata. Klik ulang untuk mengacak kembali secara adil."
                >
                  <Shuffle className="w-3.5 h-3.5 animate-pulse shrink-0" />
                  <span>Plotting Berurutan Sesuai Denah (Acak Adil)</span>
                </button>
              )}
            </div>
          </div>

          {/* Plotting View Mode Selector: Denah Ruangan (Floor Plan) vs Daftar Zona */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white rounded-2xl p-3 sm:p-3.5 border border-slate-200 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:space-x-2">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Tampilan Pembagian:</span>
              <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => setPlottingViewMode('floorplan')}
                  className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer min-h-[32px] ${
                    plottingViewMode === 'floorplan'
                      ? 'bg-teal-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Map className="w-3.5 h-3.5 shrink-0" />
                  <span>Denah Ruangan (Sketsa RS)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPlottingViewMode('list')}
                  className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer min-h-[32px] ${
                    plottingViewMode === 'list'
                      ? 'bg-teal-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5 shrink-0" />
                  <span>Daftar Zona</span>
                </button>
              </div>
            </div>

            {canManage && (
              <button
                type="button"
                onClick={handleApplySketchLayout}
                className="w-full sm:w-auto px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5 min-h-[34px] cursor-pointer"
                title="Sinkronkan atau muat 40 mesin sesuai denah RS (Area A s/d F & Ruang Isolasi)"
              >
                <RefreshCw className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                <span>Sinkronkan 40 Mesin Denah</span>
              </button>
            )}
          </div>

          {plottingViewMode === 'floorplan' ? (
            <RoomFloorPlan
              machines={machines}
              assignments={machineAssignments}
              employees={employees}
              selectedDate={selectedDate}
              selectedShift={selectedShift}
              specialTasks={specialTasks}
              canManage={canManage}
              onSelectMachine={handleSelectMachineFromPlan}
              onRegisterMachine={handleRegisterMachineFromPlan}
              onApplySketchLayout={handleApplySketchLayout}
              onAutoAssign={handleAutoBalanceMachines}
              onToggleAreaPower={handleToggleAreaShiftPower}
            />
          ) : (
            /* Machine Grid by Zones */
            machines.length === 0 ? (
              <div className="bg-white rounded-2xl p-12 border border-slate-200 text-center">
                <Layers className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <h4 className="text-sm font-bold text-slate-700">Belum ada mesin hemodialisa terdaftar</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  Buka tab <strong>Master Data Mesin HD</strong> untuk menambahkan mesin hemodialisa unit rumah sakit.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
              {(() => {
                // Collect ordered list of zone names without duplicates
                const rawZoneNames: string[] = sortedZones.map((z) => z.name);
                // Also include any machine whose zone is not in sortedZones (fallback)
                machines.forEach((m) => {
                  if (m.zone && !rawZoneNames.includes(m.zone)) {
                    rawZoneNames.push(m.zone);
                  }
                });
                const renderedZoneNames = Array.from(new Set(rawZoneNames));

                return renderedZoneNames.map((zoneName) => {
                  const zoneConfig = sortedZones.find((z) => z.name === zoneName);
                  const zoneMachines = machines
                    .filter((m) => m.zone === zoneName)
                    .sort((a, b) => getMachineSortOrder(a.code) - getMachineSortOrder(b.code));
                  if (zoneMachines.length === 0) return null;

                  const isIsolation = zoneConfig?.type === 'isolasi' || zoneName.toLowerCase().includes('isolasi');

                  return (
                    <div
                      key={`zone-card-${zoneConfig?.id || zoneName}`}
                      className={`rounded-2xl p-5 border ${
                        isIsolation
                          ? 'bg-amber-50/40 border-amber-200'
                          : 'bg-white border-slate-200'
                      } shadow-xs`}
                    >
                      <div className="flex items-center justify-between pb-3 border-b border-slate-200/60 mb-4">
                        <div className="flex items-center space-x-2">
                          <div
                            className={`w-3 h-3 rounded-full ${
                              isIsolation ? 'bg-amber-500' : 'bg-teal-500'
                            }`}
                          ></div>
                          <h3 className="font-bold text-slate-900 text-sm">{zoneName}</h3>
                          {isIsolation && (
                            <span className="text-[10px] uppercase tracking-wider font-extrabold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1">
                              <ShieldAlert className="w-3 h-3 text-amber-700" />
                              <span>Kewaspadaan Khusus • Isolasi (Target CITO)</span>
                            </span>
                          )}
                          {zoneConfig?.description && (
                            <span className="text-[11px] text-slate-500 hidden sm:inline">
                              • {zoneConfig.description}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-slate-500">
                          {zoneMachines.length} Mesin
                        </span>
                      </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {zoneMachines.map((machine) => {
                        const assignment = currentShiftAssignments.find(
                          (a) => a.machineId === machine.id
                        );
                        const assignedNurse = employees.find(
                          (e) => e.id === assignment?.nurseId
                        );

                        const isTurnedOffThisShift = !!assignment?.isOff;
                        const isHardwareReady = machine.status === 'siap';
                        const isCitoNurseAssigned = assignedNurse ? citoNurseIds.has(assignedNurse.id) : false;

                        return (
                          <div
                            key={machine.id}
                            className={`rounded-xl p-4 border transition flex flex-col justify-between ${
                              isTurnedOffThisShift
                                ? 'bg-slate-100/90 border-slate-300 opacity-90'
                                : !isHardwareReady
                                ? 'bg-rose-50/60 border-rose-200'
                                : assignedNurse
                                ? isIsolation && isCitoNurseAssigned
                                  ? 'bg-rose-50/30 border-rose-300 ring-2 ring-rose-500/20'
                                  : 'bg-slate-50 border-teal-200'
                                : 'bg-white border-slate-200'
                            }`}
                          >
                            <div>
                              {/* Top Card Info */}
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <div className="flex items-center space-x-2">
                                    <span className="font-extrabold text-slate-900 text-base">
                                      {machine.code}
                                    </span>
                                    {isIsolation && (
                                      <span className="text-[9px] font-extrabold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-300">
                                        ISOLASI
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[11px] text-slate-500">
                                    {machine.brand} • {machine.model}
                                  </div>
                                  {canManage && (
                                    <div className="flex items-center gap-2 mt-1.5">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditingMachine(machine);
                                          setMachineForm({ ...machine });
                                          setShowAddMachineModal(true);
                                        }}
                                        className="text-[10px] text-slate-500 hover:text-teal-700 font-medium flex items-center gap-0.5 cursor-pointer"
                                        title="Edit data mesin ini"
                                      >
                                        <Wrench className="w-3 h-3" />
                                        <span>Edit</span>
                                      </button>
                                      <span className="text-slate-300">•</span>
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteMachine(machine)}
                                        className="text-[10px] text-rose-500 hover:text-rose-700 font-medium flex items-center gap-0.5 cursor-pointer"
                                        title="Hapus mesin ini dari master data"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                        <span>Hapus</span>
                                      </button>
                                    </div>
                                  )}
                                </div>

                                <div className="flex flex-col items-end gap-1">
                                  {/* Hardware condition */}
                                  <span
                                    className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase ${
                                      machine.status === 'siap'
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : 'bg-rose-100 text-rose-800'
                                    }`}
                                  >
                                    {machine.status === 'siap' ? 'Kondisi Alat Siap' : 'Maintenance'}
                                  </span>

                                  {/* Shift Power Status (Requirement 3) */}
                                  {isTurnedOffThisShift ? (
                                    <span className="text-[9px] px-2 py-0.5 rounded-full font-bold bg-slate-700 text-white flex items-center gap-1 shadow-2xs">
                                      <PowerOff className="w-2.5 h-2.5 text-rose-400" />
                                      <span>MATI DI SHIFT INI</span>
                                    </span>
                                  ) : (
                                    <span className="text-[9px] px-2 py-0.5 rounded-full font-bold bg-teal-100 text-teal-800 flex items-center gap-1">
                                      <Power className="w-2.5 h-2.5 text-teal-600" />
                                      <span>Aktif Shift {selectedShift === 'pagi' ? 'Pagi' : 'Siang'}</span>
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Notification if turned off for this shift */}
                              {isTurnedOffThisShift && (
                                <div className="mt-2.5 p-2 bg-slate-200/80 rounded-lg text-[11px] text-slate-700 flex items-start space-x-1.5 border border-slate-300">
                                  <PowerOff className="w-3.5 h-3.5 text-slate-600 shrink-0 mt-0.5" />
                                  <div>
                                    <div className="font-bold text-slate-800">
                                      Mesin Tidak Digunakan (Shift {selectedShift === 'pagi' ? 'Pagi' : 'Siang'})
                                    </div>
                                    <div className="text-slate-600 text-[10px]">
                                      {assignment.offReason || 'Dinonaktifkan oleh administrator'}
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* Assigned Nurse Badge (Only if not turned off) */}
                              {!isTurnedOffThisShift && (
                                <div className="mt-3 pt-2.5 border-t border-slate-200/80">
                                  <div className="text-[11px] font-semibold text-slate-500 mb-1 flex items-center justify-between">
                                    <span>Perawat Penanggung Jawab:</span>
                                    {canManage && (
                                      <button
                                        onClick={() =>
                                          setEditingAssignment({
                                            machineId: machine.id,
                                            nurseId: assignment?.nurseId || nursesOnDuty[0]?.id || '',
                                            isOff: false,
                                            offReason: '',
                                            patientName: assignment?.patientName || '',
                                            targetUF: assignment?.targetUF || '2.5 L',
                                            dialyzerType: assignment?.dialyzerType || 'Hi-Flux F7HPS',
                                            notes: assignment?.notes || '',
                                          })
                                        }
                                        className="text-teal-700 hover:text-teal-800 font-bold"
                                      >
                                        Ubah / Plot
                                      </button>
                                    )}
                                  </div>

                                  {assignedNurse ? (
                                    <div className="p-2 rounded-lg bg-teal-50 border border-teal-200 text-xs flex items-center space-x-2">
                                      <div
                                        className={`w-6 h-6 rounded-full font-bold flex items-center justify-center text-[10px] text-white shrink-0 ${
                                          isCitoNurseAssigned ? 'bg-rose-600 animate-pulse' : 'bg-teal-600'
                                        }`}
                                      >
                                        {assignedNurse.name.substring(0, 2).toUpperCase()}
                                      </div>
                                      <div className="truncate flex-1">
                                        <div className="font-bold text-teal-900 truncate flex items-center justify-between">
                                          <span className="truncate">{assignedNurse.name}</span>
                                          {isCitoNurseAssigned && isIsolation && (
                                            <span className="text-[8px] bg-rose-600 text-white font-extrabold px-1 rounded ml-1">
                                              CITO
                                            </span>
                                          )}
                                        </div>
                                        <div className="text-[10px] text-teal-700 flex items-center gap-1">
                                          <span>Perawat Shift {selectedShift === 'pagi' ? 'Pagi' : 'Siang'}</span>
                                          {isCitoNurseAssigned && (
                                            <span className="text-rose-700 font-bold">• Petugas CITO</span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="p-2 rounded-lg bg-slate-100 border border-dashed border-slate-300 text-xs text-slate-400 italic text-center">
                                      Belum diplot ke perawat
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Isolation & CITO notice */}
                              {isIsolation && !isTurnedOffThisShift && isCitoNurseAssigned && (
                                <div className="mt-2 p-1.5 rounded-lg bg-rose-100/70 border border-rose-200 text-[10px] text-rose-900 flex items-center space-x-1 font-bold">
                                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                                  <span>Alokasi Mesin Isolasi Khusus Tugas CITO</span>
                                </div>
                              )}

                              {/* Patient Slot info if assigned */}
                              {!isTurnedOffThisShift && assignment?.patientName && (
                                <div className="mt-2 p-2 rounded-lg bg-white border border-slate-200 text-xs space-y-1">
                                  <div className="font-bold text-slate-800 flex items-center justify-between">
                                    <span>{assignment.patientName}</span>
                                    <span className="text-[10px] font-mono text-teal-700 font-semibold">
                                      UF: {assignment.targetUF || '2.5 L'}
                                    </span>
                                  </div>
                                  <div className="text-[10px] text-slate-500">
                                    Dialyzer: {assignment.dialyzerType || 'Hi-Flux'}
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Action Buttons: Matikan Mesin Shift Ini vs Hidupkan (Requirement 3) */}
                            {canManage && (
                              <div className="mt-3 pt-2.5 border-t border-slate-200/80 flex flex-col gap-1.5">
                                {isTurnedOffThisShift ? (
                                  <button
                                    onClick={() => handleToggleMachineShiftPower(machine.id, false)}
                                    className="w-full py-1.5 px-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center justify-center space-x-1.5 transition shadow-2xs"
                                  >
                                    <Power className="w-3.5 h-3.5" />
                                    <span>Hidupkan Kembali di Shift Ini</span>
                                  </button>
                                ) : (
                                  <div className="space-y-1.5">
                                    {/* Quick nurse selection */}
                                    <select
                                      value={assignment?.nurseId || ''}
                                      onChange={(e) => {
                                        const nurseId = e.target.value;
                                        if (!nurseId) {
                                          const others = machineAssignments.filter(
                                            (a) =>
                                              !(
                                                a.date === selectedDate &&
                                                a.shift === selectedShift &&
                                                a.machineId === machine.id
                                              )
                                          );
                                          onUpdateAssignments(others);
                                        } else {
                                          const assignmentId = `${selectedDate}_${selectedShift}_${machine.id}`;
                                          const newRecord: MachineAssignment = {
                                            id: assignmentId,
                                            date: selectedDate,
                                            shift: selectedShift,
                                            machineId: machine.id,
                                            nurseId,
                                            isOff: false,
                                            targetUF: assignment?.targetUF || '2.5 L',
                                            dialyzerType: isIsolation ? 'Hi-Flux F7HPS (Isolasi)' : assignment?.dialyzerType || 'Hi-Flux F7HPS',
                                          };
                                          const others = machineAssignments.filter(
                                            (a) => a.id !== assignmentId
                                          );
                                          onUpdateAssignments([...others, newRecord]);
                                        }
                                      }}
                                      className={`w-full text-xs py-1.5 px-2.5 border rounded-lg font-semibold transition-all cursor-pointer shadow-2xs focus:outline-hidden focus:ring-2 ${
                                        assignment?.nurseId
                                          ? 'bg-emerald-50 border-emerald-300 text-emerald-950 font-bold focus:ring-emerald-500 hover:border-emerald-400'
                                          : 'bg-white border-slate-200 text-slate-700 hover:border-teal-400 focus:ring-teal-500'
                                      }`}
                                    >
                                      <option value="">-- Kosongkan / Belum Diplot --</option>
                                      {nursesOnDuty.length > 0 ? (
                                        <>
                                          <optgroup label={`Staf & Perawat Shif ${selectedShift === 'pagi' ? 'Pagi' : 'Siang'} (${nursesOnDuty.length})`}>
                                            {nursesOnDuty.map((n) => {
                                              const isCito = citoNurseIds.has(n.id);
                                              const hasOtherTask = specialTasksThisShift.find(
                                                (t) => t.assignedToId === n.id && t.category !== 'cito'
                                              );
                                              const roleTag = n.role === 'kepala_ruangan' ? '(Kepala Ruang)' : (n.role === 'pj_shift' || (n.role as string) === 'katim') ? '(KATIM)' : '';
                                              return (
                                                <option key={n.id} value={n.id}>
                                                  {n.name} {roleTag} {isCito ? '★ (Tugas CITO Isolasi)' : hasOtherTask ? `(${SPECIAL_TASK_DEFINITIONS[hasOtherTask.category]?.name || 'Tugas Khusus'})` : ''}
                                                </option>
                                              );
                                            })}
                                          </optgroup>
                                          {activeClinicalNurses.filter((n) => !nursesOnDuty.some((nd) => nd.id === n.id)).length > 0 && (
                                            <optgroup label="Staf / Perawat Lainnya (Ganti Dinas / Tambahan)">
                                              {activeClinicalNurses
                                                .filter((n) => !nursesOnDuty.some((nd) => nd.id === n.id))
                                                .map((n) => (
                                                  <option key={n.id} value={n.id}>
                                                    {n.name} {n.role === 'kepala_ruangan' ? '(Kepala Ruang)' : (n.role === 'pj_shift' || (n.role as string) === 'katim') ? '(KATIM)' : ''}
                                                  </option>
                                                ))}
                                            </optgroup>
                                          )}
                                        </>
                                      ) : (
                                        <optgroup label="Daftar Staf & Perawat Aktif">
                                          {activeClinicalNurses.map((n) => (
                                            <option key={n.id} value={n.id}>
                                              {n.name} {n.role === 'kepala_ruangan' ? '(Kepala Ruang)' : (n.role === 'pj_shift' || (n.role as string) === 'katim') ? '(KATIM)' : ''}
                                            </option>
                                          ))}
                                        </optgroup>
                                      )}
                                      {/* Safety fallback if assigned nurse is not in the list */}
                                      {assignment?.nurseId && !activeClinicalNurses.some((n) => n.id === assignment.nurseId) && (
                                        <option value={assignment.nurseId}>
                                          {employees.find((e) => e.id === assignment.nurseId)?.name || 'Perawat Terpilih'}
                                        </option>
                                      )}
                                    </select>

                                    {/* Feature: Matikan Mesin untuk Shift Ini */}
                                    <button
                                      onClick={() => {
                                        setTurnOffModalData({
                                          machine,
                                          reason: selectedShift === 'siang' ? 'Tidak digunakan pada shift siang' : 'Tidak digunakan pada shift pagi',
                                        });
                                      }}
                                      className="w-full py-1.5 px-2.5 border border-rose-200 bg-rose-50/70 hover:bg-rose-100 hover:border-rose-300 text-rose-700 hover:text-rose-800 rounded-lg text-[11px] font-bold flex items-center justify-center space-x-1.5 transition shadow-2xs active:scale-[0.98] cursor-pointer"
                                      title={`Matikan mesin ${machine.code} hanya pada shift ini`}
                                    >
                                      <PowerOff className="w-3 h-3 text-rose-600" />
                                      <span>Matikan di Shift {selectedShift === 'pagi' ? 'Pagi' : 'Siang'}</span>
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              });
            })()}
            </div>
            )
          )}
        </div>
      ) : (
        /* INVENTORY SUBTAB */
        <div className="space-y-4">
          {/* Header Card Master Data Mesin HD */}
          <div className="bg-gradient-to-r from-teal-800 via-teal-900 to-slate-900 p-4 sm:p-5 rounded-2xl text-white shadow-xs">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex items-start sm:items-center space-x-3.5">
                <div className="p-3 rounded-2xl bg-white/15 text-white backdrop-blur-xs shrink-0 shadow-inner">
                  <Layers className="w-6 h-6 text-teal-200" />
                </div>
                <div>
                  <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                    <h3 className="font-extrabold text-base sm:text-lg tracking-tight">
                      Master Data Mesin Hemodialisa (Sesuai Sketsa Ruangan RS)
                    </h3>
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-teal-500/30 font-bold text-teal-200 border border-teal-400/40">
                      Total {machines.length} Mesin
                    </span>
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-400/20 font-bold text-amber-200 border border-amber-300/30">
                      7 Area &amp; Ruang Isolasi
                    </span>
                  </div>
                  <p className="text-xs text-teal-100/90 mt-1 max-w-2xl leading-relaxed">
                    Data inventaris unit mesin dialisis terkonfigurasi sesuai denah fisik RS: Area A (12 bed), Area B (9 bed), Area C (8 bed), Area D (3 bed), Area E (2 bed), Area F (2 bed), dan Ruang Isolasi (4 bed).
                  </p>
                </div>
              </div>

              {canManage && (
                <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('Sinkronkan dan rapikan seluruh Master Data Mesin sesuai Sketsa/Denah Ruangan Rumah Sakit (40 Mesin Lengkap Area A-F + Ruang Isolasi)?')) {
                        onUpdateMachines(HOSPITAL_LAYOUT_40_MACHINES);
                        storage.saveMachines(HOSPITAL_LAYOUT_40_MACHINES);
                        storage.saveZones(DEFAULT_ZONES);
                        onUpdateZones?.(DEFAULT_ZONES);
                      }
                    }}
                    className="px-3 py-2 bg-white/15 hover:bg-white/25 text-white rounded-xl text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer backdrop-blur-xs border border-white/20 shadow-2xs"
                    title="Sinkronkan master data mesin secara otomatis sesuai denah sketsa RS 40 mesin"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-teal-200" />
                    <span>Sinkronkan ke Sketsa RS (40 Mesin)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setEditingZone(null);
                      setZoneFormData({ name: '', type: 'reguler', description: '' });
                      setZoneFormError('');
                      setShowZoneConfigModal(true);
                    }}
                    className="px-3 py-2 bg-white/15 hover:bg-white/25 text-white rounded-xl text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer backdrop-blur-xs border border-white/20 shadow-2xs"
                    title="Atur, tambah, atau kelola zona/ruangan mesin HD"
                  >
                    <Sliders className="w-3.5 h-3.5 text-teal-200" />
                    <span>Zona / Ruangan ({sortedZones.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setEditingMachine(null);
                      setMachineForm({
                        code: `HD-${String(machines.length + 1).padStart(2, '0')}`,
                        brand: 'Fresenius Medical Care',
                        model: '4008S Classic',
                        zone: sortedZones[0]?.name || 'Zona A (Reguler)',
                        status: 'siap',
                        serialNumber: '',
                        lastMaintenance: getTodayDateString(),
                        notes: '',
                      });
                      setShowAddMachineModal(true);
                    }}
                    className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-extrabold rounded-xl text-xs shadow-xs flex items-center space-x-1.5 transition cursor-pointer"
                  >
                    <Plus className="w-4 h-4 text-slate-950" />
                    <span>Tambah Mesin</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* 7 Interactive Area Cards (sesuai sketsa RS) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
            {[
              { id: 'all', label: 'Semua Area', count: machines.length, color: 'border-slate-300 bg-white text-slate-800' },
              { id: 'Area A', label: 'Area A (12 Bed)', count: areaBreakdown['Area A'], color: 'border-cyan-300 bg-cyan-50/70 text-cyan-900', range: 'A01 - A12' },
              { id: 'Area B', label: 'Area B (9 Bed)', count: areaBreakdown['Area B'], color: 'border-blue-300 bg-blue-50/70 text-blue-900', range: 'B01 - B09' },
              { id: 'Area C', label: 'Area C (8 Bed)', count: areaBreakdown['Area C'], color: 'border-indigo-300 bg-indigo-50/70 text-indigo-900', range: 'C08 - C01' },
              { id: 'Area D', label: 'Area D (3 Bed)', count: areaBreakdown['Area D'], color: 'border-amber-300 bg-amber-50/70 text-amber-900', range: 'D01 - D03' },
              { id: 'Area E', label: 'Area E (2 Bed)', count: areaBreakdown['Area E'], color: 'border-orange-300 bg-orange-50/70 text-orange-900', range: 'E01 - E02' },
              { id: 'Area F', label: 'Area F (2 Bed)', count: areaBreakdown['Area F'], color: 'border-pink-300 bg-pink-50/70 text-pink-900', range: 'F01 - F02' },
              { id: 'Isolasi', label: 'Ruang Isolasi (4 Bed)', count: areaBreakdown['Ruang Isolasi'], color: 'border-rose-300 bg-rose-50/70 text-rose-900', range: 'ISO 01 - 04' },
            ].map((areaItem) => {
              const isSelected = inventoryZoneFilter.toLowerCase() === areaItem.id.toLowerCase();
              return (
                <button
                  key={areaItem.id}
                  type="button"
                  onClick={() => setInventoryZoneFilter(isSelected && areaItem.id !== 'all' ? 'all' : areaItem.id)}
                  className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between shadow-2xs ${areaItem.color} ${
                    isSelected ? 'ring-2 ring-teal-600 shadow-xs' : 'hover:opacity-90'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-[11px] font-extrabold truncate">{areaItem.label}</span>
                    <span className="text-xs font-black px-1.5 py-0.2 rounded-full bg-white/80 shadow-2xs font-mono">
                      {areaItem.count}
                    </span>
                  </div>
                  {areaItem.range && (
                    <span className="text-[10px] opacity-75 font-mono mt-1 block">
                      {areaItem.range}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Filter Bar & Search */}
          <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center space-x-2 flex-wrap">
              <span className="text-xs font-bold text-slate-700">Filter Tampilan:</span>
              <span className="text-xs px-2.5 py-1 rounded-lg bg-teal-50 text-teal-800 font-bold border border-teal-200">
                {inventoryZoneFilter === 'all' ? 'Seluruh Area (40 Mesin)' : `Filter: ${inventoryZoneFilter}`}
              </span>
              {inventoryZoneFilter !== 'all' && (
                <button
                  type="button"
                  onClick={() => setInventoryZoneFilter('all')}
                  className="text-xs text-rose-600 hover:text-rose-800 font-bold underline cursor-pointer"
                >
                  Reset Filter
                </button>
              )}
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={inventorySearch}
                onChange={(e) => setInventorySearch(e.target.value)}
                placeholder="Cari kode bed/mesin, merk, SN..."
                className="pl-8 pr-2.5 py-1 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-teal-500 shadow-2xs w-full sm:w-56"
              />
              {inventorySearch && (
                <button
                  type="button"
                  onClick={() => setInventorySearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Tabel Master Data Mesin HD Urut Sesuai Denah */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            {filteredMasterMachines.length === 0 ? (
              <div className="p-12 text-center">
                <Layers className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <h4 className="text-sm font-bold text-slate-700">Tidak ada mesin yang cocok dengan kriteria filter</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  Silakan periksa kata kunci pencarian atau ubah filter zona/ruangan.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100/90 border-b border-slate-200 text-slate-700 font-bold uppercase text-[11px] sticky top-0 z-10">
                    <tr>
                      <th className="py-3 px-3 w-12 text-center">No</th>
                      <th className="py-3 px-4 min-w-[120px]">Kode Bed / Mesin</th>
                      <th className="py-3 px-4 min-w-[180px]">Merk &amp; Tipe Mesin</th>
                      <th className="py-3 px-4 min-w-[180px]">Area / Denah Ruangan</th>
                      <th className="py-3 px-4 min-w-[140px]">Nomor Seri (SN)</th>
                      <th className="py-3 px-4 min-w-[150px]">Status Operasional</th>
                      <th className="py-3 px-4 min-w-[140px]">Kalibrasi / Maintenance</th>
                      {isAdmin && <th className="py-3 px-3 w-24 text-right">Aksi</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredMasterMachines.map((mach, idx) => {
                      const isIso = mach.zone?.includes('Isolasi') || mach.code.startsWith('ISO');
                      const areaLetter = mach.code.startsWith('ISO') ? 'ISO' : mach.code.charAt(0);
                      
                      let zoneBadgeClass = 'bg-slate-100 text-slate-700 border-slate-200';
                      if (isIso) zoneBadgeClass = 'bg-rose-100 text-rose-900 border-rose-300 font-black';
                      else if (areaLetter === 'A') zoneBadgeClass = 'bg-cyan-100 text-cyan-900 border-cyan-300 font-bold';
                      else if (areaLetter === 'B') zoneBadgeClass = 'bg-blue-100 text-blue-900 border-blue-300 font-bold';
                      else if (areaLetter === 'C') zoneBadgeClass = 'bg-indigo-100 text-indigo-900 border-indigo-300 font-bold';
                      else if (areaLetter === 'D') zoneBadgeClass = 'bg-amber-100 text-amber-900 border-amber-300 font-bold';
                      else if (areaLetter === 'E') zoneBadgeClass = 'bg-orange-100 text-orange-900 border-orange-300 font-bold';
                      else if (areaLetter === 'F') zoneBadgeClass = 'bg-pink-100 text-pink-900 border-pink-300 font-bold';

                      return (
                        <tr key={mach.id} className="hover:bg-slate-50/80 transition">
                          <td className="py-3 px-3 text-center text-slate-400 font-mono">
                            {idx + 1}
                          </td>
                          <td className="py-3 px-4">
                            <span className="font-extrabold text-slate-900 text-sm font-mono tracking-tight">
                              {mach.code}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-bold text-slate-800">{mach.brand}</div>
                            <div className="text-[11px] text-slate-500 font-mono">{mach.model}</div>
                          </td>
                          <td className="py-3 px-4">
                            <span className={`px-2.5 py-1 rounded-lg text-[11px] border inline-block ${zoneBadgeClass}`}>
                              {mach.zone}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-600 text-[11px]">
                            {mach.serialNumber || '-'}
                          </td>
                          <td className="py-3 px-4">
                            <button
                              type="button"
                              onClick={() => isAdmin && handleToggleMaintenance(mach)}
                              className={`px-2.5 py-1 rounded-full font-bold text-[10px] uppercase transition cursor-pointer inline-flex items-center space-x-1 ${
                                mach.status === 'siap'
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 hover:bg-emerald-200'
                                  : 'bg-rose-100 text-rose-800 border border-rose-300 hover:bg-rose-200'
                              }`}
                              title={isAdmin ? 'Klik untuk mengubah status operasional mesin' : ''}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${mach.status === 'siap' ? 'bg-emerald-600' : 'bg-rose-600'}`}></span>
                              <span>{mach.status === 'siap' ? 'Siap Operasional' : 'Maintenance'}</span>
                            </button>
                          </td>
                          <td className="py-3 px-4 text-slate-600 text-[11px] font-mono">
                            {mach.lastMaintenance || '-'}
                          </td>
                          {isAdmin && (
                            <td className="py-3 px-3 text-right space-x-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingMachine(mach);
                                  setMachineForm(mach);
                                  setShowAddMachineModal(true);
                                }}
                                className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-600 hover:text-teal-700 transition cursor-pointer"
                                title="Edit Data Mesin"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteMachine(mach)}
                                className="p-1.5 hover:bg-rose-100 rounded-lg text-slate-400 hover:text-rose-600 transition cursor-pointer"
                                title="Hapus Mesin"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: EDIT / PLOT SINGLE MACHINE ASSIGNMENT */}
      {editingAssignment && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <Edit3 className="w-4 h-4 text-teal-600" />
                <span>Pengaturan Mesin Shift {selectedShift === 'pagi' ? 'Pagi' : 'Siang'}</span>
              </h3>
              <button
                onClick={() => setEditingAssignment(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-3 space-y-3 text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="font-bold text-slate-800 text-sm">
                  {machines.find((m) => m.id === editingAssignment.machineId)?.code} -{' '}
                  {machines.find((m) => m.id === editingAssignment.machineId)?.brand}
                </div>
                <div className="text-slate-500 text-[11px] mt-0.5">
                  Ruang: {machines.find((m) => m.id === editingAssignment.machineId)?.zone} | Tanggal: {selectedDate} | Shift: {selectedShift}
                </div>
              </div>

              {/* Toggle Matikan Mesin (Requirement 3) */}
              <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2">
                <label className="flex items-center space-x-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingAssignment.isOff || false}
                    onChange={(e) =>
                      setEditingAssignment({
                        ...editingAssignment,
                        isOff: e.target.checked,
                        offReason: e.target.checked
                          ? editingAssignment.offReason || 'Tidak digunakan pada shift ini'
                          : '',
                      })
                    }
                    className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 border-slate-300"
                  />
                  <span className="font-bold text-slate-800">
                    Matikan Mesin pada Shift Ini (Tidak Digunakan)
                  </span>
                </label>

                {editingAssignment.isOff && (
                  <div className="pt-1">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Alasan Mesin Dimatikan:
                    </label>
                    <input
                      type="text"
                      value={editingAssignment.offReason || ''}
                      onChange={(e) =>
                        setEditingAssignment({
                          ...editingAssignment,
                          offReason: e.target.value,
                        })
                      }
                      placeholder="Contoh: Tidak digunakan shift siang, sterilisasi RO, dll"
                      className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                )}
              </div>

              {!editingAssignment.isOff && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Tugaskan Perawat Penanggung Jawab:
                    </label>
                    <select
                      value={editingAssignment.nurseId}
                      onChange={(e) =>
                        setEditingAssignment({
                          ...editingAssignment,
                          nurseId: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                    >
                      <option value="">-- Belum Diplot --</option>
                      {nursesOnDuty.map((n) => {
                        const isCito = citoNurseIds.has(n.id);
                        const roleTag = n.role === 'kepala_ruangan' ? '(Kepala Ruang)' : (n.role === 'pj_shift' || (n.role as string) === 'katim') ? '(KATIM)' : '';
                        return (
                          <option key={n.id} value={n.id}>
                            {n.name} {roleTag} {isCito ? '(Tugas CITO - Prioritas Isolasi)' : ''}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Nama Pasien HD (Opsional):
                    </label>
                    <input
                      type="text"
                      value={editingAssignment.patientName || ''}
                      onChange={(e) =>
                        setEditingAssignment({
                          ...editingAssignment,
                          patientName: e.target.value,
                        })
                      }
                      placeholder="Nama pasien yang menjalani hemodialisa"
                      className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Target UF:
                      </label>
                      <input
                        type="text"
                        value={editingAssignment.targetUF || ''}
                        onChange={(e) =>
                          setEditingAssignment({
                            ...editingAssignment,
                            targetUF: e.target.value,
                          })
                        }
                        placeholder="Contoh: 2.5 L"
                        className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Tipe Dialyzer:
                      </label>
                      <input
                        type="text"
                        value={editingAssignment.dialyzerType || ''}
                        onChange={(e) =>
                          setEditingAssignment({
                            ...editingAssignment,
                            dialyzerType: e.target.value,
                          })
                        }
                        placeholder="Contoh: Hi-Flux F7HPS"
                        className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                      />
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="mt-5 flex items-center justify-between pt-3 border-t border-slate-100">
              {canManage ? (
                <button
                  type="button"
                  onClick={() => {
                    const mach = machines.find((m) => m.id === editingAssignment.machineId);
                    if (mach) {
                      setEditingAssignment(null);
                      handleDeleteMachine(mach);
                    }
                  }}
                  className="px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-rose-200 rounded-lg transition flex items-center gap-1 cursor-pointer"
                  title="Hapus mesin ini dari master data unit"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Hapus Mesin</span>
                </button>
              ) : (
                <div />
              )}
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setEditingAssignment(null)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleSaveAssignment}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition shadow-xs"
                >
                  Simpan Plotting
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD / EDIT MACHINE INVENTORY */}
      {showAddMachineModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <Wrench className="w-4 h-4 text-teal-600" />
                <span>{editingMachine ? 'Edit Mesin Hemodialisa' : 'Tambah Mesin HD Baru'}</span>
              </h3>
              <button
                onClick={() => setShowAddMachineModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveMachineInventory} className="mt-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Kode Mesin:
                  </label>
                  <input
                    type="text"
                    required
                    value={machineForm.code || ''}
                    onChange={(e) =>
                      setMachineForm({ ...machineForm, code: e.target.value })
                    }
                    placeholder="Contoh: HD-01"
                    className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Zona / Ruangan:
                  </label>
                  <select
                    value={machineForm.zone}
                    onChange={(e) =>
                      setMachineForm({
                        ...machineForm,
                        zone: e.target.value as MachineZone,
                      })
                    }
                    className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                  >
                    {sortedZones.map((z) => (
                      <option key={z.id} value={z.name}>
                        {z.name} ({z.type === 'isolasi' ? 'Isolasi' : 'Reguler'})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Merk Mesin:
                  </label>
                  <input
                    type="text"
                    required
                    value={machineForm.brand || ''}
                    onChange={(e) =>
                      setMachineForm({ ...machineForm, brand: e.target.value })
                    }
                    placeholder="Contoh: Fresenius / Nipro"
                    className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tipe / Model:
                  </label>
                  <input
                    type="text"
                    required
                    value={machineForm.model || ''}
                    onChange={(e) =>
                      setMachineForm({ ...machineForm, model: e.target.value })
                    }
                    placeholder="Contoh: 4008S / Surdial"
                    className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nomor Seri (SN):
                </label>
                <input
                  type="text"
                  value={machineForm.serialNumber || ''}
                  onChange={(e) =>
                    setMachineForm({ ...machineForm, serialNumber: e.target.value })
                  }
                  placeholder="Nomor seri resmi pabrikan"
                  className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Status Operasional:
                  </label>
                  <select
                    value={machineForm.status}
                    onChange={(e) =>
                      setMachineForm({
                        ...machineForm,
                        status: e.target.value as MachineStatus,
                      })
                    }
                    className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                  >
                    <option value="siap">Siap Operasional</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="perbaikan">Dalam Perbaikan</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tanggal Kalibrasi Terakhir:
                  </label>
                  <input
                    type="date"
                    value={machineForm.lastMaintenance || ''}
                    onChange={(e) =>
                      setMachineForm({
                        ...machineForm,
                        lastMaintenance: e.target.value,
                      })
                    }
                    className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              <div className="mt-5 flex items-center justify-between pt-3 border-t border-slate-100">
                {editingMachine && canManage ? (
                  <button
                    type="button"
                    onClick={() => {
                      const mach = editingMachine;
                      setShowAddMachineModal(false);
                      setEditingMachine(null);
                      handleDeleteMachine(mach);
                    }}
                    className="px-2.5 py-1.5 text-xs font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-rose-200 rounded-lg transition flex items-center gap-1.5 cursor-pointer"
                    title="Hapus mesin ini dari master data"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Hapus Mesin Ini</span>
                  </button>
                ) : (
                  <div />
                )}
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setShowAddMachineModal(false)}
                    className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition shadow-xs"
                  >
                    Simpan Mesin
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Matikan Mesin pada Shift Ini */}
      {turnOffModalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center text-rose-600">
                <PowerOff className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800">
                  Matikan Mesin {turnOffModalData.machine.code}
                </h3>
                <p className="text-xs text-slate-500">
                  Shift {selectedShift === 'pagi' ? 'Pagi' : 'Siang'} • {selectedDate}
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 mb-3">
              Mesin ini akan dinonaktifkan dari pembagian beban perawat pada shift{' '}
              <strong>{selectedShift === 'pagi' ? 'Pagi' : 'Siang'}</strong>. Status operasional pada shift lain tidak terganggu.
            </p>

            <div className="space-y-3 mb-5">
              <label className="block text-xs font-bold text-slate-700">Pilih Alasan Penonaktifan:</label>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  'Tidak digunakan di shift ini',
                  'Pasien hemodialisa berkurang',
                  'Perawatan / Desinfeksi terjadwal',
                  'Mesin cadangan / Standby',
                ].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setTurnOffModalData({ ...turnOffModalData, reason: preset })}
                    className={`text-left p-2 rounded-lg text-[11px] font-medium border transition ${
                      turnOffModalData.reason === preset
                        ? 'bg-rose-50 border-rose-300 text-rose-800 font-bold'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Keterangan Khusus / Alasan Tambahan:
                </label>
                <input
                  type="text"
                  value={turnOffModalData.reason}
                  onChange={(e) => setTurnOffModalData({ ...turnOffModalData, reason: e.target.value })}
                  placeholder="Tuliskan keterangan bila perlu..."
                  className="w-full text-xs p-2.5 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-rose-500"
                />
              </div>
            </div>

            <div className="flex space-x-2 justify-end">
              <button
                type="button"
                onClick={() => setTurnOffModalData(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  handleToggleMachineShiftPower(
                    turnOffModalData.machine.id,
                    true,
                    turnOffModalData.reason || 'Tidak digunakan pada shift ini'
                  );
                  setTurnOffModalData(null);
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition shadow-xs flex items-center space-x-1.5 cursor-pointer"
              >
                <PowerOff className="w-4 h-4" />
                <span>Ya, Matikan Mesin</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: PENGATURAN ZONA / RUANGAN MESIN HD */}
      {showZoneConfigModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-start justify-between pb-3 border-b border-slate-200 shrink-0">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-700 border border-teal-200 flex items-center justify-center">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">
                    Pengaturan Zona / Ruangan Mesin HD
                  </h3>
                  <p className="text-xs text-slate-500">
                    Atur urutan, tambah, ubah jenis (Reguler / Isolasi), atau hapus zona ruangan.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowZoneConfigModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="overflow-y-auto py-4 space-y-5 flex-1 pr-1">
              {/* Form Tambah / Edit Zona */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-bold text-xs text-slate-800 flex items-center space-x-1.5">
                    <span>{editingZone ? 'Edit Data Zona:' : 'Tambah Zona / Ruangan Baru:'}</span>
                  </h4>
                  {editingZone && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingZone(null);
                        setZoneFormData({ name: '', type: 'reguler', description: '' });
                        setZoneFormError('');
                      }}
                      className="text-xs text-teal-700 hover:underline font-semibold cursor-pointer"
                    >
                      + Buat Zona Baru
                    </button>
                  )}
                </div>

                {zoneFormError && (
                  <div className="mb-3 p-2 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs flex items-center space-x-1.5">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                    <span>{zoneFormError}</span>
                  </div>
                )}

                <form onSubmit={handleSaveZone} className="space-y-3 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Nama Zona / Ruangan:
                      </label>
                      <input
                        type="text"
                        required
                        value={zoneFormData.name}
                        onChange={(e) => {
                          setZoneFormData({ ...zoneFormData, name: e.target.value });
                          setZoneFormError('');
                        }}
                        placeholder="Contoh: Zona B Belakang (Reguler)"
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500 bg-white"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Kategori / Jenis Ruangan:
                      </label>
                      <select
                        value={zoneFormData.type}
                        onChange={(e) =>
                          setZoneFormData({
                            ...zoneFormData,
                            type: e.target.value as 'reguler' | 'isolasi',
                          })
                        }
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500 bg-white"
                      >
                        <option value="reguler">Reguler (Pasien HD Umum / Non-Isolasi)</option>
                        <option value="isolasi">Isolasi (Kewaspadaan Khusus / Target CITO)</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Keterangan / Catatan Tambahan (Opsional):
                    </label>
                    <input
                      type="text"
                      value={zoneFormData.description}
                      onChange={(e) =>
                        setZoneFormData({ ...zoneFormData, description: e.target.value })
                      }
                      placeholder="Contoh: Area depan dekat nurse station, atau khusus Hepatitis B/C"
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500 bg-white"
                    />
                  </div>

                  <div className="flex justify-end space-x-2 pt-1">
                    {editingZone && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingZone(null);
                          setZoneFormData({ name: '', type: 'reguler', description: '' });
                          setZoneFormError('');
                        }}
                        className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-200 rounded-lg transition cursor-pointer"
                      >
                        Batal Edit
                      </button>
                    )}
                    <button
                      type="submit"
                      className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold text-xs transition shadow-xs flex items-center space-x-1.5 cursor-pointer"
                    >
                      {editingZone ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                      <span>{editingZone ? 'Simpan Perubahan Zona' : 'Tambah Zona'}</span>
                    </button>
                  </div>
                </form>
              </div>

              {/* Daftar Zona Saat Ini & Urutan */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-bold text-xs text-slate-800">
                    Daftar Zona Terdaftar ({sortedZones.length})
                  </h4>
                  <button
                    type="button"
                    onClick={handleResetDefaultZones}
                    className="text-[11px] text-slate-600 hover:text-rose-600 font-semibold underline cursor-pointer"
                    title="Kembalikan ke 7 zona standar (Area A, B, C, D, E, F, Isolasi)"
                  >
                    Reset ke 7 Zona Standar RS
                  </button>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs divide-y divide-slate-100">
                  {sortedZones.map((zone, idx) => {
                    const zoneMachCount = machines.filter((m) => m.zone === zone.name).length;
                    const isIsolation = zone.type === 'isolasi';

                    return (
                      <div
                        key={zone.id}
                        className={`p-3 flex items-center justify-between gap-3 text-xs transition ${
                          editingZone?.id === zone.id ? 'bg-teal-50/70' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center space-x-3 min-w-0">
                          <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 font-mono font-bold text-[11px] flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>

                          <div className="min-w-0">
                            <div className="flex items-center space-x-2 flex-wrap">
                              <span className="font-bold text-slate-900 truncate">
                                {zone.name}
                              </span>
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase border ${
                                  isIsolation
                                    ? 'bg-amber-100 text-amber-900 border-amber-300'
                                    : 'bg-teal-50 text-teal-800 border-teal-200'
                                }`}
                              >
                                {isIsolation ? 'Isolasi' : 'Reguler'}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 flex items-center space-x-2 mt-0.5">
                              <span>{zoneMachCount} Mesin dialokasikan</span>
                              {zone.description && (
                                <>
                                  <span>•</span>
                                  <span className="truncate">{zone.description}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Aksi & Urutan */}
                        <div className="flex items-center space-x-1 shrink-0">
                          {/* Reorder Buttons */}
                          <div className="flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200 mr-1">
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => handleMoveZone(idx, 'up')}
                              className="p-1 text-slate-600 hover:text-slate-900 hover:bg-white rounded disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                              title="Geser ke Atas"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === sortedZones.length - 1}
                              onClick={() => handleMoveZone(idx, 'down')}
                              className="p-1 text-slate-600 hover:text-slate-900 hover:bg-white rounded disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                              title="Geser ke Bawah"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              setEditingZone(zone);
                              setZoneFormData({
                                name: zone.name,
                                type: zone.type,
                                description: zone.description || '',
                              });
                              setZoneFormError('');
                            }}
                            className="p-1.5 text-slate-600 hover:text-teal-700 hover:bg-teal-50 rounded-lg transition cursor-pointer"
                            title="Edit Zona"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => setDeleteZoneTarget(zone)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                            title="Hapus Zona"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="pt-3 border-t border-slate-200 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setShowZoneConfigModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Selesai
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CONFIRM DELETE ZONE */}
      {deleteZoneTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 text-center">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-3">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-slate-900 text-base">Hapus Zona / Ruangan?</h3>
            <p className="text-xs text-slate-600 mt-1">
              Anda akan menghapus zona <strong>"{deleteZoneTarget.name}"</strong>.
            </p>

            {(() => {
              const count = machines.filter((m) => m.zone === deleteZoneTarget.name).length;
              const fallback = sortedZones.find((z) => z.id !== deleteZoneTarget.id)?.name || 'Zona A (Reguler)';
              if (count > 0) {
                return (
                  <div className="mt-3 p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-[11px] text-left">
                    <strong>Perhatian:</strong> Terdapat <strong>{count} mesin</strong> yang dialokasikan di zona ini. Mesin-mesin tersebut akan otomatis dialihkan ke <strong>"{fallback}"</strong>.
                  </div>
                );
              }
              return null;
            })()}

            <div className="flex space-x-2 justify-center mt-5">
              <button
                type="button"
                onClick={() => setDeleteZoneTarget(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => handleDeleteZoneConfirm(deleteZoneTarget)}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition shadow-xs cursor-pointer"
              >
                Ya, Hapus Zona
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CONFIRM DELETE MACHINE */}
      {deleteMachineTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 text-center">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-3">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-slate-900 text-base">Hapus Mesin HD?</h3>
            <p className="text-xs text-slate-600 mt-1">
              Yakin ingin menghapus mesin <strong>{deleteMachineTarget.code}</strong> ({deleteMachineTarget.brand} - {deleteMachineTarget.model}) dari master data rumah sakit?
            </p>
            <div className="flex space-x-2 justify-center mt-5">
              <button
                type="button"
                onClick={() => setDeleteMachineTarget(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteMachine}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition shadow-xs cursor-pointer"
              >
                Ya, Hapus Mesin
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOAST NOTIFICATION */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center space-x-2 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-lg text-xs font-medium border border-slate-800 animate-fade-in">
          {toastMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}
    </div>
  );
};
