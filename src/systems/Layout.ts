import { TILE_SIZE } from '../config/constants';

/**
 * Single source of truth for every on-screen dimension.
 *
 * Nothing in the game may hardcode a canvas coordinate any more: scenes ask
 * computeLayout() for the current frame's geometry and place themselves inside
 * the rectangles it returns. That is what lets the same build run on a 1920px
 * desktop and a 390px phone held upright.
 */

export type Orientation = 'landscape' | 'portrait';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Layout {
  /** Canvas size in CSS pixels. */
  width: number;
  height: number;
  orientation: Orientation;
  portrait: boolean;
  /** Viewport of the game camera. */
  view: Rect;
  /** HUD strip: right-hand panel in landscape, top bar in portrait. */
  hud: Rect;
  /** Minimap camera, always carved out of the HUD strip. */
  minimap: Rect;
  /** Font/spacing multiplier relative to the 1280x720 reference design. */
  ui: number;
}

/** Resolution the original UI was drawn against. */
export const DESIGN_W = 1280;
export const DESIGN_H = 720;

/**
 * Tiles visible along the SHORT side of the game viewport. Keeping this
 * constant instead of the zoom is what makes the game fair across screens:
 * a phone and a 4K monitor see the same amount of arena on that axis.
 * 15 is the value the original 1060x720 desktop viewport happened to show,
 * so desktop play is unchanged.
 */
const TILES_SHORT_AXIS = 15;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;

/** Landscape HUD panel: 220px at the 1280px reference width. */
const HUD_RATIO = 220 / DESIGN_W;
const HUD_MIN_W = 168;
const HUD_MAX_W = 300;

/** Portrait HUD bar: tall enough for three text rows plus the minimap. */
const HUD_BAR_RATIO = 0.13;
const HUD_BAR_MIN_H = 96;
const HUD_BAR_MAX_H = 148;

const MIN_UI = 0.6;
const MAX_UI = 1.4;

/**
 * Portrait is measured against a phone-sized reference instead of the
 * landscape one. Against 1280 wide, every phone scores ~0.30 and pins to
 * MIN_UI, which is how the HUD ends up unreadable on the device that needs
 * it most.
 */
const PORTRAIT_W = 420;
const PORTRAIT_H = 840;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function computeLayout(width: number, height: number): Layout {
  const portrait = height > width;
  const ui = portrait
    ? clamp(Math.min(width / PORTRAIT_W, height / PORTRAIT_H), MIN_UI, MAX_UI)
    : clamp(Math.min(width / DESIGN_W, height / DESIGN_H), MIN_UI, MAX_UI);

  let hud: Rect;
  let view: Rect;
  let minimap: Rect;

  if (portrait) {
    const h = Math.round(clamp(height * HUD_BAR_RATIO, HUD_BAR_MIN_H, HUD_BAR_MAX_H));
    hud = { x: 0, y: 0, w: width, h };
    view = { x: 0, y: h, w: width, h: height - h };

    // Minimap sits at the right end of the bar, as tall as the bar allows.
    const ms = Math.round(clamp(h - 14, 64, 128));
    minimap = { x: width - ms - 8, y: hud.y + Math.round((h - ms) / 2), w: ms, h: ms };
  } else {
    const w = Math.round(clamp(width * HUD_RATIO, HUD_MIN_W, HUD_MAX_W));
    hud = { x: width - w, y: 0, w, h: height };
    view = { x: 0, y: 0, w: width - w, h: height };

    const ms = Math.round(clamp(Math.min(w - 24, height * 0.25), 80, 180));
    minimap = { x: hud.x + Math.round((w - ms) / 2), y: hud.y + hud.h - ms - 12, w: ms, h: ms };
  }

  return {
    width,
    height,
    orientation: portrait ? 'portrait' : 'landscape',
    portrait,
    view,
    hud,
    minimap,
    ui,
  };
}

/**
 * Zoom for the game camera.
 *
 * Deliberately independent of the arena size: every player sees the same
 * number of tiles on the short axis, whatever their screen. Levels whose
 * arena is smaller than the viewport simply show the starfield around it
 * rather than being zoomed in to hide the gap.
 */
export function worldZoom(layout: Layout): number {
  const shortSide = Math.min(layout.view.w, layout.view.h);
  return clamp(shortSide / (TILES_SHORT_AXIS * TILE_SIZE), MIN_ZOOM, MAX_ZOOM);
}

/**
 * How far the game camera may drift past the arena, in world pixels.
 *
 * Without it a level whose arena is narrower than the viewport pins the
 * camera on that axis, and a pinned camera means no parallax at all: the
 * starfield only moves because the camera does.
 */
export const CAMERA_TRAVEL = 6 * TILE_SIZE;

/**
 * Camera bounds for the current level: the arena, widened where needed so the
 * camera always keeps CAMERA_TRAVEL pixels of play on each axis. Large arenas
 * are unaffected and stay clamped to their own edges.
 */
export function cameraBounds(layout: Layout, worldW: number, worldH: number, zoom: number): Rect {
  const w = Math.max(worldW, layout.view.w / zoom + CAMERA_TRAVEL);
  const h = Math.max(worldH, layout.view.h / zoom + CAMERA_TRAVEL);
  return { x: (worldW - w) / 2, y: (worldH - h) / 2, w, h };
}

/** Scale a reference font size to the current layout, never below `min` px. */
export function fs(layout: Layout, base: number, min = 10): string {
  return `${Math.max(min, Math.round(base * layout.ui))}px`;
}

/** Scale a reference spacing/offset to the current layout. */
export function sp(layout: Layout, base: number): number {
  return Math.round(base * layout.ui);
}
