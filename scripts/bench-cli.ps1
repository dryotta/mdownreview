# bench-cli.ps1 — CLI subprocess timing for mdownreview-cli
# Runs each CLI subcommand against fixture directories and reports wall-clock time

param(
    [int]$Iterations = 5,
    [string]$Binary = $null
)

$ErrorActionPreference = "Stop"

# Find binary
if (-not $Binary) {
    $Binary = Join-Path $PSScriptRoot "..\src-tauri\target\release\mdownreview-cli"
    if ($IsWindows -or $env:OS -eq "Windows_NT") {
        $Binary += ".exe"
    }
}

if (-not (Test-Path $Binary)) {
    Write-Error "CLI binary not found at $Binary. Run 'cargo build --release --bin mdownreview-cli' first."
    exit 1
}

$fixturesDir = Join-Path $PSScriptRoot "..\src-tauri\benches\fixtures"
if (-not (Test-Path $fixturesDir)) {
    Write-Error "Fixtures not found at $fixturesDir. Run fixture generator first."
    exit 1
}

function Measure-Mean($values) {
    ($values | Measure-Object -Average).Average
}

function Measure-Stddev($values) {
    $mean = Measure-Mean $values
    $variance = ($values | ForEach-Object { ($_ - $mean) * ($_ - $mean) } | Measure-Object -Average).Average
    [Math]::Sqrt($variance)
}

function Run-Benchmark($name, $scriptBlock) {
    Write-Host "`n--- $name ---" -ForegroundColor Cyan

    # Warm-up
    & $scriptBlock | Out-Null

    $results = @()
    for ($i = 0; $i -lt $Iterations; $i++) {
        $time = (Measure-Command { & $scriptBlock | Out-Null }).TotalMilliseconds
        $results += $time
    }

    $mean = [Math]::Round((Measure-Mean $results), 2)
    $stddev = [Math]::Round((Measure-Stddev $results), 2)
    Write-Host "  Mean: ${mean}ms  Stddev: ${stddev}ms  (n=$Iterations)"
    return @{ name = $name; mean = $mean; stddev = $stddev }
}

Write-Host "mdownreview-cli benchmark ($Iterations iterations)" -ForegroundColor Green
Write-Host "Binary: $Binary"

$allResults = @()

# read --folder medium --format json
$mediumDir = Join-Path $fixturesDir "medium"
if (Test-Path $mediumDir) {
    $allResults += Run-Benchmark "read-json-medium" { & $Binary read --folder $mediumDir --format json }
    $allResults += Run-Benchmark "read-text-medium" { & $Binary read --folder $mediumDir --format text }
    $allResults += Run-Benchmark "cleanup-dryrun-medium" { & $Binary cleanup --folder $mediumDir --dry-run }
}

# Single file resolve
$sidecarFile = Join-Path $fixturesDir "comments_50.review.yaml"
if (Test-Path $sidecarFile) {
    # Find a comment ID to resolve (parse first comment)
    $content = Get-Content $sidecarFile -Raw
    if ($content -match 'id:\s+"([^"]+)"') {
        $commentId = $Matches[1]
        $sourceFile = Join-Path $fixturesDir "file_100_lines.md"
        $allResults += Run-Benchmark "resolve-single" { & $Binary resolve $sourceFile $commentId }
    }
}

Write-Host "`n=== Summary ===" -ForegroundColor Green
foreach ($r in $allResults) {
    Write-Host ("  {0,-30} {1,10}ms ± {2}ms" -f $r.name, $r.mean, $r.stddev)
}
