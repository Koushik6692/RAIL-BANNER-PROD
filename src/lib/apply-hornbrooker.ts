import { core, projectStore } from "@/lib/project";
import { RAIL_HEIGHT, RAIL_WIDTH } from "@/lib/rail-constants";
import {
  createDefaultPriceTags,
  isHornbrookerClip,
  normalizeInstanceData,
  snapshotHornbrookerInstance,
  type HornbrookerInstanceData,
} from "@/lib/hornbrooker-template";
import {
  dataUrlToObjectUrl,
  renderHornbrookerBannerDataUrl,
} from "@/lib/render-hornbrooker-banner";
import { useHornbrookerStore } from "@/stores/hornbrooker-store";

/** Tiny placeholder for drag MIME; real banner renders on drop. */
const TINY_TEAL_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

function findTrackIndexForClip(clipId: string): number | undefined {
  const tracks = (projectStore.getState() as any).tracks as any[] | undefined;
  if (!tracks?.length) return undefined;
  const idx = tracks.findIndex((t) => Array.isArray(t?.clipIds) && t.clipIds.includes(clipId));
  return idx >= 0 ? idx : undefined;
}

function latestBannerEndSeconds(): number | null {
  const state = projectStore.getState() as any;
  const clips = state?.clips ? Object.values(state.clips) : [];
  let maxEnd: number | null = null;
  for (const c of clips as any[]) {
    if (!isHornbrookerClip(c)) continue;
    const to = Number(c?.timing?.display?.to ?? 0) / 1_000_000;
    if (!Number.isFinite(to)) continue;
    maxEnd = maxEnd == null ? to : Math.max(maxEnd, to);
  }
  return maxEnd;
}

function resolveUpdateTargetId(): string | null {
  const { selectedIds, clips } = projectStore.getState() as any;
  const selected = (selectedIds as string[] | undefined)?.find((id) =>
    isHornbrookerClip(clips?.[id]),
  );
  if (selected) return selected;

  const active = useHornbrookerStore.getState().activeClipId;
  if (active && clips?.[active] && isHornbrookerClip(clips[active])) return active;

  const applied = useHornbrookerStore.getState().appliedClipIds;
  for (let i = applied.length - 1; i >= 0; i--) {
    const id = applied[i];
    if (clips?.[id] && isHornbrookerClip(clips[id])) return id;
  }

  const all = clips ? (Object.values(clips) as any[]) : [];
  return all.find((c) => isHornbrookerClip(c))?.id ?? null;
}

async function buildSrcAndMeta() {
  const state = useHornbrookerStore.getState();
  const dataUrl = await renderHornbrookerBannerDataUrl(state);
  const src = dataUrlToObjectUrl(dataUrl);
  const hornbrooker = snapshotHornbrookerInstance(state);
  return { src, hornbrooker };
}

function snapStartSeconds(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) return 0;
  if (seconds < 1.05) return 0;
  return seconds;
}

/**
 * Add a new rail banner, or update the selected/active one.
 * Update rebuilds the image while keeping transform + timeline position.
 */
