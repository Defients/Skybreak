# Skybreak — Rules Authority Ledger

**Purpose:** Distinguish *implemented mechanics* from *intended rules*, *provisional
rulings*, and *future canon proposals*. Each entry records where the authority
currently lives, what the engine actually does, and what the player-facing text
claims, so that a future change is a deliberate decision rather than a silent
drift.

**Status legend:**
- **implemented** — the engine behaves this way and it is the current authority.
- **intended** — a rules document states this; engine may or may not match.
- **discrepancy** — implemented and intended/text diverge; a decision is required.
- **provisional** — a ruling made to resolve an ambiguity, not yet canon.
- **obsolete** — superseded; retained for history.

Baseline pinned at HEAD `80540bc94bc621f014accbaddbe318b7fac7523f`
(715 tests / 23 files; +13 Megaplan Phase 0 fixtures = 728 / 24).

---

## 1. Pet HP — Wolf (Huntmaster specialization)

| Aspect | Value | Source | Status |
|---|---|---|---|
| Engine summon HP | `currentHp: 7, maxHp: 7` | `src/engine/heroAbilityEngine.ts:1159-1160` | implemented |
| Class description | "Wolf has 7 HP, Bear has 5 HP" | `src/data/classes.ts:93` | implemented (resolved) |
| Bear (Beastcaller) engine HP | `currentHp: 5, maxHp: 5` | `src/engine/heroAbilityEngine.ts:1173-1174` | implemented |
| Strategy guide | "Wolf pet (7 HP)", "Bear pet (5 HP)" | `src/data/strategyGuide.ts:229-230,239` | implemented (resolved) |

**Decision (resolved):** The Wolf's 7 HP is an **intentional balance choice**.
The Wolf is the higher-damage/self-healing pet (Bite 2/3/4 + Alpha Strike heals
Tracker 2 HP), while the Bear has 5 HP + shield support + Focus buff. The 7 HP
offsets the Bear's defensive utility. The engine value (7 HP) was kept as the
authority; the class description and strategy guide were updated to match.
Resolved in Phase 3 commit.

---

## 2. Difficulty — setup UI descriptions vs implementation

The **rules documents** (`src/data/rulesIndex.ts:162`,
`src/data/strategyGuide.ts:810-813`) and the **engine** agree. The **HomeScreen
setup descriptions** (`src/components/screens/HomeScreen.tsx:44-48`) diverge.

### Easy

| Claim | HomeScreen text | Engine | Status |
|---|---|---|---|
| Starting gold | (not in setup desc) | 150 (`gameState.ts:143`) | implemented |
| Hero HP | (not in setup desc) | +2 max HP (`gameState.ts:86`) | implemented |
| Monster HP | "reduced HP" | −2 HP (`rulesEngine.ts:282`) | implemented ✓ |
| Monster damage | "deal less damage" | **no easy damage reduction** anywhere | **discrepancy** |
| Revival cost | (not in setup desc) | −50% (`merchantEngine.ts:148`) | implemented |

**Discrepancy:** HomeScreen tells players Easy enemies "deal less damage," but
the engine applies no easy damage modifier (`applyDifficultyToMonsterRoll` only
adjusts `hard`; `monsterAbilityEngine` only adjusts `hard`/`nightmare`).

### Normal

| Claim | Engine | Status |
|---|---|---|
| "full stats as written in the ruleset" | no modifiers | implemented ✓ |

### Hard

| Claim | HomeScreen text | Engine | Status |
|---|---|---|---|
| Starting gold | (not in setup desc) | 80 (`gameState.ts:145`) | implemented |
| Monster HP | "+20% HP" | **no hard HP branch** in `applyDifficultyToMonsterHp` | **discrepancy** |
| Monster damage | "+1 damage" | +1 to rolls (`rulesEngine.ts:290`, `monsterAbilityEngine.ts:308`) | implemented ✓ (roll bonus, not flat damage) |
| Elite frequency | "Elite rooms are more frequent" | **no elite-frequency adjustment by difficulty** | **discrepancy** |
| Permanent death | (not in setup desc) | enforced (`progressionEngine.ts:31`, `merchantEngine.ts:577`) | implemented |

**Discrepancies:** HomeScreen claims Hard grants "+20% HP" and more frequent
Elite rooms; neither is implemented. The rules document instead says "monsters
+1 to rolls, permanent death," which matches the engine.

