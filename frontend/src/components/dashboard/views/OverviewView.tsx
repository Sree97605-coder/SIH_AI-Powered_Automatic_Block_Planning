import React from 'react';
import {
  ShieldCheck,
  Zap,
  Layers,
  TrendingUp,
  MapPin,
  ArrowRight,
  Shield,
  Radio,
  Calendar,
  Info,
} from 'lucide-react';
import { HorizonType, Defect, PerspectiveType } from '../../../types';
import { VERIFIED_BENCHMARKS, CORRIDOR_DATA, SYSTEM_META } from '../../../config/constants';

interface OverviewViewProps {
  horizon: HorizonType;
  onNavigateTab: (tab: 'weekly' | 'monthly' | 'unscheduled' | 'corridor') => void;
  onSelectDefect?: (defect: Defect) => void;
  selectedSectionFilter?: string;
  onSelectSectionFilter?: (secId: string) => void;
  perspective?: PerspectiveType;
  onPerspectiveChange?: (p: PerspectiveType) => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  horizon,
  onNavigateTab,
  selectedSectionFilter = 'ALL',
  onSelectSectionFilter,
  perspective = 'division',
  onPerspectiveChange,
}) => {
  const benchmarkRows = VERIFIED_BENCHMARKS[horizon];
  const manualFifo = benchmarkRows.find(r => r.plan === 'Manual (FIFO)') || benchmarkRows[0];
  const optimized = benchmarkRows.find(r => r.plan === 'Optimized') || benchmarkRows[2];

  const currentSection = selectedSectionFilter !== 'ALL'
    ? CORRIDOR_DATA.block_sections.find(s => s.section_id === selectedSectionFilter)
    : null;

  return (
    <div className="space-y-8 pb-12">
      
      {/* Overview Top Header Banner */}
      <div className="glass-card-elevated rounded-3xl p-8 relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--accent-amber-bg)] border border-[var(--accent-amber-border)] text-xs font-mono text-[var(--accent-amber)] mb-2 font-bold">
              <span>{SYSTEM_META.brandName} OPTIMIZER</span>
              <span>•</span>
              <span className="uppercase">{horizon} HORIZON</span>
            </div>
            <h1 className="font-display font-bold text-2xl sm:text-3xl text-[var(--text-heading)]">
              Prayagraj Division Corridor Overview
            </h1>
            <p className="text-xs sm:text-sm text-[var(--text-body)] mt-1 max-w-xl">
              Real-time block optimization across 5 block sections (Kanpur Central $\rightarrow$ Prayagraj Junction, 202.0 km).
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => onNavigateTab(horizon === 'weekly' ? 'weekly' : 'monthly')}
              className="px-5 py-2.5 rounded-full bg-[var(--accent-amber)] hover:opacity-90 text-xs font-mono font-bold text-white dark:text-[#05070C] shadow-[var(--shadow-glow-amber)] transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <span>View Full {horizon.toUpperCase()} Schedule</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Perspective Quick Lens Switcher Banner */}
      <div className="glass-card rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-[var(--accent-amber)]" />
          <span className="text-xs font-mono font-bold text-[var(--text-heading)]">
            Department Lenses:
          </span>
          <span className="text-xs text-[var(--text-muted)]">
            Switch data perspective to view specialized department queues:
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => {
              onPerspectiveChange?.('division');
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
              perspective === 'division'
                ? 'bg-[var(--accent-amber-bg)] text-[var(--accent-amber)] border border-[var(--accent-amber-border)]'
                : 'bg-[var(--bg-pill)] text-[var(--text-muted)] hover:text-[var(--text-heading)]'
            }`}
          >
            Division (All)
          </button>
          <button
            onClick={() => {
              onPerspectiveChange?.('control');
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
              perspective === 'control'
                ? 'bg-[var(--accent-amber-bg)] text-[var(--accent-amber)] border border-[var(--accent-amber-border)]'
                : 'bg-[var(--bg-pill)] text-[var(--text-muted)] hover:text-[var(--text-heading)]'
            }`}
          >
            Control Office (Gantt)
          </button>
          <button
            onClick={() => {
              onPerspectiveChange?.('engineer');
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
              perspective === 'engineer'
                ? 'bg-[var(--accent-steel-bg)] text-[var(--accent-steel)] border border-[var(--accent-steel-border)]'
                : 'bg-[var(--bg-pill)] text-[var(--text-muted)] hover:text-[var(--text-heading)]'
            }`}
          >
            Track Eng (TMS)
          </button>
          <button
            onClick={() => {
              onPerspectiveChange?.('ohe');
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
              perspective === 'ohe'
                ? 'bg-[var(--accent-amber-bg)] text-[var(--accent-amber)] border border-[var(--accent-amber-border)]'
                : 'bg-[var(--bg-pill)] text-[var(--text-muted)] hover:text-[var(--text-heading)]'
            }`}
          >
            Traction / OHE (TDMS)
          </button>
          <button
            onClick={() => {
              onPerspectiveChange?.('smt');
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
              perspective === 'smt'
                ? 'bg-[var(--accent-green-bg)] text-[var(--accent-green)] border border-[var(--accent-green-border)]'
                : 'bg-[var(--bg-pill)] text-[var(--text-muted)] hover:text-[var(--text-heading)]'
            }`}
          >
            Signals & Telecom (S&T)
          </button>
        </div>
      </div>

      {/* KPI STRIP (Exactly 4 Numbers in a Clean Row) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* KPI 1: P1 Clearance */}
        <div className="glass-card-elevated rounded-2xl p-6">
          <div className="flex items-center justify-between text-xs font-mono text-[var(--text-muted)] mb-2 font-medium">
            <span>P1 Immediate Clearance</span>
            <ShieldCheck className="w-4 h-4 text-[var(--accent-green)]" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-mono font-bold text-[var(--accent-green)]">
              {optimized.p1_clearance_pct}%
            </span>
          </div>
          <span className="text-[10px] text-[var(--accent-green)] block mt-1.5 font-mono font-semibold">
            100% of achievable ceiling (Manual: {manualFifo.p1_clearance_pct}%)
          </span>
        </div>

        {/* KPI 2: P2 Clearance */}
        <div className="glass-card-elevated rounded-2xl p-6">
          <div className="flex items-center justify-between text-xs font-mono text-[var(--text-muted)] mb-2 font-medium">
            <span>P2 Urgent Clearance</span>
            <Zap className="w-4 h-4 text-[var(--accent-amber)]" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-mono font-bold text-[var(--accent-amber)]">
              {optimized.p2_clearance_pct}%
            </span>
          </div>
          <span className="text-[10px] text-[var(--text-muted)] block mt-1.5 font-mono">
            Outperforms manual (Manual: {manualFifo.p2_clearance_pct}%)
          </span>
        </div>

        {/* KPI 3: Multi-Dept Bundling */}
        <div className="glass-card-elevated rounded-2xl p-6">
          <div className="flex items-center justify-between text-xs font-mono text-[var(--text-muted)] mb-2 font-medium">
            <span>Multi-Dept Bundling</span>
            <Layers className="w-4 h-4 text-[var(--accent-amber)]" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-mono font-bold text-[var(--accent-amber)]">
              +{optimized.bundling_rate_pct}%
            </span>
          </div>
          <span className="text-[10px] text-[var(--text-muted)] block mt-1.5 font-mono">
            TRD + S&T + Track shadow blocks
          </span>
        </div>

        {/* KPI 4: Overall Defect Clearance */}
        <div className="glass-card-elevated rounded-2xl p-6">
          <div className="flex items-center justify-between text-xs font-mono text-[var(--text-muted)] mb-2 font-medium">
            <span>Total Scope Scheduled</span>
            <TrendingUp className="w-4 h-4 text-[var(--accent-steel)]" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-mono font-bold text-[var(--text-heading)]">
              {optimized.clearance_pct}%
            </span>
            <span className="text-xs font-mono text-[var(--text-muted)]">
              ({optimized.scheduled_defects}/52)
            </span>
          </div>
          <span className="text-[10px] text-[var(--text-muted)] block mt-1.5 font-mono">
            Unscheduled: {optimized.unscheduled_defects} (Contention)
          </span>
        </div>

      </div>

      {/* CORRIDOR SECTION FILTER */}
      <div className="glass-card-elevated rounded-3xl p-6">
        
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[var(--border-subtle)] mb-4">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-[var(--accent-amber)]" />
            <h3 className="font-display font-bold text-base text-[var(--text-heading)]">
              Corridor Section Filter (Click to isolate section)
            </h3>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => onSelectSectionFilter && onSelectSectionFilter('ALL')}
              className={`px-3 py-1 rounded-lg text-xs font-mono transition-colors cursor-pointer ${
                selectedSectionFilter === 'ALL'
                  ? 'bg-[var(--accent-amber)] text-white dark:text-[#05070C] font-bold shadow-[var(--shadow-glow-amber)]'
                  : 'bg-[var(--bg-pill)] text-[var(--text-body)] hover:text-[var(--text-heading)]'
              }`}
            >
              All Corridor (202km)
            </button>
          </div>
        </div>

        {/* 5 Clickable Section Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
          {CORRIDOR_DATA.block_sections.map((sec) => {
            const isSelected = selectedSectionFilter === sec.section_id;
            return (
              <button
                key={sec.section_id}
                onClick={() => onSelectSectionFilter && onSelectSectionFilter(sec.section_id)}
                className={`p-3.5 rounded-2xl text-left border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-[var(--accent-amber-bg)] border-[var(--accent-amber)] shadow-[var(--shadow-glow-amber)]'
                    : 'bg-[var(--bg-pill)] border-[var(--border-subtle)] hover:border-[var(--border-medium)]'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs font-mono font-bold ${isSelected ? 'text-[var(--accent-amber)]' : 'text-[var(--text-muted)]'}`}>
                    {sec.section_id}
                  </span>
                  <span className="text-[9px] font-mono px-1 rounded bg-[var(--bg-pill)] text-[var(--text-muted)]">
                    {sec.density}
                  </span>
                </div>
                <h4 className="text-xs font-semibold text-[var(--text-heading)] truncate">
                  {sec.from_station} → {sec.to_station}
                </h4>
                <div className="mt-2 text-[10px] font-mono text-[var(--text-muted)] flex justify-between">
                  <span>{sec.length_km} km</span>
                  <span>{sec.typical_daily_trains} trains/d</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Selected Section Banner */}
        {currentSection && (
          <div className="mt-4 p-3.5 rounded-xl bg-[var(--accent-amber-bg)] border border-[var(--accent-amber-border)] flex items-center justify-between text-xs font-mono">
            <span className="text-[var(--accent-amber)] font-bold">
              Filtering dashboard to: {currentSection.section_id} ({currentSection.name})
            </span>
            <button
              onClick={() => onSelectSectionFilter && onSelectSectionFilter('ALL')}
              className="text-[var(--text-muted)] hover:text-[var(--text-heading)] underline cursor-pointer"
            >
              Clear Section Filter
            </button>
          </div>
        )}

      </div>

      {/* SUMMARY COMPARISON TABLE */}
      <div className="glass-card-elevated rounded-3xl p-6 sm:p-8">
        <h3 className="font-display font-bold text-base text-[var(--text-heading)] mb-4 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-[var(--accent-amber)]" />
          {horizon.toUpperCase()} Horizon Benchmark Performance
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] text-[var(--text-muted)]">
                <th className="pb-3 font-semibold">Plan Methodology</th>
                <th className="pb-3 font-semibold text-right">Scheduled</th>
                <th className="pb-3 font-semibold text-right">P1 Clearance</th>
                <th className="pb-3 font-semibold text-right">P2 Clearance</th>
                <th className="pb-3 font-semibold text-right">Bundling</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {benchmarkRows.map((row) => {
                const isOpt = row.plan === 'Optimized';
                return (
                  <tr
                    key={row.plan}
                    className={isOpt ? 'bg-[var(--accent-amber-bg)] text-[var(--text-heading)] font-bold' : 'text-[var(--text-body)]'}
                  >
                    <td className="py-3 flex items-center gap-2">
                      {isOpt && <span className="w-2 h-2 rounded-full bg-[var(--accent-amber)] shadow-[var(--shadow-glow-amber)]" />}
                      <span>{row.plan}</span>
                    </td>
                    <td className="py-3 text-right text-[var(--text-heading)]">
                      {row.scheduled_defects}/52 ({row.clearance_pct}%)
                    </td>
                    <td className={`py-3 text-right ${row.p1_clearance_pct === 100 ? 'text-[var(--accent-green)] font-bold' : 'text-[var(--accent-amber)]'}`}>
                      {row.p1_clearance_pct}%
                    </td>
                    <td className={`py-3 text-right ${row.p2_clearance_pct === 100 ? 'text-[var(--accent-green)] font-bold' : 'text-[var(--accent-amber)]'}`}>
                      {row.p2_clearance_pct}%
                    </td>
                    <td className={`py-3 text-right ${row.bundling_rate_pct > 0 ? 'text-[var(--accent-amber)]' : 'text-[var(--text-muted)]'}`}>
                      {row.bundling_rate_pct}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};
