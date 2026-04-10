import * as vscode from 'vscode';
import type { ExtensionContext } from 'vscode';
import type { VectorDbProvider, VectorDbAdapter } from './types.js';
import { QdrantAdapter } from './providers/qdrantAdapter.js';
import { safeCollectionName } from '../../../utils/repoIdentity.js';

const STATE_VECTORDB_PROVIDER = 'repomix.vectorDb.provider';

const STATE_QDRANT_URL = 'repomix.qdrant.url';
const STATE_QDRANT_COLLECTION = 'repomix.qdrant.collection';

const SECRET_QDRANT = 'repomix.agent.qdrantApiKey';

/**
 * Get the current embedding configuration from VS Code settings.
 * Returns provider, model name, and dimension.
 */
export function getEmbeddingConfig(): { provider: string; model: string; dimension: number } {
  const config = vscode.workspace.getConfiguration();
  const provider = config.get<string>('repomix.embedding.provider') || 'gemini';

  let model = '';
  let dimension = 768; // Default for Gemini

  switch (provider) {
    case 'ollama':
      model = config.get<string>('repomix.ollama.model') || 'nomic-embed-text';
      dimension = config.get<number>('repomix.ollama.dimension') || 768;
      break;
    case 'lmstudio':
      model = config.get<string>('repomix.lmstudio.model') || '';
      dimension = config.get<number>('repomix.lmstudio.dimension') || 768;
      break;
    case 'openrouter':
      model = config.get<string>('repomix.openrouter.model') || 'openai/text-embedding-3-small';
      dimension = config.get<number>('repomix.openrouter.dimension') || 1536;
      break;
    case 'gemini':
    default:
      model = 'gemini-embedding';
      dimension = 768;
      break;
  }

  return { provider, model, dimension };
}

export async function getVectorDbAdapterForRepo(
  extensionContext: ExtensionContext,
  repoId: string
): Promise<{ provider: VectorDbProvider; adapter: VectorDbAdapter }> {
  const provider: VectorDbProvider = 'qdrant';

  const baseUrl = extensionContext.globalState.get(STATE_QDRANT_URL) as string | undefined;

  const apiKey = await extensionContext.secrets.get(SECRET_QDRANT);

  if (!baseUrl) throw new Error('Missing Qdrant URL');

  // Validate API key for hosted instances
  const isHostedInstance = !baseUrl.includes('localhost') && !baseUrl.includes('127.0.0.1');
  if (isHostedInstance && !apiKey) {
    throw new Error(
      'Qdrant API key is required for hosted instances. ' +
      'Please save your API key in the Settings tab before indexing or searching.'
    );
  }

  // Auto-collection mode: Generate collection name based on repo identity + embedding config
  const { dimension } = getEmbeddingConfig();
  const safeRepoId = safeCollectionName(repoId);
  const autoCollectionName = `${safeRepoId}-${dimension}`;

  console.log(`[VectorDB Factory] Using auto-generated collection name: "${autoCollectionName}" (repo: ${repoId}, dim: ${dimension})`);

  // Return adapter - it will auto-create the collection on first upsert
  return { provider, adapter: new QdrantAdapter(baseUrl, apiKey, autoCollectionName, dimension) };
}