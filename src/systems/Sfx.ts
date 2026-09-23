import Phaser from 'phaser';
import { getSfxVolume } from './Settings';

export type SfxName = 'shot' | 'enemyShot' | 'enemyAimed' | 'pickup' | 'portal' | 'bomb';

const FILES: Record<SfxName, string> = {
  shot: 'sfx/player_shot.mp3',
  enemyShot: 'sfx/normal_shot_ennemi.mp3',
  enemyAimed: 'sfx/tir_cible_ennemi.mp3',
  pickup: 'sfx/bonus-collect.mp3',
  portal: 'sfx/Portal.mp3',
  bomb: 'sfx/bomb_explosion.mp3',
};

/**
 * Per-effect level, and a floor on how often each may retrigger.
 *
 * Two dozen enemies firing on their own clocks would otherwise stack the same
 * sample on itself several times a frame, which reads as a buzz rather than as
 * gunfire. The gap is also what keeps a five-shot sequence sounding like five
 * shots. Enemy fire sits well under the player's: theirs is the one that has
 * to stay readable.
 */
const MIX: Record<SfxName, { volume: number; minGap: number }> = {
  shot: { volume: 0.35, minGap: 60 },
  enemyShot: { volume: 0.2, minGap: 110 },
  enemyAimed: { volume: 0.34, minGap: 90 },
  pickup: { volume: 0.6, minGap: 0 },
  portal: { volume: 0.5, minGap: 150 },
  bomb: { volume: 0.7, minGap: 0 },
};

const lastPlayed = new Map<SfxName, number>();

export function preloadSfx(scene: Phaser.Scene): void {
  for (const name of Object.keys(FILES) as SfxName[]) {
    scene.load.audio(`sfx-${name}`, FILES[name]);
  }
}

/**
 * Fire and forget. Phaser disposes of a sound played this way once it ends.
 * The mix below is the effect's place in the soundscape; the player's setting
 * scales the whole lot.
 */
export function playSfx(scene: Phaser.Scene, name: SfxName): void {
  const key = `sfx-${name}`;
  // A file that failed to load leaves a silent game rather than an exception
  // in the middle of a shot.
  if (!scene.cache.audio.exists(key)) return;

  const { volume, minGap } = MIX[name];
  const now = scene.time.now;
  if (now - (lastPlayed.get(name) ?? -Infinity) < minGap) return;
  lastPlayed.set(name, now);

  scene.sound.play(key, { volume: volume * getSfxVolume() });
}
