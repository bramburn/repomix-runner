import { z } from 'zod';

export const WebviewLoadedSchema = z.object({
  command: z.literal('webviewLoaded'),
});

export const RunBundleSchema = z.object({
  command: z.literal('runBundle'),
  bundleId: z.string().min(1),
  compress: z.boolean().optional(),
});

export const CancelBundleSchema = z.object({
  command: z.literal('cancelBundle'),
  bundleId: z.string().min(1),
});

export const CopyBundleOutputSchema = z.object({
  command: z.literal('copyBundleOutput'),
  bundleId: z.string().min(1),
});

export const RunDefaultRepomixSchema = z.object({
  command: z.literal('runDefaultRepomix'),
  compress: z.boolean().optional(),
});

export const CancelDefaultRepomixSchema = z.object({
  command: z.literal('cancelDefaultRepomix'),
});

export const CopyDefaultRepomixOutputSchema = z.object({
  command: z.literal('copyDefaultRepomixOutput'),
});

export const CheckApiKeySchema = z.object({
  command: z.literal('checkApiKey'),
});

export const SaveApiKeySchema = z.object({
  command: z.literal('saveApiKey'),
  apiKey: z.string().startsWith('AIza', "API Key must start with 'AIza'").min(30, "API Key is too short"),
});

export const SaveSecretBaseSchema = z.object({
  command: z.literal('saveSecret'),
  key: z.enum(['googleApiKey', 'pineconeApiKey', 'qdrantApiKey']),
  value: z.string().min(1),
});

export const SaveSecretSchema = SaveSecretBaseSchema.superRefine((data, ctx) => {
  if (data.key === 'googleApiKey') {
    if (!data.value.startsWith('AIza')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "API Key must start with 'AIza'",
        path: ['value'],
      });
    }
    if (data.value.length < 30) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "API Key is too short",
        path: ['value'],
      });
    }
  }
});

export const CheckSecretSchema = z.object({
  command: z.literal('checkSecret'),
  key: z.enum(['googleApiKey', 'pineconeApiKey', 'qdrantApiKey']),
});

export const GetAgentHistorySchema = z.object({
  command: z.literal('getAgentHistory'),
});

export const OpenFileSchema = z.object({
  command: z.literal('openFile'),
  path: z.string().min(1),
});

export const RunSmartAgentSchema = z.object({
  command: z.literal('runSmartAgent'),
  query: z.string().min(1).max(1000),
});

export const RerunAgentSchema = z.object({
  command: z.literal('rerunAgent'),
  runId: z.string().min(1),
  useSavedFiles: z.boolean()
});

export const CopyAgentOutputSchema = z.object({
  command: z.literal('copyAgentOutput'),
  runId: z.string().min(1),
});

export const CopyLastAgentOutputSchema = z.object({
  command: z.literal('copyLastAgentOutput'),
  outputPath: z.string().min(1),
});

export const RegenerateAgentRunSchema = z.object({
  command: z.literal('regenerateAgentRun'),
  runId: z.string().min(1),
});

export const GetDebugRunsSchema = z.object({
  command: z.literal('getDebugRuns'),
});

export const ReRunDebugSchema = z.object({
  command: z.literal('reRunDebug'),
  files: z.array(z.string()),
});

export const CopyDebugOutputSchema = z.object({
  command: z.literal('copyDebugOutput'),
});
export const FetchPineconeIndexesSchema = z.object({
  command: z.literal('fetchPineconeIndexes'),
  apiKey: z.string().optional(),
});

export const SavePineconeIndexSchema = z.object({
  command: z.literal('savePineconeIndex'),
  index: z.object({
    name: z.string(),
    host: z.string(),
    dimension: z.number().optional(),
    metric: z.string().optional(),
    spec: z.record(z.unknown()).optional(),
    status: z.record(z.unknown()).optional(),
  }),
});

export const GetPineconeIndexSchema = z.object({
  command: z.literal('getPineconeIndex'),
});

// --- Repository Indexing Schemas (Merged from main branch) ---

export const DeleteDebugRunSchema = z.object({
  command: z.literal('deleteDebugRun'),
  id: z.number(),
});

export const IndexRepoSchema = z.object({
  command: z.literal('indexRepo'),
});

export const IndexRepoProgressSchema = z.object({
  command: z.literal('indexRepoProgress'),
  current: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  filePath: z.string(),
});

// Pause/Resume/Stop Schemas
export const IndexRepoStateChangeSchema = z.object({
  command: z.literal('indexRepoStateChange'),
  state: z.enum(['idle', 'running', 'paused', 'stopping']),
  progress: z.object({
    current: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
    filePath: z.string(),
  }).optional(),
});

