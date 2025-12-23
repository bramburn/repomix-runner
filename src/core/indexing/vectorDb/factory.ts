import type { ExtensionContext } from 'vscode';
import type { VectorDbProvider, VectorDbAdapter } from './types.js';
import { PineconeAdapter } from './providers/pineconeAdapter.js';
import { QdrantAdapter } from './providers/qdrantAdapter.js';

const STATE_VECTORDB_PROVIDER = 'repomix.vectorDb.provider';
const STATE_SELECTED_PINECONE_INDEX = 'repomix.pinecone.selectedIndexByRepo';

const STATE_QDRANT_URL = 'repomix.qdrant.url';
// [FIX] Use the global collection key to match ConfigController
const STATE_QDRANT_COLLECTION = 'repomix.qdrant.collection';

const SECRET_PINECONE = 'repomix.agent.pineconeApiKey';
// [FIX] Use the correct secret key to match ConfigController
const SECRET_QDRANT = 'repomix.agent.qdrantApiKey'; 

export async function getVectorDbAdapterForRepo(
  extensionContext: ExtensionContext,
  repoId: string
): Promise<{ provider: VectorDbProvider; adapter: VectorDbAdapter }> {
  const provider =
    (extensionContext.globalState.get(STATE_VECTORDB_PROVIDER) as VectorDbProvider) ?? 'pinecone';

  if (provider === 'pinecone') {
    const apiKey = await extensionContext.secrets.get(SECRET_PINECONE);
    const repoConfigs: Record<string, any> =
      (extensionContext.globalState.get(STATE_SELECTED_PINECONE_INDEX) as any) || {};
    const selected = repoConfigs[repoId];
    const indexName: string | undefined = typeof selected === 'string' ? selected : selected?.name;
    const host: string | undefined = typeof selected === 'string' ? undefined : selected?.host;

    if (!apiKey) throw new Error('Missing Pinecone API key');
    if (!indexName) throw new Error('No Pinecone index selected for this repo');

    return { provider, adapter: new PineconeAdapter({ apiKey, indexName, host }) };
  }

  if (provider === 'qdrant') {
    const baseUrl = extensionContext.globalState.get(STATE_QDRANT_URL) as string | undefined;
    
    // [FIX] Read single global collection string instead of per-repo map
    const collection = extensionContext.globalState.get(STATE_QDRANT_COLLECTION) as string | undefined;
    
    const apiKey = await extensionContext.secrets.get(SECRET_QDRANT); 

    if (!baseUrl) throw new Error('Missing Qdrant URL');
    if (!collection) throw new Error('No Qdrant collection configured');

    return { provider, adapter: new QdrantAdapter({ baseUrl, apiKey, collection }) };
  }

  throw new Error(`Unsupported provider: ${provider}`);
}