/**
 * Arcade name entry: one character at a time, cycled with up and down.
 *
 * The letters run first and the digits after, so winding *down* from the
 * start gives A, B, C… and winding *up* gives 9, 8, 7… then Z, Y, X — the
 * two ends of the same ring.
 */
export const NAME_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/**
 * The character being edited is always the last one. That keeps the model to
 * a plain string, with no cursor to track, and still reads the way an arcade
 * cabinet does: wind a letter, step right, wind the next.
 */
function cycle(name: string, step: number, maxLength: number): string {
  if (name.length === 0) {
    // Nothing yet: enter the ring at whichever end the player reached for.
    return step > 0 ? NAME_ALPHABET[0] : NAME_ALPHABET[NAME_ALPHABET.length - 1];
  }
  if (name.length > maxLength) return name;

  const head = name.slice(0, -1);
  const at = NAME_ALPHABET.indexOf(name[name.length - 1]);
  // An unknown character (a space from typing, say) re-enters at the start.
  const from = at === -1 ? 0 : at;
  const next = (from + step + NAME_ALPHABET.length) % NAME_ALPHABET.length;
  return head + NAME_ALPHABET[next];
}

export function wheelDown(name: string, maxLength: number): string {
  return cycle(name, 1, maxLength);
}

export function wheelUp(name: string, maxLength: number): string {
  return cycle(name, -1, maxLength);
}

/** Accept this character and open the next slot. */
export function wheelForward(name: string, maxLength: number): string {
  if (name.length === 0 || name.length >= maxLength) return name;
  return name + NAME_ALPHABET[0];
}

/** Step back over the last character. */
export function wheelBack(name: string): string {
  return name.slice(0, -1);
}
