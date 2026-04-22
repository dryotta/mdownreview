// Warns when a source file in src/lib/ or src/components/ is written without a test file.
const raw = require('fs').readFileSync(0, 'utf8');
try {
  const fp = JSON.parse(raw)?.tool_input?.file_path;
  if (!fp) process.exit(0);
  if (!/src[\\/](lib|components)[\\/]/.test(fp)) process.exit(0);
  if (/(__tests__|\.test\.|test-setup|__mocks__)/.test(fp)) process.exit(0);
  if (!/\.(ts|tsx)$/.test(fp)) process.exit(0);

  // Derive expected test path: insert __tests__ before filename
  const path = require('path');
  const dir = path.dirname(fp);
  const base = path.basename(fp).replace(/\.tsx?$/, (m) => `.test${m}`);
  const testPath = path.join(dir, '__tests__', base);

  if (!require('fs').existsSync(testPath)) {
    process.stderr.write(`⚠  No test file: ${testPath}\n`);
  }
} catch (_) {}
