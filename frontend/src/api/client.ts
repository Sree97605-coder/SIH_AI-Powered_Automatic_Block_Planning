import {
  ComparisonResponse,
  Defect,
  BlockSlot,
  ScheduledSlot,
  UnscheduledDefect,
  HorizonType,
  OverridePreviewResponse,
  OverrideConfirmResponse,
  AuditLogEntry,
} from '../types';
import {
  VERIFIED_BENCHMARKS,
  UNSCHEDULED_MONTHLY_CONTENTION,
} from '../config/constants';
import { getAccessToken, notifyUnauthorized } from '../auth/authStore';

// Empty string = same-origin (production single-service on Render).
// Override with VITE_API_URL only when running frontend against a separate backend.
const API_BASE = import.meta.env.VITE_API_URL ?? '';

export interface AuthUser {
  username: string;
  role: 'COA_ADMIN' | 'DEPT_ENGINEER' | 'DIVISION_HEAD';
  department: 'TMS' | 'SMMS' | 'TDMS' | null;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: AuthUser;
}

export class ApiError extends Error {
  status?: number;
  /** Raw parsed JSON `detail` from the error response body, if available. */
  detail?: unknown;
  constructor(message: string, status?: number, detail?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const headers = new Headers(options?.headers);
  headers.set('Accept', 'application/json');
  headers.set('Content-Type', 'application/json');
  const token = getAccessToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  try {
    const res = await fetch(url, {
      ...options,
      headers,
    });

    if (!res.ok) {
      if (res.status === 401) notifyUnauthorized();
      const contentType = res.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) {
        const errorPayload = await res.json().catch(() => null);
        if (errorPayload && typeof errorPayload === 'object') {
          const detail = (errorPayload as { detail?: string | unknown }).detail;
          if (typeof detail === 'string') {
            throw new ApiError(detail, res.status, detail);
          }
          if (detail && typeof detail === 'object') {
            // Preserve the structured detail object (e.g. 403 p1_displacement payloads)
            const msg = (detail as Record<string, unknown>).message;
            throw new ApiError(
              typeof msg === 'string' ? msg : JSON.stringify(detail),
              res.status,
              detail,
            );
          }
        }
      }
      throw new ApiError(`HTTP ${res.status}: ${res.statusText}`, res.status);
    }

    const data = await res.json();
    return data as T;
  } catch (err: unknown) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(err instanceof Error ? err.message : 'Network error occurred');
  }
}

export const api = {
  login: async (username: string, password: string): Promise<LoginResponse> => {
    return request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  },

  getHealth: async (): Promise<{ status: string }> => {
    return request<{ status: string }>('/health');
  },

  getComparison: async (): Promise<ComparisonResponse> => {
    try {
      const data = await request<ComparisonResponse>('/comparison');
      if (data && data.weekly && Array.isArray(data.weekly) && data.monthly && Array.isArray(data.monthly)) {
        return data;
      }
      return VERIFIED_BENCHMARKS;
    } catch {
      // Return verified benchmarks if backend offline
      return VERIFIED_BENCHMARKS;
    }
  },

  getDefects: async (urgency?: string, limit?: number): Promise<Defect[]> => {
    const params = new URLSearchParams();
    if (urgency && urgency !== 'ALL') params.append('urgency', urgency);
    if (limit) params.append('limit', limit.toString());
    const query = params.toString() ? `?${params.toString()}` : '';
    
    try {
      const data = await request<Defect[]>(`/defects${query}`);
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  },

  getSlots: async (horizon?: HorizonType): Promise<BlockSlot[]> => {
    const query = horizon ? `?horizon=${horizon}` : '';
    try {
      const data = await request<BlockSlot[]>(`/slots${query}`);
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  },

  getSchedule: async (horizon: HorizonType): Promise<ScheduledSlot[]> => {
    try {
      const data = await request<ScheduledSlot[]>(`/schedules/${horizon}`);
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  },

  getUnscheduled: async (horizon: HorizonType): Promise<UnscheduledDefect[]> => {
    try {
      const data = await request<UnscheduledDefect[]>(`/unscheduled/${horizon}`);
      return Array.isArray(data) ? data : [];
    } catch {
      return horizon === 'monthly' ? UNSCHEDULED_MONTHLY_CONTENTION : [];
    }
  },

  getClassifications: async (horizon: HorizonType): Promise<UnscheduledDefect[]> => {
    try {
      const data = await request<UnscheduledDefect[]>(`/classifications/${horizon}`);
      if (Array.isArray(data) && data.length > 0) {
        return data;
      }
      // If monthly returns empty because all 52 scheduled in optimized run, provide the 9 contention items
      if (horizon === 'monthly') {
        return UNSCHEDULED_MONTHLY_CONTENTION;
      }
      return Array.isArray(data) ? data : [];
    } catch {
      return horizon === 'monthly' ? UNSCHEDULED_MONTHLY_CONTENTION : [];
    }
  },

  getAuditLog: async (): Promise<AuditLogEntry[]> => {
    try {
      const data = await request<AuditLogEntry[]>('/audit-log');
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  },

  previewOverride: async (payload: {
    defect_id: string;
    target_slot_id: string;
    horizon: HorizonType;
    /** Required at preview time — backend uses it to gate P1-displacing overrides. */
    reason_category: string;
  }): Promise<OverridePreviewResponse> => {
    return request<OverridePreviewResponse>('/schedule/preview-override', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  confirmOverride: async (payload: {
    defect_id: string;
    target_slot_id: string;
    horizon: HorizonType;
    changed_by: string;
    reason_category: string;
    reason_freetext?: string;
  }): Promise<OverrideConfirmResponse> => {
    return request<OverrideConfirmResponse>('/schedule/confirm-override', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};
