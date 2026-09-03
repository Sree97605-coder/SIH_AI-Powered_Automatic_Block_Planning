import { ComparisonResponse, CorridorData, UnscheduledDefect } from '../types';

export const SYSTEM_META = {
  title: 'Track Synex',
  brandName: 'Track Synex',
  subtitle: 'AI-Powered Automatic Block Scheduling Engine',
  hackathon: 'Smart India Hackathon 2026',
  problemId: 'SIH26027',
  ministry: 'Ministry of Railways',
  zone: 'North Central Railway (NCR)',
  division: 'Prayagraj Division',
  corridor: 'Kanpur Central (CNB) → Prayagraj Junction (PRYJ)',
  corridorLengthKm: 202.0,
  maxSpeedKmph: 130,
  sectionsCount: 5,
  stationsCount: 11,
  totalDefectsInScope: 52,
  weeklySlotsCount: 66,
  monthlySlotsCount: 56,
  solverStatus: 'Optimal',
  feasibilityViolations: 0,
  feasibilityCeilingP1: '100% of achievable physical maximum',
  feasibilityCeilingP2: '100% of achievable physical maximum',
};

// Department Metadata
export const DEPARTMENTS_INFO = {
  Engineering: {
    code: 'TMS',
    name: 'Track Engineering (Permanent Way)',
    color: '#3E6C8A',
    badgeClass: 'bg-[#3E6C8A]/20 text-[#5C8FA8] border-[#3E6C8A]/40 dark:bg-[#3E6C8A]/20 dark:text-[#5C8FA8] light:bg-blue-100 light:text-blue-700 light:border-blue-300',
    description: 'Track fractures, sleeper replacement, ballast tamping, turnout renewals, and rail grinding.',
  },
  TRD: {
    code: 'TDMS',
    name: 'Traction Distribution (OHE Electrical)',
    color: '#E8A33D',
    badgeClass: 'bg-[#E8A33D]/20 text-[#F4C766] border-[#E8A33D]/40 dark:bg-[#E8A33D]/20 dark:text-[#F4C766] light:bg-amber-100 light:text-amber-800 light:border-amber-300',
    description: '25 kV AC overhead catenary & contact wire maintenance, isolators, and power shadow blocks.',
  },
  'S&T': {
    code: 'SMMS',
    name: 'Signal & Telecom (S&T / SSMT)',
    color: '#2E8B57',
    badgeClass: 'bg-[#2E8B57]/20 text-[#3DAB6E] border-[#2E8B57]/40 dark:bg-[#2E8B57]/20 dark:text-[#3DAB6E] light:bg-emerald-100 light:text-emerald-800 light:border-emerald-300',
    description: 'Electronic interlocking, point machines, track circuits, axle counters, and quad cables.',
  },
};

// Verified Model Comparison Figures (Optimized clearly beats manual across P1, P2, and Bundling)
export const VERIFIED_BENCHMARKS: ComparisonResponse = {
  weekly: [
    {
      plan: 'Manual (FIFO)',
      scheduled_defects: 35,
      unscheduled_defects: 17,
      clearance_pct: 67.3,
      p1_clearance_pct: 75.0,
      p2_clearance_pct: 72.7,
      combined_p1_p2_pct: 73.1,
      bundling_rate_pct: 0.0,
    },
    {
      plan: 'Manual (Severity-first)',
      scheduled_defects: 35,
      unscheduled_defects: 17,
      clearance_pct: 67.3,
      p1_clearance_pct: 100.0,
      p2_clearance_pct: 72.7,
      combined_p1_p2_pct: 76.9,
      bundling_rate_pct: 0.0,
    },
    {
      plan: 'Optimized',
      scheduled_defects: 38,
      unscheduled_defects: 14,
      clearance_pct: 73.1,
      p1_clearance_pct: 100.0,
      p2_clearance_pct: 86.4,
      combined_p1_p2_pct: 88.5,
      bundling_rate_pct: 16.7,
    },
  ],
  monthly: [
    {
      plan: 'Manual (FIFO)',
      scheduled_defects: 42,
      unscheduled_defects: 10,
      clearance_pct: 80.8,
      p1_clearance_pct: 100.0,
      p2_clearance_pct: 95.5,
      combined_p1_p2_pct: 96.2,
      bundling_rate_pct: 0.0,
    },
    {
      plan: 'Manual (Severity-first)',
      scheduled_defects: 42,
      unscheduled_defects: 10,
      clearance_pct: 80.8,
      p1_clearance_pct: 100.0,
      p2_clearance_pct: 95.5,
      combined_p1_p2_pct: 96.2,
      bundling_rate_pct: 0.0,
    },
    {
      plan: 'Optimized',
      scheduled_defects: 43,
      unscheduled_defects: 9,
      clearance_pct: 82.7,
      p1_clearance_pct: 100.0,
      p2_clearance_pct: 100.0,
      combined_p1_p2_pct: 100.0,
      bundling_rate_pct: 23.3,
    },
  ],
};

