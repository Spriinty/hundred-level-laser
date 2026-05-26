export interface ScoreEntry {
  name: string;
  score: number;
  level: number;
  date: string;
}

const KEY = 'hll-scores';
const MAX_ENTRIES = 10;

export function loadScores(): ScoreEntry[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as ScoreEntry[];
  } catch {
    return [];
  }
}

/** Save a new score and return its rank (0-based) in the top-10, or -1 if not in top 10. */
export function saveScore(entry: ScoreEntry): number {
  const scores = loadScores();
  scores.push(entry);
  scores.sort((a, b) => b.score - a.score || b.level - a.level);
  const trimmed = scores.slice(0, MAX_ENTRIES);
  localStorage.setItem(KEY, JSON.stringify(trimmed));

  const best = parseInt(localStorage.getItem('hll-best') ?? '0', 10);
  if (entry.level > best) localStorage.setItem('hll-best', String(entry.level));

  // Find the index of the newly saved entry
  return trimmed.findIndex(
    s => s.name === entry.name && s.score === entry.score && s.level === entry.level
  );
}
