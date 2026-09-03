import React from 'react';
import {
  LayoutDashboard,
  Calendar,
  AlertCircle,
  MapPin,
  ArrowLeft,
  Train,
  Clock,
} from 'lucide-react';
import { SYSTEM_META } from '../../config/constants';

export type DashboardTab = 'overview' | 'weekly' | 'monthly' | 'unscheduled' | 'corridor';

interface SidebarProps {
  activeTab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
  onBackToLanding: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  onBackToLanding,
}) => {
  const navItems = [
    {
      id: 'overview' as DashboardTab,
      label: 'Corridor Overview',
      icon: LayoutDashboard,
      badge: '202km',
    },
    {
      id: 'weekly' as DashboardTab,
      label: 'Weekly Plan (7d)',
      icon: Calendar,
      badge: '66 Slots',
    },
    {
      id: 'monthly' as DashboardTab,
      label: 'Monthly Plan (30d)',
      icon: Clock,
      badge: '56 Slots',
    },
    {
      id: 'unscheduled' as DashboardTab,
      label: 'Unscheduled Work',
      icon: AlertCircle,
      badge: '9 Contention',
    },
    {
      id: 'corridor' as DashboardTab,
      label: 'Section Track Map',
      icon: MapPin,
      badge: '5 Sections',
    },
  ];

  return (
    <aside className="w-full lg:w-64 bg-[var(--bg-card)] backdrop-blur-2xl border-r border-[var(--border-subtle)] flex flex-col justify-between p-4 shrink-0 transition-colors">
      
      {/* Top Brand Block - Clicking logo returns to Home Page */}
      <div>
        <button
          onClick={onBackToLanding}
          className="w-full flex items-center gap-3 px-3 py-3 mb-6 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--border-highlight)] shadow-[var(--shadow-card)] transition-all text-left cursor-pointer group"
          title="Return to Home Page"
        >
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[var(--accent-amber)] to-[var(--accent-steel)] p-0.5 flex items-center justify-center shadow-[var(--shadow-glow-amber)] shrink-0 group-hover:scale-105 transition-transform">
            <div className="w-full h-full bg-[var(--bg-surface)] rounded-[10px] flex items-center justify-center">
              <Train className="w-4 h-4 text-[var(--accent-amber)]" />
            </div>
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-display font-extrabold text-sm tracking-tight text-[var(--text-heading)] truncate group-hover:text-[var(--accent-amber)] transition-colors">
              {SYSTEM_META.title}
            </span>
            <span className="text-[10px] font-mono text-[var(--text-muted)] truncate">
              {SYSTEM_META.division} • Home
            </span>
          </div>
        </button>

        {/* Navigation Tab Links */}
        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-mono font-medium transition-all cursor-pointer ${
                  isActive
                    ? 'bg-[var(--accent-amber-bg)] text-[var(--accent-amber)] border-l-4 border-[var(--accent-amber)] shadow-sm font-bold'
                    : 'text-[var(--text-body)] hover:text-[var(--text-heading)] hover:bg-[var(--bg-pill-hover)]'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-[var(--accent-amber)]' : 'text-[var(--text-muted)]'}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                    isActive
                      ? 'bg-[var(--accent-amber-bg)] text-[var(--accent-amber)] border-[var(--accent-amber-border)]'
                      : 'bg-[var(--bg-pill)] text-[var(--text-muted)] border-[var(--border-subtle)]'
                  }`}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Info & Exit Button */}
      <div className="pt-4 border-t border-[var(--border-subtle)] space-y-3">
        
        {/* Quick Corridor Indicator */}
        <div className="p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[11px] font-mono text-[var(--text-muted)] space-y-1">
          <div className="flex justify-between">
            <span>Corridor:</span>
            <strong className="text-[var(--text-heading)]">CNB → PRYJ</strong>
          </div>
          <div className="flex justify-between">
            <span>Speed Limit:</span>
            <strong className="text-[var(--accent-amber)]">130 km/h</strong>
          </div>
          <div className="flex justify-between">
            <span>Traction:</span>
            <strong className="text-[var(--accent-steel)]">25 kV AC</strong>
          </div>
        </div>

        {/* Back to Home Page Link */}
        <button
          onClick={onBackToLanding}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-mono font-semibold text-[var(--text-body)] hover:text-[var(--text-heading)] hover:bg-[var(--bg-pill-hover)] transition-colors border border-[var(--border-subtle)] cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Exit to Landing Page</span>
        </button>
      </div>

    </aside>
  );
};
