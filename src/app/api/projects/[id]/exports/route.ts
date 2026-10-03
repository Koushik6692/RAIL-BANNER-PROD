import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import {
  readProject,
  writeProject,
  upsertIndexEntry,
  createPresignedProjectUpload,
  type ProjectExportEntry,
} from "@/lib/project-store";
import { isR2Configured } from "@/lib/r2-config";

type Ctx = { params: Promise<{ id: string }> };

/** GET — list exports for a project */
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
  return NextResponse.json({ exports: project.exports ?? [] });
}

/**
 * POST — two modes:
 * 1) { action: "presign", fileName, contentType } → presigned PUT for export MP4
 * 2) { action: "register", url, fileName, sizeBytes? } → append export to project
 */
export async function POST(request: NextRequest, ctx: Ctx) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const project = await readProject(id);
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = body?.action || "register";

  if (action === "presign") {
    if (!isR2Configured()) {
      return NextResponse.json(
        { error: "R2 required to store exports. Configure R2 env vars." },
        { status: 400 },
      );
    }
    const fileName = String(body.fileName || "export.mp4");
    const contentType = String(body.contentType || "video/mp4");
    const upload = await createPresignedProjectUpload(id, "exports", fileName, contentType);
    return NextResponse.json({ upload });
  }

  const url = String(body.url || "");
  const fileName = String(body.fileName || "export.mp4");
  if (!url) {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }

  const entry: ProjectExportEntry = {
    id: crypto.randomUUID(),
    url,
    fileName,
    createdAt: new Date().toISOString(),
    createdBy: session.displayName,
    sizeBytes: typeof body.sizeBytes === "number" ? body.sizeBytes : undefined,
  };

  const exports = [...(project.exports || []), entry];
  const now = new Date().toISOString();
  const next = {
    ...project,
    exports,
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
    exportCount: exports.length,
  });

  return NextResponse.json({ export: entry, project: next });
}
