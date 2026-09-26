import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DefectExplainModal, buildOverridePreviewNarrative } from './DefectExplainModal';
import { PlanScheduleView } from './views/PlanScheduleView';
import { OverviewView } from './views/OverviewView';
import { formatSlotWindow } from '../../utils/displayFormatting';
import { invalidateLiveScheduleQueries } from './DashboardLayout';
import { deriveMovableState } from '../../utils/defectClassification';
import type { AuditLogEntry, Defect, OverridePreviewResponse } from '../../types';
import '@testing-library/jest-dom/vitest';
import { ApiError, api } from '../../api/client';
import { render as renderPlanScheduleView } from '@testing-library/react';
import { pendingDefectToDisplayDefect } from '../../utils/newDefects';
import { UnscheduledView } from './views/UnscheduledView';

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
  vi.restoreAllMocks();
});

describe('deriveMovableState', () => {
  it('treats P1 safety defects as fixed and lower urgency defects as movable', () => {
    expect(deriveMovableState({ urgency_band: 'P1 - Immediate' } as Defect)).toBe('Fixed');
    expect(deriveMovableState({ urgency_band: 'P2 - Urgent' } as Defect)).toBe('Movable');
    expect(deriveMovableState({ urgency_band: 'P3 - Planned' } as Defect)).toBe('Movable');
  });
});

describe('pending CRIS defect visibility', () => {
  const pendingRecord = {
    defect_id: 'TMS-CRIS-1790417047315',
    status: 'PENDING_REOPTIMIZATION',
    source_system: 'TMS',
    payload: {
      department: 'Engineering',
      section_id: 'SEC-01',
      section_name: 'Kanpur Central – Bindki Road',
      defect_type: 'Rail fracture (suspect)',
      severity: 'High',
      estimated_duration_hours: 4,
      description: 'CRIS simulated defect queued for re-optimization.',
      reported_at: '2026-09-26T10:04:07.387817+00:00',
    },
  };

  it('maps a pending record with its backend timestamp and New marker', () => {
    const mapped = pendingDefectToDisplayDefect(pendingRecord);
    expect(mapped.defect_id).toBe(pendingRecord.defect_id);
    expect(mapped.reported_at).toBe(pendingRecord.payload.reported_at);
    expect(mapped.is_new).toBe(true);
    expect(mapped.section_id).toBe('SEC-01');
    expect(mapped.estimated_duration_hours).toBe(4);
  });

  it('shows a queued defect in corridor counts as Movable without assigning it to a slot', () => {
    render(
      <OverviewView
        horizon="monthly"
        defects={[pendingDefectToDisplayDefect(pendingRecord)]}
        pendingDefectIds={[pendingRecord.defect_id]}
        onNavigateTab={() => undefined}
        onSelectDefect={() => undefined}
        role="COA_ADMIN"
      />,
    );

    expect(screen.getByRole('button', { name: /SEC-01.*Defects.*1/s })).toBeInTheDocument();
    expect(screen.getByText(pendingRecord.defect_id)).toBeInTheDocument();
    expect(screen.getByText('Pending re-optimization')).toBeInTheDocument();
    expect(screen.getByText(/Added/)).toBeInTheDocument();
  });

  it('finds the pending ID in weekly and monthly worklists and shows New plus timestamp', async () => {
    const pending = pendingDefectToDisplayDefect(pendingRecord);
    for (const horizon of ['weekly', 'monthly'] as const) {
      cleanup();
      render(
        <PlanScheduleView
          horizon={horizon}
          mergedSlots={[]}
          defects={[]}
          pendingDefects={[pendingRecord]}
          isLoading={false}
          onSelectDefect={() => undefined}
          initialViewMode="engineer"
          searchResetKey={horizon === 'weekly' ? 1 : 2}
        />,
      );
      fireEvent.change(screen.getByPlaceholderText(/Search slot ID, defect ID/i), { target: { value: pending.defect_id } });
      expect(await screen.findByText(pending.defect_id)).toBeInTheDocument();
      expect(screen.getByText(/NEW · Added/)).toBeInTheDocument();
      expect(screen.getByText('Unscheduled / Pending Re-optimization')).toBeInTheDocument();
    }
  });

  it('shows a pending defect in Unscheduled Work with its New tag and timestamp', () => {
    const pending = pendingDefectToDisplayDefect(pendingRecord);
    render(
      <UnscheduledView
        horizon="monthly"
        classifications={[]}
        pendingDefects={[pending]}
        isLoading={false}
        onSelectDefect={() => undefined}
      />,
    );
    expect(screen.getByRole('region', { name: /Pending re-optimization/i })).toBeInTheDocument();
    expect(screen.getByText(pending.defect_id)).toBeInTheDocument();
    expect(screen.getByText(/Added/)).toBeInTheDocument();
    expect(screen.getByText('1 NEW')).toBeInTheDocument();
  });
});

