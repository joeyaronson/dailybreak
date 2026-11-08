# Dailybreak handoff — November 7, 2026

## Working preferences

- Mobile first; desktop enhancements come after the phone layout.
- Keep UI copy minimal. No marketing text or unsolicited features.
- Do not write tests or run headless browser checks. A production build is enough for routine code changes.
- Work incrementally on the requested change; keep responses short.
- User chose GitHub Pages with automatic deployment on pushes to `main`, targeting `dailybreak.arons0n.com`. Prepare changes for review; do not push, deploy, or edit external settings without authorization. Keep hosting work concise.

## Current game

- Home screen offers **Daily mode** and **Endless mode**, using `#daily` / `#endless` navigation. **Home** returns to mode selection; browser back works. Daily progress remains saved when leaving the mode.
- Each mode shows its own first-time **How to play** modal. The scene mounts only after **Play**, so no ball/round advances behind the instructions. Dismissal is remembered in local storage by mode (not date); session memory is the fallback if storage is unavailable. Escape returns home without marking the instructions as read.
- The home screen runs an attract-mode version of `BrickGrid`: all four walls are enclosed, ten randomly positioned bricks stay in circulation, and each destroyed brick is immediately replaced at another empty cell away from the ball. It reuses CRT, collision, spin, trail, and impact effects, runs at speed 7, and never reads/writes daily progress. The playfield is at the top of the home content, with mode buttons below it. Reduced motion shows a static scene.
- Home uses a shorter physical field, a flatter camera angle, and a 1.15 canvas aspect ratio. Its last height adjustment was home-only. Gameplay has separately been shortened to 12.25 world units with tighter mobile vertical spacing. Restored in-flight balls are clamped inside the current field bounds. Mode buttons remain in normal flow below the home field; do not overlay them.
- Endless starts with 2 bricks and adds 2 per round (capped at the 100 cells in the current grid), with four fresh balls each round. Clearing progresses manually; an uncleared board after the fourth shot ends the run. Layouts and colors are seeded by local date and game version; everyone on that date gets the same sequence. Colors are selected from magenta, blue, yellow, red, orange, purple, and mint. Replays reuse that date’s seed, and share text includes the date. It has a separate final results view, compact emoji share text, and **Play again**. Endless runs are currently in memory, do not affect daily saves/limits, and reset when leaving/reloading the mode.
- Endless scoring uses the existing 700/200/100 model, with combo target capped at 6 (or the brick count when smaller) and spare-ball target 2.

- Vite, React, TypeScript, Three.js; npm. Start with `npm run dev`, build with `npm run build`.
- Daily seed uses the player's local calendar date, not UTC. A date change resets to round one.
- Three rounds: exactly 6, 10, and 14 bricks placed in a seeded 10×10 grid.
- Round colors: magenta, bright blue (`#3388ff`), yellow. Cyan was too close to the green field; keep blue bright and avoid a purple tint.
- Four balls per round, deducted immediately on launch; configured by `BALLS_PER_ROUND` in `src/lib/daily.ts`.
- Any drag starting below the ball within the field moves it horizontally; any drag starting above it adjusts aim. Classification uses screen position after CRT distortion and stays fixed throughout that drag. Minimum angle is 15° above horizontal. Normal ball speed is 9 world units/second (see temporary debug speed below).
- Dotted aim preview continuously flows through one bounce; it shares the collision tracing with the ball.
- Ball bounces off walls and destroys bricks. It explodes when exiting the bottom, then the next ball becomes ready after the effect.
- Clearing all bricks ends the round immediately. Otherwise the round ends after all four shots return.
- Round-end modal stays inside the playfield, tracing its outline with a beam and revealing its contents. It shows balls remaining and bricks remaining, with **Next round** for manual progression. Final round shows **Game complete** and **View results**. Escape dismisses it; **Round results** reopens it. Clearing the last brick waits 800ms before opening the modal.
- Brick-hit combo resets each launch. First hit is counted but has no popup; subsequent hits display 2x, 3x, etc.
- Thin outline hit numbers originate at the destroyed brick's center, grow and rise together, then fade. Full animation is 650ms.
- Round scoring is implemented: 700 clearance points + 200 best-combo points + 100 spare-ball points, capped per component and rounded once at the final sum. Combo targets are 4/5/6; spare-ball targets are 2/1/1. One hit earns zero combo bonus. The modal shows the round score out of 1,000, emoji tier, and best combo alongside remaining balls/bricks.
- Emoji tiers: 💎 1,000; 🟪 900+; 🟦 750+; 🟩 500+; 🟨 250+; ⬛ below 250. Final results page shows each round's score and stats, with total /3000. **Share** copies three lines: dated title, all round emojis together without spaces, and total /3000. Share copies directly to the clipboard, with an automatic hidden-selection fallback for local-network HTTP phone previews. There is no manual-copy textarea; failures show a retry message.
- One attempt per local date is saved in browser local storage, scoped by game version. Reload restores the round, destroyed bricks, balls, best/active combo, ball position/direction, and aim. In-flight shots resume; returning balls settle without granting another shot. Completed rounds are recorded immediately; finishing round three locks the day and future reloads show results. No restart action is provided.
- Multiple tabs are allowed at the user’s request. Do not add tab locks or simultaneous-play blocking. Tabs share the same local save. Invalid/blocked storage fails visibly rather than resetting an attempt. Browser-local enforcement is bypassable by clearing site data or switching browsers/devices; no account/server exists.
- Ball speed is 15 world units/second. The temporary 10× debugging speed has been removed.

