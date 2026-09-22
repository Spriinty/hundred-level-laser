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

// ─── SCORE ──────────────────────────────────────────────────────────────────

/** Points for each point of damage landed, on top of the kill bonus. */
export const SCORE_PER_DAMAGE = 10;

// ─── LASER HEAT ─────────────────────────────────────────────────────────────

/**
 * Sustained fire overheats the laser and locks it out until it cools.
 *
 * This is here instead of docking points for spraying: a bar punishes during
 * the fight, in the place the player is already looking, and asks for a
 * decision — break off, cool, come back. A falling score punishes afterwards
 * and invisibly, and asks for nothing.
 *
 * Heat is charged per second on the trigger rather than per shot, so every
 * rung of the ladder buys the same ten seconds of fire. Charging per shot
 * would make each cadence upgrade shorten the burst, which would read as a
 * downgrade.
 */
export const HEAT_MAX = 100;
export const HEAT_SUSTAIN_MS = 10000;
/** Time for a full bar to clear, and so the price of overheating. */
export const HEAT_COOL_MS = 3000;

export function heatPerShot(rate: number): number {
  return (HEAT_MAX * rate) / HEAT_SUSTAIN_MS;
}

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

/**
 * The bomb pickup clears a circle around the player rather than the whole
 * level, and deals damage instead of killing outright. It still wipes any
 * ordinary enemy in range — they top out at ten health — but a late boss,
 * whose health equals its level number, now takes four of them.
 */
export const BOMB_RADIUS = 7 * TILE_SIZE;
export const BOMB_DAMAGE = 25;

// ─── TELEPORTERS ────────────────────────────────────────────────────────────

/**
 * A linked pair of portals at opposite corners of the map.
 *
 * They are shared: enemies step through them too. That is the whole point —
 * a one-way shortcut for the player would only make a big map smaller, while
 * a shared one cuts both ways. You can shake a pursuer, and something can
 * arrive behind you.
 *
 * They start where the maps first grow past their opening size, since that is
 * where crossing the level begins to cost anything.
 */
export const TELEPORT_START_LEVEL = 11;
export const PORTAL_RADIUS = 20;
/** How far past the far portal you come out. Keeps you off the pad. */
export const PORTAL_EXIT_MARGIN = 6;
/** Safety net behind the exit offset, in ms. */
export const PORTAL_COOLDOWN = 600;
/**
 * A break in contact this long counts as having left the pad.
 *
 * The overlap fires on every physics step, so an unbroken run of them proves
 * the ship never got off, and a gap proves it did. A timer alone cannot tell
 * the two apart — which is why the first attempt at this merely set the tempo
 * of the ping-pong instead of ending it.
 */
export const PORTAL_CONTACT_GAP = 120;

// ─── ENEMY THREAT ───────────────────────────────────────────────────────────

export const ENEMY_BULLET_SPEED = 300;
/** Opening fire rate, also used to stagger the first shot of each enemy. */
export const ENEMY_FIRE_RATE = 2200;

/** How long an enemy glows before an aimed shot leaves the barrel, in ms. */
export const ENEMY_TELEGRAPH = 300;
/** The wind-up on a boss ring — the same promise a telegraph makes. */
export const BOSS_BURST_TELEGRAPH = 220;

/** 2200ms at level 1, easing down to about 1400ms by level 100. */
export function getEnemyFireRate(level: number): number {
  return Math.round(ENEMY_FIRE_RATE - (level - 1) * 8);
}

/** Which `enemy-N` sprite the level fields. A new one every 25 levels. */
export function getEnemyTier(level: number): number {
  return Math.min(3, Math.floor((level - 1) / 25));
}

const Q = Math.PI / 2;

export type SequenceName = 'clockwise' | 'counter' | 'opposites' | 'sweep' | 'pinwheel';

/**
 * A sequence is fired one bullet at a time, not all at once — the angles below
 * are offsets from the shooter's heading, walked in order.
 *
 * Firing four directions simultaneously turned out to be the wrong shape: only
 * one of the four could ever threaten the player, so the other three bought
 * nothing but clutter. Spread over time the same four shots stay readable, and
 * the rotation is something the player can see coming and step around.
 */
