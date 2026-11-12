# Dailybreak

## Hosting

GitHub Pages is configured in `.github/workflows/deploy.yml` to build and deploy `dist/` on pushes to `main`. It can also be run manually from GitHub Actions. No separate deployment token is required.

One-time setup for `dailybreak.arons0n.com`:

1. In `joeyaronson/dailybreak` → Settings → Pages, set the publishing source to **GitHub Actions**.
2. Set the Pages custom domain to **dailybreak.arons0n.com** and save it before adding the DNS record.
3. In Squarespace DNS, add a **CNAME** with host **dailybreak** and data **joeyaronson.github.io**. Keep the existing `@` and `www` records.
4. Commit and push the project to `main`. Check the **Deploy GitHub Pages** workflow in the Actions tab.
5. Once the certificate is ready, enable **Enforce HTTPS** in Pages settings.

Vite's default base `/` is correct for this custom domain. A repository-path URL such as `joeyaronson.github.io/dailybreak/` would need a different base. Custom domains for Actions deployments are configured in Pages settings; no `CNAME` file is needed.

References: [Vite deployment guide](https://vite.dev/guide/static-deploy.html#github-pages), [GitHub custom domains](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site).

See [HANDOFF.md](HANDOFF.md) for the current behavior, visual decisions, and working preferences when resuming development.

Vite + React + TypeScript daily brick game, rendered with Three.js and seeded by the player's local calendar date. Three rounds contain 6, 10, and 14 bricks on a 10×10 grid.

The home screen offers **Daily mode** and **Endless mode**. Endless starts with two bricks and adds two each round, up to the grid's 100 cells, with four balls per round and neon brick colors. Endless layouts and colors are seeded by the local date, so everyone on the same date gets the same round sequence; replays keep the same seed, and share text includes the date. Failure to clear a round ends the run and opens results with sharing and replay. Endless is separate from daily saves and currently resets on leaving or refreshing the mode.

Each round has four balls, consumed on launch. Drag the ball horizontally to position it and drag above it to aim. Clear all bricks or use all four balls to finish a round, then press **Next round** to continue. After round three, **View results** opens the daily results.

One attempt per local date is saved in this browser's local storage. Refreshing restores the round, removed bricks, ball count, combos, aim, and any in-flight shot. Completed games reopen their results; a new local date starts a new game. Saves happen on launch/collision, periodically during flight, and when leaving the page. Multiple tabs are allowed without locking; they share the same local save. Blocked or invalid storage produces a visible error instead of silently restarting.

This is browser-local enforcement: clearing site data, changing the device clock, or using another browser/device can bypass it. Cross-device enforcement would require an account and a server.

## Scoring

Each round scores up to 1,000: 700 for the fraction of bricks cleared, 200 for the best shot's combo, and 100 for spare balls. Each component caps at its maximum; only the final sum is rounded.

| Round | Combo for 200 points | Spare balls for 100 points |
| --- | --- | --- |
| 1 | 4 | 2 |
| 2 | 5 | 1 |
| 3 | 6 | 1 |

Combo points scale from zero for a single brick to 200 at the target. Spare-ball points scale proportionally to the round's target. Wall hits do not break a combo. The round modal shows the score, emoji tier, best combo, and remaining balls/bricks.

Score tiers: 💎 1,000; 🟪 900–999; 🟦 750–899; 🟩 500–749; 🟨 250–499; ⬛ 0–249.

Scoring lives in `src/lib/scoring.ts`. After round three, **View results** shows all round scores and stats with a daily total out of 3,000. **Share** copies three lines: the dated title, all three emoji tiers together, and the total. Copying uses the Clipboard API with an automatic legacy fallback for local-network HTTP previews; no manual copy step is shown. Results persist across reloads.

## Leaderboards

**Zero-cost requirement:** keep this backend on **Workers Free**, which also governs D1's free quotas. Do not enable Workers Paid or paid add-ons for this project. On Free, exhausted request/database quotas make the leaderboard unavailable; they do not become paid overages. Normal gameplay stays available on GitHub Pages. Application rate limits are not a billing cap on a Paid account. Wrangler's OAuth login cannot read the billing subscription, so verify **Workers & Pages → Plans** in the Cloudflare dashboard; a domain's Free plan is a different setting. See [Workers limits](https://developers.cloudflare.com/workers/platform/limits/#daily-requests) and [D1 free quota behavior](https://developers.cloudflare.com/d1/platform/pricing/#what-happens-if-i-exceed-the-daily-limits-on-reads-and-writes-or-the-total-storage-limit-on-the-free-plan).

Each mode has its own leaderboard for the game's local calendar date. Players submit a nickname on the results screen without signing in. Daily accepts one result per browser ID and date; Endless and Arcade keep that browser's best score for the date. The top 20 and the player's own rank are shown, with equal scores sharing a rank.

Nicknames are limited to 10 characters. The form and API share an English profanity/slur filter that checks common disguised spellings; names must contain a letter or number and use only letters, numbers, spaces, or basic punctuation. The database enforces the length limit too. The nickname migration shortens legacy names without changing their scores, and inappropriate legacy names display as "Player".

GitHub Pages still hosts the game. A separate Cloudflare Worker and D1 database handle scores. The Worker accepts a final score and round count, caps scores at 1,000 points per round (3,000 for Daily), limits requests, and keeps only compact score records for 30 days. Browser IDs are not authentication and runs are not verified; this is a casual leaderboard. New powerups do not require backend changes.

Local development:

```sh
npm run leaderboard:migrate:local
npm run leaderboard:dev
```

In another terminal, set `VITE_LEADERBOARD_URL=http://localhost:8787` in `.env.development.local`, then run `npm run dev`. Local D1 data stays separate from production.

Cloudflare setup (an existing deployment already has the database ID in `worker/wrangler.jsonc`):

```sh
npx wrangler login
npx wrangler d1 create dailybreak-scores --config worker/wrangler.jsonc
```

For a new account, put the returned `database_id` in `worker/wrangler.jsonc`, then:

```sh
npm run leaderboard:migrate
npm run leaderboard:deploy
```

Set `VITE_LEADERBOARD_URL` in `.env.production` to the returned `https://dailybreak-leaderboard.<subdomain>.workers.dev` address and rebuild the frontend. This is a public endpoint, not a secret. No Cloudflare tokens belong in frontend environment variables. The configured allowed origins include the production site and localhost development URLs; add another development origin explicitly if needed.

Backend routes are `GET /daily?date=YYYY-MM-DD&browserId=...` and `POST /daily`, with equivalent `/endless` and `/arcade` routes. POST includes `dateKey`, `gameVersion`, `browserId`, `nickname`, `score`, and `roundCount`. Scores and round counts must be integers; Daily requires exactly three rounds. Powerups and detailed round statistics are not submitted. A duplicate Daily submission returns the original entry, so retrying after a network failure is safe. Endless/Arcade update only when the submitted run is better. Runs are limited to 1,000 rounds per submission. Writes accept current local dates worldwide (UTC date ±1 day).

Cloudflare setup references: [D1](https://developers.cloudflare.com/d1/get-started/), [rate limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).

## Development

Use Node.js 22.18+ (or a current LTS).

```sh
npm install
npm run dev
```

```sh
npm test          # deterministic generation, local dates, DST boundaries
npm run build     # TypeScript check and production build into dist/
npm run preview   # serve the production build locally
```

## Add your game

- `src/lib/daily.ts`: `generateDailyGame()` creates three layouts with exact counts from `ROUND_BRICK_COUNTS`. Each round has its own seed and chooses unique cells from the 100-cell grid.
- `src/hooks/useDailyGame.ts`: exposes today's puzzle and updates at local midnight, on focus/visibility changes, and within a minute of device clock/timezone changes.
- `src/components/BrickGrid.tsx`: Three.js perspective table, drag controls, one-bounce aim preview, ball physics, brick collisions, and four-ball round lifecycle.
- `src/App.tsx`: page layout and manual round progression. Date changes reset the game to round one.

The date key uses local `getFullYear()`, `getMonth()`, and `getDate()`; `toISOString()` would use UTC and can select the wrong local day. Everyone on the same local date gets the same seed and generated board, regardless of timezone. Players in different local dates get different seeds.

The seed is a stable hash of `dailybreak-v1:YYYY-MM-DD`. Keep the version, PRNG, generation logic, and input ordering stable to preserve published puzzles. Bumping `GAME_VERSION` changes the sequence. The generator is recreated for every puzzle, so reloads and React Strict Mode produce the same result.

The device clock determines the date; this starter has no server authority or anti-cheat. No player progress is stored yet. If you add local storage, namespace saves by game version and date key.

Scaffolded from the official [Vite React TypeScript template](https://vite.dev/guide/).

## Visit counts

GoatCounter tracks page visits using `https://dailybreak.goatcounter.com/count`.
The public site address is configured with `GOATCOUNTER_URL` in `.env.production`.
The script is included only in production builds; local development sends no
visits. No custom game events are sent. Remove the setting to disable tracking.

View counts at <https://dailybreak.goatcounter.com/>. Ad blockers and network
filters may prevent visits from being counted.
