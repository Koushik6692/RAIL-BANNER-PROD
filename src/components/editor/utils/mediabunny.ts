import { ALL_FORMATS, BlobSource, Input, UrlSource, VideoSample, VideoSampleSink } from "mediabunny";
import { getLocalMediaFile, registerLocalMediaFile } from "@/lib/local-media-registry";
import { idbGetMedia } from "@/lib/local-media-idb";
import { resolveMediaUrl } from "@/lib/media-url";

type Options = {
  track: { width: number; height: number };
  container: string;
  durationInSeconds: number | null;
};

export type ExtractFramesTimestampsInSecondsFn = (options: Options) => Promise<number[]> | number[];

export type ExtractFramesProps = {
  src: string;
  timestampsInSeconds: number[] | ExtractFramesTimestampsInSecondsFn;
  onVideoSample: (sample: VideoSample) => void;
  signal?: AbortSignal;
};

async function resolveLocalFile(src: string, resolved: string): Promise<File | undefined> {
  const fromMemory =
    getLocalMediaFile(src) ||
    getLocalMediaFile(resolved) ||
    (typeof src === "string" && src.includes("/")
      ? getLocalMediaFile(decodeURIComponent(src.split("/").pop() || ""))
      : undefined);
  if (fromMemory) return fromMemory;

  const keys = [src, resolved];
  if (src.includes("/")) {
    try {
      keys.push(decodeURIComponent(src.split("/").pop() || ""));
    } catch {
      /* ignore */
    }
  }

  for (const key of keys) {
    if (!key) continue;
    const fromIdb = await idbGetMedia(key).catch(() => undefined);
    if (fromIdb) {
      registerLocalMediaFile(src, fromIdb);
      registerLocalMediaFile(resolved, fromIdb);
      if (fromIdb.name) registerLocalMediaFile(fromIdb.name, fromIdb);
      return fromIdb;
    }
  }

  return undefined;
}

export async function extractFrames({
  src,
  timestampsInSeconds,
  onVideoSample,
  signal,
}: ExtractFramesProps): Promise<void> {
  const resolved = resolveMediaUrl(src);
  const localFile = await resolveLocalFile(src, resolved);

  using input = new Input({
    formats: ALL_FORMATS,
    // Prefer local File when we still have the upload in memory — avoids R2 CORS / huge fetch failures
    source: localFile ? new BlobSource(localFile) : new UrlSource(resolved),
  });

  const [durationInSeconds, format, videoTrack] = await Promise.all([
    input.computeDuration(),
    input.getFormat(),
    input.getPrimaryVideoTrack(),
  ]);

  if (!videoTrack) {
    throw new Error("No video track found in the input");
  }

  if (signal?.aborted) {
    throw new Error("Aborted");
  }

  const timestamps =
    typeof timestampsInSeconds === "function"
      ? await timestampsInSeconds({
          track: {
            width: videoTrack.displayWidth,
            height: videoTrack.displayHeight,
          },
          container: format.name,
          durationInSeconds,
        })
      : timestampsInSeconds;

  if (timestamps.length === 0) {
    return;
  }

  if (signal?.aborted) {
    throw new Error("Aborted");
  }

  const sink = new VideoSampleSink(videoTrack);

  for await (using videoSample of sink.samplesAtTimestamps(timestamps)) {
    if (signal?.aborted) {
      break;
    }

    if (!videoSample) {
      continue;
    }

    onVideoSample(videoSample);
  }
}
