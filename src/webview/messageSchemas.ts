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
  key: z.enum(['googleApiKey', 'pineconeApiKey']),
  value: z.string().min(1),
});

export const CheckSecretSchema = z.object({
  command: z.literal('checkSecret'),
  key: z.enum(['googleApiKey', 'pineconeApiKey']),
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
]);

export type WebviewMessage = z.infer<typeof WebviewMessageSchema>;
