# Third-party components

This project includes or builds on work by others. Their licences apply to
their parts.

## Included in this repository

- **Maia chess networks** – `models/maia-weights/*.pb.gz` are the original
  weights from [CSSLab/maia-chess](https://github.com/CSSLab/maia-chess);
  `public/maia/*.onnx` are the same networks converted to ONNX with lc0's
  `leela2onnx`, otherwise unmodified. Licensed under the GNU General Public
  License v3.0; a copy is in `models/maia-weights/COPYING`.
- **Reference move probabilities** – `models/reference/*.json` are outputs of
  [lc0](https://github.com/LeelaChessZero/lc0) (GPL-3.0) run on those networks.

## Installed at build time (not in this repository)

| Component | Use | Licence |
|---|---|---|
| [chessground](https://github.com/lichess-org/chessground) | Board | GPL-3.0 |
| [Stockfish](https://github.com/official-stockfish/Stockfish) via [stockfish.js](https://github.com/nmrugg/stockfish.js) | Analysis engine | GPL-3.0 |
| [chess.js](https://github.com/jhlywa/chess.js) | Rules | BSD-2-Clause |
| [ONNX Runtime Web](https://github.com/microsoft/onnxruntime) | Runs the networks | MIT |
| [Capacitor](https://github.com/ionic-team/capacitor) | Android shell | MIT |

A built app bundles chessground, Stockfish and the Maia networks, all GPL-3.0,
so distributing a build means complying with that licence for the whole app.
