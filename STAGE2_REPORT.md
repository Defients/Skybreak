# Skybreak Revival — Stage 2 implementation and evidence

Date: **2026-10-07, America/New_York**. Klÿz working-tree delivery for Deffy.

## A. Baseline and Stage 1 dependencies

Starting HEAD: `a2044d48358913c5eb49fa4719815ac4c12e4537`. The starting tree already contained Stage 1 edits to save discovery/validation/hydration, RNG recovery, capsules, AI random legality, Continue and save UI, and their tests. Those changes were retained; this delivery does not attribute them to Stage 2. No commit, push or deployment was performed.

The initial baseline was **811 passing tests in 25 files**, rather than the older 760/24 figures in AGENTS.md. Initial Stage 2 reproduction fixtures exposed 26 failing behaviors. Verification uses local Windows/PowerShell, Node **22.14.0**, npm **10.9.2**, Vite **5.4.21**, Vitest **2.1.9**/jsdom and real Chromium through Playwright **1.64.0** on `127.0.0.1:4173`. Browser fixtures explicitly use seeded or controlled saved states; they are not player session recordings.

## B. Implementation inventory

| Area | Original problem / root cause | Correction | Evidence |
|---|---|---|---|
| Lifecycle | Stale commands repeated room effects, or started the wrong room/phase | Store phase/current-room guards; idempotent room marking and terminal resolution; persisted rest entry | `stage2Playability.test.ts`; browser merchant/rest/combat progression |
| Finalization | Final boss missing from room score; defeat with survivors advanced; report falsely claimed a wipe | Mark before score; consume canonical defeat result even when heroes survive; report the recorded deadline reason | Four controlled 32-room campaigns, terminal fixtures and Nightmare survivor report browser regression |
| Combat | Shields/logged damage diverged; summon IDs reached wrong entity | Resolve actual shield damage; immutable enemy updates; explicit summon damage/token branches and UI target selector | Seven focused damage tests; physical summon browser test |
| Items | Speed did not grant action; Power double-counted; Rune flag unused; Smoke matched Bomb | One extra action, one +3 bonus, actual specialization flag, canonical tags/current encounter retreat | Item regressions; all 12 item branch fixtures |
| Merchant | Display price differed from charge; invalid targets consumed gold; stock and tier bypasses | Shared pricing; validate before debit; stock/quantity/tier/Joker/dead-hero guards; tax affordability | Merchant suites; browser 30g debit/inventory check |
| Inventory | No recovery for excess inventory or shared item use | Merchant give/share/confirmed discard, capacity/stack checks before leave; shared consumables in engine/dropdown | Inventory/shared-potion tests and recovery browser fixture |
| RNG / welcome | Setup shuffled after serialized seed snapshot; interactive rewards used unrelated randomness | Save post-shuffle stream; persist welcome dice/automatic choices; batch parity; seed-based party suggestions | Existing RNG/parity/save suites; welcome cache/parity fixtures |
| Automation | Later monster turns stalled; off-screen simulation continued; AI proposed failed buys | Canonical monster stepping; pause on reference/home screens; reject illegal/unaffordable planned purchases | Simulation/wiki pause browser test; AI integration fixtures |
| Physical / hybrid | Physical die could satisfy Freeze instead of action; auto hero control conflicted | Label action override, validated cards/dice, clear queues, cancel stale timers, pause hybrid automation, disclose secondary seeded RNG | Physical RNG and browser checks across companion/hybrid/sandbox |
| Reports | Bounded event log erased MVP damage; setup history lost | Incremental optional damage aggregates, legacy retained-log fallback, preserve setup events | 550-event MVP regression; existing report/score tests |
| Assets | ID helpers missed authored filename aliases; Guardian selected enchantment art | Canonical ID-to-authored-name mapping; strict unknown-ID result; category-qualified class portraits | Content tests and HTTP 200 image checks |
| UX / accessibility | Loading placeholders falsely passed layout checks; narrow physical controls; transparent canvas exposed white below fixed backgrounds; keyboard escape/focus/navigation gaps | View-ready and scrolled screenshots, dark canvas fallback, mobile control layout, header width, reference Back controls, dialog focus trap/restore, reduced motion, visible focus, portal explanations | Responsive, save keyboard, reference navigation and mode browser checks |

