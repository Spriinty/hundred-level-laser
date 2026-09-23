import Phaser from 'phaser';
import { computeLayout, fs, sp, type Layout } from '../systems/Layout';
import { playMusic } from '../systems/Music';
import { Pad } from '../systems/Pad';

/** How long a screen ignores input after opening, in ms. */
const SETTLE_MS = 250;
import { UI_FONT } from '../config/fonts';

/**
 * One entry in a screen's navigation order. `onLeft`/`onRight` are for rows
 * that hold a value rather than an action, like the volume bars.
 */
export interface FocusItem {
  target: Phaser.GameObjects.Text;
  onSelect: () => void;
  onLeft?: () => void;
  onRight?: () => void;
}

/**
 * Base class for the full-screen menu scenes (menu, game over, victory,
 * leaderboard).
 *
 * These scenes are cheap to draw, so rather than repositioning every object
 * when the window changes they simply redraw themselves against the new
 * layout. Scene state lives in fields and survives the redraw, and anything
 * that must only happen once — keyboard handlers, timers — belongs in
 * `create()` rather than in `draw()`.
 */
export abstract class UiScene extends Phaser.Scene {
  protected layout!: Layout;
  protected pad!: Pad;
  private drawn: Phaser.GameObjects.GameObject[] = [];

  /**
   * Rebuilt by every draw pass, since the objects it points at are. The index
   * outlives it, so changing a setting leaves the cursor where it was.
   */
  private focusItems: FocusItem[] = [];
  private focusIndex = 0;

  /**
   * Nothing on a freshly opened screen accepts input until this moment.
   *
   * Menu screens stack their buttons at similar heights, so the button that
   * opens a screen and the one that closes it can land within a few pixels of
   * each other. A pointer still down when the scene swaps gets handed to
   * whatever now sits underneath it, which walks straight back — and looks
   * exactly like a key being spammed.
   */
  private acceptFrom = 0;

  /** Draw the scene against `this.layout`. Called on create and on resize. */
  protected abstract draw(): void;

