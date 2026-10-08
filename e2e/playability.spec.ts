import { test, expect, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

type Scenario = "combat" | "merchant" | "rest" | "tier" | "victory" | "defeat" | "physical";
async function installScenario(page: Page, scenario: Scenario, mode: "playable" | "companion" | "hybrid" | "sandbox" | "simulation" = "playable") {
  await page.evaluate(async ({ scenario, mode }) => {
    const { useGameStore } = await import("/src/app/gameStore.ts");
    const { startCombat } = await import("/src/engine/combatEngine.ts");
    const { createRoomsForTier } = await import("/src/data/rooms.ts");
    const { autosave } = await import("/src/engine/saveLoad.ts");
    const { calculateScore } = await import("/src/engine/progressionEngine.ts");
    useGameStore.getState().startNewRun({ seed: "stage2-browser", difficulty: "normal", mode, rngMode: scenario === "physical" ? "physical" : "seeded" }, [
      { className: "Bladedancer", suit: "spades", position: 1 },
      { className: "Manipulator", suit: "hearts", position: 2 },
      { className: "Guardian", suit: "clubs", position: 3 },
    ]);
    let state = useGameStore.getState().state!;
    const rng = useGameStore.getState().rng!;
    state = { ...state, welcomeBonusPending: false, phase: "exploration" };
    if (scenario === "merchant") { state.party.gold = 1000; state.party.heroes[0].items = []; }
    if (scenario === "rest") { state.spire.roomIndex = 3; state.spire.currentRoom = state.spire.rooms[3]; state.party.heroes[0].currentHp = 1; }
    if (scenario === "tier") { state.spire.tier = 2; state.spire.rooms = createRoomsForTier(2); state.spire.roomIndex = 0; state.spire.currentRoom = state.spire.rooms[0]; state.phase = "tier_transition"; }
    if (scenario === "combat" || scenario === "physical") {
      state.spire.roomIndex = 1; state.spire.currentRoom = state.spire.rooms[1];
      state = startCombat(state, rng, { forcedMonsterId: 1 });
      state.combat!.activeSide = "heroes";
      state.combat!.monster.currentHp = scenario === "combat" ? 3 : 30;
      state.combat!.monster.maxHp = 30;
      state.party.heroes[0].items = [{ id: "test-bomb", itemId: "bomb", name: "Bomb", quantity: 1, stackLimit: 2, effect: "Deal 5 damage to all enemies", tags: ["bomb"] }];
    }
    state.rng = rng.serialize(); autosave(state);
  }, { scenario, mode });
  await page.reload();
  await page.getByRole("button", { name: /Continue Run/i }).click();
  if (scenario === "victory" || scenario === "defeat") await page.evaluate(async outcome => {
    const { useGameStore } = await import("/src/app/gameStore.ts");
    const { calculateScore } = await import("/src/engine/progressionEngine.ts");
    const state = useGameStore.getState().state!;
    useGameStore.setState({ state: { ...state, phase: outcome, party: outcome === "defeat" ? { ...state.party, heroes: state.party.heroes.map(h => ({ ...h, alive: false, currentHp: 0 })) } : state.party, score: outcome === "victory" ? calculateScore(state) : undefined } });
  }, scenario);
}
async function stateValue(page: Page) {
  return page.evaluate(async () => (await import("/src/app/gameStore.ts")).useGameStore.getState().state);
}
async function screenshot(page: Page, name: string) {
  // Wait for the intended lazy view, so loading placeholders cannot pass layout checks.
  if (name.startsWith("merchant")) await expect(page.getByRole("heading", { name: "♦️ Merchant", exact: true })).toBeVisible();
  else if (name.startsWith("rest")) await expect(page.getByRole("heading", { name: "Sanctuary Landing", exact: true })).toBeVisible();
  else if (name.startsWith("tier")) await expect(page.getByRole("heading", { name: "Tier 2", exact: true })).toBeVisible();
  else if (name.startsWith("victory") || name.startsWith("defeat")) await expect(page.getByRole("heading", { name: name.startsWith("victory") ? "Victory!" : "Defeat", exact: true })).toBeVisible();
  else if (name.includes("combat") || name.startsWith("physical")) await expect(page.getByRole("checkbox", { name: "Physical table inputs" })).toBeVisible();
  else if (name === "batch-simulation") await expect(page.getByRole("heading", { name: "Batch Simulation", exact: true })).toBeVisible();
  else if (name === "strategy-lab") await expect(page.getByRole("heading", { name: "Strategy Lab", exact: true })).toBeVisible();
  else if (name === "open-game-wiki") await expect(page.getByRole("heading", { name: "📚 Game Wiki", exact: true })).toBeVisible();
  await expect(page.getByRole("status", { name: "Loading screen", exact: true })).toHaveCount(0);
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(img => img.decode().catch(() => undefined))); });
  await mkdir("artifacts/stage2/screenshots", { recursive: true });
  await page.screenshot({ path: `artifacts/stage2/screenshots/${name}.png`, fullPage: true });
}
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("skybreak_beta_dismissed", "1");
    localStorage.setItem("skybreak_strategy_hint_dismissed", "1");
  });
  await page.goto("/");
});

