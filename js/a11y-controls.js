/**
 * @file Accessible control bar UI for YouTube/Vimeo embeds.
 *
 * Builds the player shell (video area, controls, footer), wires native HTML
 * controls to the platform adapter, and exposes keyboard shortcuts. Playback
 * status is announced through a screen-reader-only live region; embed errors
 * render in a separate visible alert.
 *
 * @module a11y-controls
 */

import { PlayerEvent, PlayerState } from './adapters/base.js';
import { formatTime, formatTimeRange } from './utils/time.js';

/** Default skip interval (seconds) for rewind/forward buttons and J/L keys. */
const DEFAULT_SKIP_SECONDS = 10;

/** Inline SVG icons injected into control buttons (decorative; buttons have labels). */
const ICONS = {  play: '<svg class="a11y-player__icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>',
  pause: '<svg class="a11y-player__icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>',
  rewind: '<svg class="a11y-player__icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M11 7v4H7.5l4.5 4.5V11H15c1.93 0 3.5 1.57 3.5 3.5S16.93 18 15 18H9v2h6c3.04 0 5.5-2.46 5.5-5.5S18.04 9 15 9h-1.59l2.29-2.29L14.5 5.5 9 11h2V7z"/></svg>',
  forward: '<svg class="a11y-player__icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M13 7v4h3.5L12 15.5V11H9c-1.93 0-3.5 1.57-3.5 3.5S7.07 18 9 18h6v2H9c-3.04 0-5.5-2.46-5.5-5.5S5.96 9 9 9h1.59L8.3 6.71 9.5 5.5 15 11h-2V7z"/></svg>',
  volume: '<svg class="a11y-player__icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>',
  muted: '<svg class="a11y-player__icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z"/></svg>',
  captions: '<svg class="a11y-player__icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19 4H5c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H5V6h14v12zM7 15h3c.55 0 1-.45 1-1v-1H7v1c0 .55.45 1 1 1zm0-4h7v-2H7v2zm10 4c.55 0 1-.45 1-1v-1h-4v1c0 .55.45 1 1 1h2z"/></svg>',
};

/**
 * Accessible control bar that proxies platform player APIs.
 *
 * Instantiate with a mount element and optional player; when the player is
 * created asynchronously, pass `null` and call {@link A11yControls.attachPlayer}
 * once the adapter resolves.
 */
export class A11yControls {
  /**
   * @param {HTMLElement} root Focusable shell element that receives keyboard shortcuts.
   * @param {import('./adapters/base.js').PlatformPlayerBase|null} player Platform adapter, or null while loading.
   * @param {object} [options]
   * @param {string} [options.title] Used in play button labels and ready announcement.
   * @param {number} [options.skipSeconds] Seconds for rewind/forward controls and J/L keys.
   */  constructor(root, player, options = {}) {
    this.root = root;
    this.player = player;
    this.options = {
      title: options.title || 'Video',
      skipSeconds: options.skipSeconds ?? DEFAULT_SKIP_SECONDS,
    };

    this._isPlaying = false;
    this._isEnded = false;
    this._isMuted = false;
    this._captionsEnabled = true;
    this._duration = 0;
    this._currentTime = 0;
    this._isScrubbing = false;
    this._unsubscribers = [];

    this._buildDOM();
    this._bindEvents();
    this._bindKeyboardShortcuts();

    if (player) {
      this.attachPlayer(player);
    }
  }

  /**
   * Connect a platform adapter after async initialization.
   * Controls stay disabled until {@link A11yControls._onReady} completes.
   * @param {import('./adapters/base.js').PlatformPlayerBase} player
   */
  attachPlayer(player) {    this.player = player;
    this._bindPlayerEvents();
    void this._onReady().then(() => {
      this._setControlsDisabled(false);
    });
    this._onStateChange(player.getState());
  }

  /**
   * Enable or disable all interactive controls (used while the embed loads).
   * @param {boolean} disabled
   * @private
   */
  _setControlsDisabled(disabled) {    this.root.classList.toggle('a11y-player--controls-disabled', disabled);

    this.controlsEl?.querySelectorAll('button, input').forEach((control) => {
      if (control instanceof HTMLButtonElement || control instanceof HTMLInputElement) {
        control.disabled = disabled;
      }
    });
  }