### Nightmare

| Claim | HomeScreen text | Engine | Status |
|---|---|---|---|
| Starting gold | (not in setup desc) | 40 (`gameState.ts:146`) | implemented |
| Monster HP | "+40% HP" | `baseHp + 3*3 (effectiveTier) + 2*tier` (`rulesEngine.ts:280`, `combatEngine.ts:68`) | **discrepancy** (flat+tier, not +40%) |
| Monster damage | "+2 damage" | +1 to rolls (`monsterAbilityEngine.ts:309`), +2 in some paths (`:330`) | partial (roll bonus, context-dependent) |
| Tactical AI | "act with tactical AI" | nightmare target selection (`monsterAbilityEngine.ts:348,577`) | implemented ✓ |
| Item cost | (not in setup desc) | +50% (`merchantEngine.ts:91`) | implemented |
| Gold on death | (not in setup desc) | −25% (`combatEngine.ts:885-886`) | implemented |
| Turn limit | (not in setup desc) | 40 turns vs final boss (`combatEngine.ts:1089`) | implemented |

**Discrepancy:** HomeScreen describes Nightmare monster HP as "+40%"; the engine
uses a flat `+3*effectiveTier + 2*tier` formula. The rules document says "monster
tier bonuses," which is the accurate description.

### Decision (resolved)

The **rules documents are the correct authority** for difficulty formulas.
**Option 1 was chosen**: the HomeScreen `DIFFICULTY_INFO` blurbs were rewritten
to match the rules-document descriptions (`rulesIndex.ts:162`,
`strategyGuide.ts:810-813`). No engine balance changes were made. Resolved in
Phase 3 commit.

---

## 3. Authority sources (current)

| Domain | Authority | Location |
|---|---|---|
| Combat math, APC, matches, dice | Engine (implemented) | `src/engine/` |
| Room sequence 10/12/10 | Engine + `src/data/rooms.ts` (implemented) | do not randomize by default |
| Difficulty formulas | Rules documents (`rulesIndex`, `strategyGuide`) ≈ engine | `src/data/` |
| Difficulty setup blurbs | HomeScreen (resolved — matches rules docs) | `src/components/screens/HomeScreen.tsx` |
| Pet HP | Wolf = 7 HP, Bear = 5 HP (resolved — docs match engine) | `src/data/classes.ts`, `src/engine/heroAbilityEngine.ts` |
| Canon / setting | `Skybreak-Canon_Bible.md` | project root |
| Card game rules | `Skybreak-CardGame-Rules.md`, `Skybreak-OfficialRules.md` | project root |

---

## 4. How to use this ledger

- Before any mechanic edit, check whether the affected value appears here. If it
  does, record the decision in the relevant section first.
- A balance change and an infrastructure change must not share a PR.
- When a discrepancy is resolved, update the row to **implemented** and note the
  resolving commit; keep the historical row (do not delete) so past runs remain
  interpretable.
- New discrepancies found during the Megaplan work should be appended as new
  numbered sections, not edited into existing ones.

## 5. Stage 2 corrections — 2026-10-07 (America/New_York)

Scope: the dirty Stage 1 working tree on `a2044d48358913c5eb49fa4719815ac4c12e4537`.
These entries describe working-tree changes; no resolving commit is claimed.

