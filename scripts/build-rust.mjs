import { execSync } from 'child_process';
import { copyFileSync, mkdirSync, existsSync } from 'fs';
import { platform, arch } from 'os';
import { join } from 'path';

const currentPlatform = platform();
const currentArch = arch();
const isWindows = currentPlatform === 'win32';
const targetDir = join('assets', 'bin');
const rustDir = join('rust');

// Target naming convention: repomix-clipboard-${platform}-${arch}${ext}
const binaryExtension = isWindows ? '.exe' : '';
const targetBinaryName = `repomix-clipboard-${currentPlatform}-${currentArch}${binaryExtension}`;

console.log(`Building Rust clipboard tool for ${currentPlatform}-${currentArch}...`);

if (!existsSync(targetDir)) {
  mkdirSync(targetDir, { recursive: true });
}

try {
  // Build for the host platform
  let buildCommand = 'cargo build --release';

  // Note: For pure host builds, we don't need --target usually.
  // If we wanted cross-compilation, we'd add it here.

  execSync(buildCommand, { cwd: rustDir, stdio: 'inherit' });

  const releaseDir = join(rustDir, 'target', 'release');

  // The source binary name produced by cargo (matches package name in Cargo.toml)
  const sourceBinaryName = isWindows ? 'repomix-clipboard.exe' : 'repomix-clipboard';
  const sourcePath = join(releaseDir, sourceBinaryName);
  const destPath = join(targetDir, targetBinaryName);

  if (existsSync(sourcePath)) {
    copyFileSync(sourcePath, destPath);
    console.log(`Successfully built and copied ${sourceBinaryName} to ${destPath}`);
  } else {
    console.error(`Error: Could not find built binary at ${sourcePath}`);
    process.exit(1);
  }

} catch (error) {
  console.error('Failed to build Rust clipboard tool:', error);
  process.exit(1);
}
