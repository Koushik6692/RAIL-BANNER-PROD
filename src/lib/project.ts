import { Core, CoreConfig, BrowserMetadataProvider } from "@openvideo/core";
import { useProjectStore } from "@/stores/project-store";
import { data } from "@/components/editor/data";
import { normalizeProjectData } from "@/lib/normalize-project-data";

CoreConfig.setMetadataProvider(new BrowserMetadataProvider());

const initialProject = normalizeProjectData(data);
const { canvasSize, fps } = useProjectStore.getState();

export const core = new Core({
  settings: {
    duration: 30_000_000,
    ...initialProject.settings,
    width: initialProject.settings?.width ?? canvasSize.width,
    height: initialProject.settings?.height ?? canvasSize.height,
    fps: initialProject.settings?.fps ?? fps,
  },
  tracks: initialProject.tracks ?? [],
  clips: initialProject.clips ?? {},
});

export const engine = core;
export const projectStore = core.store;
export const playbackController = core.playback;

if (typeof window !== "undefined") {
  (window as any).core = core;
  (window as any).engine = core;
}
