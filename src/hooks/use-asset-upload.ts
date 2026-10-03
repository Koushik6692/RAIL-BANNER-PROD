"use client";

import { useState, useCallback } from "react";
import { useAssetsStore, type ProjectFile } from "@/stores/assets-store";
import { generateThumbnail } from "@/lib/thumbnail-generator";
import { analyzeVideo } from "@/lib/video-analysis";
import { registerLocalMediaFile } from "@/lib/local-media-registry";
import { idbPutMedia } from "@/lib/local-media-idb";
import { resolveUploadMode } from "@/lib/upload-strategy";
import { getPresignedConfig, uploadFileWithConfig } from "@/lib/upload-utils";
import { thumbnailBlobToPersistedSrc } from "@/lib/asset-thumbnail";
import { registerAssetThumbnail } from "@/lib/thumbnail-registry";

export type MediaType = "image" | "video" | "audio";

interface UploadResult {
  success: boolean;
  fileName: string;
  error?: string;
}

interface UseAssetUploadOptions {
  spaceId: string | null;
  onComplete?: () => void;
}

async function persistBrowserMedia(file: File, src: string) {
  registerLocalMediaFile(src, file);
  registerLocalMediaFile(file.name, file);
  await idbPutMedia([src, file.name], file, file.name);
}

/**
 * Dev (localhost): save to public/uploads via API.
 * Production + R2 env: direct browser → R2 presigned upload (large files OK).
 * Production without R2: blob URL + IndexedDB fallback (small files only).
 */
