/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  UserAccount, 
  ShiftSchedule, 
  HDMachine, 
  MachineAssignment, 
  SpecialTask,
  MachineZoneConfig,
  AppSettings
} from './types';
import { storage, isInvalidNurseAccount } from './utils/storage';
import { getTodayDateString } from './utils/scheduler';
import { cloudSync, SyncStatus } from './services/cloudSync';
import { Navbar } from './components/Navbar';
import { LoginModal } from './components/LoginModal';
import { DashboardView } from './components/DashboardView';
import { ScheduleView } from './components/ScheduleView';
import { MachineView } from './components/MachineView';
import { SpecialTasksView } from './components/SpecialTasksView';
import { EmployeeManagementView } from './components/EmployeeManagementView';
import { Activity, ShieldCheck, RefreshCw, HeartPulse, Sparkles, AlertTriangle, X } from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [employees, setEmployees] = useState<UserAccount[]>([]);
  const [schedules, setSchedules] = useState<ShiftSchedule[]>([]);
  const [machines, setMachines] = useState<HDMachine[]>([]);
  const [zones, setZones] = useState<MachineZoneConfig[]>([]);
  const [machineAssignments, setMachineAssignments] = useState<MachineAssignment[]>([]);
  const [specialTasks, setSpecialTasks] = useState<SpecialTask[]>([]);
  const [settings, setSettings] = useState<AppSettings>(() => storage.getSettings());
  const [operationalDate, setOperationalDate] = useState<string>(() => getTodayDateString());
  const [activeTab, setActiveTab] = useState<'dashboard' | 'jadwal' | 'mesin' | 'tugas' | 'karyawan'>('dashboard');
  const [showResetConfirmModal, setShowResetConfirmModal] = useState<boolean>(false);
  const [systemToast, setSystemToast] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('connecting');

  const handleUpdateSettings = (newSettings: AppSettings) => {
    setSettings(newSettings);
    storage.saveSettings(newSettings);
  };

  const setCleanEmployees = (data: UserAccount[]): UserAccount[] => {
    const seen = new Set<string>();
    const unique: UserAccount[] = [];
    for (const item of data) {
      if (item && item.id) {
        if (isInvalidNurseAccount(item)) {
          cloudSync.deleteEmployee(item.id).catch(() => {});
          continue;
        }
        if (!seen.has(item.id)) {
          seen.add(item.id);
          unique.push(item);
        }
      }
    }
    setEmployees(unique);
    return unique;
  };

  // Load state from local storage
  const loadAllData = () => {
    const user = storage.getCurrentUser();
    const emps = storage.getEmployees();
    const schs = storage.getSchedules();
    const machs = storage.getMachines();
    const zns = storage.getZones();
    const assigns = storage.getMachineAssignments();
    const tasks = storage.getSpecialTasks();

    // Default to admin user on initial load if no user is saved yet for seamless review
    if (!user && emps.length > 0) {
      const defaultAdmin = emps.find((e) => e.role === 'admin') || emps[0];
      storage.setCurrentUser(defaultAdmin);
      setCurrentUser(defaultAdmin);
    } else {
      setCurrentUser(user);
    }

    setCleanEmployees(emps);
    setSchedules(schs);
    setMachines(machs);
    setZones(zns);
    setMachineAssignments(assigns);
    setSpecialTasks(tasks);
  };

  useEffect(() => {
    // 1. Initial local load
    loadAllData();

    // 2. Start Real-time Cloud Sync with Firebase Firestore
    const stopCloudSync = cloudSync.startSync({
      onEmployees: (data) => {
        const unique = setCleanEmployees(data);
        storage.saveEmployees(unique);
      },
      onSchedules: (data) => {
        setSchedules(data);
        storage.saveSchedules(data);
      },
      onMachines: (data) => {
        setMachines(data);
        storage.saveMachines(data);
      },
      onZones: (data) => {
        setZones(data);
        storage.saveZones(data);
      },
      onAssignments: (data) => {
        setMachineAssignments(data);
        storage.saveMachineAssignments(data);
      },
      onSpecialTasks: (data) => {
        setSpecialTasks(data);
        storage.saveSpecialTasks(data);
      },
      onStatusChange: (status) => {
        setSyncStatus(status);
      },
    });

    // 3. Multi-tab storage listeners
    const handleStorageUpdate = () => {
      loadAllData();
    };

    window.addEventListener('storage', handleStorageUpdate);
    window.addEventListener('hd_data_updated', handleStorageUpdate);
    window.addEventListener('hd_auth_changed', handleStorageUpdate);

    return () => {
      stopCloudSync();
      window.removeEventListener('storage', handleStorageUpdate);
      window.removeEventListener('hd_data_updated', handleStorageUpdate);
      window.removeEventListener('hd_auth_changed', handleStorageUpdate);
    };
  }, []);

  // Handlers for state changes (optimistic local + background cloud sync)
  const handleUpdateSchedule = (newSchedules: ShiftSchedule[]) => {
    setSchedules(newSchedules);
    storage.saveSchedules(newSchedules);
    cloudSync.saveSchedules(newSchedules).catch((e) => console.error('[CloudSync] saveSchedules:', e));
  };

  const handleUpdateMachines = (newMachines: HDMachine[]) => {
    setMachines(newMachines);
    storage.saveMachines(newMachines);
    cloudSync.saveMachines(newMachines).catch((e) => console.error('[CloudSync] saveMachines:', e));
  };

  const handleUpdateZones = (newZones: MachineZoneConfig[]) => {
    setZones(newZones);
    storage.saveZones(newZones);
    cloudSync.saveZones(newZones).catch((e) => console.error('[CloudSync] saveZones:', e));
  };

  const handleUpdateAssignments = (newAssignments: MachineAssignment[]) => {
    setMachineAssignments(newAssignments);
    storage.saveMachineAssignments(newAssignments);
    cloudSync.saveMachineAssignments(newAssignments).catch((e) => console.error('[CloudSync] saveMachineAssignments:', e));
  };

  const handleUpdateTasks = (newTasks: SpecialTask[]) => {
    setSpecialTasks(newTasks);
    storage.saveSpecialTasks(newTasks);
    cloudSync.saveSpecialTasks(newTasks).catch((e) => console.error('[CloudSync] saveSpecialTasks:', e));
  };

  const handleUpdateEmployees = (newEmployees: UserAccount[]) => {
    const unique = setCleanEmployees(newEmployees);
    storage.saveEmployees(unique);
    cloudSync.saveEmployees(unique).catch((e) => console.error('[CloudSync] saveEmployees:', e));
  };

  const handleDeleteEmployee = (employeeId: string) => {
    const result = storage.deleteEmployee(employeeId);
    setEmployees(result.employees);
    setSchedules(result.schedules);
    setMachineAssignments(result.assignments);
    setSpecialTasks(result.tasks);
    if (result.currentUser) {
      setCurrentUser(result.currentUser);
    }
    cloudSync.deleteEmployee(employeeId).catch((e) => console.error('[CloudSync] deleteEmployee:', e));
    cloudSync.saveSchedules(result.schedules).catch((e) => console.error('[CloudSync] updateSchedulesAfterDelete:', e));
    cloudSync.saveMachineAssignments(result.assignments).catch((e) => console.error('[CloudSync] updateAssignmentsAfterDelete:', e));
    cloudSync.saveSpecialTasks(result.tasks).catch((e) => console.error('[CloudSync] updateTasksAfterDelete:', e));
  };

  const handleLogin = (user: UserAccount) => {
    storage.setCurrentUser(user);
    setCurrentUser(user);
    setActiveTab('dashboard');
  };

  const handleLogout = () => {
    storage.setCurrentUser(null);
    setCurrentUser(null);
  };

  const handleSwitchUser = (user: UserAccount) => {
    storage.setCurrentUser(user);
    setCurrentUser(user);
  };

  const handleExecuteResetData = async () => {
    storage.resetAllData();
    try {
      await cloudSync.resetToInitialDataset();
    } catch (err) {
      console.warn('Reset cloud dataset err:', err);
    }
    loadAllData();
    setShowResetConfirmModal(false);
    setSystemToast('Data sistem hemodialisa berhasil disinkronkan & direset ke konfigurasi awal.');
    setTimeout(() => setSystemToast(null), 4000);
  };

  // If no user is logged in, show Login View
  if (!currentUser) {
    return <LoginModal employees={employees} onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
      {/* Navigation Header */}
      <Navbar
        currentUser={currentUser}
        allEmployees={employees}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onLogout={handleLogout}
        onSwitchUser={handleSwitchUser}
        syncStatus={syncStatus}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
        schedules={schedules}
        machines={machines}
        machineAssignments={machineAssignments}
        specialTasks={specialTasks}
        onUpdateSchedule={handleUpdateSchedule}
        onUpdateMachineAssignments={handleUpdateAssignments}
        onUpdateEmployees={handleUpdateEmployees}
        onUpdateMachines={handleUpdateMachines}
        onUpdateSpecialTasks={handleUpdateTasks}
        operationalDate={operationalDate}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-[1680px] w-full mx-auto px-2.5 sm:px-4 md:px-6 lg:px-8 py-3.5 sm:py-6">
        {activeTab === 'dashboard' && (
          <DashboardView
            currentUser={currentUser}
            employees={employees}
            schedules={schedules}
            machines={machines}
            machineAssignments={machineAssignments}
            specialTasks={specialTasks}
            activeDate={operationalDate}
            onDateChange={setOperationalDate}
            onNavigate={(tab) => setActiveTab(tab)}
            onUpdateSchedule={handleUpdateSchedule}
            onUpdateEmployees={handleUpdateEmployees}
            onUpdateTaskStatus={(taskId, status) => {
              const updated = specialTasks.map((t) =>
                t.id === taskId
                  ? {
                      ...t,
                      status,
                      completedAt: status === 'completed' ? new Date().toISOString().substring(0, 16) : undefined,
                    }
                  : t
              );
              handleUpdateTasks(updated);
            }}
            settings={settings}
            onUpdateSettings={handleUpdateSettings}
          />
        )}

        {activeTab === 'jadwal' && (
          <ScheduleView
            currentUser={currentUser}
            employees={employees}
            schedules={schedules}
            specialTasks={specialTasks}
            onUpdateSchedule={handleUpdateSchedule}
            machines={machines}
            machineAssignments={machineAssignments}
            onUpdateMachineAssignments={handleUpdateAssignments}
            onUpdateSpecialTasks={handleUpdateTasks}
            settings={settings}
            onUpdateSettings={handleUpdateSettings}
          />
        )}

        {activeTab === 'mesin' && (
          <MachineView
            currentUser={currentUser}
            employees={employees}
            machines={machines}
            zones={zones}
            machineAssignments={machineAssignments}
            schedules={schedules}
            specialTasks={specialTasks}
            activeDate={operationalDate}
            onDateChange={setOperationalDate}
            onUpdateMachines={handleUpdateMachines}
            onUpdateZones={handleUpdateZones}
            onUpdateAssignments={handleUpdateAssignments}
          />
        )}

        {activeTab === 'tugas' && (
          <SpecialTasksView
            currentUser={currentUser}
            employees={employees}
            schedules={schedules}
            specialTasks={specialTasks}
            settings={settings}
            activeDate={operationalDate}
            onDateChange={setOperationalDate}
            onUpdateTasks={handleUpdateTasks}
            onUpdateSchedule={handleUpdateSchedule}
            onNavigate={(tab) => setActiveTab(tab as any)}
          />
        )}

        {activeTab === 'karyawan' && currentUser.role === 'admin' && (
          <EmployeeManagementView
            currentUser={currentUser}
            employees={employees}
            schedules={schedules}
            machines={machines}
            machineAssignments={machineAssignments}
            specialTasks={specialTasks}
            settings={settings}
            onUpdateEmployees={handleUpdateEmployees}
            onDeleteEmployee={handleDeleteEmployee}
            onUpdateSchedule={handleUpdateSchedule}
            onUpdateSettings={handleUpdateSettings}
          />
        )}
      </main>

      {/* Global System Toast */}
      {systemToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-xl border border-slate-800 flex items-center space-x-2 animate-fade-in">
          <ShieldCheck className="w-4 h-4 text-teal-400 shrink-0" />
          <span>{systemToast}</span>
        </div>
      )}

      {/* Modal: Confirm Reset Data */}
      {showResetConfirmModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span>Reset Seluruh Data</span>
              </h3>
              <button
                onClick={() => setShowResetConfirmModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="py-3 text-xs text-slate-600 space-y-2">
              <p>
                Apakah Anda yakin ingin mengembalikan seluruh data ke konfigurasi awal unit hemodialisa?
              </p>
              <p className="text-[11px] text-rose-600 font-semibold">
                Perubahan jadwal, penugasan khusus, dan akun karyawan baru yang belum tersimpan akan dikembalikan ke data default.
              </p>
            </div>
            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowResetConfirmModal(false)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleExecuteResetData}
                className="px-4 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition shadow-xs"
              >
                Ya, Reset Sekarang
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 mt-auto py-5 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <HeartPulse className="w-4 h-4 text-teal-600" />
            <span>Unit Hemodialisa - Sistem Manajemen Shift &amp; Mesin Terpadu</span>
            <span className="text-slate-300">|</span>
            <span className="font-semibold text-slate-700">Aturan: Minggu Libur Rutin</span>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={() => setShowResetConfirmModal(true)}
              className="text-[11px] text-slate-400 hover:text-rose-600 flex items-center space-x-1 transition cursor-pointer"
              title="Reset data ke konfigurasi awal"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Reset Data Demo</span>
            </button>
            <span className="text-slate-300">•</span>
            <span>Versi 2.5 HD</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
