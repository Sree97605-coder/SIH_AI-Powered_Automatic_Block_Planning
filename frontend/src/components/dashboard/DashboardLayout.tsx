import React, { useState } from 'react';
import { Sidebar, DashboardTab } from './Sidebar';
import { TopBar } from './TopBar';
import { OverviewView } from './views/OverviewView';
import { PlanScheduleView } from './views/PlanScheduleView';
import { UnscheduledView } from './views/UnscheduledView';
import { CorridorMapView } from './views/CorridorMapView';
import { DefectExplainModal } from './DefectExplainModal';
import { DevDebugPanel } from './DevDebugPanel';
import { HorizonType, PerspectiveType, Defect } from '../../types';
import {
  useHealth,
  useComparison,
  useMergedSlots,
  useDefects,
  useClassifications,
} from '../../api/hooks';
import { VERIFIED_BENCHMARKS } from '../../config/constants';

interface DashboardLayoutProps {
  onBackToLanding: () => void;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({ onBackToLanding }) => {
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
  const [horizon, setHorizon] = useState<HorizonType>('monthly');
  const [perspective, setPerspective] = useState<PerspectiveType>('division');
  const [selectedSectionFilter, setSelectedSectionFilter] = useState<string>('ALL');
  const [selectedDefect, setSelectedDefect] = useState<Defect | null>(null);

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

  const comparisonRow = comparisonData[horizon]?.find(r => r.plan === 'Optimized');

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-transparent text-[var(--text-body)] transition-colors duration-200">
      
      {/* Persistent Left Sidebar (~220px desktop) */}
      <Sidebar
        activeTab={activeTab}
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
              mergedSlots={mergedSlots}
              defects={defects}
              isLoading={isLoadingSlots || isLoadingDefects}
              onSelectDefect={(def) => setSelectedDefect(def)}
              selectedSectionFilter={selectedSectionFilter}
              onSelectSectionFilter={(sec) => setSelectedSectionFilter(sec)}
              initialViewMode={perspective === 'control' ? 'control' : 'engineer'}
              departmentPerspective={departmentPerspective}
            />
          )}

          {activeTab === 'unscheduled' && (
            <UnscheduledView
              horizon={horizon}
              classifications={classifications}
              isLoading={isLoadingClassifications}
              onSelectDefect={(def) => setSelectedDefect(def)}
            />
          )}

          {activeTab === 'corridor' && (
            <CorridorMapView
              mergedSlots={mergedSlots}
              defects={defects}
            />
          )}
        </main>

      </div>

      {/* Defect Explainability Drawer */}
      <DefectExplainModal
        defect={selectedDefect}
        onClose={() => setSelectedDefect(null)}
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
