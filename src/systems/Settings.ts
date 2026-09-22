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

const VOLUME_KEY = 'hll-volume';
const LEGACY_MUSIC_KEY = 'hll-music';

/** Comfortable by default rather than full blast. */
export const DEFAULT_VOLUME = 0.35;

/**
 * Output volume, 0 to 1. Zero is the off switch, so there is no separate mute
 * setting to contradict it.
 */
export function getVolume(): number {
  const raw = localStorage.getItem(VOLUME_KEY);
  if (raw === null) {
    // Carry over the on/off toggle this replaced, for anyone who had set it.
    return localStorage.getItem(LEGACY_MUSIC_KEY) === 'off' ? 0 : DEFAULT_VOLUME;
  }
  const v = Number(raw);
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : DEFAULT_VOLUME;
}

export function setVolume(v: number): void {
  localStorage.setItem(VOLUME_KEY, String(Math.min(1, Math.max(0, v))));
}

/** Whether there is any point fetching the music at all. */
export function isMusicOn(): boolean {
  return getVolume() > 0;
}

const TEST_KEY = 'hll-test';

/**
 * Test mode puts a level and laser selector in the corner of the play area,
 * so a given level can be reached without playing the ninety before it. Off
 * unless deliberately switched on from the menu.
 */
export function isTestMode(): boolean {
  return localStorage.getItem(TEST_KEY) === 'on';
}

export function setTestMode(on: boolean): void {
  localStorage.setItem(TEST_KEY, on ? 'on' : 'off');
}
