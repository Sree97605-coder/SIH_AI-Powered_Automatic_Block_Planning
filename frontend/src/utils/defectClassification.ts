import type { Defect } from '../types';

export type MovableState = 'Movable' | 'Fixed';

export function deriveMovableState(defect: Pick<Defect, 'urgency_band'>): MovableState {
  const urgency = String(defect.urgency_band ?? '').toUpperCase();
  return urgency.includes('P1') ? 'Fixed' : 'Movable';
}
