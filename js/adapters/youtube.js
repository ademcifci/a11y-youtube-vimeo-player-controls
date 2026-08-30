/**
 * @file YouTube IFrame Player API adapter.
 *
 * Loads the official YouTube iframe_api script once, creates a player with
 * native controls hidden (`controls: 0`), and maps YT player states/events
 * to the shared {@link module:adapters/base} contract.
 *
 * @module adapters/youtube
 */

import { PlatformPlayerBase, PlayerEvent, PlayerState } from './base.js';

/** Maps YouTube numeric player states to normalized {@link PlayerState} values. */
const YT_STATE_MAP = {
  [-1]: PlayerState.UNSTARTED,
  0: PlayerState.ENDED,
  1: PlayerState.PLAYING,
  2: PlayerState.PAUSED,
  3: PlayerState.BUFFERING,
  5: PlayerState.CUED,
};

/** Singleton promise for loading the YouTube IFrame API script. */
let youtubeApiPromise = null;

/**
 * Load the YouTube IFrame API once.
 * Chains any pre-existing `window.onYouTubeIframeAPIReady` handler.
 * @returns {Promise<typeof YT>}
 */
export function loadYouTubeAPI() {
  if (window.YT?.Player) {
    return Promise.resolve(window.YT);
  }

  if (!youtubeApiPromise) {
    youtubeApiPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[src*="youtube.com/iframe_api"]');
      const previousReady = window.onYouTubeIframeAPIReady;

      window.onYouTubeIframeAPIReady = () => {
        if (typeof previousReady === 'function') {
          previousReady();
        }
        if (window.YT?.Player) {
          resolve(window.YT);
        } else {
          reject(new Error('YouTube IFrame API failed to initialize.'));
        }
      };

      if (!existing) {
        const script = document.createElement('script');
        script.src = 'https://www.youtube.com/iframe_api';
        script.async = true;
        script.onerror = () => reject(new Error('Failed to load YouTube IFrame API.'));
        document.head.appendChild(script);
      }
    });
  }

  return youtubeApiPromise;
}

/**
 * YouTube embed adapter using the IFrame Player API.
 */
export class YouTubeAdapter extends PlatformPlayerBase {
  /**
   * @param {HTMLElement} container Video mount inside the control UI.
   * @param {string} videoId 11-character YouTube video ID.
   * @param {import('./base.js').PlatformPlayerOptions} [options]
   */
  constructor(container, videoId, options = {}) {
    super();
    this.container = container;
    this.videoId = videoId;
    this.options = options;
    /** @type {YT.Player|null} Underlying YouTube player instance. */
    this.player = null;
    this._captionsEnabled = Boolean(options.captionsDefault ?? true);
  }

  /**
   * Create and initialize a YouTube adapter.
   * @param {HTMLElement} container
   * @param {string} videoId
   * @param {import('./base.js').PlatformPlayerOptions} [options]
   * @returns {Promise<YouTubeAdapter>}
   */
  static async create(container, videoId, options = {}) {
    await loadYouTubeAPI();
    const adapter = new YouTubeAdapter(container, videoId, options);
    await adapter._init();
    return adapter;
  }

  /**
   * Insert embed mount, construct YT.Player, and wire lifecycle callbacks.
   * @returns {Promise<void>}
   * @private
   */
  _init() {
    this._readyPromise = new Promise((resolve, reject) => {
      const mount = document.createElement('div');
      mount.className = 'a11y-player__embed';
      this.container.replaceChildren(mount);

      this.player = new window.YT.Player(mount, {
        videoId: this.videoId,
        width: '100%',
        height: '100%',
        playerVars: {
          controls: 0, // Hide native control bar; custom controls drive playback.
          modestbranding: 1,
          rel: 0,
          fs: 1,
          disablekb: 1, // Prevent iframe from stealing keyboard focus/shortcuts.
          iv_load_policy: 3,
          enablejsapi: 1,
          origin: window.location.origin,
          cc_load_policy: this._captionsEnabled ? 1 : 0,
          cc_lang_pref: this.options.captionLanguage || 'en',
          playsinline: 1,
        },
        events: {
          onReady: (event) => {
            const iframe = event.target.getIframe?.();
            if (iframe) {
              iframe.title = this.options.title || 'Embedded YouTube video player';
              iframe.tabIndex = -1; // Keep tab order on custom controls.
            }
            this._emit(PlayerEvent.READY);
            resolve();
          },
          onStateChange: (event) => {
            this._handleStateChange(event.data);
          },
          onError: (event) => {
            const message = getYouTubeErrorMessage(event.data);
            this._emit(PlayerEvent.ERROR, new Error(message));
            reject(new Error(message));
          },
        },
      });

    });

    return this._readyPromise;
  }

  /**
   * @param {number} ytState YouTube API state code (-1, 0, 1, 2, 3, or 5).
   * @private
   */
  _handleStateChange(ytState) {
    const nextState = YT_STATE_MAP[ytState] ?? PlayerState.UNSTARTED;
    this._setState(nextState);
  }

  async play() {
    await this.ready();
    this.player?.playVideo();
  }

  async pause() {
    await this.ready();
    this.player?.pauseVideo();
  }

  async seek(seconds) {
    await this.ready();
    const duration = await this.getDuration();
    const clamped = Math.max(0, Math.min(seconds, duration || seconds));
    this.player?.seekTo(clamped, true);
    await this._emitTimeUpdate();
  }

  async setVolume(volume) {
    await this.ready();
    const clamped = Math.max(0, Math.min(100, volume));
    this.player?.setVolume(clamped);
  }

  async setMuted(muted) {
    await this.ready();
    if (muted) {
      this.player?.mute();
    } else {
      this.player?.unMute();
    }
  }

  async getCurrentTime() {
    await this.ready();
    return this.player?.getCurrentTime?.() ?? 0;
  }

  async getDuration() {
    await this.ready();
    return this.player?.getDuration?.() ?? 0;
  }

  async isMuted() {
    await this.ready();
    return this.player?.isMuted?.() ?? false;
  }

  async getVolume() {
    await this.ready();
    return this.player?.getVolume?.() ?? 100;
  }

  async setCaptionsEnabled(enabled) {
    await this.ready();
    this._captionsEnabled = enabled;

    if (enabled) {
      this.player?.loadModule?.('captions');
      this.player?.setOption?.('captions', 'track', {});
    } else {
      this.player?.unloadModule?.('captions');
    }

    this._emit(PlayerEvent.CAPTIONS_CHANGE, enabled);
  }

  async areCaptionsEnabled() {
    return this._captionsEnabled;
  }

  /** Destroy the YT player and clear the mount element. */
  destroy() {
    this.player?.destroy?.();
    this.player = null;
    this.container.replaceChildren();
    super.destroy();
  }
}

/**
 * Map YouTube iframe error codes to user-facing messages.
 * @param {number} code YouTube onError code.
 * @returns {string}
 */
function getYouTubeErrorMessage(code) {
  switch (code) {
    case 2:
      return 'Invalid video ID.';
    case 5:
      return 'The requested content cannot be played in an HTML5 player.';
    case 100:
      return 'Video not found or has been removed.';
    case 101:
    case 150:
      return 'The video owner does not allow it to be played in embedded players.';
    default:
      return `YouTube player error (code ${code}).`;
  }
}
