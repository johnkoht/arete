import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import Dashboard from "@/pages/Dashboard";
import MeetingsIndex from "@/pages/MeetingsIndex";
import MeetingDetail from "@/pages/MeetingDetail";
import PeopleIndex from "@/pages/PeopleIndex";
import GoalsView from "@/pages/GoalsView";
import MemoryFeed from "@/pages/MemoryFeed";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            {/* Dashboard is the root */}
            <Route path="/" element={<Dashboard />} />
            {/* Meetings moved to /meetings */}
            <Route path="/meetings" element={<MeetingsIndex />} />
            <Route path="/meetings/:slug" element={<MeetingDetail />} />
            {/* New pages */}
            <Route path="/people" element={<PeopleIndex />} />
            <Route path="/goals" element={<GoalsView />} />
            <Route path="/memory" element={<MemoryFeed />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
