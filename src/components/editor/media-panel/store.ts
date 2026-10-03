import {
  RiFolderOpenLine,
  RiFolderOpenFill,
  RiTBoxLine,
  RiTBoxFill,
  RiLayoutGridLine,
  RiLayoutGridFill,
  RiShapesLine,
  RiShapesFill,
} from "@remixicon/react";
import { create } from "zustand";

/** Rail-focused tabs: assets, Hornbrooker templates, quick banners, shapes. */
export type Tab = "assets" | "templates" | "text" | "elements";

export const tabs: {
  [key in Tab]: {
    icon: React.ComponentType<any> | React.FC<any>;
    activeIcon: React.ComponentType<any> | React.FC<any>;
    label: string;
  };
} = {
  assets: {
    icon: RiFolderOpenLine,
    activeIcon: RiFolderOpenFill,
    label: "Assets",
  },
  templates: {
    icon: RiLayoutGridLine,
    activeIcon: RiLayoutGridFill,
    label: "Templates",
  },
  text: {
    icon: RiTBoxLine,
    activeIcon: RiTBoxFill,
    label: "Banners",
  },
  elements: {
    icon: RiShapesLine,
    activeIcon: RiShapesFill,
    label: "Elements",
  },
};

interface MediaPanelStore {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  highlightMediaId: string | null;
  requestRevealMedia: (mediaId: string) => void;
  clearHighlight: () => void;
  showProperties: boolean;
  setShowProperties: (show: boolean) => void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  showLabels: boolean;
  setShowLabels: (show: boolean) => void;
}

export const useMediaPanelStore = create<MediaPanelStore>((set) => ({
  activeTab: "templates",
  setActiveTab: (tab) => set({ activeTab: tab, showProperties: false, isOpen: true }),
  highlightMediaId: null,
  requestRevealMedia: (mediaId) =>
    set({
      activeTab: "assets",
      highlightMediaId: mediaId,
      showProperties: false,
      isOpen: true,
    }),
  clearHighlight: () => set({ highlightMediaId: null }),
  showProperties: false,
  setShowProperties: (show) => set({ showProperties: show }),
  isOpen: true,
  setIsOpen: (open) => set({ isOpen: open }),
  showLabels: true,
  setShowLabels: (show) => set({ showLabels: show }),
}));