export function useAssetUpload({ spaceId, onComplete }: UseAssetUploadOptions) {
  const [isUploading, setIsUploading] = useState(false);
  const { addFiles, updateFile } = useAssetsStore();

  const detectFileType = (file: File): MediaType => {
    const mime = file.type.toLowerCase();
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    if (mime.startsWith("audio/") || ["mp3", "wav", "ogg", "flac", "aac", "m4a"].includes(ext))
      return "audio";
    if (mime.startsWith("video/") || ["mp4", "webm", "mov", "avi", "mkv"].includes(ext))
      return "video";
    return "image";
  };

  const createTempFile = (file: File, spaceId: string): ProjectFile => ({
    id: `temp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    spaceId,
    name: file.name,
    type: detectFileType(file),
    src: "",
    duration: undefined,
    size: file.size,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    indexingStatus: null,
    uploadProgress: 0,
  });

  const saveToLocalDisk = async (file: File): Promise<string> => {
    const body = new FormData();
    body.append("file", file);
    const res = await fetch("/api/local-upload", { method: "POST", body });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.url) {
      // Large files can still trip body limits — keep a blob: URL + in-memory File
      // so timeline filmstrip works without R2 CORS.
      console.warn("[Upload] local-upload failed, falling back to browser blob:", data?.error);
      return saveToBrowser(file);
    }
    return String(data.url);
  };

  const saveToR2 = async (
    file: File,
    onProgress?: (progress: number) => void,
  ): Promise<string> => {
    const config = await getPresignedConfig(file.name);
    const result = await uploadFileWithConfig(file, config, onProgress);
    return result.url;
  };

  const saveToBrowser = async (file: File): Promise<string> => {
    const blobUrl = URL.createObjectURL(file);
    await persistBrowserMedia(file, blobUrl);
    return blobUrl;
  };

  const resolveUploadUrl = async (
    file: File,
    onProgress?: (progress: number) => void,
  ): Promise<string> => {
    const mode = await resolveUploadMode();
    if (mode === "local") {
      return saveToLocalDisk(file);
    }
    if (mode === "r2") {
      return saveToR2(file, onProgress);
    }
    return saveToBrowser(file);
  };

  const processFile = async (file: File, tempId: string): Promise<UploadResult> => {
    const type = detectFileType(file);
    let currentId = tempId;
    const targetSpaceId = spaceId || "guest";
    const uploadMode = await resolveUploadMode();

    try {
      // Register immediately so drag/drop works even if HMR clears mid-upload later,
      // and so filmstrip never needs a CORS fetch of the R2 URL in this session.
      registerLocalMediaFile(file.name, file);
      updateFile(tempId, { uploadProgress: 5 });

      const videoInfoPromise =
        type === "video" ? analyzeVideo(file) : Promise.resolve(undefined);
      const thumbnailPromise = generateThumbnail(file).catch(() => null);

      const mediaUrl = await resolveUploadUrl(file, (pct) => {
        updateFile(tempId, { uploadProgress: Math.min(90, Math.round(10 + pct * 0.8)) });
      });

      updateFile(tempId, { uploadProgress: 92 });

      const [videoInfo, thumbnailBlob] = await Promise.all([
        videoInfoPromise,
        thumbnailPromise,
      ]);

      if (uploadMode === "local" || uploadMode === "browser") {
        await persistBrowserMedia(file, mediaUrl);
      } else if (uploadMode === "r2") {
        // Keep File in-memory so timeline filmstrip / canvas can use BlobSource
        // instead of fetching the R2 URL (avoids CORS / huge-range fetch failures).
        registerLocalMediaFile(mediaUrl, file);
        registerLocalMediaFile(file.name, file);
        // Only IDB-cache smaller files (large WhatsApp videos blow up IndexedDB).
        if (file.size <= 80 * 1024 * 1024) {
          await idbPutMedia([mediaUrl, file.name], file, file.name).catch(() => undefined);
        }
      }

      // data: URL survives localStorage reload; blob: URLs do not
      const thumbnailSrc = thumbnailBlob
        ? await thumbnailBlobToPersistedSrc(thumbnailBlob)
        : null;
      if (thumbnailSrc) {
        registerAssetThumbnail([mediaUrl, file.name, file.name.toLowerCase()], thumbnailSrc);
      }
      const guestAssetId = crypto.randomUUID();
      currentId = guestAssetId;

      const newAsset = {
        id: guestAssetId,
        spaceId: targetSpaceId,
        name: file.name,
        type,
        src: mediaUrl,
        thumbnailSrc,
        duration: videoInfo?.duration,
        size: file.size,
        width: videoInfo?.width,
        height: videoInfo?.height,
        fps: videoInfo?.estimatedFps,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        indexingStatus: null,
        indexingProgress: null,
        indexingStage: null,
        indexingError: null,
      };

      updateFile(tempId, {
        id: currentId,
        src: mediaUrl,
        thumbnailSrc,
        duration: videoInfo?.duration,
        width: videoInfo?.width,
        height: videoInfo?.height,
        uploadProgress: 100,
        indexingStatus: null,
        indexingStage: null,
        indexingProgress: null,
        indexingError: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const localKey = `ov_assets_${targetSpaceId}`;
      const stored = localStorage.getItem(localKey);
      const existingAssets = stored ? JSON.parse(stored) : [];
      localStorage.setItem(localKey, JSON.stringify([newAsset, ...existingAssets]));

      updateFile(currentId, { uploadProgress: null, indexingStatus: null });
      return { success: true, fileName: file.name };
    } catch (error: any) {
      console.error(`[Upload] Failed for ${file.name}:`, error);
      updateFile(currentId, { uploadProgress: null, indexingStatus: "failed" });
      return { success: false, fileName: file.name, error: error.message };
    }
  };

  const uploadFiles = useCallback(
    async (files: FileList | null) => {
      const targetSpaceId = spaceId || "guest";
      if (!files?.length) return;

      setIsUploading(true);
      const fileArray = Array.from(files);
      const tempFiles = fileArray.map((file) => createTempFile(file, targetSpaceId));
      addFiles(tempFiles);

      const results = await Promise.all(
        fileArray.map((file, index) => processFile(file, tempFiles[index].id)),
      );

      setIsUploading(false);
      onComplete?.();
      return results;
    },
    [spaceId, addFiles, updateFile, onComplete],
  );

  return { uploadFiles, isUploading };
}
