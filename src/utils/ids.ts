let idCounter = 0;
let idPrefix = "id";

export function resetIdCounter(prefix: string = "id"): void {
  idCounter = 0;
  idPrefix = prefix;
}

export function generateId(prefix: string = "id"): string {
  idCounter++;
  return `${prefix}_${idCounter}`;
}

export function generateGameId(): string {
  return generateId("game");
}

export function generateSeed(): string {
  const prefixes = [
    "Aether", "Arcane", "Astril", "Chaos", "Cosmic", "Crimson", "Crystal",
    "Dusk", "Eldritch", "Ember", "Frost", "Gloom", "Hollow", "Lunar",
    "Mystic", "Nether", "Onyx", "Phantom", "Primal", "Rune", "Shadow",
    "Soul", "Spectral", "Storm", "Twilight", "Void", "Wraith",
  ];
  const suffixes = [
    "Bloom", "Brand", "Call", "Curse", "Dance", "Dawn", "Drift",
    "Echo", "Fall", "Flame", "Forge", "Gaze", "Glide", "Grace",
    "Howl", "Hunt", "Mark", "Pulse", "Rift", "Rise", "Roar",
    "Shard", "Song", "Surge", "Tide", "Veil", "Ward", "Weave",
  ];
  const p = prefixes[Math.floor(Math.random() * prefixes.length)];
  const s = suffixes[Math.floor(Math.random() * suffixes.length)];
  return `${p}${s}`;
}

export function generateHeroId(position: number): string {
  return `hero_${position}`;
}

export function generateMonsterId(monsterId: number): string {
  return generateId(`monster_${monsterId}`);
}

export function generateCombatId(): string {
  return generateId("combat");
}

export function generateEventId(sequence: number): string {
  return `event_${sequence}`;
}