New files include inventory engine/UI, dialog focus hook, four Stage 2 unit test files, Playwright config/spec, and the coverage/screenshot artifacts. Playwright is the only added dependency; the npm lockfile is updated. Unit tests exclude browser specs.

## C. Gameplay coverage matrix

The complete named inventory is in [`artifacts/stage2/content-coverage.json`](artifacts/stage2/content-coverage.json). The statuses below describe executed behavior, not just source enumeration.

| Content / mode | Status | Verification boundary |
|---|---|---|
| Bladedancer: Shadowblade, Runeblade | Partially verified | Both specialization activations and natural action results 1–6 execute; every passive/choice interaction is not certified |
| Manipulator: Timebender, Illusionist | Partially verified | Same activation/action fixtures; Reality Anchor reroll is missing |
| Tracker: Huntmaster, Beastcaller | Partially verified | Same activation/action fixtures; authored Wolf 7/Bear 5 retained; split Rapid Fire target choice missing |
| Guardian: Sentinel, Warden | Partially verified | Same activation/action fixtures; Rune/one-turn immunity regressions; correct class portrait |
| All 21 monsters | Partially verified | Six action rolls per monster, canonical IDs and served art; selected shields/reflection/phase/terminal regressions. Exhaustive status/passive combinations unverified |
| All 32 weapons | Partially verified | Canonical ID/asset and matching-class equip/action smoke. Swift Blade and Reality Anchor reroll paths remain blocked |
| All 12 items | Fixed and verified / blocked | Each use branch executes or rejects as documented; Lucky Charm blocked without debit/consumption. Selected effects have exact regressions |
| Four permanent upgrades / six healing services | Partially verified | Purchase/use eligibility and selected cap/cost/dead-target regressions; every combination is not certified |
| Weapon services / enchantments | Partially verified | Existing tests plus price/legality inspection; full passive parity unverified; Swift reroll missing |
| 32 authored rooms, 10/12/10 | Fixed and verified | All visited in controlled store campaigns on each difficulty; two tier transitions and single finalization. Controlled 1000-damage hits isolate progression, not natural play |
| Easy / Normal / Hard / Nightmare | Partially verified | All controlled campaigns, selected difficulty constraints and one natural simulation each; Nightmare turn scope still ambiguous |
| Home/setup/welcome/exploration/combat/merchant/rest/tier/victory/defeat | Fixed and verified for tested flows | Real browser partial ascent, saved-state boundary interactions and controlled engine campaign lifecycle |
| Playable | Fixed and verified for tested flows | Human controls through setup, seeded welcome, merchant, combat item/actions, return/resume; a complete natural human-played 32-room ascent is unverified |
| Companion / Hybrid / Sandbox | Partially verified | Browser combat controls/manual physical input; hybrid automation pause; all long-run mode interactions unverified |
| Simulation | Fixed and verified for tested flows | Later monster turn, reference pause, four deterministic natural outcomes and existing parity suites |
| Batch / Strategy Lab | Partially verified | Browser configuration/navigation and existing engine tests; no Stage 3 statistical certification or infrastructure overhaul |
| Physical table bridge | Partially verified, disclosed | Two Peon cards plus first action die tested; remaining physical deck/APC/environment/secondary input unsupported |

Natural smoke evidence uses a fixed Bladedancer/Manipulator/Guardian party, balanced combat/merchant policy, full-heal rest, safe split, conservative items and when-affordable upgrades:

| Difficulty | Seed | Observed outcome | Rooms | Turns |
|---|---|---|---:|---:|
| Easy | `stage2-natural-easy` | Victory | 32 | 27 |
| Normal | `stage2-natural-normal` | Defeat | 31 | 62 |
| Hard | `stage2-natural-hard` | Defeat | 13 | 24 |
| Nightmare | `stage2-natural-nightmare` | Defeat | 5 | 16 |

These four observations do not establish balance or win rates. New-game RNG alignment and repaired mechanics make older seed/outcome baselines stale; already-serialized saves still resume their stored stream.

