import React from 'react';
import { Play, ArrowRight, Train, Sun, Moon } from 'lucide-react';
import { SYSTEM_META } from '../../config/constants';
import { useTheme } from '../../context/ThemeContext';

interface LandingNavbarProps {
  onEnterDashboard: () => void;
  onOpenDemo: () => void;
}

export const LandingNavbar: React.FC<LandingNavbarProps> = ({
  onEnterDashboard,
  onOpenDemo,
}) => {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <header className="fixed top-0 left-0 right-0 z-40 px-4 sm:px-8 py-4 pointer-events-none">
      <div className="max-w-7xl mx-auto flex items-center justify-between pointer-events-auto">
        
        {/* Brand / Logo (Clicking opens Home / scrolls to top) */}
        <a 
          href="#hero" 
          id="navbar-logo"
          onClick={(e) => {
            e.preventDefault();
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className="flex items-center gap-3 group bg-[var(--bg-card)] backdrop-blur-xl px-4 py-2 rounded-full border border-[var(--border-subtle)] hover:border-[var(--border-highlight)] transition-all duration-300 shadow-[var(--shadow-card)] cursor-pointer"
          title="Go to Home Page"
        >
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--accent-amber)] to-[var(--accent-steel)] p-0.5 flex items-center justify-center shadow-[var(--shadow-glow-amber)] relative">
            <div className="w-full h-full bg-[var(--bg-surface)] rounded-full flex items-center justify-center transition-colors">
              <Train className="w-4 h-4 text-[var(--accent-amber)] group-hover:scale-110 transition-transform" />
            </div>
            {/* Active signal beacon pulse */}
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[var(--accent-green)] ring-2 ring-[var(--bg-surface)]" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-display font-bold text-sm tracking-wide text-[var(--text-heading)]">
                {SYSTEM_META.title}
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[var(--accent-amber-bg)] text-[var(--accent-amber)] border border-[var(--accent-amber-border)] font-semibold">
                {SYSTEM_META.problemId}
              </span>
            </div>
            <span className="text-[10px] text-[var(--text-muted)] -mt-0.5">
              Prayagraj Division • 202km
            </span>
          </div>
        </a>

        {/* Minimal Pill Links (Desktop) */}
        <nav className="hidden md:flex items-center gap-1 bg-[var(--bg-card)] backdrop-blur-xl px-4 py-1.5 rounded-full border border-[var(--border-subtle)] shadow-[var(--shadow-card)]">
          <a
            href="#corridor"
            className="text-xs font-medium text-[var(--text-body)] hover:text-[var(--text-heading)] px-3 py-1.5 rounded-full hover:bg-[var(--bg-pill-hover)] transition-colors"
          >
            Corridor (202km)
          </a>
          <a
            href="#comparison"
            className="text-xs font-medium text-[var(--text-body)] hover:text-[var(--text-heading)] px-3 py-1.5 rounded-full hover:bg-[var(--bg-pill-hover)] transition-colors"
          >
            Model vs Baseline
          </a>
          <a
            href="#unscheduled"
            className="text-xs font-medium text-[var(--text-body)] hover:text-[var(--text-heading)] px-3 py-1.5 rounded-full hover:bg-[var(--bg-pill-hover)] transition-colors"
          >
            Classifications
          </a>
        </nav>

        {/* Action Buttons & Theme Switcher */}
        <div className="flex items-center gap-2 sm:gap-3">
          
          {/* Dark / Light Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-full bg-[var(--bg-card)] hover:bg-[var(--bg-pill-hover)] border border-[var(--border-subtle)] text-[var(--text-body)] hover:text-[var(--text-heading)] transition-colors shadow-[var(--shadow-card)] cursor-pointer"
            title={`Switch to ${isDark ? 'Light' : 'Dark'} mode`}
            aria-label="Toggle theme"
          >
            {isDark ? (
              <Sun className="w-4 h-4 text-[var(--accent-amber-light)]" />
            ) : (
              <Moon className="w-4 h-4 text-[var(--accent-steel)]" />
            )}
          </button>

          {/* Interactive Walkthrough Demo Button */}
          <button
            onClick={onOpenDemo}
            className="flex items-center gap-2 bg-[var(--bg-card)] hover:bg-[var(--bg-pill-hover)] text-xs font-medium text-[var(--text-heading)] px-3.5 py-2 rounded-full border border-[var(--border-subtle)] hover:border-[var(--border-highlight)] backdrop-blur-xl transition-all shadow-[var(--shadow-card)] group cursor-pointer"
            title="Watch system overview demo"
          >
            <div className="w-5 h-5 rounded-full bg-[var(--accent-amber-bg)] flex items-center justify-center text-[var(--accent-amber)] group-hover:scale-110 transition-transform">
              <Play className="w-2.5 h-2.5 fill-current ml-0.5" />
            </div>
            <span className="hidden sm:inline">Demo Tour</span>
          </button>

          {/* Primary CTA: View Live Plan / Enter Dashboard */}
          <button
            onClick={onEnterDashboard}
            className="flex items-center gap-2 bg-[var(--accent-amber)] hover:opacity-90 text-xs font-bold text-white dark:text-[#05070C] px-4 sm:px-5 py-2.5 rounded-full shadow-[var(--shadow-glow-amber)] transition-all duration-300 transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
          >
            <span>Enter Dashboard</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

      </div>
    </header>
  );
};
