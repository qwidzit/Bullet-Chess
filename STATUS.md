# Bullet Chess – Status

Last updated: 2026-10-13. The plan and the reasons behind it are in
[PLAN.md](PLAN.md). Update this file at the end of every work session.

## Where we are

**All six phases have a first version. The phone has the build with sliders,
archive, review, play styles and end-of-game statistics; the newest build
(time-control sliders, 5–200% speed, move ranks and accuracy in the review)
is built but not yet installed. None of the parts added since calibration has
been confirmed working on the phone yet. Next:
the user tunes rating and speed by feel with the two sliders and reports
back; their findings become the new defaults.**

The code is on GitHub at https://github.com/qwidzit/Bullet-Chess (public),
under GPL-3.0.

| # | Phase | State |
|---|-------|-------|
| 0 | Speed gate | Done. Passed on the phone |
| 1 | Playable game | Done |
| 2 | Time model | Done; rebuilt in phase 4 on real data |
| 3 | Human-like moves (Maia) | Done; works on the phone |
| 4 | Calibration | First pass done; the user is now calibrating by hand with the sliders |
| 5 | Extras | First version built and tested in the browser; not yet on the phone |

## Rating and speed are separate controls

At the user's request (2026-10-13) the fixed levels became two sliders, so
strength and pace can be judged independently:

- **Rating**, 800–1600 in steps of 50. Ratings between calibrated levels are
  blended: temperature on a log scale, care linearly, and each move drawn from
  the lower or upper level's network in proportion.
- **Speed**, 5%–200% in steps of 5. 100% is the pace measured from real
  players near 1100; 200% moves twice as fast, 5% twenty times slower. It no
  longer depends on rating (the earlier per-level pace was a guess from a
  small sample and is gone).

Time controls are sliders too: starting time from 30 seconds to 20 minutes
and increment from 0 to 15 seconds, both on uneven stops (increment includes
0.5 and 1.5). Only one-minute games were measured; the pacing for everything
else is scaled by rule, and beyond about 2+1 it is untested even in
simulation.

The Archive screen totals wins, losses and draws per bot rating. It counts
only games the player chose to archive, so it is a fair score only if every
game against a rating is archived, not just the memorable ones.

## Phase 4: what was wrong and what changed

The user (chess.com bullet 1092) could not beat "Maia 1100" but beat
"Maia 1500". Measured causes:

1. **The clock, mostly.** The bots took 0.26 s per move when low on time and
   never lost on time in simulation. Real players near 1100 take 0.65 s and
   44% of their games end on time.
2. **Accuracy, somewhat.** That bot blundered on 4.5% of moves; real players
   near 1100 blunder on 6.3%. The extra strength came from a "second look"
   with Stockfish on long thinks.
3. **Level names.** They were Lichess ratings of the training data, not
   chess.com bullet ratings.
4. The win against 1500 was most likely luck: each level loads its own
   network, and 1500 measured clearly stronger than 1100.

Changes:

- **Pacing rebuilt from real games.** Players spend about the same on every
  middlegame move while they have time, barely speed up when low, and vary a
  lot from game to game. See the header of `src/bots/timeModel.ts`.
- **Strength no longer tied to think time.** In real games long thinks go with
  more blunders (10% after 2–5 s against 4% on quick moves).
- **Seven levels named by chess.com bullet rating, 900–1500**, replacing
  Maia 1100–1900. Defined in `src/bots/levels.ts`.

### The 1100 level against real players rated 1050–1200

| Measure | Real players | Bot 1100 |
|---|---|---|
| Moves that are blunders | 6.3% | 6.0% |
| Moves that are mistakes or worse | 13.6% | 12.8% |
| Seconds per opening move | 0.93 | 0.94 |
| Seconds per recapture | 0.73 | 0.70 |
| Seconds per other move (10 s or more left) | 1.55 | 1.59 |
| Seconds per move under 10 s | 0.66 | 0.58 |
| Clock left after move 10 / 20 / 30 / 40 | 49 / 32 / 18.5 / 11.5 s | 48 / 30 / 17 / 10 s |
| Games ending on time | 44% | 24% (bot against itself) |

Real figures: 5,144 moves from the user's 104 public one-minute games. Bot
figures: 2,931 moves from 50 simulated games, taken just before one last
small pace change (typical think 1.60 s to 1.55 s) that has not been
re-measured. "Blunder" is a move losing 20
or more points of winning chances, "mistake" 10 or more, judged by Stockfish
at depth 10.

