import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { resolveBundleOutputPath } from '../../../core/files/outputPathResolver.js';
import { Bundle } from '../../../core/bundles/types.js';

suite('outputPathResolver', () => {
    let sandbox: sinon.SinonSandbox;
    // Helper to mock vscode configuration
    const mockVscodeConfig = (config: any) => {
        const getConfigurationStub = sandbox.stub(vscode.workspace, 'getConfiguration');
        getConfigurationStub.returns({
            get: (key: string) => config[key],
            has: (key: string) => key in config,
            inspect: () => undefined,
            update: () => Promise.resolve(),
        } as any);
        // Stub the specific call for 'repomix' section
        getConfigurationStub.withArgs('repomix').returns({
            ...config,
            get: (key: string) => (config[key] !== undefined ? config[key] : undefined),
        } as any);
    };

    const mockBundle: Bundle = {
        name: 'test-bundle',
        created: '',
        lastUsed: '',
        tags: [],
        files: []
    };

    setup(() => {
        sandbox = sinon.createSandbox();
        // Stub cwd to be consistent
        sandbox.stub(process, 'cwd').returns('/test-workspace');
    });

    teardown(() => {
        sandbox.restore();
    });

    test('should use global runner config path when bundle config path is missing', async () => {
        // Arrange
        const globalConfigPath = 'global-repomix.config.json';
        const globalConfigContent = JSON.stringify({
            output: {
                style: 'markdown',
                filePath: 'global-output.md'
            }
        });

        // Mock VSCode config with runner.configPath
        mockVscodeConfig({
            runner: {
                configPath: globalConfigPath,
                copyMode: 'file',
                keepOutputFile: true,
                useTargetAsOutput: true,
                useBundleNameAsOutputName: true,
                verbose: false
            },
            output: {
                filePath: 'repomix-output.txt',
                style: 'plain'
            },
            ignore: {
                useGitignore: true,
                useDefaultPatterns: true,
                customPatterns: []
            },
            security: {
                enableSecurityCheck: true
            }
        });

        // Mock file system
        const fsAccessStub = sandbox.stub(fs.promises, 'access').resolves();
        const fsReadFileStub = sandbox.stub(fs.promises, 'readFile').resolves(globalConfigContent);

        // Act
        // Pass a bundle without configPath
        const result = await resolveBundleOutputPath(mockBundle);

        // Assert
        // Should resolve to markdown file because global config says so
        // Expected name format: global-output.test-bundle.md
        // Note: The exact path depends on generateOutputFilename logic, but the extension MUST be .md
        assert.ok(result.endsWith('.md'), `Expected .md extension, got: ${result}`);

        // Verify code tried to read the global config file
        assert.ok(fsReadFileStub.calledWith(sinon.match(/global-repomix.config.json/)), 'Should read the global config file');
    });

    test('should prefer bundle config path over global runner config', async () => {
        // Arrange
        const bundleConfigPath = 'bundle-repomix.config.json';
        const bundleConfigContent = JSON.stringify({
            output: {
                style: 'xml'
            }
        });

        const globalConfigPath = 'global-repomix.config.json';

        // Mock VSCode with global config (which says markdown) - this should be ignored
        mockVscodeConfig({
            runner: {
                configPath: globalConfigPath
            },
            output: {
                style: 'markdown'
            },
            ignore: {},
            security: {}
        });

        const bundleWithConfig: Bundle = {
            ...mockBundle,
            configPath: bundleConfigPath
        };

        // Mock FS
        const fsAccessStub = sandbox.stub(fs.promises, 'access').resolves();
        // If called with bundle config, return XML config. If called with global, fail or return something else.
        const fsReadFileStub = sandbox.stub(fs.promises, 'readFile');
        fsReadFileStub.withArgs(sinon.match(bundleConfigPath)).resolves(bundleConfigContent);

        // Act
        const result = await resolveBundleOutputPath(bundleWithConfig);

        // Assert
        assert.ok(result.endsWith('.xml'), `Expected .xml extension, got: ${result}`);
        assert.ok(fsReadFileStub.calledWith(sinon.match(bundleConfigPath)), 'Should read the bundle config file');
    });

    test('should fallback to VSCode settings if no config file at all', async () => {
        // Arrange
        mockVscodeConfig({
            runner: {
                configPath: ''
            },
            output: {
                style: 'json',
                filePath: 'vscode-output.json'
            },
            ignore: {},
            security: {}
        });

        // Mock that repomix.config.json doesn't exist
        sandbox.stub(fs.promises, 'access').rejects(new Error('ENOENT'));

        // Act
        const result = await resolveBundleOutputPath(mockBundle);

        // Assert
        assert.ok(result.endsWith('.json'), `Expected .json extension, got: ${result}`);
    });

    test('should automatically read default repomix.config.json when no explicit config path is set', async () => {
        // Arrange
        const defaultConfigContent = JSON.stringify({
            output: {
                style: 'markdown',
                filePath: 'repomix-output.md'
            }
        });

        mockVscodeConfig({
            runner: {
                configPath: '',  // No explicit config path
                copyMode: 'file',
                keepOutputFile: true,
                useTargetAsOutput: true,
                useBundleNameAsOutputName: true,
                verbose: false
            },
            output: {
                filePath: 'repomix-output.txt',
                style: 'plain'  // VSCode default is plain, but config says markdown
            },
            ignore: {
                useGitignore: true,
                useDefaultPatterns: true,
                customPatterns: []
            },
            security: {
                enableSecurityCheck: true
            }
        });

        // Mock FS - the default repomix.config.json exists
        sandbox.stub(fs.promises, 'access').resolves();
        sandbox.stub(fs.promises, 'readFile').resolves(defaultConfigContent);

        // Act
        const result = await resolveBundleOutputPath(mockBundle);

        // Assert - should use markdown from the config file, not plain from VSCode
        assert.ok(result.endsWith('.md'), `Expected .md extension, got: ${result}`);
    });
});
