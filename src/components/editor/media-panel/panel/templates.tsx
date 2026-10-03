"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";
import { Log } from "@openvideo/engine-pixi";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import Draggable from "@/components/shared/draggable";
import { projectStore } from "@/lib/project";
import { useHornbrookerStore } from "@/stores/hornbrooker-store";
import {
  MAX_LOGO_GAP,
  MAX_PRICE_CARD_WIDTH,
  MIN_LOGO_GAP,
  MIN_PRICE_CARD_WIDTH,
  DEFAULT_PRICE_CARD_WIDTH,
  LOGO_DRAW_WIDTH,
} from "@/lib/hornbrooker-template";
import { RAIL_HEIGHT, RAIL_WIDTH } from "@/lib/rail-constants";
import {
  applyHornbrookerTemplate,
  buildHornbrookerDragPayload,
  loadHornbrookerFromClip,
} from "@/lib/apply-hornbrooker";
import { renderHornbrookerBannerDataUrl } from "@/lib/render-hornbrooker-banner";

function Field({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <div className="grid gap-1">
      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</Label>
      <Input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 text-xs"
      />
      {hint ? <p className="text-[9px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  hint,
  min = 0,
  max,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  hint?: string;
  min?: number;
  max?: number;
}) {
  const [text, setText] = useState(String(value));

  useEffect(() => {
    setText(String(value));
  }, [value]);

  return (
    <div className="grid gap-1">
      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</Label>
      <Input
        type="text"
        inputMode="numeric"
        value={text}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^\d.-]/g, "");
          setText(raw);
          if (raw === "" || raw === "-" || raw === ".") return;
          const n = Number(raw);
          if (Number.isFinite(n)) onChange(n);
        }}
        onBlur={() => {
          let n = Number(text);
          if (!Number.isFinite(n)) n = min;
          n = Math.max(min, n);
          if (max != null) n = Math.min(max, n);
          onChange(n);
          setText(String(n));
        }}
        className="h-8 text-xs"
      />
      {hint ? <p className="text-[9px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function LiveBannerPreview({
  bgColor,
  showLogos,
  logos,
  priceTags,
}: {
  bgColor: string;
  showLogos: boolean;
  logos: ReturnType<typeof useHornbrookerStore.getState>["logos"];
  priceTags: ReturnType<typeof useHornbrookerStore.getState>["priceTags"];
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void renderHornbrookerBannerDataUrl({ bgColor, showLogos, logos, priceTags }).then((url) => {
      if (!cancelled) setSrc(url);
    });
    return () => {
      cancelled = true;
    };
  }, [bgColor, showLogos, logos, priceTags]);

  if (!src) {
    return (
      <div
        className="w-full animate-pulse rounded-md border border-border/50"
        style={{ aspectRatio: `${RAIL_WIDTH} / ${RAIL_HEIGHT}`, background: bgColor }}
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-border/60 bg-black shadow-sm">
      <img
        src={src}
        alt="Rail banner preview"
        className="pointer-events-none block h-auto w-full"
        style={{ aspectRatio: `${RAIL_WIDTH} / ${RAIL_HEIGHT}` }}
        draggable={false}
      />
    </div>
  );
}

