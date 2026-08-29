# Shadcn and CSS superellipse implementation note

> **Tease:** Actual shadcn components fit the static Astro deployment, but the interactive search should remain one island.
> **Lede:** Render one `client:load` React island, keep the caption corpus in its prerendered JSON asset, and progressively enhance ordinary radii with `corner-shape: superellipse(2)`.
> **Why it matters:** This avoids duplicating the 909 KB corpus in JavaScript and gives modern Chromium continuous corners without breaking Firefox or Safari.
> **Go deeper:** Button, Input, Card, Badge, Alert, and Separator are copied source components; the player remains a nonmodal Card and transcript context remains native `details`.

**Date:** 2026-08-29

## Architecture

The official shadcn Astro guide requires React, Tailwind, and the `@/*` alias for an existing project, and shows component source imported directly into Astro. Astro's React integration provides both server rendering and client hydration. Prime Said's search controls and dynamic result cards share state, so one `ReviewApp client:load` island is the smallest honest use of actual shadcn components.

The island fetches `/review/captions.json` after hydration. It does not import the fixture, so the corpus is not duplicated into the JavaScript chunk. Native elements remain where their semantics are already correct: `form`, `ol`, `details`, links, and the YouTube iframe.

Primary references: [shadcn Astro installation](https://ui.shadcn.com/docs/installation/astro), [Astro React integration](https://docs.astro.build/en/guides/integrations-guide/react/), and [Astro islands](https://docs.astro.build/en/concepts/islands/).

## Continuous corners

The implementation uses ordinary `border-radius` as the baseline and adds:

```css
@supports (corner-shape: superellipse(2)) {
  .continuous-corner,
  [data-slot="button"],
  [data-slot="input"],
  [data-slot="card"],
  [data-slot="badge"],
  [data-slot="alert"] {
    corner-shape: superellipse(2);
  }
}
```

`corner-shape` has no effect without a nonzero radius. `superellipse(2)` is the squircle-like continuous curve. MDN marks the feature as limited availability, while Chrome documents its implementation and Chrome 139 release. Firefox and Safari keep the normal radius; no mask or `clip-path` approximation is used because that would complicate clipping, shadows, outlines, and scrolling.

Primary references: [MDN `corner-shape`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/corner-shape), [MDN `superellipse()`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/superellipse), [Chrome implementation notes](https://developer.chrome.com/blog/implementing-corner-shape), and the [CSS Borders Level 4 draft](https://drafts.csswg.org/css-borders-4/#corner-shaping).
