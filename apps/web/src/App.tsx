import { Suspense, lazy, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { AppShell } from "@/components/app-shell";
import { bootstrapSession } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";
import { ApiKeysPage } from "@/pages/ApiKeysPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { ForgotPasswordPage } from "@/pages/ForgotPasswordPage";
import { LoginPage } from "@/pages/LoginPage";
import { RegisterPage } from "@/pages/RegisterPage";
import { ResetPasswordPage } from "@/pages/ResetPasswordPage";
import { VerifyEmailPage } from "@/pages/VerifyEmailPage";

// Recharts is only needed on the analytics screen; load it on demand.
const AnalyticsPage = lazy(() =>
  import("@/pages/AnalyticsPage").then((module) => ({ default: module.AnalyticsPage })),
);

function FullPageSpinner() {
  return (
    <div className="grid min-h-svh place-items-center py-24">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function ProtectedLayout() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === "loading") {
    return <FullPageSpinner />;
  }
  if (status === "anonymous") {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

function PublicOnly({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();

  if (status === "loading") {
    return <FullPageSpinner />;
  }
  if (status === "authenticated") {
    return <Navigate to="/" replace />;
  }
  return children;
}

export default function App() {
  useEffect(() => {
    void bootstrapSession();
  }, []);

  return (
    <Suspense fallback={<FullPageSpinner />}>
      <Routes>
        <Route
          path="/login"
          element={
            <PublicOnly>
              <LoginPage />
            </PublicOnly>
          }
        />
        <Route
          path="/register"
          element={
            <PublicOnly>
              <RegisterPage />
            </PublicOnly>
          }
        />
        {/* Reachable while signed in too: the links come from emails. */}
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route element={<ProtectedLayout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/keys" element={<ApiKeysPage />} />
          <Route path="/links/:shortCode" element={<AnalyticsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
