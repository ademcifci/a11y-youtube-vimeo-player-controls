/**
 * @file Vimeo Player SDK adapter.
 *
 * Loads `@vimeo/player` from jsDelivr, embeds with native controls disabled,
 * and maps Vimeo events to the shared {@link module:adapters/base} contract.
 *
 * Note: `_readyPromise` must resolve before calling `setCaptionsEnabled()` during
 * init, because that method awaits `ready()` — resolving first avoids deadlock.
 *
 * @module adapters/vimeo
 */

import { PlatformPlayerBase, PlayerEvent, PlayerState } from './base.js';

/** ESM entry for the pinned Vimeo Player SDK version. */
const VIMEO_SDK_URL = 'https://cdn.jsdelivr.net/npm/@vimeo/player@2.25.0/+esm';

/** Singleton promise for loading the Vimeo SDK module. */
let vimeoSdkPromise = null;

/**
 * Load the Vimeo Player SDK once from CDN.
 * @returns {Promise<typeof import('@vimeo/player').default>}
 */
export async function loadVimeoSDK() {
  if (!vimeoSdkPromise) {
    vimeoSdkPromise = import(VIMEO_SDK_URL).then((module) => {
      const Player = module.default;
      if (!Player) {
        throw new Error('Vimeo Player SDK failed to initialize.');
      }
      return Player;
    });
  }

  return vimeoSdkPromise;
}

/**
 * Vimeo embed adapter using the official Player SDK.
 */
export class VimeoAdapter extends PlatformPlayerBase {
  /**
   * @param {HTMLElement} container Video mount inside the control UI.
   * @param {string} videoId Numeric Vimeo video ID.
   * @param {import('./base.js').PlatformPlayerOptions} [options]
   */
  constructor(container, videoId, options = {}) {
    super();
    this.container = container;
    this.videoId = videoId;
    this.options = options;
    this._captionsEnabled = Boolean(options.captionsDefault ?? true);
    /** @type {import('@vimeo/player').default|null} Underlying Vimeo player instance. */
    this.player = null;
  }

  /**
   * Create and initialize a Vimeo adapter.
   * @param {HTMLElement} container
   * @param {string} videoId
   * @param {import('./base.js').PlatformPlayerOptions} [options]
   * @returns {Promise<VimeoAdapter>}
   */
  static async create(container, videoId, options = {}) {
    const Player = await loadVimeoSDK();
    const adapter = new VimeoAdapter(container, videoId, options);
    await adapter._init(Player);
    return adapter;
  }

  /**
   * Insert embed mount, construct the Vimeo Player, and wire lifecycle callbacks.
   * @param {typeof import('@vimeo/player').default} Player Vimeo Player constructor.
   * @returns {Promise<void>}
   * @private
   */
  _init(Player) {
    this._readyPromise = new Promise((resolve, reject) => {
      const mount = document.createElement('div');
      mount.className = 'a11y-player__embed';
      this.container.replaceChildren(mount);

      const numericId = Number(this.videoId);
      if (!Number.isFinite(numericId)) {
        reject(new Error('Invalid Vimeo video ID.'));
        return;
      }

      this.player = new Player(mount, {
        id: numericId,
        width: '100%',
        responsive: true,
        controls: false,
        keyboard: false,
        byline: false,
        portrait: false,
        title: false,
        dnt: true,
      });

      this.player.on('loaded', () => {
        void this._onLoaded(resolve, reject);
      });

      this.player.on('play', () => {
        this._setState(PlayerState.PLAYING);
      });

      this.player.on('pause', () => {
        this._setState(PlayerState.PAUSED);
      });

      this.player.on('ended', () => {
        this._setState(PlayerState.ENDED);
      });

      this.player.on('bufferstart', () => {
        this._setState(PlayerState.BUFFERING);
      });

      this.player.on('bufferend', () => {
        void this._onBufferEnd();
      });

      // Vimeo provides native timeupdate; no polling interval needed.
      this.player.on('timeupdate', ({ seconds, duration }) => {
        this._emit(PlayerEvent.TIME_UPDATE, seconds, duration);
      });

      this.player.on('error', (error) => {
        const message = getVimeoErrorMessage(error);
        this._emit(PlayerEvent.ERROR, new Error(message));
        reject(new Error(message));
      });
    });

    return this._readyPromise;
  }

