import * as vscode from 'vscode';
import { DatabaseService } from '../storage/databaseService.js';
import { BundleManager } from '../bundles/bundleManager.js';
import { IndexingService } from './IndexingService.js';

/**
 * ExtensionServices - Singleton container for all extension-level services.
 * 
 * These services are created once in activate() and survive webview recreations.
 * Controllers receive a reference to this container and subscribe to events as needed.
 * 
 * This pattern ensures:
 * 1. Long-running work (indexing, background monitoring) is not tied to webview lifecycle
 * 2. State is preserved when users switch between views
 * 3. Services can communicate without depending on webview
 */
export class ExtensionServices {
  private static _instance: ExtensionServices | null = null;

  public readonly databaseService: DatabaseService;
  public readonly bundleManager: BundleManager;
  public readonly indexingService: IndexingService;
  
  private constructor(
    databaseService: DatabaseService,
    bundleManager: BundleManager,
    extensionContext: vscode.ExtensionContext
  ) {
    this.databaseService = databaseService;
    this.bundleManager = bundleManager;
    this.indexingService = new IndexingService(databaseService, extensionContext);
  }

  /**
   * Initialize the ExtensionServices singleton.
   * Must be called once in activate().
   */
  static initialize(
    databaseService: DatabaseService,
    bundleManager: BundleManager,
    extensionContext: vscode.ExtensionContext
  ): ExtensionServices {
    if (ExtensionServices._instance) {
      console.warn('[ExtensionServices] Already initialized, returning existing instance');
      return ExtensionServices._instance;
    }

    ExtensionServices._instance = new ExtensionServices(
      databaseService,
      bundleManager,
      extensionContext
    );

    console.log('[ExtensionServices] Initialized');
    return ExtensionServices._instance;
  }

  /**
   * Get the ExtensionServices singleton instance.
   * Throws if not initialized.
   */
  static get instance(): ExtensionServices {
    if (!ExtensionServices._instance) {
      throw new Error('[ExtensionServices] Not initialized. Call initialize() first.');
    }
    return ExtensionServices._instance;
  }

  /**
   * Check if the ExtensionServices singleton has been initialized.
   */
  static get isInitialized(): boolean {
    return ExtensionServices._instance !== null;
  }

  /**
   * Dispose all services.
   * Called in deactivate().
   */
  dispose(): void {
    this.indexingService.removeAllListeners();
    ExtensionServices._instance = null;
    console.log('[ExtensionServices] Disposed');
  }
}
