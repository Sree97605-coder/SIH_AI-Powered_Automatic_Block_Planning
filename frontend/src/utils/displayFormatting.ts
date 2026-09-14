export function formatDateTime(value?: string | null): string {
  if (!value) return 'Not available';

  const iso = value.trim();
  const normalized = iso.includes('T') ? iso : iso.replace(' ', 'T');
  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    return iso.replace('T', ' ').slice(0, 16);
  }

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function formatSlotWindow(start?: string | null, durationHours?: number | null, end?: string | null): string {
  const startTime = formatDateTime(start);

  if (end) {
    return `${startTime} – ${formatDateTime(end)}`;
  }

  if (typeof durationHours === 'number' && Number.isFinite(durationHours) && durationHours > 0) {
    const startDate = new Date(start ?? new Date().toISOString());
    if (!Number.isNaN(startDate.getTime())) {
      startDate.setHours(startDate.getHours() + Math.floor(durationHours));
      startDate.setMinutes(startDate.getMinutes() + Math.round((durationHours % 1) * 60));
      return `${startTime} – ${formatDateTime(startDate.toISOString())}`;
    }
  }

  return `${startTime}`;
}

export function formatSectionLabel(sectionName?: string | null, sectionId?: string | null): string {
  if (sectionName && sectionName.trim()) return sectionName.trim();
  if (sectionId && sectionId.trim()) return sectionId.trim();
  return 'Unknown section';
}

export function normalizeDepartmentToken(value?: string | null): string {
  if (!value) return '';
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function departmentMatches(departmentOrSource: string | undefined, defectId: string, target: 'Engineering' | 'TRD' | 'S&T'): boolean {
  const value = normalizeDepartmentToken(departmentOrSource ?? '');
  const defectPrefix = defectId.toUpperCase();

  if (target === 'Engineering') {
    return value.includes('engineering') || value.includes('tms') || value.includes('track') || defectPrefix.startsWith('TMS');
  }
  if (target === 'TRD') {
    return value.includes('trd') || value.includes('tdms') || value.includes('ohe') || value.includes('traction') || defectPrefix.startsWith('TDMS');
  }
  if (target === 'S&T') {
    return value.includes('sandt') || value.includes('smms') || value.includes('signals') || value.includes('telecom') || value.includes('smt') || defectPrefix.startsWith('SMMS');
  }

  return false;
}

export function canonicalDepartment(departmentOrSource: string | undefined, defectId: string): 'Engineering' | 'TRD' | 'S&T' | null {
  if (departmentMatches(departmentOrSource, defectId, 'Engineering')) return 'Engineering';
  if (departmentMatches(departmentOrSource, defectId, 'TRD')) return 'TRD';
  if (departmentMatches(departmentOrSource, defectId, 'S&T')) return 'S&T';
  return null;
}