| Discrepancy | Authority and correction | Evidence | Status |
|---|---|---|---|
| Final boss omitted from rooms/score | Authored 10/12/10 sequence and existing scoring formula: resolve the last room before scoring; repeated resolution cannot grant more rewards | `stage2Playability`, four controlled campaigns in `stage2Integration` | implemented |
| Nightmare defeat with surviving heroes advanced instead of ending | Canonical `checkCombatEnd` defeat must reach the campaign report regardless of surviving HP | `stage2Playability` | implemented |
| Easy +2 HP disappeared during cleanup | Existing Easy starting bonus is persistent base HP, not a temporary combat buff | `stage2Playability` | implemented |
| Speed Potion consumed without an extra action | `ITEMS["Speed Potion"].effect`: one additional hero action, consumed by turn completion | `stage2Playability` | implemented |
| Power Scroll double-counted bonus | `ITEMS["Power Scroll"].effect`: exactly +3 next attack, once | `stage2Damage` | implemented |
| Mystic Rune wrote an unused specialization flag | Existing specialization handlers own `spec_<class>_<specialization>`; the item activates that path | eight specialization fixtures in `stage2Content` | implemented |
| Smoke Bomb inherited Bomb damage via substring matching | Canonical item IDs/tags take precedence; Smoke Bomb ends the current non-final encounter as retreat, without rewards | `stage2Integration` | implemented |
| Damage and target logs disagreed after shields | Consume shields and report resolved damage; summon IDs address summons; main monster is not an alias for every enemy | `stage2Damage`, summon browser fixture | implemented |
| Merchant labels omitted charged multipliers | `getMerchantPrice` now supplies transaction and display prices; floor/discount order preserved | pricing regressions and browser purchase/debit check | implemented |
| Dead/full/invalid targets could be charged for healing | Validate eligibility before debit; Hard permanent death remains authoritative | `stage2Playability`, `stage2Content` | implemented |
| Joker Major Potion purchasable for zero; higher weapons accessible too early | Joker remains deck loot; tier weapon availability enforced by transactions | `stage2Playability` | implemented |
| Shared storage and over-capacity recovery lacked usable controls | Three hero slots plus Extra Pocket; two shared slots; retain canonical per-hero quantity limits; move existing consumable instances or confirm discard before leaving | inventory integration/browser fixtures | implemented |
| Physical action die used by an earlier Freeze/escape check | Label first action override; secondary checks remain seeded; reject duplicate/invalid Peon cards and invalid d6 values | RNG/playability and physical browser fixtures | implemented |
| New-game and interactive welcome RNG diverged from batch | Serialize after setup shuffles; cache dice/automatic weapon choices; use canonical seeded rewards and no invented skip penalty | RNG suites and welcome cache/parity integration fixtures | implemented |

## 6. Decisions still required / implementation gaps

| Topic | Observed implementation | Required decision or missing seam | Status |
|---|---|---|---|
| Merchant scaling | Explicit tier tables are multiplied again by accumulated tier-transition prices. `ruleAmbiguities.ts` prefers tables, while `rulesIndex.ts` also describes transition scaling | Decide whether both modifiers intentionally apply. Stage 2 preserves charged prices and makes labels truthful; no balance change | discrepancy |
| Nightmare 40 turns | `checkCombatEnd` applies the limit inside the final confrontation; rules index says reach and survive Vyridian in 40 turns | Confirm encounter budget versus campaign budget before changing difficulty | discrepancy |
| Final-boss stalemate retreat | There is no next room. Cleanup now leaves the unwon summit available, preventing an empty resolved-room softlock; no reward/victory is granted | Confirm retry versus terminal loss. Current navigation recovery is a provisional ruling | provisional |
| Lucky Charm | Previously wrote `luckyCharmActive`, without a consumer or die-selection transaction | Define when a chosen die may be rerolled, including already-resolved effects. Purchase/use now reject with no debit/consumption | discrepancy / blocked |
| Swift, Swift Blade, Reality Anchor | Swift and Swift Blade availability flags have no UI consumer; Reality Anchor has registration/tag but no engine ability consumer. Swift purchase now rejects without debit; merchant labels disclose unavailable weapon rerolls | Implement an explicit roll/choice/commit boundary; settle reroll eligibility and repeated ones. Full weapon/enchantment parity is incomplete | discrepancy / blocked |
| Item sale for 25% | Rules index advertises sales; engine/UI have no sale operation and item instances have no purchase-price history | Define 25% of which price (paid, current tier, base, loot) and rounding/stack rules. Transfer/discard is implemented; sale is not | intended / blocked |
| Rapid Fire split hits | Existing provisional ruling allows split targets; current hero action has one target | A second-hit target choice is missing; do not claim all ability targeting certified | discrepancy |
| Physical tabletop scope | Only two Peon cards and the first action die are entered; secondary dice, decks, APC/environment setup, pets and extra actions remain seeded | UI explicitly states this scope. Complete physical deck control is outside the shipped bridge | implemented partial support |
| Specialization art | Eight specialization files lack authoritative names/mappings; class portrait fallback is available | Reviewed asset mapping needed; anonymous art is not assigned by guess | unresolved |
| Historical MVP data | New aggregate damage survives bounded logs; an old save's already-pruned events cannot be reconstructed | Existing retained events are the only legacy evidence; no invented totals | partial legacy support |

Full rules parity is **not certified** by the Stage 2 smoke tests. See
`STAGE2_REPORT.md` for the final verification boundary and content inventory.
