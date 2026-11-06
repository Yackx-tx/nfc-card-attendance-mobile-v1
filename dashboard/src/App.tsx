import React, { useState, useEffect } from 'react';
import { getStoredSession, clearSession, UserSession } from './api/client';
import { Login } from './pages/Login';
import { Sessions } from './pages/Sessions';
import { RosterImport } from './pages/RosterImport';
import { CardRegistration } from './pages/CardRegistration';
import { UsbScanner } from './pages/UsbScanner';
import {
  ShieldCheck,
  Calendar,
  FileSpreadsheet,
  CreditCard,
  LogOut,
  User,
  Radio,
  Usb,
} from 'lucide-react';

export const App: React.FC = () => {
  const [session, setSession] = useState<UserSession | null>(null);
  const [activeTab, setActiveTab] = useState<'sessions' | 'scanner' | 'cards' | 'roster'>('scanner');

  useEffect(() => {
    setSession(getStoredSession());
  }, []);

  const handleLogout = () => {
    clearSession();
    setSession(null);
  };

  if (!session) {
    return <Login onLoginSuccess={(s) => setSession(s)} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col antialiased">
      {/* Top Navigation */}
      <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-sky-500 rounded-xl text-white shadow-md shadow-sky-500/30">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold tracking-tight text-base">AMAS Operations</span>
              <span className="ml-2 text-xs font-mono text-sky-400 bg-sky-950/80 px-2 py-0.5 rounded border border-sky-800/50">
                v1.0-prod
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <User className="w-3.5 h-3.5 text-slate-400" />
              <span>{session.user.email}</span>
              <span className="bg-slate-800 px-2 py-0.5 rounded-full text-[10px] font-bold text-sky-400 border border-slate-700">
                {session.user.role}
              </span>
            </div>

            <button
              onClick={handleLogout}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex gap-1 border-t border-slate-800/80 overflow-x-auto">
          {/* USB Scanner Tab (Prominent) */}
          <button
            onClick={() => setActiveTab('scanner')}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold border-b-2 transition-all shrink-0 ${
              activeTab === 'scanner'
                ? 'border-emerald-500 text-emerald-400 bg-slate-800/60'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
            <span>Desktop USB Scanner (Kiosk)</span>
            <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[9px] font-mono bg-emerald-950 text-emerald-400 border border-emerald-800/60 font-bold">
              <Usb className="w-2.5 h-2.5" />
              LIVE
            </span>
          </button>

          <button
            onClick={() => setActiveTab('sessions')}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold border-b-2 transition-all shrink-0 ${
              activeTab === 'sessions'
                ? 'border-sky-500 text-sky-400 bg-slate-800/40'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>Attendance Sessions</span>
          </button>

          <button
            onClick={() => setActiveTab('cards')}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold border-b-2 transition-all shrink-0 ${
              activeTab === 'cards'
                ? 'border-sky-500 text-sky-400 bg-slate-800/40'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            <span>Card Enrollment</span>
          </button>

          <button
            onClick={() => setActiveTab('roster')}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold border-b-2 transition-all shrink-0 ${
              activeTab === 'roster'
                ? 'border-sky-500 text-sky-400 bg-slate-800/40'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Roster Import</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'scanner' && <UsbScanner />}
        {activeTab === 'sessions' && <Sessions onNavigateToScanner={() => setActiveTab('scanner')} />}
        {activeTab === 'cards' && <CardRegistration />}
        {activeTab === 'roster' && <RosterImport />}
      </main>
    </div>
  );
};