export default function PanelTemplates() {
  const [status, setStatus] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  const {
    bgColor,
    showLogos,
    logoGap,
    logos,
    startSeconds,
    durationSeconds,
    priceTags,
    activeClipId,
    setBgColor,
    setShowLogos,
    setLogoGap,
    updateLogo,
    addLogo,
    removeLogo,
    setTiming,
    updatePriceTag,
    addPriceTag,
    removePriceTag,
    resetForm,
  } = useHornbrookerStore();

  const selectedIds = useStore(projectStore, (s) => s.selectedIds);
  const clips = useStore(projectStore, (s) => s.clips);

  const formKey = useMemo(
    () => JSON.stringify({ bgColor, showLogos, logoGap, logos, priceTags }),
    [bgColor, showLogos, logoGap, logos, priceTags],
  );

  const lastAutoKey = useRef<string | null>(null);
  /** Only reload the form when a *different* banner is selected — not on every clips update. */
  const lastLoadedClipId = useRef<string | null>(null);

  const updateSelected = useCallback(async () => {
    setApplying(true);
    setStatus(null);
    try {
      await applyHornbrookerTemplate({ replacePrevious: true });
      setStatus("Banner updated");
      const s = useHornbrookerStore.getState();
      lastAutoKey.current = JSON.stringify({
        bgColor: s.bgColor,
        showLogos: s.showLogos,
        logoGap: s.logoGap,
        logos: s.logos,
        priceTags: s.priceTags,
      });
    } catch (error) {
      Log.error("Failed to update rail banner", error);
      setStatus(error instanceof Error ? error.message : "Update failed");
    } finally {
      setApplying(false);
    }
  }, []);

  // Load form only when the selected clip id changes (not when clip data churns)
  useEffect(() => {
    const id = selectedIds?.[0] ?? null;
    if (!id) {
      lastLoadedClipId.current = null;
      return;
    }
    if (id === lastLoadedClipId.current) return;

    const clip = (clips as any)?.[id];
    if (!clip) return;

    if (loadHornbrookerFromClip(clip)) {
      lastLoadedClipId.current = id;
      const s = useHornbrookerStore.getState();
      lastAutoKey.current = JSON.stringify({
        bgColor: s.bgColor,
        showLogos: s.showLogos,
        logoGap: s.logoGap,
        logos: s.logos,
        priceTags: s.priceTags,
      });
    }
  }, [selectedIds, clips]);

  // Auto-apply edits while a banner is selected
  useEffect(() => {
    if (!activeClipId) return;
    if (lastAutoKey.current === formKey) return;
    const t = window.setTimeout(() => {
      void updateSelected();
    }, 450);
    return () => window.clearTimeout(t);
  }, [activeClipId, formKey, updateSelected]);

  const placeBanner = async () => {
    setApplying(true);
    setStatus(null);
    try {
      await applyHornbrookerTemplate({ replacePrevious: false });
      lastAutoKey.current = JSON.stringify({
        bgColor: useHornbrookerStore.getState().bgColor,
        showLogos: useHornbrookerStore.getState().showLogos,
        logoGap: useHornbrookerStore.getState().logoGap,
        logos: useHornbrookerStore.getState().logos,
        priceTags: useHornbrookerStore.getState().priceTags,
      });
      setStatus("Banner added to timeline");
    } catch (error) {
      Log.error("Failed to place rail banner", error);
      setStatus(error instanceof Error ? error.message : "Place failed");
    } finally {
      setApplying(false);
    }
  };

  const dragData = buildHornbrookerDragPayload();

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-4 p-3 pb-8">
        {activeClipId ? (
          <p className="rounded-md border border-primary/30 bg-primary/10 px-2 py-1.5 text-[11px] text-foreground">
            Editing selected banner — hide a card to show only the colored logo rail underneath.
          </p>
        ) : null}

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Rail banner
          </h3>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Drag the preview onto the timeline, or use Add to timeline. Hide a price card to show
            only the colored logo rail.
          </p>
          <Draggable
            data={dragData}
            renderCustomPreview={
              <div
                className="overflow-hidden rounded border-2 border-primary shadow-xl"
                style={{ width: 220, height: 28, background: bgColor }}
              >
                <span className="block px-2 py-1 text-[10px] font-semibold text-white/90">
                  Hornbrooker rail banner
                </span>
              </div>
            }
          >
            <div className="cursor-grab active:cursor-grabbing select-none">
              <LiveBannerPreview
                bgColor={bgColor}
                showLogos={showLogos}
                logos={logos}
                priceTags={priceTags}
              />
              <p className="mt-1 text-center text-[10px] text-muted-foreground">
                Drag onto timeline
              </p>
            </div>
          </Draggable>
          <Button className="w-full" size="sm" onClick={() => void placeBanner()} disabled={applying}>
            {applying ? "Working…" : "Add to timeline"}
          </Button>
        </section>

        <section className="space-y-3 rounded-md border border-border/50 bg-secondary/10 p-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Background
          </h3>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={bgColor}
              onChange={(e) => setBgColor(e.target.value)}
              className="h-9 w-12 cursor-pointer rounded border border-border bg-transparent p-0.5"
              aria-label="Rail background color"
            />
            <Input
              value={bgColor}
              onChange={(e) => setBgColor(e.target.value)}
              className="h-8 font-mono text-xs"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label="Banner start (s)"
              value={startSeconds}
              onChange={(n) => setTiming(n, durationSeconds)}
              hint="Used for new banners"
            />
            <NumberField
              label="Duration (s)"
              value={durationSeconds}
              onChange={(n) => setTiming(startSeconds, Math.max(0.5, n))}
              min={0.5}
            />
          </div>
        </section>

        <section className="space-y-3 rounded-md border border-border/50 bg-secondary/10 p-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Logos
            </h3>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <Label className="text-[10px] text-muted-foreground">Show all</Label>
                <Switch checked={showLogos} onCheckedChange={setShowLogos} />
              </div>
              <Button
                size="sm"
                variant="secondary"
                className="h-7 text-xs"
                onClick={addLogo}
                disabled={!showLogos}
              >
                + Add logo
              </Button>
            </div>
          </div>

          <NumberField
            label="Auto-space gap (px)"
            value={logoGap}
            min={MIN_LOGO_GAP}
            max={MAX_LOGO_GAP}
            onChange={setLogoGap}
            hint="Optional: redistributes all logos evenly. Then move each one with Position X."
          />
          <input
            type="range"
            min={MIN_LOGO_GAP}
            max={MAX_LOGO_GAP}
            value={logoGap}
            onChange={(e) => setLogoGap(Number(e.target.value))}
            className="w-full accent-primary"
            disabled={!showLogos}
            aria-label="Logo gap"
          />

          <div className={`space-y-3 ${!showLogos ? "opacity-50 pointer-events-none" : ""}`}>
            {logos.map((logo, index) => (
              <div
                key={logo.id}
                className="space-y-2 rounded-md border border-border/40 bg-background/40 p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold">Logo {index + 1}</span>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <Label className="text-[10px] text-muted-foreground">Show</Label>
                      <Switch
                        checked={logo.enabled}
                        onCheckedChange={(enabled) => updateLogo(logo.id, { enabled })}
                      />
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs text-destructive"
                      disabled={logos.length <= 1}
                      onClick={() => removeLogo(logo.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>

                <NumberField
                  label="Position X (px)"
                  value={logo.position}
                  min={0}
                  max={RAIL_WIDTH - LOGO_DRAW_WIDTH}
                  onChange={(n) => updateLogo(logo.id, { position: n })}
                  hint="Slide this logo left / right on the rail (same as price cards)"
                />
                <input
                  type="range"
                  min={0}
                  max={RAIL_WIDTH - LOGO_DRAW_WIDTH}
                  value={logo.position}
                  onChange={(e) => updateLogo(logo.id, { position: Number(e.target.value) })}
                  className="w-full accent-primary"
                  aria-label={`Logo ${index + 1} position`}
                />
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Price tags
            </h3>
            <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={addPriceTag}>
              + Add card
            </Button>
          </div>

          {priceTags.map((tag, index) => (
            <div
              key={tag.id}
              className="space-y-2 rounded-md border border-border/50 bg-background/40 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold">Card {index + 1}</span>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <Label className="text-[10px] text-muted-foreground">Promo</Label>
                    <Switch
                      checked={!!tag.promo}
                      onCheckedChange={(promo) => updatePriceTag(tag.id, { promo })}
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Label className="text-[10px] text-muted-foreground">Show</Label>
                    <Switch
                      checked={tag.enabled}
                      onCheckedChange={(enabled) => updatePriceTag(tag.id, { enabled })}
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs text-destructive"
                    disabled={priceTags.length <= 1}
                    onClick={() => removePriceTag(tag.id)}
                  >
                    Delete
                  </Button>
                </div>
              </div>

              <NumberField
                label="Card width (px)"
                value={tag.width ?? DEFAULT_PRICE_CARD_WIDTH}
                min={MIN_PRICE_CARD_WIDTH}
                max={MAX_PRICE_CARD_WIDTH}
                onChange={(n) => updatePriceTag(tag.id, { width: n })}
                hint="Client tags are ~480px wide"
              />
              <input
                type="range"
                min={MIN_PRICE_CARD_WIDTH}
                max={MAX_PRICE_CARD_WIDTH}
                value={tag.width ?? DEFAULT_PRICE_CARD_WIDTH}
                onChange={(e) => updatePriceTag(tag.id, { width: Number(e.target.value) })}
                className="w-full accent-primary"
                aria-label={`Card ${index + 1} width`}
              />

              <NumberField
                label="Position X (px)"
                value={tag.position}
                min={0}
                max={RAIL_WIDTH - (tag.width ?? DEFAULT_PRICE_CARD_WIDTH)}
                onChange={(n) => updatePriceTag(tag.id, { position: n })}
                hint="Slide the whole white card left / right on the rail"
              />
              <input
                type="range"
                min={0}
                max={RAIL_WIDTH - (tag.width ?? DEFAULT_PRICE_CARD_WIDTH)}
                value={tag.position}
                onChange={(e) => updatePriceTag(tag.id, { position: Number(e.target.value) })}
                className="w-full accent-primary"
                aria-label={`Card ${index + 1} position`}
              />

              <div className="grid grid-cols-2 gap-2">
                <Field
                  label="Price"
                  value={tag.actualPrice}
                  onChange={(v) => updatePriceTag(tag.id, { actualPrice: v })}
                />
                <Field
                  label="Original (strikethrough)"
                  value={tag.originalPrice}
                  onChange={(v) => updatePriceTag(tag.id, { originalPrice: v })}
                />
              </div>
              <Field
                label="Company"
                value={tag.company}
                onChange={(v) => updatePriceTag(tag.id, { company: v })}
              />
              <Field
                label="Description"
                value={tag.description}
                onChange={(v) => updatePriceTag(tag.id, { description: v })}
              />
              <Field
                label="Barcode (EAN-13)"
                value={tag.barcode}
                onChange={(v) => updatePriceTag(tag.id, { barcode: v })}
                hint="Digits + bars update together. Use a real 13-digit EAN for scan-ready bars."
              />
            </div>
          ))}
        </section>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" size="sm" onClick={resetForm}>
            Reset form
          </Button>
          <Button
            className="flex-1"
            size="sm"
            disabled={applying || !activeClipId}
            onClick={() => void updateSelected()}
          >
            Update selected
          </Button>
        </div>

        {status ? <p className="text-[11px] text-muted-foreground">{status}</p> : null}
      </div>
    </ScrollArea>
  );
}
