import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DefectExplainModal, buildOverridePreviewNarrative } from './DefectExplainModal';
import { PlanScheduleView } from './views/PlanScheduleView';
import type { AuditLogEntry, Defect, OverridePreviewResponse } from '../../types';
import '@testing-library/jest-dom/vitest';
import { api } from '../../api/client';
import { render as renderPlanScheduleView } from '@testing-library/react';

const defect: Defect = {
  defect_id: 'TMS-001',
  department: 'Engineering',
  section_id: 'SEC-01',
  defect_type: 'Track defect',
  severity: 'Critical',
  overdue_days: 5,
  estimated_duration_hours: 4,
  urgency_band: 'P2 - Urgent',
  rule_priority_score: 82,
  ml_priority_score: 84,
  final_priority_score: 83,
  description: 'Test track defect',
};

afterEach(() => {
  cleanup();
});

describe('buildOverridePreviewNarrative', () => {
  it('renders a non-empty lead sentence when defects would be deferred', () => {
    const preview: OverridePreviewResponse = {
      feasible: true,
      available_hours: 12,
      required_hours: 8,
      newly_deferred: ['TMS-099'],
      newly_cleared: [],
      priority_alert: false,
      p1_displacement: false,
      reason_category_valid_for_displacement: true,
      metrics_before: { clearance_pct: 50 },
      metrics_after: { clearance_pct: 45 },
    };

    const narrative = buildOverridePreviewNarrative(preview);
    expect(narrative.lead).toContain('This override would move');
    expect(narrative.lead.length).toBeGreaterThan(0);
    expect(narrative.summaryLabel).toBe('Overall impact if confirmed:');
    expect(narrative.closing).toBe('Do you want to proceed with this override?');
  });

  it('renders the no-impact follow-up when no defects are cleared', () => {
    const preview: OverridePreviewResponse = {
      feasible: true,
      available_hours: 12,
      required_hours: 8,
      newly_deferred: [],
      newly_cleared: [],
      priority_alert: false,
      p1_displacement: false,
      reason_category_valid_for_displacement: true,
      metrics_before: { clearance_pct: 50 },
      metrics_after: { clearance_pct: 50 },
    };

    const narrative = buildOverridePreviewNarrative(preview);
    expect(narrative.lead).toBe('This override would not defer any currently scheduled defect.');
    expect(narrative.followUp).toBe('No other defects would be cleared by this change.');
  });
});

describe('DefectExplainModal', () => {
  it('renders the impact summary copy in the preview panel', () => {
    const preview: OverridePreviewResponse = {
      feasible: true,
      available_hours: 12,
      required_hours: 8,
      newly_deferred: ['TMS-099'],
      newly_cleared: ['TMS-100'],
      priority_alert: true,
      p1_displacement: false,
      reason_category_valid_for_displacement: true,
      metrics_before: { clearance_pct: 50 },
      metrics_after: { clearance_pct: 45 },
    };

    const { lead } = buildOverridePreviewNarrative(preview);
    expect(lead).toContain('This override would move');
  });
});

describe('DefectExplainModal visibility and preview formatting', () => {
  it('hides the override plan section for non-admin roles and shows the admin-contact copy', () => {
    render(
      <DefectExplainModal
        defect={defect}
        onClose={() => undefined}
        schedule={[]}
        slots={[
          {
            slot_id: 'SEC-01-0007',
            section_id: 'SEC-01',
            section_name: 'Prayagraj Main Line',
            horizon: 'weekly',
            start_datetime: '2025-09-08T04:00:00',
            duration_hours: 4,
            slot_source: 'MegaBlock',
            max_tasks_possible: 2,
          },
        ]}
        canOverride={false}
      />,
    );

    expect(screen.queryByText(/Override plan/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Schedule changes require COA Admin access/i)).toBeInTheDocument();
  });

  it('renders human-readable before/after metrics and slot details instead of raw JSON', async () => {
    const preview: OverridePreviewResponse = {
      feasible: true,
      available_hours: 12,
      required_hours: 8,
      newly_deferred: ['TMS-099'],
      newly_cleared: ['TMS-100'],
      priority_alert: false,
      p1_displacement: false,
      reason_category_valid_for_displacement: true,
      metrics_before: { clearance_pct: 62, p1_clearance_pct: 70, p2_clearance_pct: 60 },
      metrics_after: { clearance_pct: 71, p1_clearance_pct: 75, p2_clearance_pct: 68 },
      original_slot_id: 'SEC-01-0001',
      target_slot_id: 'SEC-01-0007',
    };

    vi.spyOn(api, 'previewOverride').mockResolvedValue(preview);

    render(
      <DefectExplainModal
        defect={defect}
        onClose={() => undefined}
        schedule={[
          {
            slot_id: 'SEC-01-0001',
            section_id: 'SEC-01',
            section_name: 'Prayagraj Main Line',
            start_datetime: '2025-09-06T04:00:00',
            end_datetime: '2025-09-06T08:00:00',
            duration_hours: 4,
            slot_source: 'MegaBlock',
            assigned_defect_ids: ['TMS-001'],
            assigned_defect_count: 1,
            is_bundled: false,
            bundle_type: 'Single Task Block',
          },
        ]}
        slots={[
          {
            slot_id: 'SEC-01-0007',
            section_id: 'SEC-01',
            section_name: 'Prayagraj Main Line',
            horizon: 'weekly',
            start_datetime: '2025-09-08T04:00:00',
            duration_hours: 4,
            slot_source: 'MegaBlock',
            max_tasks_possible: 2,
          },
        ]}
        canOverride={true}
      />,
    );

    fireEvent.change(screen.getByLabelText(/reason category/i), { target: { value: 'weather_or_emergency' } });
    fireEvent.change(screen.getByLabelText(/target slot/i), { target: { value: 'SEC-01-0007' } });

    fireEvent.click(screen.getByRole('button', { name: /preview override/i }));

    const overallLabels = await screen.findAllByText('Overall Clearance');
    expect(overallLabels.length).toBeGreaterThan(0);
    expect((await screen.findAllByText('Current slot')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('Target slot')).length).toBeGreaterThan(0);
    const panel = overallLabels[0].closest('div')?.parentElement?.parentElement as HTMLElement;
    expect(panel).not.toHaveTextContent('{');
    expect(panel).not.toHaveTextContent('clearance_pct');
  });
});

