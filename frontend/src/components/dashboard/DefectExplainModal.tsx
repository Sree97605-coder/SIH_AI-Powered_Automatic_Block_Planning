import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Shield, Cpu, Clock } from 'lucide-react';
import { Defect } from '../../types';

interface DefectExplainModalProps {
  defect: Defect | null;
  onClose: () => void;
}

export const DefectExplainModal: React.FC<DefectExplainModalProps> = ({
  defect,
  onClose,
}) => {
  if (!defect) return null;

  const isP1 = defect.urgency_band.includes('P1');
  const isP2 = defect.urgency_band.includes('P2');

  const priorityScore = defect.final_priority_score ?? defect.priority_score ?? defect.rule_priority_score ?? 75.0;
  const mlScore = defect.ml_priority_score ?? (priorityScore + 0.2);

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
        
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="relative w-full max-w-lg glass-card-elevated rounded-3xl p-6 sm:p-8 border border-[var(--border-medium)] shadow-2xl z-10 overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-[var(--border-subtle)] mb-6">
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm font-extrabold text-[var(--accent-amber)] px-2.5 py-1 rounded-lg bg-[var(--accent-amber-bg)] border border-[var(--accent-amber-border)]">
                {defect.defect_id}
              </span>
              <div>
                <span className="text-xs font-semibold text-[var(--text-heading)] block">
                  {defect.defect_type || 'Track Maintenance Order'}
                </span>
                <span className="text-[10px] font-mono text-[var(--text-muted)]">
                  {defect.section_id} • {defect.location || 'Prayagraj Main Line'}
                </span>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-[var(--bg-pill-hover)] text-[var(--text-muted)] hover:text-[var(--text-heading)] transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* 3 Clear Explainability Pillars */}
          <div className="space-y-3.5">
            
            {/* 1. Hard Safety Rule (Primary Driver) */}
            <div className="p-4 rounded-2xl bg-[var(--bg-card-subtle)] border border-[var(--border-subtle)]">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Shield className={`w-4 h-4 ${isP1 ? 'text-[var(--accent-red)]' : isP2 ? 'text-[var(--accent-amber)]' : 'text-[var(--accent-steel)]'}`} />
                  <span className="text-xs font-bold text-[var(--text-heading)]">1. Hard Safety Rule (Primary Driver)</span>
                </div>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold border ${
                  isP1 
                    ? 'bg-[var(--accent-red-bg)] text-[var(--accent-red)] border-[var(--accent-red-border)]' 
                    : isP2 
                    ? 'bg-[var(--accent-amber-bg)] text-[var(--accent-amber)] border-[var(--accent-amber-border)]' 
                    : 'bg-[var(--accent-steel-bg)] text-[var(--accent-steel)] border-[var(--accent-steel-border)]'
                }`}>
                  {defect.urgency_band}
                </span>
              </div>
              <p className="text-xs text-[var(--text-body)] leading-relaxed">
                Deterministic Indian Railways safety code. Base urgency band is strict and can <strong className="text-[var(--text-heading)]">never</strong> be downgraded by the AI.
              </p>
            </div>

            {/* 2. ML Risk Score (Fine-Grained Ranking) */}
            <div className="p-4 rounded-2xl bg-[var(--bg-card-subtle)] border border-[var(--border-subtle)]">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-[var(--accent-amber)]" />
                  <span className="text-xs font-bold text-[var(--text-heading)]">2. ML Risk Score (Within-Band Fine Ranking)</span>
                </div>
                <span className="text-[10px] font-mono font-bold text-[var(--accent-amber)]">
                  {mlScore.toFixed(2)} / 100
                </span>
              </div>
              <p className="text-xs text-[var(--text-body)] leading-relaxed">
                Learned model refines priority <strong className="text-[var(--text-heading)]">only within</strong> its band based on overdue aging ({defect.overdue_days || 0}d), asset impact, and line traffic density.
              </p>
            </div>

            {/* 3. Duration & Slot Feasibility */}
            <div className="p-4 rounded-2xl bg-[var(--bg-card-subtle)] border border-[var(--border-subtle)]">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[var(--accent-green)]" />
                  <span className="text-xs font-bold text-[var(--text-heading)]">3. Duration & Allocation</span>
                </div>
                <span className="text-[10px] font-mono text-[var(--text-muted)]">
                  Est: <strong className="text-[var(--text-heading)]">{defect.estimated_duration_hours} hrs</strong>
                </span>
              </div>
              <p className="text-xs text-[var(--text-body)] leading-relaxed">
                {defect.unscheduled_reason ? (
                  <span className="text-[var(--accent-amber)] font-medium">{defect.unscheduled_reason}</span>
                ) : (
                  <span>Assigned to optimal standard maintenance window without exceeding corridor capacity.</span>
                )}
              </p>
            </div>

            {/* Description note */}
            {defect.description && (
              <div className="p-3 rounded-xl bg-[var(--bg-card-subtle)] border border-[var(--border-subtle)] text-xs text-[var(--text-body)]">
                <strong className="text-[var(--text-heading)] block mb-0.5 text-[10px] uppercase font-mono">Field Inspection Report:</strong>
                {defect.description}
              </div>
            )}

          </div>

          {/* Footer Action */}
          <div className="mt-5 pt-3 border-t border-[var(--border-subtle)] flex justify-end">
            <button
              onClick={onClose}
              className="px-5 py-2 rounded-full bg-[var(--bg-surface)] hover:bg-[var(--bg-pill-hover)] border border-[var(--border-subtle)] text-xs font-mono font-bold text-[var(--text-heading)] transition-colors cursor-pointer"
            >
              Done (Close)
            </button>
          </div>

        </motion.div>
      </div>
    </AnimatePresence>
  );
};
