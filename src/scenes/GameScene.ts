import Phaser from 'phaser';
import {
  TILE_SIZE, MAX_LEVEL,
  PLAYER_SPEED, PLAYER_BASE_HP, PLAYER_MAX_HP, PLAYER_BASE_LIVES, PLAYER_MAX_LIVES,
  PLAYER_MAX_ARMOR,
  BULLET_SPEED, ENEMY_SPEED, BOSS_SPEED,
  LASER_COLORS, SCORE_PER_DAMAGE,
  HEAT_MAX, HEAT_COOL_MS, heatPerShot,
  ENEMY_BULLET_SPEED, ENEMY_TELEGRAPH, BOSS_BURST_TELEGRAPH,
  SEQUENCES, getEnemyPlan, getBossPlan, type FirePlan,
  LASER_PARTS_NEEDED, LASER_STEPS, maxLaserStep, type LaserStep,
  BOMB_RADIUS, BOMB_DAMAGE,
  TELEPORT_START_LEVEL, PORTAL_RADIUS, PORTAL_EXIT_MARGIN, PORTAL_COOLDOWN,
  PORTAL_CONTACT_GAP,
  getGridSize, getEnemyHP, getEnemyCount, getEnemyTier, getEnemyFireRate, getChaseBias,
  getPickupBudget,
  isBossLevel, getPickupCount,
} from '../config/constants';
import { LevelGenerator } from '../systems/LevelGenerator';
import { computeLayout, worldZoom, cameraBounds, fs, sp, type Layout } from '../systems/Layout';
import { TouchControls, isTouchDevice } from '../systems/TouchControls';
import { Pad } from '../systems/Pad';
import { getStickSide, isTestMode } from '../systems/Settings';
import { playMusic } from '../systems/Music';
import { Thruster, PLAYER_THRUSTER, BOSS_THRUSTER, ENEMY_THRUSTERS, type ThrusterStyle } from '../systems/Thruster';

type PickupType = 'life' | 'extra-life' | 'dual' | 'rear' | 'shield' | 'bomb' | 'armor' | 'laser-part';
const PICKUP_TYPES: PickupType[] = ['life', 'extra-life', 'dual', 'rear', 'shield', 'bomb', 'armor'];

/**
 * Pickups whose effect survives the level transition. They read green; the
 * ones wiped clean at the next level read blue, so what a drop is worth is
 * legible from across the room before you can make out the icon.
 */
