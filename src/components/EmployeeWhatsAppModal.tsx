import React, { useState, useEffect, useMemo } from 'react';
import { 
  UserAccount, 
  ShiftSchedule, 
  HDMachine, 
  MachineAssignment, 
  SpecialTask,
  ShiftType,
  SPECIAL_TASK_DEFINITIONS
} from '../types';
import { 
  generatePersonalEmployeeWhatsApp,
  formatPhoneNumberForWhatsApp,
  buildWhatsAppUrl,
  buildWhatsAppWebUrl,
  copyTextToClipboard,
  safeOpenWhatsApp,
  formatIndonesianDateWithDay
} from '../utils/whatsappGenerator';
import { 
  MessageCircle, 
  Send, 
  Copy, 
  Check, 
  X, 
  Phone, 
  Stethoscope, 
  Calendar, 
  Edit3, 
  Eye, 
  ExternalLink,
  Save,
  Info,
  Globe,
  Share2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  User,
  HeartPulse,
  Sun,
  Moon,
  Palmtree,
  ShieldCheck,
  RefreshCw
} from 'lucide-react';

export interface EmployeeWhatsAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  employee: UserAccount | null;
  selectedDate: string;
  initialShift?: ShiftType;
  employees: UserAccount[];
  schedules: ShiftSchedule[];
  machines: HDMachine[];
  machineAssignments: MachineAssignment[];
  specialTasks: SpecialTask[];
  onUpdateEmployees?: (updatedEmployees: UserAccount[]) => void;
}

