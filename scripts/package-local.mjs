import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const packageJsonPath = path.join(rootDir, 'package.json');
const backupPath = path.join(rootDir, 'package.json.backup');

function cleanup() {
  console.log('\nCleaning up...');
  if (fs.existsSync(backupPath)) {
    fs.copyFileSync(backupPath, packageJsonPath);
    fs.unlinkSync(backupPath);
    console.log('Restored original package.json');
  }
}

function setupSignalHandlers() {
  process.on('SIGINT', () => {
    console.log('\nReceived SIGINT');
    cleanup();
    process.exit(1);
  });
  process.on('SIGTERM', () => {
    console.log('\nReceived SIGTERM');
    cleanup();
    process.exit(1);
  });
}

function getTimestampedVersion(currentVersion) {
  // Strip existing -alpha suffixes to avoid stacking
  const baseVersion = currentVersion.replace(/-alpha.*$/, '');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `${baseVersion}-alpha.${timestamp}`;
}

function updateVersion(newVersion) {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  packageJson.version = newVersion;
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
  console.log(`Version updated to: ${newVersion}`);
}

function ensureTreesitterAssets() {
  const manifestPath = path.join(rootDir, 'assets', 'tree-sitter-wasm', 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.log('Tree-sitter WASM assets not found, running setup...');
    execSync('node scripts/setup-treesitter.mjs', { cwd: rootDir, stdio: 'inherit' });
  } else {
    console.log('Tree-sitter WASM assets present');
  }
}

function runVsixPackaging() {
  console.log('Running VSIX packaging...');
  execSync('npm run package:vsix', { cwd: rootDir, stdio: 'inherit' });
}

async function main() {
  setupSignalHandlers();

  // Backup package.json
  fs.copyFileSync(packageJsonPath, backupPath);
  console.log('Backed up package.json');

  try {
    // Read current version
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const originalVersion = packageJson.version;
    console.log(`Original version: ${originalVersion}`);

    // Generate timestamped alpha version
    const newVersion = getTimestampedVersion(originalVersion);

    // Update version
    updateVersion(newVersion);

    // Ensure tree-sitter assets
    ensureTreesitterAssets();

    // Run VSIX packaging
    runVsixPackaging();

    console.log('\nLocal packaging complete!');
  } finally {
    // Always restore original package.json
    cleanup();
  }
}

main();