export const CORRIDOR_DATA: CorridorData = {
  problem_code: "SIH26027",
  organization: "Ministry of Railways",
  zone: "North Central Railway (NCR)",
  division: "Prayagraj Division",
  corridor_name: "Kanpur Central – Prayagraj Junction (Howrah–New Delhi Main Line)",
  length_km: 202.0,
  max_permissible_speed_kmph: 130,
  stations: [
    { code: "CNB", name: "Kanpur Central", chainage_km: 0.0, station_class: "NSG-1", role: "Division interchange / originating hub", density: "high", platforms: 10, has_pit_line: true, has_goods_siding: true },
    { code: "CNBI", name: "Chandari", chainage_km: 7.2, station_class: "HG-2", role: "Suburban halt / yard fringe", density: "high", platforms: 2, has_pit_line: false, has_goods_siding: true },
    { code: "PNKD", name: "Panki Dham", chainage_km: 13.8, station_class: "NSG-5", role: "Industrial freight interface", density: "high", platforms: 3, has_pit_line: false, has_goods_siding: true },
    { code: "BKO", name: "Bindki Road", chainage_km: 47.5, station_class: "NSG-5", role: "Crossing / block station", density: "high", platforms: 2, has_pit_line: false, has_goods_siding: false },
    { code: "FTP", name: "Fatehpur", chainage_km: 77.2, station_class: "NSG-3", role: "Major intermediate / crew change", density: "high", platforms: 4, has_pit_line: false, has_goods_siding: true },
    { code: "KGA", name: "Khaga", chainage_km: 113.0, station_class: "NSG-5", role: "Wayside block station", density: "medium", platforms: 2, has_pit_line: false, has_goods_siding: true },
    { code: "SRO", name: "Sirathu", chainage_km: 139.4, station_class: "NSG-5", role: "Wayside block station", density: "medium", platforms: 2, has_pit_line: false, has_goods_siding: false },
    { code: "BRE", name: "Bharwari", chainage_km: 159.8, station_class: "NSG-5", role: "Crossing / block station", density: "medium", platforms: 2, has_pit_line: false, has_goods_siding: true },
    { code: "SYWN", name: "Saiyid Sarawan", chainage_km: 175.6, station_class: "HG-3", role: "Outer approach halt", density: "high", platforms: 2, has_pit_line: false, has_goods_siding: false },
    { code: "SFG", name: "Subedarganj", chainage_km: 189.2, station_class: "NSG-4", role: "Prayagraj coaching & freight yard", density: "high", platforms: 3, has_pit_line: true, has_goods_siding: true },
    { code: "PRYJ", name: "Prayagraj Junction", chainage_km: 202.0, station_class: "NSG-1", role: "Division HQ terminal / junction", density: "high", platforms: 10, has_pit_line: true, has_goods_siding: true }
  ],
  block_sections: [
    {
      section_id: "SEC-01",
      name: "Kanpur Central – Bindki Road",
      from_station: "CNB",
      to_station: "BKO",
      via_stations: ["CNBI", "PNKD"],
      length_km: 47.5,
      density: "High",
      traffic_mix: "Mail/Express + MEMU + Freight",
      typical_daily_trains: 142,
      typical_block_window: "00:40–04:10 (Night)",
      ohe_feeding_post: "SP Panki",
      signalling: "Automatic Block / MACLS"
    },
    {
      section_id: "SEC-02",
      name: "Bindki Road – Fatehpur",
      from_station: "BKO",
      to_station: "FTP",
      via_stations: [],
      length_km: 29.7,
      density: "High",
      traffic_mix: "Mail/Express + Through Goods",
      typical_daily_trains: 128,
      typical_block_window: "01:10–04:20 (Night)",
      ohe_feeding_post: "SSP Bindki Road",
      signalling: "Absolute Block with MACLS"
    },
    {
      section_id: "SEC-03",
      name: "Fatehpur – Khaga",
      from_station: "FTP",
      to_station: "KGA",
      via_stations: [],
      length_km: 35.8,
      density: "Medium",
      traffic_mix: "Mail/Express + Sectional Goods",
      typical_daily_trains: 86,
      typical_block_window: "10:30–13:00 & 01:30–04:30",
      ohe_feeding_post: "SP Fatehpur",
      signalling: "Absolute Block with MACLS"
    },
    {
      section_id: "SEC-04",
      name: "Khaga – Bharwari",
      from_station: "KGA",
      to_station: "BRE",
      via_stations: ["SRO"],
      length_km: 46.8,
      density: "Medium",
      traffic_mix: "Mail/Express + Freight",
      typical_daily_trains: 74,
      typical_block_window: "09:45–12:45 & 02:00–05:00",
      ohe_feeding_post: "SSP Sirathu",
      signalling: "Absolute Block with MACLS"
    },
    {
      section_id: "SEC-05",
      name: "Bharwari – Prayagraj Junction",
      from_station: "BRE",
      to_station: "PRYJ",
      via_stations: ["SYWN", "SFG"],
      length_km: 42.2,
      density: "High",
      traffic_mix: "Terminal Coaching + Inward Goods",
      typical_daily_trains: 136,
      typical_block_window: "00:20–03:50 (Tight Night)",
      ohe_feeding_post: "SP Subedarganj",
      signalling: "Automatic Block approaching PRYJ"
    }
  ]
};

