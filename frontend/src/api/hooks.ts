import { useQuery } from '@tanstack/react-query';
import { api } from './client';
import { HorizonType } from '../types';
import { computeIdleSlots, MergedSlotDisplay } from './idleCapacity';

export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: () => api.getHealth(),
    retry: 1,
    refetchInterval: 30000,
  });
}

export function useComparison() {
  return useQuery({
    queryKey: ['comparison'],
    queryFn: () => api.getComparison(),
    staleTime: 60000,
  });
}

export function useDefects(urgency?: string, limit?: number) {
  return useQuery({
    queryKey: ['defects', urgency, limit],
    queryFn: () => api.getDefects(urgency, limit),
    staleTime: 30000,
  });
}

export function useSlots(horizon: HorizonType) {
  return useQuery({
    queryKey: ['slots', horizon],
    queryFn: () => api.getSlots(horizon),
    staleTime: 30000,
  });
}

export function useSchedule(horizon: HorizonType) {
  return useQuery({
    queryKey: ['schedule', horizon],
    queryFn: () => api.getSchedule(horizon),
    staleTime: 30000,
  });
}

export function useUnscheduled(horizon: HorizonType) {
  return useQuery({
    queryKey: ['unscheduled', horizon],
    queryFn: () => api.getUnscheduled(horizon),
    staleTime: 30000,
  });
}

export function useClassifications(horizon: HorizonType) {
  return useQuery({
    queryKey: ['classifications', horizon],
    queryFn: () => api.getClassifications(horizon),
    staleTime: 30000,
  });
}

/**
 * Hook to get merged occupied + idle slots for a horizon
 */
export function useMergedSlots(horizon: HorizonType, sectionFilter?: string) {
  const { data: slots = [], isLoading: isLoadingSlots, error: errorSlots } = useSlots(horizon);
  const { data: schedule = [], isLoading: isLoadingSched, error: errorSched } = useSchedule(horizon);

  const isLoading = isLoadingSlots || isLoadingSched;
  const error = errorSlots || errorSched;

  const mergedSlots: MergedSlotDisplay[] = computeIdleSlots(slots, schedule, horizon, sectionFilter);

  return {
    mergedSlots,
    rawSlots: slots,
    rawSchedule: schedule,
    isLoading,
    error,
  };
}
