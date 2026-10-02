// Existing UI regression. Use the same synthetic snapshot and real MCP preview; select its intent manually in the web.
// NODE_PATH supplies an existing Playwright installation; QA_URL/CHROMIUM_PATH/QA_SCREENSHOT are optional.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const os = require('node:os');
const fixture = require('../fixtures/planning-tools.snapshot.json');
const en = require('../src/locales/en.json');
const evidence = require('../docs/planning-tools-evidence.json');
const expected = evidence.calls.find(call => call.name === 'preview_changes').result.structuredContent.data;
const browser = awaitBrowser();
async function awaitBrowser() {
  const instance = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  const context = await instance.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => route.request().url().startsWith(process.env.QA_URL || 'http://127.0.0.1:4174') ? route.continue() : route.abort());
  await page.addInitScript(snapshot => {
    if (localStorage.getItem('tools-seeded')) return;
    localStorage.setItem('pg_schemaVersion', '1.0');
    localStorage.setItem('pg_trips', JSON.stringify([snapshot.trip]));
    localStorage.setItem('pg_currentTripId', snapshot.trip.id);
    localStorage.setItem('pg_weatherCache', JSON.stringify(snapshot.weatherData));
    localStorage.setItem('pg_driveAutoSync', 'false');
    localStorage.setItem('tools-seeded', 'yes');
  }, fixture);
  const saved = () => page.evaluate(id => JSON.parse(localStorage.getItem('pg_trips')).find(trip => trip.id === id).schedule, fixture.trip.id);
  try {
    await page.goto((process.env.QA_URL || 'http://127.0.0.1:4174') + '?lang=en');
    await page.locator('.day-tile').nth(1).click();
    const before = await saved();
    const change = page.getByRole('button', { name: new RegExp('^' + en.changeArrangement) });
    if (await change.count()) await change.first().click();
    const choose = () => page.getByRole('button', { name: `${en.useThisPlan} · Synthetic museum`, exact: true }).click();
    await choose();
    const modal = page.locator('.impact-modal');
    await modal.waitFor();
    assert.deepEqual(await saved(), before, 'Preview must not write');
    const text = await modal.innerText();
    assert(text.includes('2026-10-10') && text.includes('2026-10-12'));
    await modal.getByRole('button', { name: en.cancel, exact: true }).click();
    assert.deepEqual(await saved(), before, 'Cancel must not write');
    await choose();
    await modal.waitFor();
    if (process.env.QA_SCREENSHOT) await page.screenshot({ path: process.env.QA_SCREENSHOT, fullPage: true });
    await modal.getByRole('button', { name: en.continueAdjust, exact: true }).click();
    await page.waitForFunction(({ id, schedule }) => JSON.stringify(JSON.parse(localStorage.getItem('pg_trips')).find(trip => trip.id === id).schedule) === JSON.stringify(schedule), { id: fixture.trip.id, schedule: expected.nextSchedule });
    assert.deepEqual(await saved(), expected.nextSchedule, 'Web confirmed schedule must equal the real MCP preview');
    await page.reload();
    assert.deepEqual(await saved(), expected.nextSchedule, 'Local confirmed result must survive reload');
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ result: 'passed', syntheticOnly: true, explicitManualIntentTransfer: true, checks: ['preview_no_write', 'cancel_no_write', 'web_confirm_equals_real_mcp_preview', 'locked_lodging_preserved', 'reload_persists', 'no_page_errors'], screenshot: process.env.QA_SCREENSHOT || null }, null, 2));
    await exerciseHandoff(instance);
  } finally { await instance.close(); }
}
browser.catch(error => { console.error(error); process.exitCode = 1; });

