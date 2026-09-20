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
