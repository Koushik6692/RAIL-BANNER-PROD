import { RAIL_HEIGHT, RAIL_WIDTH } from "@/lib/rail-constants";
import {
  DEFAULT_PRICE_CARD_WIDTH,
  LOGO_ASSET_PATH,
  LOGO_DRAW_WIDTH,
  type HornbrookerTemplateState,
  type PriceTagFields,
  clampPriceTagPosition,
  clampPriceTagWidth,
} from "@/lib/hornbrooker-template";

/** Client shelf tags use clean Helvetica / Arial. */
const SANS = `Helvetica, Arial, "Helvetica Neue", sans-serif`;

function fitFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  weight: string,
  startSize: number,
  minSize = 8,
): number {
  let size = startSize;
  while (size >= minSize) {
    ctx.font = `${weight} ${size}px ${SANS}`;
    if (ctx.measureText(text).width <= maxWidth) return size;
    size -= 0.5;
  }
  return minSize;
}

/** Cache: white logo on transparent (black bg keyed out). */
let logoTransparentPromise: Promise<HTMLCanvasElement | null> | null = null;

function loadTransparentLogo(): Promise<HTMLCanvasElement | null> {
  if (logoTransparentPromise) return logoTransparentPromise;

  logoTransparentPromise = new Promise((resolve) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = img.naturalWidth || img.width;
        c.height = img.naturalHeight || img.height;
        const ctx = c.getContext("2d");
        if (!ctx || !c.width || !c.height) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, c.width, c.height);
        const d = imageData.data;
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i];
          const g = d[i + 1];
          const b = d[i + 2];
          if (r < 40 && g < 40 && b < 40) {
            d[i + 3] = 0;
          }
        }
        ctx.putImageData(imageData, 0, 0);
        resolve(c);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = LOGO_ASSET_PATH;
  });

  return logoTransparentPromise;
}

const EAN_L = [
  "0001101",
  "0011001",
  "0010011",
  "0111101",
  "0100011",
  "0110001",
  "0101111",
  "0111011",
  "0110111",
  "0001011",
];
const EAN_G = [
  "0100111",
  "0110011",
  "0011011",
  "0100001",
  "0011101",
  "0111001",
  "0000101",
  "0010001",
  "0001001",
  "0010111",
];
const EAN_R = [
  "1110010",
  "1100110",
  "1101100",
  "1000010",
  "1011100",
  "1001110",
  "1010000",
  "1000100",
  "1001000",
  "1110100",
];
const EAN_PARITY = [
  "LLLLLL",
  "LLGLGG",
  "LLGGLG",
  "LLGGGL",
  "LGLLGG",
  "LGGLLG",
  "LGGGLL",
  "LGLGLG",
  "LGLGGL",
  "LGGLGL",
];

function ean13CheckDigit(twelve: string): string {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const n = Number(twelve[i]);
    sum += i % 2 === 0 ? n : n * 3;
  }
  return String((10 - (sum % 10)) % 10);
}

function normalizeEan13(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (!digits) digits = "000000000000";
  if (digits.length > 13) digits = digits.slice(0, 13);
  if (digits.length < 12) digits = digits.padStart(12, "0");
  if (digits.length === 12) return digits + ean13CheckDigit(digits);
  return digits;
}

function ean13Modules(code13: string): string {
  const d = code13.split("").map((c) => Number(c));
  const parity = EAN_PARITY[d[0]] ?? EAN_PARITY[0];
  let bits = "101";
  for (let i = 0; i < 6; i++) {
    const digit = d[i + 1];
    bits += parity[i] === "G" ? EAN_G[digit] : EAN_L[digit];
  }
  bits += "01010";
  for (let i = 7; i < 13; i++) {
    bits += EAN_R[d[i]];
  }
  bits += "101";
  return bits;
}

/** Compact EAN under the price. Returns left edge for strike placement. */
function drawBarcode(
  ctx: CanvasRenderingContext2D,
  rightX: number,
  bottomY: number,
  maxW: number,
  code: string,
  ink = "#111111",
): { left: number; barTop: number; barH: number } {
  const code13 = normalizeEan13(code);
  const modules = ean13Modules(code13);
  const barH = 14;
  const numSize = 6.5;

  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  ctx.fillStyle = ink;
  ctx.font = `400 ${numSize}px ${SANS}`;

  let size = numSize;
  while (size >= 5 && ctx.measureText(code13).width > maxW) {
    size -= 0.5;
    ctx.font = `400 ${size}px ${SANS}`;
  }

  const numW = ctx.measureText(code13).width;
  const barsW = Math.max(Math.ceil(numW + 4), Math.min(maxW, 108));
  const barY = bottomY - barH;
  const left = rightX - barsW;

  ctx.fillText(code13, rightX, barY - 1);

  const moduleW = barsW / modules.length;
  let bx = left;
  for (let i = 0; i < modules.length; i++) {
    if (modules[i] === "1") {
      ctx.fillRect(bx, barY, Math.max(1, moduleW), barH);
    }
    bx += moduleW;
  }

  return { left, barTop: barY, barH };
}

/**
 * Layout matched to client reference:
 *  ┌──────────────────────────────────────┐
 *  │ Company                    2.99€     │
 *  │ DESCRIPTION                          │
 *  │                                      │
 *  │                 3.99€  |||||||||     │
 *  └──────────────────────────────────────┘
 */
