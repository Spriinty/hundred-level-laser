import Phaser from 'phaser';
import type { Layout } from './Layout';
import type { StickSide } from './Settings';

export type Direction = 'left' | 'right' | 'up' | 'down' | null;

/** Thumb travel before the stick registers, and travel for a full tilt. */
const DEAD_ZONE = 11;
const MAX_TRAVEL = 54;

/**
 * Top slice of the play area that ignores touches, so reaching for the pause
 * button or reading the level counter never starts a move or a burst.
 */
const IDLE_BAND = 0.2;

/**
 * True on devices driven by a finger rather than a mouse.
 *
 * `hover: none` is the part that matters: plenty of Windows laptops have a
 * touchscreen and report a coarse pointer, but if the primary input can hover
 * there is a mouse on the desk and those players want the keyboard scheme.
 */
export function isTouchDevice(): boolean {
  return (
    typeof window !== 'undefined' &&
    navigator.maxTouchPoints > 0 &&
    window.matchMedia('(pointer: coarse)').matches &&
    window.matchMedia('(hover: none)').matches
  );
}

/**
 * The on-screen rig: a floating four-way stick on one half of the play area,
 * a fire button on the other.
 *
 * Each control owns its entire half rather than just the circle drawn on it.
 * The circles are affordances showing where to put a thumb; requiring an
 * accurate hit on them would make the game feel broken on a small screen.
 *
 * The stick reports a direction rather than a vector, because the ship moves
 * on strict axes — an analogue reading would make it stutter near the
 * diagonals.
 */
export class TouchControls {
  /** Current direction, or null while the stick is idle or centred. */
  direction: Direction = null;
  /** True while the fire half is held. */
  firing = false;

  private enabled = false;
  private side: StickSide = 'right';
  private travel = MAX_TRAVEL;
  private deadZone = DEAD_ZONE;

  private ghost: Phaser.GameObjects.Arc;
  private base: Phaser.GameObjects.Arc;
  private knob: Phaser.GameObjects.Arc;
  private fireRing: Phaser.GameObjects.Arc;
  private fireCore: Phaser.GameObjects.Arc;

  private stickPointer = -1;
  private firePointer = -1;
  private origin = new Phaser.Math.Vector2();

  private zoneTop = 0;
  private splitX = 0;
  private viewLeft = 0;
  private viewRight = 0;

  constructor(
    scene: Phaser.Scene,
    register: <T extends Phaser.GameObjects.GameObject>(obj: T) => T
  ) {
    const arc = (radius: number, fill: number, alpha: number, depth: number) =>
      register(
        scene.add.circle(0, 0, radius, fill, alpha)
          .setScrollFactor(0).setDepth(depth).setVisible(false)
      );

    // Resting footprint: without it the stick is invisible until touched and
    // nobody knows it exists.
    this.ghost = arc(MAX_TRAVEL, 0x88bbff, 0.05, 399)
      .setStrokeStyle(2, 0x88bbff, 0.22);

    this.base = arc(MAX_TRAVEL, 0x88bbff, 0.10, 400)
      .setStrokeStyle(2, 0x88bbff, 0.35);
    this.knob = arc(MAX_TRAVEL * 0.42, 0x88bbff, 0.35, 401)
      .setStrokeStyle(2, 0xbbddff, 0.7);

    this.fireRing = arc(MAX_TRAVEL, 0xff6644, 0.05, 399)
      .setStrokeStyle(2, 0xff6644, 0.3);
    this.fireCore = arc(MAX_TRAVEL * 0.45, 0xff6644, 0.25, 400)
      .setStrokeStyle(2, 0xff8866, 0.55);
  }

  setEnabled(on: boolean): void {
    if (this.enabled === on) return;
    this.enabled = on;
    if (!on) this.releaseAll();
    this.refresh();
  }

  /** Position both controls for the current layout and handedness. */
  place(layout: Layout, side: StickSide): void {
    this.side = side;
    this.travel = Math.round(MAX_TRAVEL * layout.ui);
    this.deadZone = Math.round(DEAD_ZONE * layout.ui);

    const v = layout.view;
    this.zoneTop = v.y + v.h * IDLE_BAND;
    this.splitX = v.x + v.w / 2;
    this.viewLeft = v.x;
    this.viewRight = v.x + v.w;

    const inset = this.travel + Math.round(28 * layout.ui);
    const y = v.y + v.h - inset;
    const near = v.x + inset;
    const far = v.x + v.w - inset;
    const stickX = side === 'right' ? far : near;
    const fireX = side === 'right' ? near : far;

    this.ghost.setPosition(stickX, y).setRadius(this.travel);
    this.base.setRadius(this.travel);
    this.knob.setRadius(Math.round(this.travel * 0.42));
    this.fireRing.setPosition(fireX, y).setRadius(this.travel);
    this.fireCore.setPosition(fireX, y).setRadius(Math.round(this.travel * 0.45));

    this.refresh();
  }

  pointerDown(x: number, y: number, id: number): void {
    if (!this.enabled) return;
    if (y < this.zoneTop || x < this.viewLeft || x > this.viewRight) return;

    const stickHalf = this.side === 'right' ? x >= this.splitX : x < this.splitX;

    if (stickHalf) {
      if (this.stickPointer !== -1) return;
      this.stickPointer = id;
      this.origin.set(x, y);
      this.direction = null;
      this.base.setPosition(x, y);
      this.knob.setPosition(x, y);
    } else {
      if (this.firePointer !== -1) return;
      this.firePointer = id;
      this.firing = true;
    }
    this.refresh();
  }

  pointerMove(x: number, y: number, id: number): void {
    if (id !== this.stickPointer) return;

    const dx = x - this.origin.x;
    const dy = y - this.origin.y;
    const dist = Math.hypot(dx, dy);

    // The knob stops at the rim even though the thumb may keep travelling.
    const reach = Math.min(dist, this.travel);
    const ux = dist > 0 ? dx / dist : 0;
    const uy = dist > 0 ? dy / dist : 0;
    this.knob.setPosition(this.origin.x + ux * reach, this.origin.y + uy * reach);

    if (dist < this.deadZone) {
      this.direction = null;
      return;
    }

    // Dominant axis wins, which is how the keyboard resolves two keys too.
    this.direction = Math.abs(dx) >= Math.abs(dy)
      ? (dx < 0 ? 'left' : 'right')
      : (dy < 0 ? 'up' : 'down');
  }

  pointerUp(id: number): void {
    if (id === this.stickPointer) {
      this.stickPointer = -1;
      this.direction = null;
    }
    if (id === this.firePointer) {
      this.firePointer = -1;
      this.firing = false;
    }
    this.refresh();
  }

  /** Drop every touch, e.g. when the game pauses under the player's thumb. */
  releaseAll(): void {
    this.stickPointer = -1;
    this.firePointer = -1;
    this.direction = null;
    this.firing = false;
    this.refresh();
  }

  private refresh(): void {
    const stickHeld = this.stickPointer !== -1;
    this.ghost.setVisible(this.enabled && !stickHeld);
    this.base.setVisible(this.enabled && stickHeld);
    this.knob.setVisible(this.enabled && stickHeld);
    this.fireRing.setVisible(this.enabled);
    this.fireCore.setVisible(this.enabled).setAlpha(this.firing ? 1 : 0.7);
  }
}
