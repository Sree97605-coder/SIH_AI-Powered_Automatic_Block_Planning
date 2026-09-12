/**
 * C1 Browser Verification — Final (v3)
 * Selectors confirmed from DOM diagnostic run.
 *
 * Modal selects:
 *   select#target-slot  — slot options: GF-SEC-01-20260916-0040, GF-SEC-01-20260916-0410, etc.
 *   select#override-reason — reason options: prioritization_mistake, weather_or_emergency, etc.
 * Buttons: "Preview override", "Confirm override", "Close"
 * Checkbox: #chk-p1-acknowledge
 */
import { chromium } from 'playwright';
if (!process.env.OVERRIDE_DB_PATH || /(^|[\\/])override_log\.db$/i.test(process.env.OVERRIDE_DB_PATH)) {
  throw new Error('Set OVERRIDE_DB_PATH to a non-production test database before running C1 verification.');
}
const BASE = 'http://127.0.0.1:8000';
const SHOTS = 'C:\\Users\\sree\\.gemini\\antigravity\\brain\\c6a92f40-0394-46c7-9bdb-1bac0b487aa6\\scratch\\';
function log(msg) { console.log('[C1] ' + msg); }
async function shot(page, name) {
  await page.screenshot({ path: SHOTS + name + '.png' });
  log('screenshot: ' + name + '.png');
}

async function nav(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.locator('button').filter({ hasText: /enter dashboard/i }).first().click();
  await page.waitForTimeout(2000);
  await page.locator('button').filter({ hasText: /monthly/i }).first().click();
  await page.waitForTimeout(800);
  const wl = page.locator('button').filter({ hasText: /defect worklist/i }).first();
  await wl.waitFor({ state: 'visible', timeout: 10000 });
  await wl.click();
  await page.waitForTimeout(1000);
  log('at worklist');
}

async function openModal(page, defectId) {
  const row = page.locator('tr').filter({ hasText: defectId });
  await row.waitFor({ state: 'visible', timeout: 8000 });
  await row.locator('button').filter({ hasText: /explain/i }).click();
  await page.waitForTimeout(2000);
  log('modal open for ' + defectId);
}

// ── SCENARIO 2b: 409 ────────────────────────────────────────────────────────
async function sc2b(browser) {
  log('\n=== SCENARIO 2b: 409 physical capacity infeasibility ===');
  log('  defect: TMS-001 (4.0h), target slot: GF-SEC-01-20260916-0410 (1.5h)');
  log('  4.0h > 1.5h => solver must fail => expect 409 response');
  const page = await browser.newPage();
  let apiStatus = null, apiBody = null;
  page.on('response', async r => {
    if (r.url().includes('preview-override')) {
      apiStatus = r.status();
      try { apiBody = await r.json(); } catch (_) {}
      log('  API status received: ' + apiStatus);
    }
  });
  try {
    await nav(page);
    await openModal(page, 'TMS-001');
    await shot(page, 'sc2b_1_modal_open');

    // Select the 1.5h slot — confirmed available in target-slot select
    await page.locator('#target-slot').selectOption('GF-SEC-01-20260916-0410');
    log('  selected GF-SEC-01-20260916-0410 (1.5h)');
    await shot(page, 'sc2b_2_slot_selected');

    // Click Preview override
    await page.locator('button').filter({ hasText: /preview override/i }).click();
    log('  clicked Preview override');
    await page.waitForTimeout(6000); // solver takes a few seconds

    await shot(page, 'sc2b_3_after_preview');

    // Read the error text rendered — look for the capacity error message
    const allPageText = await page.locator('.fixed').allTextContents().catch(() => []);
    const fullText = allPageText.join('\n');
    // Find the specific error line
    const errorLines = fullText.split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 5 && (
        l.toLowerCase().includes('infeasib') ||
        l.toLowerCase().includes('capacity') ||
        l.toLowerCase().includes('blocked') ||
        l.toLowerCase().includes('milp') ||
        l.toLowerCase().includes('feasible') ||
        l.toLowerCase().includes('solver')
      ));

    log('\n--- SCENARIO 2b RESULTS ---');
    log('  API HTTP status: ' + apiStatus);
    log('  API body: ' + JSON.stringify(apiBody));
    log('  Error text on screen (filtered): ' + JSON.stringify(errorLines.slice(0, 10)));
    return { apiStatus, apiBody, errorLines };
  } catch (e) {
    log('  ERROR: ' + e.message);
    await shot(page, 'sc2b_error').catch(() => {});
    return null;
  } finally {
    await page.close();
  }
}

