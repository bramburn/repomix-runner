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

export const SaveSecretSchema = z.object({
  command: z.literal('saveSecret'),
  key: z.enum(['googleApiKey', 'qdrantApiKey', 'anthropicApiKey', 'postgresConnectionString']),
  value: z.string(),
});

export const CheckSecretSchema = z.object({
  command: z.literal('checkSecret'),
  key: z.enum(['googleApiKey', 'qdrantApiKey', 'anthropicApiKey', 'postgresConnectionString']),
});

// --- PostgreSQL Connection Management ---

export const SavePostgresConnectionSchema = z.object({
  command: z.literal('savePostgresConnection'),
  value: z.string(),
});

export const CheckPostgresConnectionSchema = z.object({
  command: z.literal('checkPostgresConnection'),
});

export const DeletePostgresConnectionSchema = z.object({
  command: z.literal('deletePostgresConnection'),
});

export const PostgresConnectionStatusSchema = z.object({
  command: z.literal('postgresConnectionStatus'),
  exists: z.boolean(),
  source: z.enum(['settings', 'secrets', 'none']).optional(),
});

export const SetEnrichmentConfigSchema = z.object({
  command: z.literal('setEnrichmentConfig'),
  enabled: z.boolean(),
  llmProvider: z.enum(['gemini', 'ollama', 'lmstudio', 'openrouter']),
});

