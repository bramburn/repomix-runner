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
 * Plugin to copy WASM files to dist directory (only if they don't already exist)
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

      // Verify tree-sitter WASM files exist in dist directory
      const treeSitterDir = path.join(__dirname, 'dist', 'tree-sitter-wasm');

      if (fs.existsSync(treeSitterDir)) {
        const wasmFiles = fs.readdirSync(treeSitterDir).filter(file => file.endsWith('.wasm'));
        if (wasmFiles.length > 0) {
          console.log(`Found ${wasmFiles.length} tree-sitter WASM files in dist/tree-sitter-wasm/ (skipping setup)`);
        } else {
          console.warn('tree-sitter-wasm directory exists but contains no .wasm files. Run "npm run setup:treesitter" first.');
        }
      } else {
        console.warn('tree-sitter-wasm directory not found in dist/. Run "npm run setup:treesitter" first.');
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