  /** @returns {boolean} True when a platform adapter is attached. @private */
  _hasPlayer() {    return this.player != null;
  }

  /**
   * Render player markup and cache element references.
   * Controls sit below the video so in-frame captions remain visible.
   * @private
   */
  _buildDOM() {    const skip = this.options.skipSeconds;
    const seekId = this._uid('seek');
    const volumeId = this._uid('volume');
    const helpPanelId = this._uid('help-panel');
    this.root.classList.add('a11y-player');
    this.root.innerHTML = `
      <div class="a11y-player__video-wrap">
        <div class="a11y-player__video" data-video-container></div>
      </div>
      <div class="a11y-player__controls" data-controls role="group" aria-label="Video controls">
          <div class="a11y-player__progress">
            <label class="a11y-player__sr-only" for="${seekId}">Seek</label>
            <input
              type="range"
              class="a11y-player__seek"
              id="${seekId}"
              data-seek
              min="0"
              max="100"
              step="0.1"
              value="0"
              aria-valuemin="0"
              aria-valuemax="0"
              aria-valuenow="0"
              aria-valuetext="0 seconds of 0 seconds"
            />
          </div>
          <div class="a11y-player__bar">
            <div class="a11y-player__bar-group a11y-player__bar-group--left">
              <button type="button" class="a11y-player__btn a11y-player__btn--play" data-action="play-pause" aria-label="Play ${escapeHtml(this.options.title)}">
                <span class="a11y-player__btn-icon a11y-player__btn-icon--play">${ICONS.play}</span>
                <span class="a11y-player__btn-icon a11y-player__btn-icon--pause">${ICONS.pause}</span>
              </button>
              <button type="button" class="a11y-player__btn" data-action="rewind" aria-label="Rewind ${skip} seconds">
                ${ICONS.rewind}
              </button>
              <button type="button" class="a11y-player__btn" data-action="forward" aria-label="Forward ${skip} seconds">
                ${ICONS.forward}
              </button>
              <span class="a11y-player__time" data-time aria-label="0:00 of 0:00">
                <span data-current-time aria-hidden="true">0:00</span><span class="a11y-player__time-sep" aria-hidden="true"> / </span><span data-duration aria-hidden="true">0:00</span>
              </span>
            </div>
            <div class="a11y-player__bar-group a11y-player__bar-group--right">
              <button type="button" class="a11y-player__btn a11y-player__btn--mute" data-action="mute" aria-pressed="false" aria-label="Mute">
                <span class="a11y-player__btn-icon a11y-player__btn-icon--volume">${ICONS.volume}</span>
                <span class="a11y-player__btn-icon a11y-player__btn-icon--muted">${ICONS.muted}</span>
              </button>
              <div class="a11y-player__volume">
                <label class="a11y-player__sr-only" for="${volumeId}">Volume</label>
                <input
                  type="range"
                  class="a11y-player__volume-input"
                  id="${volumeId}"
                  data-volume
                  min="0"
                  max="100"
                  step="1"
                  value="100"
                  aria-valuemin="0"
                  aria-valuemax="100"
                  aria-valuenow="100"
                  aria-valuetext="100 percent"
                />
              </div>
              <button type="button" class="a11y-player__btn a11y-player__btn--captions" data-action="captions" aria-pressed="true" aria-label="Captions">
                ${ICONS.captions}
              </button>
            </div>
          </div>
        </div>
      <div class="a11y-player__footer">
        <p class="a11y-player__error" data-player-error role="alert" hidden></p>
        <p class="a11y-player__status a11y-player__sr-only" data-status aria-live="polite" aria-atomic="true"></p>
        <details class="a11y-player__help">
          <summary aria-controls="${helpPanelId}" aria-expanded="false">Keyboard shortcuts</summary>
          <div id="${helpPanelId}">
            <p>
              When focus is on the video controls:
              <kbd>K</kbd> play/pause,
              <kbd>J</kbd> back ${skip}s,
              <kbd>L</kbd> forward ${skip}s,
              <kbd>M</kbd> mute,
              <kbd>C</kbd> captions.
            </p>
          </div>
        </details>
      </div>
    `;

    this.videoContainer = this.root.querySelector('[data-video-container]');
    this.controlsEl = this.root.querySelector('[data-controls]');
    this.playPauseBtn = this.root.querySelector('[data-action="play-pause"]');
    this.muteBtn = this.root.querySelector('[data-action="mute"]');
    this.captionsBtn = this.root.querySelector('[data-action="captions"]');
    this.seekInput = this.root.querySelector('[data-seek]');
    this.volumeInput = this.root.querySelector('[data-volume]');
    this.currentTimeEl = this.root.querySelector('[data-current-time]');
    this.durationEl = this.root.querySelector('[data-duration]');
    this.timeEl = this.root.querySelector('[data-time]');
    this.statusEl = this.root.querySelector('[data-status]');
    this.errorEl = this.root.querySelector('[data-player-error]');
    this.helpDetails = this.root.querySelector('.a11y-player__help');

    this.helpDetails?.addEventListener('toggle', () => {
      const summary = this.helpDetails?.querySelector('summary');
      if (summary && this.helpDetails) {
        summary.setAttribute('aria-expanded', String(this.helpDetails.open));
      }
    });

    if (!this.player) {
      this._setControlsDisabled(true);
    }
  }