// ── SCENARIO 2c: 200 + p1_displacement (route intercept) ────────────────────
async function sc2c(browser) {
  log('\n=== SCENARIO 2c: 200 + p1_displacement=true (intercepted response) ===');
  const page = await browser.newPage();

  // Synthetic 200+p1 payload — same structure the backend returns in tests
  await page.route('**/schedule/preview-override', async route => {
    log('  [intercept] injecting 200+p1_displacement payload');
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

  let confirmFired = false;
  page.on('request', req => {
    if (req.url().includes('confirm-override')) {
      confirmFired = true;
      log('  *** confirm-override NETWORK REQUEST FIRED ***');
    }
  });

  try {
    await nav(page);
    // Use TDMS-011 — its target-slot dropdown will have SEC-05 options
    await openModal(page, 'TDMS-011');
    await shot(page, 'sc2c_1_modal_open');

    // Set reason to weather_or_emergency
    await page.locator('#override-reason').selectOption('weather_or_emergency');
    log('  set reason = weather_or_emergency');

    // Preview — will be intercepted
    await page.locator('button').filter({ hasText: /preview override/i }).click();
    log('  clicked Preview override (intercepted with 200+p1)');
    await page.waitForTimeout(3000);

    await shot(page, 'sc2c_2_after_preview');

    // Read all text in the modal to find the P1 banner
    const modalText = await page.locator('.fixed').allTextContents().catch(() => []);
    const fullText = modalText.join('\n');
    const p1BannerLines = fullText.split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 5 && (
        l.includes('P1') || l.toLowerCase().includes('deferred') ||
        l.toLowerCase().includes('safety') || l.toLowerCase().includes('emergency')
      ));

    const checkboxExists = await page.locator('#chk-p1-acknowledge').count();
    const checkboxVisible = checkboxExists > 0
      ? await page.locator('#chk-p1-acknowledge').isVisible()
      : false;

    const confirmBtn = page.locator('button').filter({ hasText: /confirm override/i });
    const confirmDisabledBefore = await confirmBtn.isDisabled().catch(() => 'not found');

    log('  P1 banner lines found: ' + JSON.stringify(p1BannerLines.slice(0, 8)));
    log('  #chk-p1-acknowledge visible: ' + checkboxVisible);
    log('  Confirm button disabled (BEFORE checking box): ' + confirmDisabledBefore);

    // NOW: try to click Confirm BEFORE checking the box
    // force:true makes Playwright click even if disabled, so we can confirm React ignores it
    confirmFired = false;
    await confirmBtn.click({ force: true, timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(1000);
    log('  confirm-override network request fired before ack: ' + confirmFired);

    await shot(page, 'sc2c_3_confirm_before_ack');

    // Now check the acknowledgement box and verify Confirm becomes enabled
    let confirmDisabledAfter = 'checkbox not visible';
    if (checkboxVisible) {
      await page.locator('#chk-p1-acknowledge').check();
      log('  checked acknowledgement checkbox');
      await page.waitForTimeout(400);
      confirmDisabledAfter = await confirmBtn.isDisabled().catch(() => 'not found');
      log('  Confirm button disabled (AFTER checking box): ' + confirmDisabledAfter);
      await shot(page, 'sc2c_4_after_ack_checked');
    } else {
      log('  WARNING: checkbox not visible — P1 banner may not have rendered');
      // Dump the full modal text for diagnosis
      log('  Full modal text: ' + fullText.substring(0, 2000));
    }

    return { p1BannerLines, checkboxVisible, confirmDisabledBefore, confirmFired, confirmDisabledAfter };
  } catch (e) {
    log('  ERROR: ' + e.message);
    await shot(page, 'sc2c_error').catch(() => {});
    return null;
  } finally {
    await page.close();
  }
}

// ── MAIN ────────────────────────────────────────────────────────────────────
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });

  const r2b = await sc2b(browser);
  const r2c = await sc2c(browser);

  await browser.close();

  console.log('\n\n══════════════════════════════════════════════════════════');
  console.log('C1 FINAL BROWSER VERIFICATION SUMMARY');
  console.log('══════════════════════════════════════════════════════════');

  console.log('\n── Scenario 2b: 409 Capacity Infeasibility ──');
  if (r2b) {
    console.log('  API HTTP status:  ' + r2b.apiStatus + '  (expected: 409)');
    console.log('  API body detail.reason: ' + (r2b.apiBody?.detail?.reason || 'N/A'));
    console.log('  Error text on screen: ' + (r2b.errorLines?.join(' | ') || '(none matched)'));
  } else { console.log('  FAILED'); }

  console.log('\n── Scenario 2c: 200 + p1_displacement=true ──');
  if (r2c) {
    console.log('  P1 banner text on screen: ' + JSON.stringify(r2c.p1BannerLines));
    console.log('  Acknowledgement checkbox visible: ' + r2c.checkboxVisible);
    console.log('  Confirm disabled BEFORE ack: ' + r2c.confirmDisabledBefore);
    console.log('  confirm-override fired before ack: ' + r2c.confirmFired + '  (expected: false)');
    console.log('  Confirm disabled AFTER ack: ' + r2c.confirmDisabledAfter + '  (expected: false)');
  } else { console.log('  FAILED'); }

  console.log('\nScreenshots in: ' + SHOTS);
})();
