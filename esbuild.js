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