describe('OverviewView corridor lens', () => {
  it('shows live movable and fixed counts for each corridor section', () => {
    render(
      <OverviewView
        horizon="weekly"
        defects={[
          { ...defect, defect_id: 'P1-TEST', section_id: 'SEC-01', urgency_band: 'P1 - Immediate' },
          { ...defect, defect_id: 'P2-TEST', section_id: 'SEC-01', urgency_band: 'P2 - Urgent' },
          { ...defect, defect_id: 'P2-TEST', section_id: 'SEC-01', urgency_band: 'P2 - Urgent' },
        ]}
        onNavigateTab={() => undefined}
        onSelectDefect={() => undefined}
        selectedSectionFilter="ALL"
        onSelectSectionFilter={() => undefined}
        perspective="division"
        onPerspectiveChange={() => undefined}
        role="COA_ADMIN"
        onSimulateCrisDefect={() => undefined}
      />,
    );

    expect(screen.getByRole('button', { name: /^All$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Movable$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Fixed$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /SEC-01.*Defects.*2/s })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Fixed$/ }));
    expect(screen.getByRole('button', { name: /SEC-01.*Fixed.*1/s })).toBeInTheDocument();
  });
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
  it('splits candidate boxes into chronologically sorted Prepone and Postpone groups', async () => {
    const safeProbe: OverridePreviewResponse = {
      feasible: true,
      available_hours: 10,
      required_hours: 4,
      newly_deferred: [],
      newly_cleared: [],
      priority_alert: false,
      p1_displacement: false,
      reason_category_valid_for_displacement: true,
      metrics_before: {},
    };
    vi.spyOn(api, 'previewOverride').mockResolvedValue(safeProbe);

    render(
      <DefectExplainModal
        defect={defect}
        onClose={() => undefined}
        schedule={[{
          slot_id: 'CURRENT', section_id: 'SEC-01', section_name: 'Section 1',
          start_datetime: '2025-09-08T04:00:00', duration_hours: 4,
          slot_source: 'Timetable', assigned_defect_ids: ['TMS-001'],
          assigned_defect_count: 1, is_bundled: false, bundle_type: 'Single Task Block',
        }]}
        slots={[
          { slot_id: 'POSTPONE-LATE', section_id: 'SEC-01', horizon: 'weekly', start_datetime: '2025-09-10T04:00:00', duration_hours: 6, slot_source: 'Timetable' },
          { slot_id: 'PREPONE-LATE', section_id: 'SEC-01', horizon: 'weekly', start_datetime: '2025-09-07T04:00:00', duration_hours: 6, slot_source: 'Timetable' },
          { slot_id: 'CURRENT', section_id: 'SEC-01', horizon: 'weekly', start_datetime: '2025-09-08T04:00:00', duration_hours: 4, slot_source: 'Timetable' },
          { slot_id: 'POSTPONE-EARLY', section_id: 'SEC-01', horizon: 'weekly', start_datetime: '2025-09-09T04:00:00', duration_hours: 6, slot_source: 'Timetable' },
          { slot_id: 'PREPONE-EARLY', section_id: 'SEC-01', horizon: 'weekly', start_datetime: '2025-09-06T04:00:00', duration_hours: 6, slot_source: 'Timetable' },
        ]}
      />,
    );

    const candidateButtons = await screen.findAllByRole('button', { name: /Candidate slot/ });
    expect(candidateButtons.map((button) => button.getAttribute('aria-label'))).toEqual([
      expect.stringContaining('PREPONE-EARLY'),
      expect.stringContaining('PREPONE-LATE'),
      expect.stringContaining('POSTPONE-EARLY'),
      expect.stringContaining('POSTPONE-LATE'),
    ]);
  });

  it('shows each of three candidates\' own feasibility and displacement outcome, including exact capacity numbers', async () => {
    const safeProbe: OverridePreviewResponse = {
      feasible: true,
      available_hours: 10,
      required_hours: 4,
      newly_deferred: [],
      newly_cleared: [],
      priority_alert: false,
      p1_displacement: false,
      reason_category_valid_for_displacement: true,
      metrics_before: {},
    };
    const candidateAResult: OverridePreviewResponse = {
      ...safeProbe,
      available_hours: 8,
      newly_deferred: ['P2-DISPLACED-A'],
      priority_alert: true,
    };
    const candidateBResult: OverridePreviewResponse = {
      ...safeProbe,
      feasible: false,
      available_hours: 2,
      reason: 'GENERIC_CAPACITY_FAILURE',
    };
    const candidateCResult: OverridePreviewResponse = {
      ...safeProbe,
      available_hours: 9,
      newly_deferred: ['P3-DISPLACED-C'],
    };
    vi.spyOn(api, 'previewOverride')
      .mockResolvedValueOnce(safeProbe)
      .mockResolvedValueOnce(safeProbe)
      .mockResolvedValueOnce(safeProbe)
      .mockResolvedValueOnce(candidateAResult)
      .mockResolvedValueOnce(candidateBResult)
      .mockResolvedValueOnce(candidateCResult);

    render(
      <DefectExplainModal
        defect={defect}
        onClose={() => undefined}
        schedule={[{
          slot_id: 'CURRENT', section_id: 'SEC-01', section_name: 'Section 1',
          start_datetime: '2025-09-08T04:00:00', duration_hours: 4,
          slot_source: 'Timetable', assigned_defect_ids: ['TMS-001'],
          assigned_defect_count: 1, is_bundled: false, bundle_type: 'Single Task Block',
        }]}
        slots={[
          { slot_id: 'CANDIDATE-A', section_id: 'SEC-01', horizon: 'weekly', start_datetime: '2025-09-07T04:00:00', duration_hours: 6, slot_source: 'Timetable' },
          { slot_id: 'CURRENT', section_id: 'SEC-01', horizon: 'weekly', start_datetime: '2025-09-08T04:00:00', duration_hours: 4, slot_source: 'Timetable' },
          { slot_id: 'CANDIDATE-B', section_id: 'SEC-01', horizon: 'weekly', start_datetime: '2025-09-09T04:00:00', duration_hours: 6, slot_source: 'Timetable' },
          { slot_id: 'CANDIDATE-C', section_id: 'SEC-01', horizon: 'weekly', start_datetime: '2025-09-10T04:00:00', duration_hours: 12, slot_source: 'Timetable' },
        ]}
      />,
    );

    const candidateA = await screen.findByRole('button', { name: /Candidate slot CANDIDATE-A/ });
    const candidateB = screen.getByRole('button', { name: /Candidate slot CANDIDATE-B/ });
    const candidateC = screen.getByRole('button', { name: /Candidate slot CANDIDATE-C/ });
    await waitFor(() => expect(candidateA).toHaveAttribute('aria-disabled', 'false'));
    fireEvent.change(screen.getByLabelText(/reason category/i), { target: { value: 'prioritization_mistake' } });

    fireEvent.click(candidateA);
    expect(await screen.findByText('P2-DISPLACED-A')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();

    fireEvent.click(candidateB);
    expect(await screen.findByText('Combined duration 8h exceeds slot capacity 6h')).toBeInTheDocument();
    expect(screen.getByText('Blocked')).toBeInTheDocument();
    expect(screen.queryByText('P2-DISPLACED-A')).not.toBeInTheDocument();

    fireEvent.click(candidateC);
    expect(await screen.findByText('P3-DISPLACED-C')).toBeInTheDocument();
    expect(screen.getByText('Feasible')).toBeInTheDocument();
    expect(screen.queryByText('Combined duration 8h exceeds slot capacity 6h')).not.toBeInTheDocument();
  });

  it('replaces candidate A preview details with candidate B details on reselection', async () => {
    const safeProbe: OverridePreviewResponse = {
      feasible: true,
      available_hours: 10,
      required_hours: 4,
      newly_deferred: [],
      newly_cleared: [],
      priority_alert: false,
      p1_displacement: false,
      reason_category_valid_for_displacement: true,
      metrics_before: {},
    };
    const resultA: OverridePreviewResponse = {
      ...safeProbe,
      feasible: false,
      available_hours: 2,
      reason: 'CANDIDATE_A_BLOCKED',
    };
    const resultB: OverridePreviewResponse = {
      ...safeProbe,
      feasible: true,
      available_hours: 9,
      newly_deferred: ['P2-DISPLACED-B'],
      priority_alert: true,
    };
    const previewOverride = vi.spyOn(api, 'previewOverride')
      .mockResolvedValueOnce(safeProbe)
      .mockResolvedValueOnce(safeProbe)
      .mockResolvedValueOnce(resultA)
      .mockResolvedValueOnce(resultB);

    render(
      <DefectExplainModal
        defect={defect}
        onClose={() => undefined}
        schedule={[{
          slot_id: 'CURRENT', section_id: 'SEC-01', section_name: 'Section 1',
          start_datetime: '2025-09-08T04:00:00', duration_hours: 4,
          slot_source: 'Timetable', assigned_defect_ids: ['TMS-001'],
          assigned_defect_count: 1, is_bundled: false, bundle_type: 'Single Task Block',
        }]}
        slots={[
          { slot_id: 'CANDIDATE-A', section_id: 'SEC-01', horizon: 'weekly', start_datetime: '2025-09-07T04:00:00', duration_hours: 6, slot_source: 'Timetable' },
          { slot_id: 'CURRENT', section_id: 'SEC-01', horizon: 'weekly', start_datetime: '2025-09-08T04:00:00', duration_hours: 4, slot_source: 'Timetable' },
          { slot_id: 'CANDIDATE-B', section_id: 'SEC-01', horizon: 'weekly', start_datetime: '2025-09-09T04:00:00', duration_hours: 12, slot_source: 'Timetable' },
        ]}
      />,
    );

    const candidateA = await screen.findByRole('button', { name: /Candidate slot CANDIDATE-A/ });
    const candidateB = screen.getByRole('button', { name: /Candidate slot CANDIDATE-B/ });
    await waitFor(() => expect(candidateA).toHaveAttribute('aria-disabled', 'false'));
    fireEvent.change(screen.getByLabelText(/reason category/i), { target: { value: 'prioritization_mistake' } });

    fireEvent.click(candidateA);
    expect(await screen.findByText('Combined duration 8h exceeds slot capacity 6h')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();

    fireEvent.click(candidateB);
    expect(await screen.findByText('P2-DISPLACED-B')).toBeInTheDocument();
    expect(screen.queryByText('Combined duration 8h exceeds slot capacity 6h')).not.toBeInTheDocument();
    expect(screen.getByText('Feasible')).toBeInTheDocument();
    expect(previewOverride).toHaveBeenNthCalledWith(3, expect.objectContaining({ target_slot_id: 'CANDIDATE-A' }));
    expect(previewOverride).toHaveBeenNthCalledWith(4, expect.objectContaining({ target_slot_id: 'CANDIDATE-B' }));
  });

  it('greys out P1-displacing candidates and shows the emergency-flow message without previewing them on click', async () => {
    const safeProbe: OverridePreviewResponse = {
      feasible: true,
      available_hours: 10,
      required_hours: 4,
      newly_deferred: [],
      newly_cleared: [],
      priority_alert: false,
      p1_displacement: false,
      reason_category_valid_for_displacement: true,
      metrics_before: {},
    };
    const previewOverride = vi.spyOn(api, 'previewOverride')
      .mockRejectedValueOnce(new ApiError('P1 displacement blocked', 403, {
        reason: 'p1_displacement_not_authorized',
        message: 'P1 displacement requires an emergency reason.',
        p1_displacement: true,
        newly_deferred: ['P1-FIXED-01'],
        reason_category_valid_for_displacement: false,
      }))
      .mockResolvedValueOnce(safeProbe);

    render(
      <DefectExplainModal
        defect={defect}
        onClose={() => undefined}
        schedule={[{
          slot_id: 'CURRENT', section_id: 'SEC-01', section_name: 'Section 1',
          start_datetime: '2025-09-08T04:00:00', duration_hours: 4,
          slot_source: 'Timetable', assigned_defect_ids: ['TMS-001'],
          assigned_defect_count: 1, is_bundled: false, bundle_type: 'Single Task Block',
        }]}
        slots={[
          { slot_id: 'CANDIDATE-P1', section_id: 'SEC-01', horizon: 'weekly', start_datetime: '2025-09-07T04:00:00', duration_hours: 6, slot_source: 'Timetable' },
          { slot_id: 'CURRENT', section_id: 'SEC-01', horizon: 'weekly', start_datetime: '2025-09-08T04:00:00', duration_hours: 4, slot_source: 'Timetable' },
          { slot_id: 'CANDIDATE-SAFE', section_id: 'SEC-01', horizon: 'weekly', start_datetime: '2025-09-09T04:00:00', duration_hours: 12, slot_source: 'Timetable' },
        ]}
      />,
    );

    const p1Candidate = await screen.findByRole('button', { name: /Candidate slot CANDIDATE-P1/ });
    await waitFor(() => expect(p1Candidate).toHaveAttribute('aria-disabled', 'true'));
    expect(p1Candidate).toHaveClass('opacity-60');
    fireEvent.click(p1Candidate);
    expect(screen.getByText('This would displace a P1 safety-critical defect — use the emergency override flow instead.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /confirm override/i })).toBeDisabled();
    expect(previewOverride).toHaveBeenCalledTimes(2);
  });

  it('renders the same from-to window in both the worklist and modal preview for the chosen slot', async () => {
    const preview: OverridePreviewResponse = {
      feasible: true,
      available_hours: 12,
      required_hours: 8,
      newly_deferred: ['TMS-099'],
      newly_cleared: ['TMS-100'],
      priority_alert: false,
      p1_displacement: false,
      reason_category_valid_for_displacement: true,
      metrics_before: { clearance_pct: 62 },
      metrics_after: { clearance_pct: 71 },
      original_slot_id: 'SEC-01-0001',
      target_slot_id: 'SEC-01-0007',
    };

    const slotWindow = formatSlotWindow('2025-09-08T04:00:00', 4, '2025-09-08T08:00:00');

    vi.spyOn(api, 'previewOverride').mockResolvedValue(preview);

    render(
      <PlanScheduleView
        horizon="weekly"
        mergedSlots={[
          {
            slot_id: 'SEC-01-0007',
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
      />,
    );

    expect(screen.getByText(/Prayagraj Main Line/i)).toBeInTheDocument();
    const worklistWindowMatches = screen.getAllByText((_, element) => !!element && element.textContent?.includes('From') && element.textContent.includes(slotWindow));
    expect(worklistWindowMatches.length).toBeGreaterThan(0);

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

    const modalWindowMatches = await screen.findAllByText((_, element) => !!element && element.textContent?.includes(slotWindow));
    expect(modalWindowMatches.length).toBeGreaterThan(0);
  });

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

  it('buckets the integrated department cards by canonical source prefix', () => {
    const backlog = [
      ...Array.from({ length: 22 }, (_, index) => ({ ...defect, defect_id: `TMS-${String(index + 1).padStart(3, '0')}`, department: 'TMS' })),
      ...Array.from({ length: 14 }, (_, index) => ({ ...defect, defect_id: `TDMS-${String(index + 1).padStart(3, '0')}`, department: 'TDMS' })),
      ...Array.from({ length: 16 }, (_, index) => ({ ...defect, defect_id: `SMMS-${String(index + 1).padStart(3, '0')}`, department: 'SMMS' })),
    ];

    renderPlanScheduleView(
      <PlanScheduleView
        horizon="weekly"
        mergedSlots={[]}
        defects={backlog}
        isLoading={false}
        onSelectDefect={() => undefined}
        role="COA_ADMIN"
      />,
    );

    expect(screen.getByText('22 Orders')).toBeInTheDocument();
    expect(screen.getByText('14 Orders')).toBeInTheDocument();
    expect(screen.getByText('16 Orders')).toBeInTheDocument();
  });

  it('renders the assigned section and identical from-to range in the worklist', () => {
    const slotWindow = formatSlotWindow('2025-09-08T04:00:00', 4, '2025-09-08T08:00:00');

    renderPlanScheduleView(
      <PlanScheduleView
        horizon="weekly"
        initialViewMode="engineer"
        mergedSlots={[{
          slot_id: 'SEC-01-0007',
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
        }]}
        defects={[defect]}
        isLoading={false}
        onSelectDefect={() => undefined}
      />,
    );

    expect(screen.getByText('Prayagraj Main Line')).toBeInTheDocument();
    expect(screen.getByText(slotWindow)).toBeInTheDocument();
  });
});

describe('DefectExplainModal override guard rails', () => {
  it('keeps confirm disabled until a P1 displacement is acknowledged', async () => {
    const preview: OverridePreviewResponse = {
      feasible: true,
      available_hours: 8,
      required_hours: 4,
      newly_deferred: ['TMS-099'],
      newly_cleared: [],
      priority_alert: true,
      p1_displacement: true,
      reason_category_valid_for_displacement: true,
      metrics_before: { clearance_pct: 50 },
      metrics_after: { clearance_pct: 45 },
      original_slot_id: 'SEC-01-0001',
      target_slot_id: 'SEC-01-0007',
    };
    vi.spyOn(api, 'previewOverride').mockResolvedValue(preview);

    render(
      <DefectExplainModal
        defect={defect}
        onClose={() => undefined}
        schedule={[{ slot_id: 'SEC-01-0001', section_id: 'SEC-01', section_name: 'Prayagraj Main Line', start_datetime: '2025-09-06T04:00:00', end_datetime: '2025-09-06T08:00:00', duration_hours: 4, slot_source: 'MegaBlock', assigned_defect_ids: ['TMS-001'], assigned_defect_count: 1, is_bundled: false, bundle_type: 'Single Task Block' }]}
        slots={[{ slot_id: 'SEC-01-0007', section_id: 'SEC-01', section_name: 'Prayagraj Main Line', horizon: 'weekly', start_datetime: '2025-09-08T04:00:00', duration_hours: 4, slot_source: 'MegaBlock', max_tasks_possible: 2 }]}
        canOverride={true}
      />,
    );

    fireEvent.change(screen.getByLabelText(/reason category/i), { target: { value: 'weather_or_emergency' } });
    fireEvent.change(screen.getByLabelText(/target slot/i), { target: { value: 'SEC-01-0007' } });
    fireEvent.click(screen.getByRole('button', { name: /preview override/i }));

    const confirmButton = await screen.findByRole('button', { name: /confirm override/i });
    expect(confirmButton).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/I understand this defers a P1 safety defect/i));
    expect(confirmButton).toBeEnabled();
  });

  it('disables confirm for same-slot no-op selections and explains why', () => {
    render(
      <DefectExplainModal
        defect={defect}
        onClose={() => undefined}
        schedule={[{ slot_id: 'SEC-01-0001', section_id: 'SEC-01', section_name: 'Prayagraj Main Line', start_datetime: '2025-09-06T04:00:00', end_datetime: '2025-09-06T08:00:00', duration_hours: 4, slot_source: 'MegaBlock', assigned_defect_ids: ['TMS-001'], assigned_defect_count: 1, is_bundled: false, bundle_type: 'Single Task Block' }]}
        slots={[{ slot_id: 'SEC-01-0001', section_id: 'SEC-01', section_name: 'Prayagraj Main Line', horizon: 'weekly', start_datetime: '2025-09-06T04:00:00', duration_hours: 4, slot_source: 'MegaBlock', max_tasks_possible: 2 }]}
        canOverride={true}
      />,
    );

    fireEvent.change(screen.getByLabelText(/reason category/i), { target: { value: 'prioritization_mistake' } });
    fireEvent.change(screen.getByLabelText(/target slot/i), { target: { value: 'SEC-01-0001' } });

    expect(screen.getByText(/This is the defect's current slot/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /confirm override/i })).toBeDisabled();
  });

  it('requires an explicit re-override acknowledgement banner before a repeat confirm is allowed', () => {
    render(
      <DefectExplainModal
        defect={defect}
        onClose={() => undefined}
        schedule={[{ slot_id: 'SEC-01-0001', section_id: 'SEC-01', section_name: 'Prayagraj Main Line', start_datetime: '2025-09-06T04:00:00', end_datetime: '2025-09-06T08:00:00', duration_hours: 4, slot_source: 'MegaBlock', assigned_defect_ids: ['TMS-001'], assigned_defect_count: 1, is_bundled: false, bundle_type: 'Single Task Block' }]}
        slots={[{ slot_id: 'SEC-01-0007', section_id: 'SEC-01', section_name: 'Prayagraj Main Line', horizon: 'weekly', start_datetime: '2025-09-08T04:00:00', duration_hours: 4, slot_source: 'MegaBlock', max_tasks_possible: 2 }]}
        canOverride={true}
        overrideEntries={[
          { override_id: 9, defect_id: 'TMS-001', horizon: 'weekly', original_slot_id: 'SEC-01-0001', new_slot_id: 'SEC-01-0007', changed_by: 'COA_ADMIN', timestamp: '2025-09-01T12:00:00Z', reason_category: 'weather_or_emergency', reason_freetext: 'Earlier override', learnable: 0, newly_deferred_ids: 'TMS-099', priority_alert: 0 },
        ]}
      />,
    );

    fireEvent.change(screen.getByLabelText(/reason category/i), { target: { value: 'weather_or_emergency' } });
    fireEvent.change(screen.getByLabelText(/target slot/i), { target: { value: 'SEC-01-0007' } });
    fireEvent.click(screen.getByRole('button', { name: /preview override/i }));

    expect(screen.getByText(/already overridden/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/I understand this defect was already overridden/i)).toBeInTheDocument();
  });
});

describe('Dashboard live refresh', () => {
  it('invalidates schedule and slot queries after confirmation and can be awaited before searching by ID', async () => {
    const invalidateQueries = vi.fn();
    let resolveRefresh: (() => void) | undefined;
    const refreshPromise = new Promise<void>((resolve) => {
      resolveRefresh = resolve;
    });
    invalidateQueries.mockReturnValue(refreshPromise);

    const completedRefresh = invalidateLiveScheduleQueries({ invalidateQueries }, 'weekly');
    let completed = false;
    void completedRefresh.then(() => {
      completed = true;
    });
    await Promise.resolve();

    expect(completed).toBe(false);
    resolveRefresh?.();
    await completedRefresh;
    expect(completed).toBe(true);
    expect(invalidateQueries).toHaveBeenNthCalledWith(1, { queryKey: ['schedule', 'weekly'] });
    expect(invalidateQueries).toHaveBeenNthCalledWith(2, { queryKey: ['slots', 'weekly'] });
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

describe('PlanScheduleView search behavior', () => {
  const scheduleSlots = [
    {
      slot_id: 'SLOT-A',
      section_id: 'SEC-01',
      section_name: 'Test Section',
      start_datetime: '2026-09-20T00:00:00',
      end_datetime: '2026-09-20T04:00:00',
      duration_hours: 4,
      slot_source: 'Timetable',
      is_occupied: true,
      assigned_defect_ids: ['TMS-001'],
      assigned_defect_count: 1,
      departments_involved: ['Engineering'],
      is_bundled: false,
      bundle_type: 'Single Task Block',
    },
    {
      slot_id: 'SLOT-B',
      section_id: 'SEC-01',
      section_name: 'Test Section',
      start_datetime: '2026-09-21T00:00:00',
      end_datetime: '2026-09-21T04:00:00',
      duration_hours: 4,
      slot_source: 'Timetable',
      is_occupied: true,
      assigned_defect_ids: ['TMS-002'],
      assigned_defect_count: 1,
      departments_involved: ['Engineering'],
      is_bundled: false,
      bundle_type: 'Single Task Block',
    },
  ];

  const scheduleDefects: Defect[] = [
    { ...defect, defect_id: 'TMS-001' },
    { ...defect, defect_id: 'TMS-002' },
  ];

  const renderPlan = (
    searchResetKey = 0,
    horizon: 'weekly' | 'monthly' = 'monthly',
    initialViewMode: 'control' | 'engineer' = 'engineer',
  ) => renderPlanScheduleView(
    <PlanScheduleView
      horizon={horizon}
      mergedSlots={scheduleSlots}
      defects={scheduleDefects}
      isLoading={false}
      onSelectDefect={() => undefined}
      searchResetKey={searchResetKey}
      initialViewMode={initialViewMode}
    />,
  );

  it('resets an active search after CRIS refresh while preserving manual search and clear behavior', () => {
    const { rerender } = renderPlan();
    fireEvent.click(screen.getByRole('button', { name: /Defect Worklist/ }));
    const search = screen.getByPlaceholderText(/Search slot ID/i);

    fireEvent.change(search, { target: { value: 'TMS-001' } });
    expect(screen.getByText('Showing filtered results for:')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Clear filter' }));
    expect(screen.queryByText('Showing filtered results for:')).not.toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(3);

    fireEvent.change(screen.getByPlaceholderText(/Search slot ID/i), { target: { value: 'TMS-001' } });
    rerender(
      <PlanScheduleView
        horizon="monthly"
        mergedSlots={scheduleSlots}
        defects={scheduleDefects}
        isLoading={false}
        onSelectDefect={() => undefined}
        searchResetKey={1}
        initialViewMode="engineer"
      />,
    );
    expect(screen.queryByText('Showing filtered results for:')).not.toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(3);
  });

  it('shows an explicit no-match state instead of an empty schedule', () => {
    renderPlan(0, 'monthly', 'control');
    fireEvent.click(screen.getByRole('button', { name: /Control Timeline/ }));
    fireEvent.change(screen.getByPlaceholderText(/Search slot ID/i), { target: { value: 'TMS-CRIS-X' } });

    expect(screen.getByText('No schedule matches this filter.')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Clear filter' }).length).toBeGreaterThan(0);
  });

  it('keeps the same unfiltered schedule contract for weekly and monthly horizons', () => {
    const { rerender } = renderPlan(0, 'weekly');
    expect(screen.getByRole('heading', { name: /Weekly \(7d\)/ })).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(3);

    rerender(
      <PlanScheduleView
        horizon="monthly"
        mergedSlots={scheduleSlots}
        defects={scheduleDefects}
        isLoading={false}
        onSelectDefect={() => undefined}
        initialViewMode="engineer"
      />,
    );
    expect(screen.getByRole('heading', { name: /Monthly \(30d\)/ })).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(3);
  });
});
