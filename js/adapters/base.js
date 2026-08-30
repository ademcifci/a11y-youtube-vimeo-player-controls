/**
 * @file Platform adapter base class and shared types.
 *
 * Adapters wrap YouTube/Vimeo embed SDKs behind a normalized interface so
 * {@link module:a11y-controls} never calls platform-specific APIs directly.
 *
 * ## Adapter contract
 *
 * Each adapter must:
 * - Extend {@link PlatformPlayerBase}
 * - Expose a static `create(container, videoId, options)` factory that resolves when ready
 * - Emit {@link PlayerEvent} values via `_emit()`
 * - Map native playback states to {@link PlayerState}
 * - Implement all playback methods (`play`, `pause`, `seek`, volume, mute, captions)
 *
 * @module adapters/base
 */

/**
 * Normalized player states shared across platform adapters.
 * @readonly
 * @enum {string}
 */
export const PlayerState = {
  UNSTARTED: 'unstarted',
  ENDED: 'ended',
  PLAYING: 'playing',
  PAUSED: 'paused',
  BUFFERING: 'buffering',
  CUED: 'cued',
};

/**
 * Events emitted by platform adapters to the control layer.
 * @readonly
 * @enum {string}
 */
export const PlayerEvent = {
  READY: 'ready',
  STATE_CHANGE: 'statechange',
  TIME_UPDATE: 'timeupdate',
  ERROR: 'error',
  CAPTIONS_CHANGE: 'captionschange',
};

/**
 * Options passed from {@link module:main} into platform adapters.
 * @typedef {object} PlatformPlayerOptions
 * @property {string} [title] Accessible iframe title and label context.
 * @property {boolean} [captionsDefault] Whether captions start enabled (default true).
 * @property {string} [captionLanguage] ISO language code for preferred caption track.
 */

/**
 * Minimal event emitter used by all adapters.
 *
 * Subclasses set `_readyPromise` during initialization; callers should await
 * {@link PlatformPlayerBase.ready} before invoking playback APIs.
 */
export class PlatformPlayerBase {
  constructor() {
    /** @type {Map<string, Set<Function>>} Event listener registry. */
    this._handlers = new Map();
    /** @type {boolean} True after {@link PlatformPlayerBase.destroy}. */
    this._destroyed = false;
    /** @type {string} Current {@link PlayerState}. */
    this._state = PlayerState.UNSTARTED;
    /** @type {boolean} Last known captions toggle state. */
    this._captionsEnabled = true;
    /** @type {number|null} Interval id for YouTube time polling. */
    this._timePollId = null;
    /** @type {Promise<void>|null} Resolves when the embed is ready for API calls. */
    this._readyPromise = null;
  }

  /**
   * @returns {string} Current normalized playback state.
   */
  getState() {
    return this._state;
  }

  /**
   * Resolves when the platform player is ready for API calls.
   * @returns {Promise<void>}
   */
  ready() {
    return this._readyPromise ?? Promise.resolve();
  }

  /**
   * Subscribe to an adapter event. Returns an unsubscribe function.
   * @param {string} event {@link PlayerEvent} value.
   * @param {Function} handler
   * @returns {() => void}
   */
  on(event, handler) {
    if (!this._handlers.has(event)) {
      this._handlers.set(event, new Set());
    }
    this._handlers.get(event).add(handler);
    return () => this.off(event, handler);
  }

  /**
   * Remove an event listener.
   * @param {string} event
   * @param {Function} handler
   */
  off(event, handler) {
    this._handlers.get(event)?.delete(handler);
  }

  /**
   * Dispatch an event to all registered handlers.
   * @param {string} event
   * @param {...*} args
   * @protected
   */
  _emit(event, ...args) {
    if (this._destroyed) return;
    this._handlers.get(event)?.forEach((handler) => handler(...args));
  }

  /** @returns {Promise<void>} Start or resume playback. */
  play() {
    throw new Error('play() must be implemented by the platform adapter.');
  }

  /** @returns {Promise<void>} Pause playback. */
  pause() {
    throw new Error('pause() must be implemented by the platform adapter.');
  }

