import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";

/**
 * Stage 4 e2e — reliability & evidence integrity in a real browser.
 * Exercises the worker executor, IndexedDB v2 checkpoints, reload recovery,
 * deep telemetry, paired comparison, and evidence import. Screenshots land
 * in artifacts/stage4/screenshots/ for the Stage 4 report.
 */

const EVIDENCE_DIR = "artifacts/stage4/screenshots";

async function shot(page: Page, name: string) {
  await mkdir(EVIDENCE_DIR, { recursive: true });
  await page.screenshot({ path: `${EVIDENCE_DIR}/${name}.png`, fullPage: true });
}

async function openBatch(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /Batch Simulation/i }).click();
  await expect(page.getByRole("heading", { name: "Batch Simulation" })).toBeVisible();
}

test.describe.configure({ mode: "serial" });
test.setTimeout(420_000);

test("deep-telemetry run exposes trace accounting in run diagnostics", async ({ page }) => {
  await openBatch(page);
  await page.locator('input[type="number"]').first().fill("3");
  await page.locator("select").filter({ has: page.locator('option[value="deep"]') }).selectOption("deep");
  await shot(page, "stage4-01-deep-setup");

  await page.getByRole("button", { name: /Run 3 Simulations/i }).click();
  await expect(page.getByRole("heading", { name: "Batch Results" })).toBeVisible({ timeout: 180_000 });

  await page.locator("tbody tr").first().click();
  await expect(page.getByText("Run Diagnostics")).toBeVisible();
  // Deep trace accounting: retained/emitted disclosure on the record.
  await expect(page.getByText(/trace:/)).toBeVisible();
  await expect(page.getByText(/\/\d+ events/)).toBeVisible();
  await shot(page, "stage4-02-deep-trace-diagnostics");
});

test("browser reload mid-run leaves a recoverable experiment that resumes", async ({ page }) => {
  await openBatch(page);
  await page.locator('input[type="number"]').first().fill("300");
  await page.getByRole("button", { name: /Run 300 Simulations/i }).click();

  await expect(page.getByText("Running Batch Simulation")).toBeVisible({ timeout: 30_000 });
  // Let a few checkpoints commit, then reload while work is still in flight.
  await page.waitForTimeout(1200);
  await shot(page, "stage4-03-running-checkpoint-progress");

  // Abrupt reload — the coordinator dies mid-flight. No writes are lost
  // beyond the checkpoint boundary; the lease simply expires.
  await page.reload();
  await page.getByRole("button", { name: /Batch Simulation/i }).click();
  await expect(page.getByText("Experiment History")).toBeVisible();
  await shot(page, "stage4-04-history-after-crash");

  // The dead tab's lease is still inside its TTL — wait for expiry so the
  // experiment is claimable (15s lease + margin).
  await page.waitForTimeout(16_500);
  await page.reload();
  await page.getByRole("button", { name: /Batch Simulation/i }).click();
  await expect(page.getByText("Experiment History")).toBeVisible();

  const resumeBtn = page.getByRole("button", { name: "Resume" }).first();
  await expect(resumeBtn).toBeVisible();
  await shot(page, "stage4-05-recoverable-experiment");
  await resumeBtn.click();

  await expect(page.getByRole("heading", { name: "Batch Results" })).toBeVisible({ timeout: 300_000 });
  await expect(page.getByText(/300 runs · page 1 of/)).toBeVisible();
  await shot(page, "stage4-06-resumed-complete");

  // No duplicate runs: committed count equals the logical task count.
  const persisted = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open("skybreak-experiments");
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const tx = db.transaction(["runs"], "readonly");
    const n = await new Promise<number>((res) => {
      const c = tx.objectStore("runs").count();
      c.onsuccess = () => res(c.result);
    });
    db.close();
    return n;
  });
  expect(persisted).toBe(300);
});

test("large-result views paginate the per-run table", async ({ page }) => {
  await openBatch(page);
  // PAGE_SIZE is 100 — 120 runs produces a 2-page results table.
  await page.locator('input[type="number"]').first().fill("120");
  await page.getByRole("button", { name: /Run 120 Simulations/i }).click();
  await expect(page.getByRole("heading", { name: "Batch Results" })).toBeVisible({ timeout: 300_000 });
  // Paginated per-run table — never renders all rows at once.
  await expect(page.getByText(/120 runs · page 1 of 2/)).toBeVisible();
  await shot(page, "stage4-07-paginated-results");
});

