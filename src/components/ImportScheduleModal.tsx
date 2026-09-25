import React, { useState, useRef } from 'react';
import {
  X,
  FileSpreadsheet,
  Upload,
  Link,
  ClipboardList,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Info,
  Download,
  ArrowRight,
  ArrowLeft,
  Calendar,
  Layers,
  FileText,
  RefreshCw,
  Search,
  Check,
} from 'lucide-react';
import { ScheduleImportService, ImportParseResult } from '../domain/ScheduleImportService';
import { Nurse, Machine, ShiftAssignment, AppSettings, SHIFT_TYPE_INFO } from '../types';

interface ImportScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultMonth?: string;
  nurses: Nurse[];
  machines: Machine[];
  settings?: AppSettings;
  onImportCompleted: (
    importedAssignments: ShiftAssignment[],
    targetMonth: string,
    replaceExisting?: boolean,
    newNurses?: Nurse[]
  ) => void;
  showToast?: (message: string, type?: 'success' | 'error') => void;
}

type ImportSourceTab = 'FILE' | 'GOOGLE_SHEETS' | 'PASTE';

export const ImportScheduleModal: React.FC<ImportScheduleModalProps> = ({
  isOpen,
  onClose,
  defaultMonth,
  nurses,
  machines,
  settings,
  onImportCompleted,
  showToast = (msg) => alert(msg),
}) => {
  const currentMonth = defaultMonth || new Date().toISOString().substring(0, 7);
  const [activeTab, setActiveTab] = useState<ImportSourceTab>('FILE');
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonth);
  const [autoAllocateMachines, setAutoAllocateMachines] = useState<boolean>(true);
  const [replaceExisting, setReplaceExisting] = useState<boolean>(true);

  // File Upload State
  const [dragOver, setDragOver] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Google Sheets URL State
  const [googleSheetUrl, setGoogleSheetUrl] = useState<string>(settings?.googleSpreadsheetIdOrUrl || '');

  // Direct Paste State
  const [pastedText, setPastedText] = useState<string>('');

  // Parsing & Preview State
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [parseResult, setParseResult] = useState<ImportParseResult | null>(null);
  const [step, setStep] = useState<'SOURCE' | 'PREVIEW'>('SOURCE');

  // Preview filtering
  const [previewFilter, setPreviewFilter] = useState<'ALL' | 'WARNINGS' | 'UNMATCHED'>('ALL');
  const [previewSearch, setPreviewSearch] = useState<string>('');

  if (!isOpen) return null;

  // Handle File Input Selection
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processFile(file);
  };

  const processFile = async (file: File) => {
    setUploadedFileName(file.name);
    setIsLoading(true);
    try {
      const buffer = await file.arrayBuffer();
      const result = await ScheduleImportService.parseExcelFile(
        buffer,
        selectedMonth,
        nurses,
        machines,
        autoAllocateMachines
      );
      setParseResult(result);
      if (result.isSuccess) {
        setStep('PREVIEW');
      } else {
        showToast(result.message, 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Gagal memproses file impor.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Direct Paste Parsing
  const handleParsePasted = async () => {
    if (!pastedText.trim()) {
      showToast('Tempelkan teks data jadwal terlebih dahulu.', 'error');
      return;
    }
    setIsLoading(true);
    try {
      const result = await ScheduleImportService.parseCsvOrTsvText(
        pastedText,
        selectedMonth,
        nurses,
        machines,
        autoAllocateMachines
      );
      setParseResult(result);
      if (result.isSuccess) {
        setStep('PREVIEW');
      } else {
        showToast(result.message, 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Gagal memproses teks yang ditempel.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Google Sheets URL Fetch
  const handleFetchGoogleSheets = async () => {
    if (!googleSheetUrl.trim()) {
      showToast('Masukkan URL Spreadsheet Google terlebih dahulu.', 'error');
      return;
    }
    setIsLoading(true);
    try {
      const result = await ScheduleImportService.fetchFromGoogleSheetsUrl(
        googleSheetUrl,
        selectedMonth,
        nurses,
        machines,
        autoAllocateMachines
      );
      setParseResult(result);
      if (result.isSuccess) {
        setStep('PREVIEW');
      } else {
        showToast(result.message, 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Gagal memuat jadwal dari Google Sheets.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Download Sample Template
  const handleDownloadTemplate = async () => {
    try {
      await ScheduleImportService.downloadExcelTemplate(selectedMonth, nurses);
      showToast('Template Excel berhasil diunduh.', 'success');
    } catch (err: any) {
      showToast('Gagal membuat template Excel: ' + err.message, 'error');
    }
  };

  // Apply Import to Application State
  const handleApplyImport = () => {
    if (!parseResult || !parseResult.assignments.length) return;
    onImportCompleted(
      parseResult.assignments,
      parseResult.monthString || selectedMonth,
      replaceExisting,
      parseResult.newNursesCreated
    );
    showToast(
      `Sukses mengimpor ${parseResult.assignments.length} penugasan shift untuk bulan ${parseResult.monthString}!`,
      'success'
    );
    onClose();
  };

  // Filter preview items
  const filteredPreview = (parseResult?.previewList || []).filter((item) => {
    if (previewFilter === 'WARNINGS' && !item.warning) return false;
    if (previewFilter === 'UNMATCHED' && item.isMatched) return false;
    if (previewSearch.trim()) {
      const q = previewSearch.toLowerCase();
      return (
        item.nurseName.toLowerCase().includes(q) ||
        item.date.includes(q) ||
        item.rawShiftCode.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
      <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-teal-100 text-teal-700 rounded-2xl border border-teal-200">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base sm:text-lg">
                Import Jadwal Bulanan Perawat
              </h3>
              <p className="text-xs text-slate-500">
                Impor dari file Excel (.xlsx), CSV, Google Sheets, atau salin-tempel matriks
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

        {/* Body Content */}
        {step === 'SOURCE' ? (
          <div className="p-6 overflow-y-auto space-y-5 text-xs">
            {/* Target Month & Options Row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-200">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Target Bulan:
                </label>
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div className="flex items-center pt-5">
                <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={autoAllocateMachines}
                    onChange={(e) => setAutoAllocateMachines(e.target.checked)}
                    className="w-4 h-4 text-teal-600 rounded border-slate-300 focus:ring-teal-500"
                  />
                  <span>Alokasi Mesin Otomatis</span>
                </label>
              </div>

              <div className="flex items-center pt-5">
                <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={replaceExisting}
                    onChange={(e) => setReplaceExisting(e.target.checked)}
                    className="w-4 h-4 text-teal-600 rounded border-slate-300 focus:ring-teal-500"
                  />
                  <span>Gantikan Jadwal yang Ada</span>
                </label>
              </div>
            </div>

            {/* Template Download Prompt */}
            <div className="flex items-center justify-between p-3.5 bg-teal-50/70 border border-teal-200 rounded-2xl">
              <div className="flex items-center gap-2.5">
                <Info className="w-4 h-4 text-teal-700 shrink-0" />
                <span className="text-teal-900 font-medium text-xs">
                  Belum memiliki format? Unduh template Excel matriks resmi unit HD.
                </span>
              </div>
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="px-3 py-1.5 bg-teal-700 hover:bg-teal-800 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 transition shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Unduh Template .xlsx</span>
              </button>
            </div>

            {/* Source Tab Selection */}
            <div className="space-y-3">
              <div className="flex border-b border-slate-200 gap-4">
                <button
                  type="button"
                  onClick={() => setActiveTab('FILE')}
                  className={`pb-2 text-xs font-bold transition flex items-center gap-1.5 border-b-2 ${
                    activeTab === 'FILE'
                      ? 'border-teal-600 text-teal-700'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Upload className="w-4 h-4" />
                  <span>Unggah File (Excel / CSV)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('GOOGLE_SHEETS')}
                  className={`pb-2 text-xs font-bold transition flex items-center gap-1.5 border-b-2 ${
                    activeTab === 'GOOGLE_SHEETS'
                      ? 'border-teal-600 text-teal-700'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Link className="w-4 h-4" />
                  <span>Link Google Sheets</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('PASTE')}
                  className={`pb-2 text-xs font-bold transition flex items-center gap-1.5 border-b-2 ${
                    activeTab === 'PASTE'
                      ? 'border-teal-600 text-teal-700'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <ClipboardList className="w-4 h-4" />
                  <span>Salin-Tempel (Copy-Paste)</span>
                </button>
              </div>

              {/* Tab 1: File Upload */}
              {activeTab === 'FILE' && (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    const f = e.dataTransfer.files?.[0];
                    if (f) processFile(f);
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`p-8 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center text-center cursor-pointer transition ${
                    dragOver
                      ? 'border-teal-500 bg-teal-50'
                      : 'border-slate-300 hover:border-teal-400 bg-slate-50/50'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv,.tsv"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <div className="p-3 bg-teal-100 text-teal-700 rounded-full mb-2">
                    <Upload className="w-6 h-6" />
                  </div>
                  <h4 className="font-bold text-slate-800 text-sm">
                    {uploadedFileName || 'Klik atau tarik file jadwal ke sini'}
                  </h4>
                  <p className="text-slate-400 text-xs mt-1">
                    Mendukung format Microsoft Excel (.xlsx, .xls) dan CSV / TSV
                  </p>
                </div>
              )}

              {/* Tab 2: Google Sheets Link */}
              {activeTab === 'GOOGLE_SHEETS' && (
                <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      URL atau ID Google Spreadsheet:
                    </label>
                    <input
                      type="text"
                      value={googleSheetUrl}
                      onChange={(e) => setGoogleSheetUrl(e.target.value)}
                      placeholder="https://docs.google.com/spreadsheets/d/1WgGJBmpZfwHnM2tfNOxkOu45Ji9mm6lHkoWtqnW4fmg/edit"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500">
                    *Pastikan spreadsheet memiliki akses "Siapa saja dengan link dapat melihat" atau dipublikasikan.
                  </p>
                  <button
                    type="button"
                    onClick={handleFetchGoogleSheets}
                    disabled={isLoading}
                    className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 transition"
                  >
                    {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    <span>{isLoading ? 'Memuat dari Google Sheets...' : 'Ambil & Analisis Jadwal'}</span>
                  </button>
                </div>
              )}

              {/* Tab 3: Copy Paste */}
              {activeTab === 'PASTE' && (
                <div className="space-y-3">
                  <textarea
                    rows={8}
                    value={pastedText}
                    onChange={(e) => setPastedText(e.target.value)}
                    placeholder="Tempelkan baris data matriks jadwal di sini (salinan dari Excel atau Google Sheets)..."
                    className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl font-mono text-xs focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                  />
                  <button
                    type="button"
                    onClick={handleParsePasted}
                    disabled={isLoading}
                    className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 transition"
                  >
                    {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    <span>{isLoading ? 'Menganalisis Teks...' : 'Analisis Data Jadwal'}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Step 2: PREVIEW */
          <div className="p-6 overflow-y-auto space-y-4 text-xs">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="p-3 bg-teal-50 border border-teal-200 rounded-2xl">
                <span className="text-[10px] text-teal-700 font-bold uppercase">Perawat Terdeteksi</span>
                <p className="text-xl font-extrabold text-teal-900 mt-0.5">
                  {parseResult?.detectedNursesCount || 0}
                </p>
              </div>
              <div className="p-3 bg-sky-50 border border-sky-200 rounded-2xl">
                <span className="text-[10px] text-sky-700 font-bold uppercase">Sif Pagi (P)</span>
                <p className="text-xl font-extrabold text-sky-900 mt-0.5">
                  {parseResult?.shiftCounts.pagi || 0}
                </p>
              </div>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl">
                <span className="text-[10px] text-amber-700 font-bold uppercase">Sif Siang (S)</span>
                <p className="text-xl font-extrabold text-amber-900 mt-0.5">
                  {parseResult?.shiftCounts.siang || 0}
                </p>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl">
                <span className="text-[10px] text-slate-700 font-bold uppercase">Libur / Cuti / Sakit</span>
                <p className="text-xl font-extrabold text-slate-900 mt-0.5">
                  {(parseResult?.shiftCounts.libur || 0) + (parseResult?.shiftCounts.cuti || 0) + (parseResult?.shiftCounts.sakit || 0)}
                </p>
              </div>
            </div>

            {/* Warning Message if Unmatched Nurses */}
            {parseResult?.unmatchedNurses && parseResult.unmatchedNurses.length > 0 && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <span className="font-bold text-amber-900">
                    Ada {parseResult.unmatchedNurses.length} nama perawat yang tidak persis cocok dengan database:
                  </span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {parseResult.unmatchedNurses.map((name) => (
                      <span key={name} className="px-2 py-0.5 bg-amber-200/80 text-amber-900 rounded-md text-[10px] font-semibold">
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Filter & Search Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-1">
              <div className="flex items-center gap-1.5 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setPreviewFilter('ALL')}
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition ${
                    previewFilter === 'ALL'
                      ? 'bg-teal-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Semua ({parseResult?.previewList?.length || 0})
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewFilter('WARNINGS')}
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition ${
                    previewFilter === 'WARNINGS'
                      ? 'bg-amber-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Perlu Perhatian
                </button>
              </div>

              <div className="relative w-full sm:w-64">
                <input
                  type="text"
                  value={previewSearch}
                  onChange={(e) => setPreviewSearch(e.target.value)}
                  placeholder="Cari perawat atau tanggal..."
                  className="w-full px-3 py-1.5 pl-8 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                />
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              </div>
            </div>

            {/* Table Preview */}
            <div className="border border-slate-200 rounded-2xl overflow-hidden max-h-64 overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 font-bold text-slate-700">
                  <tr>
                    <th className="p-2.5">Tanggal</th>
                    <th className="p-2.5">Nama Perawat</th>
                    <th className="p-2.5">Sif Dikenali</th>
                    <th className="p-2.5">Kode Asli</th>
                    <th className="p-2.5">Mesin HD</th>
                    <th className="p-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredPreview.slice(0, 100).map((item, idx) => {
                    const shiftInfo = SHIFT_TYPE_INFO[item.shiftType];
                    return (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="p-2 font-mono text-slate-600">{item.date}</td>
                        <td className="p-2 font-semibold text-slate-800">{item.nurseName}</td>
                        <td className="p-2">
                          <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${shiftInfo?.badgeClass || 'bg-slate-200 text-slate-700'}`}>
                            {shiftInfo?.label || item.shiftType}
                          </span>
                        </td>
                        <td className="p-2 font-mono text-slate-400">{item.rawShiftCode}</td>
                        <td className="p-2 font-mono text-slate-600">
                          {item.assignedMachineIds && item.assignedMachineIds.length > 0
                            ? item.assignedMachineIds.map((m) => `M#${m}`).join(', ')
                            : '-'}
                        </td>
                        <td className="p-2">
                          {item.warning ? (
                            <span className="text-amber-600 flex items-center gap-1 text-[11px]">
                              <AlertTriangle className="w-3 h-3" />
                              <span>{item.warning}</span>
                            </span>
                          ) : (
                            <span className="text-emerald-600 flex items-center gap-1 text-[11px]">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Cocok</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          {step === 'PREVIEW' ? (
            <>
              <button
                type="button"
                onClick={() => setStep('SOURCE')}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl font-bold text-xs flex items-center gap-1.5 transition"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Pilih Sumber Lain</span>
              </button>
              <button
                type="button"
                onClick={handleApplyImport}
                className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold text-xs shadow-xs flex items-center gap-1.5 transition"
              >
                <Check className="w-4 h-4" />
                <span>Terapkan Impor ({parseResult?.assignments.length} Jadwal)</span>
              </button>
            </>
          ) : (
            <>
              <span className="text-[11px] text-slate-400">
                Pilih file atau sumber data untuk melihat pratinjau sebelum menyimpan.
              </span>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl font-bold text-xs transition"
              >
                Batal
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
