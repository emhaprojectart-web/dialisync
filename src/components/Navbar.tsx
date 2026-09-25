import React from 'react';
import { UserAccount, UserRole, ShiftSchedule, HDMachine, MachineAssignment, AppSettings, SpecialTask } from '../types';
import { SyncStatus } from '../services/cloudSync';
import { 
  Activity, 
  User, 
  LogOut, 
  Shield, 
  UserCheck, 
  Stethoscope, 
  Clock, 
  Calendar,
  Layers,
  ChevronDown,
  CloudCheck,
  Cloud,
  FileSpreadsheet
} from 'lucide-react';
import { HeaderGoogleSheetSync } from './HeaderGoogleSheetSync';

interface NavbarProps {
  currentUser: UserAccount;
  allEmployees: UserAccount[];
  activeTab: 'dashboard' | 'jadwal' | 'mesin' | 'tugas' | 'karyawan';
  setActiveTab: (tab: 'dashboard' | 'jadwal' | 'mesin' | 'tugas' | 'karyawan') => void;
  onLogout: () => void;
  onSwitchUser: (user: UserAccount) => void;
  syncStatus?: SyncStatus;
  settings?: AppSettings;
  onUpdateSettings?: (newSettings: AppSettings) => void;
  schedules?: ShiftSchedule[];
  machines?: HDMachine[];
  machineAssignments?: MachineAssignment[];
  specialTasks?: SpecialTask[];
  onUpdateSchedule?: (newSchedules: ShiftSchedule[]) => void;
  onUpdateMachineAssignments?: (newAssignments: MachineAssignment[]) => void;
  onUpdateEmployees?: (newEmployees: UserAccount[]) => void;
  onUpdateMachines?: (newMachines: HDMachine[]) => void;
  onUpdateSpecialTasks?: (newTasks: SpecialTask[]) => void;
  operationalDate?: string;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  allEmployees,
  activeTab,
  setActiveTab,
  onLogout,
  onSwitchUser,
  syncStatus = 'connected',
  settings,
  onUpdateSettings,
  schedules = [],
  machines = [],
  machineAssignments = [],
  specialTasks = [],
  onUpdateSchedule,
  onUpdateMachineAssignments,
  onUpdateEmployees,
  onUpdateMachines,
  onUpdateSpecialTasks,
  operationalDate,
}) => {
  const [showSwitchMenu, setShowSwitchMenu] = React.useState(false);
  const [currentTime, setCurrentTime] = React.useState(new Date());

  React.useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'admin':
        return {
          label: 'Administrator',
          bg: 'bg-purple-100 text-purple-800 border-purple-200',
          icon: Shield,
        };
      case 'kepala_ruangan':
      case 'karu':
        return {
          label: 'Kepala Ruangan HD',
          bg: 'bg-amber-100 text-amber-800 border-amber-200',
          icon: UserCheck,
        };
      case 'pj_shift':
      case 'katim':
        return {
          label: 'KATIM HD',
          bg: 'bg-emerald-100 text-emerald-800 border-emerald-200',
          icon: UserCheck,
        };
      case 'dokter':
        return {
          label: 'Dokter Hemodialisa',
          bg: 'bg-blue-100 text-blue-800 border-blue-200',
          icon: Stethoscope,
        };
      case 'perawat':
      case 'nurse':
      default:
        return {
          label: 'Perawat Mahir HD',
          bg: 'bg-teal-100 text-teal-800 border-teal-200',
          icon: Activity,
        };
    }
  };

  const badgeInfo = getRoleBadge(currentUser.role);
  const RoleIcon = badgeInfo.icon;

  const timeString = currentTime.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const dateString = currentTime.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <header className="bg-gradient-to-r from-teal-950 via-slate-900 to-cyan-950 text-white border-b border-teal-800/50 sticky top-0 z-40 shadow-md">
      {/* Top Banner with Hospital Info and Real-time Clock */}
      <div className="bg-black/30 text-slate-200 px-3 sm:px-4 py-1.5 text-[10px] sm:text-xs font-medium flex flex-wrap items-center justify-between gap-y-1 border-b border-teal-900/50">
        <div className="flex items-center space-x-2 sm:space-x-3 overflow-hidden">
          <span className="flex items-center text-teal-300 font-semibold tracking-wide shrink-0">
            <Activity className="w-3 h-3 sm:w-3.5 sm:h-3.5 mr-1 animate-pulse text-teal-400" />
            <span className="hidden sm:inline">UNIT DIALISIS - </span>RS HAPPY LAND<span className="hidden md:inline"> MEDICAL CENTRE YOGYAKARTA</span>
          </span>
          <span className="text-slate-600 hidden sm:inline">|</span>
          <div className="flex items-center space-x-1 sm:space-x-1.5 text-[10px] sm:text-xs shrink-0">
            <span className="text-slate-400 hidden lg:inline">Database Cloud:</span>
            {syncStatus === 'connected' ? (
              <span className="inline-flex items-center text-emerald-300 font-semibold bg-emerald-950/70 px-2 py-0.5 rounded-full border border-emerald-700/60 shadow-2xs">
                <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-emerald-400 animate-ping mr-1 sm:mr-1.5 shrink-0"></span>
                <span><span className="hidden sm:inline">Firestore </span>Cloud Aktif</span>
              </span>
            ) : syncStatus === 'connecting' ? (
              <span className="inline-flex items-center text-amber-300 font-medium bg-amber-950/70 px-2 py-0.5 rounded-full border border-amber-700/60">
                <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-amber-400 animate-pulse mr-1 sm:mr-1.5 shrink-0"></span>
                <span>Sinkronisasi...</span>
              </span>
            ) : (
              <span className="inline-flex items-center text-cyan-300 font-medium bg-cyan-950/70 px-2 py-0.5 rounded-full border border-cyan-800/60">
                <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-cyan-400 mr-1 sm:mr-1.5 shrink-0"></span>
                <span>Offline</span>
              </span>
            )}
          </div>

          {/* Google Sheets Sync Pill in Top Banner */}
          <span className="text-slate-600 hidden md:inline">|</span>
          <div className="hidden md:flex items-center space-x-1 sm:space-x-1.5 text-[10px] sm:text-xs shrink-0">
            <span className="text-slate-400 hidden lg:inline">Google Sheets:</span>
            <span className="inline-flex items-center text-teal-300 font-semibold bg-teal-950/70 px-2 py-0.5 rounded-full border border-teal-700/60">
              <FileSpreadsheet className="w-3 h-3 text-emerald-400 mr-1" />
              <span>Tarik & Kirim Siap</span>
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-2 ml-auto text-slate-300 text-[10px] sm:text-xs">
          <div className="flex items-center space-x-1.5 bg-teal-950/60 px-2 sm:px-2.5 py-0.5 rounded-full border border-teal-800/60">
            <Calendar className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-teal-400" />
            <span className="hidden xs:inline">{dateString}</span>
            <span className="text-slate-600 hidden xs:inline">•</span>
            <Clock className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-teal-400" />
            <span className="font-mono text-teal-300 font-semibold">{timeString} WIB</span>
          </div>
        </div>
      </div>

      {/* Main Navigation Bar */}
      <div className="max-w-[1680px] mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex justify-between h-14 sm:h-16 items-center gap-2">
          {/* Logo & Title */}
          <div className="flex items-center space-x-2 sm:space-x-3 shrink-0">
            <div className="h-8 sm:h-10 md:h-11 px-1.5 sm:px-2.5 py-0.5 sm:py-1 bg-white rounded-xl shadow-md shadow-teal-500/10 flex items-center justify-center border border-teal-400/30 shrink-0">
              <img
                src="/logo_rshl.png"
                onError={(e) => {
                  e.currentTarget.src = 'https://rshappyland.com/dist/img/logo/logo_happyland.png';
                }}
                alt="Logo RSHL Rumah Sakit Happy Land"
                className="h-full w-auto max-h-6 sm:max-h-7 md:max-h-8 object-contain"
                referrerPolicy="no-referrer"
              />
            </div>
            <div>
              <h1 id="app-header-title" className="text-sm sm:text-base md:text-xl font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-teal-100 via-white to-cyan-200 leading-none">
                DIALISYNC
              </h1>
              <span className="text-[9px] sm:text-[10px] md:text-xs text-teal-300/90 font-semibold tracking-wide block mt-0.5 sm:mt-1">
                RS Happy Land HD
              </span>
            </div>
          </div>

          {/* Nav Tabs */}
          <nav className="hidden md:flex items-center space-x-1 lg:space-x-1.5">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`h-10 px-3.5 rounded-xl text-sm font-semibold transition-colors flex items-center space-x-2 shrink-0 cursor-pointer ${
                activeTab === 'dashboard'
                  ? 'bg-teal-500/25 text-teal-300 border border-teal-400/50 shadow-xs'
                  : 'text-slate-300 hover:text-white hover:bg-white/10'
              }`}
            >
              <Activity className="w-4 h-4" />
              <span>Dashboard HD</span>
            </button>

            <button
              onClick={() => setActiveTab('jadwal')}
              className={`h-10 px-3.5 rounded-xl text-sm font-semibold transition-colors flex items-center space-x-2 shrink-0 cursor-pointer ${
                activeTab === 'jadwal'
                  ? 'bg-teal-500/25 text-teal-300 border border-teal-400/50 shadow-xs'
                  : 'text-slate-300 hover:text-white hover:bg-white/10'
              }`}
            >
              <Calendar className="w-4 h-4" />
              <span>Jadwal Shift</span>
            </button>

            <button
              onClick={() => setActiveTab('mesin')}
              className={`h-10 px-3.5 rounded-xl text-sm font-semibold transition-colors flex items-center space-x-2 shrink-0 cursor-pointer ${
                activeTab === 'mesin'
                  ? 'bg-teal-500/25 text-teal-300 border border-teal-400/50 shadow-xs'
                  : 'text-slate-300 hover:text-white hover:bg-white/10'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>Pembagian Mesin</span>
            </button>

            <button
              onClick={() => setActiveTab('tugas')}
              className={`h-10 px-3.5 rounded-xl text-sm font-semibold transition-colors flex items-center space-x-2 shrink-0 cursor-pointer ${
                activeTab === 'tugas'
                  ? 'bg-teal-500/25 text-teal-300 border border-teal-400/50 shadow-xs'
                  : 'text-slate-300 hover:text-white hover:bg-white/10'
              }`}
            >
              <Activity className="w-4 h-4" />
              <span>Tugas Khusus</span>
            </button>

            {currentUser.role === 'admin' && (
              <button
                onClick={() => setActiveTab('karyawan')}
                className={`h-10 px-3.5 rounded-xl text-sm font-semibold transition-colors flex items-center space-x-2 shrink-0 cursor-pointer ${
                  activeTab === 'karyawan'
                    ? 'bg-purple-500/25 text-purple-300 border border-purple-400/50 shadow-xs'
                    : 'text-slate-300 hover:text-white hover:bg-white/10'
                }`}
              >
                <Shield className="w-4 h-4" />
                <span>Akun Karyawan</span>
              </button>
            )}
          </nav>

          {/* User Profile & Quick Switcher */}
          <div className="flex items-center space-x-2 sm:space-x-2.5">
            {/* Quick Switch Dropdown for interactive demo testing */}
            <div className="relative">
              <button
                onClick={() => setShowSwitchMenu(!showSwitchMenu)}
                className="flex items-center space-x-2 px-2.5 sm:px-3 rounded-xl border border-teal-800/60 hover:border-teal-700 bg-slate-800/70 hover:bg-slate-800/90 text-left transition h-10 sm:h-11 cursor-pointer shrink-0"
                title="Ganti sudut pandang / peran akun staf"
              >
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-teal-500 text-slate-950 font-bold flex items-center justify-center text-xs shrink-0 shadow-xs">
                  {currentUser.name.substring(0, 2).toUpperCase()}
                </div>
                <div className="hidden sm:block">
                  <div className="text-xs font-bold text-slate-100 leading-tight truncate max-w-[110px] md:max-w-[140px]">
                    {currentUser.name}
                  </div>
                  <div className="flex items-center space-x-1 mt-0.5">
                    <span className={`text-[9px] md:text-[10px] px-1.5 py-0.2 rounded font-semibold border ${badgeInfo.bg}`}>
                      {badgeInfo.label}
                    </span>
                  </div>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-teal-300 shrink-0" />
              </button>

              {showSwitchMenu && (
                <div className="absolute right-0 mt-2 w-72 max-w-[90vw] bg-slate-900 rounded-2xl shadow-2xl border border-teal-800/70 py-2 z-50 text-white">
                  <div className="px-3 py-2 border-b border-slate-800">
                    <p className="text-xs font-semibold text-teal-300 uppercase tracking-wider">
                      Login Sebagai (Demo Switcher)
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Pilih staf untuk menguji tampilan staf vs administrator
                    </p>
                  </div>

                  <div className="max-h-60 overflow-y-auto py-1 divide-y divide-slate-800/50">
                    {Array.from(new Map((allEmployees || []).map((e) => [e.id, e])).values()).map((emp) => {
                      const isCurrent = emp.id === currentUser.id;
                      return (
                        <button
                          key={emp.id}
                          onClick={() => {
                            onSwitchUser(emp);
                            setShowSwitchMenu(false);
                          }}
                          className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between hover:bg-slate-800 transition min-h-[40px] cursor-pointer ${
                            isCurrent ? 'bg-teal-950/80 font-semibold text-teal-300' : 'text-slate-200'
                          }`}
                        >
                          <div className="truncate pr-2">
                            <div className="font-semibold text-slate-100 truncate">{emp.name}</div>
                            <div className="text-slate-400 text-[10px] capitalize truncate">
                              {emp.role.replace('_', ' ')} • @{emp.username}
                            </div>
                          </div>
                          {isCurrent && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-teal-500/20 border border-teal-400/40 text-teal-300 rounded font-bold shrink-0">
                              Aktif
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  <div className="border-t border-slate-800 px-3 pt-2 mt-1">
                    <button
                      onClick={() => {
                        setShowSwitchMenu(false);
                        onLogout();
                      }}
                      className="w-full text-left text-xs text-rose-400 font-semibold flex items-center space-x-1.5 py-1.5 hover:text-rose-300 min-h-[38px] cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Keluar (Logout dari Akun)</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={onLogout}
              className="w-10 h-10 rounded-xl bg-slate-800/60 hover:bg-rose-950/50 border border-teal-800/60 hover:border-rose-700/60 text-slate-300 hover:text-rose-300 transition flex items-center justify-center shrink-0 cursor-pointer"
              title="Keluar dari akun (Logout)"
            >
              <LogOut className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>

        {/* Mobile Tab Navigation (Horizontal Scroll with Touch-Friendly Pills) */}
        <div className="md:hidden flex items-center space-x-1.5 py-2 overflow-x-auto border-t border-teal-900/40 scrollbar-none">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`h-9 px-3.5 rounded-xl text-xs font-bold whitespace-nowrap flex items-center gap-1.5 transition active:scale-95 cursor-pointer shrink-0 ${
              activeTab === 'dashboard'
                ? 'bg-teal-500 text-slate-950 shadow-sm'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Activity className="w-3.5 h-3.5 shrink-0" />
            <span>Dashboard</span>
          </button>
          <button
            onClick={() => setActiveTab('jadwal')}
            className={`h-9 px-3.5 rounded-xl text-xs font-bold whitespace-nowrap flex items-center gap-1.5 transition active:scale-95 cursor-pointer shrink-0 ${
              activeTab === 'jadwal'
                ? 'bg-teal-500 text-slate-950 shadow-sm'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Calendar className="w-3.5 h-3.5 shrink-0" />
            <span>Jadwal Shift</span>
          </button>
          <button
            onClick={() => setActiveTab('mesin')}
            className={`h-9 px-3.5 rounded-xl text-xs font-bold whitespace-nowrap flex items-center gap-1.5 transition active:scale-95 cursor-pointer shrink-0 ${
              activeTab === 'mesin'
                ? 'bg-teal-500 text-slate-950 shadow-sm'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Layers className="w-3.5 h-3.5 shrink-0" />
            <span>Mesin HD</span>
          </button>
          <button
            onClick={() => setActiveTab('tugas')}
            className={`h-9 px-3.5 rounded-xl text-xs font-bold whitespace-nowrap flex items-center gap-1.5 transition active:scale-95 cursor-pointer shrink-0 ${
              activeTab === 'tugas'
                ? 'bg-teal-500 text-slate-950 shadow-sm'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Activity className="w-3.5 h-3.5 shrink-0" />
            <span>Tugas Khusus</span>
          </button>
          {currentUser.role === 'admin' && (
            <button
              onClick={() => setActiveTab('karyawan')}
              className={`h-9 px-3.5 rounded-xl text-xs font-bold whitespace-nowrap flex items-center gap-1.5 transition active:scale-95 cursor-pointer shrink-0 ${
                activeTab === 'karyawan'
                  ? 'bg-purple-500 text-white shadow-sm'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Shield className="w-3.5 h-3.5 shrink-0" />
              <span>Karyawan</span>
            </button>
          )}
        </div>
      </div>

      {/* Header Sync Google Sheets (Tarik & Kirim Data) */}
      {settings && onUpdateSettings && onUpdateSchedule && onUpdateMachineAssignments && onUpdateEmployees && (
        <HeaderGoogleSheetSync
          schedules={schedules}
          employees={allEmployees}
          machines={machines}
          machineAssignments={machineAssignments}
          specialTasks={specialTasks}
          settings={settings}
          onUpdateSettings={onUpdateSettings}
          onUpdateSchedule={onUpdateSchedule}
          onUpdateMachineAssignments={onUpdateMachineAssignments}
          onUpdateEmployees={onUpdateEmployees}
          onUpdateMachines={onUpdateMachines}
          onUpdateSpecialTasks={onUpdateSpecialTasks}
          operationalDate={operationalDate}
          canEdit={currentUser.role === 'admin' || currentUser.role === 'kepala_ruangan' || currentUser.role === 'karu' || currentUser.role === 'pj_shift'}
        />
      )}
    </header>
  );
};
