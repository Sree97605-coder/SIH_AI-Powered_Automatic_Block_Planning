import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, CheckCircle, Info } from 'lucide-react';
import { UNSCHEDULED_MONTHLY_CONTENTION } from '../../config/constants';

export const UnscheduledSection: React.FC = () => {
  const [selectedDept, setSelectedDept] = useState<string>('ALL');

  const filteredItems = selectedDept === 'ALL'
    ? UNSCHEDULED_MONTHLY_CONTENTION
    : UNSCHEDULED_MONTHLY_CONTENTION.filter(item => item.department === selectedDept);

  return (
    <section id="unscheduled" className="py-28 sm:py-36 px-4 sm:px-8 max-w-7xl mx-auto relative">
      
      {/* Section Header */}
      <div className="flex flex-col items-center text-center mb-16">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--accent-amber-bg)] border border-[var(--accent-amber-border)] text-xs font-mono text-[var(--accent-amber)] mb-3 font-semibold">
          <AlertCircle className="w-3.5 h-3.5" />
          <span>CAPACITY SCARCITY TRIAGE</span>
        </div>
        <h2 className="font-display font-bold text-2xl sm:text-3xl text-[var(--text-heading)] tracking-tight max-w-2xl">
          Unscheduled Work Classification Board
        </h2>
        <p className="text-sm text-[var(--text-body)] mt-2 max-w-xl">
          Separates genuine time-slot contention from physical corridor window infeasibility.
        </p>
      </div>

      {/* One-Sentence Distinction Explainer Banner */}
      <div className="glass-card-elevated rounded-2xl p-6 mb-8">
        <div className="flex items-start gap-4">
          <div className="w-9 h-9 rounded-xl bg-[var(--accent-steel-bg)] border border-[var(--accent-steel-border)] flex items-center justify-center text-[var(--accent-steel)] shrink-0 mt-0.5">
            <Info className="w-4 h-4" />
          </div>
          <div>
            <span className="text-xs font-mono uppercase tracking-wider text-[var(--text-heading)] font-bold block mb-1">
              Operational Distinction
            </span>
            <p className="text-xs sm:text-sm text-[var(--text-body)] leading-relaxed">
              <strong className="text-[var(--accent-amber)]">CONTENTION</strong> means the work fits existing block slots but was deferred due to higher-priority P1/P2 safety conflicts in tight night windows, whereas <strong className="text-[var(--accent-red)]">STRUCTURALLY INFEASIBLE</strong> means no slot in that section is physically long enough for the task (which would require requesting a special mega-block from Control Office).
            </p>
          </div>
        </div>
      </div>

      {/* Positive Highlight: 0 Structurally Infeasible Defects */}
      <div className="glass-card-elevated rounded-2xl p-6 border border-[var(--accent-green-border)] bg-[var(--accent-green-bg)] shadow-sm mb-8 flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-9 h-9 rounded-full bg-[var(--accent-green-bg)] border border-[var(--accent-green-border)] flex items-center justify-center text-[var(--accent-green)]">
            <CheckCircle className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-bold text-[var(--accent-green)]">
                0 STRUCTURALLY INFEASIBLE DEFECTS
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[var(--accent-green-bg)] text-[var(--accent-green)] border border-[var(--accent-green-border)] font-semibold">
                100% FEASIBLE CORRIDOR
              </span>
            </div>
            <p className="text-xs text-[var(--text-body)] mt-0.5">
              Every maintenance task in the Prayagraj Division catalog fits within standard published slot durations. No emergency mega-blocks required.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-[var(--text-muted)]">Mega-Block Hours Needed:</span>
          <span className="font-mono text-sm font-bold text-[var(--accent-green)] bg-[var(--bg-surface)] px-3 py-1 rounded-lg border border-[var(--border-subtle)]">
            0.0 hrs
          </span>
        </div>
      </div>

      {/* 9 Contention Work Orders Grid */}
      <div className="glass-card-elevated rounded-3xl p-8">
        
        <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2.5">
            <span className="w-3 h-3 rounded-full bg-[var(--accent-amber)] shadow-[var(--shadow-glow-amber)] animate-pulse" />
            <h3 className="font-display font-bold text-base text-[var(--text-heading)]">
              9 Contention-Flagged P3 Planned Orders
            </h3>
          </div>

          {/* Department Filter */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[var(--bg-card-subtle)] border border-[var(--border-subtle)] text-xs font-mono">
            {['ALL', 'Engineering', 'S&T', 'TRD'].map(dept => (
              <button
                key={dept}
                onClick={() => setSelectedDept(dept)}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  selectedDept === dept
                    ? 'bg-[var(--accent-amber)] text-white dark:text-[#05070C] font-bold'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-heading)]'
                }`}
              >
                {dept}
              </button>
            ))}
          </div>
        </div>

        {/* 3-Column Roomy Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-6">
          {filteredItems.map((defect) => (
            <motion.div
              key={defect.defect_id}
              initial={{ opacity: 0, scale: 0.98 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              className="glass-panel p-5 rounded-2xl hover:border-[var(--border-highlight)] transition-all group"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-xs text-[var(--accent-amber)]">
                    {defect.defect_id}
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--bg-pill)] text-[var(--text-muted)] border border-[var(--border-subtle)]">
                    {defect.section_id}
                  </span>
                </div>

                {/* Amber Signal Lamp Tag */}
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[var(--accent-amber-bg)] border border-[var(--accent-amber-border)] text-[10px] font-mono text-[var(--accent-amber)] font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-amber)] shadow-sm" />
                  <span>CONTENTION</span>
                </div>
              </div>

              <div className="text-xs text-[var(--text-heading)] font-medium mb-1.5">
                {defect.department} • <span className="text-[var(--text-muted)]">{defect.urgency_band}</span>
              </div>

              <p className="text-[11px] text-[var(--text-body)] leading-relaxed line-clamp-2 group-hover:line-clamp-none transition-all">
                {defect.description}
              </p>

              <div className="mt-3 pt-2.5 border-t border-[var(--border-subtle)] flex items-center justify-between text-[10px] font-mono text-[var(--text-muted)]">
                <span>Duration: <strong className="text-[var(--text-heading)]">{defect.estimated_duration_hours} hrs</strong></span>
                <span>Safe to defer: <strong className="text-[var(--accent-green)]">YES</strong></span>
              </div>
            </motion.div>
          ))}
        </div>

      </div>

    </section>
  );
};
