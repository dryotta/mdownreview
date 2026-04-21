# [mdownreview - Review AI Agent's work](https://dryotta.github.io/mdownreview)

> Markdown viewer and review app for Windows and Mac: Make inline comments for AI agents to fix.

[![CI](https://github.com/dryotta/mdownreview/actions/workflows/ci.yml/badge.svg)](https://github.com/dryotta/mdownreview/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/dryotta/mdownreview)](https://github.com/dryotta/mdownreview/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## How It Works

1. **Your AI agent writes code** — ask it to build a feature, fix a bug, or refactor
2. **Open in mdownreview** (`/mdownreview:open`) — browse the file tree, read rendered markdown, leave inline review comments
3. **Summarize** (`/mdownreview:read`) — the agent scans all `.review.yaml` sidecars and lists every unresolved comment
4. **Fix** (`/mdownreview:review`) — the agent reads your comments, makes fixes, and marks them resolved
5. **Clean up** (`/mdownreview:cleanup`) — removes sidecar files where all comments are resolved

## Install

Download the latest release for your platform from the [Releases page](https://github.com/dryotta/mdownreview/releases/latest).

| Platform | Architecture | Artifact |
|----------|-------------|----------|
| Windows  | x64 (Intel/AMD) | `mdownreview-x.x.x-windows-x64.zip` |
| Windows  | ARM64 | `mdownreview-x.x.x-windows-arm64.zip` |
| macOS    | Apple Silicon | `mdownreview-x.x.x-macos-arm64.dmg` |

### Script install

**macOS**
```
curl -LsSf https://dryotta.github.io/mdownreview/install.sh | sh
```

**Windows (PowerShell)**
```
powershell -ExecutionPolicy ByPass -c "irm https://dryotta.github.io/mdownreview/install.ps1 | iex"
```

> ⚠️ **Note:** Scripted installs pipe remote code into your shell. Your system administrator or corporate security policy may block this approach. If the script fails or is blocked, use the direct download above instead.

## Agent Skills

Install the agent skills to let your AI agent read and act on review comments:

```
/plugin marketplace add dryotta/mdownreview-skills
/plugin install mdownreview@mdownreview-skills
```

| Skill | Description |
|-------|-------------|
| `open` | Find, install, and launch the mdownreview desktop app |
| `read` | Scan for review sidecars and list unresolved comments |
| `review` | Orchestrate the full cycle — read, fix, and clean up |
| `cleanup` | Delete sidecar files where all comments are resolved |

## Updating

**App** — mdownreview checks for updates automatically on launch and installs them in the background. No action needed.

**Skills** — update to the latest version:
```
/plugin update mdownreview-skills
```

## Building from Source

See [BUILDING.md](BUILDING.md).

## License

MIT — see [LICENSE](LICENSE)
