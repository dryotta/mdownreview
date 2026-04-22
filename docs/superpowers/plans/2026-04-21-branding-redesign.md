# Branding Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update app icons, website favicon, and landing-page color palette to use a refined indigo gradient brand identity with no extraneous green/cyan/purple accents.

**Architecture:** Three independent file edits (icon SVG, favicon SVG, site CSS) plus a folder cleanup. No build pipeline changes — the SVG edits are source files; rasterized PNG/ICO/ICNS regeneration is a manual post-step outside this plan.

**Tech Stack:** SVG, CSS custom properties, Tauri icon conventions

**Spec:** `docs/superpowers/specs/2026-04-21-branding-redesign-design.md`

---

## File Map

| File | Action | What changes |
|------|--------|--------------|
| `src-tauri/icons/icon.svg` | Modify | Add gradient, apply to "m" fill + border stroke |
| `site/favicon.svg` | Modify | Add gradient, adaptive dark/light background |
| `site/style.css` | Modify | Remove --accent-2/--green/--purple/--cyan; update all usages |
| `src-tauri/icons/64x64.png` | Delete | Not referenced |
| `src-tauri/icons/StoreLogo.png` | Delete | Windows Store — not used |
| `src-tauri/icons/Square*.png` (9 files) | Delete | Windows Store MSIX — not used |
| `src-tauri/icons/android/` | Delete | Android — not supported |
| `src-tauri/icons/ios/` | Delete | iOS — not supported |

---

## Task 1: Update `icon.svg` with gradient

**Files:**
- Modify: `src-tauri/icons/icon.svg`

The current SVG uses a flat `#6366f1` for both the "m" text fill and border stroke. Replace with a `linearGradient` going from `#7B7FF5` (periwinkle, top) to `#4B4FD9` (deep indigo, bottom), using `userSpaceOnUse` coordinates that span the "m" glyph bounds in the 100×100 viewBox.

- [ ] **Step 1: Replace `src-tauri/icons/icon.svg` with the gradient version**

Write this exact content to `src-tauri/icons/icon.svg`:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs>
    <linearGradient id="g" gradientUnits="userSpaceOnUse" x1="50" y1="8" x2="50" y2="70">
      <stop offset="0%" stop-color="#7B7FF5"/>
      <stop offset="100%" stop-color="#4B4FD9"/>
    </linearGradient>
  </defs>
  <rect width="100" height="100" rx="20" fill="#18181b"/>
  <rect x="1.5" y="1.5" width="97" height="97" rx="18.5" fill="none" stroke="url(#g)" stroke-width="3"/>
  <text x="50" y="70"
    text-anchor="middle"
    font-family="'JetBrains Mono', 'Cascadia Code', 'Courier New', monospace"
    font-size="62"
    font-weight="700"
    fill="url(#g)">m</text>
</svg>
```

- [ ] **Step 2: Verify in browser**

Open `src-tauri/icons/icon.svg` directly in a browser. You should see:
- Dark near-black rounded square background
- "m" letter with a gradient from lighter periwinkle at the top to deeper indigo at the bottom
- Border stroke with the same gradient

- [ ] **Step 3: Commit**

```bash
git add src-tauri/icons/icon.svg
git commit -m "feat: update app icon with indigo gradient"
```

---

## Task 2: Update `favicon.svg` with gradient + adaptive background

**Files:**
- Modify: `site/favicon.svg`

The favicon needs the same gradient as the app icon, plus an adaptive background: light (`#f5f5f8`) in light mode, dark (`#1a1b2e`) in dark mode. This uses CSS `@media (prefers-color-scheme)` inside the SVG `<style>` block, which is supported by all modern browsers for inline SVG favicons.

- [ ] **Step 1: Replace `site/favicon.svg` with the adaptive gradient version**

