import * as assert from 'assert';
import { isBinaryFile } from '../../../core/indexing/fileEmbeddingPipeline.js';

suite('fileEmbeddingPipeline', () => {

  suite('isBinaryFile - Project Configuration Files', () => {
    test('should recognize Python project files as text', () => {
      assert.strictEqual(isBinaryFile('pyproject.toml'), false, 'pyproject.toml should be text');
      assert.strictEqual(isBinaryFile('poetry.lock'), false, 'poetry.lock should be text');
      assert.strictEqual(isBinaryFile('uv.lock'), false, 'uv.lock should be text');
      assert.strictEqual(isBinaryFile('requirements.txt'), false, 'requirements.txt should be text');
      assert.strictEqual(isBinaryFile('Pipfile'), false, 'Pipfile should be text');
      assert.strictEqual(isBinaryFile('Pipfile.lock'), false, 'Pipfile.lock should be text');
    });

    test('should recognize JavaScript/TypeScript project files as text', () => {
      assert.strictEqual(isBinaryFile('package.json'), false, 'package.json should be text');
      assert.strictEqual(isBinaryFile('package-lock.json'), false, 'package-lock.json should be text');
      assert.strictEqual(isBinaryFile('yarn.lock'), false, 'yarn.lock should be text');
      assert.strictEqual(isBinaryFile('pnpm-lock.yaml'), false, 'pnpm-lock.yaml should be text');
      assert.strictEqual(isBinaryFile('bun.lockb'), false, 'bun.lockb should be text');
    });

    test('should recognize Deno project files as text', () => {
      assert.strictEqual(isBinaryFile('deno.json'), false, 'deno.json should be text');
      assert.strictEqual(isBinaryFile('deno.jsonc'), false, 'deno.jsonc should be text');
      assert.strictEqual(isBinaryFile('deno.lock'), false, 'deno.lock should be text');
    });

    test('should recognize Rust project files as text', () => {
      assert.strictEqual(isBinaryFile('Cargo.toml'), false, 'Cargo.toml should be text');
      assert.strictEqual(isBinaryFile('Cargo.lock'), false, 'Cargo.lock should be text');
    });

    test('should recognize C# project files as text', () => {
      assert.strictEqual(isBinaryFile('MyProject.csproj'), false, 'csproj files should be text');
      assert.strictEqual(isBinaryFile('Solution.sln'), false, 'sln files should be text');
      assert.strictEqual(isBinaryFile('packages.config'), false, 'packages.config should be text');
      assert.strictEqual(isBinaryFile('global.json'), false, 'global.json should be text');
      assert.strictEqual(isBinaryFile('Directory.Build.props'), false, 'Directory.Build.props should be text');
      assert.strictEqual(isBinaryFile('Directory.Build.targets'), false, 'Directory.Build.targets should be text');
      assert.strictEqual(isBinaryFile('appsettings.json'), false, 'appsettings.json should be text');
      assert.strictEqual(isBinaryFile('appsettings.Development.json'), false, 'appsettings.*.json should be text');
      assert.strictEqual(isBinaryFile('appsettings.Production.json'), false, 'appsettings.*.json should be text');
    });

    test('should recognize Dart project files as text', () => {
      assert.strictEqual(isBinaryFile('pubspec.yaml'), false, 'pubspec.yaml should be text');
      assert.strictEqual(isBinaryFile('pubspec.lock'), false, 'pubspec.lock should be text');
    });

    test('should still recognize existing project files as text', () => {
      assert.strictEqual(isBinaryFile('Makefile'), false, 'Makefile should be text');
      assert.strictEqual(isBinaryFile('Dockerfile'), false, 'Dockerfile should be text');
      assert.strictEqual(isBinaryFile('.gitignore'), false, '.gitignore should be text');
      assert.strictEqual(isBinaryFile('.env'), false, '.env should be text');
    });

    test('should still recognize binary files as binary', () => {
      assert.strictEqual(isBinaryFile('image.jpg'), true, 'jpg should be binary');
      assert.strictEqual(isBinaryFile('document.pdf'), true, 'pdf should be binary');
      assert.strictEqual(isBinaryFile('program.exe'), true, 'exe should be binary');
      assert.strictEqual(isBinaryFile('library.dll'), true, 'dll should be binary');
    });

    test('should handle edge cases correctly', () => {
      assert.strictEqual(isBinaryFile('README'), false, 'README without extension should be text');
      assert.strictEqual(isBinaryFile('LICENSE'), false, 'LICENSE without extension should be text');
      assert.strictEqual(isBinaryFile('randomfile.xyz'), true, 'Unknown extension should be binary');
      assert.strictEqual(isBinaryFile(''), true, 'Empty filename should be binary');
    });
  });
});