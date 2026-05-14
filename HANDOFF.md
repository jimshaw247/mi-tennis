# Tennis Regionals Tracker — Handoff

## What this is

A single-page React app that tracks the MHSAA D1 Girls Tennis Regional
(9 teams, 8 single-elimination flights). Built for fast one-handed
phone use at the tournament: tap a winner, leaderboard updates,
localStorage persists everything.

Live URL: not deployed yet — see "Deploy" below.

## Where the code is

Everything lives in **this Claude Code sandbox** under
`/home/user/tennis-regionals/`. That's a Linux container Anthropic
runs the session inside; it is *not* your local `C:\code`.

```
/home/user/tennis-regionals/
├── app/                       # Vite + React + Tailwind app
│   ├── src/
│   │   ├── App.jsx             # tabs, header, footer, import/export
│   │   ├── main.jsx
│   │   ├── index.css           # Tailwind entrypoint
│   │   ├── data/
│   │   │   └── teams.js        # the 9 teams + flight list + Clarkston highlight
│   │   ├── lib/
│   │   │   ├── bracket.js      # match graph, advancement, undo cascade, per-entry standing
│   │   │   ├── stats.js        # leaderboard rows + best/worst rank bounds + qual flags
│   │   │   └── storage.js      # localStorage glue + export/import
│   │   └── components/
│   │       ├── Bracket.jsx     # one flight's bracket, tap-to-pick winner
│   │       ├── Leaderboard.jsx # ranked table with badges
│   │       └── DrawSetup.jsx   # 9-slot editor for one flight
│   ├── index.html              # mobile viewport meta + theme color
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── vercel.json             # SPA rewrite to /
│   └── package.json
└── scraper/
    ├── scrape.mjs              # broken: sandbox blocks tennisreporting.com
    ├── smoke.mjs               # Playwright smoke test of the running dev server
    ├── test-bracket.mjs        # node-only unit tests of bracket math
    ├── screen-board.png        # screenshot from smoke test
    └── screen-flight.png
```

### Getting the code onto your machine

Three options, easiest first:

1. **tar it out via `cat` + clipboard** — run inside the sandbox:
   ```
   cd /home/user && tar -czf - tennis-regionals --exclude node_modules \
     --exclude dist | base64 -w0
   ```
   Copy the base64 blob, paste into a Windows file `regional.b64`, then
   `certutil -decode regional.b64 regional.tar.gz` and extract.
2. **Have Claude push to a new GitHub repo on your side.** I (Claude in
   this session) can only push to `jimshaw247/vibemini`. If you create
   an empty repo on your account and add the GitHub MCP scope for it,
   or temporarily nest the project as a subdir under vibemini on a
   branch, I can commit and push.
3. **Recreate locally.** The whole app is ~9 source files. If you'd
   rather start fresh on your machine, I can dictate the file contents
   one-by-one or paste them into a single response.

## What works

- **Board tab** — ranked leaderboard with: rank, team name (Clarkston
  bolded), points, max possible points, alive entries, finish-range
  bounds (`#1` when locked, `#1–#5` while in flux), badges (Top 3 ✓,
  18+ ✓, Need 18, OUT). Per-flight summary tiles below jump to that
  bracket.
- **Flights tab** — flight chips (1S–4D); for each, a 4-column bracket
  (Play-in → QF → SF → F). Tap a competitor to mark them the winner;
  tap again to clear; changing an earlier match auto-clears all
  downstream winners.
- **Draws tab** — 9 slots per flight; seed input, team dropdown
  (auto-disables teams already used in that flight), optional
  player/pair name. Flight chips show progress (e.g. `1S 9/9`).
- **Footer** — Export to JSON, Import from JSON, Reset results, Reset
  all. All confirms guarded.
- **Persistence** — localStorage under key `tennis-regionals-state-v1`.

## Bracket assumptions baked in

Each flight is hard-coded to a 9-entry single-elim with these matches:

| Match | Top side    | Bottom side  |
|-------|-------------|--------------|
| PI    | pos 7       | pos 8        |
| QF1   | pos 0       | PI winner    |
| QF2   | pos 3       | pos 4        |
| QF3   | pos 2       | pos 5        |
| QF4   | pos 1       | pos 6        |
| SF1   | QF1 winner  | QF2 winner   |
| SF2   | QF3 winner  | QF4 winner   |
| F     | SF1 winner  | SF2 winner   |

Position 0 is the top of the bracket (faces the play-in winner);
positions 7 & 8 are the two play-in entries. **You enter draws in this
order** in the Draws tab — the UI labels each slot explicitly.

