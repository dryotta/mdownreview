# Performance Benchmarks — Design Spec

**Issue:** [#17 — Rich CLI support without GUI](https://github.com/dryotta/mdownreview/issues/17)
**Scope:** Phase 3 of 3 — CLI and GUI performance benchmarks with CI regression gates
**Phases:** Phase 1 (CLI + Core Extraction) → Phase 2 (MVVM Refactor) → **Phase 3 (Performance Benchmarks)**
**Date:** 2026-04-22
**Depends on:** Phase 1 (CLI binary exists), Phase 2 (core logic in Rust)

## Problem

mdownreview has no performance measurement infrastructure. There is no way to:
- Detect performance regressions introduced by new code
- Compare CLI vs GUI performance for the same operations
- Validate that the Rust migration (Phases 1-2) actually improved performance
- Prevent slow operations from degrading the user experience over time

The AGENTS.md principle "Evidence-Based Only" requires benchmarks before claiming performance improvements.

## Goal

1. **CLI benchmarks** — measure core Rust operations and CLI subcommand latency using `criterion`
2. **GUI benchmarks** — measure time-to-first-render, file-open latency, and comment-load time via Playwright
3. **CI regression gate** — CLI benchmarks run in CI and fail the build on >15% regression
4. **GUI benchmarks** — run manually, results stored for comparison (too noisy for CI gating)

## Non-Goals (this phase)

- Profiling tools or flame graph integration
- Memory usage benchmarks (future work)
- Benchmark dashboard or historical trend visualization
- Benchmarking the Python CLI script (it will be deprecated)

---

## CLI Benchmarks

### Rust Micro-Benchmarks (criterion)

Located in `src-tauri/benches/`. Uses the [criterion](https://docs.rs/criterion) crate for statistical benchmarking with warm-up, iteration, and outlier detection.

#### Benchmark Groups

**1. `sidecar_bench.rs` — Sidecar I/O**

```rust
fn bench_load_sidecar(c: &mut Criterion) {
    // Fixture: 50-comment YAML sidecar (~5KB)
    c.bench_function("load_sidecar_50_comments", |b| {
        b.iter(|| core::sidecar::load_sidecar(fixture_path))
    });
}

fn bench_save_sidecar(c: &mut Criterion) {
    // 50 comments, measures atomic write (temp + rename)
    c.bench_function("save_sidecar_50_comments", |b| {
        b.iter(|| core::sidecar::save_sidecar(path, doc, &comments))
    });
}

fn bench_patch_comment(c: &mut Criterion) {
    // Surgical edit: resolve one comment in a 50-comment file
    c.bench_function("patch_comment_resolve", |b| {
        b.iter(|| core::sidecar::patch_comment(path, id, &[SetResolved(true)]))
    });
}
```

**2. `matching_bench.rs` — Comment Matching**

```rust
fn bench_match_comments(c: &mut Criterion) {
    let mut group = c.benchmark_group("matching");

    // Small: 10 comments, 100-line file
    group.bench_function("10_comments_100_lines", |b| {
        b.iter(|| core::matching::match_comments(&small_comments, &small_lines))
    });

    // Medium: 50 comments, 1000-line file
    group.bench_function("50_comments_1000_lines", |b| {
        b.iter(|| core::matching::match_comments(&med_comments, &med_lines))
    });

    // Large: 200 comments, 5000-line file (stress test)
    group.bench_function("200_comments_5000_lines", |b| {
        b.iter(|| core::matching::match_comments(&large_comments, &large_lines))
    });

    group.finish();
}

fn bench_levenshtein(c: &mut Criterion) {
    // Pure algorithm benchmark
    c.bench_function("levenshtein_100_chars", |b| {
        b.iter(|| core::matching::levenshtein(&string_a, &string_b))
    });
}
```

**3. `scanner_bench.rs` — Directory Scanning**

```rust
fn bench_scan_review_files(c: &mut Criterion) {
    let mut group = c.benchmark_group("scanner");

    // Flat: 100 files, 20 sidecars
    group.bench_function("flat_100_files", |b| {
        b.iter(|| core::scanner::find_review_files(fixture_path, 10000))
    });

    // Deep: 5 levels, 500 files, 100 sidecars
    group.bench_function("nested_500_files", |b| {
        b.iter(|| core::scanner::find_review_files(fixture_path, 10000))
    });

    group.finish();
}
```

**4. `threads_bench.rs` — Thread Building**

```rust
fn bench_group_threads(c: &mut Criterion) {
    // 100 comments, 30 threads with 1-5 replies each
    c.bench_function("group_100_comments", |b| {
        b.iter(|| core::threads::group_into_threads(&comments))
    });
}
```

**5. `hot_path_bench.rs` — Combined GUI Hot Path (Phase 2)**

```rust
fn bench_get_file_comments(c: &mut Criterion) {
    let mut group = c.benchmark_group("hot_path");

    // Small: 10 comments, 100-line file — typical user scenario
    group.bench_function("get_file_comments_small", |b| {
        b.iter(|| {
            let sidecar = core::sidecar::load_sidecar(small_sidecar).unwrap().unwrap();
            let matched = core::matching::match_comments(&sidecar.comments, &small_lines);
            core::threads::group_into_threads(&matched)
        })
    });

    // Large: 200 comments, 5000-line file — stress test
    group.bench_function("get_file_comments_large", |b| {
        b.iter(|| {
            let sidecar = core::sidecar::load_sidecar(large_sidecar).unwrap().unwrap();
            let matched = core::matching::match_comments(&sidecar.comments, &large_lines);
            core::threads::group_into_threads(&matched)
        })
    });

    group.finish();
}
```

### Cargo Configuration

Add to `src-tauri/Cargo.toml`:

```toml
[dev-dependencies]
criterion = { version = "0.4", features = ["html_reports"] }
# Note: Using 0.4 (not 0.5) because 0.5 removed --output-format bencher
# which is required by github-action-benchmark

[[bench]]
name = "sidecar_bench"
harness = false

[[bench]]
name = "matching_bench"
harness = false

[[bench]]
name = "scanner_bench"
harness = false

[[bench]]
name = "threads_bench"
harness = false

[[bench]]
name = "hot_path_bench"
harness = false
```

### Benchmark Fixtures

Located in `src-tauri/benches/fixtures/`:

```
benches/fixtures/
  small/                    ← 10 files, 3 sidecars (10 comments each)
  medium/                   ← 100 files, 20 sidecars (50 comments each)
  large/                    ← 500 files (nested 5 levels), 100 sidecars (50 comments each)
  comments_50.review.yaml   ← standalone 50-comment sidecar
  file_100_lines.md         ← 100-line markdown file
  file_1000_lines.md        ← 1000-line markdown file
  file_5000_lines.md        ← 5000-line source file
```

Fixtures are generated once by a standalone Rust script (`benches/generate_fixtures.rs`, run manually via `cargo run --example generate_bench_fixtures`) and the output is committed to the repo. They use a seeded RNG for deterministic, reproducible benchmarks. Re-run only when fixture requirements change.

### CLI Subprocess Benchmarks

A shell script `scripts/bench-cli.ps1` times the CLI binary end-to-end:

```powershell
# Runs each CLI subcommand against fixture directories and reports wall-clock time
# Uses Measure-Command for timing on Windows

$cli = "target/release/mdownreview-cli"

# Warm-up run (discard)
& $cli read --folder benches/fixtures/medium --format json | Out-Null

# Timed runs (5 iterations, report mean + stddev)
$results = @()
for ($i = 0; $i -lt 5; $i++) {
    $time = (Measure-Command { & $cli read --folder benches/fixtures/medium --format json | Out-Null }).TotalMilliseconds
    $results += $time
}
# Report mean and stddev
```

Subcommands benchmarked:
- `read --folder <medium> --format json` — scan + load + filter + serialize
- `read --folder <medium> --format text` — scan + load + filter + format
- `cleanup --folder <medium> --dry-run` — scan + load + check resolved
- `resolve <sidecar> <id>` — load + patch + save

---

## GUI Benchmarks

### Playwright Performance Tests

Located in `e2e/browser/perf/`. These are NOT part of the regular test suite — they run via a separate npm script.

#### Metrics Collected

| Metric | How measured | Target |
|---|---|---|
| Time to first render | `page.waitForSelector('.app-ready')` minus navigation start | < 500ms |
| File open latency | Timestamp before click → content visible | < 200ms (small file) |
| Comment load latency | File with 50 comments → all threads rendered | < 100ms (50 comments) |
| Large file render | Open 5000-line file → last line visible | < 1000ms |
| Thread building | Load 100-comment file → all threads rendered | < 300ms |
| Mutation round-trip | Click resolve → UI reflects resolved state | < 150ms |

#### Implementation

GUI benchmarks use the existing IPC-mock e2e pattern and DOM-based timing:

```typescript
// e2e/browser/perf/file-open.perf.ts
import { test } from "../fixtures";

test("file open latency - small markdown", async ({ page }) => {
  // Click a file in the folder tree to trigger open
  const start = Date.now();
  await page.click('[data-testid="tree-item-file.md"]');
  await page.waitForSelector('[data-testid="markdown-content"]');
  const elapsed = Date.now() - start;

  // Write result to stdout for collection
  console.log(`PERF:file-open-small:${elapsed}ms`);
});

test("mutation round-trip - resolve comment", async ({ page }) => {
  // Measures: click Resolve → comments-changed event → UI updated
  const start = Date.now();
  await page.click('[data-testid="resolve-button"]');
  await page.waitForSelector('[data-testid="comment-resolved"]');
  const elapsed = Date.now() - start;

  console.log(`PERF:resolve-roundtrip:${elapsed}ms`);
});
```

#### Runner Script

```powershell
# scripts/bench-gui.ps1
# Runs GUI perf tests 5 times, collects results, reports statistics

npx playwright test --config playwright.browser.config.ts e2e/browser/perf/ --repeat-each 5 --reporter json > perf-results.json
node scripts/summarize-perf.js perf-results.json
```

#### Results Format

Results are written to `perf-results.json`:

```json
{
  "timestamp": "2026-04-22T12:00:00Z",
  "commit": "abc1234",
  "metrics": {
    "file-open-small": { "mean": 145, "p50": 140, "p95": 180, "unit": "ms" },
    "comment-load-50": { "mean": 65, "p50": 60, "p95": 90, "unit": "ms" },
    "large-file-render": { "mean": 750, "p50": 720, "p95": 900, "unit": "ms" }
  }
}
```

This file is NOT committed (in `.gitignore`). It's generated on-demand for manual comparison.

---

## CI Integration

### CLI Benchmark Gate

Add to `.github/workflows/ci.yml`:

```yaml
  bench:
    name: CLI Benchmarks
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Rust (stable)
        uses: dtolnay/rust-toolchain@stable

      - name: Cache Rust build artifacts
        uses: Swatinem/rust-cache@v2
        with:
          workspaces: src-tauri

      - name: Run criterion benchmarks
        working-directory: src-tauri
        run: cargo bench --bench sidecar_bench --bench matching_bench --bench scanner_bench --bench threads_bench --bench hot_path_bench -- --output-format bencher 2>&1 | tee bench-output.txt

      - name: Check for regression
        uses: benchmark-action/github-action-benchmark@v1
        with:
          tool: "cargo"
          output-file-path: src-tauri/bench-output.txt
          alert-threshold: "115%"
          fail-on-alert: true
          github-token: ${{ secrets.GITHUB_TOKEN }}
          comment-on-alert: true
          alert-comment-cc-users: "@dryotta"
```

**How the gate works:**
1. `criterion` runs benchmarks and outputs results in `bencher` format
2. `github-action-benchmark` compares against the previous run stored in GitHub Pages
3. If any benchmark is >15% slower than the previous run, the check fails
4. A PR comment is posted with the regression details

**Baseline bootstrapping:** The first CI run establishes the baseline — no comparison is possible, so the gate always passes. The gate becomes meaningful from the second run onward. Start with `fail-on-alert: false` (reporting only) until baseline noise is characterized across ~10 runs, then enable hard failure.

### GUI Benchmarks (Manual Only)

Not in CI. Run locally:
```powershell
npm run bench:gui    # runs scripts/bench-gui.ps1
```

Compare results manually:
```powershell
node scripts/compare-perf.js perf-results-before.json perf-results-after.json
```

---

## npm Scripts

Add to `package.json`:

```json
{
  "scripts": {
    "bench:cli": "cd src-tauri && cargo bench",
    "bench:gui": "pwsh scripts/bench-gui.ps1",
    "bench:compare": "node scripts/compare-perf.js"
  }
}
```

---

## File Layout

```
src-tauri/
  benches/
    sidecar_bench.rs
    matching_bench.rs
    scanner_bench.rs
    threads_bench.rs
    hot_path_bench.rs
    fixtures/
      small/           ← 10 files, 3 sidecars
      medium/          ← 100 files, 20 sidecars
      large/           ← 500 files nested, 100 sidecars
      comments_50.review.yaml
      file_100_lines.md
      file_1000_lines.md
      file_5000_lines.md
    generate_fixtures.rs  ← deterministic fixture generator

e2e/browser/perf/
  file-open.perf.ts
  comment-load.perf.ts
  large-file.perf.ts

scripts/
  bench-cli.ps1          ← CLI subprocess timing
  bench-gui.ps1          ← GUI perf test runner
  summarize-perf.js      ← Parse Playwright JSON output into perf-results.json
  compare-perf.js        ← Compare two perf-results.json files
```

---

## Testing

### Benchmark Correctness

The benchmarks themselves don't need functional tests — criterion validates statistical significance. However:

- **Fixture generation** is tested: `generate_fixtures.rs` includes `#[test]` that verifies fixture files are parseable and have expected counts
- **Perf test scripts** are validated by running them once in CI (without the regression gate) to ensure they don't error out

### Existing Tests

All must continue to pass — benchmarks don't change any production code:
- `cargo test`
- `npm test`
- `npm run test:e2e`
- `npm run lint`

---

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| CI benchmark noise (VM performance varies) | criterion's statistical analysis handles this; 15% threshold is generous enough to absorb CI variance |
| Benchmark fixtures bloat the repo | Small/medium fixtures are <1MB total; large fixture is ~5MB. Acceptable for a desktop app repo |
| GUI benchmarks unreliable | Not gated in CI; manual-only with explicit warm-up runs and 5-iteration averaging |
| `github-action-benchmark` requires GitHub Pages | Already enabled for the project site; benchmark data stored in a separate `gh-pages` branch directory |
