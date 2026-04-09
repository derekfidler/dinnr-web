import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { LanguageProvider } from "@/lib/i18n";
import { BottomTabs } from "@/components/BottomTabs";
import RecipeLibrary from "@/pages/RecipeLibrary";
import RecipeDetail from "@/pages/RecipeDetail";
import Planner from "@/pages/Planner";
import Groceries from "@/pages/Groceries";
import Auth from "@/pages/Auth";
import Settings from "@/pages/Settings";
import PrivacyPolicy from "@/pages/PrivacyPolicy";
import TermsOfService from "@/pages/TermsOfService";
import NotFound from "@/pages/NotFound";
import { Loader2 } from "lucide-react";
import { initPostHog, trackInstall } from "@/lib/analytics";
import { Sentry } from "@/lib/sentry";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

const AppRoutes = () => (
  <Routes>
    <Route path="/auth" element={<Auth />} />
    <Route path="/privacy" element={<PrivacyPolicy />} />
    <Route path="/terms" element={<TermsOfService />} />
    <Route path="/" element={<ProtectedRoute><RecipeLibrary /></ProtectedRoute>} />
    <Route path="/recipe/:id" element={<ProtectedRoute><RecipeDetail /></ProtectedRoute>} />
    <Route path="/planner" element={<ProtectedRoute><Planner /></ProtectedRoute>} />
    <Route path="/groceries" element={<ProtectedRoute><Groceries /></ProtectedRoute>} />
    <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
    <Route path="*" element={<NotFound />} />
  </Routes>
);

const TITLEBAR_HEIGHT = 28; // px — matches macOS hiddenInset traffic-light area

const App = () => {
  useEffect(() => {
    initPostHog();
    trackInstall();
    if (window.electronAPI?.isElectron) {
      document.documentElement.style.setProperty(
        "--titlebar-area-height",
        `${TITLEBAR_HEIGHT}px`
      );
    }
  }, []);

  return (
    <Sentry.ErrorBoundary
      fallback={
        <div className="flex flex-col items-center justify-center min-h-screen gap-4 px-4 text-center">
          <p className="text-lg font-semibold">Something went wrong</p>
          <p className="text-sm text-muted-foreground">The error has been reported. Try refreshing the page.</p>
          <button
            onClick={() => window.location.reload()}
            className="text-sm text-primary underline"
          >
            Refresh
          </button>
        </div>
      }
      showDialog={false}
    >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <LanguageProvider>
            <Toaster />
            <Sonner />
            <HashRouter>
              <AuthProvider>
                {/* Titlebar drag region — fills the macOS traffic-light area in Electron.
                    Zero-height on web (--titlebar-area-height is 0px). */}
                <div
                  className="fixed top-0 left-0 right-0 z-[9999] pointer-events-none"
                  style={{
                    height: "var(--titlebar-area-height)",
                    // Cast needed — React types don't include vendor prefix
                    WebkitAppRegion: "drag",
                  } as React.CSSProperties}
                />
                <div
                  className="max-w-lg md:max-w-none mx-auto min-h-screen"
                  style={{ paddingTop: "var(--titlebar-area-height)" }}
                >
                  <AppRoutes />
                  <BottomTabs />
                </div>
              </AuthProvider>
            </HashRouter>
          </LanguageProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </Sentry.ErrorBoundary>
  );
};

export default App;
