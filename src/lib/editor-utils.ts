import { CanvasSize } from "@/types/editor";
import { RAIL_CANVAS, RAIL_WIDTH } from "@/lib/rail-constants";

export const DEFAULT_CANVAS_PRESETS = [
  { name: "rail", width: RAIL_CANVAS.width, height: RAIL_CANVAS.height },
  { name: "9:16", width: 1080, height: 1920 },
  { name: "16:9", width: 1920, height: 1080 },
  { name: "1:1", width: 1080, height: 1080 },
  { name: "4:3", width: 1440, height: 1080 },
];

/**
 * Helper function to find the best matching canvas preset for an aspect ratio
 * @param aspectRatio The target aspect ratio to match
 * @returns The best matching canvas size
 */
export function findBestCanvasPreset(aspectRatio: number): CanvasSize {
  // Calculate aspect ratio for each preset and find the closest match
  let bestMatch = DEFAULT_CANVAS_PRESETS[0]; // Default to 9:16 HD
  let smallestDifference = Math.abs(aspectRatio - bestMatch.width / bestMatch.height);

  for (const preset of DEFAULT_CANVAS_PRESETS) {
    const presetAspectRatio = preset.width / preset.height;
    const difference = Math.abs(aspectRatio - presetAspectRatio);

    if (difference < smallestDifference) {
      smallestDifference = difference;
      bestMatch = preset;
    }
  }

  // If the difference is still significant (> 0.1), create a custom size
  // based on the media aspect ratio with a reasonable resolution
  const bestAspectRatio = bestMatch.width / bestMatch.height;
  if (Math.abs(aspectRatio - bestAspectRatio) > 0.1) {
    // Create custom dimensions based on the aspect ratio
    if (aspectRatio > 1) {
      // Landscape ultra-wide rail — use native rail width
      return { width: RAIL_WIDTH, height: Math.round(RAIL_WIDTH / aspectRatio) };
    }
    // Portrait or square - use 1080 height
    return { width: Math.round(1080 * aspectRatio), height: 1080 };
  }

  return { width: bestMatch.width, height: bestMatch.height };
}
