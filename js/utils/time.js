/**
 * @file Time formatting helpers for control labels and ARIA value text.
 *
 * @module utils/time
 */

/**
 * Format seconds as `m:ss` or `h:mm:ss` for on-screen display.
 * @param {number} seconds
 * @returns {string}
 */
export function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '0:00';
  }

  const total = Math.floor(seconds);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const paddedSecs = String(secs).padStart(2, '0');

  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${paddedSecs}`;
  }

  return `${mins}:${paddedSecs}`;
}

/**
 * Format seconds as spoken text for screen readers (e.g. seek slider aria-valuetext).
 * @param {number} seconds
 * @returns {string}
 */
export function formatTimeAccessible(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '0 seconds';
  }

  const total = Math.floor(seconds);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const parts = [];

  if (hrs > 0) {
    parts.push(`${hrs} ${hrs === 1 ? 'hour' : 'hours'}`);
  }
  if (mins > 0) {
    parts.push(`${mins} ${mins === 1 ? 'minute' : 'minutes'}`);
  }
  if (secs > 0 || parts.length === 0) {
    parts.push(`${secs} ${secs === 1 ? 'second' : 'seconds'}`);
  }

  return parts.join(' ');
}

/**
 * Format a current/duration pair for seek slider `aria-valuetext`.
 * @param {number} current Current position in seconds.
 * @param {number} duration Total duration in seconds.
 * @returns {string}
 */
export function formatTimeRange(current, duration) {
  return `${formatTimeAccessible(current)} of ${formatTimeAccessible(duration)}`;
}