describe('PlanScheduleView role gating', () => {
  it('shows the department card row for COA admin and hides it for DEPT_ENGINEER', () => {
    const { rerender } = renderPlanScheduleView(
      <PlanScheduleView
        horizon="weekly"
        mergedSlots={[]}
        defects={[]}
        isLoading={false}
        onSelectDefect={() => undefined}
        role="COA_ADMIN"
      />,
    );

    expect(screen.getByText('All Departments')).toBeInTheDocument();
    expect(screen.getByText('Track Eng (TMS)')).toBeInTheDocument();

    rerender(
      <PlanScheduleView
        horizon="weekly"
        mergedSlots={[]}
        defects={[]}
        isLoading={false}
        onSelectDefect={() => undefined}
        role="DEPT_ENGINEER"
      />,
    );

    expect(screen.queryByText('All Departments')).not.toBeInTheDocument();
    expect(screen.queryByText('Track Eng (TMS)')).not.toBeInTheDocument();
  });
});

describe('PlanScheduleView override badges', () => {
  it('shows the latest override entry for a defect when there are multiple override rows in the same horizon', () => {
    const overrideEntries: AuditLogEntry[] = [
      {
        override_id: 7,
        defect_id: 'TMS-001',
        horizon: 'weekly',
        original_slot_id: 'SEC-01-0001',
        new_slot_id: 'SEC-01-0002',
        changed_by: 'COA_ADMIN',
        timestamp: '2025-09-01T12:00:00Z',
        reason_category: 'prioritization_mistake',
        reason_freetext: 'Earlier issue',
        learnable: 1,
        newly_deferred_ids: 'TMS-099',
        priority_alert: 1,
      },
      {
        override_id: 8,
        defect_id: 'TMS-001',
        horizon: 'weekly',
        original_slot_id: 'SEC-01-0002',
        new_slot_id: 'SEC-01-0009',
        changed_by: 'COA_ADMIN',
        timestamp: '2025-09-01T18:00:00Z',
        reason_category: 'weather_or_emergency',
        reason_freetext: 'Later emergency',
        learnable: 1,
        newly_deferred_ids: 'TMS-077',
        priority_alert: 1,
      },
    ];

    render(
      <PlanScheduleView
        horizon="weekly"
        mergedSlots={[
          {
            slot_id: 'SEC-01-0009',
            section_id: 'SEC-01',
            section_name: 'Prayagraj Main Line',
            start_datetime: '2025-09-08T04:00:00',
            end_datetime: '2025-09-08T08:00:00',
            duration_hours: 4,
            slot_source: 'MegaBlock',
            is_occupied: true,
            assigned_defect_ids: ['TMS-001'],
            assigned_defect_count: 1,
            departments_involved: ['Engineering'],
            is_bundled: false,
            bundle_type: 'Single Task Block',
            duration_utilization_pct: 100,
          },
        ]}
        defects={[defect]}
        isLoading={false}
        onSelectDefect={() => undefined}
        overrideEntries={overrideEntries}
      />,
    );

    const badge = screen.getByText('OVERRIDDEN');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute('title', 'weather_or_emergency • COA_ADMIN • SEC-01-0009');
    expect(badge).not.toHaveAttribute('title', 'prioritization_mistake • COA_ADMIN • SEC-01-0002');
  });

  it('does not show an override badge for defects without override history', () => {
    render(
      <PlanScheduleView
        horizon="weekly"
        mergedSlots={[]}
        defects={[defect]}
        isLoading={false}
        onSelectDefect={() => undefined}
      />,
    );

    expect(screen.queryByText('OVERRIDDEN')).not.toBeInTheDocument();
  });
});
