import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Save uploaded media to public/uploads so export can fetch a stable local URL
 * (blob: URLs die on refresh and often fail during compositor export).
 */
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const uploadsDir = path.join(process.cwd(), "public", "uploads");
    await mkdir(uploadsDir, { recursive: true });

    const ext = path.extname(file.name) || "";
    const base = path
      .basename(file.name, ext)
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .slice(0, 80);
    const filename = `${Date.now()}-${base}${ext || ".bin"}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(uploadsDir, filename), buffer);

    return NextResponse.json({
      url: `/uploads/${filename}`,
      name: file.name,
      size: file.size,
      filename,
    });
  } catch (error) {
    console.error("[local-upload]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 },
    );
  }
}
