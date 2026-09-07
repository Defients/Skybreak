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
| Class description | "Pets have 5 HP" | `src/data/classes.ts:93` | intended |
| Bear (Beastcaller) engine HP | `currentHp: 5, maxHp: 5` | `src/engine/heroAbilityEngine.ts:1173-1174` | implemented (matches 5 HP rule) |

**Discrepancy:** The Wolf is summoned with **7 HP** in the engine, while the
class description and the general pet rule state pets have **5 HP**. The Bear
(Tracker's red specialization) correctly uses 5 HP. This is an asymmetric
inconsistency: either the Wolf is intentionally tougher (and the rule text is
wrong), or the Wolf HP is a bug (and the engine should say 5).

**Decision required:** Is the Wolf's 7 HP an intentional balance choice or a bug?
- If intentional → update `classes.ts` and the rulebooks to state Wolf = 7 HP
  (and document why the Wolf is the exception to the 5 HP pet rule).
- If a bug → change `heroAbilityEngine.ts:1159-1160` to `5`.
Either way, the fix is a single documented edit; do **not** mix it into an
infrastructure PR. Record the decision here before changing code.

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

### Decision required (difficulty)

The **rules documents are the correct authority** for difficulty formulas; the
**HomeScreen `DIFFICULTY_INFO` blurbs are stale/aspirational marketing text**.
Two options:

1. **Fix the text to match the engine** (recommended, low risk): rewrite
   `HomeScreen.tsx:44-48` `DIFFICULTY_INFO` to mirror the rules-document
   descriptions. No engine change.
2. **Implement the claimed mechanics** (high risk, balance-impacting): add easy
   damage reduction, hard +20% HP, hard elite-frequency scaling, nightmare +40%
   HP. This changes balance and seeded outcomes and must be versioned.

Do **not** do option 2 inside the reliability work. If pursued, it is a separate
balance decision with its own reproduction-version boundary.

---

## 3. Authority sources (current)

| Domain | Authority | Location |
|---|---|---|
| Combat math, APC, matches, dice | Engine (implemented) | `src/engine/` |
| Room sequence 10/12/10 | Engine + `src/data/rooms.ts` (implemented) | do not randomize by default |
| Difficulty formulas | Rules documents (`rulesIndex`, `strategyGuide`) ≈ engine | `src/data/` |
| Difficulty setup blurbs | HomeScreen (DIVERGENT — see §2) | `src/components/screens/HomeScreen.tsx` |
| Pet HP | Class description says 5 HP; engine Wolf = 7 (DIVERGENT — see §1) | `src/data/classes.ts`, `src/engine/heroAbilityEngine.ts` |
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
