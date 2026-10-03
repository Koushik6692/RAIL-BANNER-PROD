import { RAIL_WIDTH } from "./rail-constants";

/** Single rail product — solid color + repeating logo + movable white price cards. */
export type HornbrookerTemplateId = "HORNBROOKER_RAIL";

export type PriceTagFields = {
  id: string;
  /** When false, card is not drawn — bg + logos show through. */
  enabled: boolean;
  /** When true, card background is promo red instead of white. */
  promo: boolean;
  actualPrice: string;
  originalPrice: string;
  company: string;
  description: string;
  barcode: string;
  /** Left edge X in px on the 2880-wide rail. */
  position: number;
  /** Card width in px (full rail height). */
  width: number;
};

export type LogoFields = {
  id: string;
  /** When false, this logo slot is skipped (solid bg shows). */
  enabled: boolean;
  /** Left edge X in px on the 2880-wide rail. */
  position: number;
};

export type HornbrookerTemplateState = {
  templateId: HornbrookerTemplateId;
  /** Solid rail background (e.g. green / teal). */
  bgColor: string;
  /** Master switch — when false, no logos are drawn. */
  showLogos: boolean;
  /** Distance between logo left edges (px). */
  logoGap: number;
  logos: LogoFields[];
  startSeconds: number;
  durationSeconds: number;
  priceTags: PriceTagFields[];
  appliedClipIds: string[];
  activeClipId: string | null;
};

export type HornbrookerInstanceData = {
  templateId: HornbrookerTemplateId;
  bgColor: string;
  showLogos: boolean;
  logoGap: number;
  logos: LogoFields[];
  priceTags: PriceTagFields[];
  durationSeconds: number;
};

export const DEFAULT_BG_COLOR = "#0d9488";
/**
 * Client reference white tags are ~3× rail height (~480px on a 158px rail).
 */
export const PRICE_CARD_WIDTH = 480;
export const DEFAULT_PRICE_CARD_WIDTH = PRICE_CARD_WIDTH;
export const MIN_PRICE_CARD_WIDTH = 320;
export const MAX_PRICE_CARD_WIDTH = 900;
export const LOGO_ASSET_PATH = "/Hornbrooker-Logo.png";
/** Pitch so logos land in the teal gaps between cards. */
export const DEFAULT_LOGO_GAP = 300;
export const MIN_LOGO_GAP = 160;
export const MAX_LOGO_GAP = 800;
/** Approximate logo draw width used for clamping / layout. */
export const LOGO_DRAW_WIDTH = 210;
export const LOGO_START_X = 40;

const BASE_TAG = {
  company: "Hornbrooker Hof",
  description: "FREILANDEIER M, 10 STÜCK",
  actualPrice: "2.99€",
} as const;

export function clampPriceTagWidth(width: number): number {
  if (!Number.isFinite(width)) return DEFAULT_PRICE_CARD_WIDTH;
  return Math.max(MIN_PRICE_CARD_WIDTH, Math.min(MAX_PRICE_CARD_WIDTH, Math.round(width)));
}

export function clampPriceTagPosition(position: number, width = DEFAULT_PRICE_CARD_WIDTH): number {
  const w = clampPriceTagWidth(width);
  return Math.max(0, Math.min(RAIL_WIDTH - w, Math.round(position)));
}

export function clampLogoGap(gap: number): number {
  if (!Number.isFinite(gap)) return DEFAULT_LOGO_GAP;
  return Math.max(MIN_LOGO_GAP, Math.min(MAX_LOGO_GAP, Math.round(gap)));
}

export function clampLogoPosition(position: number): number {
  return Math.max(0, Math.min(RAIL_WIDTH - LOGO_DRAW_WIDTH, Math.round(position)));
}

export function createLogo(partial?: Partial<LogoFields>): LogoFields {
  return {
    id: partial?.id ?? crypto.randomUUID(),
    enabled: partial?.enabled !== false,
    position: clampLogoPosition(partial?.position ?? LOGO_START_X),
  };
}

export function nextLogoPosition(existing: LogoFields[]): number {
  if (!existing.length) return LOGO_START_X;
  const rightmost = existing.reduce(
    (max, l) => Math.max(max, l.position + LOGO_DRAW_WIDTH),
    0,
  );
  return clampLogoPosition(rightmost + 80);
}

/**
 * Lay out logo slots across the rail using `gap` as pitch.
 * Preserves per-slot `enabled` from previous logos by index when possible.
 */
export function buildLogosFromGap(
  gap: number,
  previous: LogoFields[] = [],
): LogoFields[] {
  const pitch = clampLogoGap(gap);
  const logos: LogoFields[] = [];
  let i = 0;
  for (let x = LOGO_START_X; x + LOGO_DRAW_WIDTH * 0.35 < RAIL_WIDTH; x += pitch) {
    const prev = previous[i];
    logos.push({
      id: prev?.id ?? `logo-${i + 1}`,
      enabled: prev ? prev.enabled !== false : true,
      position: clampLogoPosition(x),
    });
    i += 1;
  }
  if (!logos.length) {
    logos.push({ id: previous[0]?.id ?? "logo-1", enabled: true, position: LOGO_START_X });
  }
  return logos;
}

export function createPriceTag(partial?: Partial<PriceTagFields>): PriceTagFields {
  const width = clampPriceTagWidth(partial?.width ?? DEFAULT_PRICE_CARD_WIDTH);
  const position = clampPriceTagPosition(partial?.position ?? 80, width);
  return {
    id: crypto.randomUUID(),
    enabled: true,
    promo: false,
    ...BASE_TAG,
    originalPrice: "3.99€",
    barcode: "4006161170402",
    ...partial,
    width,
    position,
  };
}

