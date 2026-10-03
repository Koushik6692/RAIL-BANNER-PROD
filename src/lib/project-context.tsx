"use client";

import { createContext, useContext } from "react";

type ProjectContextValue = {
  projectId: string;
  dirty: boolean;
  setDirty: (dirty: boolean) => void;
  lastSavedAt: string | null;
  setLastSavedAt: (iso: string | null) => void;
};

export const ProjectContext = createContext<ProjectContextValue | null>(null);

export function useProjectContext() {
  const ctx = useContext(ProjectContext);
  if (!ctx) {
    throw new Error("useProjectContext must be used within ProjectContext.Provider");
  }
  return ctx;
}

export function useOptionalProjectContext() {
  return useContext(ProjectContext);
}
