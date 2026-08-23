import { useMemo } from "react";
import { WEAPONS } from "../../data/weapons";
import { ENCHANTMENTS } from "../../data/enchantments";
import { ITEMS } from "../../data/items";

type RarityLevel = 0 | 1 | 2 | 3;

const RARITY_LABELS: Record<string, RarityLevel> = {
  Common: 0,
  Rare: 1,
  Epic: 2,
  Legendary: 3,
};

const OPACITY_RANGES: Record<RarityLevel, [number, number]> = {
  0: [0.12, 0.18],
  1: [0.16, 0.23],
  2: [0.22, 0.30],
  3: [0.28, 0.38],
};

function costToRarity(t3Cost: number): RarityLevel {
  if (t3Cost <= 60) return 0;
  if (t3Cost <= 120) return 1;
  if (t3Cost <= 180) return 2;
  return 3;
}

const WEAPON_FILENAME_MAP: Record<string, string> = {
  "Swift Blade": "swiftblade",
  "Sharp Dagger": "sharpdagger",
  "Frostbite Dagger": "frostbitedagger",
  "Serpent's Kiss": "serpentskiss",
  "Moonshadow Shiv": "moonshadowshiv",
  "Voidcutter": "voidcutter",
  "Starforged Blade": "starforgedblade",
  "Edge of Eclipse": "eclipsesedge",
  "Crystal Wand": "crystalwand",
  "Scholar's Staff": "scholarstaff",
  "Astril Rod": "astrilrod",
  "Aetherpulse": "mindprism",
  "Celestial Scepter": "celestialscepter",
  "Void Staff": "voidstaff",
  "Eternal Starweaver": "eternalstarweaver",
  "Reality Anchor": "realityanchor",
  "Hunter's Bow": "huntersbow",
  "Sturdy Crossbow": "sturdycrossbow",
  "Longshot": "longshot",
  "Wild Bow": "wildbow",
  "Thunderstrike": "thunderstrike",
  "Beastmaster's Pride": "beastmastersprid",
  "Voidwatcher": "dualaxis",
  "Twin Claws": "twinclaws",
  "Tower Shield": "towershield",
  "Soldier's Sword": "soldierssword",
  "Stargazer Spear": "stargazerspear",
  "Aegis Wall": "aegiswall",
  "Fortress Gate": "fortressgate",
  "Retributor": "retributor",
  "Fyrizul": "wraithrevenant",
  "Eternal Vigil": "eternalvigil",
  "World Breaker": "worldbreaker",
};

const ENCHANT_FILENAME_MAP: Record<string, string> = {
  Swift: "swift",
  Mighty: "mighty",
  Vampiric: "vampiric",
  Explosive: "explosive",
  Precise: "precise",
  Defensive: "guardian",
  Ethereal: "arcane",
  Chaotic: "cosmic",
  Divine: "divine",
  Toxic: "toxic_scroll",
};

const ITEM_FILENAME_MAP: Record<string, string> = {
  "Minor Potion": "minor_potion",
  "Major Potion": "major_potion",
  "Guardian Angel": "guardianangel",
  "Lucky Charm": "luckycharm",
  "Mystic Rune": "mysticrune",
  "Ability Blocker": "abilityblocker",
  "Smoke Bomb": "reflector",
  "Treasure Map": "compass",
  "Power Scroll": "fiery_scroll",
  "Shield Charm": "reflector",
  "Speed Potion": "shinytablet",
  "Bomb": "explosive",
};

const filenameRarity: Record<string, RarityLevel> = {};

for (const w of WEAPONS) {
  const filenameKey = WEAPON_FILENAME_MAP[w.name];
  if (filenameKey) filenameRarity[filenameKey] = RARITY_LABELS[w.rarity] ?? 0;
}

for (const [name, data] of Object.entries(ENCHANTMENTS)) {
  const filenameKey = ENCHANT_FILENAME_MAP[name];
  if (filenameKey) filenameRarity[filenameKey] = costToRarity(data.costs.t3);
}

for (const [name, data] of Object.entries(ITEMS)) {
  const filenameKey = ITEM_FILENAME_MAP[name];
  if (filenameKey) filenameRarity[filenameKey] = costToRarity(data.costs.t3);
}

function getRarityForPath(path: string): RarityLevel {
  const filename = path.split("/").pop()?.replace(/\.[^.]+$/, "").toLowerCase() ?? "";
  if (filenameRarity[filename] !== undefined) return filenameRarity[filename];
  const roll = Math.random();
  if (roll < 0.5) return 0;
  if (roll < 0.8) return 1;
  if (roll < 0.95) return 2;
  return 3;
}

const allImages = import.meta.glob("../../../assets/**/*.{png,webp}", {
  eager: true,
  as: "url",
}) as Record<string, string>;

