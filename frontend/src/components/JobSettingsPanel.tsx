import { useState } from "react";
import { Calculator, Clock3, Play, SlidersHorizontal } from "lucide-react";
import { main } from "../../wailsjs/go/models";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import LaserAvatar from "./LaserAvatar";
import { getMachineLabel } from "@/lib/laser";
import { formatJobDuration, JobDurationEstimate } from "@/lib/jobEstimate";

interface JobSettingsPanelProps {
  lasers: main.Laser[];
  materials: main.MaterialProfile[];
  activeLaser?: main.Laser;
  activeLaserId: string;
  activeMaterialId: string;
  activeThicknessId: string;
  activeMaterial?: main.MaterialProfile;
  activeThickness?: main.MaterialThicknessSettings;
  jobName: string;
  engraveLineSpacing: number;
  estimatedDuration?: JobDurationEstimate | null;
  isExecutingJob: boolean;
  onActiveLaserChange: (id: string) => void;
  onActiveMaterialChange: (id: string) => void;
  onActiveThicknessChange: (id: string) => void;
  onJobNameChange: (name: string) => void;
  onEngraveLineSpacingChange: (spacing: number) => void;
  onEstimateDuration: () => void;
  onStartJob: () => void;
}

function OperationRow({
  color,
  label,
  speed,
  power,
  muted,
}: {
  color: string;
  label: string;
  speed?: number;
  power?: number;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border bg-background px-3 py-2">
      <div className="flex items-center gap-3">
        <span className="size-3 rounded-sm border" style={{ backgroundColor: color }} />
        <span className={muted ? "text-sm text-muted-foreground" : "text-sm font-medium"}>{label}</span>
      </div>
      {speed === undefined ? (
        <span className="text-xs text-muted-foreground">Ignored</span>
      ) : (
        <span className="font-mono text-xs text-muted-foreground">
          S {speed} / P {power}%
        </span>
      )}
    </div>
  );
}

function LaserSelectRow({ laser, compact = false }: { laser: main.Laser; compact?: boolean }) {
  return (
    <span className={`flex min-w-0 items-center ${compact ? "gap-3" : "gap-3.5"}`}>
      <LaserAvatar laser={laser} size={compact ? "md" : "lg"} />
      <span className="flex min-w-0 flex-col text-left">
        <span className="truncate text-sm font-medium leading-5">{laser.name}</span>
        <span className="truncate font-mono text-xs text-muted-foreground">
          {getMachineLabel(laser.machineType)} · {laser.ipAddress}:{laser.port}
        </span>
      </span>
    </span>
  );
}