const PICKUP_KEEPS: PickupType[] = ['life', 'extra-life', 'armor'];
const HALO_KEEP = 0x44ff88;
const HALO_TEMP = 0x4488ff;
const HALO_INSTANT = 0xffaa44;

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
  private grid: number[][] = [];
  private worldW = 0;
  private worldH = 0;

  // Player
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private playerHP = PLAYER_BASE_HP;
  private lives = PLAYER_BASE_LIVES;
  private laserStep = 0;
  private laserParts = 0;
  /** The level the current laser part was picked up on. */
  private partTakenAt = 0;
  private dualCount = 0;   // extra front lasers (stacks)
  private rearCount = 0;   // rear lasers (stacks)
  private shieldActive = false;
  private armorPoints = 0;
  private lastFired = 0;
  private invincibleTimer = 0;
  private facingAngle = -Math.PI / 2; // start facing up
  private shieldSprite!: Phaser.GameObjects.Arc;
  private playerThruster!: Thruster;

  // Groups
  private bullets!: Phaser.Physics.Arcade.Group;
  private enemyBullets!: Phaser.Physics.Arcade.Group;
  private enemies!: Phaser.Physics.Arcade.Group;
  private pickups!: Phaser.Physics.Arcade.StaticGroup;
  private portals!: Phaser.Physics.Arcade.StaticGroup;

  // Input
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyW!: Phaser.Input.Keyboard.Key;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyS!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private escKey!: Phaser.Input.Keyboard.Key;
  private pad!: Pad;

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
  private heat = 0;
  private overheated = false;
  /** Extra pickups this level has dropped, against its budget. */
  private pickupsDropped = 0;
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

  // Parallax background
  private starLayers: Phaser.GameObjects.TileSprite[] = [];

  // Touch
  private touch?: TouchControls;
  private pauseBtn?: Phaser.GameObjects.Text;
  private touchMode = false;

  // Cameras
  private minimap!: Phaser.Cameras.Scene2D.Camera;
  /** Full-canvas, zoom-1 camera. Everything the player reads lives here. */
  private uiCamera!: Phaser.Cameras.Scene2D.Camera;
  /**
   * Every world object goes in this layer. The UI camera ignores the layer as
   * a whole, so objects spawned later (bullets, pickups, debris) are excluded
   * automatically instead of having to be registered one by one.
   */
  private world!: Phaser.GameObjects.Layer;

  // Navigation
  private enemyArrowsGfx!: Phaser.GameObjects.Graphics;
  private minimapBorder!: Phaser.GameObjects.Rectangle;

  /** How many regular enemies share the aimed-shot rotation this level. */
  private aimSlots = 0;

  // Test panel (only built when test mode is on)
  private testPanel: Phaser.GameObjects.Text[] = [];
  private testLevelText?: Phaser.GameObjects.Text;
  private testLaserText?: Phaser.GameObjects.Text;
  private testLevel = 1;
  private testStep = 0;

  // Layout
  private layout!: Layout;
  private levelText!: Phaser.GameObjects.Text;
  /** Transient texts centred on the game area (messages, countdown). */
  private centredTexts: Phaser.GameObjects.Text[] = [];

  constructor() {
    super({ key: 'Game' });
  }

  /** The player's current rung on the upgrade ladder. */
  private get laser(): LaserStep {
    return LASER_STEPS[this.laserStep];
  }

  /** Bullet colour and texture index, 0-3. Several steps share one tier. */
  private get laserTier(): number {
    return this.laser.tier;
  }

  init(data: { level?: number; score?: number; hp?: number; lives?: number; armor?: number; laserStep?: number; laserParts?: number; partTakenAt?: number }): void {
    this.level = data.level ?? 1;
    this.score = data.score ?? 0;
    this.playerHP = data.hp ?? PLAYER_BASE_HP;
    this.lives = data.lives ?? PLAYER_BASE_LIVES;
    this.armorPoints = data.armor ?? 0;
    this.laserStep = data.laserStep ?? 0;
    this.laserParts = data.laserParts ?? 0;
    this.partTakenAt = data.partTakenAt ?? 0;
    this.dualCount = 0;
    this.rearCount = 0;
    this.shieldActive = false;
    this.lastFired = 0;
    this.invincibleTimer = 0;
    this.facingAngle = -Math.PI / 2;
    this.heat = 0;
    this.overheated = false;
    this.pickupsDropped = 0;
    this.transitioning = false;
    this.isDead = false;
    this.paused = false;
    this.pauseOverlayGroup = [];
    this.countingDown = false;
    this.floorTiles = [];
    this.grid = [];
    this.centredTexts = [];
    this.testPanel = [];
    this.testLevelText = undefined;
    this.testLaserText = undefined;
    this.starLayers = [];
    this.touch = undefined;
    this.pauseBtn = undefined;
  }

  create(): void {
    const gridSize = getGridSize(this.level);
    this.worldW = gridSize * TILE_SIZE;
    this.worldH = gridSize * TILE_SIZE;

    this.world = this.add.layer();

    const gen = new LevelGenerator();
    const data = gen.generate(
      gridSize, gridSize,
      getPickupCount(this.level),
      getEnemyCount(this.level) + (isBossLevel(this.level) ? 1 : 0)
    );

    this.buildMap(data.grid, gridSize);
    this.pickups = this.physics.add.staticGroup();
    this.spawnPlayer(data.playerPos);
    this.spawnPortals(gridSize);
    this.spawnEnemies(data.enemyPositions);

    this.setupPhysics();
    this.setupInput();
    this.setupCameras();
    this.buildHUD();
    this.buildOverlays();
    this.buildTestPanel();
    this.setupTouch();
    this.applyLayout();
    this.adoptHeldPointers();

    this.scale.on('resize', this.onResize, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.onResize, this));

    // A no-op from level 2 on: the theme carries across the level restarts.
    playMusic(this, 'game');

    this.scheduleNextPickup();
    // Parts only drop while there is a rung left to climb at this level. That
    // gate is what stops a good run from chaining two colours back to back.
    // Taking one also spends it for the level: dying and replaying the level
    // would otherwise hand out a second copy of a part already collected.
    if (this.laserStep < maxLaserStep(this.level) && this.partTakenAt !== this.level) {
      this.spawnLaserPart();
    }
    this.startCountdown();
  }

  // ─── MAP ───────────────────────────────────────────────────────────────────

  /**
   * Two parallax star layers, standing in for both the arena floor and the
   * void around it. They reach well past the world bounds so a level smaller
   * than the viewport never shows bare black at the edges.
   */
  private buildStarfield(): void {
    const margin = 4096;
    const w = this.worldW + margin * 2;
    const h = this.worldH + margin * 2;

    const layer = (key: string, depth: number, scroll: number) => {
      const ts = this.add
        .tileSprite(-margin, -margin, w, h, key)
        .setOrigin(0, 0)
        .setDepth(depth)
        .setScrollFactor(scroll);
      this.world.add(ts);
      this.starLayers.push(ts);
    };

    // The far layer barely moves, the near one trails the arena: the gap
    // between the two is what sells the depth.
    layer('stars-far', -20, 0.15);
    layer('stars-near', -19, 0.4);
  }

  private buildMap(grid: number[][], gridSize: number): void {
    this.grid = grid;
    this.buildStarfield();

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

    this.world.add(this.walls.getChildren());
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

    this.world.add([this.player, this.shieldSprite]);
    this.playerThruster = new Thruster(this, this.world, PLAYER_THRUSTER);
  }

  // ─── ENEMIES ───────────────────────────────────────────────────────────────

  private spawnEnemies(positions: { x: number; y: number }[]): void {
    this.enemies = this.physics.add.group();
    this.aimSlots = 0;
    const hp = getEnemyHP(this.level);
    const count = getEnemyCount(this.level);
    const tier = getEnemyTier(this.level);
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
      // 0 means "never fired": the opening shot is staggered on the first
      // live frame, once the countdown is out of the way.
      enemy.setData('lastShot', 0);
      const er = 44;
      (enemy.body as Phaser.Physics.Arcade.Body).setCircle(er, enemy.displayOriginX - er, enemy.displayOriginY - er);
      // Start with a random direction
      const dir = ENEMY_DIRS[Math.floor(Math.random() * 4)];
      enemy.setVelocity(dir[0], dir[1]);
      enemy.setRotation(Math.atan2(dir[1], dir[0]) + Math.PI / 2);
      // Its place in the aimed-shot rotation. See updateEnemyFire.
      enemy.setData('aimSlot', i);
      this.attachThruster(enemy, ENEMY_THRUSTERS[tier]);
      this.aimSlots += 1;
    }

    if (isBossLevel(this.level) && positions.length > count) {
      const bpos = positions[count];
      const bx = bpos.x * TILE_SIZE + TILE_SIZE / 2;
      const by = bpos.y * TILE_SIZE + TILE_SIZE / 2;
      const boss = this.enemies.create(bx, by, 'enemy-boss') as Phaser.Physics.Arcade.Sprite;
      boss.setDisplaySize(62, 62).setOrigin(0.5, 0.5).setDepth(9);
      // A boss is worth exactly its level number, so level 30 takes 30 hits.
      boss.setData('hp', this.level);
      boss.setData('maxHp', this.level);
      boss.setData('isBoss', true);
      boss.setData('wanderTimer', 0);
      boss.setData('lastShot', 0);
      boss.setData('lastBurst', 0);
      const br = 56;
      (boss.body as Phaser.Physics.Arcade.Body).setCircle(br, boss.displayOriginX - br, boss.displayOriginY - br);
      const bdir = BOSS_DIRS[Math.floor(Math.random() * 4)];
      boss.setVelocity(bdir[0], bdir[1]);
      boss.setRotation(Math.atan2(bdir[1], bdir[0]) + Math.PI / 2);
      this.attachThruster(boss, BOSS_THRUSTER);
    }

    this.world.add(this.enemies.getChildren());
  }

  // ─── PHYSICS ───────────────────────────────────────────────────────────────

  private setupPhysics(): void {
    this.bullets = this.physics.add.group({ maxSize: 80 });
    // Nineteen enemies firing crosses, plus a twelve-bullet boss ring, blows
    // straight past the old cap of 60 — and an exhausted pool fails silently,
    // which would read as enemies randomly declining to shoot.
    this.enemyBullets = this.physics.add.group({ maxSize: 220 });

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
      enemy.setData('blocked', true);
    });
    // Deliberately no enemy-vs-enemy collider: two of them meeting used to
    // jam against each other for a beat, which read as a bug rather than as
    // a crowd. They cross straight through instead.

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

        const e = enemyGO as Phaser.Physics.Arcade.Sprite;
        const now = this.time.now;

        // This runs on every physics step for as long as the two bodies
        // overlap. Zeroing the wander timer here made the enemy draw a new
        // heading sixty times a second, and since the chase bias usually
        // picks the player's direction, it kept drawing its way back in —
        // which is the juddering. Recoil once, then leave it be.
        if (now < ((e.getData('recoilUntil') as number) ?? 0)) return;
        e.setData('recoilUntil', now + 700);

        const dirs = (e.getData('isBoss') as boolean) ? BOSS_DIRS : ENEMY_DIRS;
        const dx = e.x - this.player.x;
        const dy = e.y - this.player.y;
        const dir = Math.abs(dx) > Math.abs(dy)
          ? (dx > 0 ? dirs[0] : dirs[1])
          : (dy > 0 ? dirs[2] : dirs[3]);
        e.setVelocity(dir[0], dir[1]);
        e.setRotation(Math.atan2(dir[1], dir[0]) + Math.PI / 2);

        // Commit to leaving: hold the heading, and take the next pick without
        // the chase bias so it does not turn straight back around.
        e.setData('wanderTimer', 700);
        e.setData('blocked', true);
      }
    );

    this.physics.add.overlap(this.player, this.portals, (_p, portalGO) => {
      this.usePortal(this.player, portalGO as Phaser.Physics.Arcade.Sprite);
    });

    // Enemies take the same portals. A shortcut only the player could use
    // would just make a big map smaller; shared, it cuts both ways.
    this.physics.add.overlap(this.enemies, this.portals, (enemyGO, portalGO) => {
      this.usePortal(enemyGO as Phaser.Physics.Arcade.Sprite, portalGO as Phaser.Physics.Arcade.Sprite);
    });

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
    this.pad = new Pad(this);

    // Inside an itch.io iframe the arrows and space scroll the host page
    // unless the game claims them outright.
    this.input.keyboard!.addCapture([
      Phaser.Input.Keyboard.KeyCodes.SPACE,
      Phaser.Input.Keyboard.KeyCodes.UP,
      Phaser.Input.Keyboard.KeyCodes.DOWN,
      Phaser.Input.Keyboard.KeyCodes.LEFT,
      Phaser.Input.Keyboard.KeyCodes.RIGHT,
    ]);
  }

  // ─── CAMERAS & LAYOUT ────────────────────────────────────────────

  private setupCameras(): void {
    this.layout = computeLayout(this.scale.width, this.scale.height);

    // Game camera: shows the world, and nothing but the world.
    // Its bounds depend on the viewport, so applyLayout() sets them.
    // roundPixels stays off (the `false`). With it on, Phaser rounds the
    // camera scroll to whole world units every frame while the ship's own
    // position stays continuous, so the ship — the one object meant to hold
    // still on screen — jitters by a fraction of a pixel. It buys nothing
    // here either: Phaser only snaps sprite rendering when the zoom is a
    // whole number, and worldZoom() is fractional by construction. The
    // wobble scales with zoom, so it shows up worst on large displays.
    this.cameras.main.startFollow(this.player, false, 0.12, 0.12);
    this.cameras.main.setBackgroundColor(0x000000);

    // UI camera: spans the whole canvas at zoom 1, so every HUD coordinate is
    // a plain canvas pixel no matter what the game camera is zoomed to.
    this.uiCamera = this.cameras.add(0, 0, this.scale.width, this.scale.height);
    this.uiCamera.ignore(this.world);

    // Minimap: a second view on the same world, parked inside the HUD strip.
    // Added last so it draws on top of the HUD panel background.
    this.minimap = this.cameras.add(0, 0, 16, 16);
    this.minimap.setBounds(0, 0, this.worldW, this.worldH);
    this.minimap.setBackgroundColor(0x000d1a);
    this.minimap.setAlpha(0.85);
    // The starfield would swamp the minimap, and the shield ring is noise there.
    this.minimap.ignore([this.shieldSprite, ...this.starLayers]);
  }

  /** Register a UI object: drawn by the UI camera, invisible to the others. */
  private addUI<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.cameras.main.ignore(obj);
    this.minimap.ignore(obj);
    return obj;
  }

  /**
   * Builds the touch rig, on touch devices only. Keyboard players get
   * nothing extra, and the two schemes coexist on hybrids.
   */
  private setupTouch(): void {
    // The rig is always built, then switched on or off by applyLayout. That
    // way resizing the window \u2014 or flipping device emulation in devtools \u2014
    // takes effect without reloading the page.
    this.input.addPointer(2);

    this.touch = new TouchControls(this, o => this.addUI(o));

    // Touch players have no ESC key. The padding makes the tap target
    // thumb-sized rather than glyph-sized.
    this.pauseBtn = this.addUI(
      this.add.text(0, 0, '\u275a\u275a', {
        fontFamily: 'monospace', fontSize: '22px', color: '#88bbff',
        padding: { x: 12, y: 10 },
      }).setOrigin(0, 0).setScrollFactor(0).setDepth(402).setAlpha(0.75).setVisible(false)
    );
    this.pauseBtn.setInteractive({ useHandCursor: true });
    this.pauseBtn.on('pointerdown', () => {
      if (this.isDead || this.transitioning || this.countingDown) return;
      if (this.paused) this.resumeGame();
      else this.pauseGame();
    });

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.paused || this.isDead || this.transitioning) return;
      this.touch?.pointerDown(p.x, p.y, p.id);
    });

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      this.touch?.pointerMove(p.x, p.y, p.id);
    });

    const lift = (p: Phaser.Input.Pointer) => this.touch?.pointerUp(p.id);
    this.input.on('pointerup', lift);
    this.input.on('pointerupoutside', lift);
  }

  /**
   * Clearing a level restarts the scene, and no pointerdown fires for a finger
   * that never left the glass. Without this, every level change would force
   * the player to lift both thumbs and put them back.
   */
  private adoptHeldPointers(): void {
    for (const p of this.input.manager.pointers) {
      if (p.isDown) this.touch?.pointerDown(p.x, p.y, p.id);
    }
  }

  private onResize(): void {
    this.applyLayout();
  }

  /** Recomputes the layout and pushes it into every camera and HUD element. */
  private applyLayout(): void {
    const L = computeLayout(this.scale.width, this.scale.height);
    this.layout = L;

    const zoom = worldZoom(L);
    this.cameras.main.setViewport(L.view.x, L.view.y, L.view.w, L.view.h);
    this.cameras.main.setZoom(zoom);

    const b = cameraBounds(L, this.worldW, this.worldH, zoom);
    this.cameras.main.setBounds(b.x, b.y, b.w, b.h);

    this.uiCamera.setViewport(0, 0, L.width, L.height);

    this.minimap.setViewport(L.minimap.x, L.minimap.y, L.minimap.w, L.minimap.h);
    this.minimap.setZoom(L.minimap.w / Math.max(this.worldW, this.worldH));
    this.minimap.centerOn(this.worldW / 2, this.worldH / 2);

    this.layoutHUD();
    this.layoutOverlays();
    this.layoutTestPanel();

    // The pause panel is built on demand, so it has to be measured again here.
    if (this.paused) {
      this.pauseOverlayGroup.forEach(o => o.destroy());
      this.pauseOverlayGroup = [];
      this.buildPauseOverlay();
    }
  }

  // ─── HUD ───────────────────────────────────────────────────────────────────

  private buildHUD(): void {
    const mono = (color: string) => ({ fontFamily: 'monospace', fontSize: '16px', color });

    // Opaque backing for the HUD strip, so no world geometry shows through.
    this.hudPanelBg = this.addUI(
      this.add.rectangle(0, 0, 16, 16, 0x000c14).setScrollFactor(0).setDepth(150)
    );

    // Hairline between the HUD strip and the play area.
    this.hudPanel = this.addUI(
      this.add.rectangle(0, 0, 16, 16, 0x2244aa, 0.8).setScrollFactor(0).setDepth(199)
    );

    this.scoreText = this.addUI(
      this.add.text(0, 0, `Score: ${this.score}`, mono('#ffcc44')).setScrollFactor(0).setDepth(200)
    );
    this.enemyCountText = this.addUI(
      this.add.text(0, 0, '', mono('#ff8866')).setScrollFactor(0).setDepth(200)
    );
    this.livesText = this.addUI(
      this.add.text(0, 0, '', mono('#ffaa44')).setScrollFactor(0).setDepth(200)
    );
    this.armorText = this.addUI(
      this.add.text(0, 0, '', mono('#4499ff')).setScrollFactor(0).setDepth(200)
    );
    this.powerupBar = this.addUI(
      this.add.text(0, 0, '', mono('#44ffaa')).setScrollFactor(0).setDepth(200)
    );

    // Frame drawn around the minimap camera's viewport.
    this.minimapBorder = this.addUI(
      this.add.rectangle(0, 0, 16, 16, 0, 0)
        .setScrollFactor(0).setDepth(198)
        .setStrokeStyle(2, 0x4466aa, 0.9)
    );

    this.updateLivesText();
    this.updateArmorDisplay();
  }

  // ─── TEST PANEL ────────────────────────────────────────────────────────────

  /**
   * A level and laser selector parked in the corner of the play area. Without
   * it, checking how level 75 actually plays means clearing seventy-four
   * levels first, which makes tuning the balance impractical.
   *
   * Off unless switched on from the menu, so a normal run never sees it.
   */
  private buildTestPanel(): void {
    if (!isTestMode()) return;
    this.testLevel = this.level;
    this.testStep = this.laserStep;

    // `row` counts upwards from the bottom line; `dx` is an offset in
    // reference pixels, scaled with the rest of the HUD at layout time.
    const add = (label: string, color: string, row: number, dx: number, onClick?: () => void) => {
      const t = this.addUI(
        this.add.text(0, 0, label, { fontFamily: 'monospace', fontSize: '15px', color })
          .setScrollFactor(0).setDepth(210).setOrigin(0, 1)
      );
      t.setData('row', row);
      t.setData('dx', dx);
      if (onClick) {
        t.setInteractive({ useHandCursor: true });
        t.on('pointerdown', onClick);
      }
      this.testPanel.push(t);
      return t;
    };

    add('MODE TEST', '#ff44aa', 3, 0);

    add('◀◀', '#ffcc44', 2, 0, () => this.stepTest('level', -10));
    add('◀', '#ffcc44', 2, 26, () => this.stepTest('level', -1));
    this.testLevelText = add('', '#cfe4ff', 2, 44);
    add('▶', '#ffcc44', 2, 116, () => this.stepTest('level', 1));
    add('▶▶', '#ffcc44', 2, 132, () => this.stepTest('level', 10));

    add('◀', '#ffcc44', 1, 0, () => this.stepTest('laser', -1));
    this.testLaserText = add('', '#cfe4ff', 1, 18);
    add('▶', '#ffcc44', 1, 144, () => this.stepTest('laser', 1));

    add('[ RELANCER ]', '#00ff88', 0, 0, () => {
      this.scene.start('Game', {
        level: this.testLevel,
        score: this.score,
        hp: PLAYER_BASE_HP,
        lives: this.lives,
        armor: this.armorPoints,
        laserStep: this.testStep,
        laserParts: 0,
      });
    });

    this.refreshTestPanel();
  }

  private stepTest(which: 'level' | 'laser', delta: number): void {
    if (which === 'level') {
      this.testLevel = Phaser.Math.Clamp(this.testLevel + delta, 1, MAX_LEVEL);
    } else {
      this.testStep = Phaser.Math.Clamp(this.testStep + delta, 0, LASER_STEPS.length - 1);
    }
    this.refreshTestPanel();
  }

  private refreshTestPanel(): void {
    if (!this.testLevelText || !this.testLaserText) return;
    const step = LASER_STEPS[this.testStep];
    this.testLevelText.setText(`NIV ${String(this.testLevel).padStart(3, ' ')}`);
    this.testLaserText.setText(`L${this.testStep} ${step.rate}ms ×${step.damage}`);
  }

  private layoutTestPanel(): void {
    if (this.testPanel.length === 0) return;
    const L = this.layout;
    const x = L.view.x + sp(L, 12);
    const bottom = L.view.y + L.view.h - sp(L, 12);
    const size = fs(L, 15, 11);

    this.testPanel.forEach(t => {
      t.setFontSize(size);
      t.setPosition(x + sp(L, t.getData('dx') as number), bottom - (t.getData('row') as number) * sp(L, 21));
    });
  }

  private buildOverlays(): void {
    this.flashOverlay = this.addUI(
      this.add.rectangle(0, 0, 16, 16, 0xffffff, 0).setScrollFactor(0).setDepth(100)
    );
    this.enemyArrowsGfx = this.addUI(
      this.add.graphics().setScrollFactor(0).setDepth(250)
    );
    this.levelText = this.addUI(
      this.add.text(0, 0, `Niveau ${this.level}/${MAX_LEVEL}`, {
        fontFamily: 'monospace', fontSize: '22px', color: '#88bbff',
      }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(200)
    );
  }

  /**
   * Places every HUD element in canvas coordinates for the current layout.
   * Landscape keeps the original right-hand column; portrait folds the same
   * readouts into a bar across the top.
   */
  /** Inner margin of the HUD strip, so readouts never touch the screen edge. */
  private get hudPad(): number {
    return sp(this.layout, this.layout.portrait ? 12 : 20);
  }

  private layoutHUD(): void {
    const L = this.layout;
    const hud = L.hud;
    const pad = this.hudPad;

    this.hudPanelBg.setPosition(hud.x + hud.w / 2, hud.y + hud.h / 2).setSize(hud.w, hud.h);
    this.minimapBorder
      .setPosition(L.minimap.x + L.minimap.w / 2, L.minimap.y + L.minimap.h / 2)
      .setSize(L.minimap.w + 4, L.minimap.h + 4);

    if (L.portrait) {
      this.hudPanel.setPosition(hud.x + hud.w / 2, hud.y + hud.h - 1).setSize(hud.w, 2);

      const left = hud.x + pad;
      const right = L.minimap.x - pad;
      const row1 = hud.y + sp(L, 6);
      const row2 = hud.y + Math.round(hud.h * 0.36);
      const row3 = hud.y + Math.round(hud.h * 0.64);

      this.scoreText.setOrigin(1, 0).setPosition(right, row1).setFontSize(fs(L, 16));
      this.enemyCountText.setOrigin(1, 0).setPosition(right, row2).setFontSize(fs(L, 14));
      this.livesText.setOrigin(0, 0).setPosition(left, row2).setFontSize(fs(L, 14));
      // Armour rides with the hearts: both answer "what is keeping me alive",
      // and it keeps row 2 clear of the enemy counter on narrow screens.
      this.armorText.setOrigin(0, 0)
        .setPosition(left + PLAYER_MAX_HP * sp(L, 22) + sp(L, 6), row1)
        .setFontSize(fs(L, 13));
      // Every powerup at once overflows one line on a phone, so let it wrap.
      this.powerupBar.setOrigin(0, 0).setPosition(left, row3).setFontSize(fs(L, 12))
        .setWordWrapWidth(right - left);
    } else {
      this.hudPanel.setPosition(hud.x + 1, hud.y + hud.h / 2).setSize(2, hud.h);

      const right = hud.x + hud.w - pad;
      this.scoreText.setOrigin(1, 0).setPosition(right, hud.y + sp(L, 10)).setFontSize(fs(L, 17));
      this.enemyCountText.setOrigin(1, 0).setPosition(right, hud.y + sp(L, 34)).setFontSize(fs(L, 15));
      this.livesText.setOrigin(1, 0).setPosition(right, hud.y + sp(L, 78)).setFontSize(fs(L, 15));
      this.armorText.setOrigin(1, 0).setPosition(right, hud.y + sp(L, 96)).setFontSize(fs(L, 14));
      this.powerupBar.setOrigin(1, 0).setPosition(right, hud.y + sp(L, 122)).setFontSize(fs(L, 13))
        .setWordWrapWidth(null);
    }

    this.updateHearts();
    this.updateArmorDisplay();
    this.updatePowerupBar();
  }

  private layoutOverlays(): void {
    const L = this.layout;
    const v = L.view;

    this.flashOverlay.setPosition(v.x + v.w / 2, v.y + v.h / 2).setSize(v.w, v.h);
    this.levelText.setPosition(v.x + v.w / 2, v.y + sp(L, 8)).setFontSize(fs(L, 22));
    this.centredTexts.forEach(t => t.setPosition(v.x + v.w / 2, v.y + v.h / 2));

    // Re-evaluated on every layout change, so plugging in a mouse or opening
    // device emulation switches schemes without a reload.
    this.touchMode = isTouchDevice();
    this.touch?.setEnabled(this.touchMode);
    this.touch?.place(L, getStickSide());

    this.pauseBtn
      ?.setVisible(this.touchMode)
      .setPosition(v.x + sp(L, 4), v.y + sp(L, 2))
      .setFontSize(fs(L, 22));
  }

  private updateHearts(): void {
    this.heartTexts.forEach(t => t.destroy());
    this.heartTexts = [];

    const L = this.layout;
    const step = sp(L, 22);
    const size = fs(L, 20);
    const y = L.hud.y + sp(L, L.portrait ? 4 : 56);
    const pad = this.hudPad;

    for (let i = 0; i < PLAYER_MAX_HP; i++) {
      const filled = i < this.playerHP;
      const x = L.portrait
        ? L.hud.x + pad + i * step
        : L.hud.x + L.hud.w - pad - (PLAYER_MAX_HP - 1 - i) * step;

      const t = this.add.text(x, y, filled ? '♥' : '♡', {
        fontFamily: 'monospace',
        fontSize: size,
        color: filled ? '#ff4466' : '#443344',
      }).setOrigin(L.portrait ? 0 : 0.5, 0).setScrollFactor(0).setDepth(200);

      this.addUI(t);
      this.heartTexts.push(t);
    }
  }

  private updateLivesText(): void {
    this.livesText.setText(`VIES  ${this.lives}/${PLAYER_MAX_LIVES}`);
  }

  private updateArmorDisplay(): void {
    const filled = '◆'.repeat(this.armorPoints);
    const empty = '◇'.repeat(PLAYER_MAX_ARMOR - this.armorPoints);
    // Portrait shows the pips alone: there is no room for the label, and
    // sitting beside the hearts makes them self-explanatory.
    this.armorText.setText(`${this.layout.portrait ? '' : 'ARMURE '}${filled}${empty}`);
    this.armorText.setAlpha(this.armorPoints > 0 ? 1 : 0.3);
  }

  private updatePowerupBar(): void {
    const lines: string[] = [];
    const tierNames = ['LASER BLEU', 'LASER VERT', 'LASER ORANGE', 'LASER ROUGE'];
    lines.push(tierNames[this.laserTier]);
    if (this.laserStep < maxLaserStep(this.level)) {
      const filled = '●'.repeat(this.laserParts);
      const empty = '○'.repeat(LASER_PARTS_NEEDED - this.laserParts);
      lines.push(`PIÈCES ${filled}${empty}`);
    } else if (this.laserStep < LASER_STEPS.length - 1) {
      // Say why nothing is dropping, otherwise the gate reads as a dry spell.
      lines.push(`PALIER SUIVANT  NIV. ${LASER_STEPS[this.laserStep + 1].minLevel}`);
    }
    if (this.dualCount > 0) lines.push(`DUAL ×${this.dualCount}`);
    if (this.rearCount > 0) lines.push(`ARRIÈRE ×${this.rearCount}`);
    if (this.shieldActive) lines.push('BOUCLIER ●');
    const filledBars = Math.round((this.heat / HEAT_MAX) * 10);
    const gauge = '▮'.repeat(filledBars) + '▯'.repeat(10 - filledBars);
    lines.push(this.overheated ? `SURCHAUFFE ${gauge}` : `CHALEUR ${gauge}`);
    // Portrait has one wide row to fill, landscape a narrow tall column.
    this.powerupBar.setText(lines.join(this.layout.portrait ? '  ·  ' : '\n'));

    const remaining = this.enemies.countActive(true);
    this.enemyCountText.setText(`Ennemis : ${remaining}`);
  }

  // ─── UPDATE LOOP ───────────────────────────────────────────────────────────

  update(time: number, delta: number): void {
    const padPause = this.pad.startJustPressed();
    if (!this.isDead && !this.transitioning && !this.countingDown &&
        (Phaser.Input.Keyboard.JustDown(this.escKey) || padPause)) {
      if (this.paused) this.resumeGame();
      else this.pauseGame();
    }
    // Ahead of the early-out below, so the plumes die with the ships rather
    // than hanging lit in mid-air through a pause or a death.
    this.updateThrusters();

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

  // ─── THRUSTERS ─────────────────────────────────────────────────────────────

  /**
   * Hang the plume off the sprite itself. Ships are destroyed from several
   * places — shot down, caught in a bomb, cleared with the scene — and this
   * covers all of them at once.
   */
  private attachThruster(ship: Phaser.Physics.Arcade.Sprite, style: ThrusterStyle): void {
    const thruster = new Thruster(this, this.world, style);
    ship.setData('thruster', thruster);
    ship.once('destroy', () => thruster.destroy());
  }

  private updateThrusters(): void {
    const running = !this.isDead && !this.transitioning && !this.paused && !this.countingDown;

    const pv = this.player.body.velocity;
    this.playerThruster.update(
      this.player.x, this.player.y, this.facingAngle,
      running && (pv.x !== 0 || pv.y !== 0)
    );

    this.enemies.children.each((go) => {
      const e = go as Phaser.Physics.Arcade.Sprite;
      const thruster = e.getData('thruster') as Thruster | undefined;
      if (!thruster) return true;

      const body = e.body as Phaser.Physics.Arcade.Body | null;
      if (!e.active || !body) {
        thruster.update(e.x, e.y, 0, false);
        return true;
      }

      // Enemies steer by velocity rather than a facing angle of their own.
      const v = body.velocity;
      thruster.update(e.x, e.y, Math.atan2(v.y, v.x), running && (v.x !== 0 || v.y !== 0));
      return true;
    });
  }

  // ─── MOVEMENT ──────────────────────────────────────────────────────────────

  private movePlayer(): void {
    // Three input sources, all live at once: whichever the player reaches for
    // works, with no mode to pick first.
    const stick = this.touch?.direction ?? null;
    const gp = this.pad.direction;
    const left  = stick === 'left'  || gp === 'left'  || this.cursors.left.isDown  || this.keyA.isDown;
    const right = stick === 'right' || gp === 'right' || this.cursors.right.isDown || this.keyD.isDown;
    const up    = stick === 'up'    || gp === 'up'    || this.cursors.up.isDown    || this.keyW.isDown;
    const down  = stick === 'down'  || gp === 'down'  || this.cursors.down.isDown  || this.keyS.isDown;

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
    // Firing stays on a trigger even on touch. Automatic fire sounds tempting
    // when the ship aims where it moves, but the cadence is up to 500ms at
    // tier 0: with an enemy crossing in front of you, waiting for the next
    // shot to come round on its own is a coin flip rather than a decision.
    if (this.overheated) return;
    if (!this.spaceKey.isDown && !this.touch?.firing && !this.pad.firing) return;
    const rate = this.laser.rate;
    if (time - this.lastFired < rate) return;
    this.lastFired = time;

    // Charged per trigger pull, not per bullet: the dual and rear pickups
    // would otherwise cost heat for being collected.
    this.heat += heatPerShot(rate);
    if (this.heat >= HEAT_MAX) {
      this.heat = HEAT_MAX;
      this.overheated = true;
      this.showMessage('SURCHAUFFE !', '#ff4422');
    }

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
    this.world.add(bullet);
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

        // Coming off a wall, the choice stays random: biasing there would just
        // pick the blocked direction again and grind against the tile.
        const blocked = e.getData('blocked') as boolean;
        e.setData('blocked', false);

        let dir: [number, number];
        if (!blocked && Math.random() < getChaseBias(this.level)) {
          const dx = this.player.x - e.x;
          const dy = this.player.y - e.y;
          dir = Math.abs(dx) > Math.abs(dy)
            ? (dx > 0 ? dirs[0] : dirs[1])
            : (dy > 0 ? dirs[2] : dirs[3]);
        } else {
          dir = dirs[Math.floor(Math.random() * 4)];
        }

        e.setVelocity(dir[0], dir[1]);
        // Rotate sprite to face movement direction
        e.setRotation(Math.atan2(dir[1], dir[0]) + Math.PI / 2);
        wanderTimer = 900 + Math.random() * 1100;
      }
      e.setData('wanderTimer', wanderTimer);

      this.updateEnemyFire(e, isBoss, now);
      if (isBoss) this.updateBossRing(e, now);

      return true;
    });
  }

  /**
   * One volley per tick of the fire rate. Most are a single blind shot down
   * the shooter's heading; the aimed shot and the rotating sequence are events
   * counted out among them. The red glow now means exactly one thing — an
   * aimed round is coming — so it teaches instead of decorating.
   */
  private updateEnemyFire(e: Phaser.Physics.Arcade.Sprite, isBoss: boolean, now: number): void {
    const firesAt = (e.getData('firesAt') as number) ?? 0;
    if (firesAt > 0) {
      if (now < firesAt) return;
      e.clearTint();
      e.setData('firesAt', 0);
      const angle = Math.atan2(this.player.y - e.y, this.player.x - e.x);
      this.fireEnemyBullet(e.x, e.y, angle, true);
      return;
    }

    const plan = isBoss ? getBossPlan(this.level) : getEnemyPlan(this.level);
    const rate = getEnemyFireRate(this.level) * (isBoss ? 0.75 : 1);

    let lastShot = (e.getData('lastShot') as number) ?? 0;
    if (lastShot === 0) {
      // First live frame. `time.now` runs from game start, not level start,
      // so without this every enemy on the level would open fire on the same
      // beat and stay in lockstep from then on — volleys rather than threat.
      lastShot = now - Math.random() * rate;
      e.setData('lastShot', lastShot);
    }
    if (now - lastShot < rate) return;
    e.setData('lastShot', now);

    const volley = ((e.getData('volley') as number) ?? 0) + 1;
    e.setData('volley', volley);

    if (this.takesAim(e, isBoss, plan.aimedEvery, volley)) {
      e.setData('firesAt', now + ENEMY_TELEGRAPH);
      e.setTint(0xff7777);
    } else if (plan.sequenceEvery > 0 && volley % plan.sequenceEvery === 0) {
      this.fireSequence(e, plan);
    } else {
      this.fireEnemyBullet(e.x, e.y, this.heading(e));
    }
  }

  /**
   * Whether this shooter takes aim on this volley.
   *
   * Enemies take turns rather than each counting to five on its own clock:
   * the first enemy on the map aims on its fifth volley, the second on its
   * tenth, and so on round the level. Nine enemies each aiming every fifth
   * volley meant nine aimed rounds converging at once — the level-wide rate
   * now stays at one aimed round per `aimedEvery` volleys however many
   * shooters are alive, which is what makes it an event rather than weather.
   *
   * A boss is alone in its role and keeps its own count.
   */
  private takesAim(e: Phaser.Physics.Arcade.Sprite, isBoss: boolean, aimedEvery: number, volley: number): boolean {
    if (isBoss) return volley % aimedEvery === 0;

    const cycle = aimedEvery * Math.max(1, this.aimSlots);
    const slot = (e.getData('aimSlot') as number) ?? 0;
    return volley % cycle === ((slot + 1) * aimedEvery) % cycle;
  }

  /**
   * The rotating volley, one bullet at a time. The heading is taken once at
   * the start so the rotation stays coherent even as the ship keeps moving —
   * the shots then trail it, which is what sells the turret.
   */
  private fireSequence(e: Phaser.Physics.Arcade.Sprite, plan: FirePlan): void {
    const base = this.heading(e);
    SEQUENCES[plan.sequence].forEach((offset, i) => {
      if (i === 0) {
        this.fireEnemyBullet(e.x, e.y, base + offset);
        return;
      }
      this.time.delayedCall(i * plan.gap, () => {
        if (e.active) this.fireEnemyBullet(e.x, e.y, base + offset);
      });
    });
  }

  /** The direction a ship is travelling, which is also the way it points. */
  private heading(e: Phaser.Physics.Arcade.Sprite): number {
    const vel = (e.body as Phaser.Physics.Arcade.Body).velocity;
    return Math.atan2(vel.y, vel.x);
  }

  /**
   * The boss's own clock, independent of its volleys: a ring of bullets that
   * has to be outrun rather than dodged. The first three bosses have none.
   */
  private updateBossRing(e: Phaser.Physics.Arcade.Sprite, now: number): void {
    const plan = getBossPlan(this.level);
    if (plan.ring === 0) return;

    const lastRing = (e.getData('lastRing') as number) ?? 0;
    if (lastRing === 0) {
      // Start the clock on the first live frame rather than at game time 0,
      // which would open the fight with a ring before the player has moved.
      e.setData('lastRing', now);
      return;
    }
    if (now - lastRing < plan.ringInterval) return;
    e.setData('lastRing', now);

    this.tweens.add({
      targets: e, scaleX: e.scaleX * 1.18, scaleY: e.scaleY * 1.18,
      duration: BOSS_BURST_TELEGRAPH, yoyo: true, ease: 'Quad.out',
    });
    this.time.delayedCall(BOSS_BURST_TELEGRAPH, () => {
      if (!e.active) return;
      for (let i = 0; i < plan.ring; i++) {
        this.fireEnemyBullet(e.x, e.y, (i / plan.ring) * Math.PI * 2);
      }
    });
  }

  private fireEnemyBullet(x: number, y: number, angle: number, aimed = false): void {
    const key = aimed ? 'enemy-bullet-aimed' : 'enemy-bullet';
    const bullet = this.enemyBullets.get(x, y, key) as Phaser.Physics.Arcade.Sprite | null;
    if (!bullet || !bullet.body) return;
    this.world.add(bullet);
    const body = bullet.body as Phaser.Physics.Arcade.Body;
    // A recycled member keeps the texture it died with — Phaser only reapplies
    // x and y — so the aimed round has to claim its sprite explicitly.
    bullet.setTexture(key);
    // Height comes from the art's own proportions rather than a fixed pair of
    // numbers: enemy-bullet.png is 130x388 and the aimed round 71x209, so any
    // single hard-coded size squashes one of them. Replacement art now renders
    // at whatever shape it was drawn in.
    const w = aimed ? 13 : 9;
    const ratio = bullet.width > 0 ? bullet.height / bullet.width : 2.4;
    bullet.setDisplaySize(w, Math.round(w * ratio))
      .setOrigin(0.5, 0.5).setActive(true).setVisible(true).setDepth(9);
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
    this.damageEnemy(enemy, this.laser.damage, 'laser');
  }

  /** The single path an enemy loses health by, whatever dealt it. */
  private damageEnemy(enemy: Phaser.Physics.Arcade.Sprite, amount: number, source: string): void {
    const before = enemy.getData('hp') as number;
    const hp = before - amount;
    enemy.setData('hp', hp);

    this.tweens.add({
      targets: enemy, alpha: 0.25, duration: 60,
      yoyo: true, onComplete: () => { if (enemy.active) enemy.setAlpha(1); },
    });

    // Landing the shot pays, on top of the kill. Per point of damage rather
    // than per bullet, so a cadence upgrade is not worth more than a damage
    // one; overkill on the last hit is not paid for.
    const dealt = Math.max(0, before - Math.max(hp, 0));
    this.score += dealt * SCORE_PER_DAMAGE;

    if (hp <= 0) {
      const isBoss = enemy.getData('isBoss') as boolean;
      this.score += isBoss ? 500 * this.level : 100;
      // Names the cause of every kill while test mode is on, so an enemy
      // that appears to die on its own can be traced rather than guessed at.
      if (isTestMode()) {
        console.log(`[kill] ${isBoss ? 'boss' : 'enemy'} by ${source} at ` +
          `${Math.round(enemy.x)},${Math.round(enemy.y)} — player at ` +
          `${Math.round(this.player.x)},${Math.round(this.player.y)}`);
      }
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
            laserStep: this.laserStep,
            laserParts: this.laserParts,
            partTakenAt: this.partTakenAt,
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
      case 'armor':
        this.armorPoints = Math.min(PLAYER_MAX_ARMOR, this.armorPoints + 1);
        this.updateArmorDisplay();
        this.showMessage('ARMURE +1', '#44aaff');
        break;
      case 'laser-part':
        this.laserParts += 1;
        this.partTakenAt = this.level;
        if (this.laserParts >= LASER_PARTS_NEEDED) {
          const before = this.laser;
          this.laserStep = Math.min(LASER_STEPS.length - 1, this.laserStep + 1);
          this.laserParts = 0;
          const after = this.laser;
          const hexColor = '#' + LASER_COLORS[after.tier].toString(16).padStart(6, '0');

          // Name what actually changed: a step is a colour, a cadence or a
          // damage bump, never two at once.
          if (after.tier !== before.tier) {
            const tierNames = ['BLEU', 'VERT', 'ORANGE', 'ROUGE'];
            this.showMessage(`LASER ${tierNames[after.tier]} DÉBLOQUÉ !`, hexColor);
          } else if (after.rate < before.rate) {
            this.showMessage('CADENCE DE TIR AMÉLIORÉE !', hexColor);
          } else {
            this.showMessage(`DÉGÂTS ${after.damage} !`, hexColor);
          }
        } else {
          this.showMessage(`PIÈCE LASER  ${this.laserParts}/${LASER_PARTS_NEEDED}`, '#88ffcc');
        }
        break;
    }

    this.flashScreen(LASER_COLORS[this.laserTier], 0.2, 150);
  }

  /**
   * A shockwave centred on the player, not a level wipe. It used to destroy
   * every enemy on the map outright, health be damned, which meant a single
   * pickup deleted the level 100 boss and its hundred health with it.
   */
  private bombAllEnemies(): void {
    const r2 = BOMB_RADIUS * BOMB_RADIUS;

    this.enemies.children.iterate((go) => {
      if (!go) return true;
      const e = go as Phaser.Physics.Arcade.Sprite;
      if (!e.active) return true;
      const dx = e.x - this.player.x;
      const dy = e.y - this.player.y;
      if (dx * dx + dy * dy <= r2) this.damageEnemy(e, BOMB_DAMAGE, 'bomb');
      return true;
    });

    // The blast has to show its reach, or its edge is guesswork.
    const ring = this.add.circle(this.player.x, this.player.y, BOMB_RADIUS, 0xffaa00, 0.12)
      .setStrokeStyle(5, 0xffdd55, 0.9)
      .setDepth(12)
      .setScale(0.08);
    this.world.add(ring);
    this.tweens.add({
      targets: ring, scale: 1, alpha: 0,
      duration: 420, ease: 'Quad.out',
      onComplete: () => ring.destroy(),
    });

    this.flashScreen(0xffaa00, 0.6, 300);
  }

  // ─── PICKUP SPAWNING ───────────────────────────────────────────────────────

  private scheduleNextPickup(): void {
    // A level hands out a fixed number of extra drops and then stops. Farming
    // a cleared level was worth doing only because the drops never ran out.
    if (this.pickupsDropped >= getPickupBudget(this.level)) return;

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
    this.pickupsDropped += 1;
    const p = this.pickups.create(px, py, `pickup-${type}`) as Phaser.Physics.Arcade.Sprite;
    this.world.add(p);
    p.setDisplaySize(36, 36).setOrigin(0.5, 0.5).setAlpha(0).setDepth(6).setData('type', type);
    p.refreshBody();
    (p.body as Phaser.Physics.Arcade.StaticBody).setCircle(20, -2, -2);
    this.tweens.add({ targets: p, alpha: 1, duration: 600, ease: 'Cubic.out' });
    this.addPickupHalo(p, type);
  }

  /**
   * A coloured ring behind a pickup: green for what you keep past the level
   * transition, blue for what is wiped at the next one, amber for the bomb,
   * which is spent the moment it is touched.
   *
   * A ring rather than a tint on the sprite itself — Phaser tints by
   * multiplying, so a blue filter over red art gives dark red rather than
   * blue, and the icons would lose the colours they were drawn with.
   */
  private addPickupHalo(p: Phaser.Physics.Arcade.Sprite, type: PickupType): void {
    const color = type === 'bomb'
      ? HALO_INSTANT
      : (PICKUP_KEEPS.includes(type) ? HALO_KEEP : HALO_TEMP);

    const halo = this.add.circle(p.x, p.y, 23, color, 0.16)
      .setStrokeStyle(3, color, 0.85)
      .setDepth(5)
      .setAlpha(0);
    this.world.add(halo);

    this.tweens.add({ targets: halo, alpha: 1, duration: 600, ease: 'Cubic.out' });
    this.tweens.add({
      targets: halo, scale: 1.12, duration: 900,
      yoyo: true, repeat: -1, ease: 'Sine.inOut',
    });

    // Hung off the pickup so collection and level teardown both take it.
    p.once('destroy', () => halo.destroy());
  }

  // ─── TELEPORTERS ───────────────────────────────────────────────────────────

  /**
   * A linked pair at opposite corners, on a diagonal picked at random so the
   * two are always worth crossing the level for.
   */
  private spawnPortals(gridSize: number): void {
    this.portals = this.physics.add.staticGroup();
    if (this.level < TELEPORT_START_LEVEL || this.floorTiles.length < 2) return;

    const flip = Math.random() < 0.5;
    const a = this.floorNearest(flip ? 0 : gridSize - 1, 0);
    const b = this.floorNearest(flip ? gridSize - 1 : 0, gridSize - 1);
    if (!a || !b || (a.x === b.x && a.y === b.y)) return;

    const first = this.placePortal(a, 'portal', 0x66ddff);
    const second = this.placePortal(b, 'portal-2', 0xff77bb);
    first.setData('exit', second);
    second.setData('exit', first);
  }

  /** The floor tile closest to a grid corner, skipping the player's doorstep. */
  private floorNearest(gx: number, gy: number): { x: number; y: number } | null {
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;

    for (const t of this.floorTiles) {
      const px = t.x * TILE_SIZE + TILE_SIZE / 2;
      const py = t.y * TILE_SIZE + TILE_SIZE / 2;
      const sx = px - this.spawnX;
      const sy = py - this.spawnY;
      if (sx * sx + sy * sy < (4 * TILE_SIZE) ** 2) continue;

      const d = (t.x - gx) ** 2 + (t.y - gy) ** 2;
      if (d < bestD) { bestD = d; best = t; }
    }
    return best;
  }

  private placePortal(
    tile: { x: number; y: number }, key: string, glowColor: number
  ): Phaser.Physics.Arcade.Sprite {
    const px = tile.x * TILE_SIZE + TILE_SIZE / 2;
    const py = tile.y * TILE_SIZE + TILE_SIZE / 2;

    // Depth 0 puts the halo above the starfield at -20 but behind the walls
    // at 1, so neighbouring tiles occlude it rather than being washed by it.
    const glow = this.add.image(px, py, 'glow')
      .setDisplaySize(64, 64)
      .setTint(glowColor)
      .setAlpha(0.3)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(0);
    this.world.add(glow);
    this.tweens.add({
      targets: glow, alpha: 0.52, scale: glow.scale * 1.1,
      duration: 1500, yoyo: true, repeat: -1, ease: 'Sine.inOut',
    });

    const p = this.portals.create(px, py, key) as Phaser.Physics.Arcade.Sprite;
    this.world.add(p);
    p.setDisplaySize(44, 44).setOrigin(0.5, 0.5).setDepth(4);
    p.refreshBody();
    // A static body's radius is in world pixels — StaticBody.setCircle sets
    // width straight from it, where a dynamic body scales the radius by the
    // sprite. So this needs none of the source-texture maths the ship and
    // bullet bodies do, and the art can be any resolution.
    (p.body as Phaser.Physics.Arcade.StaticBody).setCircle(PORTAL_RADIUS);

    // The rim notches are what make this read as a spin rather than a disc.
    p.setData('glow', glowColor);
    this.tweens.add({ targets: p, angle: 360, duration: 6000, repeat: -1, ease: 'Linear' });
    this.tweens.add({
      targets: p, scale: p.scale * 1.08, duration: 1100,
      yoyo: true, repeat: -1, ease: 'Sine.inOut',
    });
    return p;
  }

  /**
   * Step through to the far portal. The ship comes out past the exit and
   * still moving: landing on the pad itself would send it straight back on
   * the next physics step, and the cooldown alone would only turn that into
   * a slower ping-pong.
   */
  private usePortal(ship: Phaser.Physics.Arcade.Sprite, portal: Phaser.Physics.Arcade.Sprite): void {
    const exit = portal.getData('exit') as Phaser.Physics.Arcade.Sprite | undefined;
    if (!exit || !ship.active) return;

    const now = this.time.now;

    // You have to step off a pad to use it again. This callback runs on every
    // physics step while the ship sits on one, so an unbroken run of calls
    // means it never left — only a gap in them proves it did.
    const lastTouch = (ship.getData('portalTouch') as number) ?? -PORTAL_CONTACT_GAP * 2;
    const steppedOff = now - lastTouch > PORTAL_CONTACT_GAP;
    ship.setData('portalTouch', now);
    if (!steppedOff) return;

    if (now < ((ship.getData('portalUntil') as number) ?? 0)) return;

    const body = ship.body as Phaser.Physics.Arcade.Body;
    const vx = body.velocity.x;
    const vy = body.velocity.y;

    // Carry on the way you were going where there is room, otherwise take
    // whichever side of the pad is clear. Offsetting blindly along the
    // heading dropped ships inside the wall whenever the far portal sat
    // against one, which is most corners.
    // Clear of the pad means clear of *both* radii. Offsetting by the
    // portal's alone left the ship still inside the overlap, so it came
    // straight back the moment the cooldown lapsed — the cooldown only set
    // the tempo of the ping-pong rather than ending it.
    const shipR = Math.max(body.halfWidth, body.halfHeight, 8);
    const out = PORTAL_RADIUS + shipR + PORTAL_EXIT_MARGIN;
    const heading = (vx !== 0 || vy !== 0)
      ? Math.atan2(vy, vx)
      : this.facingAngle;
    const preferred = Math.round(heading / (Math.PI / 2)) * (Math.PI / 2);

    let ex = 0;
    let ey = 0;
    let exitAngle = preferred;
    let landed = false;
    for (let i = 0; i < 4; i++) {
      const a = preferred + i * (Math.PI / 2);
      const cx = exit.x + Math.cos(a) * out;
      const cy = exit.y + Math.sin(a) * out;
      if (this.isFloor(cx, cy)) { ex = cx; ey = cy; exitAngle = a; landed = true; break; }
    }
    // Walled in on all four sides: refuse rather than drop the ship onto the
    // pad, which would start the ping-pong all over again.
    if (!landed) return;

    // body.reset() zeroes the velocity, so it has to be put back — an enemy
    // would otherwise sit frozen until its wander timer came round. It leaves
    // along the side it actually came out of, not the one it wanted.
    ship.setData('portalUntil', now + PORTAL_COOLDOWN);
    const speed = Math.hypot(vx, vy);
    body.reset(ex, ey);
    body.setVelocity(Math.cos(exitAngle) * speed, Math.sin(exitAngle) * speed);

    this.portalFlash(portal);
    this.portalFlash(exit);
    if (ship === this.player) this.flashScreen(0x66ddff, 0.25, 180);
  }

  /** Whether a world point sits on a walkable tile. */
  private isFloor(worldX: number, worldY: number): boolean {
    const tx = Math.floor(worldX / TILE_SIZE);
    const ty = Math.floor(worldY / TILE_SIZE);
    const row = this.grid[ty];
    return row !== undefined && row[tx] === 0;
  }

  private portalFlash(portal: Phaser.Physics.Arcade.Sprite): void {
    const color = (portal.getData('glow') as number) ?? 0x66ddff;
    const ring = this.add.circle(portal.x, portal.y, PORTAL_RADIUS, color, 0.2)
      .setStrokeStyle(3, color, 0.9)
      .setDepth(5)
      .setScale(0.4);
    this.world.add(ring);
    this.tweens.add({
      targets: ring, scale: 2.1, alpha: 0,
      duration: 380, ease: 'Quad.out',
      onComplete: () => ring.destroy(),
    });
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
    // The part wears the colour of the laser it leads to, so a cadence step
    // inside the current colour is visibly not a new weapon.
    const next = LASER_STEPS[Math.min(this.laserStep + 1, LASER_STEPS.length - 1)];
    const p = this.pickups.create(px, py, `laser-part-${next.tier}`) as Phaser.Physics.Arcade.Sprite;
    this.world.add(p);
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

    // One cooling rate whether or not the laser tripped. Overheating costs a
    // full bar, which is the whole of HEAT_COOL_MS; easing off at three
    // quarters costs three quarters of it.
    const firing = !this.overheated &&
      (this.spaceKey.isDown || !!this.touch?.firing || this.pad.firing);
    if (!firing && this.heat > 0) {
      this.heat = Math.max(0, this.heat - (HEAT_MAX * delta) / HEAT_COOL_MS);
      if (this.overheated && this.heat === 0) this.overheated = false;
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
      this.world.add(particle);
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
    const L = this.layout;
    const cx = L.view.x + L.view.w / 2;
    const cy = L.view.y + L.view.h / 2;

    const msg = this.addUI(
      this.add.text(cx, cy - sp(L, 40), text, {
        fontFamily: 'monospace', fontSize: fs(L, 28),
        color, stroke: '#000000', strokeThickness: 6,
      }).setScrollFactor(0).setOrigin(0.5).setDepth(300)
    );

    this.tweens.add({
      targets: msg, y: cy - sp(L, 80), alpha: 0,
      duration: 600, ease: 'Cubic.out',
      onComplete: () => msg.destroy(),
    });
  }

  // ─── MINIMAP & NAVIGATION ──────────────────────────────────────────────────

  private updateEnemyArrows(): void {
    this.enemyArrowsGfx.clear();

    const cam = this.cameras.main;
    const seen = cam.worldView;       // slice of the world currently on screen
    const L = this.layout;
    const margin = sp(L, 26);
    const hw = cam.width / 2 - margin;
    const hh = cam.height / 2 - margin;
    const worldMargin = margin / cam.zoom;
    // Arrows are drawn by the UI camera, so in canvas coordinates.
    const cx = L.view.x + cam.width / 2;
    const cy = L.view.y + cam.height / 2;

    this.enemies.children.iterate((go) => {
      if (!go) return true;
      const e = go as Phaser.Physics.Arcade.Sprite;
      if (!e.active) return true;

      // Skip enemies already visible on screen
      if (e.x > seen.x + worldMargin && e.x < seen.right - worldMargin &&
          e.y > seen.y + worldMargin && e.y < seen.bottom - worldMargin) {
        return true;
      }

      const angle = Math.atan2(e.y - seen.centerY, e.x - seen.centerX);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const t = Math.min(
        Math.abs(cos) > 0.001 ? hw / Math.abs(cos) : 99999,
        Math.abs(sin) > 0.001 ? hh / Math.abs(sin) : 99999
      );
      const ax = cx + cos * t;
      const ay = cy + sin * t;

      const isBoss = e.getData('isBoss') as boolean;
      const sz = sp(L, isBoss ? 13 : 8);
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

    const flash = (label: string, delay: number, onDone?: () => void) => {
      this.time.delayedCall(delay, () => {
        const L = this.layout;
        const big = label !== 'GO !';
        const t = this.addUI(
          this.add.text(L.view.x + L.view.w / 2, L.view.y + L.view.h / 2, label, {
            fontFamily: 'monospace',
            fontSize: fs(L, big ? 110 : 80),
            color: big ? '#ffffff' : '#00ff88',
            stroke: '#000033',
            strokeThickness: 10,
          }).setOrigin(0.5).setScrollFactor(0).setDepth(300)
        );
        this.centredTexts.push(t);

        this.tweens.add({
          targets: t, scaleX: 1.8, scaleY: 1.8, alpha: 0,
          duration: 850, ease: 'Cubic.out',
          onComplete: () => {
            this.centredTexts = this.centredTexts.filter(o => o !== t);
            t.destroy();
            onDone?.();
          },
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
    this.touch?.releaseAll();
    this.paused = true;
    this.physics.pause();
    this.time.paused = true;
    // The pause overlay is a menu, so it gets the menu track. The theme is
    // only paused, and picks up where it left off on resume.
    playMusic(this, 'menu');
    this.buildPauseOverlay();
  }

  private buildPauseOverlay(): void {
    const L = this.layout;
    const cx = L.view.x + L.view.w / 2;
    const cy = L.view.y + L.view.h / 2;

    const overlay = this.addUI(
      this.add.rectangle(cx, cy, L.view.w, L.view.h, 0x000000, 0.72)
        .setScrollFactor(0).setDepth(500)
    );

    const title = this.addUI(this.add.text(cx, cy - sp(L, 110), 'PAUSE', {
      fontFamily: 'monospace', fontSize: fs(L, 54), color: '#88bbff',
      stroke: '#002266', strokeThickness: 8,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(501));

    const resumeBtn = this.addUI(this.add.text(cx, cy - sp(L, 10), '[ REPRENDRE ]', {
      fontFamily: 'monospace', fontSize: fs(L, 32), color: '#00ff88',
      stroke: '#004422', strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(501)
      .setInteractive({ useHandCursor: true }));
    resumeBtn.on('pointerover', () => resumeBtn.setStyle({ color: '#88ffcc' }));
    resumeBtn.on('pointerout', () => resumeBtn.setStyle({ color: '#00ff88' }));
    resumeBtn.on('pointerdown', () => this.resumeGame());

    const menuBtn = this.addUI(this.add.text(cx, cy + sp(L, 65), '[ RETOUR AU MENU ]', {
      fontFamily: 'monospace', fontSize: fs(L, 24), color: '#ff6644',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(501)
      .setInteractive({ useHandCursor: true }));
    menuBtn.on('pointerover', () => menuBtn.setStyle({ color: '#ff9977' }));
    menuBtn.on('pointerout', () => menuBtn.setStyle({ color: '#ff6644' }));
    menuBtn.on('pointerdown', () => {
      this.time.paused = false;
      this.scene.start('Menu');
    });

    const hint = this.addUI(this.add.text(cx, cy + sp(L, 120), 'ÉCHAP pour reprendre', {
      fontFamily: 'monospace', fontSize: fs(L, 14), color: '#445566',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(501));

    this.pauseOverlayGroup = [overlay, title, resumeBtn, menuBtn, hint];
  }

  private resumeGame(): void {
    this.paused = false;
    this.physics.resume();
    this.time.paused = false;
    playMusic(this, 'game');
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
        laserStep: this.laserStep,
        laserParts: this.laserParts,
        partTakenAt: this.partTakenAt,
      });
    });
  }
}
