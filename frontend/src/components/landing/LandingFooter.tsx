import React from 'react';
import { ArrowUp, Train } from 'lucide-react';
import { SYSTEM_META } from '../../config/constants';

interface LandingFooterProps {
  onEnterDashboard: () => void;
}

export const LandingFooter: React.FC<LandingFooterProps> = ({ onEnterDashboard }) => {
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <footer className="border-t border-[var(--border-subtle)] bg-[var(--bg-card)] py-16 px-4 sm:px-8 relative z-10 transition-colors">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-8">
        
        {/* Brand info */}
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--accent-amber)] to-[var(--accent-steel)] p-0.5 flex items-center justify-center shadow-[var(--shadow-glow-amber)]">
            <div className="w-full h-full bg-[var(--bg-surface)] rounded-[10px] flex items-center justify-center">
              <Train className="w-5 h-5 text-[var(--accent-amber)]" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-display font-extrabold text-base text-[var(--text-heading)]">
                {SYSTEM_META.title}
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[var(--accent-amber-bg)] text-[var(--accent-amber)] border border-[var(--accent-amber-border)] font-bold">
                SIH2026
              </span>
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              {SYSTEM_META.ministry} • {SYSTEM_META.division} (202km)
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-4">
          <button
            onClick={onEnterDashboard}
            className="px-6 py-2.5 rounded-full bg-[var(--accent-amber)] hover:opacity-90 text-white dark:text-[#05070C] font-bold text-xs shadow-[var(--shadow-glow-amber)] transition-all cursor-pointer"
          >
            Launch Schedule Dashboard
          </button>

          <button
            onClick={scrollToTop}
            className="p-2.5 rounded-full bg-[var(--bg-surface)] hover:bg-[var(--bg-pill-hover)] border border-[var(--border-subtle)] text-[var(--text-body)] hover:text-[var(--text-heading)] transition-colors cursor-pointer"
            title="Scroll to top"
          >
            <ArrowUp className="w-4 h-4" />
          </button>
        </div>

      </div>
    </footer>
  );
};