export const SEQUENCES: Record<SequenceName, number[]> = {
  /** Ahead, right, behind, left. A turret sweeping one way round. */
  clockwise: [0, Q, 2 * Q, 3 * Q],
  /** The same sweep the other way, so two shooters never feel identical. */
  counter: [0, -Q, -2 * Q, -3 * Q],
  /** Opposites first: the lane you dodge into is the next one closed. */
  opposites: [0, 2 * Q, Q, 3 * Q],
  /** A wiper across the shooter's front. Five shots, nothing behind it. */
  sweep: [-Q, -Q / 2, 0, Q / 2, Q],
  /** Clockwise, but each shot lands an eighth-turn further round, so no two
   *  volleys running reuse the same lanes. */
  pinwheel: [0, Q + Q / 4, 2 * Q + Q / 2, 3 * Q + 3 * Q / 4],
};

export interface FirePlan {
  /** Every Nth volley is aimed at the player, and telegraphed. */
  aimedEvery: number;
  /** Every Nth volley is a sequence. 0 means this shooter never does one. */
  sequenceEvery: number;
  sequence: SequenceName;
  /** ms between consecutive shots inside a sequence. */
  gap: number;
}

/**
 * Most volleys are a single blind shot down the shooter's heading. The aimed
 * shot and the sequence are events among them, not the standing behaviour:
 * every enemy aiming on every volley is what made the field unplayable.
 */
export const ENEMY_PLANS: FirePlan[] = [
  { aimedEvery: 5, sequenceEvery: 0, sequence: 'clockwise', gap: 170 },
  { aimedEvery: 4, sequenceEvery: 6, sequence: 'clockwise', gap: 160 },
  { aimedEvery: 4, sequenceEvery: 5, sequence: 'sweep', gap: 150 },
  { aimedEvery: 3, sequenceEvery: 4, sequence: 'pinwheel', gap: 140 },
];

export function getEnemyPlan(level: number): FirePlan {
  return ENEMY_PLANS[getEnemyTier(level)];
}

export interface BossPlan extends FirePlan {
  /** Bullets in the radial ring. 0 means this boss has no ring yet. */
  ring: number;
  ringInterval: number;
}

/**
 * Bosses scale with the level they appear at, not just with their health. The
 * level 10 boss is the player's first, and gets a tougher enemy's kit rather
 * than the endgame one.
 */
export function getBossPlan(level: number): BossPlan {
  const rank = Math.max(1, Math.round(level / 10));

  if (rank <= 3) {
    return { aimedEvery: 3, sequenceEvery: 4, sequence: 'counter', gap: 180, ring: 0, ringInterval: 0 };
  }
  if (rank <= 6) {
    return { aimedEvery: 3, sequenceEvery: 3, sequence: 'opposites', gap: 160, ring: 8, ringInterval: 5200 };
  }
  return { aimedEvery: 2, sequenceEvery: 3, sequence: 'pinwheel', gap: 140, ring: 12, ringInterval: 4200 };
}

/**
 * The map grows, but far more slowly than it used to and with a ceiling.
 *
 * At five tiles per decade the last levels were 65 across — more than ten
 * times the area of level 1 — and the enemies ended up parked in separate
 * corners, to be picked off one at a time in peace. Two per decade, capped at
 * 36, keeps the maze growing without letting it swallow the fight.
 */
export function getGridSize(level: number): number {
  return Math.min(36, 20 + Math.floor((level - 1) / 10) * 2);
}

export function getEnemyHP(level: number): number {
  return Math.floor((level - 1) / 10) + 1;
}

/**
 * The 1-to-10 cycle inside a decade paces each block of levels, and a decade's
 * baseline carries over on top so the field does not reset to empty every ten
 * levels. Read together with the flattened map growth, this holds the number
 * of enemies per square of map roughly level across the whole game.
 */
export function getEnemyCount(level: number): number {
  const cycle = ((level - 1) % 10) + 1;
  const decade = Math.floor((level - 1) / 10);
  return cycle + Math.round(decade * 1.5);
}

/**
 * How often an enemy heads towards the player instead of drifting at random,
 * from a third of its turns to two thirds.
 *
 * Purely random wandering is what let enemies settle into corners: the fight
 * had to be hunted down. Closing in is also a better answer than escalating
 * their fire rate over time, because the pressure it builds is visible on
 * screen rather than hidden in a timer.
 */
export function getChaseBias(level: number): number {
  return 0.33 + (level / MAX_LEVEL) * 0.33;
}

export function isBossLevel(level: number): boolean {
  return level % 10 === 0;
}

export function getPickupCount(level: number): number {
  return Math.floor(level / 10) + 2;
}

/**
 * How many further pickups a level will drop before it stops rewarding you
 * for staying on it.
 *
 * Standing on a cleared-out level to farm the respawning drops was worth
 * doing because the drops never stopped. Capping them removes the reason to
 * linger rather than punishing the player for lingering.
 */
export function getPickupBudget(level: number): number {
  return 3 + Math.floor(level / 20);
}
