import { create } from "zustand";
import {
  clampPriceTagPosition,
  clampPriceTagWidth,
  buildLogosFromGap,
  clampLogoGap,
  clampLogoPosition,
  createDefaultHornbrookerState,
  createLogo,
  createPriceTag,
  DEFAULT_PRICE_CARD_WIDTH,
  nextLogoPosition,
  nextPriceTagPosition,
  normalizeInstanceData,
  type HornbrookerInstanceData,
  type HornbrookerTemplateState,
  type LogoFields,
  type PriceTagFields,
} from "@/lib/hornbrooker-template";

type HornbrookerStore = HornbrookerTemplateState & {
  setBgColor: (bgColor: string) => void;
  setShowLogos: (showLogos: boolean) => void;
  setLogoGap: (logoGap: number) => void;
  updateLogo: (id: string, patch: Partial<LogoFields>) => void;
  addLogo: () => void;
  removeLogo: (id: string) => void;
  setTiming: (startSeconds: number, durationSeconds: number) => void;
  updatePriceTag: (id: string, patch: Partial<PriceTagFields>) => void;
  addPriceTag: () => void;
  removePriceTag: (id: string) => void;
  setAppliedClipIds: (ids: string[]) => void;
  setActiveClipId: (id: string | null) => void;
  loadInstance: (clipId: string, data: HornbrookerInstanceData, startSeconds: number) => void;
  resetForm: () => void;
};

export const useHornbrookerStore = create<HornbrookerStore>((set) => ({
  ...createDefaultHornbrookerState(),

  setBgColor: (bgColor) => set({ bgColor }),
  setShowLogos: (showLogos) => set({ showLogos }),

  setLogoGap: (logoGap) =>
    set((s) => {
      const nextGap = clampLogoGap(logoGap);
      return {
        logoGap: nextGap,
        logos: buildLogosFromGap(nextGap, s.logos),
      };
    }),

  updateLogo: (id, patch) =>
    set((s) => ({
      logos: s.logos.map((l) => {
        if (l.id !== id) return l;
        const next = { ...l, ...patch };
        if (patch.position != null) next.position = clampLogoPosition(patch.position);
        return next;
      }),
    })),

  addLogo: () =>
    set((s) => ({
      logos: [...s.logos, createLogo({ position: nextLogoPosition(s.logos) })],
    })),

  removeLogo: (id) =>
    set((s) => ({
      logos: s.logos.length <= 1 ? s.logos : s.logos.filter((l) => l.id !== id),
    })),

  setTiming: (startSeconds, durationSeconds) => set({ startSeconds, durationSeconds }),

  updatePriceTag: (id, patch) =>
    set((s) => ({
      priceTags: s.priceTags.map((t) => {
        if (t.id !== id) return t;
        const next = { ...t, ...patch };
        if (patch.width != null) {
          next.width = clampPriceTagWidth(patch.width);
          next.position = clampPriceTagPosition(next.position, next.width);
        }
        if (patch.position != null) {
          next.position = clampPriceTagPosition(
            patch.position,
            next.width ?? DEFAULT_PRICE_CARD_WIDTH,
          );
        }
        return next;
      }),
    })),

  addPriceTag: () =>
    set((s) => ({
      priceTags: [
        ...s.priceTags,
        createPriceTag({ position: nextPriceTagPosition(s.priceTags) }),
      ],
    })),

  removePriceTag: (id) =>
    set((s) => ({
      priceTags: s.priceTags.length <= 1 ? s.priceTags : s.priceTags.filter((t) => t.id !== id),
    })),

  setAppliedClipIds: (appliedClipIds) => set({ appliedClipIds }),
  setActiveClipId: (activeClipId) => set({ activeClipId }),

  loadInstance: (clipId, data, startSeconds) => {
    const normalized = normalizeInstanceData(data);
    set({
      activeClipId: clipId,
      templateId: "HORNBROOKER_RAIL",
      bgColor: normalized.bgColor,
      showLogos: normalized.showLogos,
      logoGap: normalized.logoGap,
      logos: normalized.logos,
      priceTags: normalized.priceTags,
      durationSeconds: normalized.durationSeconds,
      startSeconds,
    });
  },

  resetForm: () =>
    set((s) => ({
      ...createDefaultHornbrookerState(),
      appliedClipIds: s.appliedClipIds,
      activeClipId: null,
    })),
}));
