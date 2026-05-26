import Phaser from 'phaser';
import {
  GAME_WIDTH, GAME_HEIGHT, TILE_SIZE, MAX_LEVEL,
  PLAYER_SPEED, PLAYER_BASE_HP, PLAYER_MAX_HP, PLAYER_BASE_LIVES, PLAYER_MAX_LIVES,
  PLAYER_MAX_ARMOR,
  BULLET_SPEED, ENEMY_SPEED, BOSS_SPEED,
  FIRE_RATE, LASER_COLORS, LASER_DAMAGE, SCORE_MULT_DURATION,
  ENEMY_FIRE_RATE, ENEMY_BULLET_SPEED,
  LASER_PARTS_NEEDED, LASER_PART_START_LEVEL,
  getGridSize, getEnemyHP, getEnemyCount,
  isBossLevel, getPickupCount,
} from '../config/constants';
import { LevelGenerator } from '../systems/LevelGenerator';

const HUD_W = 220; // width of the right HUD panel

type PickupType = 'life' | 'extra-life' | 'dual' | 'rear' | 'shield' | 'bomb' | 'score' | 'armor' | 'laser-part';
const PICKUP_TYPES: PickupType[] = ['life', 'extra-life', 'dual', 'rear', 'shield', 'bomb', 'score', 'armor'];

// 4-directional enemy movement velocities
const ENEMY_DIRS: [number, number][] = [
  [ENEMY_SPEED, 0],
  [-ENEMY_SPEED, 0],
  [0, ENEMY_SPEED],
  [0, -ENEMY_SPEED],
];

const BOSS_DIRS: [number, number][] = [
  [BOSS_SPEED, 0],
  [-BOSS_SPEED, 0],
  [0, BOSS_SPEED],
  [0, -BOSS_SPEED],
];

export class GameScene extends Phaser.Scene {
  // Map
  private walls!: Phaser.Physics.Arcade.StaticGroup;
  private worldW = 0;
  private worldH = 0;

  // Player
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private playerHP = PLAYER_BASE_HP;
  private lives = PLAYER_BASE_LIVES;
  private laserTier = 0;
  private laserParts = 0;
  private dualCount = 0;   // extra front lasers (stacks)
  private rearCount = 0;   // rear lasers (stacks)
  private shieldActive = false;
  private armorPoints = 0;
  private lastFired = 0;
  private invincibleTimer = 0;
  private facingAngle = -Math.PI / 2; // start facing up
  private shieldSprite!: Phaser.GameObjects.Arc;

  // Groups
  private bullets!: Phaser.Physics.Arcade.Group;
  private enemyBullets!: Phaser.Physics.Arcade.Group;
  private enemies!: Phaser.Physics.Arcade.Group;
  private pickups!: Phaser.Physics.Arcade.StaticGroup;

  // Input
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyW!: Phaser.Input.Keyboard.Key;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyS!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private escKey!: Phaser.Input.Keyboard.Key;

  // HUD
  private heartTexts: Phaser.GameObjects.Text[] = [];
  private livesText!: Phaser.GameObjects.Text;
  private armorText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private powerupBar!: Phaser.GameObjects.Text;
  private enemyCountText!: Phaser.GameObjects.Text;
  private flashOverlay!: Phaser.GameObjects.Rectangle;
  private hudPanel!: Phaser.GameObjects.Rectangle;   // border line
  private hudPanelBg!: Phaser.GameObjects.Rectangle; // opaque background inside HUD camera

  // State
  private level = 1;
  private score = 0;
  private scoreMult = 1;
  private scoreMultTimer = 0;
  private transitioning = false;
  private isDead = false;
  private paused = false;
  private pauseOverlayGroup: Phaser.GameObjects.GameObject[] = [];
  private countingDown = false;

  // Player spawn position (to respawn on same level)
  private spawnX = 0;
  private spawnY = 0;

  // Timed pickup spawning
  private floorTiles: { x: number; y: number }[] = [];

  // Cameras
  private minimap!: Phaser.Cameras.Scene2D.Camera;
  private hudCamera!: Phaser.Cameras.Scene2D.Camera;

  // Navigation
  private enemyArrowsGfx!: Phaser.GameObjects.Graphics;
  private minimapBorder!: Phaser.GameObjects.Rectangle;

  constructor() {
    super({ key: 'Game' });
  }

  init(data: { level?: number; score?: number; hp?: number; lives?: number; armor?: number; laserTier?: number; laserParts?: number }): void {
    this.level = data.level ?? 1;
    this.score = data.score ?? 0;
    this.playerHP = data.hp ?? PLAYER_BASE_HP;
    this.lives = data.lives ?? PLAYER_BASE_LIVES;
    this.armorPoints = data.armor ?? 0;
    this.laserTier = data.laserTier ?? 0;
    this.laserParts = data.laserParts ?? 0;
    this.dualCount = 0;
    this.rearCount = 0;
    this.shieldActive = false;
    this.lastFired = 0;
    this.invincibleTimer = 0;
    this.facingAngle = -Math.PI / 2;
    this.scoreMult = 1;
    this.scoreMultTimer = 0;
    this.transitioning = false;
    this.isDead = false;
    this.paused = false;
    this.pauseOverlayGroup = [];
    this.countingDown = false;
    this.floorTiles = [];
  }

  create(): void {
    const gridSize = getGridSize(this.level);
    this.worldW = gridSize * TILE_SIZE;
    this.worldH = gridSize * TILE_SIZE;

    const gen = new LevelGenerator();
    const data = gen.generate(
      gridSize, gridSize,
      getPickupCount(this.level),
      getEnemyCount(this.level) + (isBossLevel(this.level) ? 1 : 0)
    );

    this.buildMap(data.grid, gridSize);
    this.pickups = this.physics.add.staticGroup();
    this.spawnPlayer(data.playerPos);
    this.spawnEnemies(data.enemyPositions);

    this.setupPhysics();
    this.setupInput();
    this.setupCamera();
    this.buildHUD();

    const gameAreaW = GAME_WIDTH - HUD_W;
    this.flashOverlay = this.add
      .rectangle(gameAreaW / 2, GAME_HEIGHT / 2, gameAreaW, GAME_HEIGHT, 0xffffff, 0)
      .setScrollFactor(0)
      .setDepth(100);

    this.enemyArrowsGfx = this.add.graphics().setScrollFactor(0).setDepth(250);
    // These game-area objects must not bleed into the HUD camera
    this.hudCamera.ignore(this.flashOverlay);
    this.hudCamera.ignore(this.enemyArrowsGfx);
    this.buildMinimap();
    this.scheduleNextPickup();
    if (this.level >= LASER_PART_START_LEVEL && this.laserTier < 3) {
      this.spawnLaserPart();
    }
    this.startCountdown();
  }

