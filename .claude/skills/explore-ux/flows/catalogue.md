# Flow Catalogue

Each flow is a YAML block under an `## <id>` heading; see `flow-schema.md`.

## open-folder

```yaml
id: open-folder
name: Open a folder via menu
priority: 1
steps:
  - { kind: press, key: "Control+O" }
  - { kind: wait, ms: 500 }
success_signal:
  selector: "[data-testid='folder-tree']"
recovery:
  - { kind: press, key: "Escape" }
```

## open-file

```yaml
id: open-file
name: Open the first .md file in the tree
priority: 1
preconditions:
  - folder is loaded
steps:
  - { kind: click, selector: "[data-testid='folder-tree'] .file-item:first-child" }
success_signal:
  selector: "[data-testid='viewer']"
```

## tab-switch-churn

```yaml
id: tab-switch-churn
name: Rapidly switch tabs to surface MDR-TAB-CHURN
priority: 2
preconditions:
  - at least 2 tabs are open
steps:
  - { kind: press, key: "Control+Tab" }
  - { kind: press, key: "Control+Tab" }
  - { kind: press, key: "Control+Tab" }
  - { kind: press, key: "Control+Tab" }
  - { kind: press, key: "Control+Tab" }
```

## theme-toggle-flash

```yaml
id: theme-toggle-flash
name: Toggle theme to surface MDR-THEME-FLASH
priority: 2
steps:
  - { kind: click, selector: "[data-testid='theme-toggle']" }
  - { kind: wait, ms: 50 }
  - { kind: click, selector: "[data-testid='theme-toggle']" }
```

## comment-add

```yaml
id: comment-add
name: Add a comment to current file
priority: 1
preconditions:
  - one file is open
steps:
  - { kind: click, selector: "[data-testid='add-comment-btn']" }
  - { kind: type,  selector: "textarea[name='comment']", text: "explore-ux probe" }
  - { kind: click, selector: "button[type='submit']" }
success_signal:
  selector: ".comment-thread .comment:last-child"
recovery:
  - { kind: press, key: "Escape" }
```

## search

```yaml
id: search
name: Workspace search
priority: 2
steps:
  - { kind: press, key: "Control+Shift+F" }
  - { kind: type, selector: "[data-testid='search-input']", text: "the" }
  - { kind: wait, ms: 300 }
success_signal:
  selector: "[data-testid='search-results']"
```

## settings-open

```yaml
id: settings-open
name: Open settings
priority: 3
steps:
  - { kind: press, key: "Control+," }
success_signal:
  selector: "[data-testid='settings-dialog']"
recovery:
  - { kind: press, key: "Escape" }
```

## resize-narrow

```yaml
id: resize-narrow
name: Probe responsive behaviour
priority: 3
steps:
  - { kind: resize, width: 600, height: 800 }
  - { kind: wait, ms: 200 }
  - { kind: resize, width: 1280, height: 800 }
```
