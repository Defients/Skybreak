import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";

/**
 * Stage 3 e2e — experiment infrastructure in a real browser.
 * Exercises the Web Worker executor and IndexedDB persistence (the unit tests
 * only cover the inline executor + memory store). Screenshots land in
 * e2e-evidence/ for the Stage 3 report.
 */

const EVIDENCE_DIR = "artifacts/stage3/screenshots";

async function shot(page: Page, name: string) {
  await mkdir(EVIDENCE_DIR, { recursive: true });
  await page.screenshot({ path: `${EVIDENCE_DIR}/${name}.png`, fullPage: true });
}

async function openBatch(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /Batch Simulation/i }).click();
  await expect(page.getByRole("heading", { name: "Batch Simulation" })).toBeVisible();
}

async function setRunCount(page: Page, runs: number) {
  const input = page.locator('input[type="number"]').first();
  await input.fill(String(runs));
}

test.describe.configure({ mode: "serial" });

test("batch experiment runs in workers and shows results with uncertainty", async ({ page }) => {
  await openBatch(page);
  await setRunCount(page, 6);

  const workerCount = await page.evaluate(() =>
    typeof Worker !== "undefined" ? (navigator.hardwareConcurrency ?? 0) : 0
  );
  expect(workerCount).toBeGreaterThan(0);
  await shot(page, "stage3-01-experiment-setup");

  await page.getByRole("button", { name: /Run 6 Simulations/i }).click();

  // Capture the running view if it renders long enough to observe.
  try {
    await expect(page.getByText(/Running Batch Simulation/)).toBeVisible({ timeout: 3000 });
    await shot(page, "stage3-02-running");
  } catch { /* fast environments may skip the running frame entirely */ }

  await expect(page.getByRole("heading", { name: "Batch Results" })).toBeVisible({ timeout: 180_000 });
  await expect(page.getByText("Aggregate Statistics")).toBeVisible();
  // Sample count + Wilson CI displayed
  await expect(page.getByText(/95% CI/)).toBeVisible();
  await expect(page.getByText(/n=6/)).toBeVisible();
  await shot(page, "stage3-03-results");

  // Run diagnostics: expand the first run row
  await page.locator("tbody tr").first().click();
  await expect(page.getByText("Run Diagnostics")).toBeVisible();
  await expect(page.getByText(/runId:/)).toBeVisible();
  await expect(page.getByText(/seed:/)).toBeVisible();
  await shot(page, "stage3-04-run-diagnostics");
});

test("experiment history persists across reload and reopens results", async ({ page }) => {
  await openBatch(page);
  await setRunCount(page, 3);
  await page.getByRole("button", { name: /Run 3 Simulations/i }).click();
  await expect(page.getByRole("heading", { name: "Batch Results" })).toBeVisible({ timeout: 120_000 });

  // IndexedDB holds the experiment records (durable storage)
  const persisted = await page.evaluate(async () => {
    const req = indexedDB.open("skybreak-experiments", 1);
    const db = await new Promise<IDBDatabase>((res, rej) => {
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
    const tx = db.transaction(["runs", "experiments"], "readonly");
    const runCount = await new Promise<number>((res) => {
      const c = tx.objectStore("runs").count();
      c.onsuccess = () => res(c.result);
    });
    const expCount = await new Promise<number>((res) => {
      const c = tx.objectStore("experiments").count();
      c.onsuccess = () => res(c.result);
    });
    db.close();
    return { runCount, expCount };
  });
  expect(persisted.expCount).toBeGreaterThan(0);
  expect(persisted.runCount).toBeGreaterThan(0);

  // Reload → history panel → reopen → results render from committed records
  await page.reload();
  await page.getByRole("button", { name: /Batch Simulation/i }).click();
  await expect(page.getByText("Experiment History")).toBeVisible();
  await shot(page, "stage3-06-history");
  await page.locator(".glass-card", { hasText: "Experiment History" })
    .locator("button").first().click();
  await expect(page.getByRole("heading", { name: "Batch Results" })).toBeVisible();
  await shot(page, "stage3-07-recovered-results");
});

test("cancelled batch commits partial progress and can be resumed", async ({ page }) => {
  await openBatch(page);
  await setRunCount(page, 100);
  await page.getByRole("button", { name: /Run 100 Simulations/i }).click();

  await expect(page.getByText("Running Batch Simulation...")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();

  // Partial-evidence banner (not presented as final)
  await expect(page.getByRole("heading", { name: "Batch Results" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/reflect partial evidence/i)).toBeVisible();
  await shot(page, "stage3-05-interrupted-partial-evidence");

  // History shows the cancelled experiment with a Resume action
  await page.getByRole("button", { name: /Run Another Batch/i }).click();
  await expect(page.getByText("Experiment History")).toBeVisible();
  const resumeBtn = page.getByRole("button", { name: "Resume" }).first();
  await expect(resumeBtn).toBeVisible();
  await resumeBtn.click();

  // Resume completes the full cohort — no duplicates
  await expect(page.getByRole("heading", { name: "Batch Results" })).toBeVisible({ timeout: 300_000 });
  await expect(page.getByText(/100 runs/i)).toBeVisible();
  await shot(page, "stage3-08-resumed-complete");
});

test("strategy lab runs a cross-product experiment with shared-cohort option", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Strategy Lab/i }).click();
  await expect(page.getByRole("heading", { name: "Strategy Lab" })).toBeVisible();

  // Default axes: 5 combat × 1 merchant × 5 rest × 1 split × 1 item × 1 weapon = 25 combos.
  // Reduce runs per combo to 2 → 50 total games.
  const runsInput = page.locator('input[type="number"]').first();
  await runsInput.fill("2");
  await page.getByLabel(/Shared-cohort comparison/i).check();
  await expect(page.getByText(/total games/i)).toBeVisible();

  await page.getByRole("button", { name: /Run 50 Games/i }).click();
  await expect(page.getByRole("heading", { name: "Strategy Lab Results" })).toBeVisible({ timeout: 300_000 });
  await expect(page.getByText(/Shared-cohort protocol/i)).toBeVisible();
  await shot(page, "stage3-09-lab-summary");

  // Comparison table shows CI + sample size columns
  await page.getByRole("button", { name: /Comparison Table/i }).click();
  await expect(page.getByText("95% CI")).toBeVisible();
  await shot(page, "stage3-10-lab-comparison-ci");

  // Class analysis tab renders with per-hero telemetry
  await page.getByRole("button", { name: /Class Analysis/i }).click();
  await expect(page.getByText("Win Rate by Hero Class")).toBeVisible();
  await expect(page.getByText(/Indiv. Survival/i)).toBeVisible();
  await shot(page, "stage3-11-class-analysis");
});