Write this exact content to `site/favicon.svg`:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs>
    <linearGradient id="g" gradientUnits="userSpaceOnUse" x1="50" y1="8" x2="50" y2="70">
      <stop offset="0%" stop-color="#7B7FF5"/>
      <stop offset="100%" stop-color="#4B4FD9"/>
    </linearGradient>
    <style>
      .bg { fill: #f5f5f8; }
      @media (prefers-color-scheme: dark) { .bg { fill: #1a1b2e; } }
    </style>
  </defs>
  <rect class="bg" width="100" height="100" rx="20"/>
  <rect x="1.5" y="1.5" width="97" height="97" rx="18.5" fill="none" stroke="url(#g)" stroke-width="3"/>
  <text x="50" y="70"
    text-anchor="middle"
    font-family="'JetBrains Mono', 'Cascadia Code', 'Courier New', monospace"
    font-size="62"
    font-weight="700"
    fill="url(#g)">m</text>
</svg>
```

- [ ] **Step 2: Verify**

Open `site/index.html` in a browser. Check the browser tab favicon:
- In light mode: light grey/white square with gradient "m"
- In dark mode (toggle OS preference or use DevTools): dark square with gradient "m"
- Gradient "m" should match the app icon

- [ ] **Step 3: Commit**

```bash
git add site/favicon.svg
git commit -m "feat: update favicon with gradient and adaptive dark/light background"
```

---

## Task 3: Update `site/style.css` palette

**Files:**
- Modify: `site/style.css`

Remove the four extra color variables (`--accent-2`, `--green`, `--purple`, `--cyan`) and update every place they were used. Ten discrete changes total — work through them in order to avoid missing any.

### 3a — Variables block

- [ ] **Step 1: Update the `:root` variables block**

Find the `:root { ... }` block (lines 3–25). Replace it entirely with:

```css
:root {
  --bg: #09090b;
  --bg-subtle: #0f0f13;
  --surface: rgba(255,255,255,0.03);
  --surface-hover: rgba(255,255,255,0.06);
  --border: rgba(255,255,255,0.06);
  --border-hover: rgba(255,255,255,0.12);
  --text: #fafafa;
  --text-secondary: #d4d4d8;
  --muted: #a1a1aa;
  --accent-1: #5C60EF;
  --accent-dark: #4B4FD9;
  --accent-glow: rgba(92,96,239,0.15);
  --warning-bg: rgba(234,179,8,0.08);
  --warning-border: rgba(234,179,8,0.25);
  --warning-text: #fbbf24;
  --terminal-bg: #0c0c0e;
  --terminal-border: rgba(255,255,255,0.08);
  --mono: 'JetBrains Mono', 'Cascadia Code', 'Fira Code', monospace;
}
```

### 3b — Link hover color

- [ ] **Step 2: Fix `a:hover` color**

Find:
```css
a:hover { color: var(--accent-2); }
```
Replace with:
```css
a:hover { color: var(--accent-1); }
```

### 3c — Badge pulse dot

- [ ] **Step 3: Fix `.badge .dot` color**

Find:
```css
  background: var(--green);
  animation: pulse 2s ease-in-out infinite;
```
Replace with:
```css
  background: var(--accent-1);
  animation: pulse 2s ease-in-out infinite;
```

### 3d — Hero gradient text

- [ ] **Step 4: Fix `.gradient-text`**

Find:
```css
  background: linear-gradient(135deg, var(--accent-1), var(--accent-2), var(--cyan));
```
Replace with:
```css
  background: linear-gradient(150deg, #7B7FF5, #4B4FD9);
```

### 3e — Primary button gradient + hover shadow

- [ ] **Step 5: Fix `.btn-primary` gradient**

Find:
```css
  background: linear-gradient(135deg, var(--accent-1), var(--accent-2));
  color: white;
  border: none;
  box-shadow: 0 0 20px var(--accent-glow);
```
Replace with:
```css
  background: linear-gradient(150deg, var(--accent-1), var(--accent-dark));
  color: white;
  border: none;
  box-shadow: 0 0 20px var(--accent-glow);
```

- [ ] **Step 6: Fix `.btn-primary:hover` shadow color**

Find:
```css
  box-shadow: 0 0 30px rgba(99,102,241,0.25);
```
Replace with:
```css
  box-shadow: 0 0 30px rgba(92,96,239,0.25);
```

### 3f — Inline code color (workflow steps)

- [ ] **Step 7: Fix inline `<code>` color**

Find:
```css
.step-header h3 code,
.workflow-step > p code {
  font-family: var(--mono);
  font-size: 0.82rem;
  background: var(--surface);
  border: 1px solid var(--border);
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
  color: var(--purple);
}
```
Replace with:
```css
.step-header h3 code,
.workflow-step > p code {
  font-family: var(--mono);
  font-size: 0.82rem;
  background: var(--surface);
  border: 1px solid var(--border);
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
  color: var(--accent-1);
}
```

### 3g — Copy button "copied" state

- [ ] **Step 8: Fix `.copy-btn.copied`**

Find:
```css
.copy-btn.copied {
  color: var(--green);
  border-color: rgba(74,222,128,0.3);
  background: rgba(74,222,128,0.06);
}
```
Replace with:
```css
.copy-btn.copied {
  color: var(--accent-1);
  border-color: rgba(92,96,239,0.3);
  background: rgba(92,96,239,0.06);
}
```

### 3h — Download button gradient

- [ ] **Step 9: Fix `.btn-download` gradient**

Find:
```css
  background: linear-gradient(135deg, var(--accent-1), var(--accent-2));
  color: white;
  font-weight: 600;
  font-size: 0.9rem;
  transition: all 0.2s;
```
Replace with:
```css
  background: linear-gradient(150deg, var(--accent-1), var(--accent-dark));
  color: white;
  font-weight: 600;
  font-size: 0.9rem;
  transition: all 0.2s;
```

### 3i — Skills table code column color

- [ ] **Step 10: Fix `.skills-table td:first-child` color**

Find:
```css
.skills-table td:first-child {
  font-family: var(--mono);
  color: var(--purple);
  font-weight: 500;
  white-space: nowrap;
}
```
Replace with:
```css
.skills-table td:first-child {
  font-family: var(--mono);
  color: var(--accent-1);
  font-weight: 500;
  white-space: nowrap;
}
```

### 3j — Verify and commit

- [ ] **Step 11: Verify no dead variable references remain**

```bash
grep -n "var(--accent-2)\|var(--green)\|var(--purple)\|var(--cyan)" site/style.css
```
Expected: no output (zero matches).

- [ ] **Step 12: Open in browser and verify visually**

Open `site/index.html` in a browser. Check:
- Hero "AI Agent's" text: indigo gradient (blue-purple only, no cyan/pink)
- Download and primary buttons: indigo gradient
- Badge dot (top of hero): indigo, not green
- Inline `<code>` spans in workflow steps: indigo, not purple
- "copy" → "copied!" button state: indigo tint, not green
- Overall feel: more restrained, single-hue brand

- [ ] **Step 13: Commit**

```bash
git add site/style.css
git commit -m "feat: simplify site palette to single indigo brand color"
```

---

## Task 4: Clean up icon folder

**Files:**
- Delete: 13 files/dirs in `src-tauri/icons/`

Remove files that are not referenced in `tauri.conf.json` and belong to unsupported platforms (Windows Store MSIX, Android, iOS).

- [ ] **Step 1: Verify `tauri.conf.json` icons list hasn't changed**

```bash
grep -A 10 '"icon"' src-tauri/tauri.conf.json
```
Expected output should show only these five paths:
```
"icons/32x32.png",
"icons/128x128.png",
"icons/128x128@2x.png",
"icons/icon.icns",
"icons/icon.ico"
```
If any other path appears, do not delete that file.

- [ ] **Step 2: Delete unused files**

```bash
cd src-tauri/icons
rm 64x64.png StoreLogo.png
rm Square30x30Logo.png Square44x44Logo.png Square71x71Logo.png Square89x89Logo.png Square107x107Logo.png Square142x142Logo.png Square150x150Logo.png Square284x284Logo.png Square310x310Logo.png
rm -rf android ios
```

- [ ] **Step 3: Verify remaining files**

```bash
ls src-tauri/icons/
```
Expected — exactly these files (7):
```
128x128.png
128x128@2x.png
32x32.png
icon.icns
icon.ico
icon.png
icon.svg
```

- [ ] **Step 4: Commit**

```bash
git add -A src-tauri/icons/
git commit -m "chore: remove unused icon variants (MSIX, Android, iOS)"
```

---

## Post-Plan Note: Regenerating Rasterized Icons

After this plan is complete, the PNG/ICO/ICNS files still contain the old flat-color icon. To update them, run:

```bash
npx tauri icon src-tauri/icons/icon.svg
```

This command regenerates all rasterized sizes from the SVG source. It will overwrite `32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.png`, `icon.ico`, and `icon.icns`. Run it, review the output, then commit the regenerated binaries. This is a separate step because it writes binary files and requires `@tauri-apps/cli` to be installed.
