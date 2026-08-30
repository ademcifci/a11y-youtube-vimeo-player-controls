# A11y YouTube/Vimeo Player Controls

Custom keyboard- and screen-reader-friendly controls for YouTube and Vimeo embeds. Native platform control bars are hidden; playback is driven through each platform’s official embed API.

## Documentation

| Document | Audience | Contents |
|----------|----------|----------|
| [README.md](README.md) | Everyone | Quick start, embed snippet, checklist |
| [docs/TECHNICAL.md](docs/TECHNICAL.md) | Architects, a11y reviewers | Architecture, lifecycle, adapter contract, limitations |
| [docs/DEVELOPER.md](docs/DEVELOPER.md) | Integrators, contributors | API reference, extension guide, troubleshooting |

## Quick start

1. Serve the folder via any static host (e.g. XAMPP at `http://localhost/a11y-youtube-vimeo-player-controls/`).
2. Open [`index.html`](index.html).
3. Paste a YouTube or Vimeo URL (or video ID) and click **Load video**.

**Note:** Vimeo loads the Player SDK from jsDelivr CDN; an internet connection is required.

## Embed on a page

```html
<div
  data-a11y-player
  data-platform="youtube"
  data-video-id="dQw4w9WgXcQ"
  data-title="Never Gonna Give You Up"
></div>
<script type="module" src="/a11y-youtube-vimeo-player-controls/js/main.js"></script>
```

See [Developer guide — Declarative embedding](docs/DEVELOPER.md#declarative-embedding) for all data attributes and [programmatic API](docs/DEVELOPER.md#public-api-jsmainjs) for `createA11yPlayer()`.

## Keyboard shortcuts

Shortcuts work when focus is inside the player (tab to the player area or any control).

| Key | Action |
|---|---|
| `K` or `Space` | Play / pause (`Space` ignored when focus is on a button) |
| `J` | Rewind 10 seconds |
| `L` | Forward 10 seconds |
| `M` | Mute / unmute |
| `C` | Captions on / off |

## Accessibility features

- Standard buttons and range inputs (no `role="application"`).
- Play button label changes with state; mute and captions use fixed labels with `aria-pressed`.
- Seek slider exposes `aria-valuemin`, `aria-valuemax`, `aria-valuenow`, and spoken `aria-valuetext`.
- Playback status updates use a screen-reader-only `aria-live="polite"` region; player errors appear in a visible `role="alert"` message below the video.
- Visible `:focus-visible` outlines and minimum 44×44px touch targets.
- Respects `prefers-reduced-motion`.
- Embedded iframe receives a descriptive `title` and `tabindex="-1"`.
- Custom controls sit below the video so platform captions remain visible.

## Architecture

```
Accessible control bar (js/a11y-controls.js)
        ↓
Platform adapter (js/adapters/youtube.js | vimeo.js)
        ↓
YouTube IFrame API / Vimeo Player SDK (@vimeo/player via CDN)
        ↓
Hosted video (stream, captions, ads)
```

Full details: [Technical documentation](docs/TECHNICAL.md).

## Platform limitations

These are enforced by YouTube/Vimeo, not this project:

- **Ads** — YouTube ad breaks use the platform’s own overlay. There is no public API to drive “Skip ad” from custom controls. Vimeo-hosted videos typically have no mid-roll ads in embeds.
- **Some native UI** — Share, watch later, channel title, quality picker, subscribe, end-screen cards, and chapter/skip-intro buttons cannot be removed via the embed API. Hiding the main control bar does not remove all in-frame overlays.
- **Captions** — Toggle is supported; caption rendering stays on the platform player inside the embed. Caption position cannot be changed via the embed API, so this player places custom controls **below** the video (not overlaid) to keep captions visible at the bottom of the frame.
- **Vimeo privacy** — Videos with domain-level embed restrictions may fail to load outside allowed sites.

## Manual accessibility test checklist

- [ ] Tab through all controls in logical order.
- [ ] Activate every button with `Enter` and `Space`.
- [ ] Adjust seek and volume sliders with keyboard.
- [ ] Verify shortcuts (`K`, `J`, `L`, `M`, `C`) with NVDA, JAWS, or VoiceOver.
- [ ] Confirm play/pause, mute, and caption changes are announced once (not every time tick).
- [ ] Test on a mobile viewport (touch targets, slider use).
- [ ] Load an invalid or non-embeddable video and confirm the error message is visible and exposed to assistive tech (`role="alert"` on demo form errors and in the player footer).

## File layout

```
a11y-youtube-vimeo-player-controls/
├── index.html
├── css/player.css
├── js/
│   ├── main.js
│   ├── a11y-controls.js
│   ├── adapters/
│   │   ├── base.js
│   │   ├── youtube.js
│   │   └── vimeo.js
│   └── utils/time.js
├── docs/
│   ├── TECHNICAL.md
│   └── DEVELOPER.md
└── README.md
```

## License

Provided as-is for demonstration and extension.
