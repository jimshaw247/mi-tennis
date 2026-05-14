// Smoke test: load the dev server, exercise draws + bracket clicks, dump
// the rendered state and any console errors.
import { chromium } from 'playwright';

const EXEC = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: EXEC, headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); // iPhone-ish
const page = await ctx.newPage();

const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', msg => { if (msg.type() === 'error') errors.push('console.error: ' + msg.text()); });

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForSelector('text=MHSAA D1 Girls Regional');

// Reset state to clean
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });

// Should see the "No draws entered" notice
const noticeVisible = await page.locator('text=No draws entered yet').isVisible();
console.log('notice visible:', noticeVisible);

// Go to Draws tab
await page.locator('button:has-text("Draws")').first().click();
await page.waitForTimeout(200);

// Fill 1S with 9 entries
const TEAMS = [
  'Clarkston','Rochester','Lake Orion','Oxford','Rochester Adams',
  'Auburn Hills Avondale','Davison','Lapeer','Waterford Kettering'
];
for (let i = 0; i < 9; i++) {
  const card = page.locator('text=Pos ' + (
    i===0?'1 (top, faces play-in winner)':
    i===1?'2 (bottom half top)':
    i===7?'8 (play-in A)':
    i===8?'9 (play-in B)':
    String(i+1)
  )).first().locator('..');
  // seed
  await card.locator('input[type=number]').fill(String(i+1));
  // team select - the only <select> in the card
  await card.locator('select').selectOption({ label: TEAMS[i] });
  await card.locator('input[type=text]').fill('Player ' + (i+1));
}

// Go to Flights tab, see the 1S bracket
await page.locator('header button:has-text("Flights")').click();
await page.waitForTimeout(200);
await page.locator('button:has-text("1 Singles")').click();
await page.waitForTimeout(200);

// Pick winners: Play-in: top wins, then QF1..QF4 top wins, SF1 top, SF2 top, F top.
// We just click the top side of every match that is "ready".
for (let pass = 0; pass < 5; pass++) {
  const matchTopBtns = page.locator('.rounded-lg.border.border-slate-700.bg-slate-900\\/60 > button:nth-child(2)');
  const n = await matchTopBtns.count();
  for (let i = 0; i < n; i++) {
    const btn = matchTopBtns.nth(i);
    if (await btn.isEnabled()) {
      // Only click if winner not already set (i.e., emerald bg absent)
      const cls = await btn.getAttribute('class') || '';
      if (!cls.includes('emerald')) {
        await btn.click().catch(() => {});
        await page.waitForTimeout(40);
      }
    }
  }
}

// Take screenshots
await page.screenshot({ path: '/home/user/tennis-regionals/scraper/screen-flight.png', fullPage: true });
await page.locator('header button:has-text("Board")').click();
await page.waitForTimeout(200);
await page.screenshot({ path: '/home/user/tennis-regionals/scraper/screen-board.png', fullPage: true });

// Read leaderboard rows
const rows = await page.locator('.grid.grid-cols-\\[28px_1fr_44px_44px_44px\\]').allInnerTexts();
console.log('--- leaderboard ---');
console.log(rows.join('\n\n'));

console.log('\nerrors:', errors);

await browser.close();