export const EmployeeWhatsAppModal: React.FC<EmployeeWhatsAppModalProps> = ({
  isOpen,
  onClose,
  employee,
  selectedDate,
  initialShift,
  employees,
  schedules,
  machines,
  machineAssignments,
  specialTasks,
  onUpdateEmployees,
}) => {
  if (!isOpen || !employee) return null;

  // Phone number state
  const [phoneNumber, setPhoneNumber] = useState<string>(employee.phone || '');
  const [savedPhoneSuccess, setSavedPhoneSuccess] = useState(false);

  // Shift override state
  const [shiftOverride, setShiftOverride] = useState<ShiftType | undefined>(initialShift);

  // Doctor specific customizable params
  const [docPjShiftName, setDocPjShiftName] = useState<string>('');
  const [docPatientCount, setDocPatientCount] = useState<number | undefined>(undefined);

  // Off employee specific customizable task
  const [offSpecialTask, setOffSpecialTask] = useState<string>('');

  // Manual text editing mode
  const [isEditingManually, setIsEditingManually] = useState(false);
  const [customText, setCustomText] = useState('');
  const [copied, setCopied] = useState(false);

  // Feedback state
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'warning' | 'info';
    text: string;
    url?: string;
  } | null>(null);

  // Initialize/Reset phone when employee changes
  useEffect(() => {
    if (employee) {
      setPhoneNumber(employee.phone || '');
      setShiftOverride(initialShift);
      setDocPjShiftName('');
      setDocPatientCount(undefined);
      setIsEditingManually(false);
      setFeedback(null);
    }
  }, [employee?.id, initialShift, selectedDate]);

  // Generate initial auto message
  const autoData = useMemo(() => {
    if (!employee) return null;
    return generatePersonalEmployeeWhatsApp({
      employee,
      dateStr: selectedDate,
      employees,
      schedules,
      machines,
      machineAssignments,
      specialTasks,
      shiftOverride,
      patientCountOverride: employee.role === 'dokter' ? docPatientCount : undefined,
      pjShiftNurseNameOverride: docPjShiftName ? docPjShiftName : undefined,
      specialTaskOverride: offSpecialTask ? offSpecialTask : undefined,
    });
  }, [
    employee,
    selectedDate,
    employees,
    schedules,
    machines,
    machineAssignments,
    specialTasks,
    shiftOverride,
    docPatientCount,
    docPjShiftName,
    offSpecialTask,
  ]);

  // Keep doctor defaults in sync with detected data
  useEffect(() => {
    if (autoData?.type === 'dokter') {
      if (!docPjShiftName && autoData.pjShiftNurseName) {
        setDocPjShiftName(autoData.pjShiftNurseName);
      }
      if (typeof autoData.patientCount === 'number' && docPatientCount === undefined) {
        setDocPatientCount(autoData.patientCount);
      }
    }
    if (autoData?.type === 'libur' && !offSpecialTask && autoData.specialTasksList.length > 0) {
      setOffSpecialTask(autoData.specialTasksList.join(', '));
    }
  }, [autoData?.type, autoData?.pjShiftNurseName, autoData?.patientCount]);

  // Sync custom text when not in manual edit mode
  useEffect(() => {
    if (!isEditingManually && autoData?.message) {
      setCustomText(autoData.message);
    }
  }, [autoData?.message, isEditingManually]);

  const formattedDate = formatIndonesianDateWithDay(selectedDate);
  const cleanPhone = formatPhoneNumberForWhatsApp(phoneNumber);

  // Handle Save Phone to Employee profile
  const handleSavePhone = () => {
    if (employee && onUpdateEmployees) {
      const updated = employees.map((e) =>
        e.id === employee.id ? { ...e, phone: phoneNumber } : e
      );
      onUpdateEmployees(updated);
      setSavedPhoneSuccess(true);
      setTimeout(() => setSavedPhoneSuccess(false), 3000);
    }
  };

  // Copy to clipboard
  const handleCopy = async () => {
    const ok = await copyTextToClipboard(customText);
    if (ok) {
      setCopied(true);
      setFeedback({
        type: 'success',
        text: 'Teks pesan berhasil disalin ke clipboard!',
      });
      setTimeout(() => setCopied(false), 2500);
    }
  };

  // Universal Send via WhatsApp
  const handleSendWhatsApp = async () => {
    await copyTextToClipboard(customText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);

    // Auto-save phone if changed
    if (phoneNumber && phoneNumber !== employee.phone) {
      handleSavePhone();
    }

    const url = buildWhatsAppUrl(phoneNumber, customText);
    const result = safeOpenWhatsApp(url, customText);

    setFeedback({
      type: 'success',
      text: 'Teks disalin ke clipboard! Membuka WhatsApp...',
      url: result.url,
    });
  };

  // Send via WhatsApp Web (Desktop)
  const handleSendWhatsAppWeb = async () => {
    await copyTextToClipboard(customText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);

    if (phoneNumber && phoneNumber !== employee.phone) {
      handleSavePhone();
    }

    const url = buildWhatsAppWebUrl(phoneNumber, customText);
    const result = safeOpenWhatsApp(url, customText);

    setFeedback({
      type: 'success',
      text: 'Teks disalin! Membuka WhatsApp Web...',
      url: result.url,
    });
  };

  // Native share if supported
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const handleNativeShare = async () => {
    try {
      await navigator.share({
        title: `Jadwal HD RS Happy Land - ${employee.name}`,
        text: customText,
      });
      setFeedback({
        type: 'success',
        text: 'Pesan berhasil dibagikan!',
      });
    } catch {
      handleCopy();
    }
  };

  // Reset to default auto message
  const handleResetToDefault = () => {
    setIsEditingManually(false);
    if (autoData?.message) {
      setCustomText(autoData.message);
    }
  };

  // Potential PJ candidates for Doctor's PJ Sif selector
  const activeNurses = useMemo(() => {
    return employees.filter(
      (e) => (e.role === 'perawat' || e.role === 'pj_shift' || e.role === 'kepala_ruangan') && e.status === 'aktif'
    );
  }, [employees]);

  const roleTitle = useMemo(() => {
    if (employee.role === 'dokter') return 'Dokter Jaga HD';
    if (employee.role === 'kepala_ruangan') return 'Kepala Ruangan HD';
    if (employee.role === 'pj_shift') return 'PJ Shif HD';
    return 'Perawat Pelaksana HD';
  }, [employee.role]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header Bar */}
        <div className={`p-4 sm:p-5 text-white flex items-center justify-between ${
          autoData?.type === 'dokter'
            ? 'bg-gradient-to-r from-blue-700 via-indigo-700 to-sky-800'
            : autoData?.type === 'libur'
            ? 'bg-gradient-to-r from-amber-700 via-slate-800 to-teal-900'
            : autoData?.shift === 'siang'
            ? 'bg-gradient-to-r from-pink-700 via-rose-700 to-slate-900'
            : 'bg-gradient-to-r from-emerald-800 via-teal-800 to-slate-900'
        }`}>
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-white/20 text-white backdrop-blur-xs shadow-md">
              <MessageCircle className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2 flex-wrap">
                <h3 className="font-extrabold text-base sm:text-lg tracking-tight">
                  Kirim Pengingat Jadwal via WhatsApp
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/20 text-white border border-white/30">
                  {roleTitle}
                </span>
              </div>
              <p className="text-xs text-white/90 mt-0.5 flex items-center space-x-1.5">
                <Calendar className="w-3.5 h-3.5" />
                <span>{formattedDate}</span>
                <span>•</span>
                <span className="font-bold underline">{employee.name}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/25 text-white transition cursor-pointer"
            title="Tutup"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs">
          
          {/* Notification / Feedback Banner */}
          {feedback && (
            <div className={`p-3 rounded-xl border flex items-start space-x-2.5 animate-in fade-in duration-200 ${
              feedback.type === 'success'
                ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                : feedback.type === 'warning'
                ? 'bg-amber-50 border-amber-300 text-amber-950'
                : 'bg-sky-50 border-sky-300 text-sky-950'
            }`}>
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
              <div className="flex-1 text-xs">
                <p className="font-semibold">{feedback.text}</p>
                {feedback.url && (
                  <div className="mt-1.5 flex items-center space-x-2">
                    <span className="text-[11px] text-slate-600">WhatsApp tidak terbuka otomatis?</span>
                    <a
                      href={feedback.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center space-x-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-[11px] shadow-xs cursor-pointer"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>Klik Disini untuk Buka WA</span>
                    </a>
                  </div>
                )}
              </div>
              <button
                onClick={() => setFeedback(null)}
                className="text-slate-400 hover:text-slate-700 p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* 1. Recipient Phone & Identity Card */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-200">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-lg bg-teal-700 text-white flex items-center justify-center font-bold text-xs shadow-2xs">
                  {employee.role === 'dokter' ? 'dr' : 'Ns'}
                </div>
                <div>
                  <h4 className="font-extrabold text-slate-900 text-sm">{employee.name}</h4>
                  <span className="text-[11px] text-slate-500">
                    {employee.specialization || (employee.role === 'dokter' ? 'Dokter Jaga Hemodialisa' : 'Perawat Ruang Dialisis')}
                    {employee.nip ? ` • NIP: ${employee.nip}` : ''}
                  </span>
                </div>
              </div>

              {/* Status Badge */}
              <div className="flex items-center space-x-1.5 self-start sm:self-auto">
                {autoData?.type === 'dokter' ? (
                  <span className="px-2.5 py-1 rounded-lg bg-blue-100 text-blue-900 font-extrabold text-[11px] border border-blue-200 flex items-center space-x-1">
                    <Stethoscope className="w-3 h-3 text-blue-700" />
                    <span>Jadwal Dokter ({autoData.shift.toUpperCase()})</span>
                  </span>
                ) : autoData?.type === 'libur' ? (
                  <span className="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-900 font-extrabold text-[11px] border border-amber-200 flex items-center space-x-1">
                    <Palmtree className="w-3 h-3 text-amber-700" />
                    <span>Karyawan Libur / Lepas Jaga</span>
                  </span>
                ) : (
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-900 font-extrabold text-[11px] border border-emerald-200 flex items-center space-x-1">
                    {autoData?.shift === 'siang' ? <Moon className="w-3 h-3 text-pink-600" /> : <Sun className="w-3 h-3 text-emerald-600" />}
                    <span>Dinas {autoData?.shift === 'siang' ? 'Shif Siang' : 'Shif Pagi'} ({autoData?.machineCodes.length || 0} Mesin)</span>
                  </span>
                )}
              </div>
            </div>

            {/* Phone Number Input & Save Button */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
              <label className="text-xs font-bold text-slate-700 flex items-center space-x-1 shrink-0">
                <Phone className="w-3.5 h-3.5 text-emerald-600" />
                <span>Nomor HP / WhatsApp:</span>
              </label>

              <div className="flex items-center space-x-2 flex-1 max-w-md">
                <div className="relative flex-1">
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="Contoh: 0812-3456-7890"
                    className="w-full px-3 py-1.5 pl-8 rounded-lg border border-slate-300 bg-white font-mono text-xs font-bold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                  />
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400">
                    WA
                  </span>
                </div>

                {onUpdateEmployees && phoneNumber && phoneNumber !== employee.phone && (
                  <button
                    type="button"
                    onClick={handleSavePhone}
                    className="px-2.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-xs font-bold transition flex items-center space-x-1 shrink-0 cursor-pointer"
                    title="Simpan nomor ini ke profil karyawan agar tersimpan permanen"
                  >
                    <Save className="w-3 h-3 text-slate-700" />
                    <span>{savedPhoneSuccess ? 'Tersimpan!' : 'Simpan'}</span>
                  </button>
                )}
              </div>
            </div>

            {savedPhoneSuccess && (
              <p className="text-[11px] text-emerald-600 font-semibold flex items-center space-x-1">
                <Check className="w-3 h-3" />
                <span>Nomor WhatsApp berhasil disimpan permanen ke profil {employee.name}!</span>
              </p>
            )}
          </div>

          {/* 2. Interactive Shift & Context Controls */}
          {employee.role === 'dokter' ? (
            /* Dokter Parameters */
            <div className="bg-blue-50/60 border border-blue-200 rounded-xl p-3 space-y-2.5">
              <div className="flex items-center space-x-1.5 font-bold text-blue-950 text-xs">
                <Stethoscope className="w-4 h-4 text-blue-600" />
                <span>Pengaturan Pesan Dokter Jaga:</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {/* Pilih Shif */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Sif Jaga:
                  </label>
                  <select
                    value={shiftOverride || autoData?.shift || 'siang'}
                    onChange={(e) => {
                      const newShift = e.target.value as ShiftType;
                      setShiftOverride(newShift);
                      setDocPjShiftName('');
                      setDocPatientCount(undefined);
                      setIsEditingManually(false);
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-blue-300 bg-white font-bold text-xs text-slate-800 cursor-pointer"
                  >
                    <option value="siang">SHIF SIANG (13:00 - 20:00)</option>
                    <option value="pagi">SHIF PAGI (07:00 - 14:00)</option>
                    <option value="pagi_siang">SHIF PAGI & SIANG (Full Day)</option>
                  </select>
                </div>

                {/* PJ Sif Name */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    👑 PJ Sif Bertugas:
                  </label>
                  <div className="flex items-center space-x-1">
                    <input
                      type="text"
                      list="pj-candidates-list"
                      value={docPjShiftName || autoData?.pjShiftNurseName || ''}
                      onChange={(e) => {
                        setDocPjShiftName(e.target.value);
                        setIsEditingManually(false);
                      }}
                      placeholder="Nama Perawat PJ Shif"
                      className="w-full px-2.5 py-1.5 rounded-lg border border-blue-300 bg-white font-bold text-xs text-slate-800"
                    />
                    <datalist id="pj-candidates-list">
                      {activeNurses.map((n) => (
                        <option key={n.id} value={n.name}>
                          {n.role === 'pj_shift' ? 'PJ Shif' : 'Perawat'}
                        </option>
                      ))}
                    </datalist>
                  </div>
                </div>

                {/* Jumlah Pasien (Jumlah Mesin Aktif) */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1" title="Dihitung otomatis dari jumlah mesin aktif pada shif tersebut">
                    👤 Jumlah Pasien (Mesin Aktif):
                  </label>
                  <div className="flex items-center space-x-1.5">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={typeof docPatientCount === 'number' ? docPatientCount : (autoData?.patientCount ?? 24)}
                      onChange={(e) => {
                        setDocPatientCount(parseInt(e.target.value, 10) || 0);
                        setIsEditingManually(false);
                      }}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-blue-300 bg-white font-bold text-xs text-slate-800"
                    />
                    <span className="text-[11px] font-semibold text-slate-600 shrink-0">Pasien</span>
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-blue-700/80">
                * Jumlah pasien otomatis terisi sesuai <strong>jumlah mesin aktif</strong> pada shif yang dipilih ({typeof docPatientCount === 'number' ? docPatientCount : (autoData?.patientCount ?? 24)} mesin aktif).
              </p>
            </div>
          ) : (
            /* Perawat / Staf Parameters */
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="font-bold text-slate-700 text-xs">Pilih Sif Kerja untuk Pengingat:</span>
                <div className="flex items-center space-x-1 bg-white p-1 rounded-lg border border-slate-200">
                  <button
                    type="button"
                    onClick={() => {
                      setShiftOverride('pagi');
                      setIsEditingManually(false);
                    }}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition cursor-pointer ${
                      (shiftOverride || autoData?.shift) === 'pagi'
                        ? 'bg-emerald-600 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Shif Pagi
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShiftOverride('siang');
                      setIsEditingManually(false);
                    }}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition cursor-pointer ${
                      (shiftOverride || autoData?.shift) === 'siang'
                        ? 'bg-pink-600 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Shif Siang
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShiftOverride('libur');
                      setIsEditingManually(false);
                    }}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition cursor-pointer ${
                      (shiftOverride || autoData?.shift) === 'libur'
                        ? 'bg-amber-600 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Libur / OFF
                  </button>
                </div>
              </div>

              {/* Detail Info Ringkas */}
              {autoData?.type === 'perawat' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-[11px]">
                  <div className="p-2 rounded-lg bg-white border border-slate-200">
                    <span className="font-bold text-slate-600 block mb-0.5">📟 Mesin Dikelola:</span>
                    <span className="font-extrabold text-teal-800">
                      {autoData.machineCodes.length > 0
                        ? autoData.machineCodes.join(', ') + ` (${autoData.machineCodes.length} Mesin)`
                        : 'Belum ada alokasi mesin'}
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-white border border-slate-200">
                    <span className="font-bold text-slate-600 block mb-0.5">📝 Tugas Khusus:</span>
                    <span className="font-extrabold text-indigo-800">
                      {autoData.specialTasksList.length > 0
                        ? autoData.specialTasksList.join(', ')
                        : 'Tidak ada tugas khusus'}
                    </span>
                  </div>
                </div>
              ) : autoData?.type === 'libur' ? (
                <div className="pt-1 flex items-center space-x-2">
                  <label className="text-[11px] font-semibold text-slate-600 shrink-0">
                    🏷️ Tugas Khusus Saat Libur (Opsional):
                  </label>
                  <input
                    type="text"
                    value={offSpecialTask}
                    onChange={(e) => {
                      setOffSpecialTask(e.target.value);
                      setIsEditingManually(false);
                    }}
                    placeholder="Contoh: PERAWAT CITO"
                    className="flex-1 px-2.5 py-1 rounded-lg border border-slate-300 bg-white font-bold text-xs text-slate-800"
                  />
                </div>
              ) : null}
            </div>
          )}

          {/* 3. Live Message Preview & Editor */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-extrabold text-slate-800 flex items-center space-x-1.5">
                <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                <span>Pratinjau Isi Pesan WhatsApp:</span>
              </label>

              <div className="flex items-center space-x-2">
                {isEditingManually && (
                  <button
                    type="button"
                    onClick={handleResetToDefault}
                    className="text-[11px] text-amber-700 hover:text-amber-800 font-bold hover:underline flex items-center space-x-1 cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Reset ke Standar</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsEditingManually(!isEditingManually)}
                  className="text-[11px] text-teal-700 hover:text-teal-800 font-bold hover:underline flex items-center space-x-1 cursor-pointer"
                >
                  <Edit3 className="w-3 h-3" />
                  <span>{isEditingManually ? 'Kunci Teks' : 'Edit Pesan'}</span>
                </button>
              </div>
            </div>

            {/* Chat Bubble Style Container */}
            <div className="relative rounded-xl border border-emerald-300 bg-[#efeae2] p-3 shadow-inner">
              <div className="bg-white rounded-lg p-3 text-slate-900 shadow-xs border border-emerald-100">
                <textarea
                  value={customText}
                  onChange={(e) => {
                    setIsEditingManually(true);
                    setCustomText(e.target.value);
                  }}
                  rows={11}
                  className="w-full font-mono text-xs leading-relaxed bg-transparent resize-y focus:outline-hidden text-slate-800"
                  placeholder="Ketik atau edit teks pesan WhatsApp..."
                />
              </div>

              {/* Timestamp simulator */}
              <div className="mt-1 text-right">
                <span className="text-[10px] text-slate-500 font-medium">
                  {new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} • Pengingat Dialisync
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer Bar */}
        <div className="bg-slate-100 p-3.5 sm:p-4 border-t border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          {/* Quick Copy Button */}
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleCopy}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5 cursor-pointer border ${
                copied
                  ? 'bg-emerald-600 text-white border-emerald-700'
                  : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-300 shadow-2xs'
              }`}
            >
              {copied ? <Check className="w-3.5 h-3.5 text-white" /> : <Copy className="w-3.5 h-3.5 text-slate-600" />}
              <span>{copied ? 'Tersalin!' : 'Salin Pesan'}</span>
            </button>

            {canNativeShare && (
              <button
                type="button"
                onClick={handleNativeShare}
                className="px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5 cursor-pointer border border-slate-300 shadow-2xs"
                title="Bagikan via menu bawaan HP"
              >
                <Share2 className="w-3.5 h-3.5 text-slate-600" />
                <span className="hidden sm:inline">Bagikan</span>
              </button>
            )}
          </div>

          {/* WhatsApp Direct Action Buttons */}
          <div className="flex items-center space-x-2">
            {/* WhatsApp Web Desktop */}
            <button
              type="button"
              onClick={handleSendWhatsAppWeb}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5 cursor-pointer shadow-2xs active:scale-95"
              title="Kirim menggunakan WhatsApp Web di browser PC"
            >
              <Globe className="w-3.5 h-3.5 text-emerald-400" />
              <span>WA Web</span>
            </button>

            {/* Universal Send WhatsApp Button */}
            <button
              type="button"
              onClick={handleSendWhatsApp}
              className="flex-1 sm:flex-none px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs sm:text-sm font-extrabold transition flex items-center justify-center space-x-2 shadow-md hover:shadow-lg cursor-pointer active:scale-95 border border-emerald-400/30"
              title="Kirim langsung pesan ke WhatsApp karyawan ini"
            >
              <Send className="w-4 h-4" />
              <span>Kirim ke WhatsApp</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
