import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { createEmptyProject, readIndex } from "@/lib/project-store";

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const projects = await readIndex();
  return NextResponse.json({ projects });
}

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { title?: string } = {};
  try {
    body = await request.json();
  } catch {
    /* empty body ok */
  }

  const title = (body.title || "Untitled project").trim() || "Untitled project";
  const doc = await createEmptyProject({
    title,
    createdBy: session.displayName,
  });

  return NextResponse.json({ project: doc });
}
