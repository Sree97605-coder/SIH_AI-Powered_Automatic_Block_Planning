import type { Defect } from '../types';

export interface PendingDefectRecord {
  defect_id: string;
  status: string;
  source_system?: string;
  payload?: Record<string, unknown>;
}

export function pendingDefectToDisplayDefect(item: PendingDefectRecord): Defect {
  const payload = item.payload ?? {};
  const text = (key: string, fallback: string): string => String(payload[key] ?? fallback);
  const numeric = (key: string, fallback: number): number => {
    const value = Number(payload[key]);
    return Number.isFinite(value) ? value : fallback;
  };

  return {
    defect_id: item.defect_id,
    department: text('department', item.source_system ?? 'Engineering'),
    location: text('location', ''),
    section_id: text('section_id', 'UNKNOWN'),
    section_name: text('section_name', ''),
    defect_type: text('defect_type', 'New maintenance defect'),
    severity: text('severity', 'Medium'),
    overdue_days: numeric('overdue_days', 0),
    estimated_duration_hours: numeric('estimated_duration_hours', 0),
    criticality_score: numeric('criticality_score', 0),
    asset_impact: text('asset_impact', ''),
    description: text('description', 'Awaiting re-optimization.'),
    urgency_band: text('urgency_band', 'Pending re-optimization'),
    source_system: text('source_system', item.source_system ?? item.defect_id.split('-')[0]),
    reported_at: text('reported_at', ''),
    is_new: true,
  };
}

export function isNewDefect(defect: Pick<Defect, 'defect_id' | 'is_new'>): boolean {
  return defect.is_new === true || defect.defect_id.includes('-CRIS-');
}

export function formatAddedAt(value?: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}