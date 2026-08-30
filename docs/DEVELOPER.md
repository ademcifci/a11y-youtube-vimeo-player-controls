# Developer guide

How to integrate, configure, extend, and troubleshoot **A11y YouTube/Vimeo Player Controls**.

## Getting started

### Prerequisites

- A static file server (e.g. XAMPP, `npx serve`, any web host)
- Modern browser with ES module support
- Internet connection (Vimeo SDK from CDN; YouTube API from Google)

### Local development

1. Place the project under your web root (e.g. `htdocs/a11y-youtube-vimeo-player-controls/`)
2. Open `http://localhost/a11y-youtube-vimeo-player-controls/`
3. Load a YouTube or Vimeo URL in the demo form

No build step, linter, or package install is required for core development.

## Project structure

```
a11y-youtube-vimeo-player-controls/
├── index.html              Demo page + embed snippet
├── css/
│   └── player.css          Demo layout + player component styles
├── js/
│   ├── main.js             Entry point, public API, demo form
│   ├── a11y-controls.js    Control UI + keyboard + live region
│   ├── adapters/
│   │   ├── base.js         Shared types, base class, factory
│   │   ├── youtube.js      YouTube IFrame API adapter
│   │   └── vimeo.js        Vimeo Player SDK adapter
│   └── utils/
│       └── time.js         Time formatting for UI and ARIA
├── docs/
│   ├── TECHNICAL.md        Architecture and design decisions
│   └── DEVELOPER.md        This file
└── README.md               User-facing quick start
```

## Public API (`js/main.js`)

Import as an ES module from your page:

```html
<script type="module">
  import { createA11yPlayer, parseVideoInput, destroyActivePlayer } from '/a11y-youtube-vimeo-player-controls/js/main.js';
</script>
```

### `createA11yPlayer(mount, config)`

Creates a player inside `mount` and returns `{ controls, player }`.

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `mount` | `HTMLElement` | Container cleared and populated with player UI |
| `config.platform` | `string` | `'youtube'` (default) or `'vimeo'` |
| `config.videoId` | `string` | **Required.** Platform video ID |
| `config.title` | `string` | Used in labels (default: `'Video'`) |
| `config.skipSeconds` | `number` | Rewind/forward interval (default: `10`) |
| `config.captionsDefault` | `boolean` | Initial captions (default: `true`) |
| `config.captionLanguage` | `string` | Preferred track language (default: `'en'`) |

**Example**

```js
const mount = document.querySelector('#player');
const { controls, player } = await createA11yPlayer(mount, {
  platform: 'vimeo',
  videoId: '76979871',
  title: 'Example video',
  skipSeconds: 15,
  captionsDefault: true,
  captionLanguage: 'en',
});

controls.root.focus();
```

**Throws** if `videoId` is missing or the embed fails to initialize.

### `parseVideoInput(input)`

Detects platform and extracts video ID from a URL or bare ID.

```js
parseVideoInput('https://youtu.be/dQw4w9WgXcQ');
// → { platform: 'youtube', videoId: 'dQw4w9WgXcQ' }

parseVideoInput('76979871');
// → { platform: 'vimeo', videoId: '76979871' }

parseVideoInput('not-a-url');
// → null
```

Also exported: `parseYouTubeId(input)`, `parseVimeoId(input)`.

### `destroyActivePlayer()`

Destroys the demo page’s tracked instance (used internally before reload). Call your own `controls.destroy()` and `player.destroy()` when managing instances yourself.

## Declarative embedding

Add a mount element and include `main.js`:

```html
<div
  data-a11y-player
  data-platform="youtube"
  data-video-id="dQw4w9WgXcQ"
  data-title="Never Gonna Give You Up"
></div>
<script type="module" src="/a11y-youtube-vimeo-player-controls/js/main.js"></script>
```

| Attribute | Required | Values |
|-----------|----------|--------|
| `data-a11y-player` | Yes | Presence marker |
| `data-video-id` | Yes | Platform video ID |
| `data-platform` | No | `youtube` (default), `vimeo` |
| `data-title` | No | Accessible title for labels |

Multiple `[data-a11y-player]` elements on one page are supported.

## Module reference

### `A11yControls` (`js/a11y-controls.js`)

| Member | Description |
|--------|-------------|
| `constructor(root, player, options)` | Build UI; pass `null` player if loading async |
| `attachPlayer(player)` | Wire adapter after `createPlatformPlayer` |
| `getVideoContainer()` | Element where adapter mounts iframe |
| `showError(message)` | Fatal error UI |
| `destroy()` | Unsubscribe events, disable controls |
| `root` | Player shell element |