  /**
   * Generate a unique DOM id prefix for this player instance.
   * @param {string} name Suffix (e.g. `seek`, `volume`).
   * @returns {string}
   * @private
   */
  _uid(name) {    if (!this._idPrefix) {
      this._idPrefix = `a11y-player-${Math.random().toString(36).slice(2, 9)}`;
    }
    return `${this._idPrefix}-${name}`;
  }

  /**
   * Container element where the platform adapter mounts its iframe.
   * @returns {HTMLElement}
   */
  getVideoContainer() {    return this.videoContainer;
  }

  /** Wire click and input handlers for the control bar. @private */
  _bindEvents() {    this.root.querySelector('[data-action="play-pause"]').addEventListener('click', () => {
      this._togglePlayPause();
    });

    this.root.querySelector('[data-action="rewind"]').addEventListener('click', () => {
      this._skip(-this.options.skipSeconds);
    });

    this.root.querySelector('[data-action="forward"]').addEventListener('click', () => {
      this._skip(this.options.skipSeconds);
    });

    this.muteBtn.addEventListener('click', () => {
      this._toggleMute();
    });

    this.captionsBtn.addEventListener('click', () => {
      this._toggleCaptions();
    });

    this.seekInput.addEventListener('input', () => {
      this._isScrubbing = true;
      const value = Number(this.seekInput.value);
      this._updateSeekAria(value, this._duration, true);
      this._updateSeekProgress(value, this._duration);
      this.currentTimeEl.textContent = formatTime(value);
      if (this.timeEl) {
        this.timeEl.setAttribute(
          'aria-label',
          `${formatTime(value)} of ${formatTime(this._duration)}`
        );
      }
    });

    this.seekInput.addEventListener('change', async () => {
      if (!this._hasPlayer()) {
        return;
      }

      const value = Number(this.seekInput.value);
      await this.player.seek(value);
      this._isScrubbing = false;
      this._announce(`Seeked to ${formatTime(value)}`);
    });

    this.volumeInput.addEventListener('input', async () => {
      if (!this._hasPlayer()) {
        return;
      }

      const value = Number(this.volumeInput.value);
      this._updateVolumeAria(value);
      this._updateVolumeProgress(value);
      await this.player.setVolume(value);
      if (value > 0 && this._isMuted) {
        await this.player.setMuted(false);
        this._setMutedState(false);
      }
    });
  }

  /** Subscribe to normalized adapter events. @private */
  _bindPlayerEvents() {    this._unsubscribers.push(
      this.player.on(PlayerEvent.READY, () => this._onReady()),
      this.player.on(PlayerEvent.STATE_CHANGE, (state) => this._onStateChange(state)),
      this.player.on(PlayerEvent.TIME_UPDATE, (current, duration) => this._onTimeUpdate(current, duration)),
      this.player.on(PlayerEvent.CAPTIONS_CHANGE, (enabled) => this._setCaptionsState(enabled)),
      this.player.on(PlayerEvent.ERROR, (error) => this.showError(error.message))
    );
  }

