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
  useAuditLog,
} from '../../api/hooks';
import { useQueryClient } from '@tanstack/react-query';
import { VERIFIED_BENCHMARKS } from '../../config/constants';
import { useAuth } from '../../context/AuthContext';

interface DashboardLayoutProps {
  onBackToLanding: () => void;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({ onBackToLanding }) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
  const [horizon, setHorizon] = useState<HorizonType>('monthly');
  const [perspective, setPerspective] = useState<PerspectiveType>('division');
  const [selectedSectionFilter, setSelectedSectionFilter] = useState<string>('ALL');
  const [selectedDefect, setSelectedDefect] = useState<Defect | null>(null);
  const role = user?.role ?? 'DIVISION_HEAD';
  const engineerDepartment: DepartmentType = user?.department === 'TMS'
    ? 'Engineering'
    : user?.department === 'TDMS'
    ? 'TRD'
    : 'S&T';

  const queryClient = useQueryClient();

  // Queries from TanStack React Query
  const { data: healthData, isError: isHealthError } = useHealth();
  const { data: comparisonData = VERIFIED_BENCHMARKS } = useComparison();
  const { data: defects = [], isLoading: isLoadingDefects } = useDefects();
  const {
    mergedSlots,
    rawSlots,
    rawSchedule,
    isLoading: isLoadingSlots,
  } = useMergedSlots(horizon, selectedSectionFilter);
  const { data: classifications = [], isLoading: isLoadingClassifications } = useClassifications(horizon);
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
          horizon={horizon}
          onHorizonChange={(h) => setHorizon(h)}
          perspective={perspective}
          onPerspectiveChange={handlePerspectiveChange}
          role={role}
          department={engineerDepartment}
          solverStatus={solverStatus}
          isBackendConnected={isBackendConnected}
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
            />
          )}

          {(activeTab === 'weekly' || activeTab === 'monthly') && (
            <PlanScheduleView
              horizon={activeTab === 'weekly' ? 'weekly' : 'monthly'}
              mergedSlots={visibleMergedSlots}
              defects={visibleDefects}
              isLoading={isLoadingSlots || isLoadingDefects}
              onSelectDefect={(def) => setSelectedDefect(def)}
              selectedSectionFilter={selectedSectionFilter}
              onSelectSectionFilter={(sec) => setSelectedSectionFilter(sec)}
              initialViewMode={perspective === 'control' ? 'control' : 'engineer'}
              departmentPerspective={activeDepartment}
            />
          )}

          {activeTab === 'unscheduled' && (
            <UnscheduledView
              horizon={horizon}
              classifications={visibleClassifications}
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
        onConfirmSuccess={() => {
          // Re-fetch live schedule + slots from API after a successful confirm.
          // Invalidating both keys ensures the merged slot display (occupied/idle)
          // and the raw schedule fed to the modal both reflect the new state.
          queryClient.invalidateQueries({ queryKey: ['schedule', horizon] });
          queryClient.invalidateQueries({ queryKey: ['slots', horizon] });
        }}
      />

      {/* Dev Mode Assertion Cross-Check Panel */}
      <DevDebugPanel
        horizon={horizon}
        schedules={rawSchedule}
        slots={rawSlots}
        comparisonRow={comparisonRow}
      />

    </div>
  );
};