  /**
   * Finalize setup after the Vimeo `loaded` event.
   * Resolves `_readyPromise` before optional caption initialization.
   * @param {() => void} resolve
   * @param {(reason?: Error) => void} reject
   * @private
   */
  async _onLoaded(resolve, reject) {
    try {
      const iframe = this._getEmbedIframe();
      if (iframe) {
        this._configureEmbedIframe(iframe);
      }
      this._setState(PlayerState.CUED);

      this._emit(PlayerEvent.READY);
      resolve();

      if (this._captionsEnabled) {
        try {
          await this.setCaptionsEnabled(true);
        } catch {
          this._captionsEnabled = false;
          this._emit(PlayerEvent.CAPTIONS_CHANGE, false);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load Vimeo player.';
      reject(new Error(message));
    }
  }

  /**
   * Restore playing/paused state after buffering completes.
   * @private
   */
  async _onBufferEnd() {
    const paused = await this.player.getPaused();
    this._setState(paused ? PlayerState.PAUSED : PlayerState.PLAYING);
  }

  /** Vimeo emits `timeupdate`; disable base class polling. @protected */
  _startTimePolling() {}

  /** @protected */
  _stopTimePolling() {}

  /**
   * Return the embed iframe (Vimeo SDK exposes `.element`, not YouTube's `getIframe()`).
   * @returns {HTMLIFrameElement|null}
   * @private
   */
  _getEmbedIframe() {
    const element = this.player?.element;
    if (element instanceof HTMLIFrameElement) {
      return element;
    }

    const iframe = this.container.querySelector('iframe');
    return iframe instanceof HTMLIFrameElement ? iframe : null;
  }

  /**
   * Set accessible iframe metadata and keep it out of the tab order.
   * @param {HTMLIFrameElement} iframe
   * @protected
   */
  _configureEmbedIframe(iframe) {
    iframe.title = this.options.title || 'Embedded Vimeo video player';
    iframe.tabIndex = -1;
  }

  async play() {
    await this.ready();
    await this.player.play();
  }

  async pause() {
    await this.ready();
    await this.player.pause();
  }

  async seek(seconds) {
    await this.ready();
    const duration = await this.getDuration();
    const clamped = Math.max(0, Math.min(seconds, duration || seconds));
    await this.player.setCurrentTime(clamped);
    await this._emitTimeUpdate();
  }

  async setVolume(volume) {
    await this.ready();
    await this.player.setVolume(Math.max(0, Math.min(100, volume)) / 100);
  }

  async setMuted(muted) {
    await this.ready();
    await this.player.setMuted(muted);
  }

  async getCurrentTime() {
    await this.ready();
    return (await this.player.getCurrentTime()) ?? 0;
  }

  async getDuration() {
    await this.ready();
    return (await this.player.getDuration()) ?? 0;
  }

  async isMuted() {
    await this.ready();
    return (await this.player.getMuted()) ?? false;
  }

  async getVolume() {
    await this.ready();
    const volume = (await this.player.getVolume()) ?? 1;
    return Math.round(volume * 100);
  }

  async setCaptionsEnabled(enabled) {
    await this.ready();
    this._captionsEnabled = enabled;

    if (enabled) {
      const tracks = await this.player.getTextTracks();
      const preferred = this.options.captionLanguage;
      const track =
        tracks.find((item) => item.language === preferred) ??
        tracks.find((item) => item.kind === 'captions') ??
        tracks[0];

      if (track) {
        await this.player.enableTextTrack(track.language, track.kind);
      } else {
        this._captionsEnabled = false;
      }
    } else {
      await this.player.disableTextTrack();
    }

    this._emit(PlayerEvent.CAPTIONS_CHANGE, this._captionsEnabled);
  }

  async areCaptionsEnabled() {
    return this._captionsEnabled;
  }

  /** Destroy the Vimeo player and clear the mount element. */
  destroy() {
    const player = this.player;
    this.player = null;

    if (player) {
      void player.destroy().catch(() => {});
    }

    this.container.replaceChildren();
    super.destroy();
  }
}

/**
 * Map Vimeo SDK error objects to user-facing messages.
 * @param {object} error Vimeo error payload.
 * @returns {string}
 */
function getVimeoErrorMessage(error) {
  const message = typeof error?.message === 'string' ? error.message : '';
  const name = typeof error?.name === 'string' ? error.name : '';

  if (name === 'PrivacyError' || message.includes('privacy')) {
    return 'This Vimeo video cannot be embedded on this site due to privacy settings.';
  }

  if (name === 'PasswordError' || message.includes('password')) {
    return 'This Vimeo video is password protected and cannot be played here.';
  }

  if (message.includes('not found') || name === 'NotFoundError') {
    return 'Vimeo video not found.';
  }

  return message || 'Vimeo player error.';
}
