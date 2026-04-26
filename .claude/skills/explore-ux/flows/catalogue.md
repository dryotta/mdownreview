# Flow Catalogue

Each flow is a YAML block under an `## <id>` heading; see `flow-schema.md`.
Catalogue avoids native OS dialogs (file/folder pickers) which block WebView2 and freeze CDP.
Use `kind: emit` with the menu event name to trigger app actions that would otherwise need clicking a native menu.

## about-dialog

```yaml
id: about-dialog
name: Open then close the About dialog
priority: 1
steps:
  - { kind: emit, event: "menu-about" }
  - { kind: wait, ms: 200 }
  - { kind: press, key: "Escape" }
  - { kind: wait, ms: 100 }
success_signal:
  selector: "[data-testid='about-dialog']"
```

## settings-dialog

```yaml
id: settings-dialog
name: Open then close Settings
priority: 1
steps:
  - { kind: emit, event: "menu-open-settings" }
  - { kind: wait, ms: 300 }
  - { kind: press, key: "Escape" }
  - { kind: wait, ms: 100 }
success_signal:
  selector: ".settings-dialog, [role='dialog']"
```

## comments-pane-toggle

```yaml
id: comments-pane-toggle
name: Toggle comments pane on and off
priority: 2
steps:
  - { kind: press, key: "Control+Shift+C" }
  - { kind: wait, ms: 150 }
  - { kind: press, key: "Control+Shift+C" }
  - { kind: wait, ms: 150 }
```

## theme-toggle-flash

```yaml
id: theme-toggle-flash
name: Toggle theme via menu events to surface MDR-THEME-FLASH
priority: 2
steps:
  - { kind: emit, event: "menu-theme-light" }
  - { kind: wait, ms: 100 }
  - { kind: emit, event: "menu-theme-dark" }
  - { kind: wait, ms: 100 }
  - { kind: emit, event: "menu-theme-light" }
  - { kind: wait, ms: 100 }
```

## tab-shortcut-noops

```yaml
id: tab-shortcut-noops
name: Tab navigation shortcuts when no tabs open (should noop)
priority: 3
steps:
  - { kind: press, key: "Control+Tab" }
  - { kind: wait, ms: 50 }
  - { kind: press, key: "Control+Shift+Tab" }
  - { kind: wait, ms: 50 }
  - { kind: press, key: "Control+W" }
  - { kind: wait, ms: 50 }
  - { kind: press, key: "Control+Shift+W" }
  - { kind: wait, ms: 50 }
```

## resize-narrow

```yaml
id: resize-narrow
name: Probe responsive layout at narrow widths
priority: 2
steps:
  - { kind: resize, width: 600, height: 800 }
  - { kind: wait, ms: 200 }
  - { kind: resize, width: 400, height: 800 }
  - { kind: wait, ms: 200 }
  - { kind: resize, width: 320, height: 600 }
  - { kind: wait, ms: 200 }
  - { kind: resize, width: 1280, height: 800 }
  - { kind: wait, ms: 100 }
```

## zoom-cycle

```yaml
id: zoom-cycle
name: Zoom shortcuts
priority: 3
steps:
  - { kind: press, key: "Control+=" }
  - { kind: wait, ms: 80 }
  - { kind: press, key: "Control+=" }
  - { kind: wait, ms: 80 }
  - { kind: press, key: "Control+-" }
  - { kind: wait, ms: 80 }
  - { kind: press, key: "Control+0" }
  - { kind: wait, ms: 80 }
```

## check-updates

```yaml
id: check-updates
name: Trigger updater check via menu event
priority: 3
steps:
  - { kind: emit, event: "menu-check-updates" }
  - { kind: wait, ms: 500 }
```

## close-folder-noop

```yaml
id: close-folder-noop
name: Close-folder when none open (should be safe noop)
priority: 3
steps:
  - { kind: emit, event: "menu-close-folder" }
  - { kind: wait, ms: 100 }
```

## settings-then-about

```yaml
id: settings-then-about
name: Open Settings, then About without closing — exposes layered-modal handling
priority: 2
steps:
  - { kind: emit, event: "menu-open-settings" }
  - { kind: wait, ms: 250 }
  - { kind: emit, event: "menu-about" }
  - { kind: wait, ms: 250 }
  - { kind: press, key: "Escape" }
  - { kind: wait, ms: 100 }
  - { kind: press, key: "Escape" }
  - { kind: wait, ms: 100 }
```
