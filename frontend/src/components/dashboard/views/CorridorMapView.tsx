import React, { useState } from 'react';
import { MapPin } from 'lucide-react';
import { CORRIDOR_DATA, SYSTEM_META } from '../../../config/constants';
import { MergedSlotDisplay } from '../../../api/idleCapacity';
import { Defect } from '../../../types';

interface CorridorMapViewProps {
  mergedSlots: MergedSlotDisplay[];
  defects: Defect[];
}

export const CorridorMapView: React.FC<CorridorMapViewProps> = ({ defects }) => {
  const [selectedSecId, setSelectedSecId] = useState<string>('SEC-01');

  const selectedSec = CORRIDOR_DATA.block_sections.find(s => s.section_id === selectedSecId) || CORRIDOR_DATA.block_sections[0];
  const secDefects = defects.filter(d => d.section_id === selectedSecId);

  return (
    <div className="space-y-6 pb-12">
      
      {/* Header */}
      <div className="glass-card-elevated rounded-3xl p-6 sm:p-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--accent-amber-bg)] border border-[var(--accent-amber-border)] text-xs font-mono text-[var(--accent-amber)] mb-2 font-bold">
          <MapPin className="w-3.5 h-3.5" />
          <span>CORRIDOR INFRASTRUCTURE MAP</span>
        </div>
        <h2 className="font-display font-bold text-2xl sm:text-3xl text-[var(--text-heading)]">
          {SYSTEM_META.corridor}
        </h2>
        <p className="text-xs sm:text-sm text-[var(--text-body)] mt-1">
          202.0 km trunk mainline with 5 block sections, 11 stations, 25 kV AC OHE traction, and MACLS signalling.
        </p>
      </div>

      {/* 5-Section Selector */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {CORRIDOR_DATA.block_sections.map(sec => {
          const isSelected = sec.section_id === selectedSecId;
          const sDefects = defects.filter(d => d.section_id === sec.section_id);
          return (
            <button
              key={sec.section_id}
              onClick={() => setSelectedSecId(sec.section_id)}
              className={`p-4 rounded-2xl text-left border transition-all cursor-pointer ${
                isSelected
                  ? 'bg-[var(--accent-amber-bg)] border-[var(--accent-amber)] shadow-[var(--shadow-glow-amber)]'
                  : 'glass-panel hover:border-[var(--border-medium)]'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`text-xs font-mono font-bold ${isSelected ? 'text-[var(--accent-amber)]' : 'text-[var(--text-muted)]'}`}>
                  {sec.section_id}
                </span>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[var(--bg-pill)] text-[var(--text-muted)]">
                  {sec.density}
                </span>
              </div>
              <h4 className="text-xs font-semibold text-[var(--text-heading)] truncate">
                {sec.from_station} → {sec.to_station}
              </h4>
              <div className="mt-2 text-[10px] font-mono text-[var(--text-muted)] flex justify-between">
                <span>{sec.length_km} km</span>
                <span className="text-[var(--accent-amber)] font-bold">{sDefects.length} defects</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Detail Section Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left: Section Technical Specifications */}
        <div className="lg:col-span-6 glass-card-elevated rounded-3xl p-6 sm:p-8 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
            <h3 className="font-display font-bold text-base text-[var(--text-heading)]">
              {selectedSec.section_id}: {selectedSec.name}
            </h3>
            <span className="text-xs font-mono font-bold text-[var(--accent-amber)]">
              {selectedSec.length_km} km
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs font-mono">
            <div className="p-3 rounded-xl bg-[var(--bg-card-subtle)] border border-[var(--border-subtle)]">
              <span className="text-[var(--text-muted)] block text-[10px]">Daily Traffic Mix</span>
              <strong className="text-[var(--text-heading)]">{selectedSec.typical_daily_trains} Trains/day</strong>
              <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{selectedSec.traffic_mix}</p>
            </div>

            <div className="p-3 rounded-xl bg-[var(--bg-card-subtle)] border border-[var(--border-subtle)]">
              <span className="text-[var(--text-muted)] block text-[10px]">Standard Block Window</span>
              <strong className="text-[var(--accent-amber)]">{selectedSec.typical_block_window}</strong>
              <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Assigned night slot</p>
            </div>

            <div className="p-3 rounded-xl bg-[var(--bg-card-subtle)] border border-[var(--border-subtle)]">
              <span className="text-[var(--text-muted)] block text-[10px]">OHE Feeding Post</span>
              <strong className="text-[var(--accent-steel)]">{selectedSec.ohe_feeding_post}</strong>
              <p className="text-[10px] text-[var(--text-muted)] mt-0.5">25 kV AC isolated feed</p>
            </div>

            <div className="p-3 rounded-xl bg-[var(--bg-card-subtle)] border border-[var(--border-subtle)]">
              <span className="text-[var(--text-muted)] block text-[10px]">Signalling System</span>
              <strong className="text-[var(--accent-green)]">{selectedSec.signalling}</strong>
              <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Automatic interlocking</p>
            </div>
          </div>
        </div>

        {/* Right: Active Section Maintenance Backlog */}
        <div className="lg:col-span-6 glass-card-elevated rounded-3xl p-6 sm:p-8 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
            <h3 className="font-display font-bold text-base text-[var(--text-heading)]">
              Active Section Work Orders
            </h3>
            <span className="text-xs font-mono text-[var(--text-muted)]">
              {secDefects.length} Defects in Scope
            </span>
          </div>

          <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
            {secDefects.length === 0 ? (
              <div className="p-6 text-center text-xs font-mono text-[var(--text-muted)]">
                No active defects reported in this section.
              </div>
            ) : (
              secDefects.map(def => (
                <div
                  key={def.defect_id}
                  className="p-3 rounded-xl bg-[var(--bg-card-subtle)] border border-[var(--border-subtle)] flex items-center justify-between text-xs font-mono"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[var(--accent-amber)]">{def.defect_id}</span>
                    <span className="px-1.5 py-0.2 rounded text-[10px] bg-[var(--bg-pill)] text-[var(--text-heading)]">
                      {def.department}
                    </span>
                    <span className="text-[var(--text-heading)] truncate max-w-[180px]">{def.defect_type}</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    def.urgency_band.includes('P1') ? 'text-[var(--accent-red)] bg-[var(--accent-red-bg)] border border-[var(--accent-red-border)]' : 'text-[var(--accent-amber)] bg-[var(--accent-amber-bg)] border border-[var(--accent-amber-border)]'
                  }`}>
                    {def.urgency_band}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

    </div>
  );
};
