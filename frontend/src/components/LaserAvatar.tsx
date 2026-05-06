import { Box } from "lucide-react";
import { main } from "../../wailsjs/go/models";

interface LaserAvatarProps {
  laser?: main.Laser | Partial<main.Laser>;
  size?: "sm" | "md" | "lg";
}

const sizeClasses = {
  sm: "size-6 rounded-md",
  md: "size-9 rounded-lg",
  lg: "size-14 rounded-xl",
};

export default function LaserAvatar({ laser, size = "md" }: LaserAvatarProps) {
  const imageData = laser?.imageData;

  return (
    <div className={`flex shrink-0 items-center justify-center overflow-hidden border bg-muted ${sizeClasses[size]}`}>
      {imageData ? (
        <img src={imageData} alt="" className="h-full w-full object-cover" />
      ) : (
        <Box className={size === "lg" ? "size-6 text-muted-foreground" : "size-4 text-muted-foreground"} />
      )}
    </div>
  );
}
