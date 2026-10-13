# Bullet Chess – Plan

A personal bullet-chess practice app for Android. Bots of roughly 900–1500
chess.com rating whose *timing* is human: instant in the opening, fast
recaptures and endgames, long thinks on sharp positions, and able to flag or
be flagged. Chess.com is the reference for look and behaviour.

Current position in this plan: see [STATUS.md](STATUS.md).

## Decisions

- **Platform:** Capacitor APK (web code in a WebView). Chosen over native after
  passing the speed gate on the real phone.
- **Stack:** TypeScript, Vite, chessground (board), chess.js (rules),
  Stockfish WASM (single-thread lite build), Capacitor 8.
- **Bot brain:** Maia picks human-like moves; Stockfish measures position
  difficulty for timing and, at the top levels only, catches some blunders.
- **Ratings mean chess.com bullet ratings of real players**, not chess.com's
  bots (which play weaker than their labels) and not Lichess ratings. The 1100
  level is fitted to the user's own public bullet games; the others are spaced
  from it by simulated matches.
- **Strength and pace are separate controls** (two sliders: rating and
  speed), so the user can calibrate each by feel without the other moving.
- **Realism over wishes where data disagrees:** strength is not tied to think
  time, because real players blunder more after long thinks, not less; and
  recaptures are not always instant, because a third are premoved and the rest
  take most of a second.
- **Which Maia:** the original Maia networks (nine levels, 1100–1900 on
  Lichess's scale). They are tiny (3.5 MB, a few milliseconds per move), which
  suits a phone; the newer single-model Maia is far heavier. Run with the ONNX
  runtime in a background thread.
- **Licences:** the Maia weights and the board library (chessground) are
  GPL-3.0. Fine for personal use; it matters if the app is ever distributed.
- **Time controls:** 0.5+0 up to 2+1.
- **Chess.com conventions:** clock starts immediately, every move costs at
  least 0.1 s, multiple premoves, green board and matching effects.
- **Not copied:** chess.com's piece artwork and sounds are proprietary. The app
  uses a free piece set and synthesised sounds.
- **Out of scope:** ratings and rating tracking.

## Phases

| # | Phase | Goal |
|---|-------|------|
| 0 | Speed gate | Prove a WebView is fast enough: touch-to-screen under 50 ms (p95), premove chains at 4 moves/s |
| 1 | Playable game | Board, clocks, premoves, flagging, draws, resign, rematch, sounds, placeholder Stockfish opponent |
| 2 | Time model | Bot think time from position features and clock; all parameters in one file |
| 3 | Human-like moves | Maia networks for move choice across 900–1500 |
| 4 | Calibration | Fit strength and pacing to real chess.com bullet games; name levels by chess.com rating |
| 5 | Extras | Game history with PGN, post-game review with time-per-move chart, bot personalities |

### Phase 4 notes

- Method: judge every move of real games and of simulated bot games with the
  same Stockfish yardstick (lost winning chances per move), and compare
  seconds per move and clock left through the game. Tools: `src/dev/`.
- Reference data: the user's 104 public one-minute games from chess.com
  (`scripts/fetch-chesscom.mjs`), about 5,100 moves by players rated 1050–1200.
- Refining further needs either the user's results against each level, or
  real games from players rated 900 and 1300–1500 (the user's own games barely
  cover those). The Lichess open database is one possible source.
- Dials per level are in `src/bots/levels.ts`; pace is in
  `src/bots/timeModel.ts`.

### Phase 5 notes

- Built: game history with per-rating results and PGN export; review with
  engine verdicts, winning-chances chart and seconds-per-move chart; three
  play styles (Balanced, Aggressive, Solid).
- Not built from the original wish list: fixed opening repertoires, and time
  styles as personalities (e.g. a thinker who gets into time trouble). The
  speed slider covers the simple case; `TimeProfile` is per-bot if more is
  wanted.
- Review reuses the Stockfish worker and the think times recorded per move.

## Ideas parked

- Opening repertoires: have the bot steer into chosen openings for practice.
- Best-move arrow on the review board (today the better move is named in text).
- Underpromotion (promotion is always a queen today).
- Enlarged, lifted piece while dragging, as in the chess.com mobile app.
- A piece set closer to chess.com's default, from a free source.
- Let the bot think on the player's time (prepare replies in advance), so its
  premoves cost no computation at all.

## Working on the project

```bash
npm run dev            # browser at http://localhost:5173
npm run android:apk    # build web app, sync, build debug APK
npm run android:install  # push the built APK to a phone over USB
```

Java and the Android SDK are not on PATH; `scripts/build-apk.mjs` points at
Android Studio's copies. `src/dev/simulate.ts` plays bot-versus-bot games on
simulated clocks for checking pacing without a phone.
