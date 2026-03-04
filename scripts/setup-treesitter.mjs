#!/usr/bin/env node

/**
 * Tree-sitter WASM setup script
 * Downloads tree-sitter language parsers and copies them to the distribution directory
 *
 * Supported languages: javascript, typescript, python, rust, csharp, dart
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import { createWriteStream } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
// Store WASM files in assets/ to persist across builds (dist/ is wiped by rimraf)
const wasmDir = path.resolve(projectRoot, 'assets', 'tree-sitter-wasm');

// Tree-sitter language parsers to download
const LANGUAGES = {
  javascript: 'tree-sitter-javascript',
  typescript: 'tree-sitter-typescript',
  python: 'tree-sitter-python',
  rust: 'tree-sitter-rust',
  csharp: 'tree-sitter-c-sharp',
  dart: 'tree-sitter-dart',
};

// GitHub releases base URL for tree-sitter parsers
const GITHUB_BASE = 'https://github.com/tree-sitter/tree-sitter-';

// Parser versions and download sources
// Note: C# and Dart are downloaded from tree-sitter-wasms package which provides
// web-tree-sitter compatible WASM files (built with correct ABI)
const PARSER_VERSIONS = {
  javascript: { version: 'v0.25.0', repo: 'tree-sitter-javascript', source: 'github' },
  typescript: { version: 'v0.25.0', repo: 'tree-sitter-typescript', source: 'github' },
  python: { version: 'v0.25.0', repo: 'tree-sitter-python', source: 'github' },
  rust: { version: 'v0.25.0', repo: 'tree-sitter-rust', source: 'github' },
  csharp: { version: 'latest', repo: 'tree-sitter-c-sharp', source: 'unpkg', unpkgName: 'tree-sitter-c_sharp' },
  dart: { version: 'latest', repo: 'tree-sitter-dart', source: 'unpkg', unpkgName: 'tree-sitter-dart' },
};

/**
 * Fetch latest release version from GitHub API
 */
