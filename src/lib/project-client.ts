/** Client helpers for shared project save/load. */

export async function fetchProject(projectId: string) {
  const res = await fetch(`/api/projects/${projectId}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to load project");
  return data.project as {
    id: string;
    title: string;
    studio: any;
    hornbrooker?: any;
    assets?: any[];
    exports?: any[];
    updatedBy?: string;
    updatedAt?: string;
  };
}

export async function saveProject(projectId: string, payload: {
  title?: string;
  studio: any;
  hornbrooker?: any;
  assets?: any[];
  thumbnailUrl?: string | null;
}) {
  const res = await fetch(`/api/projects/${projectId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Save failed");
  return data.project;
}

export async function uploadExportToProject(
  projectId: string,
  blob: Blob,
  fileName: string,
) {
  const presignRes = await fetch(`/api/projects/${projectId}/exports`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "presign",
      fileName,
      contentType: blob.type || "video/mp4",
    }),
  });
  const presignData = await presignRes.json();
  if (!presignRes.ok) {
    // R2 may be unavailable — soft fail
    throw new Error(presignData.error || "Export upload unavailable");
  }

  const { upload } = presignData;
  const put = await fetch(upload.presignedUrl, {
    method: "PUT",
    headers: { "Content-Type": upload.contentType || "video/mp4" },
    body: blob,
  });
  if (!put.ok) throw new Error("Failed to upload export to storage");

  const reg = await fetch(`/api/projects/${projectId}/exports`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "register",
      url: upload.url,
      fileName,
      sizeBytes: blob.size,
    }),
  });
  const regData = await reg.json();
  if (!reg.ok) throw new Error(regData.error || "Failed to register export");
  return regData.export;
}
