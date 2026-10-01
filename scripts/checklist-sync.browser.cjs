// Run against a built preview with Playwright available in NODE_PATH.
// QA_URL, CHROMIUM_PATH, AXE_PATH and QA_SCREENSHOT_DIR are optional.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zh = require('../src/locales/zh.json');
const en = require('../src/locales/en.json');

const base = process.env.QA_URL || 'http://127.0.0.1:4174';
const errors = [];
const results = [];
let browser;
const today = new Date().toISOString().slice(0, 10);
const fixture = {
  pg_schemaVersion: '1.0',
  pg_trips: JSON.stringify([{ id: 'qa-trip', name: 'Synthetic trip', startDateStr: today, tripDays: 2,
    plans: [{ id: 'qa-walk', name: 'Synthetic walk', stops: [{ title: 'City park' }] }],
    schedule: { [today]: { planId: 'qa-walk' } } }]),
  pg_checklistText: '# Documents\nPassport\nCash\n# Bags\nCharger\nCamera',
  pg_checklistState: JSON.stringify({ 'Documents::Passport': 'done', 'Bags::Camera': 'skipped' }),
};
const label = (locale, key, vars = {}) => locale[key].replace(/\{\{(\w+)\}\}/g, (_, name) => String(vars[name]));
const button = (p, locale, key) => p.getByRole('button', { name: locale[key], exact: true }).last();
const saved = p => p.evaluate(() => ({ text: localStorage.getItem('pg_checklistText'), state: localStorage.getItem('pg_checklistState'), trips: localStorage.getItem('pg_trips') }));
async function make(locale = zh, options = {}, sync = false) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, ...options });
  const p = await context.newPage();
  p.setDefaultTimeout(8000);
  p.on('pageerror', e => errors.push(e.message));
  await p.route(/open-meteo\.com|googleapis\.com|accounts\.google\.com/, route => route.abort());
  await p.addInitScript(data => {
    if (localStorage.getItem('qa-seeded')) return;
    for (const [key, value] of Object.entries(data)) localStorage.setItem(key, value);
    localStorage.setItem('qa-seeded', 'yes');
  }, fixture);
  return { p, context, url: `${base}?lang=${locale === en ? 'en' : 'zh'}${sync ? '&sync=1' : ''}` };
}
async function openSync(p) {
  await p.locator('.action-menu > summary').click();
  await button(p, zh, 'driveSync').click();
  await p.locator('.drive-sync-modal').waitFor();
}
async function screenshot(p, name) {
  if (!process.env.QA_SCREENSHOT_DIR) return;
  fs.mkdirSync(process.env.QA_SCREENSHOT_DIR, { recursive: true });
  await p.screenshot({ path: path.join(process.env.QA_SCREENSHOT_DIR, name + '.png'), fullPage: true });
}
async function accessibility(p) {
  if (!process.env.AXE_PATH) return;
  await p.addScriptTag({ path: process.env.AXE_PATH });
  const violations = await p.evaluate(async () => (await axe.run()).violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })));
  assert.deepEqual(violations, []);
}
async function test(name, run) {
  await run();
  results.push(name);
  console.log('PASS', name);
}

function installMock(p, configured = false) {
  return p.addInitScript(initial => {
    window.qaConfigured = initial;
    window.qaCalls = { status: 0, connect: 0, write: 0 };
    window.qaConnected = false;
    window.qaAuthFails = false;
    window.qaRemoteVersion = '1';
    window.driveStorage = {
      isConfigured: () => window.qaConfigured,
      status: () => { window.qaCalls.status++; return { configured: window.qaConfigured, connected: window.qaConnected }; },
      connect: async () => { window.qaCalls.connect++; if (window.qaAuthFails) throw Object.assign(new Error('Synthetic authorization failure'), { code: 'auth_failed' }); window.qaConnected = true; },
      getFile: async () => ({ id: 'synthetic-remote', name: 'synthetic.json', version: window.qaRemoteVersion }),
      findFile: async () => null,
      createFile: async () => { window.qaCalls.write++; return { id: 'synthetic-remote', version: '1' }; },
      readJson: async () => null,
      writeJson: async () => {
        window.qaCalls.write++;
        await new Promise(resolve => setTimeout(resolve, 100));
        window.qaRemoteVersion = String(Number(window.qaRemoteVersion) + 1);
        return { id: 'synthetic-remote', version: window.qaRemoteVersion };
      },
    };
    localStorage.setItem('driveStorage:plan-gacha:file', JSON.stringify({ id: 'synthetic-remote', name: 'synthetic.json', modifiedTime: '2026-10-01T00:27:00Z', version: '1' }));
  }, configured);
}
const readyScript = `window.driveStorage={isConfigured:()=>true,status:()=>({configured:true,connected:false}),connect:async()=>{},getFile:async()=>null,findFile:async()=>null,createFile:async()=>null,readJson:async()=>null,writeJson:async()=>null};`;