async function getLatestVersion(repo) {
  return new Promise((resolve, reject) => {
    const url = `https://api.github.com/repos/tree-sitter/${repo}/releases/latest`;
    const request = https.get(url, { headers: { 'User-Agent': 'repomix-runner-plus' } }, (response) => {
      let data = '';

      response.on('data', (chunk) => {
        data += chunk;
      });

      response.on('end', () => {
        try {
          const release = JSON.parse(data);
          if (release.tag_name) {
            resolve(release.tag_name);
          } else {
            reject(new Error('No tag_name in release'));
          }
        } catch (err) {
          reject(err);
        }
      });
    });

    request.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Download file from URL with redirect support
 */
function downloadFile(url, dest, language) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      // Handle redirects
      if (response.statusCode && [301, 302, 307, 308].includes(response.statusCode)) {
        if (response.headers.location) {
          // Resolve relative URLs
          const newUrl = new URL(response.headers.location, url).toString();
          downloadFile(newUrl, dest, language).then(resolve).catch(reject);
          return;
        }
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download ${language} (Status: ${response.statusCode}) from ${url}`));
        return;
      }

      const file = fs.createWriteStream(dest);
      response.pipe(file);

      file.on('finish', () => {
        file.close();
        console.log(`✅ Downloaded ${language}.wasm`);
        resolve();
      });

      file.on('error', (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });
    });

    request.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Download tree-sitter WASM parser for a specific language
 */
async function downloadLanguageParser(language) {
  const wasmFilePath = path.resolve(wasmDir, `${language}.wasm`);
  const parserConfig = PARSER_VERSIONS[language];

  if (!parserConfig) {
    console.error(`❌ Unknown language: ${language}`);
    return;
  }

  try {
    let url;
    let version = parserConfig.version;
    let source = parserConfig.source || 'github';

    if (source === 'unpkg') {
      // Use unpkg CDN for C# and Dart from tree-sitter-wasms package
      // These WASM files are built for web-tree-sitter compatibility
      const unpkgName = parserConfig.unpkgName || language;
      // Use 'latest' tag or specific version
      const pkgVersion = version === 'latest' ? 'latest' : version;
      url = `https://unpkg.com/tree-sitter-wasms@${pkgVersion}/out/${unpkgName}.wasm`;
      console.log(`⬇️  Downloading ${language} parser from tree-sitter-wasms (unpkg)...`);
    } else {
      // Use GitHub releases for other languages
      const repoName = parserConfig.repo;

      // Try to fetch the latest version from GitHub API
      try {
        console.log(`   Checking for latest version...`);
        version = await getLatestVersion(repoName);
        console.log(`   Latest version: ${version}`);
      } catch (err) {
        console.log(`   Using fallback version: ${version}`);
      }

      // Build GitHub release URL
      const wasmFileName = `tree-sitter-${language}.wasm`;
      url = `https://github.com/tree-sitter/${repoName}/releases/download/${version}/${wasmFileName}`;
      console.log(`⬇️  Downloading ${language} parser from GitHub releases...`);
    }

    await downloadFile(url, wasmFilePath, language);
    console.log(`✅ Successfully configured ${language}`);
  } catch (error) {
    console.error(`❌ Failed to download ${language} parser:`, error.message);

    // Special handling for C# and Dart
    if (language === 'csharp' || language === 'dart') {
      console.log(`\n💡 ${language} Parser Note:`);
      console.log(`   These parsers are downloaded from tree-sitter-wasms package`);
      console.log(`   which provides web-tree-sitter compatible WASM files.`);
      console.log(`   Check: https://unpkg.com/tree-sitter-wasms@latest/out/\n`);
    }
  }
}

/**
 * Main setup function
 */
async function setupTreeSitter() {
  console.log('🌳 Setting up Tree-sitter WASM parsers from GitHub releases...\n');

  // Create WASM directory
  if (!fs.existsSync(wasmDir)) {
    fs.mkdirSync(wasmDir, { recursive: true });
    console.log(`✓ Created directory: ${wasmDir}`);
  }

  // Download parsers for each supported language
  console.log('📥 Downloading language parsers from GitHub releases...\n');
  for (const language of Object.keys(LANGUAGES)) {
    try {
      await downloadLanguageParser(language);
    } catch (error) {
      console.error(`❌ Failed to download ${language} parser:`, error.message);
    }
  }

  // Create a manifest file listing available parsers
  const manifest = {
    version: '1.0.0',
    languages: Object.keys(LANGUAGES),
    wasmDir: 'tree-sitter-wasm',
    description: 'Tree-sitter WASM parsers for code analysis',
    source: 'github.com/tree-sitter',
    sourceType: 'GitHub Releases + unpkg',
    parsers: Object.keys(LANGUAGES).map((lang) => {
      const parserConfig = PARSER_VERSIONS[lang];
      return {
        language: lang,
        wasmFile: `${lang}.wasm`,
        repository: LANGUAGES[lang],
        version: parserConfig?.version || 'unknown',
        downloadSource: parserConfig?.source || 'github',
        source: `https://github.com/tree-sitter/${parserConfig?.repo || LANGUAGES[lang]}`
      };
    })
  };

  fs.writeFileSync(
    path.resolve(wasmDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  );
  console.log('\n✓ Created manifest.json');

  // Create a README for future reference
  const readme = `# Tree-sitter WASM Parsers

This directory contains WASM binaries for tree-sitter language parsers.

## Supported Languages
${Object.keys(LANGUAGES).map(lang => `- ${lang}`).join('\n')}

## Usage

These parsers are used for semantic code chunking and analysis in the repomix-runner extension.

## Updating Parsers

Run the setup script to download the latest parsers:
\`\`\`bash
npm run setup:treesitter
\`\`\`

## Download Sources

Parsers are downloaded from:
- **Primary Source**: GitHub Releases (https://github.com/tree-sitter/) - for JS, TS, Python, Rust
- **Secondary Source**: tree-sitter-wasms package (https://unpkg.com/tree-sitter-wasms/) - for C#, Dart

### C# and Dart Parser Notes

These parsers are sourced from the tree-sitter-wasms package which provides
web-tree-sitter compatible WASM files built with the correct ABI version.

## Notes

- WASM files are kept in assets/ to persist across builds
- Parsers are language-specific and optimized for each language
- web-tree-sitter version must be compatible with WASM file ABI version
- The manifest.json file contains metadata about all available parsers
- See: https://github.com/tree-sitter/tree-sitter/issues/5171 for ABI compatibility info
`;

  fs.writeFileSync(path.resolve(wasmDir, 'README.md'), readme);
  console.log('✓ Created README.md');

  console.log('\n✅ Tree-sitter setup complete!');
  console.log(`📁 WASM files location: ${wasmDir}`);
  console.log('\nNote: These files will be copied to dist/ during build by esbuild.');
  console.log('🚀 WASM files are now ready for use in semantic code analysis!');
}

// Run setup
setupTreeSitter().catch((err) => {
  console.error('❌ Setup failed:', err.message);
  process.exit(1);
});

