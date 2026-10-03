"use client";

import { useCallback, useEffect, useState } from "react";
import { RiDownloadLine, RiHistoryLine, RiLoader5Line } from "@remixicon/react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useOptionalProjectContext } from "@/lib/project-context";
import type { ProjectExportEntry } from "@/lib/project-store";

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export function ExportsHistoryMenu() {
  const projectCtx = useOptionalProjectContext();
  const [exportsList, setExportsList] = useState<ProjectExportEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!projectCtx?.projectId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectCtx.projectId}/exports`);
      const data = await res.json();
      if (res.ok) setExportsList(Array.isArray(data.exports) ? data.exports : []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [projectCtx?.projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!projectCtx?.projectId) return null;

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) void load();
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7">
          {loading ? (
            <RiLoader5Line className="size-4 animate-spin" />
          ) : (
            <RiHistoryLine className="size-4" />
          )}
          <span className="sr-only">Export history</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 text-xs">
        <DropdownMenuLabel className="text-xs">Export history</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {exportsList.length === 0 ? (
          <div className="px-2 py-3 text-muted-foreground">No exports yet</div>
        ) : (
          [...exportsList].reverse().map((ex) => (
            <DropdownMenuItem key={ex.id} className="text-xs" asChild>
              <a href={ex.url} target="_blank" rel="noreferrer" className="flex items-start gap-2">
                <RiDownloadLine className="size-3.5 mt-0.5 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{ex.fileName}</span>
                  <span className="block text-[10px] text-muted-foreground">
                    {formatWhen(ex.createdAt)} · {ex.createdBy}
                  </span>
                </span>
              </a>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
