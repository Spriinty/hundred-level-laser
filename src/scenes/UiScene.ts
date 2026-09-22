import Phaser from 'phaser';
import { computeLayout, fs, sp, type Layout } from '../systems/Layout';
import { playMusic } from '../systems/Music';

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
  private drawn: Phaser.GameObjects.GameObject[] = [];

  /** Draw the scene against `this.layout`. Called on create and on resize. */
  protected abstract draw(): void;

  /** Call at the end of `create()`. */
  protected startResponsive(): void {
    // Every menu screen shares one track, so walking between them — menu,
    // leaderboard, game over — never breaks the music.
    playMusic(this, 'menu');
    this.drawn = [];
    this.redraw();
    this.scale.on('resize', this.redraw, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.redraw, this));
  }

  protected redraw(): void {
    this.tweens.killAll();
    this.drawn.forEach(o => o.destroy());
    this.drawn = [];
    this.layout = computeLayout(this.scale.width, this.scale.height);
    this.draw();
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
    return { fontFamily: 'monospace', fontSize: this.fs(size), color, ...extra };
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
    btn.on('pointerdown', onClick);
    return btn;
  }
}
