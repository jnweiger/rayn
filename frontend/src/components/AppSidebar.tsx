import { Layers, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";

export type AppView = "jobs" | "settings";

interface AppSidebarProps {
  activeView: AppView;
  onViewChange: (view: AppView) => void;
}

export default function AppSidebar({ activeView, onViewChange }: AppSidebarProps) {
  return (
    <aside className="flex h-full w-16 shrink-0 flex-col items-center border-r bg-background px-3 py-4">
      <div className="mb-6 flex size-9 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
        R
      </div>
      <nav className="flex flex-col gap-2">
        <Button
          variant={activeView === "jobs" ? "secondary" : "ghost"}
          size="icon"
          aria-label="Jobs"
          onClick={() => onViewChange("jobs")}
        >
          <Layers className="size-4" />
        </Button>
        <Button
          variant={activeView === "settings" ? "secondary" : "ghost"}
          size="icon"
          aria-label="Settings"
          onClick={() => onViewChange("settings")}
        >
          <Settings className="size-4" />
        </Button>
      </nav>
    </aside>
  );
}
