"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useProjectStore } from "@/stores/project-store";
import { usePanelStore } from "@/stores/panel-store";
import { Button } from "@/components/ui/button";
import { ExportPopover } from "./export-popover";
import { TaskbarPopover } from "./taskbar-popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "next-themes";
import {
  RiArchiveDrawerLine,
  RiHomeLine,
  RiMenuLine,
  RiLayout3Line,
  RiMoonLine,
  RiSunLine,
  RiComputerLine,
  RiSaveLine,
  RiLoader5Line,
} from "@remixicon/react";
import { RiArrowDownSLine } from "@remixicon/react";
import { core } from "@/lib/project";
import { useOptionalProjectContext } from "@/lib/project-context";
import { saveProject } from "@/lib/project-client";
import { snapshotHornbrookerInstance } from "@/lib/hornbrooker-template";
import { useHornbrookerStore } from "@/stores/hornbrooker-store";
import { useAssetsStore } from "@/stores/assets-store";
import { ExportsHistoryMenu } from "./exports-history-menu";
import { toast } from "sonner";
import { normalizeProjectData } from "@/lib/normalize-project-data";

export default function Header() {
  const { projectName, setProjectName } = useProjectStore();
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [userLabel, setUserLabel] = useState<string>("");
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const projectCtx = useOptionalProjectContext();

  const {
    showLeftPanel,
    showRightPanel,
    showTimeline,
    toggleLeftPanel,
    toggleRightPanel,
    toggleTimeline,
    resetLayout,
  } = usePanelStore();

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (d?.user?.displayName) setUserLabel(d.user.displayName);
      })
      .catch(() => undefined);
  }, []);

  const handleSave = async () => {
    if (!projectCtx?.projectId) return;
    setSaving(true);
    try {
      const studio = core.project.export();
      const horn = snapshotHornbrookerInstance(useHornbrookerStore.getState());
      const assets = useAssetsStore.getState().files.filter((f) => !f.id.startsWith("temp_"));
      const saved = await saveProject(projectCtx.projectId, {
        title: projectName || "Untitled project",
        studio: normalizeProjectData(studio),
        hornbrooker: horn,
        assets,
      });
      projectCtx.setDirty(false);
      projectCtx.setLastSavedAt(saved.updatedAt);
      toast.success("Project saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleNewProject = async () => {
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Untitled project" }),
      });
      const dataJson = await res.json();
      if (!res.ok) throw new Error(dataJson.error || "Create failed");
      router.push(`/editor/${dataJson.project.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create project");
    }
  };

  const handleExportJSON = () => {
    try {
      const projectData = core.project.export();
      const jsonString = JSON.stringify(projectData, null, 2);
      const blob = new Blob([jsonString], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${projectName || "project"}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to export project:", err);
    }
  };

  const handleLoadJSON = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const projectData = JSON.parse(text);

        const name = projectData.name || file.name.replace(/\.json$/i, "");
        setProjectName(name);

        core.project.import(projectData);
        projectCtx?.setDirty(true);
      } catch (err) {
        console.error("Failed to load project JSON:", err);
        alert("Invalid project file");
      }
    };
    input.click();
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "e") {
        e.preventDefault();
        setIsExportOpen(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void handleSave();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  return (
    <div className="h-13 border-b shrink-0">
      <div className="h-full grid grid-cols-3 items-center px-4">
        <div className="flex items-center justify-start gap-0.5">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/">
              <RiHomeLine className="size-4.5" />
              <span className="sr-only">Home</span>
            </Link>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <RiMenuLine className="size-4" />
                <span className="sr-only">Menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56 text-xs">
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="text-xs">
                  <span className="flex-1">Theme</span>
                  {theme === "dark" ? (
                    <RiMoonLine className="size-4 text-muted-foreground" />
                  ) : theme === "light" ? (
                    <RiSunLine className="size-4 text-muted-foreground" />
                  ) : (
                    <RiComputerLine className="size-4 text-muted-foreground" />
                  )}
                </DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent className="w-36 text-xs">
                    <DropdownMenuItem className="text-xs" onClick={() => setTheme("light")}>
                      <RiSunLine className="mr-2 size-4" />
                      <span className="flex-1">Light</span>
                      {theme === "light" && <span className="text-xs">✓</span>}
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-xs" onClick={() => setTheme("dark")}>
                      <RiMoonLine className="mr-2 size-4" />
                      <span className="flex-1">Dark</span>
                      {theme === "dark" && <span className="text-xs">✓</span>}
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-xs" onClick={() => setTheme("system")}>
                      <RiComputerLine className="mr-2 size-4" />
                      <span className="flex-1">System</span>
                      {theme === "system" && <span className="text-xs">✓</span>}
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-xs" onClick={() => void handleNewProject()}>
                <span>New Project</span>
              </DropdownMenuItem>
              <DropdownMenuItem className="text-xs" onClick={handleLoadJSON}>
                <span>Load from JSON</span>
              </DropdownMenuItem>
              <DropdownMenuItem className="text-xs" onClick={handleExportJSON}>
                <span>Export to JSON</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="text-xs flex items-center gap-1">
                <RiLayout3Line className="size-4" />
                <span>View</span>
                <RiArrowDownSLine className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56 text-xs">
              <DropdownMenuItem className="text-xs" onClick={toggleLeftPanel}>
                <span className="flex-1">Left Panel</span>
                {showLeftPanel && <span className="text-xs">✓</span>}
              </DropdownMenuItem>
              <DropdownMenuItem className="text-xs" onClick={toggleRightPanel}>
                <span className="flex-1">Right Panel</span>
                {showRightPanel && <span className="text-xs">✓</span>}
              </DropdownMenuItem>
              <DropdownMenuItem className="text-xs" onClick={toggleTimeline}>
                <span className="flex-1">Timeline</span>
                {showTimeline && <span className="text-xs">✓</span>}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-xs" onClick={resetLayout}>
                <span>Reset Layout</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-center justify-center gap-1.5 text-xs font-semibold">
          <span className="font-medium text-muted-foreground">{userLabel || "Team"}</span>
          <span className="px-1">/</span>
          <input
            className="bg-transparent text-foreground truncate max-w-[200px] outline-none border-b border-transparent focus:border-border"
            value={projectName || ""}
            onChange={(e) => {
              setProjectName(e.target.value);
              projectCtx?.setDirty(true);
            }}
            placeholder="Untitled project"
          />
          {projectCtx?.dirty ? (
            <span className="text-[10px] text-amber-500 font-normal">Unsaved</span>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1.5"
            disabled={saving || !projectCtx?.projectId}
            onClick={() => void handleSave()}
          >
            {saving ? (
              <RiLoader5Line className="size-3.5 animate-spin" />
            ) : (
              <RiSaveLine className="size-3.5" />
            )}
            Save
          </Button>

          <ExportsHistoryMenu />

          <TaskbarPopover>
            <RiArchiveDrawerLine className="size-4" />
            <span className="sr-only">Tasks</span>
          </TaskbarPopover>

          <ExportPopover open={isExportOpen} onOpenChange={setIsExportOpen}>
            <Button className="h-7 text-xs font-semibold px-3 rounded-md flex items-center gap-2">
              <span>Export</span>
            </Button>
          </ExportPopover>
        </div>
      </div>
    </div>
  );
}
