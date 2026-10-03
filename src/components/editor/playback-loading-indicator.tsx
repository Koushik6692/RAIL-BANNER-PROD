"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useStudioStore } from "@/stores/studio-store";
import {
  getIsPreparingPlayback,
  isPlaybackReady,
  subscribePreparingPlayback,
  watchPlaybackReady,
} from "@/lib/safe-playback";
import { RiLoader5Line } from "@remixicon/react";

/** Small banner + play-button loading state while video decoders warm up. */
export function PlaybackLoadingIndicator() {
  const studio = useStudioStore((s) => s.studio);
  const preparing = useSyncExternalStore(
    subscribePreparingPlayback,
    getIsPreparingPlayback,
    () => false,
  );
  const [mediaReady, setMediaReady] = useState(() => isPlaybackReady(studio));

  useEffect(() => {
    if (!studio) {
      setMediaReady(true);
      return;
    }
    setMediaReady(isPlaybackReady(studio));
    return watchPlaybackReady(setMediaReady);
  }, [studio]);

  const hasVideo = Boolean(studio?.clips.some((c) => c.type === "Video"));
  const showBanner = hasVideo && (!mediaReady || preparing);

  if (!showBanner) return null;

  return (
    <div className="pointer-events-none absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border/50 bg-background/90 px-3 py-1.5 text-xs text-foreground shadow-lg backdrop-blur-md">
      <RiLoader5Line className="size-3.5 animate-spin text-primary" aria-hidden />
      <span>{preparing ? "Starting playback…" : "Loading video — ready to play soon"}</span>
    </div>
  );
}

export function usePlaybackControls() {
  const preparing = useSyncExternalStore(
    subscribePreparingPlayback,
    getIsPreparingPlayback,
    () => false,
  );

  return { preparing };
}
