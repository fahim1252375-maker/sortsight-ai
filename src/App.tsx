import React, { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { AppShell } from './components/AppShell.tsx';
import { AuthView } from './components/AuthView.tsx';
import { CommandPalette } from './components/CommandPalette.tsx';
import { LandingPage } from './components/LandingPage.tsx';
import { ToastProvider } from './components/ui/ToastProvider.tsx';
import { apiRequest, getStoredToken, setStoredToken } from './lib/api.ts';
import { getActiveViewFromPath, viewIdToPath } from './lib/routes.ts';
import { Facility, LanguageCode, UserSession, ViewId } from './types/sortsight.ts';
import { AnalyticsCenterView, AssistantView, EnvironmentImpactView } from './views/AnalyticsEnvAssistantViews.tsx';
import {
  AnalyticsSubPage,
  BatchDetailPage,
  ConveyorSessionDetailPage,
  FacilityDetailPage,
  HazardDetailPage,
  InventoryDetailPage,
  MaterialDetailPage,
  ModelDetailPage,
  ReviewDetailPage,
  ScannerHistoryPage,
  ScannerResultDetailPage,
  StageDetailPage,
} from './views/DetailPages.tsx';
import { DigitalTwinSimulatorView, OperationsInventoryBatchesView } from './views/DigitalTwinOpsViews.tsx';
import { FacilityDirectoryView, GlobalRulesView } from './views/GlobalRulesDirectoryViews.tsx';
import { AnnotationWorkspaceView, HumanReviewView, ModelsDatasetsView } from './views/HumanReviewModelsViews.tsx';
import { MainDashboardView } from './views/MainDashboardView.tsx';
import { ContaminationAnalysisView, HazardIntelligenceView, MaterialIntelligenceView } from './views/MaterialHazardViews.tsx';
import { NotFoundView } from './views/NotFoundView.tsx';
import { DeveloperCenterView, NotificationsView, SecuritySettingsProfileAdminView, TeamManagementView } from './views/PlatformAdminViews.tsx';
import { ScannerSuiteView } from './views/ScannerSuiteView.tsx';
import { ConveyorMonitoringView, SmartSortingView } from './views/SortingConveyorViews.tsx';

function PermissionGate({
  user,
  requiredPermission,
  children,
}: {
  user: UserSession;
  requiredPermission: string;
  children: React.ReactNode;
}) {
  const hasPerm = user.permissions.includes('*') || user.permissions.includes(requiredPermission);
  if (!hasPerm) {
    return (
      <div className="p-8 rounded-2xl border border-amber-200 dark:border-amber-900 bg-amber-50/70 dark:bg-amber-950/30 text-center max-w-lg mx-auto my-8">
        <div className="font-display text-lg font-bold text-slate-900 dark:text-white">Role Access Restricted</div>
        <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
          Your active role (<span className="font-mono font-semibold">{user.roleName}</span>) does not include{' '}
          <span className="font-mono">{requiredPermission}</span>. Contact an organization administrator to elevate permissions.
        </p>
      </div>
    );
  }
  return <>{children}</>;
}

function SortSightAppInner() {
  const navigate = useNavigate();
  const location = useLocation();

  const [user, setUser] = useState<UserSession | null>(null);
  const [authChecking, setAuthChecking] = useState<boolean>(() => Boolean(getStoredToken()));
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [activeFacilityId, setActiveFacilityId] = useState<string>('');
  const [language, setLanguage] = useState<LanguageCode>('en');
  const [isDark, setIsDark] = useState<boolean>(false);
  const [unreadNotifications, setUnreadNotifications] = useState<number>(0);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState<boolean>(false);

  const activeView = getActiveViewFromPath(location.pathname);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  // Global Cmd+K / Ctrl+K shortcut for Command Center & Global Search
  useEffect(() => {
    if (!user) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [user]);

  const loadWorkspaceContext = () => {
    apiRequest<{ facilities: Facility[] }>('/facilities')
      .then((res) => {
        setFacilities(res.facilities);
        if (res.facilities.length > 0) {
          setActiveFacilityId((prev) => prev || res.facilities[0].id);
        }
      })
      .catch(() => {});

    apiRequest<{ notifications: Array<{ is_read: number; status?: string }> }>('/notifications')
      .then((res) =>
        setUnreadNotifications(res.notifications.filter((n) => (n.status ? n.status === 'open' : n.is_read === 0)).length)
      )
      .catch(() => {});
  };

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setAuthChecking(false);
      return;
    }
    apiRequest<{
      user: {
        id: string;
        email: string;
        full_name: string;
        preferred_language: LanguageCode;
        avatar_initials: string;
        roleName: string;
        permissions: string[];
      } | null;
      organization: { id: string; name: string } | null;
    }>('/auth/me')
      .then((res) => {
        if (res.user && res.organization) {
          setUser({
            id: res.user.id,
            email: res.user.email,
            fullName: res.user.full_name,
            preferredLanguage: res.user.preferred_language || 'en',
            avatarInitials: res.user.avatar_initials,
            organizationId: res.organization.id,
            organizationName: res.organization.name,
            roleName: res.user.roleName,
            assignedFacilityId: null,
            permissions: res.user.permissions,
          });
          setLanguage(res.user.preferred_language || 'en');
          loadWorkspaceContext();
          if (location.pathname === '/login' || location.pathname === '/register') {
            navigate('/dashboard', { replace: true });
          }
        }
      })
      .catch(() => {
        setStoredToken(null);
      })
      .finally(() => setAuthChecking(false));
  }, []);

  const navigateView = (view: ViewId) => {
    navigate(viewIdToPath(view));
  };

  const handleAuthenticated = (session: UserSession, redirectPath = '/dashboard') => {
    setUser(session);
    setLanguage(session.preferredLanguage || 'en');
    loadWorkspaceContext();
    navigate(redirectPath);
  };

  const handleQuickDemoLaunch = async (targetPath = '/scanner') => {
    if (user) {
      navigate(targetPath);
      return;
    }
    try {
      const res = await apiRequest<{ token: string; user: UserSession }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'admin@sortsight.demo', password: 'SortSightDemo2026!' }),
      });
      setStoredToken(res.token);
      handleAuthenticated(res.user, targetPath);
    } catch {
      navigate('/login');
    }
  };

  const handleLogout = () => {
    setStoredToken(null);
    setUser(null);
    setFacilities([]);
    setActiveFacilityId('');
    setCommandPaletteOpen(false);
    navigate('/');
  };

  const handleChangeLanguage = (lang: LanguageCode) => {
    setLanguage(lang);
    if (user) {
      apiRequest('/users/me/preferences', {
        method: 'PUT',
        body: JSON.stringify({ preferredLanguage: lang }),
      }).catch(() => {});
    }
  };

  if (authChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#070B14] text-slate-600 dark:text-slate-300 text-xs font-mono">
        Restoring SortSight AI session...
      </div>
    );
  }

  // Unauthenticated / Public Routes
  if (!user) {
    return (
      <Routes>
        <Route
          path="/"
          element={
            <LandingPage
              isDark={isDark}
              onToggleTheme={() => setIsDark((d) => !d)}
              onOpenAuth={(m = 'login') => navigate(m === 'register' ? '/register' : '/login')}
              onEnterDemoWorkspace={(targetPath) => handleQuickDemoLaunch(targetPath || '/scanner')}
            />
          }
        />
        <Route
          path="/overview"
          element={
            <LandingPage
              isDark={isDark}
              onToggleTheme={() => setIsDark((d) => !d)}
              onOpenAuth={(m = 'login') => navigate(m === 'register' ? '/register' : '/login')}
              onEnterDemoWorkspace={(targetPath) => handleQuickDemoLaunch(targetPath || '/scanner')}
              initialSection="overview"
            />
          }
        />
        <Route
          path="/directory"
          element={
            <LandingPage
              isDark={isDark}
              onToggleTheme={() => setIsDark((d) => !d)}
              onOpenAuth={(m = 'login') => navigate(m === 'register' ? '/register' : '/login')}
              onEnterDemoWorkspace={(targetPath) => handleQuickDemoLaunch(targetPath || '/scanner')}
              initialSection="directory"
            />
          }
        />
        <Route
          path="/facilities/:id"
          element={
            <div className="min-h-screen bg-slate-50 dark:bg-[#0B1120] p-6 max-w-6xl mx-auto">
              <FacilityDetailPage isAuthenticated={false} />
            </div>
          }
        />
        <Route
          path="/login"
          element={
            <AuthView
              initialMode="login"
              onAuthenticated={(s) => handleAuthenticated(s, '/dashboard')}
              onBack={() => navigate('/')}
            />
          }
        />
        <Route
          path="/register"
          element={
            <AuthView
              initialMode="register"
              onAuthenticated={(s) => handleAuthenticated(s, '/dashboard')}
              onBack={() => navigate('/')}
            />
          }
        />
        <Route
          path="*"
          element={
            <AuthView
              initialMode="login"
              onAuthenticated={(s) => handleAuthenticated(s, location.pathname || '/dashboard')}
              onBack={() => navigate('/')}
            />
          }
        />
      </Routes>
    );
  }

  const activeFacility = facilities.find((f) => f.id === activeFacilityId) || facilities[0];

  // If authenticated user visits "/" show the full landing page with "Return to Workspace" button
  if (location.pathname === '/') {
    return (
      <LandingPage
        isDark={isDark}
        isAuthenticated
        onToggleTheme={() => setIsDark((d) => !d)}
        onOpenAuth={() => navigate('/dashboard')}
        onEnterDemoWorkspace={(targetPath) => navigate(targetPath || '/dashboard')}
      />
    );
  }

  return (
    <>
      <AppShell
        user={user}
        facilities={facilities}
        activeFacilityId={activeFacilityId}
        onSelectFacility={setActiveFacilityId}
        activeView={activeView}
        onNavigate={navigateView}
        language={language}
        onChangeLanguage={handleChangeLanguage}
        isDark={isDark}
        onToggleTheme={() => setIsDark((d) => !d)}
        unreadNotifications={unreadNotifications}
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
        onLogout={handleLogout}
      >
        <Routes>
          <Route path="/login" element={<Navigate to="/dashboard" replace />} />
          <Route path="/register" element={<Navigate to="/dashboard" replace />} />

          <Route
            path="/dashboard"
            element={
              <MainDashboardView
                user={user}
                facilities={facilities}
                activeFacility={activeFacility}
                onSelectFacility={setActiveFacilityId}
                onNavigate={navigateView}
              />
            }
          />
          <Route
            path="/overview"
            element={
              <LandingPage
                isDark={isDark}
                isAuthenticated
                onToggleTheme={() => setIsDark((d) => !d)}
                onOpenAuth={() => navigate('/dashboard')}
                onEnterDemoWorkspace={(targetPath) => navigate(targetPath || '/scanner')}
                initialSection="overview"
              />
            }
          />

          {/* Vision & Intelligence */}
          <Route path="/scanner" element={<ScannerSuiteView mode="scanner" activeFacility={activeFacility} language={language} />} />
          <Route path="/scanner/history" element={<ScannerHistoryPage activeFacility={activeFacility} />} />
          <Route path="/scanner/result/:id" element={<ScannerResultDetailPage />} />
          <Route path="/realtime" element={<ScannerSuiteView mode="realtime" activeFacility={activeFacility} language={language} />} />
          <Route path="/batch" element={<ScannerSuiteView mode="batch" activeFacility={activeFacility} language={language} />} />
          <Route path="/batch/:id" element={<ScannerResultDetailPage />} />

          <Route path="/materials" element={<MaterialIntelligenceView />} />
          <Route path="/materials/:materialId" element={<MaterialDetailPage />} />
          <Route path="/contamination" element={<ContaminationAnalysisView activeFacility={activeFacility} />} />
          <Route path="/hazards" element={<HazardIntelligenceView />} />
          <Route path="/hazards/:id" element={<HazardDetailPage />} />

          {/* Sorting & Global Rules */}
          <Route path="/sorting" element={<SmartSortingView activeFacility={activeFacility} mode="overview" />} />
          <Route path="/sorting/configuration" element={<SmartSortingView activeFacility={activeFacility} mode="configuration" />} />
          <Route path="/conveyor" element={<ConveyorMonitoringView activeFacility={activeFacility} />} />
          <Route path="/conveyor/session/:id" element={<ConveyorSessionDetailPage />} />
          <Route path="/global-rules" element={<GlobalRulesView activeFacility={activeFacility} language={language} mode="global" />} />
          <Route path="/country-rules" element={<GlobalRulesView activeFacility={activeFacility} language={language} mode="country" />} />
          <Route path="/directory" element={<FacilityDirectoryView />} />
          <Route path="/facilities/:id" element={<FacilityDetailPage isAuthenticated />} />

          {/* Analytics & Assistant */}
          <Route path="/analytics" element={<AnalyticsCenterView activeFacility={activeFacility} />} />
          <Route path="/analytics/materials" element={<AnalyticsSubPage focus="materials" activeFacility={activeFacility} />} />
          <Route path="/analytics/recovery" element={<AnalyticsSubPage focus="recovery" activeFacility={activeFacility} />} />
          <Route path="/environment" element={<EnvironmentImpactView activeFacility={activeFacility} />} />
          <Route path="/assistant" element={<AssistantView activeFacility={activeFacility} />} />

          {/* Human QA & AI/ML */}
          <Route path="/reviews" element={<HumanReviewView />} />
          <Route path="/reviews/:id" element={<ReviewDetailPage />} />
          <Route path="/annotations" element={<AnnotationWorkspaceView />} />
          <Route path="/models" element={<ModelsDatasetsView mode="models" />} />
          <Route path="/models/:id" element={<ModelDetailPage />} />
          <Route path="/datasets" element={<ModelsDatasetsView mode="datasets" />} />

          {/* Digital Twin & Operations */}
          <Route path="/digital-twin" element={<DigitalTwinSimulatorView mode="digital_twin" activeFacility={activeFacility} />} />
          <Route path="/digital-twin/stages/:stageId" element={<StageDetailPage />} />
          <Route path="/simulator" element={<DigitalTwinSimulatorView mode="simulator" activeFacility={activeFacility} />} />
          <Route path="/material-flow" element={<DigitalTwinSimulatorView mode="material_flow" activeFacility={activeFacility} />} />
          <Route
            path="/operations"
            element={
              <OperationsInventoryBatchesView mode="operations" initialTab="tasks" activeFacility={activeFacility} onRefreshFacilities={loadWorkspaceContext} />
            }
          />
          <Route
            path="/operations/handover"
            element={
              <OperationsInventoryBatchesView mode="operations" initialTab="handovers" activeFacility={activeFacility} onRefreshFacilities={loadWorkspaceContext} />
            }
          />
          <Route
            path="/inventory"
            element={
              <OperationsInventoryBatchesView mode="inventory" activeFacility={activeFacility} onRefreshFacilities={loadWorkspaceContext} />
            }
          />
          <Route path="/inventory/:id" element={<InventoryDetailPage />} />
          <Route
            path="/batches"
            element={
              <OperationsInventoryBatchesView mode="batches" activeFacility={activeFacility} onRefreshFacilities={loadWorkspaceContext} />
            }
          />
          <Route path="/batches/:id" element={<BatchDetailPage />} />

          {/* Platform & Governance */}
          <Route
            path="/team"
            element={
              <PermissionGate user={user} requiredPermission="*">
                <TeamManagementView />
              </PermissionGate>
            }
          />
          <Route path="/notifications" element={<NotificationsView onRefreshCount={loadWorkspaceContext} />} />
          <Route path="/developers" element={<DeveloperCenterView />} />
          <Route path="/security" element={<SecuritySettingsProfileAdminView mode="security" user={user} language={language} onChangeLanguage={handleChangeLanguage} />} />
          <Route path="/audit-logs" element={<SecuritySettingsProfileAdminView mode="security" user={user} language={language} onChangeLanguage={handleChangeLanguage} />} />
          <Route path="/settings" element={<SecuritySettingsProfileAdminView mode="settings" user={user} language={language} onChangeLanguage={handleChangeLanguage} />} />
          <Route path="/profile" element={<SecuritySettingsProfileAdminView mode="profile" user={user} language={language} onChangeLanguage={handleChangeLanguage} />} />
          <Route
            path="/admin"
            element={
              <PermissionGate user={user} requiredPermission="*">
                <SecuritySettingsProfileAdminView mode="admin" user={user} language={language} onChangeLanguage={handleChangeLanguage} />
              </PermissionGate>
            }
          />

          <Route path="*" element={<NotFoundView isAuthenticated />} />
        </Routes>
      </AppShell>

      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onNavigate={navigateView}
        onNavigatePath={(path) => navigate(path)}
        darkMode={isDark}
        onToggleTheme={() => setIsDark((d) => !d)}
      />
    </>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <SortSightAppInner />
    </ToastProvider>
  );
}
