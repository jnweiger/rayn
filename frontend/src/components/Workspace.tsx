import { useCallback, useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";
import * as fabric from "fabric";
import * as opentype from "opentype.js";
import { main } from "../../wailsjs/go/models";
import { LoadFontDataForFamily, OpenSVGFile } from "../../wailsjs/go/main/App";
import ipagFontUrl from "../assets/fonts/ipag.ttf?url";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Box, RotateCw, FlipHorizontal, FlipVertical, Image as ImageIcon, Trash2, FolderUp, Minus, Plus, Scan } from "lucide-react";
import { toast } from "sonner";

interface WorkspaceProps {
  activeLaser: main.Laser | undefined;
  onColorsDetected?: (colors: string[]) => void;
}

export interface WorkspaceRef {
  triggerImportSVG: () => void;
  getJobSVG: () => string;
  hasObjects: () => boolean;
}

const Workspace = forwardRef<WorkspaceRef, WorkspaceProps>(({ activeLaser, onColorsDetected }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvas = useRef<fabric.Canvas | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const bedSizeRef = useRef({ width: 600, height: 400 });
  const fitScaleRef = useRef(1);

  const [selectedObject, setSelectedObject] = useState<fabric.FabricObject | null>(null);
  const [objPos, setObjPos] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const [importedObjects, setImportedObjects] = useState<{id: string, name: string, ref: fabric.FabricObject}[]>([]);
  const [zoomPercent, setZoomPercent] = useState(100);
  const [bedPreview, setBedPreview] = useState<"checker" | "white" | "gray" | "dark">("checker");
  const textFontRef = useRef<any>(null);
  const fontCacheRef = useRef<Record<string, any>>({});

  const createCheckerPattern = () => {
    const patternCanvas = document.createElement("canvas");
    const size = 20;
    const half = size / 2;
    patternCanvas.width = size;
    patternCanvas.height = size;

    const context = patternCanvas.getContext("2d");
    if (!context) return "#ffffff";

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, size, size);
    context.fillStyle = "#e5e7eb";
    context.fillRect(0, 0, half, half);
    context.fillRect(half, half, half, half);

    return new fabric.Pattern({
      source: patternCanvas as any,
      repeat: "repeat",
    });
  };

  const getBedPreviewBackground = () => {
    switch (bedPreview) {
      case "white":
        return "#ffffff";
      case "gray":
        return "#e5e5e5";
      case "dark":
        return "#171717";
      default:
        return createCheckerPattern();
    }
  };

  const applyBedPreview = () => {
    if (!fabricCanvas.current) return;

    const background = getBedPreviewBackground();
    const lowerCanvas = fabricCanvas.current.getElement();
    const upperCanvas = (fabricCanvas.current as any).upperCanvasEl as HTMLCanvasElement | undefined;

    fabricCanvas.current.set('backgroundColor', background as any);
    fabricCanvas.current.requestRenderAll();

    lowerCanvas.style.backgroundColor = "transparent";
    lowerCanvas.style.backgroundImage = "";
    lowerCanvas.style.backgroundSize = "";
    lowerCanvas.style.backgroundPosition = "";

    if (upperCanvas) {
      upperCanvas.style.backgroundColor = "transparent";
      upperCanvas.style.backgroundImage = "";
      upperCanvas.style.backgroundSize = "";
      upperCanvas.style.backgroundPosition = "";
    }
  };

  const applyCanvasScale = (scale: number) => {
    if (!fabricCanvas.current) return;

    const { width, height } = bedSizeRef.current;
    fabricCanvas.current.setDimensions({ width, height }, { backstoreOnly: true });
    fabricCanvas.current.setDimensions(
      {
        width: `${Math.round(width * scale)}px`,
        height: `${Math.round(height * scale)}px`,
      },
      { cssOnly: true },
    );
    fabricCanvas.current.setViewportTransform([1, 0, 0, 1, 0, 0]);
    fabricCanvas.current.requestRenderAll();
  };

  const applyZoomPercent = (nextZoomPercent: number) => {
    const clampedZoom = Math.min(Math.max(nextZoomPercent, 25), 300);
    setZoomPercent(clampedZoom);
    applyCanvasScale(fitScaleRef.current * (clampedZoom / 100));
  };

  const resetZoom = () => applyZoomPercent(100);

  const fitCanvasToContainer = useCallback(() => {
    if (!containerRef.current || !fabricCanvas.current) return;

    const { width, height } = bedSizeRef.current;
    const containerWidth = containerRef.current.clientWidth - 40;
    const containerHeight = containerRef.current.clientHeight - 100;
    if (containerWidth <= 0 || containerHeight <= 0) return;

    const scaleX = containerWidth / width;
    const scaleY = containerHeight / height;
    const nextFitScale = Math.min(scaleX, scaleY, 1);
    fitScaleRef.current = nextFitScale;
    applyCanvasScale(nextFitScale * (zoomPercent / 100));
  }, [zoomPercent]);

  const roundMm = (value: number) => Math.round(value * 100) / 100;

  const updateObjPos = (obj: fabric.FabricObject) => {
    const rect = obj.getBoundingRect();
    setObjPos({
      x: roundMm(rect.left),
      y: roundMm(rect.top),
      w: roundMm(rect.width),
      h: roundMm(rect.height),
    });
  };

  useEffect(() => {
    if (!canvasRef.current) return;

    if (fabricCanvas.current) {
      fabricCanvas.current.dispose();
    }

    let width = 600;
    let height = 400;

    if (activeLaser && activeLaser.bedWidth > 0 && activeLaser.bedHeight > 0) {
      width = activeLaser.bedWidth;
      height = activeLaser.bedHeight;
    }
    bedSizeRef.current = { width, height };

    let scale = 1;
    if (containerRef.current) {
      const containerWidth = containerRef.current.clientWidth - 40; // padding
      const containerHeight = containerRef.current.clientHeight - 100; // padding + header
      
      const scaleX = containerWidth / width;
      const scaleY = containerHeight / height;
      scale = Math.min(scaleX, scaleY, 1); // Don't scale up beyond 1:1 if it fits
    }

    fitScaleRef.current = scale;
    const displayScale = scale * (zoomPercent / 100);

    fabricCanvas.current = new fabric.Canvas(canvasRef.current, {
      width,
      height,
      backgroundColor: "transparent",
      selectionBorderColor: "#2563eb",
      selectionColor: "rgba(37, 99, 235, 0.08)",
    });

    applyCanvasScale(displayScale);
    applyBedPreview();

    const updateSelection = () => {
      const activeObj = fabricCanvas.current?.getActiveObject();
      if (activeObj) {
        setSelectedObject(activeObj);
        updateObjPos(activeObj);
      } else {
        setSelectedObject(null);
      }
    };

    const constrainBounds = (e: fabric.TEvent & { target?: fabric.FabricObject }) => {
      const obj = e.target;
      if (!obj) return;

      obj.setCoords();
      const coords = obj.getCoords();
      if (!coords || coords.length < 4) return;
      const [tl, tr, br, bl] = coords;

      const minX = Math.min(tl.x, tr.x, bl.x, br.x);
      const minY = Math.min(tl.y, tr.y, bl.y, br.y);
      const maxX = Math.max(tl.x, tr.x, bl.x, br.x);
      const maxY = Math.max(tl.y, tr.y, bl.y, br.y);

      let left = obj.left || 0;
      let top = obj.top || 0;
      let modified = false;

      if (minX < 0) {
        left += (0 - minX);
        modified = true;
      } else if (maxX > width) {
        left -= (maxX - width);
        modified = true;
      }

      if (minY < 0) {
        top += (0 - minY);
        modified = true;
      } else if (maxY > height) {
        top -= (maxY - height);
        modified = true;
      }

      if (modified) {
        obj.set({ left, top });
        obj.setCoords();
      }

      updateSelection();
    };

    fabricCanvas.current.on('selection:created', updateSelection);
    fabricCanvas.current.on('selection:updated', updateSelection);
    fabricCanvas.current.on('selection:cleared', updateSelection);
    fabricCanvas.current.on('object:modified', updateSelection);
    fabricCanvas.current.on('object:moving', constrainBounds);
    fabricCanvas.current.on('object:scaling', constrainBounds);
    fabricCanvas.current.on('object:rotating', updateSelection);

    return () => {
      if (fabricCanvas.current) {
        fabricCanvas.current.off();
        fabricCanvas.current.dispose();
        fabricCanvas.current = null;
      }
    };
  }, [activeLaser?.id, activeLaser?.bedWidth, activeLaser?.bedHeight]);

  useEffect(() => {
    applyBedPreview();
  }, [bedPreview]);

  useEffect(() => {
    if (!containerRef.current) return;

    let frame = 0;
    const scheduleFit = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(fitCanvasToContainer);
    };

    const observer = new ResizeObserver(scheduleFit);
    observer.observe(containerRef.current);
    window.addEventListener("resize", scheduleFit);
    scheduleFit();

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", scheduleFit);
    };
  }, [fitCanvasToContainer]);

  const handleImportSVG = async () => {
    if (!fabricCanvas.current) return;

    try {
      const response = await OpenSVGFile();
      
      if (response.error) {
        toast.error(`Error importing file: ${response.error}`);
        return;
      }

      if (!response.content) {
        return;
      }

      const toastId = toast.loading(`Importing ${response.fileName}...`);
      const importContent = await convertTextToPaths(response.content);
      const normalizedSvg = normalizeSvgUnitsToMm(importContent.svg);

      const { objects, options } = await fabric.loadSVGFromString(normalizedSvg);

        if (!objects || objects.length === 0) {
          toast.error("No parseable objects found in SVG", { id: toastId });
          return;
        }

        if (onColorsDetected) {
          const uniqueColors = new Set<string>();
          objects.forEach((obj) => {
            const extractHex = (val: string | fabric.TFiller | undefined) => {
              if (typeof val === 'string' && val !== 'none' && val !== 'transparent') {
                try {
                  const hex = new fabric.Color(val).toHex();
                  if (hex) uniqueColors.add(`#${hex.toUpperCase()}`);
                } catch {}
              }
            };
            extractHex(obj?.stroke as string | undefined);
            extractHex(obj?.fill as string | fabric.TFiller | undefined);
          });
          onColorsDetected(Array.from(uniqueColors));
        }

        const obj = fabric.util.groupSVGElements(objects.filter((o): o is fabric.FabricObject => o !== null), options);

        obj.set({
          left: 0,
          top: 0,
          originX: "center",
          originY: "center",
          borderColor: "#3b82f6",
          cornerColor: "#60a5fa",
          cornerSize: 8,
          transparentCorners: false,
        });

        fabricCanvas.current?.add(obj);
        fabricCanvas.current?.centerObject(obj);
        fabricCanvas.current?.setActiveObject(obj);
        fabricCanvas.current?.renderAll();

        const newObjId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(7);
        const objName = response.fileName || 'Imported SVG';
        obj.set({ id: newObjId, name: objName } as any);

        setImportedObjects(prev => [...prev, {
          id: newObjId,
          name: objName,
          ref: obj
        }]);

        toast.success(
          importContent.convertedTextCount > 0
            ? `Imported ${response.fileName} (${importContent.convertedTextCount} text object${importContent.convertedTextCount === 1 ? "" : "s"} converted)`
            : `Imported ${response.fileName}`,
          { id: toastId },
        );

    } catch (err) {
      console.error(err);
      toast.error("Failed to import SVG");
    }
  };

  const loadFallbackTextFont = () =>
    new Promise<any>((resolve, reject) => {
      if (textFontRef.current) {
        resolve(textFontRef.current);
        return;
      }

      fetch(ipagFontUrl)
        .then((response) => {
          if (!response.ok) throw new Error(`Font request failed: ${response.status}`);
          return response.arrayBuffer();
        })
        .then((buffer) => {
          const font = opentype.parse(buffer);
          textFontRef.current = font;
          resolve(font);
        })
        .catch((error) => {
          reject(error);
          return;
        });
    });

  const loadFontForTextNode = async (doc: Document, textNode: Element) => {
    const fontFamily = getInheritedTextAttribute(textNode, "font-family");
    const family = preferredFontFamily(fontFamily);
    const cacheKey = family ? normalizeFontFamily(family) : "fallback";

    if (fontCacheRef.current[cacheKey]) {
      return fontCacheRef.current[cacheKey];
    }

    const embeddedFont = family ? parseEmbeddedFont(doc, family) : null;
    if (embeddedFont) {
      const font = opentype.parse(embeddedFont);
      fontCacheRef.current[cacheKey] = font;
      return font;
    }

    if (family) {
      try {
        const fontData = await LoadFontDataForFamily(family);
        if (fontData) {
          const font = opentype.parse(base64ToArrayBuffer(fontData));
          fontCacheRef.current[cacheKey] = font;
          return font;
        }
      } catch (error) {
        console.warn(`Could not load font "${family}"`, error);
      }
    }

    const fallback = await loadFallbackTextFont();
    fontCacheRef.current[cacheKey] = fallback;
    return fallback;
  };

  const convertTextToPaths = async (svg: string) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svg, "image/svg+xml");
    const textNodes = Array.from(doc.querySelectorAll("text"));

    if (textNodes.length === 0) {
      return { svg, convertedTextCount: 0 };
    }

    let convertedTextCount = 0;

    for (const textNode of textNodes) {
      const textRuns = collectTextRuns(textNode);
      if (textRuns.length === 0) continue;

      const group = doc.createElementNS("http://www.w3.org/2000/svg", "g");
      const textTransform = textNode.getAttribute("transform");
      if (textTransform) group.setAttribute("transform", textTransform);

      for (const run of textRuns) {
        const font = await loadFontForTextNode(doc, run.node);
        const fontSize = parseSvgNumber(getInheritedTextAttribute(run.node, "font-size") || "12") || 12;
        const x = parseSvgNumber(run.node.getAttribute("x") || textNode.getAttribute("x") || "0") || 0;
        const y = parseSvgNumber(run.node.getAttribute("y") || textNode.getAttribute("y") || "0") || 0;
        const anchor = getInheritedTextAttribute(run.node, "text-anchor");
        const anchorOffset = textAnchorOffset(font, run.text, fontSize, anchor);
        const d = font.getPath(
          run.text,
          x + anchorOffset,
          y,
          fontSize,
          { kerning: true },
        ).toPathData(2);

        const path = doc.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", d);

        const fill = getInheritedTextAttribute(run.node, "fill");
        const stroke = getInheritedTextAttribute(run.node, "stroke");
        const runTransform = run.node === textNode ? "" : run.node.getAttribute("transform");

        path.setAttribute("fill", fill && fill !== "none" ? fill : "#000000");
        if (stroke && stroke !== "none") path.setAttribute("stroke", stroke);
        if (runTransform) path.setAttribute("transform", runTransform);

        group.appendChild(path);
      }

      textNode.replaceWith(group);
      convertedTextCount += 1;
    }

    return { svg: new XMLSerializer().serializeToString(doc), convertedTextCount };
  };

  const collectTextRuns = (textNode: Element) => {
    const tspans = Array.from(textNode.querySelectorAll("tspan"));
    if (tspans.length === 0) {
      const text = textNode.textContent || "";
      return text.trim() ? [{ node: textNode, text }] : [];
    }

    return tspans
      .map((node) => ({ node, text: node.textContent || "" }))
      .filter((run) => run.text.trim());
  };

  const getInheritedTextAttribute = (node: Element, name: string): string | null => {
    let current: Element | null = node;
    while (current) {
      const direct = current.getAttribute(name);
      if (direct) return direct;

      const styleValue = styleAttributeValue(current, name);
      if (styleValue) return styleValue;

      const classValue = cssClassValue(current, name);
      if (classValue) return classValue;

      current = current.parentElement;
    }
    return null;
  };

  const styleAttributeValue = (node: Element, name: string) => {
    const style = node.getAttribute("style") || "";
    for (const part of style.split(";")) {
      const [key, ...valueParts] = part.split(":");
      if (key?.trim().toLowerCase() === name) {
        return valueParts.join(":").trim();
      }
    }
    return "";
  };

  const cssClassValue = (node: Element, name: string) => {
    const classNames = (node.getAttribute("class") || "").split(/\s+/).filter(Boolean);
    if (classNames.length === 0) return "";

    const styles = Array.from(node.ownerDocument.querySelectorAll("style"));
    for (const className of classNames) {
      const escapedClass = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const rule = new RegExp(`\\.${escapedClass}\\s*{([^}]+)}`, "i");
      for (const style of styles) {
        const match = (style.textContent || "").match(rule);
        if (!match) continue;
        const value = cssDeclarationValue(match[1], name);
        if (value) return value;
      }
    }
    return "";
  };

  const cssDeclarationValue = (declarations: string, name: string) => {
    for (const part of declarations.split(";")) {
      const [key, ...valueParts] = part.split(":");
      if (key?.trim().toLowerCase() === name) {
        return valueParts.join(":").trim();
      }
    }
    return "";
  };

  const preferredFontFamily = (fontFamily: string | null) => {
    if (!fontFamily) return "";
    const genericFamilies = new Set(["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui"]);
    for (const family of fontFamily.split(",")) {
      const clean = family.trim().replace(/^['"]|['"]$/g, "");
      if (clean && !genericFamilies.has(clean.toLowerCase())) {
        return clean;
      }
    }
    return "";
  };

  const normalizeFontFamily = (fontFamily: string) => fontFamily.trim().replace(/^['"]|['"]$/g, "").toLowerCase();

  const parseEmbeddedFont = (doc: Document, fontFamily: string) => {
    const targetFamily = normalizeFontFamily(fontFamily);
    const styles = Array.from(doc.querySelectorAll("style"));

    for (const style of styles) {
      const css = style.textContent || "";
      const blocks = css.match(/@font-face\s*{[^}]+}/gi) || [];
      for (const block of blocks) {
        const familyMatch = block.match(/font-family\s*:\s*([^;]+)/i);
        if (!familyMatch || normalizeFontFamily(familyMatch[1]) !== targetFamily) {
          continue;
        }

        const srcMatch = block.match(/src\s*:\s*url\((['"]?)(data:[^)'"\\]+)\1\)/i);
        if (!srcMatch) continue;

        const dataUrl = srcMatch[2];
        const commaIndex = dataUrl.indexOf(",");
        if (commaIndex < 0) continue;

        const metadata = dataUrl.slice(0, commaIndex).toLowerCase();
        const data = dataUrl.slice(commaIndex + 1);
        if (metadata.includes(";base64")) {
          return base64ToArrayBuffer(data);
        }
        return new TextEncoder().encode(decodeURIComponent(data)).buffer;
      }
    }

    return null;
  };

  const base64ToArrayBuffer = (value: string) => {
    const binary = window.atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  };

  const textAnchorOffset = (font: any, text: string, fontSize: number, anchor: string | null) => {
    const width = font.getAdvanceWidth ? font.getAdvanceWidth(text, fontSize, { kerning: true }) : 0;
    switch ((anchor || "").toLowerCase()) {
      case "middle":
        return -width / 2;
      case "end":
        return -width;
      default:
        return 0;
    }
  };

  const normalizeSvgUnitsToMm = (svg: string) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svg, "image/svg+xml");
    const root = doc.documentElement;
    if (!root || root.nodeName.toLowerCase() !== "svg") {
      return svg;
    }

    const viewBox = parseViewBox(root.getAttribute("viewBox"));
    const width = parseSvgLengthToMm(root.getAttribute("width"));
    const height = parseSvgLengthToMm(root.getAttribute("height"));

    if (!viewBox || !width || !height || viewBox.width <= 0 || viewBox.height <= 0) {
      return svg;
    }

    const scaleX = width / viewBox.width;
    const scaleY = height / viewBox.height;
    const translateX = -viewBox.x * scaleX;
    const translateY = -viewBox.y * scaleY;
    const wrapper = doc.createElementNS("http://www.w3.org/2000/svg", "g");
    wrapper.setAttribute(
      "transform",
      `matrix(${formatSvgNumber(scaleX)} 0 0 ${formatSvgNumber(scaleY)} ${formatSvgNumber(translateX)} ${formatSvgNumber(translateY)})`,
    );

    while (root.firstChild) {
      wrapper.appendChild(root.firstChild);
    }
    root.appendChild(wrapper);

    root.setAttribute("width", formatSvgNumber(width));
    root.setAttribute("height", formatSvgNumber(height));
    root.setAttribute("viewBox", `0 0 ${formatSvgNumber(width)} ${formatSvgNumber(height)}`);

    return new XMLSerializer().serializeToString(doc);
  };

  const parseViewBox = (value: string | null) => {
    if (!value) return null;
    const parts = value
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) return null;
    return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
  };

  const parseSvgLengthToMm = (value: string | null) => {
    if (!value) return null;
    const match = value.trim().match(/^(-?(?:\d+|\d*\.\d+)(?:e[-+]?\d+)?)([a-z%]*)$/i);
    if (!match) return null;

    const amount = Number(match[1]);
    if (!Number.isFinite(amount)) return null;

    const unit = match[2].toLowerCase();
    switch (unit) {
      case "":
      case "px":
        return amount * 25.4 / 96;
      case "mm":
        return amount;
      case "cm":
        return amount * 10;
      case "in":
        return amount * 25.4;
      case "pt":
        return amount * 25.4 / 72;
      case "pc":
        return amount * 25.4 / 6;
      default:
        return null;
    }
  };

  const parseSvgNumber = (value: string | null) => {
    if (!value) return 0;
    const match = value.trim().match(/^-?(?:\d+|\d*\.\d+)(?:e[-+]?\d+)?/i);
    return match ? Number(match[0]) : 0;
  };

  const formatSvgNumber = (value: number) => Number(value.toFixed(6)).toString();

  useImperativeHandle(ref, () => ({
    triggerImportSVG: handleImportSVG,
    getJobSVG: () => {
      const canvas = fabricCanvas.current;
      if (!canvas || !activeLaser) return "";

      const previewBackground = canvas.backgroundColor;
      canvas.backgroundColor = "";
      canvas.requestRenderAll();

      const svg = canvas.toSVG({
        width: `${activeLaser.bedWidth}mm`,
        height: `${activeLaser.bedHeight}mm`,
        viewBox: {
          x: 0,
          y: 0,
          width: activeLaser.bedWidth,
          height: activeLaser.bedHeight,
        },
      });

      canvas.backgroundColor = previewBackground;
      canvas.requestRenderAll();

      return svg;
    },
    hasObjects: () => (fabricCanvas.current?.getObjects().length || 0) > 0,
  }));

  const handleRotate = () => {
    if (!selectedObject || !fabricCanvas.current) return;
    const currentAngle = selectedObject.angle || 0;
    selectedObject.rotate((currentAngle + 90) % 360);
    fabricCanvas.current.requestRenderAll();
    updateObjPos(selectedObject);
  };

  const handleFlipHorizontal = () => {
    if (!selectedObject || !fabricCanvas.current) return;
    selectedObject.set('flipX', !selectedObject.flipX);
    fabricCanvas.current.requestRenderAll();
    updateObjPos(selectedObject);
  };

  const handleFlipVertical = () => {
    if (!selectedObject || !fabricCanvas.current) return;
    selectedObject.set('flipY', !selectedObject.flipY);
    fabricCanvas.current.requestRenderAll();
    updateObjPos(selectedObject);
  };

  const handleParamChange = (param: 'x'|'y'|'w'|'h', value: number) => {
    if (!selectedObject || !fabricCanvas.current || !Number.isFinite(value)) return;
    if ((param === "w" || param === "h") && value <= 0) return;
    
    if (param === 'x') {
      const rect = selectedObject.getBoundingRect();
      selectedObject.setPositionByOrigin(new fabric.Point(value, rect.top), 'left', 'top');
    } else if (param === 'y') {
      const rect = selectedObject.getBoundingRect();
      selectedObject.setPositionByOrigin(new fabric.Point(rect.left, value), 'left', 'top');
    } else if (param === 'w') {
      const scaleX = value / ((selectedObject.width || 1));
      selectedObject.set({ scaleX });
    } else if (param === 'h') {
      const scaleY = value / ((selectedObject.height || 1));
      selectedObject.set({ scaleY });
    }
    
    selectedObject.setCoords();
    fabricCanvas.current.requestRenderAll();
    updateObjPos(selectedObject);
  };

  const handleDeleteObject = (id: string, ref: fabric.FabricObject) => {
    if (!fabricCanvas.current) return;
    fabricCanvas.current.remove(ref);
    setImportedObjects(prev => prev.filter(o => o.id !== id));
    if (selectedObject === ref) {
      setSelectedObject(null);
    }
    fabricCanvas.current.requestRenderAll();
  };

  const handleSelectObject = (ref: fabric.FabricObject) => {
    if (!fabricCanvas.current) return;
    fabricCanvas.current.setActiveObject(ref);
    fabricCanvas.current.requestRenderAll();
  };

  const zoomIn = () => applyZoomPercent(zoomPercent + 10);
  const zoomOut = () => applyZoomPercent(zoomPercent - 10);
  const formatMmInput = (value: number) => value.toFixed(2);

  const renderRulers = () => {
    if (!activeLaser) return null;
    const { bedWidth, bedHeight } = activeLaser;
    
    const topTicks = [];
    for (let i = 0; i <= bedWidth; i += 50) {
      topTicks.push(
        <div key={`t-${i}`} className="absolute bottom-0 flex flex-col items-center -translate-x-1/2" style={{ left: `${(i / bedWidth) * 100}%` }}>
          <span className="mb-1 font-mono text-[10px] leading-none text-muted-foreground">{i}</span>
          <div className="h-1.5 w-px bg-border"></div>
        </div>
      );
    }
    
    const leftTicks = [];
    for (let i = 0; i <= bedHeight; i += 50) {
      leftTicks.push(
        <div key={`l-${i}`} className="absolute right-0 flex items-center -translate-y-1/2" style={{ top: `${(i / bedHeight) * 100}%` }}>
          <span className="mr-1.5 font-mono text-[10px] leading-none text-muted-foreground">{i}</span>
          <div className="h-px w-1.5 bg-border"></div>
        </div>
      );
    }

    return (
      <>
        {/* Top Ruler */}
        <div className="pointer-events-none absolute left-0 flex h-5 w-full items-end" style={{ top: "-1.5rem" }}>
          <div className="relative w-full h-full">{topTicks}</div>
        </div>
        <div className="pointer-events-none absolute top-0 flex h-full w-8 justify-end" style={{ left: "-2rem" }}>
          <div className="relative w-full h-full">{leftTicks}</div>
        </div>
      </>
    );
  };

  return (
    <div className="flex min-h-0 w-full flex-1">
      <aside className="flex w-80 shrink-0 flex-col border-r bg-background">
        <div className="flex h-16 items-center justify-between border-b px-5">
          <div>
            <h2 className="text-sm font-semibold">Imported Objects</h2>
            <p className="text-xs text-muted-foreground">{importedObjects.length} object{importedObjects.length === 1 ? "" : "s"}</p>
          </div>
          <Button 
            onClick={handleImportSVG} 
            variant="outline" 
            size="sm" 
            disabled={!activeLaser}
          >
            <FolderUp className="mr-2 size-4" />
            Import
          </Button>
        </div>
        
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {importedObjects.length === 0 ? (
            <div className="rounded-lg border border-dashed bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
              No objects imported yet.
            </div>
          ) : (
            importedObjects.map((obj) => {
              const isSelected = selectedObject === obj.ref;
              return (
                <div 
                  key={obj.id} 
                  className={`flex cursor-pointer flex-col gap-3 rounded-lg border bg-background p-3 transition-colors ${
                    isSelected ? "border-primary shadow-sm" : "hover:bg-muted/30"
                  }`}
                  onClick={() => handleSelectObject(obj.ref)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <ImageIcon className={`size-4 shrink-0 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                      <span className="truncate text-sm font-medium">
                        {obj.name}
                      </span>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteObject(obj.id, obj.ref);
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>

                  {isSelected && (
                    <div className="space-y-3 border-t pt-3" onClick={e => e.stopPropagation()}>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">X Pos</Label>
                          <Input 
                            type="number" 
                            step="0.01"
                            value={formatMmInput(objPos.x)} 
                            onChange={(e) => handleParamChange('x', parseFloat(e.target.value))}
                            className="font-mono"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Y Pos</Label>
                          <Input 
                            type="number" 
                            step="0.01"
                            value={formatMmInput(objPos.y)} 
                            onChange={(e) => handleParamChange('y', parseFloat(e.target.value))}
                            className="font-mono"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Width</Label>
                          <Input 
                            type="number" 
                            step="0.01"
                            min="0.01"
                            value={formatMmInput(objPos.w)} 
                            onChange={(e) => handleParamChange('w', parseFloat(e.target.value))}
                            className="font-mono"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Height</Label>
                          <Input 
                            type="number" 
                            step="0.01"
                            min="0.01"
                            value={formatMmInput(objPos.h)} 
                            onChange={(e) => handleParamChange('h', parseFloat(e.target.value))}
                            className="font-mono"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Transform</Label>
                        <div className="flex gap-1 rounded-lg border bg-muted/30 p-1">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={handleRotate} 
                            className="flex-1" 
                            title="Rotate 90°"
                          >
                            <RotateCw className="mr-2 size-4" />
                            90°
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={handleFlipHorizontal} 
                            title="Flip Horizontal"
                          >
                            <FlipHorizontal className="size-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={handleFlipVertical} 
                            title="Flip Vertical"
                          >
                            <FlipVertical className="size-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </aside>

      <div className="relative flex flex-1 items-center justify-center overflow-auto bg-muted/30 p-12" ref={containerRef}>
        {activeLaser && (
          <div className="absolute right-4 top-4 z-20 flex items-center gap-3 rounded-lg border bg-background/95 p-2 shadow-sm backdrop-blur">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon-sm" onClick={zoomOut} disabled={zoomPercent <= 25} title="Zoom out">
                <Minus className="size-4" />
              </Button>
              <input
                aria-label="Canvas zoom"
                className="h-2 w-32 accent-primary"
                type="range"
                min={25}
                max={300}
                step={5}
                value={zoomPercent}
                onChange={(event) => applyZoomPercent(parseInt(event.target.value) || 100)}
              />
              <Button variant="ghost" size="icon-sm" onClick={zoomIn} disabled={zoomPercent >= 300} title="Zoom in">
                <Plus className="size-4" />
              </Button>
              <div className="w-12 text-right font-mono text-xs text-muted-foreground">{zoomPercent}%</div>
              <Button variant="ghost" size="icon-sm" onClick={resetZoom} title="Fit canvas">
                <Scan className="size-4" />
              </Button>
            </div>
            <div className="h-6 w-px bg-border" />
            <div className="flex rounded-md border bg-muted/40 p-0.5" title="Bed preview background">
              {([
                ["checker", "Checker"],
                ["white", "White"],
                ["gray", "Gray"],
                ["dark", "Dark"],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  aria-label={`${label} bed preview`}
                  className={`flex size-6 items-center justify-center rounded-sm border text-[10px] transition-colors ${
                    bedPreview === value ? "border-primary ring-1 ring-primary/20" : "border-transparent hover:border-border"
                  } ${
                    value === "checker"
                      ? "bg-[linear-gradient(45deg,#e5e7eb_25%,transparent_25%),linear-gradient(-45deg,#e5e7eb_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#e5e7eb_75%),linear-gradient(-45deg,transparent_75%,#e5e7eb_75%)] bg-[length:10px_10px] bg-[position:0_0,0_5px,5px_-5px,-5px_0px]"
                      : value === "white"
                        ? "bg-white"
                        : value === "gray"
                          ? "bg-neutral-200"
                          : "bg-neutral-900"
                  }`}
                  onClick={() => setBedPreview(value)}
                  type="button"
                />
              ))}
            </div>
          </div>
        )}
        {activeLaser ? (
          <div className="relative ml-8 mt-8 inline-block">
            {renderRulers()}
            <div className="relative shadow-sm">
              <canvas ref={canvasRef} className="block" />
            </div>
          </div>
        ) : (
          <div className="z-10 flex flex-col items-center gap-4 text-center text-muted-foreground">
            <div className="flex size-14 items-center justify-center rounded-full border bg-background shadow-sm">
              <Box className="size-6" />
            </div>
            <div>
              <p className="text-base font-medium text-foreground">No Laser Selected</p>
              <p className="mt-1 text-sm">Choose a configured laser to show its bed.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

export default Workspace;
