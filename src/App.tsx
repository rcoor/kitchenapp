import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/features/auth/AuthProvider";
import { LoginPage } from "@/features/auth/LoginPage";
import { FullPageSpinner } from "@/components/ui/spinner";
import { AppShell } from "@/components/AppShell";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { MarketsPage } from "@/features/markets/MarketsPage";
import { RecommendationsPage } from "@/features/recommendations/RecommendationsPage";
import { SourcesPage } from "@/features/sources/SourcesPage";
import { HistoryPage } from "@/features/history/HistoryPage";
import { SettingsPage } from "@/features/settings/SettingsPage";

export function App() {
  const { session, loading } = useAuth();

  if (loading) return <FullPageSpinner />;
  if (!session) return <LoginPage />;

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="markets" element={<MarketsPage />} />
        <Route path="recommendations" element={<RecommendationsPage />} />
        <Route path="sources" element={<SourcesPage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
