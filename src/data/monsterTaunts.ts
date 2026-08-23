export const MONSTER_TAUNTS: Record<string, string[]> = {
  "Abyssal Ooze": [
    "You dissolved into nothing. How fitting.",
    "Even your party couldn't keep it together. Much like me, really.",
    "Splish splash, your party's hopes just crashed.",
    "I oozed all over your ambitions. How delightful.",
  ],
  "Treant": [
    "Your roots were shallow. Mine ran deep.",
    "I've stood for centuries. You stood for seconds.",
    "Even the saplings could've taken you.",
    "You sought to fell me? The irony grows.",
  ],
  "Glimmering Sprite": [
    "Oh, you thought you could catch me? How precious.",
    "I danced circles around your party. Literally.",
    "A flicker of hope, then darkness. How pretty.",
    "You never could quite... grasp me.",
  ],
  "Shadowy Assassin": [
    "You never saw it coming. That's rather the point.",
    "One by one, into the shadows. Silent as the grave.",
    "Your party never even knew I was there. Until it was too late.",
    "A clean job. No witnesses. Well... none left alive.",
  ],
  "Banshee": [
    "Did you hear that? That was the sound of your party falling.",
    "I screamed, and your heroes simply... stopped.",
    "Your courage withered at my wail. As it should.",
    "Even your bravest covered their ears. It didn't help.",
  ],
  "Lunar Witch": [
    "The moon favored me tonight. It always does.",
    "Your party faded like a bad dream in the morning light.",
    "I drew power from the dark side. You never had a chance.",
    "Eclipsed and forgotten. That's what you are now.",
  ],
  "Arcane Elemental": [
    "Your strategy was elementary. Mine was elemental.",
    "I unraveled your party like a cheap spell.",
    "Pure magic versus pure folly. Guess which won.",
    "You came armed with steel. I came armed with the fabric of reality.",
  ],
  "Phoenix": [
    "I burned bright. Your party... merely burned.",
    "Death couldn't stop me. What made you think you could?",
    "From my ashes, I rose. From yours, nothing.",
    "You should have brought water. Or a lot of it.",
  ],
  "Gargoyle": [
    "I've waited centuries on this perch. You were but a moment's entertainment.",
    "Stone endures. Flesh does not.",
    "You cracked against me like waves on a cliff.",
    "I didn't even need to flinch.",
  ],
  "Cursed Knight": [
    "Your weapon looked nice. I'll be taking it.",
    "Cursed? Perhaps. But you're the one who's dead.",
    "I fought with your own strength against you. Thank you for that.",
    "A knight's duty is to fell the unworthy. You were... unworthy.",
  ],
  "Minotaur": [
    "You entered my maze. You never left.",
    "I charged through your party like a gate made of paper.",
    "Even your strongest couldn't withstand the horns.",
    "You were lost from the moment you stepped in.",
  ],
  "Chimera": [
    "Three heads, three times the disappointment in your party.",
    "The Lion roared, the Goat laughed, the Snake whispered your eulogy.",
    "You couldn't handle one of me. Let alone three.",
    "A monster of many faces. Your defeat had only one.",
  ],
  "Ember Drake": [
    "I turned your heroes to ash and cinder.",
    "You walked into a dragon's fire expecting shade?",
    "Your party burned like kindling. How warm.",
    "Smoke and ashes. That's all that remains of your hopes.",
  ],
  "Frost Wyrm": [
    "I froze your courage solid. Then I shattered it.",
    "Your heroes became ice sculptures. Temporary ones.",
    "Cold, wasn't it? The realization that you never had a chance.",
    "Absolute zero. Absolute defeat.",
  ],
  "Nano Prototype": [
    "Assimilation complete. Your party has been... processed.",
    "Your biology was inefficient. I offered an upgrade. You declined.",
    "I scanned your strategy. It was... suboptimal.",
    "Even your technology couldn't save you from mine.",
  ],
  "Laser Turret": [
    "Target acquired. Target eliminated. Next.",
    "You walked into a targeting matrix with a sword. Bold. Foolish.",
    "My beams found every gap in your defense. There were many.",
    "Orbital strike confirmed. No survivors detected.",
  ],
  "Behemoth": [
    "I barely noticed your party. You were beneath my feet.",
    "Colossal? Yes. Merciful? No.",
    "Your heroes were insects. I am the boot.",
    "Even your strongest was but a snack.",
  ],
  "Cyclops": [
    "One eye was all I needed to see your doom.",
    "My gaze alone could crush your courage. My club finished the rest.",
    "You should have brought a bigger stick.",
    "I see your party's future. It's underground.",
  ],
  "Dragon": [
    "I am ancient. Your party was... a brief interruption.",
    "Dragons do not die. Heroes do. Frequently.",
    "I burned your hopes and hoarded your gold. Both are mine now.",
    "You woke the dragon. The dragon thanked you with fire.",
  ],
  "Titan": [
    "I am unyielding. You were... yielding.",
    "The earth shook when I walked. Your heroes trembled when I spoke.",
    "A titan does not fall to mortals. It falls to legends. You were neither.",
    "I gripped your party and squeezed. What remained was unimpressive.",
  ],
  "Vyridian, the Astril Conductor": [
    "You were measured. You were found wanting.",
    "The judgment was not cruel. It was exact.",
    "Three trials, three chances. The balance did not hold.",
    "I am the Astril Conductor. Imbalance does not pass.",
    "The Astrilith will remember your ascent. That is more than most receive.",
    "Return when your resonance is steadier. The summit will wait.",
  ],
};

// Legacy alias — saves created before the Astrizda canon migration
MONSTER_TAUNTS["Apexus, the Astral Overlord"] = MONSTER_TAUNTS["Vyridian, the Astril Conductor"];

const GENERIC_TAUNTS = [
  "Your party has fallen. The Astrilith claims another group of adventurers.",
  "The Astrilith stands unclimbed. As it always has. As it always will.",
  "You climbed toward the heavens. The heavens pushed back.",
  "Another party. Another echo added to the Astrilith's memory.",
];

export function getMonsterTaunt(monsterName?: string): string {
  if (monsterName && MONSTER_TAUNTS[monsterName]) {
    const taunts = MONSTER_TAUNTS[monsterName];
    return taunts[Math.floor(Math.random() * taunts.length)];
  }
  return GENERIC_TAUNTS[Math.floor(Math.random() * GENERIC_TAUNTS.length)];
}
