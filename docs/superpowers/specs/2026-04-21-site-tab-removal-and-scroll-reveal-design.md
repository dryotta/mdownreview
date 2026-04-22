# Site: Tab Removal + Scroll Reveal — Design Spec

**Date:** 2026-04-21  
**Status:** Approved

## Overview

Two independent improvements to `site/index.html` and `site/style.css`:

1. **Remove the "GitHub Releases" tab** from the Download section and clean up associated HTML/JS/CSS.
2. **Add scroll-reveal animation** to page sections below the hero using IntersectionObserver.

Both changes are in `site/` only — no app code touched.

---

## 1. Tab Removal

### Problem

The download section has three tabs: Download, Script, GitHub Releases. The "GitHub Releases" tab is redundant — the Download tab already links to GitHub releases via both the direct download button and the "Not your platform?" fallback link.

### HTML Changes (`site/index.html`)

**Remove** the tab button:
```html
<!-- DELETE this line -->
<button class="tab-btn" data-tab="releases">GitHub Releases</button>
```

**Remove** the entire tab panel (the `#tab-releases` div and its contents):
```html
<!-- DELETE this entire block -->
<div class="tab-panel hidden" id="tab-releases">
  <div class="releases-block">
    <p>Browse all releases, download any version, or find builds for all platforms.</p>
    <a href="..." class="btn-releases">View all releases on GitHub →</a>
  </div>
</div>
```

### JS Changes (`site/index.html` `<script>` block)

**Remove** the unknown-platform fallback that defaulted to the releases tab (currently lines 238–243):
```js
// DELETE this block:
if (!detected) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
  document.querySelector('[data-tab="releases"]').classList.add('active');
  document.getElementById('tab-releases').classList.remove('hidden');
}
```

**Replace with:** nothing — when platform is unknown, the Download tab stays active (it's the default `active` in the HTML). The `dl-btn` already falls back to the GitHub releases URL via the fetch callback's `else` branch, and the "Not your platform?" link also covers this case.

**Keep** the `else` branch inside the fetch `.then()` callback — it correctly sets `btn.href` to the generic releases URL for unknown platforms and should not be removed.

### CSS Changes (`site/style.css`)

**Remove** the `.releases-block` rule block (~10 lines).  
**Remove** the `.btn-releases` rule block (~8 lines).

---

## 2. Scroll Reveal

### Technique

IntersectionObserver API — zero dependencies, ~15 lines of JS, all modern browsers.

### Which Elements Get `.reveal`

Add class `reveal` to:
- `<section id="how-it-works">` 
- `<section id="install">`
- `<footer>`

The `.hero` section and `<hr class="divider">` elements do **not** get reveal — the hero is the landing view (always visible), dividers are structural.

### CSS Additions (`site/style.css`)

Append to end of file:

```css
/* ── Scroll Reveal ── */
.reveal {
  opacity: 0;
  transform: translateY(28px);
  transition: opacity 0.55s cubic-bezier(0.16, 1, 0.3, 1),
              transform 0.55s cubic-bezier(0.16, 1, 0.3, 1);
}
.reveal.visible {
  opacity: 1;
  transform: translateY(0);
}
```

### JS Additions (`site/index.html` `<script>` block)

Append before the closing `</script>`:

```js
// ── Scroll reveal ──────────────────────────────────────────────
const observer = new IntersectionObserver(
  entries => entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add('visible');
      observer.unobserve(e.target);
    }
  }),
  { threshold: 0.08 }
);
document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
```

`threshold: 0.08` — trigger when 8% of the section enters the viewport. Early enough to feel responsive, late enough to not fire prematurely.

`observer.unobserve` after first reveal — sections animate in once and stay visible; no re-animation on scroll-back.

### Accessibility

Users who prefer reduced motion should not see animations. Add to the CSS reveal block:

```css
@media (prefers-reduced-motion: reduce) {
  .reveal {
    opacity: 1;
    transform: none;
    transition: none;
  }
}
```

---

## Files Changed

| File | Changes |
|------|---------|
| `site/index.html` | Remove tab button, remove tab panel, remove 6-line JS fallback block, add `.reveal` classes to 3 elements, add 8-line IntersectionObserver block |
| `site/style.css` | Remove `.releases-block` + `.btn-releases` (~18 lines), add `.reveal` + `.reveal.visible` + reduced-motion (~14 lines) |

---

## Out of Scope

- Staggered item-level animations within sections (not requested)
- Changing navigation links (the `#how-it-works` and `#install` anchors still work fine with reveal — smooth scroll targets the section, which is already in the DOM)
