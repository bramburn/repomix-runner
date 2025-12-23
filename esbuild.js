const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
  name: 'esbuild-problem-matcher',

  setup(build) {
    build.onStart(() => {
      console.log('[watch] build started');
    });
    build.onEnd(result => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ [ERROR] ${text}`);
        console.error(`    ${location.file}:${location.line}:${location.column}:`);
      });
      console.log('[watch] build finished');
    });
  },
};

/**
 * Plugin to copy WASM files to dist directory
 * - sql.wasm: copied from node_modules (only if not already present)
 * - tree-sitter WASM: copied from assets/tree-sitter-wasm/ (on every build to ensure they're present)
 */
const copyWasmPlugin = {
  name: 'copy-wasm',

  setup(build) {
    build.onEnd(() => {
      // Ensure dist directory exists
      const distDir = path.join(__dirname, 'dist');
      if (!fs.existsSync(distDir)) {
        fs.mkdirSync(distDir, { recursive: true });
      }

      // Copy sql.wasm file to dist directory (only if not already present)
      const sqlWasmSource = path.join(__dirname, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
      const sqlWasmDest = path.join(__dirname, 'dist', 'sql-wasm.wasm');

      if (fs.existsSync(sqlWasmSource)) {
        if (!fs.existsSync(sqlWasmDest)) {
          fs.copyFileSync(sqlWasmSource, sqlWasmDest);
          console.log('Copied sql-wasm.wasm to dist/');
        } else {
          console.log('sql-wasm.wasm already exists in dist/, skipping copy.');
        }
      } else {
        console.warn('sql-wasm.wasm not found in node_modules/sql.js/dist/');
      }

      // Copy tree-sitter WASM files from assets/ to dist/ (on every build)
      const treeSitterSourceDir = path.join(__dirname, 'assets', 'tree-sitter-wasm');
      const treeSitterDestDir = path.join(__dirname, 'dist', 'tree-sitter-wasm');

      if (fs.existsSync(treeSitterSourceDir)) {
        // Create destination directory if it doesn't exist
        if (!fs.existsSync(treeSitterDestDir)) {
          fs.mkdirSync(treeSitterDestDir, { recursive: true });
        }

        const wasmFiles = fs.readdirSync(treeSitterSourceDir).filter(file => file.endsWith('.wasm'));
        if (wasmFiles.length > 0) {
          let copiedCount = 0;
          for (const file of wasmFiles) {
            const sourcePath = path.join(treeSitterSourceDir, file);
            const destPath = path.join(treeSitterDestDir, file);

            // Copy if dest doesn't exist or source is newer
            if (!fs.existsSync(destPath) ||
                fs.statSync(sourcePath).mtimeMs > fs.statSync(destPath).mtimeMs) {
              fs.copyFileSync(sourcePath, destPath);
              copiedCount++;
            }
          }
          console.log(`Copied ${copiedCount} tree-sitter WASM files from assets/ to dist/`);
        } else {
          console.warn('tree-sitter-wasm directory exists but contains no .wasm files. Run "npm run setup:treesitter" first.');
        }
      } else {
        console.warn('tree-sitter-wasm directory not found in assets/. Run "npm run setup:treesitter" first.');
      }
    });
  }
};

async function main() {
  const extensionCtx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    outfile: 'dist/extension.js',
    external: ['vscode'],
    logLevel: 'silent',
    plugins: [esbuildProblemMatcherPlugin, copyWasmPlugin],
  });

  const webviewCtx = await esbuild.context({
    entryPoints: ['src/webview/index.tsx'],
    bundle: true,
    format: 'esm',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'browser',
    outfile: 'dist/webview.js',
    logLevel: 'silent',
    plugins: [esbuildProblemMatcherPlugin, copyWasmPlugin],
  });

  if (watch) {
    await Promise.all([extensionCtx.watch(), webviewCtx.watch()]);
  } else {
    await Promise.all([extensionCtx.rebuild(), webviewCtx.rebuild()]);
    await Promise.all([extensionCtx.dispose(), webviewCtx.dispose()]);
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
