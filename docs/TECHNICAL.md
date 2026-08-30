# Technical documentation

Architecture, data flow, and accessibility design for **A11y YouTube/Vimeo Player Controls** — custom accessible controls for YouTube and Vimeo embeds.

## Overview

This project is a **static, zero-build-step** web application that wraps YouTube and Vimeo embeds with a custom, accessible control bar. Native platform controls are disabled; playback is driven through each platform’s official JavaScript API.

Design goals:

- Keyboard and screen reader support without `role="application"` or custom ARIA widgets for basic controls
- Platform-agnostic control UI via an adapter layer
- Captions remain on the platform player (inside the cross-origin iframe)
- Custom controls sit **below** the video so in-frame captions stay visible

## System architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Page (index.html or host site)                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  main.js                                              │  │
│  │  • parseVideoInput() / createA11yPlayer()             │  │
│  │  • Declarative [data-a11y-player] init                 │  │
│  └───────────────────────────┬───────────────────────────┘  │
│                              │                               │
│  ┌───────────────────────────▼───────────────────────────┐  │
│  │  A11yControls (a11y-controls.js)                      │  │
│  │  • DOM: video area, controls, footer                  │  │
│  │  • Buttons, range inputs, keyboard shortcuts          │  │
│  │  • SR-only aria-live status + visible error alert      │  │
│  └───────────────────────────┬───────────────────────────┘  │
│                              │ PlatformPlayerBase API       │
│  ┌───────────────────────────▼───────────────────────────┐  │
│  │  Adapter (youtube.js | vimeo.js)                      │  │
│  │  • Load SDK, create iframe embed                      │  │
│  │  • Normalize state/events                             │  │
│  └───────────────────────────┬───────────────────────────┘  │
│                              │                               │
│  ┌───────────────────────────▼───────────────────────────┐  │
│  │  Cross-origin iframe (YouTube / Vimeo player)           │  │
│  │  • Stream, captions, ads, some native overlays          │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Initialization lifecycle

### Programmatic (`createA11yPlayer`)

1. Clear mount element; add `a11y-player-mount` class
2. Create focusable player shell (`role="group"`, `tabindex="0"`)
3. Instantiate `A11yControls` with `player: null` → controls **disabled**
4. `await createPlatformPlayer(...)` — loads SDK, embeds video, resolves when ready
5. `controls.attachPlayer(player)` — subscribes to events, syncs UI, enables controls
6. Focus moves to player shell (demo page)

### Declarative (`[data-a11y-player]`)

Same as above, triggered on `DOMContentLoaded` for each marked element. Requires `data-video-id`.

### Async safety

Controls are disabled until the adapter’s `ready()` promise resolves. All control handlers guard with `_hasPlayer()` to avoid calling APIs before attach.

## Platform adapter contract

Defined in `js/adapters/base.js`.

### Factory

Each adapter exposes:

```js
static async create(container, videoId, options) → AdapterInstance
```

Must resolve only when the embed is ready for API calls.

### Required methods

| Method | Description |
|--------|-------------|
| `play()` | Start/resume playback |
| `pause()` | Pause playback |
| `seek(seconds)` | Seek to position (seconds) |
| `setVolume(0–100)` | Set volume percentage |
| `setMuted(boolean)` | Mute/unmute |
| `getCurrentTime()` | Current position (seconds) |
| `getDuration()` | Total duration (seconds) |
| `isMuted()` | Mute state |
| `getVolume()` | Volume 0–100 |
| `setCaptionsEnabled(boolean)` | Toggle captions |
| `areCaptionsEnabled()` | Caption state |
| `getState()` | Normalized `PlayerState` |
| `ready()` | Promise when embed is ready |
| `destroy()` | Tear down iframe and listeners |

### Events (`PlayerEvent`)

| Event | Payload | When |
|-------|---------|------|
| `ready` | — | Embed initialized |
| `statechange` | `PlayerState` | Playback state changed |
| `timeupdate` | `current`, `duration` | Progress tick |
| `error` | `Error` | Fatal embed error |
| `captionschange` | `boolean` | Captions toggled |

Subscribe via `player.on(event, handler)` — returns unsubscribe function.

### States (`PlayerState`)

| State | Meaning |
|-------|---------|
| `unstarted` | Not yet started |
| `cued` | Loaded, not playing |
| `playing` | Playing |
| `paused` | Paused |
| `buffering` | Buffering |
| `ended` | Finished |