export async function applyHornbrookerTemplate(options?: {
  startSeconds?: number;
  /** true = update selected/active banner; false = add another */
  replacePrevious?: boolean;
}) {
  const state = useHornbrookerStore.getState();
  const isUpdate = options?.replacePrevious === true;

  if (isUpdate) {
    const clipId = resolveUpdateTargetId();
    if (!clipId) {
      throw new Error("Select a rail banner on the timeline first, then Update.");
    }

    const existing = (projectStore.getState() as any).clips?.[clipId];
    if (!existing) {
      throw new Error("Selected banner clip was not found.");
    }

    const { src, hornbrooker } = await buildSrcAndMeta();
    const trackIndex = findTrackIndexForClip(clipId);

    const timing = {
      display: {
        from: Number(existing.timing?.display?.from ?? 0),
        to: Number(
          existing.timing?.display?.to ??
            (existing.timing?.display?.from ?? 0) + (existing.timing?.duration ?? 6_000_000),
        ),
      },
      trim: {
        from: Number(existing.timing?.trim?.from ?? 0),
        to: Number(existing.timing?.trim?.to ?? existing.timing?.duration ?? 6_000_000),
      },
      duration: Number(existing.timing?.duration ?? 6_000_000),
      playbackRate: existing.timing?.playbackRate ?? 1,
    };

    const transform = {
      x: existing.transform?.x ?? 0,
      y: existing.transform?.y ?? 0,
      width: RAIL_WIDTH,
      height: RAIL_HEIGHT,
      angle: existing.transform?.angle ?? 0,
      opacity: existing.transform?.opacity ?? 1,
      zIndex: existing.transform?.zIndex ?? 100,
      flip: existing.transform?.flip ?? { x: false, y: false },
    };

    try {
      core.clip.remove([clipId]);
    } catch {
      // ignore
    }

    await core.clip.add(
      {
        id: clipId,
        type: "Image",
        name: "Hornbrooker · rail banner",
        src,
        width: RAIL_WIDTH,
        height: RAIL_HEIGHT,
        left: transform.x,
        top: transform.y,
        metadata: {
          ...(existing?.metadata || {}),
          isHornbrookerBundle: true,
          hornbrookerTemplateId: "HORNBROOKER_RAIL",
          hornbrooker,
        },
        timing,
        transform,
      } as any,
      {
        ...(trackIndex !== undefined ? { trackIndex } : {}),
      },
    );

    const prev = useHornbrookerStore.getState().appliedClipIds;
    if (!prev.includes(clipId)) {
      useHornbrookerStore.getState().setAppliedClipIds([...prev, clipId]);
    }
    useHornbrookerStore.getState().setActiveClipId(clipId);
    try {
      projectStore.getState().select([clipId]);
    } catch {
      // ignore
    }
    return 1;
  }

  let startSeconds: number;
  if (options?.startSeconds != null) {
    startSeconds = snapStartSeconds(options.startSeconds);
  } else {
    const end = latestBannerEndSeconds();
    startSeconds = end != null ? end : 0;
  }

  const durationSeconds = Math.max(0.5, state.durationSeconds);
  const from = Math.round(startSeconds * 1_000_000);
  const duration = Math.round(durationSeconds * 1_000_000);
  const { src, hornbrooker } = await buildSrcAndMeta();
  const clipId = crypto.randomUUID();

  await core.clip.add(
    {
      id: clipId,
      type: "Image",
      name: "Hornbrooker · rail banner",
      src,
      metadata: {
        isHornbrookerBundle: true,
        hornbrookerTemplateId: "HORNBROOKER_RAIL",
        hornbrooker,
      },
      timing: {
        display: { from, to: from + duration },
        trim: { from: 0, to: duration },
        duration,
        playbackRate: 1,
      },
      transform: {
        x: 0,
        y: 0,
        width: RAIL_WIDTH,
        height: RAIL_HEIGHT,
        angle: 0,
        opacity: 1,
        zIndex: 100,
        flip: { x: false, y: false },
      },
    } as any,
    {},
  );

  const prev = useHornbrookerStore.getState().appliedClipIds;
  useHornbrookerStore.getState().setAppliedClipIds([...prev, clipId]);
  useHornbrookerStore.getState().setActiveClipId(clipId);
  useHornbrookerStore.getState().setTiming(startSeconds, durationSeconds);
  try {
    projectStore.getState().select([clipId]);
  } catch {
    // ignore
  }
  return 1;
}

export function loadHornbrookerFromClip(clip: any): boolean {
  if (!isHornbrookerClip(clip)) return false;

  const fromUs = Number(clip?.timing?.display?.from ?? 0);
  const toUs = Number(clip?.timing?.display?.to ?? fromUs);
  const startSeconds = fromUs / 1_000_000;
  const durationFromTiming = Math.max(0.5, (toUs - fromUs) / 1_000_000);

  const stored = clip?.metadata?.hornbrooker as HornbrookerInstanceData | undefined;
  if (stored?.priceTags?.length) {
    useHornbrookerStore.getState().loadInstance(clip.id, normalizeInstanceData(stored), startSeconds);
    useHornbrookerStore.getState().setTiming(startSeconds, durationFromTiming);
    return true;
  }

  useHornbrookerStore.getState().loadInstance(
    clip.id,
    normalizeInstanceData({
      priceTags: createDefaultPriceTags(),
      durationSeconds: durationFromTiming,
    }),
    startSeconds,
  );
  return true;
}

export function buildHornbrookerDragPayload() {
  return {
    type: "Image",
    name: "Hornbrooker · rail banner",
    src: TINY_TEAL_PNG,
    duration: useHornbrookerStore.getState().durationSeconds || 6,
    metadata: {
      hornbrookerTemplateId: "HORNBROOKER_RAIL",
      isHornbrookerBundle: true,
    },
  };
}

export function isHornbrookerDropPayload(payload: any): boolean {
  if (!payload) return false;
  if (payload?.metadata?.isHornbrookerBundle) return true;
  if (payload?.metadata?.hornbrookerTemplateId) return true;
  const name = typeof payload?.name === "string" ? payload.name.toLowerCase() : "";
  return (
    name.startsWith("hornbrooker_") ||
    name.includes("rail banner") ||
    name.includes("hornbrooker")
  );
}

/** Kept for drop handlers; template variants were removed. */
export function extractHornbrookerTemplateId(_payload: any): "HORNBROOKER_RAIL" | null {
  return "HORNBROOKER_RAIL";
}
