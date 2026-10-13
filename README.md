# Bullet Chess

An Android app for practising bullet chess against bots that play, and use
their clock, like real people.

Most chess bots are useless for bullet practice: they move at an even,
inhuman pace, never get into time trouble, and cannot be beaten on the clock.
These bots are fitted to real one-minute games. They rattle off their opening
moves, premove some recaptures, sink into thought in sharp positions, barely
speed up when they should, and lose on time.

## What it does

- **Human-like opponents.** Move choice comes from the
  [Maia](https://github.com/CSSLab/maia-chess) neural networks, which predict
  what a human of a given strength would play, mistakes included.
- **Two independent sliders:** rating (800–1600, on the scale of chess.com
  bullet ratings) and speed (5%–200% of the pace measured from real players).
- **Any time control** from 30 seconds to 20 minutes, with an increment from
  0 to 15 seconds.
- **Bullet-grade input:** tap or drag, an unlimited queue of premoves shown on
  the board, a lifted enlarged piece while dragging, chess.com clock rules.
- **Review:** every move ranked from Brilliant to Blunder, accuracy for both
  players, a winning-chances chart and a seconds-per-move chart.
- **Archive:** keep the games you choose, see your score against each bot
  rating, export PGN with clock times.
- **Analyse any game:** paste PGN from chess.com or anywhere else and get the
  same review.
- **Characters:** a playing style (Balanced, Aggressive, Solid), a clock
  style (Natural, Speedster, Thinker, Scrambler) and, if you want to practise
  one, an opening the bot will steer into.

## How faithful is it?

Honest answers, because the point of the app is realism:

- The **1100 level is fitted to real data**: about 5,000 moves from real
  chess.com bullet games between players rated 1050–1200. On blunder rate,
  seconds per move and clock left through the game, the bot lands close to
  those players; the figures are in STATUS.md.
- **Other ratings are spaced by simulation**, each tuned to score about 64%
  against the level 100 points below. They are not checked against real
  players of those ratings, and 800 and 1600 are extrapolated.
- **Pacing was measured on one-minute games only.** Other time controls are
  scaled from it by rule.
- **Only the Balanced and Natural characters are measured.** The other
  playing and clock styles are hand-built variations, and they shift a bot's
  strength by an amount nobody has measured.
- **Move ranks** use the thresholds chess.com publishes for Best down to
  Blunder. Its rules for Brilliant, Great and Miss are private, so those
  follow its descriptions. **Accuracy** uses the formula Lichess publishes.
  The engine is a small Stockfish, so verdicts are noisier than a server's.

[STATUS.md](STATUS.md) has the measurements; [PLAN.md](PLAN.md) has the design
and the reasons behind it.

## Building

You need [Node.js](https://nodejs.org) 22 or later. For the Android app you
also need [Android Studio](https://developer.android.com/studio), which
supplies the Java runtime and Android SDK the build script looks for.

```bash
npm install
```

Run it in a browser, at phone size, for development:

```bash
npm run dev
```

Build the Android app (a debug APK):

```bash
npm run android:apk
```

Install the built APK on a phone connected over USB with debugging enabled:

```bash
npm run android:install
```

Run the tests:

```bash
npm test
```

The two Android commands are written for Windows and assume Android Studio's
default install locations; set `JAVA_HOME` and `ANDROID_HOME` if yours
differ. On other systems, run `npm run android:sync` and build the `android`
folder with Android Studio or Gradle.

## How it is put together

| Part | Where |
|---|---|
| Game rules, clocks, premove queue | `src/core/` |
| Bots: Maia inference, strength levels, time model | `src/bots/` |
| Screens | `src/ui/` |
| Engine review, move ranks, accuracy | `src/core/review.ts` |
| Calibration tools (bot-versus-bot simulation, measurement) | `src/dev/` |
| Maia networks as shipped | `public/maia/` |
| Tests | `tests/` |

The app is a web page inside an Android shell
([Capacitor](https://capacitorjs.com)). The board is
[chessground](https://github.com/lichess-org/chessground), the rules are
[chess.js](https://github.com/jhlywa/chess.js), and both the Maia networks and
[Stockfish](https://stockfishchess.org) run on the phone in background
threads. Nothing is sent anywhere; there is no server and no account.

The tests cover the clock, the premove queue, game endings, the time model,
the level table, the review and the archive. They also run the Maia networks
and compare the app's move probabilities with those of the reference engine,
lc0. The screens themselves are not covered.

## Licence

GPL-3.0; see [LICENSE](LICENSE). The app builds on GPL-3.0 work (the Maia
networks, chessground and Stockfish), listed with their sources in
[NOTICE.md](NOTICE.md).

The pieces are the free "cburnett" set and the sounds are synthesised. This
project is not affiliated with chess.com or Lichess.
