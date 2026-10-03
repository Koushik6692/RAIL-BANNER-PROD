import { RAIL_CANVAS } from "@/lib/rail-constants";

/** Strip dimensions from payload so core applies objectFit against the rail canvas. */
export function prepareRailVideoPayload(payload: Record<string, unknown>) {
  const next: Record<string, unknown> = { ...payload, type: "Video" };
  delete next.width;
  delete next.height;
  delete next.left;
  delete next.top;
  next.zIndex = typeof next.zIndex === "number" ? next.zIndex : 0;
  return next;
}

export const RAIL_VIDEO_FIT = { objectFit: "cover" as const };

export function isVideoPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const t = (payload as { type?: string }).type;
  return t === "Video" || t === "video";
}

/** Zoom the studio preview so ultra-wide rails fill panel width (less empty black). */
export function railPreviewZoomLevel(
  canvasWidth: number,
  canvasHeight: number,
  panelWidth: number,
  panelHeight: number,
  spacing = 20,
): number {
  const aspect = canvasWidth / canvasHeight;
  if (aspect <= 8) return 1;

  const innerW = Math.max(0, panelWidth - spacing * 2);
  const innerH = Math.max(0, panelHeight - spacing * 2);
  const fitWidth = innerW / canvasWidth;
  const fitScreen = Math.min(fitWidth, innerH / canvasHeight);
  if (fitScreen <= 0) return 1;
  return Math.min(10, fitWidth / fitScreen);
}

export { RAIL_CANVAS };
