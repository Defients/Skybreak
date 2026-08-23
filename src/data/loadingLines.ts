export const LOADING_LINES: string[] = [
  "The Astrilith remembers every ascent.",
  "Vyridian listens for imbalance.",
  "Not every treasure wishes to be found.",
  "A standard deck is enough to open the way.",
  "The summit does not reward strength alone.",
  "Some rooms are older than the stair itself.",
  "VyCorp doors always open too cleanly.",
  "Ymzo's seal flickers, then vanishes.",
  "Kiox never used the stairs.",
  "Sinira's dreams sometimes reach this high.",
  "The dice are not silent. You are not listening closely enough.",
  "The next floor has already changed.",
];

export function getRandomLoadingLine(): string {
  return LOADING_LINES[Math.floor(Math.random() * LOADING_LINES.length)];
}
