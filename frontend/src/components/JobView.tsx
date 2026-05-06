import { RefObject } from "react";
import { main } from "../../wailsjs/go/models";
import { Badge } from "@/components/ui/badge";
import Workspace, { WorkspaceRef } from "./Workspace";
import JobSettingsPanel from "./JobSettingsPanel";
import { JobDurationEstimate } from "@/lib/jobEstimate";

interface JobViewProps {
  workspaceRef: RefObject<WorkspaceRef>;
  lasers: main.Laser[];
  materials: main.MaterialProfile[];
  activeLaser?: main.Laser;
  activeMaterial?: main.MaterialProfile;
  activeThickness?: main.MaterialThicknessSettings;
  activeLaserId: string;
  activeMaterialId: string;
  activeThicknessId: string;
  jobName: string;
  estimatedDuration?: JobDurationEstimate | null;
  isExecutingJob: boolean;
  onColorsDetected: (colors: string[]) => void;
  onActiveLaserChange: (id: string) => void;
  onActiveMaterialChange: (id: string) => void;
  onActiveThicknessChange: (id: string) => void;
  onJobNameChange: (name: string) => void;
  onEstimateDuration: () => void;
  onStartJob: () => void;
}

export default function JobView({
  workspaceRef,
  lasers,
  materials,
  activeLaser,
  activeMaterial,
  activeThickness,
  activeLaserId,
  activeMaterialId,
  activeThicknessId,
  jobName,
  estimatedDuration,
  isExecutingJob,
  onColorsDetected,
  onActiveLaserChange,
  onActiveMaterialChange,
  onActiveThicknessChange,
  onJobNameChange,
  onEstimateDuration,
  onStartJob,
}: JobViewProps) {
  return (
    <main className="flex min-w-0 flex-1">
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b bg-background px-6">
          <div>
            <h1 className="text-base font-semibold">Workspace</h1>
            <p className="text-sm text-muted-foreground">Prepare and position SVG jobs.</p>
          </div>
          {activeLaser && (
            <div className="flex items-center gap-2">
              <Badge variant="outline">{activeLaser.name}</Badge>
              <Badge variant="secondary">
                {activeLaser.bedWidth} x {activeLaser.bedHeight} mm
              </Badge>
            </div>
          )}
        </header>
        <Workspace ref={workspaceRef} activeLaser={activeLaser} onColorsDetected={onColorsDetected} />
      </section>

      <JobSettingsPanel
        lasers={lasers}
        materials={materials}
        activeLaser={activeLaser}
        activeLaserId={activeLaserId}
        activeMaterialId={activeMaterialId}
        activeMaterial={activeMaterial}
        activeThicknessId={activeThicknessId}
        activeThickness={activeThickness}
        jobName={jobName}
        estimatedDuration={estimatedDuration}
        isExecutingJob={isExecutingJob}
        onActiveLaserChange={onActiveLaserChange}
        onActiveMaterialChange={onActiveMaterialChange}
        onActiveThicknessChange={onActiveThicknessChange}
        onJobNameChange={onJobNameChange}
        onEstimateDuration={onEstimateDuration}
        onStartJob={onStartJob}
      />
    </main>
  );
}
