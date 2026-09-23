export type StickSide = 'left' | 'right';

const STICK_KEY = 'hll-stick-side';

/**
 * Which half of the screen holds the movement stick. The fire button takes
 * the other half, so this single setting describes the whole touch layout.
 */
export function getStickSide(): StickSide {
  return localStorage.getItem(STICK_KEY) === 'left' ? 'left' : 'right';
}

export function setStickSide(side: StickSide): void {
  localStorage.setItem(STICK_KEY, side);
}

const MUSIC_VOLUME_KEY = 'hll-volume';
const SFX_VOLUME_KEY = 'hll-sfx-volume';
const LEGACY_MUSIC_KEY = 'hll-music';

/** Comfortable by default rather than full blast. */
export const DEFAULT_MUSIC_VOLUME = 0.35;
/** Effects sit above the music: they carry information, the music does not. */
export const DEFAULT_SFX_VOLUME = 0.6;

function read(key: string, fallback: number): number {
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;
  const v = Number(raw);
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;
}

/**
 * Music and effects carry their own level, 0 to 1. Zero is the off switch on
 * either, so there is no separate mute setting to contradict them.
 */
export function getMusicVolume(): number {
  // Carry over the on/off toggle this replaced, for anyone who had set it.
  const legacyOff = localStorage.getItem(LEGACY_MUSIC_KEY) === 'off';
  return read(MUSIC_VOLUME_KEY, legacyOff ? 0 : DEFAULT_MUSIC_VOLUME);
}

export function setMusicVolume(v: number): void {
  localStorage.setItem(MUSIC_VOLUME_KEY, String(Math.min(1, Math.max(0, v))));
}

export function getSfxVolume(): number {
  return read(SFX_VOLUME_KEY, DEFAULT_SFX_VOLUME);
}

export function setSfxVolume(v: number): void {
  localStorage.setItem(SFX_VOLUME_KEY, String(Math.min(1, Math.max(0, v))));
}

/** Whether there is any point fetching the music at all. */
export function isMusicOn(): boolean {
  return getMusicVolume() > 0;
}

const TEST_KEY = 'hll-test';

/**
 * Whether test mode can be reached at all.
 *
 * It exists for tuning, not for playing: a level selector on a public build
 * hands every visitor a way past the game. It stays available while running
 * from the dev server, and behind `?test` in a URL for checking a real build.
 */
export function isTestModeAvailable(): boolean {
  if (import.meta.env.DEV) return true;
  try {
    return new URLSearchParams(location.search).has('test');
  } catch {
    return false;
  }
}

/**
 * Test mode puts a level and laser selector in the corner of the play area,
 * so a given level can be reached without playing the ninety before it.
 *
 * Gated on availability as well as the stored setting, so a build that hides
 * the option never honours a flag left behind in someone's browser.
 */
export function isTestMode(): boolean {
  return isTestModeAvailable() && localStorage.getItem(TEST_KEY) === 'on';
}

export function setTestMode(on: boolean): void {
  localStorage.setItem(TEST_KEY, on ? 'on' : 'off');
}
