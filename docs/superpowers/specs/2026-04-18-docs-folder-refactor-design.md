---
name: Docs Folder Refactor
description: Separate GitHub Pages website into site/, keep dev docs in docs/, repurpose public/ for app assets
type: project
---

# Docs Folder Refactor

## Goal

Split the overloaded `docs/` folder into two clear-purpose directories, and repurpose `public/` for real app static assets.

## Current State

| Path | Contents | Problem |
|---|---|---|
| `docs/index.html`, `docs/style.css` | GitHub Pages website | Mixed with planning docs |
| `docs/superpowers/specs/`, `docs/superpowers/plans/` | AI specs and plans | Buried under website files |
| `public/tauri.svg`, `public/vite.svg` | Vite scaffold defaults | Not used by the app |

## Target Structure

```
site/                          ← GitHub Pages source
  index.html
  style.css
  screenshot.png               (future: app screenshots)

docs/                          ← all developer-facing content
  superpowers/
    specs/
    plans/
  README.md                    (optional index)

public/                        ← app-specific static assets
  (empty until real assets added: icons, fonts, etc.)

.github/workflows/pages.yml    ← deploys site/ to GitHub Pages
```

## File Changes

| Action | From | To |
|---|---|---|
| Move | `docs/index.html` | `site/index.html` |
| Move | `docs/style.css` | `site/style.css` |
| Keep | `docs/superpowers/` | `docs/superpowers/` |
| Delete | `public/tauri.svg` | — |
| Delete | `public/vite.svg` | — |
| Create | — | `.github/workflows/pages.yml` |

## GitHub Pages Workflow

File: `.github/workflows/pages.yml`

- Trigger: push to `main`
- Steps: checkout → upload `site/` as Pages artifact → deploy via `actions/deploy-pages`
- GitHub Pages settings must be switched from "Deploy from branch → /docs" to "GitHub Actions"

## What's Not Changing

- `docs/superpowers/` paths stay identical — no broken references in existing plan files
- App source code (`src/`, `src-tauri/`) untouched
- `vite.config.ts` `publicDir` stays pointing at `public/` (now empty until real assets are added)
