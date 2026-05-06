import { Plus, Trash2 } from "lucide-react";
import { main } from "../../../wailsjs/go/models";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import LaserAvatar from "../LaserAvatar";
import { getMachineLabel } from "@/lib/laser";

interface MaterialSettingsPageProps {
  lasers: main.Laser[];
  materials: main.MaterialProfile[];
  selectedLaserId: string;
  editingMaterialId: string | null;
  editingMaterial: Partial<main.MaterialProfile>;
  onSelectedLaserChange: (id: string) => void;
  onNewMaterial: () => void;
  onEditMaterial: (material: main.MaterialProfile) => void;
  onEditingMaterialChange: (material: Partial<main.MaterialProfile>) => void;
  onCancelEdit: () => void;
  onSaveMaterial: () => void;
  onDeleteMaterial: (id: string) => void;
}

function OperationFields({
  title,
  color,
  op,
  onChange,
}: {
  title: string;
  color: string;
  op: { speed: number; power: number } | undefined;
  onChange: (field: "speed" | "power", value: number) => void;
}) {
  return (
    <div className="space-y-3 rounded-lg border bg-background p-4">
      <div className="flex items-center gap-2">
        <span className="size-3 rounded-sm border" style={{ backgroundColor: color }} />
        <span className="text-sm font-medium">{title}</span>
        <Badge variant="secondary" className="ml-auto">
          {title}
        </Badge>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Speed</Label>
          <Input
            type="number"
            value={op?.speed || 0}
            onChange={(event) => onChange("speed", parseInt(event.target.value) || 0)}
          />
        </div>
        <div className="space-y-2">
          <Label>Power</Label>
          <Input
            type="number"
            value={op?.power || 0}
            onChange={(event) => onChange("power", parseInt(event.target.value) || 0)}
          />
        </div>
      </div>
    </div>
  );
}

