import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const packageJsonPath = path.resolve(__dirname, '..', 'package.json');
const originalPackageJson = fs.readFileSync(packageJsonPath, 'utf-8');
const packageData = JSON.parse(originalPackageJson);

const restorePackageJson = () => {
  try {
    fs.writeFileSync(packageJsonPath, originalPackageJson);
    console.log('Restored original package.json');
  } catch (err) {
    console.error('Error restoring package.json:', err);
  }
};

// Handle signals to ensure cleanup
['SIGINT', 'SIGTERM'].forEach((signal) => {
  process.on(signal, () => {
    console.log(`\nReceived ${signal}. Cleaning up...`);
    restorePackageJson();
    process.exit(1);
  });
});

try {
  const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14); // YYYYMMDDHHMMSS
  const originalVersion = packageData.version;
  packageData.version = `${originalVersion}-alpha.${timestamp}`;
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageData, null, 2));

  console.log(`Packaging local version: ${packageData.version}`);

  // Run the existing package:vsix script
  execSync('npm run package:vsix', { stdio: 'inherit', cwd: path.resolve(__dirname, '..') });

  console.log('Packaging complete.');
} catch (error) {
  console.error('Error packaging local version:', error);
  process.exitCode = 1;
} finally {
  restorePackageJson();
}
