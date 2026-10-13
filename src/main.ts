import '@lichess-org/chessground/assets/chessground.base.css';
import '@lichess-org/chessground/assets/chessground.cburnett.css';
import './style.css';

import { App } from '@capacitor/app';
import type { SavedGame } from './core/history';
import { loadSettings } from './core/settings';
import * as sounds from './core/sounds';
import { GameScreen } from './ui/gameScreen';
import { renderHistory } from './ui/historyScreen';
import { renderHome } from './ui/home';
import { renderImport } from './ui/importScreen';
import { ReviewScreen } from './ui/reviewScreen';

const root = document.getElementById('app')!;
const settings = loadSettings();
let gameScreen: GameScreen | undefined;
let reviewScreen: ReviewScreen | undefined;
/** What the back button does on the current screen; undefined on the home screen. */
let goBack: (() => void) | undefined;

/** Tears down whichever screen holds resources before another replaces it. */
function leave(): void {
  gameScreen?.dispose();
  gameScreen = undefined;
  reviewScreen?.dispose();
  reviewScreen = undefined;
}

function showHome(): void {
  leave();
  goBack = undefined;
  renderHome(root, settings, showGame, showHistory, showImport);
}

function showImport(): void {
  leave();
  goBack = showHome;
  renderImport(root, showHome, game => showReview(game, showImport));
}

function showGame(): void {
  leave();
  // Audio can only be switched on from inside a tap.
  sounds.setEnabled(settings.sound);
  sounds.unlock();
  gameScreen = new GameScreen(root, settings, showHome, game => showReview(game, showHome));
  // A game in progress is never abandoned by the back button.
  goBack = () => {
    if (!gameScreen?.inProgress) showHome();
  };
}

function showHistory(): void {
  leave();
  goBack = showHome;
  renderHistory(root, showHome, game => showReview(game, showHistory));
}

function showReview(game: SavedGame, back: () => void): void {
  leave();
  goBack = back;
  reviewScreen = new ReviewScreen(root, game, back);
}

// Android's back button and edge-swipe.
void App.addListener('backButton', () => {
  if (goBack) goBack();
  else void App.minimizeApp();
});

// No long-press menus over the board or buttons, but text boxes keep theirs: it is how you paste.
document.addEventListener('contextmenu', e => {
  if (!(e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement)) e.preventDefault();
});

showHome();
