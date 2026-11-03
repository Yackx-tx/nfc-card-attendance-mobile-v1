import React, { useState, useEffect } from 'react';
import { apiFetch } from '../api/client';
import { CreditCard, Search, Check, AlertCircle } from 'lucide-react';

export const CardRegistration: React.FC = () => {
  const [people, setPeople] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [selectedPerson, setSelectedPerson] = useState<any | null>(null);
  const [cardUid, setCardUid] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      p.external_id.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">NFC Card Registration & Management</h1>
        <p className="text-sm text-slate-500 mt-1">
          Map physical smart cards / tags to roster members. Card UIDs are stored normalized and validated.
        </p>
      </div>

      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center gap-2">
          <Check className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-center gap-2">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Attendees List */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="font-bold text-slate-900">Roster Members ({people.length})</h2>
            <div className="relative w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Search name or ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
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
                    isSelected ? 'bg-sky-50 border border-sky-200' : 'hover:bg-slate-50'
                  }`}
                >
                  <div>
                    <div className="font-semibold text-sm text-slate-900">{p.full_name}</div>
                    <div className="text-xs text-slate-500 font-mono">
                      ID: <span className="text-sky-700 font-medium">{p.external_id}</span>
                      {p.group_name && ` • ${p.group_name}`}
                    </div>
                  </div>
                  <div>
                    {p.card_uid ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-mono font-medium bg-slate-100 text-slate-700">
                        <CreditCard className="w-3.5 h-3.5 text-sky-600" />
                        {p.card_uid}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400 italic">No card linked</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Card Assignment Box */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
          <h2 className="font-bold text-slate-900 flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-sky-600" />
            Assign Smart Card
          </h2>

          {selectedPerson ? (
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-xs text-slate-500 uppercase font-semibold">Selected Attendee</div>
                <div className="font-bold text-slate-900 text-sm mt-0.5">{selectedPerson.full_name}</div>
                <div className="text-xs text-slate-500 font-mono">External ID: {selectedPerson.external_id}</div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Scan or Enter NFC Card UID
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 04A1B2C3D4"
                  value={cardUid}
                  onChange={(e) => setCardUid(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono uppercase rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Supports hex UID formats with or without colons (e.g. 04:A1:B2:C3).
                </p>
              </div>

              <button
                type="submit"
                disabled={submitting || !cardUid}
                className="w-full py-2.5 px-4 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium text-sm transition-colors disabled:opacity-50"
              >
                {submitting ? 'Linking...' : 'Confirm Card Assignment'}
              </button>
            </form>
          ) : (
            <div className="text-center py-12 text-slate-400 text-sm">
              Select an attendee from the list to assign or replace their smart card.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
