/** Ensure timeline/core track rows always have clipIds (avoids @openvideo/timeline crash). */
export function normalizeProjectTracks<T extends { clipIds?: string[] }>(tracks: T[]): T[] {
  return tracks
    .filter((t): t is T => t != null)
    .map((t) => ({
      ...t,
      clipIds: Array.isArray(t.clipIds) ? t.clipIds : [],
    }));
}

export function normalizeProjectData<T extends { tracks?: { clipIds?: string[] }[] }>(project: T): T {
  if (!Array.isArray(project.tracks)) return project;
  return {
    ...project,
    tracks: normalizeProjectTracks(project.tracks),
  };
}
