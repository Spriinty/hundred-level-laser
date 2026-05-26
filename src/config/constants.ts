export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;
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

// ms between shots per laser tier (0-3)
export const FIRE_RATE = [500, 340, 200, 100];
export const LASER_COLORS = [0x4488ff, 0x44ff88, 0xff8800, 0xff2244];
// Damage dealt per laser tier
export const LASER_DAMAGE = [1, 2, 3, 4];

export const SHIELD_DURATION = 5000;
export const SCORE_MULT_DURATION = 10000;

// Enemy shooting
export const ENEMY_FIRE_RATE = 2200; // ms between enemy shots
export const ENEMY_BULLET_SPEED = 260;

// Laser parts collectible system
export const LASER_PARTS_NEEDED = 5;
export const LASER_PART_START_LEVEL = 11;

export function getGridSize(level: number): number {
  const tier = Math.floor((level - 1) / 10);
  return 20 + tier * 5;
}

export function getEnemyHP(level: number): number {
  return Math.floor((level - 1) / 10) + 1;
}

export function getEnemyCount(level: number): number {
  return ((level - 1) % 10) + 1;
}

export function isBossLevel(level: number): boolean {
  return level % 10 === 0;
}

export function getLaserTier(level: number): number {
  if (level >= 75) return 3;
  if (level >= 50) return 2;
  if (level >= 25) return 1;
  return 0;
}

export function getPickupCount(level: number): number {
  return Math.floor(level / 10) + 2;
}