  // ─── MAP ───────────────────────────────────────────────────────────────────

  private buildMap(grid: number[][], gridSize: number): void {
    const floorSrc = this.textures.get('floor').source[0];
    const floorScale = TILE_SIZE / floorSrc.width;
    this.add
      .tileSprite(0, 0, this.worldW, this.worldH, 'floor')
      .setOrigin(0, 0)
      .setDepth(0)
      .setTileScale(floorScale);

    this.walls = this.physics.add.staticGroup();
    this.floorTiles = [];

    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        if (grid[y][x] === 1) {
          const w = this.walls.create(
            x * TILE_SIZE + TILE_SIZE / 2,
            y * TILE_SIZE + TILE_SIZE / 2,
            'wall'
          ) as Phaser.Physics.Arcade.Sprite;
          w.setDisplaySize(TILE_SIZE, TILE_SIZE).setDepth(1).refreshBody();
        } else {
          this.floorTiles.push({ x, y });
        }
      }
    }
  }

  // ─── PLAYER ────────────────────────────────────────────────────────────────

  private spawnPlayer(pos: { x: number; y: number }): void {
    this.spawnX = pos.x * TILE_SIZE + TILE_SIZE / 2;
    this.spawnY = pos.y * TILE_SIZE + TILE_SIZE / 2;

    this.player = this.physics.add
      .sprite(this.spawnX, this.spawnY, 'player')
      .setDisplaySize(52, 52).setOrigin(0.5, 0.5)
      .setDepth(10)
      .setCollideWorldBounds(true);
    const pr = 50;
    this.player.body.setCircle(pr, this.player.displayOriginX - pr, this.player.displayOriginY - pr);

    this.shieldSprite = this.add
      .arc(this.spawnX, this.spawnY, 30, 0, 360, false, 0x44ddff, 0)
      .setDepth(11)
      .setStrokeStyle(3, 0x44ddff, 0);
  }

  // ─── ENEMIES ───────────────────────────────────────────────────────────────

  private spawnEnemies(positions: { x: number; y: number }[]): void {
    this.enemies = this.physics.add.group();
    const hp = getEnemyHP(this.level);
    const count = getEnemyCount(this.level);
    const tier = Math.min(3, Math.floor((this.level - 1) / 25));
    const texKey = `enemy-${tier}`;

    for (let i = 0; i < Math.min(count, positions.length); i++) {
      const pos = positions[i];
      const ex = pos.x * TILE_SIZE + TILE_SIZE / 2;
      const ey = pos.y * TILE_SIZE + TILE_SIZE / 2;
      const enemy = this.enemies.create(ex, ey, texKey) as Phaser.Physics.Arcade.Sprite;
      enemy.setDisplaySize(44, 44).setOrigin(0.5, 0.5).setDepth(8);
      enemy.setData('hp', hp);
      enemy.setData('maxHp', hp);
      enemy.setData('isBoss', false);
      enemy.setData('wanderTimer', Math.random() * 800);
      enemy.setData('lastShot', -Math.random() * ENEMY_FIRE_RATE);
      const er = 44;
      (enemy.body as Phaser.Physics.Arcade.Body).setCircle(er, enemy.displayOriginX - er, enemy.displayOriginY - er);
      // Start with a random direction
      const dir = ENEMY_DIRS[Math.floor(Math.random() * 4)];
      enemy.setVelocity(dir[0], dir[1]);
      enemy.setRotation(Math.atan2(dir[1], dir[0]) + Math.PI / 2);
    }

    if (isBossLevel(this.level) && positions.length > count) {
      const bpos = positions[count];
      const bx = bpos.x * TILE_SIZE + TILE_SIZE / 2;
      const by = bpos.y * TILE_SIZE + TILE_SIZE / 2;
      const boss = this.enemies.create(bx, by, 'enemy-boss') as Phaser.Physics.Arcade.Sprite;
      boss.setDisplaySize(62, 62).setOrigin(0.5, 0.5).setDepth(9);
      boss.setData('hp', hp * 5);
      boss.setData('maxHp', hp * 5);
      boss.setData('isBoss', true);
      boss.setData('wanderTimer', 0);
      boss.setData('lastShot', -Math.random() * ENEMY_FIRE_RATE * 0.5);
      const br = 56;
      (boss.body as Phaser.Physics.Arcade.Body).setCircle(br, boss.displayOriginX - br, boss.displayOriginY - br);
      const bdir = BOSS_DIRS[Math.floor(Math.random() * 4)];
      boss.setVelocity(bdir[0], bdir[1]);
      boss.setRotation(Math.atan2(bdir[1], bdir[0]) + Math.PI / 2);
    }
  }

  // ─── PHYSICS ───────────────────────────────────────────────────────────────

  private setupPhysics(): void {
    this.bullets = this.physics.add.group({ maxSize: 80 });
    this.enemyBullets = this.physics.add.group({ maxSize: 60 });

    this.physics.add.collider(this.player, this.walls);

    // Enemy bullets vs walls → destroy
    this.physics.add.collider(this.enemyBullets, this.walls, (b) => {
      (b as Phaser.Physics.Arcade.Sprite).destroy();
    });

    // Enemy bullets vs player → damage
    this.physics.add.overlap(this.player, this.enemyBullets, (_p, b) => {
      const bullet = b as Phaser.Physics.Arcade.Sprite;
      if (!bullet.active || this.isDead) return;
      bullet.destroy();
      this.damagePlayer(1);
    });
    this.physics.add.collider(this.enemies, this.walls, (_e, _w) => {
      // Enemy hit wall → pick new random direction next frame
      const enemy = _e as Phaser.Physics.Arcade.Sprite;
      enemy.setData('wanderTimer', 0);
    });
    this.physics.add.collider(this.enemies, this.enemies);

    this.physics.add.collider(
      this.bullets, this.walls,
      (bullet) => { (bullet as Phaser.Physics.Arcade.Sprite).destroy(); }
    );

    this.physics.add.overlap(
      this.bullets, this.enemies,
      (bulletGO, enemyGO) => {
        const bullet = bulletGO as Phaser.Physics.Arcade.Sprite;
        const enemy = enemyGO as Phaser.Physics.Arcade.Sprite;
        if (!bullet.active || !enemy.active) return;
        bullet.destroy();
        this.hitEnemy(enemy);
      }
    );

    this.physics.add.overlap(
      this.player, this.enemies,
      (_p, enemyGO) => {
        if (!this.isDead) this.damagePlayer(1);
        // Push enemy away briefly
        const e = enemyGO as Phaser.Physics.Arcade.Sprite;
        e.setData('wanderTimer', 0);
      }
    );

    this.physics.add.overlap(
      this.player, this.pickups,
      (_p, pickupGO) => {
        const pickup = pickupGO as Phaser.Physics.Arcade.Sprite;
        if (!pickup.active) return;
        this.collectPickup(pickup);
      }
    );

    this.physics.world.setBounds(0, 0, this.worldW, this.worldH);
  }

  // ─── INPUT ─────────────────────────────────────────────────────────────────

  private setupInput(): void {
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keyW = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.keyA = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyS = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.keyD = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.escKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
  }

  // ─── CAMERA ────────────────────────────────────────────────────────────────

  private setupCamera(): void {
    // Restrict game camera to the left portion; right HUD_W px are the HUD panel
    this.cameras.main.setViewport(0, 0, GAME_WIDTH - HUD_W, GAME_HEIGHT);
    this.cameras.main.setBounds(0, 0, this.worldW, this.worldH);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.cameras.main.setBackgroundColor(0x000000);
  }

  // ─── HUD ───────────────────────────────────────────────────────────────────

  private buildHUD(): void {
    const AREA_W = GAME_WIDTH - HUD_W; // 1060 — game viewport width
    const R = HUD_W - 10;             // 210  — right edge in HUD-local coords
    const mono = (size: string, color: string) => ({
      fontFamily: 'monospace', fontSize: size, color,
    });

    // ── Dedicated HUD camera (right 220 px of canvas) ──────────────
    this.hudCamera = this.cameras.add(AREA_W, 0, HUD_W, GAME_HEIGHT);
    this.hudCamera.setBackgroundColor(0x000c14);

    // Opaque solid fill that sits ABOVE all game-world objects (depth 0–15)
    // but BELOW HUD texts (depth 200). The HUD camera renders this and it
    // completely hides any world tiles/sprites the HUD camera happens to see.
    // scrollFactor(0): main canvas_x = 0 + HUD_W/2 = 110  → ignore on main camera!
    //                  HUD  canvas_x = 1060 + 110 = 1170   → fills HUD panel ✓
    this.hudPanelBg = this.add
      .rectangle(HUD_W / 2, GAME_HEIGHT / 2, HUD_W, GAME_HEIGHT, 0x000c14)
      .setScrollFactor(0).setDepth(150);

    // Thin border at the very right edge of the game camera viewport.
    // scrollFactor(0): main canvas_x = 1059 ✓ (at right edge)
    //                  HUD  canvas_x = 2119 → off screen ✓
    this.hudPanel = this.add
      .rectangle(AREA_W - 1, GAME_HEIGHT / 2, 2, GAME_HEIGHT, 0x2244aa, 0.8)
      .setScrollFactor(0).setDepth(199);

    // "Niveau" centred in the game area (x=530 stays inside 0–1060 viewport)
    this.add.text(AREA_W / 2, 10, `Niveau ${this.level}/${MAX_LEVEL}`,
      mono('22px', '#88bbff'))
      .setOrigin(0.5, 0).setScrollFactor(0).setDepth(200);

    // ── HUD texts at local coords (x ∈ 0–220) ──────────────────────
    // scrollFactor(0): main canvas_x = x  → need camera.ignore below!
    //                  HUD  canvas_x = 1060 + x ✓
    this.scoreText = this.add.text(R, 10, `Score: ${this.score}`,
      mono('17px', '#ffcc44'))
      .setOrigin(1, 0).setScrollFactor(0).setDepth(200);

    this.enemyCountText = this.add.text(R, 34, '',
      mono('15px', '#ff8866'))
      .setOrigin(1, 0).setScrollFactor(0).setDepth(200);

    // Hearts at y=56 (updateHearts uses R=210)

    // Lives at y=78
    this.livesText = this.add.text(R, 78, '',
      mono('15px', '#ffaa44'))
      .setOrigin(1, 0).setScrollFactor(0).setDepth(200);

    // Armor directly below lives at y=96
    this.armorText = this.add.text(R, 96, '',
      mono('14px', '#4499ff'))
      .setOrigin(1, 0).setScrollFactor(0).setDepth(200);

    // Laser info + extras from y=122
    this.powerupBar = this.add.text(R, 122, '',
      mono('13px', '#44ffaa'))
      .setOrigin(1, 0).setScrollFactor(0).setDepth(200);

    this.updateHearts();
    this.updateLivesText();
    this.updateArmorDisplay();

    // Exclude from main game camera: HUD texts + opaque panel background
    this.cameras.main.ignore([
      this.hudPanelBg,
      this.scoreText, this.enemyCountText, this.livesText, this.armorText,
      this.powerupBar, ...this.heartTexts,
    ]);
  }

  private updateHearts(): void {
    this.heartTexts.forEach(t => t.destroy());
    this.heartTexts = [];
    const R = HUD_W - 10; // HUD-local right edge (210)
    for (let i = 0; i < PLAYER_MAX_HP; i++) {
      const filled = i < this.playerHP;
      const x = R - (PLAYER_MAX_HP - 1 - i) * 22;
      const t = this.add.text(x, 56, filled ? '♥' : '♡', {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: filled ? '#ff4466' : '#443344',
      }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(200);
      this.heartTexts.push(t);
    }
    // New heart objects must also be excluded from the main game camera
    this.cameras.main.ignore(this.heartTexts);
  }

  private updateLivesText(): void {
    this.livesText.setText(`VIES  ${this.lives}/${PLAYER_MAX_LIVES}`);
  }

  private updateArmorDisplay(): void {
    const filled = '◆'.repeat(this.armorPoints);
    const empty = '◇'.repeat(PLAYER_MAX_ARMOR - this.armorPoints);
    this.armorText.setText(`ARMURE ${filled}${empty}`);
    this.armorText.setAlpha(this.armorPoints > 0 ? 1 : 0.3);
  }

  private updatePowerupBar(): void {
    const lines: string[] = [];
    const tierNames = ['LASER BLEU', 'LASER VERT', 'LASER ORANGE', 'LASER ROUGE'];
    lines.push(tierNames[this.laserTier]);
    if (this.level >= LASER_PART_START_LEVEL && this.laserTier < 3) {
      const filled = '●'.repeat(this.laserParts);
      const empty = '○'.repeat(LASER_PARTS_NEEDED - this.laserParts);
      lines.push(`PIÈCES ${filled}${empty}`);
    }
    if (this.dualCount > 0) lines.push(`DUAL ×${this.dualCount}`);
    if (this.rearCount > 0) lines.push(`ARRIÈRE ×${this.rearCount}`);
    if (this.shieldActive) lines.push('BOUCLIER ●');
    if (this.scoreMult > 1) lines.push(`×2 SCORE ${Math.ceil(this.scoreMultTimer / 1000)}s`);
    this.powerupBar.setText(lines.join('\n'));

    const remaining = this.enemies.countActive(true);
    this.enemyCountText.setText(`Ennemis : ${remaining}`);
  }

  // ─── UPDATE LOOP ───────────────────────────────────────────────────────────

  update(time: number, delta: number): void {
    if (!this.isDead && !this.transitioning && !this.countingDown && Phaser.Input.Keyboard.JustDown(this.escKey)) {
      if (this.paused) this.resumeGame();
      else this.pauseGame();
    }
    if (this.isDead || this.transitioning || this.paused || this.countingDown) return;

    this.movePlayer();
    this.manualShoot(time);
    this.updateEnemies(delta);
    this.updateTimers(delta);
    this.updateShieldSprite();
    this.checkLevelClear();
    this.scoreText.setText(`Score: ${this.score}`);
    this.updatePowerupBar();
    this.updateEnemyArrows();
  }

  // ─── MOVEMENT ──────────────────────────────────────────────────────────────

  private movePlayer(): void {
    const left  = this.cursors.left.isDown  || this.keyA.isDown;
    const right = this.cursors.right.isDown || this.keyD.isDown;
    const up    = this.cursors.up.isDown    || this.keyW.isDown;
    const down  = this.cursors.down.isDown  || this.keyS.isDown;

    // Strictly 4-directional: horizontal has priority
    if (left) {
      this.player.setVelocity(-PLAYER_SPEED, 0);
      this.facingAngle = Math.PI;
    } else if (right) {
      this.player.setVelocity(PLAYER_SPEED, 0);
      this.facingAngle = 0;
    } else if (up) {
      this.player.setVelocity(0, -PLAYER_SPEED);
      this.facingAngle = -Math.PI / 2;
    } else if (down) {
      this.player.setVelocity(0, PLAYER_SPEED);
      this.facingAngle = Math.PI / 2;
    } else {
      this.player.setVelocity(0, 0);
    }

    this.player.setRotation(this.facingAngle + Math.PI / 2);
  }

  // ─── SHOOTING ──────────────────────────────────────────────────────────────

  private manualShoot(time: number): void {
    if (!this.spaceKey.isDown) return;
    const rate = FIRE_RATE[this.laserTier];
    if (time - this.lastFired < rate) return;
    this.lastFired = time;

    const angle = this.facingAngle;
    // Perpendicular direction for parallel offset
    const perpX = -Math.sin(angle);
    const perpY =  Math.cos(angle);
    const SPACING = 14; // px between parallel shots

    // Front shots: 1 base + dualCount extras, parallel and centered
    const frontCount = 1 + this.dualCount;
    for (let i = 0; i < frontCount; i++) {
      const offset = (i - (frontCount - 1) / 2) * SPACING;
      this.fireBullet(this.player.x + offset * perpX, this.player.y + offset * perpY, angle);
    }

    // Rear shots: rearCount parallel lasers going backward
    for (let i = 0; i < this.rearCount; i++) {
      const offset = (i - (this.rearCount - 1) / 2) * SPACING;
      this.fireBullet(this.player.x + offset * perpX, this.player.y + offset * perpY, angle + Math.PI);
    }
  }

  private fireBullet(x: number, y: number, angle: number): void {
    const key = `bullet-${this.laserTier}`;
    const bullet = this.bullets.get(x, y, key) as Phaser.Physics.Arcade.Sprite | null;
    if (!bullet || !bullet.body) return;
    const body = bullet.body as Phaser.Physics.Arcade.Body;
    bullet.setDisplaySize(9, 22).setOrigin(0.5, 0.5).setActive(true).setVisible(true).setDepth(9);
    bullet.setRotation(angle + Math.PI / 2);
    const bpr = 12;
    body.setCircle(bpr, bullet.displayOriginX - bpr, bullet.displayOriginY - bpr);
    body.reset(x, y);
    this.physics.velocityFromAngle(Phaser.Math.RadToDeg(angle), BULLET_SPEED, body.velocity);
    this.time.delayedCall(1600, () => {
      if (bullet?.active) bullet.destroy();
    });
  }


  // ─── ENEMY AI ──────────────────────────────────────────────────────────────

  private updateEnemies(delta: number): void {
    const now = this.time.now;

    this.enemies.children.iterate((go) => {
      if (!go) return true;
      const e = go as Phaser.Physics.Arcade.Sprite;
      if (!e.active) return true;

      const isBoss = e.getData('isBoss') as boolean;

      // Random 4-directional movement
      let wanderTimer = (e.getData('wanderTimer') as number) - delta;
      if (wanderTimer <= 0) {
        const dirs = isBoss ? BOSS_DIRS : ENEMY_DIRS;
        const dir = dirs[Math.floor(Math.random() * 4)];
        e.setVelocity(dir[0], dir[1]);
        // Rotate sprite to face movement direction
        e.setRotation(Math.atan2(dir[1], dir[0]) + Math.PI / 2);
        wanderTimer = 900 + Math.random() * 1100;
      }
      e.setData('wanderTimer', wanderTimer);

      // Enemy shooting
      const lastShot = (e.getData('lastShot') as number) ?? -ENEMY_FIRE_RATE;
      const rate = isBoss ? ENEMY_FIRE_RATE * 0.6 : ENEMY_FIRE_RATE;
      if (now - lastShot >= rate) {
        e.setData('lastShot', now);
        const vel = (e.body as Phaser.Physics.Arcade.Body).velocity;
        this.fireEnemyBullet(e.x, e.y, vel);
      }

      return true;
    });
  }

  private fireEnemyBullet(x: number, y: number, vel: Phaser.Math.Vector2): void {
    if (vel.x === 0 && vel.y === 0) return;
    const bullet = this.enemyBullets.get(x, y, 'enemy-bullet') as Phaser.Physics.Arcade.Sprite | null;
    if (!bullet || !bullet.body) return;
    const body = bullet.body as Phaser.Physics.Arcade.Body;
    bullet.setDisplaySize(9, 22).setOrigin(0.5, 0.5).setActive(true).setVisible(true).setDepth(9);
    const angle = Math.atan2(vel.y, vel.x);
    bullet.setRotation(angle + Math.PI / 2);
    const ebr = 11;
    body.setCircle(ebr, bullet.displayOriginX - ebr, bullet.displayOriginY - ebr);
    body.reset(x, y);
    this.physics.velocityFromAngle(Phaser.Math.RadToDeg(angle), ENEMY_BULLET_SPEED, body.velocity);
    this.time.delayedCall(2500, () => {
      if (bullet?.active) bullet.destroy();
    });
  }

  // ─── LEVEL CLEAR ───────────────────────────────────────────────────────────

  private checkLevelClear(): void {
    if (this.enemies.countActive(true) === 0 && !this.transitioning) {
      this.enemyBullets.clear(true, true);
      this.nextLevel();
    }
  }

  // ─── COMBAT ────────────────────────────────────────────────────────────────

  private hitEnemy(enemy: Phaser.Physics.Arcade.Sprite): void {
    let hp = (enemy.getData('hp') as number) - LASER_DAMAGE[this.laserTier];
    enemy.setData('hp', hp);

    this.tweens.add({
      targets: enemy, alpha: 0.25, duration: 60,
      yoyo: true, onComplete: () => { if (enemy.active) enemy.setAlpha(1); },
    });

    if (hp <= 0) {
      const isBoss = enemy.getData('isBoss') as boolean;
      this.score += isBoss ? 500 * this.level * this.scoreMult : 100 * this.scoreMult;
      this.spawnDeathEffect(enemy.x, enemy.y, isBoss);
      enemy.destroy();
    }
  }

  private damagePlayer(amount: number): void {
    if (this.invincibleTimer > 0 || this.isDead) return;

    // Shield absorbs one hit then breaks
    if (this.shieldActive) {
      this.shieldActive = false;
      this.invincibleTimer = 600;
      this.flashScreen(0x44ddff, 0.5, 220);
      this.cameras.main.shake(140, 0.007);
      this.showMessage('BOUCLIER BRISÉ !', '#44ddff');
      return;
    }

    if (this.armorPoints > 0) {
      this.armorPoints -= amount;
      if (this.armorPoints < 0) this.armorPoints = 0;
      this.updateArmorDisplay();
      this.invincibleTimer = 800;
      this.flashScreen(0x4488ff, 0.35, 180);
      this.cameras.main.shake(120, 0.007);
      this.showMessage('ARMURE !', '#44aaff');
      return;
    }

    this.playerHP -= amount;
    this.invincibleTimer = 1400;
    this.updateHearts();
    this.flashScreen(0xff2244, 0.4, 200);
    this.cameras.main.shake(200, 0.01);

    if (this.playerHP <= 0) {
      this.isDead = true;
      this.lives -= 1;
      this.updateLivesText();

      if (this.lives <= 0) {
        // Game over
        this.flashScreen(0xff0000, 0.8, 600);
        this.time.delayedCall(800, () => {
          const best = parseInt(localStorage.getItem('hll-best') ?? '0', 10);
          if (this.level > best) localStorage.setItem('hll-best', String(this.level));
          this.scene.start('GameOver', { level: this.level, score: this.score });
        });
      } else {
        // Retry same level
        this.showMessage(`VIE PERDUE  —  ${this.lives} restante${this.lives > 1 ? 's' : ''}`, '#ff8844');
        this.flashScreen(0xff6600, 0.6, 500);
        this.time.delayedCall(700, () => {
          this.scene.start('Game', {
            level: this.level,
            score: this.score,
            hp: PLAYER_BASE_HP,
            lives: this.lives,
            armor: this.armorPoints,
            laserTier: this.laserTier,
            laserParts: this.laserParts,
          });
        });
      }
    }
  }

  private collectPickup(pickup: Phaser.Physics.Arcade.Sprite): void {
    const type = pickup.getData('type') as PickupType;
    pickup.destroy();

    switch (type) {
      case 'life':
        this.playerHP = Math.min(PLAYER_MAX_HP, this.playerHP + 1);
        this.updateHearts();
        break;
      case 'extra-life':
        this.lives = Math.min(PLAYER_MAX_LIVES, this.lives + 1);
        this.updateLivesText();
        this.showMessage('VIE BONUS !', '#ffaa00');
        break;
      case 'dual':
        this.dualCount = Math.min(4, this.dualCount + 1);
        this.showMessage(`DUAL +1  →  ${1 + this.dualCount} lasers avant`, '#4466ff');
        break;
      case 'rear':
        this.rearCount = Math.min(4, this.rearCount + 1);
        this.showMessage(`ARRIÈRE +1  →  ${this.rearCount} laser${this.rearCount > 1 ? 's' : ''} arrière`, '#ff8844');
        break;
      case 'shield':
        this.shieldActive = true;
        this.showMessage('BOUCLIER ACTIF !', '#44ddff');
        break;
      case 'bomb':
        this.bombAllEnemies();
        break;
      case 'score': {
        const bonus = 500 * this.level;
        this.score += bonus;
        this.scoreMult = 2;
        this.scoreMultTimer = SCORE_MULT_DURATION;
        this.showMessage(`+${bonus.toLocaleString('fr-FR')} pts  ×2 Score !`, '#aaff44');
        break;
      }
      case 'armor':
        this.armorPoints = Math.min(PLAYER_MAX_ARMOR, this.armorPoints + 1);
        this.updateArmorDisplay();
        this.showMessage('ARMURE +1', '#44aaff');
        break;
      case 'laser-part':
        this.laserParts += 1;
        if (this.laserParts >= LASER_PARTS_NEEDED) {
          this.laserTier = Math.min(3, this.laserTier + 1);
          this.laserParts = 0;
          const tierNames = ['BLEU', 'VERT', 'ORANGE', 'ROUGE'];
          const hexColor = '#' + LASER_COLORS[this.laserTier].toString(16).padStart(6, '0');
          this.showMessage(`LASER ${tierNames[this.laserTier]} DÉBLOQUÉ !`, hexColor);
        } else {
          this.showMessage(`PIÈCE LASER  ${this.laserParts}/${LASER_PARTS_NEEDED}`, '#88ffcc');
        }
        break;
    }

    this.flashScreen(LASER_COLORS[this.laserTier], 0.2, 150);
  }

  private bombAllEnemies(): void {
    this.enemies.children.iterate((go) => {
      if (!go) return true;
      const e = go as Phaser.Physics.Arcade.Sprite;
      if (!e.active) return true;
      this.score += (e.getData('isBoss') ? 500 : 100) * this.level * this.scoreMult;
      this.spawnDeathEffect(e.x, e.y, e.getData('isBoss'));
      e.destroy();
      return true;
    });
    this.flashScreen(0xffaa00, 0.6, 300);
  }

  // ─── PICKUP SPAWNING ───────────────────────────────────────────────────────

  private scheduleNextPickup(): void {
    const delay = Phaser.Math.Between(10000, 25000);
    this.time.delayedCall(delay, () => {
      if (this.transitioning || this.isDead) return;
      this.spawnOnePickup();
      this.scheduleNextPickup();
    });
  }

  private spawnOnePickup(): void {
    if (this.pickups.countActive(true) >= 5) return;
    if (this.floorTiles.length === 0) return;

    const farTiles = this.floorTiles.filter(t => {
      const dx = t.x * TILE_SIZE + TILE_SIZE / 2 - this.player.x;
      const dy = t.y * TILE_SIZE + TILE_SIZE / 2 - this.player.y;
      return Math.sqrt(dx * dx + dy * dy) > 5 * TILE_SIZE;
    });
    const tiles = farTiles.length > 0 ? farTiles : this.floorTiles;
    const tile = tiles[Math.floor(Math.random() * tiles.length)];
    const px = tile.x * TILE_SIZE + TILE_SIZE / 2;
    const py = tile.y * TILE_SIZE + TILE_SIZE / 2;

    const available = PICKUP_TYPES.filter(t => {
      if (t === 'dual' && this.dualCount >= 4) return false;
      if (t === 'rear' && this.rearCount >= 4) return false;
      if (t === 'life' && this.playerHP >= PLAYER_MAX_HP) return false;
      if (t === 'extra-life' && this.lives >= PLAYER_MAX_LIVES) return false;
      if (t === 'armor' && this.armorPoints >= PLAYER_MAX_ARMOR) return false;
      return true;
    });
    if (available.length === 0) return;

    const type = available[Math.floor(Math.random() * available.length)];
    const p = this.pickups.create(px, py, `pickup-${type}`) as Phaser.Physics.Arcade.Sprite;
    p.setDisplaySize(36, 36).setOrigin(0.5, 0.5).setAlpha(0).setDepth(6).setData('type', type);
    p.refreshBody();
    (p.body as Phaser.Physics.Arcade.StaticBody).setCircle(20, -2, -2);
    this.tweens.add({ targets: p, alpha: 1, duration: 600, ease: 'Cubic.out' });
  }

  private spawnLaserPart(): void {
    if (this.floorTiles.length === 0) return;
    const farTiles = this.floorTiles.filter(t => {
      const dx = t.x * TILE_SIZE + TILE_SIZE / 2 - this.spawnX;
      const dy = t.y * TILE_SIZE + TILE_SIZE / 2 - this.spawnY;
      return Math.sqrt(dx * dx + dy * dy) > 8 * TILE_SIZE;
    });
    const tiles = farTiles.length > 0 ? farTiles : this.floorTiles;
    const tile = tiles[Math.floor(Math.random() * tiles.length)];
    const px = tile.x * TILE_SIZE + TILE_SIZE / 2;
    const py = tile.y * TILE_SIZE + TILE_SIZE / 2;
    const p = this.pickups.create(px, py, `laser-part-${this.laserTier + 1}`) as Phaser.Physics.Arcade.Sprite;
    p.setDisplaySize(36, 36).setOrigin(0.5, 0.5).setAlpha(0).setDepth(6).setData('type', 'laser-part');
    p.refreshBody();
    (p.body as Phaser.Physics.Arcade.StaticBody).setCircle(20, -2, -2);
    this.tweens.add({ targets: p, alpha: 1, duration: 600, ease: 'Cubic.out' });
  }

  // ─── TIMERS ────────────────────────────────────────────────────────────────

  private updateTimers(delta: number): void {
    if (this.invincibleTimer > 0) {
      this.invincibleTimer -= delta;
      this.player.setAlpha(Math.floor(this.invincibleTimer / 120) % 2 === 0 ? 0.3 : 1.0);
    } else {
      this.player.setAlpha(1);
    }

    if (this.scoreMult > 1) {
      this.scoreMultTimer -= delta;
      if (this.scoreMultTimer <= 0) { this.scoreMult = 1; this.scoreMultTimer = 0; }
    }
  }

  private updateShieldSprite(): void {
    this.shieldSprite.setPosition(this.player.x, this.player.y);
    if (this.shieldActive) {
      const a = 0.4 + Math.sin(this.time.now / 180) * 0.3;
      this.shieldSprite.setRadius(32);
      this.shieldSprite.setFillStyle(0x44ddff, a * 0.25);
      this.shieldSprite.setStrokeStyle(3, 0x44ddff, a);
    } else {
      this.shieldSprite.setFillStyle(0x44ddff, 0);
      this.shieldSprite.setStrokeStyle(0, 0x44ddff, 0);
    }
  }

  // ─── EFFECTS ───────────────────────────────────────────────────────────────

  private spawnDeathEffect(x: number, y: number, isBoss: boolean): void {
    const count = isBoss ? 20 : 8;
    const color = isBoss ? 0xff6600 : 0xff3322;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count;
      const speed = isBoss ? 190 : 130;
      const r = isBoss ? 5 : 3;
      const particle = this.add.arc(x, y, r, 0, 360, false, color);
      particle.setDepth(15);
      this.physics.add.existing(particle);
      const body = (particle as unknown as { body: Phaser.Physics.Arcade.Body }).body;
      body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
      this.tweens.add({
        targets: particle, alpha: 0,
        duration: isBoss ? 700 : 400,
        onComplete: () => particle.destroy(),
      });
    }
  }

  private flashScreen(color: number, alpha: number, duration: number): void {
    const rgb = Phaser.Display.Color.IntegerToRGB(color);
    this.flashOverlay.setFillStyle(
      Phaser.Display.Color.GetColor(rgb.r, rgb.g, rgb.b), alpha
    );
    this.tweens.killTweensOf(this.flashOverlay);
    this.tweens.add({
      targets: this.flashOverlay, fillAlpha: 0,
      duration, ease: 'Linear',
    });
  }

  private showMessage(text: string, color = '#ffffff'): void {
    const msg = this.add.text((GAME_WIDTH - HUD_W) / 2, GAME_HEIGHT / 2 - 40, text, {
      fontFamily: 'monospace', fontSize: '28px',
      color, stroke: '#000000', strokeThickness: 6,
    }).setScrollFactor(0).setOrigin(0.5).setDepth(300);

    this.tweens.add({
      targets: msg, y: GAME_HEIGHT / 2 - 80, alpha: 0,
      duration: 600, ease: 'Cubic.out',
      onComplete: () => msg.destroy(),
    });
  }

  // ─── MINIMAP & NAVIGATION ──────────────────────────────────────────────────

  private buildMinimap(): void {
    const sz = 140;
    const scale = sz / Math.max(this.worldW, this.worldH);
    const AREA_W = GAME_WIDTH - HUD_W; // 1060

    // Centre the minimap horizontally in the 220px HUD panel
    const mx = AREA_W + Math.floor((HUD_W - sz) / 2); // canvas x = 1100
    const my = GAME_HEIGHT - sz - 10;                 // canvas y = 570

    this.minimap = this.cameras.add(mx, my, sz, sz);
    this.minimap.setBounds(0, 0, this.worldW, this.worldH);
    this.minimap.setZoom(scale);
    this.minimap.centerOn(this.worldW / 2, this.worldH / 2);
    this.minimap.setBackgroundColor(0x000d1a);
    this.minimap.setAlpha(0.85);

    this.minimap.ignore([
      ...this.heartTexts,
      this.livesText, this.armorText, this.scoreText,
      this.powerupBar, this.enemyCountText,
      this.flashOverlay, this.shieldSprite,
      this.enemyArrowsGfx, this.hudPanel, this.hudPanelBg,
    ]);

    // Minimap border — in HUD-local coords so it renders in the HUD camera
    // HUD-local x = mx - AREA_W = 40; border centre = (40+70, 570+70) = (110, 640)
    const bx = mx - AREA_W + sz / 2; // 110
    const by = my + sz / 2;           // 640
    this.minimapBorder = this.add
      .rectangle(bx, by, sz + 4, sz + 4, 0, 0)
      .setScrollFactor(0).setDepth(198)
      .setStrokeStyle(2, 0x4466aa, 0.9);

    // Border must not render in: main camera (canvas_x = 110, inside game area)
    //                             minimap camera (canvas_x = 1100+110 = 1210, inside minimap)
    this.cameras.main.ignore(this.minimapBorder);
    this.minimap.ignore(this.minimapBorder);
  }

  private updateEnemyArrows(): void {
    this.enemyArrowsGfx.clear();
    const cam = this.cameras.main;
    const margin = 26;
    const vw = cam.width;  // game viewport width (1060)
    const hw = vw / 2 - margin;
    const hh = GAME_HEIGHT / 2 - margin;
    const wcx = cam.scrollX + vw / 2;
    const wcy = cam.scrollY + GAME_HEIGHT / 2;

    this.enemies.children.iterate((go) => {
      if (!go) return true;
      const e = go as Phaser.Physics.Arcade.Sprite;
      if (!e.active) return true;

      // Skip enemies already visible on screen
      if (e.x > cam.scrollX + margin && e.x < cam.scrollX + vw - margin &&
          e.y > cam.scrollY + margin && e.y < cam.scrollY + GAME_HEIGHT - margin) {
        return true;
      }

      const angle = Math.atan2(e.y - wcy, e.x - wcx);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const t = Math.min(
        Math.abs(cos) > 0.001 ? hw / Math.abs(cos) : 99999,
        Math.abs(sin) > 0.001 ? hh / Math.abs(sin) : 99999
      );
      const ax = vw / 2 + cos * t;
      const ay = GAME_HEIGHT / 2 + sin * t;

      const isBoss = e.getData('isBoss') as boolean;
      const sz = isBoss ? 13 : 8;
      const color = isBoss ? 0xff6600 : 0xff3333;
      this.enemyArrowsGfx.fillStyle(color, 0.9);
      // Arrow triangle pointing toward enemy
      this.enemyArrowsGfx.fillTriangle(
        ax + cos * sz,                        ay + sin * sz,
        ax - cos * sz * 0.5 + sin * sz * 0.7, ay - sin * sz * 0.5 - cos * sz * 0.7,
        ax - cos * sz * 0.5 - sin * sz * 0.7, ay - sin * sz * 0.5 + cos * sz * 0.7
      );
      return true;
    });
  }

  // ─── COUNTDOWN ─────────────────────────────────────────────────────────────

  private startCountdown(): void {
    this.countingDown = true;
    this.physics.pause();
    const cx = (GAME_WIDTH - HUD_W) / 2; // centre of game area
    const cy = GAME_HEIGHT / 2;

    const flash = (label: string, delay: number, onDone?: () => void) => {
      this.time.delayedCall(delay, () => {
        const big = label !== 'GO !';
        const t = this.add.text(cx, cy, label, {
          fontFamily: 'monospace',
          fontSize: big ? '110px' : '80px',
          color: big ? '#ffffff' : '#00ff88',
          stroke: '#000033',
          strokeThickness: 10,
        }).setOrigin(0.5).setScrollFactor(0).setDepth(300);
        this.tweens.add({
          targets: t, scaleX: 1.8, scaleY: 1.8, alpha: 0,
          duration: 850, ease: 'Cubic.out',
          onComplete: () => { t.destroy(); onDone?.(); },
        });
      });
    };

    flash('3', 0);
    flash('2', 1000);
    flash('1', 2000);
    flash('GO !', 3000, () => {
      this.physics.resume();
      // Reset enemy shoot timers so no one fires the instant GO! appears
      this.enemies.children.iterate((go) => {
        if (!go) return true;
        (go as Phaser.Physics.Arcade.Sprite).setData('lastShot', this.time.now);
        return true;
      });
      this.countingDown = false;
    });
  }

  // ─── PAUSE ─────────────────────────────────────────────────────────────────

  private pauseGame(): void {
    this.paused = true;
    this.physics.pause();
    this.time.paused = true;

    const cx = (GAME_WIDTH - HUD_W) / 2; // centre of game area
    const cy = GAME_HEIGHT / 2;

    const overlay = this.add.rectangle(cx, cy, GAME_WIDTH - HUD_W, GAME_HEIGHT, 0x000000, 0.72)
      .setScrollFactor(0).setDepth(500);

    const title = this.add.text(cx, cy - 110, 'PAUSE', {
      fontFamily: 'monospace', fontSize: '54px', color: '#88bbff',
      stroke: '#002266', strokeThickness: 8,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(501);

    const resumeBtn = this.add.text(cx, cy - 10, '[ REPRENDRE ]', {
      fontFamily: 'monospace', fontSize: '32px', color: '#00ff88',
      stroke: '#004422', strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(501)
      .setInteractive({ useHandCursor: true });
    resumeBtn.on('pointerover', () => resumeBtn.setStyle({ color: '#88ffcc' }));
    resumeBtn.on('pointerout', () => resumeBtn.setStyle({ color: '#00ff88' }));
    resumeBtn.on('pointerdown', () => this.resumeGame());

    const menuBtn = this.add.text(cx, cy + 65, '[ RETOUR AU MENU ]', {
      fontFamily: 'monospace', fontSize: '24px', color: '#ff6644',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(501)
      .setInteractive({ useHandCursor: true });
    menuBtn.on('pointerover', () => menuBtn.setStyle({ color: '#ff9977' }));
    menuBtn.on('pointerout', () => menuBtn.setStyle({ color: '#ff6644' }));
    menuBtn.on('pointerdown', () => {
      this.time.paused = false;
      this.scene.start('Menu');
    });

    const hint = this.add.text(cx, cy + 120, 'ÉCHAP pour reprendre', {
      fontFamily: 'monospace', fontSize: '14px', color: '#445566',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(501);

    this.pauseOverlayGroup = [overlay, title, resumeBtn, menuBtn, hint];
  }

  private resumeGame(): void {
    this.paused = false;
    this.physics.resume();
    this.time.paused = false;
    this.pauseOverlayGroup.forEach(o => o.destroy());
    this.pauseOverlayGroup = [];
  }

  // ─── LEVEL TRANSITION ──────────────────────────────────────────────────────

  private nextLevel(): void {
    this.transitioning = true;

    const best = parseInt(localStorage.getItem('hll-best') ?? '0', 10);
    if (this.level > best) localStorage.setItem('hll-best', String(this.level));

    if (this.level >= MAX_LEVEL) {
      this.flashScreen(0xffdd00, 0.8, 800);
      this.time.delayedCall(900, () => {
        this.scene.start('Victory', { score: this.score });
      });
      return;
    }

    this.showMessage(`NIVEAU ${this.level} TERMINÉ !`, '#00ff88');
    this.flashScreen(0x00ff88, 0.5, 600);

    this.time.delayedCall(800, () => {
      this.scene.start('Game', {
        level: this.level + 1,
        score: this.score,
        hp: this.playerHP,
        lives: this.lives,
        armor: this.armorPoints,
        laserTier: this.laserTier,
        laserParts: this.laserParts,
      });
    });
  }
}
