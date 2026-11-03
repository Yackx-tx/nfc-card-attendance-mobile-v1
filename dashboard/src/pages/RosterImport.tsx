import React, { useState } from 'react';
import { apiFetch } from '../api/client';
import { UploadCloud, CheckCircle2, AlertTriangle, FileSpreadsheet, ArrowRight } from 'lucide-react';

export const RosterImport: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [committedResult, setCommittedResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    const selectedFile = e.target.files[0];
    setFile(selectedFile);
    setPreview(null);
    setCommittedResult(null);
    setError(null);
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const res = await apiFetch<any>('/people/import/preview', {
        method: 'POST',
        body: formData,
      });

      setPreview(res);
    } catch (err: any) {
      setError(err.message || 'Failed to parse spreadsheet');
    } finally {
      setLoading(false);
    }
  };

  const handleCommit = async () => {
    if (!preview?.previewRows) return;
    setCommitting(true);
    setError(null);

    try {
      const res = await apiFetch<any>('/people/import/commit', {
        method: 'POST',
        body: JSON.stringify({ rows: preview.previewRows }),
      });

      setCommittedResult(res);
    } catch (err: any) {
      setError(err.message || 'Failed to commit roster');
    } finally {
      setCommitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Roster Import & Versioning</h1>
        <p className="text-sm text-slate-500 mt-1">
          Upload Excel rosters to publish immutable versions for session authorization. Identifiers with leading zeros are strictly preserved.
        </p>
      </div>

      {/* Upload Box */}
      <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm text-center">
        <label className="cursor-pointer block border-2 border-dashed border-slate-300 rounded-xl p-8 hover:border-sky-500 transition-colors">
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileChange}
            className="hidden"
          />
          <div className="mx-auto w-12 h-12 rounded-full bg-sky-50 flex items-center justify-center text-sky-600 mb-3">
            <UploadCloud className="w-6 h-6" />
          </div>
          <p className="font-semibold text-slate-800">
            {file ? file.name : 'Select or drag & drop attendance roster spreadsheet'}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Columns: External ID (Col 1), Full Name (Col 2), Email (Col 3), Group (Col 4)
          </p>
        </label>
      </div>

      {loading && (
        <div className="text-center py-8 text-slate-500 text-sm animate-pulse">
          Parsing spreadsheet and validating identifier formats...
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Preview Section */}
      {preview && !committedResult && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-bold text-slate-900 flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-sky-600" />
                Roster Preview & Validation
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Total Rows: {preview.totalRows} | Valid: {preview.validCount} | Duplicates: {preview.duplicateCount}
              </p>
            </div>

            <button
              onClick={handleCommit}
              disabled={committing || preview.validCount === 0}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium text-sm transition-colors shadow-sm disabled:opacity-50"
            >
              <span>{committing ? 'Publishing Version...' : 'Confirm & Commit Roster'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs uppercase font-semibold border-b border-slate-100">
                <tr>
                  <th className="py-3 px-4">External ID</th>
                  <th className="py-3 px-4">Full Name</th>
                  <th className="py-3 px-4">Email</th>
                  <th className="py-3 px-4">Group</th>
                  <th className="py-3 px-4">Leading Zero Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {preview.previewRows.map((row: any, idx: number) => (
                  <tr key={idx} className="hover:bg-slate-50/50">
                    <td className="py-3 px-4 font-mono font-medium text-sky-700 bg-sky-50/30">
                      {row.externalId}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-800">{row.fullName}</td>
                    <td className="py-3 px-4 text-slate-500">{row.email || '—'}</td>
                    <td className="py-3 px-4 text-slate-500">{row.groupName || '—'}</td>
                    <td className="py-3 px-4">
                      {row.externalId.startsWith('0') ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3" /> Preserved as text
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">Standard</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Committed Result */}
      {committedResult && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-emerald-900 space-y-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-100 rounded-full text-emerald-700">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-lg">Roster Published Successfully</h3>
              <p className="text-sm text-emerald-700">
                Version #{committedResult.versionNumber} is now live and available for session authorizations.
              </p>
            </div>
          </div>
          <div className="bg-white/80 backdrop-blur rounded-xl p-4 text-xs font-mono text-slate-700 border border-emerald-100 space-y-1">
            <div><span className="font-semibold">Roster Version ID:</span> {committedResult.rosterVersionId}</div>
            <div><span className="font-semibold">Total Members:</span> {committedResult.totalMembers}</div>
            <div><span className="font-semibold">SHA-256 Digest:</span> {committedResult.digestSha256}</div>
          </div>
        </div>
      )}
    </div>
  );
};
