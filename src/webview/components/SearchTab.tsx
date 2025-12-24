import React, { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Label,
  Spinner,
  Text,
  Input,
  Accordion,
  AccordionItem,
  AccordionHeader,
  AccordionPanel,
  AccordionToggleEventHandler,
} from '@fluentui/react-components';
import {
  DeleteRegular,
  DatabaseSearchRegular,
  SearchRegular,
  CopyRegular,
} from '@fluentui/react-icons';
import { vscode } from '../vscode-api.js';

type RepoSearchResult = {
  id: string;
  score: number;
  path?: string;
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

  const [isIndexing, setIsIndexing] = useState(false);
  const [indexingState, setIndexingState] = useState<'idle' | 'running' | 'paused' | 'stopping'>('idle');
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
  const [expandedQueries, setExpandedQueries] = useState<string[]>([]);
  const [openItems, setOpenItems] = useState<string[]>(loadedState?.openAccordionItems || ['indexing', 'filters']);

  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<RepoSearchResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [lastSearchOutputPath, setLastSearchOutputPath] = useState<string | null>(null);

  const [fileTypeFilter, setFileTypeFilter] = useState<FileTypeFilterState>(
    loadedState?.fileTypeFilter || DEFAULT_FILTERS
  );

  // Persist state changes
  useEffect(() => {
    vscode.setState({
      fileTypeFilter,
      query,
      smartFilterEnabled,
      openAccordionItems: openItems,
    });
  }, [fileTypeFilter, query, smartFilterEnabled, openItems]);

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

  const dedupedResultPaths = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];

    for (const r of results) {
      const p = r.path?.trim();
      if (!p) continue;
      if (seen.has(p)) continue;
      seen.add(p);
      out.push(p);
    }

    return out;
  }, [results]);

  const canGenerate = useMemo(() => dedupedResultPaths.length > 0 && !isSearching, [dedupedResultPaths, isSearching]);

  const handleGenerate = () => {
    if (dedupedResultPaths.length === 0) return;
    vscode.postMessage({ command: 'generateRepomixFromSearch', files: dedupedResultPaths });
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

      switch (message.command) {
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
          setResults([]);
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

        case 'repoVectorCount':
          setVectorCount(message.count);
          break;

        case 'searchQueryExpanded':
          setExpandedQueries(Array.isArray(message.queries) ? message.queries : []);
          break;

        case 'repoSearchResults': {
          setIsSearching(false);
          setSearchError(null);
          const rawResults: RepoSearchResult[] = Array.isArray(message.results) ? message.results : [];
          const filteredResults = filterByFileType(rawResults);
          setResults(filteredResults);
          break;
        }

        case 'repoSearchError':
          setIsSearching(false);
          setSearchError(message.error ?? 'Search failed');
          break;

        case 'searchOutputReady':
          setLastSearchOutputPath(message.outputPath ?? null);
          break;
      }
    };

    window.addEventListener('message', handleMessage);

    vscode.postMessage({ command: 'getRepoIndexCount' });
    vscode.postMessage({ command: 'getRepoVectorCount' });

    return () => window.removeEventListener('message', handleMessage);
  }, [fileTypeFilter]);

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

    setIsSearching(true);
    setSearchError(null);
    setResults([]);
    setExpandedQueries([]);

    vscode.postMessage({
      command: 'searchRepo',
      query: q,
      topK: 200,
      useSmartFilter: smartFilterEnabled,
    });
  };

  const handleCopySearchOutput = () => {
    if (!lastSearchOutputPath) return;
    vscode.postMessage({ command: 'copySearchOutput', outputPath: lastSearchOutputPath });
  };

  const handleCopySearchResultsMarkdown = () => {
    if (dedupedResultPaths.length === 0) return;
    vscode.postMessage({ command: 'copySearchResultsMarkdown', files: dedupedResultPaths });
  };

  const handleCopyFilePaths = () => {
    if (dedupedResultPaths.length === 0) return;
    vscode.postMessage({ command: 'copySearchFilePaths', files: dedupedResultPaths });
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
                      Pinecone vectors (repo): <b>{vectorCount}</b>
                    </Text>
                  ) : (
                    <Text size={200} style={{ opacity: 0.5 }}>Loading Pinecone count…</Text>
                  )}
                </div>

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
              {indexingState === 'idle' && (
                <Button appearance="primary" onClick={handleIndex} disabled={isIndexing} icon={isIndexing ? <Spinner size="tiny" /> : undefined}>
                  {isIndexing ? 'Indexing…' : 'Index Repository'}
                </Button>
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
          <AccordionHeader>File Filters</AccordionHeader>
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
            </div>
          </AccordionPanel>
        </AccordionItem>
      </Accordion>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
        <Input
          value={query}
          onChange={(e, data) => setQuery(data.value)}
          placeholder="Enter search query..."
          style={{ width: '100%' }}
          onKeyDown={(e) => e.key === 'Enter' && canSearch && handleSearch()}
        />

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

        {smartFilterEnabled && expandedQueries.length > 0 && (
          <Text size={200} style={{ opacity: 0.7 }}>Expanded: {expandedQueries.join(' • ')}</Text>
        )}

        <Button
          appearance="primary"
          icon={isSearching ? <Spinner size="tiny" /> : <SearchRegular />}
          style={{ width: '100%' }}
          disabled={!canSearch}
          onClick={handleSearch}
        >
          {isSearching ? 'Searching…' : 'Search'}
        </Button>

        <Button appearance="secondary" icon={<DatabaseSearchRegular />} style={{ width: '100%' }} disabled={!canGenerate} onClick={handleGenerate}>
          Generate
        </Button>

        <Button appearance="secondary" icon={<CopyRegular />} style={{ width: '100%' }} disabled={!lastSearchOutputPath} onClick={handleCopySearchOutput}>
          Copy
        </Button>

        <Button appearance="secondary" icon={<CopyRegular />} style={{ width: '100%' }} disabled={dedupedResultPaths.length === 0} onClick={handleCopySearchResultsMarkdown}>
          Copy as Markdown
        </Button>

        {dedupedResultPaths.length > 0 && (
          <Text size={200} style={{ opacity: 0.8 }}>Unique files found: {dedupedResultPaths.length}</Text>
        )}

        {dedupedResultPaths.length > 0 && (
          <Button appearance="secondary" icon={<CopyRegular />} style={{ width: '100%' }} disabled={dedupedResultPaths.length === 0} onClick={handleCopyFilePaths}>
            Copy File Paths
          </Button>
        )}

        {dedupedResultPaths.length > 0 && (
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
              {dedupedResultPaths.map((path, index) => (
                <div
                  key={index}
                  style={{
                    padding: '6px 8px',
                    borderBottom: index < dedupedResultPaths.length - 1
                      ? '1px solid var(--vscode-widget-border)'
                      : 'none',
                    fontSize: '13px',
                    fontFamily: 'var(--vscode-editor-font-family)',
                    color: 'var(--vscode-foreground)',
                    wordBreak: 'break-all',
                  }}
                >
                  {path}
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