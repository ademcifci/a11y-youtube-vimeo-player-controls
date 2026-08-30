/**
 * @file Application entry point and public player factory.
 *
 * Provides URL parsing helpers, {@link createA11yPlayer} for programmatic use,
 * declarative initialization via `[data-a11y-player]`, and the demo page form.
 *
 * @module main
 */

import { createPlatformPlayer } from './adapters/base.js';
import { A11yControls } from './a11y-controls.js';

/**
 * @typedef {object} A11yPlayerConfig
 * @property {string} [platform] `youtube` (default) or `vimeo`.
 * @property {string} videoId Platform-specific video identifier.
 * @property {string} [title] Accessible name used in control labels.
 * @property {number} [skipSeconds] Rewind/forward interval in seconds.
 * @property {boolean} [captionsDefault] Initial captions state (default true).
 * @property {string} [captionLanguage] Preferred caption track language code.
 */

/**
 * Parse a YouTube URL or bare video ID.
 * @param {string} input
 * @returns {string|null}
 */
export function parseYouTubeId(input) {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match) return match[1];
  }

  return null;
}

/**
 * Parse a Vimeo URL or bare video ID.
 * @param {string} input
 * @returns {string|null}
 */
export function parseVimeoId(input) {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const patterns = [
    /vimeo\.com\/(?:video\/)?(\d+)/,
    /^(\d+)$/,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match) return match[1];
  }

  return null;
}

/**
 * Detect platform and video ID from user input.
 * @param {string} input
 * @returns {{ platform: string, videoId: string }|null}
 */
export function parseVideoInput(input) {
  const youtubeId = parseYouTubeId(input);
  if (youtubeId) {
    return { platform: 'youtube', videoId: youtubeId };
  }

  const vimeoId = parseVimeoId(input);
  if (vimeoId) {
    return { platform: 'vimeo', videoId: vimeoId };
  }

  return null;
}

/**
 * Create a fully wired accessible player inside a mount element.
 *
 * Flow: build control UI → await platform adapter → attach adapter to controls.
 * Controls are disabled until the adapter is ready.
 *
 * @param {HTMLElement} mount Empty element that will receive the player shell.
 * @param {A11yPlayerConfig} config
 * @returns {Promise<{ controls: A11yControls, player: import('./adapters/base.js').PlatformPlayerBase }>}
 */
export async function createA11yPlayer(mount, config) {  const platform = config.platform || 'youtube';
  const videoId = config.videoId;
  const title = config.title || 'Video';

  if (!videoId) {
    throw new Error('A video ID is required.');
  }

  mount.replaceChildren();
  mount.className = 'a11y-player-mount';

  const shell = document.createElement('div');
  shell.tabIndex = 0;
  shell.setAttribute('role', 'group');
  shell.setAttribute('aria-label', `${title}, YouTube/Vimeo player controls`);
  mount.appendChild(shell);

  const controls = new A11yControls(shell, null, {
    title,
    skipSeconds: config.skipSeconds,
  });

  const player = await createPlatformPlayer(platform, controls.getVideoContainer(), videoId, {
    title,
    captionsDefault: config.captionsDefault,
    captionLanguage: config.captionLanguage,
  });

  controls.attachPlayer(player);

  return { controls, player };
}

/**
 * Tracks the demo page player instance so it can be destroyed on reload.
 * @type {{ controls: A11yControls|null, player: import('./adapters/base.js').PlatformPlayerBase|null }}
 */
let activeInstance = { controls: null, player: null };

/**
 * Destroy the active player instance if one exists.
 */
export function destroyActivePlayer() {  activeInstance.controls?.destroy();
  activeInstance.player?.destroy();
  activeInstance = { controls: null, player: null };
}

/**
 * Scan the document for `[data-a11y-player]` mounts and initialize each one.
 * Missing `data-video-id` renders an inline alert in the mount element.
 * @private
 */
function initEmbedPlayers() {  const nodes = document.querySelectorAll('[data-a11y-player]');

  nodes.forEach(async (node) => {
    if (!(node instanceof HTMLElement)) return;

    const platform = node.dataset.platform || 'youtube';
    const videoId = node.dataset.videoId;
    const title = node.dataset.title || 'Video';

    if (!videoId) {
      node.replaceChildren();
      const alert = document.createElement('p');
      alert.setAttribute('role', 'alert');
      alert.textContent = 'Missing data-video-id attribute.';
      node.appendChild(alert);
      return;
    }

    try {
      await createA11yPlayer(node, { platform, videoId, title });
    } catch (error) {
      node.replaceChildren();
      const alert = document.createElement('p');
      alert.setAttribute('role', 'alert');
      alert.textContent = error instanceof Error ? error.message : 'Failed to load player.';
      node.appendChild(alert);
    }
  });
}

/**
 * @param {HTMLInputElement} input
 * @param {HTMLElement} errorEl
 * @param {string} message
 */
function showInputError(input, errorEl, message) {
  input.setAttribute('aria-invalid', 'true');
  errorEl.textContent = message;
  input.focus();
}

/**
 * @param {HTMLInputElement} input
 * @param {HTMLElement} errorEl
 */
function clearInputError(input, errorEl) {
  input.removeAttribute('aria-invalid');
  errorEl.textContent = '';
}

/**
 * Wire the demo page URL form: parse input, load player, surface form errors.
 * @private
 */
function initDemoPage() {  const form = document.querySelector('[data-demo-form]');
  const input = document.querySelector('[data-demo-input]');
  const mount = document.querySelector('[data-demo-player]');
  const errorEl = document.querySelector('[data-demo-error]');

  if (!(form instanceof HTMLFormElement) || !(input instanceof HTMLInputElement) || !(mount instanceof HTMLElement) || !errorEl) {
    return;
  }

  input.addEventListener('input', () => {
    if (input.getAttribute('aria-invalid') === 'true') {
      clearInputError(input, errorEl);
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearInputError(input, errorEl);

    const parsed = parseVideoInput(input.value);
    if (!parsed) {
      showInputError(input, errorEl, 'Enter a valid YouTube or Vimeo URL, or a video ID.');
      return;
    }

    destroyActivePlayer();
    mount.replaceChildren();
    mount.removeAttribute('data-loading');

    try {
      mount.setAttribute('data-loading', 'true');
      const instance = await createA11yPlayer(mount, {
        platform: parsed.platform,
        videoId: parsed.videoId,
        title: 'Selected video',
      });
      activeInstance = instance;
      mount.removeAttribute('data-loading');
      instance.controls.root.focus();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load the video.';
      showInputError(input, errorEl, message);
      mount.removeAttribute('data-loading');
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initEmbedPlayers();
  initDemoPage();
});
