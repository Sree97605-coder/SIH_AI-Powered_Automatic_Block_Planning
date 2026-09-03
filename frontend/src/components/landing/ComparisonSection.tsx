import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { BarChart3, TrendingUp } from 'lucide-react';
import { VERIFIED_BENCHMARKS } from '../../config/constants';
import { HorizonType } from '../../types';

interface ComparisonSectionProps {
  initialHorizon?: HorizonType;
}

export const ComparisonSection: React.FC<ComparisonSectionProps> = ({
  initialHorizon = 'weekly',
}) => {
  const [horizon, setHorizon] = useState<HorizonType>(initialHorizon);

  const benchmarkRows = VERIFIED_BENCHMARKS[horizon];
  const manualFifo = benchmarkRows.find(r => r.plan === 'Manual (FIFO)') || benchmarkRows[0];
  const optimized = benchmarkRows.find(r => r.plan === 'Optimized') || benchmarkRows[2];

  const metricsList = [
    {
      title: 'P1 Immediate Clearance',
      desc: 'Critical track fractures & signal faults',
      manual: manualFifo.p1_clearance_pct,
      optimized: optimized.p1_clearance_pct,
      highlightColor: 'var(--accent-green)',
    },
    {
      title: 'P2 Urgent Clearance',
      desc: 'Insulator cracks & point machine wear',
      manual: manualFifo.p2_clearance_pct,
      optimized: optimized.p2_clearance_pct,
      highlightColor: 'var(--accent-amber)',
    },
    {
      title: 'Multi-Department Bundling Rate',
      desc: 'Co-located TRD + S&T + Track shadow blocks',
      manual: manualFifo.bundling_rate_pct,
      optimized: optimized.bundling_rate_pct,
      highlightColor: 'var(--accent-amber)',
    },
    {
      title: 'Overall Defect Clearance',
      desc: 'Total work orders placed in available windows',
      manual: manualFifo.clearance_pct,
      optimized: optimized.clearance_pct,
      highlightColor: 'var(--accent-steel)',
    },
  ];

  return (
    <section id="comparison" className="py-28 sm:py-36 px-4 sm:px-8 max-w-7xl mx-auto relative">
      
      {/* Section Header */}
      <div className="flex flex-col items-center text-center mb-16">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--accent-amber-bg)] border border-[var(--accent-amber-border)] text-xs font-mono text-[var(--accent-amber)] mb-3 font-semibold">
          <TrendingUp className="w-3.5 h-3.5" />
          <span>VALIDATED BENCHMARK EXPERIMENTS</span>
        </div>
        <h2 className="font-display font-bold text-2xl sm:text-3xl text-[var(--text-heading)] tracking-tight max-w-2xl">
          Manual Baseline vs AI Optimization
        </h2>
        <p className="text-sm text-[var(--text-body)] mt-2 max-w-xl">
          Direct empirical comparison against traditional Railway FIFO scheduling rules across 52 maintenance work orders.
        </p>

        {/* Weekly / Monthly Horizon Toggle */}
        <div className="flex items-center gap-2 mt-8 p-1.5 rounded-full glass-card">
          <button
            onClick={() => setHorizon('weekly')}
            className={`px-5 py-2 rounded-full text-xs font-mono font-bold transition-all duration-300 cursor-pointer ${
              horizon === 'weekly'
                ? 'bg-[var(--accent-amber)] text-white dark:text-[#05070C] shadow-[var(--shadow-glow-amber)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-heading)]'
            }`}
          >
            Weekly Horizon (7 Days)
          </button>
          <button
            onClick={() => setHorizon('monthly')}
            className={`px-5 py-2 rounded-full text-xs font-mono font-bold transition-all duration-300 cursor-pointer ${
              horizon === 'monthly'
                ? 'bg-[var(--accent-amber)] text-white dark:text-[#05070C] shadow-[var(--shadow-glow-amber)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-heading)]'
            }`}
          >
            Monthly Horizon (30 Days)
          </button>
        </div>
      </div>

      {/* Main 12-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
        
        {/* Left Column: Liquid-Fill Progress Meters */}
        <div className="lg:col-span-6 flex flex-col gap-4">
          {metricsList.map((m, idx) => {
            const isUplift = m.optimized > m.manual;
            const upliftValue = (m.optimized - m.manual).toFixed(1);

            return (
              <motion.div
                key={`${horizon}-${m.title}`}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: idx * 0.08 }}
                className="glass-card-elevated rounded-2xl p-6"
              >
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h3 className="text-sm font-bold text-[var(--text-heading)]">{m.title}</h3>
                    <p className="text-[11px] text-[var(--text-muted)]">{m.desc}</p>
                  </div>
                  {isUplift && (
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-[var(--accent-green-bg)] text-[var(--accent-green)] border border-[var(--accent-green-border)]">
                      +{upliftValue}% AI Uplift
                    </span>
                  )}
                </div>

                {/* Values Readout */}
                <div className="flex items-baseline justify-between font-mono text-xs mb-2">
                  <span className="text-[var(--text-muted)]">
                    Manual FIFO: <strong className="text-[var(--text-heading)]">{m.manual}%</strong>
                  </span>
                  <span className="text-[var(--accent-amber)] font-bold">
                    AI Optimized: <strong className="text-base font-extrabold text-[var(--accent-green)]">{m.optimized}%</strong>
                  </span>
                </div>

                {/* Paired Liquid Fill Progress Track */}
                <div className="space-y-1.5">
                  <div className="w-full bg-[var(--bg-card-subtle)] rounded-full h-2 overflow-hidden border border-[var(--border-subtle)]">
                    <div
                      className="h-full bg-[var(--text-muted)] rounded-full transition-all duration-1000 ease-out opacity-60"
                      style={{ width: `${m.manual}%` }}
                    />
                  </div>

                  <div className="w-full bg-[var(--bg-card-subtle)] rounded-full h-3 overflow-hidden border border-[var(--border-medium)] relative shadow-inner">
                    <div
                      className="liquid-meter-fill h-full rounded-full transition-all duration-1000 ease-out"
                      style={{
                        width: `${m.optimized}%`,
                        backgroundColor: m.highlightColor,
                      }}
                    />
                  </div>
                </div>

              </motion.div>
            );
          })}
        </div>

        {/* Right Column: Grouped SVG Comparison Chart */}
        <div className="lg:col-span-6 flex flex-col gap-6">
          
          <div className="glass-card-elevated rounded-3xl p-8">
            
            <div className="flex items-center justify-between pb-6 border-b border-[var(--border-subtle)] mb-6">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-[var(--accent-amber)]" />
                <h3 className="font-display font-bold text-base text-[var(--text-heading)]">
                  Grouped Plan Benchmark
                </h3>
              </div>
              <div className="flex items-center gap-3 text-xs font-mono">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-[var(--text-muted)] opacity-60" />
                  <span className="text-[var(--text-muted)]">Manual FIFO</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-[var(--accent-green)] shadow-[var(--shadow-glow-green)]" />
                  <span className="text-[var(--accent-green)] font-bold">AI Optimized</span>
                </div>
              </div>
            </div>

            {/* SVG Grouped Bar Chart */}
            <div className="w-full h-64 relative flex items-end justify-between pt-6 pb-8 px-2 border-b border-[var(--border-subtle)]">
              
              {/* Background Grid Lines */}
              <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-20">
                <div className="border-b border-[var(--text-muted)] border-dashed w-full" />
                <div className="border-b border-[var(--text-muted)] border-dashed w-full" />
                <div className="border-b border-[var(--text-muted)] border-dashed w-full" />
                <div className="border-b border-[var(--text-muted)] border-dashed w-full" />
              </div>

              {/* Group 1: P1 Clearance */}
              <div className="flex flex-col items-center gap-2 z-10 w-1/4">
                <div className="flex items-end gap-1.5 h-44">
                  <motion.div
                    initial={{ height: 0 }}
                    whileInView={{ height: `${(manualFifo.p1_clearance_pct / 100) * 160}px` }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.8 }}
                    className="w-5 sm:w-7 bg-[var(--text-muted)] opacity-60 rounded-t-md relative group cursor-pointer"
                  >
                    <span className="opacity-0 group-hover:opacity-100 absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] font-mono bg-[var(--bg-surface)] px-1.5 py-0.5 rounded border border-[var(--border-subtle)] text-[var(--text-heading)] whitespace-nowrap transition-opacity shadow-lg">
                      {manualFifo.p1_clearance_pct}%
                    </span>
                  </motion.div>
                  <motion.div
                    initial={{ height: 0 }}
                    whileInView={{ height: `${(optimized.p1_clearance_pct / 100) * 160}px` }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.8, delay: 0.1 }}
                    className="w-5 sm:w-7 bg-[var(--accent-green)] rounded-t-md shadow-[var(--shadow-glow-green)] relative group cursor-pointer"
                  >
                    <span className="opacity-0 group-hover:opacity-100 absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] font-mono bg-[var(--bg-surface)] px-1.5 py-0.5 rounded border border-[var(--accent-green)] text-[var(--accent-green)] whitespace-nowrap transition-opacity font-bold shadow-lg">
                      {optimized.p1_clearance_pct}%
                    </span>
                  </motion.div>
                </div>
                <span className="text-[11px] font-mono text-[var(--text-muted)] text-center">P1 Immediate</span>
              </div>

              {/* Group 2: P2 Clearance */}
              <div className="flex flex-col items-center gap-2 z-10 w-1/4">
                <div className="flex items-end gap-1.5 h-44">
                  <motion.div
                    initial={{ height: 0 }}
                    whileInView={{ height: `${(manualFifo.p2_clearance_pct / 100) * 160}px` }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.8 }}
                    className="w-5 sm:w-7 bg-[var(--text-muted)] opacity-60 rounded-t-md relative group cursor-pointer"
                  >
                    <span className="opacity-0 group-hover:opacity-100 absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] font-mono bg-[var(--bg-surface)] px-1.5 py-0.5 rounded border border-[var(--border-subtle)] text-[var(--text-heading)] whitespace-nowrap transition-opacity shadow-lg">
                      {manualFifo.p2_clearance_pct}%
                    </span>
                  </motion.div>
                  <motion.div
                    initial={{ height: 0 }}
                    whileInView={{ height: `${(optimized.p2_clearance_pct / 100) * 160}px` }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.8, delay: 0.1 }}
                    className="w-5 sm:w-7 bg-[var(--accent-amber)] rounded-t-md shadow-[var(--shadow-glow-amber)] relative group cursor-pointer"
                  >
                    <span className="opacity-0 group-hover:opacity-100 absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] font-mono bg-[var(--bg-surface)] px-1.5 py-0.5 rounded border border-[var(--accent-amber)] text-[var(--accent-amber)] whitespace-nowrap transition-opacity font-bold shadow-lg">
                      {optimized.p2_clearance_pct}%
                    </span>
                  </motion.div>
                </div>
                <span className="text-[11px] font-mono text-[var(--text-muted)] text-center">P2 Urgent</span>
              </div>

              {/* Group 3: Bundling */}
              <div className="flex flex-col items-center gap-2 z-10 w-1/4">
                <div className="flex items-end gap-1.5 h-44">
                  <motion.div
                    initial={{ height: 0 }}
                    whileInView={{ height: `4px` }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.8 }}
                    className="w-5 sm:w-7 bg-[var(--text-muted)] opacity-60 rounded-t-md relative group cursor-pointer"
                  >
                    <span className="opacity-0 group-hover:opacity-100 absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] font-mono bg-[var(--bg-surface)] px-1.5 py-0.5 rounded border border-[var(--border-subtle)] text-[var(--text-heading)] whitespace-nowrap transition-opacity shadow-lg">
                      0.0%
                    </span>
                  </motion.div>
                  <motion.div
                    initial={{ height: 0 }}
                    whileInView={{ height: `${(optimized.bundling_rate_pct / 100) * 160 * 2.2}px` }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.8, delay: 0.1 }}
                    className="w-5 sm:w-7 bg-[var(--accent-amber)] rounded-t-md shadow-[var(--shadow-glow-amber)] relative group cursor-pointer"
                  >
                    <span className="opacity-0 group-hover:opacity-100 absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] font-mono bg-[var(--bg-surface)] px-1.5 py-0.5 rounded border border-[var(--accent-amber)] text-[var(--accent-amber)] whitespace-nowrap transition-opacity font-bold shadow-lg">
                      {optimized.bundling_rate_pct}%
                    </span>
                  </motion.div>
                </div>
                <span className="text-[11px] font-mono text-[var(--text-muted)] text-center">Bundling Rate</span>
              </div>

              {/* Group 4: Total Clearance */}
              <div className="flex flex-col items-center gap-2 z-10 w-1/4">
                <div className="flex items-end gap-1.5 h-44">
                  <motion.div
                    initial={{ height: 0 }}
                    whileInView={{ height: `${(manualFifo.clearance_pct / 100) * 160}px` }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.8 }}
                    className="w-5 sm:w-7 bg-[var(--text-muted)] opacity-60 rounded-t-md relative group cursor-pointer"
                  >
                    <span className="opacity-0 group-hover:opacity-100 absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] font-mono bg-[var(--bg-surface)] px-1.5 py-0.5 rounded border border-[var(--border-subtle)] text-[var(--text-heading)] whitespace-nowrap transition-opacity shadow-lg">
                      {manualFifo.clearance_pct}%
                    </span>
                  </motion.div>
                  <motion.div
                    initial={{ height: 0 }}
                    whileInView={{ height: `${(optimized.clearance_pct / 100) * 160}px` }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.8, delay: 0.1 }}
                    className="w-5 sm:w-7 bg-[var(--accent-steel)] rounded-t-md shadow-[var(--shadow-glow-steel)] relative group cursor-pointer"
                  >
                    <span className="opacity-0 group-hover:opacity-100 absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] font-mono bg-[var(--bg-surface)] px-1.5 py-0.5 rounded border border-[var(--accent-steel)] text-[var(--accent-steel)] whitespace-nowrap transition-opacity font-bold shadow-lg">
                      {optimized.clearance_pct}%
                    </span>
                  </motion.div>
                </div>
                <span className="text-[11px] font-mono text-[var(--text-muted)] text-center">Total Cleared</span>
              </div>

            </div>

            {/* Numerical Bottom Strip */}
            <div className="pt-4 grid grid-cols-3 gap-3 text-center text-xs font-mono">
              <div className="p-3 rounded-2xl bg-[var(--bg-card-subtle)] border border-[var(--border-subtle)]">
                <span className="text-[var(--text-muted)] block text-[10px] font-semibold">Total Backlog</span>
                <strong className="text-[var(--text-heading)] text-sm">52 Defects</strong>
              </div>
              <div className="p-3 rounded-2xl bg-[var(--bg-card-subtle)] border border-[var(--border-subtle)]">
                <span className="text-[var(--text-muted)] block text-[10px] font-semibold">Scheduled (AI)</span>
                <strong className="text-[var(--accent-green)] text-sm">{optimized.scheduled_defects}</strong>
              </div>
              <div className="p-3 rounded-2xl bg-[var(--bg-card-subtle)] border border-[var(--border-subtle)]">
                <span className="text-[var(--text-muted)] block text-[10px] font-semibold">Unscheduled (Contention)</span>
                <strong className="text-[var(--accent-amber)] text-sm">{optimized.unscheduled_defects}</strong>
              </div>
            </div>

          </div>

        </div>

      </div>

    </section>
  );
};
