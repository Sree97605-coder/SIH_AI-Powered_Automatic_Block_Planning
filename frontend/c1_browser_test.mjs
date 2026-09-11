/**
 * C1 Browser Verification — Playwright
 *
 * Scenarios:
 *   2b — 409 capacity infeasibility:  pick a slot too small for the defect
 *   2c — 200 + p1_displacement:       synthetic fixture swap so live data constraint is bypassed
 *
 * Run from project root:
 *   node C:\Users\sree\.gemini\antigravity\brain\c6a92f40-0394-46c7-9bdb-1bac0b487aa6\scratch\c1_browser_test.mjs
 */

import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_DIR = __dirname;
const BASE = 'http://127.0.0.1:8000';

function log(msg) { console.log(`[C1] ${msg}`); }

async function waitAndScreenshot(page, name, description) {
  await page.waitForTimeout(1200);
  const file = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  log(`Screenshot saved: ${file}`);
  log(`Description: ${description}`);
  return file;
}

async function openDashboardWorklist(page) {
  await page.goto(BASE);
  await page.waitForLoadState('networkidle');
  log('Loaded landing page');

  // Click "Enter Dashboard" — find any button/link with that text
  const enterBtn = page.getByRole('button', { name: /enter dashboard/i })
    .or(page.getByRole('link', { name: /enter dashboard/i }))
    .first();
  await enterBtn.waitFor({ timeout: 8000 });
  await enterBtn.click();
  log('Entered dashboard');

  // Switch to Monthly horizon
  const monthlyBtn = page.getByRole('button', { name: /monthly/i }).first();
  await monthlyBtn.waitFor({ timeout: 5000 });
  await monthlyBtn.click();
  log('Switched to Monthly horizon');
  await page.waitForTimeout(500);

  // Navigate to Plan Schedule tab
  const planTab = page.getByRole('button', { name: /plan|schedule/i }).first();
  try {
    await planTab.waitFor({ timeout: 5000 });
    await planTab.click();
    log('Clicked Plan Schedule tab');
  } catch (_) {
    log('Plan Schedule tab not found by text — trying sidebar link');
    await page.locator('text=Plan').first().click();
  }
  await page.waitForTimeout(500);

  // Switch to Defect Worklist sub-view
  const worklistBtn = page.locator('text=Defect Worklist').first();
  await worklistBtn.waitFor({ timeout: 5000 });
  await worklistBtn.click();
  log('Switched to Defect Worklist');
  await page.waitForTimeout(800);
}

