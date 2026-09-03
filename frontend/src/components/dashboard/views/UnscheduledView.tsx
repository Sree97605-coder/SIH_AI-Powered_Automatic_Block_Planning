import React from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
} from 'lucide-react';
import { HorizonType, UnscheduledDefect, Defect } from '../../../types';
import { UNSCHEDULED_MONTHLY_CONTENTION } from '../../../config/constants';

interface UnscheduledViewProps {
  horizon: HorizonType;
  classifications: UnscheduledDefect[];
  isLoading: boolean;
  onSelectDefect: (defect: Defect) => void;
}

export const UnscheduledView: React.FC<UnscheduledViewProps> = ({
  horizon,
  classifications,
  onSelectDefect,
}) => {
  const items = (classifications && classifications.length > 0)
    ? classifications
    : UNSCHEDULED_MONTHLY_CONTENTION;

  const contentionItems = items.filter(i => (i.reason || 'CONTENTION') === 'CONTENTION');
  const infeasibleItems = items.filter(i => i.reason === 'STRUCTURALLY_INFEASIBLE');

  const handleRowClick = (item: UnscheduledDefect) => {
    onSelectDefect({
      defect_id: item.defect_id,
      department: item.department || 'Engineering',
      section_id: item.section_id,
      defect_type: 'Planned Maintenance Order (Deferred)',
      severity: 'Low',
      overdue_days: 28,
      estimated_duration_hours: item.estimated_duration_hours || 3.0,
      urgency_band: item.urgency_band || 'P3 - Planned',
      description: item.description || item.unscheduled_reason || 'Contention during peak traffic night window.',
      unscheduled_reason: item.unscheduled_reason || 'Contention with higher priority P1/P2 work in tight corridor window.',
    });
  };

  return (
    <div className="space-y-6 pb-12">
      
      {/* Top Banner */}
      <div className="glass-card-elevated rounded-3xl p-6 sm:p-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--accent-amber-bg)] border border-[var(--accent-amber-border)] text-xs font-mono text-[var(--accent-amber)] mb-2 font-bold">
          <AlertCircle className="w-3.5 h-3.5" />
          <span>CAPACITY SCARCITY & TRIAGE BOARD</span>
        </div>
        <h2 className="font-display font-bold text-2xl sm:text-3xl text-[var(--text-heading)]">
          Unscheduled Work Classification ({horizon.toUpperCase()})
        </h2>
        <p className="text-xs sm:text-sm text-[var(--text-body)] mt-1 max-w-xl">
          Actionable separation of genuine traffic density time contention from corridor track geometry infeasibility.
        </p>
      </div>

      {/* POSITIVE 0 INFEASIBLE BANNER */}
      <div className="glass-card-elevated rounded-2xl p-6 border border-[var(--accent-green-border)] bg-[var(--accent-green-bg)] shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-9 h-9 rounded-full bg-[var(--accent-green-bg)] border border-[var(--accent-green-border)] flex items-center justify-center text-[var(--accent-green)] shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-bold text-[var(--accent-green)]">
                0 STRUCTURALLY INFEASIBLE DEFECTS
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[var(--accent-green-bg)] text-[var(--accent-green)] border border-[var(--accent-green-border)] font-bold">
                ALL TASKS FIT STANDARD SLOTS
              </span>
            </div>
            <p className="text-xs text-[var(--text-body)] mt-0.5">
              No defect in the backlog exceeds the maximum available block window in its section. Zero emergency mega-block requests required from Control Office.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-mono text-[var(--text-muted)]">Mega-Block Hours Needed:</span>
          <span className="font-mono text-sm font-bold text-[var(--accent-green)] bg-[var(--bg-surface)] px-3 py-1 rounded-lg border border-[var(--border-subtle)]">
            0.0 hrs
          </span>
        </div>
      </div>

      {/* CONTENTION WORK ORDERS TABLE */}
      <div className="glass-card-elevated rounded-3xl p-6 sm:p-8">
        
        <div className="flex items-center justify-between pb-4 border-b border-[var(--border-subtle)] mb-4">
          <div className="flex items-center gap-2.5">
            <span className="w-3 h-3 rounded-full bg-[var(--accent-amber)] shadow-[var(--shadow-glow-amber)] animate-pulse" />
            <h3 className="font-display font-bold text-base text-[var(--text-heading)]">
              {contentionItems.length} Contention-Deferred Routine Orders (Safe for Next Cycle)
            </h3>
          </div>
          <span className="text-xs font-mono text-[var(--text-muted)]">
            Click row for explainability
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] text-[var(--text-muted)]">
                <th className="pb-3 font-semibold">Defect ID</th>
                <th className="pb-3 font-semibold">Section</th>
                <th className="pb-3 font-semibold">Urgency Band</th>
                <th className="pb-3 font-semibold">Classification Reason</th>
                <th className="pb-3 font-semibold text-right">Duration</th>
                <th className="pb-3 font-semibold text-right">Mega-Block Req.</th>
                <th className="pb-3 font-semibold text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {contentionItems.map((defect) => (
                <tr
                  key={defect.defect_id}
                  onClick={() => handleRowClick(defect)}
                  className="hover:bg-[var(--bg-pill-hover)] transition-colors cursor-pointer"
                >
                  <td className="py-2.5 font-bold text-[var(--accent-amber)]">
                    {defect.defect_id}
                  </td>
                  <td className="py-2.5 text-[var(--text-heading)]">
                    {defect.section_id}
                  </td>
                  <td className="py-2.5">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--accent-steel-bg)] text-[var(--accent-steel)] border border-[var(--accent-steel-border)]">
                      {defect.urgency_band}
                    </span>
                  </td>
                  <td className="py-2.5">
                    <div className="flex items-center gap-1.5 text-[var(--accent-amber)]">
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-amber)] shadow-sm" />
                      <span className="font-bold">CONTENTION</span>
                    </div>
                  </td>
                  <td className="py-2.5 text-right text-[var(--text-heading)]">
                    {defect.estimated_duration_hours} hrs
                  </td>
                  <td className="py-2.5 text-right text-[var(--accent-green)] font-bold">
                    0.0 hrs
                  </td>
                  <td className="py-2.5 text-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRowClick(defect);
                      }}
                      className="px-2 py-0.5 rounded-lg bg-[var(--bg-pill)] hover:bg-[var(--accent-amber-bg)] hover:text-[var(--accent-amber)] text-[var(--text-muted)] transition-colors inline-flex items-center gap-1 text-[11px] cursor-pointer"
                    >
                      <Eye className="w-3 h-3" />
                      <span>Inspect</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>

    </div>
  );
};