  /** Register K/J/L/M/C and Space shortcuts on the player shell. @private */
  _bindKeyboardShortcuts() {    this.root.addEventListener('keydown', (event) => {
      if (!this._shouldHandleShortcut(event) || !this._hasPlayer()) {
        return;
      }

      const key = event.key.toLowerCase();
      switch (key) {
        case 'k':
        case ' ':
          event.preventDefault();
          this._togglePlayPause();
          break;
        case 'j':
          event.preventDefault();
          this._skip(-this.options.skipSeconds);
          break;
        case 'l':
          event.preventDefault();
          this._skip(this.options.skipSeconds);
          break;
        case 'm':
          event.preventDefault();
          this._toggleMute();
          break;
        case 'c':
          event.preventDefault();
          this._toggleCaptions();
          break;
        default:
          break;
      }
    });
  }

  /**
   * Whether a keydown event should trigger a player shortcut.
   * Skips footer content, range inputs, and Space on buttons (native activation).
   * @param {KeyboardEvent} event
   * @returns {boolean}
   * @private
   */
  _shouldHandleShortcut(event) {    const target = event.target;
    if (!(target instanceof Element)) {
      return false;
    }

    if (target.closest('.a11y-player__footer')) {
      return false;
    }

    if (target instanceof HTMLInputElement) {
      return false;
    }

    if (target instanceof HTMLButtonElement && event.key === ' ') {
      return false;
    }

    return true;
  }

  /**
   * Sync UI state after the adapter reports ready (duration, volume, captions).
   * @private
   */
  async _onReady() {    if (!this._hasPlayer()) {
      return;
    }

    this._duration = await this.player.getDuration();
    this._currentTime = await this.player.getCurrentTime();
    this._isMuted = await this.player.isMuted();
    this._captionsEnabled = await this.player.areCaptionsEnabled();

    const volume = await this.player.getVolume();
    this.volumeInput.value = String(volume);
    this._updateVolumeAria(volume);
    this._updateVolumeProgress(volume);
    this._setMutedState(this._isMuted);
    this._setCaptionsState(this._captionsEnabled);
    this._updateSeekUI(this._currentTime, this._duration);
    this._announce(`${this.options.title} ready`);
  }

  /**
   * React to normalized playback state and announce changes to screen readers.
   * @param {string} state {@link PlayerState} value from the adapter.
   * @private
   */
  _onStateChange(state) {    switch (state) {
      case PlayerState.PLAYING:
        this._setPlayingState(true);
        this._announce('Playing');
        break;
      case PlayerState.PAUSED:
        this._setPlayingState(false);
        this._announce('Paused');
        break;
      case PlayerState.ENDED:
        this._setPlayingState(false, true);
        this._announce('Video ended');
        break;
      default:
        break;
    }
  }

  /**
   * Update seek slider and time display from adapter time events.
   * @param {number} current Current time in seconds.
   * @param {number} duration Total duration in seconds.
   * @private
   */
  _onTimeUpdate(current, duration) {    if (this._isScrubbing) return;
    this._currentTime = current;
    if (duration > 0) {
      this._duration = duration;
    }
    this._updateSeekUI(current, this._duration);
  }

  _updateSeekUI(current, duration) {
    this.seekInput.max = String(duration || 0);
    this.seekInput.value = String(current);
    this.seekInput.setAttribute('aria-valuemax', String(Math.floor(duration || 0)));
    this._updateSeekAria(current, duration, false);
    this._updateSeekProgress(current, duration);
    this.currentTimeEl.textContent = formatTime(current);
    this.durationEl.textContent = formatTime(duration);
    if (this.timeEl) {
      this.timeEl.setAttribute('aria-label', `${formatTime(current)} of ${formatTime(duration)}`);
    }
  }

  _updateSeekProgress(current, duration) {
    const pct = duration > 0 ? (current / duration) * 100 : 0;
    this.seekInput.style.setProperty('--range-progress', `${pct}%`);
  }

