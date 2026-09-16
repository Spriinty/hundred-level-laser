import Phaser from 'phaser';

export type Direction = 'left' | 'right' | 'up' | 'down' | null;

/** Thumb travel before the stick registers, and travel for a full tilt. */
const DEAD_ZONE = 11;
const MAX_TRAVEL = 54;

/**
 * True on devices driven by a finger rather than a mouse.
 *
 * Deliberately not just "does this support touch": a laptop with a
 * touchscreen and a mouse attached reports a fine pointer, and those players
 * are better served by the keyboard scheme.
 */
export function isTouchDevice(): boolean {
  return (
    typeof window !== 'undefined' &&
    navigator.maxTouchPoints > 0 &&
    window.matchMedia('(pointer: coarse)').matches
  );
}

/**
 * A floating four-way stick.
 *
 * It appears wherever the thumb lands instead of sitting at a fixed spot:
 * the comfortable thumb position depends on hand size and on which hand is
 * holding the phone, and a fixed stick gets that wrong for most people.
 *
 * It reports one of four directions rather than a vector, because the ship
 * moves on strict axes — an analogue reading would make it stutter between
 * two of them near the diagonals.
 */
export class TouchControls {
  /** Current direction, or null while the stick is idle or centred. */
  direction: Direction = null;

  private base: Phaser.GameObjects.Arc;
  private knob: Phaser.GameObjects.Arc;
  private pointerId = -1;
  private origin = new Phaser.Math.Vector2();
  private travel = MAX_TRAVEL;
  private deadZone = DEAD_ZONE;

  constructor(
    scene: Phaser.Scene,
    register: <T extends Phaser.GameObjects.GameObject>(obj: T) => T
  ) {
    this.base = register(
      scene.add.circle(0, 0, MAX_TRAVEL, 0x88bbff, 0.10)
        .setStrokeStyle(2, 0x88bbff, 0.35)
        .setScrollFactor(0).setDepth(400).setVisible(false)
    );

    this.knob = register(
      scene.add.circle(0, 0, MAX_TRAVEL * 0.42, 0x88bbff, 0.35)
        .setStrokeStyle(2, 0xbbddff, 0.7)
        .setScrollFactor(0).setDepth(401).setVisible(false)
    );
  }

  /** Scale the stick with the rest of the UI. */
  resize(ui: number): void {
    this.travel = Math.round(MAX_TRAVEL * ui);
    this.deadZone = Math.round(DEAD_ZONE * ui);
    this.base.setRadius(this.travel);
    this.knob.setRadius(Math.round(this.travel * 0.42));
  }

  get active(): boolean {
    return this.pointerId !== -1;
  }

  /** Plant the stick under a thumb that has just touched down. */
  begin(x: number, y: number, pointerId: number): void {
    this.pointerId = pointerId;
    this.origin.set(x, y);
    this.direction = null;
    this.base.setPosition(x, y).setVisible(true);
    this.knob.setPosition(x, y).setVisible(true);
  }

  drag(x: number, y: number, pointerId: number): void {
    if (pointerId !== this.pointerId) return;

    const dx = x - this.origin.x;
    const dy = y - this.origin.y;
    const dist = Math.hypot(dx, dy);

    // The knob stops at the rim, but the thumb may keep going.
    const reach = Math.min(dist, this.travel);
    const ux = dist > 0 ? dx / dist : 0;
    const uy = dist > 0 ? dy / dist : 0;
    this.knob.setPosition(this.origin.x + ux * reach, this.origin.y + uy * reach);

    if (dist < this.deadZone) {
      this.direction = null;
      return;
    }

    // Dominant axis wins, which is also how the keyboard resolves two keys.
    this.direction = Math.abs(dx) >= Math.abs(dy)
      ? (dx < 0 ? 'left' : 'right')
      : (dy < 0 ? 'up' : 'down');
  }

  /** Lift the stick. Pass a pointer id to ignore other fingers' releases. */
  release(pointerId?: number): void {
    if (pointerId !== undefined && pointerId !== this.pointerId) return;
    this.pointerId = -1;
    this.direction = null;
    this.base.setVisible(false);
    this.knob.setVisible(false);
  }
}
