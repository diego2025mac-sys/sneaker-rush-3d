// Entry point: boot the CrazyGames SDK (optional), load the save, build the world, start the loop.
import { DEBUG_MODE } from './config/balance.js';
import { PlatformManager } from './core/PlatformManager.js';
import { SaveManager } from './core/SaveManager.js';
import { Game } from './core/Game.js';

const fill = document.getElementById('load-fill');
const text = document.getElementById('load-text');
const progress = (p, t) => {
  fill.style.width = `${Math.round(p * 100)}%`;
  if (t) text.textContent = t;
};

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch {
    return false;
  }
}

async function boot() {
  document.addEventListener('touchmove', (e) => { if (e.target.closest?.('.p-body')) return; e.preventDefault(); }, { passive: false });
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '0'].includes(e.key)) e.preventDefault(); });

  if (!webglAvailable()) {
    text.textContent = 'Your browser does not support WebGL – please try a different browser.';
    return;
  }
  const local = ['localhost', '127.0.0.1', ''].includes(location.hostname);
  // Production bundles define __PRODUCTION__ = true, which removes the ?debug=1 backdoor entirely.
  const prod = typeof __PRODUCTION__ !== 'undefined' && __PRODUCTION__;
  const debug = DEBUG_MODE || (!prod && local && new URLSearchParams(location.search).has('debug'));

  progress(0.05, 'Connecting…');
  const platform = new PlatformManager();
  await platform.init();
  platform.loadingStart();

  const game = new Game({ canvas: document.getElementById('game'), platform, save: new SaveManager(), debug, onProgress: progress });
  await game.init();
  platform.loadingStop();
  game.start();
  const loading = document.getElementById('loading');
  loading.classList.add('fade');
  setTimeout(() => loading.remove(), 700);
  document.getElementById('game').focus();
}

boot().catch((e) => {
  console.error(e);
  text.textContent = 'Something went wrong while loading. Please refresh.';
});
