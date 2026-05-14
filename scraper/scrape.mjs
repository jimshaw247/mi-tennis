import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const EVENT_PATH = '786%20%20%20%20%20%20%20%20%20%20%20';
const BASE = `https://tennisreporting.com/embed/event/brackets/${EVENT_PATH}?division=1262&host=3598`;

const FLIGHTS = [
  ...[1, 2, 3, 4].map(f => ({ id: `${f}S`, type: 'Singles', flight: f, url: `${BASE}&matchType=Singles&flight=${f}` })),
  ...[1, 2, 3, 4].map(f => ({ id: `${f}D`, type: 'Doubles', flight: f, url: `${BASE}&matchType=Doubles&isConsolation=false&flight=${f}` })),
];

const EXEC = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const browser = await chromium.launch({ executablePath: EXEC, headless: true });
const ctx = await browser.newContext({
  userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  ignoreHTTPSErrors: true,
});

const out = {};
const rawDumps = {};

for (const f of FLIGHTS) {
  const page = await ctx.newPage();
  console.log(`[${f.id}] loading ${f.url}`);
  await page.goto(f.url, { waitUntil: 'networkidle', timeout: 60000 });
  // Give React a moment after networkidle
  await page.waitForTimeout(1500);
  const html = await page.content();
  const text = await page.evaluate(() => document.body.innerText);
  rawDumps[f.id] = { html, text };
  console.log(`[${f.id}] text length: ${text.length}`);
  await page.close();
}

await browser.close();

mkdirSync(`${__dirname}/raw`, { recursive: true });
for (const [id, { html, text }] of Object.entries(rawDumps)) {
  writeFileSync(`${__dirname}/raw/${id}.html`, html);
  writeFileSync(`${__dirname}/raw/${id}.txt`, text);
}
console.log('Wrote raw dumps to scraper/raw/');
