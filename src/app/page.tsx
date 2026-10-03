"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RiAddLine, RiFilmLine, RiLoader5Line, RiLogoutBoxRLine } from "@remixicon/react";
import { Button } from "@/components/ui/button";
import type { ProjectIndexEntry } from "@/lib/project-store";

type SessionUser = { username: string; displayName: string };

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export default function HomePage() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [projects, setProjects] = useState<ProjectIndexEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [meRes, listRes] = await Promise.all([
        fetch("/api/auth/me"),
        fetch("/api/projects"),
      ]);
      const me = await meRes.json();
      if (me.authRequired && !me.user) {
        router.replace("/login");
        return;
      }
      setUser(me.user);
      if (!listRes.ok) {
        const err = await listRes.json().catch(() => ({}));
        throw new Error(err.error || "Failed to load projects");
      }
      const data = await listRes.json();
      setProjects(Array.isArray(data.projects) ? data.projects : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  const createProject = async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Untitled project" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Create failed");
      router.push(`/editor/${data.project.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
      setCreating(false);
    }
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-sm font-semibold tracking-wide">Rail Banner Studio</h1>
            <p className="text-[11px] text-muted-foreground">
              Shared projects · {user?.displayName || "…"}
            </p>
          </div>
          <Button variant="ghost" size="sm" className="text-xs gap-1.5" onClick={() => void logout()}>
            <RiLogoutBoxRLine className="size-3.5" />
            Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 space-y-8">
        <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Projects</h2>
            <p className="text-sm text-muted-foreground">
              Everyone on the team can open recent projects and exports.
            </p>
          </div>
          <Button onClick={() => void createProject()} disabled={creating} className="gap-1.5">
            {creating ? (
              <RiLoader5Line className="size-4 animate-spin" />
            ) : (
              <RiAddLine className="size-4" />
            )}
            New project
          </Button>
        </section>

        {error ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
            <RiLoader5Line className="size-5 animate-spin" />
            Loading projects…
          </div>
        ) : projects.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/60 px-6 py-16 text-center">
            <RiFilmLine className="mx-auto size-8 text-muted-foreground/50" />
            <p className="mt-3 text-sm font-medium">No projects yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Create a new project to start editing a shelf-rail banner.
            </p>
            <Button className="mt-4" onClick={() => void createProject()} disabled={creating}>
              New project
            </Button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => router.push(`/editor/${p.id}`)}
                className="group text-left rounded-xl border border-border/50 bg-card/40 p-3 transition hover:border-primary/40 hover:bg-card"
              >
                <div
                  className="mb-3 aspect-[2880/158] w-full overflow-hidden rounded-md bg-secondary/40"
                  style={
                    p.thumbnailUrl
                      ? {
                          backgroundImage: `url(${p.thumbnailUrl})`,
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                        }
                      : undefined
                  }
                />
                <div className="space-y-1">
                  <p className="truncate text-sm font-semibold group-hover:text-primary">
                    {p.title || "Untitled project"}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Updated {formatWhen(p.updatedAt)} · {p.updatedBy}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {p.exportCount || 0} export{(p.exportCount || 0) === 1 ? "" : "s"}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