function drawPriceCard(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  tag: PriceTagFields,
) {
  const promo = !!tag.promo;
  ctx.fillStyle = promo ? "#E30613" : "#ffffff";
  ctx.fillRect(x, y, w, h);

  const ink = promo ? "#ffffff" : "#111111";
  const muted = promo ? "rgba(255,255,255,0.9)" : "#555555";
  const strikeColor = promo ? "#ffffff" : "#555555";

  // Client-like padding on a 158px rail
  const padX = Math.max(12, Math.round(w * 0.03));
  const padTop = 11;
  const padBottom = 8;
  const rightX = x + w - padX;
  const leftX = x + padX;

  const showStrike = !!tag.originalPrice.trim();
  const hasBarcode = !!tag.barcode.trim();
  const bottomBand = 26;

  // ── Price (right): large but leaves room for barcode band ──
  const priceMaxW = Math.floor(w * 0.48);
  let saleSize = fitFontSize(
    ctx,
    tag.actualPrice,
    priceMaxW,
    "bold",
    Math.min(92, Math.floor(h * 0.58)),
    36,
  );
  while (saleSize + bottomBand + padTop > h && saleSize > 36) {
    saleSize -= 1;
  }

  ctx.font = `bold ${saleSize}px ${SANS}`;
  const saleW = ctx.measureText(tag.actualPrice).width;

  // Left column gets remaining width (never crush description)
  const leftMax = Math.max(120, w - saleW - padX * 2 - 16);

  const company = tag.company.trim() || "Hornbrooker Hof";
  const description = (tag.description.trim() || "").toUpperCase();

  // Company ~18–20px, description ~11–12px — readable like reference
  const companySize = fitFontSize(ctx, company, leftMax, "bold", 19, 12);
  const descSize = fitFontSize(ctx, description, leftMax, "normal", 11.5, 8.5);

  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = ink;
  ctx.font = `bold ${companySize}px ${SANS}`;
  ctx.fillText(company, leftX, y + padTop);

  ctx.font = `normal ${descSize}px ${SANS}`;
  ctx.fillText(description, leftX, y + padTop + companySize + 5);

  // Price top-right, aligned with company row
  ctx.textAlign = "right";
  ctx.textBaseline = "top";
  ctx.fillStyle = ink;
  ctx.font = `bold ${saleSize}px ${SANS}`;
  ctx.fillText(tag.actualPrice, rightX, y + padTop - 2);

  // ── Bottom-right: strike price | barcode ──
  const bottomY = y + h - padBottom;
  let barcodeLeft = rightX;
  let barTop = bottomY - 14;
  let barH = 14;

  // Size original (struck) price first so barcode can leave room for it
  let origSize = 0;
  let origW = 0;
  if (showStrike) {
    origSize = fitFontSize(
      ctx,
      tag.originalPrice,
      Math.floor(w * 0.35),
      "bold",
      Math.max(26, Math.floor(h * 0.2)),
      22,
    );
    ctx.font = `bold ${origSize}px ${SANS}`;
    origW = ctx.measureText(tag.originalPrice).width;
  }

  if (hasBarcode) {
    const strikeReserve = showStrike ? origW + 14 : 0;
    const barsMaxW = Math.min(
      100,
      Math.floor(w * 0.26),
      Math.max(72, w - padX * 2 - strikeReserve - 20),
    );
    const box = drawBarcode(ctx, rightX, bottomY, barsMaxW, tag.barcode, ink);
    barcodeLeft = box.left;
    barTop = box.barTop;
    barH = box.barH;
  }

  if (showStrike) {
    const strikeRight = hasBarcode ? barcodeLeft - 12 : rightX;
    // Sit clearly beside barcode — larger than barcode digits
    const midY = barTop + barH * 0.55;

    ctx.font = `bold ${origSize}px ${SANS}`;
    origW = ctx.measureText(tag.originalPrice).width;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillStyle = muted;
    ctx.fillText(tag.originalPrice, strikeRight, midY);

    ctx.beginPath();
    ctx.moveTo(strikeRight - origW - 1, midY);
    ctx.lineTo(strikeRight + 1, midY);
    ctx.strokeStyle = strikeColor;
    ctx.lineWidth = Math.max(1.6, origSize / 8);
    ctx.stroke();
  }
}

/**
 * Solid-color rail + repeating transparent logo + white price cards.
 */
export async function renderHornbrookerBannerDataUrl(
  state: Pick<HornbrookerTemplateState, "bgColor" | "showLogos" | "logos" | "priceTags">,
): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = RAIL_WIDTH;
  canvas.height = RAIL_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  ctx.fillStyle = state.bgColor || "#0d9488";
  ctx.fillRect(0, 0, RAIL_WIDTH, RAIL_HEIGHT);

  if (state.showLogos !== false) {
    const logo = await loadTransparentLogo();
    if (logo) {
      const targetH = Math.floor(RAIL_HEIGHT * 0.78);
      const scale = targetH / logo.height;
      const targetW = Math.max(40, Math.round(logo.width * scale));
      const drawW = Math.min(LOGO_DRAW_WIDTH, targetW);
      const drawH = Math.round(targetH * (drawW / targetW));
      const ly = Math.round((RAIL_HEIGHT - drawH) / 2);
      const slots = (state.logos ?? []).filter((l) => l.enabled);
      for (const slot of slots) {
        const lx = Math.max(0, Math.min(RAIL_WIDTH - drawW, Math.round(slot.position)));
        ctx.drawImage(logo, lx, ly, drawW, drawH);
      }
    }
  }

  const enabledTags = state.priceTags.filter((t) => t.enabled);
  for (const tag of enabledTags) {
    const cardW = clampPriceTagWidth(tag.width ?? DEFAULT_PRICE_CARD_WIDTH);
    const tx = clampPriceTagPosition(tag.position, cardW);
    drawPriceCard(ctx, tx, 0, cardW, RAIL_HEIGHT, tag);
  }

  return canvas.toDataURL("image/png");
}

export function dataUrlToObjectUrl(dataUrl: string): string {
  return dataUrl;
}
