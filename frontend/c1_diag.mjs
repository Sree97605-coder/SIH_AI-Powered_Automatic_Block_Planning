import { chromium } from 'playwright';
const BASE = 'http://127.0.0.1:8000';
const SHOT_DIR = 'C:\\Users\\sree\\.gemini\\antigravity\\brain\\c6a92f40-0394-46c7-9bdb-1bac0b487aa6\\scratch\\';
function log(msg) { console.log('[C1] ' + msg); }

async function nav(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.locator('button').filter({ hasText: /enter dashboard/i }).first().click();
  log('entered dashboard');
  await page.waitForTimeout(2000);
  // Monthly toggle
  const monthlyBtn = page.locator('button').filter({ hasText: /^monthly$/i }).first();
  try { await monthlyBtn.click({ timeout: 4000 }); } catch (_) {
    await page.locator('button').filter({ hasText: /monthly/i }).first().click();
  }
  log('monthly selected');
  await page.waitForTimeout(500);
  // Plan Schedule tab in sidebar
  const planBtn = page.locator('button, a').filter({ hasText: /monthly|plan|schedule/i }).nth(1);
  try { await planBtn.click({ timeout: 4000 }); } catch (_) {}
  await page.waitForTimeout(800);
  // Defect Worklist sub-view button
  const wl = page.locator('button').filter({ hasText: /defect worklist/i }).first();
  await wl.waitFor({ state: 'visible', timeout: 8000 });
  await wl.click();
  log('at worklist');
  await page.waitForTimeout(1000);
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  try {
    await nav(page);
    await page.screenshot({ path: SHOT_DIR + 'diag_0_worklist.png' });
    log('worklist screenshot saved');

    // Find TMS-001 row and click Explain
    const row = page.locator('tr').filter({ hasText: 'TMS-001' });
    await row.waitFor({ state: 'visible', timeout: 8000 });
    const explainBtn = row.locator('button').filter({ hasText: /explain/i });
    await explainBtn.click();
    log('clicked explain for TMS-001');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: SHOT_DIR + 'diag_1_modal.png' });
    log('modal screenshot saved');

    // Dump all selects in the fixed overlay (modal)
    const allSelects = await page.locator('.fixed select, [role="dialog"] select').all();
    log('Selects inside modal overlay: ' + allSelects.length);
    for (let i = 0; i < allSelects.length; i++) {
      const id = await allSelects[i].getAttribute('id').catch(() => 'no-id');
      const opts = await allSelects[i].locator('option').evaluateAll(
        els => els.map(e => ({ value: e.value, text: e.textContent.trim() }))
      );
      log('  select #' + i + ' id=' + id + ' options:');
      opts.slice(0, 15).forEach(o => log('    value="' + o.value + '" text="' + o.text + '"'));
    }

    // Also log all buttons inside the modal
    const buttons = await page.locator('.fixed button').allTextContents().catch(() => []);
    log('Buttons in modal: ' + JSON.stringify(buttons));

  } catch (e) {
    log('ERROR: ' + e.message);
    await page.screenshot({ path: SHOT_DIR + 'diag_error.png' }).catch(() => {});
  }
  await browser.close();
})();