/** Default set: cards + teal logo gaps matching client density. */
export function createDefaultPriceTags(): PriceTagFields[] {
  const w = DEFAULT_PRICE_CARD_WIDTH;
  const gap = w + 260;
  return [
    createPriceTag({
      id: "1",
      width: w,
      position: 40,
      actualPrice: "2.99€",
      originalPrice: "3.99€",
      barcode: "4006161100022",
      description: "FREILANDEIER M, 10 STÜCK",
    }),
    createPriceTag({
      id: "2",
      width: w,
      position: 40 + gap,
      actualPrice: "2.99€",
      originalPrice: "3.89€",
      barcode: "4006161170306",
      description: "FREILANDEIER M, 10 STÜCK",
    }),
    createPriceTag({
      id: "3",
      width: w,
      position: 40 + gap * 2,
      actualPrice: "2.99€",
      originalPrice: "3.49€",
      barcode: "4006161170602",
      description: "FREILANDEIER M, 10 STÜCK",
    }),
    createPriceTag({
      id: "4",
      width: w,
      position: 40 + gap * 3,
      actualPrice: "2.79€",
      originalPrice: "3.29€",
      barcode: "4006161170402",
      description: "BIO HORNB.HOF EIER L 4ST",
    }),
  ];
}

export function createDefaultHornbrookerState(): HornbrookerTemplateState {
  const logoGap = DEFAULT_LOGO_GAP;
  return {
    templateId: "HORNBROOKER_RAIL",
    bgColor: DEFAULT_BG_COLOR,
    showLogos: true,
    logoGap,
    logos: buildLogosFromGap(logoGap),
    startSeconds: 0,
    durationSeconds: 6,
    priceTags: createDefaultPriceTags(),
    appliedClipIds: [],
    activeClipId: null,
  };
}

export function nextPriceTagPosition(existing: PriceTagFields[]): number {
  if (!existing.length) return 60;
  const rightmost = existing.reduce((max, t) => {
    const w = clampPriceTagWidth(t.width ?? DEFAULT_PRICE_CARD_WIDTH);
    return Math.max(max, t.position + w);
  }, 0);
  const nextWidth = DEFAULT_PRICE_CARD_WIDTH;
  return clampPriceTagPosition(rightmost + 80, nextWidth);
}

/** Migrate older clips that stored logos / multi-template ids / promotion. */
export function normalizeInstanceData(raw: any): HornbrookerInstanceData {
  const tags = Array.isArray(raw?.priceTags) ? raw.priceTags : createDefaultPriceTags();
  const logoGap = clampLogoGap(
    typeof raw?.logoGap === "number" ? raw.logoGap : DEFAULT_LOGO_GAP,
  );

  let logos: LogoFields[];
  if (Array.isArray(raw?.logos) && raw.logos.length) {
    // Prefer stored slots; if they look like old teal logo blocks without gap layout, re-layout
    const stored = raw.logos.map((l: any, i: number) => ({
      id: String(l?.id ?? `logo-${i + 1}`),
      enabled: l?.enabled !== false,
      position: clampLogoPosition(Number(l?.position) || LOGO_START_X + i * logoGap),
    }));
    logos = stored;
  } else {
    logos = buildLogosFromGap(logoGap);
  }

  return {
    templateId: "HORNBROOKER_RAIL",
    bgColor:
      typeof raw?.bgColor === "string" && raw.bgColor.trim()
        ? raw.bgColor
        : DEFAULT_BG_COLOR,
    showLogos: raw?.showLogos !== false,
    logoGap,
    logos,
    durationSeconds:
      typeof raw?.durationSeconds === "number" && raw.durationSeconds > 0
        ? raw.durationSeconds
        : 6,
    priceTags: tags.map((t: any, i: number) => {
      const width = clampPriceTagWidth(
        Number.isFinite(Number(t?.width)) ? Number(t.width) : DEFAULT_PRICE_CARD_WIDTH,
      );
      return createPriceTag({
        id: String(t?.id ?? i + 1),
        enabled: t?.enabled !== false,
        promo: t?.promo === true,
        actualPrice: String(t?.actualPrice ?? BASE_TAG.actualPrice),
        originalPrice: String(t?.originalPrice ?? ""),
        company: String(t?.company ?? BASE_TAG.company),
        description: String(t?.description ?? BASE_TAG.description),
        barcode: String(t?.barcode ?? ""),
        width,
        position: clampPriceTagPosition(
          Number.isFinite(Number(t?.position))
            ? Number(t.position)
            : 60 + i * (DEFAULT_PRICE_CARD_WIDTH + 120),
          width,
        ),
      });
    }),
  };
}

export function snapshotHornbrookerInstance(
  state: Pick<
    HornbrookerTemplateState,
    "bgColor" | "showLogos" | "logoGap" | "logos" | "priceTags" | "durationSeconds"
  >,
): HornbrookerInstanceData {
  return {
    templateId: "HORNBROOKER_RAIL",
    bgColor: state.bgColor,
    showLogos: state.showLogos !== false,
    logoGap: clampLogoGap(state.logoGap ?? DEFAULT_LOGO_GAP),
    logos: (state.logos ?? []).map((l) => ({ ...l })),
    priceTags: state.priceTags.map((t) => ({ ...t })),
    durationSeconds: state.durationSeconds,
  };
}

export function isHornbrookerClip(clip: any): boolean {
  if (!clip) return false;
  if (clip?.metadata?.isHornbrookerBundle) return true;
  if (clip?.metadata?.hornbrooker) return true;
  const name = typeof clip?.name === "string" ? clip.name : "";
  return name.includes("rail banner") || name.startsWith("HORNBROOKER_");
}
