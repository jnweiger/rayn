import { ImagePlus, Plus, Plug, Trash2, X } from "lucide-react";
import { main } from "../../../wailsjs/go/models";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { getMachineDefaults, getMachineLabel } from "@/lib/laser";
import LaserAvatar from "@/components/LaserAvatar";

interface LaserSettingsPageProps {
  lasers: main.Laser[];
  editingLaserId: string | null;
  editingLaser: Partial<main.Laser>;
  isTestingConnection: boolean;
  onNewLaser: () => void;
  onEditLaser: (laser: main.Laser) => void;
  onEditingLaserChange: (laser: Partial<main.Laser>) => void;
  onMachineTypeChange: (machineType: string) => void;
  onCancelEdit: () => void;
  onSaveLaser: () => void;
  onDeleteLaser: (id: string) => void;
  onTestConnection: (ip: string, port: number, protocol: string) => void;
}

export default function LaserSettingsPage({
  lasers,
  editingLaserId,
  editingLaser,
  isTestingConnection,
  onNewLaser,
  onEditLaser,
  onEditingLaserChange,
  onMachineTypeChange,
  onCancelEdit,
  onSaveLaser,
  onDeleteLaser,
  onTestConnection,
}: LaserSettingsPageProps) {
  const defaults = getMachineDefaults(editingLaser.machineType || "zing");
  const handleImageChange = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return;

    const reader = new FileReader();
    reader.onload = () => {
      onEditingLaserChange({ ...editingLaser, imageData: String(reader.result || "") });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Laser Configuration</h1>
          <p className="text-sm text-muted-foreground">Manage machines, network settings and bed dimensions.</p>
        </div>
        <Button onClick={onNewLaser}>
          <Plus className="mr-2 size-4" />
          Add Laser
        </Button>
      </div>

      {editingLaserId && (
        <Card>
          <CardHeader>
            <CardTitle>{editingLaserId === "new" ? "Add Laser" : "Edit Laser"}</CardTitle>
            <CardDescription>Configure the target machine used by laser jobs.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-4 rounded-lg border bg-muted/30 p-4">
              <LaserAvatar laser={editingLaser} size="lg" />
              <div className="min-w-0 flex-1">
                <Label>Laser Image</Label>
                <p className="mt-1 text-sm text-muted-foreground">Shown in laser lists and the target laser selector.</p>
              </div>
              <div className="flex items-center gap-2">
                <label className={buttonVariants({ variant: "outline", className: "cursor-pointer" })}>
                  <ImagePlus className="mr-2 size-4" />
                  Choose Image
                  <input
                    className="sr-only"
                    type="file"
                    accept="image/*"
                    onChange={(event) => handleImageChange(event.target.files?.[0])}
                  />
                </label>
                {editingLaser.imageData && (
                  <Button variant="ghost" size="icon" onClick={() => onEditingLaserChange({ ...editingLaser, imageData: "" })}>
                    <X className="size-4" />
                  </Button>
                )}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Device Name</Label>
                <Input
                  value={editingLaser.name || ""}
                  onChange={(event) => onEditingLaserChange({ ...editingLaser, name: event.target.value })}
                  placeholder="Thunderlaser Nova 35"
                />
              </div>
              <div className="space-y-2">
                <Label>Machine Type</Label>
                <Select value={editingLaser.machineType || "zing"} onValueChange={(value) => onMachineTypeChange(value || "zing")}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="zing">Epilog Zing</SelectItem>
                    <SelectItem value="epilog">Epilog</SelectItem>
                    <SelectItem value="ruida">Ruida</SelectItem>
                    <SelectItem value="thunderlaser">Thunderlaser / Ruida</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 rounded-lg border bg-muted/30 p-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>IP / Host</Label>
                <Input
                  className="font-mono"
                  value={editingLaser.ipAddress || ""}
                  onChange={(event) => onEditingLaserChange({ ...editingLaser, ipAddress: event.target.value })}
                  placeholder="192.168.1.100"
                />
              </div>
              <div className="space-y-2">
                <Label>Port</Label>
                <Input
                  type="number"
                  className="font-mono"
                  value={editingLaser.port || defaults.port}
                  onChange={(event) => onEditingLaserChange({ ...editingLaser, port: parseInt(event.target.value) || defaults.port })}
                />
              </div>
              <div className="space-y-2">
                <Label>Protocol</Label>
                <Select
                  value={editingLaser.protocol || defaults.protocol}
                  onValueChange={(value) => onEditingLaserChange({ ...editingLaser, protocol: value ?? undefined })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TCP">TCP</SelectItem>
                    <SelectItem value="UDP">UDP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Power Mode</Label>
                <Select
                  value={editingLaser.powerMode || "single"}
                  onValueChange={(value) => onEditingLaserChange({ ...editingLaser, powerMode: value ?? undefined })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">Single Power</SelectItem>
                    <SelectItem value="min_max">Min / Max Power</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Bed Width</Label>
                <Input
                  type="number"
                  value={editingLaser.bedWidth || 0}
                  onChange={(event) => onEditingLaserChange({ ...editingLaser, bedWidth: parseInt(event.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label>Bed Height</Label>
                <Input
                  type="number"
                  value={editingLaser.bedHeight || 0}
                  onChange={(event) => onEditingLaserChange({ ...editingLaser, bedHeight: parseInt(event.target.value) || 0 })}
                />
              </div>
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                disabled={isTestingConnection}
                onClick={() =>
                  onTestConnection(
                    editingLaser.ipAddress || "",
                    editingLaser.port || defaults.port,
                    editingLaser.protocol || defaults.protocol,
                  )
                }
              >
                <Plug className="mr-2 size-4" />
                {isTestingConnection ? "Testing..." : "Test Connection"}
              </Button>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={onCancelEdit}>
                  Cancel
                </Button>
                <Button onClick={onSaveLaser}>Save Laser</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3">
        {lasers.map((laser) => (
          <Card key={laser.id}>
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex min-w-0 items-center gap-4">
                <LaserAvatar laser={laser} size="md" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{laser.name}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {getMachineLabel(laser.machineType)} · {laser.ipAddress}:{laser.port} ·{" "}
                    {laser.powerMode === "min_max" ? "Min/Max" : "Single"} Power
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => onEditLaser(laser)}>
                  Edit
                </Button>
                <Button variant="ghost" size="icon" onClick={() => onDeleteLaser(laser.id)}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        {lasers.length === 0 && !editingLaserId && (
          <div className="rounded-lg border border-dashed bg-background py-16 text-center text-sm text-muted-foreground">
            No lasers configured yet.
          </div>
        )}
      </div>
    </div>
  );
}
