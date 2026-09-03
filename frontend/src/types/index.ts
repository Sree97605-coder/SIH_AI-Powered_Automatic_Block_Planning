export type HorizonType = 'weekly' | 'monthly';
export type PerspectiveType = 'division' | 'engineer' | 'ohe' | 'smt' | 'control';
export type DepartmentType = 'Engineering' | 'TRD' | 'S&T' | 'ALL';

export interface Defect {
  defect_id: string;
  department: 'Engineering' | 'S&T' | 'TRD' | string;
  location?: string;
  section_id: string;
  section_name?: string;
  defect_type: string;
  severity: 'Critical' | 'Urgent' | 'Medium' | 'Low' | string;
  overdue_days: number;
  estimated_duration_hours: number;
  criticality_score?: number;
  asset_impact?: string;
  description?: string;
  rule_priority_score?: number;
  ml_priority_score?: number;
  final_priority_score?: number;
  priority_score?: number;
  urgency_band: string;
  final_urgency_band?: string;
  requires_extended_block?: boolean;
  unscheduled_reason?: string;
  source_system?: 'TMS' | 'SMMS' | 'TDMS' | string;
}

export interface BlockSlot {
  slot_id: string;
  section_id: string;
  section_name?: string;
  horizon: HorizonType;
  start_datetime: string;
  duration_hours: number;
  slot_source: 'Timetable' | 'GoodsForecast' | 'MegaBlock' | string;
  is_night_window?: boolean;
  traffic_density?: 'High' | 'Medium' | 'Low' | string;
  max_tasks_possible?: number;
}

export interface ScheduledSlot {
  slot_id: string;
  section_id: string;
  section_name: string;
  start_datetime: string;
  end_datetime?: string;
  duration_hours: number;
  is_night_window?: boolean;
  traffic_density?: string;
  slot_source: string;
  max_tasks_possible?: number;
  assigned_defect_ids: string | string[];
  assigned_defect_count: number;
  departments_involved?: string | string[];
  is_bundled: boolean;
  bundle_type: string;
  total_priority_cleared?: number;
  duration_utilization_pct?: number;
}

export interface UnscheduledDefect {
  defect_id: string;
  section_id: string;
  urgency_band: string;
  estimated_duration_hours: number;
  unscheduled_reason?: string;
  reason?: 'CONTENTION' | 'STRUCTURALLY_INFEASIBLE';
  mega_block_hours_needed?: number;
  department?: string;
  description?: string;
}

export interface PlanComparisonRow {
  plan: 'Manual (FIFO)' | 'Manual (Severity-first)' | 'Optimized';
  scheduled_defects: number;
  unscheduled_defects: number;
  clearance_pct: number;
  p1_clearance_pct: number;
  p2_clearance_pct: number;
  combined_p1_p2_pct: number;
  bundling_rate_pct: number;
}

export interface ComparisonResponse {
  weekly: PlanComparisonRow[];
  monthly: PlanComparisonRow[];
}

export interface StationInfo {
  code: string;
  name: string;
  chainage_km: number;
  station_class: string;
  role: string;
  density: string;
  platforms: number;
  has_pit_line: boolean;
  has_goods_siding: boolean;
}

export interface BlockSectionInfo {
  section_id: string;
  name: string;
  from_station: string;
  to_station: string;
  via_stations: string[];
  length_km: number;
  density: string;
  traffic_mix: string;
  typical_daily_trains: number;
  typical_block_window: string;
  ohe_feeding_post: string;
  signalling: string;
}

export interface CorridorData {
  problem_code: string;
  organization: string;
  zone: string;
  division: string;
  corridor_name: string;
  length_km: number;
  max_permissible_speed_kmph: number;
  stations: StationInfo[];
  block_sections: BlockSectionInfo[];
}
