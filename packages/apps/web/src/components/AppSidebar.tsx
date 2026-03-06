import {
  LayoutDashboard,
  Calendar,
  Users,
  Target,
  Brain,
  Settings,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/", enabled: true },
  { icon: Calendar, label: "Meetings", path: "/meetings", enabled: true },
  { icon: Users, label: "People", path: "/people", enabled: true },
  { icon: Target, label: "Goals", path: "/goals", enabled: true },
  { icon: Brain, label: "Memory", path: "/memory", enabled: true },
];

export function AppSidebar() {
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  return (
    <aside className="flex h-screen w-14 flex-col items-center border-r-0 bg-sidebar py-4 flex-shrink-0">
      {/* Logo */}
      <Link to="/" className="mb-6 text-xs font-bold tracking-wider text-sidebar-primary">
        Aβ
      </Link>

      {/* Nav icons */}
      <nav className="flex flex-1 flex-col items-center gap-1">
        {navItems.map((item) => {
          const active = item.enabled && isActive(item.path);
          return (
            <Tooltip key={item.label} delayDuration={0}>
              <TooltipTrigger asChild>
                {item.enabled ? (
                  <Link
                    to={item.path}
                    className={`flex h-10 w-10 items-center justify-center rounded-md transition-colors ${
                      active
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    }`}
                  >
                    <item.icon className="h-[18px] w-[18px]" />
                  </Link>
                ) : (
                  <div className="flex h-10 w-10 cursor-not-allowed items-center justify-center text-sidebar-foreground/40">
                    <item.icon className="h-[18px] w-[18px]" />
                  </div>
                )}
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">
                {item.label}
                {!item.enabled && " (coming soon)"}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </nav>

      {/* Settings */}
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <button className="flex h-10 w-10 items-center justify-center rounded-md text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors">
            <Settings className="h-[18px] w-[18px]" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" className="text-xs">
          Settings
        </TooltipContent>
      </Tooltip>
    </aside>
  );
}
