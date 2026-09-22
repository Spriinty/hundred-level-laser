import Phaser from 'phaser';
import { TILE_SIZE, LASER_COLORS } from '../config/constants';

// All asset keys that can be loaded from files in public/assets/
const FILE_ASSETS = [
  'player',
  'wall',
  'enemy-0', 'enemy-1', 'enemy-2', 'enemy-3', 'enemy-boss',
  'bullet-0', 'bullet-1', 'bullet-2', 'bullet-3',
  'enemy-bullet', 'enemy-bullet-aimed',
  'pickup-life', 'pickup-extra-life', 'pickup-dual', 'pickup-rear',
  'pickup-shield', 'pickup-bomb', 'pickup-armor',
] as const;

export class BootScene extends Phaser.Scene {
  private missing = new Set<string>();

  constructor() {
    super({ key: 'Boot' });
  }

  preload(): void {
    // Track which files are missing so we can generate fallbacks
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      this.missing.add(file.key);
    });

    // Attempt to load each asset from public/assets/
    for (const key of FILE_ASSETS) {
      this.load.image(key, `assets/${key}.png`);
    }
  }

  create(): void {
    // Generate programmatic fallback for every missing asset
    if (this.needs('wall'))         this.makeWall();
    if (this.needs('player'))       this.makePlayer();
    if (this.needs('enemy-0'))      this.makeEnemy0();
    if (this.needs('enemy-1'))      this.makeEnemy1();
    if (this.needs('enemy-2'))      this.makeEnemy2();
    if (this.needs('enemy-3'))      this.makeEnemy3();
    if (this.needs('enemy-boss'))   this.makeEnemyBoss();
    for (let i = 0; i < 4; i++) {
      if (this.needs(`bullet-${i}`)) this.makeBullet(i);
    }
    for (const t of ['life','extra-life','dual','rear','shield','bomb','armor'] as const) {
      if (this.needs(`pickup-${t}`)) this.makePickup(t);
    }
    if (this.needs('enemy-bullet')) this.makeEnemyBullet();
    if (this.needs('enemy-bullet-aimed')) this.makeEnemyBulletAimed();
    // Laser parts are always generated (collectible pickups, one per tier)
    for (let i = 0; i <= 3; i++) this.makeLaserPart(i);
    // Stars are always generated: a 2px dot for the menu backdrops, and
    // two tiling sheets used as the in-game background.
    this.makeStar();
    this.makeStarfield();
    this.makeFlame();

    this.scene.start('Menu');
  }

  private needs(key: string): boolean {
    return this.missing.has(key);
  }

  // ─── FALLBACK GENERATORS ───────────────────────────────────────────────────

  /**
   * Two tiling star sheets. 512 is a power of two, so WebGL repeats them
   * directly, and it is wide enough that the repeat is hard to notice once
   * the two layers scroll at different speeds.
   */
  private makeStarfield(): void {
    const sheet = (key: string, count: number, maxRadius: number, maxAlpha: number) => {
      const g = this.add.graphics();
      for (let i = 0; i < count; i++) {
        // A few cold and warm stars keep the field from reading as flat white.
        const tint = Phaser.Math.RND.pick([0xffffff, 0xffffff, 0xffffff, 0xcfe4ff, 0xffe8c8]);
        g.fillStyle(tint, Phaser.Math.FloatBetween(maxAlpha * 0.35, maxAlpha));
        g.fillCircle(
          Phaser.Math.Between(0, 511),
          Phaser.Math.Between(0, 511),
          Phaser.Math.FloatBetween(0.5, maxRadius)
        );
      }
      g.generateTexture(key, 512, 512);
      g.destroy();
    };

    sheet('stars-far', 260, 1.1, 0.55);
    sheet('stars-near', 70, 2.0, 0.95);
  }

  private makeWall(): void {
    const g = this.add.graphics();
    g.fillStyle(0x1a2a4a);
    g.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    g.fillStyle(0x243462);
    g.fillRect(2, 2, TILE_SIZE - 4, TILE_SIZE - 4);
    g.lineStyle(2, 0x3356a8);
    g.strokeRect(1, 1, TILE_SIZE - 2, TILE_SIZE - 2);
    g.fillStyle(0x2e4070, 0.6);
    g.fillRect(4, 4, 8, 8);
    g.fillStyle(0x1e2e55, 0.6);
    g.fillRect(18, 16, 6, 6);
    g.generateTexture('wall', TILE_SIZE, TILE_SIZE);
    g.destroy();
  }

  private makePlayer(): void {
    const g = this.add.graphics();
    const s = 36;
    g.fillStyle(0x2266ff, 0.5);
    g.fillEllipse(s / 2, s - 6, 14, 10);
    g.fillStyle(0xddeeff);
    g.fillTriangle(s / 2, 2, s - 4, s - 6, 4, s - 6);
    g.fillStyle(0x66aaff);
    g.fillEllipse(s / 2, s / 2 - 2, 10, 12);
    g.lineStyle(1, 0x88bbff);
    g.lineBetween(4, s - 6, s / 2, s / 2 - 4);
    g.lineBetween(s - 4, s - 6, s / 2, s / 2 - 4);
    g.generateTexture('player', s, s);
    g.destroy();
  }

  private makeEnemy0(): void {
    const g = this.add.graphics();
    const s = 28;
    g.fillStyle(0xdd2222);
    g.fillTriangle(s / 2, 2, s - 2, s / 2, s / 2, s - 2);
    g.fillTriangle(s / 2, 2, 2, s / 2, s / 2, s - 2);
    g.lineStyle(1, 0xff5544);
    g.strokeRect(s / 4, s / 4, s / 2, s / 2);
    g.generateTexture('enemy-0', s, s);
    g.destroy();
  }

  private makeEnemy1(): void {
    const g = this.add.graphics();
    const s = 28;
    g.fillStyle(0xdd6600);
    g.fillRect(6, 2, s - 12, s - 4);
    g.fillRect(2, 6, s - 4, s - 12);
    g.lineStyle(1, 0xff9933);
    g.strokeRect(4, 4, s - 8, s - 8);
    g.generateTexture('enemy-1', s, s);
    g.destroy();
  }

  private makeEnemy2(): void {
    const g = this.add.graphics();
    const s = 28;
    g.fillStyle(0xaa00dd);
    g.fillCircle(s / 2, s / 2, s / 2 - 2);
    g.fillStyle(0xcc22ff, 0.6);
    g.fillCircle(s / 2, s / 2, s / 4);
    g.generateTexture('enemy-2', s, s);
    g.destroy();
  }

  private makeEnemy3(): void {
    const g = this.add.graphics();
    const s = 28;
    g.fillStyle(0xddaa00);
    g.fillCircle(s / 2, s / 2, s / 2 - 2);
    g.fillStyle(0x111111);
    g.fillCircle(s / 2, s / 2, s / 4);
    g.fillStyle(0xffcc00);
    g.fillCircle(s / 2, s / 2, s / 6);
    g.generateTexture('enemy-3', s, s);
    g.destroy();
  }

  private makeEnemyBoss(): void {
    const g = this.add.graphics();
    const s = 44;
    g.fillStyle(0xcc0000);
    g.fillCircle(s / 2, s / 2, s / 2 - 2);
    g.fillStyle(0xff4444);
    g.fillRect(s / 2 - 3, 4, 6, s - 8);
    g.fillRect(4, s / 2 - 3, s - 8, 6);
    g.fillStyle(0xff0000, 0.7);
    g.fillCircle(s / 2, s / 2, s / 4);
    g.lineStyle(2, 0xff6666);
    g.strokeCircle(s / 2, s / 2, s / 2 - 2);
    g.generateTexture('enemy-boss', s, s);
    g.destroy();
  }

  private makeBullet(tier: number): void {
    const color = LASER_COLORS[tier];
    const g = this.add.graphics();
    g.fillStyle(color);
    g.fillRect(0, 0, 5, 14);
    g.fillStyle(color, 0.5);
    g.fillRect(-1, 2, 7, 10);
    g.generateTexture(`bullet-${tier}`, 5, 14);
    g.destroy();
  }

  private makeEnemyBullet(): void {
    const g = this.add.graphics();
    g.fillStyle(0xdd44ff);
    g.fillRect(0, 0, 5, 14);
    g.fillStyle(0xee88ff, 0.5);
    g.fillRect(-1, 2, 7, 10);
    g.generateTexture('enemy-bullet', 5, 14);
    g.destroy();
  }

  /**
   * The round fired when an enemy has actually taken aim. It has to be
   * legible at a glance among the blind shots, so it is wider, hotter and
   * barbed rather than a recolour. Drop `enemy-bullet-aimed.png` into
   * public/assets/ and it takes over with no code change.
   */
  private makeEnemyBulletAimed(): void {
    const g = this.add.graphics();
    g.fillStyle(0xff3322);
    g.fillTriangle(4, 0, 8, 7, 0, 7);
    g.fillRect(1, 6, 6, 10);
    g.fillStyle(0xffdd66, 0.9);
    g.fillRect(3, 2, 2, 9);
    g.fillStyle(0xff8866, 0.55);
    g.fillRect(-1, 4, 10, 9);
    g.generateTexture('enemy-bullet-aimed', 8, 18);
    g.destroy();
  }

  private makePickup(type: string): void {
    const colors: Record<string, number> = {
      life: 0xff4466, 'extra-life': 0xffaa00,
      dual: 0x4466ff, rear: 0xff6644,
      shield: 0x44ddff, bomb: 0xffdd44, armor: 0x44aaff,
    };
    const color = colors[type] ?? 0xffffff;
    const key = `pickup-${type}`;
    // Remove stale/broken texture entry left by a failed file load
    if (this.textures.exists(key)) this.textures.remove(key);
    const g = this.add.graphics();
    const s = 24;
    g.fillStyle(0x000000, 0.5);
    g.fillCircle(s / 2 + 1, s / 2 + 1, s / 2 - 1);
    g.fillStyle(color);
    g.fillCircle(s / 2, s / 2, s / 2 - 1);
    g.fillStyle(0xffffff, 0.3);
    g.fillCircle(s / 2 - 3, s / 2 - 3, 5);
    g.lineStyle(2, 0xffffff, 0.5);
    g.strokeCircle(s / 2, s / 2, s / 2 - 1);
    g.generateTexture(key, s, s);
    g.destroy();
  }

  private makeLaserPart(tier: number): void {
    const color = LASER_COLORS[tier];
    const key = `laser-part-${tier}`;
    if (this.textures.exists(key)) this.textures.remove(key);
    const g = this.add.graphics();
    const s = 32;
    g.lineStyle(2, color, 1);
    g.strokeCircle(s / 2, s / 2, s / 2 - 1);
    g.fillStyle(color, 0.15);
    g.fillCircle(s / 2, s / 2, s / 2 - 2);
    g.fillStyle(color, 1);
    g.fillRect(s / 2 - 2, s / 2 - 6, 5, 12);
    g.fillStyle(0xffffff, 0.4);
    g.fillRect(s / 2 - 1, s / 2 - 5, 2, 4);
    g.generateTexture(key, s, s);
    g.destroy();
  }

  /**
   * A soft white blob for the engine plumes. White so that the emitter's own
   * colour ramp decides what the flame looks like, and soft-edged so the
   * additive blend builds a glow instead of a disc.
   */
  private makeFlame(): void {
    const g = this.add.graphics();
    const s = 16;
    for (let r = s / 2; r > 0; r--) {
      // Alpha falls off towards the rim; squaring makes the core read hotter.
      const t = 1 - r / (s / 2);
      g.fillStyle(0xffffff, 0.12 + t * t * 0.7);
      g.fillCircle(s / 2, s / 2, r);
    }
    g.generateTexture('flame', s, s);
    g.destroy();
  }

  private makeStar(): void {
    const g = this.add.graphics();
    g.fillStyle(0xffffff);
    g.fillCircle(1, 1, 1);
    g.generateTexture('star', 2, 2);
    g.destroy();
  }
}
