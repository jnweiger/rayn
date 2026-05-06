export function getMachineDefaults(machineType: string) {
  if (machineType === "ruida" || machineType === "thunderlaser") {
    return { protocol: "UDP", port: 50200 };
  }

  return { protocol: "TCP", port: 9100 };
}

export function getMachineLabel(machineType?: string) {
  switch (machineType) {
    case "ruida":
      return "Ruida";
    case "thunderlaser":
      return "Thunderlaser / Ruida";
    case "epilog":
      return "Epilog";
    default:
      return "Epilog Zing";
  }
}