  /**
   * @param {number} seconds Target position in seconds.
   * @returns {Promise<void>}
   */
  seek(seconds) {
    throw new Error('seek() must be implemented by the platform adapter.');
  }

  /**
   * @param {number} volume Level from 0–100.
   * @returns {Promise<void>}
   */
  setVolume(volume) {
    throw new Error('setVolume() must be implemented by the platform adapter.');
  }

  /**
   * @param {boolean} muted
   * @returns {Promise<void>}
   */
  setMuted(muted) {
    throw new Error('setMuted() must be implemented by the platform adapter.');
  }

  /** @returns {Promise<number>} Current playback position in seconds. */
  getCurrentTime() {
    throw new Error('getCurrentTime() must be implemented by the platform adapter.');
  }

  /** @returns {Promise<number>} Video duration in seconds. */
  getDuration() {
    throw new Error('getDuration() must be implemented by the platform adapter.');
  }

  /** @returns {Promise<boolean>} Whether audio is muted. */
  isMuted() {
    throw new Error('isMuted() must be implemented by the platform adapter.');
  }

  /** @returns {Promise<number>} Volume level 0–100. */
  getVolume() {
    throw new Error('getVolume() must be implemented by the platform adapter.');
  }

  /**
   * @param {boolean} enabled
   * @returns {Promise<void>}
   */
  setCaptionsEnabled(enabled) {
    throw new Error('setCaptionsEnabled() must be implemented by the platform adapter.');
  }

  /** @returns {Promise<boolean>} Whether captions are currently enabled. */
  areCaptionsEnabled() {
    throw new Error('areCaptionsEnabled() must be implemented by the platform adapter.');
  }

  /**
   * Update normalized playback state, emit {@link PlayerEvent.STATE_CHANGE},
   * and manage time polling for platforms without native timeupdate events.
   * @param {string} nextState {@link PlayerState} value.
   * @protected
   */
  _setState(nextState) {
    if (this._state === nextState) {
      return;
    }

    this._state = nextState;
    this._emit(PlayerEvent.STATE_CHANGE, nextState);

    if (nextState === PlayerState.PLAYING) {
      this._startTimePolling();
      return;
    }

    this._stopTimePolling();
    if (nextState === PlayerState.PAUSED || nextState === PlayerState.ENDED) {
      void this._emitTimeUpdate();
    }
  }

  /**
   * Poll current time while playing (used by YouTube; Vimeo overrides to no-op).
   * @protected
   */
  _startTimePolling() {
    if (this._timePollId !== null) {
      return;
    }

    this._timePollId = window.setInterval(() => {
      void this._emitTimeUpdate();
    }, 250);
  }

  /** Stop the time polling interval. @protected */
  _stopTimePolling() {
    if (this._timePollId === null) {
      return;
    }

    window.clearInterval(this._timePollId);
    this._timePollId = null;
  }

  /**
   * Read current time/duration from the adapter and emit {@link PlayerEvent.TIME_UPDATE}.
   * @protected
   */
  async _emitTimeUpdate() {
    try {
      await this.ready();
      const currentTime = await this.getCurrentTime();
      const duration = await this.getDuration();
      this._emit(PlayerEvent.TIME_UPDATE, currentTime, duration);
    } catch {
      // Player may be tearing down.
    }
  }

  /** Stop polling, mark destroyed, and clear all listeners. */
  destroy() {
    this._stopTimePolling();
    this._destroyed = true;
    this._handlers.clear();
  }
}

/**
 * Factory: dynamically import and create the adapter for a given platform.
 *
 * @param {string} platform `youtube` or `vimeo`.
 * @param {HTMLElement} container Mount node inside the control UI video area.
 * @param {string} videoId Platform video identifier.
 * @param {PlatformPlayerOptions} [options]
 * @returns {Promise<PlatformPlayerBase>}
 */
export async function createPlatformPlayer(platform, container, videoId, options = {}) {
  switch (platform) {
    case 'youtube': {
      const { YouTubeAdapter } = await import('./youtube.js');
      return YouTubeAdapter.create(container, videoId, options);
    }
    case 'vimeo': {
      const { VimeoAdapter } = await import('./vimeo.js');
      return VimeoAdapter.create(container, videoId, options);
    }
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}
