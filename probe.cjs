// Usage: node probe.cjs [runs=5] [delaysForB=50] [clickModes=dom,mouse] [chunkDelayMs=0]
//   e.g. node probe.cjs 5 20,50,100,200,300 dom,mouse 1000
// Spawns the SSR server, runs scenarios A/B/C against it, prints a result table, kills the server.
const { spawn } = require('node:child_process');
const path = require('node:path');
const http = require('node:http');

const REPRO = __dirname;
const PW = process.env.PW_PATH || 'playwright';
const { chromium } = require(PW);

const PORT = 4017;
const BASE = `http://localhost:${PORT}`;
const RUNS = Number(process.argv[2] || 5);
const B_DELAYS = (process.argv[3] || '50').split(',').map(Number);
const CLICK_MODES = (process.argv[4] || 'dom,mouse').split(',');
// Artificial latency on the lazily-loaded defer chunk: keeps the block in the 'hydrating' state with the main thread free.
const CHUNK_DELAY = Number(process.argv[5] || 0);

function waitForPort(ms = 20000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      http
        .get(BASE + '/', (res) => {
          res.resume();
          resolve();
        })
        .on('error', () => {
          if (Date.now() - start > ms) return reject(new Error('server did not start'));
          setTimeout(tick, 200);
        });
    };
    tick();
  });
}

async function linkState(page) {
  return page.evaluate(() => {
    const a = document.getElementById('link');
    return a
      ? { present: true, jsaction: a.getAttribute('jsaction'), ngh: a.closest('[ngb]') ? 'in-defer-block' : null }
      : { present: false, jsaction: null };
  });
}

async function doClick(page, mode) {
  if (mode === 'dom') {
    await page.evaluate(() => document.getElementById('link').click());
  } else {
    const box = await page.evaluate(() => {
      const r = document.getElementById('link').getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await page.mouse.click(box.x, box.y);
  }
}

async function runScenario(browser, scenario, { delay, clickMode }) {
  const context = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  const page = await context.newPage();
  const logs = [];
  page.on('console', (m) => logs.push(m.text()));
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  // Installed after load so only the lazy (defer) chunk is delayed, not the initial bundles.
  await page.route('**/chunk-*.js', async (route) => {
    await new Promise((r) => setTimeout(r, CHUNK_DELAY));
    await route.continue();
  });

  if (scenario !== 'A') {
    await page.evaluate(() => document.getElementById('link').scrollIntoView());
    await page.waitForTimeout(scenario === 'B' ? delay : 1500 + CHUNK_DELAY);
  }
  const before = await linkState(page);
  const ctorStartedBeforeClick = logs.includes('slow-section constructor start');
  const ctorEndedBeforeClick = logs.includes('slow-section constructor end');
  await doClick(page, clickMode);
  await page.waitForTimeout(2000);
  const after = await linkState(page);
  const pathname = await page.evaluate(() => location.pathname);
  const handlerRan = logs.includes('handler ran');
  await context.close();
  return {
    scenario,
    delay: scenario === 'B' ? delay : scenario === 'A' ? 0 : 1500 + CHUNK_DELAY,
    chunkDelay: CHUNK_DELAY,
    clickMode,
    jsactionBefore: before.jsaction,
    jsactionAfter: after.present ? after.jsaction : '(anchor gone)',
    ctorStartedBeforeClick,
    ctorEndedBeforeClick,
    handlerRan,
    pathname,
    navigated: pathname === '/target',
  };
}

(async () => {
  const server = spawn(process.execPath, [path.join(REPRO, 'dist/repro/server/server.mjs')], {
    // Angular 22 SSR rejects unknown Host headers unless allow-listed.
    env: { ...process.env, PORT: String(PORT), NG_ALLOWED_HOSTS: 'localhost' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (d) => process.stderr.write('[server] ' + d));
  server.stderr.on('data', (d) => process.stderr.write('[server:err] ' + d));
  try {
    await waitForPort();
    const browser = await chromium.launch();
    const results = [];
    for (const clickMode of CLICK_MODES) {
      for (let i = 0; i < RUNS; i++) results.push(await runScenario(browser, 'A', { clickMode }));
      for (const delay of B_DELAYS) {
        for (let i = 0; i < RUNS; i++) results.push(await runScenario(browser, 'B', { delay, clickMode }));
      }
      for (let i = 0; i < RUNS; i++) results.push(await runScenario(browser, 'C', { clickMode }));
    }
    await browser.close();
    console.table(results);
    // Summary per (scenario, delay, clickMode)
    const groups = {};
    for (const r of results) {
      const k = `${r.scenario} delay=${r.delay} click=${r.clickMode}`;
      groups[k] ??= { total: 0, navigated: 0, handlerRan: 0, jsactionStripped: 0, ctorStartedBeforeClick: 0, ctorEndedBeforeClick: 0 };
      const g = groups[k];
      g.total++;
      g.navigated += r.navigated ? 1 : 0;
      g.handlerRan += r.handlerRan ? 1 : 0;
      g.jsactionStripped += r.jsactionBefore && !r.jsactionAfter ? 1 : 0;
      g.ctorStartedBeforeClick += r.ctorStartedBeforeClick ? 1 : 0;
      g.ctorEndedBeforeClick += r.ctorEndedBeforeClick ? 1 : 0;
    }
    console.log('\nSUMMARY');
    console.table(groups);
  } finally {
    server.kill();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