If tennisreporting.com seeds the play-in in a different slot (e.g. 9
vs 1 instead of 8 vs 9), you just need to map their bracket positions
onto these slots when you enter them. Slots ≠ seed numbers — slot is
*bracket position*, seed is metadata for display.

## Scoring & qualification rules

- 1 point per match win. Byes don't count.
- Position 0–6 entries can win up to 3 matches (QF, SF, F).
- Position 7–8 entries can win up to 4 matches (PI + QF + SF + F).
- "Max possible team points = 24" per the spec; the actual ceiling can
  be 25 for a team that wins through a play-in. The leaderboard
  computes real max dynamically.
- Top 3 auto-qualify for State Finals at Midland.
- Any team with 18+ points also qualifies.

### Best/worst finish bounds (heuristic, conservative)

- `bestRank(T)` = 1 + count of teams whose **current** > T's **max
  possible**.
- `worstRank(T)` = 1 + count of teams whose **max possible** > T's
  **current**.

These are loose bounds — they ignore the fact that two teams' entries
in the same bracket can't both win out. Fine for tournament-day
gut-checks ("can we still finish top 3?"). If you want tight bounds,
that's a full sim and not worth it.

### Qualification flags

- `clinchedTop3`: `worstRank <= 3`
- `eliminatedTop3`: `bestRank > 3`
- `clinched18`: `points >= 18`
- `eliminated18`: `maxPossible < 18`
- `eliminatedAll`: eliminated from both = the OUT badge

## The unfun bit: bracket data

I was supposed to scrape tennisreporting.com to pre-seed the 8 flights.
**Couldn't.** The sandbox's outbound HTTP allowlist blocks
tennisreporting.com — same 403 from `curl`, Playwright (with bundled
Chromium), and WebFetch. There is no Chrome/browser MCP tool exposed
in this session that would route through a different network. Nothing
to "permission" — the block is in the harness, not Chrome.

So draws have to come in one of three ways:

1. **Paste here in chat**, I bake them into `src/data/seedDraws.js` and
   load on first run.
2. **Local scraper.** I can write a `scrape.mjs` you run on your own
   machine (where tennisreporting.com isn't blocked); it'll spit out
   `state.json` you drop into the app's Import button in the footer.
   The bones of it are in `scraper/scrape.mjs` — just needs the
   parser. The Playwright page-rendering step works fine outside the
   sandbox.
3. **Manual on the Draws tab.** ~2 minutes per flight.

## Run it

```
cd /home/user/tennis-regionals/app
npm install            # already done in this sandbox
npm run dev            # http://localhost:5173
# or, for LAN access from your phone:
npm run dev -- --host
```

`npm run build` outputs to `app/dist/` — that's what Vercel deploys.

## Tests

```
cd /home/user/tennis-regionals/scraper
node test-bracket.mjs  # 17 assertions on bracket math + leaderboard
node smoke.mjs         # spins through the live UI in headless Chromium,
                       # asserts no console errors, dumps screenshots
```

Both pass. The smoke test depends on the dev server running on :5173.

## Deploy

Repo doesn't exist yet on GitHub. Options:

- **Vercel CLI**: `cd app && npx vercel` — first run prompts to create
  a project. `vercel.json` is already in place.
- **GitHub + Vercel auto-deploy**: create a repo on your account,
  `git init && git add . && git commit -m "init" && git remote add
  origin <url> && git push -u origin main`, then connect to Vercel.

## Known nits I'd polish next

- On a phone the 4 bracket columns require a horizontal swipe (each
  column = 180px). Fine for one-round triage. If you'd rather see all
  rounds stacked vertically on narrow screens, that's a one-component
  change in `Bracket.jsx`.
- No "current round / on-deck" indicator. Could highlight the next
  unplayed match in each flight.
- No undo button — clearing a winner requires tapping the
  already-green side again. Works but isn't obvious. A tiny "↶" on the
  match card would help.
- Min/max finish bounds are conservative (see above). A tight Monte
  Carlo sim would give better bounds for "Need 18" cases.

## What I would do if I were you, in order

1. Decide how you want the code on your computer (tar-out is fastest
   from this sandbox; rebuild-from-scratch is cleanest going forward).
2. Get the draws in. Manual on Draws tab is 15 minutes total and you
   own the state immediately.
3. Run `npm run dev -- --host`, open the LAN URL on your phone,
   bookmark it. Or `npx vercel` for a real URL.
4. At the tournament: tap winners as matches finish. Watch the
   leaderboard.

— end of handoff —
