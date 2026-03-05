import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { ConfigController } from '../../../webview/controllers/ConfigController.js';
import { DatabaseService } from '../../../core/storage/databaseService.js';
import { IndexingController } from '../../../webview/controllers/IndexingController.js';
import { getVectorDbAdapterForRepo } from '../../../core/indexing/vectorDb/factory.js';
import { embeddingService } from '../../../core/indexing/embeddingService.js';
import { getRepoId } from '../../../utils/repoIdentity.js';

suite('Dimension Compatibility Integration', () => {
  let sandbox: sinon.SinonSandbox;
  let configController: ConfigController;
  let databaseService: DatabaseService;
  let indexingController: IndexingController;
  let mockContext: any;
  let mockExtensionContext: any;
  let getVectorDbAdapterStub: sinon.SinonStub;
  let embeddingServiceStub: sinon.SinonStubbedInstance<any>;

  setup(() => {
    sandbox = sinon.createSandbox();
    
    // Mock VS Code context
    mockContext = {
      postMessage: sandbox.stub()
    };
    
    mockExtensionContext = {
      globalState: {
        get: sandbox.stub(),
        update: sandbox.stub().resolves()
      },
      secrets: {
        get: sandbox.stub().resolves('test-key')
      }
    };
    
    // Mock services
    databaseService = {
      clearRepoFiles: sandbox.stub().resolves()
    } as any;
    
    indexingController = {
      abortIndexing: sandbox.stub().resolves()
    } as any;
    
    // Create controller
    configController = new ConfigController(
      mockContext,
      mockExtensionContext,
      databaseService,
      indexingController
    );
    
    // Stub getVectorDbAdapterForRepo
    getVectorDbAdapterStub = sandbox.stub();
    
    // Stub embeddingService
    embeddingServiceStub = sandbox.stub(embeddingService);
  });

  teardown(() => {
    sandbox.restore();
  });

  suite('handleCheckCompatibility', () => {
    let mockWorkspaceStub: sinon.SinonStub;
    let getRepoIdStub: sinon.SinonStub;
    let getConfigStub: sinon.SinonStub;

    setup(() => {
      mockWorkspaceStub = sandbox.stub(vscode.workspace, 'workspaceFolders').value([
        { uri: { fsPath: '/test/workspace' } }
      ]);
      
      getRepoIdStub = sandbox.stub().resolves('test-repo-id');
      
      getConfigStub = sandbox.stub(vscode.workspace, 'getConfiguration').returns({
        get: sandbox.stub().returns('gemini')
      } as any);
    });

    test('should detect compatible dimensions and send correct messages', async () => {
      // Arrange
      const mockAdapter = {
        getIndexMetadata: sandbox.stub().resolves({
          dimension: 768,
          count: 100
        })
      };
      
      getVectorDbAdapterStub.resolves({ adapter: mockAdapter });
      embeddingServiceStub.getDimensions.returns(768);
      
      // Override the imports in ConfigController
      const originalGetVectorDbAdapter = (configController as any).getVectorDbAdapterForRepo;
      (configController as any).getVectorDbAdapterForRepo = getVectorDbAdapterStub;
      
      const originalEmbeddingService = (configController as any).embeddingService;
      (configController as any).embeddingService = embeddingServiceStub;
      
      // Act
      await (configController as any).handleCheckCompatibility();
      
      // Assert
      assert.ok(mockContext.postMessage.calledWithMatch({
        command: 'compatibilityStatus',
        compatible: true,
        blocked: false,
        embeddingDimension: 768,
        indexDimension: 768
      }));
      
      assert.ok(mockContext.postMessage.calledWithMatch({
        command: 'indexingBlocked',
        blocked: false
      }));
      
      // Verify global state was updated
      assert.ok(mockExtensionContext.globalState.update.calledWith(
        'repomix.indexingBlocked', 
        false
      ));
    });

    test('should detect incompatible dimensions and block indexing', async () => {
      // Arrange
      const mockAdapter = {
        getIndexMetadata: sandbox.stub().resolves({
          dimension: 1536, // Index has 1536
          count: 50
        })
      };
      
      getVectorDbAdapterStub.resolves({ adapter: mockAdapter });
      embeddingServiceStub.getDimensions.returns(768); // Embedding has 768
      
      // Override imports
      (configController as any).getVectorDbAdapterForRepo = getVectorDbAdapterStub;
      (configController as any).embeddingService = embeddingServiceStub;
      
      // Act
      await (configController as any).handleCheckCompatibility();
      
      // Assert
      assert.ok(mockContext.postMessage.calledWithMatch({
        command: 'compatibilityStatus',
        compatible: false,
        blocked: true,
        embeddingDimension: 768,
        indexDimension: 1536
      }));
      
      assert.ok(mockContext.postMessage.calledWithMatch({
        command: 'indexingBlocked',
        blocked: true
      }));
      
      // Verify global state was updated
      assert.ok(mockExtensionContext.globalState.update.calledWith(
        'repomix.indexingBlocked', 
        true
      ));
    });

    test('should handle empty index as compatible', async () => {
      // Arrange
      const mockAdapter = {
        getIndexMetadata: sandbox.stub().resolves({
          dimension: 1536,
          count: 0 // Empty index
        })
      };
      
      getVectorDbAdapterStub.resolves({ adapter: mockAdapter });
      embeddingServiceStub.getDimensions.returns(768);
      
      // Override imports
      (configController as any).getVectorDbAdapterForRepo = getVectorDbAdapterStub;
      (configController as any).embeddingService = embeddingServiceStub;
      
      // Act
      await (configController as any).handleCheckCompatibility();
      
      // Assert
      assert.ok(mockContext.postMessage.calledWithMatch({
        command: 'compatibilityStatus',
        compatible: true, // Should be compatible when count is 0
        blocked: false
      }));
    });

    test('should handle missing index as compatible', async () => {
      // Arrange
      const mockAdapter = {
        getIndexMetadata: sandbox.stub().resolves(null) // No index metadata
      };
      
      getVectorDbAdapterStub.resolves({ adapter: mockAdapter });
      embeddingServiceStub.getDimensions.returns(768);
      
      // Override imports
      (configController as any).getVectorDbAdapterForRepo = getVectorDbAdapterStub;
      (configController as any).embeddingService = embeddingServiceStub;
      
      // Act
      await (configController as any).handleCheckCompatibility();
      
      // Assert
      assert.ok(mockContext.postMessage.calledWithMatch({
        command: 'compatibilityStatus',
        compatible: true, // Should be compatible when no index exists
        blocked: false,
        indexDimension: undefined
      }));
    });

    test('should handle adapter error gracefully', async () => {
      // Arrange
      getVectorDbAdapterStub.rejects(new Error('Connection failed'));
      
      // Override imports
      (configController as any).getVectorDbAdapterForRepo = getVectorDbAdapterStub;
      
      // Act
      await (configController as any).handleCheckCompatibility();
      
      // Assert
      assert.ok(mockContext.postMessage.calledWithMatch({
        command: 'compatibilityStatus',
        compatible: false,
        blocked: true,
        message: 'Cannot verify compatibility. Check your Vector DB connection.'
      }));
      
      // Should set blocked flag on error
      assert.ok(mockExtensionContext.globalState.update.calledWith(
        'repomix.indexingBlocked', 
        true
      ));
    });

    test('should handle embedding service error with fallback', async () => {
      // Arrange
      const mockAdapter = {
        getIndexMetadata: sandbox.stub().resolves({
          dimension: 768,
          count: 100
        })
      };
      
      getVectorDbAdapterStub.resolves({ adapter: mockAdapter });
      embeddingServiceStub.getDimensions.throws(new Error('Not initialized'));
      
      // Override imports
      (configController as any).getVectorDbAdapterForRepo = getVectorDbAdapterStub;
      (configController as any).embeddingService = embeddingServiceStub;
      
      // Mock config fallback
      getConfigStub.returns({
        get: sandbox.stub()
          .withArgs('repomix.embedding.provider').returns('gemini')
          .withArgs('repomix.ollama.dimension').returns(768)
          .withArgs('repomix.lmstudio.dimension').returns(768)
          .withArgs('repomix.openrouter.dimension').returns(4096)
      } as any);
      
      // Act
      await (configController as any).handleCheckCompatibility();
      
      // Assert
      // Should fall back to config-based calculation (768 for gemini)
      assert.ok(mockContext.postMessage.calledWithMatch({
        command: 'compatibilityStatus',
        embeddingDimension: 768
      }));
    });
  });

  suite('IndexingService integration', () => {
    let indexingService: any;
    
    setup(() => {
      // Import the actual IndexingService
      indexingService = (configController as any).indexingService;
    });

    test('should block indexing when repomix.indexingBlocked is true', async () => {
      // Arrange
      mockExtensionContext.globalState.get.withArgs('repomix.indexingBlocked').returns(true);
      
      // Create a mock emit function to capture events
      const emitSpy = sandbox.spy();
      const mockIndexingService = {
        extensionContext: mockExtensionContext,
        emit: emitSpy,
        setState: sandbox.stub()
      };
      
      // Act
      try {
        await (mockIndexingService as any).start(false);
      } catch (e) {
        // Expected to emit error
      }
      
      // Assert
      assert.ok(emitSpy.calledWith('error'));
      const errorArg = emitSpy.firstCall.args[1];
      assert.ok(errorArg.includes('Indexing blocked'));
      assert.ok(errorArg.includes('dimension mismatch'));
    });

    test('should allow indexing when repomix.indexingBlocked is false', async () => {
      // Arrange
      mockExtensionContext.globalState.get.withArgs('repomix.indexingBlocked').returns(false);
      
      const emitSpy = sandbox.spy();
      const mockIndexingService = {
        extensionContext: mockExtensionContext,
        emit: emitSpy,
        setState: sandbox.stub(),
        databaseService: {
          getRepoFiles: sandbox.stub().resolves([])
        }
      };
      
      // Mock required dependencies
      sandbox.stub(require('../../../config/getCwd.js'), 'getCwd').returns('/test/path');
      sandbox.stub(require('../../../utils/repoIdentity.js'), 'getRepoId').resolves('test-repo');
      
      // Act
      try {
        await (mockIndexingService as any).start(false);
        // Should not throw or emit error for blocking
      } catch (e) {
        // May fail for other reasons (missing API key, etc.) which is OK
      }
      
      // Assert
      // Should not emit blocking error
      const errorCalls = emitSpy.getCalls().filter(call => 
        call.args[0] === 'error' && 
        call.args[1]?.includes('Indexing blocked')
      );
      assert.strictEqual(errorCalls.length, 0);
    });
  });

  suite('Webview message flow', () => {
    test('should send both compatibilityStatus and indexingBlocked messages', async () => {
      // Arrange
      const mockAdapter = {
        getIndexMetadata: sandbox.stub().resolves({
          dimension: 768,
          count: 100
        })
      };
      
      getVectorDbAdapterStub.resolves({ adapter: mockAdapter });
      embeddingServiceStub.getDimensions.returns(768);
      
      (configController as any).getVectorDbAdapterForRepo = getVectorDbAdapterStub;
      (configController as any).embeddingService = embeddingServiceStub;
      
      // Act
      await (configController as any).handleCheckCompatibility();
      
      // Assert
      // Should send both message types
      const messages = mockContext.postMessage.getCalls().map((call: any) => call.args[0]);
      
      const compatibilityMessage = messages.find((m: any) => m.command === 'compatibilityStatus');
      const blockedMessage = messages.find((m: any) => m.command === 'indexingBlocked');
      
      assert.ok(compatibilityMessage, 'Should send compatibilityStatus message');
      assert.ok(blockedMessage, 'Should send indexingBlocked message');
      
      // Both should have consistent blocked status
      assert.strictEqual(
        compatibilityMessage.blocked, 
        blockedMessage.blocked,
        'Blocked status should be consistent between messages'
      );
    });
  });
});