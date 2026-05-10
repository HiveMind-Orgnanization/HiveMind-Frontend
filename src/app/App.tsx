import { BrowserRouter, Routes, Route } from "react-router";
import { Toaster } from "sonner";
import { WalletProviders } from "./providers/WalletProviders";
import { NotificationsProvider } from "./contexts/NotificationsContext";
import { CommandPaletteProvider, useCommandPalette } from "./contexts/CommandPaletteContext";
import { CommandPalette } from "./components/CommandPalette";
import Landing from "./Landing";
import Dashboard from "./Dashboard";
import MissionCreate from "./MissionCreate";
import MissionDetail from "./MissionDetail";
import AgentWorkspace from "./AgentWorkspace";
import Marketplace from "./Marketplace";
import AgentDetail from "./AgentDetail";
import Treasury from "./Treasury";
import Reputation from "./Reputation";
import MemoryExplorer from "./MemoryExplorer";
import Analytics from "./Analytics";
import LiveConsole from "./LiveConsole";
import TeamWorkspace from "./TeamWorkspace";
import Settings from "./Settings";
import Notifications from "./Notifications";
import TrialPage from "./TrialPage";
import { StubPage } from "./components/dashboard/stub-page";
import { useAutoRegisterTrial } from "./hooks/useAutoRegisterTrial";

function WalletEffects() {
  useAutoRegisterTrial();
  return null;
}

function AppRoutes() {
  const { open, closePalette } = useCommandPalette();
  return (
    <>
      <CommandPalette open={open} onClose={closePalette} />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/missions/new" element={<MissionCreate />} />
        <Route path="/missions/:id" element={<MissionDetail />} />
        <Route path="/agents" element={<AgentWorkspace />} />
        <Route path="/treasury" element={<Treasury />} />
        <Route path="/reputation" element={<Reputation />} />
        <Route path="/memory" element={<MemoryExplorer />} />
        <Route path="/marketplace" element={<Marketplace />} />
        <Route path="/marketplace/:id" element={<AgentDetail />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/console" element={<LiveConsole />} />
        <Route path="/team" element={<TeamWorkspace />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/trial" element={<TrialPage />} />
        <Route
          path="*"
          element={
            <StubPage
              title="Page Not Found"
              subtitle="The route you tried doesn't exist yet."
              crumbs={[{ label: "404" }]}
            />
          }
        />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <WalletProviders>
      <Toaster richColors theme="dark" position="top-center" />
      <WalletEffects />
      <BrowserRouter>
        <CommandPaletteProvider>
          <NotificationsProvider>
            <AppRoutes />
          </NotificationsProvider>
        </CommandPaletteProvider>
      </BrowserRouter>
    </WalletProviders>
  );
}
