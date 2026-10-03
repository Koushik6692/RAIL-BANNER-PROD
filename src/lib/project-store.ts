import { promises as fs } from "fs";
import path from "path";
import { R2StorageService } from "@/lib/r2";
import { isR2Configured } from "@/lib/r2-config";
import { config } from "@/lib/config";

export type ProjectIndexEntry = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  thumbnailUrl?: string | null;
  exportCount: number;
};

export type ProjectExportEntry = {
  id: string;
  url: string;
  fileName: string;
  createdAt: string;
  createdBy: string;
  sizeBytes?: number;
};

export type ProjectDocument = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  thumbnailUrl?: string | null;
  /** Full core.project.export() payload */
  studio: any;
  /** Hornbrooker form snapshot if any */
  hornbrooker?: any;
  /** Asset library metadata for this project */
  assets?: any[];
  exports: ProjectExportEntry[];
};

const INDEX_KEY = "projects/index.json";
const LOCAL_ROOT = path.join(process.cwd(), "data");

function getR2(): R2StorageService {
  return new R2StorageService({
    bucketName: config.r2.bucket,
    accessKeyId: config.r2.accessKeyId,
    secretAccessKey: config.r2.secretAccessKey,
    accountId: config.r2.accountId,
    cdn: config.r2.cdn,
  });
}

async function ensureLocalDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

async function localReadJson<T>(rel: string): Promise<T | null> {
  const full = path.join(LOCAL_ROOT, rel);
  try {
    const raw = await fs.readFile(full, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function localWriteJson(rel: string, data: unknown) {
  const full = path.join(LOCAL_ROOT, rel);
  await ensureLocalDir(path.dirname(full));
  await fs.writeFile(full, JSON.stringify(data, null, 2), "utf8");
}

export async function readIndex(): Promise<ProjectIndexEntry[]> {
  if (isR2Configured()) {
    const data = await getR2().getJson<{ projects?: ProjectIndexEntry[] }>(INDEX_KEY);
    return Array.isArray(data?.projects) ? data!.projects! : [];
  }
  const data = await localReadJson<{ projects?: ProjectIndexEntry[] }>(INDEX_KEY);
  return Array.isArray(data?.projects) ? data!.projects! : [];
}

async function writeIndex(projects: ProjectIndexEntry[]) {
  const sorted = [...projects].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
  const payload = { projects: sorted };
  if (isR2Configured()) {
    await getR2().uploadJson(INDEX_KEY, payload);
  } else {
    await localWriteJson(INDEX_KEY, payload);
  }
}

export function projectKey(id: string) {
  return `projects/${idKey(id)}/project.json`;
}

export async function readProject(id: string): Promise<ProjectDocument | null> {
  const key = projectKey(id);
  if (isR2Configured()) {
    return getR2().getJson<ProjectDocument>(key);
  }
  return localReadJson<ProjectDocument>(key);
}

export async function writeProject(doc: ProjectDocument): Promise<void> {
  const key = projectKey(doc.id);
  if (isR2Configured()) {
    await getR2().uploadJson(key, doc);
  } else {
    await localWriteJson(key, doc);
  }
}

function idKey(id: string) {
  return id.replace(/[^a-zA-Z0-9_-]/g, "");
}

export async function upsertIndexEntry(entry: ProjectIndexEntry) {
  const list = await readIndex();
  const idx = list.findIndex((p) => p.id === entry.id);
  if (idx >= 0) list[idx] = entry;
  else list.push(entry);
  await writeIndex(list);
}

export async function removeIndexEntry(id: string) {
  const list = await readIndex();
  await writeIndex(list.filter((p) => p.id !== id));
}

export async function createEmptyProject(params: {
  title: string;
  createdBy: string;
}): Promise<ProjectDocument> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const doc: ProjectDocument = {
    id,
    title: params.title || "Untitled project",
    createdAt: now,
    updatedAt: now,
    createdBy: params.createdBy,
    updatedBy: params.createdBy,
    thumbnailUrl: null,
    studio: null,
    hornbrooker: null,
    assets: [],
    exports: [],
  };
  await writeProject(doc);
  await upsertIndexEntry({
    id: doc.id,
    title: doc.title,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    createdBy: doc.createdBy,
    updatedBy: doc.updatedBy,
    thumbnailUrl: null,
    exportCount: 0,
  });
  return doc;
}

export async function createPresignedProjectUpload(
  projectId: string,
  kind: "media" | "exports" | "thumb",
  fileName: string,
  contentType?: string,
) {
  if (!isR2Configured()) {
    throw new Error("R2 is required for project media uploads in this environment");
  }
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath = `projects/${idKey(projectId)}/${kind}/${Date.now()}-${safe}`;
  return getR2().createPresignedUpload(filePath, { contentType });
}
