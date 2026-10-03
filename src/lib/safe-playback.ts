import { toast } from "sonner";
import { core } from "@/lib/project";
import { useStudioStore } from "@/stores/studio-store";
import type { Studio } from "@openvideo/engine-pixi";

const POLL_MS = 50;
const READY_TIMEOUT_MS = 45000;
const STUDIO_PLAY_GRACE_MS = 1500;

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function waitForNextFrames() {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

function getVideoClips(studio: Studio) {
  return studio.clips.filter((clip) => clip.type === "Video");
}

function isVideoElementReady(video: HTMLVideoElement): boolean {
  return (
    Number.isFinite(video.duration) &&
    video.duration > 0 &&
    video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
  );
}

/** True when hidden preview <video> elements can render a frame. */
export function isPlaybackReady(studio: Studio | null | undefined): boolean {
  if (!studio) return false;
  if (studio.getMaxDuration() <= 0) return false;

  const videoClips = getVideoClips(studio);
  if (videoClips.length === 0) return true;

  for (const clip of videoClips) {
    const playback = studio.playbackElements.get(clip);
    if (!playback?.element) return false;

    const video = playback.element as HTMLVideoElement;
    if (!isVideoElementReady(video)) return false;
  }

  return true;
}

let preparingPlayback = false;
const preparingListeners = new Set<(value: boolean) => void>();

export function getIsPreparingPlayback() {
  return preparingPlayback;
}

export function subscribePreparingPlayback(listener: (value: boolean) => void) {
  preparingListeners.add(listener);
  return () => preparingListeners.delete(listener);
}

function setPreparingPlayback(value: boolean) {
  if (preparingPlayback === value) return;
  preparingPlayback = value;
  preparingListeners.forEach((listener) => listener(value));
}

async function waitForPlaybackReady(): Promise<Studio | null> {
  const deadline = Date.now() + READY_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const studio = useStudioStore.getState().studio;
    if (studio && isPlaybackReady(studio)) {
      return studio;
    }
    await delay(POLL_MS);
  }

  return useStudioStore.getState().studio;
}

function localVideoTimeSec(
  clip: { display: { from: number }; trim: { from: number } },
  timeUs: number,
) {
  return Math.max(0, (timeUs - clip.display.from) / 1_000_000 + clip.trim.from / 1_000_000);
}

async function primeVideoFrames(studio: Studio, timeUs: number) {
  const jobs = getVideoClips(studio).map(async (clip) => {
    const playback = studio.playbackElements.get(clip);
    if (!playback?.element) return;

    const video = playback.element as HTMLVideoElement;
    const targetSec = localVideoTimeSec(clip, timeUs);

    if (Math.abs(video.currentTime - targetSec) <= 0.04) return;

    await new Promise<void>((resolve) => {
      const finish = () => {
        video.removeEventListener("seeked", finish);
        resolve();
      };
      video.addEventListener("seeked", finish, { once: true });
      try {
        video.currentTime = targetSec;
      } catch {
        finish();
        return;
      }
      window.setTimeout(finish, 2000);
    });
  });

  await Promise.all(jobs);
}

async function syncSeek(studio: Studio, timeUs: number) {
  await studio.seek(timeUs);
  core.seek(timeUs);
  await waitForNextFrames();
}

/** Studio.play is async; core bridge fires it without await — wait before reconciling. */
async function startStudioPlayback(studio: Studio) {
  await studio.play();
  const deadline = Date.now() + STUDIO_PLAY_GRACE_MS;
  while (Date.now() < deadline) {
    if (studio.getIsPlaying()) return true;
    await delay(POLL_MS);
  }
  return studio.getIsPlaying();
}

/**
 * Start playback once clips are mounted and the first video frame is decoded.
 */
export async function safePlay(): Promise<boolean> {
  if (preparingPlayback) return false;

  const intendedTimeUs = core.store.getState().currentTime;
  setPreparingPlayback(true);

  try {
    const studio = await waitForPlaybackReady();
    if (!studio || !isPlaybackReady(studio)) {
      toast.error("Video is still loading. Wait a moment and press play again.");
      return false;
    }

    await syncSeek(studio, intendedTimeUs);
    await primeVideoFrames(studio, intendedTimeUs);

    core.play();
    const started = await startStudioPlayback(studio);

    if (!started) {
      core.pause();
      toast.error("Playback could not start. Try seeking once, then play again.");
      return false;
    }

    return true;
  } finally {
    setPreparingPlayback(false);
  }
}

export async function safeTogglePlayback(): Promise<void> {
  if (core.store.getState().isPlaying) {
    core.pause();
    useStudioStore.getState().studio?.pause();
    return;
  }
  await safePlay();
}

/** Poll studio until remote/R2 video elements are decoded (for UI loaders). */
export function watchPlaybackReady(onChange: (ready: boolean) => void): () => void {
  let cancelled = false;
  let last = false;

  const tick = () => {
    if (cancelled) return;
    const studio = useStudioStore.getState().studio;
    const ready = isPlaybackReady(studio);
    if (ready !== last) {
      last = ready;
      onChange(ready);
    }
    window.setTimeout(tick, POLL_MS);
  };

  tick();
  return () => {
    cancelled = true;
  };
}
