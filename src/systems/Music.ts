import Phaser from 'phaser';
import { isMusicOn } from './Settings';

export type Track = 'menu' | 'game';

const KEYS: Record<Track, string> = {
  menu: 'music-menu',
  game: 'music-game',
};

const FILES: Record<Track, string> = {
  menu: 'music/menu_options.mp3',
  game: 'music/jeu.mp3',
};

const VOLUME = 0.35;

// Phaser's sound manager belongs to the game, not the scene, so a track keeps
// playing across `scene.start`. Tracks are kept and paused rather than
// destroyed: stepping into the pause menu and back out returns to the same
// point in the theme instead of restarting it.
let current: Track | null = null;
const sounds = new Map<Track, Phaser.Sound.BaseSound>();
// A track that has had `play()` called on it once. Before the first tap the
// audio context is locked and Phaser queues the call, so `isPlaying` is still
// false — playing again there would queue a second, overlapping loop.
const started = new Set<Track>();
// Tracks whose file could not be fetched. A silent game beats retrying on
// every level transition.
const broken = new Set<Track>();

/**
 * Make `track` the background music, looping. Asking for the track that is
 * already current does nothing, which is what keeps the theme running through
 * the `scene.start('Game')` that every level transition performs.
 */
export function playMusic(scene: Phaser.Scene, track: Track): void {
  if (current === track) return;

  if (current) sounds.get(current)?.pause();
  current = track;
  if (!isMusicOn() || broken.has(track)) return;

  if (scene.cache.audio.exists(KEYS[track])) {
    resume(scene, track);
  } else {
    // The files run to several MB, so they are fetched in the background
    // rather than held against the boot screen. Start as soon as one lands,
    // unless the player has moved on to a scene wanting the other track.
    fetch(scene, track, () => {
      if (current === track) resume(scene, track);
    });
  }
}

/**
 * Warm the cache for a track we will want shortly, without playing it. Called
 * from the menu so the theme is usually ready by the time a run starts.
 */
export function prefetchMusic(scene: Phaser.Scene, track: Track): void {
  if (broken.has(track) || scene.cache.audio.exists(KEYS[track])) return;
  fetch(scene, track);
}

/** Re-apply the music setting after the player toggles it in the menu. */
export function refreshMusic(scene: Phaser.Scene): void {
  if (!isMusicOn()) {
    sounds.forEach(s => s.pause());
    return;
  }
  const track = current;
  current = null;
  if (track) playMusic(scene, track);
}

function resume(scene: Phaser.Scene, track: Track): void {
  let sound = sounds.get(track);
  if (!sound) {
    sound = scene.sound.add(KEYS[track], { loop: true, volume: VOLUME });
    sounds.set(track, sound);
  }

  if (sound.isPaused) sound.resume();
  else if (!started.has(track)) {
    started.add(track);
    sound.play();
  }
}

function fetch(scene: Phaser.Scene, track: Track, onDone?: () => void): void {
  const key = KEYS[track];
  // A load started by a scene dies with that scene. Re-requesting an in-flight
  // key is harmless, so the next scene simply picks the fetch back up.
  scene.load.audio(key, FILES[track]);
  scene.load.once(`filecomplete-audio-${key}`, () => onDone?.());
  scene.load.once('loaderror', (file: Phaser.Loader.File) => {
    if (file.key === key) broken.add(track);
  });
  scene.load.start();
}