(async () => {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
  for (const [name, locale, viewport] of [
    ['desktop', zh, { width: 1440, height: 900 }],
    ['phone', zh, { width: 320, height: 740 }],
    ['English phone', en, { width: 390, height: 844 }],
  ]) await test(`${name}: filter preserves data/counts, completes immediately, restores all and keeps keyboard focus`, async () => {
    const { p, context, url } = await make(locale, { viewport });
    await p.goto(url);
    await button(p, locale, 'checklistShort').click();
    await p.locator('.checklist-item').first().waitFor();
    const before = await saved(p);
    assert.equal(await p.locator('.checklist-item').count(), 4);
    const filter = button(p, locale, 'checklistIncompleteOnly');
    assert((await filter.boundingBox()).height >= 44);
    await filter.focus();
    await p.keyboard.press('Space');
    assert.equal(await filter.getAttribute('aria-pressed'), 'true');
    assert.equal(await p.locator('.checklist-item').count(), 3);
    assert.deepEqual(await saved(p), before);
    assert((await p.locator('.checklist-group-head').first().innerText()).includes(label(locale, 'checklistProgress', { done: 1, total: 2 })));
    assert((await p.locator('.checklist-overview').innerText()).includes(label(locale, 'checklistProgress', { done: 1, total: 3 })));
    assert.equal(await p.locator('.checklist-item.status-skipped').count(), 1);
    assert(await p.evaluate(() => document.querySelector('.checklist-modal').scrollWidth <= document.querySelector('.checklist-modal').clientWidth));
    await accessibility(p);
    await screenshot(p, 'checklist-filter-' + name.replace(/ /g, '-'));
    await p.locator('.checklist-check').first().focus();
    await p.keyboard.press('Enter');
    assert.equal(await p.locator('.checklist-item').count(), 2);
    assert.equal(await p.locator('.checklist-group').count(), 1);
    assert.equal(await p.locator('.checklist-check:focus').count(), 1);
    await p.keyboard.press('Space');
    assert.equal(await p.locator('.checklist-item').count(), 1);
    await p.keyboard.press('Enter');
    await p.locator('.checklist-filter-empty').waitFor();
    assert((await p.locator('.checklist-filter-empty').innerText()).includes(locale.checklistAllDone));
    assert.equal(await button(p, locale, 'checklistAll').evaluate(e => e === document.activeElement), true);
    await accessibility(p);
    await button(p, locale, 'checklistShowAll').click();
    assert.equal(await p.locator('.checklist-item.status-done').count(), 4);
    const completed = await saved(p);
    await filter.click();
    await button(p, locale, 'checklistAll').click();
    assert.deepEqual(await saved(p), completed);
    await p.keyboard.press('Escape');
    await button(p, locale, 'checklistShort').click();
    await p.locator('.checklist-item').first().waitFor();
    assert.equal(await p.locator('.checklist-item.status-done').count(), 4);
    await context.close();
  });

  await test('filtered editor keeps hidden items and saves additions, deletions and category changes', async () => {
    const { p, context, url } = await make();
    await p.goto(url);
    await button(p, zh, 'checklistShort').click();
    await button(p, zh, 'checklistIncompleteOnly').click();
    await button(p, zh, 'checklistEdit').click();
    await p.locator('.checklist-edit-item').first().waitFor();
    assert.equal(await p.locator('.checklist-edit-item').count(), 4);
    const first = p.locator('.checklist-category-editor').first();
    await first.getByLabel(zh.checklistCategoryName, { exact: true }).fill('Personal');
    await first.getByRole('button', { name: label(zh, 'checklistRemoveItem', { name: 'Cash' }), exact: true }).click();
    await first.getByRole('button', { name: zh.checklistAddItem, exact: true }).click();
    await first.locator('.checklist-edit-item input').last().fill('Tickets');
    const bags = p.locator('.checklist-category-editor').filter({ hasText: 'Bags' });
    await bags.locator('summary').click();
    await bags.getByRole('button', { name: label(zh, 'checklistRemoveCategory', { name: 'Bags' }), exact: true }).click();
    await button(p, zh, 'checklistAddCategory').click();
    const next = p.locator('.checklist-category-editor').last();
    await next.getByLabel(zh.checklistCategoryName, { exact: true }).fill('Travel');
    await next.getByRole('button', { name: zh.checklistAddItem, exact: true }).click();
    await next.locator('.checklist-edit-item input').fill('Map');
    await button(p, zh, 'checklistSave').click();
    await p.locator('.checklist-filter').waitFor();
    assert.equal(await button(p, zh, 'checklistIncompleteOnly').getAttribute('aria-pressed'), 'true');
    assert.deepEqual(await p.locator('.checklist-item > span').allTextContents(), ['Tickets', 'Map']);
    assert.deepEqual(await p.locator('.checklist-group-head h3').allTextContents(), ['Personal', 'Travel']);
    assert.deepEqual(JSON.parse((await saved(p)).state), { 'Personal::Passport': 'done' });
    await button(p, zh, 'checklistAll').click();
    assert.equal(await p.locator('.checklist-item').count(), 3);
    assert.equal(await p.locator('.checklist-item.status-done').count(), 1);
    await context.close();
  });

  await test('unconfigured host retains binding, explains site repair, exports full backup and rechecks once', async () => {
    const { p, context, url } = await make(zh, {}, true);
    await installMock(p);
    await p.goto(url);
    await openSync(p);
    await p.locator('.drive-recovery-help').waitFor();
    assert((await p.locator('.drive-sync-modal').innerText()).includes(zh.driveNotConfiguredHelp));
    assert((await p.locator('.drive-sync-status').innerText()).includes('synthetic.json'));
    assert(await button(p, zh, 'driveConnectAndSync').isDisabled());
    assert(await button(p, zh, 'driveRedetect').isEnabled());
    assert(await button(p, zh, 'driveReloadSite').isEnabled());
    const before = await saved(p);
    const binding = await p.evaluate(() => localStorage.getItem('driveStorage:plan-gacha:file'));
    const [download] = await Promise.all([p.waitForEvent('download'), button(p, zh, 'driveExportLocalBackup').click()]);
    const exported = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
    assert.equal(exported.appSchemaVersion, '1.0');
    assert.equal(exported.checklistText, before.text);
    assert.deepEqual(exported.checklistState, JSON.parse(before.state));
    assert.equal(exported.trips[0].id, 'qa-trip');
    await accessibility(p);
    await screenshot(p, 'sync-host-recovery');
    const statusCalls = await p.evaluate(() => { window.qaConfigured = true; return window.qaCalls.status; });
    await p.evaluate(text => { const b = [...document.querySelectorAll('.drive-sync-actions button')].find(e => e.textContent.trim() === text); b.click(); b.click(); }, zh.driveRedetect);
    await p.waitForFunction(() => !document.querySelector('.drive-sync-main').disabled);
    assert.equal(await p.evaluate(() => window.qaCalls.status), statusCalls + 1);
    assert.deepEqual(await p.evaluate(() => ({ connect: window.qaCalls.connect, write: window.qaCalls.write })), { connect: 0, write: 0 });
    assert.deepEqual(await saved(p), before);
    assert.equal(await p.evaluate(() => localStorage.getItem('driveStorage:plan-gacha:file')), binding);
    await context.close();
  });

  await test('missing SDK stays accessible; an actual script retry recovers with no duplicate requests', async () => {
    const { p, context, url } = await make(zh, {}, true);
    let requests = 0;
    await p.route(/\/drive-storage\/driveStorage\.js(?:\?.*)?$/, async route => {
      requests++;
      if (requests === 1) await route.fulfill({ status: 404, body: '' });
      else { await new Promise(resolve => setTimeout(resolve, 100)); await route.fulfill({ status: 200, contentType: 'application/javascript', body: readyScript }); }
    });
    await p.goto(url);
    await openSync(p);
    await p.locator('.drive-recovery-help').filter({ hasText: zh.driveUnavailableHelp }).waitFor();
    const before = await saved(p);
    await p.evaluate(text => { const b = [...document.querySelectorAll('.drive-sync-actions button')].find(e => e.textContent.trim() === text); b.click(); b.click(); }, zh.driveRedetect);
    await p.waitForFunction(() => !document.querySelector('.drive-sync-main').disabled);
    assert.equal(requests, 2);
    assert.deepEqual(await saved(p), before);
    assert((await p.locator('.drive-recovery-help').innerText()).includes(zh.driveNotConnectedHelp));
    await context.close();
  });

  await test('timed-out script cannot overwrite a later successful detection', async () => {
    const { p, context, url } = await make(zh, {}, true);
    let requests = 0;
    let release;
    const held = new Promise(resolve => { release = resolve; });
    await p.route(/\/drive-storage\/driveStorage\.js(?:\?.*)?$/, async route => {
      const attempt = ++requests;
      if (attempt === 1) await held;
      await route.fulfill({ status: 200, contentType: 'application/javascript', body: attempt === 1 ? '' : readyScript }).catch(() => {});
    });
    await p.goto(url, { waitUntil: 'domcontentloaded' });
    await openSync(p);
    await p.locator('.drive-recovery-help').filter({ hasText: zh.driveUnavailableHelp }).waitFor();
    await button(p, zh, 'driveRedetect').click();
    await p.waitForFunction(() => !document.querySelector('.drive-sync-main').disabled);
    release();
    await p.waitForFunction(() => window.driveStorage.status().configured === true);
    assert(await button(p, zh, 'driveConnectAndSync').isEnabled());
    assert.equal(requests, 2);
    await context.close();
  });

  await test('offline and authorization failures retain data and leave retry/backup actions available', async () => {
    const { p, context, url } = await make(zh, {}, true);
    await installMock(p, true);
    await p.addInitScript(() => { Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false }); window.qaAuthFails = true; });
    await p.goto(url);
    await openSync(p);
    await p.locator('.drive-recovery-help').filter({ hasText: zh.driveOfflineHelp }).waitFor();
    const before = await saved(p);
    await p.evaluate(() => { Object.defineProperty(navigator, 'onLine', { get: () => true }); window.dispatchEvent(new Event('online')); });
    await button(p, zh, 'driveConnectAndSync').click();
    await p.locator('.drive-recovery-error').filter({ hasText: 'Synthetic authorization failure' }).waitFor();
    assert(await button(p, zh, 'driveRedetect').isEnabled());
    assert(await button(p, zh, 'driveExportLocalBackup').isEnabled());
    assert.deepEqual(await saved(p), before);
    await button(p, zh, 'driveConnectAndSync').click();
    await p.waitForFunction(() => window.qaCalls.connect === 2 && !document.querySelector('.drive-sync-main').disabled);
    assert.equal(await p.evaluate(() => window.qaCalls.write), 0);
    await context.close();
  });

  await test('configured synthetic sync still deduplicates writes and preserves conflict decisions across rechecks', async () => {
    const { p, context, url } = await make(zh, {}, true);
    await installMock(p, true);
    await p.goto(url);
    await openSync(p);
    await button(p, zh, 'driveConnectAndSync').waitFor({ state: 'visible' });
    await p.waitForFunction(() => !document.querySelector('.drive-sync-main').disabled);
    const before = await saved(p);
    await p.evaluate(() => { const b = document.querySelector('.drive-sync-main'); b.click(); b.click(); });
    await p.waitForFunction(() => window.qaCalls.write === 1 && !document.querySelector('.drive-sync-main').disabled);
    assert.equal(await p.evaluate(() => window.qaCalls.connect), 1);
    await p.evaluate(() => { window.qaRemoteVersion = '9'; });
    await button(p, zh, 'driveSyncNow').click();
    await p.locator('.drive-conflict').waitFor();
    assert.equal(await p.evaluate(() => window.qaCalls.write), 1);
    await button(p, zh, 'driveRedetect').click();
    await button(p, zh, 'driveRedetect').waitFor({ state: 'visible' });
    assert.equal(await p.locator('.drive-conflict').count(), 1);
    assert(await button(p, zh, 'driveSyncNow').isDisabled());
    assert.deepEqual(await saved(p), before);
    await context.close();
  });

  assert.deepEqual(errors, [], 'uncaught browser exceptions');
  console.log(`Passed ${results.length} browser scenarios; no uncaught exceptions. Drive uses synthetic contracts only.`);
  await browser.close();
})().catch(async error => {
  console.error(error);
  if (browser) await browser.close();
  process.exitCode = 1;
});
