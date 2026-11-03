import React, { useState } from 'react';
import { apiFetch, saveSession, UserSession } from '../api/client';
import { ShieldCheck, LogIn, AlertCircle } from 'lucide-react';

interface LoginProps {
  onLoginSuccess: (session: UserSession) => void;
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [orgSlug, setOrgSlug] = useState('demo-org');
  const [email, setEmail] = useState('admin@demo.com');
  const [password, setPassword] = useState('admin123');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const data = await apiFetch<any>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ orgSlug, email, password }),
      });

      const session: UserSession = {
        token: data.accessToken,
        refreshToken: data.refreshToken,
        user: data.user,
      };

      saveSession(session);
      onLoginSuccess(session);
    } catch (err: any) {
      setError(err.message || 'Login failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex p-3 rounded-2xl bg-sky-500/10 text-sky-400 mb-4 ring-1 ring-sky-500/20">
          <ShieldCheck className="w-10 h-10" />
        </div>
        <h2 className="text-3xl font-bold tracking-tight text-white">AMAS Portal</h2>
        <p className="mt-2 text-sm text-slate-400">Automated Mobile Attendance Operations</p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-slate-800 py-8 px-6 shadow-2xl rounded-2xl sm:px-10 border border-slate-700">
          <form className="space-y-5" onSubmit={handleSubmit}>
            {error && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Organization Identifier (Slug)
              </label>
              <input
                type="text"
                required
                value={orgSlug}
                onChange={(e) => setOrgSlug(e.target.value)}
                placeholder="e.g. greenwood-high"
                className="w-full px-4 py-2.5 rounded-lg bg-slate-900/60 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Operator Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="operator@org.com"
                className="w-full px-4 py-2.5 rounded-lg bg-slate-900/60 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg bg-slate-900/60 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 flex justify-center items-center gap-2 py-3 px-4 rounded-lg bg-sky-500 hover:bg-sky-400 text-white font-medium text-sm transition-colors shadow-lg shadow-sky-500/20 disabled:opacity-50"
            >
              <LogIn className="w-4 h-4" />
              {loading ? 'Authenticating...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
