import { Studio } from "@openvideo/engine-pixi";
import { normalizeProjectTracks } from "@/lib/normalize-project-data";

type StudioTrackRow = {
  clipIds?: string[];
  id?: string;
  type?: string;
  name?: string;
  static?: boolean;
};

type TimelineModelLike = {
  tracks: StudioTrackRow[];
  clips: { id: string }[];
  studio: { isRestoring?: boolean; emit: (event: string, payload?: unknown) => void };
  recalculateMaxDuration: () => Promise<void>;
};

/** Drop null rows and ensure every track has clipIds: []. */
export function sanitizeStudioTracks(tracks: unknown): StudioTrackRow[] {
  return normalizeProjectTracks(Array.isArray(tracks) ? (tracks as StudioTrackRow[]) : []);
}

/** Safe replacement for @openvideo/engine-pixi TimelineModel.reconcileTracks(). */
function reconcileTracksSafe(this: TimelineModelLike) {
  const clipIdSet = new Set(
    (this.clips ?? [])
      .filter((clip): clip is { id: string } => clip != null && typeof clip.id === "string")
      .map((clip) => clip.id),
  );

  this.tracks = sanitizeStudioTracks(this.tracks);

  for (let i = this.tracks.length - 1; i >= 0; i--) {
    const track = this.tracks[i];
    if (!track) {
      this.tracks.splice(i, 1);
      continue;
    }

    const clipIds = Array.isArray(track.clipIds) ? track.clipIds : [];
    const filtered = clipIds.filter((id) => clipIdSet.has(id));
    if (filtered.length !== clipIds.length) {
      track.clipIds = filtered;
    }

    if (filtered.length === 0 && track.static !== true) {
      const trackId = track.id;
      this.tracks.splice(i, 1);
      if (!this.studio?.isRestoring && trackId) {
        this.studio.emit("track:removed", { trackId });
      }
    }
  }

  if (this.tracks.length === 0 && !this.studio?.isRestoring) {
    this.studio.emit("track:order-changed", { tracks: this.tracks });
  }
}

let studioPrototypePatched = false;
let timelinePrototypePatched = false;

function patchTimelinePrototype(timeline: { reconcileTracks: () => void }) {
  if (timelinePrototypePatched) return;
  timelinePrototypePatched = true;

  const proto = Object.getPrototypeOf(timeline) as {
    setTracks: (tracks: unknown) => Promise<void>;
    reconcileTracks: () => void;
    __openvideoTracksPatched?: boolean;
  };

  if (proto.__openvideoTracksPatched) return;
  proto.__openvideoTracksPatched = true;

  proto.reconcileTracks = reconcileTracksSafe;

  proto.setTracks = async function (tracks: unknown) {
    const model = this as unknown as TimelineModelLike & {
      studio: TimelineModelLike["studio"] & {
        updateFrame: (time: number) => Promise<void>;
        currentTime: number;
      };
    };

    const safe = sanitizeStudioTracks(tracks);
    const backup = sanitizeStudioTracks(model.tracks);
    model.tracks = JSON.parse(JSON.stringify(safe)) as StudioTrackRow[];
    reconcileTracksSafe.call(model);

    if (model.tracks.length === 0 && model.clips.length > 0) {
      model.tracks = JSON.parse(JSON.stringify(backup)) as StudioTrackRow[];
      reconcileTracksSafe.call(model);
    }

    await model.recalculateMaxDuration();
    if (!model.studio.isRestoring) {
      model.studio.emit("track:order-changed", { tracks: model.tracks });
    }
    await model.studio.updateFrame(model.studio.currentTime);
  };
}

/** Patch Studio + TimelineModel before bridge syncInitialState runs. */
export function ensureStudioTracksPatched(studio?: Studio) {
  if (typeof window === "undefined") return;

  if (studio && !timelinePrototypePatched) {
    patchTimelinePrototype(
      studio.timeline as unknown as { reconcileTracks: () => void },
    );
  }

  if (studioPrototypePatched) return;
  studioPrototypePatched = true;

  const proto = Studio.prototype as unknown as {
    setTracks: (tracks: unknown) => Promise<void>;
  };
  const originalSetTracks = proto.setTracks;
  proto.setTracks = async function (tracks: unknown) {
    return originalSetTracks.call(this, sanitizeStudioTracks(tracks));
  };
}
