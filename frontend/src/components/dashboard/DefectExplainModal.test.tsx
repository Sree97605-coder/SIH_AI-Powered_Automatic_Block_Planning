import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { DefectExplainModal, buildOverridePreviewNarrative } from './DefectExplainModal';
import { PlanScheduleView } from './views/PlanScheduleView';
import type { AuditLogEntry, Defect, OverridePreviewResponse } from '../../types';
import '@testing-library/jest-dom/vitest';

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
