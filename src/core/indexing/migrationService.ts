import * as vscode from 'vscode';
import { DatabaseService } from '../storage/databaseService.js';
import { VectorDbProvider } from './vectorDb/types.js';
import { getRepoId } from '../../utils/repoIdentity.js';
import { getCwd } from '../../config/getCwd.js';

export class MigrationService {
  constructor(
    private readonly secretStorage: vscode.SecretStorage,
    private readonly globalState: vscode.Memento,
    private readonly databaseService: DatabaseService
  ) {}

  /**
   * atomicaly switches the vector database provider and resets local index state.
   */
  async switchProvider(newProvider: VectorDbProvider): Promise<boolean> {
    const currentProvider = this.globalState.get<VectorDbProvider>('repomix.vectorDb.provider') || 'pinecone';

    if (currentProvider === newProvider) {
      return false; // No change needed
    }

    // 1. Validate Prerequisites
    const hasCreds = await this.validateCredentials(newProvider);
    if (!hasCreds) {
      throw new Error(`Cannot switch to ${newProvider}: Missing API Key or Configuration.`);
    }

    // 2. Perform the Switch
    await this.globalState.update('repomix.vectorDb.provider', newProvider);

    // 3. Reset Local Index State
    // We must clear the local knowledge of "what is indexed" because the new DB is empty.
    const cwd = getCwd();
    const repoId = await getRepoId(cwd);
    
    // WARNING: This clears the tracking of which files are indexed. 
    // It does NOT delete the actual vectors from the *old* provider (Pinecone), 
    // which is good because we want to be able to switch back later if needed.
    await this.databaseService.clearRepoFiles(repoId);

    console.log(`[MigrationService] Switched from ${currentProvider} to ${newProvider}. Local index state reset for ${repoId}.`);
    
    return true;
  }

  private async validateCredentials(provider: VectorDbProvider): Promise<boolean> {
    if (provider === 'pinecone') {
      const key = await this.secretStorage.get('repomix.agent.pineconeApiKey');
      return !!key;
    }
    if (provider === 'qdrant') {
      const key = await this.secretStorage.get('repomix.agent.qdrantApiKey');
      const url = this.globalState.get<string>('repomix.qdrant.url');
      const collection = this.globalState.get<string>('repomix.qdrant.collection');
      
      // Qdrant allows keyless (local), but needs URL and Collection
      return !!url && !!collection; 
    }
    return false;
  }
}