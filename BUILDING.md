# Building mdownreview

## Prerequisites

- [Node.js LTS](https://nodejs.org) (v20+)
- [Rust stable](https://rustup.rs) (1.75+)

## Setup

```bash
git clone https://github.com/dryotta/mdownreview.git
cd mdownreview
npm install
```

## Development

```bash
npm run tauri          # dev server with hot reload
```

## Testing

```bash
npm test               # unit tests (Vitest)
npm run test:e2e       # E2E tests (Playwright)
cargo test             # Rust integration tests (run from src-tauri/)
```

## Production Build

```bash
npm run tauri:build    # builds platform installer
```

Output locations:
- **Windows:** `src-tauri/target/release/bundle/nsis/`
- **macOS:** `src-tauri/target/release/bundle/dmg/`
