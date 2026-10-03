import { RAIL_CANVAS } from "@/lib/rail-constants";

/** Empty supermarket shelf-rail project — ultra-wide LED strip. */
export const data = {
  settings: {
    width: RAIL_CANVAS.width,
    height: RAIL_CANVAS.height,    fps: 30,
    backgroundColor: "#000000",
    format: "mp4",
    videoCodec: "avc1.640033",
    bitrate: 8000000,
    audio: true,
    audioCodec: "opus",
    audioSampleRate: 48000,
    prioritizeSpeed: true,
  },
  tracks: [
    {
      id: "track_video_main",
      name: "Video",
      type: "video",
      clipIds: [],
    },
    {
      id: "track_banners",
      name: "Banners",
      type: "text",
      clipIds: [],
    },
  ],
  clips: {},
};
