import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, ShieldCheck, Zap, Layers, Activity, Clock } from 'lucide-react';
import { Train3DCanvas } from './Train3DCanvas';
import { DepartureCounter } from '../common/DepartureCounter';
import { SYSTEM_META } from '../../config/constants';

interface HeroSectionProps {
  onEnterDashboard: () => void;
  onOpenDemo: () => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({
  onEnterDashboard,
  onOpenDemo,
}) => {
  return (
    <section
      id="hero"
      className="relative min-h-[95vh] pt-32 pb-20 px-4 sm:px-8 flex flex-col justify-between overflow-hidden bg-transparent"
    >
      {/* Background ambient radial glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[550px] bg-gradient-to-b from-[var(--accent-steel-bg)] via-[var(--accent-amber-bg)] to-transparent rounded-full blur-3xl pointer-events-none -z-10 opacity-75" />

      {/* Main 12-Column Grid: Clean 50/50 Split without overlap */}
      <div className="max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center relative z-10 flex-1 my-auto">
        
        {/* Left Column: Eyebrow, Hero Headline, Subtitle, Actions (6 Columns) */}
        <div className="lg:col-span-6 flex flex-col items-start gap-6 text-left z-20">
          
          {/* Eyebrow */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full glass-card"
          >
            <div className="w-2 h-2 rounded-full bg-[var(--accent-amber)] animate-ping" />
            <span className="text-[11px] font-mono tracking-wider font-bold text-[var(--accent-amber)] uppercase">
              {SYSTEM_META.brandName} • {SYSTEM_META.problemId}
            </span>
            <span className="opacity-30">|</span>
            <span className="text-[11px] text-[var(--text-muted)]">
              Prayagraj Division • 202km
            </span>
          </motion.div>

          {/* Clean Primary Headline (Fades / Slides in once) */}
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="font-display font-extrabold text-4xl sm:text-5xl xl:text-6xl leading-[1.1] tracking-tight text-[var(--text-heading)]"
          >
            Precision <span className="text-[var(--accent-amber)]">AI Block</span> Scheduling for Indian Railways.
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="text-sm sm:text-base text-[var(--text-body)] max-w-xl font-normal leading-relaxed"
          >
            Constraint-satisfaction and ML prioritization engine for high-density rail corridors. 
            Guarantees <strong className="text-[var(--text-heading)]">100% P1 critical defect clearance</strong>, <strong className="text-[var(--text-heading)]">86.4%–100% P2 urgent clearance</strong>, and unlocks <strong className="text-[var(--accent-amber)]">+23.3% multi-department bundling</strong> across 202 km.
          </motion.p>

          {/* Action CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3 }}
            className="flex flex-wrap items-center gap-4 pt-2"
          >
            <button
              onClick={onEnterDashboard}
              className="flex items-center gap-3 bg-[var(--accent-amber)] hover:opacity-90 text-sm font-bold text-white dark:text-[#05070C] px-7 py-3.5 rounded-full shadow-[var(--shadow-glow-amber)] transition-all duration-300 transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
            >
              <span>Explore Live Plan</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              onClick={onOpenDemo}
              className="flex items-center gap-2.5 px-6 py-3.5 rounded-full glass-card hover:border-[var(--border-highlight)] text-sm font-semibold text-[var(--text-heading)] transition-all cursor-pointer"
            >
              <Activity className="w-4 h-4 text-[var(--accent-amber)]" />
              <span>Interactive Walkthrough</span>
            </button>
          </motion.div>

        </div>

        {/* Right Column: Expansive Unobstructed 3D Train Centerpiece (6 Columns) */}
        <div className="lg:col-span-6 relative h-[420px] sm:h-[500px] lg:h-[560px] flex items-center justify-center z-10">
          
          {/* 3D Train & Rail Ribbon Canvas */}
          <div className="absolute inset-0 w-full h-full">
            <Train3DCanvas />
          </div>

          {/* Floating Live Dispatch Card */}
          <motion.div
            initial={{ opacity: 0, y: -15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="absolute top-2 right-2 sm:right-4 z-20 glass-card-elevated px-4 py-3 rounded-2xl max-w-[220px] pointer-events-auto"
          >
            <div className="flex items-center gap-1.5 mb-1 text-[11px] font-mono text-[var(--text-heading)] font-bold">
              <span className="w-2 h-2 rounded-full bg-[var(--accent-green)] animate-pulse" />
              <span>{SYSTEM_META.brandName} Engine</span>
            </div>
            <div className="text-[10px] text-[var(--text-body)] space-y-0.5 font-mono">
              <div>Scope: <strong className="text-[var(--text-heading)]">52 Defects</strong></div>
              <div>P1 Clearance: <strong className="text-[var(--accent-green)]">100%</strong></div>
              <div>P2 Clearance: <strong className="text-[var(--accent-amber)]">86.4%–100%</strong></div>
              <div>Violations: <strong className="text-[var(--accent-green)]">0 (Optimal)</strong></div>
            </div>
          </motion.div>

        </div>

      </div>

      {/* Live Counter Stat Strip (4 Clean Hero Numbers Counting Up from 0) */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.45 }}
        className="max-w-7xl mx-auto w-full mt-12 relative z-20"
      >
        <div className="glass-card-elevated rounded-3xl p-6 sm:p-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 divide-y sm:divide-y-0 sm:divide-x divide-[var(--border-subtle)]">
            
            {/* Stat 1: P1 Critical Clearance */}
            <div className="flex flex-col items-center sm:items-start px-2 sm:px-6 pt-3 sm:pt-0">
              <span className="text-[11px] font-mono uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5 mb-2 font-medium">
                <ShieldCheck className="w-3.5 h-3.5 text-[var(--accent-green)]" />
                P1 Immediate Clearance
              </span>
              <div className="departure-digit text-2xl sm:text-3xl lg:text-4xl font-mono font-extrabold !text-[var(--accent-green)] px-3 py-1 rounded-xl shadow-sm">
                <DepartureCounter value={100} suffix="%" />
              </div>
              <span className="text-[10px] font-mono text-[var(--accent-green)] mt-2 font-semibold">
                100% cleared (Manual FIFO: 75.0%)
              </span>
            </div>

            {/* Stat 2: P2 Urgent Clearance */}
            <div className="flex flex-col items-center sm:items-start px-2 sm:px-6 pt-3 sm:pt-0">
              <span className="text-[11px] font-mono uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5 mb-2 font-medium">
                <Zap className="w-3.5 h-3.5 text-[var(--accent-amber)]" />
                P2 Urgent Clearance
              </span>
              <div className="departure-digit text-2xl sm:text-3xl lg:text-4xl font-mono font-extrabold !text-[var(--accent-amber)] px-3 py-1 rounded-xl shadow-sm">
                <DepartureCounter value={100} suffix="%" />
              </div>
              <span className="text-[10px] font-mono text-[var(--accent-amber)] mt-2 font-semibold">
                Outperforms manual in both horizons
              </span>
            </div>

            {/* Stat 3: Multi-Dept Bundling Rate */}
            <div className="flex flex-col items-center sm:items-start px-2 sm:px-6 pt-3 sm:pt-0">
              <span className="text-[11px] font-mono uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5 mb-2 font-medium">
                <Layers className="w-3.5 h-3.5 text-[var(--accent-amber)]" />
                Multi-Dept Bundling
              </span>
              <div className="departure-digit text-2xl sm:text-3xl lg:text-4xl font-mono font-extrabold !text-[var(--accent-amber)] px-3 py-1 rounded-xl shadow-sm">
                <DepartureCounter value={23.3} decimals={1} prefix="+" suffix="%" />
              </div>
              <span className="text-[10px] font-mono text-[var(--text-muted)] mt-2 font-semibold">
                TRD + S&T + Track shadow blocks
              </span>
            </div>

            {/* Stat 4: Slot Capacity Violations */}
            <div className="flex flex-col items-center sm:items-start px-2 sm:px-6 pt-3 sm:pt-0">
              <span className="text-[11px] font-mono uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5 mb-2 font-medium">
                <Clock className="w-3.5 h-3.5 text-[var(--accent-green)]" />
                Capacity Violations
              </span>
              <div className="departure-digit text-2xl sm:text-3xl lg:text-4xl font-mono font-extrabold !text-[var(--accent-green)] px-4 py-1 rounded-xl shadow-sm">
                <DepartureCounter value={0} />
              </div>
              <span className="text-[10px] font-mono text-[var(--accent-green)] mt-2 font-semibold">
                100% physically feasible schedule
              </span>
            </div>

          </div>
        </div>
      </motion.div>

    </section>
  );
};