export const EnrichmentConfigResultSchema = z.object({
  command: z.literal('enrichmentConfig'),
  enabled: z.boolean(),
  llmProvider: z.enum(['gemini', 'ollama', 'lmstudio', 'openrouter']),
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

export const DeleteDebugRunSchema = z.object({
  command: z.literal('deleteDebugRun'),
  id: z.number(),
});

export const GetEnvironmentInfoSchema = z.object({
  command: z.literal('getEnvironmentInfo'),
});

export const UpdateEnvironmentInfoSchema = z.object({
  command: z.literal('updateEnvironmentInfo'),
  environmentInfo: z.object({
    localOs: z.enum(['win32', 'darwin', 'linux', 'freebsd', 'openbsd', 'sunos', 'aix']),
    localArch: z.string(),
    remoteOs: z.enum(['win32', 'darwin', 'linux', 'freebsd', 'openbsd', 'sunos', 'aix']).optional(),
    remoteArch: z.string().optional(),
    isRemote: z.boolean(),
    remoteName: z.string().optional(),
    isSshRemote: z.boolean(),
    shouldUseLocalBinary: z.boolean(),
    binaryPath: z.string().optional(),
    binaryExists: z.boolean(),
  }),
});

// --- Repository Indexing Schemas ---

export const IndexRepoSchema = z.object({
  command: z.literal('indexRepo'),
});

export const IndexRepoProgressSchema = z.object({
  command: z.literal('indexRepoProgress'),
  current: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  filePath: z.string(),
});

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

export const GetIndexingStateSchema = z.object({
  command: z.literal('getIndexingState'),
});

export const IndexingStateRestoredSchema = z.object({
  command: z.literal('indexingStateRestored'),
  state: z.enum(['idle', 'paused']),
  progress: z.object({
    completed: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }).optional(),
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
  topK: z.number().int().min(1).max(1000).optional(),
  useSmartFilter: z.boolean().optional(),
  confidenceThreshold: z.number().min(0).max(1).optional(),
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

export const CopySingleFileRespectingModeSchema = z.object({
  command: z.literal('copySingleFileRespectingMode'),
  path: z.string(),
});

export const CopySearchResultsMarkdownSchema = z.object({
  command: z.literal('copySearchResultsMarkdown'),
  files: z.array(z.string().min(1)).min(1),
});

export const CopySearchFilePathsSchema = z.object({
  command: z.literal('copySearchFilePaths'),
  files: z.array(z.string().min(1)).min(1),
});

export const SearchSummaryReadySchema = z.object({
  command: z.literal('searchSummaryReady'),
  summaryPath: z.string().min(1),
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
  provider: z.enum(['qdrant']),
});

export const VectorDbProviderSchema = z.object({
  command: z.literal('vectorDbProvider'),
  provider: z.enum(['qdrant']).optional(),
});

export const GetVectorDbCollectionInfoSchema = z.object({
  command: z.literal('getVectorDbCollectionInfo'),
});

export const VectorDbCollectionInfoSchema = z.object({
  command: z.literal('vectorDbCollectionInfo'),
  provider: z.enum(['qdrant']),
  info: z.object({ name: z.string() }).optional(),
});

export const FetchQdrantCollectionsSchema = z.object({
  command: z.literal('fetchQdrantCollections'),
});

export const UpdateQdrantCollectionsSchema = z.object({
  command: z.literal('updateQdrantCollections'),
  collections: z.array(z.object({
    name: z.string(),
  })),
  error: z.string().optional(),
});

export const GetQdrantConfigSchema = z.object({
  command: z.literal('getQdrantConfig'),
});

export const SetQdrantConfigSchema = z.object({
  command: z.literal('setQdrantConfig'),
  url: z.string().min(1, "URL is required"),
});

export const TestQdrantConnectionSchema = z.object({
  command: z.literal('testQdrantConnection'),
  url: z.string().min(1, "URL is required"),
  apiKey: z.string().optional(),
});

export const ShowNotificationSchema = z.object({
  command: z.literal('showNotification'),
  type: z.enum(['info', 'warning', 'error']).optional(),
  message: z.string().min(1, "Message is required"),
});

export const ReportClientInfoSchema = z.object({
  command: z.literal('reportClientInfo'),
  clientOs: z.enum(['win32', 'darwin', 'linux', 'unknown']),
  clientArch: z.enum(['x64', 'arm64', 'unknown']),
});

export const RemoteClipboardProcessingCompleteSchema = z.object({
  command: z.literal('remoteClipboardProcessingComplete'),
  resolverKey: z.string(),
  success: z.boolean(),
  error: z.string().optional(),
});

// --- Embedding Configuration Schemas ---

export const GetEmbeddingConfigSchema = z.object({
  command: z.literal('getEmbeddingConfig'),
});

export const SetEmbeddingConfigSchema = z.object({
  command: z.literal('setEmbeddingConfig'),
  provider: z.enum(['gemini', 'ollama', 'lmstudio', 'openrouter']),
  ollamaUrl: z.string().min(1, "Ollama URL is required").optional(),
  ollamaModel: z.string().min(1, "Ollama model is required").optional(),
  ollamaDimension: z.number().int().positive().optional(),
  lmstudioBaseUrl: z.string().min(1, 'LM Studio base URL is required').optional(),
  lmstudioApiKey: z.string().optional(),
  lmstudioModel: z.string().optional(),
  lmstudioDimension: z.number().int().positive().optional(),
  openrouterBaseUrl: z.string().min(1, 'OpenRouter base URL is required').optional(),
  openrouterApiKey: z.string().optional(),
  openrouterModel: z.string().optional(),
  openrouterDimension: z.number().int().positive().optional(),
  openrouterProviderOrder: z.array(z.string()).optional(),
  openrouterAllowFallbacks: z.boolean().optional(),
  openrouterQuantizations: z.array(z.string()).optional(),
});

export const FetchOllamaModelsSchema = z.object({
  command: z.literal('fetchOllamaModels'),
  url: z.string().min(1, "Ollama URL is required").optional(),
});

export const OllamaModelsResultSchema = z.object({
  command: z.literal('ollamaModelsResult'),
  models: z.array(z.object({
    name: z.string(),
    dimension: z.number().optional(),
    model: z.string().optional(),
    size: z.number().optional(),
    digest: z.string().optional(),
    details: z.record(z.unknown()).optional(),
  })),
  error: z.string().optional(),
});

export const TestEmbeddingSchema = z.object({
  command: z.literal('testEmbedding'),
  provider: z.enum(['gemini', 'ollama']),
  url: z.string().optional(),
  model: z.string().optional(),
  text: z.string().min(1),
});

export const TestOllamaDimensionSchema = z.object({
  command: z.literal('testOllamaDimension'),
  url: z.string().min(1, "Ollama URL is required"),
  model: z.string().min(1, "Model name is required"),
});

export const OllamaDimensionResultSchema = z.object({
  command: z.literal('ollamaDimensionResult'),
  dimension: z.number().int().positive().optional(),
  error: z.string().optional(),
});

export const FetchOpenRouterModelsSchema = z.object({
  command: z.literal('fetchOpenRouterModels'),
});

export const OpenRouterModelsResultSchema = z.object({
  command: z.literal('openrouterModelsResult'),
  models: z.array(z.object({
    id: z.string(),
    name: z.string().optional(),
    description: z.string().optional(),
    context_length: z.number().optional(),
  })),
  error: z.string().optional(),
});

export const TestOpenRouterDimensionSchema = z.object({
  command: z.literal('testOpenRouterDimension'),
  baseUrl: z.string().min(1, "OpenRouter base URL is required"),
  apiKey: z.string().min(1, "OpenRouter API key is required"),
  model: z.string().min(1, "Model name is required"),
  providerOrder: z.array(z.string()).optional(),
  allowFallbacks: z.boolean().optional(),
  quantizations: z.array(z.string()).optional(),
});

export const OpenRouterDimensionResultSchema = z.object({
  command: z.literal('openrouterDimensionResult'),
  dimension: z.number().int().positive().optional(),
  error: z.string().optional(),
});

export const TestOpenRouterConnectionSchema = z.object({
  command: z.literal('testOpenRouterConnection'),
  baseUrl: z.string().min(1, "OpenRouter base URL is required"),
  apiKey: z.string().min(1, "OpenRouter API key is required"),
  model: z.string().min(1, "Model name is required"),
  providerOrder: z.array(z.string()).optional(),
  allowFallbacks: z.boolean().optional(),
  quantizations: z.array(z.string()).optional(),
});

export const OpenRouterConnectionResultSchema = z.object({
  command: z.literal('openrouterConnectionResult'),
  success: z.boolean(),
  message: z.string().optional(),
  error: z.string().optional(),
});

export const GetOpenRouterConfigSchema = z.object({
  command: z.literal('getOpenRouterConfig'),
});

export const OpenRouterConfigSchema = z.object({
  command: z.literal('openrouterConfig'),
  baseUrl: z.string(),
  apiKey: z.string(),
  model: z.string(),
  dimension: z.number(),
  providerOrder: z.array(z.string()).optional(),
  allowFallbacks: z.boolean().optional(),
  quantizations: z.array(z.string()).optional(),
});

export const EmbeddingConfigSchema = z.object({
  command: z.literal('embeddingConfig'),
  provider: z.enum(['gemini', 'ollama', 'lmstudio', 'openrouter']),
  ollamaUrl: z.string().optional(),
  ollamaModel: z.string().optional(),
  ollamaDimension: z.number().int().positive().optional(),
  lmstudioBaseUrl: z.string().optional(),
  lmstudioApiKey: z.string().optional(),
  lmstudioModel: z.string().optional(),
  lmstudioDimension: z.number().int().positive().optional(),
  openrouterBaseUrl: z.string().optional(),
  openrouterApiKey: z.string().optional(),
  openrouterModel: z.string().optional(),
  openrouterDimension: z.number().int().positive().optional(),
  openrouterProviderOrder: z.array(z.string()).optional(),
  openrouterAllowFallbacks: z.boolean().optional(),
  openrouterQuantizations: z.array(z.string()).optional(),
});

export const EmbeddingTestResultSchema = z.object({
  command: z.literal('embeddingTestResult'),
  success: z.boolean(),
  dimension: z.number().int().positive().optional(),
  error: z.string().optional(),
});

// --- Dimension Compatibility Schemas ---

export const CheckCompatibilitySchema = z.object({
  command: z.literal('checkCompatibility'),
});

export const CompatibilityStatusSchema = z.object({
  command: z.literal('compatibilityStatus'),
  compatible: z.boolean(),
  blocked: z.boolean(),
  embeddingDimension: z.number(),
  indexDimension: z.number().optional(),
  message: z.string(),
});

export const ResetVectorIndexSchema = z.object({
  command: z.literal('resetVectorIndex'),
});

export const VectorIndexResetSchema = z.object({
  command: z.literal('vectorIndexReset'),
  success: z.boolean(),
  error: z.string().optional(),
});

export const IndexingBlockedSchema = z.object({
  command: z.literal('indexingBlocked'),
  blocked: z.boolean(),
});

// --- Index History Schemas ---

export const GetIndexHistorySchema = z.object({
  command: z.literal('getIndexHistory'),
  repoId: z.string().optional(),
});

export const IndexHistoryEntrySchema = z.object({
  id: z.number(),
  timestamp: z.number(),
  repoId: z.string(),
  filePath: z.string(),
  eventType: z.enum(['queued', 'flush', 'embedding_complete', 'embedding_failed']),
  status: z.enum(['pending', 'indexed', 'failed']).nullable(),
  details: z.string().optional(),
});

export const IndexHistoryUpdateSchema = z.object({
  command: z.literal('indexHistoryUpdate'),
  entries: z.array(IndexHistoryEntrySchema),
  stats: z.object({
    queued: z.number(),
    flush: z.number(),
    embeddingComplete: z.number(),
    embeddingFailed: z.number(),
  }),
});

export const IndexHistoryEventSchema = z.object({
  command: z.literal('indexHistoryEvent'),
  entry: IndexHistoryEntrySchema,
});

// --- Repository Analysis (Fingerprinting) Schemas ---

export const AnalyzeRepositorySchema = z.object({
  command: z.literal('analyzeRepository'),
});

export const GetAnalysisStatusSchema = z.object({
  command: z.literal('getAnalysisStatus'),
});

export const AnalysisProgressSchema = z.object({
  command: z.literal('analysisProgress'),
  phase: z.string(),
  current: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});

export const AnalysisCompleteSchema = z.object({
  command: z.literal('analysisComplete'),
  success: z.boolean(),
  error: z.string().optional(),
});

export const AnalysisStatusSchema = z.object({
  command: z.literal('analysisStatus'),
  exists: z.boolean(),
  valid: z.boolean(),
  repoId: z.string().optional(),
  generatedAt: z.number().optional(),
  expiresAt: z.number().optional(),
  framework: z.string().optional(),
  configFileCount: z.number().int().nonnegative().optional(),
  patternsCount: z.number().int().nonnegative().optional(),
  guidesCount: z.number().int().nonnegative().optional(),
  tokensUsed: z.number().int().nonnegative().optional(),
  invalidationReason: z.enum(['ttl', 'hash', 'git', 'manual']).nullable().optional(),
});

// --- Token Budget Configuration Schemas ---

export const GetTokenBudgetSchema = z.object({
  command: z.literal('getTokenBudget'),
});

export const SetTokenBudgetSchema = z.object({
  command: z.literal('setTokenBudget'),
  budget: z.number().int().positive(),
});

export const TokenBudgetSchema = z.object({
  command: z.literal('tokenBudget'),
  budget: z.number().int().positive(),
});

export const ChatSubmitSchema = z.object({
  command: z.literal('chatSubmit'),
  text: z.string().min(1),
});

export const GetThreadsSchema = z.object({
  command: z.literal('getThreads'),
});

export const CreateThreadSchema = z.object({
  command: z.literal('createThread'),
});

export const SetActiveThreadSchema = z.object({
  command: z.literal('setActiveThread'),
  threadId: z.string().min(1),
});

export const LoadThreadSchema = z.object({
  command: z.literal('loadThread'),
  threadId: z.string().min(1),
});

export const GetThreadHistoryPageSchema = z.object({
  command: z.literal('getThreadHistoryPage'),
  threadId: z.string().min(1),
  before: z
    .object({
      timestamp: z.number().int().nonnegative(),
      id: z.string().min(1),
    })
    .nullable()
    .optional(),
  limit: z.number().int().positive().max(500).optional(),
});

export const DeleteThreadSchema = z.object({
  command: z.literal('deleteThread'),
  threadId: z.string().min(1),
});

export const RenameThreadSchema = z.object({
  command: z.literal('renameThread'),
  threadId: z.string().min(1),
  newName: z.string().min(1),
});

export const ExportThreadSchema = z.object({
  command: z.literal('exportThread'),
  threadId: z.string().min(1),
});

export const ThreadListSchema = z.object({
  command: z.literal('threadList'),
  activeThreadId: z.string().nullable().optional(),
  threads: z.array(z.object({
    id: z.string(),
    title: z.string(),
    createdAt: z.number().int().nonnegative().optional(),
    updatedAt: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative().optional(),
    preview: z.string().optional(),
    planPath: z.string().optional(),
  })),
});

export const ThreadHistorySchema = z.object({
  command: z.literal('threadHistory'),
  threadId: z.string().min(1),
  append: z.boolean().optional(),
  hasMore: z.boolean().optional(),
  nextCursor: z
    .object({
      timestamp: z.number().int().nonnegative(),
      id: z.string().min(1),
    })
    .nullable()
    .optional(),
  messages: z.array(z.object({
    id: z.string().optional(),
    role: z.enum(['user', 'assistant']),
    content: z.string(),
    timestamp: z.number().int().nonnegative().optional(),
    toolCalls: z
      .array(
        z.object({
          name: z.string(),
          args: z.record(z.unknown()).optional(),
          result: z.string().optional(),
        })
      )
      .optional(),
  })),
});

export const ChatResponseSchema = z.object({
  command: z.literal('chatResponse'),
  text: z.string(),
  tokensUsed: z.number().int().nonnegative().optional(),
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  costUsd: z.number().nonnegative().optional(),
});

export const ChatProgressSchema = z.object({
  command: z.literal('chatProgress'),
  text: z.string(),
});

// --- HITL Workflow Schemas ---

// Goal review (extension → webview)
export const GoalReviewSchema = z.object({
  command: z.literal('goalReview'),
  goal: z.string(),
  contextFiles: z.array(z.string()),
  dependencies: z.record(z.string()),
});

// Resume goal review (webview → extension)
export const ResumeGoalReviewSchema = z.object({
  command: z.literal('resumeGoalReview'),
  goalText: z.string(),
  contextFiles: z.array(z.string()),
});

// Package review (extension → webview)
export const PackageReviewSchema = z.object({
  command: z.literal('packageReview'),
  packageId: z.string().optional(),
  package: z.object({
    goal: z.string(),
    contextFiles: z.array(z.object({
      path: z.string(),
      content: z.string(),
    })),
    repoArchitecture: z.string(),
    dependencies: z.record(z.string()),
    outputInstruction: z.enum(['plan', 'code_change', 'code_review']),
  }),
  estimatedTokens: z.number(),
});

// Resume package review (webview → extension)
export const ResumePackageReviewSchema = z.object({
  command: z.literal('resumePackageReview'),
  approved: z.boolean(),
  packageId: z.string().optional(),
});

// Package ready inline card (extension -> webview)
export const PackageReadySchema = z.object({
  command: z.literal('packageReady'),
  packageId: z.string().optional(),
  package: z.object({
    goal: z.string(),
    contextFiles: z.array(z.object({
      path: z.string(),
      content: z.string(),
    })),
    repoArchitecture: z.string(),
    dependencies: z.record(z.string()),
    outputInstruction: z.enum(['plan', 'code_change', 'code_review']),
  }),
  estimatedTokens: z.number(),
});

const PackageStatusEnum = z.enum([
  'draft',
  'pending',
  'submitted',
  'processing',
  'completed',
  'failed',
  'cancelled',
]);

const PackageTypeEnum = z.enum(['plan', 'code_change', 'code_review']);

const PackageSummarySchema = z.object({
  id: z.string(),
  threadId: z.string().nullable(),
  batchApiId: z.string().nullable(),
  status: PackageStatusEnum,
  packageType: PackageTypeEnum,
  goal: z.string(),
  contextFileCount: z.number().int().nonnegative(),
  estimatedTokens: z.number().int().nonnegative(),
  tokensInput: z.number().int().nonnegative().nullable(),
  tokensOutput: z.number().int().nonnegative().nullable(),
  costUsd: z.number().nullable(),
  createdAt: z.number(),
  submittedAt: z.number().nullable(),
  completedAt: z.number().nullable(),
  errorMessage: z.string().nullable(),
});

// Package list request (webview -> extension)
export const ListPackagesSchema = z.object({
  command: z.literal('listPackages'),
  status: PackageStatusEnum.optional(),
  packageType: PackageTypeEnum.optional(),
});

// Package list response (extension -> webview)
export const PackageListSchema = z.object({
  command: z.literal('packageList'),
  packages: z.array(PackageSummarySchema),
});

// Package actions (webview -> extension)
export const ApprovePackageSchema = z.object({
  command: z.literal('approvePackage'),
  packageId: z.string(),
});

export const UnapprovePackageSchema = z.object({
  command: z.literal('unapprovePackage'),
  packageId: z.string(),
});

export const SendPackageSchema = z.object({
  command: z.literal('sendPackage'),
  packageId: z.string(),
});

export const SendAllApprovedSchema = z.object({
  command: z.literal('sendAllApproved'),
});

export const CancelBatchSchema = z.object({
  command: z.literal('cancelBatch'),
  packageId: z.string(),
});

export const DeletePackageSchema = z.object({
  command: z.literal('deletePackage'),
  packageId: z.string(),
});

export const RetryPackageSchema = z.object({
  command: z.literal('retryPackage'),
  packageId: z.string(),
});

export const UpdatePackageDraftSchema = z.object({
  command: z.literal('updatePackageDraft'),
  packageId: z.string(),
  goal: z.string().trim().min(1).max(8000).optional(),
  outputInstruction: PackageTypeEnum.optional(),
});

export const GetPackagePreviewSchema = z.object({
  command: z.literal('getPackagePreview'),
  packageId: z.string(),
});

export const ViewBatchStatusSchema = z.object({
  command: z.literal('viewBatchStatus'),
  packageId: z.string(),
});

// Package preview response (extension -> webview)
export const PackagePreviewSchema = z.object({
  command: z.literal('packagePreview'),
  package: PackageSummarySchema.extend({
    contextFiles: z.array(z.object({
      path: z.string(),
      tokenCount: z.number().int().nonnegative(),
      content: z.string(),
    })),
    repoArchitecture: z.string(),
    dependencies: z.record(z.string()),
    outputInstruction: PackageTypeEnum,
    rawPrompt: z.string(),
  }),
});

// Bulk send result (extension -> webview)
export const PackagesBulkSendResultSchema = z.object({
  command: z.literal('packagesBulkSendResult'),
  submitted: z.array(z.string()),
  failed: z.array(z.string()),
  skipped: z.array(z.string()).optional(),
});

// Batch status (extension → webview)
export const BatchStatusSchema = z.object({
  command: z.literal('batchStatus'),
  batchJobId: z.string(),
  status: z.enum(['pending', 'processing', 'completed', 'failed', 'cancelled']),
  estimatedCompletionTime: z.string().optional(),
});

// Resume batch pending (webview → extension)
export const ResumeBatchPendingSchema = z.object({
  command: z.literal('resumeBatchPending'),
  completed: z.boolean(),
  responseContent: z.string().optional(),
  error: z.string().optional(),
});

// Edit review (extension → webview)
export const EditReviewSchema = z.object({
  command: z.literal('editReview'),
  edits: z.array(z.object({
    filePath: z.string(),
    action: z.enum(['create', 'edit', 'delete']),
    preview: z.string(),
    lineCount: z.number(),
  })),
});

// Resume edit review (webview → extension)
export const ResumeEditReviewSchema = z.object({
  command: z.literal('resumeEditReview'),
  approvedEdits: z.array(z.string()),
});

// Apply individual edit (webview → extension)
export const ApplyEditSchema = z.object({
  command: z.literal('applyEdit'),
  filePath: z.string(),
});

// Skip individual edit (webview → extension)
export const SkipEditSchema = z.object({
  command: z.literal('skipEdit'),
  filePath: z.string(),
});

// View diff for edit (webview → extension)
export const ViewEditDiffSchema = z.object({
  command: z.literal('viewEditDiff'),
  filePath: z.string(),
});

// Apply all edits (webview → extension)
export const ApplyAllEditsSchema = z.object({
  command: z.literal('applyAllEdits'),
  approvedEdits: z.array(z.string()),
});

// Code review (extension → webview)
export const CodeReviewSchema = z.object({
  command: z.literal('codeReview'),
  appliedFiles: z.array(z.string()),
});

// Resume code review (webview → extension)
export const ResumeCodeReviewSchema = z.object({
  command: z.literal('resumeCodeReview'),
  requestReviewCycle: z.boolean(),
});

// --- Runner Configuration Schemas ---

export const GetRunnerConfigSchema = z.object({
  command: z.literal('getRunnerConfig'),
});

export const SetRunnerConfigSchema = z.object({
  command: z.literal('setRunnerConfig'),
  config: z.object({
    respectGitignoreInMarkdown: z.boolean().optional(),
  }),
});

export const RunnerConfigSchema = z.object({
  command: z.literal('runnerConfig'),
  config: z.object({
    respectGitignoreInMarkdown: z.boolean(),
  }),
});

// --- Memory Manager Schemas (PRD 004) ---

const MemoryScopeEnum = z.enum(['session', 'repo']);
const MemorySourceEnum = z.enum(['user', 'auto']);

// Get memories for a scope (webview → extension)
export const GetMemoriesSchema = z.object({
  command: z.literal('getMemories'),
  scope: MemoryScopeEnum,
});

// Create a new memory (webview → extension)
export const CreateMemorySchema = z.object({
  command: z.literal('createMemory'),
  scope: MemoryScopeEnum,
  key: z.string().min(1).max(100),
  value: z.string().min(1).max(10000),
});

// Update an existing memory (webview → extension)
export const UpdateMemorySchema = z.object({
  command: z.literal('updateMemory'),
  id: z.string().min(1),
  value: z.string().min(1).max(10000),
});

// Delete a memory (webview → extension)
export const DeleteMemorySchema = z.object({
  command: z.literal('deleteMemory'),
  id: z.string().min(1),
});

// Search memories by keyword (webview → extension)
export const SearchMemoriesSchema = z.object({
  command: z.literal('searchMemories'),
  scope: MemoryScopeEnum,
  query: z.string().min(1).max(200),
});

// Memory list response (extension → webview)
export const MemoryListSchema = z.object({
  command: z.literal('memoryList'),
  scope: MemoryScopeEnum,
  memories: z.array(z.object({
    id: z.string(),
    key: z.string(),
    value: z.string(),
    source: MemorySourceEnum,
    createdAt: z.number(),
    updatedAt: z.number(),
    expiresAt: z.number().nullable(),
  })),
});

// --- Message Queue Schemas (PRD 007) ---

// Force send message (webview → extension)
export const ChatForceSubmitSchema = z.object({
  command: z.literal('chatForceSubmit'),
  text: z.string().min(1),
});

// Stop current execution (webview → extension)
export const ChatStopSchema = z.object({
  command: z.literal('chatStop'),
});

// Cancel queued message (webview → extension)
export const ChatCancelQueuedSchema = z.object({
  command: z.literal('chatCancelQueued'),
  entryId: z.string(),
});

// Clear entire queue (webview → extension)
export const ChatClearQueueSchema = z.object({
  command: z.literal('chatClearQueue'),
});

// Get queue status (webview → extension)
export const GetQueueStatusSchema = z.object({
  command: z.literal('getQueueStatus'),
});

// Queue status response (extension → webview)
const QueueEntrySchema = z.object({
  id: z.string(),
  threadId: z.string(),
  text: z.string(),
  priority: z.enum(['normal', 'force']),
  status: z.enum(['queued', 'processing', 'completed', 'cancelled', 'failed']),
  createdAt: z.number(),
  startedAt: z.number().optional(),
  completedAt: z.number().optional(),
  error: z.string().optional(),
});

export const QueueStatusSchema = z.object({
  command: z.literal('queueStatus'),
  queueLength: z.number(),
  currentlyProcessing: QueueEntrySchema.nullable(),
  entries: z.array(QueueEntrySchema),
});

// Queue processing started (extension → webview)
export const QueueProcessingStartedSchema = z.object({
  command: z.literal('queueProcessingStarted'),
  entryId: z.string(),
});

// Queue processing completed (extension → webview)
export const QueueProcessingCompletedSchema = z.object({
  command: z.literal('queueProcessingCompleted'),
  entryId: z.string(),
  success: z.boolean(),
});

// --- Chat Settings Schemas (PRD 010) ---

// Get all chat settings (webview → extension)
export const GetChatSettingsSchema = z.object({
  command: z.literal('getChatSettings'),
});

// Chat settings response (extension → webview)
export const ChatSettingsResultSchema = z.object({
  command: z.literal('chatSettingsResult'),
  settings: z.object({
    postgresConnectionString: z.string().optional(),
    planningModel: z.enum(['gemini-2.5-flash', 'gemini-2.5-flash-lite']).optional(),
    batchModel: z.string(),
    batchMaxTokens: z.number(),
    batchThinkingBudget: z.number(),
    batchPollIntervalSeconds: z.number(),
    contextThresholdPercent: z.number(),
    maxRecentMessages: z.number(),
    fileCompressionLevel: z.enum(['auto', 'full', 'skeleton', 'summary']).optional(),
    editMode: z.enum(['full', 'search_replace', 'hybrid']),
    hybridThresholdLines: z.number(),
    fuzzyMatchThreshold: z.number(),
    architectureRefreshHours: z.number(),
    architectureLastGenerated: z.number().optional(),
    architectureStatus: z.enum(['fresh', 'stale', 'missing']).optional(),
  }),
});

// Set individual chat setting (webview → extension)
export const SetChatSettingSchema = z.object({
  command: z.literal('setChatSetting'),
  key: z.string(),
  value: z.union([z.string(), z.number(), z.boolean()]),
});

// Test PostgreSQL connection (webview → extension)
export const TestPostgresConnectionSchema = z.object({
  command: z.literal('testPostgresConnection'),
});

// PostgreSQL connection test result (extension → webview)
export const PostgresConnectionResultSchema = z.object({
  command: z.literal('postgresConnectionResult'),
  success: z.boolean(),
  error: z.string().optional(),
});

// Run database migrations (webview → extension)
export const RunMigrationsSchema = z.object({
  command: z.literal('runMigrations'),
});

// Migrations complete (extension → webview)
export const MigrationsCompleteSchema = z.object({
  command: z.literal('migrationsComplete'),
  success: z.boolean(),
  error: z.string().optional(),
});

// Refresh architecture document now (webview → extension)
export const RefreshArchitectureNowSchema = z.object({
  command: z.literal('refreshArchitectureNow'),
});

// Architecture status update (extension → webview)
export const ArchitectureStatusSchema = z.object({
  command: z.literal('architectureStatus'),
  lastGenerated: z.number().optional(),
  status: z.enum(['fresh', 'stale', 'missing']),
});

// --- Chat History Schemas (PRD 010) ---

// Search threads (webview → extension)
export const SearchThreadsSchema = z.object({
  command: z.literal('searchThreads'),
  query: z.string().min(1),
  showArchived: z.boolean().optional(),
});

// Thread search results (extension → webview)
export const ThreadsSearchResultSchema = z.object({
  command: z.literal('threadsSearchResult'),
  threads: z.array(z.object({
    id: z.string(),
    title: z.string().nullable(),
    updatedAt: z.number(),
    createdAt: z.number(),
    messageCount: z.number(),
    tokenCount: z.number(),
    preview: z.string().optional(),
    hasPendingBatch: z.boolean().optional(),
    isArchived: z.boolean().optional(),
  })),
  total: z.number(),
});

// Archive thread (webview → extension)
export const ArchiveThreadSchema = z.object({
  command: z.literal('archiveThread'),
  threadId: z.string(),
});

// Unarchive thread (webview → extension)
export const UnarchiveThreadSchema = z.object({
  command: z.literal('unarchiveThread'),
  threadId: z.string(),
});

// Toggle archived threads display (webview → extension)
export const ShowArchivedThreadsSchema = z.object({
  command: z.literal('showArchivedThreads'),
  show: z.boolean(),
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
  SaveSecretSchema,
  CheckSecretSchema,
  SavePostgresConnectionSchema,
  CheckPostgresConnectionSchema,
  DeletePostgresConnectionSchema,
  PostgresConnectionStatusSchema,
  SetEnrichmentConfigSchema,
  EnrichmentConfigResultSchema,
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
  GetEnvironmentInfoSchema,
  IndexRepoSchema,
  PauseRepoIndexingSchema,
  ResumeRepoIndexingSchema,
  StopRepoIndexingSchema,
  GetIndexingStateSchema,
  DeleteRepoIndexSchema,
  GetRepoIndexCountSchema,
  SearchRepoSchema,
  GenerateRepomixFromSearchSchema,
  GetRepoVectorCountSchema,
  CopySearchOutputSchema,
  CopySingleFileRespectingModeSchema,
  CopySearchResultsMarkdownSchema,
  CopySearchFilePathsSchema,
  GetCopyModeSchema,
  SetCopyModeSchema,
  GetVectorDbProviderSchema,
  SetVectorDbProviderSchema,
  GetVectorDbCollectionInfoSchema,
  FetchQdrantCollectionsSchema,
  GetQdrantConfigSchema,
  SetQdrantConfigSchema,
  TestQdrantConnectionSchema,
  ShowNotificationSchema,
  ReportClientInfoSchema,
  RemoteClipboardProcessingCompleteSchema,
  SearchSummaryReadySchema,
  GetEmbeddingConfigSchema,
  SetEmbeddingConfigSchema,
  FetchOllamaModelsSchema,
  OllamaModelsResultSchema,
  TestEmbeddingSchema,
  TestOllamaDimensionSchema,
  OllamaDimensionResultSchema,
  FetchOpenRouterModelsSchema,
  OpenRouterModelsResultSchema,
  TestOpenRouterDimensionSchema,
  OpenRouterDimensionResultSchema,
  TestOpenRouterConnectionSchema,
  OpenRouterConnectionResultSchema,
  GetOpenRouterConfigSchema,
  OpenRouterConfigSchema,
  EmbeddingConfigSchema,
  EmbeddingTestResultSchema,
  CheckCompatibilitySchema,
  CompatibilityStatusSchema,
  ResetVectorIndexSchema,
  VectorIndexResetSchema,
  IndexingBlockedSchema,
  GetIndexHistorySchema,
  IndexHistoryUpdateSchema,
  IndexHistoryEventSchema,
  // Repository Analysis
  AnalyzeRepositorySchema,
  GetAnalysisStatusSchema,
  AnalysisProgressSchema,
  AnalysisCompleteSchema,
  AnalysisStatusSchema,
  // Token Budget
  GetTokenBudgetSchema,
  SetTokenBudgetSchema,
  TokenBudgetSchema,
  // Chat
  ChatSubmitSchema,
  GetThreadsSchema,
  CreateThreadSchema,
  SetActiveThreadSchema,
  LoadThreadSchema,
  GetThreadHistoryPageSchema,
  DeleteThreadSchema,
  RenameThreadSchema,
  ExportThreadSchema,
  ThreadListSchema,
  ThreadHistorySchema,
  ChatResponseSchema,
  ChatProgressSchema,
  // HITL Workflow
  GoalReviewSchema,
  ResumeGoalReviewSchema,
  PackageReviewSchema,
  ResumePackageReviewSchema,
  PackageReadySchema,
  ListPackagesSchema,
  PackageListSchema,
  ApprovePackageSchema,
  UnapprovePackageSchema,
  SendPackageSchema,
  SendAllApprovedSchema,
   CancelBatchSchema,
   DeletePackageSchema,
   RetryPackageSchema,
   UpdatePackageDraftSchema,
  GetPackagePreviewSchema,
  ViewBatchStatusSchema,
  PackagePreviewSchema,
  PackagesBulkSendResultSchema,
  BatchStatusSchema,
  ResumeBatchPendingSchema,
  EditReviewSchema,
  ResumeEditReviewSchema,
  ApplyEditSchema,
  SkipEditSchema,
  ViewEditDiffSchema,
  ApplyAllEditsSchema,
  CodeReviewSchema,
  ResumeCodeReviewSchema,
  // Runner Configuration
  GetRunnerConfigSchema,
  SetRunnerConfigSchema,
  RunnerConfigSchema,
  // Memory Manager (PRD 004)
  GetMemoriesSchema,
  CreateMemorySchema,
  UpdateMemorySchema,
  DeleteMemorySchema,
  SearchMemoriesSchema,
  MemoryListSchema,
  // Message Queue (PRD 007)
  ChatForceSubmitSchema,
  ChatStopSchema,
  ChatCancelQueuedSchema,
  ChatClearQueueSchema,
  GetQueueStatusSchema,
  QueueStatusSchema,
  QueueProcessingStartedSchema,
  QueueProcessingCompletedSchema,
  // Chat Settings (PRD 010)
  GetChatSettingsSchema,
  ChatSettingsResultSchema,
  SetChatSettingSchema,
  TestPostgresConnectionSchema,
  PostgresConnectionResultSchema,
  RunMigrationsSchema,
  MigrationsCompleteSchema,
  RefreshArchitectureNowSchema,
  ArchitectureStatusSchema,
  // Chat History (PRD 010)
  SearchThreadsSchema,
  ThreadsSearchResultSchema,
  ArchiveThreadSchema,
  UnarchiveThreadSchema,
  ShowArchivedThreadsSchema,
]);

export type WebviewMessage = z.infer<typeof WebviewMessageSchema>;
