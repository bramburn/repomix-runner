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
  key: z.enum(['googleApiKey', 'pineconeApiKey', 'qdrantApiKey', 'anthropicApiKey']),
  value: z.string().min(1),
});

export const CheckSecretSchema = z.object({
  command: z.literal('checkSecret'),
  key: z.enum(['googleApiKey', 'pineconeApiKey', 'qdrantApiKey', 'anthropicApiKey']),
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
  provider: z.enum(['pinecone', 'qdrant']),
});

export const VectorDbProviderSchema = z.object({
  command: z.literal('vectorDbProvider'),
  provider: z.enum(['pinecone', 'qdrant']).optional(),
});

export const GetVectorDbCollectionInfoSchema = z.object({
  command: z.literal('getVectorDbCollectionInfo'),
});

export const VectorDbCollectionInfoSchema = z.object({
  command: z.literal('vectorDbCollectionInfo'),
  provider: z.enum(['pinecone', 'qdrant']),
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
  collection: z.string().min(1, "Collection name is required"),
});

export const TestQdrantConnectionSchema = z.object({
  command: z.literal('testQdrantConnection'),
  url: z.string().min(1, "URL is required"),
  collection: z.string().min(1, "Collection name is required"),
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

export const ApplyPatchesSchema = z.object({
  command: z.literal('applyPatches'),
  text: z.string(),
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
  provider: z.enum(['gemini', 'ollama', 'lmstudio']),
  ollamaUrl: z.string().min(1, "Ollama URL is required").optional(),
  ollamaModel: z.string().min(1, "Ollama model is required").optional(),
  ollamaDimension: z.number().int().positive().optional(),
  lmstudioBaseUrl: z.string().min(1, 'LM Studio base URL is required').optional(),
  lmstudioApiKey: z.string().optional(),
  lmstudioModel: z.string().optional(),
  lmstudioDimension: z.number().int().positive().optional(),
});

export const FetchOllamaModelsSchema = z.object({
  command: z.literal('fetchOllamaModels'),
  url: z.string().min(1, "Ollama URL is required").optional(),
});

export const OllamaModelsResultSchema = z.object({
  command: z.literal('ollamaModelsResult'),
  models: z.array(z.object({
    name: z.string(),
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

export const EmbeddingConfigSchema = z.object({
  command: z.literal('embeddingConfig'),
  provider: z.enum(['gemini', 'ollama', 'lmstudio']),
  ollamaUrl: z.string().optional(),
  ollamaModel: z.string().optional(),
  ollamaDimension: z.number().int().positive().optional(),
  lmstudioBaseUrl: z.string().optional(),
  lmstudioApiKey: z.string().optional(),
  lmstudioModel: z.string().optional(),
  lmstudioDimension: z.number().int().positive().optional(),
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
  })),
});

// Resume edit review (webview → extension)
export const ResumeEditReviewSchema = z.object({
  command: z.literal('resumeEditReview'),
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
  FetchPineconeIndexesSchema,
  SavePineconeIndexSchema,
  GetPineconeIndexSchema,
  IndexRepoSchema,
  IndexRepoProgressSchema,
  IndexRepoCompleteSchema,
  IndexRepoStateChangeSchema,
  IndexRepoPausedSchema,
  IndexRepoStoppedSchema,
  PauseRepoIndexingSchema,
  ResumeRepoIndexingSchema,
  StopRepoIndexingSchema,
  GetIndexingStateSchema,
  IndexingStateRestoredSchema,
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
  ApplyPatchesSchema,
  RemoteClipboardProcessingCompleteSchema,
  SearchSummaryReadySchema,
  GetEmbeddingConfigSchema,
  SetEmbeddingConfigSchema,
  FetchOllamaModelsSchema,
  OllamaModelsResultSchema,
  TestEmbeddingSchema,
  TestOllamaDimensionSchema,
  OllamaDimensionResultSchema,
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
  UpdatePackageDraftSchema,
  GetPackagePreviewSchema,
  ViewBatchStatusSchema,
  PackagePreviewSchema,
  PackagesBulkSendResultSchema,
  BatchStatusSchema,
  ResumeBatchPendingSchema,
  EditReviewSchema,
  ResumeEditReviewSchema,
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
]);

export type WebviewMessage = z.infer<typeof WebviewMessageSchema>;