async function openModal(page, defectId) {
  // Click the defect row or Explain button for the given defect
  const row = page.locator(`text=${defectId}`).first();
  await row.waitFor({ timeout: 8000 });
  await row.click();
  log(`Opened modal for ${defectId}`);
  await page.waitForTimeout(1000);
}

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 2b: 409 — pick a slot physically too small (1.5h) for any defect
// ─────────────────────────────────────────────────────────────────────────────
async function scenario2b(browser) {
  log('\n=== SCENARIO 2b: 409 Capacity Infeasibility ===');
  const page = await browser.newPage();

  // Intercept the preview response so we can log the raw JSON
  let capturedResponse = null;
  page.on('response', async resp => {
    if (resp.url().includes('preview-override')) {
      try { capturedResponse = await resp.json(); } catch (_) {}
      log(`preview-override HTTP status: ${resp.status()}`);
    }
  });

  await openDashboardWorklist(page);
  await openModal(page, 'TMS-001');

  // Select the tiny 1.5h slot
  const targetSelect = page.locator('#target-slot, select').first();
  await targetSelect.selectOption({ value: 'GF-SEC-01-20260916-0410' });
  log('Selected target slot: GF-SEC-01-20260916-0410 (1.5h — too small for TMS-001 4.0h)');

  await waitAndScreenshot(page, 'sc2b_before_preview', 'Modal state before preview');

  // Click Preview
  const previewBtn = page.locator('#btn-preview-override, button:has-text("Preview")').first();
  await previewBtn.click();
  log('Clicked Preview override');

  // Wait for error to appear
  await page.waitForTimeout(4000);

  // Capture the error text actually rendered on screen
  const errorText = await page.locator('.text-\\[var\\(--accent-red\\)\\]').allTextContents()
    .catch(() => []);
  const allRedText = errorText.join(' | ');

  await waitAndScreenshot(page, 'sc2b_after_preview', '409 error rendered on screen');

  log(`\n--- SCENARIO 2b RESULTS ---`);
  log(`Raw API response captured: ${JSON.stringify(capturedResponse, null, 2)}`);
  log(`Red text on screen: "${allRedText}"`);

  await page.close();
  return { capturedResponse, allRedText };
}

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 2c: 200 + p1_displacement
// Uses the temporary synthetic fixture via direct API mocking approach:
// We intercept the preview-override response and inject a synthetic 200+p1 payload,
// then confirm the banner and checkbox render, and that clicking Confirm before
// checking the box does nothing.
// ─────────────────────────────────────────────────────────────────────────────
async function scenario2c(browser) {
  log('\n=== SCENARIO 2c: 200 + p1_displacement=true (synthetic intercept) ===');
  const page = await browser.newPage();

  // Intercept the preview-override call and return a synthetic 200+p1 payload
  await page.route('**/schedule/preview-override', async route => {
    log('Intercepting preview-override → returning synthetic 200+p1 payload');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        feasible: true,
        reason: null,
        available_hours: 4.0,
        required_hours: 4.0,
        newly_deferred: ['TMS-001'],
        newly_cleared: [],
        priority_alert: true,
        p1_displacement: true,
        reason_category_valid_for_displacement: true,
        metrics_before: { clearance_pct: 100.0, p1_clearance_pct: 100.0, p2_clearance_pct: 100.0 },
        metrics_after:  { clearance_pct: 98.1,  p1_clearance_pct: 0.0,   p2_clearance_pct: 100.0 },
      }),
    });
  });

  await openDashboardWorklist(page);
  // Open any defect modal — doesn't matter which since we intercept the response
  await openModal(page, 'TDMS-011');

  // Set reason to weather_or_emergency
  const reasonSelect = page.locator('#override-reason, select').nth(1);
  await reasonSelect.selectOption({ value: 'weather_or_emergency' });
  log('Set reason_category to weather_or_emergency');

  await waitAndScreenshot(page, 'sc2c_before_preview', 'Modal before preview');

  // Click Preview
  const previewBtn = page.locator('#btn-preview-override, button:has-text("Preview")').first();
  await previewBtn.click();
  log('Clicked Preview override');
  await page.waitForTimeout(3000);

  await waitAndScreenshot(page, 'sc2c_after_preview', 'Banner state after 200+p1 preview');

  // Capture visible text in the preview section
  const bannerText = await page.locator('text=P1 safety defect').allTextContents().catch(() => []);
  const checkboxVisible = await page.locator('#chk-p1-acknowledge').isVisible().catch(() => false);
  log(`P1 warning banner text found: ${JSON.stringify(bannerText)}`);
  log(`Acknowledgement checkbox visible: ${checkboxVisible}`);

  // Test: try clicking Confirm BEFORE checking the box
  const confirmBtn = page.locator('#btn-confirm-override, button:has-text("Confirm override")').first();
  const confirmDisabledBefore = await confirmBtn.isDisabled().catch(() => null);
  log(`Confirm button disabled before acknowledging: ${confirmDisabledBefore}`);

  // Actually attempt the click — if it fires a network request, something is wrong
  let confirmNetworkFired = false;
  page.on('request', req => {
    if (req.url().includes('confirm-override')) {
      confirmNetworkFired = true;
      log('⚠️  confirm-override request fired BEFORE checkbox was checked!');
    }
  });
  try {
    await confirmBtn.click({ force: true, timeout: 1000 });
  } catch (_) {}
  await page.waitForTimeout(500);

  await waitAndScreenshot(page, 'sc2c_confirm_before_ack', 'Confirm clicked before checkbox — nothing should change');

  log(`confirm-override network request fired before ack: ${confirmNetworkFired}`);

  // Now check the acknowledgement box
  const checkbox = page.locator('#chk-p1-acknowledge');
  if (checkboxVisible) {
    await checkbox.check();
    log('Checked the acknowledgement checkbox');
    await page.waitForTimeout(400);
    const confirmDisabledAfter = await confirmBtn.isDisabled().catch(() => null);
    log(`Confirm button disabled AFTER acknowledging: ${confirmDisabledAfter}`);
    await waitAndScreenshot(page, 'sc2c_confirm_after_ack', 'Confirm state after checkbox checked');
  }

  await page.close();
  return {
    bannerText,
    checkboxVisible,
    confirmDisabledBefore,
    confirmNetworkFired,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
(async () => {
  const browser = await chromium.launch({ headless: true });

  const results2b = await scenario2b(browser).catch(e => { log(`2b error: ${e.message}`); return null; });
  const results2c = await scenario2c(browser).catch(e => { log(`2c error: ${e.message}`); return null; });

  await browser.close();

  console.log('\n\n════════════════════════════════════════');
  console.log('C1 BROWSER TEST SUMMARY');
  console.log('════════════════════════════════════════');

  console.log('\n── Scenario 2b (409 capacity infeasibility) ──');
  if (results2b) {
    console.log('API response status from intercept:', results2b.capturedResponse ? 'captured' : 'not captured (error path)');
    console.log('Red error text on screen:', results2b.allRedText || '(none found)');
  } else {
    console.log('FAILED — see log above');
  }

  console.log('\n── Scenario 2c (200 + p1_displacement) ──');
  if (results2c) {
    console.log('P1 warning banner text:', JSON.stringify(results2c.bannerText));
    console.log('Acknowledgement checkbox visible:', results2c.checkboxVisible);
    console.log('Confirm disabled BEFORE checkbox:', results2c.confirmDisabledBefore);
    console.log('confirm-override network request fired before ack:', results2c.confirmNetworkFired);
  } else {
    console.log('FAILED — see log above');
  }

  console.log('\nScreenshots saved to:', SCREENSHOT_DIR);
})();
