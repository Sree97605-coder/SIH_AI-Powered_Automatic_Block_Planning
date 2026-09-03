import React, { useState, useEffect } from 'react';
import {
  Calendar,
  ListFilter,
  Search,
  Clock,
  ChevronRight,
  Eye,
  Zap,
  Radio,
  Layers,
  Shield,
  Info,
} from 'lucide-react';
import { HorizonType, Defect, DepartmentType } from '../../../types';
import { MergedSlotDisplay } from '../../../api/idleCapacity';
import { CORRIDOR_DATA, DEPARTMENTS_INFO, SYSTEM_META } from '../../../config/constants';

interface PlanScheduleViewProps {
  horizon: HorizonType;
  mergedSlots: MergedSlotDisplay[];
  defects: Defect[];
  isLoading: boolean;
  onSelectDefect: (defect: Defect) => void;
  selectedSectionFilter?: string;
  onSelectSectionFilter?: (secId: string) => void;
  initialViewMode?: 'control' | 'engineer';
  departmentPerspective?: 'ALL' | 'Engineering' | 'TRD' | 'S&T';
}

export const PlanScheduleView: React.FC<PlanScheduleViewProps> = ({
  horizon,
  mergedSlots,
  defects,
  onSelectDefect,
  selectedSectionFilter = 'ALL',
  onSelectSectionFilter,
  initialViewMode = 'control',
  departmentPerspective = 'ALL',
}) => {
  const [viewMode, setViewMode] = useState<'control' | 'engineer'>(initialViewMode);
  const [activeDept, setActiveDept] = useState<DepartmentType>(departmentPerspective);
  const [searchQuery, setSearchQuery] = useState('');
  const [urgencyFilter, setUrgencyFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OCCUPIED' | 'IDLE'>('ALL');

  // Synchronize state when topbar perspective changes
  useEffect(() => {
    if (initialViewMode) {
      setViewMode(initialViewMode);
    }
  }, [initialViewMode]);

  useEffect(() => {
    if (departmentPerspective) {
      setActiveDept(departmentPerspective);
    }
  }, [departmentPerspective]);

  // Robust Filtered Slots for Timeline
  const filteredSlots = mergedSlots.filter((slot) => {
    if (selectedSectionFilter !== 'ALL' && slot.section_id !== selectedSectionFilter) {
      return false;
    }
    if (statusFilter === 'OCCUPIED' && !slot.is_occupied) return false;
    if (statusFilter === 'IDLE' && slot.is_occupied) return false;
    
    if (activeDept !== 'ALL') {
      if (!slot.is_occupied) return false; // In specific department view, filter to slots containing their tasks
      
      const hasDept = slot.departments_involved.some((d) => {
        const dLow = d.toLowerCase();
        if (activeDept === 'Engineering') return dLow.includes('eng') || dLow.includes('tms') || dLow.includes('track');
        if (activeDept === 'TRD') return dLow.includes('trd') || dLow.includes('tdms') || dLow.includes('ohe') || dLow.includes('tract');
        if (activeDept === 'S&T') return dLow.includes('s&t') || dLow.includes('smms') || dLow.includes('smt') || dLow.includes('sign') || dLow.includes('tele');
        return false;
      }) || slot.assigned_defect_ids.some((id) => {
        if (activeDept === 'Engineering') return id.startsWith('TMS');
        if (activeDept === 'TRD') return id.startsWith('TDMS');
        if (activeDept === 'S&T') return id.startsWith('SMMS');
        return false;
      });

      if (!hasDept) return false;
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const inId = slot.slot_id.toLowerCase().includes(q);
      const inSec = slot.section_id.toLowerCase().includes(q);
      const inDef = slot.assigned_defect_ids.some(id => id.toLowerCase().includes(q));
      if (!inId && !inSec && !inDef) return false;
    }
    return true;
  });

  // Robust Filtered Defects for Worklist Table
  const filteredDefects = defects.filter((def) => {
    if (selectedSectionFilter !== 'ALL' && def.section_id !== selectedSectionFilter) {
      return false;
    }
    if (activeDept !== 'ALL') {
      const dLow = (def.department || '').toLowerCase();
      let match = false;
      if (activeDept === 'Engineering') {
        match = dLow.includes('eng') || dLow.includes('tms') || def.defect_id.startsWith('TMS');
      } else if (activeDept === 'TRD') {
        match = dLow.includes('trd') || dLow.includes('tdms') || dLow.includes('ohe') || def.defect_id.startsWith('TDMS');
      } else if (activeDept === 'S&T') {
        match = dLow.includes('s&t') || dLow.includes('smms') || dLow.includes('smt') || def.defect_id.startsWith('SMMS');
      }
      if (!match) return false;
    }
    if (urgencyFilter !== 'ALL' && !def.urgency_band.includes(urgencyFilter)) {
      return false;
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const inId = def.defect_id.toLowerCase().includes(q);
      const inSec = def.section_id.toLowerCase().includes(q);
      const inType = (def.defect_type || '').toLowerCase().includes(q);
      if (!inId && !inSec && !inType) return false;
    }
    return true;
  });

  // Find defect helper for click-through
  const findDefect = (defectId: string): Defect => {
    const found = defects.find(d => d.defect_id === defectId);
    if (found) return found;
    return {
      defect_id: defectId,
      department: defectId.startsWith('TDMS') ? 'TRD' : defectId.startsWith('SMMS') ? 'S&T' : 'Engineering',
      section_id: 'SEC-01',
      defect_type: 'Track / Signal Maintenance Order',
      severity: 'Critical',
      overdue_days: 14,
      estimated_duration_hours: 3.5,
      urgency_band: 'P1 - Immediate',
      rule_priority_score: 80.0,
      ml_priority_score: 82.5,
      final_priority_score: 81.25,
      description: 'Scheduled maintenance work order on Prayagraj main line.',
    };
  };

  const occupiedCount = mergedSlots.filter(s => s.is_occupied).length;
  const idleCount = mergedSlots.filter(s => !s.is_occupied).length;
  const bundledCount = mergedSlots.filter(s => s.is_bundled).length;

  // Real Department counts from backlog
  const engDefects = defects.filter(d => d.department === 'Engineering' || d.defect_id.startsWith('TMS'));
  const oheDefects = defects.filter(d => d.department === 'TRD' || d.defect_id.startsWith('TDMS'));
  const smtDefects = defects.filter(d => d.department === 'S&T' || d.defect_id.startsWith('SMMS'));

  const perspectiveExplainer: Record<DepartmentType, { title: string; desc: string; icon: React.FC<{ className?: string }>; color: string }> = {
    ALL: {
      title: 'Integrated Multi-Department Plan',
      desc: 'Showing all 52 corridor maintenance work orders coordinated across Track Engineering, Traction / OHE, and Signals & Telecom with +23.3% bundling.',
      icon: Layers,
      color: 'text-[var(--accent-amber)]',
    },
    Engineering: {
      title: 'Track Engineering (TMS) Lens',
      desc: 'Filtered to 24 P-Way maintenance tasks: rail fractures, ultrasonic testing flaws, sleeper replacements, and turnout tamping.',
      icon: Shield,
      color: 'text-[var(--accent-steel)]',
    },
    TRD: {
      title: 'Traction / OHE (TDMS) Lens',
      desc: 'Filtered to 14 Electrical OHE tasks: 25 kV AC catenary adjustments, contact wire wear, insulator wash, and power shadow blocks.',
      icon: Zap,
      color: 'text-[var(--accent-amber)]',
    },
    'S&T': {
      title: 'Signals & Telecom (S&T / SSMT) Lens',
      desc: 'Filtered to 14 S&T tasks: electronic interlocking (EI), point machines, axle counter track circuits, and signalling cables.',
      icon: Radio,
      color: 'text-[var(--accent-green)]',
    },
  };

  const CurrentPerspectiveInfo = perspectiveExplainer[activeDept];
  const PerspectiveIcon = CurrentPerspectiveInfo.icon;

  return (
    <div className="space-y-6 pb-12">
      
      {/* Header & Controls Bar */}
      <div className="glass-card-elevated rounded-3xl p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--accent-amber-bg)] border border-[var(--accent-amber-border)] text-xs font-mono text-[var(--accent-amber)] mb-2 font-bold">
            <span>{SYSTEM_META.brandName} SCHEDULE</span>
            <span>•</span>
            <span className="uppercase">{horizon.toUpperCase()} HORIZON</span>
          </div>
          <h2 className="font-display font-bold text-2xl sm:text-3xl text-[var(--text-heading)]">
            {horizon === 'weekly' ? 'Weekly (7d)' : 'Monthly (30d)'} {CurrentPerspectiveInfo.title}
          </h2>
          <p className="text-xs text-[var(--text-body)] mt-1 max-w-xl">
            {CurrentPerspectiveInfo.desc}
          </p>
        </div>

        {/* View Switcher: Control Office (Timeline) vs Section Engineer (Table) */}
        <div className="flex items-center gap-2 p-1.5 rounded-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] shrink-0 shadow-sm">
          <button
            onClick={() => setViewMode('control')}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-mono font-bold transition-all cursor-pointer ${
              viewMode === 'control'
                ? 'bg-[var(--accent-amber)] text-white dark:text-[#05070C] shadow-[var(--shadow-glow-amber)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-heading)]'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Control Timeline ({filteredSlots.length})</span>
          </button>
          <button
            onClick={() => setViewMode('engineer')}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-mono font-bold transition-all cursor-pointer ${
              viewMode === 'engineer'
                ? 'bg-[var(--accent-amber)] text-white dark:text-[#05070C] shadow-[var(--shadow-glow-amber)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-heading)]'
            }`}
          >
            <ListFilter className="w-3.5 h-3.5" />
            <span>Defect Worklist ({filteredDefects.length})</span>
          </button>
        </div>
      </div>

      {/* Dynamic Perspective Explainer Banner */}
      <div className="glass-card rounded-2xl p-4 flex items-center justify-between gap-4 border-l-4 border-l-[var(--accent-amber)]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[var(--accent-amber-bg)] flex items-center justify-center shrink-0">
            <PerspectiveIcon className={`w-5 h-5 ${CurrentPerspectiveInfo.color}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-[var(--text-heading)]">
                Active Perspective: {CurrentPerspectiveInfo.title}
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[var(--accent-amber-bg)] text-[var(--accent-amber)] font-bold">
                {activeDept === 'ALL' ? `${defects.length} Total Orders` : `${filteredDefects.length} Dedicated Orders`}
              </span>
            </div>
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
              {CurrentPerspectiveInfo.desc}
            </p>
          </div>
        </div>

        {activeDept !== 'ALL' && (
          <button
            onClick={() => setActiveDept('ALL')}
            className="text-xs font-mono text-[var(--accent-amber)] hover:underline whitespace-nowrap cursor-pointer font-semibold"
          >
            Show All Departments →
          </button>
        )}
      </div>

      {/* 4 Multi-Department Perspective Switcher Tabs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        
        {/* All Departments Tab */}
        <button
          onClick={() => setActiveDept('ALL')}
          className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
            activeDept === 'ALL'
              ? 'bg-[var(--accent-amber-bg)] border-[var(--accent-amber)] shadow-[var(--shadow-glow-amber)]'
              : 'glass-panel hover:border-[var(--border-medium)]'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className={`text-xs font-mono font-bold ${activeDept === 'ALL' ? 'text-[var(--accent-amber)]' : 'text-[var(--text-muted)]'}`}>
              All Departments
            </span>
            <Layers className="w-4 h-4 text-[var(--accent-amber)]" />
          </div>
          <div className="text-lg font-mono font-bold text-[var(--text-heading)] mt-1">{defects.length} Orders</div>
          <span className="text-[10px] text-[var(--text-muted)] block mt-0.5 font-mono">{bundledCount} Bundled Slots</span>
        </button>

        {/* Track Engineering (TMS) */}
        <button
          onClick={() => setActiveDept('Engineering')}
          className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
            activeDept === 'Engineering'
              ? 'bg-[var(--accent-steel-bg)] border-[var(--accent-steel)] shadow-[var(--shadow-glow-steel)]'
              : 'glass-panel hover:border-[var(--border-medium)]'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className={`text-xs font-mono font-bold ${activeDept === 'Engineering' ? 'text-[var(--accent-steel)]' : 'text-[var(--text-muted)]'}`}>
              Track Eng (TMS)
            </span>
            <Shield className="w-4 h-4 text-[var(--accent-steel)]" />
          </div>
          <div className="text-lg font-mono font-bold text-[var(--text-heading)] mt-1">{engDefects.length} Orders</div>
          <span className="text-[10px] text-[var(--text-muted)] block mt-0.5 font-mono">Fractures, Tamping, PSC</span>
        </button>

        {/* Traction / OHE (TDMS) */}
        <button
          onClick={() => setActiveDept('TRD')}
          className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
            activeDept === 'TRD'
              ? 'bg-[var(--accent-amber-bg)] border-[var(--accent-amber)] shadow-[var(--shadow-glow-amber)]'
              : 'glass-panel hover:border-[var(--border-medium)]'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className={`text-xs font-mono font-bold ${activeDept === 'TRD' ? 'text-[var(--accent-amber)]' : 'text-[var(--text-muted)]'}`}>
              Traction / OHE (TDMS)
            </span>
            <Zap className="w-4 h-4 text-[var(--accent-amber)]" />
          </div>
          <div className="text-lg font-mono font-bold text-[var(--text-heading)] mt-1">{oheDefects.length} Orders</div>
          <span className="text-[10px] text-[var(--text-muted)] block mt-0.5 font-mono">25kV Power Shadow Blocks</span>
        </button>

        {/* Signals & Telecom / SSMT (SMMS) */}
        <button
          onClick={() => setActiveDept('S&T')}
          className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
            activeDept === 'S&T'
              ? 'bg-[var(--accent-green-bg)] border-[var(--accent-green)] shadow-[var(--shadow-glow-green)]'
              : 'glass-panel hover:border-[var(--border-medium)]'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className={`text-xs font-mono font-bold ${activeDept === 'S&T' ? 'text-[var(--accent-green)]' : 'text-[var(--text-muted)]'}`}>
              Signals & Telecom (S&T)
            </span>
            <Radio className="w-4 h-4 text-[var(--accent-green)]" />
          </div>
          <div className="text-lg font-mono font-bold text-[var(--text-heading)] mt-1">{smtDefects.length} Orders</div>
          <span className="text-[10px] text-[var(--text-muted)] block mt-0.5 font-mono">Interlocking, Points, Cables</span>
        </button>

      </div>

      {/* Filter & Search Bar */}
      <div className="glass-card-elevated rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
        
        {/* Search */}
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search slot ID, defect ID (e.g. TDMS-002, SMMS-001, TMS-001)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[var(--bg-input)] text-xs font-mono text-[var(--text-heading)] pl-9 pr-4 py-2 rounded-xl border border-[var(--border-subtle)] focus:border-[var(--accent-amber)] focus:outline-none transition-colors"
          />
        </div>

        {/* Section Filter */}
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="text-[var(--text-muted)]">Section:</span>
          <select
            value={selectedSectionFilter}
            onChange={(e) => onSelectSectionFilter && onSelectSectionFilter(e.target.value)}
            className="bg-[var(--bg-input)] text-[var(--text-heading)] px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] focus:border-[var(--accent-amber)] focus:outline-none cursor-pointer"
          >
            <option value="ALL">All Sections (SEC-01 → 05)</option>
            {CORRIDOR_DATA.block_sections.map(s => (
              <option key={s.section_id} value={s.section_id}>
                {s.section_id} ({s.name})
              </option>
            ))}
          </select>
        </div>

        {/* Status / Urgency Filter */}
        {viewMode === 'control' ? (
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs font-mono">
            {(['ALL', 'OCCUPIED', 'IDLE'] as const).map(st => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                  statusFilter === st
                    ? 'bg-[var(--accent-amber)] text-white dark:text-[#05070C] font-bold'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-heading)]'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs font-mono">
            {(['ALL', 'P1', 'P2', 'P3'] as const).map(urg => (
              <button
                key={urg}
                onClick={() => setUrgencyFilter(urg)}
                className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                  urgencyFilter === urg
                    ? 'bg-[var(--accent-amber)] text-white dark:text-[#05070C] font-bold'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-heading)]'
                }`}
              >
                {urg}
              </button>
            ))}
          </div>
        )}

      </div>

      {/* VIEW 1: CONTROL OFFICE & DEPARTMENT TIMELINE */}
      {viewMode === 'control' && (
        <div className="glass-card-elevated rounded-3xl p-6 sm:p-8">
          
          <div className="flex items-center justify-between pb-4 border-b border-[var(--border-subtle)] mb-6">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[var(--accent-amber)]" />
              <h3 className="font-display font-bold text-base text-[var(--text-heading)]">
                {activeDept === 'ALL' ? 'Integrated Multi-Dept' : activeDept === 'TRD' ? 'Traction & OHE Power Shadow' : activeDept === 'S&T' ? 'Signals & Telecom (SSMT)' : 'Track Engineering'} Timeline ({filteredSlots.length} Block Slots)
              </h3>
            </div>
            <div className="flex items-center gap-4 text-xs font-mono">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-[var(--accent-green)]" />
                <span className="text-[var(--text-muted)]">Standard</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-[var(--accent-amber)] shadow-[var(--shadow-glow-amber)]" />
                <span className="text-[var(--accent-amber)] font-bold">Bundled Shadow</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded border border-dashed border-[var(--accent-steel)] bg-transparent" />
                <span className="text-[var(--text-muted)]">Idle Window</span>
              </div>
            </div>
          </div>

          {/* Timeline Slot Cards */}
          <div className="space-y-3">
            {filteredSlots.length === 0 ? (
              <div className="p-8 text-center text-xs font-mono text-[var(--text-muted)]">
                No block slots found matching {activeDept !== 'ALL' ? `${activeDept} department` : 'current'} filter criteria.
              </div>
            ) : (
              filteredSlots.map((slot) => {
                const isMega = slot.slot_source === 'MegaBlock' || slot.duration_hours >= 6.0;
                return (
                  <div
                    key={slot.slot_id}
                    className={`p-4 rounded-2xl border transition-all ${
                      slot.is_occupied
                        ? isMega
                          ? 'bg-[var(--accent-amber-bg)] border-[var(--accent-amber)] shadow-[var(--shadow-glow-amber)]'
                          : slot.is_bundled
                          ? 'bg-[var(--accent-amber-bg)] border-[var(--accent-amber-border)]'
                          : 'bg-[var(--bg-card-subtle)] border-[var(--border-subtle)] hover:border-[var(--accent-green-border)]'
                        : 'bg-[var(--bg-pill)] border-dashed border-[var(--border-subtle)] opacity-75'
                    }`}
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                      
                      {/* Slot Time & ID */}
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-mono font-bold text-xs shrink-0 ${
                          slot.is_occupied
                            ? slot.is_bundled ? 'bg-[var(--accent-amber-bg)] text-[var(--accent-amber)]' : 'bg-[var(--accent-green-bg)] text-[var(--accent-green)]'
                            : 'bg-[var(--bg-pill)] text-[var(--text-muted)]'
                        }`}>
                          <Clock className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-[var(--text-heading)]">
                              {slot.slot_id}
                            </span>
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--bg-pill)] text-[var(--text-muted)]">
                              {slot.section_id}
                            </span>
                            {isMega && (
                              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[var(--accent-amber-bg)] text-[var(--accent-amber)] border border-[var(--accent-amber-border)] font-bold">
                                EXTENDED BLOCK
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-[var(--text-muted)] font-mono mt-0.5 block">
                            Start: <strong className="text-[var(--text-heading)]">{slot.start_datetime.replace('T', ' ')}</strong> ({slot.duration_hours}h)
                          </span>
                        </div>
                      </div>

                      {/* Assignments / Departments */}
                      <div className="flex-1 md:px-6">
                        {slot.is_occupied ? (
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-[10px] font-mono text-[var(--text-muted)]">Assigned:</span>
                              {slot.assigned_defect_ids.map((id) => (
                                <button
                                  key={id}
                                  onClick={() => onSelectDefect(findDefect(id))}
                                  className="px-2 py-0.5 rounded bg-[var(--accent-amber-bg)] hover:opacity-80 text-[var(--accent-amber)] text-[10px] font-mono font-bold border border-[var(--accent-amber-border)] transition-colors flex items-center gap-1 cursor-pointer"
                                  title="Click to view explainability details"
                                >
                                  <span>{id}</span>
                                  <Eye className="w-2.5 h-2.5" />
                                </button>
                              ))}
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)]">
                              <span>Type: <strong className="text-[var(--text-heading)]">{slot.bundle_type}</strong></span>
                              <span>•</span>
                              <span>Depts: <strong className="text-[var(--accent-steel)] font-semibold">{slot.departments_involved.join(', ')}</strong></span>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-xs font-mono text-[var(--accent-steel)]">
                            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-steel)]" />
                            <span>IDLE / UNALLOCATED WINDOW ({slot.duration_hours}h AVAILABLE)</span>
                          </div>
                        )}
                      </div>

                      {/* Right: Utilization */}
                      <div className="shrink-0 flex items-center gap-2">
                        {slot.is_occupied ? (
                          <span className="text-[10px] font-mono font-bold text-[var(--accent-green)] bg-[var(--accent-green-bg)] px-2.5 py-1 rounded-full border border-[var(--accent-green-border)]">
                            {slot.duration_utilization_pct?.toFixed(0) || 100}% Utilized
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono text-[var(--text-muted)] bg-[var(--bg-pill)] px-2.5 py-1 rounded-full border border-[var(--border-subtle)]">
                            Available
                          </span>
                        )}
                      </div>

                    </div>
                  </div>
                );
              })
            )}
          </div>

        </div>
      )}

      {/* VIEW 2: DEPARTMENT WORKLIST TABLE */}
      {viewMode === 'engineer' && (
        <div className="glass-card-elevated rounded-3xl p-6 sm:p-8">
          
          <div className="flex items-center justify-between pb-4 border-b border-[var(--border-subtle)] mb-4">
            <div>
              <h3 className="font-display font-bold text-base text-[var(--text-heading)]">
                {activeDept === 'ALL' ? 'Multi-Department' : activeDept} Defect Worklist
              </h3>
              <p className="text-xs text-[var(--text-body)] mt-0.5">
                Working operational task list for {activeDept === 'ALL' ? 'all teams' : activeDept}. Click any row for ML score decomposition.
              </p>
            </div>
            <span className="text-xs font-mono text-[var(--accent-amber)] font-bold">
              {filteredDefects.length} Orders in Scope
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] text-[var(--text-muted)]">
                  <th className="pb-3 font-semibold">Defect ID</th>
                  <th className="pb-3 font-semibold">Department & Section</th>
                  <th className="pb-3 font-semibold">Defect Type</th>
                  <th className="pb-3 font-semibold">Urgency Band</th>
                  <th className="pb-3 font-semibold text-right">Duration</th>
                  <th className="pb-3 font-semibold text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {filteredDefects.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-[var(--text-muted)]">
                      No defects found matching current filters.
                    </td>
                  </tr>
                ) : (
                  filteredDefects.map((defect) => {
                    const isP1 = defect.urgency_band.includes('P1');
                    const isP2 = defect.urgency_band.includes('P2');
                    const deptKey = defect.department as keyof typeof DEPARTMENTS_INFO;
                    const deptBadge = DEPARTMENTS_INFO[deptKey]?.badgeClass || 'bg-[var(--bg-pill)] text-[var(--text-heading)]';

                    return (
                      <tr
                        key={defect.defect_id}
                        className="hover:bg-[var(--bg-pill-hover)] transition-colors cursor-pointer"
                        onClick={() => onSelectDefect(defect)}
                      >
                        <td className="py-2.5 font-bold text-[var(--accent-amber)]">
                          {defect.defect_id}
                        </td>
                        <td className="py-2.5 text-[var(--text-heading)]">
                          <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold border mr-1.5 ${deptBadge}`}>
                            {defect.department}
                          </span>
                          <span>{defect.section_id}</span>
                        </td>
                        <td className="py-2.5 text-[var(--text-heading)] max-w-[220px] truncate">
                          {defect.defect_type}
                        </td>
                        <td className="py-2.5">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            isP1
                              ? 'bg-[var(--accent-red-bg)] text-[var(--accent-red)] border-[var(--accent-red-border)]'
                              : isP2
                              ? 'bg-[var(--accent-amber-bg)] text-[var(--accent-amber)] border-[var(--accent-amber-border)]'
                              : 'bg-[var(--accent-steel-bg)] text-[var(--accent-steel)] border-[var(--accent-steel-border)]'
                          }`}>
                            {defect.urgency_band}
                          </span>
                        </td>
                        <td className="py-2.5 text-right text-[var(--text-muted)]">
                          {defect.estimated_duration_hours} hrs
                        </td>
                        <td className="py-2.5 text-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectDefect(defect);
                            }}
                            className="px-2 py-0.5 rounded-lg bg-[var(--bg-pill)] hover:bg-[var(--accent-amber-bg)] hover:text-[var(--accent-amber)] text-[var(--text-muted)] transition-colors inline-flex items-center gap-1 text-[11px] cursor-pointer"
                          >
                            <span>Explain</span>
                            <ChevronRight className="w-3 h-3" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

        </div>
      )}

    </div>
  );
};
