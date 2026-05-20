import { useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { toast } from "sonner";
import { Check, Clipboard } from "lucide-react";
import {
  DeleteLaser,
  DeleteMaterial,
  ExecuteJob,
  GetLasers,
  GetMaterials,
  SaveLaser,
  SaveMaterial,
  TestConnection,
} from "../wailsjs/go/main/App";
import { main } from "../wailsjs/go/models";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import AppSidebar, { AppView } from "./components/AppSidebar";
import JobView from "./components/JobView";
import SettingsView from "./components/settings/SettingsView";
import { WorkspaceRef } from "./components/Workspace";
import { getMachineDefaults } from "@/lib/laser";
import { estimateJobDuration, JobDurationEstimate, formatJobDuration } from "@/lib/jobEstimate";

export default function App() {
  const [activeView, setActiveView] = useState<AppView>("jobs");
  const workspaceRef = useRef<WorkspaceRef>(null);

  const [lasers, setLasers] = useState<main.Laser[]>([]);
  const [activeLaserId, setActiveLaserId] = useState("");
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [isExecutingJob, setIsExecutingJob] = useState(false);
  const [editingLaserId, setEditingLaserId] = useState<string | null>(null);
  const [editingLaser, setEditingLaser] = useState<Partial<main.Laser>>({});

  const [materials, setMaterials] = useState<main.MaterialProfile[]>([]);
  const [activeMaterialId, setActiveMaterialId] = useState("none");
  const [activeThicknessId, setActiveThicknessId] = useState("none");
  const [selectedMaterialLaserId, setSelectedMaterialLaserId] = useState("");
  const [editingMaterialId, setEditingMaterialId] = useState<string | null>(null);
  const [editingMaterial, setEditingMaterial] = useState<Partial<main.MaterialProfile>>({});

  const [, setSvgColors] = useState<string[]>([]);
  const [jobName, setJobName] = useState("Untitled Job");
  const [estimatedDuration, setEstimatedDuration] = useState<JobDurationEstimate | null>(null);
  const [sendLogOpen, setSendLogOpen] = useState(false);
  const [sendLogTitle, setSendLogTitle] = useState("Send Log");
  const [sendLogLines, setSendLogLines] = useState<string[]>([]);
  const [sendLogSuccess, setSendLogSuccess] = useState<boolean | null>(null);
  const [sendLogCopied, setSendLogCopied] = useState(false);
  const [engraveLineSpacing, setEngraveLineSpacing] = useState(0.1);

  const activeLaser = lasers.find((laser) => laser.id === activeLaserId);
  const availableMaterials = useMemo(
    () => materials.filter((material) => material.laserId === activeLaserId),
    [activeLaserId, materials],
  );
  const activeMaterial = availableMaterials.find((material) => material.id === activeMaterialId);
  const activeThickness = activeMaterial?.thicknesses?.find((thickness) => thickness.id === activeThicknessId);

  const loadMaterials = async () => {
    try {
      setMaterials((await GetMaterials()) || []);
    } catch {
      toast.error("Failed to load materials");
    }
  };

  const loadLasers = async () => {
    try {
      const data = (await GetLasers()) || [];
      setLasers(data);
      if (data.length > 0 && !activeLaserId) {
        setActiveLaserId(data[0].id);
      }
      if (data.length > 0 && !selectedMaterialLaserId) setSelectedMaterialLaserId(data[0].id);
    } catch {
      toast.error("Failed to load lasers");
    }
  };

  useEffect(() => {
    loadLasers();
    loadMaterials();
  }, []);

  useEffect(() => {
    if (activeMaterialId !== "none" && !availableMaterials.some((material) => material.id === activeMaterialId)) {
      setActiveMaterialId("none");
      setActiveThicknessId("none");
      setEstimatedDuration(null);
    }
  }, [activeLaserId, activeMaterialId, availableMaterials]);

  useEffect(() => {
    if (!activeMaterial) return;

    const thicknesses = activeMaterial.thicknesses || [];
    if (thicknesses.length === 0) {
      setActiveThicknessId("none");
      return;
    }

    if (!thicknesses.some((thickness) => thickness.id === activeThicknessId)) {
      setActiveThicknessId(thicknesses[0].id);
      setEstimatedDuration(null);
    }
  }, [activeMaterial, activeThicknessId]);

  const handleNewLaser = () => {
    setEditingLaserId("new");
    setEditingLaser({
      name: "",
      ipAddress: "",
      machineType: "zing",
      port: 9100,
      protocol: "TCP",
      bedWidth: 600,
      bedHeight: 400,
      powerMode: "single",
      imageData: "",
    });
  };

  const handleMachineTypeChange = (machineType: string) => {
    const defaults = getMachineDefaults(machineType);
    setEditingLaser({ ...editingLaser, machineType, protocol: defaults.protocol, port: defaults.port });
  };

  const handleSaveLaser = async () => {
    if (!editingLaser.name || !editingLaser.ipAddress) {
      toast.error("Name and IP Address are required");
      return;
    }

    const defaults = getMachineDefaults(editingLaser.machineType || "zing");

    try {
      await SaveLaser(
        main.Laser.createFrom({
          ...editingLaser,
          id: editingLaserId === "new" ? uuidv4() : editingLaser.id,
          machineType: editingLaser.machineType || "zing",
          protocol: editingLaser.protocol || defaults.protocol,
          port: editingLaser.port || defaults.port,
          powerMode: editingLaser.powerMode || "single",
        }),
      );
      toast.success("Laser saved");
      setEditingLaserId(null);
      loadLasers();
    } catch {
      toast.error("Failed to save laser");
    }
  };

  const handleDeleteLaser = async (id: string) => {
    try {
      await DeleteLaser(id);
      toast.success("Laser deleted");
      if (activeLaserId === id) setActiveLaserId("");
      if (selectedMaterialLaserId === id) setSelectedMaterialLaserId("");
      if (editingLaserId === id) setEditingLaserId(null);
      loadLasers();
    } catch {
      toast.error("Failed to delete laser");
    }
  };

  const handleSaveMaterial = async () => {
    if (!editingMaterial.name) {
      toast.error("Material Name is required");
      return;
    }

    if (!editingMaterial.laserId) {
      toast.error("Select a laser for this material");
      return;
    }

    const defaultOp = { speed: 100, power: 50 };
    const thicknesses =
      editingMaterial.thicknesses && editingMaterial.thicknesses.length > 0
        ? editingMaterial.thicknesses
        : [
            main.MaterialThicknessSettings.createFrom({
              id: uuidv4(),
              thickness: 3,
              cut: editingMaterial.cut || defaultOp,
              engrave: editingMaterial.engrave || defaultOp,
              mark: editingMaterial.mark || defaultOp,
            }),
          ];

    try {
      await SaveMaterial(
        main.MaterialProfile.createFrom({
          ...editingMaterial,
          id: editingMaterialId === "new" ? uuidv4() : editingMaterial.id,
          laserId: editingMaterial.laserId,
          thicknesses,
          cut: thicknesses[0].cut || defaultOp,
          engrave: thicknesses[0].engrave || defaultOp,
          mark: thicknesses[0].mark || defaultOp,
        }),
      );
      toast.success("Material saved");
      setEditingMaterialId(null);
      loadMaterials();
    } catch {
      toast.error("Failed to save material");
    }
  };

  const handleNewMaterial = () => {
    if (!selectedMaterialLaserId) {
      toast.error("Create or select a laser before adding material profiles");
      return;
    }

    setEditingMaterialId("new");
    setEditingMaterial({
      laserId: selectedMaterialLaserId,
      name: "",
      thicknesses: [
        main.MaterialThicknessSettings.createFrom({
          id: uuidv4(),
          thickness: 3,
          cut: main.OperationSettings.createFrom({ speed: 10, power: 100 }),
          engrave: main.OperationSettings.createFrom({ speed: 300, power: 20 }),
          mark: main.OperationSettings.createFrom({ speed: 100, power: 40 }),
        }),
      ],
    });
  };

  const handleDeleteMaterial = async (id: string) => {
    try {
      await DeleteMaterial(id);
      toast.success("Material deleted");
      if (activeMaterialId === id) setActiveMaterialId("none");
      if (editingMaterialId === id) setEditingMaterialId(null);
      loadMaterials();
    } catch {
      toast.error("Failed to delete material");
    }
  };

  const handleTestConnection = async (ip: string, port: number, protocol: string) => {
    if (!ip) {
      toast.error("IP Address is required");
      return;
    }

    setIsTestingConnection(true);
    const id = toast.loading("Testing connection...");
    try {
      const ok = await TestConnection(ip, port, protocol);
      ok ? toast.success("Connected", { id }) : toast.error("Connection failed", { id });
    } catch (error: any) {
      toast.error(`Failed: ${error.message || error}`, { id });
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleStartJob = async () => {
    if (!activeLaser || !activeMaterial || !activeThickness) return;
    const cleanJobName = jobName.trim();
    if (!cleanJobName) {
      toast.error("Job name is required");
      return;
    }

    if (!workspaceRef.current?.hasObjects()) {
      toast.error("Import an SVG before starting a job");
      return;
    }

    const svgData = workspaceRef.current.getJobSVG();
    if (!svgData) {
      toast.error("Could not export the workspace SVG");
      return;
    }

    const machineType = activeLaser.machineType || (activeLaser.protocol === "UDP" ? "ruida" : "zing");
    const materialForJob = main.MaterialProfile.createFrom({
      ...activeMaterial,
      cut: activeThickness.cut,
      engrave: activeThickness.engrave,
      mark: activeThickness.mark,
    });
    const id = toast.loading(`Sending "${cleanJobName}" to laser...`);
    setIsExecutingJob(true);
    setSendLogTitle(`Sending "${cleanJobName}"`);
    setSendLogLines(["Starting job send..."]);
    setSendLogSuccess(null);
    setSendLogOpen(true);
    try {
      const result = await ExecuteJob(
        machineType,
        activeLaser.ipAddress,
        activeLaser.port,
        cleanJobName,
        svgData,
        materialForJob,
        main.JobOptions.createFrom({ engraveLineSpacingMm: engraveLineSpacing }),
      );
      setSendLogLines(result.logs || []);
      setSendLogSuccess(result.success);
      setSendLogTitle(result.success ? `"${cleanJobName}" transfer acknowledged` : `"${cleanJobName}" failed`);
      result.success
        ? toast.success(`"${cleanJobName}" transfer acknowledged`, { id })
        : toast.error(`Job failed: ${result.message}`, { id });
    } catch (error: any) {
      setSendLogLines((lines) => [...lines, `Frontend/Wails error: ${error.message || error}`]);
      setSendLogSuccess(false);
      setSendLogTitle(`"${cleanJobName}" failed`);
      toast.error(`Job failed: ${error.message || error}`, { id });
    } finally {
      setIsExecutingJob(false);
    }
  };

  const handleEstimateDuration = () => {
    if (!activeMaterial || !activeThickness) {
      toast.error("Select a material and thickness before calculating duration");
      return;
    }

    if (!workspaceRef.current?.hasObjects()) {
      toast.error("Import an SVG before calculating duration");
      return;
    }

    const svgData = workspaceRef.current.getJobSVG();
    if (!svgData) {
      toast.error("Could not read the workspace SVG");
      return;
    }

    const estimate = estimateJobDuration(svgData, activeThickness);
    if (estimate.geometryCount === 0 || estimate.totalSeconds <= 0) {
      toast.error("No measurable vector geometry found");
      setEstimatedDuration(null);
      return;
    }

    setEstimatedDuration(estimate);
    toast.success(`Estimated duration: ${formatJobDuration(estimate.totalSeconds)}`);
  };

  const handleCopySendLog = async () => {
    const logText = sendLogLines.join("\n");
    if (!logText) return;

    try {
      await navigator.clipboard.writeText(logText);
      setSendLogCopied(true);
      toast.success("Send log copied");
      window.setTimeout(() => setSendLogCopied(false), 1600);
    } catch {
      toast.error("Could not copy send log");
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <Toaster position="bottom-right" />
      <Dialog open={sendLogOpen} onOpenChange={setSendLogOpen}>
        <DialogContent className="max-h-[82vh] max-w-3xl gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle>{sendLogTitle}</DialogTitle>
            <DialogDescription>
              {sendLogSuccess === null
                ? "Rayn is sending the job."
                : sendLogSuccess
                  ? "The controller acknowledged the packets. The log shows whether the upload reached the protocol layer."
                  : "The transfer failed or the controller rejected part of the job."}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[56vh] overflow-auto bg-muted/30 p-4">
            <pre className="whitespace-pre-wrap rounded-lg border bg-background p-4 font-mono text-xs leading-5 text-foreground">
              {sendLogLines.length > 0 ? sendLogLines.join("\n") : "No log entries yet."}
            </pre>
          </div>
          <DialogFooter className="mx-0 mb-0 rounded-none">
            <Button variant="outline" onClick={handleCopySendLog} disabled={sendLogLines.length === 0}>
              {sendLogCopied ? <Check className="mr-2 size-4" /> : <Clipboard className="mr-2 size-4" />}
              {sendLogCopied ? "Copied" : "Copy Log"}
            </Button>
            <Button variant="outline" onClick={() => setSendLogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AppSidebar activeView={activeView} onViewChange={setActiveView} />
      <div className="min-w-0 flex-1">
        <div className={activeView === "jobs" ? "flex h-full min-w-0" : "hidden"}>
          <JobView
            workspaceRef={workspaceRef}
            lasers={lasers}
            materials={availableMaterials}
            activeLaser={activeLaser}
            activeMaterial={activeMaterial}
            activeThicknessId={activeThicknessId}
            activeThickness={activeThickness}
            activeLaserId={activeLaserId}
            activeMaterialId={activeMaterialId}
            jobName={jobName}
            engraveLineSpacing={engraveLineSpacing}
            estimatedDuration={estimatedDuration}
            isExecutingJob={isExecutingJob}
            onColorsDetected={setSvgColors}
            onActiveLaserChange={(id) => {
              if (!id) return;
              setActiveLaserId(id);
              setActiveMaterialId("none");
              setActiveThicknessId("none");
              setEstimatedDuration(null);
            }}
            onActiveMaterialChange={(id) => {
              if (!id) return;
              setActiveMaterialId(id);
              setActiveThicknessId("none");
              setEstimatedDuration(null);
            }}
            onJobNameChange={setJobName}
            onEngraveLineSpacingChange={setEngraveLineSpacing}
            onActiveThicknessChange={(id) => {
              setActiveThicknessId(id);
              setEstimatedDuration(null);
            }}
            onEstimateDuration={handleEstimateDuration}
            onStartJob={handleStartJob}
          />
        </div>
        <div className={activeView === "settings" ? "flex h-full min-w-0" : "hidden"}>
          <SettingsView
            lasers={lasers}
            materials={materials}
            selectedMaterialLaserId={selectedMaterialLaserId}
            editingLaserId={editingLaserId}
            editingLaser={editingLaser}
            editingMaterialId={editingMaterialId}
            editingMaterial={editingMaterial}
            isTestingConnection={isTestingConnection}
            onNewLaser={handleNewLaser}
            onEditLaser={(laser) => {
              setEditingLaserId(laser.id);
              setEditingLaser(laser);
            }}
            onEditingLaserChange={setEditingLaser}
            onMachineTypeChange={handleMachineTypeChange}
            onCancelEdit={() => setEditingLaserId(null)}
            onSaveLaser={handleSaveLaser}
            onDeleteLaser={handleDeleteLaser}
            onTestConnection={handleTestConnection}
            onNewMaterial={handleNewMaterial}
            onSelectedMaterialLaserChange={(id) => {
              setSelectedMaterialLaserId(id);
              setEditingMaterialId(null);
            }}
            onEditMaterial={(material) => {
              setEditingMaterialId(material.id);
              setEditingMaterial({ ...material, laserId: material.laserId || selectedMaterialLaserId });
            }}
            onEditingMaterialChange={setEditingMaterial}
            onCancelMaterialEdit={() => setEditingMaterialId(null)}
            onSaveMaterial={handleSaveMaterial}
            onDeleteMaterial={handleDeleteMaterial}
          />
        </div>
      </div>
    </div>
  );
}
