import React, { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Label,
  Spinner,
  Text,
  Input,
  Slider,
  Accordion,
  AccordionItem,
  AccordionHeader,
  AccordionPanel,
  AccordionToggleEventHandler,
  Textarea,
} from '@fluentui/react-components';
import {
  DeleteRegular,
  DatabaseSearchRegular,
  SearchRegular,
  CopyRegular,
} from '@fluentui/react-icons';
import { vscode } from '../vscode-api.js';
import { Tooltip } from '@fluentui/react-components';

export type RepoSearchResult = {
  id: string;
  score: number;
  path?: string;
  reason?: string;
  snippet?: string;
};

type FileTypeFilterState = {
  // Languages
  typescript: boolean;
  javascript: boolean;
  python: boolean;
  rust: boolean;
  csharp: boolean;
  java: boolean;
  dart: boolean;

  // Common formats
  yaml: boolean;
  json: boolean;
  xml: boolean;
  markdown: boolean;

  // Buckets
  config: boolean; // .env/.toml/.ini/.properties/.plist/.xcconfig/etc.
  mobile: boolean; // Android/iOS project files (.kt/.kts/.gradle/.swift/.m/.mm/.storyboard/...)

  // Catch-alls
  includeNoExtKnown: boolean; // Dockerfile, Makefile, .gitignore, Podfile, etc.
  includeAllExtensions: boolean; // show everything (UI filter bypass)

  // Custom
  custom: string; // comma-separated extensions, e.g. ".md,.json,!.txt"
};

interface SearchTabState {
  fileTypeFilter: FileTypeFilterState;
  query: string;
  smartFilterEnabled: boolean;
  openAccordionItems: string[];
  topK: number;
  confidenceThreshold: number;
  results?: RepoSearchResult[];
  lastSearchOutputPath?: string | null;
  summaryPath?: string | null;
}

const DEFAULT_FILTERS: FileTypeFilterState = {
  // languages
  typescript: true,
  javascript: true,
  python: true,
  rust: false,
  csharp: false,
  java: false,
  dart: false,

  // common formats
  yaml: true,
  json: true,
  xml: false,
  markdown: true,

  // buckets
  config: true,
  mobile: true,

  // catch-alls
  includeNoExtKnown: true,
  includeAllExtensions: false,

  // custom
  custom: '',
};

const KNOWN_EXTENSIONLESS_TEXT_FILES = new Set(
  [
    // Common
    'readme',
    'license',
    'changelog',

    // Build / tooling
    'makefile',
    'dockerfile',
    'podfile',
    'gemfile',
    'fastfile',
    'appfile',
    'brewfile',

    // Node / JS
    '.npmrc',
    '.nvmrc',
    '.yarnrc',
    '.yarnrc.yml',
    '.pnp.cjs',

    // Git
    '.gitignore',
    '.gitattributes',
    '.gitmodules',

    // Editors / lint
    '.editorconfig',
    '.prettierrc',
    '.prettierignore',
    '.eslintrc',
    '.eslintignore',
    '.stylelintrc',

    // Env
    '.env',
    '.env.local',
    '.env.development',
    '.env.production',
    '.env.test',

    // CI
    '.github', // directory-like, but leave here in case results include it
  ].map((s) => s.toLowerCase())
);

function extOf(p: string): string {
  const lower = p.toLowerCase();
  const lastSlash = Math.max(lower.lastIndexOf('/'), lower.lastIndexOf('\\'));
  const base = lastSlash >= 0 ? lower.slice(lastSlash + 1) : lower;

  // handle dotfiles like ".env" / ".gitignore" where extname would be ""
  if (base.startsWith('.') && base.indexOf('.', 1) === -1) return '';

  const lastDot = base.lastIndexOf('.');
  if (lastDot === -1) return '';
  return base.slice(lastDot);
}

function baseNameOf(p: string): string {
  const lower = p.toLowerCase();
  const lastSlash = Math.max(lower.lastIndexOf('/'), lower.lastIndexOf('\\'));
  return lastSlash >= 0 ? lower.slice(lastSlash + 1) : lower;
}