### Time updates

- **YouTube:** base class polls every 250 ms while `PLAYING`
- **Vimeo:** native `timeupdate` event; polling overridden to no-op

## Control layer

### DOM structure

```
.a11y-player (focusable shell)
├── .a11y-player__video-wrap (16:9)
│   └── .a11y-player__video [data-video-container]
│       └── .a11y-player__embed (adapter injects iframe)
├── .a11y-player__controls (below video)
│   ├── seek range input
│   └── transport buttons + volume + captions
└── .a11y-player__footer
    ├── .a11y-player__error [role=alert] (visible, fatal errors)
    ├── .a11y-player__status [aria-live=polite] (sr-only)
    └── keyboard shortcuts <details>
```

### Keyboard shortcuts

Active when focus is inside the player shell and **not** in:

- Footer (shortcuts help disclosure)
- Range inputs (seek/volume keep native behavior)
- A button receiving Space (native activation)

| Key | Action |
|-----|--------|
| `K`, `Space` | Play/pause |
| `J` | Rewind `skipSeconds` |
| `L` | Forward `skipSeconds` |
| `M` | Mute toggle |
| `C` | Captions toggle |

### Live region announcements

Screen-reader-only `.a11y-player__status` announces:

- Video ready
- Playing / Paused / Video ended
- Muted / Unmuted
- Captions on / off
- Rewind / forward skip
- Seek completion

Implementation clears with a zero-width space, then sets text on the next animation frame so repeated messages re-trigger `aria-live`.

### Error handling

| Source | Visible UI | Assistive tech |
|--------|--------------|----------------|
| Demo form (bad URL) | `#video-url-error` | `aria-invalid` + error text |
| Embed init failure | Thrown to caller | Demo form error |
| Runtime embed error | `.a11y-player__error` | `role="alert"` |
| Missing `data-video-id` | Inline alert in mount | `role="alert"` |

On embed error, video area and controls hide; footer shows the alert message.

## Platform implementations

### YouTube (`youtube.js`)

- Loads `https://www.youtube.com/iframe_api` once
- `playerVars.controls: 0` hides native bar
- `disablekb: 1` prevents iframe keyboard capture
- iframe `tabindex="-1"` keeps tab order on custom controls
- Captions via `loadModule('captions')` / `unloadModule('captions')`

### Vimeo (`vimeo.js`)

- Loads `@vimeo/player@2.25.0` ESM from jsDelivr
- Embed options: `controls: false`, `keyboard: false`
- iframe via `player.element` (not YouTube’s `getIframe()`)
- Captions via `getTextTracks()` / `enableTextTrack()` / `disableTextTrack()`
- **Init order:** `_readyPromise` resolves **before** caption setup to avoid deadlock (`setCaptionsEnabled` awaits `ready()`)

## External dependencies

| Dependency | Loaded when | Required for |
|------------|-------------|--------------|
| YouTube IFrame API | First YouTube video | YouTube playback |
| `@vimeo/player` (CDN) | First Vimeo video | Vimeo playback |

No npm install or bundler required. Vimeo requires network access to jsDelivr.

## Browser requirements

- ES modules (`type="module"`)
- `aspect-ratio` CSS (with min-height fallback)
- Range input styling (WebKit + Mozilla pseudo-elements)
- Promises, `async`/`await`

## Platform limitations (not fixable in this project)

- **Cross-origin iframe:** cannot style or reposition captions; cannot remove all YouTube in-frame UI (share, end cards, etc.)
- **Ads:** YouTube ad UI is platform-owned; no skip-ad API for custom controls
- **Vimeo privacy:** domain-restricted videos fail outside allowed origins
- **Caption tracks:** depend on what the host uploaded; unavailable tracks disable captions silently on Vimeo

## CSS design tokens

Defined on `:root` in `css/player.css`:

| Token | Purpose |
|-------|---------|
| `--a11y-bg`, `--a11y-surface` | Player backgrounds |
| `--a11y-text`, `--a11y-muted` | Text hierarchy |
| `--a11y-accent` | Primary actions |
| `--a11y-focus` | Focus ring color |
| `--a11y-error` | Error text |
| `--a11y-btn-size` | 44px minimum touch target |

Supports `prefers-reduced-motion` and `forced-colors: active`.

## Related documents

- [Developer guide](./DEVELOPER.md) — integration, API reference, extending adapters
- [README](../README.md) — quick start and checklist
