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
const wasmDir = path.resolve(projectRoot, 'dist', 'tree-sitter-wasm');

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

// Parser versions and GitHub release URLs
// These are fallback versions - the script will try to fetch the latest version from GitHub API
const PARSER_VERSIONS = {
  javascript: { version: 'v0.25.0', repo: 'tree-sitter-javascript', source: 'github' },
  typescript: { version: 'v0.25.0', repo: 'tree-sitter-typescript', source: 'github' },
  python: { version: 'v0.25.0', repo: 'tree-sitter-python', source: 'github' },
  rust: { version: 'v0.25.0', repo: 'tree-sitter-rust', source: 'github' },
  csharp: { version: '0.1.13', repo: 'tree-sitter-c-sharp', source: 'unpkg', unpkgName: 'tree-sitter-c_sharp' },
  dart: { version: '0.1.13', repo: 'tree-sitter-dart', source: 'unpkg', unpkgName: 'tree-sitter-dart' },
};

/**
 * Fetch latest release version from GitHub API
 */
async function getLatestVersion(repo) {
  return new Promise((resolve, reject) => {
    const url = `https://api.github.com/repos/tree-sitter/${repo}/releases/latest`;
    const request = https.get(url, { headers: { 'User-Agent': 'repomix-runner' } }, (response) => {
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
      if ([301, 302, 307, 308].includes(response.statusCode)) {
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
      // Use unpkg CDN for C# and other languages that don't have GitHub WASM releases
      const unpkgName = parserConfig.unpkgName || `tree-sitter-${language}`;
      url = `https://unpkg.com/tree-sitter-wasms@${version}/out/${unpkgName}.wasm`;
      console.log(`⬇️  Downloading ${language} parser from unpkg...`);
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

    // Special handling for C# - provide helpful guidance
    if (language === 'csharp') {
      console.log(`\n💡 C# Parser Workaround Options:`);
      console.log(`   1. Install from NPM: npm install tree-sitter-c-sharp`);
      console.log(`   2. Use token-based chunking without tree-sitter`);
      console.log(`   3. Check unpkg: https://unpkg.com/tree-sitter-wasms@0.1.13/out/\n`);
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
    parsers: Object.keys(LANGUAGES).map(lang => ({
      language: lang,
      wasmFile: `${lang}.wasm`,
      repository: LANGUAGES[lang],
      version: PARSER_VERSIONS[lang]?.version || 'unknown',
      downloadSource: PARSER_VERSIONS[lang]?.source || 'github',
      source: `https://github.com/tree-sitter/${PARSER_VERSIONS[lang]?.repo || LANGUAGES[lang]}`
    }))
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

Parsers are downloaded from official tree-sitter GitHub releases:
- **Primary Source**: GitHub Releases (https://github.com/tree-sitter/)
- **Fallback**: NPM packages (https://www.npmjs.com/search?q=tree-sitter-)

### C# Parser Special Notes

The C# parser (tree-sitter-c-sharp) is available from GitHub releases but may require manual setup:
- GitHub: https://github.com/tree-sitter/tree-sitter-c-sharp/releases
- NPM: https://www.npmjs.com/package/tree-sitter-c-sharp
- If download fails, use token-based code chunking as fallback

## Notes

- WASM files are kept in distribution but not committed to git
- Parsers are downloaded from official tree-sitter GitHub releases (primary) or unpkg (fallback)
- Each parser is language-specific and optimized for that language
- C# and Dart parsers are sourced from unpkg since they don't have GitHub WASM releases
- The manifest.json file contains metadata about all available parsers
`;

  fs.writeFileSync(path.resolve(wasmDir, 'README.md'), readme);
  console.log('✓ Created README.md');

  console.log('\n✅ Tree-sitter setup complete!');
  console.log(`📁 WASM files location: ${wasmDir}`);
  console.log('\nNote: WASM files are not included in git. They will be rebuilt during build.');
  console.log('🚀 WASM files are now ready for use in semantic code analysis!');
}

// Run setup
setupTreeSitter().catch((err) => {
  console.error('❌ Setup failed:', err.message);
  process.exit(1);
});