const ALLOWED_DIRS = [
  "assets/monsters/",
  "assets/hero_portraits/",
  "assets/weapons/",
  "assets/items/",
  "assets/dice/",
  "assets/enchants/",
  "assets/effects/",
  "assets/specs/",
  "assets/icons/",
];

const EXCLUDE_PATTERNS = [
  "shopkeeper",
  "shop_counter",
  "merchant",
  "randommonster",
  "vyridion.webp",
];

interface PoolEntry {
  url: string;
  rarity: RarityLevel;
  isCircle: boolean;
  isDice: boolean;
}

const CIRCLE_DIRS = ["assets/monsters/", "assets/hero_portraits/"];
const DICE_DIR = "assets/dice/";

const pool: PoolEntry[] = Object.entries(allImages)
  .filter(([path]) => ALLOWED_DIRS.some((d) => path.includes(d)))
  .filter(([path]) => !EXCLUDE_PATTERNS.some((p) => path.toLowerCase().includes(p)))
  .filter(([path]) => !path.endsWith(".webp"))
  .map(([path, url]) => ({
    url,
    rarity: getRarityForPath(path),
    isCircle: CIRCLE_DIRS.some((d) => path.includes(d)),
    isDice: path.includes(DICE_DIR),
  }));

interface BubbleConfig {
  url: string;
  size: number;
  left: number;
  top: number;
  duration: number;
  delay: number;
  drift1X: number;
  drift1Y: number;
  drift2X: number;
  drift2Y: number;
  drift3X: number;
  drift3Y: number;
  opacity: number;
  isCircle: boolean;
}

function pickRandom<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  const result: T[] = [];
  for (let i = 0; i < n && copy.length > 0; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    result.push(copy.splice(idx, 1)[0]);
  }
  return result;
}

function generateBubbles(count: number): BubbleConfig[] {
  const selected = pickRandom(pool, Math.min(count, pool.length));
  return selected.map((entry) => {
    const baseSize = 40 + Math.random() * 40;
    const size = entry.isDice ? baseSize * 0.75 : baseSize;
    const edge = Math.floor(Math.random() * 4);
    let left: number, top: number;
    switch (edge) {
      case 0:
        left = Math.random() * 28;
        top = Math.random() * 100;
        break;
      case 1:
        left = 72 + Math.random() * 28;
        top = Math.random() * 100;
        break;
      case 2:
        left = Math.random() * 100;
        top = Math.random() * 30;
        break;
      default:
        left = Math.random() * 100;
        top = 70 + Math.random() * 30;
        break;
    }
    const [minOp, maxOp] = OPACITY_RANGES[entry.rarity];
    const rnd = () => (Math.random() - 0.5) * 80;
    return {
      url: entry.url,
      size,
      left,
      top,
      isCircle: entry.isCircle,
      duration: 18 + Math.random() * 14,
      delay: Math.random() * 12,
      drift1X: rnd(),
      drift1Y: rnd(),
      drift2X: rnd(),
      drift2Y: rnd(),
      drift3X: rnd(),
      drift3Y: rnd(),
      opacity: minOp + Math.random() * (maxOp - minOp),
    };
  });
}

export function FloatingBubbles({ count = 18 }: { count?: number }) {
  const bubbles = useMemo(() => generateBubbles(count), [count]);

  return (
    <div
      className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 overflow-hidden pointer-events-none select-none z-0"
      style={{ width: "1920px", height: "1080px", maxWidth: "100vw", maxHeight: "100vh" }}
    >
      {bubbles.map((b, i) => (
        <div
          key={i}
          className={`absolute ${b.isCircle ? "rounded-full overflow-hidden" : ""}`}
          style={{
            width: `${b.size}px`,
            height: `${b.size}px`,
            left: `${b.left}%`,
            top: `${b.top}%`,
            opacity: b.opacity,
            filter: "drop-shadow(0 0 8px rgba(34, 211, 238, 0.08))",
            animation: `bubbleFloat ${b.duration}s ease-in-out ${b.delay}s infinite both`,
            ["--d1x" as string]: `${b.drift1X}px`,
            ["--d1y" as string]: `${b.drift1Y}px`,
            ["--d2x" as string]: `${b.drift2X}px`,
            ["--d2y" as string]: `${b.drift2Y}px`,
            ["--d3x" as string]: `${b.drift3X}px`,
            ["--d3y" as string]: `${b.drift3Y}px`,
          }}
        >
          <img
            src={b.url}
            alt=""
            className={`w-full h-full ${b.isCircle ? "object-cover object-top" : "object-contain"}`}
            draggable={false}
          />
        </div>
      ))}
    </div>
  );
}
