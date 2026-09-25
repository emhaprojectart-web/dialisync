import React, { useState, useMemo, useEffect } from 'react';
import { WhatsAppDispatcher } from '../domain/WhatsAppDispatcher';
import {
  AppSettings,
  HeadNurseReportFormat,
  Machine,
  ShiftAssignment,
  Doctor,
  DoctorShiftDuty,
} from '../types';
import { 
  safeOpenWhatsApp, 
  copyTextToClipboard, 
  buildWhatsAppUrl, 
  buildWhatsAppWebUrl,
  formatPhoneNumberForWhatsApp 
} from '../utils/whatsappGenerator';
import {
  X,
  Send,
  Copy,
  CheckCircle2,
  ExternalLink,
  Globe,
  Phone,
  Zap,
  UserCheck,
  Edit3,
  Calendar,
} from 'lucide-react';

interface HeadNurseReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onUpdateSettings?: (s: AppSettings) => void;
  dailyAssignments: ShiftAssignment[];
  machines: Machine[];
  selectedDate: string;
  onDateChange?: (date: string) => void;
  doctors?: Doctor[];
  doctorDuties?: Record<string, DoctorShiftDuty>;
}

export const HeadNurseReportModal: React.FC<HeadNurseReportModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  dailyAssignments,
  machines,
  selectedDate,
  onDateChange,
  doctors = [],
  doctorDuties = {},
}) => {
  const [headNurseName, setHeadNurseName] = useState(settings?.headNurseName || 'TWIS FERTILIANTI P W');
  const [headNursePhone, setHeadNursePhone] = useState(settings?.headNursePhone || '0812-1111-0003');
  const [copied, setCopied] = useState(false);
  const [formatMode, setFormatMode] = useState<HeadNurseReportFormat>('RINGKAS');
  const [isCustomEditing, setIsCustomEditing] = useState(false);
  const [editedText, setEditedText] = useState<string>('');
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'warning' | 'info';
    text: string;
    url?: string;
  } | null>(null);

  useEffect(() => {
    if (settings) {
      if (settings.headNurseName) setHeadNurseName(settings.headNurseName);
      if (settings.headNursePhone) setHeadNursePhone(settings.headNursePhone);
    }
  }, [settings]);

  // Resolusi Dokter Jaga untuk tanggal aktif
  const activeDuty = doctorDuties ? doctorDuties[selectedDate] : undefined;
  const pagiDoctorName =
    activeDuty?.pagiDoctorName ||
    (activeDuty?.pagiDoctorId ? (doctors || []).find((d) => String(d.id) === String(activeDuty.pagiDoctorId))?.name : undefined) ||
    '';
  const siangDoctorName =
    activeDuty?.siangDoctorName ||
    (activeDuty?.siangDoctorId ? (doctors || []).find((d) => String(d.id) === String(activeDuty.siangDoctorId))?.name : undefined) ||
    '';

  const generatedReportText = useMemo(() => {
    const doctorDutyObj = (pagiDoctorName || siangDoctorName) ? { pagiDoctorName, siangDoctorName } : undefined;
    if (formatMode === 'NAMA_PERAWAT') {
      return WhatsAppDispatcher.generateHeadNurseNurseOrderReport(
        selectedDate,
        dailyAssignments,
        machines,
        settings?.hospitalName || 'RS Happy Land Medical Centre',
        settings?.roomName || 'Ruang Dialisis Gedung Timur Lt.3',
        headNurseName,
        doctorDutyObj
      );
    }
    return WhatsAppDispatcher.generateHeadNurseCompactReport(
      selectedDate,
      dailyAssignments,
      machines,
      settings?.hospitalName || 'RS Happy Land Medical Centre',
      settings?.roomName || 'Ruang Dialisis Gedung Timur Lt.3',
      headNurseName,
      false,
      doctorDutyObj
    );
  }, [
    selectedDate,
    dailyAssignments,
    machines,
    headNurseName,
    settings?.hospitalName,
    settings?.roomName,
    formatMode,
    pagiDoctorName,
    siangDoctorName,
  ]);

  const finalReportText = isCustomEditing ? editedText : generatedReportText;

  const handleSelectFormat = (mode: HeadNurseReportFormat) => {
    setFormatMode(mode);
    setIsCustomEditing(false);
  };

  const handleToggleEdit = () => {
    if (!isCustomEditing) {
      setEditedText(generatedReportText);
      setIsCustomEditing(true);
    } else {
      setIsCustomEditing(false);
    }
  };

  const handleCopy = async () => {
    const ok = await copyTextToClipboard(finalReportText);
    if (ok) {
      setCopied(true);
      setFeedback({
        type: 'success',
        text: 'Teks pesan berhasil disalin ke clipboard!',
      });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const cleanPhone = formatPhoneNumberForWhatsApp(headNursePhone);

  const handleSendWA = async () => {
    await copyTextToClipboard(finalReportText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);

    if (onUpdateSettings && settings) {
      onUpdateSettings({
        ...settings,
        headNurseName,
        headNursePhone,
      });
    }

    const url = buildWhatsAppUrl(headNursePhone, finalReportText);
    const result = safeOpenWhatsApp(url, finalReportText);

    setFeedback({
      type: 'success',
      text: 'Teks disalin ke clipboard! Membuka WhatsApp...',
      url: result.url,
    });
  };

  const handleSendDesktopWeb = async () => {
    await copyTextToClipboard(finalReportText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);

    if (onUpdateSettings && settings) {
      onUpdateSettings({
        ...settings,
        headNurseName,
        headNursePhone,
      });
    }

    const url = buildWhatsAppWebUrl(headNursePhone, finalReportText);
    const result = safeOpenWhatsApp(url, finalReportText);

    setFeedback({
      type: 'success',
      text: 'Teks disalin! Membuka WhatsApp Web di tab baru...',
      url: result.url,
    });
  };

  const handleSendGeneralWA = async () => {
    await copyTextToClipboard(finalReportText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);

    const url = buildWhatsAppUrl('', finalReportText);
    const result = safeOpenWhatsApp(url, finalReportText);

    setFeedback({
      type: 'info',
      text: 'Teks disalin! Silakan pilih kontak atau grup di WhatsApp.',
      url: result.url,
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs">
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-100 text-emerald-700 rounded-2xl border border-emerald-200">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base sm:text-lg">
                Kirim Laporan Resmi Kepala Ruang
              </h3>
              <p className="text-xs text-slate-500">
                Format resmi rekap jadwal &amp; alokasi mesin HD ke WhatsApp Kepala Ruang
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

        {/* Feedback / Direct Fallback Link */}
        {feedback && (
          <div
            className={`px-4 py-2.5 text-xs font-semibold flex flex-wrap items-center justify-between gap-2 border-b ${
              feedback.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : feedback.type === 'warning'
                ? 'bg-amber-50 border-amber-200 text-amber-900'
                : 'bg-blue-50 border-blue-200 text-blue-900'
            }`}
          >
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{feedback.text}</span>
            </div>
            {feedback.url && (
              <a
                href={feedback.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center space-x-1 underline font-bold text-emerald-700 hover:text-emerald-800 bg-white px-2.5 py-1 rounded-lg border border-emerald-300 shadow-2xs"
              >
                <span>Buka WhatsApp Sekarang</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        )}

        {/* Content */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-4 text-xs">
          {/* Tanggal Operasional & Kontak Karu */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-200">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Tanggal Operasional:
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => onDateChange && onDateChange(e.target.value)}
                  className="w-full px-3 py-2 pl-8 bg-white border border-slate-300 rounded-xl text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                />
                <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-3" />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Nama Kepala Ruang:
              </label>
              <input
                type="text"
                value={headNurseName}
                onChange={(e) => setHeadNurseName(e.target.value)}
                placeholder="TWIS FERTILIANTI P W"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Nomor WhatsApp Karu:
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={headNursePhone}
                  onChange={(e) => setHeadNursePhone(e.target.value)}
                  placeholder="0812-1111-0003"
                  className="w-full px-3 py-2 pl-8 bg-white border border-slate-300 rounded-xl text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                />
                <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-3" />
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">
                WA: +{cleanPhone || 'belum valid'}
              </span>
            </div>
          </div>

          {/* Format Selection Buttons */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-700">Pilih Template Format Laporan:</span>
              <button
                type="button"
                onClick={handleToggleEdit}
                className="text-[11px] text-amber-700 font-bold hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>{isCustomEditing ? 'Selesai Edit' : 'Edit Teks Langsung'}</span>
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleSelectFormat('RINGKAS')}
                className={`py-2 px-3 rounded-xl text-xs font-bold border transition text-left cursor-pointer ${
                  formatMode === 'RINGKAS'
                    ? 'bg-emerald-50 border-emerald-500 text-emerald-900'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold">
                  <Zap className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Format Ringkas (Urut Alokasi)</span>
                </div>
                <div className="text-[10px] text-slate-400 font-normal mt-0.5">
                  Template resmi standar RS Happy Land Medical Centre
                </div>
              </button>
              <button
                type="button"
                onClick={() => handleSelectFormat('NAMA_PERAWAT')}
                className={`py-2 px-3 rounded-xl text-xs font-bold border transition text-left cursor-pointer ${
                  formatMode === 'NAMA_PERAWAT'
                    ? 'bg-indigo-50 border-indigo-500 text-indigo-900'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold">
                  <UserCheck className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Urut Nama Perawat (A-Z)</span>
                </div>
                <div className="text-[10px] text-slate-400 font-normal mt-0.5">
                  Disusun berdasarkan urutan nama perawat setiap sif
                </div>
              </button>
            </div>
          </div>

          {/* Preview Box */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-700">Pratinjau Pesan WhatsApp:</span>
              <button
                type="button"
                onClick={handleCopy}
                className="text-xs font-bold text-emerald-600 hover:underline flex items-center gap-1 cursor-pointer"
              >
                {copied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Tersalin ke Clipboard!' : 'Salin Teks'}</span>
              </button>
            </div>
            {isCustomEditing ? (
              <textarea
                value={editedText}
                onChange={(e) => setEditedText(e.target.value)}
                rows={10}
                className="w-full p-3 font-mono text-[11px] bg-slate-50 border border-slate-300 rounded-xl leading-relaxed focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
              />
            ) : (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono text-[11px] text-slate-800 whitespace-pre-wrap leading-relaxed max-h-56 overflow-y-auto">
                {finalReportText}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-3.5 sm:p-4 border-t border-slate-100 bg-slate-50 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <button
              onClick={handleSendWA}
              className="flex-1 sm:flex-initial px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl font-bold text-xs shadow-xs flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <Send className="w-4 h-4" />
              <span>Kirim ke WhatsApp Karu</span>
            </button>
            <button
              onClick={handleSendDesktopWeb}
              className="flex-1 sm:flex-initial px-3 py-2.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
              title="Buka langsung di WhatsApp Web"
            >
              <Globe className="w-4 h-4 text-emerald-600" />
              <span>WA Web (PC)</span>
            </button>
            <button
              onClick={handleSendGeneralWA}
              className="flex-1 sm:flex-initial px-3 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
              title="Kirim ke kontak lain atau grup WA"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Pilih Kontak</span>
            </button>
          </div>
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
