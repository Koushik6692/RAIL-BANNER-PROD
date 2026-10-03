"use client";
import { useState, useEffect, useCallback } from "react";
import { Resizable } from "@/components/editor/resizable-panel";
import { MediaPanel } from "@/components/editor/media-panel";
import { CanvasPanel } from "@/components/editor/canvas-panel";
import Timeline from "@/components/editor/timeline";
import { usePanelStore } from "@/stores/panel-store";
import { Loading } from "@/components/editor/loading";
import FloatingControl from "@/components/editor/floating-controls/floating-control";
import { Compositor } from "@openvideo/engine-pixi";
import { WebCodecsUnsupportedModal } from "@/components/editor/webcodecs-unsupported-modal";
import { RightPanel } from "./right-panel";
import { core } from "@/lib/project";
import { useProjectStore } from "@/stores/project-store";
import Header from "./header";
import { data } from "./data";
import { RAIL_CANVAS } from "@/lib/rail-constants";
import { normalizeProjectData } from "@/lib/normalize-project-data";
import { fetchProject } from "@/lib/project-client";
import { ProjectContext } from "@/lib/project-context";
import { useHornbrookerStore } from "@/stores/hornbrooker-store";
import { useAssetsStore } from "@/stores/assets-store";
import { normalizeInstanceData } from "@/lib/hornbrooker-template";
import { toast } from "sonner";

export default function Editor({ projectId }: { projectId: string }) {
  const resetProject = useProjectStore((state) => state.resetProject);
  const setProjectName = useProjectStore((state) => state.setProjectName);
  const { editorMode, showLeftPanel, showRightPanel, showTimeline } = usePanelStore();

  const [isReady, setIsReady] = useState(false);
  const [isWebCodecsSupported, setIsWebCodecsSupported] = useState(true);
  const [projectLoaded, setProjectLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      resetProject();
      useProjectStore.getState().setCanvasSize({ ...RAIL_CANVAS }, "rail");

      try {
        const project = await fetchProject(projectId);
        if (cancelled) return;

        setProjectName(project.title || "Untitled project");
        setLastSavedAt(project.updatedAt || null);

        if (project.studio && typeof project.studio === "object") {
          core.project.import(normalizeProjectData(project.studio));
        } else {
          core.project.import(normalizeProjectData(data));
        }

        core.execute({
          id: crypto.randomUUID(),
          type: "project.updateSettings",
          payload: {
            width: RAIL_CANVAS.width,
            height: RAIL_CANVAS.height,
            backgroundColor: "#000000",
          },
        });

        if (project.hornbrooker) {
          useHornbrookerStore
            .getState()
            .loadInstance(projectId, normalizeInstanceData(project.hornbrooker), 0);
        }

        if (Array.isArray(project.assets) && project.assets.length) {
          useAssetsStore.getState().setFiles(project.assets);
        }

        setProjectLoaded(true);
        setDirty(false);
      } catch (e) {
        console.error(e);
        toast.error(e instanceof Error ? e.message : "Failed to load project");
        core.project.import(normalizeProjectData(data));
        core.execute({
          id: crypto.randomUUID(),
          type: "project.updateSettings",
          payload: {
            width: RAIL_CANVAS.width,
            height: RAIL_CANVAS.height,
            backgroundColor: "#000000",
          },
        });
        setProjectLoaded(true);
      }
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, [projectId, resetProject, setProjectName]);

  useEffect(() => {
    const checkSupport = async () => {
      const isSupported = await Compositor.isSupported();
      setIsWebCodecsSupported(isSupported);
    };
    checkSupport();
  }, []);

  useEffect(() => {
    if (editorMode !== "editor") {
      setIsReady(true);
    }
  }, [editorMode]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // Mark dirty on core mutations (lightweight poll of export fingerprint)
  useEffect(() => {
    if (!projectLoaded) return;
    let last = "";
    try {
      last = JSON.stringify(core.project.export());
    } catch {
      /* ignore */
    }
    const t = window.setInterval(() => {
      try {
        const next = JSON.stringify(core.project.export());
        if (last && next !== last) {
          setDirty(true);
          last = next;
        } else if (!last) {
          last = next;
        }
      } catch {
        /* ignore */
      }
    }, 2000);
    return () => window.clearInterval(t);
  }, [projectLoaded]);

  const markClean = useCallback((iso: string) => {
    setDirty(false);
    setLastSavedAt(iso);
  }, []);
  void markClean;

  if (!projectLoaded) {
    return (
      <div className="h-screen w-screen">
        <Loading />
      </div>
    );
  }

  return (
    <ProjectContext.Provider
      value={{
        projectId,
        dirty,
        setDirty,
        lastSavedAt,
        setLastSavedAt,
      }}
    >
      <div className="h-screen w-screen flex flex-col bg-background overflow-hidden">
        {!isReady && (
          <div className="absolute inset-0 z-100">
            <Loading />
          </div>
        )}

        <Header />

        <div className="flex-1 min-h-0 flex flex-row overflow-hidden">
          {showLeftPanel && (
            <Resizable
              orientation="horizontal"
              initialSize={300}
              min={180}
              max={520}
              direction="right"
            >
              <MediaPanel />
            </Resizable>
          )}

          <div className="flex-1 min-w-0 h-full flex flex-col overflow-hidden">
            <div className="flex-1 min-h-0 overflow-visible">
              <CanvasPanel onReady={() => setIsReady(true)} />
            </div>
            {showTimeline && (
              <Resizable orientation="vertical" initialSize={260} min={200} max={500} direction="up">
                <Timeline />
              </Resizable>
            )}
          </div>

          {showRightPanel && (
            <Resizable
              orientation="horizontal"
              initialSize={280}
              min={180}
              max={520}
              direction="left"
              className="right-resizable-panel"
            >
              <RightPanel />
            </Resizable>
          )}
        </div>

        <FloatingControl />
        <WebCodecsUnsupportedModal open={!isWebCodecsSupported} />
      </div>
    </ProjectContext.Provider>
  );
}