### The other levels

Spaced by simulated matches, aiming for about 64% against the level below
(a 100-point gap). Results are in the table under "Level ladder" below.
These levels are **not** checked against real players of those ratings: the
user's games hold too few opponents outside 1050–1200.

#### Level ladder

| Level | Network | Temperature | Care | Score against the level below |
|---|---|---|---|---|
| 800 | Maia 1100 | 2.4 | – | extrapolated, never tested |
| 900 | Maia 1100 | 1.8 | – | – |
| 1000 | Maia 1100 | 1.35 | – | 66% (80 games) |
| 1100 | Maia 1100 | 1.0 | – | 63% (80 games) |
| 1200 | Maia 1300 | 0.88 | – | 68% (80 games, at temperature 0.85) |
| 1300 | Maia 1500 | 0.86 | – | 70% (50 games, at 0.84); 58% (80 games, at 0.90) |
| 1400 | Maia 1700 | 0.76 | 0.15 | 57% (50 games, at 0.80) |
| 1500 | Maia 1900 | 0.7 | 0.25 | 67% (50 games, against 1400 at 0.80) |
| 1600 | Maia 1900 | 0.58 | 0.4 | extrapolated, never tested |

Target is 64%. Each match is uncertain by about 6 points (roughly 40–50
rating points). Where a score was off target the temperature was nudged
afterwards, so the 1200, 1300 and 1400 rows show the setting that was tested,
not the final one, and the final settings are untested. Those matches were
also played with each level at its own pace (faster at higher ratings), which
has since been removed; every level now plays at the same pace. What the dials do,
from the experiments: temperature 0.7 instead of 1 is worth about +150
points, 1.9 instead of 1 about −170, a stronger network up to about +150,
care 0.5 about +70.

## Results from earlier phases

- **Speed gate (HONOR DNP-NX9, Android 16, 120 Hz):** touch-to-screen average
  16 ms, p95 23 ms, max 27 ms over 69 moves; peak 5 moves in one second. Edge
  swipes on the a- and h-files work. Capacitor is confirmed.
- **Maia correctness:** the app's move probabilities match lc0 (the reference
  engine) to within 0.07 percentage points in 8 test positions on two networks.
- **Maia speed (this PC):** about 15 ms per move including the Stockfish
  analysis. Works on the phone; not timed there.

## What exists

- **Game:** legal play, clocks (chess.com rules), flagging, all draw types,
  two-tap resign, rematch, Copy PGN, auto-queen promotion.
- **Input:** tap-tap and drag. A touch only becomes a drag after travelling a
  quarter of a square, so a tap with a slightly moving finger still selects.
  A piece dragged by finger is drawn 1.85 times its size and raised most of a
  square above the fingertip; a tap never triggers this.
- **Premoves:** unlimited queue with the pieces shown at their destinations;
  a failed premove drops the queue; tapping an empty square cancels.
- **Look:** chess.com-style green board, highlights, move hints, king badges at
  game end, result dialog, material lead, move list under the board.
- **Opponents:** a human-like bot set by a rating slider and a speed slider,
  plus `Instant` and `Scrambler` speed tests.
- **How a bot moves:** Maia gives each legal move the probability a human
  plays it and the bot samples from those. Lower ratings sample more loosely,
  higher ratings more tightly and from a stronger network; from 1400 up the
  bot also catches some of its own blunders with Stockfish.
- **Play styles:** Balanced, Aggressive (leans to captures, checks, pawn
  pushes) and Solid (castles early, fewer checks and pawn pushes). They tilt
  move probabilities by kind of move; in a four-game check the aggressive bot
  captured on 34% of its moves against 19% for the solid one. Their effect on
  strength is unmeasured: calibration was done with Balanced.
- **Archive:** a game is kept on the device only when the player taps Archive
  on the result dialog or in the review (up to 400). The Archive screen lists
  them with a table of wins, losses and draws per bot rating, and exports PGN
  with clock times, one game or all.
- **End-of-game statistics:** average moves per second, most moves in one
  second, premoves played out of premoves queued, longest chain of premoves in
  a row, and longest move. Shown on the result dialog and, for archived games,
  in the review. These replaced the latency readout, which is gone from the
  app (its code is in the first commit if it is ever needed again).
