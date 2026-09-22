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

const MUSIC_KEY = 'hll-music';

/** Background music plays unless the player has explicitly turned it off. */
export function isMusicOn(): boolean {
  return localStorage.getItem(MUSIC_KEY) !== 'off';
}

export function setMusicOn(on: boolean): void {
  localStorage.setItem(MUSIC_KEY, on ? 'on' : 'off');
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
