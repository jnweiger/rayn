import { Box, Layers } from "lucide-react";
import { useState } from "react";
import { main } from "../../../wailsjs/go/models";
import LaserSettingsPage from "./LaserSettingsPage";
import MaterialSettingsPage from "./MaterialSettingsPage";

interface SettingsViewProps {
  lasers: main.Laser[];
  materials: main.MaterialProfile[];
  selectedMaterialLaserId: string;
  editingLaserId: string | null;
  editingLaser: Partial<main.Laser>;
  editingMaterialId: string | null;
  editingMaterial: Partial<main.MaterialProfile>;
  isTestingConnection: boolean;
  onNewLaser: () => void;
  onEditLaser: (laser: main.Laser) => void;
  onEditingLaserChange: (laser: Partial<main.Laser>) => void;
  onMachineTypeChange: (machineType: string) => void;
  onCancelEdit: () => void;
  onSaveLaser: () => void;
  onDeleteLaser: (id: string) => void;
  onTestConnection: (ip: string, port: number, protocol: string) => void;
  onSelectedMaterialLaserChange: (id: string) => void;
  onNewMaterial: () => void;
  onEditMaterial: (material: main.MaterialProfile) => void;
  onEditingMaterialChange: (material: Partial<main.MaterialProfile>) => void;
  onCancelMaterialEdit: () => void;
  onSaveMaterial: () => void;
  onDeleteMaterial: (id: string) => void;
}

export default function SettingsView(props: SettingsViewProps) {
  const [activeTab, setActiveTab] = useState<"lasers" | "materials">("lasers");

  return (
    <main className="flex min-w-0 flex-1 bg-muted/30">
      <aside className="w-64 shrink-0 border-r bg-background">
        <div className="border-b px-6 py-5">
          <h2 className="text-base font-semibold">Settings</h2>
          <p className="text-sm text-muted-foreground">Application setup</p>
        </div>
        <nav className="space-y-1 p-3">
          <button
            className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${
              activeTab === "lasers" ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
            onClick={() => setActiveTab("lasers")}
          >
            <Box className="size-4" />
            Lasers
          </button>
          <button
            className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${
              activeTab === "materials" ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
            onClick={() => setActiveTab("materials")}
          >
            <Layers className="size-4" />
            Materials
          </button>
        </nav>
      </aside>
      <section className="min-w-0 flex-1 overflow-y-auto">
        {activeTab === "lasers" ? (
          <LaserSettingsPage {...props} />
        ) : (
          <MaterialSettingsPage
            lasers={props.lasers}
            materials={props.materials}
            selectedLaserId={props.selectedMaterialLaserId}
            editingMaterialId={props.editingMaterialId}
            editingMaterial={props.editingMaterial}
            onSelectedLaserChange={props.onSelectedMaterialLaserChange}
            onNewMaterial={props.onNewMaterial}
            onEditMaterial={props.onEditMaterial}
            onEditingMaterialChange={props.onEditingMaterialChange}
            onCancelEdit={props.onCancelMaterialEdit}
            onSaveMaterial={props.onSaveMaterial}
            onDeleteMaterial={props.onDeleteMaterial}
          />
        )}
      </section>
    </main>
  );
}
