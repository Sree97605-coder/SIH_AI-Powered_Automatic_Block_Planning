import React, { useState } from 'react';
import { ArrowRight, LockKeyhole, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const LoginScreen: React.FC = () => {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await login(username, password);
    } catch {
      setError('Invalid username or password.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-12 bg-transparent">
      <section className="w-full max-w-md glass-card-elevated border border-[var(--border-medium)] p-8 sm:p-10">
        <div className="flex items-center gap-3 mb-8">
          <div className="p-3 rounded-2xl bg-[var(--accent-amber-bg)] text-[var(--accent-amber)]">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--accent-amber)]">Control Office</p>
            <h1 className="font-display text-2xl font-bold text-[var(--text-heading)]">TrackSynex access</h1>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="space-y-5">
          <label className="block">
            <span className="block mb-2 text-xs font-mono uppercase text-[var(--text-muted)]">Username</span>
            <input required value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-3 text-sm text-[var(--text-heading)] outline-none focus:border-[var(--accent-amber)]" />
          </label>
          <label className="block">
            <span className="block mb-2 text-xs font-mono uppercase text-[var(--text-muted)]">Password</span>
            <div className="relative">
              <LockKeyhole className="absolute left-3 top-3.5 w-4 h-4 text-[var(--text-muted)]" />
              <input required type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] pl-10 pr-4 py-3 text-sm text-[var(--text-heading)] outline-none focus:border-[var(--accent-amber)]" />
            </div>
          </label>
          {error && <p role="alert" className="text-sm text-[var(--accent-red)]">{error}</p>}
          <button type="submit" disabled={isSubmitting} className="w-full flex items-center justify-center gap-2 rounded-xl bg-[var(--accent-amber)] px-4 py-3 text-sm font-bold text-[var(--text-inverse)] disabled:opacity-60">
            {isSubmitting ? 'Signing in…' : 'Sign in'}
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
        <p className="mt-6 text-xs leading-relaxed text-[var(--text-muted)]">This prototype keeps the access token in memory only. Sessions intentionally end on page refresh.</p>
      </section>
    </main>
  );
};