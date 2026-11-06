import React, { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '../api/client';
import { useUsbCardReader } from '../utils/usbReader';
import { playSuccessChime, playDuplicateChime, playErrorChime } from '../utils/audioFeedback';
import {
  Radio,
  CheckCircle2,
  AlertTriangle,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  RefreshCw,
  UserPlus,
  Clock,
  Sparkles,
  Search,
  Check,
  Usb,
} from 'lucide-react';

interface SessionItem {
  id: string;
  title: string;
  state: string;
  scheduled_start: string;
  scheduled_end: string;
}

interface Attendee {
  person_id: string;
  external_id: string;
  full_name: string;
  group_name?: string;
  card_uid?: string;
  marked_present_at?: string | null;
  is_late?: boolean;
  source?: string;
}

interface AttendanceSummary {
  totalExpected: number;
  presentCount: number;
  absentCount: number;
  lateCount: number;
}

interface RecentEvent {
  id: string;
  event_id: string;
  card_uid_logged: string;
  outcome: 'ACCEPTED' | 'DUPLICATE' | 'REJECTED' | 'NEEDS_REVIEW';
  outcome_reason?: string;
  person_name?: string;
  external_id?: string;
  created_at: string;
}

interface LastScanResult {
  outcome: 'ACCEPTED' | 'DUPLICATE' | 'REJECTED' | 'CARD_NOT_REGISTERED';
  cardUid: string;
  personName?: string;
  externalId?: string;
  markedPresentAt?: string;
  isLate?: boolean;
  message?: string;
  timestamp: Date;
}

export const UsbScanner: React.FC = () => {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [sessionData, setSessionData] = useState<{
    session?: SessionItem;
    summary?: AttendanceSummary;
    attendees?: Attendee[];
    recentEvents?: RecentEvent[];
  }>({});
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [lastScan, setLastScan] = useState<LastScanResult | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterTab, setFilterTab] = useState<'all' | 'present' | 'absent'>('all');

  // Quick enroll modal state
  const [showEnrollModal, setShowEnrollModal] = useState<boolean>(false);
  const [enrollCardUid, setEnrollCardUid] = useState<string>('');
  const [enrollPersonId, setEnrollPersonId] = useState<string>('');
  const [enrollSubmitting, setEnrollSubmitting] = useState<boolean>(false);
  const [enrollSuccessMsg, setEnrollSuccessMsg] = useState<string | null>(null);

  // Manual test UID input
  const [customTestUid, setCustomTestUid] = useState<string>('');

  const kioskRef = useRef<HTMLDivElement>(null);

  // Load Sessions
  const loadSessions = async () => {
    try {
      const data = await apiFetch<SessionItem[]>('/sessions');
      // Filter active or review sessions
      const openSessions = data.filter((s) => s.state === 'OPEN' || s.state === 'REVIEW' || s.state === 'DRAFT');
      setSessions(openSessions.length > 0 ? openSessions : data);

      if (openSessions.length > 0 && !selectedSessionId) {
        // Pick first OPEN session or first available
        const firstOpen = openSessions.find((s) => s.state === 'OPEN') || openSessions[0];
        setSelectedSessionId(firstOpen.id);
      }
    } catch (err) {
      console.error('Failed to load sessions', err);
    }
  };

  // Load live attendance details for current session
  const loadAttendance = useCallback(async (sessionId: string) => {
    if (!sessionId) return;
    try {
      const res = await apiFetch<{
        session: SessionItem;
        summary: AttendanceSummary;
        attendees: Attendee[];
        recentEvents: RecentEvent[];
      }>(`/sessions/${sessionId}/attendance`);
      setSessionData(res);
    } catch (err) {
      console.error('Failed to load attendance', err);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, []);

  useEffect(() => {
    if (selectedSessionId) {
      loadAttendance(selectedSessionId);
    }
  }, [selectedSessionId, loadAttendance]);

  // Handle card scan processing
  const handleCardTap = useCallback(
    async (cardUid: string) => {
      if (!selectedSessionId) return;

      const eventId = crypto.randomUUID();
      const nowIso = new Date().toISOString();

      try {
        const res = await apiFetch<any>(`/sessions/${selectedSessionId}/scan`, {
          method: 'POST',
          body: JSON.stringify({
            eventId,
            cardUid,
            deviceEventTime: nowIso,
          }),
        });

        if (res.outcome === 'ACCEPTED') {
          if (soundEnabled) playSuccessChime();
          setLastScan({
            outcome: 'ACCEPTED',
            cardUid,
            personName: res.personName,
            markedPresentAt: res.markedPresentAt || nowIso,
            isLate: res.isLate,
            timestamp: new Date(),
          });
        } else if (res.outcome === 'DUPLICATE') {
          if (soundEnabled) playDuplicateChime();
          setLastScan({
            outcome: 'DUPLICATE',
            cardUid,
            personName: res.personName,
            markedPresentAt: res.markedPresentAt,
            message: 'Already checked in',
            timestamp: new Date(),
          });
        } else {
          if (soundEnabled) playErrorChime();
          const isUnregistered = res.reason === 'CARD_NOT_REGISTERED' || res.reason === 'PERSON_NOT_IN_SESSION_ROSTER';
          setLastScan({
            outcome: isUnregistered ? 'CARD_NOT_REGISTERED' : 'REJECTED',
            cardUid,
            message: res.reason || 'Card not recognized',
            timestamp: new Date(),
          });
        }

        // Refresh attendance roster
        await loadAttendance(selectedSessionId);
      } catch (err: any) {
        if (soundEnabled) playErrorChime();
        setLastScan({
          outcome: 'REJECTED',
          cardUid,
          message: err.message || 'Scan processing failed',
          timestamp: new Date(),
        });
      }
    },
    [selectedSessionId, soundEnabled, loadAttendance]
  );

  // USB Card Reader Hook
  const {
    isCapturing,
    webHidSupported,
    webHidConnected,
    webHidDeviceName,
    connectWebHid,
    disconnectWebHid,
    simulateScan,
  } = useUsbCardReader({
    onCardScanned: handleCardTap,
    isEnabled: !showEnrollModal,
  });

  // Toggle Fullscreen Kiosk Mode
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      kioskRef.current?.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // Handle Quick Card Enrollment
  const handleQuickEnroll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enrollPersonId || !enrollCardUid) return;

    setEnrollSubmitting(true);
    try {
      await apiFetch('/cards/register', {
        method: 'POST',
        body: JSON.stringify({
          cardUid: enrollCardUid,
          personId: enrollPersonId,
        }),
      });

      setEnrollSuccessMsg('Card linked successfully! Checking in student now...');
      
      // Auto-scan immediately to mark attendance
      await handleCardTap(enrollCardUid);

      setTimeout(() => {
        setShowEnrollModal(false);
        setEnrollSuccessMsg(null);
        setEnrollPersonId('');
        setEnrollCardUid('');
      }, 1200);
    } catch (err: any) {
      alert(`Card registration failed: ${err.message}`);
    } finally {
      setEnrollSubmitting(false);
    }
  };

  const openEnrollModalForCard = (uid: string) => {
    setEnrollCardUid(uid);
    setShowEnrollModal(true);
  };

  const summary = sessionData.summary || {
    totalExpected: 0,
    presentCount: 0,
    absentCount: 0,
    lateCount: 0,
  };

  const attendancePercent =
    summary.totalExpected > 0 ? Math.round((summary.presentCount / summary.totalExpected) * 100) : 0;

  const filteredAttendees = (sessionData.attendees || []).filter((a) => {
    const matchesSearch =
      a.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.external_id.toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;

    if (filterTab === 'present') return a.marked_present_at !== null && a.marked_present_at !== undefined;
    if (filterTab === 'absent') return !a.marked_present_at;
    return true;
  });

  return (
    <div ref={kioskRef} className="space-y-6 pb-12">
      {/* Top Banner & Hardware Controls */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-3 w-3 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <span>Desktop USB NFC Roll Call Station</span>
              <span className="text-xs font-mono font-medium px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200">
                Live Kiosk
              </span>
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Tap cards onto any attachable USB NFC / RFID reader (ACR122U, Neuftech, Sycreader). No manual focus or clicks required.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Session Selector */}
          <select
            value={selectedSessionId}
            onChange={(e) => setSelectedSessionId(e.target.value)}
            className="px-3 py-2 text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 focus:outline-none"
          >
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                [{s.state}] {s.title}
              </option>
            ))}
          </select>

          {/* WebHID Connect Button (Chromium) */}
          {webHidSupported && (
            <button
              onClick={webHidConnected ? disconnectWebHid : () => connectWebHid().catch(() => {})}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl border transition-all ${
                webHidConnected
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
              title={webHidConnected ? `Connected to ${webHidDeviceName}` : 'Connect ACR122U direct USB'}
            >
              <Usb className="w-3.5 h-3.5" />
              <span>{webHidConnected ? webHidDeviceName || 'USB Reader' : 'WebHID USB'}</span>
            </button>
          )}

          {/* Sound Toggle */}
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-2 rounded-xl border transition-all ${
              soundEnabled
                ? 'bg-sky-50 text-sky-700 border-sky-200'
                : 'bg-slate-50 text-slate-400 border-slate-200'
            }`}
            title={soundEnabled ? 'Audio Feedback Enabled' : 'Audio Muted'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* Fullscreen Button */}
          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-xl bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100 transition-all"
            title="Toggle Kiosk Fullscreen"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          {/* Refresh */}
          <button
            onClick={() => loadAttendance(selectedSessionId)}
            className="p-2 rounded-xl bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100 transition-all"
            title="Refresh Attendance"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Grid: Interactive Tap Sensor & Live Progress Gauge */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Interactive Tap Terminal */}
        <div className="lg:col-span-1 space-y-6">
          {/* Card Tap Pad */}
          <div
            className={`relative overflow-hidden rounded-3xl border-2 transition-all duration-300 p-8 text-center flex flex-col items-center justify-center min-h-[320px] shadow-sm ${
              isCapturing
                ? 'bg-sky-50 border-sky-400 scale-[1.02] shadow-sky-200/50'
                : 'bg-gradient-to-b from-white to-slate-50 border-slate-200'
            }`}
          >
            {/* Background Radar Waves */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
              <div className="w-64 h-64 border border-sky-400 rounded-full animate-ping"></div>
              <div className="w-48 h-48 border border-sky-300 rounded-full absolute"></div>
              <div className="w-32 h-32 border border-sky-200 rounded-full absolute"></div>
            </div>

            {/* Central NFC Sensor Icon */}
            <div
              className={`relative z-10 w-24 h-24 rounded-full flex items-center justify-center mb-4 transition-transform duration-300 shadow-md ${
                isCapturing
                  ? 'bg-sky-500 text-white scale-110 shadow-sky-500/40'
                  : 'bg-slate-900 text-sky-400 shadow-slate-900/20'
              }`}
            >
              <Radio className={`w-12 h-12 ${isCapturing ? 'animate-pulse' : ''}`} />
            </div>

            <div className="relative z-10 space-y-1">
              <h3 className="font-bold text-slate-900 text-base">
                {isCapturing ? 'Reading Card...' : 'Ready for Card Tap'}
              </h3>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                Hold physical NFC / RFID card to your desktop USB reader to take attendance.
              </p>
            </div>

            {/* Ambient Reader Status Pill */}
            <div className="mt-5 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>USB Wedge Listener Active (Zero-Click)</span>
            </div>
          </div>

          {/* Last Tap Banner */}
          {lastScan && (
            <div
              className={`rounded-2xl p-5 border shadow-sm transition-all animate-in fade-in slide-in-from-top-2 duration-300 ${
                lastScan.outcome === 'ACCEPTED'
                  ? 'bg-emerald-50/80 border-emerald-300 text-emerald-950'
                  : lastScan.outcome === 'DUPLICATE'
                  ? 'bg-amber-50/80 border-amber-300 text-amber-950'
                  : 'bg-rose-50/80 border-rose-300 text-rose-950'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="shrink-0 mt-0.5">
                  {lastScan.outcome === 'ACCEPTED' && (
                    <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                  )}
                  {lastScan.outcome === 'DUPLICATE' && (
                    <Clock className="w-6 h-6 text-amber-600" />
                  )}
                  {(lastScan.outcome === 'REJECTED' || lastScan.outcome === 'CARD_NOT_REGISTERED') && (
                    <AlertTriangle className="w-6 h-6 text-rose-600" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-xs font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${
                        lastScan.outcome === 'ACCEPTED'
                          ? 'bg-emerald-200/70 text-emerald-900'
                          : lastScan.outcome === 'DUPLICATE'
                          ? 'bg-amber-200/70 text-amber-900'
                          : 'bg-rose-200/70 text-rose-900'
                      }`}
                    >
                      {lastScan.outcome.replace('_', ' ')}
                    </span>
                    <span className="text-[11px] text-slate-500 font-mono">
                      {lastScan.timestamp.toLocaleTimeString()}
                    </span>
                  </div>

                  <h4 className="font-bold text-base mt-2 truncate text-slate-900">
                    {lastScan.personName || `Card: ${lastScan.cardUid}`}
                  </h4>

                  {lastScan.outcome === 'ACCEPTED' && (
                    <div className="mt-1 text-xs text-emerald-800 space-y-0.5">
                      <p>Marked present at {new Date(lastScan.markedPresentAt!).toLocaleTimeString()}</p>
                      {lastScan.isLate && (
                        <span className="inline-block px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">
                          LATE ARRIVAL
                        </span>
                      )}
                    </div>
                  )}

                  {lastScan.outcome === 'DUPLICATE' && (
                    <p className="mt-1 text-xs text-amber-800">
                      Already checked in. Double-tap ignored safely.
                    </p>
                  )}

                  {lastScan.outcome === 'CARD_NOT_REGISTERED' && (
                    <div className="mt-2 space-y-2">
                      <p className="text-xs text-rose-800">
                        Card UID <code className="font-mono bg-rose-100 px-1 py-0.5 rounded">{lastScan.cardUid}</code> is unmapped.
                      </p>
                      <button
                        onClick={() => openEnrollModalForCard(lastScan.cardUid)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-rose-600 hover:bg-rose-500 text-white shadow-sm transition-colors"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>Enroll This Card Now</span>
                      </button>
                    </div>
                  )}

                  {lastScan.outcome === 'REJECTED' && (
                    <p className="mt-1 text-xs text-rose-800">{lastScan.message}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Quick Hardware Simulation Panel (Allows testing without physical reader) */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-sky-500" />
                <span>Simulate USB Reader Tap</span>
              </span>
              <span className="text-[10px] text-slate-400 font-mono">Test Hardware Logic</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => simulateScan('04A1B2C3')}
                className="text-left px-3 py-2 rounded-xl bg-slate-50 hover:bg-sky-50 hover:border-sky-200 border border-slate-200 transition-colors text-xs"
              >
                <div className="font-semibold text-slate-800">Jane Doe</div>
                <div className="font-mono text-[10px] text-slate-500">04A1B2C3</div>
              </button>

              <button
                onClick={() => simulateScan('04A1B2C4')}
                className="text-left px-3 py-2 rounded-xl bg-slate-50 hover:bg-sky-50 hover:border-sky-200 border border-slate-200 transition-colors text-xs"
              >
                <div className="font-semibold text-slate-800">John Smith</div>
                <div className="font-mono text-[10px] text-slate-500">04A1B2C4</div>
              </button>

              <button
                onClick={() => simulateScan('04A1B2C5')}
                className="text-left px-3 py-2 rounded-xl bg-slate-50 hover:bg-sky-50 hover:border-sky-200 border border-slate-200 transition-colors text-xs"
              >
                <div className="font-semibold text-slate-800">Alice Wonder</div>
                <div className="font-mono text-[10px] text-slate-500">04A1B2C5</div>
              </button>

              <button
                onClick={() => simulateScan('04B999FF')}
                className="text-left px-3 py-2 rounded-xl bg-slate-50 hover:bg-rose-50 hover:border-rose-200 border border-slate-200 transition-colors text-xs"
              >
                <div className="font-semibold text-rose-700">Unregistered Card</div>
                <div className="font-mono text-[10px] text-slate-500">04B999FF</div>
              </button>
            </div>

            <div className="pt-2 flex gap-2">
              <input
                type="text"
                data-scanner-input="true"
                placeholder="Custom UID or Wedge test..."
                value={customTestUid}
                onChange={(e) => setCustomTestUid(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && customTestUid) {
                    simulateScan(customTestUid);
                    setCustomTestUid('');
                  }
                }}
                className="flex-1 px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-200 focus:ring-2 focus:ring-sky-500 focus:outline-none"
              />
              <button
                onClick={() => {
                  if (customTestUid) {
                    simulateScan(customTestUid);
                    setCustomTestUid('');
                  }
                }}
                className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors"
              >
                Tap
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Live Session Attendance Roll & Gauge */}
        <div className="lg:col-span-2 space-y-6">
          {/* Summary Progress Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Attendance</span>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-slate-900">{attendancePercent}%</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-1.5 mt-3 overflow-hidden">
                <div
                  className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${attendancePercent}%` }}
                ></div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm">
              <span className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wider">Present</span>
              <div className="mt-1 text-3xl font-extrabold text-emerald-700">{summary.presentCount}</div>
              <span className="text-[11px] text-slate-400 mt-1 block">Checked In</span>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm">
              <span className="text-[11px] font-semibold text-amber-600 uppercase tracking-wider">Absent</span>
              <div className="mt-1 text-3xl font-extrabold text-amber-700">{summary.absentCount}</div>
              <span className="text-[11px] text-slate-400 mt-1 block">Not Arrived</span>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm">
              <span className="text-[11px] font-semibold text-indigo-600 uppercase tracking-wider">Expected</span>
              <div className="mt-1 text-3xl font-extrabold text-indigo-700">{summary.totalExpected}</div>
              <span className="text-[11px] text-slate-400 mt-1 block">Total Roster</span>
            </div>
          </div>

          {/* Roster Table with Live Status */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            {/* Header / Filter Toolbar */}
            <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setFilterTab('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    filterTab === 'all'
                      ? 'bg-white shadow-sm text-slate-900 border border-slate-200'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  All ({summary.totalExpected})
                </button>
                <button
                  onClick={() => setFilterTab('present')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    filterTab === 'present'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Present ({summary.presentCount})
                </button>
                <button
                  onClick={() => setFilterTab('absent')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    filterTab === 'absent'
                      ? 'bg-amber-50 text-amber-800 border border-amber-200'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Absent ({summary.absentCount})
                </button>
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Filter by name or student ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 focus:ring-2 focus:ring-sky-500 focus:outline-none w-full sm:w-60 bg-white"
                />
              </div>
            </div>

            {/* Attendees List */}
            <div className="divide-y divide-slate-100 max-h-[460px] overflow-y-auto">
              {filteredAttendees.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  No matching attendees found.
                </div>
              ) : (
                filteredAttendees.map((a) => {
                  const isPresent = Boolean(a.marked_present_at);
                  return (
                    <div
                      key={a.person_id}
                      className={`p-4 flex items-center justify-between gap-4 transition-colors ${
                        isPresent ? 'bg-emerald-50/20' : 'hover:bg-slate-50/50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs ${
                            isPresent
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {a.full_name.charAt(0)}
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-slate-900 text-xs">{a.full_name}</h4>
                            {a.card_uid ? (
                              <span className="font-mono text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                                {a.card_uid}
                              </span>
                            ) : (
                              <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                                No Card Assigned
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                            ID: {a.external_id} {a.group_name && `• ${a.group_name}`}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        {isPresent ? (
                          <div className="text-right">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              <Check className="w-3 h-3 text-emerald-600" />
                              <span>Present</span>
                            </span>
                            <span className="block text-[10px] text-slate-400 font-mono mt-0.5">
                              {new Date(a.marked_present_at!).toLocaleTimeString()}
                            </span>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-500">
                            <span>Absent</span>
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Quick Card Enrollment Modal */}
      {showEnrollModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-900 font-bold">
                <UserPlus className="w-5 h-5 text-sky-600" />
                <h3>Enroll Unregistered Card</h3>
              </div>
              <button
                onClick={() => setShowEnrollModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Link card <code className="font-mono bg-sky-50 text-sky-700 px-1.5 py-0.5 rounded font-bold">{enrollCardUid}</code> to an attendee on the roster.
            </p>

            {enrollSuccessMsg ? (
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600" />
                <span>{enrollSuccessMsg}</span>
              </div>
            ) : (
              <form onSubmit={handleQuickEnroll} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Select Attendee to Map
                  </label>
                  <select
                    required
                    value={enrollPersonId}
                    onChange={(e) => setEnrollPersonId(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500 bg-white"
                  >
                    <option value="">-- Choose student from roster --</option>
                    {(sessionData.attendees || []).map((att) => (
                      <option key={att.person_id} value={att.person_id}>
                        {att.full_name} ({att.external_id}) {att.card_uid ? `[Current: ${att.card_uid}]` : '[Unassigned]'}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowEnrollModal(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={enrollSubmitting || !enrollPersonId}
                    className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold disabled:opacity-50 shadow-sm"
                  >
                    {enrollSubmitting ? 'Linking...' : 'Map Card & Check In'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
