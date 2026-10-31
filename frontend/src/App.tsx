import React, { lazy, Suspense } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Header } from './components/Header';
import { LoginView } from './views/LoginView';
import { ResearchWorkspaceView } from './views/ResearchWorkspaceView';
import { LecturesView } from './views/LecturesView';
import { KnowledgeView } from './views/KnowledgeView';
import { LectureTwinView } from './views/LectureTwinView';
import { SimulationView } from './views/SimulationView';
import { QuestionInsightsView } from './views/QuestionInsightsView';
import { AssessmentView } from './views/AssessmentView';
import { StudentLearnView } from './views/StudentLearnView';
import { AdminView } from './views/AdminView';
import { ArrowLeft, RefreshCw } from 'lucide-react';

const ExecutionCenterView = lazy(() => import('./views/ExecutionCenterView').then(module => ({ default: module.ExecutionCenterView })));

function AppContent() {
  const {
    user,
    currentView,
    setCurrentView,
    role,
    switchRole,
    logout,
    bootstrap,
    workspace,
    error,
    clearError,
    loading
  } = useApp();

  // Loading gate for initial session check
  if (loading && !user) {
    return (
      <div className="min-h-screen bg-[#f6f8fc] flex flex-col items-center justify-center p-6 space-y-4 font-sans text-center">
        <div className="w-12 h-12 rounded-2xl bg-white border border-[#e1e7ef] shadow-sm flex items-center justify-center text-[#2959ea]">
          <RefreshCw className="w-6 h-6 animate-spin" />
        </div>
        <div className="space-y-1">
          <p className="text-base font-bold text-[#12213b]">LectureTwin</p>
          <p className="text-xs sm:text-sm font-medium text-[#5f708b]">Đang kiểm tra phiên đăng nhập...</p>
        </div>
      </div>
    );
  }

  // Unauthenticated user -> render realistic Login screen
  if (!user) {
    return <LoginView />;
  }

  const isAdvancedView = ['agents', 'graph', 'twin'].includes(currentView);

  return (
    <div className="min-h-screen bg-[#f6f8fc] text-[#12213b] flex flex-col font-sans antialiased">
      {/* Top White Navigation Header (72px) */}
      <Header
        currentRole={role}
        user={user}
        onLogout={logout}
        onSwitchRole={switchRole}
        courses={bootstrap?.courses || []}
        selectedLecture={workspace?.lecture}
        error={error}
        onClearError={clearError}
        loading={loading}
        currentView={currentView}
        onSelectView={setCurrentView}
      />

      {/* Main Content Area (Max 1440px with 32px desktop gutters) */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-2.5 sm:px-4 md:px-8 py-5 sm:py-7">
        {/* Compact Back Link for Advanced Detail Views */}
        {isAdvancedView && (
          <div className="mb-4">
            <button
              type="button"
              onClick={() => setCurrentView('ai')}
              className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-[#2959ea] hover:text-blue-800 bg-white border border-[#e1e7ef] px-3.5 py-2 rounded-xl shadow-2xs transition-colors cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#2959ea]"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Về bài giảng và tri thức</span>
            </button>
          </div>
        )}

        {/* Loading gate in App: prevents any transient 'no source' / 'no analysis' flicker while fetching workspace */}
        {loading && !workspace ? (
          <div className="space-y-6 max-w-[1440px] mx-auto pb-12 animate-pulse">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div className="space-y-2">
                <div className="h-8 bg-slate-200 rounded-xl w-64 sm:w-80" />
                <div className="h-4 bg-slate-100 rounded-lg w-72 sm:w-96" />
              </div>
              <div className="h-10 bg-slate-200 rounded-xl w-36 self-start sm:self-auto" />
            </div>
            <div className="h-16 bg-white rounded-xl border border-[#e1e7ef] p-4" />
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="lg:col-span-5 bg-white rounded-xl border border-[#e1e7ef] p-6 h-[460px] flex flex-col items-center justify-center text-xs text-[#5f708b] space-y-2">
                <RefreshCw className="w-5 h-5 animate-spin text-[#2959ea]" />
                <span>Đang kết nối dữ liệu bài giảng...</span>
              </div>
              <div className="lg:col-span-7 bg-white rounded-xl border border-[#e1e7ef] p-6 h-[460px]" />
            </div>
          </div>
        ) : (
          <>
            {/* View Routing */}
            {currentView === 'ai' && <ResearchWorkspaceView key={workspace?.lecture.id} />}
            {currentView === 'lectures' && <LecturesView />}
            {currentView === 'assessment' && <AssessmentView />}
            {currentView === 'questions' && role === 'teacher' && <QuestionInsightsView key={workspace?.lecture.id} />}

            {/* Shared Student / Tutor single mounted view instance */}
            {(currentView === 'student' || currentView === 'tutor') && (
              <StudentLearnView focusTutor={currentView === 'tutor'} />
            )}

            {currentView === 'admin' && <AdminView />}
            {currentView === 'agents' && <Suspense fallback={<p role="status" className="py-8 text-center text-sm text-slate-500">Đang mở chi tiết xử lý…</p>}><ExecutionCenterView /></Suspense>}
            {currentView === 'graph' && <KnowledgeView />}
            {currentView === 'twin' && <LectureTwinView />}
            {currentView === 'simulation' && <SimulationView />}
          </>
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
