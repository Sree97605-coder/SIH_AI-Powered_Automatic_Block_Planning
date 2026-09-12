import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Shield, User, Calendar, Zap, Radio, Sun, Moon, PlusCircle, LogOut } from 'lucide-react';
import { DepartmentType, HorizonType, PerspectiveType, RoleType } from '../../types';
import { useTheme } from '../../context/ThemeContext';
import { SYSTEM_META } from '../../config/constants';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface TopBarProps {
  horizon: HorizonType;
  onHorizonChange: (h: HorizonType) => void;
  perspective: PerspectiveType;
  onPerspectiveChange: (p: PerspectiveType) => void;
  solverStatus?: string;
  isBackendConnected?: boolean;
  role: RoleType;
  department: DepartmentType;
}

export const TopBar: React.FC<TopBarProps> = ({
  horizon,
  onHorizonChange,
  perspective,
  onPerspectiveChange,
  solverStatus = 'Optimal',
  role,
  department,
}) => {
  const { theme, toggleTheme } = useTheme();
  const { logout } = useAuth();
  const isDark = theme === 'dark';
  const isOptimal = solverStatus.toLowerCase() === 'optimal';
  const [isPerspectiveMenuOpen, setIsPerspectiveMenuOpen] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const perspectiveMenuRef = useRef<HTMLDivElement>(null);

  const handleSimulateCrisDefect = async () => {
    if (role !== 'COA_ADMIN') return;
    setIsSimulating(true);
    try {
      const payload = {
        defect_id: `TMS-CRIS-${Date.now()}`,
        department: 'Engineering',
        location: 'SEC-01 / km 5.4 (CNB–CNBI Up)',
        section_id: 'SEC-01',
        section_name: 'Kanpur Central – Bindki Road',
        defect_type: 'Rail fracture (suspect)',
        severity: 'High',
        overdue_days: 2,
        estimated_duration_hours: 4,
        criticality_score: 9,
        asset_impact: 'High',
        description: 'CRIS simulated defect queued for re-optimization.',
        source_system: 'TMS',
      };
      const result = await api.simulateDefect(payload);
      if (result.status === 'SCHEDULED' && result.slot_id && result.horizon) {
        alert(`New defect ${result.defect_id} scheduled immediately into slot ${result.slot_id} (${result.horizon}) — no full re-optimization needed.`);
      } else if (result.duplicate) {
        alert(`Duplicate CRIS defect queued: ${result.defect_id}`);
      } else {
        alert(`Queued ${result.defect_id} for re-optimization.`);
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Unable to simulate CRIS defect.');
    } finally {
      setIsSimulating(false);
    }
  };

  useEffect(() => {
    const handlePointerDownOutside = (event: PointerEvent) => {
      if (!perspectiveMenuRef.current?.contains(event.target as Node)) {
        setIsPerspectiveMenuOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsPerspectiveMenuOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDownOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDownOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  // PERSPECTIVE SWITCHER:
  // Presentation-layer data lens filter across all railway departments
  const perspectiveLabels: Record<PerspectiveType, { title: string; subtitle: string; icon: React.FC<{ className?: string }> }> = {
    division: {
      title: 'Division Overview',
      subtitle: 'Corridor KPI strip & summary map',
      icon: Shield,
    },
    control: {
      title: 'Control Office (Gantt)',
      subtitle: 'Corridor slot timetable & idle capacity',
      icon: Calendar,
    },
    engineer: {
      title: 'Track Engineering (TMS)',
      subtitle: 'P-Way track fractures & tamping queue',
      icon: User,
    },
    ohe: {
      title: 'Traction / OHE (TDMS)',
      subtitle: '25kV catenary & power shadow blocks',
      icon: Zap,
    },
    smt: {
      title: 'Signals & Telecom (S&T)',
      subtitle: 'EI relays, point machines & cables',
      icon: Radio,
    },
  };

  const CurrentIcon = perspectiveLabels[perspective]?.icon || Shield;

  return (
    <header className="sticky top-0 z-30 h-16 bg-[var(--bg-card)] backdrop-blur-xl border-b border-[var(--border-subtle)] px-4 sm:px-8 flex items-center justify-between gap-4 transition-colors">
      
      {/* Left: Corridor Breadcrumb */}
      <div className="flex items-center gap-2 text-xs font-mono text-[var(--text-muted)]">
        <span className="text-[var(--text-heading)] font-bold">{SYSTEM_META.brandName} • Prayagraj (202km)</span>
        <span>/</span>
        <span className="text-[var(--accent-amber)] font-bold uppercase">{horizon} Horizon Plan</span>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-3">
        
        {/* Dark / Light Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="p-1.5 rounded-full bg-[var(--bg-surface)] hover:bg-[var(--bg-pill-hover)] border border-[var(--border-subtle)] text-[var(--text-body)] hover:text-[var(--text-heading)] transition-colors shadow-sm cursor-pointer"
          title={`Switch to ${isDark ? 'Light' : 'Dark'} mode`}
          aria-label="Toggle theme"
        >
          {isDark ? (
            <Sun className="w-4 h-4 text-[var(--accent-amber-light)]" />
          ) : (
            <Moon className="w-4 h-4 text-[var(--accent-steel)]" />
          )}
        </button>

        {/* Global Horizon Toggle */}
        <div className="flex items-center p-1 rounded-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-inner">
          <button
            onClick={() => onHorizonChange('weekly')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-mono font-bold transition-all cursor-pointer ${
              horizon === 'weekly'
                ? 'bg-[var(--accent-amber)] text-[var(--text-inverse)] shadow-[var(--shadow-glow-amber)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-heading)]'
            }`}
          >
            Weekly (7d)
          </button>
          <button
            onClick={() => onHorizonChange('monthly')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-mono font-bold transition-all cursor-pointer ${
              horizon === 'monthly'
                ? 'bg-[var(--accent-amber)] text-[var(--text-inverse)] shadow-[var(--shadow-glow-amber)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-heading)]'
            }`}
          >
            Monthly (30d)
          </button>
        </div>

        <div className="flex items-center gap-2 bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-3 py-1 rounded-full shadow-[var(--shadow-card)]">
          <User className="w-3.5 h-3.5 text-[var(--accent-amber)]" />
          <span className="text-[9px] text-[var(--text-muted)] font-mono">Identity</span>
          <span className="text-xs font-mono font-bold text-[var(--text-heading)]">{role.replace('_', ' ')}</span>
          {role === 'DEPT_ENGINEER' && <span className="border-l border-[var(--border-subtle)] pl-2 text-xs font-mono font-bold text-[var(--accent-steel)]">{department}</span>}
        </div>

        <button
          type="button"
          onClick={() => { void logout(); }}
          className="inline-flex items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-[10px] font-mono font-bold text-[var(--text-heading)] hover:border-[var(--accent-red)] hover:text-[var(--accent-red)] transition-colors cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          Log out
        </button>

        {role === 'COA_ADMIN' && (
          <button
            type="button"
            onClick={handleSimulateCrisDefect}
            disabled={isSimulating}
            className="flex items-center gap-2 bg-[var(--accent-amber)] text-[var(--text-inverse)] border border-[var(--accent-amber-border)] px-3 py-1.5 rounded-full text-[10px] font-mono font-bold shadow-[var(--shadow-glow-amber)] transition-all cursor-pointer disabled:opacity-60"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>{isSimulating ? 'Queuing…' : 'Simulate CRIS Defect'}</span>
          </button>
        )}

        {/* Perspective Switcher Dropdown (With OHE & SSMT Support) */}
        <div className="relative" ref={perspectiveMenuRef}>
          <button
            type="button"
            onClick={() => setIsPerspectiveMenuOpen((isOpen) => !isOpen)}
            aria-expanded={isPerspectiveMenuOpen}
            aria-haspopup="menu"
            className="flex items-center gap-2 bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--border-highlight)] px-3.5 py-1.5 rounded-full cursor-pointer transition-all shadow-[var(--shadow-card)]"
          >
            <CurrentIcon className="w-3.5 h-3.5 text-[var(--accent-amber)]" />
            <div className="flex flex-col text-left">
              <span className="text-[9px] text-[var(--text-muted)] -mb-0.5 leading-none">View as:</span>
              <span className="text-xs font-mono font-bold text-[var(--text-heading)] leading-tight">
                {perspectiveLabels[perspective]?.title || 'Division Overview'}
              </span>
            </div>
            <ChevronDown className={`w-3.5 h-3.5 text-[var(--text-muted)] ml-1 transition-transform ${isPerspectiveMenuOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Dropdown Menu */}
          <div
            role="menu"
            aria-hidden={!isPerspectiveMenuOpen}
            className={`absolute right-0 mt-2 w-72 glass-card-elevated rounded-2xl p-2 border border-[var(--border-medium)] shadow-2xl bg-[var(--bg-dropdown)] backdrop-blur-2xl transition-all duration-200 z-50 ${isPerspectiveMenuOpen ? 'opacity-100 visible' : 'opacity-0 invisible pointer-events-none'}`}
          >
            <div className="px-3 py-1.5 text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-wider border-b border-[var(--border-subtle)] mb-1 font-semibold">
              Select Department Perspective
            </div>
            {(Object.keys(perspectiveLabels) as PerspectiveType[]).map((pKey) => {
              const item = perspectiveLabels[pKey];
              const Icon = item.icon;
              const isSelected = perspective === pKey;
              return (
                <button
                  key={pKey}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onPerspectiveChange(pKey);
                    setIsPerspectiveMenuOpen(false);
                  }}
                  className={`w-full flex items-start gap-2.5 p-2.5 rounded-xl text-left transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-[var(--accent-amber-bg)] text-[var(--text-heading)] border border-[var(--accent-amber-border)]'
                      : 'hover:bg-[var(--bg-pill-hover)] text-[var(--text-body)] hover:text-[var(--text-heading)]'
                  }`}
                >
                  <Icon className={`w-4 h-4 mt-0.5 ${isSelected ? 'text-[var(--accent-amber)]' : 'text-[var(--text-muted)]'}`} />
                  <div>
                    <span className={`text-xs font-bold block ${isSelected ? 'text-[var(--accent-amber)]' : 'text-[var(--text-heading)]'}`}>
                      {item.title}
                    </span>
                    <span className="text-[10px] text-[var(--text-muted)] leading-tight block">
                      {item.subtitle}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Solver status chip */}
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-mono font-bold transition-colors ${
            isOptimal
              ? 'bg-[var(--accent-green-bg)] border-[var(--accent-green-border)] text-[var(--accent-green)]'
              : 'bg-[var(--accent-red-bg)] border-[var(--accent-red-border)] text-[var(--accent-red)]'
          }`}
          title="Optimization solver convergence status"
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isOptimal ? 'bg-[var(--accent-green)] shadow-[var(--shadow-glow-green)]' : 'bg-[var(--accent-red)]'
            }`}
          />
          <span>Solver: {solverStatus} (0 Violations)</span>
        </div>

      </div>

    </header>
  );
};
