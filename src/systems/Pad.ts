import Phaser from 'phaser';
import type { Direction } from './TouchControls';

/** Below this, a nudge on the stick is noise rather than a choice. */
const DEADZONE = 0.4;

/**
 * Phaser types the face buttons as `number | boolean`, because some pads
 * report them as pressure rather than as a switch. One threshold covers both.
 */
function down(v: number | boolean): boolean {
  return typeof v === 'number' ? v > 0.3 : v;
}

/**
 * An Xbox-style gamepad, read the same way as the touch stick: a direction
 * and a trigger, never a vector, because the ship only ever moves four ways.
 *
 * The pad is looked up every frame rather than held onto. Browsers hide
 * gamepads until one of their buttons has been pressed — a pad that is
 * already paired and switched on simply does not exist as far as the page is
 * concerned until the player touches it — so there is nothing to cache.
 */
export class Pad {
  private startWasDown = false;
  private confirmWasDown = false;
  private dirWasDown: Direction = null;

  constructor(private scene: Phaser.Scene) {}

  /** `input.gamepad` is undefined unless enabled in the game config. */
  private get pad(): Phaser.Input.Gamepad.Gamepad | undefined {
    return this.scene.input.gamepad?.getPad(0) ?? undefined;
  }

  get connected(): boolean {
    return this.pad !== undefined;
  }

  get direction(): Direction {
    const p = this.pad;
    if (!p) return null;

    // The d-pad says exactly one thing, so it wins over the stick.
    if (p.left) return 'left';
    if (p.right) return 'right';
    if (p.up) return 'up';
    if (p.down) return 'down';

    const x = p.leftStick.x;
    const y = p.leftStick.y;
    if (Math.hypot(x, y) < DEADZONE) return null;

    // Snap to the dominant axis: the same rule the keyboard follows, so a
    // diagonal push never produces something the keyboard could not.
    return Math.abs(x) >= Math.abs(y)
      ? (x > 0 ? 'right' : 'left')
      : (y > 0 ? 'down' : 'up');
  }

  /** A or either right trigger. Held, like the space bar. */
  get firing(): boolean {
    const p = this.pad;
    if (!p) return false;
    return down(p.A) || down(p.R1) || down(p.R2);
  }

  /**
   * Start, edge-triggered. Held down, it would toggle the pause menu on every
   * frame it is read.
   */
  startJustPressed(): boolean {
    const down = this.pad?.buttons[9]?.pressed ?? false;
    const fired = down && !this.startWasDown;
    this.startWasDown = down;
    return fired;
  }

  /**
   * The direction as a single event rather than a held state, for menus: a
   * stick pushed and kept there should step once, not sixty times a second.
   */
  directionJustPressed(): Direction {
    const now = this.direction;
    const fired = now !== null && now !== this.dirWasDown ? now : null;
    this.dirWasDown = now;
    return fired;
  }

  /** A or Start, edge-triggered — for menus, where either should confirm. */
  confirmJustPressed(): boolean {
    const p = this.pad;
    const held = down(p?.A ?? false) || (p?.buttons[9]?.pressed ?? false);
    const fired = held && !this.confirmWasDown;
    this.confirmWasDown = held;
    return fired;
  }
}