  _updateVolumeProgress(value) {
    this.volumeInput.style.setProperty('--range-progress', `${value}%`);
  }

  _updateSeekAria(current, duration, whileScrubbing) {
    const max = Math.floor(duration || 0);
    const now = whileScrubbing ? Math.floor(current) : Math.floor(current);
    this.seekInput.setAttribute('aria-valuenow', String(now));
    this.seekInput.setAttribute('aria-valuetext', formatTimeRange(now, max));
  }

  _updateVolumeAria(value) {
    this.volumeInput.setAttribute('aria-valuenow', String(value));
    this.volumeInput.setAttribute('aria-valuetext', `${value} percent`);
  }

  _setPlayingState(isPlaying, ended = false) {
    this._isPlaying = isPlaying;
    this._isEnded = ended;
    this.playPauseBtn.classList.toggle('is-playing', isPlaying);

    let label;
    if (ended) {
      label = `Replay ${this.options.title}`;
    } else if (isPlaying) {
      label = `Pause ${this.options.title}`;
    } else {
      label = `Play ${this.options.title}`;
    }

    this.playPauseBtn.setAttribute('aria-label', label);
  }

  _setMutedState(isMuted) {
    this._isMuted = isMuted;
    this.muteBtn.setAttribute('aria-pressed', String(isMuted));
    this.muteBtn.classList.toggle('is-muted', isMuted);
  }

  _setCaptionsState(enabled) {
    this._captionsEnabled = enabled;
    this.captionsBtn.setAttribute('aria-pressed', String(enabled));
    this.captionsBtn.classList.toggle('is-active', enabled);
  }

  async _togglePlayPause() {
    if (!this._hasPlayer()) {
      return;
    }

    if (this._isPlaying) {
      await this.player.pause();
    } else {
      await this.player.play();
    }
  }

  async _toggleMute() {
    if (!this._hasPlayer()) {
      return;
    }

    const next = !this._isMuted;
    await this.player.setMuted(next);
    this._setMutedState(next);
    this._announce(next ? 'Muted' : 'Unmuted');
  }

  async _toggleCaptions() {
    if (!this._hasPlayer()) {
      return;
    }

    const next = !this._captionsEnabled;
    await this.player.setCaptionsEnabled(next);
    this._setCaptionsState(next);
    this._announce(next ? 'Captions on' : 'Captions off');
  }

  async _skip(delta) {
    if (!this._hasPlayer()) {
      return;
    }

    const current = await this.player.getCurrentTime();
    const duration = await this.player.getDuration();
    const target = Math.max(0, Math.min(current + delta, duration || current + delta));
    await this.player.seek(target);
    const seconds = Math.abs(delta);
    this._announce(delta < 0 ? `Rewound ${seconds} seconds` : `Forwarded ${seconds} seconds`);
  }

  /**
   * Post a message to the screen-reader-only live region.
   * Clears with a zero-width space first so repeated messages re-fire aria-live.
   * @param {string} message
   * @private
   */
  _announce(message) {    if (!this.statusEl) {
      return;
    }

    // Non-empty placeholder so :empty styles do not hide the region between updates.
    this.statusEl.textContent = '\u200b';
    window.requestAnimationFrame(() => {
      if (this.statusEl) {
        this.statusEl.textContent = message;
      }
    });
  }

  /**
   * Show a fatal embed error: hide video/controls, display visible alert.
   * @param {string} message Human-readable error text.
   */
  showError(message) {    this.root.classList.add('a11y-player--error');
    this.controlsEl.hidden = true;

    if (this.errorEl) {
      this.errorEl.hidden = false;
      this.errorEl.textContent = message;
    }
  }

  /** Tear down event subscriptions and disable controls. */
  destroy() {    this._unsubscribers.forEach((unsub) => unsub());
    this._unsubscribers = [];
    this.player = null;
    this._setControlsDisabled(true);
  }
}

/**
 * Escape text for safe insertion into HTML attribute values.
 * @param {string} value
 * @returns {string}
 */
function escapeHtml(value) {  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
