/**
 * One family for the whole game.
 *
 * VT323 is a CRT terminal face: period-correct without being a caricature the
 * way a blocky 8-bit font would be, and it carries French accents, which a lot
 * of pixel fonts do not. The monospace fallback keeps every screen legible if
 * the web font never arrives.
 *
 * It is narrower than the system monospace it replaces, so anything measuring
 * text rather than assuming a character width adapts on its own.
 */
export const UI_FONT = '"VT323", monospace';
