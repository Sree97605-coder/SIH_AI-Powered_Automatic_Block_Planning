import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, LogOut, Moon, Sun, User } from 'lucide-react';
import { PerspectiveType, RoleType } from '../../types';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';

interface TopBarProps {
  perspective: PerspectiveType;
  onPerspectiveChange: (p: PerspectiveType) => void;
  role: RoleType;
}

export const TopBar: React.FC<TopBarProps> = ({ perspective, onPerspectiveChange, role }) => {
  const { theme, toggleTheme } = useTheme();
  const { logout } = useAuth();
  const isDark = theme === 'dark';
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handlePointerDownOutside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsUserMenuOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDownOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDownOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  const perspectiveLabels: Record<PerspectiveType, { title: string }> = {
    division: { title: 'Division Overview' },
    control: { title: 'Control Office (Gantt)' },
    engineer: { title: 'Track Engineering (TMS)' },
    ohe: { title: 'Traction / OHE (TDMS)' },
    smt: { title: 'Signals & Telecom (S&T)' },
  };

  return (
    <header className="sticky top-0 z-30 h-16 bg-[var(--bg-card)] backdrop-blur-xl border-b border-[var(--border-subtle)] px-4 sm:px-8 flex items-center justify-end gap-3 transition-colors">
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

      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setIsUserMenuOpen((open) => !open)}
          aria-expanded={isUserMenuOpen}
          aria-haspopup="menu"
          className="flex items-center gap-2 bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--border-highlight)] px-3 py-1.5 rounded-full cursor-pointer transition-all shadow-[var(--shadow-card)]"
        >
          <User className="w-3.5 h-3.5 text-[var(--accent-amber)]" />
          <span className="text-xs font-mono font-bold text-[var(--text-heading)]">{role}</span>
          <ChevronDown className={`w-3.5 h-3.5 text-[var(--text-muted)] transition-transform ${isUserMenuOpen ? 'rotate-180' : ''}`} />
        </button>

        <div
          role="menu"
          aria-hidden={!isUserMenuOpen}
          className={`absolute right-0 mt-2 w-64 glass-card-elevated rounded-2xl p-2 border border-[var(--border-medium)] shadow-2xl bg-[var(--bg-dropdown)] backdrop-blur-2xl transition-all duration-200 z-50 ${isUserMenuOpen ? 'opacity-100 visible' : 'opacity-0 invisible pointer-events-none'}`}
        >
          {role === 'COA_ADMIN' && (
            <>
              <div className="px-3 py-1.5 text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-wider border-b border-[var(--border-subtle)] mb-1 font-semibold">
                View as
              </div>
              {(Object.keys(perspectiveLabels) as PerspectiveType[]).map((pKey) => {
                const isSelected = perspective === pKey;
                return (
                  <button
                    key={pKey}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onPerspectiveChange(pKey);
                      setIsUserMenuOpen(false);
                    }}
                    className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[var(--accent-amber-bg)] text-[var(--text-heading)] border border-[var(--accent-amber-border)]'
                        : 'hover:bg-[var(--bg-pill-hover)] text-[var(--text-body)] hover:text-[var(--text-heading)]'
                    }`}
                  >
                    <span className="text-xs font-mono font-bold">{perspectiveLabels[pKey].title}</span>
                    {isSelected && <span className="text-[10px] text-[var(--accent-amber)]">Active</span>}
                  </button>
                );
              })}
            </>
          )}

          <button
            type="button"
            onClick={() => { void logout(); setIsUserMenuOpen(false); }}
            className="mt-2 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[11px] font-mono font-bold text-[var(--text-heading)] hover:bg-[var(--bg-pill-hover)] transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Logout
          </button>
        </div>
      </div>
    </header>
  );
};
