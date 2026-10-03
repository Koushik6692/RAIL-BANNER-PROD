import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import {
  readProject,
  writeProject,
  upsertIndexEntry,
  removeIndexEntry,
  type ProjectDocument,
} from "@/lib/project-store";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, ctx: Ctx) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const project = await readProject(id);
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ project });
}

export async function PUT(request: NextRequest, ctx: Ctx) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const existing = await readProject(id);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: Partial<ProjectDocument>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const next: ProjectDocument = {
    ...existing,
    title: typeof body.title === "string" && body.title.trim() ? body.title.trim() : existing.title,
    studio: body.studio !== undefined ? body.studio : existing.studio,
    hornbrooker: body.hornbrooker !== undefined ? body.hornbrooker : existing.hornbrooker,
    assets: Array.isArray(body.assets) ? body.assets : existing.assets,
    thumbnailUrl:
      body.thumbnailUrl !== undefined ? body.thumbnailUrl : existing.thumbnailUrl,
    exports: Array.isArray(body.exports) ? body.exports : existing.exports,
    updatedAt: now,
    updatedBy: session.displayName,
  };

  await writeProject(next);
  await upsertIndexEntry({
    id: next.id,
    title: next.title,
    createdAt: next.createdAt,
    updatedAt: next.updatedAt,
    createdBy: next.createdBy,
    updatedBy: next.updatedBy,
    thumbnailUrl: next.thumbnailUrl ?? null,
    exportCount: next.exports?.length ?? 0,
  });

  return NextResponse.json({ project: next });
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  await removeIndexEntry(id);
  // Leave project.json / media in place for recoverability; index removal hides it
  return NextResponse.json({ ok: true });
}
