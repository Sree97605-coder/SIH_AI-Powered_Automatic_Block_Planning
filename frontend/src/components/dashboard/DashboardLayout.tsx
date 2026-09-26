import React, { useState } from 'react';
import { Sidebar, DashboardTab } from './Sidebar';
import { TopBar } from './TopBar';
import { OverviewView } from './views/OverviewView';
import { PlanScheduleView } from './views/PlanScheduleView';
import { UnscheduledView } from './views/UnscheduledView';
import { CorridorMapView } from './views/CorridorMapView';
import { AuditLogView } from './views/AuditLogView';
import { DefectExplainModal } from './DefectExplainModal';
import { DevDebugPanel } from './DevDebugPanel';
import { DepartmentType, HorizonType, PerspectiveType, Defect, RoleType } from '../../types';
import {
  useHealth,
  useComparison,
  useMergedSlots,
  useDefects,
  useClassifications,
  usePendingDefects,
  useAuditLog,
} from '../../api/hooks';
import { useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { VERIFIED_BENCHMARKS } from '../../config/constants';
import { useAuth } from '../../context/AuthContext';
import { pendingDefectToDisplayDefect } from '../../utils/newDefects';

interface DashboardLayoutProps {
  onBackToLanding: () => void;
}

export const invalidateLiveScheduleQueries = async (queryClient: Pick<QueryClient, 'invalidateQueries'>, horizon: HorizonType): Promise<void> => {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['schedule', horizon] }),
    queryClient.invalidateQueries({ queryKey: ['slots', horizon] }),
  ]);
};

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({ onBackToLanding }) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
  const [horizon, setHorizon] = useState<HorizonType>('monthly');
  const [perspective, setPerspective] = useState<PerspectiveType>('division');
  const [selectedSectionFilter, setSelectedSectionFilter] = useState<string>('ALL');
  const [selectedDefect, setSelectedDefect] = useState<Defect | null>(null);
  const [planSearchResetKey, setPlanSearchResetKey] = useState(0);
  const [crisNotice, setCrisNotice] = useState<{ defectId: string; status: string; message: string } | null>(null);
  const role = user?.role ?? 'DIVISION_HEAD';
  const engineerDepartment: DepartmentType = user?.department === 'TMS'
    ? 'Engineering'
    : user?.department === 'TDMS'
    ? 'TRD'
    : 'S&T';

  const queryClient = useQueryClient();

  const handleSimulateCrisDefect = async () => {
    if (role !== 'COA_ADMIN') return;

    try {
      const payload = {
        defect_id: `TMS-CRIS-${Date.now()}`,
        department: 'Engineering',
        location: 'SEC-01 / km 5.4 (CNB–CNBI Up)',
        section_id: 'SEC-01',
        section_name: 'Kanpur Central – Bindki Road',
        defect_type: 'Rail fracture (suspect)',
        severity: 'High',
        overdue_days: 2,
        estimated_duration_hours: 4,
        criticality_score: 9,
        asset_impact: 'High',
        description: 'CRIS simulated defect queued for re-optimization.',
        source_system: 'TMS',
      };
      const result = await import('../../api/client').then(({ api }) => api.simulateDefect(payload));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['defects'] }),
        queryClient.invalidateQueries({ queryKey: ['defects', 'pending'] }),
        queryClient.invalidateQueries({ queryKey: ['schedule', 'monthly'] }),
        queryClient.invalidateQueries({ queryKey: ['schedule', 'weekly'] }),
        queryClient.invalidateQueries({ queryKey: ['unscheduled'] }),
        queryClient.invalidateQueries({ queryKey: ['classifications'] }),
      ]);
      setPlanSearchResetKey((current) => current + 1);
      if (result.status === 'SCHEDULED' && result.slot_id && result.horizon) {
        setCrisNotice({
          defectId: result.defect_id,
          status: `Scheduled in ${result.horizon}`,
          message: `Assigned to ${result.slot_id}.`,
        });
      } else if (result.duplicate) {
        setCrisNotice({ defectId: result.defect_id, status: 'Already pending', message: 'This defect is waiting for re-optimization.' });
      } else {
        setCrisNotice({ defectId: result.defect_id, status: 'Pending re-optimization', message: 'It is visible in the worklist and unscheduled queue; no horizon slot is assigned yet.' });
      }
    } catch (error) {
      setCrisNotice({ defectId: '', status: 'Creation failed', message: error instanceof Error ? error.message : 'Unable to simulate CRIS defect.' });
    }
  };

  // Queries from TanStack React Query
  const { data: healthData, isError: isHealthError } = useHealth();
  const { data: comparisonData = VERIFIED_BENCHMARKS } = useComparison();
  const { data: defects = [], isLoading: isLoadingDefects } = useDefects();
  const {
    mergedSlots,
    rawSlots,
    rawSchedule,
    isLoading: isLoadingSlots,
    error: scheduleError,
  } = useMergedSlots(horizon, selectedSectionFilter);
  const { data: classifications = [], isLoading: isLoadingClassifications } = useClassifications(horizon);
  const { data: pendingDefects = [] } = usePendingDefects();
  const { data: auditEntries = [], isLoading: isLoadingAudit, refetch: refetchAudit } = useAuditLog(role === 'COA_ADMIN');

  const isBackendConnected = !isHealthError && healthData?.status === 'ok';
  const solverStatus = 'Optimal';

  // Handle perspective switcher changes
  const handlePerspectiveChange = (newPerspective: PerspectiveType) => {
    setPerspective(newPerspective);
    if (newPerspective === 'engineer' || newPerspective === 'ohe' || newPerspective === 'smt') {
      if (activeTab === 'overview') {
        setActiveTab(horizon === 'weekly' ? 'weekly' : 'monthly');
      }
    } else if (newPerspective === 'control' && activeTab === 'overview') {
      setActiveTab(horizon === 'weekly' ? 'weekly' : 'monthly');
    }
  };

  const departmentPerspective = perspective === 'engineer'
    ? 'Engineering'
    : perspective === 'ohe'
    ? 'TRD'
    : perspective === 'smt'
    ? 'S&T'
    : 'ALL';

  const activeDepartment = role === 'DEPT_ENGINEER' ? engineerDepartment : departmentPerspective;
  const matchesDepartment = (department: string | undefined, defectId: string) => {
    const value = (department || '').toLowerCase();
    if (activeDepartment === 'Engineering') return value.includes('eng') || value.includes('tms') || defectId.startsWith('TMS');
    if (activeDepartment === 'TRD') return value.includes('trd') || value.includes('tdms') || value.includes('ohe') || defectId.startsWith('TDMS');
    if (activeDepartment === 'S&T') return value.includes('s&t') || value.includes('smms') || value.includes('smt') || defectId.startsWith('SMMS');
    return true;
  };
  const visibleDefects = role === 'DEPT_ENGINEER'
    ? defects.filter((defect) => matchesDepartment(defect.department, defect.defect_id))
    : defects;
  const visibleDefectIds = new Set(visibleDefects.map((defect) => defect.defect_id));
  const visibleClassifications = role === 'DEPT_ENGINEER'
    ? classifications.filter((item) => visibleDefectIds.has(item.defect_id) || matchesDepartment(item.department, item.defect_id))
    : classifications;
  const visiblePendingDefects = role === 'DEPT_ENGINEER'
    ? pendingDefects.filter((item) => matchesDepartment(String(item.payload?.department ?? item.source_system), item.defect_id))
    : pendingDefects;
  const visiblePendingAsDefects = visiblePendingDefects.map(pendingDefectToDisplayDefect);
  const visibleDashboardDefects = [...visibleDefects, ...visiblePendingAsDefects]
    .filter((defect, index, all) => all.findIndex((candidate) => candidate.defect_id === defect.defect_id) === index);
  const visibleMergedSlots = role === 'DEPT_ENGINEER'
    ? mergedSlots
        .map((slot) => {
          if (!slot.is_occupied) return slot;
          const assignedDefectIds = slot.assigned_defect_ids.filter((defectId) => visibleDefectIds.has(defectId));
          return {
            ...slot,
            assigned_defect_ids: assignedDefectIds,
            assigned_defect_count: assignedDefectIds.length,
            departments_involved: assignedDefectIds.length > 0 ? [engineerDepartment] : [],
            is_bundled: assignedDefectIds.length > 1,
            bundle_type: assignedDefectIds.length > 1 ? 'Multi-Task Block' : 'Single Task Block',
          };
        })
        .filter((slot) => !slot.is_occupied || slot.assigned_defect_ids.length > 0)
    : mergedSlots;

  const comparisonRow = comparisonData[horizon]?.find(r => r.plan === 'Optimized');

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-transparent text-[var(--text-body)] transition-colors duration-200">
      
      {/* Persistent Left Sidebar (~220px desktop) */}
      <Sidebar
        activeTab={activeTab}
        role={role}
        pendingCount={visiblePendingDefects.length}
        onTabChange={(tab) => {
          setActiveTab(tab);
          if (tab === 'weekly') setHorizon('weekly');
          if (tab === 'monthly') setHorizon('monthly');
        }}
        onBackToLanding={onBackToLanding}
      />

      {/* Main Content Column */}
      <div className="flex-1 flex flex-col min-w-0 overflow-x-hidden">
        
        {/* Top Bar with Global Horizon, Perspective Switcher (OHE/SSMT/Eng/Control), Solver Status */}
        <TopBar
          perspective={perspective}
          onPerspectiveChange={handlePerspectiveChange}
          role={role}
        />

        {/* View Content Router */}
        <main className="flex-1 p-4 sm:p-8 max-w-7xl w-full mx-auto">
          {activeTab === 'overview' && (
            <OverviewView
              horizon={horizon}
              onNavigateTab={(tab) => {
                setActiveTab(tab);
                if (tab === 'weekly') setHorizon('weekly');
                if (tab === 'monthly') setHorizon('monthly');
              }}
              onSelectDefect={(def) => setSelectedDefect(def)}
              selectedSectionFilter={selectedSectionFilter}
              onSelectSectionFilter={(sec) => setSelectedSectionFilter(sec)}
              perspective={perspective}
              onPerspectiveChange={handlePerspectiveChange}
              role={role}
              defects={visibleDashboardDefects}
              pendingDefectIds={visiblePendingDefects.map((item) => item.defect_id)}
              crisNotice={crisNotice}
              onSimulateCrisDefect={() => { void handleSimulateCrisDefect(); }}
            />
          )}

          {(activeTab === 'weekly' || activeTab === 'monthly') && (
            <PlanScheduleView
              horizon={activeTab === 'weekly' ? 'weekly' : 'monthly'}
              mergedSlots={visibleMergedSlots}
              defects={visibleDashboardDefects}
              isLoading={isLoadingSlots || isLoadingDefects}
              onSelectDefect={(def) => setSelectedDefect(def)}
              selectedSectionFilter={selectedSectionFilter}
              onSelectSectionFilter={(sec) => setSelectedSectionFilter(sec)}
              initialViewMode={perspective === 'control' ? 'control' : 'engineer'}
              departmentPerspective={activeDepartment}
              overrideEntries={auditEntries}
              role={role}
              unscheduledDefects={visibleClassifications}
              pendingDefects={visiblePendingDefects}
              searchResetKey={planSearchResetKey}
              scheduleError={scheduleError}
            />
          )}

          {activeTab === 'unscheduled' && (
            <UnscheduledView
              horizon={horizon}
              classifications={visibleClassifications}
              pendingDefects={visiblePendingAsDefects}
              isLoading={isLoadingClassifications}
              onSelectDefect={(def) => setSelectedDefect(def)}
            />
          )}

          {activeTab === 'corridor' && (
            <CorridorMapView
              mergedSlots={mergedSlots}
              defects={visibleDefects}
            />
          )}

          {activeTab === 'audit' && role === 'COA_ADMIN' && (
            <AuditLogView
              entries={auditEntries}
              isLoading={isLoadingAudit}
              onRefresh={() => { void refetchAudit(); }}
            />
          )}
        </main>

      </div>

      {/* Defect Explainability Drawer */}
      <DefectExplainModal
        defect={selectedDefect}
        onClose={() => setSelectedDefect(null)}
        horizon={horizon}
        schedule={rawSchedule}
        slots={rawSlots}
        canOverride={role === 'COA_ADMIN'}
        onConfirmSuccess={async () => {
          await invalidateLiveScheduleQueries(queryClient, horizon);
        }}
      />

      {/* Dev Mode Assertion Cross-Check Panel */}
      <DevDebugPanel
        horizon={horizon}
        schedules={rawSchedule}
        slots={rawSlots}
        comparisonRow={comparisonRow}
        solverStatus={solverStatus}
      />

    </div>
  );
};
