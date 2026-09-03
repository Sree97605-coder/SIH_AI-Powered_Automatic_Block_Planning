import { BlockSlot, ScheduledSlot, HorizonType } from '../types';

export interface MergedSlotDisplay {
  slot_id: string;
  section_id: string;
  section_name: string;
  start_datetime: string;
  end_datetime?: string;
  duration_hours: number;
  is_occupied: boolean;
  is_night_window?: boolean;
  traffic_density?: string;
  slot_source: string;
  assigned_defect_ids: string[];
  assigned_defect_count: number;
  departments_involved: string[];
  is_bundled: boolean;
  bundle_type: string;
  total_priority_cleared?: number;
  duration_utilization_pct?: number;
}

/**
 * Parses defect IDs whether returned as array, string list "['A', 'B']", or semicolon-joined "A;B"
 */
export function parseAssignedDefectIds(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  const s = String(raw).trim();
  if (!s) return [];
  if (s.startsWith('[') && s.endsWith(']')) {
    try {
      // replace single quotes with double quotes for JSON parsing
      const jsonStr = s.replace(/'/g, '"');
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {
      // fallback regex
      const matches = s.match(/[A-Z0-9_-]+/g);
      if (matches) return matches;
    }
  }
  return s.split(';').map(x => x.trim()).filter(Boolean);
}

export function parseDepartments(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  const s = String(raw).trim();
  if (!s) return [];
  if (s.startsWith('[') && s.endsWith(']')) {
    try {
      const jsonStr = s.replace(/'/g, '"');
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {
      const matches = s.match(/[A-Za-z&]+/g);
      if (matches) return matches;
    }
  }
  return s.split(';').map(x => x.trim()).filter(Boolean);
}

/**
 * Single shared utility function to compute idle slots and merge occupied schedules with full slot inventory.
 * Contract: full slot list (from /slots, filtered to horizon) MINUS slot_ids present in /schedules/{horizon}.
 */
export function computeIdleSlots(
  allSlots: BlockSlot[],
  occupiedSchedules: ScheduledSlot[],
  horizon: HorizonType,
  sectionFilter?: string
): MergedSlotDisplay[] {
  // Filter all slots by horizon if provided
  const horizonSlots = allSlots.filter(
    s => !s.horizon || s.horizon.toLowerCase() === horizon.toLowerCase()
  );

  const occupiedMap = new Map<string, ScheduledSlot>();
  for (const occ of occupiedSchedules) {
    if (occ.slot_id) {
      occupiedMap.set(occ.slot_id, occ);
    }
  }

  const result: MergedSlotDisplay[] = [];

  // Track which slots were processed
  const processedSlotIds = new Set<string>();

  // 1. Process all inventory slots
  for (const slot of horizonSlots) {
    if (sectionFilter && sectionFilter !== 'ALL' && slot.section_id !== sectionFilter) {
      continue;
    }

    processedSlotIds.add(slot.slot_id);
    const occupied = occupiedMap.get(slot.slot_id);

    if (occupied) {
      // Occupied Slot
      const assignedIds = parseAssignedDefectIds(occupied.assigned_defect_ids);
      const depts = parseDepartments(occupied.departments_involved);
      result.push({
        slot_id: slot.slot_id,
        section_id: occupied.section_id || slot.section_id,
        section_name: occupied.section_name || slot.section_name || slot.section_id,
        start_datetime: occupied.start_datetime || slot.start_datetime,
        end_datetime: occupied.end_datetime,
        duration_hours: occupied.duration_hours || slot.duration_hours,
        is_occupied: true,
        is_night_window: occupied.is_night_window ?? slot.is_night_window ?? false,
        traffic_density: occupied.traffic_density || slot.traffic_density || 'High',
        slot_source: occupied.slot_source || slot.slot_source || 'Timetable',
        assigned_defect_ids: assignedIds,
        assigned_defect_count: occupied.assigned_defect_count || assignedIds.length || 1,
        departments_involved: depts.length > 0 ? depts : ['Engineering'],
        is_bundled: occupied.is_bundled || assignedIds.length > 1,
        bundle_type: occupied.bundle_type || (assignedIds.length > 1 ? 'Multi-Department Block' : 'Single Task Block'),
        total_priority_cleared: occupied.total_priority_cleared,
        duration_utilization_pct: occupied.duration_utilization_pct || 100,
      });
    } else {
      // Idle Capacity Slot
      result.push({
        slot_id: slot.slot_id,
        section_id: slot.section_id,
        section_name: slot.section_name || slot.section_id,
        start_datetime: slot.start_datetime,
        duration_hours: slot.duration_hours,
        is_occupied: false,
        is_night_window: slot.is_night_window ?? false,
        traffic_density: slot.traffic_density || 'High',
        slot_source: slot.slot_source || 'Timetable',
        assigned_defect_ids: [],
        assigned_defect_count: 0,
        departments_involved: [],
        is_bundled: false,
        bundle_type: 'Idle / Unused Window',
        duration_utilization_pct: 0,
      });
    }
  }

  // 2. Include any occupied slots that might not have been in inventory (safety fallback)
  for (const [slotId, occupied] of occupiedMap.entries()) {
    if (!processedSlotIds.has(slotId)) {
      if (sectionFilter && sectionFilter !== 'ALL' && occupied.section_id !== sectionFilter) {
        continue;
      }
      const assignedIds = parseAssignedDefectIds(occupied.assigned_defect_ids);
      const depts = parseDepartments(occupied.departments_involved);
      result.push({
        slot_id: slotId,
        section_id: occupied.section_id,
        section_name: occupied.section_name || occupied.section_id,
        start_datetime: occupied.start_datetime,
        end_datetime: occupied.end_datetime,
        duration_hours: occupied.duration_hours,
        is_occupied: true,
        is_night_window: occupied.is_night_window ?? false,
        traffic_density: occupied.traffic_density || 'High',
        slot_source: occupied.slot_source || 'Timetable',
        assigned_defect_ids: assignedIds,
        assigned_defect_count: occupied.assigned_defect_count || assignedIds.length || 1,
        departments_involved: depts.length > 0 ? depts : ['Engineering'],
        is_bundled: occupied.is_bundled || assignedIds.length > 1,
        bundle_type: occupied.bundle_type || 'Occupied Block',
        total_priority_cleared: occupied.total_priority_cleared,
        duration_utilization_pct: occupied.duration_utilization_pct || 100,
      });
    }
  }

  // Sort chronologically by start_datetime
  return result.sort((a, b) => new Date(a.start_datetime).getTime() - new Date(b.start_datetime).getTime());
}
