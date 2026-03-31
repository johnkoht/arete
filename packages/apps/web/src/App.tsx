import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Dashboard from "@/pages/Dashboard";
import MeetingsIndex from "@/pages/MeetingsIndex";
import MeetingDetail from "@/pages/MeetingDetail";
import PeopleIndex from "@/pages/PeopleIndex";
import PersonDetailPage from "@/pages/PersonDetailPage";
import GoalsView from "@/pages/GoalsView";
import MemoryFeed from "@/pages/MemoryFeed";
import IntelligencePage from "@/pages/IntelligencePage";
import CommitmentsPage from "@/pages/CommitmentsPage";
import ReviewPage from "@/pages/ReviewPage";
import SearchPage from "@/pages/SearchPage";
import SettingsPage from "@/pages/SettingsPage";
import TasksPage from "@/pages/TasksPage";
import NotFound from "./pages/NotFound";
import { useProcessingEvents } from "@/hooks/useProcessingEvents.js";

const queryClient = new QueryClient();

/** Inner component so hooks can access QueryClientProvider. */
function AppRoutes() {
  // Subscribe to SSE processing events — invalidates query cache on meeting:processed
  useProcessingEvents();

  return (
    <Routes>
      <Route element={<AppLayout />}>
        {/* Dashboard is the root */}
        <Route path="/" element={<Dashboard />} />
        {/* Meetings moved to /meetings */}
        <Route path="/meetings" element={<MeetingsIndex />} />
        <Route path="/meetings/:slug" element={<MeetingDetail />} />
        {/* New pages */}
        <Route path="/people" element={<PeopleIndex />} />
        <Route path="/people/:slug" element={<PersonDetailPage />} />
        <Route path="/commitments" element={<CommitmentsPage />} />
        <Route path="/tasks" element={<ErrorBoundary><TasksPage /></ErrorBoundary>} />
        <Route path="/review" element={<ReviewPage />} />
        <Route path="/goals" element={<GoalsView />} />
        <Route path="/memory" element={<MemoryFeed />} />
        <Route path="/intelligence" element={<IntelligencePage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