test("content manifest enumerates canonical IDs and serves every mapped image", async ({ page, request }) => {
  const manifest = await page.evaluate(async () => {
    const { MONSTERS } = await import("/src/data/monsters.ts");
    const { ALL_CLASSES, CLASS_DATA } = await import("/src/data/classes.ts");
    const { WEAPONS } = await import("/src/data/weapons.ts");
    const { ITEMS, PERMANENT_UPGRADES, HEALING_SERVICES, WEAPON_SERVICES } = await import("/src/data/items.ts");
    const { ENCHANTMENTS } = await import("/src/data/enchantments.ts");
    const { createRoomsForTier } = await import("/src/data/rooms.ts");
    const assets = await import("/src/assets/assetRegistry.ts");
    return {
      classes: ALL_CLASSES.map(name => ({ name, image: assets.getHeroPortrait(name), specializations: Object.values(CLASS_DATA[name].specializations).map(s => s.name), coverage: "partially verified: six natural action rolls per specialization; selected edge regressions" })),
      monsters: MONSTERS.map(m => ({ id: m.id, name: m.name, image: assets.getMonsterImageById(m.id), coverage: "partially verified: six natural action rolls; asset and registration verified" })),
      weapons: WEAPONS.map(w => ({ id: w.id, name: w.name, image: assets.getWeaponImageById(w.id), coverage: "partially verified: equip/action smoke; every passive interaction is not certified" })),
      items: Object.values(ITEMS).map(i => ({ id: i.itemId, name: i.name, image: assets.getItemImageById(i.itemId), coverage: i.itemId === "lucky_charm" ? "blocked: reroll selection unimplemented; use/purchase disabled without debit" : "fixed and verified: use smoke; focused item effect regressions" })),
      rooms: [1, 2, 3].flatMap(tier => createRoomsForTier(tier)),
      permanentUpgrades: Object.keys(PERMANENT_UPGRADES), healingServices: Object.keys(HEALING_SERVICES), weaponServices: Object.keys(WEAPON_SERVICES), enchantments: Object.keys(ENCHANTMENTS),
    };
  });
  for (const entries of [manifest.classes, manifest.monsters, manifest.weapons, manifest.items]) for (const entry of entries) expect(entry.image, entry.name).toBeTruthy();
  const urls = new Set([...manifest.classes, ...manifest.monsters, ...manifest.weapons, ...manifest.items].map(e => e.image!));
  for (const url of urls) { const response = await request.get(url); expect(response.status(), url).toBe(200); expect(response.headers()["content-type"], url).toContain("image/"); }
  await mkdir("artifacts/stage2", { recursive: true });
  await writeFile("artifacts/stage2/content-coverage.json", JSON.stringify(manifest, null, 2));
});

test("save dialog traps keyboard focus and returns focus after Escape", async ({ page }) => {
  await installScenario(page, "physical");
  const opener = page.getByRole("button", { name: "Open save manager", exact: true });
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "Save Manager", exact: true });
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 12; i++) { await page.keyboard.press("Tab"); expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true); }
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test("merchant inventory can recover an over-capacity save using shared storage", async ({ page }) => {
  await installScenario(page, "merchant");
  await page.evaluate(async () => {
    const { useGameStore } = await import("/src/app/gameStore.ts");
    const { ITEMS } = await import("/src/data/items.ts");
    const state = useGameStore.getState().state!;
    useGameStore.setState({ state: { ...state, party: { ...state.party, heroes: state.party.heroes.map((h, i) => i ? h : { ...h, items: ["Minor Potion", "Bomb", "Mystic Rune", "Shield Charm"].map((name, n) => ({ ...ITEMS[name], id: `over-${n}`, quantity: 1 })) }) } } });
  });
  await page.getByRole("button", { name: /Enter Room/i }).click();
  const moves = page.getByRole("combobox", { name: /Move Minor Potion from/i });
  await expect(moves).toHaveCount(1);
  await moves.first().selectOption("shared");
  const state = await stateValue(page);
  expect(state!.party.heroes[0].items).toHaveLength(3);
  expect(state!.party.sharedInventory[0].id).toBe("over-0");
  await screenshot(page, "inventory-recovery");
});

