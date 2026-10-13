import type { PlayerColor } from '../core/game';
import type { SavedGame } from '../core/history';
import { importPgn, PgnError } from '../core/pgnImport';
import { chips, h } from './dom';

/** What was last pasted, so coming back from a review does not empty the box. */
let draft = '';

/** Paste a game from elsewhere and send it to the review. */
export function renderImport(
  root: HTMLElement,
  onBack: () => void,
  onReview: (game: SavedGame) => void,
): void {
  let playerColor: PlayerColor = 'white';
  const text = h('textarea', {
    class: 'pgn-input',
    attrs: {
      placeholder: 'Paste the game here. On chess.com: open the game, tap Share, choose PGN, copy.',
      spellcheck: 'false',
      autocapitalize: 'off',
      autocomplete: 'off',
    },
  });
  text.value = draft;
  text.addEventListener('input', () => (draft = text.value));
  const message = h('div', { class: 'import-message' });

  const paste = h('button', {
    class: 'secondary',
    text: 'Paste from clipboard',
    onTap: () => {
      // Not every Android WebView allows this; pasting into the box by hand always works.
      if (!navigator.clipboard?.readText) {
        message.textContent = 'Long-press the box above and choose Paste.';
        return;
      }
      navigator.clipboard.readText().then(
        clip => {
          text.value = draft = clip;
          message.textContent = clip.trim() ? '' : 'The clipboard is empty.';
        },
        () => (message.textContent = 'Long-press the box above and choose Paste.'),
      );
    },
  });

  const analyse = h('button', {
    class: 'primary play',
    text: 'Analyse',
    onTap: () => {
      try {
        onReview(importPgn(text.value, playerColor));
      } catch (error) {
        // Anything unexpected is still a game the app could not read.
        message.textContent =
          error instanceof PgnError ? error.message : 'That game could not be read.';
      }
    },
  });

  root.replaceChildren(
    h(
      'div',
      { class: 'import' },
      h(
        'div',
        { class: 'screen-head' },
        h('button', { class: 'secondary small', text: '‹ Back', onTap: onBack }),
        h('div', { class: 'screen-title' }, h('div', { text: 'Analyse a game' })),
      ),
      text,
      h('div', { class: 'import-row' }, paste),
      h('h2', { text: 'You played' }),
      chips<PlayerColor>(
        [
          { value: 'white', label: 'White' },
          { value: 'black', label: 'Black' },
        ],
        playerColor,
        value => (playerColor = value),
      ),
      message,
      analyse,
    ),
  );
}