export const SearchTab = () => {

  // Try to load state from vscode context
  const loadedState = vscode.getState() as SearchTabState | undefined;

  const [fileCount, setFileCount] = useState<number | null>(null);
  const [vectorCount, setVectorCount] = useState<number | null>(null);
  const [vectorDbProvider, setVectorDbProvider] = useState<'pinecone' | 'qdrant'>('pinecone');
  const [collectionInfo, setCollectionInfo] = useState<{
    name: string;
    provider: 'pinecone' | 'qdrant';
  } | null>(null);

  const [isIndexing, setIsIndexing] = useState(false);
  const [indexingState, setIndexingState] = useState<'idle' | 'running' | 'paused' | 'stopping'>('idle');
  const [indexingBlocked, setIndexingBlocked] = useState(false);
  const [pausedProgress, setPausedProgress] = useState<{ completed: number; total: number } | null>(null);

  const [indexProgress, setIndexProgress] = useState<{
    current: number;
    total: number;
    filePath: string;
  } | null>(null);

  const [indexStats, setIndexStats] = useState<{
    repoId: string;
    filesIndexed: number;
    filesEmbedded: number;
    chunksEmbedded: number;
    vectorsUpserted: number;
    failedFiles: number;
    durationMs: number;
  } | null>(null);

  // Initialize with saved state or defaults
  const [query, setQuery] = useState(loadedState?.query || '');
  const [smartFilterEnabled, setSmartFilterEnabled] = useState(loadedState?.smartFilterEnabled ?? false);
  const [openItems, setOpenItems] = useState<string[]>(loadedState?.openAccordionItems || ['indexing', 'filters']);

  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [lastSearchOutputPath, setLastSearchOutputPath] = useState<string | null>(loadedState?.lastSearchOutputPath || null);
  const [summaryPath, setSummaryPath] = useState<string | null>(loadedState?.summaryPath || null);
  
  // Declare copyMode first so other labels can depend on it
  const [copyMode, setCopyMode] = useState<'content' | 'file'>('content');
  const [copyDecisionsLabel, setCopyDecisionsLabel] = useState('Copy Smart Filter Decisions');
  const [copyMarkdownLabel, setCopyMarkdownLabel] = useState('Copy as Markdown');
  const [mainCopyLabel, setMainCopyLabel] = useState(copyMode === 'content' ? 'Copy Text' : 'Copy File');
  const [summaryCopyLabel, setSummaryCopyLabel] = useState(copyMode === 'content' ? 'Copy Summary Text' : 'Copy Summary File');

  const [fileTypeFilter, setFileTypeFilter] = useState<FileTypeFilterState>(
    loadedState?.fileTypeFilter || DEFAULT_FILTERS
  );

  // Store the raw results from the backend
  const [rawResults, setRawResults] = useState<RepoSearchResult[]>(loadedState?.results || []);

  // Reactively filter results whenever rawResults OR fileTypeFilter changes
  const results = useMemo(() => {
    return filterByFileType(rawResults);
  }, [rawResults, fileTypeFilter]);

  // Initialize sliders with saved state or defaults
  const [topK, setTopK] = useState(loadedState?.topK ?? 200);
  const [confidenceThreshold, setConfidenceThreshold] = useState(loadedState?.confidenceThreshold ?? 0.5);

  // Persist state changes (merge with existing state to avoid clobbering other tabs)
  useEffect(() => {

    const prev = vscode.getState() ?? {};
    vscode.setState({
      ...prev,
      fileTypeFilter,
      query,
      smartFilterEnabled,
      openAccordionItems: openItems,
      topK,
      confidenceThreshold,
      results: rawResults, // Persist raw results so filters work on reopen
      lastSearchOutputPath,
      summaryPath
    });
  }, [fileTypeFilter, query, smartFilterEnabled, openItems, topK, confidenceThreshold, rawResults, lastSearchOutputPath, summaryPath]);

  const handleAccordionToggle: AccordionToggleEventHandler<string> = (event, data) => {
    const val = data.value as string;
    setOpenItems((prev) => {
      if (prev.includes(val)) {
        return prev.filter((i) => i !== val);
      } else {
        return [...prev, val];
      }
    });
  };

  const getActiveExtensions = (): {
    includedExts: Set<string>;
    includedBases: Set<string>;
    excludedExts: Set<string>;
    excludedBases: Set<string>;
  } => {
    const includedExts = new Set<string>();
    const includedBases = new Set<string>();
    const excludedExts = new Set<string>();
    const excludedBases = new Set<string>();

    const addExt = (s: string) => includedExts.add(s);
    const addBase = (s: string) => includedBases.add(s);

    const addExcludeExt = (s: string) => excludedExts.add(s);
    const addExcludeBase = (s: string) => excludedBases.add(s);

    // Languages
    if (fileTypeFilter.typescript) {
      addExt('.ts');
      addExt('.tsx');
    }
    if (fileTypeFilter.javascript) {
      addExt('.js');
      addExt('.jsx');
    }
    if (fileTypeFilter.python) addExt('.py');
    if (fileTypeFilter.rust) addExt('.rs');
    if (fileTypeFilter.csharp) addExt('.cs');
    if (fileTypeFilter.java) addExt('.java');
    if (fileTypeFilter.dart) addExt('.dart');

    // Formats
    if (fileTypeFilter.yaml) {
      addExt('.yaml');
      addExt('.yml');
    }
    if (fileTypeFilter.json) {
      addExt('.json');
      addExt('.jsonc');
    }
    if (fileTypeFilter.xml) addExt('.xml');
    if (fileTypeFilter.markdown) {
      addExt('.md');
      addExt('.mdx');
    }

    // Config bucket
    if (fileTypeFilter.config) {
      [
        '.env',
        '.env.local',
        '.env.development',
        '.env.production',
        '.gitignore',
        '.gitattributes',
        '.editorconfig',
        '.npmrc',
        '.yarnrc',
        '.prettierrc',
        '.prettierrc.json',
        '.prettierrc.yaml',
        '.prettierrc.yml',
        '.prettierrc.js',
        '.eslintrc',
        '.eslintrc.json',
        '.eslintrc.js',
        '.eslintignore',
        '.stylelintrc',
        '.stylelintrc.json',
        '.stylelintrc.js',
        '.dockerignore',
        'dockerfile',
        'makefile',
        '.lock',
        '.gradle',
        '.kts',
      ].forEach((e) => {
        // dotfiles + extensionless config entries should be treated as basenames
        const lower = e.toLowerCase();
        // Just add everything in this bucket to bases if it looks like a full filename
        if (e.startsWith('.') && e.indexOf('.', 1) === -1) {
          addBase(lower);
        } else {
          addBase(lower);
        }
      });
      // Also add extensions that are definitely extensions
      ['.toml', '.ini', '.cfg', '.conf', '.properties', '.plist', '.xcconfig'].forEach(addExt);
    }

    // Mobile bucket (Android/iOS)
    if (fileTypeFilter.mobile) {
      [
        '.dart',
        '.kt',
        '.kts',
        '.gradle',
        '.swift',
        '.m',
        '.mm',
        '.h',
        '.plist',
        '.xcconfig',
        '.storyboard',
        '.xib',
      ].forEach((e) => addExt(e));
    }

    // Custom
    if (fileTypeFilter.custom) {
      fileTypeFilter.custom
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((raw) => {
          let isExclude = false;
          let token = raw;

          if (token.startsWith('!')) {
            isExclude = true;
            token = token.substring(1).trim();
          }
          if (!token) return;

          const lower = token.toLowerCase();

          const looksLikeExt =
            (lower.startsWith('.') && lower.length <= 5 && lower.indexOf('.', 1) === -1) ||
            (!lower.startsWith('.') && lower.length <= 4 && lower.indexOf('.') === -1);

          if (looksLikeExt) {
            const ext = lower.startsWith('.') ? lower : `.${lower}`;
            if (isExclude) addExcludeExt(ext);
            else addExt(ext);
            return;
          }

          const base = lower;
          if (isExclude) addExcludeBase(base);
          else addBase(base);
        });
    }

    return { includedExts, includedBases, excludedExts, excludedBases };
  };

  const hasAnyFileTypeSelected = useMemo(() => {
    if (fileTypeFilter.includeAllExtensions) return true;
    const { includedExts, includedBases } = getActiveExtensions();
    return includedExts.size > 0 || includedBases.size > 0 || fileTypeFilter.includeNoExtKnown;
  }, [fileTypeFilter]);

  const canSearch = useMemo(
    () => query.trim().length > 0 && !isSearching && hasAnyFileTypeSelected,
    [query, isSearching, hasAnyFileTypeSelected]
  );

  const dedupedResults = useMemo(() => {
    const seen = new Set<string>();
    const out: RepoSearchResult[] = [];

    for (const r of results) {
      const p = r.path?.trim();
      if (!p) continue;
      if (seen.has(p)) continue;
      seen.add(p);
      out.push(r);
    }

    return out;
  }, [results]);

  const canGenerate = useMemo(() => dedupedResults.length > 0 && !isSearching, [dedupedResults, isSearching]);

  const handleGenerate = () => {
    if (dedupedResults.length === 0) return;
    vscode.postMessage({ command: 'generateRepomixFromSearch', files: dedupedResults });
  };



  const filterByFileType = (incoming: RepoSearchResult[]): RepoSearchResult[] => {
    const { includedExts, includedBases, excludedExts, excludedBases } = getActiveExtensions();

    return incoming.filter((r) => {
      if (!r.path) return false;
      const lowerPath = r.path.toLowerCase();
      const base = baseNameOf(lowerPath);
      const ext = extOf(lowerPath);

      if (excludedBases.has(base)) return false;
      if (ext && excludedExts.has(ext)) return false;

      if (fileTypeFilter.includeAllExtensions) return true;

      if (!ext) {
        if (includedBases.has(base)) return true;
        if (!fileTypeFilter.includeNoExtKnown) return false;
        return KNOWN_EXTENSIONLESS_TEXT_FILES.has(base);
      }

      return includedExts.has(ext) || includedBases.has(base);
    });
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      console.log('[SearchTab] Received message:', message.command);

      switch (message.command) {
        case 'hydrate':
          // Handle consolidated hydrate state
          console.log('[SearchTab] Received hydrate state');
          if (typeof message.repoIndexCount === 'number') {
            setFileCount(message.repoIndexCount);
          }
          if (typeof message.indexingBlocked === 'boolean') {
            setIndexingBlocked(message.indexingBlocked);
          }
          if (message.indexingState) {
            setIndexingState(message.indexingState);
            if (message.indexingState === 'running') {
              setIsIndexing(true);
            }
            if (message.indexingState === 'paused' && message.indexingProgress) {
              setPausedProgress(message.indexingProgress);
            }
          }
          break;

        case 'repoIndexCount':
          setFileCount(message.count);
          break;

        case 'indexRepoProgress':
          setIndexProgress({ current: message.current, total: message.total, filePath: message.filePath });
          break;

        case 'indexRepoComplete':
          setIsIndexing(false);
          setIndexProgress(null);
          setIndexStats({
            repoId: message.repoId,
            filesIndexed: message.filesIndexed,
            filesEmbedded: message.filesEmbedded,
            chunksEmbedded: message.chunksEmbedded,
            vectorsUpserted: message.vectorsUpserted,
            failedFiles: message.failedFiles,
            durationMs: message.durationMs,
          });
          setFileCount(message.filesIndexed);
          vscode.postMessage({ command: 'getRepoVectorCount' });
          break;

        case 'repoIndexComplete':
          setFileCount(message.count);
          setIsIndexing(false);
          setIndexProgress(null);
          vscode.postMessage({ command: 'getRepoVectorCount' });
          break;

        case 'repoIndexDeleted':
          setFileCount(0);
          setVectorCount(0);
          setRawResults([]);
          setIndexProgress(null);
          setIndexStats(null);
          setIndexingState('idle');
          setPausedProgress(null);
          break;

        case 'indexRepoStateChange':
          setIndexingState(message.state);
          if (message.progress) setIndexProgress(message.progress);
          break;

        case 'indexRepoPaused':
          setIndexingState('paused');
          setIsIndexing(false);
          setPausedProgress(message.progress);
          break;

        case 'indexRepoStopped':
          setIndexingState('idle');
          setIsIndexing(false);
          setIndexProgress(null);
          setPausedProgress(null);
          break;

        case 'indexingStateRestored':
          // Restore pause state from backend (e.g., after VS Code restart)
          if (message.state === 'paused' && message.progress) {
            setIndexingState('paused');
            setPausedProgress(message.progress);
          } else if (message.state === 'idle') {
            // Only reset if not currently running
            if (indexingState !== 'running') {
              setIndexingState('idle');
              setPausedProgress(null);
            }
          }
          break;

        case 'repoVectorCount':
          setVectorCount(message.count);
          break;

        case 'vectorDbProvider':
          setVectorDbProvider(message.provider ?? 'pinecone');
          break;

        case 'vectorDbCollectionInfo':
          setCollectionInfo(message.info ? { ...message.info, provider: message.provider } : null);
          break;

        case 'repoSearchResults': {
          console.log('[SearchTab] Search results received. Raw count:', message.results?.length || 0);
          setIsSearching(false);
          setSearchError(null);
          const incoming = Array.isArray(message.results) ? message.results : [];
          // We update the 'raw' state; the useMemo handles the UI update
          setRawResults(incoming);
          console.log('[SearchTab] ===== SEARCH COMPLETE =====');
          break;
        }

        case 'repoSearchError':
          console.error('[SearchTab] Search error received:', message.error);
          setIsSearching(false);
          setSearchError(message.error ?? 'Search failed');
          console.log('[SearchTab] ===== SEARCH FAILED =====');
          break;

        case 'searchOutputReady':
          console.log('[SearchTab] Search output ready:', message.outputPath);
          setLastSearchOutputPath(message.outputPath ?? null);
          break;

        case 'searchSummaryReady':
          console.log('[SearchTab] Search summary ready:', message.summaryPath);
          setSummaryPath(message.summaryPath);
          break;

        case 'updateCopyMode':
          setCopyMode(message.mode);
          break;

        case 'copySuccess':
          // Show temporary success feedback on the specific copy button
          if (message.type === 'single-file') {
            const { filePath, copyMode: returnedCopyMode } = message;
            
            // Determine which button was clicked based on filePath
            const isMainButton = filePath === lastSearchOutputPath;
            const isSummaryButton = filePath === summaryPath;
            
            if (isMainButton) {
              setMainCopyLabel('Copied!');
              const originalLabel = returnedCopyMode === 'content' ? 'Copy Text' : 'Copy File';
              setTimeout(() => setMainCopyLabel(originalLabel), 2000);
            } else if (isSummaryButton) {
              setSummaryCopyLabel('Copied!');
              const originalLabel = returnedCopyMode === 'content' ? 'Copy Summary Text' : 'Copy Summary File';
              setTimeout(() => setSummaryCopyLabel(originalLabel), 2000);
            }
          } else {
            setCopyMarkdownLabel('Copied!');
            setTimeout(() => setCopyMarkdownLabel('Copy as Markdown'), 2000);
          }
          break;

        case 'copyError':
          // Show temporary error feedback on the specific copy button
          console.error('Copy failed:', message.error);
          if (message.type === 'single-file') {
            const { filePath } = message;
            
            // Determine which button was clicked based on filePath
            const isMainButton = filePath === lastSearchOutputPath;
            const isSummaryButton = filePath === summaryPath;
            
            if (isMainButton) {
              setMainCopyLabel('Copy Failed');
              const originalLabel = copyMode === 'content' ? 'Copy Text' : 'Copy File';
              setTimeout(() => setMainCopyLabel(originalLabel), 3000);
            } else if (isSummaryButton) {
              setSummaryCopyLabel('Copy Failed');
              const originalLabel = copyMode === 'content' ? 'Copy Summary Text' : 'Copy Summary File';
              setTimeout(() => setSummaryCopyLabel(originalLabel), 3000);
            }
          } else {
            setCopyMarkdownLabel('Copy Failed');
            setTimeout(() => setCopyMarkdownLabel('Copy as Markdown'), 3000);
          }
          break;

        case 'indexingBlocked':
          setIndexingBlocked(message.blocked);
          break;
      }
    };

    window.addEventListener('message', handleMessage);

    return () => window.removeEventListener('message', handleMessage);
  }, [fileTypeFilter, copyMode]); // Added copyMode to dependencies for label restoration logic

  // Initial data fetch
  useEffect(() => {
    vscode.postMessage({ command: 'getCopyMode' });
    vscode.postMessage({ command: 'getIndexingState' });
    vscode.postMessage({ command: 'getRepoIndexCount' });
    vscode.postMessage({ command: 'getRepoVectorCount' });
    vscode.postMessage({ command: 'getVectorDbProvider' });
    vscode.postMessage({ command: 'getVectorDbCollectionInfo' });
    vscode.postMessage({ command: 'checkCompatibility' });
  }, []);

  // Fetch collection info when provider changes
  useEffect(() => {
    vscode.postMessage({ command: 'getVectorDbCollectionInfo' });
  }, [vectorDbProvider]);

  // Update labels when copyMode changes
  useEffect(() => {
    setMainCopyLabel(copyMode === 'content' ? 'Copy Text' : 'Copy File');
    setSummaryCopyLabel(copyMode === 'content' ? 'Copy Summary Text' : 'Copy Summary File');
  }, [copyMode]);

  const handleIndex = () => {
    setIsIndexing(true);
    setIndexProgress(null);
    setIndexStats(null);
    setPausedProgress(null);
    vscode.postMessage({ command: 'indexRepo' });
  };

  const handlePause = () => vscode.postMessage({ command: 'pauseRepoIndexing' });

  const handleResume = () => {
    setIsIndexing(true);
    setPausedProgress(null);
    vscode.postMessage({ command: 'resumeRepoIndexing' });
  };

  const handleStop = () => vscode.postMessage({ command: 'stopRepoIndexing' });

  const handleDestroy = () => vscode.postMessage({ command: 'deleteRepoIndex' });

  const handleSearch = () => {
    const q = query.trim();
    if (!q) return;

    console.log('[SearchTab] ===== SEARCH INITIATED =====');
    console.log('[SearchTab] Query:', q);
    console.log('[SearchTab] TopK:', topK);
    console.log('[SearchTab] Smart Filter Enabled:', smartFilterEnabled);
    console.log('[SearchTab] Confidence Threshold:', confidenceThreshold);

    setIsSearching(true);
    setSearchError(null);
    setRawResults([]);
    setSummaryPath(null);

    console.log('[SearchTab] Sending searchRepo message to extension...');
    vscode.postMessage({
      command: 'searchRepo',
      query: q,
      topK: topK,
      useSmartFilter: smartFilterEnabled,
      confidenceThreshold: confidenceThreshold,
    });
    console.log('[SearchTab] searchRepo message sent');
  };

  const handleCopySearchOutput = () => {
    if (!lastSearchOutputPath) return;
    vscode.postMessage({ command: 'copySingleFileRespectingMode', path: lastSearchOutputPath });
  };

  const handleCopySearchResultsMarkdown = () => {
    if (dedupedResults.length === 0) return;
    const filePaths = dedupedResults.map(r => r.path).filter((p): p is string => !!p);

    // If a summary exists, prepend it to the list of files to be copied?
    // Or actually, user request was "return filepath to summary so display it and allow us to copy it in 'copy as markdown'"
    // The current 'copySearchResultsMarkdown' takes a list of file paths and generates markdown.
    // If we pass the summary file path, it will be included in the generation.
    // Ideally we want the summary to be the *summary* of the markdown, not just another file.
    // But for now, adding it to the list is the simplest way to get it included.

    const filesToCopy = summaryPath ? [summaryPath, ...filePaths] : filePaths;

    vscode.postMessage({ command: 'copySearchResultsMarkdown', files: filesToCopy });
  };

  const handleCopyFilePaths = () => {
    if (dedupedResults.length === 0) return;
    const filePaths = dedupedResults.map(r => r.path).filter((p): p is string => !!p);
    vscode.postMessage({ command: 'copySearchFilePaths', files: filePaths });
  };

  const handleCopySmartDecisions = () => {
    const seen = new Set<string>();
    const output: string[] = [];

    // Use filtered results (which is 'results' state)
    for (const r of results) {
      const p = r.path?.trim();
      // We need both path and reason
      if (!p || !r.reason) continue;

      if (seen.has(p)) continue;
      seen.add(p);

      output.push(`File: ${p}\nDecision: ${r.reason}`);
    }

    if (output.length === 0) return;

    const text = output.join('\n\n');

    // Copy to clipboard
    const textarea = document.createElement('textarea');
    textarea.value = text;
    // Make it invisible
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    document.body.appendChild(textarea);

    textarea.focus();
    textarea.select();

    try {
      document.execCommand('copy');
      setCopyDecisionsLabel('Copied!');
      setTimeout(() => setCopyDecisionsLabel('Copy Smart Filter Decisions'), 2000);
    } catch (e) {
      console.error('Failed to copy decisions', e);
    } finally {
      document.body.removeChild(textarea);
    }
  };

  return (
    <div style={{ padding: '10px 0', display: 'flex', flexDirection: 'column', gap: '15px' }}>

      {/* Indexing Section Accordion */}
      <Accordion collapsible multiple openItems={openItems} onToggle={handleAccordionToggle}>
        <AccordionItem value="indexing">
          <AccordionHeader>Repository Indexing</AccordionHeader>
          <AccordionPanel>
            <div
              style={{
                padding: '15px',
                backgroundColor: 'var(--vscode-editor-background)',
                border: '1px solid var(--vscode-widget-border)',
                borderRadius: '4px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '10px',
                marginTop: '10px'
              }}
            >
              <DatabaseSearchRegular style={{ fontSize: '32px', opacity: 0.8 }} />

              <div style={{ textAlign: 'center' }}>
                {fileCount !== null ? <Text size={400} weight="semibold">{fileCount}</Text> : <Spinner size="tiny" />}
                <br />
                <Text size={200} style={{ opacity: 0.7 }}>Files Indexed (local DB)</Text>

                <div style={{ marginTop: '8px' }}>
                  {vectorCount !== null ? (
                    <Text size={200} style={{ opacity: 0.7 }}>
                      {vectorDbProvider === 'qdrant' ? 'Qdrant' : 'Pinecone'} vectors (repo): <b>{vectorCount}</b>
                    </Text>
                  ) : (
                    <Text size={200} style={{ opacity: 0.5 }}>Loading {vectorDbProvider === 'qdrant' ? 'Qdrant' : 'Pinecone'} count…</Text>
                  )}
                </div>

                {collectionInfo && (
                  <div style={{ marginTop: '6px' }}>
                    <Text size={200} style={{ opacity: 0.6 }}>
                      {collectionInfo.provider === 'qdrant' ? 'Collection' : 'Index'}: <b>{collectionInfo.name}</b>
                    </Text>
                  </div>
                )}

                {isIndexing && indexProgress && (
                  <div style={{ marginTop: '10px', width: '100%', textAlign: 'center' }}>
                    <Text size={200} style={{ opacity: 0.7 }}>
                      Indexing progress: <b>{indexProgress.current}</b> / {indexProgress.total}
                    </Text>
                    <br />
                    <Text size={200} style={{ opacity: 0.6, whiteSpace: 'pre-wrap' }}>{indexProgress.filePath}</Text>
                  </div>
                )}

                {indexStats && !isIndexing && (
                  <div style={{ marginTop: '10px', width: '100%', textAlign: 'center' }}>
                    <Text size={200} style={{ opacity: 0.7 }}>
                      Embedded files: <b>{indexStats.filesEmbedded}</b> (failed: <b>{indexStats.failedFiles}</b>)
                    </Text>
                    <br />
                    <Text size={200} style={{ opacity: 0.7 }}>
                      Chunks/vectors added: <b>{indexStats.vectorsUpserted}</b>
                    </Text>
                    <br />
                    <Text size={200} style={{ opacity: 0.6 }}>
                      Time: {(indexStats.durationMs / 1000).toFixed(1)}s
                    </Text>
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
              {/* Warning banner when indexing is blocked */}
              {indexingBlocked && indexingState === 'idle' && (
                <div style={{
                  padding: '8px 12px',
                  backgroundColor: 'var(--vscode-inputValidation-warningBackground)',
                  border: '1px solid var(--vscode-inputValidation-warningBorder)',
                  borderRadius: '4px',
                  marginBottom: '4px',
                }}>
                  <Text size={200}>
                    Indexing disabled due to embedding dimension mismatch.
                    Go to Settings to reset your vector index.
                  </Text>
                </div>
              )}

              {indexingState === 'idle' && (
                <Tooltip
                  content={indexingBlocked ? 'Indexing disabled: Dimension mismatch. Visit Settings to reset.' : ''}
                  relationship="label"
                >
                  <Button
                    appearance="primary"
                    onClick={handleIndex}
                    disabled={isIndexing || indexingBlocked}
                    icon={isIndexing ? <Spinner size="tiny" /> : undefined}
                  >
                    {isIndexing ? 'Indexing…' : 'Index Repository'}
                  </Button>
                </Tooltip>
              )}

              {indexingState === 'running' && (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <Button appearance="secondary" onClick={handlePause}>Pause</Button>
                  <Button appearance="secondary" onClick={handleStop}>Stop</Button>
                </div>
              )}

              {indexingState === 'paused' && (
                <div style={{ display: 'flex', gap: '8px', flexDirection: 'column', alignItems: 'flex-start' }}>
                  {pausedProgress && (
                    <Text size={200} style={{ opacity: 0.7 }}>
                      Paused at {pausedProgress.completed} of {pausedProgress.total} files
                    </Text>
                  )}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <Button appearance="primary" onClick={handleResume}>Resume</Button>
                    <Button appearance="secondary" onClick={handleStop}>Stop</Button>
                  </div>
                </div>
              )}

              {indexingState === 'stopping' && (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <Spinner size="tiny" />
                  <Text size={200} style={{ opacity: 0.7 }}>Stopping...</Text>
                </div>
              )}

              <Button
                appearance="secondary"
                icon={<DeleteRegular />}
                onClick={handleDestroy}
                disabled={isIndexing || indexingState === 'stopping' || (fileCount ?? 0) === 0}
              >
                Destroy Index
              </Button>
            </div>
          </AccordionPanel>
        </AccordionItem>
      </Accordion>

      <Label weight="semibold" style={{ marginTop: '5px' }}>Vector Search</Label>

      {/* File Filters Accordion */}
      <Accordion collapsible multiple openItems={openItems} onToggle={handleAccordionToggle}>
        <AccordionItem value="filters">
          <AccordionHeader>
            File Filters{' '}
            {JSON.stringify(fileTypeFilter) !== JSON.stringify(DEFAULT_FILTERS) && (
              <span style={{ color: 'var(--vscode-textLink-foreground)', fontSize: '12px', marginLeft: '8px' }}>
                (Modified)
              </span>
            )}
          </AccordionHeader>
          <AccordionPanel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  gap: '6px',
                }}
              >
                {[
                  { key: 'typescript', label: 'TypeScript (.ts/.tsx)' },
                  { key: 'javascript', label: 'JavaScript (.js/.jsx)' },
                  { key: 'python', label: 'Python (.py)' },
                  { key: 'rust', label: 'Rust (.rs)' },
                  { key: 'csharp', label: 'C# (.cs)' },
                  { key: 'java', label: 'Java (.java)' },
                  { key: 'dart', label: 'Dart (.dart)' },
                  { key: 'yaml', label: 'YAML (.yaml/.yml)' },
                  { key: 'json', label: 'JSON (.json/.jsonc)' },
                  { key: 'xml', label: 'XML (.xml)' },
                  { key: 'markdown', label: 'Markdown (.md/.mdx)' },
                  { key: 'config', label: 'Config files (.env/.toml/.ini/...)' },
                  { key: 'mobile', label: 'Android/iOS (.kt/.gradle/.swift/...)' },
                  { key: 'includeNoExtKnown', label: 'Known extensionless (Dockerfile, .gitignore, ...)' },
                  { key: 'includeAllExtensions', label: 'Catch-all: include all extensions' },
                ].map(({ key, label }) => (
                  <label
                    key={key}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '11px',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={fileTypeFilter[key as keyof FileTypeFilterState] as boolean}
                      onChange={(e) =>
                        setFileTypeFilter((prev) => ({
                          ...prev,
                          [key]: e.target.checked,
                        }))
                      }
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Label size="small">Custom extensions (comma-separated)</Label>
                <Input
                  value={fileTypeFilter.custom}
                  onChange={(e, data) => setFileTypeFilter((prev) => ({ ...prev, custom: data.value }))}
                  placeholder="e.g. .txt, !.md (use ! to exclude)"
                />
                <Text size={200} style={{ opacity: 0.7 }}>
                  Tip: turn on <b>Catch-all</b> if you want to avoid missing anything; otherwise use Config/Mobile for most projects. Use <b>!</b> to exclude specific types.
                </Text>
              </div>

              {/* Reset Filters Button */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                <Button
                  appearance="secondary"
                  size="small"
                  onClick={() => setFileTypeFilter(DEFAULT_FILTERS)}
                >
                  Reset Filters
                </Button>
              </div>
            </div>
          </AccordionPanel>
        </AccordionItem>
      </Accordion>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
        <Textarea
          value={query}
          onChange={(e, data) => setQuery(data.value)}
          placeholder="Enter search query..."
          style={{ width: '100%', minHeight: '80px' }}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              e.preventDefault();
              if (canSearch) {
                handleSearch();
              }
            }
          }}
        />

        {/* Smart Filter checkbox */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 10px',
            border: '1px solid var(--vscode-widget-border)',
            borderRadius: 4,
          }}
        >
          <input
            id="repomix-smart-filter"
            type="checkbox"
            checked={smartFilterEnabled}
            onChange={(e) => setSmartFilterEnabled(e.target.checked)}
          />
          <Label htmlFor="repomix-smart-filter" style={{ margin: 0 }}>
            Smart Filter
          </Label>
        </div>

        {/* Smart Filter Controls */}
        {smartFilterEnabled && (
          <>
            <Label size="small">
              Confidence Threshold: {confidenceThreshold.toFixed(1)}
            </Label>
            <Slider
              min={0}
              max={1}
              step={0.1}
              value={confidenceThreshold}
              onChange={(e, data) => setConfidenceThreshold(data.value ?? 0.5)}
              style={{ width: '100%' }}
            />
          </>
        )}

        {/* VectorDB Results Limit */}
        <Label size="small">Max VectorDB Results (topK): {topK}</Label>
        <Slider
          min={10}
          max={1000}
          step={10}
          value={topK}
          onChange={(e, data) => setTopK(data.value ?? 200)}
          style={{ width: '100%' }}
        />



        <Button
          appearance="primary"
          icon={isSearching ? <Spinner size="tiny" /> : <SearchRegular />}
          style={{ width: '100%' }}
          disabled={!canSearch}
          onClick={handleSearch}
        >
          {isSearching ? 'Searching…' : 'Search'}
        </Button>

        {smartFilterEnabled && results.some(r => r.reason) && (
          <Accordion collapsible multiple openItems={openItems} onToggle={handleAccordionToggle}>
            <AccordionItem value="smart-filter-insights">
              <AccordionHeader>Smart Filter Insights</AccordionHeader>
              <AccordionPanel>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '10px 0' }}>
                  {results.some(r => r.reason) && (
                    <Button
                      appearance="secondary"
                      icon={<CopyRegular />}
                      style={{ width: '100%' }}
                      onClick={handleCopySmartDecisions}
                    >
                      {copyDecisionsLabel}
                    </Button>
                  )}
                </div>
              </AccordionPanel>
            </AccordionItem>
          </Accordion>
        )}

        {summaryPath && (
          <div style={{
            marginTop: '10px',
            padding: '10px',
            backgroundColor: 'var(--vscode-editor-background)',
            border: '1px solid var(--vscode-widget-border)',
            borderRadius: '4px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            <Label weight="semibold">AI Summary Generated</Label>
            <Text size={200} style={{ opacity: 0.8 }}>A markdown summary of the search results has been created.</Text>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button size="small" appearance="secondary" onClick={() => vscode.postMessage({ command: 'openFile', path: summaryPath })}>
                Open Summary
              </Button>
              <Button size="small" appearance="secondary" onClick={() => vscode.postMessage({ command: 'copySingleFileRespectingMode', path: summaryPath })}>
                {summaryCopyLabel}
              </Button>
            </div>
          </div>
        )}

        <Button appearance="secondary" icon={<DatabaseSearchRegular />} style={{ width: '100%' }} disabled={!canGenerate} onClick={handleGenerate}>
          Generate
        </Button>

        <Button appearance="secondary" icon={<CopyRegular />} style={{ width: '100%' }} disabled={!lastSearchOutputPath} onClick={handleCopySearchOutput}>
          {mainCopyLabel}
        </Button>

        <Button appearance="secondary" icon={<CopyRegular />} style={{ width: '100%' }} disabled={dedupedResults.length === 0} onClick={handleCopySearchResultsMarkdown}>
          {copyMarkdownLabel}
        </Button>

        {dedupedResults.length > 0 && (
          <Text size={200} style={{ opacity: 0.8 }}>Unique files found: {dedupedResults.length}</Text>
        )}

        {dedupedResults.length > 0 && (
          <Button appearance="secondary" icon={<CopyRegular />} style={{ width: '100%' }} disabled={dedupedResults.length === 0} onClick={handleCopyFilePaths}>
            Copy File Paths
          </Button>
        )}

        {dedupedResults.length > 0 && (
          <div style={{ marginTop: '15px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <Label weight="semibold">Files Found</Label>
            <div
              style={{
                maxHeight: '300px',
                overflowY: 'auto',
                border: '1px solid var(--vscode-widget-border)',
                borderRadius: '4px',
                backgroundColor: 'var(--vscode-editor-background)',
                padding: '8px',
              }}
            >
              {dedupedResults.map((r, index) => (
                <div
                  key={index}
                  style={{
                    padding: '6px 8px',
                    borderBottom: index < dedupedResults.length - 1
                      ? '1px solid var(--vscode-widget-border)'
                      : 'none',
                    fontSize: '13px',
                    fontFamily: 'var(--vscode-editor-font-family)',
                    color: 'var(--vscode-foreground)',
                    wordBreak: 'break-all',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span>{r.path}</span>
                  {smartFilterEnabled && r.reason && (
                    <Tooltip
                      content={`${r.reason} (Score: ${r.score.toFixed(3)})`}
                      relationship="description"
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          cursor: 'help',
                          marginLeft: '8px',
                          flexShrink: 0,
                        }}
                      >
                        <span
                          style={{
                            width: '10px',
                            height: '10px',
                            borderRadius: '50%',
                            backgroundColor: r.score > 0.7
                              ? 'var(--vscode-terminal-ansiGreen)'
                              : 'var(--vscode-terminal-ansiYellow)',
                            border: '1px solid var(--vscode-widget-border)',
                            display: 'inline-block'
                          }}
                        />
                        <Text size={100} style={{ opacity: 0.7 }}>
                          {r.score > 0.7 ? 'High' : 'Medium'}
                        </Text>
                      </div>
                    </Tooltip>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {searchError && (
          <Text size={200} style={{ color: 'var(--vscode-errorForeground)' }}>{searchError}</Text>
        )}
      </div>

      <Text size={200} style={{ opacity: 0.7, marginTop: '10px' }}>
        Indexing scans files to enable fast semantic search.
      </Text>
    </div>
  );
};