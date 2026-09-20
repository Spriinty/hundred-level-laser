// Screen geometry is no longer fixed — see systems/Layout.ts.
export const TILE_SIZE = 48;
export const MAX_LEVEL = 100;

export const PLAYER_SPEED = 220;
export const PLAYER_BASE_HP = 3;
export const PLAYER_MAX_HP = 5;
export const PLAYER_BASE_LIVES = 3;
export const PLAYER_MAX_LIVES = 10;
export const PLAYER_MAX_ARMOR = 3;

export const BULLET_SPEED = 480;
export const ENEMY_SPEED = 70;
export const BOSS_SPEED = 105;

export const LASER_COLORS = [0x4488ff, 0x44ff88, 0xff8800, 0xff2244];

export const SHIELD_DURATION = 5000;
export const SCORE_MULT_DURATION = 10000;

// ─── LASER LADDER ───────────────────────────────────────────────────────────

export interface LaserStep {
  /** Level this step unlocks at. Parts do not drop before it. */
  minLevel: number;
  /** ms between shots */
  rate: number;
  damage: number;
  /** Bullet texture and colour, 0-3. */
  tier: number;
}

/**
 * One upgrade every ten levels, alternating cadence and damage so that no
 * single step ever doubles the player's output — the old four tiers raised
 * both at once and handed out the last one around level 25, which left the
 * remaining three quarters of the game with nothing to earn.
 *
 * `tier` only picks the bullet colour: four colours over nine steps means a
 * new one every twenty levels.
 */
export const LASER_STEPS: LaserStep[] = [
  { minLevel: 1,  rate: 500, damage: 1, tier: 0 },
  { minLevel: 10, rate: 380, damage: 1, tier: 0 },
  { minLevel: 20, rate: 380, damage: 2, tier: 1 },
  { minLevel: 30, rate: 300, damage: 2, tier: 1 },
  { minLevel: 40, rate: 300, damage: 3, tier: 2 },
  { minLevel: 50, rate: 240, damage: 3, tier: 2 },
  { minLevel: 60, rate: 240, damage: 4, tier: 3 },
  { minLevel: 70, rate: 190, damage: 4, tier: 3 },
  { minLevel: 80, rate: 190, damage: 5, tier: 3 },
];

/** Highest step reachable at this level. Above it, laser parts stop dropping. */
export function maxLaserStep(level: number): number {
  let step = 0;
  for (let i = 0; i < LASER_STEPS.length; i++) {
    if (LASER_STEPS[i].minLevel <= level) step = i;
  }
  return step;
}

export const LASER_PARTS_NEEDED = 5;

// ─── ENEMY THREAT ───────────────────────────────────────────────────────────

export const ENEMY_BULLET_SPEED = 300;
/** Opening fire rate, also used to stagger the first shot of each enemy. */
export const ENEMY_FIRE_RATE = 2200;

/** Below this level enemies still fire blindly along their heading. */
export const ENEMY_AIM_LEVEL = 15;
/** How long an enemy glows before an aimed shot leaves the barrel, in ms. */
export const ENEMY_TELEGRAPH = 300;

export const BOSS_BURST_COUNT = 12;
export const BOSS_BURST_INTERVAL = 3200;
/** The wind-up on a boss burst — the same promise a telegraph makes. */
export const BOSS_BURST_TELEGRAPH = 220;

/** 2200ms at level 1, easing down to about 1100ms by level 100. */
export function getEnemyFireRate(level: number): number {
  return Math.round(ENEMY_FIRE_RATE - (level - 1) * 11);
}

/** Which `enemy-N` sprite the level fields. A new one every 25 levels. */
export function getEnemyTier(level: number): number {
  return Math.min(3, Math.floor((level - 1) / 25));
}

export type ShotPattern = 'single' | 'axis' | 'cross' | 'windmill';

/**
 * How an enemy spreads its fire — keyed off the same tier as the sprite, so a
 * new silhouette always means a new threat rather than a repaint. The cross
 * arrives with the round saucer, which has no front to speak of, and the
 * windmill — a cross that turns further on every volley — closes the game out.
 */
export const SHOT_PATTERNS: ShotPattern[] = ['single', 'axis', 'cross', 'windmill'];

export function getShotPattern(level: number): ShotPattern {
  return SHOT_PATTERNS[getEnemyTier(level)];
}

export function getGridSize(level: number): number {
  const tier = Math.floor((level - 1) / 10);
  return 20 + tier * 5;
}

export function getEnemyHP(level: number): number {
  return Math.floor((level - 1) / 10) + 1;
}

/**
 * The 1-to-10 cycle inside a decade still paces each block, but a decade's
 * worth of baseline now carries over — otherwise level 65 fielded five
 * enemies, exactly as empty as level 5. Nineteen on the last level, against
 * ten before.
 */
export function getEnemyCount(level: number): number {
  return ((level - 1) % 10) + 1 + Math.floor((level - 1) / 10);
}

export function isBossLevel(level: number): boolean {
  return level % 10 === 0;
}

export function getPickupCount(level: number): number {
  return Math.floor(level / 10) + 2;
}
