import React, { useState, useEffect } from 'react';
import { apiFetch } from '../api/client';
import { Plus, CheckCircle, ShieldAlert, Lock, Play, RefreshCw, Smartphone, Radio } from 'lucide-react';

interface SessionsProps {
  onNavigateToScanner?: () => void;
}

export const Sessions: React.FC<SessionsProps> = ({ onNavigateToScanner }) => {
  const [sessions, setSessions] = useState<any[]>([]);
  const [rosterVersions, setRosterVersions] = useState<any[]>([]);
  const [selectedSession, setSelectedSession] = useState<any | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [title, setTitle] = useState('');
  const [rosterVersionId, setRosterVersionId] = useState('');
  const [offlinePackage, setOfflinePackage] = useState<any | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const [finalizationBlocker, setFinalizationBlocker] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchSessions = async () => {
    try {
      const data = await apiFetch<any[]>('/sessions');
      setSessions(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load sessions');
    }
  };

  const fetchRosterVersions = async () => {
    try {
      const data = await apiFetch<any[]>('/roster-versions');
      setRosterVersions(data);
      if (data.length > 0 && !rosterVersionId) {
        setRosterVersionId(data[0].id);
      }
    } catch {
      // Non-fatal if roster versions fail to load
    }
  };

  useEffect(() => {
    fetchSessions();
    fetchRosterVersions();
  }, []);

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const now = new Date();
      const end = new Date(now.getTime() + 4 * 60 * 60 * 1000); // 4 hours window

      await apiFetch('/sessions', {
        method: 'POST',
        body: JSON.stringify({
          title,
          rosterVersionId,
          scheduledStart: now.toISOString(),
          scheduledEnd: end.toISOString(),
        }),
      });

      setShowCreateModal(false);
      setTitle('');
      await fetchSessions();
    } catch (err: any) {
      setError(err.message || 'Failed to create session');
    }
  };

  const handleStateTransition = async (sessionId: string, targetState: string) => {
    setError(null);
    setSuccessMsg(null);
    try {
      await apiFetch(`/sessions/${sessionId}/state`, {
        method: 'POST',
        body: JSON.stringify({ targetState }),
      });
      setSuccessMsg(`Session moved to ${targetState}`);
      await fetchSessions();
      if (selectedSession?.id === sessionId) {
        const updated = await apiFetch<any>(`/sessions/${sessionId}`);
        setSelectedSession(updated);
      }
    } catch (err: any) {
      setError(err.message || 'State transition failed');
    }
  };

  const handleGetOfflinePackage = async (sessionId: string) => {
    setError(null);
    try {
      const pkg = await apiFetch<any>(`/sessions/${sessionId}/offline-package?deviceFingerprint=dashboard-preview`);
      setOfflinePackage(pkg);
    } catch (err: any) {
      setError(err.message || 'Failed to generate offline package');
    }
  };

  const handleFinalize = async (sessionId: string) => {
    setFinalizing(true);
    setError(null);
    setFinalizationBlocker(null);
    setSuccessMsg(null);

    try {
      const res = await apiFetch<any>(`/sessions/${sessionId}/finalize`, {
        method: 'POST',
        body: JSON.stringify({ forceAcknowledgeMissingDevices: true }),
      });

      setSuccessMsg(`Session Finalized! Snapshot recorded with ${res.totalAccepted} attendees.`);
      await fetchSessions();
      if (selectedSession?.id === sessionId) {
        const updated = await apiFetch<any>(`/sessions/${sessionId}`);
        setSelectedSession(updated);
      }
    } catch (err: any) {
      if (err.code === 'UNRESOLVED_EVENTS_EXIST' || err.code === 'ACTIVE_OFFLINE_LEASES_EXIST') {
        setFinalizationBlocker(err.message);
      } else {
        setError(err.message || 'Finalization rejected by server');
      }
    } finally {
      setFinalizing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Attendance Sessions</h1>
          <p className="text-sm text-slate-500 mt-1">
            Create, control, and authorize online and offline attendance sessions.
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium text-sm transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>New Session</span>
        </button>
      </div>

      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {finalizationBlocker && (
        <div className="p-5 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 text-sm space-y-2">
          <div className="font-bold flex items-center gap-2 text-amber-800">
            <Lock className="w-5 h-5 text-amber-600 shrink-0" />
            <span>Finalization Gate Blocked</span>
          </div>
          <p>{finalizationBlocker}</p>
          <p className="text-xs text-amber-700">
            Per ADR-003, finalization is strictly blocked server-side while unresolved events or pending synchronization exists.
          </p>
        </div>
      )}

      {/* Session Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {sessions.map((s) => (
          <div
            key={s.id}
            onClick={() => setSelectedSession(s)}
            className={`p-5 rounded-2xl border bg-white shadow-sm cursor-pointer transition-all ${
              selectedSession?.id === s.id ? 'ring-2 ring-sky-500 border-sky-500' : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="font-semibold text-slate-900 text-base">{s.title}</span>
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-bold tracking-wide uppercase ${
                  s.state === 'OPEN'
                    ? 'bg-emerald-100 text-emerald-800'
                    : s.state === 'REVIEW'
                    ? 'bg-amber-100 text-amber-800'
                    : s.state === 'FINALIZED'
                    ? 'bg-slate-100 text-slate-800'
                    : 'bg-sky-50 text-sky-700'
                }`}
              >
                {s.state}
              </span>
            </div>

            <div className="text-xs text-slate-500 space-y-1 font-mono">
              <div>Scheduled: {new Date(s.scheduled_start).toLocaleTimeString()} - {new Date(s.scheduled_end).toLocaleTimeString()}</div>
              <div>Created: {new Date(s.created_at).toLocaleDateString()}</div>
            </div>

            <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="text-sky-600 font-medium">Click to manage</span>
              <span className="text-slate-400 font-mono">{s.id.slice(0, 8)}...</span>
            </div>
          </div>
        ))}
      </div>

      {/* Selected Session Operational Drawer */}
      {selectedSession && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900">{selectedSession.title}</h2>
              <p className="text-xs text-slate-500 font-mono mt-0.5">Session ID: {selectedSession.id}</p>
            </div>
            <div className="flex items-center gap-2">
              {selectedSession.state === 'DRAFT' && (
                <button
                  onClick={() => handleStateTransition(selectedSession.id, 'OPEN')}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Open Session</span>
                </button>
              )}

              {selectedSession.state === 'OPEN' && (
                <>
                  {onNavigateToScanner && (
                    <button
                      onClick={onNavigateToScanner}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm"
                    >
                      <Radio className="w-3.5 h-3.5" />
                      <span>Launch Live USB Scanner</span>
                    </button>
                  )}

                  <button
                    onClick={() => handleGetOfflinePackage(selectedSession.id)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-sm"
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>Authorize Offline Scanner</span>
                  </button>

                  <button
                    onClick={() => handleStateTransition(selectedSession.id, 'REVIEW')}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold shadow-sm"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Close Scans & Start Review</span>
                  </button>
                </>
              )}

              {selectedSession.state === 'REVIEW' && (
                <button
                  onClick={() => handleFinalize(selectedSession.id)}
                  disabled={finalizing}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-sm disabled:opacity-50"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>{finalizing ? 'Validating Gate...' : 'Finalize Session'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Offline Authorization Inspector */}
          {offlinePackage && (
            <div className="bg-slate-900 rounded-xl p-5 text-white space-y-3">
              <div className="flex items-center justify-between text-xs border-b border-slate-800 pb-2">
                <span className="font-bold text-sky-400 flex items-center gap-2">
                  <Smartphone className="w-4 h-4" />
                  Ed25519 Signed Offline Package
                </span>
                <span className="font-mono text-slate-400">Algorithm: {offlinePackage.header.algorithm}</span>
              </div>
              <div className="text-xs font-mono space-y-1 text-slate-300">
                <div>Authorization ID: {offlinePackage.payload.authorizationId}</div>
                <div>Roster Version: {offlinePackage.payload.rosterVersion}</div>
                <div>Cached People Mappings: {offlinePackage.payload.peopleMappings.length}</div>
                <div>Max Lease Duration: {offlinePackage.payload.rules.maxLeaseSeconds / 3600} hours (Hard Ceiling 12h)</div>
                <div className="truncate text-slate-500">Signature: {offlinePackage.signature}</div>
              </div>
            </div>
          )}

          {/* Finalized Snapshot Viewer */}
          {selectedSession.state === 'FINALIZED' && selectedSession.finalized_snapshot && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-3">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                Immutable Official Attendance Snapshot
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                <div className="bg-white p-3 rounded-lg border border-slate-200">
                  <div className="text-xs text-slate-400 uppercase font-semibold">Expected</div>
                  <div className="text-xl font-bold text-slate-900">{selectedSession.finalized_snapshot.expectedCount}</div>
                </div>
                <div className="bg-white p-3 rounded-lg border border-slate-200">
                  <div className="text-xs text-slate-400 uppercase font-semibold">Present</div>
                  <div className="text-xl font-bold text-emerald-600">{selectedSession.finalized_snapshot.presentCount}</div>
                </div>
                <div className="bg-white p-3 rounded-lg border border-slate-200">
                  <div className="text-xs text-slate-400 uppercase font-semibold">Absent</div>
                  <div className="text-xl font-bold text-rose-600">{selectedSession.finalized_snapshot.absentCount}</div>
                </div>
                <div className="bg-white p-3 rounded-lg border border-slate-200">
                  <div className="text-xs text-slate-400 uppercase font-semibold">Late</div>
                  <div className="text-xl font-bold text-amber-600">{selectedSession.finalized_snapshot.lateCount}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* New Session Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl border border-slate-100">
            <h3 className="text-lg font-bold text-slate-900">Create Attendance Session</h3>

            <form onSubmit={handleCreateSession} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Session Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. CS101 Lecture - Section A"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Target Roster Version</label>
                {rosterVersions.length > 0 ? (
                  <select
                    required
                    value={rosterVersionId}
                    onChange={(e) => setRosterVersionId(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500 bg-white"
                  >
                    {rosterVersions.map((rv) => (
                      <option key={rv.id} value={rv.id}>
                        Version {rv.version_number} ({rv.total_members} students) - {new Date(rv.created_at).toLocaleDateString()}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    required
                    placeholder="Paste roster_version_id"
                    value={rosterVersionId}
                    onChange={(e) => setRosterVersionId(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
