import React, { useState } from 'react';
import { X, Copy, Check, FileSpreadsheet, ExternalLink, HelpCircle } from 'lucide-react';
import { GoogleSheetsService } from '../domain/GoogleSheetsService';

interface GoogleScriptGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GoogleScriptGuideModal: React.FC<GoogleScriptGuideModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);
  const scriptCode = GoogleSheetsService.getGoogleAppsScriptTemplate();

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(scriptCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]"
        id="google-script-guide-modal"
      >
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-850">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 rounded-2xl border border-emerald-100 dark:border-emerald-900">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base sm:text-lg">
                Panduan Integrasi Google Sheets (2-Arah Tanpa Kuota)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Otomatis mengelola tab Jadwal, Perawat, Mesin & Bays di Spreadsheet Anda
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4 text-sm">
          {/* Notice for updating script if multi-month tabs or doctor sheets are missing */}
          <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/60 rounded-2xl p-4 space-y-2">
            <h4 className="font-extrabold text-amber-900 dark:text-amber-200 flex items-center gap-1.5 text-xs">
              <HelpCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              Pembaruan: Sinkronisasi Parsial / Terarah & Tampilan Jadwal Dokter Kronologis
            </h4>
            <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
              Dengan versi script terbaru ini:
              <br />• <b>Sinkronisasi Parsial / Terarah:</b> Anda kini dapat memilih bagian data tertentu saja (misal: hanya jadwal perawat, hanya jadwal dokter, atau hanya alokasi mesin) untuk dikirim ke Google Sheets secara cepat dan instan tanpa harus mengirim semua data sekaligus!
              <br />• <b>Jadwal Dokter Persis Sistem:</b> Otomatis membuat tab bulanan <b>"Jadwal Dokter - [Bulan]"</b> (misal: <i>Jadwal Dokter - September 2026</i>) dan tab arsip <b>"Jadwal Dokter HD"</b> dengan susunan kolom No, Tanggal, Hari, Dokter Shift Pagi (07:00-14:00), Dokter Shift Siang (13:30-20:30), Status Dinas (berwarna sesuai badge sistem), dan Catatan.
              <br />• <b>Urutan Kronologis Sesuai Tanggal:</b> Baris jadwal terurut rapi dari tanggal 1 sampai akhir bulan tanpa data tumpang tindih. Hari Minggu otomatis ditandai libur rutin dan di bawah tabel dilengkapi <b>Ringkasan Beban Jaga Dokter Bulan Ini</b>.
              <br />Jika Anda sudah memasang script versi sebelumnya, sangat disarankan memperbarui kode di Google Sheets:
            </p>
            <ol className="list-decimal list-inside text-xs text-amber-800 dark:text-amber-300 space-y-1.5 pl-1">
              <li>Buka spreadsheet Anda &gt; menu <b>Extensions (Ekstensi)</b> &gt; <b>Apps Script</b>.</li>
              <li>Hapus kode lama, lalu <b>Paste (Tempel)</b> seluruh kode terbaru dari tombol di bawah.</li>
              <li>
                Klik tombol biru <b>Deploy (Terapkan)</b> &gt; pilih <b>Manage deployments (Kelola penerapan)</b>.
              </li>
              <li>
                Klik ikon <b>Pensil (Edit)</b> pada deployment aktif, ubah <b>Version</b> ke <b className="underline">New version (Versi baru)</b>, lalu klik <b>Deploy</b>.
              </li>
              <li>
                Selesai! Tab Google Sheet Anda kini otomatis memiliki tampilan jadwal dokter yang rapi, berurut tanggal, dan persis seperti di aplikasi.
              </li>
            </ol>
          </div>

          {/* Step by step */}
          <div className="bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-2xl p-4 space-y-2">
            <h4 className="font-bold text-emerald-950 dark:text-emerald-200 flex items-center gap-1.5 text-xs">
              <HelpCircle className="w-4 h-4 text-emerald-600" />
              Langkah Singkat Setup Baru (3 Menit):
            </h4>
            <ol className="list-decimal list-inside text-xs text-emerald-800 dark:text-emerald-300 space-y-1.5 pl-1">
              <li>Buka spreadsheet baru di Google Sheets Anda.</li>
              <li>
                Pilih menu atas: <b>Extensions (Ekstensi)</b> &gt; <b>Apps Script</b>.
              </li>
              <li>Hapus semua teks bawaan, lalu <b>Paste (Tempel)</b> kode di bawah ini.</li>
              <li>
                Klik tombol biru <b>Deploy (Terapkan)</b> &gt; <b>New deployment (Penerapan baru)</b>.
              </li>
              <li>
                Pilih tipe: <b>Web app</b>. Atur <i>Who has access (Siapa yang memiliki akses)</i> ke{' '}
                <b className="underline">"Anyone" (Siapa saja)</b>.
              </li>
              <li>
                Salin <b>Web App URL</b> (berakhiran <code className="bg-emerald-100/80 dark:bg-emerald-900/80 px-1 py-0.5 rounded-sm">/exec</code>) dan tempelkan ke kolom URL Webhook di halaman Sinkronisasi.
              </li>
            </ol>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 space-y-2">
            <span className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              Struktur Baku 7 Sheet di Google Sheets (Urut Sesuai Standar):
            </span>
            <ol className="list-decimal list-inside space-y-1.5 text-[11px] text-slate-600 dark:text-slate-300 pl-1">
              <li>
                <b>Master Mesin:</b> Berisi daftar nama dan data area yang urut sesuai dengan urutan pada denah ruangan (Area A s.d. Area F, lalu Ruang Isolasi).
              </li>
              <li>
                <b>Master Perawat:</b> Berisi nomor ID perawat, Nama Perawat, NIP, Nomor WhatsApp, Peran/Jabatan (Karu, Katim, Pelaksana), dan Status Aktif.
              </li>
              <li>
                <b>Master Dokter:</b> Berisi nomor ID Dokter, Nama Dokter, NIP, Nomor WhatsApp, Peran/Jabatan (DPJP / Dokter Ruangan), dan Status Aktif.
              </li>
              <li>
                <b>Data alokasi mesin:</b> Berisi catatan/log alokasi mesin HD yang sudah di-inputkan untuk shif pagi dan siang urut sesuai tanggal.
              </li>
              <li>
                <b>Data tugas khusus:</b> Berisi data Tugas Khusus yang sudah di-inputkan untuk kedua shif dengan urutan sesuai tanggal dan shif pagi (PJ shif, BHP, Farmasi Logistik, Natrium RO lalu CITO) dilanjutkan shif siang (PJ shif, BHP, Farmasi Logistik, Natrium RO lalu CITO).
              </li>
              <li>
                <b>Matrik Jadwal Perawat:</b> Matriks kalender bulanan 1..31 hari (P, S, 2S, L, C, SK, I) dengan pewarnaan otomatis dan rekap beban harian.
              </li>
              <li>
                <b>Matrik Jadwal Dokter:</b> Matrik jadwal dinas dokter Sif Pagi & Siang 1..31 hari dengan highlight hari Minggu dan ringkasan beban jaga bulanan.
              </li>
            </ol>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Kode Google Apps Script (`Code.gs`):
              </span>
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs font-semibold shadow-xs transition-all"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Tersalin ke Clipboard!' : 'Salin Semua Kode'}
              </button>
            </div>
            <pre className="p-3.5 bg-slate-900 text-emerald-400 rounded-2xl font-mono text-xs overflow-x-auto max-h-60 border border-slate-800 leading-relaxed select-all">
              {scriptCode}
            </pre>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-850">
          <a
            href="https://script.google.com"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            Buka Google Apps Script <ExternalLink className="w-3 h-3" />
          </a>
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-white bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 dark:hover:bg-slate-600 rounded-xl transition-colors"
          >
            Tutup Panduan
          </button>
        </div>
      </div>
    </div>
  );
};
