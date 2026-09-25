import React, { useState } from 'react';
import {
  HDMachine,
  MachineAssignment,
  UserAccount,
  SpecialTask,
  SPECIAL_TASK_DEFINITIONS,
} from '../types';
import {
  Activity,
  User,
  PowerOff,
  AlertTriangle,
  HeartPulse,
  Sparkles,
  RefreshCw,
  Edit3,
  ShieldAlert,
  Shuffle
} from 'lucide-react';

interface RoomFloorPlanProps {
  machines: HDMachine[];
  assignments: MachineAssignment[];
  employees: UserAccount[];
  selectedDate: string;
  selectedShift: 'pagi' | 'siang';
  specialTasks: SpecialTask[];
  canManage: boolean;
  onSelectMachine: (machine: HDMachine, assignment?: MachineAssignment) => void;
  onRegisterMachine?: (code: string) => void;
  onApplySketchLayout: () => void;
  onAutoAssign: () => void;
  onToggleAreaPower?: (machineIds: string[], turnOff: boolean, areaName: string) => void;
}

export const RoomFloorPlan: React.FC<RoomFloorPlanProps> = ({
  machines,
  assignments,
  employees,
  selectedDate,
  selectedShift,
  specialTasks,
  canManage,
  onSelectMachine,
  onRegisterMachine,
  onApplySketchLayout,
  onAutoAssign,
  onToggleAreaPower,
}) => {
  const [activeZoneFilter, setActiveZoneFilter] = useState<'all' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'ISO'>('all');

  // Helper to find machine by code (e.g. "A01", "B04", "D01", "ISO 01")
  const getMachineByCode = (code: string): HDMachine | undefined => {
    const clean = code.toUpperCase().replace(/[\s-_]+/g, '');
    return machines.find((m) => {
      const mClean = m.code.toUpperCase().replace(/[\s-_]+/g, '');
      return (
        mClean === clean ||
        mClean === `HD${clean}` ||
        `HD${mClean}` === clean
      );
    });
  };

  // Helper to find assignment for a machine in this shift
  const getAssignment = (machineId: string): MachineAssignment | undefined => {
    return assignments.find(
      (a) => a.machineId === machineId && a.date === selectedDate && a.shift === selectedShift
    );
  };

  // Helper to find nurse assigned to machine
  const getNurse = (nurseId?: string): UserAccount | undefined => {
    if (!nurseId) return undefined;
    return employees.find((e) => e.id === nurseId);
  };

  // Check if nurse has special task today on this shift
  const getNurseTaskBadge = (nurseId?: string) => {
    if (!nurseId) return null;
    const task = specialTasks.find(
      (t) =>
        t.assignedToId === nurseId &&
        t.date === selectedDate &&
        (!t.shift || t.shift === selectedShift)
    );
    if (!task) return null;
    const def = SPECIAL_TASK_DEFINITIONS[task.category];
    return def ? { name: def.name, shortCode: def.shortCode, badgeBg: def.badgeBg } : null;
  };

  // Statistics
  const totalMachines = machines.length;
  const activeAssignments = assignments.filter((a) => a.date === selectedDate && a.shift === selectedShift);
  const turnedOffCount = activeAssignments.filter((a) => a.isOff).length;
  const filledPatientsCount = activeAssignments.filter((a) => a.patientName && a.patientName.trim() !== '').length;

  // Codes mapping from the user's updated sketch:
  // 1. Zona A: 12 Bed deretan tunggal
  const rowACodes = ['A01', 'A02', 'A03', 'A04', 'A05', 'A06', 'A07', 'A08', 'A09', 'A10', 'A11', 'A12'];
  
  // 2. Zona B: 9 Bed (B04-B01 Sisi Lorong, B05-B09 Sisi Dinding Barat)
  const blockBInner = ['B04', 'B03', 'B02', 'B01']; // Facing inner aisle
  const blockBOuter = ['B05', 'B06', 'B07', 'B08', 'B09']; // Facing west corridor towards D/E

  // 3. Zona C: 8 Bed (C04-C01 Sisi Lorong, C05-C08 Sisi Dinding Barat)
  const blockCInner = ['C04', 'C03', 'C02', 'C01']; // Facing inner aisle
  const blockCOuter = ['C05', 'C06', 'C07', 'C08']; // Facing west corridor towards F/ISO

  // 4. Area D: 3 Bed (D01, D02, D03)
  const blockDCodes = ['D01', 'D02', 'D03'];

  // 5. Area E: 2 Bed (E01, E02)
  const blockECodes = ['E01', 'E02'];

  // 6. Area F: 2 Bed (F01, F02)
  const blockFCodes = ['F01', 'F02'];

  // 7. Ruang Isolasi: 4 Bed (ISO 01 s/d ISO 04, 2x2 grid)
  // Berdasarkan sketsa:
  // Kolom Dalam (menghadap koridor C): ISO 01 (atas), ISO 03 (bawah)
  // Kolom Luar (sisi dinding luar): ISO 02 (atas), ISO 04 (bawah)
  const isoInner = ['ISO 01', 'ISO 03'];
  const isoOuter = ['ISO 02', 'ISO 04'];

  // Check if all registered machines in an area are OFF
  const isAreaAllOff = (codes: string[]): boolean => {
    const areaMachines = codes.map((c) => getMachineByCode(c)).filter((m): m is HDMachine => !!m);
    if (areaMachines.length === 0) return false;
    return areaMachines.every((m) => {
      const a = getAssignment(m.id);
      return !!a?.isOff;
    });
  };

  // Toggle power for all registered machines in an area
  const toggleAreaPower = (codes: string[], areaName: string) => {
    if (!canManage || !onToggleAreaPower) return;
    const areaMachines = codes.map((c) => getMachineByCode(c)).filter((m): m is HDMachine => !!m);
    if (areaMachines.length === 0) return;
    const allOff = isAreaAllOff(codes);
    onToggleAreaPower(
      areaMachines.map((m) => m.id),
      !allOff,
      areaName
    );
  };

  // Render Area Power Control Button
  const renderAreaPowerButton = (codes: string[], areaName: string) => {
    if (!canManage || !onToggleAreaPower) return null;
    const allOff = isAreaAllOff(codes);
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          toggleAreaPower(codes, areaName);
        }}
        className={`inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-md transition shadow-2xs whitespace-nowrap shrink-0 cursor-pointer ${
          allOff
            ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
            : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300'
        }`}
        title={allOff ? `Aktifkan semua mesin di ${areaName}` : `Matikan semua mesin di ${areaName} shift ini`}
      >
        <PowerOff className="w-2.5 h-2.5 shrink-0" />
        <span>{allOff ? 'Nyalakan' : 'Matikan'}</span>
      </button>
    );
  };

  // Render individual bed node
  const renderBedNode = (code: string, compact = false, isIsolation = false) => {
    const machine = getMachineByCode(code);
    const assignment = machine ? getAssignment(machine.id) : undefined;
    const nurse = getNurse(assignment?.nurseId);
    const nurseTask = getNurseTaskBadge(nurse?.id);
    const isOff = !!assignment?.isOff;
    const isMaintenance = machine?.status === 'maintenance' || machine?.status === 'perbaikan';
    const hasPatient = !!assignment?.patientName && assignment.patientName.trim() !== '';

    // Color theme for the bed card
    let borderStyle = isIsolation 
      ? 'border-purple-200 bg-purple-50/40 hover:border-purple-400 hover:shadow-md'
      : 'border-slate-200 bg-white hover:border-teal-400 hover:shadow-md';
    let headerBadge = isIsolation ? 'bg-purple-800 text-white' : 'bg-slate-800 text-white';

    if (!machine) {
      borderStyle = 'border-dashed border-slate-300 bg-slate-50/70 text-slate-400';
      headerBadge = 'bg-slate-400 text-white';
    } else if (isOff) {
      borderStyle = 'border-slate-400 bg-slate-100/90 text-slate-500 opacity-75';
      headerBadge = 'bg-slate-700 text-white';
    } else if (isMaintenance) {
      borderStyle = 'border-rose-300 bg-rose-50/70 text-rose-800';
      headerBadge = 'bg-rose-600 text-white';
    } else if (hasPatient) {
      borderStyle = isIsolation
        ? 'border-purple-500 bg-purple-50/90 shadow-xs ring-1 ring-purple-400/40'
        : 'border-teal-400 bg-teal-50/70 shadow-xs';
      headerBadge = isIsolation ? 'bg-purple-900 text-white' : 'bg-teal-700 text-white';
    } else if (nurse) {
      borderStyle = isIsolation
        ? 'border-purple-300 bg-purple-50/50'
        : 'border-emerald-300 bg-emerald-50/40';
      headerBadge = isIsolation ? 'bg-purple-800 text-white' : 'bg-emerald-600 text-white';
    }

    // Determine highlight if filter is active
    const isHighlighted = activeZoneFilter === 'all' || 
      (activeZoneFilter === 'A' && code.startsWith('A')) ||
      (activeZoneFilter === 'B' && code.startsWith('B')) ||
      (activeZoneFilter === 'C' && code.startsWith('C')) ||
      (activeZoneFilter === 'D' && code.startsWith('D')) ||
      (activeZoneFilter === 'E' && code.startsWith('E')) ||
      (activeZoneFilter === 'F' && code.startsWith('F')) ||
      (activeZoneFilter === 'ISO' && code.startsWith('ISO'));

    return (
      <div
        key={code}
        id={`bed-${code.replace(/\s+/g, '-')}`}
        onClick={() => {
          if (machine) {
            onSelectMachine(machine, assignment);
          } else if (canManage && onRegisterMachine) {
            onRegisterMachine(code);
          }
        }}
        className={`group relative rounded-xl border transition-all cursor-pointer p-2 flex flex-col justify-between select-none ${borderStyle} ${
          compact ? 'min-h-[76px]' : 'min-h-[88px]'
        } ${!isHighlighted ? 'opacity-30 grayscale' : ''}`}
        title={
          machine
            ? `Bed ${code} - Klik untuk atur perawat & pasien (${isOff ? 'OFF' : machine.status})`
            : canManage
            ? `Bed ${code} kosong (mesin belum ada/dihapus). Klik untuk mendaftarkan mesin baru.`
            : `Bed ${code} kosong (belum ada mesin terdaftar).`
        }
      >
        {/* Top bar: Bed Code + Status Indicator */}
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center space-x-1">
            <span className={`text-[11px] font-black px-1.5 py-0.5 rounded-md leading-none tracking-tight ${headerBadge}`}>
              {code}
            </span>
            {isIsolation && (
              <span className="text-[8px] font-black px-1 py-0.2 rounded bg-purple-100 text-purple-900 border border-purple-300 flex items-center gap-0.5">
                <ShieldAlert className="w-2.5 h-2.5 text-purple-700" />
                <span className="hidden sm:inline">ISO</span>
              </span>
            )}
            {isOff ? (
              <span className="text-[9px] font-bold text-slate-600 flex items-center gap-0.5" title="Mesin OFF shift ini">
                <PowerOff className="w-2.5 h-2.5 text-rose-500" />
                <span className="hidden sm:inline">OFF</span>
              </span>
            ) : isMaintenance ? (
              <span className="text-[9px] font-bold text-rose-700 flex items-center gap-0.5" title="Alat maintenance">
                <AlertTriangle className="w-2.5 h-2.5 text-rose-600" />
                <span className="hidden sm:inline">Maint</span>
              </span>
            ) : (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" title="Siap Beroperasi"></span>
            )}
          </div>

          {nurseTask && (
            <span
              className={`text-[8px] font-black px-1 py-0.2 rounded text-white ${nurseTask.badgeBg}`}
              title={`Perawat memiliki tugas ${nurseTask.name}`}
            >
              {nurseTask.shortCode}
            </span>
          )}
        </div>

        {/* Middle: Nurse Name & Patient Info */}
        <div className="my-1">
          {nurse ? (
            <div className="flex items-center space-x-1 text-[11px] font-bold text-slate-800 truncate">
              <User className="w-3 h-3 text-teal-600 shrink-0" />
              <span className="truncate">{nurse.name.split(',')[0]}</span>
            </div>
          ) : (
            <div className="text-[10px] text-slate-400 italic flex items-center space-x-1">
              <span>{isOff ? 'Mesin Non-Aktif' : 'Belum Ada Perawat'}</span>
            </div>
          )}

          {hasPatient ? (
            <div className={`mt-0.5 text-[10px] font-semibold truncate px-1 py-0.2 rounded border ${
              isIsolation
                ? 'text-purple-950 bg-purple-100/80 border-purple-300'
                : 'text-teal-900 bg-teal-100/70 border-teal-200'
            }`}>
              <span>{assignment.patientName}</span>
              {assignment.targetUF && (
                <span className="font-bold ml-1 text-slate-700">({assignment.targetUF})</span>
              )}
            </div>
          ) : !isOff && (
            <div className="text-[9px] text-slate-400 mt-0.5">
              {machine ? 'Bed Tersedia' : 'Kosong (Tanpa Mesin)'}
            </div>
          )}
        </div>

        {/* Hover Hint */}
        <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute bottom-1 right-1">
          <Edit3 className="w-3 h-3 text-teal-600" />
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Top Controls & Status Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <HeartPulse className="w-5 h-5 text-teal-600" />
                <span>Denah Fisik Lengkap Unit Hemodialisis RS Happy Land</span>
              </h3>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 border border-teal-200">
                40 Mesin (Area A s/d F + Isolasi)
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Tata letak seluruh bed HD sesuai gambar denah: Area D, E, F &amp; Ruang Isolasi di sayap barat; Blok B &amp; C serta Nurse Station di tengah; dan Blok A (12 bed) di sayap timur.
            </p>
          </div>

          {/* Quick Metrics */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
              <span className="text-slate-500">Total Mesin: </span>
              <span className="font-extrabold text-slate-800">{totalMachines} Unit</span>
            </div>
            <div className="bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200 text-emerald-900 font-bold">
              <span>{totalMachines - turnedOffCount} Aktif</span>
            </div>
            {turnedOffCount > 0 && (
              <div className="bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-300 text-slate-700 font-bold flex items-center gap-1">
                <PowerOff className="w-3 h-3 text-rose-500" />
                <span>{turnedOffCount} OFF</span>
              </div>
            )}
            <div className="bg-teal-50 px-3 py-1.5 rounded-xl border border-teal-200 text-teal-900 font-bold">
              <span>{filledPatientsCount} Pasien Masuk</span>
            </div>
          </div>
        </div>

        {/* Action & Filter Bar */}
        <div className="mt-4 pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Filter by Zone Chips */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Fokus Area:</span>
            <div className="flex flex-wrap items-center gap-1">
              {(['all', 'A', 'B', 'C', 'D', 'E', 'F', 'ISO'] as const).map((z) => (
                <button
                  key={z}
                  type="button"
                  onClick={() => setActiveZoneFilter(z)}
                  className={`text-[11px] font-bold px-2 sm:px-2.5 py-1 rounded-lg transition min-h-[30px] cursor-pointer ${
                    activeZoneFilter === z
                      ? z === 'ISO'
                        ? 'bg-purple-700 text-white shadow-2xs'
                        : 'bg-teal-700 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {z === 'all' ? 'Semua' : z === 'ISO' ? 'Isolasi' : z}
                </button>
              ))}
            </div>
          </div>

          {/* Buttons: Auto Balance & Seed 41 Machines */}
          <div className="flex flex-wrap items-center gap-2">
            {canManage && (
              <>
                <button
                  type="button"
                  onClick={onAutoAssign}
                  className="w-full sm:w-auto px-3 py-1.5 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700 text-white rounded-xl text-xs font-bold shadow-2xs flex items-center justify-center space-x-1.5 transition active:scale-95 cursor-pointer min-h-[34px]"
                  title="Klik 1 kali untuk melakukan ploting acak berurutan sesuai denah secara adil & merata. Klik ulang untuk mengacak kembali secara adil."
                >
                  <Shuffle className="w-3.5 h-3.5 animate-pulse shrink-0" />
                  <span>Plotting Berurutan (Acak Adil)</span>
                </button>

                <button
                  type="button"
                  onClick={onApplySketchLayout}
                  className="w-full sm:w-auto px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5 min-h-[34px] cursor-pointer"
                  title="Sinkronkan / Buat 40 Mesin sesuai denah rumah sakit (A01-A12, B01-B09, C01-C08, D01-D03, E01-E02, F01-F02, ISO 01-ISO 04)"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                  <span>Sinkronkan 40 Mesin</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Main Floor Plan Container */}
      <div className="bg-teal-50/20 rounded-3xl p-3 sm:p-5 md:p-6 border-2 border-teal-200/80 shadow-sm relative overflow-hidden">
        {/* Floor Plan Header Tag */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-2 border-b border-teal-200/60">
          <div className="flex items-center space-x-2 flex-wrap">
            <span className="text-xs font-extrabold uppercase tracking-wider text-teal-900 flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-teal-600 animate-pulse shrink-0"></span>
              PETA RUANGAN HEMODIALISIS (RS HAPPY LAND)
            </span>
            <span className="text-teal-300 hidden sm:inline">•</span>
            <span className="text-xs text-teal-700 font-semibold">
              Shift {selectedShift === 'pagi' ? 'Pagi' : 'Siang'}
            </span>
          </div>

          <div className="flex items-center space-x-2 sm:space-x-3 text-[10px] sm:text-[11px] font-semibold text-slate-500">
            <div className="flex items-center space-x-1">
              <span className="w-2.5 h-2.5 rounded bg-teal-600 inline-block"></span>
              <span>Terisi Pasien</span>
            </div>
            <div className="flex items-center space-x-1">
              <span className="w-2.5 h-2.5 rounded bg-purple-700 inline-block"></span>
              <span>Ruang Isolasi</span>
            </div>
            <div className="flex items-center space-x-1">
              <span className="w-2.5 h-2.5 rounded bg-slate-700 inline-block"></span>
              <span>Mesin OFF</span>
            </div>
          </div>
        </div>

        {/* -------------------- DENAH RUANGAN HD (TAMPILAN HORIZONTAL) -------------------- */}
        <div
          id="room-floor-canvas"
          className="bg-gradient-to-b from-teal-50/80 via-teal-50/40 to-teal-50/70 rounded-2xl p-4 sm:p-6 border-2 border-teal-300/90 shadow-xs space-y-6 overflow-x-auto"
        >
            
            {/* ROW 1: AREA A (12 BEDS IN ONE LINE) */}
            <div className="border border-teal-200/80 rounded-2xl p-3.5 bg-white/95 shadow-2xs min-w-[1100px]">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-black uppercase text-teal-900 tracking-wider">
                  AREA A
                </span>
                <div>
                  {renderAreaPowerButton(rowACodes, 'Area A')}
                </div>
              </div>
              <div className="grid grid-cols-12 gap-2">
                {rowACodes.map((code) => renderBedNode(code))}
              </div>
            </div>

            {/* MAIN HALLWAY 1 */}
            <div className="min-w-[1100px] py-2.5 bg-teal-100/70 border-y-2 border-dashed border-teal-300/90 rounded-xl flex items-center justify-center px-6 shadow-2xs">
              <span className="text-xs font-bold text-teal-800 uppercase tracking-wider flex items-center gap-2">
                <span>◀ LORONG UTAMA SIRKULASI PASIEN &amp; DOKTER/PERAWAT ▶</span>
              </span>
            </div>

            {/* ROW 2: BLOK B, NURSE STATION, & BLOK C */}
            <div className="grid grid-cols-12 gap-3 min-w-[1100px]">
              
              {/* BLOK B (B01-B04 inner, B05-B09 outer) */}
              <div className="col-span-5 border border-teal-200/80 rounded-2xl p-3 bg-white/95 shadow-2xs">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-xs font-black uppercase text-teal-900 tracking-wider">
                    AREA B
                  </span>
                  <div>
                    {renderAreaPowerButton([...blockBInner, ...blockBOuter], 'Area B')}
                  </div>
                </div>

                {/* Sisi Lorong (B04 - B01) */}
                <div className="mb-2">
                  <div className="grid grid-cols-4 gap-2">
                    {blockBInner.map((code) => renderBedNode(code))}
                  </div>
                </div>

                {/* Sisi Luar (B05 - B09) */}
                <div>
                  <div className="grid grid-cols-5 gap-2">
                    {blockBOuter.map((code) => renderBedNode(code))}
                  </div>
                </div>
              </div>

              {/* NURSE STATION (Center Block) */}
              <div className="col-span-2 bg-gradient-to-b from-teal-950 via-slate-900 to-cyan-950 text-white rounded-2xl p-3.5 flex flex-col justify-center items-center text-center shadow-xs border border-teal-700/80">
                <div className="w-9 h-9 rounded-xl bg-teal-500/20 border border-teal-400/40 flex items-center justify-center text-teal-300 font-bold mb-2">
                  <Activity className="w-4 h-4 text-teal-400" />
                </div>
                <div>
                  <h4 className="text-xs font-black tracking-wide text-white">NURSE STATION</h4>
                </div>
              </div>

              {/* BLOK C (C01-C04 inner, C05-C08 outer) */}
              <div className="col-span-5 border border-teal-200/80 rounded-2xl p-3 bg-white/95 shadow-2xs">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-xs font-black uppercase text-teal-900 tracking-wider">
                    AREA C
                  </span>
                  <div>
                    {renderAreaPowerButton([...blockCInner, ...blockCOuter], 'Area C')}
                  </div>
                </div>

                {/* Sisi Lorong (C04 - C01) */}
                <div className="mb-2">
                  <div className="grid grid-cols-4 gap-2">
                    {blockCInner.map((code) => renderBedNode(code))}
                  </div>
                </div>

                {/* Sisi Luar (C05 - C08) */}
                <div>
                  <div className="grid grid-cols-4 gap-2">
                    {blockCOuter.map((code) => renderBedNode(code))}
                  </div>
                </div>
              </div>

            </div>

            {/* MAIN HALLWAY 2 */}
            <div className="min-w-[1100px] py-2.5 bg-teal-100/70 border-y-2 border-dashed border-teal-300/90 rounded-xl flex items-center justify-center px-6 shadow-2xs">
              <span className="text-xs font-bold text-teal-800 uppercase tracking-wider flex items-center gap-2">
                <span>◀ LORONG UTAMA SIRKULASI PASIEN &amp; DOKTER/PERAWAT ▶</span>
              </span>
            </div>

            {/* ROW 3: AREA D, E, F & RUANG ISOLASI */}
            <div className="grid grid-cols-12 gap-3 min-w-[1100px]">
              
              {/* AREA D */}
              <div className="col-span-3 border border-indigo-200 rounded-2xl p-3 bg-indigo-50/30">
                <div className="flex items-center justify-between gap-1.5 mb-2">
                  <span className="text-xs font-black uppercase text-indigo-900 tracking-wider truncate">
                    AREA D
                  </span>
                  <div>
                    {renderAreaPowerButton(blockDCodes, 'Area D')}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {blockDCodes.map((code) => renderBedNode(code))}
                </div>
              </div>

              {/* AREA E */}
              <div className="col-span-2 border border-violet-200 rounded-2xl p-3 bg-violet-50/30">
                <div className="flex items-center justify-between gap-1 mb-2">
                  <span className="text-xs font-black uppercase text-violet-900 tracking-wider truncate">
                    AREA E
                  </span>
                  <div>
                    {renderAreaPowerButton(blockECodes, 'Area E')}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {blockECodes.map((code) => renderBedNode(code))}
                </div>
              </div>

              {/* AREA F */}
              <div className="col-span-2 border border-blue-200 rounded-2xl p-3 bg-blue-50/30">
                <div className="flex items-center justify-between gap-1 mb-2">
                  <span className="text-xs font-black uppercase text-blue-900 tracking-wider truncate">
                    AREA F
                  </span>
                  <div>
                    {renderAreaPowerButton(blockFCodes, 'Area F')}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {blockFCodes.map((code) => renderBedNode(code))}
                </div>
              </div>

              {/* RUANG ISOLASI KHUSUS */}
              <div className="col-span-5 border-2 border-purple-400 rounded-2xl p-3 bg-purple-50/60 shadow-xs">
                <div className="flex items-center justify-between gap-2 mb-2 pb-1 border-b border-purple-200">
                  <div className="flex items-center space-x-1.5 truncate">
                    <ShieldAlert className="w-4 h-4 text-purple-700 shrink-0" />
                    <span className="text-xs font-black uppercase text-purple-950 tracking-wider truncate">
                      ISOLASI KHUSUS
                    </span>
                  </div>
                  <div>
                    {renderAreaPowerButton([...isoInner, ...isoOuter], 'Isolasi Khusus')}
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2">
                  {/* Outer column */}
                  {isoOuter.map((code) => renderBedNode(code, false, true))}
                  {/* Inner column */}
                  {isoInner.map((code) => renderBedNode(code, false, true))}
                </div>
              </div>

            </div>

          </div>

      </div>
    </div>
  );
};