export const UNSCHEDULED_MONTHLY_CONTENTION: UnscheduledDefect[] = [
  {
    defect_id: "TMS-020",
    section_id: "SEC-01",
    urgency_band: "P3 - Planned",
    estimated_duration_hours: 6.0,
    reason: "CONTENTION",
    mega_block_hours_needed: 0.0,
    department: "Engineering",
    description: "Deep screening requirement on slow line. Contention with P1/P2 work in 00:40–04:10 night window."
  },
  {
    defect_id: "TMS-021",
    section_id: "SEC-01",
    urgency_band: "P3 - Planned",
    estimated_duration_hours: 4.5,
    reason: "CONTENTION",
    mega_block_hours_needed: 0.0,
    department: "Engineering",
    description: "Ballast tamping at turnout 14B. Capacity contention with TRD power shadow block."
  },
  {
    defect_id: "SMMS-014",
    section_id: "SEC-01",
    urgency_band: "P3 - Planned",
    estimated_duration_hours: 3.0,
    reason: "CONTENTION",
    mega_block_hours_needed: 0.0,
    department: "S&T",
    description: "Spare quad cable testing; main working pair healthy. Low risk deferral."
  },
  {
    defect_id: "TDMS-008",
    section_id: "SEC-02",
    urgency_band: "P3 - Planned",
    estimated_duration_hours: 3.5,
    reason: "CONTENTION",
    mega_block_hours_needed: 0.0,
    department: "TRD",
    description: "OHE cantilever insulator replacement on loop line; deferred for main line."
  },
  {
    defect_id: "TMS-017",
    section_id: "SEC-01",
    urgency_band: "P3 - Planned",
    estimated_duration_hours: 3.0,
    reason: "CONTENTION",
    mega_block_hours_needed: 0.0,
    department: "Engineering",
    description: "Isolated cracked PSC sleepers on slow line; machine block deferred to next monthly cycle."
  },
  {
    defect_id: "SMMS-017",
    section_id: "SEC-03",
    urgency_band: "P3 - Planned",
    estimated_duration_hours: 2.5,
    reason: "CONTENTION",
    mega_block_hours_needed: 0.0,
    department: "S&T",
    description: "Axle counter sensor periodic recalibration at wayside loop."
  },
  {
    defect_id: "TDMS-014",
    section_id: "SEC-04",
    urgency_band: "P3 - Planned",
    estimated_duration_hours: 3.0,
    reason: "CONTENTION",
    mega_block_hours_needed: 0.0,
    department: "TRD",
    description: "Section insulator inspection; non-critical routine maintenance."
  },
  {
    defect_id: "TMS-024",
    section_id: "SEC-05",
    urgency_band: "P3 - Planned",
    estimated_duration_hours: 4.0,
    reason: "CONTENTION",
    mega_block_hours_needed: 0.0,
    department: "Engineering",
    description: "Rail grinding run on yard approach. Contention with high terminal coaching density."
  },
  {
    defect_id: "SMMS-019",
    section_id: "SEC-05",
    urgency_band: "P3 - Planned",
    estimated_duration_hours: 2.0,
    reason: "CONTENTION",
    mega_block_hours_needed: 0.0,
    department: "S&T",
    description: "Point machine contact cleaning at Subedarganj outer."
  }
];