### `PlatformPlayerBase` (`js/adapters/base.js`)

See [Technical documentation — Platform adapter contract](./TECHNICAL.md#platform-adapter-contract).

### `createPlatformPlayer(platform, container, videoId, options)`

Low-level factory used by `createA11yPlayer`. Dynamically imports the correct adapter.

## Adding a new platform adapter

1. **Create** `js/adapters/myplatform.js`:

```js
import { PlatformPlayerBase, PlayerEvent, PlayerState } from './base.js';

export class MyPlatformAdapter extends PlatformPlayerBase {
  static async create(container, videoId, options = {}) {
    const adapter = new MyPlatformAdapter(container, videoId, options);
    await adapter._init();
    return adapter;
  }

  async _init() {
    this._readyPromise = new Promise((resolve, reject) => {
      // Create embed, wire events, call resolve() when ready
      // Emit PlayerEvent.READY, map states via _setState()
    });
    return this._readyPromise;
  }

  // Implement all playback methods...
  destroy() {
    // Tear down embed
    super.destroy();
  }
}
```

2. **Register** in `createPlatformPlayer()` switch in `base.js`

3. **Add** URL parsing in `main.js` if user input should detect the platform

4. **Do not** change `a11y-controls.js` unless the platform needs unique UI behavior

### Adapter checklist

- [ ] `ready()` resolves before any method that calls `ready()` internally (avoid deadlocks)
- [ ] Emit `PlayerEvent.TIME_UPDATE` during playback (or rely on base polling)
- [ ] Map all playback states to `PlayerState`
- [ ] Set iframe `title` and `tabindex="-1"`
- [ ] Hide native controls via platform embed options
- [ ] Emit `PlayerEvent.ERROR` with user-friendly messages
- [ ] Clean up in `destroy()`

## Styling and customization

### CSS variables

Override on a parent or `.a11y-player`:

```css
.a11y-player {
  --a11y-accent: #0066cc;
  --a11y-focus: #ffcc00;
}
```

### Layout

Controls are intentionally **below** the video (not overlaid). To change layout, edit `.a11y-player__controls` in `player.css` and the DOM order in `A11yControls._buildDOM()`.

### Skip interval

Pass `skipSeconds` in config or extend `A11yControls` options.

## URL parsing reference

### YouTube

Supported patterns:

- `youtube.com/watch?v=VIDEO_ID`
- `youtu.be/VIDEO_ID`
- `youtube.com/embed/VIDEO_ID`
- `youtube.com/shorts/VIDEO_ID`
- Bare 11-character ID

### Vimeo

Supported patterns:

- `vimeo.com/VIDEO_ID`
- `vimeo.com/video/VIDEO_ID`
- Bare numeric ID

YouTube is checked first when both could match.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Controls disabled, “Loading player…” stuck | Adapter `ready()` never resolved | Check console; verify SDK load and video ID |
| `player is not defined` | JS error during init | Check console for ReferenceError in controls build |
| Vimeo controls don’t work, video visible | Ready/caption deadlock (fixed in current code) | Ensure `_readyPromise` resolves before `setCaptionsEnabled` |
| Captions under controls | Expected with overlay layout | Current design places controls below video |
| YouTube embed error 101/150 | Owner disabled embedding | Use a different video or YouTube’s watch page |
| Vimeo privacy error | Domain not allowlisted | Add your domain in Vimeo embed settings |
| Shortcuts fire while typing in seek | Focus on range input | By design; inputs excluded from shortcuts |
| Space toggles play on button | Focus on button | By design; Space activates button natively |

### Debug tips

1. Open DevTools → Network: confirm YouTube iframe API or Vimeo CDN loads
2. Listen to adapter events:

```js
player.on('statechange', (s) => console.log('state', s));
player.on('error', (e) => console.error(e));
```

3. Verify `await player.ready()` resolves before manual API calls

## Testing

Use the [manual accessibility checklist](../README.md#manual-accessibility-test-checklist) plus:

- Load valid YouTube and Vimeo URLs
- Toggle captions, mute, play/pause — confirm sr-only status announcements (screen reader)
- Trigger invalid video ID — confirm visible error
- Test at 320px viewport width
- Test with keyboard only (no mouse)

## Code conventions

- **ES modules** with `.js` import paths
- **JSDoc** on exported functions and public class methods
- **`@file` module headers** at top of each JS file
- **Private methods** prefixed with `_`
- **No framework** — vanilla DOM APIs only
- **Comments** explain non-obvious behavior (deadlocks, a11y patterns), not every line

## Related documents

- [Technical documentation](./TECHNICAL.md)
- [README](../README.md)