test("shared-cohort experiment exposes the paired comparison view", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Strategy Lab/i }).click();
  await expect(page.getByRole("heading", { name: "Strategy Lab" })).toBeVisible();

  await page.locator('input[type="number"]').first().fill("1");
  await page.getByLabel(/Shared-cohort comparison/i).check();
  await page.getByRole("button", { name: /Run \d+ Games/i }).click();
  await expect(page.getByRole("heading", { name: "Strategy Lab Results" })).toBeVisible({ timeout: 300_000 });

  await page.getByRole("button", { name: /Comparison Table/i }).click();
  const card = page.getByTestId("paired-comparison");
  await expect(card).toBeVisible();
  await card.getByTestId("paired-select-a").selectOption("0");
  await card.getByTestId("paired-select-b").selectOption("1");
  await expect(card.getByText("Matched pairs")).toBeVisible();
  await shot(page, "stage4-08-paired-comparison");
});

test("evidence import validates, stores read-only, and separates technical failures", async ({ page }) => {
  await openBatch(page);
  await expect(page.getByText("Experiment History")).toBeVisible();

  // Craft a minimal-but-valid evidence package with a technical failure
  // inside — it must render as excluded, never as a defeat.
  const pkg = {
    schema: "skybreak-evidence",
    schemaVersion: 1,
    experimentSchemaVersion: 1,
    experimentId: "e2e-import-fixture",
    kind: "batch",
    name: "E2E Imported Evidence",
    engineFingerprint: "skybreak-sim/3.1.0",
    configFingerprint: "fixture",
    config: { runs: 3 },
    createdAt: new Date().toISOString(),
    exportedAt: new Date().toISOString(),
    status: "completed-with-errors",
    totals: { tasks: 3, recorded: 3, validRuns: 2, victories: 1, defeats: 1, technicalFailures: 1 },
    runs: [
      {
        runId: "imp:0", experimentId: "e2e-import-fixture", comboIndex: -1,
        cohortIndex: 0, runIndex: 0, seed: "imp|0",
        status: "completed", outcome: "victory",
        score: { finalScore: 12000, breakdown: {} },
        partyComposition: [], runSummary: "fixture victory",
        telemetryLevel: "minimal", telemetryCompleteness: "summary-only",
        engineFingerprint: "skybreak-sim/3.1.0",
      },
      {
        runId: "imp:1", experimentId: "e2e-import-fixture", comboIndex: -1,
        cohortIndex: 1, runIndex: 1, seed: "imp|1",
        status: "completed", outcome: "defeat",
        score: { finalScore: 4000, breakdown: {} },
        partyComposition: [], runSummary: "fixture defeat",
        telemetryLevel: "minimal", telemetryCompleteness: "summary-only",
        engineFingerprint: "skybreak-sim/3.1.0",
      },
      {
        runId: "imp:2", experimentId: "e2e-import-fixture", comboIndex: -1,
        cohortIndex: 2, runIndex: 2, seed: "imp|2",
        status: "error", partyComposition: [],
        runSummary: "fixture technical failure",
        diagnostics: { phase: "combat", roomIndex: 2, tier: 1, roomIterations: 2, combatIterations: 50, retrySafe: false, errorCategory: "exception", errorMessage: "fixture crash" },
        telemetryLevel: "minimal", telemetryCompleteness: "invalid",
        engineFingerprint: "skybreak-sim/3.1.0",
      },
    ],
    reproducibility: { seedProtocol: 2, statement: "fixture" },
  };

  await page.getByTestId("evidence-import-input").setInputFiles({
    name: "evidence.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(pkg)),
  });

  await expect(page.getByText(/Imported 3 run\(s\)/i)).toBeVisible({ timeout: 15_000 });
  await shot(page, "stage4-09-imported-history");

  // Import auto-opens the read-only results — honest exclusion of the
  // technical failure, never counted as a defeat.
  await expect(page.getByRole("heading", { name: "Batch Results" })).toBeVisible();
  await expect(page.getByText(/Excluded from gameplay statistics/i)).toBeVisible();
  await expect(page.getByText(/1 error/)).toBeVisible();
  await shot(page, "stage4-10-imported-technical-failure-separation");
});