## D. Screen-by-screen examination

| Screen | Examined / improved | What remains | Browser / visual evidence |
|---|---|---|---|
| Home and setup | Continue, seeded party selection, 320px tagline overflow, dialog accessibility | Legacy logo embeds Skyward Ascent text; no new artwork produced | Home/setup at 320, 390, 768, 1280, 1920 |
| Welcome | Canonical cached dice/rewards, deterministic automatic choice, honest no-penalty Skip | Animation RNG is cosmetic; manual versus automatic choices can intentionally differ | Human setup/Skip/welcome capture; engine resume/parity |
| Dashboard / exploration | Valid room transitions/rest entry; shared saved state | Split path combinations not all browser-played | Partial ascent plus controlled engine rooms |
| Combat | Actual resolved effects, shared items, summon target, explicit physical scope, error alert | Selected rerolls and split-hit targeting incomplete; exhaustive passive combinations unverified | Five widths, mode controls, item victory, physical and summon tests |
| Merchant | Shared charged prices, stock, valid targets, inventory recovery, actual taxed affordability, readable badges and visible unavailable-reroll labels | 25% sale missing; scaling decision open; Lucky Charm/Swift purchase blocked without debit | Purchase/debit; inventory recovery; 320/390/768 captures |
| Rest | Persisted entry, legal single room advance, Hard revive disabled | Existing engine Hard keyboard fallback remains full-heal; not a revival | Full Heal interaction and narrow captures |
| Tier transition | Confirmation required, phase-authoritative navigation | All themed text/art not individually certified | Controlled Tier 2 fixture at desktop/narrow widths |
| Victory / defeat report | Final room score, MVP aggregates, New Run reset; actual deadline reason for losses with survivors | Legacy pruned events cannot be recovered; outcome captures are controlled fixtures | Both report/reset flows, Nightmare survivor reason and narrow layouts |
| Save manager | Stage 1 discovery/hydration retained; modal keyboard focus/restore | Browser malformed import/export coverage remains narrower than unit boundary suite | Twelve Tabs remain in dialog; Escape restores opener; Continue resume |
| Wiki | Opens/returns; off-screen simulation pauses | Full wiki article/layout audit not certified | Navigation/capture and timer pause test |
| Rules Reference | Search label, responsive sidebar/detail grid, working Back control | Text retains unresolved intended rules, documented in ledger | Search/detail and return at 320/768/1280 |
| Debug | Working Back; long state values wrap | Manual-override UI not exhaustively browser-tested | Inspector/return at 320/768/1280 |
| Batch / Strategy Lab | Existing navigation/configuration checked | Result charts, downloads and large experiment runs outside browser smoke | Both configuration screens open/return/captured |

Screenshots are viewport/full-page captures, not proof of every internal scroll position. Browser tests click controls below the initial viewport. Images are verified separately through canonical manifest HTTP requests. Firefox, WebKit, assistive-technology sessions and a production deployment are **NOT RUN**.

## E. Rules parity and design boundaries

See [`RULES_AUTHORITY.md`](RULES_AUTHORITY.md), sections 5–6, for each correction and unresolved authority decision. Engine changes retain existing balance tables and provisional rulings. No new classes, monsters, art, campaign generation, network service or combat engine was added.

Confirmed repairs include final-room score/defeat semantics, persistent Easy HP, Speed/+3 Scroll/Rune effects, Smoke versus Bomb tags, target/shield/log consistency, merchant eligibility/pricing, and physical injection scope.

Unresolved decisions: compound merchant scaling; Nightmare encounter versus campaign turn budget; summit stalemate retry versus defeat; reroll eligibility/commit timing; resale valuation. A second Rapid Fire target choice is missing. These prevent a blanket rules-parity claim.

## F. Verification commands and results