export const IndexRepoPausedSchema = z.object({
  command: z.literal('indexRepoPaused'),
  progress: z.object({
    completed: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
});

export const IndexRepoStoppedSchema = z.object({
  command: z.literal('indexRepoStopped'),
  progress: z.object({
    completed: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
});

export const PauseRepoIndexingSchema = z.object({
  command: z.literal('pauseRepoIndexing'),
});

export const ResumeRepoIndexingSchema = z.object({
  command: z.literal('resumeRepoIndexing'),
});

export const StopRepoIndexingSchema = z.object({
  command: z.literal('stopRepoIndexing'),
});

export const IndexRepoCompleteSchema = z.object({
  command: z.literal('indexRepoComplete'),
  repoId: z.string(),
  filesIndexed: z.number().int().nonnegative(),
  filesEmbedded: z.number().int().nonnegative(),
  chunksEmbedded: z.number().int().nonnegative(),
  vectorsUpserted: z.number().int().nonnegative(),
  failedFiles: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative(),
});

export const DeleteRepoIndexSchema = z.object({
  command: z.literal('deleteRepoIndex'),
});

export const GetRepoIndexCountSchema = z.object({
  command: z.literal('getRepoIndexCount'),
});

export const SearchRepoSchema = z.object({
  command: z.literal('searchRepo'),
  query: z.string().min(1),
  topK: z.number().int().min(1).max(200).optional(), // default in handler
});
export const GenerateRepomixFromSearchSchema = z.object({
  command: z.literal('generateRepomixFromSearch'),
  files: z.array(z.string().min(1)).min(1),
});

export const GetRepoVectorCountSchema = z.object({
  command: z.literal('getRepoVectorCount'),
});

export const CopySearchOutputSchema = z.object({
  command: z.literal('copySearchOutput'),
  outputPath: z.string(),
});

export const CopySearchResultsMarkdownSchema = z.object({
  command: z.literal('copySearchResultsMarkdown'),
  files: z.array(z.string().min(1)).min(1),
});

// --- UI Notification Schemas ---

export const AgentStateChangeSchema = z.object({
  command: z.literal('agentStateChange'),
  status: z.enum(['running', 'idle'])
});

export const AgentRunCompleteSchema = z.object({
  command: z.literal('agentRunComplete'),
  outputPath: z.string(),
  fileCount: z.number(),
  query: z.string()
});

export const AgentRunFailedSchema = z.object({
  command: z.literal('agentRunFailed')
});

// --- Clipboard Configuration Schemas ---

export const GetCopyModeSchema = z.object({
  command: z.literal('getCopyMode'),
});

export const SetCopyModeSchema = z.object({
  command: z.literal('setCopyMode'),
  mode: z.enum(['content', 'file']),
});

// --- Qdrant Configuration Schemas ---

export const GetVectorDbProviderSchema = z.object({
  command: z.literal('getVectorDbProvider'),
});

export const SetVectorDbProviderSchema = z.object({
  command: z.literal('setVectorDbProvider'),
  provider: z.enum(['pinecone', 'qdrant']),
});

export const GetQdrantConfigSchema = z.object({
  command: z.literal('getQdrantConfig'),
});

export const SetQdrantConfigSchema = z.object({
  command: z.literal('setQdrantConfig'),
  url: z.string().min(1),
  collection: z.string().min(1),
});

export const TestQdrantConnectionSchema = z.object({
  command: z.literal('testQdrantConnection'),
  url: z.string().min(1),
  collection: z.string().min(1),
  apiKey: z.string().optional(),
});

export const WebviewMessageSchema = z.discriminatedUnion('command', [
  WebviewLoadedSchema,
  RunBundleSchema,
  CancelBundleSchema,
  CopyBundleOutputSchema,
  RunDefaultRepomixSchema,
  CancelDefaultRepomixSchema,
  CopyDefaultRepomixOutputSchema,
  CheckApiKeySchema,
  SaveApiKeySchema,
  SaveSecretBaseSchema,
  CheckSecretSchema,
  RunSmartAgentSchema,
  RerunAgentSchema,
  CopyAgentOutputSchema,
  CopyLastAgentOutputSchema,
  GetAgentHistorySchema,
  OpenFileSchema,
  RegenerateAgentRunSchema,
  GetDebugRunsSchema,
  ReRunDebugSchema,
  CopyDebugOutputSchema,
  DeleteDebugRunSchema,
  // Feature branch additions
  FetchPineconeIndexesSchema,
  SavePineconeIndexSchema,
  GetPineconeIndexSchema,
  // Main branch additions
  IndexRepoSchema,
  IndexRepoProgressSchema,
  IndexRepoCompleteSchema,
  IndexRepoStateChangeSchema,
  IndexRepoPausedSchema,
  IndexRepoStoppedSchema,
  PauseRepoIndexingSchema,
  ResumeRepoIndexingSchema,
  StopRepoIndexingSchema,
  DeleteRepoIndexSchema,
  GetRepoIndexCountSchema,
  SearchRepoSchema,
  GenerateRepomixFromSearchSchema,
  GetRepoVectorCountSchema,
  CopySearchOutputSchema,
  CopySearchResultsMarkdownSchema,
  // New Clipboard Schemas
  GetCopyModeSchema,
  SetCopyModeSchema,
  // Qdrant Configuration Schemas
  GetVectorDbProviderSchema,
  SetVectorDbProviderSchema,
  GetQdrantConfigSchema,
  SetQdrantConfigSchema,
  TestQdrantConnectionSchema,
]);

export type WebviewMessage = z.infer<typeof WebviewMessageSchema>;