- **Review:** step through any game. Every move gets a rank on chess.com's
  scale (Brilliant, Great, Best, Excellent, Good, Book, Inaccuracy, Mistake,
  Miss, Blunder), shown as a badge on the board, in the move list and as a
  count per player; errors also name the better move. Both players get an
  accuracy score. Charts of the player's winning chances and of seconds per
  move for both sides, both scrubbable. Verdicts are stored with archived
  games after the first review.
  - Best down to Blunder use the thresholds chess.com publishes (winning
    chances lost: 2, 5, 10, 20 points). Brilliant, Great and Miss follow its
    descriptions with simple rules, and Book uses a built-in list of 106
    opening lines, so individual labels will sometimes differ from chess.com.
  - Accuracy uses the formula Lichess publishes; chess.com's is private.
  - On 30 of the user's real games (2,170 moves): Best 34%, Excellent 13%,
    Good 22%, Book 6%, Inaccuracy 10%, Mistake 5.8%, Miss 1.6%, Blunder 4.6%,
    Great 1.3 per game, Brilliant 0.1 per game (three in thirty games);
    median accuracy 77.5.
  - The engine is the small Stockfish at depth 10, so its verdicts are
    noisier than chess.com's server analysis.
- **Android:** portrait lock, screen kept on, fullscreen, back-swipe blocked
  over the board.

## Where things live

| Area | File |
|------|------|
| Level table and blending between levels | `src/bots/levels.ts` |
| Time model and all its tunable numbers | `src/bots/timeModel.ts` |
| Maia bot, play styles, building a bot from rating and speed | `src/bots/maiaBot.ts` |
| Archived games and PGN export | `src/core/history.ts` |
| End-of-game statistics (tallied in the game, shown by) | `src/core/game.ts`, `src/ui/statsTable.ts` |
| Engine review, move ranks, accuracy (also the calibration yardstick) | `src/core/review.ts` |
| Opening lines that count as Book | `src/core/openingBook.ts` |
| History and review screens, review charts | `src/ui/historyScreen.ts`, `reviewScreen.ts`, `charts.ts` |
| Maia input encoding, move table, inference worker | `src/bots/maia/` |
| Position features fed to the time model | `src/bots/moveContext.ts` |
| Stockfish client and shared engine | `src/bots/uciEngine.ts`, `engine.ts` |
| Game rules, clocks, premove queue | `src/core/game.ts`, `clock.ts`, `premoves.ts` |
| Screens and styling | `src/ui/`, `src/style.css` |
| Calibration tools: simulate, judge, queue of runs | `src/dev/simulate.ts`, `calibrate.ts`, `bench.ts` |
| Automated tests | `tests/` |
| Download real games from chess.com | `scripts/fetch-chesscom.mjs` |
| Real games used for calibration (ratings, moves, clocks; no names) | `models/calibration/` |
| Maia networks as shipped (ONNX) | `public/maia/` |
| Original Maia weights, lc0 reference probabilities | `models/` |
| Native Android tweaks | `android/app/src/main/java/.../MainActivity.java` |

## Open questions and known gaps

- **The user's findings from the sliders.** Which rating feels like an even
  match (expected: about 1100 at 100% speed, if calibration is right), and
  which speed feels like real opponents. Those become the new defaults, and a
  consistent offset would mean shifting the whole level table.
- Phase 5 features (history, review, play styles) and the sliders have not
  run on the phone. Review speed there is unknown; on this PC a 50-move game
  is analysed in well under a second.
- Ratings between calibrated levels are blended by rule, not tested.
- The calibration figures in this file were measured before the review
  engine began searching two candidate moves per position. The yardstick is
  the same in kind, but re-measured numbers may differ slightly.
- Only the 1100 level is fitted to real players. Each simulated match has an
  uncertainty of about 40 rating points, and bot-against-bot spacing may not
  carry over exactly to play against a person.
- Bots lose on time less often than real players do (24% against 44% in
  like-for-like games), even though their pace now matches.
- The time model is fitted to one-minute games only. Other time controls are
  scaled from it by rule of thumb.
- With a piece selected during premoving, tapping another own piece in its
  line premoves onto it rather than selecting it. Awaiting feedback.
- Pieces and sounds are not chess.com's (proprietary). A closer free piece set
  is an open option.
- The automated tests (`npm test`, 117 of them) cover the clock, premove
  queue, game endings, statistics, time model, level table, review, opening
  book, archive and settings, and compare the Maia pipeline with lc0's
  recorded probabilities. They do not cover the screens, the bots' move
  sampling, or anything on a real phone. There is no continuous integration:
  the tests run only when someone runs them.