for (const mode of ["companion", "hybrid", "sandbox"] as const) test(`${mode}: combat controls stay reachable`, async ({ page }) => {
  await installScenario(page, "physical", mode);
  await expect(page.getByRole("button", { name: /Confirm Physical Inputs/i })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Use an item" })).toBeVisible();
  await screenshot(page, `${mode}-combat`);
  if (mode === "hybrid") await expect(page.getByText("Physical input pauses automatic hero control.", { exact: false })).toBeVisible();
});

test("simulation resumes a later monster turn and pauses when opening the wiki", async ({ page }) => {
  await installScenario(page, "physical");
  await page.evaluate(async () => {
    const { useGameStore } = await import("/src/app/gameStore.ts");
    const state = useGameStore.getState().state!;
    useGameStore.setState({ state: { ...state, settings: { ...state.settings, mode: "simulation", rngMode: "seeded" }, combat: { ...state.combat!, activeSide: "monster", turnCount: 2 } } });
  });
  await expect(page.getByText("Simulation Mode", { exact: true })).toBeVisible();
  await expect.poll(async () => (await stateValue(page))?.combat?.activeSide).toBe("heroes");
  await page.getByRole("button", { name: "Open game wiki", exact: true }).click();
  await expect(page.getByRole("heading", { name: "📚 Game Wiki", exact: true })).toBeVisible();
  const before = await stateValue(page);
  await page.waitForTimeout(1500); // Prove the repeating timer remains paused off-screen.
  expect((await stateValue(page))?.rng.step).toBe(before?.rng.step);
});

test("wiki, batch simulation and Strategy Lab open and return home", async ({ page }) => {
  for (const label of ["Open game wiki", "Batch Simulation", "Strategy Lab"]) {
    await page.getByRole("button", { name: new RegExp(label), exact: label === "Open game wiki" }).click();
    await screenshot(page, label.toLowerCase().replaceAll(" ", "-"));
    await page.getByRole("button", { name: /Back/i }).first().click();
    await expect(page.getByRole("button", { name: "New Run", exact: true })).toBeVisible();
  }
});

for (const width of [320, 390, 768]) test(`merchant, rest, tier and reports fit at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  for (const scenario of ["merchant", "rest", "tier", "victory", "defeat"] as const) {
    await page.goto("/");
    await installScenario(page, scenario);
    if (scenario === "merchant" || scenario === "rest") await page.getByRole("button", { name: /Enter Room/i }).click();
    await screenshot(page, `${scenario}-${width}`);
    if (scenario === "merchant" && width === 320) {
      await page.getByRole("heading", { name: "🧪 Consumable Items", exact: true }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: "artifacts/stage2/screenshots/merchant-scrolled-320.png" });
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(overflow, `${scenario} at ${width}px`).toBeLessThanOrEqual(1);
  }
});

for (const width of [320, 768, 1280]) test(`rules search and state inspector return to combat at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await installScenario(page, "physical");
  for (const label of ["Open rules reference", "Open debug screen"]) {
    if (width < 640) await page.getByRole("button", { name: "More options", exact: true }).click();
    await page.getByRole("button", { name: label, exact: true }).click();
    await expect(page.getByRole("heading", { name: label.includes("rules") ? "📖 Rules Reference" : "🔍 Debug / State Inspector", exact: true })).toBeVisible();
    if (label.includes("rules")) {
      await page.getByRole("textbox", { name: "Search rules", exact: true }).fill("merchant");
      await page.getByRole("button", { name: /Merchant and Inventory/ }).click();
      await expect(page.getByRole("heading", { name: "Merchant and Inventory", exact: true })).toBeVisible();
    }
    await screenshot(page, `${label.includes("rules") ? "rules" : "debug"}-${width}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.getByRole("button", { name: "Back to game", exact: true }).click();
    await expect(page.getByRole("checkbox", { name: "Physical table inputs" })).toBeVisible();
  }
});

test("human setup → seeded welcome bonus → merchant → first combat → return and resume", async ({ page }) => {
  await page.getByRole("button", { name: /New Run|New Ascent|Play Skybreak|Start.*Run|Start.*Ascent/i }).first().click();
  await page.getByRole("button", { name: /Select for Me/i }).click();
  await page.getByRole("button", { name: /Begin Ascent/i }).click();
  await page.getByRole("button", { name: /Skip All/i }).click();
  await expect(page.getByText("Seeded rewards auto-distributed — no skip penalty")).toBeVisible();
  await screenshot(page, "welcome-desktop");
  await page.getByRole("button", { name: /Enter the Astrilith/i }).click();
  await page.getByRole("button", { name: /Enter Room/i }).first().click();
  await screenshot(page, "merchant-desktop");
  await page.getByRole("button", { name: /Leave Merchant/i }).first().click();
  const confirm = page.getByRole("button", { name: /Leave Anyway/i });
  if (await confirm.isVisible()) await confirm.click();
  await page.getByRole("button", { name: /Enter.*Combat|Begin.*Combat|Fight|Enter Room/i }).first().click();
  await expect(page.getByRole("checkbox", { name: "Physical table inputs" })).toBeVisible();
  await page.getByRole("checkbox", { name: "Physical table inputs" }).check();
  await expect(page.getByText("Physical Table Input", { exact: true }).first()).toBeVisible();
  await screenshot(page, "combat-desktop");
  const before = await stateValue(page);
  await page.reload();
  await page.getByRole("button", { name: /Continue Run/i }).click();
  const after = await stateValue(page);
  expect(after?.meta.gameId).toBe(before?.meta.gameId);
  expect(after?.spire.roomIndex).toBe(before?.spire.roomIndex);
  expect(after?.combat?.round).toBe(before?.combat?.round);
});

test("combat item resolves victory once; stale action rejected; continue reveals next room", async ({ page }) => {
  await installScenario(page, "combat");
  await page.getByRole("button", { name: "Use an item" }).click();
  await page.getByRole("button", { name: /Bomb x?1|Bomb/i }).last().click();
  await expect.poll(async () => (await stateValue(page))?.combat?.combatResult).toBe("victory");
  await expect(page.getByRole("button", { name: "Use an item" })).toHaveCount(0);
  await page.getByRole("button", { name: /Continue/i }).first().click();
  await expect.poll(async () => (await stateValue(page))?.spire.roomIndex).toBe(2);
  expect((await stateValue(page))?.stats.roomsCleared).toBe(1);
});

test("merchant purchase changes gold and inventory; displayed price equals debit", async ({ page }) => {
  await installScenario(page, "merchant");
  await page.getByRole("button", { name: /Enter Room/i }).first().click();
  const before = await stateValue(page);
  await expect(page.getByText("Unavailable: die selection for rerolls is not supported.")).toHaveCount(2);
  await page.getByRole("button", { name: "Buy for 30 gold", exact: true }).first().click();
  const after = await stateValue(page);
  expect(before!.party.gold - after!.party.gold).toBe(30);
  expect(after!.party.heroes.reduce((n, h) => n + h.items.length, 0)).toBe(before!.party.heroes.reduce((n, h) => n + h.items.length, 0) + 1);
});

test("rest fully heals and advances exactly one room", async ({ page }) => {
  await installScenario(page, "rest");
  await page.getByRole("button", { name: /Enter.*Rest|Rest.*Room|Enter Room/i }).first().click();
  await page.getByRole("button", { name: /Full Heal/i }).click();
  await expect.poll(async () => (await stateValue(page))?.spire.roomIndex).toBe(4);
  const state = await stateValue(page); expect(state!.party.heroes[0].currentHp).toBe(state!.party.heroes[0].maxHp);
});

test("tier transition requires confirmation before exploration resumes", async ({ page }) => {
  await installScenario(page, "tier");
  await expect(page.getByRole("heading", { name: "Tier 2", exact: true })).toBeVisible();
  await screenshot(page, "tier-desktop");
  await page.getByRole("button", { name: /Continue|Enter|Ascend/i }).first().click();
  await expect.poll(async () => (await stateValue(page))?.phase).toBe("exploration");
});

for (const outcome of ["victory", "defeat"] as const) test(`${outcome} report → home → a fresh run`, async ({ page }) => {
  await installScenario(page, outcome);
  await page.getByRole("button", { name: "🏠 New Run", exact: true }).click();
  expect(await stateValue(page)).toBeNull();
  await expect(page.getByRole("button", { name: /New Run|New Ascent|Play Skybreak|Start.*Run|Start.*Ascent/i }).first()).toBeVisible();
});

test("Nightmare deadline report explains a loss with surviving heroes", async ({ page }) => {
  await installScenario(page, "physical");
  await page.evaluate(async () => {
    const { useGameStore } = await import("/src/app/gameStore.ts");
    const { checkAndSetCombatEnd } = await import("/src/engine/combatRunner.ts");
    const state = useGameStore.getState().state!;
    const deadline = checkAndSetCombatEnd({ ...state, settings: { ...state.settings, difficulty: "nightmare" }, combat: { ...state.combat!, isFinalBoss: true, turnCount: 40 } });
    useGameStore.setState({ state: deadline });
    useGameStore.getState().doResolveRoom();
  });
  await expect(page.getByRole("heading", { name: "Defeat", exact: true })).toBeVisible();
  await expect(page.getByText("Nightmare: 40-turn limit exceeded against Vyridian", { exact: true })).toBeVisible();
  await expect(page.getByText("The party has fallen.", { exact: false })).toHaveCount(0);
  expect((await stateValue(page))!.party.heroes.filter(h => h.alive)).toHaveLength(3);
  await screenshot(page, "defeat-deadline-desktop");
});

test("physical input rejects duplicate cards and preserves the supplied action die", async ({ page }) => {
  await installScenario(page, "physical");
  await page.getByRole("button", { name: "Card 2 suit hearts", exact: true }).click();
  await page.getByRole("combobox", { name: "Card 2 rank" }).selectOption("5");
  await expect(page.getByRole("button", { name: /Confirm Physical Inputs/i })).toBeDisabled();
  await page.getByRole("combobox", { name: "Card 2 rank" }).selectOption("6");
  await page.getByRole("button", { name: "Action die 4", exact: true }).click();
  await page.getByRole("button", { name: /Confirm Physical Inputs/i }).click();
  const state = await stateValue(page);
  const roll = state!.rng.history.find(e => e.type === "d6-physical" && e.label.startsWith("hero_action_"));
  expect(roll?.result).toBe(4);
  await screenshot(page, "physical-desktop");
});

test("physical hero action can target a summon without damaging the main monster", async ({ page }) => {
  await installScenario(page, "physical");
  await page.evaluate(async () => {
    const { useGameStore } = await import("/src/app/gameStore.ts");
    const state = useGameStore.getState().state!;
    useGameStore.setState({ state: { ...state, combat: { ...state.combat!, summons: [{ ...state.combat!.monster, id: "browser-summon", name: "Ooze Minion", currentHp: 20, maxHp: 20, alive: true, type: "summon", tokens: [], debuffs: [], buffs: [] }] } } });
  });
  await page.getByRole("combobox", { name: "Attack target", exact: true }).selectOption("browser-summon");
  await page.getByRole("button", { name: "Action die 4", exact: true }).click();
  await page.getByRole("button", { name: /Confirm Physical Inputs/i }).click();
  const state = await stateValue(page);
  expect(state!.combat!.monster.currentHp).toBe(30);
  expect(state!.combat!.summons[0].currentHp).toBeLessThan(20);
});

for (const width of [320, 390, 768, 1280, 1920]) test(`responsive home, setup and combat at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  for (const screen of ["home", "setup", "combat"] as const) {
    if (screen === "setup") await page.getByRole("button", { name: "New Run", exact: true }).click();
    if (screen === "combat") await installScenario(page, "physical");
    await screenshot(page, `${screen}-${width}`);
    if (screen === "combat" && width === 320) {
      await page.getByRole("button", { name: /Confirm Physical Inputs/i }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: "artifacts/stage2/screenshots/physical-input-320.png" });
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const offenders = overflow > 1 ? await page.locator("body *").evaluateAll(els => els.filter(el => el.getBoundingClientRect().right > innerWidth + 1).slice(0, 12).map(el => ({ tag: el.tagName, class: el.className, text: el.textContent?.slice(0, 70), right: el.getBoundingClientRect().right }))) : [];
    expect(overflow, JSON.stringify(offenders)).toBeLessThanOrEqual(1);
    const broken = await page.locator("img").evaluateAll(imgs => imgs.filter(img => img.complete && img.naturalWidth === 0).map(img => img.src));
    expect(broken).toEqual([]);
  }
});
