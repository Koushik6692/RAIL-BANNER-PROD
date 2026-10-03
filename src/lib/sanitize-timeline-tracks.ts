import type { TimelineBridge } from "@openvideo/timeline";
import { TimelineBridge as TimelineBridgeClass } from "@openvideo/timeline";
import type CanvasTimeline from "@/components/editor/timeline/items/timeline";
import { normalizeProjectTracks } from "@/lib/normalize-project-data";

type TrackRow = { clipIds?: string[]; magnetic?: boolean; id?: string; type?: string };

function sanitizeTracks(tracks: unknown): TrackRow[] {
  return normalizeProjectTracks(Array.isArray(tracks) ? (tracks as TrackRow[]) : []);
}

let bridgePrototypePatched = false;

/** Must run before `new TimelineBridge()` — constructor calls syncInitialState immediately. */
export function ensureTimelineBridgePatched() {
  if (bridgePrototypePatched || typeof window === "undefined") return;
  bridgePrototypePatched = true;

  const proto = TimelineBridgeClass.prototype as unknown as {
    transformState: (state: { tracks?: unknown }) => unknown;
  };
  const originalTransform = proto.transformState;
  proto.transformState = function (state) {
    const next = originalTransform.call(this, {
      ...state,
      tracks: sanitizeTracks(state?.tracks),
    }) as { tracks?: unknown };
    if (next && typeof next === "object") {
      next.tracks = sanitizeTracks(next.tracks);
    }
    return next;
  };
}

/** Patch timeline manager so track rows always include clipIds before layout. */
export function sanitizeTimelineTrackManager(canvas: CanvasTimeline) {
  const tm = (canvas as unknown as { tracksManager?: Record<string, (...args: unknown[]) => unknown> })
    .tracksManager;
  if (!tm) return;

  const sanitizeCanvasTracks = () => {
    const canvasTracks = (canvas as unknown as { tracks?: TrackRow[] }).tracks;
    if (!Array.isArray(canvasTracks)) return;
    (canvas as unknown as { tracks: TrackRow[] }).tracks = sanitizeTracks(canvasTracks);
  };

  for (const method of ["renderTracks", "adjustMagneticTrack", "filterEmptyTracks"] as const) {
    const original = tm[method]?.bind(tm);
    if (!original) continue;
    tm[method] = (...args: unknown[]) => {
      sanitizeCanvasTracks();
      return original(...args);
    };
  }
}

/** Patch sync paths that call Vs() inside @openvideo/timeline (undefined track → clipIds crash). */
export function patchCanvasTimelineSync(canvas: CanvasTimeline) {
  const syncManager = (canvas as unknown as { syncManager?: { _setTracks?: (tracks: unknown) => void } })
    .syncManager;
  const itemsManager = (
    canvas as unknown as { itemsManager?: { deleteTrackItemById?: (ids: string[]) => void } }
  ).itemsManager;

  if (syncManager?._setTracks) {
    const originalSetTracks = syncManager._setTracks.bind(syncManager);
    syncManager._setTracks = (tracks: unknown) => {
      originalSetTracks(sanitizeTracks(tracks));
    };
  }

  const syncManagerFull = syncManager as
    | { syncSelection?: (ids: string[]) => void; syncAddOrRemoveClips?: (state: unknown) => void }
    | undefined;

  if (syncManagerFull?.syncSelection) {
    const originalSelection = syncManagerFull.syncSelection.bind(syncManager);
    syncManagerFull.syncSelection = (ids: string[]) => {
      (canvas as unknown as { tracks: TrackRow[] }).tracks = sanitizeTracks(
        (canvas as unknown as { tracks?: TrackRow[] }).tracks,
      );
      return originalSelection(ids);
    };
  }

  if (syncManagerFull?.syncAddOrRemoveClips) {
    const originalSync = syncManagerFull.syncAddOrRemoveClips.bind(syncManager);
    syncManagerFull.syncAddOrRemoveClips = (state: unknown) => {
      const payload = state as { tracks?: unknown };
      return originalSync({
        ...(payload as object),
        tracks: sanitizeTracks(payload?.tracks),
      });
    };
  }

  if (itemsManager?.deleteTrackItemById) {
    const originalDelete = itemsManager.deleteTrackItemById.bind(itemsManager);
    itemsManager.deleteTrackItemById = (ids: string[]) => {
      (canvas as unknown as { tracks: TrackRow[] }).tracks = sanitizeTracks(
        (canvas as unknown as { tracks?: TrackRow[] }).tracks,
      );
      return originalDelete(ids);
    };
  }
}

/** @deprecated Instance patch runs too late; use ensureTimelineBridgePatched() before construction. */
export function patchTimelineBridge(_bridge: TimelineBridge) {
  ensureTimelineBridgePatched();
}