## Appearance and effects

- All interface corners are sharp; do not add border radii. The playfield has actual CRT barrel distortion via Three.js postprocessing, with glass reflections and edge shading. The cabinet frame stays square. Input and hit-popup coordinates are mapped through the same distortion.
- Phone controls suppress text selection, long-press callouts, native dragging, and horizontal overscroll navigation. Active playfield touch events prevent browser handling; edge-start gestures alongside the field are guarded. Normal page scrolling remains available outside gameplay, and share textareas remain selectable.
- Text uses bright pale-green cores and tight glow to make Bungee Hairline readable; broad blur alone was insufficient.

- Tilted perspective table, taller wireframe side/back walls, open bottom.
- Oscilloscope/CRT style: dark green field, glowing lines, subtle scanlines/grain/vignette, irregular subpixel jitter. No rolling scan band.
- Bungee Hairline is the active font, bundled under `public/fonts/` with its license. It uses its regular 400 weight without synthetic bolding. Oxanium is retained as an unused local asset.
- Brick faces write depth without color, hiding back edges while keeping the faces visually see-through.
- Level intro traces the field, ball, and arrows over 1.725 seconds, with a pronounced edge beam and drawing tip.
- Bricks then fall from above the viewport in a staggered sequence with a small landing bounce. Launch is disabled during setup.
- A faint beam continuously retraces the field and remaining bricks. A separate edge beam follows the moving ball.
- Ball spins with travel and leaves fading wireframe afterimages, not a line trail.
- Bricks break into mildly tumbling edge fragments; green sparks appear on wall and brick impacts.
- Minor screen shake occurs on collisions. Respect existing reduced-motion handling.

## Important files

- `src/lib/daily.ts`: date key, seed/hash/PRNG, deterministic round layouts and counts.
- `src/lib/scoring.ts`: deterministic round score calculation, per-round targets, and emoji tiers.
- `src/lib/crt.ts`: curved-screen shader and forward/inverse coordinate mapping for controls and hit popups.
- `src/lib/progress.ts`: validated daily saves and round snapshots; malformed saves must not silently reset to a fresh attempt.
- `src/hooks/useDailyGame.ts`: midnight, focus, visibility, and clock/timezone refresh handling.
- `src/App.tsx`: round state, round colors, manual progression, date-keyed reset.
- `src/components/BrickGrid.tsx`: Three.js scene, input, physics, effects, lives, intro, and hit popups. Most game logic currently lives here.
- `src/components/RoundSummary.tsx`: playfield-contained dialog with SVG beam intro, keyboard focus handling, round statistics, and progression; added November 8, 2026.
- `src/components/GameResults.tsx`: final round breakdown, daily total, and clipboard sharing.
- `src/components/HomeScreen.tsx`: mode selection.
- `src/components/ModeIntro.tsx`: first-time instructions and per-mode acknowledgement.
- `src/components/EndlessMode.tsx`: unlimited replayable runs, growing layouts, random neon colors, and end-of-run results.
- `src/components/BallIndicator.tsx`: shared spinning wireframe indicators. Uses actual projected 3D ring rotation on both axes, not the earlier CSS ellipse/tilt experiments.
- `src/App.css`: layout, CRT overlays, jitter, button/life styles, and hit-popup animation.
- `src/index.css`: local font and global styling.
- `vite.config.ts`: deliberately forces a full browser reload on `BrickGrid.tsx` edits. Normal Fast Refresh failed to update the scene reliably; user confirmed full reload fixed it. Preserve this workaround.

## Implementation notes

- Every effect setup creates a fresh renderer-owned canvas. Reusing a canvas after `forceContextLoss()` broke initialization under React Strict Mode. Keep the fresh-canvas lifecycle and cleanup.
- Never increment mutable counters inside React functional state updaters: Strict Mode exposed this as 2x, 4x, 6x. Increment before the updater; keep the updater pure.
- Collision tracing uses radius-expanded brick boxes and continuous movement sweeps. This approximates rounded ball/brick corners.
- The existing early test files were created before the user asked to skip tests. Do not add more tests by default.
- Recent production builds passed; Vite reports a bundle-size warning from Three.js. No browser automation has been used.
- All project files were still untracked at this handoff; no commits or pushes have been made by the assistant.
- GitHub Pages workflow is prepared in `.github/workflows/deploy.yml`; production build passes. No initial commit, push, live deployment, Pages settings update, or DNS change has been performed. Next: user sets Pages source to GitHub Actions, custom domain to `dailybreak.arons0n.com`, then Squarespace CNAME `dailybreak` → `joeyaronson.github.io`. Commit/push to `main` will deploy. Instructions are in README's Hosting section. Local origin is `https://github.com/joeyaronson/dailybreak.git`.

## Latest modal details

- Remaining balls animate on one at a time as spinning wireframe icons; spent balls stay as empty outlines. There are four slots.
- Bricks remaining counts up after the beam intro, with a small brick icon in the round color. Zero is displayed as **All clear**.
- Spare-ball scoring targets remain 2/1/1; the extra fourth ball does not change the scoring formula.
