import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Play, ChevronRight, ChevronLeft, ShieldCheck, Layers, Clock, Cpu } from 'lucide-react';

interface DemoTourModalProps {
  isOpen: boolean;
  onClose: () => void;
  onEnterDashboard: () => void;
}

export const DemoTourModal: React.FC<DemoTourModalProps> = ({
  isOpen,
  onClose,
  onEnterDashboard,
}) => {
  const [currentSlide, setCurrentSlide] = useState(0);

  const slides = [
    {
      title: 'Problem Statement & Challenge (SIH26027)',
      subtitle: 'Prayagraj Division (Kanpur Central → Prayagraj Jn)',
      icon: Clock,
      color: 'text-[var(--accent-amber)]',
      content: 'Indian Railways operates high-density corridors with heavy traffic mix (Rajdhani express, local MEMUs, and goods trains). Track maintenance requires blocking the line for 2 to 6 hours. Manual block planning leads to severe backlog of urgent defects and zero multi-department coordination.',
      stat: '52 Defect Backlog',
      statLabel: 'Across 202km double-line track',
    },
    {
      title: 'Hybrid Rule + ML Prioritization',
      subtitle: 'Deterministic Safety Bands with ML Micro-Scoring',
      icon: Cpu,
      color: 'text-[var(--accent-amber)]',
      content: '1. Hard Safety Rules assign defects to P1 (Immediate), P2 (Urgent), P3 (Planned), P4 (Routine).\n2. A RandomForest model calculates subtle urgency scores within bands based on aging days and track density.\n3. Safety rules are deterministic and can never be overridden.',
      stat: '100% P1 Clearance',
      statLabel: 'Zero safety compromises',
    },
    {
      title: 'Multi-Department Shadow Bundling',
      subtitle: 'TRD (Electrical) + S&T (Signals) + Track Engineering',
      icon: Layers,
      color: 'text-[var(--accent-steel)]',
      content: 'When overhead traction (TRD) is turned off for power maintenance, the solver automatically bundles track engineering and signal maintenance in the same geographic section simultaneously into the power shadow window, saving hours of corridor downtime.',
      stat: '+23.3% Bundling',
      statLabel: '16 bundled multi-team slots',
    },
    {
      title: 'Interactive Dashboard & Explainability',
      subtitle: '3 Data Lenses: Division, Section Engineer & Control Office',
      icon: ShieldCheck,
      color: 'text-[var(--accent-green)]',
      content: 'Judges can explore the Gantt timeline showing occupied and idle slots, filter the Section Engineer worklist table, inspect the 9 contention classifications, and click any defect for a 5-second explainability breakdown.',
      stat: '0 Violations',
      statLabel: 'Fully feasible verified schedules',
    },
  ];

  if (!isOpen) return null;

  const current = slides[currentSlide];
  const Icon = current.icon;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
        
        {/* Backdrop click to close */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0"
        />

        {/* Modal Container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-2xl glass-card-elevated rounded-3xl p-6 sm:p-8 border border-[var(--border-medium)] shadow-2xl z-10 overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-[var(--border-subtle)] mb-6">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-[var(--accent-amber-bg)] flex items-center justify-center text-[var(--accent-amber)]">
                <Play className="w-3.5 h-3.5 fill-current" />
              </div>
              <span className="font-mono text-xs font-bold text-[var(--text-heading)]">
                System Walkthrough & Evaluation Guide
              </span>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-[var(--bg-pill-hover)] text-[var(--text-muted)] hover:text-[var(--text-heading)] transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Slide Content */}
          <div className="min-h-[220px] flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <Icon className={`w-6 h-6 ${current.color}`} />
                <div>
                  <h3 className="text-lg font-bold text-[var(--text-heading)] font-display">
                    {current.title}
                  </h3>
                  <span className="text-xs text-[var(--text-muted)] block">
                    {current.subtitle}
                  </span>
                </div>
              </div>

              <p className="text-xs sm:text-sm text-[var(--text-body)] leading-relaxed whitespace-pre-line mt-4">
                {current.content}
              </p>
            </div>

            {/* Highlight Metric */}
            <div className="mt-6 p-4 rounded-2xl bg-[var(--bg-card-subtle)] border border-[var(--border-subtle)] flex items-center justify-between">
              <span className="text-xs text-[var(--text-muted)]">{current.statLabel}</span>
              <span className="font-mono text-base font-bold text-[var(--accent-amber)]">
                {current.stat}
              </span>
            </div>
          </div>

          {/* Footer Controls & Progress */}
          <div className="flex items-center justify-between pt-6 mt-6 border-t border-[var(--border-subtle)]">
            {/* Step Indicators */}
            <div className="flex items-center gap-1.5">
              {slides.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentSlide(idx)}
                  className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                    currentSlide === idx ? 'w-6 bg-[var(--accent-amber)]' : 'w-2 bg-[var(--border-strong)]'
                  }`}
                />
              ))}
            </div>

            {/* Navigation Buttons */}
            <div className="flex items-center gap-2">
              {currentSlide > 0 && (
                <button
                  onClick={() => setCurrentSlide(prev => prev - 1)}
                  className="px-3.5 py-2 rounded-full bg-[var(--bg-surface)] hover:bg-[var(--bg-pill-hover)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-heading)] flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Prev
                </button>
              )}

              {currentSlide < slides.length - 1 ? (
                <button
                  onClick={() => setCurrentSlide(prev => prev + 1)}
                  className="px-4 py-2 rounded-full bg-[var(--accent-amber)] hover:opacity-90 text-xs font-mono font-bold text-white dark:text-[#05070C] flex items-center gap-1 transition-colors shadow-[var(--shadow-glow-amber)] cursor-pointer"
                >
                  Next
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  onClick={() => {
                    onClose();
                    onEnterDashboard();
                  }}
                  className="px-5 py-2 rounded-full bg-[var(--accent-amber)] hover:opacity-90 text-xs font-mono font-bold text-white dark:text-[#05070C] flex items-center gap-1 transition-all shadow-[var(--shadow-glow-amber)] cursor-pointer"
                >
                  Enter Live Dashboard →
                </button>
              )}
            </div>
          </div>

        </motion.div>
      </div>
    </AnimatePresence>
  );
};
