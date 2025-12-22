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

      // Copy sql.wasm file to dist directory
      const sqlWasmSource = path.join(__dirname, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
      const sqlWasmDest = path.join(__dirname, 'dist', 'sql-wasm.wasm');

      if (fs.existsSync(sqlWasmSource)) {
        fs.copyFileSync(sqlWasmSource, sqlWasmDest);
        console.log('Copied sql-wasm.wasm to dist/');
      } else {
        console.warn('sql-wasm.wasm not found in node_modules/sql.js/dist/');
      }

      // Copy tiktoken_bg.wasm file to dist directory
      const tiktokenWasmSource = path.join(__dirname, 'node_modules', 'tiktoken', 'tiktoken_bg.wasm');
      const tiktokenWasmDest = path.join(__dirname, 'dist', 'tiktoken_bg.wasm');

      if (fs.existsSync(tiktokenWasmSource)) {
        fs.copyFileSync(tiktokenWasmSource, tiktokenWasmDest);
        console.log('Copied tiktoken_bg.wasm to dist/');
      } else {
        console.warn('tiktoken_bg.wasm not found in node_modules/tiktoken/');
      }

      // Copy tree-sitter WASM files to dist directory
      const treeSitterSourceDir = path.join(__dirname, 'dist', 'tree-sitter-wasm');
      const treeSitterDestDir = path.join(__dirname, 'dist', 'tree-sitter-wasm');

      if (fs.existsSync(treeSitterSourceDir)) {
        // Ensure destination directory exists
        if (!fs.existsSync(treeSitterDestDir)) {
          fs.mkdirSync(treeSitterDestDir, { recursive: true });
        }

        // Copy all WASM files
        const wasmFiles = fs.readdirSync(treeSitterSourceDir).filter(file => file.endsWith('.wasm'));
        wasmFiles.forEach(wasmFile => {
          const srcPath = path.join(treeSitterSourceDir, wasmFile);
          const destPath = path.join(treeSitterDestDir, wasmFile);
          fs.copyFileSync(srcPath, destPath);
        });

        // Copy manifest.json
        const manifestSrc = path.join(treeSitterSourceDir, 'manifest.json');
        const manifestDest = path.join(treeSitterDestDir, 'manifest.json');
        if (fs.existsSync(manifestSrc)) {
          fs.copyFileSync(manifestSrc, manifestDest);
        }

        if (wasmFiles.length > 0) {
          console.log(`Copied ${wasmFiles.length} tree-sitter WASM files to dist/tree-sitter-wasm/`);
        }
      } else {
        console.warn('tree-sitter-wasm directory not found. Run "npm run setup:treesitter" first.');
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