  /** Call at the end of `create()`. */
  protected startResponsive(): void {
    // Every menu screen shares one track, so walking between them — menu,
    // leaderboard, game over — never breaks the music.
    playMusic(this, 'menu');
    this.pad = new Pad(this);
    // Rebound on every start: Phaser tears a scene's keyboard listeners down
    // on shutdown, but the scene instance is reused, so a flag saying "already
    // bound" would leave a revisited screen deaf.
    this.bindMenuKeys();
    this.acceptFrom = performance.now() + SETTLE_MS;
    this.drawn = [];
    this.redraw();
    this.scale.on('resize', this.redraw, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.redraw, this));
  }

  protected redraw(): void {
    this.focusItems = [];
    this.tweens.killAll();
    this.drawn.forEach(o => o.destroy());
    this.drawn = [];
    this.layout = computeLayout(this.scale.width, this.scale.height);
    this.draw();
  }

  // ─── FOCUS ─────────────────────────────────────────────────────────────────

  /**
   * Add an entry to the navigation order. Called from `draw()`, in the order
   * the entries should be walked; a screen that registers none simply has no
   * keyboard or pad navigation, which is what the name-entry screens want
   * until the name is in.
   */
  protected focus(item: FocusItem): void {
    this.focusItems.push(item);
  }

  /** Call at the end of `draw()`, once every entry is registered. */
  protected showFocus(): void {
    if (this.focusItems.length === 0) return;
    this.focusIndex = Phaser.Math.Clamp(this.focusIndex, 0, this.focusItems.length - 1);

    const target = this.focusItems[this.focusIndex].target;
    // The left edge, whatever origin the target was given.
    const left = target.x - target.displayWidth * target.originX;
    const marker = this.own(
      this.add.text(left - this.sp(16), target.y, '▶', this.mono(20, '#ffcc44')).setOrigin(1, 0.5)
    );
    this.tweens.add({
      targets: marker, alpha: 0.35, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.inOut',
    });
  }

  private moveFocus(delta: number): void {
    const count = this.focusItems.length;
    if (count === 0) return;
    this.focusIndex = (this.focusIndex + delta + count) % count;
    this.redraw();
  }

  private nudgeFocus(delta: number): void {
    const item = this.focusItems[this.focusIndex];
    if (!item) return;

    const handler = delta < 0 ? item.onLeft : item.onRight;
    // An entry holding no value lets left and right walk the list instead,
    // which is what a row of side-by-side buttons wants.
    if (handler) handler();
    else this.moveFocus(delta);
  }

  private activateFocus(): void {
    if (!this.accepts()) return;
    this.focusItems[this.focusIndex]?.onSelect();
  }

  /** Bound once for the scene's life, not once per draw pass. */
  /**
   * Whether the screen has been open long enough to act on an input.
   *
   * Measured against `performance.now()` rather than the scene clock: Phaser
   * reuses a scene instance, and its clock keeps the time it held when the
   * scene last closed. A window opened against that stale reading is already
   * in the past, so it never held anything back.
   */
  private accepts(): boolean {
    return performance.now() >= this.acceptFrom;
  }

  private bindMenuKeys(): void {
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      // A screen with nothing registered leaves the keys to whoever else
      // wants them — the name entry, for one.
      if (this.focusItems.length === 0) return;

      switch (e.key) {
        case 'ArrowUp': this.moveFocus(-1); break;
        case 'ArrowDown': this.moveFocus(1); break;
        case 'ArrowLeft': this.nudgeFocus(-1); break;
        case 'ArrowRight': this.nudgeFocus(1); break;
        case 'Enter': case ' ': this.activateFocus(); break;
        default: return;
      }
      e.preventDefault();
    });
  }

  update(): void {
    if (!this.pad || this.focusItems.length === 0) return;

    if (this.pad.confirmJustPressed()) {
      this.activateFocus();
      return;
    }
    switch (this.pad.directionJustPressed()) {
      case 'up': this.moveFocus(-1); break;
      case 'down': this.moveFocus(1); break;
      case 'left': this.nudgeFocus(-1); break;
      case 'right': this.nudgeFocus(1); break;
    }
  }

  /** Register an object so the next redraw disposes of it. */
  protected own<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.drawn.push(obj);
    return obj;
  }

  protected fs(base: number, min = 10): string {
    return fs(this.layout, base, min);
  }

  protected sp(base: number): number {
    return sp(this.layout, base);
  }

  protected mono(size: number, color: string, extra: object = {}): Phaser.Types.GameObjects.Text.TextStyle {
    return { fontFamily: UI_FONT, fontSize: this.fs(size), color, ...extra };
  }

  /**
   * The sky, drawn once and kept as data.
   *
   * Stored as fractions of the viewport rather than pixels, so the same stars
   * land in the same places whatever the window size.
   */
  private sky: { fx: number; fy: number; alpha: number }[] = [];

  /** Scatter a starfield across the whole canvas at the reference density. */
  protected stars(count: number, minAlpha = 0.2, maxAlpha = 1): void {
    const { width, height } = this.layout;
    const density = Math.min(3, (width * height) / (1280 * 720));
    const n = Math.round(count * Math.max(0.5, density));

    // Positions are drawn once and reused. `redraw()` runs on every option
    // toggle, not only on resize, so rolling them here made the stars jump
    // whenever a setting changed — a draw pass has to be a pure function of
    // the layout and the state, never of the random number generator.
    while (this.sky.length < n) {
      this.sky.push({
        fx: Math.random(),
        fy: Math.random(),
        alpha: Phaser.Math.FloatBetween(minAlpha, maxAlpha),
      });
    }

    for (let i = 0; i < n; i++) {
      const star = this.sky[i];
      this.own(
        this.add.image(star.fx * width, star.fy * height, 'star').setAlpha(star.alpha)
      );
    }
  }

  /** A text button with the hover colours and pointer cursor already wired. */
  protected button(
    x: number, y: number, label: string,
    size: number, color: string, hover: string,
    onClick: () => void,
    extra: object = {}
  ): Phaser.GameObjects.Text {
    const btn = this.own(
      this.add.text(x, y, label, this.mono(size, color, extra))
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
    );
    btn.on('pointerover', () => btn.setStyle({ color: hover }));
    btn.on('pointerout', () => btn.setStyle({ color }));
    btn.on('pointerdown', () => { if (this.accepts()) onClick(); });
    return btn;
  }
}
