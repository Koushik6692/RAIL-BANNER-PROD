/** Shelf-rail LED canvas — matches client reference video (2880×158). */
export const RAIL_WIDTH = 2880;
export const RAIL_HEIGHT = 158;

/** Layouts were originally authored for 1920px width; scale positions/widths from this. */
export const RAIL_DESIGN_WIDTH = 1920;

export const RAIL_LAYOUT_SCALE = RAIL_WIDTH / RAIL_DESIGN_WIDTH;

export const RAIL_CANVAS = { width: RAIL_WIDTH, height: RAIL_HEIGHT } as const;