async function exerciseHandoff(instance) {
  const context = await instance.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const p = await context.newPage();
  p.setDefaultTimeout(8000);
  const errors = [];
  p.on('pageerror', error => errors.push(error.message));
  await p.route('**/*', route => route.request().url().startsWith(process.env.QA_URL || 'http://127.0.0.1:4174') ? route.continue() : route.abort());
  await p.addInitScript(snapshot => {
    localStorage.setItem('pg_schemaVersion', '1.0');
    localStorage.setItem('pg_trips', JSON.stringify([snapshot.trip]));
    localStorage.setItem('pg_currentTripId', snapshot.trip.id);
    localStorage.setItem('pg_weatherCache', JSON.stringify(snapshot.weatherData));
    localStorage.setItem('pg_driveAutoSync', 'false');
  }, fixture);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-gacha-handoff-'));
  const snapshotPath = path.join(temp, 'snapshot.json');
  const proposalPath = path.join(temp, 'proposal.json');
  const reportPath = path.join(temp, 'mcp-evidence.json');
  const saved = () => p.evaluate(id => JSON.parse(localStorage.getItem('pg_trips')).find(trip => trip.id === id).schedule, fixture.trip.id);
  const open = async () => {
    await p.getByRole('button', { name: en.aiReplan, exact: true }).click();
    await p.locator('.planning-tools-panel > summary').click();
  };
  const field = () => p.getByRole('textbox', { name: en.planningToolsProposal, exact: true });
  const button = key => p.getByRole('button', { name: en[key], exact: true });
  const exportAndCall = async () => {
    const downloaded = p.waitForEvent('download');
    await button('planningToolsExport').click();
    await (await downloaded).saveAs(snapshotPath);
    // Real explicit transfer: browser download -> file -> SDK client -> stdio server -> proposal file.
    execFileSync(process.execPath, ['--import', 'tsx', 'scripts/planning-tools-demo.ts', snapshotPath, reportPath, proposalPath], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' });
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    return report.calls.find(call => call.name === 'preview_changes').result.structuredContent;
  };
  try {
    await p.goto((process.env.QA_URL || 'http://127.0.0.1:4174') + '?lang=en');
    await open();
    const before = await saved();
    await field().fill('{ invalid');
    await button('planningToolsPreview').click();
    assert.equal(await p.locator('.planning-tools-panel [role="alert"]').innerText(), en.planningToolsInvalid);
    assert.deepEqual(await saved(), before);
    const initial = await exportAndCall();
    await field().fill(JSON.stringify(initial.data.proposal));
    await button('planningToolsPreview').click();
    await p.locator('.planning-tools-preview').waitFor();
    assert.deepEqual(await saved(), before, 'Imported preview must not write');
    // The draft survives closing the AI dialog. Editing checklist content makes this token stale.
    await button('closeAiPlanning').click();
    await p.getByRole('button', { name: en.checklistShort, exact: true }).click();
    await p.locator('.checklist-check').first().click();
    await p.locator('.checklist-modal').getByRole('button', { name: en.close, exact: true }).first().click();
    await open();
    assert.equal(await field().inputValue(), JSON.stringify(initial.data.proposal));
    await button('planningToolsPreview').click();
    assert.equal(await p.locator('.planning-tools-panel [role="alert"]').innerText(), en.planningToolsStale);
    assert.equal(await p.locator('.planning-tools-preview').count(), 0);
    assert.deepEqual(await saved(), before);
    const fresh = await exportAndCall();
    // Imported claimed effects are ignored. Only the token-bound assignment intent is used.
    const tampered = { ...fresh, data: { ...fresh.data, nextSchedule: { '2026-10-11': { planId: 'closed' } }, changes: [] } };
    await field().fill(JSON.stringify(tampered));
    await button('planningToolsPreview').click();
    const preview = p.locator('.planning-tools-preview');
    await preview.waitFor();
    assert((await preview.innerText()).includes('Synthetic museum'));
    assert((await preview.innerText()).includes('2026-10-10'));
    assert((await preview.innerText()).includes('2026-10-12'));
    assert.deepEqual(await saved(), before);
    if (process.env.QA_HANDOFF_SCREENSHOT) {
      await preview.scrollIntoViewIfNeeded();
      await p.screenshot({ path: process.env.QA_HANDOFF_SCREENSHOT, fullPage: true });
    }
    await button('planningToolsConfirm').click();
    await p.waitForFunction(({ id, schedule }) => JSON.stringify(JSON.parse(localStorage.getItem('pg_trips')).find(trip => trip.id === id).schedule) === JSON.stringify(schedule), { id: fixture.trip.id, schedule: fresh.data.nextSchedule });
    assert.deepEqual(await saved(), fresh.data.nextSchedule);
    assert.deepEqual(errors, []);
    if (process.env.QA_HANDOFF_EVIDENCE) fs.copyFileSync(reportPath, process.env.QA_HANDOFF_EVIDENCE);
    console.log(JSON.stringify({ result: 'passed', transport: 'browser download -> file -> real SDK stdio -> proposal -> browser paste -> local confirmation', checks: ['invalid_schema_no_write', 'import_preview_no_write', 'draft_retained', 'stale_snapshot_rejected_after_checklist_change', 'pasted_nextSchedule_ignored', 'fresh_web_confirmation_equals_mcp', 'locked_lodging_preserved', 'no_page_errors'], snapshotToken: fresh.snapshotToken }, null, 2));
  } finally { await context.close(); }
}
