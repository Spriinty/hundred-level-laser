import Phaser from 'phaser';

export interface ThrusterStyle {
  /** How far behind the ship's centre the nozzles sit, in world px. */
  offset: number;
  /** Half the gap between the two nozzles. 0 gives a single central plume. */
  spread: number;
  /** Particle size, as a multiple of the 16px flame texture. */
  scale: number;
  /** How hard particles are pushed backwards, in px/s. */
  thrust: number;
  /** Colours a particle passes through over its life: core, mid, tail. */
  color: number[];
  /** Milliseconds a particle lives. Longer means a longer trail. */
  lifespan: number;
  /** Render depth. Always one below the ship it belongs to. */
  depth: number;
  /** Gap between particles in ms. Lower is denser and costlier. */
  frequency: number;
}

// Trail length is roughly `thrust × lifespan`, plus however far the ship
// itself travels in that time. Enemies crawl at a third of the player's speed,
// so they need a noticeably longer lifespan to leave a comparable streak.
export const PLAYER_THRUSTER: ThrusterStyle = {
  offset: 20, spread: 8, scale: 0.55, thrust: 105,
  color: [0xffffff, 0x88ccff, 0x1144cc], lifespan: 260,
  depth: 9, frequency: 16,
};

export const BOSS_THRUSTER: ThrusterStyle = {
  offset: 30, spread: 11, scale: 0.9, thrust: 85,
  color: [0xffd0a0, 0xff3a1a, 0x6a0000], lifespan: 380,
  depth: 8, frequency: 16,
};

/**
 * One per enemy tier, indexed the same way as the `enemy-N` textures.
 *
 * Every enemy on a level shares a tier, so the flame colour is really a
 * marker of how deep you are: the field turns from orange to steel to acid
 * green to violet as the tiers roll over. Each one is picked to sit with its
 * sprite's own palette, and apart from the player's blue and the boss's red.
 */
// Enemies are drawn 44px wide, so anything closer than ~22px from the centre
// spawns underneath the sprite and is never seen. That is what hid the
// saucer's plume entirely: being round, it has no narrow tail to peek past.
export const ENEMY_THRUSTERS: ThrusterStyle[] = [
  // enemy-0, the tan bug: no engines drawn on it, so a single plume.
  {
    offset: 22, spread: 0, scale: 0.45, thrust: 85,
    color: [0xffe2a8, 0xff8c1a, 0x7a3000], lifespan: 300,
    depth: 7, frequency: 22,
  },
  // enemy-1, the steel fighter: two engines, white-hot exhaust.
  {
    offset: 22, spread: 7, scale: 0.4, thrust: 90,
    color: [0xffffff, 0xcfe0f0, 0x44607a], lifespan: 300,
    depth: 7, frequency: 22,
  },
  // enemy-2, the olive saucer: clears the full radius of the disc.
  {
    offset: 26, spread: 0, scale: 0.5, thrust: 80,
    color: [0xf0ffd0, 0x7dff3a, 0x1c5a00], lifespan: 320,
    depth: 7, frequency: 22,
  },
  // enemy-3, the violet interceptor: its engine glows are already purple.
  {
    offset: 22, spread: 7, scale: 0.45, thrust: 90,
    color: [0xffe0ff, 0xc060ff, 0x3a0a6a], lifespan: 300,
    depth: 7, frequency: 22,
  },
];

/**
 * The exhaust plume behind a ship.
 *
 * Ships here only ever face one of four directions and move at a fixed speed,
 * so the plume needs no easing or guesswork: it is told each frame where the
 * ship is, which way it points, and whether the engines are lit.
 */
export class Thruster {
  private emitters: Phaser.GameObjects.Particles.ParticleEmitter[] = [];
  private lit = false;

  constructor(scene: Phaser.Scene, layer: Phaser.GameObjects.Layer, private style: ThrusterStyle) {
    // One emitter per nozzle. Ships are drawn with two engines, and a single
    // plume down the centreline reads as a rocket rather than a fighter.
    const nozzles = style.spread > 0 ? 2 : 1;

    for (let i = 0; i < nozzles; i++) {
      const emitter = scene.add.particles(0, 0, 'flame', {
        lifespan: style.lifespan,
        scale: { start: style.scale, end: 0, ease: 'Quad.out' },
        alpha: { start: 0.9, end: 0 },
        color: style.color,
        colorEase: 'Quad.out',
        // speedX/speedY rather than `speed`: naming the axes is what puts the
        // emitter in point mode, where a particle takes the velocity it is
        // given. The values themselves are set per frame in update().
        speedX: 0,
        speedY: 0,
        blendMode: 'ADD',
        frequency: style.frequency,
        quantity: 1,
        emitting: false,
      });
      emitter.setDepth(style.depth);
      layer.add(emitter);
      this.emitters.push(emitter);
    }
  }

  /**
   * Place the plume for this frame. `angle` is the direction the ship is
   * travelling in radians; `lit` cuts the flame when the ship is stopped,
   * dead or paused.
   */
  update(x: number, y: number, angle: number, lit: boolean): void {
    if (lit !== this.lit) {
      this.lit = lit;
      this.emitters.forEach(e => (lit ? e.start() : e.stop()));
    }
    if (!lit) return;

    const backX = -Math.cos(angle);
    const backY = -Math.sin(angle);
    // Perpendicular to the direction of travel: the axis the nozzles sit on.
    const perpX = -Math.sin(angle);
    const perpY = Math.cos(angle);

    this.emitters.forEach((e, i) => {
      const side = this.emitters.length === 1 ? 0 : (i === 0 ? -this.style.spread : this.style.spread);
      // Jitter across the plume rather than along it, so the exhaust widens
      // instead of stuttering.
      const wobble = Phaser.Math.FloatBetween(-2.5, 2.5);
      e.setPosition(
        x + backX * this.style.offset + perpX * (side + wobble),
        y + backY * this.style.offset + perpY * (side + wobble)
      );

      e.setParticleSpeed(backX * this.style.thrust, backY * this.style.thrust);
      // setParticleSpeed() flips the emitter back into radial mode on every
      // call, and radial mode takes |speedX|,|speedY| with the direction read
      // from the `angle` op — which throws away the sign we just set. Forcing
      // point mode after the call is what makes the plume actually point
      // backwards rather than scattering along one axis.
      e.setRadial(false);
    });
  }

  destroy(): void {
    this.emitters.forEach(e => e.destroy());
    this.emitters = [];
  }
}
