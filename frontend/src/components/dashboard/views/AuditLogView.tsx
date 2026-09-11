import React from 'react';
import { ClipboardList, RefreshCw } from 'lucide-react';
import { AuditLogEntry } from '../../../types';

interface AuditLogViewProps {
  entries: AuditLogEntry[];
  isLoading: boolean;
  onRefresh: () => void;
}

export const AuditLogView: React.FC<AuditLogViewProps> = ({ entries, isLoading, onRefresh }) => {
  return (
    <div className="space-y-6 pb-12">
      <div className="glass-card-elevated rounded-3xl p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--accent-amber-bg)] border border-[var(--accent-amber-border)] text-xs font-mono text-[var(--accent-amber)] mb-2 font-bold">
              <ClipboardList className="w-3.5 h-3.5" />
              <span>OVERRIDE GOVERNANCE</span>
            </div>
            <h2 className="font-display font-bold text-2xl sm:text-3xl text-[var(--text-heading)]">Audit Log</h2>
            <p className="text-xs sm:text-sm text-[var(--text-body)] mt-1 max-w-xl">
              Read-only record of schedule overrides and their operational reasons.
            </p>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs font-mono font-bold text-[var(--text-body)] hover:text-[var(--text-heading)] hover:border-[var(--border-highlight)] transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
      </div>

      <div className="glass-card-elevated rounded-3xl p-6 sm:p-8">
        <div className="flex items-center justify-between pb-4 border-b border-[var(--border-subtle)] mb-4">
          <h3 className="font-display font-bold text-base text-[var(--text-heading)]">Recorded Overrides</h3>
          <span className="text-xs font-mono text-[var(--accent-amber)] font-bold">{entries.length} Entries</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] text-[var(--text-muted)]">
                <th className="pb-3 font-semibold">Defect ID</th>
                <th className="pb-3 font-semibold">Horizon</th>
                <th className="pb-3 font-semibold">Slot Change</th>
                <th className="pb-3 font-semibold">Changed By</th>
                <th className="pb-3 font-semibold">Reason</th>
                <th className="pb-3 font-semibold">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {isLoading ? (
                <tr><td colSpan={6} className="py-8 text-center text-[var(--text-muted)]">Loading audit records...</td></tr>
              ) : entries.length === 0 ? (
                <tr><td colSpan={6} className="py-8 text-center text-[var(--text-muted)]">No overrides recorded.</td></tr>
              ) : entries.map((entry) => (
                <tr key={entry.override_id} className="hover:bg-[var(--bg-pill-hover)] transition-colors">
                  <td className="py-2.5 font-bold text-[var(--accent-amber)]">{entry.defect_id}</td>
                  <td className="py-2.5 text-[var(--text-heading)] uppercase">{entry.horizon}</td>
                  <td className="py-2.5 text-[var(--text-heading)]">{entry.original_slot_id || '—'} <span className="text-[var(--accent-amber)]">→</span> {entry.new_slot_id}</td>
                  <td className="py-2.5 text-[var(--text-heading)]">{entry.changed_by}</td>
                  <td className="py-2.5"><span className="px-2 py-0.5 rounded-full bg-[var(--accent-steel-bg)] text-[var(--accent-steel)] border border-[var(--accent-steel-border)]">{entry.reason_category}</span></td>
                  <td className="py-2.5 text-[var(--text-muted)] whitespace-nowrap">{entry.timestamp}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
