import { main } from "../../wailsjs/go/models";

export interface JobDurationEstimate {
  totalSeconds: number;
  cutSeconds: number;
  engraveSeconds: number;
  markSeconds: number;
  ignoredLength: number;
  geometryCount: number;
}

type Operation = "cut" | "engrave" | "mark" | "ignore";
type OperationPreset = Pick<main.MaterialThicknessSettings, "cut" | "engrave" | "mark">;

const parseColor = (value: string | null) => {
  if (!value || value === "none" || value === "transparent") return null;

  const probe = document.createElement("span");
  probe.style.color = value;
  document.body.appendChild(probe);
  const color = getComputedStyle(probe).color;
  probe.remove();

  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return null;

  return {
    r: Number(match[1]),
    g: Number(match[2]),
    b: Number(match[3]),
  };
};

const getOperationForElement = (element: Element): Operation => {
  const color =
    parseColor(element.getAttribute("stroke")) ||
    parseColor(element.getAttribute("fill")) ||
    parseColor(getComputedStyle(element).stroke) ||
    parseColor(getComputedStyle(element).fill);

  if (!color) return "engrave";

  if (color.b > 140 && color.b > color.r + 30 && color.b > color.g + 20) return "ignore";
  if (color.g > 120 && color.g > color.r + 20 && color.g > color.b + 20) return "mark";
  if (color.r > 150 && color.r > color.g + 30 && color.r > color.b + 30) return "cut";
  if (color.r < 80 && color.g < 80 && color.b < 80) return "engrave";

  return "engrave";
};

const getTransformedLength = (element: SVGGeometryElement) => {
  const baseLength = element.getTotalLength();
  const matrix = element.getCTM();
  if (!matrix) return baseLength;

  const scaleX = Math.hypot(matrix.a, matrix.b);
  const scaleY = Math.hypot(matrix.c, matrix.d);
  const averageScale = (scaleX + scaleY) / 2;

  return baseLength * (Number.isFinite(averageScale) && averageScale > 0 ? averageScale : 1);
};

export function estimateJobDuration(svgData: string, material: OperationPreset): JobDurationEstimate {
  const parser = new DOMParser();
  const documentSvg = parser.parseFromString(svgData, "image/svg+xml");
  const svg = documentSvg.documentElement as unknown as SVGSVGElement;

  svg.style.position = "absolute";
  svg.style.left = "-10000px";
  svg.style.top = "-10000px";
  svg.style.visibility = "hidden";
  document.body.appendChild(svg);

  const estimate: JobDurationEstimate = {
    totalSeconds: 0,
    cutSeconds: 0,
    engraveSeconds: 0,
    markSeconds: 0,
    ignoredLength: 0,
    geometryCount: 0,
  };

  const elements = Array.from(svg.querySelectorAll("path,line,polyline,polygon,rect,circle,ellipse")) as SVGGeometryElement[];

  for (const element of elements) {
    let length = 0;
    try {
      length = getTransformedLength(element);
    } catch {
      length = 0;
    }

    if (!Number.isFinite(length) || length <= 0) continue;

    estimate.geometryCount += 1;
    const operation = getOperationForElement(element);

    if (operation === "ignore") {
      estimate.ignoredLength += length;
      continue;
    }

    const speed = material[operation].speed;
    const seconds = speed > 0 ? length / speed : 0;
    estimate[`${operation}Seconds`] += seconds;
  }

  svg.remove();

  const motionSeconds = estimate.cutSeconds + estimate.engraveSeconds + estimate.markSeconds;
  estimate.totalSeconds = motionSeconds > 0 ? motionSeconds * 1.15 + 3 : 0;

  return estimate;
}

export function formatJobDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0 s";

  const rounded = Math.round(seconds);
  const minutes = Math.floor(rounded / 60);
  const remainingSeconds = rounded % 60;

  if (minutes === 0) return `${remainingSeconds} s`;
  if (remainingSeconds === 0) return `${minutes} min`;

  return `${minutes} min ${remainingSeconds} s`;
}
