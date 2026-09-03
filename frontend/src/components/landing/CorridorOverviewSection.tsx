import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Train, MapPin } from 'lucide-react';
import { CORRIDOR_DATA } from '../../config/constants';

export const CorridorOverviewSection: React.FC = () => {
  const [selectedSectionId, setSelectedSectionId] = useState<string>('SEC-01');
  const [selectedStationCode, setSelectedStationCode] = useState<string | null>(null);

  const selectedSection = CORRIDOR_DATA.block_sections.find(
    s => s.section_id === selectedSectionId
  ) || CORRIDOR_DATA.block_sections[0];

  const selectedStation = selectedStationCode 
    ? CORRIDOR_DATA.stations.find(s => s.code === selectedStationCode)
    : null;

  return (
    <section id="corridor" className="py-28 sm:py-36 px-4 sm:px-8 max-w-7xl mx-auto relative">
      
      {/* Section Header */}
      <div className="flex flex-col items-center text-center mb-16">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--accent-steel-bg)] border border-[var(--accent-steel-border)] text-xs font-mono text-[var(--accent-steel)] mb-3 font-semibold">
          <MapPin className="w-3.5 h-3.5" />
          <span>OPERATIONAL CORRIDOR • 202.0 KM</span>
        </div>
        <h2 className="font-display font-bold text-2xl sm:text-3xl text-[var(--text-heading)] tracking-tight max-w-2xl">
          High-Density Prayagraj Division Corridor
        </h2>
        <p className="text-sm text-[var(--text-body)] mt-2 max-w-xl">
          Kanpur Central to Prayagraj Junction trunk line across 5 block sections with 25 kV AC OHE traction and MACLS automatic signalling.
        </p>
      </div>

      {/* Horizontal Station Line Diagram Card */}
      <div className="glass-card-elevated rounded-3xl p-8 sm:p-10 relative mb-8">
        
        {/* Track Line Header Stats */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-[var(--border-subtle)] text-xs font-mono text-[var(--text-muted)]">
          <div className="flex items-center gap-2 text-[var(--text-heading)]">
            <Train className="w-4 h-4 text-[var(--accent-amber)]" />
            <span className="font-bold">UP/DOWN DOUBLE LINE</span>
          </div>
          <div className="flex items-center gap-6">
            <span>Ruling Gradient: <strong className="text-[var(--text-heading)]">1 in 200</strong></span>
            <span>Speed: <strong className="text-[var(--accent-amber)]">130 km/h</strong></span>
            <span>Traction: <strong className="text-[var(--accent-steel)]">25 kV AC</strong></span>
          </div>
        </div>

        {/* 5-Section Clickable Horizontal Tabs */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 my-8">
          {CORRIDOR_DATA.block_sections.map((sec) => {
            const isSelected = sec.section_id === selectedSectionId;
            return (
              <button
                key={sec.section_id}
                onClick={() => {
                  setSelectedSectionId(sec.section_id);
                  setSelectedStationCode(null);
                }}
                className={`flex flex-col p-3.5 rounded-2xl text-left transition-all duration-200 border cursor-pointer ${
                  isSelected
                    ? 'bg-[var(--accent-amber-bg)] border-[var(--accent-amber)] shadow-[var(--shadow-glow-amber)]'
                    : 'bg-[var(--bg-pill)] border-[var(--border-subtle)] hover:border-[var(--border-medium)] hover:bg-[var(--bg-pill-hover)]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-mono font-bold ${isSelected ? 'text-[var(--accent-amber)]' : 'text-[var(--text-muted)]'}`}>
                    {sec.section_id}
                  </span>
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[var(--bg-pill)] text-[var(--text-muted)]">
                    {sec.density}
                  </span>
                </div>
                <span className="text-xs font-semibold text-[var(--text-heading)] mt-1.5 truncate">
                  {sec.from_station} → {sec.to_station}
                </span>
                <span className="text-[10px] text-[var(--text-muted)] font-mono mt-1">
                  {sec.length_km} km • {sec.typical_daily_trains} trains/day
                </span>
              </button>
            );
          })}
        </div>

        {/* Illuminated Track SVG Diagram */}
        <div className="relative py-10 px-4 overflow-x-auto">
          <div className="min-w-[760px] relative">
            
            {/* Glowing Track Line */}
            <div className="absolute top-1/2 left-0 right-0 h-1.5 -translate-y-1/2 bg-[var(--border-medium)] rounded-full" />
            <div className="absolute top-1/2 left-0 right-0 h-1.5 -translate-y-1/2 track-glow-line rounded-full shadow-[var(--shadow-glow-amber)] opacity-80" />

            {/* Station Nodes */}
            <div className="relative z-10 flex justify-between items-center">
              {CORRIDOR_DATA.stations.map((stn) => {
                const isSelected = selectedStationCode === stn.code;
                const isMajor = ['CNB', 'FTP', 'PRYJ'].includes(stn.code);
                
                return (
                  <div
                    key={stn.code}
                    className="flex flex-col items-center cursor-pointer group"
                    onClick={() => setSelectedStationCode(stn.code)}
                  >
                    {/* Station Name */}
                    <div className={`text-[11px] font-bold transition-colors mb-2 text-center whitespace-nowrap ${
                      isSelected ? 'text-[var(--accent-amber)]' : isMajor ? 'text-[var(--text-heading)]' : 'text-[var(--text-muted)] group-hover:text-[var(--text-heading)]'
                    }`}>
                      {stn.name}
                    </div>

                    {/* Node Dot */}
                    <div className={`relative flex items-center justify-center rounded-full transition-all duration-300 ${
                      isMajor ? 'w-7 h-7' : 'w-5 h-5'
                    } ${
                      isSelected
                        ? 'bg-[var(--accent-amber)] ring-4 ring-[var(--accent-amber-border)] shadow-[var(--shadow-glow-amber)] scale-125'
                        : isMajor
                        ? 'bg-[var(--text-heading)] ring-2 ring-[var(--border-medium)]'
                        : 'bg-[var(--bg-surface)] border-2 border-[var(--accent-steel)] hover:border-[var(--accent-amber)] hover:scale-110'
                    }`}>
                      <div className={`rounded-full ${isMajor ? 'w-2.5 h-2.5 bg-[var(--bg-surface)]' : 'w-1.5 h-1.5 bg-[var(--accent-steel)]'}`} />
                    </div>

                    {/* Code & Chainage */}
                    <div className="mt-2 text-center">
                      <span className="font-mono text-[10px] font-bold text-[var(--accent-amber)] block">
                        {stn.code}
                      </span>
                      <span className="font-mono text-[9px] text-[var(--text-muted)]">
                        {stn.chainage_km} km
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

          </div>
        </div>

        {/* Selected Detail Drawer (Clean Supporting Readout) */}
        <motion.div
          key={selectedStationCode ? `stn-${selectedStationCode}` : `sec-${selectedSectionId}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mt-6 pt-6 border-t border-[var(--border-subtle)] grid grid-cols-1 md:grid-cols-3 gap-4"
        >
          {selectedStation ? (
            <>
              <div className="p-4 rounded-2xl bg-[var(--bg-card-subtle)] border border-[var(--border-subtle)]">
                <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase block mb-1 font-semibold">Station Overview</span>
                <div className="text-sm font-bold text-[var(--text-heading)]">{selectedStation.name} ({selectedStation.code})</div>
                <p className="text-xs text-[var(--text-body)] mt-1">{selectedStation.role}</p>
              </div>

              <div className="p-4 rounded-2xl bg-[var(--bg-card-subtle)] border border-[var(--border-subtle)]">
                <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase block mb-1 font-semibold">Infrastructure</span>
                <div className="text-xs text-[var(--text-body)] font-mono space-y-0.5 mt-1">
                  <div>Platforms: <strong className="text-[var(--accent-amber)]">{selectedStation.platforms}</strong></div>
                  <div>Class: <strong className="text-[var(--text-heading)]">{selectedStation.station_class}</strong></div>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-[var(--bg-card-subtle)] border border-[var(--border-subtle)]">
                <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase block mb-1 font-semibold">Facilities</span>
                <div className="text-xs text-[var(--text-body)] space-y-0.5 mt-1">
                  <div>Pit Line: <span className={selectedStation.has_pit_line ? 'text-[var(--accent-green)] font-semibold' : ''}>{selectedStation.has_pit_line ? 'Yes' : 'None'}</span></div>
                  <div>Goods Siding: <span className={selectedStation.has_goods_siding ? 'text-[var(--accent-green)] font-semibold' : ''}>{selectedStation.has_goods_siding ? 'Yes' : 'None'}</span></div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="p-4 rounded-2xl bg-[var(--bg-card-subtle)] border border-[var(--border-subtle)]">
                <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase block mb-1 font-semibold">Block Window Schedule</span>
                <div className="text-xs font-mono font-bold text-[var(--text-heading)]">{selectedSection.typical_block_window}</div>
                <p className="text-xs text-[var(--text-body)] mt-1">{selectedSection.traffic_mix}</p>
              </div>

              <div className="p-4 rounded-2xl bg-[var(--bg-card-subtle)] border border-[var(--border-subtle)]">
                <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase block mb-1 font-semibold">OHE Traction Post</span>
                <div className="text-xs font-mono font-bold text-[var(--text-heading)]">{selectedSection.ohe_feeding_post}</div>
                <p className="text-xs text-[var(--text-body)] mt-1">25 kV AC isolated power feed</p>
              </div>

              <div className="p-4 rounded-2xl bg-[var(--bg-card-subtle)] border border-[var(--border-subtle)]">
                <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase block mb-1 font-semibold">Signalling Standard</span>
                <div className="text-xs font-bold text-[var(--text-heading)]">{selectedSection.signalling}</div>
                <p className="text-xs text-[var(--accent-green)] font-semibold mt-1">Automatic safety interlock</p>
              </div>
            </>
          )}
        </motion.div>

      </div>

    </section>
  );
};