export default function JobSettingsPanel({
  lasers,
  materials,
  activeLaser,
  activeLaserId,
  activeMaterialId,
  activeThicknessId,
  activeMaterial,
  activeThickness,
  jobName,
  engraveLineSpacing,
  estimatedDuration,
  isExecutingJob,
  onActiveLaserChange,
  onActiveMaterialChange,
  onActiveThicknessChange,
  onJobNameChange,
  onEngraveLineSpacingChange,
  onEstimateDuration,
  onStartJob,
}: JobSettingsPanelProps) {
  const canPrepareJob = activeLaserId !== "" && activeMaterialId !== "none" && activeThicknessId !== "none";
  const [advancedOpen, setAdvancedOpen] = useState(false);

  return (
    <aside className="flex h-full w-96 shrink-0 flex-col border-l bg-background">
      <Dialog open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Advanced Job Options</DialogTitle>
            <DialogDescription>Fine-tune generation settings for this job.</DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="engrave-line-spacing">Scanline Spacing</Label>
            <div className="relative">
              <Input
                id="engrave-line-spacing"
                type="number"
                min="0.02"
                max="2"
                step="0.01"
                value={engraveLineSpacing}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  if (Number.isFinite(value)) onEngraveLineSpacingChange(value);
                }}
                className="pr-12"
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
                mm
              </span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAdvancedOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex h-16 items-center gap-3 border-b px-6">
        <SlidersHorizontal className="size-4 text-muted-foreground" />
        <div>
          <h2 className="text-sm font-semibold">Job Settings</h2>
          <p className="text-xs text-muted-foreground">Laser, material and output settings</p>
        </div>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        <div className="space-y-2">
          <Label htmlFor="job-name">Job Name</Label>
          <Input
            id="job-name"
            value={jobName}
            onChange={(event) => onJobNameChange(event.target.value)}
            placeholder="e.g. Acrylic sign"
          />
        </div>

        <div className="space-y-2">
          <Label>Target Laser</Label>
          <Select value={activeLaserId} onValueChange={(value) => value && onActiveLaserChange(value)}>
            <SelectTrigger className="!h-16 w-full px-3 py-2">
              {activeLaser ? (
                <LaserSelectRow laser={activeLaser} />
              ) : (
                <span className="text-muted-foreground">Select a laser</span>
              )}
            </SelectTrigger>
            <SelectContent>
              {lasers.map((laser) => (
                <SelectItem key={laser.id} value={laser.id} className="py-2">
                  <LaserSelectRow laser={laser} compact />
                </SelectItem>
              ))}
              {lasers.length === 0 && (
                <SelectItem value="none" disabled>
                  No lasers configured
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Material Profile</Label>
          <Select value={activeMaterialId} onValueChange={(value) => value && onActiveMaterialChange(value)}>
            <SelectTrigger className="w-full">
              {activeMaterial ? (
                <span className="truncate">{activeMaterial.name}</span>
              ) : (
                <span className="text-muted-foreground">No Material Selected</span>
              )}
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No Material Selected</SelectItem>
              {materials.map((material) => (
                <SelectItem key={material.id} value={material.id}>
                  {material.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Material Thickness</Label>
          <Select
            value={activeThicknessId}
            onValueChange={(value) => value && onActiveThicknessChange(value)}
            disabled={!activeMaterial}
          >
            <SelectTrigger className="w-full">
              {activeThickness ? (
                <span className="truncate">{activeThickness.thickness} mm</span>
              ) : (
                <span className="text-muted-foreground">No Thickness Selected</span>
              )}
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No Thickness Selected</SelectItem>
              {(activeMaterial?.thicknesses || []).map((thickness) => (
                <SelectItem key={thickness.id} value={thickness.id}>
                  {thickness.thickness} mm
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Separator />

        <div className="space-y-3">
          <Label>Operation Legend</Label>
          {activeThickness ? (
            <div className="space-y-2">
              <OperationRow color="#ef4444" label="Cut" speed={activeThickness.cut.speed} power={activeThickness.cut.power} />
              <OperationRow color="#111827" label="Engrave" speed={activeThickness.engrave.speed} power={activeThickness.engrave.power} />
              <OperationRow color="#22c55e" label="Mark" speed={activeThickness.mark.speed} power={activeThickness.mark.power} />
              <OperationRow color="#2563eb" label="Ignore" muted />
            </div>
          ) : (
            <div className="rounded-lg border border-dashed bg-muted/30 px-3 py-6 text-center text-sm text-muted-foreground">
              Select a material and thickness to view operations.
            </div>
          )}
        </div>

        <Separator />

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Advanced</Label>
            <span className="font-mono text-xs text-muted-foreground">{engraveLineSpacing.toFixed(2)} mm</span>
          </div>
          <Button type="button" variant="outline" className="w-full justify-start" onClick={() => setAdvancedOpen(true)}>
            <SlidersHorizontal className="mr-2 size-4" />
            Advanced Options
          </Button>
        </div>

        <Separator />

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Estimated Duration</Label>
            {estimatedDuration && (
              <span className="font-mono text-xs text-muted-foreground">
                {estimatedDuration.geometryCount} vector{estimatedDuration.geometryCount === 1 ? "" : "s"}
              </span>
            )}
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full justify-start"
            disabled={!canPrepareJob}
            onClick={onEstimateDuration}
          >
            <Calculator className="mr-2 size-4" />
            Calculate Duration
          </Button>

          {estimatedDuration ? (
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Clock3 className="size-4 text-muted-foreground" />
                  Total
                </div>
                <span className="font-mono text-sm font-semibold">
                  {formatJobDuration(estimatedDuration.totalSeconds)}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs text-muted-foreground">
                <div className="rounded-md bg-background px-2 py-1.5">
                  <div>Cut</div>
                  <div className="font-mono text-foreground">{formatJobDuration(estimatedDuration.cutSeconds)}</div>
                </div>
                <div className="rounded-md bg-background px-2 py-1.5">
                  <div>Engrave</div>
                  <div className="font-mono text-foreground">{formatJobDuration(estimatedDuration.engraveSeconds)}</div>
                </div>
                <div className="rounded-md bg-background px-2 py-1.5">
                  <div>Mark</div>
                  <div className="font-mono text-foreground">{formatJobDuration(estimatedDuration.markSeconds)}</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed bg-muted/30 px-3 py-4 text-center text-sm text-muted-foreground">
              Calculate once the artwork and material are ready.
            </div>
          )}
        </div>
      </div>

      <div className="border-t p-4">
        <Button
          className="w-full"
          size="lg"
          disabled={!canPrepareJob || jobName.trim() === "" || isExecutingJob}
          onClick={onStartJob}
        >
          <Play className="mr-2 size-4" />
          {isExecutingJob ? "Sending..." : "Start Job"}
        </Button>
      </div>
    </aside>
  );
}