| Command / gate | Final result | Evidence |
|---|---|---|
| `npm ci` | PASS, exit 0 | 288 installed packages; `artifacts/stage2/logs/stage2-install.log` |
| `npm test` | PASS, **1,169 tests / 29 files**, 34.24s, exit 0 | `artifacts/stage2/logs/stage2-final-tests.log` |
| New Stage 2 tests | PASS, **358 tests / four files** | 27 playability + 304 content + 7 damage + 20 integration |
| `npx tsc -b --noEmit` | PASS, exit 0 | Empty successful typecheck output; recorded in verification JSON |
| `npm run build` | PASS, exit 0; Vite compilation 11.22s | `artifacts/stage2/logs/stage2-build.log`; production `dist/` generated |
| `npm run test:e2e` | PASS, **29 / 29 Chromium scenarios**, 2.5min, exit 0 | `artifacts/stage2/logs/stage2-browser-tests.log` |
| Focused merchant rerun | PASS, 6 / 6 before final full browser suite | `npx playwright test --grep=merchant`; final full suite includes those scenarios |
| Canonical content/art registry | PASS for registration and served mapped images | Browser manifest plus 304 content tests; effect-level status remains partial |
| Campaign progression | PASS for four controlled 32-room campaigns | `stage2Integration.test.ts`; not a natural human campaign |
| Deterministic natural smoke | PASS for four lawful terminal runs | Outcomes/seeds above and unit log; no statistical balance claim |
| `git diff --check` | PASS, exit 0 | No whitespace errors; Git emits informational LF/CRLF conversion notices |
| Remote CI, deployment, Firefox/WebKit, actual assistive tech, full natural human campaign | NOT RUN | No substitute evidence claimed |

Final browser evidence contains **51 screenshots**, including actual scrolled mobile controls. Executable source/configuration SHA-256 digests and a machine-readable result summary are in `artifacts/stage2/source-hashes.json` and `artifacts/stage2/verification.json`. All final checks completed against the delivered runtime/test code; only evidence documents were updated afterward.

The repository has no lint script. npm install reports the existing **18 audit vulnerabilities (6 moderate, 10 high, 2 critical)**; no breaking dependency remediation was folded into the gameplay delivery. A prior full test run exposed the cancellation regression's 5-second timeout and unused fixed configuration. That test now actually applies its seeded 100-run config, asserts cancellation/finished state, and permits 30 seconds for the synchronous first run under jsdom load.

## G. Remaining backlog

| Category | Item | Precise boundary / next action |
|---|---|---|
| Confirmed high-priority defect, disclosed / partly mitigated | Swift / Swift Blade / Reality Anchor selected rerolls | No complete roll-choice-commit transaction; flags/registration do not implement the advertised effects. Swift purchase is blocked without debit; weapon cards state their unavailable reroll effect |
| Confirmed high-priority gap, mitigated | Lucky Charm | Purchase/use blocked without spending or consuming; still incomplete advertised content |
| Confirmed lower-priority defect | Rapid Fire split targeting | One target selector cannot assign the second hit independently |
| Confirmed lower-priority gap | 25% item resale | No canonical valuation/history or sale transaction; give/share/discard work |
| Confirmed cosmetic limitation | Embedded legacy logo and anonymous specialization art | Need reviewed existing asset mapping/text decision; new art excluded |
| Suspected/unverified | Remaining weapon/enchantment/status interactions | Smoke execution is not mathematical certification; targeted effect expectations still needed |
| Intentional partial support | Physical bridge secondary inputs / decks / APC / environment | Current UI states seeded remainder; full table authority is unsupported |
| Verification unavailable/not run | Other browser engines, actual assistive tech, remote CI/deployment, complete natural human campaign | Local evidence does not substitute for these checks |
| Deferred enhancement | Workers, Monte Carlo/balance/experiment persistence | Explicit Stage 3 scope; no redesign included |

No P0 blocker was observed in the verified lifecycle paths. This is not a claim that all untested content has no P0 defect.

## H. Next-stage readiness

**Conditional readiness for Stage 3 infrastructure work; Stage 2 full rules parity remains incomplete.** The repaired progression, seeded saves and representative human controls supply a useful baseline. Balance conclusions and a certified complete playable release must wait for reroll/resale/targeting decisions and the remaining effect-level coverage. The evidence distinguishes a controlled campaign, a natural automated run and browser interactions throughout.