export default function MaterialSettingsPage({
  lasers,
  materials,
  selectedLaserId,
  editingMaterialId,
  editingMaterial,
  onSelectedLaserChange,
  onNewMaterial,
  onEditMaterial,
  onEditingMaterialChange,
  onCancelEdit,
  onSaveMaterial,
  onDeleteMaterial,
}: MaterialSettingsPageProps) {
  const unassignedMaterials = materials.filter((material) => !material.laserId);
  const visibleMaterials = materials.filter((material) => material.laserId === selectedLaserId);
  const selectedLaser = lasers.find((laser) => laser.id === selectedLaserId);
  const editingThicknesses = editingMaterial.thicknesses || [];

  const updateThickness = (id: string, patch: Partial<main.MaterialThicknessSettings>) => {
    onEditingMaterialChange({
      ...editingMaterial,
      thicknesses: editingThicknesses.map((thickness) =>
        thickness.id === id ? main.MaterialThicknessSettings.createFrom({ ...thickness, ...patch }) : thickness,
      ),
    });
  };

  const updateThicknessOperation = (
    id: string,
    operation: "cut" | "engrave" | "mark",
    field: "speed" | "power",
    value: number,
  ) => {
    onEditingMaterialChange({
      ...editingMaterial,
      thicknesses: editingThicknesses.map((thickness) =>
        thickness.id === id
          ? main.MaterialThicknessSettings.createFrom({
              ...thickness,
              [operation]: main.OperationSettings.createFrom({
                ...thickness[operation],
                [field]: value,
              }),
            })
          : thickness,
      ),
    });
  };

  const addThickness = () => {
    const lastThickness = editingThicknesses[editingThicknesses.length - 1];
    const nextThickness = main.MaterialThicknessSettings.createFrom({
      id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2),
      thickness: lastThickness ? lastThickness.thickness + 1 : 3,
      cut: lastThickness?.cut || main.OperationSettings.createFrom({ speed: 10, power: 100 }),
      engrave: lastThickness?.engrave || main.OperationSettings.createFrom({ speed: 300, power: 20 }),
      mark: lastThickness?.mark || main.OperationSettings.createFrom({ speed: 100, power: 40 }),
    });

    onEditingMaterialChange({
      ...editingMaterial,
      thicknesses: [...editingThicknesses, nextThickness],
    });
  };

  const deleteThickness = (id: string) => {
    if (editingThicknesses.length <= 1) return;
    onEditingMaterialChange({
      ...editingMaterial,
      thicknesses: editingThicknesses.filter((thickness) => thickness.id !== id),
    });
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Material Profiles</h1>
          <p className="text-sm text-muted-foreground">Manage material parameters per laser cutter.</p>
        </div>
        <Button onClick={onNewMaterial} disabled={!selectedLaserId}>
          <Plus className="mr-2 size-4" />
          Add Material
        </Button>
      </div>

      <div className="rounded-lg border bg-background p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_1.4fr] md:items-center">
          <div>
            <Label>Laser Context</Label>
            <p className="mt-1 text-sm text-muted-foreground">Profiles in this view are tuned for the selected machine.</p>
          </div>
          <Select value={selectedLaserId} onValueChange={(laserId) => laserId && onSelectedLaserChange(laserId)}>
            <SelectTrigger className="!h-14 w-full px-3">
              {selectedLaser ? (
                <span className="flex min-w-0 items-center gap-3">
                  <LaserAvatar laser={selectedLaser} size="md" />
                  <span className="flex min-w-0 flex-col text-left">
                    <span className="truncate text-sm font-medium">{selectedLaser.name}</span>
                    <span className="truncate font-mono text-xs text-muted-foreground">
                      {getMachineLabel(selectedLaser.machineType)} · {selectedLaser.ipAddress}:{selectedLaser.port}
                    </span>
                  </span>
                </span>
              ) : (
                <span className="text-muted-foreground">Select a laser</span>
              )}
            </SelectTrigger>
            <SelectContent>
              {lasers.map((laser) => (
                <SelectItem key={laser.id} value={laser.id} className="py-2">
                  <span className="flex items-center gap-3">
                    <LaserAvatar laser={laser} size="md" />
                    <span className="flex min-w-0 flex-col text-left">
                      <span className="truncate text-sm font-medium">{laser.name}</span>
                      <span className="truncate font-mono text-xs text-muted-foreground">
                        {getMachineLabel(laser.machineType)} · {laser.ipAddress}:{laser.port}
                      </span>
                    </span>
                  </span>
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
      </div>

      {editingMaterialId && (
        <Card>
          <CardHeader>
            <CardTitle>{editingMaterialId === "new" ? "Add Material" : "Edit Material"}</CardTitle>
            <CardDescription>Set operation speeds and power values for this material.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Material Name</Label>
              <Input
                value={editingMaterial.name || ""}
                onChange={(event) => onEditingMaterialChange({ ...editingMaterial, name: event.target.value })}
                placeholder="4mm Plywood"
              />
            </div>

            <div className="space-y-2">
              <Label>Laser</Label>
              <Select
                value={editingMaterial.laserId || ""}
                onValueChange={(laserId) => {
                  if (laserId) onEditingMaterialChange({ ...editingMaterial, laserId });
                }}
              >
                <SelectTrigger className="w-full">
                  {lasers.find((laser) => laser.id === editingMaterial.laserId)?.name || "Select a laser"}
                </SelectTrigger>
                <SelectContent>
                  {lasers.map((laser) => (
                    <SelectItem key={laser.id} value={laser.id}>
                      {laser.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Thickness Presets</Label>
                  <p className="mt-1 text-sm text-muted-foreground">Each thickness has its own operation parameters.</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addThickness}>
                  <Plus className="mr-2 size-4" />
                  Add Thickness
                </Button>
              </div>

              {editingThicknesses.map((thickness) => (
                <div key={thickness.id} className="space-y-4 rounded-lg border bg-muted/20 p-4">
                  <div className="flex items-end justify-between gap-3">
                    <div className="w-36 space-y-2">
                      <Label>Thickness</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min="0"
                          step="0.1"
                          value={thickness.thickness}
                          onChange={(event) => updateThickness(thickness.id, { thickness: parseFloat(event.target.value) || 0 })}
                        />
                        <span className="text-sm text-muted-foreground">mm</span>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={editingThicknesses.length <= 1}
                      onClick={() => deleteThickness(thickness.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <OperationFields
                      title="Cut"
                      color="#ef4444"
                      op={thickness.cut}
                      onChange={(field, value) => updateThicknessOperation(thickness.id, "cut", field, value)}
                    />
                    <OperationFields
                      title="Engrave"
                      color="#111827"
                      op={thickness.engrave}
                      onChange={(field, value) => updateThicknessOperation(thickness.id, "engrave", field, value)}
                    />
                    <OperationFields
                      title="Mark"
                      color="#22c55e"
                      op={thickness.mark}
                      onChange={(field, value) => updateThicknessOperation(thickness.id, "mark", field, value)}
                    />
                  </div>
                </div>
              ))}
            </div>

            <Separator />

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onCancelEdit}>
                Cancel
              </Button>
              <Button onClick={onSaveMaterial}>Save Material</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3">
        {visibleMaterials.map((material) => (
          <Card key={material.id}>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-medium">{material.name}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {(material.thicknesses || []).map((thickness) => (
                    <Badge key={thickness.id} variant="secondary" className="font-mono">
                      {thickness.thickness} mm
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => onEditMaterial(material)}>
                  Edit
                </Button>
                <Button variant="ghost" size="icon" onClick={() => onDeleteMaterial(material.id)}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        {visibleMaterials.length === 0 && selectedLaserId && !editingMaterialId && (
          <div className="rounded-lg border border-dashed bg-background py-16 text-center text-sm text-muted-foreground">
            No material profiles configured for this laser yet.
          </div>
        )}

        {!selectedLaserId && !editingMaterialId && (
          <div className="rounded-lg border border-dashed bg-background py-16 text-center text-sm text-muted-foreground">
            Select or create a laser before adding material profiles.
          </div>
        )}

        {unassignedMaterials.length > 0 && (
          <div className="mt-4 space-y-3">
            <div>
              <h2 className="text-sm font-semibold">Unassigned Profiles</h2>
              <p className="text-sm text-muted-foreground">Older profiles without a laser assignment. Edit one to assign it.</p>
            </div>
            {unassignedMaterials.map((material) => (
              <Card key={material.id}>
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    <p className="text-sm font-medium">{material.name}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {(material.thicknesses || []).map((thickness) => (
                        <Badge key={thickness.id} variant="secondary" className="font-mono">
                          {thickness.thickness} mm
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => onEditMaterial(material)}>
                      Assign
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => onDeleteMaterial(material.id)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
