import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  Cpu,
  Calendar,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Layers,
  ArrowRight,
  Info,
  Check,
  Shuffle,
  Sun,
  Sunset,
} from 'lucide-react';
import { FairSchedulerEngine } from '../domain/FairSchedulerEngine';
import { ShiftAssignment, Nurse, Machine } from '../types';

interface RegenerateMachineAllocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultScope?: 'DAILY' | 'MONTHLY';
  defaultShift?: 'ALL' | 'PAGI' | 'SIANG';
  selectedDate: string;
  currentMonth: string;
  nurses: Nurse[];
  machines: Machine[];
  assignments: ShiftAssignment[];
  onReallocationCompleted: (updatedAssignments: ShiftAssignment[], summaryMessage: string) => void;
  showToast?: (message: string, type?: 'success' | 'error') => void;
}

export const RegenerateMachineAllocationModal: React.FC<RegenerateMachineAllocationModalProps> = ({
  isOpen,
  onClose,
  defaultScope = 'DAILY',
  defaultShift = 'ALL',
  selectedDate,
  currentMonth,
  nurses,
  machines,
  assignments,
  onReallocationCompleted,
  showToast = (msg) => alert(msg),
}) => {
  const [scope, setScope] = useState<'DAILY' | 'MONTHLY'>(defaultScope);
  const [targetShift, setTargetShift] = useState<'ALL' | 'PAGI' | 'SIANG'>(defaultShift);
  const [shuffleNurses, setShuffleNurses] = useState(true);
  const [rotateBays, setRotateBays] = useState(true);
  const [leaderLighterLoad, setLeaderLighterLoad] = useState(false);
  const [consecutiveIsolationProtection, setConsecutiveIsolationProtection] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setScope(defaultScope);
      setTargetShift(defaultShift);
    }
  }, [isOpen, defaultScope, defaultShift]);

  if (!isOpen) return null;

  const handleExecute = () => {
    setIsProcessing(true);
    setTimeout(() => {
      try {
        const activeMachines = machines.filter(
          (m) =>
            (m.status || 'AKTIF').toUpperCase() === 'AKTIF' &&
            m.status !== 'MAINTENANCE' &&
            m.status !== 'RUSAK' &&
            m.status !== 'TIDAK_DIGUNAKAN'
        );

        if (activeMachines.length === 0) {
          showToast('Tidak ada mesin berstatus AKTIF.', 'error');
          setIsProcessing(false);
          return;
        }

        const effectiveOptions = {
          shuffleNurses,
          rotateBays,
          leaderLighterLoad,
          consecutiveIsolationProtection,
          targetShift,
        };

        if (scope === 'MONTHLY') {
          const updated = FairSchedulerEngine.reallocateMonthlyMachinesPreservingShifts(
            currentMonth,
            assignments,
            nurses,
            machines,
            effectiveOptions
          );
          onReallocationCompleted(
            updated,
            `Alokasi mesin bulanan (${currentMonth}) berhasil diatur ulang berkeadilan.`
          );
        } else {
          // DAILY REALLOCATION
          const dayNum = parseInt(selectedDate.split('-')[2] || '1', 10);
          const getOrCreateNurse = (a: ShiftAssignment): Nurse => {
            const found = nurses.find((n) => String(n.id) === String(a.nurseId));
            if (found) return found;
            return {
              id: typeof a.nurseId === 'number' ? a.nurseId : 999,
              name: a.nurseName,
              nip: '',
              phone: a.nursePhone,
              role: 'PELAKSANA',
              isActive: true,
              skillLevel: 'Senior',
              specialDuty: a.specialDuty,
            };
          };

          const dailyList = assignments.filter((a) => a.date === selectedDate);
          const otherDays = assignments.filter((a) => a.date !== selectedDate);

          const pagiAssignments = dailyList.filter((a) => (a.shiftType || '').toUpperCase() === 'PAGI');
          const siangAssignments = dailyList.filter((a) => (a.shiftType || '').toUpperCase() === 'SIANG');
          const otherDaily = dailyList.filter((a) => {
            const st = (a.shiftType || '').toUpperCase();
            return st !== 'PAGI' && st !== 'SIANG';
          });

          const pagiNurses = pagiAssignments.map(getOrCreateNurse);
          const siangNurses = siangAssignments.map(getOrCreateNurse);

          const pagiAlloc = (targetShift === 'ALL' || targetShift === 'PAGI') && pagiNurses.length > 0
            ? FairSchedulerEngine.allocateMachinesWithOptions(
                pagiNurses,
                machines,
                dayNum,
                'PAGI',
                {},
                {},
                {},
                effectiveOptions
              )
            : null;

          const siangAlloc = (targetShift === 'ALL' || targetShift === 'SIANG') && siangNurses.length > 0
            ? FairSchedulerEngine.allocateMachinesWithOptions(
                siangNurses,
                machines,
                dayNum,
                'SIANG',
                {},
                {},
                {},
                effectiveOptions
              )
            : null;

          const updatedDaily: ShiftAssignment[] = [];
          pagiAssignments.forEach((a) => {
            const nId = Number(a.nurseId);
            const allocated = pagiAlloc
              ? (pagiAlloc[nId] || (pagiAlloc as any)[String(a.nurseId)] || [])
              : (a.assignedMachineIds || []);
            updatedDaily.push({
              ...a,
              assignedMachineIds: allocated,
            });
          });

          siangAssignments.forEach((a) => {
            const nId = Number(a.nurseId);
            const allocated = siangAlloc
              ? (siangAlloc[nId] || (siangAlloc as any)[String(a.nurseId)] || [])
              : (a.assignedMachineIds || []);
            updatedDaily.push({
              ...a,
              assignedMachineIds: allocated,
            });
          });

          updatedDaily.push(...otherDaily);
          const finalUpdated = [...otherDays, ...updatedDaily];

          onReallocationCompleted(
            finalUpdated,
            `Alokasi mesin harian (${selectedDate}) berhasil diatur ulang.`
          );
        }

        onClose();
      } catch (err: any) {
        showToast('Gagal mengalokasikan mesin: ' + err.message, 'error');
      } finally {
        setIsProcessing(false);
      }
    }, 200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-teal-100 text-teal-700 rounded-2xl border border-teal-200">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">
                Atur Ulang Alokasi Mesin HD
              </h3>
              <p className="text-xs text-slate-500">
                Optimasi pembagian bed perawat tanpa mengubah pola dinas jaga (P/S/L)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-4 text-xs">
          {/* Scope Selector */}
          <div>
            <label className="block font-bold text-slate-700 mb-2">Cakupan Pengaturan:</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setScope('DAILY')}
                className={`p-3 rounded-2xl border text-left transition ${
                  scope === 'DAILY'
                    ? 'border-teal-600 bg-teal-50/70 text-teal-950 font-bold'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Calendar className="w-4 h-4 text-teal-600" />
                  <span className="font-bold">Harian ({selectedDate})</span>
                </div>
                <p className="text-[11px] text-slate-500 font-normal">
                  Hanya atur ulang alokasi bed pada tanggal yang sedang dipilih
                </p>
              </button>

              <button
                type="button"
                onClick={() => setScope('MONTHLY')}
                className={`p-3 rounded-2xl border text-left transition ${
                  scope === 'MONTHLY'
                    ? 'border-teal-600 bg-teal-50/70 text-teal-950 font-bold'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Layers className="w-4 h-4 text-teal-600" />
                  <span className="font-bold">Bulanan ({currentMonth})</span>
                </div>
                <p className="text-[11px] text-slate-500 font-normal">
                  Atur ulang alokasi mesin untuk seluruh hari kerja bulan ini
                </p>
              </button>
            </div>
          </div>

          {/* Shift Target if Daily */}
          {scope === 'DAILY' && (
            <div>
              <label className="block font-bold text-slate-700 mb-1.5">Pilih Sif Sasaran:</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setTargetShift('ALL')}
                  className={`py-2 px-3 rounded-xl border font-bold text-xs transition ${
                    targetShift === 'ALL'
                      ? 'bg-teal-600 text-white border-teal-600'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  Semua Sif
                </button>
                <button
                  type="button"
                  onClick={() => setTargetShift('PAGI')}
                  className={`py-2 px-3 rounded-xl border font-bold text-xs flex items-center justify-center gap-1.5 transition ${
                    targetShift === 'PAGI'
                      ? 'bg-sky-600 text-white border-sky-600'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Sun className="w-3.5 h-3.5" />
                  <span>Sif Pagi</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTargetShift('SIANG')}
                  className={`py-2 px-3 rounded-xl border font-bold text-xs flex items-center justify-center gap-1.5 transition ${
                    targetShift === 'SIANG'
                      ? 'bg-amber-600 text-white border-amber-600'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Sunset className="w-3.5 h-3.5" />
                  <span>Sif Siang</span>
                </button>
              </div>
            </div>
          )}

          {/* Algorithmic Rules Checklist */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
            <span className="font-bold text-slate-800 block text-xs">
              Kebijakan Engine Alokasi Berkeadilan:
            </span>

            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={rotateBays}
                onChange={(e) => setRotateBays(e.target.checked)}
                className="w-4 h-4 text-teal-600 rounded border-slate-300 mt-0.5"
              />
              <div>
                <span className="font-bold text-slate-800">Rotasi Bay Perawat</span>
                <p className="text-[11px] text-slate-500">
                  Perawat bergilir bertugas di Area A, B, C, D, E, F, & Ruang Isolasi
                </p>
              </div>
            </label>

            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={consecutiveIsolationProtection}
                onChange={(e) => setConsecutiveIsolationProtection(e.target.checked)}
                className="w-4 h-4 text-teal-600 rounded border-slate-300 mt-0.5"
              />
              <div>
                <span className="font-bold text-slate-800">Proteksi Isolasi Berturut-turut</span>
                <p className="text-[11px] text-slate-500">
                  Perawat yang bertugas di isolasi kemarin tidak akan ditugaskan di isolasi hari ini
                </p>
              </div>
            </label>

            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={leaderLighterLoad}
                onChange={(e) => setLeaderLighterLoad(e.target.checked)}
                className="w-4 h-4 text-teal-600 rounded border-slate-300 mt-0.5"
              />
              <div>
                <span className="font-bold text-slate-800">Beban Mesin PJ Sif Lebih Ringan</span>
                <p className="text-[11px] text-slate-500">
                  Penanggung Jawab Sif mendapat kuota bed lebih sedikit untuk fokus koordinasi
                </p>
              </div>
            </label>

            <div className="pt-2 border-t border-slate-200 flex items-center gap-2 text-[11px] text-teal-800">
              <ShieldCheck className="w-4 h-4 text-teal-600 shrink-0" />
              <span>
                <strong>Aturan Isolasi CITO:</strong> Mesin Isolasi (C08 & C09) diprioritaskan bagi perawat dengan tugas khusus CITO.
              </span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl font-bold text-xs transition"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleExecute}
            disabled={isProcessing}
            className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold text-xs shadow-xs flex items-center gap-1.5 transition"
          >
            {isProcessing ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            <span>{isProcessing ? 'Mengalokasikan...' : 'Jalankan Alokasi Mesin'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
