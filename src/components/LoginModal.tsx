import React, { useState } from 'react';
import { UserAccount } from '../types';
import { Activity, Lock, User, AlertCircle, Shield, UserCheck, Stethoscope, ChevronRight } from 'lucide-react';

interface LoginModalProps {
  employees: UserAccount[];
  onLogin: (user: UserAccount) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ employees, onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const matched = employees.find(
      (emp) => emp.username.toLowerCase() === username.trim().toLowerCase()
    );

    if (!matched) {
      setError('Username tidak ditemukan dalam sistem.');
      return;
    }

    if (matched.status === 'nonaktif') {
      setError('Akun Anda dinonaktifkan oleh Administrator. Hubungi admin.');
      return;
    }

    if (matched.password !== password) {
      setError('Password salah. Silakan periksa kembali atau hubungi Administrator.');
      return;
    }

    onLogin(matched);
  };

  const handleQuickDemoLogin = (emp: UserAccount) => {
    setUsername(emp.username);
    setPassword(emp.password);
    onLogin(emp);
  };

  // Predefined demo accounts
  const adminAcc = employees.find((e) => e.role === 'admin');
  const karuAcc = employees.find((e) => e.role === 'kepala_ruangan');
  const pjAcc = employees.find((e) => e.role === 'pj_shift');
  const docAcc = employees.find((e) => e.role === 'dokter');
  const nurseAcc = employees.find((e) => e.role === 'perawat');

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-teal-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center px-4">
        <div className="inline-flex items-center justify-center p-2.5 sm:p-3 rounded-2xl bg-white shadow-xl mb-3 border border-teal-400/30">
          <img
            src="/logo_rshl.png"
            onError={(e) => {
              e.currentTarget.src = 'https://rshappyland.com/dist/img/logo/logo_happyland.png';
            }}
            alt="Logo RS Happy Land"
            className="h-10 sm:h-12 w-auto object-contain"
            referrerPolicy="no-referrer"
          />
        </div>
        <h2 className="text-2xl sm:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-teal-200 via-white to-cyan-200 tracking-wider">
          DIALISYNC
        </h2>
        <p className="mt-1 text-xs sm:text-sm text-teal-200/80">
          Sistem Manajemen Shift &amp; Mesin Unit Hemodialisa RS Happy Land
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <div className="bg-white py-8 px-6 shadow-2xl rounded-2xl sm:px-10 border border-slate-100">
          <div className="mb-6 pb-4 border-b border-slate-100">
            <h3 className="text-lg font-bold text-slate-900">Masuk ke Portal</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Akun dan kata sandi dikonfigurasi langsung oleh Administrator Unit HD
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Username Pegawai
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Masukkan username (contoh: admin)"
                  className="block w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg text-sm placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Kata Sandi (Password)
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Masukkan kata sandi"
                  className="block w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg text-sm placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full mt-2 flex justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 focus:outline-hidden focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 transition"
            >
              Masuk ke Sistem
            </button>
          </form>

          {/* Quick Demo Access Bar */}
          <div className="mt-6 pt-5 border-t border-slate-200">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2.5 text-center">
              Akses Cepat Pengujian (1-Klik):
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {adminAcc && (
                <button
                  type="button"
                  onClick={() => handleQuickDemoLogin(adminAcc)}
                  className={`p-2 rounded-lg border border-purple-200 bg-purple-50/50 hover:bg-purple-100/60 text-purple-900 text-left transition flex items-center justify-between ${
                    !karuAcc && !docAcc && !nurseAcc ? 'sm:col-span-2' : ''
                  }`}
                >
                  <div className="truncate pr-1">
                    <div className="font-bold flex items-center gap-1">
                      <Shield className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                      <span>Admin</span>
                    </div>
                    <div className="text-[10px] text-purple-600 font-mono">admin / admin123</div>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                </button>
              )}

              {karuAcc && (
                <button
                  type="button"
                  onClick={() => handleQuickDemoLogin(karuAcc)}
                  className="p-2 rounded-lg border border-amber-200 bg-amber-50/50 hover:bg-amber-100/60 text-amber-900 text-left transition flex items-center justify-between"
                >
                  <div className="truncate pr-1">
                    <div className="font-bold flex items-center gap-1">
                      <UserCheck className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>Kepala Ruang</span>
                    </div>
                    <div className="text-[10px] text-amber-600 font-mono">{karuAcc.username} / {karuAcc.password}</div>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                </button>
              )}

              {pjAcc && (
                <button
                  type="button"
                  onClick={() => handleQuickDemoLogin(pjAcc)}
                  className="p-2 rounded-lg border border-emerald-200 bg-emerald-50/50 hover:bg-emerald-100/60 text-emerald-900 text-left transition flex items-center justify-between"
                >
                  <div className="truncate pr-1">
                    <div className="font-bold flex items-center gap-1">
                      <UserCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>KATIM (Ketua Tim)</span>
                    </div>
                    <div className="text-[10px] text-emerald-600 font-mono">{pjAcc.username} / {pjAcc.password}</div>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                </button>
              )}

              {docAcc && (
                <button
                  type="button"
                  onClick={() => handleQuickDemoLogin(docAcc)}
                  className="p-2 rounded-lg border border-blue-200 bg-blue-50/50 hover:bg-blue-100/60 text-blue-900 text-left transition flex items-center justify-between"
                >
                  <div className="truncate pr-1">
                    <div className="font-bold flex items-center gap-1">
                      <Stethoscope className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <span>Dokter HD</span>
                    </div>
                    <div className="text-[10px] text-blue-600 font-mono">dr.hendra / hendra123</div>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                </button>
              )}

              {nurseAcc && (
                <button
                  type="button"
                  onClick={() => handleQuickDemoLogin(nurseAcc)}
                  className="p-2 rounded-lg border border-teal-200 bg-teal-50/50 hover:bg-teal-100/60 text-teal-900 text-left transition flex items-center justify-between"
                >
                  <div className="truncate pr-1">
                    <div className="font-bold flex items-center gap-1">
                      <Activity className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                      <span>Perawat HD</span>
                    </div>
                    <div className="text-[10px] text-teal-600 font-mono">ns.budi / budi123</div>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Operational Notice */}
        <div className="mt-4 text-center text-xs text-slate-400 leading-relaxed">
          <p>
            Aturan Mutlak: <span className="text-teal-300 font-semibold">Hari Minggu Libur Rutin</span> &bull;{' '}
            <span className="text-teal-300 font-semibold">Kepala Ruang Shift Pagi Setiap Hari</span>
          </p>
        </div>
      </div>
    </div>
  );
};
