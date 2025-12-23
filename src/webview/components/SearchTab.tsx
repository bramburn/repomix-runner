import React, { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Label,
  Spinner,
  Text,
  Input,
  Card,
  CardHeader,
  CardPreview,
  CardFooter,
} from '@fluentui/react-components';
import { DeleteRegular, DatabaseSearchRegular, SearchRegular, OpenRegular, CopyRegular } from '@fluentui/react-icons';
import { vscode } from '../vscode-api.js';

type RepoSearchResult = {
  id: string;
  score: number;
  path?: string;
  // snippet?: string;
  // you can extend metadata as needed
};
type FileTypeFilterState = {
  typescript: boolean;
  javascript: boolean;
  python: boolean;
  rust: boolean;
  csharp: boolean;
  java: boolean;
  custom: string; // comma-separated extensions, e.g. ".md,.json"
};

export const SearchTab = () => {
  const [fileCount, setFileCount] = useState<number | null>(null);
  const [vectorCount, setVectorCount] = useState<number | null>(null);

  const [isIndexing, setIsIndexing] = useState(false);

  // New state for pause/resume/stop functionality
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

  const [query, setQuery] = useState('');
  const [smartFilterEnabled, setSmartFilterEnabled] = useState(false);
  const [expandedQueries, setExpandedQueries] = useState<string[]>([]);

  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<RepoSearchResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [lastSearchOutputPath, setLastSearchOutputPath] = useState<string | null>(null);
  const [fileTypeFilter, setFileTypeFilter] = useState<FileTypeFilterState>({
    typescript: true,
    javascript: true,
    python: true,
    rust: false,
    csharp: false,
    java: false,
    custom: '',
  });

  const getActiveExtensions = (): string[] => {
    const exts: string[] = [];

    if (fileTypeFilter.typescript) exts.push('.ts', '.tsx');
    if (fileTypeFilter.javascript) exts.push('.js', '.jsx');
    if (fileTypeFilter.python) exts.push('.py');
    if (fileTypeFilter.rust) exts.push('.rs');
    if (fileTypeFilter.csharp) exts.push('.cs');
    if (fileTypeFilter.java) exts.push('.java');

    if (fileTypeFilter.custom) {
      const customExts = fileTypeFilter.custom
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .map((s) => (s.startsWith('.') ? s : `.${s}`));
      exts.push(...customExts);
    }

    return exts;
  };

  const hasAnyFileTypeSelected = useMemo(() => {
    const active = getActiveExtensions();
    return active.length > 0;
  }, [fileTypeFilter]);

  const canSearch = useMemo(
    () => query.trim().length > 0 && !isSearching && hasAnyFileTypeSelected,
    [query, isSearching, hasAnyFileTypeSelected]
  );

  // De-dupe file paths from search results (stable order)
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

  const canGenerate = useMemo(
    () => dedupedResultPaths.length > 0 && !isSearching,
    [dedupedResultPaths, isSearching]
  );

  const handleGenerate = () => {
    if (dedupedResultPaths.length === 0) return;

    vscode.postMessage({
      command: 'generateRepomixFromSearch',
      files: dedupedResultPaths,
    });
  };



  const filterByFileType = (incoming: RepoSearchResult[]): RepoSearchResult[] => {
    const activeExts = getActiveExtensions();
    if (activeExts.length === 0) {
      // If nothing selected, do not filter at all
      return incoming;
    }

    const extSet = new Set(activeExts.map((e) => e.toLowerCase()));

    return incoming.filter((r) => {
      if (!r.path) return false;
      const lastDot = r.path.lastIndexOf('.');
      if (lastDot === -1) return false;
      const ext = r.path.slice(lastDot).toLowerCase();
      return extSet.has(ext);
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
          setIndexProgress({
            current: message.current,
            total: message.total,
            filePath: message.filePath,
          });
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

          // reflect local DB count immediately
          setFileCount(message.filesIndexed);

          // refresh Pinecone vector count after indexing:
          vscode.postMessage({ command: 'getRepoVectorCount' });
          break;

        case 'repoIndexComplete':
          // Backward compatible path (older controller behavior)
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
          if (message.progress) {
            setIndexProgress(message.progress);
          }
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
          const rawResults: RepoSearchResult[] = Array.isArray(message.results)
            ? message.results
            : [];
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

    // Existing count:
    vscode.postMessage({ command: 'getRepoIndexCount' });
    // Optional pinecone count:
    vscode.postMessage({ command: 'getRepoVectorCount' });

    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleIndex = () => {
    setIsIndexing(true);
    setIndexProgress(null);
    setIndexStats(null);
    setPausedProgress(null);
    vscode.postMessage({ command: 'indexRepo' });
  };

  const handlePause = () => {
    vscode.postMessage({ command: 'pauseRepoIndexing' });
  };

  const handleResume = () => {
    setIsIndexing(true);
    setPausedProgress(null);
    vscode.postMessage({ command: 'resumeRepoIndexing' });
  };

  const handleStop = () => {
    vscode.postMessage({ command: 'stopRepoIndexing' });
  };

  const handleDestroy = () => {
    vscode.postMessage({ command: 'deleteRepoIndex' });
  };

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
      topK: 50,
      useSmartFilter: smartFilterEnabled,
    });
  };


  const openFile = (path?: string) => {
    if (!path) return;
    vscode.postMessage({ command: 'openFile', path });
  };

  const handleCopySearchOutput = () => {
    if (!lastSearchOutputPath) return;
    vscode.postMessage({
      command: 'copySearchOutput',
      outputPath: lastSearchOutputPath,
    });
  };

  const handleCopySearchResultsMarkdown = () => {
    if (dedupedResultPaths.length === 0) return;

    vscode.postMessage({
      command: 'copySearchResultsMarkdown',
      files: dedupedResultPaths,
    });
  };

  return (
    <div style={{ padding: '10px 0', display: 'flex', flexDirection: 'column', gap: '15px' }}>
      <Label weight="semibold">Repository Indexing</Label>


      {/* Indexing card (existing) */}
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
              <Text size={200} style={{ opacity: 0.6, whiteSpace: 'pre-wrap' }}>
                {indexProgress.filePath}
              </Text>
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {/* Show Index Repository button when idle or paused */}
        {indexingState === 'idle' && (
          <Button
            appearance="primary"
            onClick={handleIndex}
            disabled={isIndexing}
            icon={isIndexing ? <Spinner size="tiny" /> : undefined}
          >
            {isIndexing ? 'Indexing…' : 'Index Repository'}
          </Button>
        )}

        {/* Show Pause/Stop buttons when running */}
        {indexingState === 'running' && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button appearance="secondary" onClick={handlePause}>Pause</Button>
            <Button appearance="secondary" onClick={handleStop}>Stop</Button>
          </div>
        )}

        {/* Show Resume/Stop buttons when paused */}
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

        {/* Show stopping indicator */}
        {indexingState === 'stopping' && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Spinner size="tiny" />
            <Text size={200} style={{ opacity: 0.7 }}>
              Stopping...
            </Text>
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

      {/* NEW: Search */}
      <Label weight="semibold" style={{ marginTop: '10px' }}>Vector Search</Label>
      {/* File type filters */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: '6px',
          marginTop: '6px',
          marginBottom: '4px',
        }}
      >
        {[
          { key: 'typescript', label: 'TypeScript (.ts/.tsx)' },
          { key: 'javascript', label: 'JavaScript (.js/.jsx)' },
          { key: 'python', label: 'Python (.py)' },
          { key: 'rust', label: 'Rust (.rs)' },
          { key: 'csharp', label: 'C# (.cs)' },
          { key: 'java', label: 'Java (.java)' },
        ].map(({ key, label }) => (
          <label
            key={key}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
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
          <Text size={200} style={{ opacity: 0.7 }}>
            Expanded: {expandedQueries.join(' • ')}
          </Text>
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

        <Button
          appearance="secondary"
          icon={<DatabaseSearchRegular />}
          style={{ width: '100%' }}
          disabled={!canGenerate}
          onClick={handleGenerate}
        >
          Generate
        </Button>

        <Button
          appearance="secondary"
          icon={<CopyRegular />}
          style={{ width: '100%' }}
          disabled={!lastSearchOutputPath}
          onClick={handleCopySearchOutput}
        >
          Copy
        </Button>

        <Button
          appearance="secondary"
          icon={<CopyRegular />}
          style={{ width: '100%' }}
          disabled={dedupedResultPaths.length === 0}
          onClick={handleCopySearchResultsMarkdown}
        >
          Copy as Markdown
        </Button>

        {dedupedResultPaths.length > 0 && (
          <Text size={200} style={{ opacity: 0.8 }}>
            Unique files found: {dedupedResultPaths.length}
          </Text>
        )}

        {searchError && (
          <Text size={200} style={{ color: 'var(--vscode-errorForeground)' }}>
            {searchError}
          </Text>
        )}
      </div>

      <Text size={200} style={{ opacity: 0.7, marginTop: '10px' }}>
        Indexing scans files to enable fast semantic search.
      </Text>
    </div>
  );
};
