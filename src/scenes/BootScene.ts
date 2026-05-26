import Phaser from 'phaser';
import { TILE_SIZE, LASER_COLORS } from '../config/constants';

// All asset keys that can be loaded from files in public/assets/
const FILE_ASSETS = [
  'player',
  'wall', 'floor',
  'enemy-0', 'enemy-1', 'enemy-2', 'enemy-3', 'enemy-boss',
  'bullet-0', 'bullet-1', 'bullet-2', 'bullet-3',
  'enemy-bullet',
  'pickup-life', 'pickup-extra-life', 'pickup-dual', 'pickup-rear',
  'pickup-shield', 'pickup-bomb', 'pickup-score', 'pickup-armor',
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
    if (this.needs('floor'))        this.makeFloor();
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
    for (const t of ['life','extra-life','dual','rear','shield','bomb','score','armor'] as const) {
      if (this.needs(`pickup-${t}`)) this.makePickup(t);
    }
    if (this.needs('enemy-bullet')) this.makeEnemyBullet();
    // Laser parts are always generated (collectible pickups, tiers 1-3)
    for (let i = 1; i <= 3; i++) this.makeLaserPart(i);
    // Star is always generated (tiny, no point having a file for it)
    this.makeStar();

    this.scene.start('Menu');
  }

  private needs(key: string): boolean {
    return this.missing.has(key);
  }

  // ─── FALLBACK GENERATORS ───────────────────────────────────────────────────

  private makeFloor(): void {
    const g = this.add.graphics();
    g.fillStyle(0x07070f);
    g.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    g.lineStyle(1, 0x11112a, 1);
    g.strokeRect(0, 0, TILE_SIZE, TILE_SIZE);
    g.generateTexture('floor', TILE_SIZE, TILE_SIZE);
    g.destroy();
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

  private makePickup(type: string): void {
    const colors: Record<string, number> = {
      life: 0xff4466, 'extra-life': 0xffaa00,
      dual: 0x4466ff, rear: 0xff6644,
      shield: 0x44ddff, bomb: 0xffdd44, score: 0xaaff44, armor: 0x44aaff,
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

  private makeStar(): void {
    const g = this.add.graphics();
    g.fillStyle(0xffffff);
    g.fillCircle(1, 1, 1);
    g.generateTexture('star', 2, 2);
    g.destroy();
  }
}
