import React, { useState } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { LandingNavbar } from './components/landing/LandingNavbar';
import { HeroSection } from './components/landing/HeroSection';
import { CorridorOverviewSection } from './components/landing/CorridorOverviewSection';
import { ComparisonSection } from './components/landing/ComparisonSection';
import { UnscheduledSection } from './components/landing/UnscheduledSection';
import { LandingFooter } from './components/landing/LandingFooter';
import { DemoTourModal } from './components/landing/DemoTourModal';
import { DashboardLayout } from './components/dashboard/DashboardLayout';
import { TrainIntroAnimation } from './components/common/TrainIntroAnimation';

const MainAppContent: React.FC = () => {
  const [currentView, setCurrentView] = useState<'landing' | 'dashboard'>('landing');
  const [isDemoModalOpen, setIsDemoModalOpen] = useState(false);

  // If in dashboard view, render the persistent sidebar + topbar dashboard shell
  if (currentView === 'dashboard') {
    return (
      <DashboardLayout
        onBackToLanding={() => {
          setCurrentView('landing');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />
    );
  }

  // Marketing & Evaluation Landing Page
  return (
    <div className="relative min-h-screen bg-transparent text-[var(--text-body)] selection:bg-[var(--accent-amber)] selection:text-white transition-colors duration-200">
      
      {/* Dynamic Train Intro Animation racing across web & settling into logo (Triggers on refresh) */}
      <TrainIntroAnimation />

      {/* Top Navbar with Theme Toggle */}
      <LandingNavbar
        onEnterDashboard={() => {
          setCurrentView('dashboard');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onOpenDemo={() => setIsDemoModalOpen(true)}
      />

      {/* 1. Hero Section (Clean headline fade/slide, counter numbers count up, NO typewriter box) */}
      <HeroSection
        onEnterDashboard={() => {
          setCurrentView('dashboard');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onOpenDemo={() => setIsDemoModalOpen(true)}
      />

      {/* 2. Corridor Overview Section (202km Prayagraj Line) */}
      <CorridorOverviewSection />

      {/* 3. Before vs After Benchmark Comparison (Weekly / Monthly) */}
      <ComparisonSection />

      {/* 4. Unscheduled Classification Board */}
      <UnscheduledSection />

      {/* 5. Landing Footer */}
      <LandingFooter
        onEnterDashboard={() => {
          setCurrentView('dashboard');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />

      {/* Interactive System Walkthrough Tour Modal */}
      <DemoTourModal
        isOpen={isDemoModalOpen}
        onClose={() => setIsDemoModalOpen(false)}
        onEnterDashboard={() => {
          setIsDemoModalOpen(false);
          setCurrentView('dashboard');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />

    </div>
  );
};

export const App: React.FC = () => {
  return (
    <ThemeProvider>
      <MainAppContent />
    </ThemeProvider>
  );
};

export default App;
