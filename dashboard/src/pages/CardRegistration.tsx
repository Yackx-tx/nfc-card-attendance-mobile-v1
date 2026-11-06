import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../api/client';
import { useUsbCardReader } from '../utils/usbReader';
import { playSuccessChime, playDuplicateChime } from '../utils/audioFeedback';
import { CreditCard, Search, Check, AlertCircle, Radio, Sparkles, Usb } from 'lucide-react';

export const CardRegistration: React.FC = () => {
  const [people, setPeople] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [selectedPerson, setSelectedPerson] = useState<any | null>(null);
  const [cardUid, setCardUid] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hardwareDetectedMsg, setHardwareDetectedMsg] = useState<string | null>(null);

  const fetchPeople = async () => {
    try {
      const data = await apiFetch<any[]>('/people');
      setPeople(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load attendees');
    }
  };

  useEffect(() => {
    fetchPeople();
  }, []);

  // Handle hardware scan from Desktop USB NFC reader
  const handleHardwareScan = useCallback(
    (scannedUid: string) => {
      setCardUid(scannedUid);
      setError(null);

      // Check if this card is already assigned to an attendee
      const existingOwner = people.find(
        (p) => p.card_uid && p.card_uid.toUpperCase() === scannedUid.toUpperCase()
      );

      if (existingOwner) {
        playDuplicateChime();
        setSelectedPerson(existingOwner);
        setHardwareDetectedMsg(
          `Card ${scannedUid} is currently assigned to ${existingOwner.full_name} (${existingOwner.external_id}).`
        );
      } else {
        playSuccessChime();
        setHardwareDetectedMsg(`Hardware card tap detected: ${scannedUid}. Select an attendee to bind.`);
      }

      setTimeout(() => setHardwareDetectedMsg(null), 6000);
    },
    [people]
  );

  const { isCapturing, simulateScan } = useUsbCardReader({
    onCardScanned: handleHardwareScan,
    isEnabled: true,
  });

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPerson || !cardUid) return;

    setSubmitting(true);
    setError(null);
    setSuccessMsg(null);

    try {
      await apiFetch('/cards/register', {
        method: 'POST',
        body: JSON.stringify({
          personId: selectedPerson.id,
          cardUid: cardUid.trim(),
        }),
      });

      playSuccessChime();
      setSuccessMsg(`Card ${cardUid.toUpperCase()} successfully mapped to ${selectedPerson.full_name}`);
      setCardUid('');
      setSelectedPerson(null);
      await fetchPeople();
    } catch (err: any) {
      setError(err.message || 'Card registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredPeople = people.filter(
    (p) =>
      p.full_name.toLowerCase().includes(search.toLowerCase()) ||
      p.external_id.toLowerCase().includes(search.toLowerCase()) ||
      (p.card_uid && p.card_uid.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      {/* Header with USB Reader Status Badge */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">NFC Card Enrollment & Management</h1>
          <p className="text-xs text-slate-500 mt-1">
            Map physical smart cards to roster members. Tap any card on your desktop USB NFC reader to autofill UID.
          </p>
        </div>

        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 text-white text-xs shadow-sm">
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <Usb className="w-3.5 h-3.5 text-sky-400" />
          <span>USB Scanner Active</span>
        </div>
      </div>

      {hardwareDetectedMsg && (
        <div className="p-4 rounded-xl bg-sky-50 border border-sky-200 text-sky-900 text-xs flex items-center justify-between gap-2 animate-in fade-in">
          <div className="flex items-center gap-2 font-medium">
            <Radio className="w-4 h-4 text-sky-600 animate-pulse" />
            <span>{hardwareDetectedMsg}</span>
          </div>
          <span className="text-[10px] bg-sky-100 text-sky-700 px-2 py-0.5 rounded font-mono">USB TAP</span>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Attendees List */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-bold text-slate-900 text-sm">Roster Members ({people.length})</h2>
              <p className="text-[11px] text-slate-400">Click a student to link or replace their card.</p>
            </div>
            <div className="relative w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search name, ID, or card UID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
          </div>

          <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
            {filteredPeople.map((p) => {
              const isSelected = selectedPerson?.id === p.id;
              return (
                <div
                  key={p.id}
                  onClick={() => setSelectedPerson(p)}
                  className={`p-3.5 rounded-xl cursor-pointer transition-colors flex items-center justify-between ${
                    isSelected ? 'bg-sky-50 border border-sky-200 shadow-sm' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center font-bold text-xs text-slate-600">
                      {p.full_name.charAt(0)}
                    </div>
                    <div>
                      <div className="font-semibold text-xs text-slate-900">{p.full_name}</div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        ID: <span className="text-sky-700 font-medium">{p.external_id}</span>
                        {p.group_name && ` • ${p.group_name}`}
                      </div>
                    </div>
                  </div>

                  <div>
                    {p.card_uid ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-medium bg-slate-100 text-slate-700">
                        <CreditCard className="w-3.5 h-3.5 text-sky-600" />
                        {p.card_uid}
                      </span>
                    ) : (
                      <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                        Unmapped
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Card Assignment Box & Hardware Simulation */}
        <div className="space-y-4">
          <div
            className={`bg-white rounded-2xl border shadow-sm p-6 space-y-5 transition-all ${
              isCapturing ? 'border-sky-400 ring-2 ring-sky-200' : 'border-slate-200/80'
            }`}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-sky-600" />
                Assign Smart Card
              </h2>
              {isCapturing && (
                <span className="text-[10px] font-bold text-sky-600 bg-sky-50 px-2 py-0.5 rounded-full border border-sky-200 animate-pulse">
                  Card Detected
                </span>
              )}
            </div>

            {selectedPerson ? (
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-[11px] text-slate-400 uppercase font-bold tracking-wider">Target Attendee</div>
                  <div className="font-bold text-slate-900 text-sm mt-0.5">{selectedPerson.full_name}</div>
                  <div className="text-xs text-slate-500 font-mono">External ID: {selectedPerson.external_id}</div>
                  {selectedPerson.card_uid && (
                    <div className="text-[11px] text-slate-400 mt-1">
                      Current Card: <code className="font-mono">{selectedPerson.card_uid}</code>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Card UID (Tap USB reader or Type)
                  </label>
                  <input
                    type="text"
                    required
                    data-scanner-input="true"
                    placeholder="e.g. 04A1B2C3"
                    value={cardUid}
                    onChange={(e) => setCardUid(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono uppercase rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Tap physical card on desktop USB reader to autofill.
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedPerson(null)}
                    className="py-2.5 px-3 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || !cardUid}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs transition-colors disabled:opacity-50 shadow-sm"
                  >
                    {submitting ? 'Linking...' : 'Confirm Card Mapping'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="text-center py-8 text-slate-400 text-xs space-y-2">
                <CreditCard className="w-8 h-8 text-slate-300 mx-auto" />
                <p>Select an attendee from the list to map or replace their smart card.</p>
                <p className="text-[11px] text-slate-500">Or tap a card on the USB reader to detect it automatically.</p>
              </div>
            )}
          </div>

          {/* Quick Hardware Simulator */}
          <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-sky-500" />
              <span>Simulate Hardware Tap</span>
            </span>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={() => simulateScan('04A1B2C3')}
                className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-left text-[11px] hover:border-sky-300 transition-colors"
              >
                <div className="font-semibold text-slate-800">Jane's Card</div>
                <div className="font-mono text-slate-400">04A1B2C3</div>
              </button>
              <button
                onClick={() => simulateScan('04FEDCBA')}
                className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-left text-[11px] hover:border-sky-300 transition-colors"
              >
                <div className="font-semibold text-slate-800">Brand New Tag</div>
                <div className="font-mono text-slate-400">04FEDCBA</div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
